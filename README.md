# FreshMarket AI: Instacart Market Basket Dynamic Recommender

A complete, production-grade grocery web store powered by an AI Next-Purchase Prediction model trained on the official **Instacart Market Basket dataset** (3.4+ million real orders across 206,209 shoppers).

> **Data Integrity Guarantee:** Zero synthetic or mock data. All product catalogs, department taxonomies, order frequencies, customer profiles, and transition probabilities are derived directly from the real Instacart CSV files in `./data`.

---

## 🏗️ Project Architecture

```
college_project/
├── data/                               # Official Instacart dataset
│   ├── aisles.csv                      # 134 aisles
│   ├── departments.csv                 # 21 departments
│   ├── orders.csv                      # 3,421,083 orders
│   ├── order_products__prior.csv       # 32,434,489 prior order items
│   ├── order_products__train.csv       # 1,384,617 train order items
│   └── products.csv                    # 49,688 products
├── model/                              # Machine Learning & API
│   ├── venv/                           # Python virtual environment
│   ├── requirements.txt                # ML & backend dependencies
│   ├── train.py                        # Feature engineering, User-split LightGBM training
│   ├── server.py                       # FastAPI backend server with /predict endpoint
│   ├── lgb_model.txt                   # Serialized LightGBM Booster model
│   ├── dataset_stats.json              # Real dataset aggregates & metrics
│   ├── products_catalog.json           # Catalog of products with department metadata
│   ├── demo_users.json                 # Unseen validation customer profiles
│   └── product_affinities.json         # Item-to-item cart synergy matrix
├── web/                                # Modern React + Vite Web Store
│   ├── src/
│   │   ├── App.jsx                     # Shop, Dynamic Predictions, Cart Drawer, Analytics
│   │   ├── main.jsx
│   │   └── index.css                   # Fresh-market green styling & focus accessibility
│   ├── package.json
│   └── vite.config.js
├── streamlit_app.py                    # Standalone Streamlit App for 1-Click Cloud Live Link
├── requirements.txt                    # Root requirements for Streamlit Community Cloud
└── README.md
```

---

## ⚡ Quick Start

### 1. Prerequisites
- Python 3.10+ (or Anaconda Python)
- Node.js 18+ (for React Vite frontend)

---

### 2. Machine Learning Model Training (Part 1)

1. Navigate to the project root and create/activate the Python virtual environment:
   ```bash
   # Windows PowerShell:
   python -m venv ./model/venv
   ./model/venv/Scripts/Activate.ps1
   pip install -r ./model/requirements.txt
   ```

2. Run the model training pipeline:
   ```bash
   python ./model/train.py
   ```
   This will:
   - Validate all 6 Instacart data files in `./data`.
   - Calculate dataset statistics (`orders`, `users`, `products`, `reorder_rate`, `orders_by_weekday`, `orders_by_hour`, `top_10_products`).
   - Engineer 8 user-product features:
     - `purchase_count`: Historical purchases of this item by the user.
     - `orders_since_last_purchase`: Recency in terms of order gaps.
     - `days_since_last_purchase`: Cumulative elapsed days since last purchase.
     - `reorder_rate`: User habit frequency for this item.
     - `avg_position_in_cart`: Average basket placement.
     - `user_avg_order_gap`: Shopper cadence (mean days between orders).
     - `product_popularity`: Overall product order volume.
     - `product_reorder_rate`: Global product reorder probability.
   - Perform a **strict User-Level Split** (80% train / 20% validation) to ensure **zero data leakage**.
   - Train a **LightGBM Binary Classifier** with early stopping.
   - Evaluate and print **Precision@10** and **Recall@10** across unseen test users.
   - Save model weights (`lgb_model.txt`), `dataset_stats.json`, catalog metadata, and co-occurrence affinities.

---

### 3. Running the FastAPI Backend & React Frontend

#### Option A: FastAPI Server + React Vite Frontend

