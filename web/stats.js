/**
 * stats.js — FreshCart Dataset & Model Analytics with Chart.js
 * Visualizes orders by weekday, hour of day, top products, and LightGBM feature importance.
 */

const PALETTE = {
  primary: '#16a34a',
  primaryDark: '#15803d',
  primaryLight: '#86efac',
  accent: '#22c55e',
  bars: [
    '#15803d', '#16a34a', '#22c55e', '#4ade80', '#86efac',
    '#34d399', '#10b981', '#059669', '#047857', '#065f46'
  ],
};

function formatBigNumber(num) {
  if (num >= 1_000_000) {
    return (num / 1_000_000).toFixed(2) + 'M';
  }
  if (num >= 1_000) {
    return (num / 1_000).toFixed(1) + 'K';
  }
  return num.toLocaleString();
}

async function loadDatasetStats() {
  const loading = document.getElementById('statsLoading');
  const errorEl = document.getElementById('statsError');
  const cardsEl = document.getElementById('statsCards');
  const metricsEl = document.getElementById('metricsCard');
  const chartsEl = document.getElementById('chartGrid');

  try {
    const resp = await fetch('/api/stats');
    if (!resp.ok) {
      throw new Error(`Failed to load stats (${resp.status}): ${await resp.text()}`);
    }
    const data = await resp.json();

    // Hide loader
    if (loading) loading.style.display = 'none';

    // 1. Populate big summary cards
    if (cardsEl) {
      cardsEl.style.display = 'grid';
      document.getElementById('statOrders').textContent = formatBigNumber(data.total_orders);
      document.getElementById('statUsers').textContent = formatBigNumber(data.total_users);
      document.getElementById('statProducts').textContent = formatBigNumber(data.total_products);
      document.getElementById('statReorderRate').textContent = `${(data.overall_reorder_rate * 100).toFixed(1)}%`;
    }

    // 2. Populate Model Metrics
    if (metricsEl && data.metrics) {
      metricsEl.style.display = 'block';
      const m = data.metrics;
      const metricsRow = document.getElementById('metricsRow');

      metricsRow.innerHTML = `
        <div class="metric-box highlight">
          <div class="metric-val">${(m.precision_at_10 * 100).toFixed(2)}%</div>
          <div class="metric-label">Precision@10 (Unseen Users)</div>
        </div>
        <div class="metric-box highlight">
          <div class="metric-val">${(m.recall_at_10 * 100).toFixed(2)}%</div>
          <div class="metric-label">Recall@10 (Unseen Users)</div>
        </div>
        <div class="metric-box">
          <div class="metric-val">${m.num_val_users.toLocaleString()}</div>
          <div class="metric-label">Unseen Validation Users</div>
        </div>
        <div class="metric-box">
          <div class="metric-val">${m.num_features}</div>
          <div class="metric-label">Engineered Features</div>
        </div>
        <div class="metric-box">
          <div class="metric-val">${m.num_boost_rounds}</div>
          <div class="metric-label">LightGBM Boost Rounds</div>
        </div>
      `;
    }

    // 3. Render Chart.js Visualizations
    if (chartsEl) {
      chartsEl.style.display = 'grid';
      renderWeekdayChart(data.orders_by_weekday);
      renderHourChart(data.orders_by_hour);
      renderTopProductsChart(data.top_10_products);
      renderFeatureImportanceChart(data.feature_importance);
    }
  } catch (err) {
    if (loading) loading.style.display = 'none';
    if (errorEl) {
      errorEl.style.display = 'block';
      errorEl.textContent = `Error loading dataset statistics: ${err.message}`;
    }
    console.error('Stats loading failed:', err);
  }
}

/* ======================================================================
   Chart 1: Orders by Weekday
   ====================================================================== */
function renderWeekdayChart(dowData) {
  const ctx = document.getElementById('chartDow');
  if (!ctx || !dowData) return;

  const labels = Object.keys(dowData);
  const values = Object.values(dowData);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Orders',
        data: values,
        backgroundColor: labels.map((_, i) => i === 0 || i === 1 ? '#15803d' : '#4ade80'),
        borderRadius: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Orders: ${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => `${(v / 1000).toFixed(0)}K`,
          },
          grid: { color: '#f1f5f9' },
        },
        x: {
          grid: { display: false },
        },
      },
    },
  });
}

