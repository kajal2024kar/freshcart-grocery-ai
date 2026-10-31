"""
train.py - Feature engineering and LightGBM model training on real Instacart data.

Builds user-product features from prior orders:
  - purchase count (up_purchase_count)
  - orders since last purchase (up_orders_since_last)
  - days since last purchase (up_days_since_last)
  - reorder rate (up_reorder_rate)
  - average position in cart (up_avg_cart_pos)
  - user average gap between orders (user_avg_gap)
  - product popularity (prod_popularity)
  - product reorder rate (prod_reorder_rate)

Label: product appears in the user's next (train) order.
Trains LightGBM, evaluates precision@10 & recall@10 on unseen users (GroupShuffleSplit),
and saves lgbm_model.txt, dataset_stats.json, sample_users.json, and sample_user_features.json.
"""

import json
import pathlib
import time
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import GroupShuffleSplit

ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "model"
MODEL_DIR.mkdir(parents=True, exist_ok=True)

# ----------------------------------------------------------------------
# 1. Verify CSV files exist
# ----------------------------------------------------------------------
required_csvs = [
    "orders.csv",
    "order_products__prior.csv",
    "order_products__train.csv",
    "products.csv",
    "aisles.csv",
    "departments.csv",
]

for fname in required_csvs:
    fpath = DATA_DIR / fname
    if not fpath.exists():
        raise FileNotFoundError(f"Missing required data file: {fpath}")

print("All required Instacart CSV files found in ./data.")

# ----------------------------------------------------------------------
# 2. Load metadata and full datasets for statistics
# ----------------------------------------------------------------------
print("\n[Step 1/6] Loading metadata and orders...")
t0 = time.time()

aisles = pd.read_csv(DATA_DIR / "aisles.csv")
departments = pd.read_csv(DATA_DIR / "departments.csv")
products = pd.read_csv(DATA_DIR / "products.csv")
products = products.merge(aisles, on="aisle_id").merge(departments, on="department_id")

orders = pd.read_csv(
    DATA_DIR / "orders.csv",
    dtype={
        "order_id": "int32",
        "user_id": "int32",
        "eval_set": "category",
        "order_number": "int16",
        "order_dow": "int8",
        "order_hour_of_day": "int8",
        "days_since_prior_order": "float32",
    },
)

total_orders = int(orders["order_id"].nunique())
total_users = int(orders["user_id"].nunique())
total_products = int(products["product_id"].nunique())

print(f"Loaded {total_orders:,} orders across {total_users:,} users and {total_products:,} products in {time.time()-t0:.2f}s")

# ----------------------------------------------------------------------
# 3. Compute global dataset statistics
# ----------------------------------------------------------------------
print("\n[Step 2/6] Computing global dataset statistics...")
t0 = time.time()

