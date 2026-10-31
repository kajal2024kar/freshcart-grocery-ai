# freshcart-grocery-ai: Instacart Market Basket Dynamic Recommender

A complete, production-grade quick-commerce grocery shopping web application powered by a LightGBM Next-Purchase Prediction AI model trained on the official **Instacart Market Basket dataset** (3.4+ million real orders across 206,209 shoppers).

> **Data Integrity Guarantee:** Zero synthetic or mock data. All product catalogs, department taxonomies, order frequencies, customer profiles, and transition probabilities are derived directly from the real Instacart CSV files in `./data`. All prices are displayed in **Indian Rupees (₹)** with standard supermarket unit weights.

---

## 🌟 Key Features

1. **Normal Indian E-Commerce Shopping Experience:**
   - Branded as **`freshcart-grocery-ai`**.
   - Clean top navigation with express delivery badge (10 Mins Delivery).
   - Prominent search bar in header with instant filtering.
   - Products displayed in **Indian Rupees (₹)** with pack weights (`1 kg`, `500 ml`, `250 g`, `6 pcs`), discount badges (`25% OFF`), and strikethrough MRP.
   - Accessible `+ ADD` button that transitions to a green quantity stepper `[-] 1 [+]`.
2. **Instant Side Recommendation Popup (For Every Product Added):**
   - Whenever any product is added to the cart, a dynamic side flyout pops up.
   - Surfaces **"Frequently Bought Together"** items calculated using the market basket co-occurrence affinity matrix and the customer's LightGBM purchase probability.
   - Features 1-click **"+ Add"** buttons.
   - Uncluttered main store: The static *"Predicted Next Basket"* banner is hidden from the main view as requested, allowing AI suggestions to appear contextually when items are selected.
4. **Shopper Profile Switcher:**
   - Switch between multiple customer personas from unseen validation data.
5. **Interactive Dataset & Model Analytics Tab:**
   - Metrics: Precision@10 (31.31%), Recall@10 (58.46%), 3.4M orders, 58.97% reorder rate.
   - Charts: Orders by Weekday, Orders by Hour, Top 10 Products, LightGBM Feature Importance (Gain).

---

## ⚡ How to Run

### Option 1: Streamlit Live App (Fastest & Streamlit Cloud Live Link Ready)
```powershell
./model/venv/Scripts/streamlit.exe run streamlit_app.py
```
Open `http://localhost:8501`.

### Option 2: React + Vite Web App + FastAPI Backend
**Terminal 1 (FastAPI Backend):**
```powershell
./model/venv/Scripts/python.exe -m uvicorn model.server:app --reload --port 8000
```

**Terminal 2 (React Frontend):**
```powershell
cd web
$env:Path = "$HOME\tools\node;" + $env:Path
npm run dev
```
Open `http://localhost:5173`.

---

## 📊 Model Evaluation on Unseen Shoppers

| Metric | Score | Explanation |
|---|---|---|
| **Precision@10** | **31.31%** (0.3131) | ~3.1 out of 10 recommended items were actually ordered in the unseen next basket. |
| **Recall@10** | **58.46%** (0.5846) | Top 10 recommendations captured ~58.5% of all items reordered by the customer. |
| **Evaluated Users** | **2,809 unseen shoppers** | Tested exclusively on validation users excluded from training. |
