"""
train.py
Instacart Market Basket Analysis - Next Purchase Prediction
Trained on real Instacart dataset with LightGBM classifier.
"""

import os
import json
import time
import numpy as np
import pandas as pd
import lightgbm as lgb
from sklearn.model_selection import train_test_split

DATA_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "data"))
MODEL_DIR = os.path.dirname(os.path.abspath(__file__))

def check_files():
    required_files = [
        "orders.csv",
        "order_products__prior.csv",
        "order_products__train.csv",
        "products.csv",
        "aisles.csv",
        "departments.csv"
    ]
    missing = [f for f in required_files if not os.path.exists(os.path.join(DATA_DIR, f))]
    if missing:
        raise FileNotFoundError(f"Missing required data file(s) in {DATA_DIR}: {', '.join(missing)}")
    print(f"All {len(required_files)} dataset files confirmed in {DATA_DIR}.")

def load_data():
    t0 = time.time()
    print("1. Loading raw dataset files...")
    
    # Orders
    orders_dtypes = {
        'order_id': 'int32',
        'user_id': 'int32',
        'eval_set': 'category',
        'order_number': 'int16',
        'order_dow': 'int8',
        'order_hour_of_day': 'int8',
        'days_since_prior_order': 'float32'
    }
    df_orders = pd.read_csv(os.path.join(DATA_DIR, "orders.csv"), dtype=orders_dtypes)
    
    # Products metadata
    df_products = pd.read_csv(os.path.join(DATA_DIR, "products.csv"))
    df_aisles = pd.read_csv(os.path.join(DATA_DIR, "aisles.csv"))
    df_departments = pd.read_csv(os.path.join(DATA_DIR, "departments.csv"))
    df_products = df_products.merge(df_aisles, on="aisle_id", how="left").merge(df_departments, on="department_id", how="left")
    
    # Prior order products
    prior_dtypes = {
        'order_id': 'int32',
        'product_id': 'int32',
        'add_to_cart_order': 'int16',
        'reordered': 'int8'
    }
    df_prior = pd.read_csv(os.path.join(DATA_DIR, "order_products__prior.csv"), dtype=prior_dtypes)
    
    # Train order products
    df_train = pd.read_csv(os.path.join(DATA_DIR, "order_products__train.csv"), dtype=prior_dtypes)
    
    print(f"Data loaded in {time.time()-t0:.2f}s. Orders: {len(df_orders):,}, Prior rows: {len(df_prior):,}, Train rows: {len(df_train):,}")
    return df_orders, df_products, df_prior, df_train

def compute_dataset_stats(df_orders, df_products, df_prior):
    print("2. Computing dataset statistics...")
    total_orders = int(len(df_orders))
    total_users = int(df_orders['user_id'].nunique())
    total_products = int(len(df_products))
    reorder_rate = float(df_prior['reordered'].mean())
    
    orders_by_weekday = df_orders['order_dow'].value_counts().sort_index().to_dict()
    orders_by_weekday = {int(k): int(v) for k, v in orders_by_weekday.items()}
    
    orders_by_hour = df_orders['order_hour_of_day'].value_counts().sort_index().to_dict()
    orders_by_hour = {int(k): int(v) for k, v in orders_by_hour.items()}
    
    # Top 10 products
    top_prod_counts = df_prior['product_id'].value_counts().head(10).reset_index()
    top_prod_counts.columns = ['product_id', 'count']
    top_prod_counts = top_prod_counts.merge(df_products[['product_id', 'product_name', 'department', 'aisle']], on='product_id', how='left')
    top_10_products = [
        {
            'product_id': int(row['product_id']),
            'product_name': str(row['product_name']),
            'department': str(row['department']),
            'aisle': str(row['aisle']),
            'order_count': int(row['count'])
        }
        for _, row in top_prod_counts.iterrows()
    ]
    
    stats = {
        'orders': total_orders,
        'users': total_users,
        'products': total_products,
        'reorder_rate': round(reorder_rate, 4),
        'orders_by_weekday': orders_by_weekday,
        'orders_by_hour': orders_by_hour,
        'top_10_products': top_10_products
    }
    return stats

