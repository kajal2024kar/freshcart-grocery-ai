"""
freshcart-grocery-ai
Instacart Market Basket Next Purchase Predictor
Streamlit Web Application
"""

import os
import json
import streamlit as st
import pandas as pd
import numpy as np

# Page Configuration
st.set_page_config(
    page_title="freshcart-grocery-ai",
    page_icon="🛒",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Normal Quick-Commerce Shopping App with Indian Rupee ₹)
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800;900&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }
    
    .stApp {
        background-color: #f4f6f8;
    }
    
    .top-banner {
        background-color: #0c831f;
        color: white;
        text-align: center;
        padding: 0.4rem 1rem;
        font-size: 0.78rem;
        font-weight: 800;
        border-radius: 8px;
        margin-bottom: 1.25rem;
        letter-spacing: 0.03em;
        box-shadow: 0 2px 5px rgba(12, 131, 31, 0.2);
    }
    
    .main-header {
        background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #0c831f 100%);
        color: white;
        padding: 1.25rem 1.75rem;
        border-radius: 16px;
        margin-bottom: 1.25rem;
        box-shadow: 0 8px 20px -4px rgba(6, 78, 59, 0.25);
    }
    
    .side-popup {
        background: #ffffff;
        border: 2px solid #0c831f;
        border-radius: 12px;
        padding: 0.85rem;
        box-shadow: 0 6px 18px rgba(12, 131, 31, 0.12);
        margin-bottom: 1rem;
    }
    
    .product-card {
        background: white;
        padding: 0.85rem;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        margin-bottom: 0.5rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.02);
    }
    
    .badge-discount {
        background-color: #ecfdf5;
        color: #0c831f;
        font-size: 0.65rem;
        font-weight: 800;
        padding: 0.15rem 0.45rem;
        border-radius: 4px;
        text-transform: uppercase;
    }
