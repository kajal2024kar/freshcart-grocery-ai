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
  const [showGroundTruth, setShowGroundTruth] = useState(false);
  const [checkoutCelebration, setCheckoutCelebration] = useState(false);
  const [dynamicPredictions, setDynamicPredictions] = useState([]);
  const [isPredicting, setIsPredicting] = useState(false);

  // Side Recommendation Popup state for EVERY product added!
  const [sideRecPopup, setSideRecPopup] = useState({
    isOpen: false,
    triggerProduct: null,
    recommendations: []
  });
  const popupTimeoutRef = useRef(null);

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
          if (c.purchase_count >= 5) reasons.push(`Regular Habit: Bought ${c.purchase_count}x`);
          else if (c.purchase_count >= 2) reasons.push(`Bought ${c.purchase_count} times`);
          if (c.orders_since_last_purchase === 1) reasons.push('Bought in last order');
          if (boost > 0.05) reasons.push(`Pairs with items in cart (+${Math.round(boost * 100)}% synergy)`);

          const cat = initialCatalog.find(p => p.product_id === c.product_id) || {};

          return {
            product_id: c.product_id,
            product_name: c.product_name,
            department: c.department,
            price: cat.price || 49,
            mrp: cat.mrp || Math.round((cat.price || 49) * 1.25),
            unit: cat.unit || '1 pack',
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

  // Trigger Side Recommendation Popup whenever a product is added
  const triggerSideRecommendation = (product) => {
    // Find market basket complements for this specific product
    const affList = initialAffinities[product.product_id] || [];
    const compIds = new Set(affList.map(a => a.product_id));
    
    // Score recommendations: candidates matching this product's affinities or high habit next-purchases
    const recs = [];
    
    // 1. Direct affinities from market basket rules
    affList.slice(0, 4).forEach(aff => {
      const p = initialCatalog.find(item => item.product_id === aff.product_id);
      if (p && p.product_id !== product.product_id && !cart[p.product_id]) {
        recs.push({
          ...p,
          affinityScore: aff.affinity,
          reason: `Frequently bought with ${product.product_name.slice(0, 18)}`
        });
      }
    });

    // 2. If fewer than 3, supplement with customer's top habitual predictions not yet in cart
    if (recs.length < 3) {
      dynamicPredictions.forEach(pred => {
        if (pred.product_id !== product.product_id && !cart[pred.product_id] && !recs.find(r => r.product_id === pred.product_id)) {
          recs.push({
            ...pred,
            affinityScore: pred.dynamic_prob,
            reason: pred.reasons?.[0] || 'Predicted next purchase'
          });
        }
      });
    }

    const finalRecs = recs.slice(0, 3);

    // If cart drawer is open, don't overlap, otherwise open side recommendation drawer
    if (!isCartOpen && finalRecs.length > 0) {
      setSideRecPopup({
        isOpen: true,
        triggerProduct: product,
        recommendations: finalRecs
      });

      // Clear any previous auto-dismiss timeout
      if (popupTimeoutRef.current) clearTimeout(popupTimeoutRef.current);
      // Auto-keep open for 10 seconds or until user dismisses
      popupTimeoutRef.current = setTimeout(() => {
        setSideRecPopup(prev => ({ ...prev, isOpen: false }));
      }, 10000);
    }
  };

  // Cart operations
  const addToCart = (product, suppressPopup = false) => {
    setCart(prev => {
      const existing = prev[product.product_id];
      const count = existing ? existing.quantity + 1 : 1;
      return {
        ...prev,
        [product.product_id]: { product, quantity: count }
      };
    });

    if (!suppressPopup) {
      triggerSideRecommendation(product);
    }
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
          price: pred.price || 49,
          mrp: pred.mrp || 65,
          unit: pred.unit || '1 pack'
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
      particleCount: 120,
      spread: 75,
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
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f4f6f8' }}>
      
      {/* NORMAL SHOPPING APP TOP NAVBAR (Blinkit / Zepto / BigBasket style) */}
      <header style={{
        backgroundColor: '#ffffff',
        borderBottom: '1px solid #e5e7eb',
        position: 'sticky',
        top: 0,
        zIndex: 40,
        boxShadow: '0 2px 4px rgba(0,0,0,0.04)'
      }}>
        {/* Top Announcement Bar */}
        <div style={{
          backgroundColor: '#0c831f',
          color: '#ffffff',
          padding: '0.35rem 1rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          gap: '0.5rem',
          letterSpacing: '0.02em'
        }}>
          <span>⚡ FREE EXPRESS DELIVERY ON ORDERS OVER ₹199</span>
          <span style={{ opacity: 0.6 }}>•</span>
          <span>⚡ INSTANT GROCERIES IN 10 MINUTES</span>
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
                ⚡
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <span style={{ fontSize: '1.45rem', fontWeight: 900, color: '#0c831f', letterSpacing: '-0.03em', fontFamily: 'var(--font-display)' }}>
                    blink<span style={{ color: '#f7c32e' }}>market</span>
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
                  {initialDemoUsers.map((u) => {
                    const topCand = u.candidates[0] ? u.candidates[0].product_name : 'Groceries';
                    return (
                      <option key={u.user_id} value={u.user_id}>
                        Shopper #{u.user_id} ({u.total_prior_orders} orders)
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          </div>

          {/* Prominent Search Bar in Navbar */}
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
                transition: 'all 0.2s ease',
                boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.03)'
              }}
              onFocus={(e) => e.target.style.borderColor = '#0c831f'}
              onBlur={(e) => e.target.style.borderColor = '#e5e7eb'}
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

          {/* Nav Links & Indian Grocery Cart Button */}
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

            {/* Cart Button: Displays Item Count and ₹ Total */}
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
                boxShadow: '0 4px 6px -1px rgba(12, 131, 31, 0.3)',
                transition: 'all 0.15s ease'
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
          <div>
            {/* DYNAMIC NEXT BASKET AI PREDICTION BANNER */}
            <section style={{
              background: 'linear-gradient(135deg, #064e3b 0%, #065f46 60%, #0c831f 100%)',
              color: '#ffffff',
              borderRadius: '16px',
              padding: '1.25rem 1.5rem',
              marginBottom: '1.5rem',
              boxShadow: '0 8px 20px -4px rgba(6, 78, 59, 0.25)',
              position: 'relative'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '0.75rem', marginBottom: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                    <div style={{ backgroundColor: '#f7c32e', color: '#0c831f', padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                      <Sparkles size={14} /> AI RECOMMENDED NEXT BASKET
                    </div>
                    {isPredicting && (
                      <span style={{ fontSize: '0.75rem', backgroundColor: 'rgba(255,255,255,0.2)', padding: '0.2rem 0.5rem', borderRadius: '6px', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <RefreshCw size={12} className="spin-animation" /> Recalculating...
                      </span>
                    )}
                  </div>
                  <h3 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0.2rem 0' }}>
                    Predicted for Shopper #{currentUser.user_id}
                  </h3>
                  <p style={{ fontSize: '0.825rem', color: '#bbf7d0', maxWidth: '750px', margin: 0 }}>
                    Based on {currentUser.total_prior_orders} historical orders (orders every ~{currentUser.avg_order_gap_days} days).
                    {totalCartCount > 0 && (
                      <span style={{ color: '#fef08a', marginLeft: '0.4rem', fontWeight: 700 }}>
                        <Zap size={13} style={{ display: 'inline', verticalAlign: '-1px' }} /> Dynamically boosted by items in your cart!
                      </span>
                    )}
                  </p>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <button
                    onClick={() => setShowGroundTruth(!showGroundTruth)}
                    style={{
                      backgroundColor: showGroundTruth ? '#10b981' : 'rgba(255, 255, 255, 0.15)',
                      color: '#ffffff',
                      padding: '0.45rem 0.85rem',
                      borderRadius: '8px',
                      fontSize: '0.775rem',
                      fontWeight: 700,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      border: '1px solid rgba(255,255,255,0.25)'
                    }}
                  >
                    <ShieldCheck size={15} />
                    {showGroundTruth ? 'Hide Ground Truth' : 'Compare Actual Next Basket'}
                  </button>
                  <button
                    onClick={addAllPredictionsToCart}
                    style={{
                      backgroundColor: '#f7c32e',
                      color: '#064e3b',
                      padding: '0.45rem 1rem',
                      borderRadius: '8px',
                      fontSize: '0.825rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      boxShadow: '0 2px 6px rgba(247, 195, 46, 0.4)'
                    }}
                  >
                    <Plus size={15} />
                    Add All to Basket
                  </button>
                </div>
              </div>

              {/* Ground Truth Compare */}
              {showGroundTruth && (
                <div style={{
                  backgroundColor: 'rgba(0, 0, 0, 0.25)',
                  border: '1px solid rgba(255, 255, 255, 0.2)',
                  borderRadius: '10px',
                  padding: '0.85rem',
                  marginBottom: '1rem'
                }}>
                  <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#4ade80', marginBottom: '0.4rem' }}>
                    ✓ Real Instacart Next-Order Ground Truth for Customer #{currentUser.user_id}:
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem' }}>
                    {currentUser.candidates.filter(c => c.actual_reordered_in_next).map(item => (
                      <span key={item.product_id} style={{
                        backgroundColor: '#064e3b',
                        border: '1px solid #10b981',
                        borderRadius: '6px',
                        padding: '0.2rem 0.5rem',
                        fontSize: '0.725rem',
                        fontWeight: 600,
                        color: '#bbf7d0'
                      }}>
                        ✓ {item.product_name}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Predicted Products Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(215px, 1fr))',
                gap: '0.85rem'
              }}>
                {dynamicPredictions.slice(0, 5).map(pred => {
                  const probPct = Math.round(pred.dynamic_prob * 100);
                  const inCartAlready = Boolean(cart[pred.product_id]);

                  return (
                    <div
                      key={pred.product_id}
                      style={{
                        backgroundColor: '#ffffff',
                        color: '#1f2937',
                        borderRadius: '12px',
                        padding: '0.85rem',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.06)',
                        border: inCartAlready ? '2px solid #0c831f' : '1px solid #e5e7eb'
                      }}
                    >
                      <div>
                        {/* Likelihood bar */}
                        <div style={{ marginBottom: '0.5rem' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.2rem' }}>
                            <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#0c831f', textTransform: 'uppercase' }}>
                              Next Order Match
                            </span>
                            <span style={{ fontSize: '0.775rem', fontWeight: 800, color: '#0c831f' }}>
                              {probPct}%
                            </span>
                          </div>
                          <div style={{ width: '100%', height: '5px', backgroundColor: '#e5e7eb', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div style={{
                              width: `${probPct}%`,
                              height: '100%',
                              backgroundColor: probPct > 70 ? '#0c831f' : '#f7c32e',
                              borderRadius: '9999px'
                            }} />
                          </div>
                        </div>

                        {/* Department & Name */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', marginBottom: '0.25rem' }}>
                          <span style={{ fontSize: '1rem' }}>{deptIcons[pred.department.toLowerCase()] || '🛒'}</span>
                          <span style={{ fontSize: '0.65rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase' }}>
                            {pred.unit || '1 pack'}
                          </span>
                        </div>
                        <h4 style={{
                          fontSize: '0.875rem',
                          fontWeight: 700,
                          lineHeight: 1.3,
                          marginBottom: '0.35rem',
                          color: '#111827',
                          height: '2.4rem',
                          overflow: 'hidden',
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical'
                        }}>
                          {pred.product_name}
                        </h4>

                        {/* Reason chip */}
                        {pred.reasons?.[0] && (
                          <span style={{
                            display: 'inline-block',
                            fontSize: '0.65rem',
                            backgroundColor: '#f0fdf4',
                            color: '#166534',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '4px',
                            fontWeight: 700,
                            marginBottom: '0.5rem'
                          }}>
                            {pred.reasons[0]}
                          </span>
                        )}
                      </div>

                      {/* Card Bottom: Rupee Price and Add button */}
                      <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginTop: '0.5rem',
                        paddingTop: '0.5rem',
                        borderTop: '1px solid #f3f4f6'
                      }}>
                        <div>
                          <div style={{ fontSize: '0.95rem', fontWeight: 800, color: '#111827' }}>
                            ₹{pred.price || 49}
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#9ca3af', textDecoration: 'line-through' }}>
                            ₹{pred.mrp || Math.round((pred.price || 49) * 1.25)}
                          </div>
                        </div>

                        {inCartAlready ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#0c831f', borderRadius: '6px', padding: '0.15rem' }}>
                            <button
                              onClick={() => removeFromCart(pred.product_id)}
                              style={{ width: '22px', height: '22px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Minus size={11} />
                            </button>
                            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ffffff', minWidth: '14px', textAlign: 'center' }}>
                              {cart[pred.product_id].quantity}
                            </span>
                            <button
                              onClick={() => {
                                const fullProd = initialCatalog.find(p => p.product_id === pred.product_id) || pred;
                                addToCart(fullProd);
                              }}
                              style={{ width: '22px', height: '22px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Plus size={11} />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => {
                              const fullProd = initialCatalog.find(p => p.product_id === pred.product_id) || pred;
                              addToCart(fullProd);
                            }}
                            style={{
                              border: '1px solid #0c831f',
                              backgroundColor: '#ffffff',
                              color: '#0c831f',
                              padding: '0.35rem 0.75rem',
                              borderRadius: '6px',
                              fontSize: '0.75rem',
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
            </section>

            {/* NORMAL SHOPPING APP CATEGORY TABS & PRODUCT GRID */}
            <section>
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
                    const label = dept === 'all' ? 'All Products' : (deptDisplayName[dept.toLowerCase()] || dept);

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
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827' }}>
                  {selectedDept === 'all' ? 'Popular Daily Groceries' : (deptDisplayName[selectedDept.toLowerCase()] || selectedDept)}
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#6b7280', fontWeight: 600 }}>
                  Showing {filteredProducts.length} items
                </span>
              </div>

              {/* Product Cards Grid (Indian E-Commerce Style) */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))',
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
                        boxShadow: '0 1px 3px rgba(0,0,0,0.03)',
                        position: 'relative'
                      }}
                    >
                      {/* Top Badges */}
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

                      {/* Product Name & Pack Size */}
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

                      {/* Bottom Pricing & ADD Button */}
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
                              textTransform: 'uppercase',
                              transition: 'all 0.15s ease'
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
            </section>
          </div>
        ) : (
          /* DATASET AND MODEL ANALYTICS PAGE (WITH INR LABELS) */
          <div style={{ animation: 'fadeIn 0.3s ease-out' }}>
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
              
              {/* Chart 1: Orders by Weekday */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Calendar size={18} color="#0c831f" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>Orders by Day of Week</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>
                  Peak grocery ordering occurs on Sunday (Day 0) and Monday (Day 1).
                </p>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '1rem', height: '170px', paddingBottom: '2rem', position: 'relative' }}>
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
                        <div style={{
                          width: '100%',
                          height: `${heightPct}%`,
                          backgroundColor: isPeak ? '#0c831f' : '#cbd5e1',
                          borderRadius: '6px 6px 0 0'
                        }} />
                        <span style={{ position: 'absolute', bottom: '0px', fontSize: '0.75rem', fontWeight: 700, color: '#4b5563' }}>
                          {dayName}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 2: Orders by Hour of Day */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Clock size={18} color="#0284c7" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>Orders by Hour of Day (0 - 23)</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1.25rem' }}>
                  Traffic surges between 9:00 AM and 5:00 PM with peak at 10:00 AM.
                </p>

                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '3px', height: '170px', paddingBottom: '2rem', position: 'relative' }}>
                  {Array.from({ length: 24 }).map((_, h) => {
                    const count = initialStats.orders_by_hour[h] || 0;
                    const maxVal = Math.max(...Object.values(initialStats.orders_by_hour));
                    const heightPct = Math.round((count / maxVal) * 100);
                    const isPeak = h >= 10 && h <= 15;

                    return (
                      <div key={h} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <div
                          style={{
                            width: '100%',
                            height: `${heightPct}%`,
                            backgroundColor: isPeak ? '#0284c7' : '#e5e7eb',
                            borderRadius: '2px 2px 0 0'
                          }}
                        />
                        {h % 4 === 0 && (
                          <span style={{ position: 'absolute', bottom: '0px', fontSize: '0.65rem', fontWeight: 600, color: '#6b7280' }}>
                            {h}h
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 3: Top 10 Products */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <TrendingUp size={18} color="#ea580c" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>Top 10 Products in Instacart</h3>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {initialStats.top_10_products.map((p, idx) => {
                    const maxCount = initialStats.top_10_products[0].order_count;
                    const pct = Math.round((p.order_count / maxCount) * 100);
                    return (
                      <div key={p.product_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 700, marginBottom: '2px' }}>
                          <span style={{ color: '#1f2937' }}>
                            {idx + 1}. {p.product_name}
                          </span>
                          <span style={{ color: '#6b7280' }}>
                            {p.order_count.toLocaleString()} orders
                          </span>
                        </div>
                        <div style={{ width: '100%', height: '7px', backgroundColor: '#f3f4f6', borderRadius: '9999px', overflow: 'hidden' }}>
                          <div style={{ width: `${pct}%`, height: '100%', backgroundColor: idx === 0 ? '#0c831f' : '#38bdf8', borderRadius: '9999px' }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Chart 4: LightGBM Feature Importance */}
              <div style={{ backgroundColor: '#ffffff', padding: '1.5rem', borderRadius: '14px', border: '1px solid #e5e7eb' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <Layers size={18} color="#7c3aed" />
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#111827' }}>Feature Importance (Gain)</h3>
                </div>
                <p style={{ fontSize: '0.8rem', color: '#6b7280', marginBottom: '1rem' }}>
                  Recency (<code style={{ backgroundColor: '#f3f4f6', padding: '2px 4px', borderRadius: '4px' }}>orders_since_last_purchase</code>) and repeat habit (<code style={{ backgroundColor: '#f3f4f6', padding: '2px 4px', borderRadius: '4px' }}>reorder_rate</code>) drive predictions.
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {Object.entries(initialStats.feature_importance)
                    .sort((a, b) => b[1] - a[1])
                    .map(([name, score]) => {
                      const maxScore = Math.max(...Object.values(initialStats.feature_importance));
                      const pct = Math.round((score / maxScore) * 100);
                      return (
                        <div key={name}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', fontWeight: 700, marginBottom: '2px' }}>
                            <span style={{ fontFamily: 'monospace', color: '#374151' }}>{name}</span>
                            <span style={{ color: '#7c3aed' }}>{Math.round(score).toLocaleString()}</span>
                          </div>
                          <div style={{ width: '100%', height: '7px', backgroundColor: '#f3f4f6', borderRadius: '9999px', overflow: 'hidden' }}>
                            <div style={{ width: `${pct}%`, height: '100%', backgroundColor: '#8b5cf6', borderRadius: '9999px' }} />
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

      {/* DYNAMIC SIDE RECOMMENDATION POPUP FOR EVERY PRODUCT ADDED */}
      {sideRecPopup.isOpen && sideRecPopup.triggerProduct && (
        <div style={{
          position: 'fixed',
          bottom: '24px',
          right: '24px',
          width: '360px',
          maxWidth: 'calc(100vw - 32px)',
          backgroundColor: '#ffffff',
          borderRadius: '16px',
          boxShadow: '0 12px 35px -5px rgba(0, 0, 0, 0.22), 0 0 0 1px rgba(0,0,0,0.06)',
          zIndex: 45,
          overflow: 'hidden',
          animation: 'slideInRight 0.3s cubic-bezier(0.16, 1, 0.3, 1)'
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #0c831f 0%, #065f46 100%)',
            color: '#ffffff',
            padding: '0.85rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.45rem' }}>
              <div style={{ backgroundColor: '#f7c32e', color: '#0c831f', borderRadius: '6px', width: '22px', height: '22px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Sparkles size={14} />
              </div>
              <div>
                <div style={{ fontSize: '0.75rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Frequently Bought Together
                </div>
                <div style={{ fontSize: '0.7rem', color: '#bbf7d0' }}>
                  Pairs with <strong>{sideRecPopup.triggerProduct.product_name.slice(0, 20)}</strong>
                </div>
              </div>
            </div>
            <button
              onClick={() => setSideRecPopup(prev => ({ ...prev, isOpen: false }))}
              style={{ color: '#ffffff', opacity: 0.8, padding: '0.2rem' }}
            >
              <X size={18} />
            </button>
          </div>

          {/* Recommended items list */}
          <div style={{ padding: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.65rem', maxHeight: '340px', overflowY: 'auto' }}>
            {sideRecPopup.recommendations.map(item => {
              const inCart = Boolean(cart[item.product_id]);
              return (
                <div
                  key={item.product_id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.6rem 0.75rem',
                    borderRadius: '10px',
                    border: '1px solid #f3f4f6',
                    backgroundColor: '#fafafa'
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flex: 1, minWidth: 0 }}>
                    <span style={{ fontSize: '1.3rem' }}>{deptIcons[item.department?.toLowerCase()] || '🛒'}</span>
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
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                        <span style={{ fontSize: '0.825rem', fontWeight: 800, color: '#111827' }}>
                          ₹{item.price || 49}
                        </span>
                        <span style={{ fontSize: '0.65rem', color: '#0c831f', fontWeight: 700, backgroundColor: '#ecfdf5', padding: '0.1rem 0.35rem', borderRadius: '4px' }}>
                          {item.affinityScore ? `${Math.round(item.affinityScore * 100)}% Match` : 'Recommended'}
                        </span>
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={() => {
                      addToCart(item, true); // add without re-triggering popup
                    }}
                    style={{
                      marginLeft: '0.5rem',
                      border: inCart ? '1px solid #0c831f' : 'none',
                      backgroundColor: inCart ? '#ecfdf5' : '#0c831f',
                      color: inCart ? '#0c831f' : '#ffffff',
                      padding: '0.35rem 0.65rem',
                      borderRadius: '6px',
                      fontSize: '0.725rem',
                      fontWeight: 800,
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.25rem'
                    }}
                  >
                    {inCart ? `Added (${cart[item.product_id].quantity})` : '+ Add'}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Popup Footer */}
          <div style={{
            padding: '0.65rem 0.85rem',
            backgroundColor: '#f9fafb',
            borderTop: '1px solid #f3f4f6',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <button
              onClick={() => {
                sideRecPopup.recommendations.forEach(r => addToCart(r, true));
                setSideRecPopup(prev => ({ ...prev, isOpen: false }));
              }}
              style={{
                fontSize: '0.75rem',
                fontWeight: 800,
                color: '#0c831f',
                display: 'flex',
                alignItems: 'center',
                gap: '0.25rem'
              }}
            >
              <Plus size={14} /> Add all ({sideRecPopup.recommendations.length})
            </button>
            <button
              onClick={() => {
                setSideRecPopup(prev => ({ ...prev, isOpen: false }));
                setIsCartOpen(true);
              }}
              style={{
                fontSize: '0.75rem',
                fontWeight: 700,
                color: '#4b5563',
                display: 'flex',
                alignItems: 'center',
                gap: '0.2rem'
              }}
            >
              View Basket <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* SHOPPING BASKET DRAWER (INR) */}
      {isCartOpen && (
        <div style={{
          position: 'fixed',
          top: 0,
          right: 0,
          bottom: 0,
          left: 0,
          backgroundColor: 'rgba(0, 0, 0, 0.45)',
          zIndex: 50,
          display: 'flex',
          justifyContent: 'flex-end',
          backdropFilter: 'blur(3px)'
        }}>
          <div style={{
            width: '100%',
            maxWidth: '420px',
            backgroundColor: '#ffffff',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            boxShadow: '-4px 0 25px rgba(0,0,0,0.15)',
            animation: 'slideInRight 0.25s ease-out'
          }}>
            {/* Drawer Header */}
            <div style={{
              padding: '1.15rem 1.25rem',
              borderBottom: '1px solid #e5e7eb',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <ShoppingCart size={20} color="#0c831f" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#111827', margin: 0 }}>
                  My Cart ({totalCartCount} items)
                </h3>
              </div>
              <button
                onClick={() => setIsCartOpen(false)}
                style={{ color: '#9ca3af', padding: '0.25rem', borderRadius: '6px' }}
              >
                <X size={20} />
              </button>
            </div>

            {/* Cart Items List */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '1.25rem' }}>
              {totalCartCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '3.5rem 1rem', color: '#9ca3af' }}>
                  <ShoppingCart size={48} strokeWidth={1.5} style={{ margin: '0 auto 1rem', color: '#d1d5db' }} />
                  <p style={{ fontWeight: 700, color: '#374151', fontSize: '0.95rem' }}>Your basket is empty</p>
                  <p style={{ fontSize: '0.8rem', marginTop: '0.25rem' }}>
                    Browse fresh groceries or check AI recommendations!
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  {Object.values(cart).map(({ product, quantity }) => (
                    <div
                      key={product.product_id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '0.75rem',
                        borderRadius: '10px',
                        border: '1px solid #e5e7eb',
                        backgroundColor: '#ffffff'
                      }}
                    >
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '1.4rem' }}>{deptIcons[product.department.toLowerCase()] || '🛒'}</span>
                        <div style={{ minWidth: 0 }}>
                          <h5 style={{
                            fontSize: '0.825rem',
                            fontWeight: 700,
                            color: '#111827',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            margin: 0
                          }}>
                            {product.product_name}
                          </h5>
                          <span style={{ fontSize: '0.75rem', color: '#6b7280' }}>
                            ₹{product.price} × {quantity} = <strong>₹{product.price * quantity}</strong>
                          </span>
                        </div>
                      </div>

                      {/* Quantity Stepper */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginLeft: '0.5rem' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', backgroundColor: '#0c831f', borderRadius: '6px', padding: '0.15rem' }}>
                          <button
                            onClick={() => removeFromCart(product.product_id)}
                            style={{ width: '22px', height: '22px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Minus size={11} />
                          </button>
                          <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#ffffff', minWidth: '16px', textAlign: 'center' }}>
                            {quantity}
                          </span>
                          <button
                            onClick={() => addToCart(product, true)}
                            style={{ width: '22px', height: '22px', color: '#ffffff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <Plus size={11} />
                          </button>
                        </div>
                        <button
                          onClick={() => deleteItem(product.product_id)}
                          style={{ color: '#ef4444', padding: '0.2rem', marginLeft: '0.2rem' }}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Drawer Footer & Indian Rupee Checkout */}
            {totalCartCount > 0 && (
              <div style={{
                padding: '1.25rem',
                borderTop: '1px solid #e5e7eb',
                backgroundColor: '#f9fafb'
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.825rem', color: '#6b7280' }}>
                  <span>Items Subtotal</span>
                  <span>₹{cartSubtotal}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.35rem', fontSize: '0.825rem', color: '#6b7280' }}>
                  <span>Delivery Fee (10 Mins)</span>
                  <span style={{ color: '#0c831f', fontWeight: 700 }}>FREE</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.75rem', fontSize: '0.825rem', color: '#6b7280' }}>
                  <span>Govt. GST (5%)</span>
                  <span>₹{Math.round(cartSubtotal * 0.05)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '1rem', fontSize: '1.15rem', fontWeight: 900, color: '#111827' }}>
                  <span>Grand Total</span>
                  <span>₹{Math.round(cartSubtotal * 1.05)}</span>
                </div>

                <button
                  onClick={handleCheckout}
                  disabled={checkoutCelebration}
                  style={{
                    width: '100%',
                    backgroundColor: checkoutCelebration ? '#059669' : '#0c831f',
                    color: '#ffffff',
                    padding: '0.85rem',
                    borderRadius: '10px',
                    fontWeight: 800,
                    fontSize: '0.95rem',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: '0.5rem',
                    boxShadow: '0 4px 10px rgba(12, 131, 31, 0.35)',
                    transition: 'all 0.2s ease'
                  }}
                >
                  {checkoutCelebration ? (
                    <>
                      <CheckCircle2 size={20} /> Order Placed! Delivered in 10 Mins!
                    </>
                  ) : (
                    <>
                      Proceed to Pay ₹{Math.round(cartSubtotal * 1.05)}
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
        borderTop: '1px solid #e5e7eb',
        padding: '1.25rem',
        marginTop: 'auto',
        textAlign: 'center',
        fontSize: '0.8rem',
        color: '#6b7280'
      }}>
        <p>BlinkMarket • Instacart Market Basket Next Purchase AI • Prices in Indian Rupees (₹)</p>
      </footer>
    </div>
  );
}