/* ======================================================================
   Chart 2: Orders by Hour of Day
   ====================================================================== */
function renderHourChart(hourData) {
  const ctx = document.getElementById('chartHour');
  if (!ctx || !hourData) return;

  const hours = Object.keys(hourData);
  const values = Object.values(hourData);
  const labels = hours.map(h => {
    const num = parseInt(h, 10);
    if (num === 0) return '12 AM';
    if (num === 12) return '12 PM';
    return num > 12 ? `${num - 12} PM` : `${num} AM`;
  });

  new Chart(ctx, {
    type: 'line',
    data: {
      labels: labels,
      datasets: [{
        label: 'Orders',
        data: values,
        borderColor: '#16a34a',
        backgroundColor: 'rgba(74, 222, 128, 0.15)',
        borderWidth: 3,
        fill: true,
        tension: 0.35,
        pointBackgroundColor: '#15803d',
        pointRadius: 3,
        pointHoverRadius: 6,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Orders: ${ctx.parsed.y.toLocaleString()}`,
          },
        },
      },
      scales: {
        y: {
          beginAtZero: true,
          ticks: {
            callback: (v) => `${(v / 1000).toFixed(0)}K`,
          },
          grid: { color: '#f1f5f9' },
        },
        x: {
          grid: { display: false },
          ticks: {
            maxTicksLimit: 12,
          },
        },
      },
    },
  });
}

/* ======================================================================
   Chart 3: Top 10 Products (Horizontal Bar Chart)
   ====================================================================== */
function renderTopProductsChart(productsList) {
  const ctx = document.getElementById('chartTopProducts');
  if (!ctx || !productsList) return;

  // Clone and reverse so #1 is at top
  const sorted = [...productsList].reverse();
  const labels = sorted.map(p => p.product_name);
  const counts = sorted.map(p => p.order_count);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Total Orders',
        data: counts,
        backgroundColor: PALETTE.bars,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` Total Purchases: ${ctx.parsed.x.toLocaleString()} orders`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          ticks: {
            callback: (v) => `${(v / 1000).toFixed(0)}K`,
          },
          grid: { color: '#f1f5f9' },
        },
        y: {
          grid: { display: false },
        },
      },
    },
  });
}

/* ======================================================================
   Chart 4: Feature Importance (Horizontal Bar Chart)
   ====================================================================== */
function renderFeatureImportanceChart(featData) {
  const ctx = document.getElementById('chartFeatures');
  if (!ctx || !featData) return;

  // Friendly human labels for the engineered features
  const featureLabels = {
    'up_purchase_ratio': 'User-Product Purchase Frequency Ratio',
    'up_orders_since_last': 'Orders Since User Last Bought Product',
    'up_days_since_last': 'Estimated Days Since Last Purchase',
    'up_purchase_count': 'Total Times User Bought Product',
    'up_reorder_rate': 'User Reorder Rate for Product',
    'prod_reorder_rate': 'Global Product Reorder Rate',
    'prod_popularity': 'Global Product Popularity',
    'user_avg_gap': 'Customer Average Days Between Orders',
    'user_total_orders': 'Customer Total Lifetime Orders',
    'prod_avg_cart_pos': 'Global Product Average Cart Position',
    'up_avg_cart_pos': 'User Average Cart Position for Product',
    'prod_total_purchases': 'Global Product Lifetime Purchases',
  };

  const sortedPairs = Object.entries(featData).sort((a, b) => a[1] - b[1]);
  const labels = sortedPairs.map(p => featureLabels[p[0]] || p[0]);
  const values = sortedPairs.map(p => p[1]);

  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Gain Importance',
        data: values,
        backgroundColor: '#22c55e',
        hoverBackgroundColor: '#15803d',
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) => ` LightGBM Gain: ${ctx.parsed.x.toLocaleString()}`,
          },
        },
      },
      scales: {
        x: {
          beginAtZero: true,
          grid: { color: '#f1f5f9' },
        },
        y: {
          grid: { display: false },
        },
      },
    },
  });
}

// Auto-run on page load
document.addEventListener('DOMContentLoaded', loadDatasetStats);
