"""
FastAPI application for the Online Grocery Shop.
Serves predictions, dataset stats, product catalogue, complementary pairings, and the static website.

Usage:
    uvicorn api.main:app --reload --port 8000
"""

import json
import pathlib
from typing import Optional

import pandas as pd
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

# Paths
ROOT = pathlib.Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
MODEL_DIR = ROOT / "model"
WEB_DIR = ROOT / "web"

app = FastAPI(
    title="FreshCart Grocery Shop + AI Basket Predictor",
    description="Online grocery store with LightGBM-powered next basket prediction on real Instacart data",
    version="1.0.0",
)

# Enable CORS for flexible local development
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ----------------------------------------------------------------------
# Load static metadata and precomputed model artifacts
# ----------------------------------------------------------------------
print("Loading product catalogue and model metadata...")

aisles_df = pd.read_csv(DATA_DIR / "aisles.csv")
departments_df = pd.read_csv(DATA_DIR / "departments.csv")
products_df = pd.read_csv(DATA_DIR / "products.csv")

products_full = (
    products_df
    .merge(aisles_df, on="aisle_id")
    .merge(departments_df, on="department_id")
)

# Map product_id to details dict for O(1) lookup
product_lookup = {}
products_by_aisle = {}
products_by_dept = {}

for _, row in products_full.iterrows():
    p_id = int(row["product_id"])
    p_info = {
        "product_id": p_id,
        "product_name": str(row["product_name"]),
        "department": str(row["department"]),
        "aisle": str(row["aisle"]),
    }
    product_lookup[p_id] = p_info

    a_name = str(row["aisle"]).lower()
    d_name = str(row["department"]).lower()
    products_by_aisle.setdefault(a_name, []).append(p_info)
    products_by_dept.setdefault(d_name, []).append(p_info)

# Complementary grocery aisle affinities
COMPLEMENTARY_AISLE_MAP = {
    "dry pasta": ["pasta sauce", "canned meals beans", "packaged cheese"],
    "pasta sauce": ["dry pasta", "spices seasonings", "packaged cheese"],
    "chips pretzels": ["dip spreads", "water seltzer sparkling water", "soft drinks"],
    "dip spreads": ["chips pretzels", "crackers"],
    "cereal": ["milk", "yogurt", "fresh fruits"],
    "milk": ["cereal", "cookies cakes", "coffee"],
    "coffee": ["milk", "cream", "bakery desserts"],
    "tea": ["honey syrups", "cookies cakes"],
    "bread": ["spreads", "butter", "lunch meat"],
    "spreads": ["bread", "crackers", "breakfast bakery"],
    "fresh fruits": ["fresh vegetables", "yogurt", "packaged produce"],
    "fresh vegetables": ["fresh fruits", "salad dressing toppings", "packaged produce"],
    "packaged vegetables fruits": ["salad dressing toppings", "fresh fruits"],
    "salad dressing toppings": ["packaged vegetables fruits", "fresh vegetables"],
    "tortillas flat bread": ["canned meals beans", "packaged cheese", "salsa dip"],
    "eggs": ["bread", "butter", "breakfast bakery", "packaged meat"],
    "yogurt": ["fresh fruits", "energy granola bars", "granola"],
    "crackers": ["specialty cheeses", "packaged cheese", "spreads"],
    "specialty cheeses": ["crackers", "wine", "fresh fruits"],
    "ice cream ice": ["frozen dessert", "cookies cakes"],
    "packaged poultry": ["marinades meat preparation", "spices seasonings", "fresh vegetables"],
    "water seltzer sparkling water": ["energy sports drinks", "juice nectars", "packaged snacks"],
}

# Load dataset statistics
stats_path = MODEL_DIR / "dataset_stats.json"
if not stats_path.exists():
    raise FileNotFoundError(f"Missing {stats_path}. Please run 'python -m model.train' first.")
with open(stats_path, "r", encoding="utf-8") as f:
    dataset_stats = json.load(f)

# Load sample users (300 users)
users_path = MODEL_DIR / "sample_users.json"
if not users_path.exists():
    raise FileNotFoundError(f"Missing {users_path}. Please run 'python -m model.train' first.")
with open(users_path, "r", encoding="utf-8") as f:
    sample_users = json.load(f)

# Load sample user predictions
features_path = MODEL_DIR / "sample_user_features.json"
if not features_path.exists():
    raise FileNotFoundError(f"Missing {features_path}. Please run 'python -m model.train' first.")
with open(features_path, "r", encoding="utf-8") as f:
    sample_user_predictions = json.load(f)

print(f"API ready: {len(product_lookup):,} products, {len(sample_users)} demo users loaded.")

# ----------------------------------------------------------------------
# API Endpoints
# ----------------------------------------------------------------------

@app.get("/api/users")
def get_users():
    """Return list of 300 sample user IDs with their order counts."""
    return sample_users


@app.get("/api/predict/{user_id}")
def get_predictions(user_id: int):
    """
    Top 10 predicted products for a given user, including probability,
    department, aisle, and an explanation of the prediction.
    """
    str_uid = str(user_id)
    if str_uid not in sample_user_predictions and user_id not in sample_user_predictions:
        raise HTTPException(
            status_code=404,
            detail=f"User {user_id} not found in sample users. Please select one of the 300 sample users from /api/users.",
        )

    preds = sample_user_predictions.get(str_uid) or sample_user_predictions.get(user_id)
    results = []

    for item in preds:
        pid = item["product_id"]
        prod_info = product_lookup.get(pid, {
            "product_id": pid,
            "product_name": f"Product #{pid}",
            "department": "grocery",
            "aisle": "all",
        })

        bought_count = item.get("up_purchase_count", 0)
        total_orders = item.get("user_total_orders", 0)
        reason = f"Bought in {bought_count} of {total_orders} past orders"

        results.append({
            "product_id": pid,
            "product_name": prod_info["product_name"],
            "department": prod_info["department"],
            "aisle": prod_info["aisle"],
            "probability": item.get("probability", 0.0),
            "reason": reason,
        })

    # Sort descending by probability
    results.sort(key=lambda x: x["probability"], reverse=True)
    return {"user_id": user_id, "predictions": results[:10]}


