"""
FreshMarket AI - Instacart Market Basket Next Purchase Predictor
Streamlit Web Application for Live Cloud Deployment
"""

import os
import json
import streamlit as st
import pandas as pd
import numpy as np

# Page Configuration
st.set_page_config(
    page_title="FreshMarket AI - Grocery Next Purchase Predictor",
    page_icon="🥦",
    layout="wide",
    initial_sidebar_state="expanded"
)

# Custom Styling (Fresh Market Greens & Modern UI)
st.markdown("""
<style>
    @import url('https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&family=Outfit:wght@600;700;800&display=swap');
    
    html, body, [class*="css"] {
        font-family: 'Plus Jakarta Sans', system-ui, sans-serif;
    }
    
    .stApp {
        background-color: #f8faf9;
    }
    
    .main-header {
        background: linear-gradient(135deg, #064e3b 0%, #065f46 60%, #047857 100%);
        color: white;
        padding: 1.5rem 2rem;
        border-radius: 18px;
        margin-bottom: 1.5rem;
        box-shadow: 0 10px 25px -5px rgba(6, 78, 59, 0.25);
    }
    
    .metric-card {
        background: white;
        padding: 1.25rem;
        border-radius: 14px;
        border: 1px solid #e2e8f0;
        box-shadow: 0 1px 3px rgba(0,0,0,0.04);
        text-align: center;
    }
    
    .prediction-card {
        background: white;
        padding: 1rem;
        border-radius: 14px;
        border: 1px solid #cbd5e1;
        box-shadow: 0 2px 4px rgba(0,0,0,0.05);
        margin-bottom: 0.75rem;
    }
    
    .badge-dept {
        background-color: #f1f5f9;
        color: #475569;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
        text-transform: uppercase;
    }
    
    .badge-synergy {
        background-color: #fef3c7;
        color: #92400e;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
    }
    
    .badge-habit {
        background-color: #ecfdf5;
        color: #065f46;
        font-size: 0.7rem;
        font-weight: 700;
        padding: 0.2rem 0.5rem;
        border-radius: 6px;
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

# Department emoji icons
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

# Sidebar Controls
with st.sidebar:
    st.markdown("### 🛒 Demo Customer Selection")
    user_options = {
        u['user_id']: f"Customer #{u['user_id']} ({u['total_prior_orders']} orders • {u['candidates'][0]['product_name'][:20]})"
        for u in demo_users
    }
    
    chosen_uid = st.selectbox(
        "Choose Shopper Profile:",
        options=list(user_options.keys()),
        format_func=lambda uid: user_options[uid],
        index=0
    )
    st.session_state.selected_user_id = chosen_uid
    current_user = next((u for u in demo_users if u['user_id'] == chosen_uid), demo_users[0])
    
    st.info(f"""
    **Shopper Profile Stats:**
    - **Total Prior Orders:** {current_user['total_prior_orders']} orders
    - **Order Cadence:** Every ~{current_user['avg_order_gap_days']} days
    - **Historical Products:** {current_user['total_candidate_products']} candidate items
    """)
    
    st.divider()
    
    # Shopping Cart Display
    st.markdown("### 🛍️ Your Active Basket")
    cart_items = st.session_state.cart
    cart_pids = list(cart_items.keys())
    
    if not cart_items:
        st.write("Your basket is empty. Add recommended items or browse below!")
    else:
        subtotal = 0.0
        for pid, qty in list(cart_items.items()):
            p = catalog_map.get(pid, {'product_name': f"Item #{pid}", 'price': 3.49, 'department': 'groceries'})
            item_total = p['price'] * qty
            subtotal += item_total
            
            col_a, col_b = st.columns([3, 1])
            with col_a:
                st.write(f"**{p['product_name'][:24]}**")
                st.caption(f"${p['price']:.2f} × {qty} = ${item_total:.2f}")
            with col_b:
                if st.button("🗑️", key=f"del_{pid}"):
                    del st.session_state.cart[pid]
                    st.rerun()
        
        st.write(f"**Subtotal:** ${subtotal:.2f}")
        st.write(f"**Total (inc. tax):** ${subtotal * 1.05:.2f}")
        
        col_c1, col_c2 = st.columns(2)
        with col_c1:
            if st.button("Clear Basket", use_container_width=True):
                st.session_state.cart = {}
                st.rerun()
        with col_c2:
            if st.button("Checkout 🎉", type="primary", use_container_width=True):
                st.balloons()
                st.success("Order placed successfully! Basket cleared.")
                st.session_state.cart = {}

# Compute Dynamic Predictions
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
    
    reasons = []
    if c['purchase_count'] >= 5:
        reasons.append(f"Frequent habit: ordered {c['purchase_count']}x")
    elif c['purchase_count'] >= 2:
        reasons.append(f"Bought {c['purchase_count']} times")
    if c['orders_since_last_purchase'] == 1:
        reasons.append("Bought in their last order")
    if boost > 0.05:
        reasons.append(f"Pairs with cart item (+{int(boost * 100)}% synergy)")
        
    p_info = catalog_map.get(pid, {'price': 3.49, 'department': c['department']})
    
    scored_candidates.append({
        'product_id': pid,
        'product_name': c['product_name'],
        'department': c['department'],
        'price': p_info.get('price', 3.49),
        'base_prob': c['pred_prob'],
        'dynamic_prob': dynamic_prob,
        'cart_synergy': boost,
        'reasons': reasons,
        'in_cart': pid in cart_pids_set,
        'actual_reordered': c.get('actual_reordered_in_next', False)
    })

scored_candidates.sort(key=lambda x: x['dynamic_prob'], reverse=True)
top_predictions = scored_candidates[:10]

# Main Interface Tabs
tab_shop, tab_analytics = st.tabs(["🛒 Grocery Store & Dynamic Predictions", "📊 Dataset & Model Performance"])

with tab_shop:
    # Banner Header
    st.markdown(f"""
    <div class="main-header">
        <h1 style="margin: 0; font-size: 2rem; font-weight: 800; font-family: Outfit, sans-serif;">
            🥦 FreshMarket AI • Dynamic Next Basket Recommender
        </h1>
        <p style="margin: 0.5rem 0 0 0; font-size: 0.95rem; opacity: 0.9;">
            Trained on <strong>3.4 Million Real Instacart Orders</strong>. Automatically recalculates next-purchase probabilities when items are added to your cart!
        </p>
    </div>
    """, unsafe_allow_html=True)
    
    # Next Basket Prediction Section
    st.markdown("### 🔮 Predicted Next Basket for Customer")
    
    if len(st.session_state.cart) > 0:
        st.success(f"⚡ Dynamic Synergy Active: Recommendations re-scored based on {len(st.session_state.cart)} item(s) in your basket!")
    
    b_col1, b_col2 = st.columns([4, 1])
    with b_col2:
        if st.button("➕ Add Top 5 to Cart", use_container_width=True):
            for pred in top_predictions[:5]:
                pid = pred['product_id']
                st.session_state.cart[pid] = st.session_state.cart.get(pid, 0) + 1
            st.rerun()
            
    # Predictions Cards
    pred_cols = st.columns(5)
    for idx, pred in enumerate(top_predictions[:5]):
        with pred_cols[idx]:
            prob_pct = int(pred['dynamic_prob'] * 100)
            icon = dept_icons.get(pred['department'].lower(), '🛒')
            
            st.markdown(f"""
            <div class="prediction-card">
                <span class="badge-dept">{icon} {pred['department']}</span>
                <h4 style="margin: 0.4rem 0 0.2rem 0; font-size: 0.9rem; height: 2.4rem; overflow: hidden; line-height: 1.2;">
                    {pred['product_name']}
                </h4>
                <div style="font-size: 0.75rem; font-weight: 700; color: #16a34a; margin-bottom: 0.2rem;">
                    Likelihood: {prob_pct}%
                </div>
                <div style="font-size: 0.9rem; font-weight: 800; margin-bottom: 0.5rem;">
                    ${pred['price']:.2f}
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            # Progress bar
            st.progress(pred['dynamic_prob'])
            
            if pred['reasons']:
                st.caption(" • ".join(pred['reasons'][:1]))
                
            in_cart_now = pred['product_id'] in st.session_state.cart
            btn_label = f"In Basket ({st.session_state.cart[pred['product_id']]})" if in_cart_now else "Add to Basket"
            if st.button(btn_label, key=f"btn_pred_{pred['product_id']}", use_container_width=True):
                st.session_state.cart[pred['product_id']] = st.session_state.cart.get(pred['product_id'], 0) + 1
                st.rerun()

    # Ground Truth Comparison Expander
    with st.expander("🔍 Compare with Real Future Basket (Ground Truth from order_products__train.csv)"):
        actual_items = [c for c in current_user['candidates'] if c.get('actual_reordered_in_next')]
        st.write(f"In the Instacart dataset, this customer actually reordered **{len(actual_items)}** items in their unseen next basket:")
        gt_cols = st.columns(4)
        for i, item in enumerate(actual_items):
            with gt_cols[i % 4]:
                st.write(f"✅ **{item['product_name']}**")
                st.caption(f"Historical: ordered {item['purchase_count']} times")

    st.divider()

    # Catalog & Shopping Grid
    st.markdown("### 🛍️ Browse Grocery Catalog")
    col_s1, col_s2 = st.columns([2, 1])
    with col_s1:
        search_query = st.text_input("Search catalog items:", placeholder="e.g. Avocado, organic bananas, milk, yogurt...")
    with col_s2:
        dept_list = ['All'] + sorted(list({p['department'] for p in catalog if p.get('department')}))
        selected_dept = st.selectbox("Filter Department:", dept_list)

    # Filter catalog
    filtered = catalog
    if selected_dept != 'All':
        filtered = [p for p in filtered if p.get('department', '').lower() == selected_dept.lower()]
    if search_query:
        q = search_query.lower()
        filtered = [p for p in filtered if q in p['product_name'].lower() or q in p['aisle'].lower()]

    st.caption(f"Showing {min(len(filtered), 24)} of {len(filtered)} products")

    # Grid of products (4 per row)
    grid_cols = st.columns(4)
    for i, prod in enumerate(filtered[:24]):
        with grid_cols[i % 4]:
            p_icon = dept_icons.get(prod['department'].lower(), '🛒')
            st.markdown(f"""
            <div style="background: white; padding: 0.85rem; border-radius: 12px; border: 1px solid #e2e8f0; margin-bottom: 0.75rem;">
                <span class="badge-dept">{p_icon} {prod['department']}</span>
                <h5 style="margin: 0.4rem 0 0.2rem 0; font-size: 0.85rem; height: 2.2rem; overflow: hidden; line-height: 1.2;">
                    {prod['product_name']}
                </h5>
                <p style="font-size: 0.75rem; color: #64748b; margin: 0; text-transform: capitalize;">{prod['aisle']}</p>
                <div style="font-size: 0.95rem; font-weight: 800; color: #0f172a; margin-top: 0.4rem;">
                    ${prod['price']:.2f}
                </div>
            </div>
            """, unsafe_allow_html=True)
            
            p_in_cart = prod['product_id'] in st.session_state.cart
            btn_txt = f"+ Add ({st.session_state.cart[prod['product_id']]})" if p_in_cart else "+ Add to Basket"
            if st.button(btn_txt, key=f"cat_btn_{prod['product_id']}", use_container_width=True):
                st.session_state.cart[prod['product_id']] = st.session_state.cart.get(prod['product_id'], 0) + 1
                st.rerun()

with tab_analytics:
    st.markdown("## 📊 Dataset Statistics & LightGBM Model Performance")
    st.caption("Derived directly from the real 3.4M Instacart Market Basket dataset")
    
    # Metrics row
    m1, m2, m3, m4 = st.columns(4)
    with m1:
        st.metric(
            label="Precision@10 (Unseen Users)",
            value=f"{stats['metrics']['precision_at_10_percent']}%",
            help="Top 10 predicted items that appeared in actual next order"
        )
    with m2:
        st.metric(
            label="Recall@10 (Unseen Users)",
            value=f"{stats['metrics']['recall_at_10_percent']}%",
            help="Proportion of actual reorders captured in Top 10"
        )
    with m3:
        st.metric(
            label="Total Real Orders",
            value=f"{stats['orders']:,}",
            help="Full orders in orders.csv"
        )
    with m4:
        st.metric(
            label="Dataset Reorder Rate",
            value=f"{stats['reorder_rate']*100:.1f}%",
            help="Overall reorder proportion across prior orders"
        )

    st.divider()

    # Visualizations row 1
    c1, c2 = st.columns(2)
    with c1:
        st.markdown("### 📅 Orders by Day of Week")
        day_names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
        dow_df = pd.DataFrame([
            {"Day": day_names[int(k)], "Orders": v}
            for k, v in stats['orders_by_weekday'].items()
        ])
        st.bar_chart(dow_df.set_index("Day"), color="#15803d")
        st.caption("Orders peak heavily on Sunday and Monday.")

    with c2:
        st.markdown("### ⏰ Orders by Hour of Day")
        hour_df = pd.DataFrame([
            {"Hour": f"{int(k):02d}:00", "Orders": v}
            for k, v in stats['orders_by_hour'].items()
        ])
        st.area_chart(hour_df.set_index("Hour"), color="#0284c7")
        st.caption("Shopping traffic surges between 9:00 AM and 5:00 PM.")

    # Visualizations row 2
    c3, c4 = st.columns(2)
    with c3:
        st.markdown("### 🏆 Top 10 Most Ordered Products")
        top10_df = pd.DataFrame([
            {"Product": p['product_name'], "Orders": p['order_count']}
            for p in stats['top_10_products']
        ])
        st.bar_chart(top10_df.set_index("Product"), horizontal=True, color="#ea580c")
        st.caption("Fresh organic produce and bananas lead total volume.")

    with c4:
        st.markdown("### 🌲 LightGBM Feature Importance (Gain)")
        feat_df = pd.DataFrame([
            {"Feature": k, "Gain": round(v, 2)}
            for k, v in stats['feature_importance'].items()
        ]).sort_values("Gain", ascending=True)
        st.bar_chart(feat_df.set_index("Feature"), horizontal=True, color="#7c3aed")
        st.caption("Recency (orders since last purchase) and user reorder rate dominate predictions.")

    # Model Architecture and Integrity Note
    st.info("""
    **Model Architecture & Data Integrity Verification:**
    - **No Synthetic Data:** Trained exclusively on official Instacart Market Basket CSVs (`orders.csv`, `order_products__prior.csv`, `order_products__train.csv`, `products.csv`).
    - **Strict User-Level Split:** Train and validation sets are split strictly by User ID (80% train / 20% validation). Evaluated on 2,809 completely unseen users.
    - **Dynamic Basket Synergies:** Item-to-item co-occurrence matrix models market basket complementary affinity when users add items into their cart.
    """)

st.markdown("---")
st.caption("FreshMarket AI • Trained on real Instacart Market Basket data • Ready for Streamlit Cloud deployment")