1. **Start the FastAPI Backend:**
   ```bash
   # In terminal 1 (with activated virtualenv):
   python -m uvicorn model.server:app --reload --port 8000
   ```
   API Docs available at: `http://localhost:8000/docs`

2. **Start the React Frontend:**
   ```bash
   # In terminal 2:
   cd web
   npm install
   npm run dev
   ```
   Open `http://localhost:5173` in your browser.

---

### 4. Deploying to Streamlit Cloud (Live Link)

This repository includes a native, full-featured `streamlit_app.py` and root `requirements.txt` pre-configured for **Streamlit Community Cloud**:

1. **Run Locally:**
   ```bash
   streamlit run streamlit_app.py
   ```
   Open `http://localhost:8501`.

2. **Deploy to Streamlit Cloud:**
   - Push this repository to GitHub.
   - Go to [share.streamlit.io](https://share.streamlit.io).
   - Click **"New App"** and select your repository.
   - Set **Main file path** to `streamlit_app.py`.
   - Click **"Deploy"**. The app will automatically install dependencies from root `requirements.txt` and launch with a live public link.

---

## 🎯 Model Results on Unseen Shoppers

| Metric | Score | Explanation |
|---|---|---|
| **Precision@10** | **31.31%** (0.3131) | On average, ~3.1 out of 10 recommended items are actually in the unseen test basket. |
| **Recall@10** | **58.46%** (0.5846) | The Top 10 recommendations capture ~58.5% of all items the customer reordered. |
| **Evaluated Users** | **2,809 unseen shoppers** | Evaluated strictly on users excluded from training. |
| **Train Pair Count** | **777,824 pairs** | 12,000 distinct train users. |
| **Val Pair Count** | **191,613 pairs** | 3,000 distinct validation users. |

### Feature Importance (Gain)
1. `orders_since_last_purchase` (247,197.56) — Recency gap is the #1 predictor of whether an item is due for replenishment.
2. `reorder_rate` (212,952.02) — High personal habit strongly differentiates staple purchases from one-offs.
3. `purchase_count` (82,018.89) — Lifetime volume strengthens habitual confidence.
4. `days_since_last_purchase` (47,094.45) — Physical time elapsed since the shopper had this item.
5. `product_reorder_rate` (37,464.20) — Global stickiness of the item across all consumers.
6. `product_popularity` (11,320.81) — Baseline market frequency.
7. `user_avg_order_gap` (8,908.98) — Distinguishes weekly shoppers from monthly shoppers.
8. `avg_position_in_cart` (4,232.46) — Priority items are added earlier into the cart.

---

## 🔍 Dynamic Cart Re-scoring Algorithm

When a shopper adds an item into their cart:
1. The system accesses the pre-computed **Item-to-Item Co-occurrence Affinity Matrix** calculated from past market baskets.
2. If the user adds e.g. *Organic Bananas*, complementary candidates (e.g. *Organic Strawberries*, *Avocados*, *Milk*) receive a synergy multiplier:
   $$\text{Dynamic Prob}(p) = \min\left(0.99, P_{\text{LGBM}}(p) \times (1 + 1.5 \times \text{Affinity}(\text{Cart}, p))\right)$$
3. Candidates are dynamically re-ranked in real time with explanatory chips (e.g. `+34% synergy with Bananas in cart`).

---

## ⚠️ Honest Limitations & Discussion

1. **Cold-Start Problem for Brand New Users:**
   Because the feature set relies on user-product interaction history, an entirely new user with 0 past orders cannot be scored with personal features. In production, cold-start users are served by global popularity and department-level priors until their first 2 baskets are logged.
2. **Candidate Selection Scope:**
   The primary candidate set consists of products the user has ordered before (reorders). While ~60% of all grocery purchases in Instacart are reorders, discovering completely new products requires a secondary exploration model (collaborative filtering or vector embedding search).
3. **Product Price Approximations:**
   The original Instacart dataset contains order metadata but does not include dollar prices. Display prices are realistically mapped by department for shopping cart totals.