</style>
""", unsafe_allow_html=True)

# Base Paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "model")

@st.cache_data
def load_all_artifacts():
    stats_p = os.path.join(MODEL_DIR, "dataset_stats.json")
    catalog_p = os.path.join(MODEL_DIR, "products_catalog.json")
    users_p = os.path.join(MODEL_DIR, "demo_users.json")
    affinities_p = os.path.join(MODEL_DIR, "product_affinities.json")
    
    with open(stats_p, 'r', encoding='utf-8') as f:
        stats = json.load(f)
    with open(catalog_p, 'r', encoding='utf-8') as f:
        catalog = json.load(f)
    with open(users_p, 'r', encoding='utf-8') as f:
        demo_users = json.load(f)
    
    affinities = {}
    if os.path.exists(affinities_p):
        with open(affinities_p, 'r', encoding='utf-8') as f:
            raw_aff = json.load(f)
            affinities = {int(k): v for k, v in raw_aff.items()}
            
    return stats, catalog, demo_users, affinities

stats, catalog, demo_users, affinities = load_all_artifacts()
catalog_map = {int(p['product_id']): p for p in catalog}

dept_icons = {
    'produce': '🥦', 'dairy eggs': '🥛', 'bakery': '🍞', 'beverages': '🧃',
    'snacks': '🥨', 'meat seafood': '🥩', 'frozen': '🧊', 'pantry': '🥫',
    'deli': '🥪', 'canned goods': '🍲', 'dry goods pasta': '🍝', 'breakfast': '🥣',
    'household': '🧹', 'personal care': '🧴', 'babies': '👶', 'pets': '🐾',
    'alcohol': '🍷', 'international': '🍜', 'bulk': '🌾', 'other': '📦'
}

# Session State Initialization (Safe against KeyError and reruns)
if 'cart' not in st.session_state:
    st.session_state.cart = {} # { product_id: quantity }
if 'selected_user_id' not in st.session_state:
    st.session_state.selected_user_id = demo_users[0]['user_id']
if 'last_added_product' not in st.session_state:
    st.session_state.last_added_product = None

current_user = next((u for u in demo_users if u['user_id'] == st.session_state.selected_user_id), demo_users[0])

# Top Announcement Bar
st.markdown('<div class="top-banner">⚡ freshcart-grocery-ai • FREE EXPRESS DELIVERY OVER ₹199 • INSTANT 10-MINUTE DELIVERY</div>', unsafe_allow_html=True)

# SIDEBAR: User Account, Side Recommendation Popup for Every Product Added, & Cart
with st.sidebar:
    st.markdown("## 🛒 **freshcart-grocery-ai**")
    st.caption("Smart E-Grocery • Powered by Instacart AI")
    
    # 1. Customer Profile Selector
    user_options = {
        u['user_id']: f"Customer #{u['user_id']} ({u['total_prior_orders']} orders)"
        for u in demo_users
    }
    chosen_uid = st.selectbox(
        "👤 Active Account:",
        options=list(user_options.keys()),
        format_func=lambda uid: user_options[uid],
        index=0
    )
    if chosen_uid != st.session_state.selected_user_id:
        st.session_state.selected_user_id = chosen_uid
        st.rerun()

    st.divider()

    # 2. DYNAMIC SIDE RECOMMENDATION POPUP (Triggers for every product added)
    if st.session_state.last_added_product:
        p_added = st.session_state.last_added_product
        st.markdown(f"""
        <div class="side-popup">
            <div style="font-size: 0.72rem; font-weight: 800; color: #0c831f; text-transform: uppercase;">
                ✨ Frequently Bought Together
            </div>
            <div style="font-size: 0.85rem; font-weight: 700; color: #111827; margin: 0.2rem 0;">
                Pairs with {p_added.get('product_name', 'Item')[:22]}
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        # Look up complementary items from market basket affinities
        p_affs = affinities.get(p_added.get('product_id', 0), [])
        rec_list = []
        for aff in p_affs[:3]:
            comp = catalog_map.get(aff['product_id'])
            if comp and comp['product_id'] not in st.session_state.cart:
                rec_list.append((comp, int(aff['affinity'] * 100)))
        
        # If fewer than 2 direct affinities, supplement with customer habit candidates
        if len(rec_list) < 2:
            for cand in current_user.get('candidates', [])[:3]:
                if cand['product_id'] != p_added.get('product_id') and cand['product_id'] not in st.session_state.cart:
                    cat_item = catalog_map.get(cand['product_id'])
                    if cat_item and not any(r[0]['product_id'] == cat_item['product_id'] for r in rec_list):
                        rec_list.append((cat_item, int(cand.get('pred_prob', 0.5) * 100)))

        for comp_prod, match_pct in rec_list[:3]:
            col_r1, col_r2 = st.columns([3, 1])
            with col_r1:
                st.write(f"**{comp_prod['product_name'][:20]}**")
                st.caption(f"₹{comp_prod.get('price', 49)} • {match_pct}% Match")
            with col_r2:
                if st.button("+ Add", key=f"side_add_{comp_prod['product_id']}"):
                    st.session_state.cart[comp_prod['product_id']] = st.session_state.cart.get(comp_prod['product_id'], 0) + 1
                    st.session_state.last_added_product = comp_prod
                    st.rerun()

        if st.button("✕ Close Recommendations", use_container_width=True):
            st.session_state.last_added_product = None
            st.rerun()

        st.divider()

    # 3. Shopping Cart Section
    st.markdown("### 🛍️ Your Basket")
    cart_items = st.session_state.cart
    total_cart_count = sum(cart_items.values())
    
    if not cart_items:
        st.write("Your basket is empty. Click **+ ADD** on any grocery item to order!")
    else:
        subtotal = 0.0
        for pid, qty in list(cart_items.items()):
            p = catalog_map.get(pid, {'product_name': f"Item #{pid}", 'price': 49, 'department': 'groceries'})
            item_price = p.get('price', 49)
            item_total = item_price * qty
            subtotal += item_total
            
            c_col1, c_col2 = st.columns([3, 1])
            with c_col1:
                st.write(f"**{p['product_name'][:20]}**")
                st.caption(f"₹{item_price} × {qty} = ₹{item_total}")
            with c_col2:
                if st.button("🗑️", key=f"side_del_{pid}"):
                    del st.session_state.cart[pid]
                    st.rerun()
        
        st.write(f"**Subtotal:** ₹{int(subtotal)}")
        st.write(f"**Govt. GST (5%):** ₹{int(subtotal * 0.05)}")
        st.write(f"**Grand Total:** ₹{int(subtotal * 1.05)}")
        
        col_c1, col_c2 = st.columns(2)
        with col_c1:
            if st.button("Clear Basket", use_container_width=True):
                st.session_state.cart = {}
                st.session_state.last_added_product = None
                st.rerun()
        with col_c2:
            if st.button("Checkout 🎉", type="primary", use_container_width=True):
                st.balloons()
                st.success(f"Order of ₹{int(subtotal * 1.05)} placed successfully! Delivering in 10 minutes.")
                st.session_state.cart = {}
                st.session_state.last_added_product = None

# Main Interface Tabs
tab_shop, tab_analytics = st.tabs(["🛒 Grocery Store", "📊 Dataset & AI Performance"])