dow_names = ["Saturday", "Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]
orders_by_dow_counts = orders["order_dow"].value_counts().sort_index()
orders_by_weekday = {dow_names[int(k)]: int(v) for k, v in orders_by_dow_counts.items()}

orders_by_hour_counts = orders["order_hour_of_day"].value_counts().sort_index()
orders_by_hour = {str(int(k)): int(v) for k, v in orders_by_hour_counts.items()}

# Global product statistics from prior orders
print("Scanning order_products__prior.csv for global product stats...")
prior_chunk_stats = []
total_prior_records = 0
total_reorder_sum = 0

# Chunked read to keep memory low and speed fast
for chunk in pd.read_csv(
    DATA_DIR / "order_products__prior.csv",
    usecols=["product_id", "reordered", "add_to_cart_order"],
    dtype={"product_id": "int32", "reordered": "int8", "add_to_cart_order": "int16"},
    chunksize=5_000_000,
):
    total_prior_records += len(chunk)
    total_reorder_sum += int(chunk["reordered"].sum())
    agg = chunk.groupby("product_id").agg(
        purchases=("reordered", "count"),
        reorders=("reordered", "sum"),
        cart_pos_sum=("add_to_cart_order", "sum"),
    )
    prior_chunk_stats.append(agg)

prior_prod_all = pd.concat(prior_chunk_stats).groupby("product_id").sum().reset_index()
overall_reorder_rate = total_reorder_sum / total_prior_records

total_prior_orders = int(orders[orders.eval_set == "prior"]["order_id"].nunique())

prior_prod_all["prod_popularity"] = (prior_prod_all["purchases"] / total_prior_orders).astype("float32")
prior_prod_all["prod_reorder_rate"] = (prior_prod_all["reorders"] / prior_prod_all["purchases"]).astype("float32")
prior_prod_all["prod_avg_cart_pos"] = (prior_prod_all["cart_pos_sum"] / prior_prod_all["purchases"]).astype("float32")
prior_prod_all["prod_total_purchases"] = prior_prod_all["purchases"].astype("int32")

# Top 10 products
top10_df = (
    prior_prod_all.sort_values("purchases", ascending=False)
    .head(10)
    .merge(products[["product_id", "product_name"]], on="product_id")
)
top_10_products = [
    {"product_name": row["product_name"], "order_count": int(row["purchases"])}
    for _, row in top10_df.iterrows()
]

print(f"Global stats ready in {time.time()-t0:.2f}s. Overall prior reorder rate: {overall_reorder_rate:.4f}")

# ----------------------------------------------------------------------
# 4. User selection & User-Product feature engineering
# ----------------------------------------------------------------------
print("\n[Step 3/6] Selecting users and engineering user-product features...")
t0 = time.time()

# Users with train labels
train_users_all = orders[orders.eval_set == "train"]["user_id"].unique()

# Identify 300 demo users with active histories (>= 6 orders)
prior_order_counts = orders[orders.eval_set == "prior"].groupby("user_id")["order_number"].max()
eligible_demo_users = prior_order_counts[
    (prior_order_counts >= 6) & (prior_order_counts.index.isin(train_users_all))
].index.values

np.random.seed(42)
demo_user_sample = np.random.choice(eligible_demo_users, size=300, replace=False)
demo_user_sample.sort()

# Sample 10,000 users for training & validation (including the 300 demo users)
other_train_users = np.setdiff1d(train_users_all, demo_user_sample)
additional_users = np.random.choice(other_train_users, size=9700, replace=False)
selected_users = np.concatenate([demo_user_sample, additional_users])
selected_users_set = set(selected_users)

print(f"Selected {len(selected_users):,} users for model training & evaluation (including 300 demo users).")

# Filter orders for selected users
user_orders = orders[orders.user_id.isin(selected_users_set)].copy()
user_prior_orders = user_orders[user_orders.eval_set == "prior"].copy()

# Compute user-level stats
user_stats = (
    user_prior_orders.groupby("user_id")
    .agg(
        user_total_orders=("order_number", "max"),
        user_avg_gap=("days_since_prior_order", "mean"),
    )
    .reset_index()
)
user_stats["user_total_orders"] = user_stats["user_total_orders"].astype("int16")
user_stats["user_avg_gap"] = user_stats["user_avg_gap"].fillna(0.0).astype("float32")

# Prior orders lookup
selected_order_meta = user_prior_orders[
    ["order_id", "user_id", "order_number", "days_since_prior_order"]
].set_index("order_id")
selected_order_ids = set(selected_order_meta.index)

# Read prior order products for selected users
print("Extracting prior order products for selected users...")
filtered_prior_chunks = []
for chunk in pd.read_csv(
    DATA_DIR / "order_products__prior.csv",
    dtype={"order_id": "int32", "product_id": "int32", "add_to_cart_order": "int16", "reordered": "int8"},
    chunksize=3_000_000,
):
    subset = chunk[chunk["order_id"].isin(selected_order_ids)]
    if not subset.empty:
        filtered_prior_chunks.append(subset)

user_prior_op = pd.concat(filtered_prior_chunks, ignore_index=True)

# Merge order metadata
user_prior_op = user_prior_op.merge(
    user_prior_orders[["order_id", "user_id", "order_number"]],
    on="order_id",
)

# Aggregate user-product stats
print("Aggregating user-product features...")
up = (
    user_prior_op.groupby(["user_id", "product_id"])
    .agg(
        up_purchase_count=("order_id", "count"),
        up_last_order_number=("order_number", "max"),
        up_reorder_sum=("reordered", "sum"),
        up_avg_cart_pos=("add_to_cart_order", "mean"),
    )
    .reset_index()
)

# Merge user stats
up = up.merge(user_stats, on="user_id", how="left")

# Derive features
up["up_orders_since_last"] = (up["user_total_orders"] - up["up_last_order_number"]).astype("int16")
up["up_days_since_last"] = (up["up_orders_since_last"] * up["user_avg_gap"]).astype("float32")
up["up_reorder_rate"] = (up["up_reorder_sum"] / up["up_purchase_count"]).astype("float32")
up["up_purchase_ratio"] = (up["up_purchase_count"] / up["user_total_orders"]).astype("float32")

# Merge product global stats
up = up.merge(
    prior_prod_all[["product_id", "prod_popularity", "prod_reorder_rate", "prod_total_purchases", "prod_avg_cart_pos"]],
    on="product_id",
    how="left",
)

# ----------------------------------------------------------------------
# 5. Build train labels from order_products__train.csv
# ----------------------------------------------------------------------
print("\n[Step 4/6] Loading train order products and creating labels...")
train_op = pd.read_csv(
    DATA_DIR / "order_products__train.csv",
    dtype={"order_id": "int32", "product_id": "int32", "add_to_cart_order": "int16", "reordered": "int8"},
)
train_orders = user_orders[user_orders.eval_set == "train"][["order_id", "user_id"]]
train_op = train_op.merge(train_orders, on="order_id")
train_op["label"] = 1

# Merge label into user-product pairs
up = up.merge(
    train_op[["user_id", "product_id", "label"]],
    on=["user_id", "product_id"],
    how="left",
)
up["label"] = up["label"].fillna(0).astype("int8")

pos_count = int(up["label"].sum())
total_pairs = len(up)
print(f"Engineered {total_pairs:,} user-product candidate pairs: {pos_count:,} positive ({pos_count/total_pairs*100:.2f}%).")

# ----------------------------------------------------------------------
# 6. Train/Val Split BY USER (GroupShuffleSplit)
# ----------------------------------------------------------------------
FEATURES = [
    "up_purchase_count",
    "up_orders_since_last",
    "up_days_since_last",
    "up_reorder_rate",
    "up_avg_cart_pos",
    "up_purchase_ratio",
    "user_total_orders",
    "user_avg_gap",
    "prod_popularity",
    "prod_reorder_rate",
    "prod_total_purchases",
    "prod_avg_cart_pos",
]

gss = GroupShuffleSplit(n_splits=1, test_size=0.20, random_state=42)
train_idx, val_idx = next(gss.split(up, groups=up["user_id"]))

train_data = up.iloc[train_idx]
val_data = up.iloc[val_idx]

X_train, y_train = train_data[FEATURES], train_data["label"]
X_val, y_val = val_data[FEATURES], val_data["label"]

n_train_users = train_data["user_id"].nunique()
n_val_users = val_data["user_id"].nunique()
print(f"Split BY USER: {n_train_users:,} train users ({len(X_train):,} pairs), {n_val_users:,} unseen validation users ({len(X_val):,} pairs).")

# ----------------------------------------------------------------------
# 7. Train LightGBM Classifier
# ----------------------------------------------------------------------
print("\n[Step 5/6] Training LightGBM Classifier...")
t_train = time.time()

lgb_train = lgb.Dataset(X_train, label=y_train)
lgb_val = lgb.Dataset(X_val, label=y_val, reference=lgb_train)

params = {
    "objective": "binary",
    "metric": "binary_logloss",
    "boosting_type": "gbdt",
    "learning_rate": 0.08,
    "num_leaves": 45,
    "max_depth": 6,
    "min_child_samples": 50,
    "subsample": 0.85,
    "colsample_bytree": 0.85,
    "random_state": 42,
    "verbose": -1,
    "n_jobs": -1,
}

model = lgb.train(
    params,
    lgb_train,
    num_boost_round=180,
    valid_sets=[lgb_val],
    callbacks=[lgb.log_evaluation(30)],
)

print(f"LightGBM trained in {time.time()-t_train:.2f}s.")

# ----------------------------------------------------------------------
# 8. Evaluate Precision@10 & Recall@10 on unseen validation users
# ----------------------------------------------------------------------
print("\n[Step 6/6] Evaluating Precision@10 & Recall@10 on unseen users...")
val_eval = val_data[["user_id", "product_id", "label"]].copy()
val_eval["pred_score"] = model.predict(X_val)

def calc_user_metrics(group, k=10):
    top_k = group.nlargest(k, "pred_score")
    hits = top_k["label"].sum()
    total_pos = group["label"].sum()
    precision = hits / k
    recall = (hits / total_pos) if total_pos > 0 else 0.0
    return pd.Series({"precision_at_10": precision, "recall_at_10": recall, "has_positive": total_pos > 0})

user_eval_res = val_eval.groupby("user_id").apply(calc_user_metrics, include_groups=False)
mean_prec = float(user_eval_res["precision_at_10"].mean())
# Recall on users who had at least 1 reordered item in their next basket
users_with_pos = user_eval_res[user_eval_res["has_positive"] == True]
mean_rec = float(users_with_pos["recall_at_10"].mean())

print("\n" + "=" * 55)
print("             LIGHTGBM EVALUATION METRICS             ")
print("=" * 55)
print(f"  Unseen Validation Users : {n_val_users:,}")
print(f"  Mean Precision@10       : {mean_prec:.4f} ({mean_prec*100:.2f}%)")
print(f"  Mean Recall@10          : {mean_rec:.4f} ({mean_rec*100:.2f}%)")
print("=" * 55)

# ----------------------------------------------------------------------
# 9. Save model, dataset_stats.json, sample_users.json, and features
# ----------------------------------------------------------------------
model_path = MODEL_DIR / "lgbm_model.txt"
model.save_model(str(model_path))
print(f"\nSaved model to {model_path}")

feature_importances = {
    feat: round(float(imp), 2)
    for feat, imp in zip(FEATURES, model.feature_importance(importance_type="gain"))
}

dataset_stats = {
    "total_orders": total_orders,
    "total_users": total_users,
    "total_products": total_products,
    "overall_reorder_rate": round(overall_reorder_rate, 4),
    "orders_by_weekday": orders_by_weekday,
    "orders_by_hour": orders_by_hour,
    "top_10_products": top_10_products,
    "feature_importance": feature_importances,
    "metrics": {
        "precision_at_10": round(mean_prec, 4),
        "recall_at_10": round(mean_rec, 4),
        "num_val_users": n_val_users,
        "num_features": len(FEATURES),
        "num_boost_rounds": 180,
    },
}

stats_path = MODEL_DIR / "dataset_stats.json"
with open(stats_path, "w", encoding="utf-8") as f:
    json.dump(dataset_stats, f, indent=2)
print(f"Saved dataset stats to {stats_path}")

# Save 300 demo users with order counts
demo_user_order_counts = (
    user_prior_orders[user_prior_orders.user_id.isin(demo_user_sample)]
    .groupby("user_id")["order_number"]
    .max()
    .reset_index()
)
demo_user_order_counts.columns = ["user_id", "order_count"]
demo_user_order_counts = demo_user_order_counts.sort_values("order_count", ascending=False)
sample_users_list = [
    {"user_id": int(r["user_id"]), "order_count": int(r["order_count"])}
    for _, r in demo_user_order_counts.iterrows()
]

sample_users_path = MODEL_DIR / "sample_users.json"
with open(sample_users_path, "w", encoding="utf-8") as f:
    json.dump(sample_users_list, f, indent=2)
print(f"Saved {len(sample_users_list)} sample users to {sample_users_path}")

# Precompute and save candidate features for the 300 demo users for sub-millisecond API response
demo_features_df = up[up.user_id.isin(demo_user_sample)].copy()
demo_features_df["prob"] = model.predict(demo_features_df[FEATURES])

demo_features_dict = {}
for uid, grp in demo_features_df.groupby("user_id"):
    top10_recs = grp.nlargest(10, "prob")
    demo_features_dict[int(uid)] = [
        {
            "product_id": int(r["product_id"]),
            "probability": round(float(r["prob"]), 4),
            "up_purchase_count": int(r["up_purchase_count"]),
            "user_total_orders": int(r["user_total_orders"]),
        }
        for _, r in top10_recs.iterrows()
    ]

demo_features_path = MODEL_DIR / "sample_user_features.json"
with open(demo_features_path, "w", encoding="utf-8") as f:
    json.dump(demo_features_dict, f)
print(f"Saved pre-ranked predictions for demo users to {demo_features_path}")

print("\nModel training and artifact generation completed successfully!")