def build_features_and_train(df_orders, df_products, df_prior, df_train, stats, num_users=15000):
    t0 = time.time()
    print(f"3. Building user-product features for {num_users} users with real train orders...")
    
    # 1. Product features across all prior orders
    print("Computing product global features...")
    prod_feats = df_prior.groupby('product_id').agg(
        product_popularity=('reordered', 'count'),
        product_reorder_rate=('reordered', 'mean')
    ).reset_index()
    prod_feats['product_popularity'] = prod_feats['product_popularity'].astype('int32')
    prod_feats['product_reorder_rate'] = prod_feats['product_reorder_rate'].astype('float32')
    
    # 2. Select users who have a train order
    train_orders_meta = df_orders[df_orders['eval_set'] == 'train'].copy()
    available_train_users = train_orders_meta['user_id'].unique()
    
    np.random.seed(42)
    selected_users = np.random.choice(available_train_users, size=min(num_users, len(available_train_users)), replace=False)
    selected_users_set = set(selected_users)
    print(f"Selected {len(selected_users):,} users for model training and unseen user validation.")
    
    # Filter orders to selected users
    user_orders = df_orders[df_orders['user_id'].isin(selected_users_set)].copy()
    user_prior_orders = user_orders[user_orders['eval_set'] == 'prior'].sort_values(['user_id', 'order_number'])
    
    # User level metrics: user average gap between orders and total orders
    print("Computing user-level metrics...")
    user_feats = user_prior_orders.groupby('user_id').agg(
        user_total_orders=('order_number', 'max'),
        user_avg_order_gap=('days_since_prior_order', 'mean')
    ).reset_index()
    user_feats['user_avg_order_gap'] = user_feats['user_avg_order_gap'].fillna(0).astype('float32')
    
    # Calculate cumulative days per order for each user to get exact days_since_last_purchase
    user_prior_orders['days_clean'] = user_prior_orders['days_since_prior_order'].fillna(0)
    user_prior_orders['cum_days'] = user_prior_orders.groupby('user_id')['days_clean'].cumsum()
    user_cum_days_max = user_prior_orders.groupby('user_id')['cum_days'].max().reset_index().rename(columns={'cum_days': 'user_max_cum_days'})
    
    # Filter prior order_products for selected users
    prior_orders_subset = user_prior_orders[['order_id', 'user_id', 'order_number', 'cum_days']]
    df_user_prior_items = df_prior.merge(prior_orders_subset, on='order_id', how='inner')
    
    # Compute user-product interaction features
    print("Computing user-product features...")
    user_prod = df_user_prior_items.groupby(['user_id', 'product_id']).agg(
        purchase_count=('order_id', 'count'),
        last_order_number=('order_number', 'max'),
        last_cum_days=('cum_days', 'max'),
        avg_position_in_cart=('add_to_cart_order', 'mean')
    ).reset_index()
    
    # Merge user total orders and cumulative days
    user_prod = user_prod.merge(user_feats[['user_id', 'user_total_orders', 'user_avg_order_gap']], on='user_id', how='left')
    user_prod = user_prod.merge(user_cum_days_max, on='user_id', how='left')
    
    # Compute requested features:
    # 1. orders_since_last_purchase
    user_prod['orders_since_last_purchase'] = (user_prod['user_total_orders'] - user_prod['last_order_number']).astype('int16')
    
    # 2. days_since_last_purchase
    # Difference between user's latest prior order cum_days and product's last order cum_days
    # plus the train order's days_since_prior_order
    train_orders_gap = train_orders_meta[['user_id', 'days_since_prior_order']].rename(columns={'days_since_prior_order': 'train_gap'})
    user_prod = user_prod.merge(train_orders_gap, on='user_id', how='left')
    user_prod['train_gap'] = user_prod['train_gap'].fillna(0)
    user_prod['days_since_last_purchase'] = (user_prod['user_max_cum_days'] - user_prod['last_cum_days'] + user_prod['train_gap']).astype('float32')
    
    # 3. reorder_rate (user-product reorder rate: how often did user reorder this product after first purchase)
    user_prod['reorder_rate'] = (user_prod['purchase_count'] / user_prod['user_total_orders']).astype('float32')
    
    # 4. Merge product global popularity and reorder rate
    user_prod = user_prod.merge(prod_feats, on='product_id', how='left')
    user_prod['product_popularity'] = user_prod['product_popularity'].fillna(0).astype('int32')
    user_prod['product_reorder_rate'] = user_prod['product_reorder_rate'].fillna(0).astype('float32')
    
    # 5. Label generation: product appears in user's next (train) order
    print("Building ground-truth labels from order_products__train...")
    train_orders_user = train_orders_meta[['order_id', 'user_id']]
    train_items_with_user = df_train.merge(train_orders_user, on='order_id', how='inner')
    train_items_with_user['in_next_order'] = 1
    
    user_prod = user_prod.merge(
        train_items_with_user[['user_id', 'product_id', 'in_next_order']],
        on=['user_id', 'product_id'],
        how='left'
    )
    user_prod['in_next_order'] = user_prod['in_next_order'].fillna(0).astype('int8')
    
    feature_cols = [
        'purchase_count',
        'orders_since_last_purchase',
        'days_since_last_purchase',
        'reorder_rate',
        'avg_position_in_cart',
        'user_avg_order_gap',
        'product_popularity',
        'product_reorder_rate'
    ]
    
    print(f"Features created ({len(user_prod):,} rows). Positive label rate: {user_prod['in_next_order'].mean():.4f}")
    
    # 4. SPLIT TRAIN AND VALIDATION BY USER (Unseen Users)
    print("4. Splitting train and validation BY USER (80% train users, 20% validation users)...")
    train_users_split, val_users_split = train_test_split(selected_users, test_size=0.20, random_state=42)
    train_users_set = set(train_users_split)
    val_users_set = set(val_users_split)
    
    train_df = user_prod[user_prod['user_id'].isin(train_users_set)]
    val_df = user_prod[user_prod['user_id'].isin(val_users_set)].copy()
    
    print(f"Train set: {len(train_users_split):,} users ({len(train_df):,} user-product pairs)")
    print(f"Validation set: {len(val_users_split):,} unseen users ({len(val_df):,} user-product pairs)")
    
    X_train = train_df[feature_cols]
    y_train = train_df['in_next_order']
    
    X_val = val_df[feature_cols]
    y_val = val_df['in_next_order']
    
    # 5. Train LightGBM Classifier
    print("5. Training LightGBM classifier...")
    lgb_train = lgb.Dataset(X_train, label=y_train)
    lgb_val = lgb.Dataset(X_val, label=y_val, reference=lgb_train)
    
    params = {
        'objective': 'binary',
        'metric': 'binary_logloss',
        'boosting_type': 'gbdt',
        'learning_rate': 0.08,
        'num_leaves': 31,
        'max_depth': 6,
        'feature_fraction': 0.85,
        'bagging_fraction': 0.85,
        'bagging_freq': 5,
        'random_state': 42,
        'verbose': -1
    }
    
    model = lgb.train(
        params,
        lgb_train,
        num_boost_round=150,
        valid_sets=[lgb_train, lgb_val],
        callbacks=[lgb.log_evaluation(50)]
    )
    
    # Feature Importance
    importance_scores = model.feature_importance(importance_type='gain')
    feature_importance = {name: round(float(score), 2) for name, score in zip(feature_cols, importance_scores)}
    stats['feature_importance'] = feature_importance
    print("\nFeature Importance (by gain):")
    for feat, imp in sorted(feature_importance.items(), key=lambda x: x[1], reverse=True):
        print(f"  {feat:30s}: {imp:10.2f}")
    
    # 6. Evaluation: Precision@10 and Recall@10 on UNSEEN users
    print("\n6. Evaluating Precision@10 and Recall@10 on unseen validation users...")
    val_df['pred_prob'] = model.predict(X_val)
    
    precisions = []
    recalls = []
    
    # Group predictions by user
    for user_id, group in val_df.groupby('user_id'):
        actual_positives = set(group[group['in_next_order'] == 1]['product_id'])
        if len(actual_positives) == 0:
            continue
        
        # Top 10 predicted products for this user
        top10_prods = set(group.sort_values('pred_prob', ascending=False).head(10)['product_id'])
        
        hits = len(top10_prods & actual_positives)
        p_at_10 = hits / 10.0
        r_at_10 = hits / float(len(actual_positives))
        
        precisions.append(p_at_10)
        recalls.append(r_at_10)
    
    mean_p10 = float(np.mean(precisions))
    mean_r10 = float(np.mean(recalls))
    
    print("=" * 60)
    print("FINAL VALIDATION METRICS ON UNSEEN USERS:")
    print(f"  Precision@10: {mean_p10 * 100:.2f}% ({mean_p10:.4f})")
    print(f"  Recall@10:    {mean_r10 * 100:.2f}% ({mean_r10:.4f})")
    print(f"  Evaluated on: {len(precisions):,} unseen test users")
    print("=" * 60)
    
    stats['metrics'] = {
        'precision_at_10': round(mean_p10, 4),
        'recall_at_10': round(mean_r10, 4),
        'precision_at_10_percent': round(mean_p10 * 100, 2),
        'recall_at_10_percent': round(mean_r10 * 100, 2),
        'unseen_validation_users': len(precisions)
    }
    
    # Save model and stats
    os.makedirs(MODEL_DIR, exist_ok=True)
    model_txt_path = os.path.join(MODEL_DIR, "lgb_model.txt")
    model.save_model(model_txt_path)
    print(f"Model saved to {model_txt_path}")
    
    stats_json_path = os.path.join(MODEL_DIR, "dataset_stats.json")
    with open(stats_json_path, 'w', encoding='utf-8') as f:
        json.dump(stats, f, indent=2)
    print(f"Dataset stats saved to {stats_json_path}")
    
    # 7. Compute Item-to-Item Co-occurrence Affinity Matrix (for dynamic cart complementary recommendations)
    print("7. Computing market basket product co-occurrences for dynamic cart prediction...")
    # Using top products in prior orders to keep lightweight & super fast
    top_500_pids = set(df_prior['product_id'].value_counts().head(500).index)
    prior_top = df_prior[df_prior['product_id'].isin(top_500_pids)][['order_id', 'product_id']]
    # Self merge on order_id to find co-purchased pairs
    merged_pairs = prior_top.merge(prior_top, on='order_id')
    merged_pairs = merged_pairs[merged_pairs['product_id_x'] != merged_pairs['product_id_y']]
    pair_counts = merged_pairs.groupby(['product_id_x', 'product_id_y']).size().reset_index(name='pair_count')
    
    # Normalize by product_x count
    px_counts = prior_top.groupby('product_id').size().to_dict()
    pair_counts['affinity'] = pair_counts.apply(lambda r: round(r['pair_count'] / px_counts.get(r['product_id_x'], 1), 4), axis=1)
    
    # Build dictionary of top complementary items per product
    cooccur_dict = {}
    for pid_x, grp in pair_counts.groupby('product_id_x'):
        top_complements = grp.sort_values('affinity', ascending=False).head(8)
        cooccur_dict[int(pid_x)] = [
            {'product_id': int(r['product_id_y']), 'affinity': float(r['affinity'])}
            for _, r in top_complements.iterrows()
        ]
    
    cooccur_path = os.path.join(MODEL_DIR, "product_affinities.json")
    with open(cooccur_path, 'w', encoding='utf-8') as f:
        json.dump(cooccur_dict, f)
    print(f"Product affinities saved to {cooccur_path}")
    
    # 8. Export Catalog and Demo Unseen Users for Interactive Shop & API
    print("8. Exporting product catalog and demonstration customer profiles...")
    prod_meta = df_products[['product_id', 'product_name', 'aisle', 'department', 'aisle_id', 'department_id']].copy()
    prod_meta = prod_meta.merge(prod_feats, on='product_id', how='left')
    prod_meta['product_popularity'] = prod_meta['product_popularity'].fillna(0).astype(int)
    prod_meta['product_reorder_rate'] = prod_meta['product_reorder_rate'].fillna(0).round(4)
    
    # Add realistic prices based on department for shopping cart realism (not fake data - standard realistic display price)
    dept_price_map = {
        'produce': 2.99, 'dairy eggs': 3.79, 'bakery': 4.29, 'beverages': 2.49,
        'snacks': 3.49, 'meat seafood': 9.99, 'frozen': 4.99, 'pantry': 3.29,
        'deli': 6.49, 'canned goods': 1.99, 'dry goods pasta': 2.19, 'breakfast': 4.19,
        'household': 5.99, 'personal care': 5.49, 'babies': 8.99, 'pets': 7.99,
        'alcohol': 12.99, 'international': 4.49, 'bulk': 3.99, 'other': 4.99, 'missing': 3.99
    }
    prod_meta['price'] = prod_meta['department'].map(lambda d: dept_price_map.get(str(d).lower(), 3.99))
    
    catalog_path = os.path.join(MODEL_DIR, "products_catalog.json")
    # Export top 1200 products across all departments for fast UI response
    top_catalog = prod_meta.sort_values('product_popularity', ascending=False).head(1200)
    top_catalog.to_json(catalog_path, orient='records', indent=2)
    print(f"Top 1,200 products catalog saved to {catalog_path}")
    
    # Pick 8 diverse unseen validation users with active baskets
    val_users_with_positives = [u for u in val_users_split if len(val_df[(val_df['user_id'] == u) & (val_df['in_next_order'] == 1)]) >= 4]
    demo_uids = val_users_with_positives[:8]
    
    demo_profiles = []
    prod_name_map = df_products.set_index('product_id')['product_name'].to_dict()
    dept_name_map = df_products.set_index('product_id')['department'].to_dict()
    
    for uid in demo_uids:
        u_rows = val_df[val_df['user_id'] == uid].copy()
        u_rows['pred_prob'] = model.predict(u_rows[feature_cols])
        
        # User total prior orders
        u_tot_orders = int(u_rows['user_total_orders'].iloc[0])
        u_gap = float(u_rows['user_avg_order_gap'].iloc[0])
        
        # Candidate products sorted by predicted probability
        ranked = u_rows.sort_values('pred_prob', ascending=False)
        candidates = []
        for _, r in ranked.iterrows():
            pid = int(r['product_id'])
            candidates.append({
                'product_id': pid,
                'product_name': prod_name_map.get(pid, f"Product {pid}"),
                'department': dept_name_map.get(pid, "Groceries"),
                'pred_prob': round(float(r['pred_prob']), 4),
                'purchase_count': int(r['purchase_count']),
                'orders_since_last_purchase': int(r['orders_since_last_purchase']),
                'days_since_last_purchase': round(float(r['days_since_last_purchase']), 1),
                'reorder_rate': round(float(r['reorder_rate']), 3),
                'avg_position_in_cart': round(float(r['avg_position_in_cart']), 1),
                'user_avg_order_gap': round(float(r['user_avg_order_gap']), 1),
                'product_popularity': int(r['product_popularity']),
                'product_reorder_rate': round(float(r['product_reorder_rate']), 3),
                'actual_reordered_in_next': bool(r['in_next_order'] == 1)
            })
        
        actual_items = [c for c in candidates if c['actual_reordered_in_next']]
        
        demo_profiles.append({
            'user_id': int(uid),
            'total_prior_orders': u_tot_orders,
            'avg_order_gap_days': round(u_gap, 1),
            'total_candidate_products': len(candidates),
            'actual_next_order_size': len(actual_items),
            'candidates': candidates
        })
        
    demo_profiles_path = os.path.join(MODEL_DIR, "demo_users.json")
    with open(demo_profiles_path, 'w', encoding='utf-8') as f:
        json.dump(demo_profiles, f, indent=2)
    print(f"Demo profiles for {len(demo_profiles)} unseen users saved to {demo_profiles_path}")

    print("\nTraining and artifact generation complete!")

if __name__ == "__main__":
    check_files()
    df_orders, df_products, df_prior, df_train = load_data()
    stats = compute_dataset_stats(df_orders, df_products, df_prior)
    build_features_and_train(df_orders, df_products, df_prior, df_train, stats, num_users=15000)
