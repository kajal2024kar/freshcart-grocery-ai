"""
BlinkMarket AI - Instacart Market Basket Next Purchase Predictor
Streamlit Web Application for Live Cloud Deployment (INR & Normal Shopping UI)
"""

import os
import json
import streamlit as st
import pandas as pd
import numpy as np

# Page Configuration
st.set_page_config(
    page_title="BlinkMarket - 10 Mins Grocery & AI Recommender",
    page_icon="⚡",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Normal Shopping App / Blinkit style with Indian Rupee)
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800;900&display=swap');
    
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
        padding: 0.35rem;
        font-size: 0.75rem;
        font-weight: 700;
        border-radius: 6px;
        margin-bottom: 1rem;
        letter-spacing: 0.03em;
    }
    
    .main-header {
        background: linear-gradient(135deg, #064e3b 0%, #065f46 60%, #0c831f 100%);
        color: white;
        padding: 1.25rem 1.75rem;
        border-radius: 16px;
        margin-bottom: 1.25rem;
        box-shadow: 0 8px 20px -4px rgba(6, 78, 59, 0.25);
    }
    
    .side-popup {
        background: #ffffff;
        border: 2px solid #0c831f;
        border-radius: 14px;
        padding: 1rem;
        box-shadow: 0 8px 25px rgba(12, 131, 31, 0.15);
        margin-bottom: 1.25rem;
    }
    
    .product-card {
        background: white;
        padding: 0.85rem;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        margin-bottom: 0.75rem;
    }
    
    .badge-discount {
        background-color: #ecfdf5;
        color: #0c831f;
        font-size: 0.65rem;
        font-weight: 800;
        padding: 0.15rem 0.4rem;
        border-radius: 4px;
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

# Session State Initialization
if 'cart' not in st.session_state:
    st.session_state.cart = {} # { product_id: quantity }
if 'selected_user_id' not in st.session_state:
    st.session_state.selected_user_id = demo_users[0]['user_id']
if 'show_ground_truth' not in st.session_state:
    st.session_state.show_ground_truth = False
if 'last_added_product' not in st.session_state:
    st.session_state.last_added_product = None

current_user = next((u for u in demo_users if u['user_id'] == st.session_state.selected_user_id), demo_users[0])

# Top Announcement
st.markdown('<div class="top-banner">⚡ FREE EXPRESS DELIVERY ON ORDERS OVER ₹199 • 10 MINUTES DELIVERY TO MUMBAI 400001</div>', unsafe_allow_html=True)

# SIDEBAR: Contains User Switcher, Dynamic Side Recommendations Popup for Added Products, & Basket
with st.sidebar:
    st.markdown("## ⚡ **BlinkMarket**")
    st.caption("10 Mins Grocery • AI Next Purchase Engine")
    
    # 1. Customer Selector
    user_options = {
        u['user_id']: f"Shopper #{u['user_id']} ({u['total_prior_orders']} orders)"
        for u in demo_users
    }
    chosen_uid = st.selectbox(
        "👤 Account Profile:",
        options=list(user_options.keys()),
        format_func=lambda uid: user_options[uid],
        index=0
    )
    if chosen_uid != st.session_state.selected_user_id:
        st.session_state.selected_user_id = chosen_uid
        st.rerun()

    st.divider()

    # 2. DYNAMIC SIDE RECOMMENDATION POPUP FOR EVERY PRODUCT ADDED
    if st.session_state.last_added_product:
        p_added = st.session_state.last_added_product
        st.markdown(f"""
        <div class="side-popup">
            <div style="font-size: 0.72rem; font-weight: 800; color: #0c831f; text-transform: uppercase;">
                ✨ Frequently Bought Together
            </div>
            <div style="font-size: 0.85rem; font-weight: 700; color: #111827; margin: 0.2rem 0;">
                Pairs with {p_added['product_name'][:20]}
            </div>
        </div>
        """, unsafe_allow_html=True)
        
        # Look up complementary items
        p_affs = affinities.get(p_added['product_id'], [])
        rec_list = []
        for aff in p_affs[:3]:
            comp = catalog_map.get(aff['product_id'])
            if comp and comp['product_id'] not in st.session_state.cart:
                rec_list.append((comp, int(aff['affinity'] * 100)))
        
        # If no direct affinity, show top next-purchase candidates
        if len(rec_list) < 2:
            for cand in current_user['candidates'][:3]:
                if cand['product_id'] != p_added['product_id'] and cand['product_id'] not in st.session_state.cart:
                    cat_item = catalog_map.get(cand['product_id'])
                    if cat_item:
                        rec_list.append((cat_item, int(cand['pred_prob'] * 100)))

        for comp_prod, match_pct in rec_list[:3]:
            col_r1, col_r2 = st.columns([3, 1])
            with col_r1:
                st.write(f"**{comp_prod['product_name'][:22]}**")
                st.caption(f"₹{comp_prod['price']} • {match_pct}% Match")
            with col_r2:
                if st.button("+ Add", key=f"side_add_{comp_prod['product_id']}"):
                    st.session_state.cart[comp_prod['product_id']] = st.session_state.cart.get(comp_prod['product_id'], 0) + 1
                    st.session_state.last_added_product = comp_prod
                    st.rerun()

        if st.button("✕ Dismiss Recommendations", use_container_width=True):
            st.session_state.last_added_product = None
            st.rerun()

        st.divider()

    # 3. Shopping Cart Drawer
    st.markdown("### 🛍️ Your Active Basket")
    cart_items = st.session_state.cart
    total_cart_count = sum(cart_items.values())
    
    if not cart_items:
        st.write("Your basket is empty. Add items to see instant AI suggestions!")
    else:
        subtotal = 0.0
        for pid, qty in list(cart_items.items()):
            p = catalog_map.get(pid, {'product_name': f"Item #{pid}", 'price': 49, 'department': 'groceries'})
            item_total = p['price'] * qty
            subtotal += item_total
            
            c_col1, c_col2 = st.columns([3, 1])
            with c_col1:
                st.write(f"**{p['product_name'][:20]}**")
                st.caption(f"₹{p['price']} × {qty} = ₹{item_total}")
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
                st.success(f"Order of ₹{int(subtotal * 1.05)} placed successfully! Delivering in 10 mins.")
                st.session_state.cart = {}
                st.session_state.last_added_product = None

# Calculate dynamic recommendations based on cart items
cart_pids_set = set(st.session_state.cart.keys())
cart_boosts = {}
if cart_pids_set and affinities:
    for cpid in cart_pids_set:
        for aff in affinities.get(cpid, []):
            target_pid = aff['product_id']
            cart_boosts[target_pid] = cart_boosts.get(target_pid, 0.0) + aff['affinity']

scored_candidates = []
for c in current_user['candidates']:
    pid = c['product_id']
    boost = cart_boosts.get(pid, 0.0)
    dynamic_prob = min(0.99, c['pred_prob'] * (1.0 + boost * 1.5))
    p_info = catalog_map.get(pid, {'price': 49, 'mrp': 65, 'unit': '1 pack', 'department': c['department']})
    
    scored_candidates.append({
        'product_id': pid,
        'product_name': c['product_name'],
        'department': c['department'],
        'price': p_info.get('price', 49),
        'mrp': p_info.get('mrp', 65),
        'unit': p_info.get('unit', '1 pack'),
        'dynamic_prob': dynamic_prob,
        'actual_reordered': c.get('actual_reordered_in_next', False)
    })

scored_candidates.sort(key=lambda x: x['dynamic_prob'], reverse=True)
top_predictions = scored_candidates[:5]

# Main Interface Tabs
tab_shop, tab_analytics = st.tabs(["🛒 Grocery Store & Dynamic Predictions", "📊 Dataset & Model Performance"])

with tab_shop:
    # Banner Header
    st.markdown(f"""
    <div class="main-header">
        <h2 style="margin: 0; font-size: 1.85rem; font-weight: 900;">
            ⚡ BlinkMarket • Daily Groceries in 10 Minutes
        </h2>
        <p style="margin: 0.35rem 0 0 0; font-size: 0.875rem; opacity: 0.95;">
            Dynamic next-purchase AI trained on <strong>3.4 Million Instacart Orders</strong>. Real-time ₹ prices and cart synergy recommendations.
        </p>
    </div>
    """, unsafe_allow_html=True)
    
    # Next Basket Prediction Section
    st.markdown("### 🔮 Predicted Next Basket (AI Dynamic Model)")
    
    if len(st.session_state.cart) > 0:
        st.success(f"⚡ Synergy Active: {len(st.session_state.cart)} item(s) in cart dynamically boosting complementary recommendations!")
        
    pred_cols = st.columns(5)
    for idx, pred in enumerate(top_predictions):
        with pred_cols[idx]:
            prob_pct = int(pred['dynamic_prob'] * 100)
            icon = dept_icons.get(pred['department'].lower(), '🛒')
            
            st.markdown(f"""
            <div class="product-card">
                <span class="badge-discount">{pred['unit']}</span>
                <h4 style="margin: 0.35rem 0 0.15rem 0; font-size: 0.85rem; height: 2.3rem; overflow: hidden; line-height: 1.2;">
                    {pred['product_name']}
                </h4>
                <div style="font-size: 0.72rem; font-weight: 700; color: #0c831f;">
                    Match: {prob_pct}%
                </div>
                <div style="font-size: 1rem; font-weight: 900; color: #111827; margin: 0.25rem 0;">
                    ₹{pred['price']} <span style="font-size: 0.7rem; color: #9ca3af; text-decoration: line-through;">₹{pred['mrp']}</span>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            p_in_cart = pred['product_id'] in st.session_state.cart
            btn_lbl = f"Added ({st.session_state.cart[pred['product_id']]})" if p_in_cart else "+ ADD"
            if st.button(btn_lbl, key=f"btn_p_{pred['product_id']}", use_container_width=True):
                st.session_state.cart[pred['product_id']] = st.session_state.cart.get(pred['product_id'], 0) + 1
                st.session_state.last_added_product = catalog_map.get(pred['product_id'], pred)
                st.rerun()

    st.divider()

    # Catalog & Shopping Grid (Indian Rupee ₹)
    st.markdown("### 🛍️ Browse Grocery Catalog")
    col_s1, col_s2 = st.columns([2, 1])
    with col_s1:
        search_query = st.text_input("Search groceries:", placeholder="Search 'banana', 'milk', 'bread', 'spinach'...")
    with col_s2:
        dept_list = ['All'] + sorted(list({p['department'] for p in catalog if p.get('department')}))
        selected_dept = st.selectbox("Category Filter:", dept_list)

    filtered = catalog
    if selected_dept != 'All':
        filtered = [p for p in filtered if p.get('department', '').lower() == selected_dept.lower()]
    if search_query:
        q = search_query.lower()
        filtered = [p for p in filtered if q in p['product_name'].lower() or q in p['aisle'].lower()]

    st.caption(f"Showing {min(len(filtered), 24)} items in catalog")

    grid_cols = st.columns(4)
    for i, prod in enumerate(filtered[:24]):
        with grid_cols[i % 4]:
            p_icon = dept_icons.get(prod['department'].lower(), '🛒')
            discount = int(((prod['mrp'] - prod['price']) / prod['mrp']) * 100)
            
            st.markdown(f"""
            <div class="product-card">
                <span class="badge-discount">{discount}% OFF • {prod['unit']}</span>
                <h5 style="margin: 0.35rem 0 0.15rem 0; font-size: 0.85rem; height: 2.2rem; overflow: hidden; line-height: 1.2;">
                    {prod['product_name']}
                </h5>
                <p style="font-size: 0.7rem; color: #6b7280; margin: 0; text-transform: capitalize;">{prod['aisle']}</p>
                <div style="font-size: 1.05rem; font-weight: 900; color: #111827; margin: 0.35rem 0;">
                    ₹{prod['price']} <span style="font-size: 0.72rem; color: #9ca3af; text-decoration: line-through;">₹{prod['mrp']}</span>
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            p_in_cart = prod['product_id'] in st.session_state.cart
            btn_txt = f"Added ({st.session_state.cart[prod['product_id']]})" if p_in_cart else "+ ADD"
            if st.button(btn_txt, key=f"cat_add_{prod['product_id']}", use_container_width=True):
                st.session_state.cart[prod['product_id']] = st.session_state.cart.get(prod['product_id'], 0) + 1
                st.session_state.last_added_product = prod
                st.rerun()

with tab_analytics:
    st.markdown("## 📊 Instacart Dataset Statistics & LightGBM Metrics")
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
