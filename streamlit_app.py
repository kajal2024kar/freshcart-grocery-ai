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
        font-size: 0.8rem;
        font-weight: 800;
        border-radius: 8px;
        margin-bottom: 1rem;
        letter-spacing: 0.02em;
    }
    
    .main-header {
        background: linear-gradient(135deg, #064e3b 0%, #065f46 50%, #0c831f 100%);
        color: white;
        padding: 1.25rem 1.75rem;
        border-radius: 16px;
        margin-bottom: 1.25rem;
        box-shadow: 0 4px 15px rgba(6, 78, 59, 0.15);
    }
    
    .side-card {
        background: #ffffff;
        border: 1.5px solid #0c831f;
        border-radius: 14px;
        padding: 1rem;
        box-shadow: 0 4px 12px rgba(12, 131, 31, 0.08);
        margin-bottom: 1.25rem;
    }
    
    .cart-card {
        background: #ffffff;
        border: 1px solid #e5e7eb;
        border-radius: 14px;
        padding: 1rem;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.04);
        margin-bottom: 1.25rem;
    }
    
    .product-card {
        background: white;
        padding: 0.85rem;
        border-radius: 12px;
        border: 1px solid #e5e7eb;
        margin-bottom: 0.75rem;
        box-shadow: 0 1px 3px rgba(0,0,0,0.03);
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
    
    .badge-match {
        background-color: #fef3c7;
        color: #92400e;
        font-size: 0.68rem;
        font-weight: 700;
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
if 'last_added_product' not in st.session_state:
    st.session_state.last_added_product = None

current_user = next((u for u in demo_users if u['user_id'] == st.session_state.selected_user_id), demo_users[0])

# Top Announcement
st.markdown('<div class="top-banner">⚡ freshcart-grocery-ai • FREE EXPRESS DELIVERY OVER ₹199 • 10 MINUTES DELIVERY</div>', unsafe_allow_html=True)

# SIDEBAR: Account Switcher & Info
with st.sidebar:
    st.markdown("## 🛒 **freshcart-grocery-ai**")
    st.caption("AI-Powered Quick Grocery • Instacart Market Basket")
    
    user_options = {
        u['user_id']: f"Customer #{u['user_id']} ({u['total_prior_orders']} orders)"
        for u in demo_users
    }
    chosen_uid = st.selectbox(
        "👤 Select Shopper Profile:",
        options=list(user_options.keys()),
        format_func=lambda uid: user_options[uid],
        index=0
    )
    if chosen_uid != st.session_state.selected_user_id:
        st.session_state.selected_user_id = chosen_uid
        st.rerun()

    st.info(f"""
    **Customer Account Details:**
    - Orders Placed: **{current_user['total_prior_orders']}**
    - Order Cadence: Every **~{current_user['avg_order_gap_days']} days**
    - Candidate Items: **{current_user['total_candidate_products']} items**
    """)
    st.divider()

# Main Interface Tabs
tab_shop, tab_analytics = st.tabs(["🛒 Grocery Store", "📊 Dataset & AI Performance"])

with tab_shop:
    # Header Banner
    st.markdown(f"""
    <div class="main-header">
        <h2 style="margin: 0; font-size: 1.85rem; font-weight: 900;">
            🛒 freshcart-grocery-ai
        </h2>
        <p style="margin: 0.35rem 0 0 0; font-size: 0.875rem; opacity: 0.95;">
            India's Smart E-Grocery • 10-Minute Delivery • Real-Time AI Recommendations in Indian Rupees (₹)
        </p>
    </div>
    """, unsafe_allow_html=True)

    # TWO-COLUMN SHOP LAYOUT:
    # col_store (left, catalog) and col_side (right, Recommendations + Cart cards ALWAYS visible)
    col_store, col_side = st.columns([2.6, 1.3], gap="large")

    with col_store:
        # Search & Department Filter
        col_s1, col_s2 = st.columns([1.8, 1.2])
        with col_s1:
            search_query = st.text_input("Search catalog items:", placeholder="Search 'banana', 'milk', 'bread', 'spinach', 'chips'...", label_visibility="collapsed")
        with col_s2:
            dept_list = ['All Categories'] + sorted(list({p['department'] for p in catalog if p.get('department')}))
            selected_dept = st.selectbox("Category:", dept_list, label_visibility="collapsed")

        filtered = catalog
        if selected_dept != 'All Categories':
            filtered = [p for p in filtered if p.get('department', '').lower() == selected_dept.lower()]
        if search_query:
            q = search_query.lower()
            filtered = [p for p in filtered if q in p['product_name'].lower() or q in p.get('aisle', '').lower()]

        st.caption(f"Showing {min(len(filtered), 24)} of {len(filtered)} items in store")

        # 3-column product grid inside store area
        p_cols = st.columns(3)
        for i, prod in enumerate(filtered[:24]):
            with p_cols[i % 3]:
                p_icon = dept_icons.get(prod.get('department', '').lower(), '🛒')
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
                btn_txt = f"In Basket ({st.session_state.cart[prod['product_id']]})" if p_in_cart else "+ ADD"
                if st.button(btn_txt, key=f"grid_add_{prod['product_id']}", use_container_width=True):
                    st.session_state.cart[prod['product_id']] = st.session_state.cart.get(prod['product_id'], 0) + 1
                    st.session_state.last_added_product = prod
                    st.rerun()

    # RIGHT SIDE PANEL: DYNAMIC AI RECOMMENDATIONS CARD + CART CARD (ALWAYS VISIBLE!)
    with col_side:
        
        # 1. DYNAMIC AI RECOMMENDATION CARD
        st.markdown("""
        <div style="background: linear-gradient(135deg, #0c831f 0%, #065f46 100%); color: white; padding: 0.65rem 0.85rem; border-radius: 12px 12px 0 0; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; gap: 0.4rem;">
            <span>✨ AI RECOMMENDATIONS</span>
        </div>
        """, unsafe_allow_html=True)
        
        # Build recommendations list
        rec_list = []
        rec_header_title = "Frequently Bought Together"
        trigger_name = ""

        if st.session_state.last_added_product:
            p_added = st.session_state.last_added_product
            trigger_name = p_added.get('product_name', '')[:20]
            rec_header_title = f"Pairs with {trigger_name}"
            
            # Affinities from co-occurrence
            p_affs = affinities.get(p_added.get('product_id', 0), [])
            for aff in p_affs[:3]:
                comp = catalog_map.get(aff['product_id'])
                if comp and comp['product_id'] not in st.session_state.cart:
                    rec_list.append((comp, int(aff['affinity'] * 100), "Frequent Pair"))

        # Supplement if fewer than 3
        if len(rec_list) < 3:
            for cand in current_user.get('candidates', []):
                cat_item = catalog_map.get(cand['product_id'])
                if cat_item and cat_item['product_id'] not in st.session_state.cart and not any(r[0]['product_id'] == cat_item['product_id'] for r in rec_list):
                    match_score = int(cand.get('pred_prob', 0.5) * 100)
                    rec_list.append((cat_item, match_score, "Top Habit"))
                    if len(rec_list) >= 3:
                        break

        # Fallback to catalog top items if needed
        if len(rec_list) < 3:
            for top_p in catalog[:6]:
                if top_p['product_id'] not in st.session_state.cart and not any(r[0]['product_id'] == top_p['product_id'] for r in rec_list):
                    rec_list.append((top_p, 85, "Trending"))
                    if len(rec_list) >= 3:
                        break

        st.markdown(f"""
        <div style="background: white; border: 1.5px solid #0c831f; border-top: none; border-radius: 0 0 12px 12px; padding: 0.85rem; margin-bottom: 1.25rem; box-shadow: 0 4px 10px rgba(12, 131, 31, 0.08);">
            <div style="font-size: 0.75rem; font-weight: 700; color: #0c831f; margin-bottom: 0.5rem;">
                {rec_header_title}
            </div>
        """, unsafe_allow_html=True)

        for comp_prod, match_pct, badge_text in rec_list[:3]:
            r_col1, r_col2 = st.columns([2.5, 1.2])
            with r_col1:
                st.write(f"**{comp_prod['product_name'][:20]}**")
                st.caption(f"₹{comp_prod.get('price', 49)} • {match_pct}% Match")
            with r_col2:
                if st.button("+ Add", key=f"side_rec_btn_{comp_prod['product_id']}", use_container_width=True):
                    st.session_state.cart[comp_prod['product_id']] = st.session_state.cart.get(comp_prod['product_id'], 0) + 1
                    st.session_state.last_added_product = comp_prod
                    st.rerun()

        st.markdown("</div>", unsafe_allow_html=True)

        # 2. SHOPPING CART CARD (ALWAYS VISIBLE RIGHT HERE ON THE SIDE!)
        st.markdown("""
        <div style="background: #111827; color: white; padding: 0.65rem 0.85rem; border-radius: 12px 12px 0 0; font-weight: 800; font-size: 0.85rem; display: flex; align-items: center; justify-content: space-between;">
            <span>🛒 ACTIVE BASKET</span>
        </div>
        """, unsafe_allow_html=True)
        
        cart_items = st.session_state.cart
        total_items = sum(cart_items.values())

        st.markdown('<div style="background: white; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 0.85rem; box-shadow: 0 2px 8px rgba(0,0,0,0.04);">', unsafe_allow_html=True)

        if not cart_items:
            st.write("Your basket is empty.")
            st.caption("Click **+ ADD** on any grocery product to begin ordering!")
        else:
            subtotal = 0.0
            for pid, qty in list(cart_items.items()):
                p = catalog_map.get(pid, {'product_name': f"Item #{pid}", 'price': 49})
                item_price = p.get('price', 49)
                item_total = item_price * qty
                subtotal += item_total
                
                c_col1, c_col2 = st.columns([2.8, 1])
                with c_col1:
                    st.write(f"**{p['product_name'][:18]}**")
                    st.caption(f"₹{item_price} × {qty} = ₹{item_total}")
                with c_col2:
                    if st.button("🗑️", key=f"cart_del_{pid}"):
                        del st.session_state.cart[pid]
                        st.rerun()

            st.divider()
            st.write(f"**Subtotal:** ₹{int(subtotal)}")
            st.write(f"**Delivery (10 mins):** FREE")
            st.write(f"**Govt. GST (5%):** ₹{int(subtotal * 0.05)}")
            st.markdown(f"### **Grand Total:** ₹{int(subtotal * 1.05)}")

            btn_clear, btn_pay = st.columns(2)
            with btn_clear:
                if st.button("Clear", use_container_width=True):
                    st.session_state.cart = {}
                    st.session_state.last_added_product = None
                    st.rerun()
            with btn_pay:
                if st.button("Pay ₹" + str(int(subtotal * 1.05)), type="primary", use_container_width=True):
                    st.balloons()
                    st.success(f"Order of ₹{int(subtotal * 1.05)} placed! Arriving in 10 minutes.")
                    st.session_state.cart = {}
                    st.session_state.last_added_product = None

        st.markdown('</div>', unsafe_allow_html=True)

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
