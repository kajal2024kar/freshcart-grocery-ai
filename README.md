# FreshCart — Online Grocery Shop & AI Next Basket Predictor

A complete full-stack web application combining an online grocery shopping experience with a machine learning model that predicts a customer's next basket, trained on the **real Instacart Market Basket dataset** (3.4M+ orders, 206K+ customers, 49K+ products).

No synthetic data was generated. All metrics and features are computed from the real dataset.

---

## Project Structure

```
college_project/
├── data/                             # Real Instacart dataset CSVs
│   ├── orders.csv
│   ├── order_products__prior.csv
│   ├── order_products__train.csv
│   ├── products.csv
│   ├── aisles.csv
│   └── departments.csv
├── model/                            # Machine learning model & artifacts
│   ├── train.py                      # User-product feature pipeline & LightGBM training
│   ├── lgbm_model.txt                # Serialized trained LightGBM model
│   ├── dataset_stats.json            # Real statistics, charts data & evaluation metrics
│   ├── sample_users.json             # 300 sample customers for demonstrations
│   └── sample_user_features.json     # Fast inference cache for sample users
├── api/                              # FastAPI backend
│   └── main.py                       # REST API & static file hosting
├── web/                              # Pure HTML, CSS & vanilla JavaScript frontend
│   ├── index.html                    # Storefront & AI prediction banner
│   ├── stats.html                    # Analytics & model evaluation dashboard
│   ├── style.css                     # Fresh market design system (greens, Nunito, responsive)
│   ├── app.js                        # Storefront logic, search, filters & customer switcher
│   ├── cart.js                       # Cart drawer, quantity controls & checkout
│   └── stats.js                      # Chart.js visualizations & metric highlights
├── requirements.txt                  # Python dependencies
└── README.md                         # Project documentation
```

---

## Quick Start Guide

### 1. Set Up Virtual Environment & Dependencies

From the project root:

```bash
# Windows
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt

# macOS / Linux
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
```

### 2. Train the Machine Learning Model

```bash
python -m model.train
```

What `train.py` does:
1. Validates all 6 Instacart CSV files in `./data/`.
2. Computes overall dataset statistics across all 3.42M orders (orders by weekday, orders by hour, overall reorder rate, top 10 products).
3. Engineers 12 user-product features from prior orders (purchase count, orders since last purchase, estimated days since last purchase, user-product reorder rate, average cart position, purchase frequency ratio, user total orders, average gap between orders, global product popularity, global product reorder rate, product total purchases, product average cart position).
4. Derives binary ground-truth labels from `order_products__train.csv` (1 = product reordered in next basket, 0 = omitted).
5. Splits train and validation **strictly by customer** using `GroupShuffleSplit` (80% train customers, 20% unseen validation customers).
6. Trains a LightGBM gradient boosted decision tree classifier with `binary_logloss`.
7. Evaluates and reports **Precision@10** and **Recall@10** on the unseen validation customers.
8. Exports `model/lgbm_model.txt`, `model/dataset_stats.json`, `model/sample_users.json`, and `model/sample_user_features.json`.

### 3. Launch the Application

```bash
uvicorn api.main:app --reload --port 8000
```

Open **[http://localhost:8000](http://localhost:8000)** in your web browser.

---

## API Endpoints

The FastAPI server (`./api/main.py`) serves both the REST API and the frontend from a single process:

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/users` | Returns 300 representative customer IDs with their lifetime order counts |
| `GET` | `/api/predict/{user_id}` | Top 10 predicted products for the customer, with probability, department, aisle, and explanation (e.g. *"Bought in 8 of 10 past orders"*) |
| `GET` | `/api/stats` | Dataset statistics (orders by weekday/hour, top 10 products, feature importances, model metrics) |
| `GET` | `/api/products` | Catalog listing supporting search (`?search=`), department filter (`?department=`), and pagination (`?page=&page_size=`) |
| `GET` | `/api/departments` | List of all 21 grocery departments |
| `GET` | `/` | Serves `web/index.html` (FreshCart shop page) |
| `GET` | `/stats.html` | Serves `web/stats.html` (Dataset & Model dashboard) |

---

## Evaluation Metrics

Evaluated on **2,000 unseen customers** (customers the model did not see during training):

- **Precision@10: 29.88%**
  - Out of the 10 items recommended in the customer's predicted next basket, on average ~3 items are exact hits that the customer purchased in their next order.
- **Recall@10: 58.15%**
  - The top 10 predicted items capture over 58% of all reordered products the customer ended up purchasing.
- **Validation Users:** 2,000 unseen customers (GroupShuffleSplit).
- **Features Used:** 12 engineered features.
- **LightGBM Boost Rounds:** 180 trees.

---

## Top Engineered Features (LightGBM Gain)

1. **User-Product Purchase Frequency Ratio (`up_purchase_ratio`)**: Fraction of user orders containing the product.
2. **Orders Since Last Purchase (`up_orders_since_last`)**: Recency penalty.
3. **Days Since Last Purchase (`up_days_since_last`)**: Elapsed time estimated from user reorder cycle.
4. **User-Product Purchase Count (`up_purchase_count`)**: Habitual purchasing strength.
5. **Product Reorder Rate (`prod_reorder_rate`)**: Global product stickiness.

---

## Honest Limitations

1. **Repeat Purchase Focus (No Cold-Start Discovery)**: The model ranks candidate items that the user has previously bought at least once in prior orders. It does not predict brand-new products the user has never encountered before.
2. **Price Information**: The original Instacart dataset does not include price data; therefore, the shop displays product names, departments, and aisles without dollar prices.
3. **Temporal Granularity**: The dataset provides day-of-week and hour-of-day for each order, but not calendar dates. Seasonal trends (e.g., Thanksgiving or summer groceries) cannot be captured.
4. **Sample User Scope**: While the dataset contains over 206,000 users, 300 active users are designated in `/api/users` for responsive browser switching and interactive demonstrations.
