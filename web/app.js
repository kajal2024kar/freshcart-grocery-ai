/**
 * app.js — FreshCart Shop Page Logic
 * Manages customer switching, AI predictions banner, category-divided search,
 * department filtering, view mode toggling, catalog grid, and side prediction flyout popup.
 */

const AppState = {
  selectedUser: null,
  currentDept: '',
  searchQuery: '',
  currentPage: 1,
  pageSize: 40,
  totalPages: 1,
  currentPredictions: [],
  viewMode: 'categories', // 'categories' (Divided by Category) or 'grid'
  departmentsList: [],
  isPredictionBannerVisible: false,
};

// Department visual iconography
const DEPT_ICONS = {
  'produce': '🥬',
  'dairy eggs': '🥛',
  'snacks': '🥨',
  'beverages': '🧃',
  'frozen': '🧊',
  'pantry': '🥫',
  'bakery': '🍞',
  'canned goods': '🥫',
  'deli': '🥪',
  'dry goods pasta': '🍝',
  'household': '🧼',
  'breakfast': '🥣',
  'meat seafood': '🥩',
  'personal care': '🧴',
  'babies': '🍼',
  'international': '🍜',
  'pets': '🐾',
  'alcohol': '🍷',
  'bulk': '🌾',
  'other': '📦',
  'missing': '❓',
};

function getDeptIcon(dept) {
  if (!dept) return '🛒';
  return DEPT_ICONS[dept.toLowerCase()] || '🛒';
}

/* ======================================================================
   API Fetch Helpers
   ====================================================================== */
async function apiGet(endpoint) {
  const resp = await fetch(endpoint);
  if (!resp.ok) {
    let errMsg = `Request failed (${resp.status})`;
    try {
      const data = await resp.json();
      if (data.detail) errMsg = data.detail;
    } catch (_) {}
    throw new Error(errMsg);
  }
  return resp.json();
}

/* ======================================================================
   1. Customer Dropdown & User Selection
   ====================================================================== */
async function loadCustomerList() {
  const select = document.getElementById('userSelect');
  try {
    const users = await apiGet('/api/users');
    if (!users || users.length === 0) {
      select.innerHTML = '<option value="">No sample customers found</option>';
      return;
    }

    select.innerHTML = '<option value="">-- Choose Customer --</option>' +
      users.map(u => `
        <option value="${u.user_id}">
          Customer #${u.user_id} (${u.order_count} past orders)
        </option>
      `).join('');

    // Pre-select the first customer to immediately showcase the AI prediction banner!
    if (users.length > 0) {
      select.value = users[0].user_id;
      handleCustomerChange(users[0].user_id);
    }
  } catch (err) {
    select.innerHTML = '<option value="">Error loading customers</option>';
    console.error('Failed to load sample users:', err);
  }
}

function handleCustomerChange(userId) {
  AppState.selectedUser = userId;
  const subtitle = document.getElementById('predSubtitle');
  const addAllBtn = document.getElementById('addAllBtn');
  const sideSub = document.getElementById('sidePredSubtitle');
  const predToggleSub = document.getElementById('predToggleSubtitle');

  if (!userId) {
    AppState.currentPredictions = [];
    if (subtitle) subtitle.textContent = 'AI-powered recommendations based on your purchase history';
    if (sideSub) sideSub.textContent = 'AI predictions for this basket';
    if (predToggleSub) predToggleSub.textContent = 'Select a customer to view personalized predictions';
    if (addAllBtn) addAllBtn.disabled = true;
    document.getElementById('predictionContent').innerHTML = `
      <div class="placeholder-state">
        <span style="font-size: 2rem">👤</span>
        <p>Please select a customer above to view their personalized AI predictions.</p>
      </div>
    `;
    return;
  }

  if (subtitle) {
    subtitle.textContent = `Tailored next-basket predictions for Customer #${userId}`;
  }
  if (sideSub) {
    sideSub.textContent = `Tailored predictions for Customer #${userId}`;
  }
  if (predToggleSub) {
    predToggleSub.textContent = `Personalized next-basket recommendations ready for Customer #${userId}`;
  }
  loadNextBasketPredictions(userId);
}