with tab_shop:
    # Clean E-Commerce Header (freshcart-grocery-ai)
    st.markdown(f"""
    <div class="main-header">
        <h2 style="margin: 0; font-size: 1.85rem; font-weight: 900; font-family: Plus Jakarta Sans, sans-serif;">
            🛒 freshcart-grocery-ai
        </h2>
        <p style="margin: 0.35rem 0 0 0; font-size: 0.875rem; opacity: 0.95;">
            India's AI-Powered Fresh Grocery Shop • 10-Minute Instant Delivery • Real-Time Market Basket Recommendations
        </p>
    </div>
    """, unsafe_allow_html=True)

    # Note: "Predicted Next Basket" banner is hidden as explicitly requested

    # Catalog & Shopping Grid (Normal Indian E-Commerce Shopping Experience)
    st.markdown("### 🛍️ Fresh Daily Groceries")
    col_s1, col_s2 = st.columns([2, 1])
    with col_s1:
        search_query = st.text_input("Search catalog:", placeholder="Search 'banana', 'milk', 'bread', 'spinach', 'chips'...")
    with col_s2:
        dept_list = ['All'] + sorted(list({p['department'] for p in catalog if p.get('department')}))
        selected_dept = st.selectbox("Category:", dept_list)

    filtered = catalog
    if selected_dept != 'All':
        filtered = [p for p in filtered if p.get('department', '').lower() == selected_dept.lower()]
    if search_query:
        q = search_query.lower()
        filtered = [p for p in filtered if q in p['product_name'].lower() or q in p['aisle'].lower()]

    st.caption(f"Showing {min(len(filtered), 24)} items in store")

    # 4-column product grid with Indian Rupee ₹ pricing
    grid_cols = st.columns(4)
    for i, prod in enumerate(filtered[:24]):
        with grid_cols[i % 4]:
            p_icon = dept_icons.get(prod['department'].lower(), '🛒')
            price = prod.get('price', 49)
            mrp = prod.get('mrp', int(price * 1.25))
            discount = int(((mrp - price) / mrp) * 100) if mrp > price else 15
            unit = prod.get('unit', '1 pack')
            
            st.markdown(f"""
            <div class="product-card">
                <span class="badge-discount">{discount}% OFF • {unit}</span>
                <h5 style="margin: 0.35rem 0 0.15rem 0; font-size: 0.85rem; height: 2.2rem; overflow: hidden; line-height: 1.2;">
                    {prod['product_name']}
                </h5>
                <p style="font-size: 0.7rem; color: #6b7280; margin: 0; text-transform: capitalize;">{prod.get('aisle', 'Groceries')}</p>
                <div style="font-size: 1.05rem; font-weight: 900; color: #111827; margin: 0.35rem 0;">
                    ₹{price} <span style="font-size: 0.72rem; color: #9ca3af; text-decoration: line-through;">₹{mrp}</span>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            p_in_cart = prod['product_id'] in st.session_state.cart
            btn_txt = f"In Cart ({st.session_state.cart[prod['product_id']]})" if p_in_cart else "+ ADD"
            if st.button(btn_txt, key=f"cat_add_{prod['product_id']}", use_container_width=True):
                st.session_state.cart[prod['product_id']] = st.session_state.cart.get(prod['product_id'], 0) + 1
                st.session_state.last_added_product = prod
                st.rerun()

with tab_analytics:
    st.markdown("## 📊 freshcart-grocery-ai • Dataset Statistics & Model Metrics")
    st.caption("Evaluated on real Instacart Market Basket data (3.4M orders across 206,209 shoppers)")
    
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric("Precision@10 (Unseen Users)", f"{stats['metrics']['precision_at_10_percent']}%")
    with m2:
        st.metric("Recall@10 (Unseen Users)", f"{stats['metrics']['recall_at_10_percent']}%")
    with m3:
        st.metric("Total Real Orders", f"{stats['orders']:,}")
    with m4:
        st.metric("Dataset Reorder Rate", f"{stats['reorder_rate']*100:.1f}%")

    st.divider()

    c1, c2 = st.columns(2)
    with c1:
        st.markdown("### 📅 Orders by Day of Week")
        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        dow_df = pd.DataFrame([{"Day": day_names[int(k)], "Orders": v} for k, v in stats['orders_by_weekday'].items()])
        st.bar_chart(dow_df.set_index("Day"), color="#0c831f")

    with c2:
        st.markdown("### ⏰ Orders by Hour of Day")
        hour_df = pd.DataFrame([{"Hour": f"{int(k):02d}:00", "Orders": v} for k, v in stats['orders_by_hour'].items()])
        st.area_chart(hour_df.set_index("Hour"), color="#0284c7")

    c3, c4 = st.columns(2)
    with c3:
        st.markdown("### 🏆 Top 10 Most Ordered Products")
        top10_df = pd.DataFrame([{"Product": p['product_name'], "Orders": p['order_count']} for p in stats['top_10_products']])
        st.bar_chart(top10_df.set_index("Product"), horizontal=True, color="#ea580c")

    with c4:
        st.markdown("### 🌲 LightGBM Feature Importance (Gain)")
        feat_df = pd.DataFrame([{"Feature": k, "Gain": round(v, 2)} for k, v in stats['feature_importance'].items()]).sort_values("Gain", ascending=True)
        st.bar_chart(feat_df.set_index("Feature"), horizontal=True, color="#7c3aed")