@app.get("/api/complementary/{product_id}")
def get_complementary_products(
    product_id: int,
    user_id: Optional[int] = Query(None, description="Optional user ID to personalize complementary pairings"),
    limit: int = Query(4, ge=1, le=10, description="Number of complementary recommendations to return"),
):
    """
    Returns items complementary to the given product_id.
    Prioritizes items that both pair with the clicked product and are predicted
    in the customer's next basket, followed by market basket pairings in related aisles.
    """
    prod = product_lookup.get(product_id)
    if not prod:
        raise HTTPException(status_code=404, detail=f"Product {product_id} not found")

    aisle = prod["aisle"].lower()
    dept = prod["department"].lower()

    paired_aisles = COMPLEMENTARY_AISLE_MAP.get(aisle, [])
    # Target aisles include complementary aisles first, then the same aisle
    target_aisles = paired_aisles + [aisle]

    results = []
    seen_ids = {product_id}

    # 1. First priority: Check active customer's predicted next-basket items
    if user_id:
        str_uid = str(user_id)
        user_preds = sample_user_predictions.get(str_uid) or sample_user_predictions.get(user_id) or []
        for pred in user_preds:
            pid = pred["product_id"]
            if pid in seen_ids:
                continue
            p_info = product_lookup.get(pid)
            if not p_info:
                continue
            p_aisle = p_info["aisle"].lower()
            p_dept = p_info["department"].lower()

            # Matches complementary aisle or same department
            if p_aisle in target_aisles or p_dept == dept:
                seen_ids.add(pid)
                prob_pct = int(round(pred.get("probability", 0.0) * 100))
                results.append({
                    "product_id": pid,
                    "product_name": p_info["product_name"],
                    "department": p_info["department"],
                    "aisle": p_info["aisle"],
                    "probability": pred.get("probability", 0.0),
                    "reason": f"Customer reorder ({prob_pct}% chance) & pairs with {prod['product_name']}",
                    "is_personalized": True,
                })
                if len(results) >= limit:
                    break

    # 2. Second priority: Market basket pairings from complementary aisles
    if len(results) < limit:
        for t_aisle in target_aisles:
            candidates = products_by_aisle.get(t_aisle, [])
            for c in candidates:
                cid = c["product_id"]
                if cid in seen_ids:
                    continue
                seen_ids.add(cid)
                pairing_desc = f"Complementary {c['aisle'].title()} pairing" if t_aisle != aisle else f"Popular in {aisle.title()}"
                results.append({
                    "product_id": cid,
                    "product_name": c["product_name"],
                    "department": c["department"],
                    "aisle": c["aisle"],
                    "probability": 0.48,
                    "reason": f"{pairing_desc} for {prod['product_name']}",
                    "is_personalized": False,
                })
                if len(results) >= limit:
                    break
            if len(results) >= limit:
                break

    # 3. Third priority: Items from same department if needed
    if len(results) < limit:
        candidates = products_by_dept.get(dept, [])
        for c in candidates:
            cid = c["product_id"]
            if cid in seen_ids:
                continue
            seen_ids.add(cid)
            results.append({
                "product_id": cid,
                "product_name": c["product_name"],
                "department": c["department"],
                "aisle": c["aisle"],
                "probability": 0.35,
                "reason": f"Related item from {dept.title()} department",
                "is_personalized": False,
            })
            if len(results) >= limit:
                break

    return {
        "source_product": prod,
        "complementary": results[:limit],
    }


@app.get("/api/stats")
def get_stats():
    """Return contents of dataset_stats.json."""
    return dataset_stats


@app.get("/api/products")
def get_products(
    search: Optional[str] = Query(None, description="Search term for product name"),
    department: Optional[str] = Query(None, description="Filter by department name"),
    page: int = Query(1, ge=1, description="Page number"),
    page_size: int = Query(40, ge=1, le=100, description="Items per page"),
):
    """Product catalogue with search, department filtering, and pagination."""
    df = products_full

    if search:
        search_clean = search.strip()
        mask = df["product_name"].str.contains(search_clean, case=False, na=False)
        df = df[mask]

    if department and department.lower() != "all":
        df = df[df["department"].str.lower() == department.lower()]

    total = len(df)
    start_idx = (page - 1) * page_size
    end_idx = start_idx + page_size
    items_slice = df.iloc[start_idx:end_idx]

    items = [
        {
            "product_id": int(r["product_id"]),
            "product_name": str(r["product_name"]),
            "department": str(r["department"]),
            "aisle": str(r["aisle"]),
        }
        for _, r in items_slice.iterrows()
    ]

    return {
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if total > 0 else 1,
        "items": items,
    }


@app.get("/api/departments")
def get_departments():
    """Return all unique department names sorted alphabetically."""
    return sorted(products_full["department"].unique().tolist())


# ----------------------------------------------------------------------
# Serve frontend static files
# ----------------------------------------------------------------------
if WEB_DIR.exists():
    app.mount("/", StaticFiles(directory=str(WEB_DIR), html=True), name="web")
