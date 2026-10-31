import React, { useState, useEffect, useMemo, useRef } from 'react';
import confetti from 'canvas-confetti';
import { 
  ShoppingBag, Sparkles, Search, Trash2, Plus, Minus, X, Check,
  BarChart3, Store, User, ArrowRight, TrendingUp, Info, Clock, 
  Calendar, Layers, ShieldCheck, RefreshCw, Zap, MapPin, ChevronRight,
  Flame, CheckCircle2, ShoppingCart
} from 'lucide-react';

// Pre-trained dataset artifacts
import initialStats from './data/dataset_stats.json';
import initialCatalog from './data/products_catalog.json';
import initialDemoUsers from './data/demo_users.json';
import initialAffinities from './data/product_affinities.json';

const deptIcons = {
  produce: '🥦',
  'dairy eggs': '🥛',
  bakery: '🍞',
  beverages: '🧃',
  snacks: '🥨',
  'meat seafood': '🥩',
  frozen: '🧊',
  pantry: '🥫',
  deli: '🥪',
  'canned goods': '🍲',
  'dry goods pasta': '🍝',
  breakfast: '🥣',
  household: '🧹',
  'personal care': '🧴',
  babies: '👶',
  pets: '🐾',
  alcohol: '🍷',
  international: '🍜',
  bulk: '🌾',
  other: '📦',
  missing: '🛒'
};

const deptDisplayName = {
  produce: 'Fresh Fruits & Vegetables',
  'dairy eggs': 'Dairy, Bread & Eggs',
  bakery: 'Bakery & Breads',
  beverages: 'Cold Drinks & Juices',
  snacks: 'Snacks & Munchies',
  'meat seafood': 'Fresh Meat & Fish',
  frozen: 'Frozen Food',
  pantry: 'Atta, Rice & Dals',
  deli: 'Deli & Breakfast Meats',
  'canned goods': 'Canned & Soups',
  'dry goods pasta': 'Pasta & Noodles',
  breakfast: 'Cereals & Breakfast',
  household: 'Home & Cleaning',
  'personal care': 'Personal Care & Hygiene',
  babies: 'Baby Care',
  pets: 'Pet Supplies',
  alcohol: 'Beverages & Wine',
  international: 'World Foods',
  bulk: 'Grains & Bulk',
  other: 'Other Groceries'
};

