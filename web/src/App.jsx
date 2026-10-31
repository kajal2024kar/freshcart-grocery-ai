import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import { 
  ShoppingBag, Sparkles, Search, Trash2, Plus, Minus, X, Check,
  BarChart3, Store, User, ArrowRight, TrendingUp, Info, Clock, 
  Calendar, Layers, ShieldCheck, RefreshCw, Zap
} from 'lucide-react';

// Static fallbacks from pre-trained artifacts
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

export default function App() {
  const [activeTab, setActiveTab] = useState('shop'); // 'shop' | 'dataset'
  const [selectedUserId, setSelectedUserId] = useState(initialDemoUsers[0].user_id);
  const [cart, setCart] = useState({}); // { [productId]: { product, quantity } }
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [showGroundTruth, setShowGroundTruth] = useState(false);
  const [checkoutCelebration, setCheckoutCelebration] = useState(false);
  const [dynamicPredictions, setDynamicPredictions] = useState([]);
  const [isPredicting, setIsPredicting] = useState(false);

  // Current active demo user
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
    setIsPredicting(true);
    const cartPids = Object.keys(cart).map(Number);
    
    // Attempt FastAPI endpoint first, fallback to browser model scoring
    fetch('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_id: selectedUserId, cart_product_ids: cartPids })
    })
      .then(res => {
        if (!res.ok) throw new Error('API offline');
        return res.json();
      })
      .then(data => {
        setDynamicPredictions(data.predictions || []);
        setIsPredicting(false);
      })
      .catch(() => {
        // High-fidelity client fallback matching exact model logic
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
          
          const reasons = [];
          if (c.purchase_count >= 5) reasons.push(`Frequent habit: ordered ${c.purchase_count}x`);
          else if (c.purchase_count >= 2) reasons.push(`Bought ${c.purchase_count} times`);
          if (c.orders_since_last_purchase === 1) reasons.push('Bought in last order');
          if (boost > 0.05) reasons.push(`Pairs with item in cart (+${Math.round(boost * 100)}% synergy)`);

          const cat = initialCatalog.find(p => p.product_id === c.product_id) || {};

          return {
            product_id: c.product_id,
            product_name: c.product_name,
            department: c.department,
            price: cat.price || 3.49,
            base_prob: c.pred_prob,
            dynamic_prob: Number(dynamicProb.toFixed(4)),
            cart_synergy: Number(boost.toFixed(3)),
            in_cart: cartSet.has(c.product_id),
            reasons: reasons,
            purchase_count: c.purchase_count,
            orders_since_last: c.orders_since_last_purchase,
            actual_reordered: c.actual_reordered_in_next
          };
        });

        scored.sort((a, b) => b.dynamic_prob - a.dynamic_prob);
        setDynamicPredictions(scored.slice(0, 10));
        setIsPredicting(false);
      });
  }, [selectedUserId, cart, currentUser]);

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

  const addAllPredictionsToCart = () => {
    setCart(prev => {
      const next = { ...prev };
      dynamicPredictions.forEach(pred => {
        const fullProd = initialCatalog.find(p => p.product_id === pred.product_id) || {
          product_id: pred.product_id,
          product_name: pred.product_name,
          department: pred.department,
          price: pred.price || 3.49
        };
        if (!next[pred.product_id]) {
          next[pred.product_id] = { product: fullProd, quantity: 1 };
        }
      });
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
      particleCount: 100,
      spread: 70,
      origin: { y: 0.6 }
    });
    setCheckoutCelebration(true);
    setCart({});
    setTimeout(() => {
      setCheckoutCelebration(false);
      setIsCartOpen(false);
    }, 2800);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8faf9' }}>
      
      {/* TOP HEADER */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e2e8f0',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 1px 3px 0 rgba(0, 0, 0, 0.05)'
      }}>
        <div style={{
          maxWidth: '1380px',
          margin: '0 auto',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '1rem',
          flexWrap: 'wrap'
        }}>
          {/* Logo & Slogan */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '12px',
              backgroundColor: '#15803d',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#ffffff',
              fontSize: '1.4rem',
              boxShadow: '0 4px 6px -1px rgba(21, 128, 61, 0.3)'
            }}>
              🥦
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ fontSize: '1.35rem', fontWeight: 800, color: '#14532d', letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
                  FreshMarket
                </span>
                <span style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  backgroundColor: '#dcfce7',
                  color: '#15803d',
                  padding: '0.15rem 0.5rem',
                  borderRadius: '9999px',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em'
                }}>
                  AI Powered
                </span>
              </div>
              <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Instacart Market Basket Dynamic Recommender</p>
            </div>
          </div>

          {/* Navigation Tabs */}
          <nav style={{ display: 'flex', alignItems: 'center', backgroundColor: '#f1f5f9', padding: '0.25rem', borderRadius: '10px' }}>
            <button
              onClick={() => setActiveTab('shop')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'shop' ? '#15803d' : '#64748b',
                backgroundColor: activeTab === 'shop' ? '#ffffff' : 'transparent',
                boxShadow: activeTab === 'shop' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <Store size={17} />
              Shop & Predict
            </button>
            <button
              onClick={() => setActiveTab('dataset')}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem',
                padding: '0.45rem 1rem',
                borderRadius: '8px',
                fontSize: '0.875rem',
                fontWeight: 600,
                color: activeTab === 'dataset' ? '#15803d' : '#64748b',
                backgroundColor: activeTab === 'dataset' ? '#ffffff' : 'transparent',
                boxShadow: activeTab === 'dataset' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
                transition: 'all 0.15s ease'
              }}
            >
              <BarChart3 size={17} />
              Dataset & Model
            </button>
          </nav>

          {/* Controls: Customer Switcher & Cart Button */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
            {/* Customer Switcher Dropdown */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ecfdf5', padding: '0.35rem 0.75rem', borderRadius: '10px', border: '1px solid #a7f3d0' }}>
              <User size={16} color="#059669" />
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>Demo Customer</span>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(Number(e.target.value))}
                  style={{
                    backgroundColor: 'transparent',
                    border: 'none',
                    fontWeight: 700,
                    fontSize: '0.85rem',
                    color: '#064e3b',
                    cursor: 'pointer',
                    outline: 'none'
                  }}
                >
                  {initialDemoUsers.map((u, i) => {
                    const topCand = u.candidates[0] ? u.candidates[0].product_name : 'Groceries';
                    return (
                      <option key={u.user_id} value={u.user_id}>
                        Customer #{u.user_id} ({u.total_prior_orders} orders • {topCand.slice(0, 18)})
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>

            {/* Cart Trigger */}
            <button
              onClick={() => setIsCartOpen(true)}
              style={{
                position: 'relative',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#15803d',
                color: '#ffffff',
                padding: '0.55rem 1.1rem',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.875rem',
                boxShadow: '0 4px 6px -1px rgba(21, 128, 61, 0.25)',
                transition: 'all 0.2s'
              }}
            >
              <ShoppingBag size={18} />
              <span>Cart</span>
              <span style={{
                backgroundColor: '#ffffff',
                color: '#15803d',
                padding: '0.1rem 0.45rem',
                borderRadius: '9999px',
                fontSize: '0.75rem',
                fontWeight: 800
              }}>
                {totalCartCount}
              </span>
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT AREA */}
      <main style={{ maxWidth: '1380px', margin: '0 auto', padding: '1.5rem 1.25rem', width: '100%', flex: 1 }}>
        {activeTab === 'shop' ? (
          <div>
            {/* DYNAMIC NEXT PURCHASE PREDICTOR BANNER */}
            <section style={{
              background: 'linear-gradient(135deg, #064e3b 0%, #065f46 50%, #047857 100%)',
              color: '#ffffff',
              borderRadius: '20px',
              padding: '1.5rem',
              marginBottom: '2rem',
              boxShadow: '0 10px 25px -5px rgba(6, 78, 59, 0.3)',
              position: 'relative',
              overflow: 'hidden'
            }}>
              {/* Subtle background glow */}
              <div style={{
                position: 'absolute',
                top: '-40%',
                right: '-10%',
                width: '350px',
                height: '350px',
                background: 'radial-gradient(circle, rgba(74, 222, 128, 0.18) 0%, transparent 70%)',
                pointerEvents: 'none'
              }} />

              {/* Banner Top Info */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '1rem', marginBottom: '1.25rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', marginBottom: '0.35rem' }}>
                    <div style={{
                      backgroundColor: 'rgba(255, 255, 255, 0.2)',
                      padding: '0.35rem',
                      borderRadius: '8px',
                      display: 'flex',
                      alignItems: 'center'
                    }}>
                      <Sparkles size={20} color="#fde047" />
                    </div>
                    <h2 style={{ fontSize: '1.45rem', fontWeight: 800, letterSpacing: '-0.02em', fontFamily: 'var(--font-display)' }}>
                      Predicted Next Basket
                    </h2>
                    {isPredicting && (
                      <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <RefreshCw size={12} className="spin-animation" /> Recalculating...
                      </span>
                    )}
                  </div>
                  <p style={{ fontSize: '0.875rem', color: '#a7f3d0', maxWidth: '750px' }}>
                    Dynamic real-time purchase predictions for <strong>Customer #{currentUser.user_id}</strong> ({currentUser.total_prior_orders} historical orders, reorders every ~{currentUser.avg_order_gap_days} days).
                    {totalCartCount > 0 && (
                      <span style={{ color: '#fef08a', marginLeft: '0.4rem', fontWeight: 600 }}>
                        <Zap size={14} style={{ display: 'inline', verticalAlign: '-2px' }} /> Dynamically boosted by {totalCartCount} item{totalCartCount > 1 ? 's' : ''} in cart!
                      </span>
                    )}
                  </p>
                </div>

                {/* Banner Actions */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <button
                    onClick={() => setShowGroundTruth(!showGroundTruth)}
                    style={{
                      backgroundColor: showGroundTruth ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      padding: '0.5rem 0.9rem',
                      borderRadius: '10px',
                      fontSize: '0.8rem',
                      fontWeight: 600,
                      backdropFilter: 'blur(8px)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      border: '1px solid rgba(255, 255, 255, 0.25)'
                    }}
                  >
                    <ShieldCheck size={16} />
                    {showGroundTruth ? 'Hide Ground Truth' : 'Compare with Actual Next Order'}
                  </button>
                  <button
                    onClick={addAllPredictionsToCart}
                    style={{
                      backgroundColor: '#f59e0b',
                      color: '#78350f',
                      padding: '0.5rem 1.15rem',
                      borderRadius: '10px',
                      fontSize: '0.85rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.4rem',
                      boxShadow: '0 4px 8px rgba(245, 158, 11, 0.3)',
                      transition: 'transform 0.15s ease'
                    }}
                  >
                    <Plus size={16} />
                    Add All to Cart
                  </button>
                </div>
              </div>

              {/* Ground Truth Comparison Drawer (if toggled) */}
              {showGroundTruth && (
                <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '12px',
                  padding: '1rem',
                  marginBottom: '1.25rem'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <ShieldCheck size={16} color="#4ade80" />
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#4ade80' }}>
                      Ground-Truth Next Order from Real Dataset (order_products__train.csv)
                    </span>
                  </div>
                  <p style={{ fontSize: '0.8rem', color: '#d1fae5', marginBottom: '0.6rem' }}>
                    This customer actually reordered {currentUser.candidates.filter(c => c.actual_reordered_in_next).length} of their previous items in their unseen next basket:
                  </p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                    {currentUser.candidates.filter(c => c.actual_reordered_in_next).map(item => (
                      <span key={item.product_id} style={{
                        backgroundColor: '#064e3b',
                        border: '1px solid #10b981',
                        borderRadius: '8px',
                        padding: '0.25rem 0.6rem',
                        fontSize: '0.75rem',
                        fontWeight: 600,
                        color: '#a7f3d0'
                      }}>
                        ✓ {item.product_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Predicted Products Horizontal Carousel/Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(235px, 1fr))',
                gap: '1rem'
              }}>
                {dynamicPredictions.slice(0, 5).map(pred => {
                  const probPct = Math.round(pred.dynamic_prob * 100);
                  const inCartAlready = Boolean(cart[pred.product_id]);

                  return (
                    <div
                      key={pred.product_id}
                      style={{
                        backgroundColor: 'rgba(255, 255, 255, 0.96)',
                        color: '#0f172a',
                        borderRadius: '14px',
                        padding: '1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
                        transition: 'transform 0.15s ease',
                        border: inCartAlready ? '2px solid #10b981' : '1px solid rgba(255,255,255,0.4)'
                      }}
                    >
                      <div>
                        {/* Probability Score Bar */}
                        <div style={{ marginBottom: '0.65rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                            <span style={{ fontSize: '0.7rem', fontWeight: 700, color: '#047857', textTransform: 'uppercase' }}>
                              Next Order Likelihood
                            </span>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#15803d' }}>
                              {probPct}%
                            </span>
                          </div>
                          <div style={{
                            width: '100%',
                            height: '6px',
                            backgroundColor: '#e2e8f0',
                            borderRadius: '9999px',
                            overflow: 'hidden'
                          }}>
                            <div style={{
                              width: `${probPct}%`,
                              height: '100%',
                              backgroundColor: probPct > 70 ? '#16a34a' : '#f59e0b',
                              borderRadius: '9999px',
                              transition: 'width 0.4s ease'
                            }} />
                          </div>
                        </div>

                        {/* Product Name & Department */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.3rem' }}>
                          <span style={{ fontSize: '1.1rem' }}>{deptIcons[pred.department.toLowerCase()] || '🛒'}</span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#64748b', textTransform: 'uppercase' }}>
                            {pred.department}
                          </span>
                        </div>
                        <h4 style={{
                          fontSize: '0.925rem',
                          fontWeight: 700,
                          lineHeight: 1.3,
                          marginBottom: '0.4rem',
                          color: '#0f172a',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {pred.product_name}
                        </h4>

                        {/* Explanations tag */}
                        {pred.reasons && pred.reasons.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.65rem' }}>
                            {pred.reasons.map((r, i) => (
                              <span key={i} style={{
                                fontSize: '0.65rem',
                                backgroundColor: r.includes('synergy') ? '#fef3c7' : '#ecfdf5',
                                color: r.includes('synergy') ? '#92400e' : '#065f46',
                                padding: '0.15rem 0.4rem',
                                borderRadius: '4px',
                                fontWeight: 600
                              }}>
                                {r}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Card Bottom: Price and Add button */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '0.5rem',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <span style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a' }}>
                          ${(pred.price || 3.49).toFixed(2)}
                        </span>
                        <button
                          onClick={() => {
                            const fullProd = initialCatalog.find(p => p.product_id === pred.product_id) || {
                              product_id: pred.product_id,
                              product_name: pred.product_name,
                              department: pred.department,
                              price: pred.price || 3.49
                            };
                            addToCart(fullProd);
                          }}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.3rem',
                            backgroundColor: inCartAlready ? '#dcfce7' : '#15803d',
                            color: inCartAlready ? '#15803d' : '#ffffff',
                            padding: '0.4rem 0.75rem',
                            borderRadius: '8px',
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            transition: 'all 0.15s'
                          }}
                        >
                          {inCartAlready ? (
                            <>
                              <Check size={14} /> Added ({cart[pred.product_id].quantity})
                            </>
                          ) : (
                            <>
                              <Plus size={14} /> Add
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SHOPPING CATALOG & PRODUCT GRID */}
            <section>
              {/* Filter and Search Bar */}
              <div style={{
                backgroundColor: '#ffffff',
                padding: '1rem',
                borderRadius: '16px',
                border: '1px solid #e2e8f0',
                marginBottom: '1.5rem',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}>
                <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
                  {/* Search Input */}
                  <div style={{
                    position: 'relative',
                    flex: '1 1 300px',
                    maxWidth: '450px'
                  }}>
                    <Search size={18} color="#94a3b8" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
                    <input
                      type="text"
                      placeholder="Search organic bananas, milk, snacks..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '0.6rem 0.85rem 0.6rem 2.4rem',
                        borderRadius: '10px',
                        border: '1px solid #cbd5e1',
                        fontSize: '0.875rem',
                        outline: 'none',
                        transition: 'border-color 0.2s'
                      }}
                    />
                    {searchQuery && (
                      <button
                        onClick={() => setSearchQuery('')}
                        style={{ position: 'absolute', right: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>

                  <span style={{ fontSize: '0.85rem', color: '#64748b' }}>
                    Showing <strong>{filteredProducts.length}</strong> items in catalog
                  </span>
                </div>

                {/* Department Filter Chips */}
                <div style={{
                  display: 'flex',
                  gap: '0.5rem',
                  overflowX: 'auto',
                  paddingTop: '0.85rem',
                  paddingBottom: '0.25rem',
                  scrollbarWidth: 'none'
                }}>
                  {departments.map(dept => {
                    const isSelected = selectedDept === dept;
                    const icon = dept === 'all' ? '✨' : (deptIcons[dept.toLowerCase()] || '🛒');
                    return (
                      <button
                        key={dept}
                        onClick={() => setSelectedDept(dept)}
                        style={{
                          whiteSpace: 'nowrap',
                          padding: '0.4rem 0.85rem',
                          borderRadius: '9999px',
                          fontSize: '0.8rem',
                          fontWeight: 600,
                          backgroundColor: isSelected ? '#15803d' : '#f1f5f9',
                          color: isSelected ? '#ffffff' : '#475569',
                          border: 'none',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.35rem',
                          transition: 'all 0.15s ease'
                        }}
                      >
                        <span>{icon}</span>
                        <span style={{ textTransform: 'capitalize' }}>{dept}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Products Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
                gap: '1.25rem'
              }}>
                {filteredProducts.map(product => {
                  const cartItem = cart[product.product_id];
                  const inCart = Boolean(cartItem);

                  return (
                    <div
                      key={product.product_id}
                      style={{
                        backgroundColor: '#ffffff',
                        border: inCart ? '1.5px solid #16a34a' : '1px solid #e2e8f0',
                        borderRadius: '16px',
                        padding: '1.1rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease'
                      }}
                    >
                      <div>
                        {/* Top: Icon & Department Badge */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.6rem' }}>
                          <span style={{ fontSize: '1.6rem' }}>{deptIcons[product.department.toLowerCase()] || '🛒'}</span>
                          <span style={{
                            fontSize: '0.65rem',
                            fontWeight: 700,
                            backgroundColor: '#f1f5f9',
                            color: '#475569',
                            padding: '0.15rem 0.5rem',
                            borderRadius: '6px',
                            textTransform: 'uppercase'
                          }}>
                            {product.department}
                          </span>
                        </div>

                        {/* Title & Aisle */}
                        <h4 style={{
                          fontSize: '0.925rem',
                          fontWeight: 700,
                          lineHeight: 1.35,
                          color: '#0f172a',
                          marginBottom: '0.35rem',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden'
                        }}>
                          {product.product_name}
                        </h4>
                        <p style={{ fontSize: '0.75rem', color: '#64748b', textTransform: 'capitalize' }}>
                          {product.aisle}
                        </p>
                      </div>

                      {/* Bottom Controls */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '1rem',
                        paddingTop: '0.75rem',
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <div>
                          <span style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                            ${product.price.toFixed(2)}
                          </span>
                        </div>

                        {inCart ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', backgroundColor: '#ecfdf5', borderRadius: '8px', padding: '0.2rem' }}>
                            <button
                              onClick={() => removeFromCart(product.product_id)}
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '6px',
                                backgroundColor: '#ffffff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#047857',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                            >
                              <Minus size={13} />
                            </button>
                            <span style={{ fontSize: '0.85rem', fontWeight: 800, color: '#065f46', minWidth: '18px', textAlign: 'center' }}>
                              {cartItem.quantity}
                            </span>
                            <button
                              onClick={() => addToCart(product)}
                              style={{
                                width: '26px',
                                height: '26px',
                                borderRadius: '6px',
                                backgroundColor: '#15803d',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                color: '#ffffff',
                                boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
                              }}
                            >
                              <Plus size={13} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => addToCart(product)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '0.35rem',
                              backgroundColor: '#15803d',
                              color: '#ffffff',
                              padding: '0.45rem 0.85rem',
                              borderRadius: '8px',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              boxShadow: '0 2px 4px rgba(21, 128, 61, 0.2)',
                              transition: 'background-color 0.15s'
                            }}
                          >
                            <Plus size={14} /> Add
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        ) : (
          /* DATASET AND MODEL ANALYTICS PAGE */
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
            {/* Top Metric Cards */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
              marginBottom: '2rem'
            }}>
              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#16a34a', textTransform: 'uppercase' }}>Model Precision@10</span>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                  {initialStats.metrics.precision_at_10_percent}%
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Tested on {initialStats.metrics.unseen_validation_users.toLocaleString()} unseen users</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0284c7', textTransform: 'uppercase' }}>Model Recall@10</span>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                  {initialStats.metrics.recall_at_10_percent}%
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Coverage of actual future basket</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7c3aed', textTransform: 'uppercase' }}>Total Real Orders</span>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                  {initialStats.orders.toLocaleString()}
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>Across 206,209 unique shoppers</p>
              </div>

              <div style={{ backgroundColor: '#ffffff', padding: '1.25rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#ea580c', textTransform: 'uppercase' }}>Overall Reorder Rate</span>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: '#0f172a', margin: '0.2rem 0' }}>
                  {(initialStats.reorder_rate * 100).toFixed(1)}%
                </div>
                <p style={{ fontSize: '0.75rem', color: '#64748b' }}>49,688 unique products</p>
              </div>
            </div>

            {/* Charts Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: '1.5rem', marginBottom: '2rem' }}>
              
              {/* Chart 1: Orders by Weekday */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Calendar size={18} color="#15803d" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Orders by Day of Week</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>
                  Peak grocery ordering occurs on Sunday (Day 0) and Monday (Day 1).
                </p>

                {/* SVG Bar Chart */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '180px', paddingBottom: '2rem', position: 'relative' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, idx) => {
                    const count = initialStats.orders_by_weekday[idx] || 0;
                    const maxVal = Math.max(...Object.values(initialStats.orders_by_weekday));
                    const heightPct = Math.round((count / maxVal) * 100);
                    const isPeak = idx === 0 || idx === 1;

                    return (
                      <div key={dayName} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.7rem', fontWeight: 700, color: isPeak ? '#15803d' : '#64748b', marginBottom: '4px' }}>
                          {(count / 1000).toFixed(0)}k
                        </span>
                        <div style={{
                          width: '100%',
                          height: `${heightPct}%`,
                          backgroundColor: isPeak ? '#16a34a' : '#cbd5e1',
                          borderRadius: '6px 6px 0 0',
                          transition: 'height 0.4s ease'
                        }} />
                        <span style={{ position: 'absolute', bottom: '0px', fontSize: '0.75rem', fontWeight: 600, color: '#475569' }}>
                          {dayName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 2: Orders by Hour of Day */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Clock size={18} color="#0284c7" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Orders by Hour of Day (0 - 23)</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1.25rem' }}>
                  Shopping traffic surges from 9:00 AM to 5:00 PM with peak at 10:00 AM (288k orders).
                </p>

                {/* SVG Curve / Histogram */}
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '180px', paddingBottom: '2rem', position: 'relative' }}>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const count = initialStats.orders_by_hour[h] || 0;
                    const maxVal = Math.max(...Object.values(initialStats.orders_by_hour));
                    const heightPct = Math.round((count / maxVal) * 100);
                    const isPeak = h >= 10 && h <= 15;

                    return (
                      <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <div
                          title={`${h}:00 - ${count.toLocaleString()} orders`}
                          style={{
                            width: '100%',
                            height: `${heightPct}%`,
                            backgroundColor: isPeak ? '#0284c7' : '#e2e8f0',
                            borderRadius: '2px 2px 0 0',
                            transition: 'height 0.4s ease'
                          }}
                        />
                        {h % 4 === 0 && (
                          <span style={{ position: 'absolute', bottom: '0px', fontSize: '0.65rem', fontWeight: 600, color: '#64748b' }}>
                            {h}h
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 3: Top 10 Most Ordered Products */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <TrendingUp size={18} color="#ea580c" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>Top 10 Products in Instacart</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {initialStats.top_10_products.map((p, idx) => {
                    const maxCount = initialStats.top_10_products[0].order_count;
                    const pct = Math.round((p.order_count / maxCount) * 100);
                    return (
                      <div key={p.product_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, marginBottom: '2px' }}>
                          <span style={{ color: '#1e293b' }}>
                            {idx + 1}. {p.product_name}
                          </span>
                          <span style={{ color: '#64748b', fontWeight: 700 }}>
                            {p.order_count.toLocaleString()} orders
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: idx === 0 ? '#15803d' : '#38bdf8', borderRadius: '9999px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 4: LightGBM Feature Importance */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '16px', border: '1px solid #e2e8f0', boxShadow: '0 1px 3px rgba(0,0,0,0.04)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
                  <Layers size={18} color="#7c3aed" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#0f172a' }}>LightGBM Feature Importance (Gain)</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#64748b', marginBottom: '1rem' }}>
                  User recency (<code style={{ backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>orders_since_last_purchase</code>) and habitual loyalty (<code style={{ backgroundColor: '#f1f5f9', padding: '2px 4px', borderRadius: '4px' }}>reorder_rate</code>) dominate predictive power.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {Object.entries(initialStats.feature_importance)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, score]) => {
                      const maxScore = Math.max(...Object.values(initialStats.feature_importance));
                      const pct = Math.round((score / maxScore) * 100);
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.775rem', fontWeight: 600, marginBottom: '2px' }}>
                            <span style={{ fontFamily: 'monospace', color: '#334155' }}>{name}</span>
                            <span style={{ color: '#7c3aed', fontWeight: 700 }}>{Math.round(score).toLocaleString()}</span>
                          </div>
                          <div style={{ width: '100%', height: '8px', backgroundColor: '#f1f5f9', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#8b5cf6', borderRadius: '9999px' }} />
                          </div>
                        </div>
                      );
                    })}
                </div>
              </div>

            </div>

            {/* Methodology Card */}
            <div style={{ backgroundColor: '#ecfdf5', border: '1px solid #a7f3d0', borderRadius: '16px', padding: '1.5rem' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#064e3b', marginBottom: '0.5rem' }}>
                Machine Learning Methodology & Sound Evaluation
              </h3>
              <p style={{ fontSize: '0.85rem', color: '#065f46', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                • <strong>Strict User-Level Split:</strong> Rather than random row shuffling (which creates fatal data leakage across user habits), users are divided 80/20. The 3,000 validation users were never seen during model training.
              </p>
              <p style={{ fontSize: '0.85rem', color: '#065f46', lineHeight: 1.6, marginBottom: '0.75rem' }}>
                • <strong>Ground-Truth Label:</strong> Binary target represents whether the item actually appeared in the user's subsequent order (<code style={{ backgroundColor: 'rgba(255,255,255,0.6)', padding: '1px 5px', borderRadius: '4px' }}>order_products__train.csv</code>).
              </p>
              <p style={{ fontSize: '0.85rem', color: '#065f46', lineHeight: 1.6 }}>
                • <strong>Market Basket Dynamic Synergies:</strong> When the shopper modifies their active cart, the item co-occurrence affinity matrix dynamically re-scores candidates in real time.
              </p>
            </div>
          </div>
        )}
      </main>

      {/* CART DRAWER */}
      {isCartOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.4)',
          zIndex: 50,
          display: 'flex',
          justifyContent: 'flex-end',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '430px',
            backgroundColor: '#ffffff',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
            animation: 'slideInRight 0.25s ease-out'
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '1.25rem',
              borderBottom: '1px solid #e2e8f0',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingBag size={20} color="#15803d" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a' }}>
                  Your Basket ({totalCartCount})
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                style={{ color: '#94a3b8', padding: '0.25rem', borderRadius: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Cart Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
              {totalCartCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  <ShoppingBag size={48} strokeWidth={1.5} style={{ margin: '0 auto 1rem', color: '#cbd5e1' }} />
                  <p style={{ fontWeight: 600, color: '#475569' }}>Your basket is currently empty</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Add predicted items above or browse the fresh grocery catalog!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
                  {Object.values(cart).map(({ product, quantity }) => (
                    <div
                      key={product.product_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem',
                        borderRadius: '12px',
                        border: '1px solid #e2e8f0',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '1.4rem' }}>{deptIcons[product.department.toLowerCase()] || '🛒'}</span>
                        <div style={{ minWidth: 0 }}>
                          <h5 style={{
                            fontSize: '0.85rem',
                            fontWeight: 700,
                            color: '#0f172a',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis'
                          }}>
                            {product.product_name}
                          </h5>
                          <span style={{ fontSize: '0.75rem', color: '#64748b' }}>
                            ${product.price.toFixed(2)} each
                          </span>
                        </div>
                      </div>

                      {/* Quantity Controls */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginLeft: '0.5rem' }}>
                        <button
                          onClick={() => removeFromCart(product.product_id)}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            backgroundColor: '#f1f5f9',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#475569'
                          }}
                        >
                          <Minus size={13} />
                        </button>
                        <span style={{ fontSize: '0.85rem', fontWeight: 800, minWidth: '18px', textAlign: 'center' }}>
                          {quantity}
                        </span>
                        <button
                          onClick={() => addToCart(product)}
                          style={{
                            width: '26px',
                            height: '26px',
                            borderRadius: '6px',
                            backgroundColor: '#15803d',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: '#ffffff'
                          }}
                        >
                          <Plus size={13} />
                        </button>
                        <button
                          onClick={() => deleteItem(product.product_id)}
                          style={{
                            color: '#ef4444',
                            padding: '0.25rem',
                            marginLeft: '0.2rem'
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Footer & Checkout */}
            {totalCartCount > 0 && (
              <div style={{
                padding: '1.25rem',
                borderTop: '1px solid #e2e8f0',
                backgroundColor: '#f8faf9'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.4rem', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>Subtotal</span>
                  <span>${cartSubtotal.toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.85rem', fontSize: '0.85rem', color: '#64748b' }}>
                  <span>Estimated Tax (5%)</span>
                  <span>${(cartSubtotal * 0.05).toFixed(2)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1.15rem', fontSize: '1.1rem', fontWeight: 800, color: '#0f172a' }}>
                  <span>Order Total</span>
                  <span>${(cartSubtotal * 1.05).toFixed(2)}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={checkoutCelebration}
                  style={{
                    width: '100%',
                    backgroundColor: checkoutCelebration ? '#10b981' : '#15803d',
                    color: '#ffffff',
                    padding: '0.85rem',
                    borderRadius: '12px',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 10px rgba(21, 128, 61, 0.3)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {checkoutCelebration ? (
                    <>
                      <Check size={20} /> Order Placed! Thank You!
                    </>
                  ) : (
                    <>
                      Checkout Now (${(cartSubtotal * 1.05).toFixed(2)})
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* FOOTER */}
      <footer style={{
        backgroundColor: '#ffffff',
        borderTop: '1px solid #e2e8f0',
        padding: '1.25rem',
        marginTop: 'auto',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#64748b'
      }}>
        <p>FreshMarket AI • Trained on the real Instacart Market Basket Dataset (3.4M orders) with LightGBM</p>
      </footer>
    </div>
  );
}