/* Toggle Prediction Banner visibility (option to see) */
function togglePredictionBanner(forceState, scrollIntoView = false) {
  const banner = document.getElementById('predictionBanner');
  const toggleBtn = document.getElementById('togglePredBannerBtn');
  const toggleText = document.getElementById('predToggleBtnText');
  const headerBtn = document.getElementById('headerPredBtn');

  if (!banner) return;

  const nextState = (typeof forceState === 'boolean') ? forceState : !AppState.isPredictionBannerVisible;
  AppState.isPredictionBannerVisible = nextState;

  if (nextState) {
    banner.style.display = 'block';
    if (toggleBtn) {
      toggleBtn.classList.add('active');
      toggleBtn.setAttribute('aria-expanded', 'true');
    }
    if (toggleText) toggleText.textContent = 'Hide Predicted Basket';
    if (headerBtn) headerBtn.classList.add('active');

    if (scrollIntoView) {
      banner.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  } else {
    banner.style.display = 'none';
    if (toggleBtn) {
      toggleBtn.classList.remove('active');
      toggleBtn.setAttribute('aria-expanded', 'false');
    }
    if (toggleText) toggleText.textContent = 'View Predicted Basket';
    if (headerBtn) headerBtn.classList.remove('active');
  }
}

/* ======================================================================
   2. AI Next Basket Predictions Banner
   ====================================================================== */
async function loadNextBasketPredictions(userId) {
  const container = document.getElementById('predictionContent');
  const addAllBtn = document.getElementById('addAllBtn');
  const availPill = document.getElementById('predAvailPill');
  const headerBadge = document.getElementById('headerPredBadge');

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Running LightGBM inference on Customer #${userId}'s purchase history...</p>
    </div>
  `;
  if (addAllBtn) addAllBtn.disabled = true;

  try {
    const data = await apiGet(`/api/predict/${userId}`);
    const items = data.predictions || [];
    AppState.currentPredictions = items;

    if (availPill) availPill.textContent = `${items.length} items ready`;
    if (headerBadge) {
      headerBadge.textContent = items.length;
      headerBadge.style.display = items.length > 0 ? 'inline-block' : 'none';
    }

    if (items.length === 0) {
      container.innerHTML = `
        <div class="placeholder-state">
          <p>No prior purchase history found to generate predictions for Customer #${userId}.</p>
        </div>
      `;
      return;
    }

    if (addAllBtn) addAllBtn.disabled = false;

    container.innerHTML = `
      <div class="prediction-grid">
        ${items.map(p => {
          const pct = Math.round(p.probability * 1000) / 10;
          return `
            <div class="pred-card">
              <div class="pred-card-top">
                <div class="pred-name" title="${escapeHtml(p.product_name)}">
                  ${getDeptIcon(p.department)} ${escapeHtml(p.product_name)}
                </div>
                <div class="pred-meta">${escapeHtml(p.department)} &bull; ${escapeHtml(p.aisle)}</div>
                <div class="pred-reason">${escapeHtml(p.reason)}</div>
              </div>

              <div class="prob-section">
                <div class="prob-header">
                  <span>Reorder Probability</span>
                  <span>${pct}%</span>
                </div>
                <div class="prob-track" title="${pct}% likelihood of reorder">
                  <div class="prob-fill" style="width: ${Math.min(100, Math.max(8, pct))}%"></div>
                </div>
              </div>

              <button class="pred-add-btn" onclick="addSingleProduct(${p.product_id}, '${escapeHtml(p.product_name).replace(/'/g, "\\'")}', '${escapeHtml(p.department)}', '${escapeHtml(p.aisle)}')">
                + Add to Basket
              </button>
            </div>
          `;
        }).join('')}
      </div>
    `;
  } catch (err) {
    container.innerHTML = `
      <div class="error-banner">
        ⚠️ Failed to load predictions: ${escapeHtml(err.message)}
      </div>
    `;
    console.error('Prediction API error:', err);
  }
}

function addSingleProduct(id, name, dept, aisle) {
  Cart.add({
    product_id: id,
    product_name: name,
    department: dept,
    aisle: aisle,
  });
}

/* ======================================================================
   3. Side Prediction Flyout Popup (Dynamic Complementary Pairings & Search)
   ====================================================================== */
let sidePopupDismissTimer = null;
let lastAddedProduct = null;
let currentComplementaryItems = [];
let sideSearchDebounceTimer = null;

async function showSidePredictionPopup(addedProduct) {
  lastAddedProduct = addedProduct;
  const popup = document.getElementById('sidePredictionPopup');
  const addedText = document.getElementById('sidePredAddedText');
  const subtitle = document.getElementById('sidePredSubtitle');
  const itemsContainer = document.getElementById('sidePredItems');
  const addAllBtn = document.getElementById('sidePredAddAllBtn');
  const searchInput = document.getElementById('sidePredSearchInput');
  const searchClear = document.getElementById('sidePredSearchClear');
  const sectionLabel = document.getElementById('sidePredSectionLabel');

  if (!popup || !itemsContainer) return;

  // Clear previous side search
  if (searchInput) searchInput.value = '';
  if (searchClear) searchClear.classList.add('hidden');
  if (sectionLabel) {
    sectionLabel.innerHTML = `<span>Frequently Paired With This Item:</span>`;
  }

  // Show notice of which item was added
  if (addedText && addedProduct) {
    addedText.textContent = `Added "${addedProduct.product_name}" to basket`;
  }
  if (subtitle && addedProduct) {
    subtitle.textContent = `Smart complementary pairings for ${addedProduct.product_name}`;
  }

  // Slide popup into view
  popup.classList.add('open');
  popup.setAttribute('aria-hidden', 'false');
  resetSidePopupTimer();

  // Show loading state while fetching complementary pairings
  itemsContainer.innerHTML = `
    <div class="loading-state" style="padding: 1.25rem 0.5rem">
      <div class="spinner"></div>
      <p style="font-size: 0.85rem">Finding AI items complementary to ${escapeHtml(addedProduct.product_name)}...</p>
    </div>
  `;

  try {
    const userParam = AppState.selectedUser ? `&user_id=${AppState.selectedUser}` : '';
    const res = await apiGet(`/api/complementary/${addedProduct.product_id}?limit=4${userParam}`);
    const items = res.complementary || [];
    currentComplementaryItems = items;

    if (items.length === 0) {
      itemsContainer.innerHTML = `
        <div class="placeholder-state" style="padding: 1.25rem 0.5rem">
          <p style="font-size: 0.85rem">No complementary pairings found. Use the quick search below to find and add any grocery item!</p>
        </div>
      `;
      if (addAllBtn) addAllBtn.style.display = 'none';
      return;
    }

    renderSidePopupItems(items, true);

    if (addAllBtn) {
      addAllBtn.style.display = 'flex';
      addAllBtn.innerHTML = `<span>+</span> Add Top ${items.length} Paired Items`;
      addAllBtn.onclick = () => {
        Cart.addAll(items);
        closeSidePredictionPopup();
      };
    }
  } catch (err) {
    console.error('Complementary fetch error:', err);
    // Fallback to customer's top predictions
    const fallback = AppState.currentPredictions.filter(p => p.product_id !== addedProduct.product_id).slice(0, 3);
    renderSidePopupItems(fallback, false);
  }
}

function renderSidePopupItems(items, isComplementary = true) {
  const itemsContainer = document.getElementById('sidePredItems');
  if (!itemsContainer) return;

  if (items.length === 0) {
    itemsContainer.innerHTML = `
      <div class="placeholder-state" style="padding: 1.25rem 0.5rem">
        <p style="font-size: 0.85rem">No products found.</p>
      </div>
    `;
    return;
  }

  itemsContainer.innerHTML = items.map(p => {
    const pct = Math.round((p.probability || 0.5) * 1000) / 10;
    const badgeHtml = p.is_personalized
      ? `<span class="side-pred-badge">✨ Customer Reorder</span>`
      : `<span class="side-pred-badge" style="background: #e0f2fe; color: #0369a1">🔗 Frequently Paired</span>`;

    return `
      <div class="side-pred-item ${p.is_personalized ? 'personalized' : ''}">
        <div class="side-pred-item-top">
          <div class="side-pred-item-name" title="${escapeHtml(p.product_name)}">
            ${getDeptIcon(p.department)} ${escapeHtml(p.product_name)}
          </div>
          <button class="side-add-item-btn" onclick="addSingleProduct(${p.product_id}, '${escapeHtml(p.product_name).replace(/'/g, "\\'")}', '${escapeHtml(p.department)}', '${escapeHtml(p.aisle)}')">
            + Add
          </button>
        </div>
        <div class="side-pred-item-dept">${escapeHtml(p.department)} &bull; ${escapeHtml(p.aisle)}</div>
        <div style="display:flex; align-items:center; gap:0.4rem; flex-wrap:wrap">
          ${badgeHtml}
          <div class="side-pred-item-reason">${escapeHtml(p.reason || 'Recommended pairing')}</div>
        </div>
        <div class="side-pred-item-bottom">
          <div class="side-prob-mini">
            <div class="side-prob-bar">
              <div class="side-prob-fill" style="width: ${Math.min(100, Math.max(12, pct))}%"></div>
            </div>
            <span class="side-prob-pct">${pct}%</span>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/* Side Popup Quick Search Logic */
async function handleSidePopupSearch(query) {
  const itemsContainer = document.getElementById('sidePredItems');
  const sectionLabel = document.getElementById('sidePredSectionLabel');
  const addAllBtn = document.getElementById('sidePredAddAllBtn');
  const clearBtn = document.getElementById('sidePredSearchClear');

  const q = query.trim();
  if (clearBtn) clearBtn.classList.toggle('hidden', q.length === 0);

  if (!q) {
    if (sectionLabel) sectionLabel.innerHTML = `<span>Frequently Paired With This Item:</span>`;
    if (currentComplementaryItems.length > 0) {
      renderSidePopupItems(currentComplementaryItems, true);
      if (addAllBtn) {
        addAllBtn.style.display = 'flex';
        addAllBtn.innerHTML = `<span>+</span> Add Top ${currentComplementaryItems.length} Paired Items`;
        addAllBtn.onclick = () => {
          Cart.addAll(currentComplementaryItems);
          closeSidePredictionPopup();
        };
      }
    }
    return;
  }

  if (sectionLabel) {
    sectionLabel.innerHTML = `<span>Search Results for "${escapeHtml(q)}":</span>`;
  }
  if (itemsContainer) {
    itemsContainer.innerHTML = `
      <div class="loading-state" style="padding: 1rem 0.5rem">
        <div class="spinner"></div>
        <p style="font-size: 0.85rem">Searching groceries...</p>
      </div>
    `;
  }

  try {
    const data = await apiGet(`/api/products?search=${encodeURIComponent(q)}&page_size=6`);
    const searchItems = data.items || [];

    if (searchItems.length === 0) {
      if (itemsContainer) {
        itemsContainer.innerHTML = `
          <div class="placeholder-state" style="padding: 1.25rem 0.5rem">
            <p style="font-size: 0.85rem">No items matching "${escapeHtml(q)}".</p>
          </div>
        `;
      }
      if (addAllBtn) addAllBtn.style.display = 'none';
      return;
    }

    if (itemsContainer) {
      itemsContainer.innerHTML = searchItems.map(p => `
        <div class="side-pred-item">
          <div class="side-pred-item-top">
            <div class="side-pred-item-name" title="${escapeHtml(p.product_name)}">
              ${getDeptIcon(p.department)} ${escapeHtml(p.product_name)}
            </div>
            <button class="side-add-item-btn" onclick="addSingleProduct(${p.product_id}, '${escapeHtml(p.product_name).replace(/'/g, "\\'")}', '${escapeHtml(p.department)}', '${escapeHtml(p.aisle)}')">
              + Add
            </button>
          </div>
          <div class="side-pred-item-dept">${escapeHtml(p.department)} &bull; ${escapeHtml(p.aisle)}</div>
        </div>
      `).join('');
    }

    if (addAllBtn) {
      addAllBtn.style.display = 'flex';
      addAllBtn.innerHTML = `<span>+</span> Add All ${searchItems.length} Results to Basket`;
      addAllBtn.onclick = () => {
        Cart.addAll(searchItems);
        closeSidePredictionPopup();
      };
    }
  } catch (err) {
    console.error('Side search failed:', err);
  }
}

function closeSidePredictionPopup() {
  const popup = document.getElementById('sidePredictionPopup');
  if (popup) {
    popup.classList.remove('open');
    popup.setAttribute('aria-hidden', 'true');
  }
  clearTimeout(sidePopupDismissTimer);
}

function resetSidePopupTimer() {
  clearTimeout(sidePopupDismissTimer);
  sidePopupDismissTimer = setTimeout(() => {
    closeSidePredictionPopup();
  }, 10000);
}

/* ======================================================================
   4. Category Controls (Dropdown, Chips, View Mode)
   ====================================================================== */
async function loadDepartments() {
  const chipsContainer = document.getElementById('deptChips');
  const selectEl = document.getElementById('categorySelect');

  try {
    const depts = await apiGet('/api/departments');
    AppState.departmentsList = depts;

    // 1. Populate category select dropdown in search bar
    if (selectEl) {
      selectEl.innerHTML = `
        <option value="">All Categories (${depts.length})</option>
        ${depts.map(d => `
          <option value="${escapeHtml(d)}" ${AppState.currentDept.toLowerCase() === d.toLowerCase() ? 'selected' : ''}>
            ${getDeptIcon(d)} ${escapeHtml(d.charAt(0).toUpperCase() + d.slice(1))}
          </option>
        `).join('')}
      `;
    }

    // 2. Populate quick chips
    if (chipsContainer) {
      chipsContainer.innerHTML = `
        <button class="dept-chip ${AppState.currentDept === '' ? 'active' : ''}" onclick="selectDepartment('')">
          <span>🛒</span> All Aisles
        </button>
        ${depts.map(d => `
          <button class="dept-chip ${AppState.currentDept.toLowerCase() === d.toLowerCase() ? 'active' : ''}" onclick="selectDepartment('${escapeHtml(d)}')">
            <span>${getDeptIcon(d)}</span> ${escapeHtml(d)}
          </button>
        `).join('')}
      `;
    }
  } catch (err) {
    console.error('Could not load departments:', err);
  }
}

function selectDepartment(dept) {
  AppState.currentDept = dept;
  AppState.currentPage = 1;

  // Sync category select dropdown
  const selectEl = document.getElementById('categorySelect');
  if (selectEl) selectEl.value = dept;

  // Sync active chip
  document.querySelectorAll('.dept-chip').forEach(chip => {
    const text = chip.textContent.trim().toLowerCase();
    const isActive = dept === '' ? text.includes('all aisles') : text.includes(dept.toLowerCase());
    chip.classList.toggle('active', isActive);
  });

  // Sync title and active filter pill
  updateActiveCategoryPill();
  loadProductsCatalog();
}

function updateActiveCategoryPill() {
  const title = document.getElementById('catalogTitle');
  const pill = document.getElementById('activeCategoryPill');

  if (AppState.currentDept) {
    const dName = AppState.currentDept.charAt(0).toUpperCase() + AppState.currentDept.slice(1);
    if (title) title.textContent = `${dName} Department`;
    if (pill) {
      pill.style.display = 'inline-flex';
      pill.innerHTML = `
        <span>Category: ${escapeHtml(dName)}</span>
        <button onclick="selectDepartment('')" aria-label="Clear category filter">&times;</button>
      `;
    }
  } else {
    if (title) title.textContent = 'All Products';
    if (pill) {
      pill.style.display = 'none';
      pill.innerHTML = '';
    }
  }
}

function setViewMode(mode) {
  AppState.viewMode = mode;

  const btnCategories = document.getElementById('viewModeCategories');
  const btnGrid = document.getElementById('viewModeGrid');

  if (btnCategories) {
    btnCategories.classList.toggle('active', mode === 'categories');
    btnCategories.setAttribute('aria-pressed', mode === 'categories' ? 'true' : 'false');
  }
  if (btnGrid) {
    btnGrid.classList.toggle('active', mode === 'grid');
    btnGrid.setAttribute('aria-pressed', mode === 'grid' ? 'true' : 'false');
  }

  loadProductsCatalog();
}

/* ======================================================================
   5. Product Catalog & Search
   ====================================================================== */
let searchDebounceTimer = null;

async function loadProductsCatalog() {
  const container = document.getElementById('productContent');
  const countEl = document.getElementById('productsCount');

  container.innerHTML = `
    <div class="loading-state">
      <div class="spinner"></div>
      <p>Fetching grocery products...</p>
    </div>
  `;

  const params = new URLSearchParams({
    page: AppState.currentPage,
    page_size: AppState.pageSize,
  });
  if (AppState.searchQuery.trim()) {
    params.set('search', AppState.searchQuery.trim());
  }
  if (AppState.currentDept) {
    params.set('department', AppState.currentDept);
  }

  try {
    const data = await apiGet(`/api/products?${params.toString()}`);
    AppState.totalPages = data.total_pages || 1;

    if (countEl) {
      const modeText = AppState.viewMode === 'categories' ? 'divided into categories' : 'grid view';
      countEl.textContent = `${data.total.toLocaleString()} products found (${modeText}, page ${data.page} of ${data.total_pages})`;
    }

    if (!data.items || data.items.length === 0) {
      container.innerHTML = `
        <div class="placeholder-state">
          <span style="font-size: 2.5rem">🔍</span>
          <p>No products matched "${escapeHtml(AppState.searchQuery)}"${AppState.currentDept ? ` in category "${escapeHtml(AppState.currentDept)}"` : ''}.</p>
          <span class="text-muted">Try clearing the category filter or searching for common terms like "milk", "avocado", "cheese", or "apples".</span>
        </div>
      `;
      renderPagination();
      return;
    }

    // -------------------------------------------------------------
    // Render either "Divided by Category" or "Standard Grid"
    // -------------------------------------------------------------
    if (AppState.viewMode === 'categories') {
      renderCategoryDividedView(container, data.items);
    } else {
      renderStandardGridView(container, data.items);
    }

    renderPagination();
  } catch (err) {
    container.innerHTML = `
      <div class="error-banner">
        ⚠️ Failed to load products: ${escapeHtml(err.message)}
      </div>
    `;
    console.error('Products API error:', err);
  }
}

// Render products grouped/divided into Category sections
function renderCategoryDividedView(container, items) {
  // Group items by department
  const groups = {};
  for (const item of items) {
    const dept = item.department || 'other';
    if (!groups[dept]) groups[dept] = [];
    groups[dept].push(item);
  }

  const sortedDepts = Object.keys(groups).sort();

  container.innerHTML = sortedDepts.map(dept => {
    const deptItems = groups[dept];
    return `
      <section class="category-section" aria-label="${escapeHtml(dept)} Category">
        <div class="category-section-header">
          <div class="category-title-group">
            <span class="category-section-icon">${getDeptIcon(dept)}</span>
            <h4 class="category-section-title">${escapeHtml(dept)}</h4>
            <span class="category-item-count">${deptItems.length} item${deptItems.length > 1 ? 's' : ''}</span>
          </div>
          ${AppState.currentDept.toLowerCase() !== dept.toLowerCase() ? `
            <button class="category-filter-btn" onclick="selectDepartment('${escapeHtml(dept)}')">
              Filter only ${escapeHtml(dept)} &rarr;
            </button>
          ` : ''}
        </div>

        <div class="product-grid">
          ${deptItems.map(p => renderProductCardHtml(p)).join('')}
        </div>
      </section>
    `;
  }).join('');
}

// Render products in a single unified grid
function renderStandardGridView(container, items) {
  container.innerHTML = `
    <div class="product-grid">
      ${items.map(p => renderProductCardHtml(p)).join('')}
    </div>
  `;
}

function renderProductCardHtml(p) {
  return `
    <div class="product-card">
      <div>
        <div class="product-emoji">${getDeptIcon(p.department)}</div>
        <div class="product-name" title="${escapeHtml(p.product_name)}">
          ${escapeHtml(p.product_name)}
        </div>
        <div class="product-dept">
          ${escapeHtml(p.department)} &bull; ${escapeHtml(p.aisle)}
        </div>
      </div>

      <div class="product-footer">
        <button class="add-cart-btn" onclick="addSingleProduct(${p.product_id}, '${escapeHtml(p.product_name).replace(/'/g, "\\'")}', '${escapeHtml(p.department)}', '${escapeHtml(p.aisle)}')">
          <span>+</span> Add to Cart
        </button>
      </div>
    </div>
  `;
}

/* ======================================================================
   6. Pagination
   ====================================================================== */
function renderPagination() {
  const container = document.getElementById('pagination');
  if (!container) return;

  if (AppState.totalPages <= 1) {
    container.innerHTML = '';
    return;
  }

  const cur = AppState.currentPage;
  const total = AppState.totalPages;
  let buttons = [];

  // Prev button
  buttons.push(`
    <button class="page-btn" ${cur === 1 ? 'disabled' : ''} onclick="goToPage(${cur - 1})">
      &larr; Prev
    </button>
  `);

  // Windowed numbers
  const maxButtons = 5;
  let start = Math.max(1, cur - 2);
  let end = Math.min(total, start + maxButtons - 1);
  if (end - start < maxButtons - 1) {
    start = Math.max(1, end - maxButtons + 1);
  }

  if (start > 1) {
    buttons.push(`<button class="page-btn" onclick="goToPage(1)">1</button>`);
    if (start > 2) buttons.push(`<span class="page-dots">&hellip;</span>`);
  }

  for (let i = start; i <= end; i++) {
    buttons.push(`
      <button class="page-btn ${i === cur ? 'active' : ''}" onclick="goToPage(${i})">
        ${i}
      </button>
    `);
  }

  if (end < total) {
    if (end < total - 1) buttons.push(`<span class="page-dots">&hellip;</span>`);
    buttons.push(`<button class="page-btn" onclick="goToPage(${total})">${total}</button>`);
  }

  // Next button
  buttons.push(`
    <button class="page-btn" ${cur === total ? 'disabled' : ''} onclick="goToPage(${cur + 1})">
      Next &rarr;
    </button>
  `);

  container.innerHTML = buttons.join('');
}

function goToPage(page) {
  if (page < 1 || page > AppState.totalPages || page === AppState.currentPage) return;
  AppState.currentPage = page;
  loadProductsCatalog();
  const section = document.querySelector('.products-section');
  if (section) {
    section.scrollIntoView({ behavior: 'smooth' });
  }
}

/* ======================================================================
   7. Event Listeners & Startup
   ====================================================================== */
document.addEventListener('DOMContentLoaded', () => {
  // Hook up Cart item addition to trigger side prediction popup!
  Cart.onItemAdded = (product) => {
    showSidePredictionPopup(product);
  };

  // Customer selection change
  const userSelect = document.getElementById('userSelect');
  if (userSelect) {
    userSelect.addEventListener('change', e => {
      handleCustomerChange(e.target.value);
    });
  }

  // Add all predicted items to cart
  const addAllBtn = document.getElementById('addAllBtn');
  if (addAllBtn) {
    addAllBtn.addEventListener('click', () => {
      if (AppState.currentPredictions.length > 0) {
        Cart.addAll(AppState.currentPredictions);
      }
    });
  }

  // Category select dropdown in search row
  const categorySelect = document.getElementById('categorySelect');
  if (categorySelect) {
    categorySelect.addEventListener('change', e => {
      selectDepartment(e.target.value);
    });
  }

  // View mode toggle buttons
  const btnCategories = document.getElementById('viewModeCategories');
  const btnGrid = document.getElementById('viewModeGrid');
  if (btnCategories) {
    btnCategories.addEventListener('click', () => setViewMode('categories'));
  }
  if (btnGrid) {
    btnGrid.addEventListener('click', () => setViewMode('grid'));
  }

  // Prediction banner toggle buttons (Option to see)
  const togglePredBtn = document.getElementById('togglePredBannerBtn');
  const headerPredBtn = document.getElementById('headerPredBtn');
  const closePredBannerBtn = document.getElementById('closePredBannerBtn');

  if (togglePredBtn) {
    togglePredBtn.addEventListener('click', () => togglePredictionBanner());
  }
  if (headerPredBtn) {
    headerPredBtn.addEventListener('click', () => togglePredictionBanner(undefined, true));
  }
  if (closePredBannerBtn) {
    closePredBannerBtn.addEventListener('click', () => togglePredictionBanner(false));
  }

  // Side prediction popup close and hover pause
  const sidePredClose = document.getElementById('sidePredClose');
  const sidePopup = document.getElementById('sidePredictionPopup');
  if (sidePredClose) {
    sidePredClose.addEventListener('click', closeSidePredictionPopup);
  }
  if (sidePopup) {
    sidePopup.addEventListener('mouseenter', () => clearTimeout(sidePopupDismissTimer));
    sidePopup.addEventListener('mouseleave', resetSidePopupTimer);
  }

  // Side prediction popup quick search input
  const sideSearchInput = document.getElementById('sidePredSearchInput');
  const sideSearchClear = document.getElementById('sidePredSearchClear');
  if (sideSearchInput) {
    sideSearchInput.addEventListener('input', e => {
      clearTimeout(sideSearchDebounceTimer);
      sideSearchDebounceTimer = setTimeout(() => {
        handleSidePopupSearch(e.target.value);
      }, 300);
    });
  }
  if (sideSearchClear) {
    sideSearchClear.addEventListener('click', () => {
      if (sideSearchInput) {
        sideSearchInput.value = '';
        handleSidePopupSearch('');
        sideSearchInput.focus();
      }
    });
  }

  // Search input with debounce
  const searchBox = document.getElementById('searchBox');
  const clearSearch = document.getElementById('clearSearch');

  if (searchBox) {
    searchBox.addEventListener('input', e => {
      const val = e.target.value;
      if (clearSearch) {
        clearSearch.classList.toggle('hidden', val.length === 0);
      }
      clearTimeout(searchDebounceTimer);
      searchDebounceTimer = setTimeout(() => {
        AppState.searchQuery = val;
        AppState.currentPage = 1;
        loadProductsCatalog();
      }, 350);
    });
  }

  if (clearSearch) {
    clearSearch.addEventListener('click', () => {
      if (searchBox) {
        searchBox.value = '';
        clearSearch.classList.add('hidden');
        AppState.searchQuery = '';
        AppState.currentPage = 1;
        loadProductsCatalog();
        searchBox.focus();
      }
    });
  }

  // Kick off data loading
  loadCustomerList();
  loadDepartments();
  loadProductsCatalog();
});