export default function App() {
  const [activeTab, setActiveTab] = useState('shop'); // 'shop' | 'dataset'
  const [selectedUserId, setSelectedUserId] = useState(initialDemoUsers[0].user_id);
  const [cart, setCart] = useState({}); // { [productId]: { product, quantity } }
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [checkoutCelebration, setCheckoutCelebration] = useState(false);
  const [dynamicPredictions, setDynamicPredictions] = useState([]);
  const [lastAddedProduct, setLastAddedProduct] = useState(null);

  // Current active customer profile
  const currentUser = useMemo(() => {
    return initialDemoUsers.find(u => u.user_id === selectedUserId) || initialDemoUsers[0];
  }, [selectedUserId]);

  // Departments list
  const departments = useMemo(() => {
    const set = new Set();
    initialCatalog.forEach(p => {
      if (p.department) set.add(p.department);
    });
    return ['all', ...Array.from(set).sort()];
  }, []);

  // Filtered products for shop grid
  const filteredProducts = useMemo(() => {
    return initialCatalog.filter(p => {
      const matchDept = selectedDept === 'all' || p.department.toLowerCase() === selectedDept.toLowerCase();
      const matchSearch = !searchQuery || 
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.aisle.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDept && matchSearch;
    });
  }, [selectedDept, searchQuery]);

  // Dynamic next purchase prediction algorithm (runs live when user or cart changes)
  useEffect(() => {
    const cartPids = Object.keys(cart).map(Number);
    const cartSet = new Set(cartPids);
    const cartBoosts = {};
    
    cartPids.forEach(cpid => {
      const affList = initialAffinities[cpid] || [];
      affList.forEach(item => {
        cartBoosts[item.product_id] = (cartBoosts[item.product_id] || 0) + item.affinity;
      });
    });

    const scored = currentUser.candidates.map(c => {
      const boost = cartBoosts[c.product_id] || 0;
      const dynamicProb = Math.min(0.99, c.pred_prob * (1.0 + boost * 1.5));
      const cat = initialCatalog.find(p => p.product_id === c.product_id) || {};

      return {
        product_id: c.product_id,
        product_name: c.product_name,
        department: c.department,
        price: cat.price || 49,
        mrp: cat.mrp || Math.round((cat.price || 49) * 1.25),
        unit: cat.unit || '1 pack',
        dynamic_prob: Number(dynamicProb.toFixed(4)),
        cart_synergy: Number(boost.toFixed(3)),
        in_cart: cartSet.has(c.product_id),
        purchase_count: c.purchase_count,
        orders_since_last: c.orders_since_last_purchase,
        actual_reordered: c.actual_reordered_in_next
      };
    });

    scored.sort((a, b) => b.dynamic_prob - a.dynamic_prob);
    setDynamicPredictions(scored.slice(0, 10));
  }, [selectedUserId, cart, currentUser]);

  // Compute side recommendations (ALWAYS available and updates when lastAddedProduct changes)
  const sideRecommendations = useMemo(() => {
    const recs = [];
    
    if (lastAddedProduct) {
      const affList = initialAffinities[lastAddedProduct.product_id] || [];
      affList.forEach(aff => {
        const p = initialCatalog.find(item => item.product_id === aff.product_id);
        if (p && p.product_id !== lastAddedProduct.product_id && !cart[p.product_id]) {
          recs.push({
            ...p,
            matchScore: Math.round(aff.affinity * 100),
            reason: `Frequently bought with ${lastAddedProduct.product_name.slice(0, 16)}`
          });
        }
      });
    }

    // Supplement with top customer predictions
    if (recs.length < 3) {
      dynamicPredictions.forEach(pred => {
        if (!cart[pred.product_id] && (!lastAddedProduct || pred.product_id !== lastAddedProduct.product_id) && !recs.find(r => r.product_id === pred.product_id)) {
          recs.push({
            ...pred,
            matchScore: Math.round(pred.dynamic_prob * 100),
            reason: 'Frequent Next Purchase'
          });
        }
      });
    }

    // Fallback to top catalog items
    if (recs.length < 3) {
      initialCatalog.slice(0, 6).forEach(cat => {
        if (!cart[cat.product_id] && !recs.find(r => r.product_id === cat.product_id)) {
          recs.push({
            ...cat,
            matchScore: 88,
            reason: 'Trending Daily Grocery'
          });
        }
      });
    }

    return recs.slice(0, 3);
  }, [lastAddedProduct, dynamicPredictions, cart]);

  // Cart operations
  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev[product.product_id];
      const count = existing ? existing.quantity + 1 : 1;
      return {
        ...prev,
        [product.product_id]: { product, quantity: count }
      };
    });
    setLastAddedProduct(product);
  };

  const removeFromCart = (productId) => {
    setCart(prev => {
      const next = { ...prev };
      if (next[productId]) {
        if (next[productId].quantity > 1) {
          next[productId].quantity -= 1;
        } else {
          delete next[productId];
        }
      }
      return next;
    });
  };

  const deleteItem = (productId) => {
    setCart(prev => {
      const next = { ...prev };
      delete next[productId];
      return next;
    });
  };

  const totalCartCount = useMemo(() => {
    return Object.values(cart).reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartSubtotal = useMemo(() => {
    return Object.values(cart).reduce((sum, item) => sum + (item.product.price * item.quantity), 0);
  }, [cart]);

  const handleCheckout = () => {
    if (totalCartCount === 0) return;
    confetti({
      particleCount: 120,
      spread: 75,
      origin: { y: 0.6 }
    });
    setCheckoutCelebration(true);
    setCart({});
    setLastAddedProduct(null);
    setTimeout(() => {
      setCheckoutCelebration(false);
      setIsCartOpen(false);
    }, 2800);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f4f6f8' }}>
      
      {/* NAVBAR */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
      }}>
        <div style={{
          backgroundColor: '#0c831f',
          color: '#ffffff',
          padding: '0.35rem 1rem',
          fontSize: '0.78rem',
          fontWeight: 800,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '0.5rem',
          letterSpacing: '0.02em'
        }}>
          <span>⚡ freshcart-grocery-ai • FREE EXPRESS DELIVERY OVER ₹199</span>
          <span style={{ opacity: 0.6 }}>•</span>
          <span>⚡ 10 MINUTES DELIVERY TO HOME</span>
        </div>

        <div style={{
          maxWidth: '1380px',
          margin: '0 auto',
          padding: '0.75rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1.25rem',
          flexWrap: 'nowrap'
        }}>
          {/* Brand Logo & Location */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }} onClick={() => setActiveTab('shop')}>
              <div style={{
                width: '42px',
                height: '42px',
                borderRadius: '10px',
                backgroundColor: '#f7c32e',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: '#0c831f',
                fontSize: '1.45rem',
                fontWeight: 900,
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
              }}>
                🛒
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0c831f', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
                    freshcart<span style={{ color: '#f7c32e' }}>-grocery-ai</span>
                  </span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.75rem', color: '#1f2937', fontWeight: 700 }}>
                  <span>10 minutes delivery</span>
                  <span style={{ color: '#0c831f' }}>• Mumbai 400001</span>
                </div>
              </div>
            </div>

            {/* Shopper / Customer Switcher Pill */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#f0fdf4',
              padding: '0.35rem 0.65rem',
              borderRadius: '8px',
              border: '1px solid #bbf7d0'
            }}>
              <User size={14} color="#0c831f" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.62rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase' }}>Account Profile</span>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.775rem',
                    color: '#064e3b',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {initialDemoUsers.map((u) => (
                    <option key={u.user_id} value={u.user_id}>
                      Shopper #{u.user_id} ({u.total_prior_orders} orders)
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Prominent Search Bar */}
          <div style={{
            position: 'relative',
            flex: '1 1 380px',
            maxWidth: '560px'
          }}>
            <Search size={18} color="#9ca3af" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              placeholder="Search 'milk', 'bananas', 'bread', 'chips'..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%',
                padding: '0.7rem 0.85rem 0.7rem 2.6rem',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb',
                fontSize: '0.875rem',
                outline: 'none',
                transition: 'all 0.2s ease'
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                style={{ position: 'absolute', right: '12px', top: '50%', transform: 'translateY(-50%)', color: '#9ca3af' }}
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Nav Links & Cart Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexShrink: 0 }}>
            <button
              onClick={() => setActiveTab(activeTab === 'shop' ? 'dataset' : 'shop')}
              style={{
                fontSize: '0.85rem',
                fontWeight: 700,
                color: activeTab === 'dataset' ? '#0c831f' : '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: '0.35rem',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                backgroundColor: activeTab === 'dataset' ? '#f0fdf4' : 'transparent'
              }}
            >
              <BarChart3 size={16} />
              {activeTab === 'shop' ? 'Dataset & AI Stats' : 'Back to Shop'}
            </button>

            <button
              onClick={() => setIsCartOpen(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.65rem',
                backgroundColor: '#0c831f',
                color: '#ffffff',
                padding: '0.65rem 1.15rem',
                borderRadius: '10px',
                fontWeight: 800,
                fontSize: '0.9rem',
                boxShadow: '0 4px 6px -1px rgba(12, 131, 31, 0.3)'
              }}
            >
              <ShoppingCart size={18} />
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1.1 }}>
                <span style={{ fontSize: '0.72rem', opacity: 0.9 }}>{totalCartCount} {totalCartCount === 1 ? 'item' : 'items'}</span>
                <span>₹{Math.round(cartSubtotal * 1.05)}</span>
              </div>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN VIEW */}
      <main style={{ maxWidth: '1380px', margin: '0 auto', padding: '1.25rem', width: '100%', flex: 1 }}>
        {activeTab === 'shop' ? (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'minmax(0, 1fr) 350px',
            gap: '1.5rem',
            alignItems: 'start'
          }}>
            
            {/* LEFT COLUMN: CATEGORIES & PRODUCT GRID */}
            <div>
              {/* Category Chips Bar */}
              <div style={{
                backgroundColor: '#ffffff',
                padding: '0.85rem 1rem',
                borderRadius: '12px',
                border: '1px solid #e5e7eb',
                marginBottom: '1.25rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
              }}>
                <div style={{
                  display: 'flex',
                  gap: '0.6rem',
                  overflowX: 'auto',
                  scrollbarWidth: 'none',
                  paddingBottom: '0.2rem'
                }}>
                  {departments.map(dept => {
                    const isSelected = selectedDept === dept;
                    const icon = dept === 'all' ? '✨' : (deptIcons[dept.toLowerCase()] || '🛒');
                    const label = dept === 'all' ? 'All Categories' : (deptDisplayName[dept.toLowerCase()] || dept);

                    return (
                      <button
                        key={dept}
                        onClick={() => setSelectedDept(dept)}
                        style={{
                          whiteSpace: 'nowrap',
                          padding: '0.5rem 0.9rem',
                          borderRadius: '8px',
                          fontSize: '0.8rem',
                          fontWeight: 700,
                          backgroundColor: isSelected ? '#0c831f' : '#f3f4f6',
                          color: isSelected ? '#ffffff' : '#374151',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.4rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span style={{ fontSize: '1rem' }}>{icon}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Product Listing Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                  {selectedDept === 'all' ? 'Daily Fresh Groceries' : (deptDisplayName[selectedDept.toLowerCase()] || selectedDept)}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                  Showing {filteredProducts.length} items
                </span>
              </div>

              {/* Product Cards Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))',
                gap: '1rem'
              }}>
                {filteredProducts.map(product => {
                  const cartItem = cart[product.product_id];
                  const inCart = Boolean(cartItem);
                  const discountPct = Math.round(((product.mrp - product.price) / product.mrp) * 100);

                  return (
                    <div
                      key={product.product_id}
                      style={{
                        backgroundColor: '#ffffff',
                        border: inCart ? '1.5px solid #0c831f' : '1px solid #e5e7eb',
                        borderRadius: '14px',
                        padding: '0.9rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)'
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                        <span style={{
                          backgroundColor: '#ecfdf5',
                          color: '#0c831f',
                          fontSize: '0.62rem',
                          fontWeight: 800,
                          padding: '0.15rem 0.45rem',
                          borderRadius: '4px',
                          textTransform: 'uppercase'
                        }}>
                          {discountPct > 0 ? `${discountPct}% OFF` : 'FRESH'}
                        </span>
                        <span style={{ fontSize: '1.4rem' }}>{deptIcons[product.department.toLowerCase()] || '🛒'}</span>
                      </div>

                      <div>
                        <span style={{ fontSize: '0.72rem', fontWeight: 700, color: '#6b7280' }}>
                          {product.unit || '1 pack'}
                        </span>
                        <h4 style={{
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          lineHeight: 1.3,
                          color: '#111827',
                          margin: '0.2rem 0 0.3rem 0',
                          height: '2.4rem',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {product.product_name}
                        </h4>
                        <p style={{ fontSize: '0.7rem', color: '#9ca3af', textTransform: 'capitalize', margin: 0 }}>
                          {product.aisle}
                        </p>
                      </div>

                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '0.85rem',
                        paddingTop: '0.65rem',
                        borderTop: '1px solid #f3f4f6'
                      }}>
                        <div>
                          <div style={{ fontSize: '1rem', fontWeight: 900, color: '#111827' }}>
                            ₹{product.price}
                          </div>
                          <div style={{ fontSize: '0.7rem', color: '#9ca3af', textDecoration: 'line-through' }}>
                            ₹{product.mrp}
                          </div>
                        </div>

                        {inCart ? (
                          <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.35rem',
                            backgroundColor: '#0c831f',
                            borderRadius: '8px',
                            padding: '0.25rem 0.45rem'
                          }}>
                            <button
                              onClick={() => removeFromCart(product.product_id)}
                              style={{ width: '20px', height: '20px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Minus size={12} />
                            </button>
                            <span style={{ fontSize: '0.8rem', fontWeight: 900, color: '#ffffff', minWidth: '16px', textAlign: 'center' }}>
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() => addToCart(product)}
                              style={{ width: '20px', height: '20px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Plus size={12} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product)}
                            style={{
                              border: '1.5px solid #0c831f',
                              backgroundColor: '#ffffff',
                              color: '#0c831f',
                              padding: '0.45rem 1rem',
                              borderRadius: '8px',
                              fontSize: '0.775rem',
                              fontWeight: 800,
                              textTransform: 'uppercase'
                            }}
                          >
                            + ADD
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* RIGHT COLUMN: DYNAMIC RECOMMENDATION CARD & CART CARD (ALWAYS VISIBLE!) */}
            <div style={{ position: 'sticky', top: '95px', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
              
              {/* 1. DYNAMIC AI RECOMMENDATIONS CARD */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1.5px solid #0c831f',
                borderRadius: '16px',
                overflow: 'hidden',
                boxShadow: '0 4px 15px rgba(12, 131, 31, 0.1)'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #0c831f 0%, #065f46 100%)',
                  color: '#ffffff',
                  padding: '0.75rem 1rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.45rem'
                }}>
                  <Sparkles size={16} color="#f7c32e" />
                  <div>
                    <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.03em' }}>
                      {lastAddedProduct ? 'Frequently Bought Together' : 'AI Smart Recommendations'}
                    </div>
                    <div style={{ fontSize: '0.68rem', color: '#bbf7d0' }}>
                      {lastAddedProduct ? `Pairs with ${lastAddedProduct.product_name.slice(0, 18)}` : `Top picks for Shopper #${currentUser.user_id}`}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {sideRecommendations.map(item => {
                    const inCart = Boolean(cart[item.product_id]);
                    return (
                      <div
                        key={item.product_id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                          padding: '0.55rem 0.65rem',
                          borderRadius: '10px',
                          border: '1px solid #f3f4f6',
                          backgroundColor: '#fafafa'
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '1.2rem' }}>{deptIcons[item.department?.toLowerCase()] || '🛒'}</span>
                          <div style={{ minWidth: 0 }}>
                            <h5 style={{
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              color: '#111827',
                              margin: 0,
                              whiteSpace: 'nowrap',
                              overflow: 'hidden',
                              textOverflow: 'ellipsis'
                            }}>
                              {item.product_name}
                            </h5>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
                              <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#111827' }}>
                                ₹{item.price || 49}
                              </span>
                              <span style={{ fontSize: '0.62rem', color: '#0c831f', fontWeight: 700, backgroundColor: '#ecfdf5', padding: '0.05rem 0.3rem', borderRadius: '4px' }}>
                                {item.matchScore}% Match
                              </span>
                            </div>
                          </div>
                        </div>

                        <button
                          onClick={() => addToCart(item)}
                          style={{
                            marginLeft: '0.4rem',
                            border: inCart ? '1px solid #0c831f' : 'none',
                            backgroundColor: inCart ? '#ecfdf5' : '#0c831f',
                            color: inCart ? '#0c831f' : '#ffffff',
                            padding: '0.35rem 0.65rem',
                            borderRadius: '6px',
                            fontSize: '0.72rem',
                            fontWeight: 800,
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.2rem'
                          }}
                        >
                          {inCart ? `Added (${cart[item.product_id].quantity})` : '+ Add'}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* 2. ACTIVE SHOPPING BASKET CARD (ALWAYS VISIBLE RIGHT HERE!) */}
              <div style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e5e7eb',
                borderRadius: '16px',
                padding: '1rem',
                boxShadow: '0 2px 8px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShoppingCart size={18} color="#0c831f" />
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#111827' }}>
                      My Basket ({totalCartCount})
                    </h4>
                  </div>
                  {totalCartCount > 0 && (
                    <button
                      onClick={() => { setCart({}); setLastAddedProduct(null); }}
                      style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700 }}
                    >
                      Clear
                    </button>
                  )}
                </div>

                {totalCartCount === 0 ? (
                  <div style={{ textAlign: 'center', padding: '1.5rem 0.5rem', color: '#9ca3af' }}>
                    <ShoppingCart size={32} style={{ margin: '0 auto 0.5rem', opacity: 0.5 }} />
                    <p style={{ fontSize: '0.8rem', fontWeight: 600, color: '#6b7280', margin: 0 }}>Your basket is empty</p>
                    <p style={{ fontSize: '0.7rem', margin: '0.25rem 0 0' }}>Add items from the catalog or suggestions above!</p>
                  </div>
                ) : (
                  <div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '220px', overflowY: 'auto', marginBottom: '0.85rem' }}>
                      {Object.values(cart).map(({ product, quantity }) => (
                        <div key={product.product_id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                            <div style={{ fontWeight: 700, color: '#111827', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {product.product_name}
                            </div>
                            <span style={{ fontSize: '0.7rem', color: '#6b7280' }}>₹{product.price} × {quantity}</span>
                          </div>

                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#0c831f', borderRadius: '5px', padding: '0.1rem 0.25rem' }}>
                              <button onClick={() => removeFromCart(product.product_id)} style={{ color: '#ffffff', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Minus size={10} />
                              </button>
                              <span style={{ color: '#ffffff', fontSize: '0.75rem', fontWeight: 800, minWidth: '14px', textAlign: 'center' }}>{quantity}</span>
                              <button onClick={() => addToCart(product)} style={{ color: '#ffffff', width: '16px', height: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <Plus size={10} />
                              </button>
                            </div>
                            <button onClick={() => deleteItem(product.product_id)} style={{ color: '#ef4444', padding: '0.1rem' }}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: '1px solid #f3f4f6', paddingTop: '0.65rem', marginBottom: '0.75rem', fontSize: '0.78rem', color: '#6b7280' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span>Subtotal</span>
                        <span>₹{cartSubtotal}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                        <span>Delivery</span>
                        <span style={{ color: '#0c831f', fontWeight: 700 }}>FREE</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', fontWeight: 900, color: '#111827', marginTop: '0.4rem' }}>
                        <span>Total</span>
                        <span>₹{Math.round(cartSubtotal * 1.05)}</span>
                      </div>
                    </div>

                    <button
                      onClick={handleCheckout}
                      disabled={checkoutCelebration}
                      style={{
                        width: '100%',
                        backgroundColor: checkoutCelebration ? '#059669' : '#0c831f',
                        color: '#ffffff',
                        padding: '0.65rem',
                        borderRadius: '8px',
                        fontWeight: 800,
                        fontSize: '0.85rem',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        boxShadow: '0 2px 6px rgba(12, 131, 31, 0.3)'
                      }}
                    >
                      {checkoutCelebration ? 'Order Placed! 10 Mins Arrival' : `Pay ₹${Math.round(cartSubtotal * 1.05)}`}
                    </button>
                  </div>
                )}
              </div>

            </div>

          </div>
        ) : (
          /* DATASET AND MODEL ANALYTICS PAGE */
          <div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0c831f', textTransform: 'uppercase' }}>Model Precision@10</span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#111827', margin: '0.2rem 0' }}>
                  {initialStats.metrics.precision_at_10_percent}%
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Tested on {initialStats.metrics.unseen_validation_users.toLocaleString()} unseen users</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>Model Recall@10</span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#111827', margin: '0.2rem 0' }}>
                  {initialStats.metrics.recall_at_10_percent}%
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Coverage of actual future basket</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Total Real Orders</span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#111827', margin: '0.2rem 0' }}>
                  {initialStats.orders.toLocaleString()}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>Across 206,209 unique shoppers</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>Overall Reorder Rate</span>
                <div style={{ fontSize: '2rem', fontWeight: 900, color: '#111827', margin: '0.2rem 0' }}>
                  {(initialStats.reorder_rate * 100).toFixed(1)}%
                </div>
                <p style={{ fontSize: '0.75rem', color: '#6b7280' }}>49,688 unique products</p>
              </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', marginBottom: '0.5rem' }}>Orders by Day of Week</h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '170px', paddingBottom: '1.5rem', position: 'relative' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, idx) => {
                    const count = initialStats.orders_by_weekday[idx] || 0;
                    const maxVal = Math.max(...Object.values(initialStats.orders_by_weekday));
                    const heightPct = Math.round((count / maxVal) * 100);
                    const isPeak = idx === 0 || idx === 1;

                    return (
                      <div key={dayName} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isPeak ? '#0c831f' : '#6b7280', marginBottom: '4px' }}>
                          {(count / 1000).toFixed(0)}k
                        </span>
                        <div style={{ width: '100%', height: `${heightPct}%`, backgroundColor: isPeak ? '#0c831f' : '#cbd5e1', borderRadius: '6px 6px 0 0' }} />
                        <span style={{ position: 'absolute', bottom: '0px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563' }}>
                          {dayName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827', marginBottom: '0.5rem' }}>Top 10 Products in Instacart</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {initialStats.top_10_products.map((p, idx) => {
                    const maxCount = initialStats.top_10_products[0].order_count;
                    const pct = Math.round((p.order_count / maxCount) * 100);
                    return (
                      <div key={p.product_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '2px' }}>
                          <span style={{ color: '#1f2937' }}>{idx + 1}. {p.product_name}</span>
                          <span style={{ color: '#6b7280' }}>{p.order_count.toLocaleString()} orders</span>
                        </div>
                        <div style={{ width: '100%', height: '7px', backgroundColor: '#f3f4f6', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: idx === 0 ? '#0c831f' : '#38bdf8', borderRadius: '9999px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e5e7eb',
        padding: '1.25rem',
        marginTop: 'auto',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#6b7280'
      }}>
        <p>freshcart-grocery-ai • Instacart Market Basket Next Purchase AI • Prices in Indian Rupees (₹)</p>
      </footer>
    </div>
  );
}
