/**
 * cart.js — Shopping Cart Management (Vanilla JavaScript)
 * Handles cart state, localStorage persistence, quantity updates, drawer toggle, and checkout.
 */

// Simple Toast Notification
function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toast._timeout);
  toast._timeout = setTimeout(() => {
    toast.classList.remove('show');
  }, 2400);
}

const Cart = {
  items: [], // Array of { product_id, product_name, department, aisle, qty }
  onItemAdded: null, // Callback hook for side prediction popup

  init() {
    this.load();
    this.bindEvents();
    this.render();
  },

  load() {
    try {
      const stored = localStorage.getItem('freshcart_basket');
      if (stored) {
        this.items = JSON.parse(stored);
      }
    } catch (e) {
      this.items = [];
    }
  },

  save() {
    try {
      localStorage.setItem('freshcart_basket', JSON.stringify(this.items));
    } catch (e) {
      console.warn('Could not save cart to localStorage', e);
    }
  },

  add(product, qty = 1, silent = false) {
    const existing = this.items.find(i => i.product_id === product.product_id);
    if (existing) {
      existing.qty += qty;
    } else {
      this.items.push({
        product_id: product.product_id,
        product_name: product.product_name,
        department: product.department || 'grocery',
        aisle: product.aisle || '',
        qty: qty,
      });
    }
    this.save();
    this.render();
    if (!silent) {
      showToast(`Added "${product.product_name}" to your basket`);
      if (typeof this.onItemAdded === 'function') {
        this.onItemAdded(product);
      }
    }
  },

  addAll(productList) {
    if (!productList || productList.length === 0) return;
    for (const p of productList) {
      this.add(p, 1, true);
    }
    this.save();
    this.render();
    showToast(`Added ${productList.length} predicted items to your basket!`);
    this.openDrawer();
  },

  updateQty(productId, delta) {
    const item = this.items.find(i => i.product_id === productId);
    if (!item) return;
    item.qty += delta;
    if (item.qty <= 0) {
      this.remove(productId, true);
      return;
    }
    this.save();
    this.render();
  },

  remove(productId, silent = false) {
    const idx = this.items.findIndex(i => i.product_id === productId);
    if (idx !== -1) {
      const name = this.items[idx].product_name;
      this.items.splice(idx, 1);
      this.save();
      this.render();
      if (!silent) {
        showToast(`Removed "${name}" from basket`);
      }
    }
  },

  clear() {
    this.items = [];
    this.save();
    this.render();
  },

  totalCount() {
    return this.items.reduce((sum, item) => sum + (item.qty || 1), 0);
  },

  openDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer && overlay) {
      drawer.classList.add('open');
      overlay.classList.add('open');
      drawer.setAttribute('aria-hidden', 'false');
    }
  },

  closeDrawer() {
    const drawer = document.getElementById('cartDrawer');
    const overlay = document.getElementById('cartOverlay');
    if (drawer && overlay) {
      drawer.classList.remove('open');
      overlay.classList.remove('open');
      drawer.setAttribute('aria-hidden', 'true');
    }
  },

  render() {
    const badge = document.getElementById('cartBadge');
    const totalCountEl = document.getElementById('cartTotalCount');
    const itemsContainer = document.getElementById('cartItems');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearBtn = document.getElementById('clearCartBtn');

    const count = this.totalCount();

    // Update Header Badge
    if (badge) {
      badge.textContent = count;
      badge.classList.toggle('hidden', count === 0);
    }

    if (totalCountEl) {
      totalCountEl.textContent = count;
    }

    if (checkoutBtn) {
      checkoutBtn.disabled = this.items.length === 0;
    }

    if (clearBtn) {
      clearBtn.style.display = this.items.length > 0 ? 'block' : 'none';
    }

    // Render items list inside drawer
    if (itemsContainer) {
      if (this.items.length === 0) {
        itemsContainer.innerHTML = `
          <div class="cart-empty">
            <span class="empty-icon">🧺</span>
            <p>Your basket is empty</p>
            <span class="empty-sub">Add items from the store or from your AI basket above!</span>
          </div>
        `;
      } else {
        itemsContainer.innerHTML = this.items
          .map(item => `
            <div class="cart-item" data-id="${item.product_id}">
              <div class="cart-item-info">
                <div class="cart-item-name">${escapeHtml(item.product_name)}</div>
                <div class="cart-item-dept">${escapeHtml(item.department)}</div>
              </div>
              <div class="cart-qty-ctrl">
                <button class="qty-btn" onclick="Cart.updateQty(${item.product_id}, -1)" aria-label="Decrease quantity">&minus;</button>
                <span class="qty-val">${item.qty}</span>
                <button class="qty-btn" onclick="Cart.updateQty(${item.product_id}, 1)" aria-label="Increase quantity">&plus;</button>
              </div>
              <button class="cart-item-del" onclick="Cart.remove(${item.product_id})" aria-label="Remove item">&times;</button>
            </div>
          `)
          .join('');
      }
    }
  },

  bindEvents() {
    const cartBtn = document.getElementById('cartBtn');
    const closeBtn = document.getElementById('cartClose');
    const overlay = document.getElementById('cartOverlay');
    const checkoutBtn = document.getElementById('checkoutBtn');
    const clearBtn = document.getElementById('clearCartBtn');
    const modalOkBtn = document.getElementById('modalOkBtn');
    const modal = document.getElementById('checkoutModal');

    if (cartBtn) cartBtn.addEventListener('click', () => this.openDrawer());
    if (closeBtn) closeBtn.addEventListener('click', () => this.closeDrawer());
    if (overlay) overlay.addEventListener('click', () => this.closeDrawer());

    if (clearBtn) {
      clearBtn.addEventListener('click', () => {
        if (confirm('Are you sure you want to clear your cart?')) {
          this.clear();
          showToast('Basket cleared');
        }
      });
    }

    if (checkoutBtn) {
      checkoutBtn.addEventListener('click', () => {
        const count = this.totalCount();
        this.clear();
        this.closeDrawer();
        if (modal) {
          const summary = document.getElementById('modalSummary');
          if (summary) {
            summary.textContent = `Your order of ${count} item${count > 1 ? 's' : ''} has been placed successfully!`;
          }
          modal.style.display = 'flex';
        }
      });
    }

    if (modalOkBtn && modal) {
      modalOkBtn.addEventListener('click', () => {
        modal.style.display = 'none';
      });
    }

    // Keyboard ESC closes drawer
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        this.closeDrawer();
        if (modal) modal.style.display = 'none';
      }
    });
  },
};

// Safe HTML escaping
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Auto-initialize when DOM ready
document.addEventListener('DOMContentLoaded', () => Cart.init());
