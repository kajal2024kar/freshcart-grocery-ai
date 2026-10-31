"""
FastAPI Server for Instacart Market Basket Next Purchase Prediction
"""

import os
import json
from typing import List, Optional
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import lightgbm as lgb
import numpy as np

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

app = FastAPI(title="Instacart FreshMarket AI API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Load artifacts
STATS_PATH = os.path.join(BASE_DIR, "dataset_stats.json")
CATALOG_PATH = os.path.join(BASE_DIR, "products_catalog.json")
DEMO_USERS_PATH = os.path.join(BASE_DIR, "demo_users.json")
AFFINITIES_PATH = os.path.join(BASE_DIR, "product_affinities.json")
MODEL_PATH = os.path.join(BASE_DIR, "lgb_model.txt")

with open(STATS_PATH, "r", encoding="utf-8") as f:
    dataset_stats = json.load(f)

with open(CATALOG_PATH, "r", encoding="utf-8") as f:
    products_catalog = json.load(f)

catalog_by_id = {int(p["product_id"]): p for p in products_catalog}

with open(DEMO_USERS_PATH, "r", encoding="utf-8") as f:
    demo_users = json.load(f)

demo_users_map = {int(u["user_id"]): u for u in demo_users}

product_affinities = {}
if os.path.exists(AFFINITIES_PATH):
    with open(AFFINITIES_PATH, "r", encoding="utf-8") as f:
        loaded_aff = json.load(f)
        product_affinities = {int(k): v for k, v in loaded_aff.items()}

# Load LightGBM Booster
booster = None
if os.path.exists(MODEL_PATH):
    booster = lgb.Booster(model_file=MODEL_PATH)


class PredictRequest(BaseModel):
    user_id: int
    cart_product_ids: Optional[List[int]] = []


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "model_loaded": booster is not None,
        "total_catalog_products": len(products_catalog),
        "demo_users_count": len(demo_users),
    }


@app.get("/api/stats")
def get_stats():
    return dataset_stats


@app.get("/api/departments")
def get_departments():
    depts = sorted(list({p["department"] for p in products_catalog if p.get("department")}))
    return {"departments": depts}


@app.get("/api/products")
def get_products(
    q: Optional[str] = None,
    department: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
):
    results = products_catalog
    if department and department.lower() != "all":
        results = [p for p in results if p.get("department", "").lower() == department.lower()]

    if q:
        query_terms = q.lower().split()
        results = [
            p for p in results
            if all(term in p.get("product_name", "").lower() or term in p.get("aisle", "").lower() for term in query_terms)
        ]

    total = len(results)
    sliced = results[offset : offset + limit]
    return {
        "total": total,
        "limit": limit,
        "offset": offset,
        "products": sliced,
    }


@app.get("/api/users")
def get_users():
    summary = []
    for u in demo_users:
        # Generate persona label
        top_cand = u["candidates"][0] if u["candidates"] else None
        top_name = top_cand["product_name"] if top_cand else "Groceries"
        summary.append({
            "user_id": u["user_id"],
            "total_prior_orders": u["total_prior_orders"],
            "avg_order_gap_days": u["avg_order_gap_days"],
            "actual_next_order_size": u["actual_next_order_size"],
            "favorite_item": top_name,
            "label": f"Customer #{u['user_id']} ({u['total_prior_orders']} orders, loves {top_name[:22]})",
        })
    return {"users": summary}


@app.post("/api/predict")
def predict_next_basket(req: PredictRequest):
    user_data = demo_users_map.get(req.user_id)
    if not user_data:
        # Fallback to first demo user
        user_data = demo_users[0]

    cart_set = set(req.cart_product_ids or [])
    
    # Calculate cart dynamic affinities for each candidate
    cart_boosts = {}
    if cart_set and product_affinities:
        for c_pid in cart_set:
            if c_pid in product_affinities:
                for comp in product_affinities[c_pid]:
                    comp_id = comp["product_id"]
                    cart_boosts[comp_id] = cart_boosts.get(comp_id, 0.0) + comp["affinity"]

    candidates = user_data["candidates"]
    scored = []

    for c in candidates:
        pid = c["product_id"]
        base_prob = c["pred_prob"]
        
        # Dynamic cart complement effect:
        # If item pairs with cart items, apply synergy boost
        cart_boost = cart_boosts.get(pid, 0.0)
        # Dynamic probability adjusted by cart context
        dynamic_prob = min(0.99, base_prob * (1.0 + cart_boost * 1.5))
        
        # Build human-readable explanations
        reasons = []
        if c["purchase_count"] >= 5:
            reasons.append(f"Frequent habit: ordered {c['purchase_count']}x")
        elif c["purchase_count"] >= 2:
            reasons.append(f"Bought {c['purchase_count']} times")
            
        if c["orders_since_last_purchase"] == 1:
            reasons.append("Bought in their last order")
        elif c["orders_since_last_purchase"] <= 3:
            reasons.append(f"Bought {c['orders_since_last_purchase']} orders ago")
            
        if cart_boost > 0.05:
            reasons.append(f"Strong pair with items in cart (+{int(cart_boost*100)}% synergy)")

        prod_info = catalog_by_id.get(pid, {
            "product_id": pid,
            "product_name": c["product_name"],
            "department": c["department"],
            "price": 3.99,
        })

        scored.append({
            "product_id": pid,
            "product_name": prod_info.get("product_name", c["product_name"]),
            "department": prod_info.get("department", c["department"]),
            "aisle": prod_info.get("aisle", ""),
            "price": prod_info.get("price", 3.99),
            "base_prob": base_prob,
            "dynamic_prob": round(dynamic_prob, 4),
            "cart_synergy": round(cart_boost, 3),
            "in_cart": pid in cart_set,
            "reasons": reasons,
            "purchase_count": c["purchase_count"],
            "orders_since_last": c["orders_since_last_purchase"],
            "actual_reordered": c.get("actual_reordered_in_next", False),
        })

    # Sort candidates by dynamic probability descending
    scored.sort(key=lambda x: x["dynamic_prob"], reverse=True)

    # Top 10 predicted items
    top_predictions = scored[:10]

    # Ground truth actual next order items
    actual_next = [s for s in scored if s["actual_reordered"]]

    return {
        "user_id": user_data["user_id"],
        "total_prior_orders": user_data["total_prior_orders"],
        "cart_count": len(cart_set),
        "predictions": top_predictions,
        "actual_next_order": actual_next,
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
