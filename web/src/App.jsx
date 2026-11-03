import React, { useState, useEffect, useMemo } from 'react';
import confetti from 'canvas-confetti';
import {
  ShoppingBag, Sparkles, Search, Trash2, Plus, Minus, X, Check,
  BarChart3, Store, User, ArrowRight, TrendingUp, Info, Clock,
  Calendar, Layers, ShieldCheck, RefreshCw, Zap, MapPin, ChevronRight,
  Flame, CheckCircle2, ShoppingCart, Heart, Star, Package, ChevronDown,
  UserCheck, Hash
} from 'lucide-react';

// Pre-trained dataset artifacts
import initialStats from './data/dataset_stats.json';
import initialCatalog from './data/products_catalog.json';
import initialDemoUsers from './data/demo_users.json';
import initialAffinities from './data/product_affinities.json';

const deptIcons = {
  produce: '🥦', 'dairy eggs': '🥛', bakery: '🍞', beverages: '🧃',
  snacks: '🥨', 'meat seafood': '🥩', frozen: '🧊', pantry: '🥫',
  deli: '🥪', 'canned goods': '🍲', 'dry goods pasta': '🍝',
  breakfast: '🥣', household: '🧹', 'personal care': '🧴',
  babies: '👶', pets: '🐾', alcohol: '🍷', international: '🍜',
  bulk: '🌾', other: '📦', missing: '🛒'
};

const deptDisplayName = {
  produce: 'Fresh Fruits & Vegetables', 'dairy eggs': 'Dairy, Bread & Eggs',
  bakery: 'Bakery & Breads', beverages: 'Cold Drinks & Juices',
  snacks: 'Snacks & Munchies', 'meat seafood': 'Fresh Meat & Fish',
  frozen: 'Frozen Food', pantry: 'Atta, Rice & Dals',
  deli: 'Deli & Breakfast Meats', 'canned goods': 'Canned & Soups',
  'dry goods pasta': 'Pasta & Noodles', breakfast: 'Cereals & Breakfast',
  household: 'Home & Cleaning', 'personal care': 'Personal Care & Hygiene',
  babies: 'Baby Care', pets: 'Pet Supplies', alcohol: 'Beverages & Wine',
  international: 'World Foods', bulk: 'Grains & Bulk', other: 'Other Groceries'
};

/* ─── Build user lookup map for typed user ID search ─── */
const demoUsersMap = {};
initialDemoUsers.forEach(u => { demoUsersMap[u.user_id] = u; });

export default function App() {
  const [activeTab, setActiveTab] = useState('shop');
  const [selectedUserId, setSelectedUserId] = useState(initialDemoUsers[0].user_id);
  const [cart, setCart] = useState({});
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDept, setSelectedDept] = useState('all');
  const [checkoutCelebration, setCheckoutCelebration] = useState(false);
  const [dynamicPredictions, setDynamicPredictions] = useState([]);
  const [lastAddedProduct, setLastAddedProduct] = useState(null);

  /* ─── NEW: Personalized Recommendation by User ID ─── */
  const [showPersonalRec, setShowPersonalRec] = useState(false);
  const [personalRecInput, setPersonalRecInput] = useState('');
  const [personalRecResults, setPersonalRecResults] = useState([]);
  const [personalRecUserId, setPersonalRecUserId] = useState(null);
  const [personalRecError, setPersonalRecError] = useState('');

  const handleFetchPersonalRecs = () => {
    const uid = Number(personalRecInput.trim());
    if (!uid || isNaN(uid)) {
      setPersonalRecError('Please enter a valid numeric User ID');
      setPersonalRecResults([]);
      return;
    }
    const userData = demoUsersMap[uid];
    if (!userData) {
      setPersonalRecError(`User #${uid} not found. Try: ${initialDemoUsers.slice(0, 5).map(u => u.user_id).join(', ')}`);
      setPersonalRecResults([]);
      return;
    }
    setPersonalRecError('');
    setPersonalRecUserId(uid);
    const candidates = userData.candidates || [];
    const scored = candidates.map(c => {
      const cat = initialCatalog.find(p => p.product_id === c.product_id) || {};
      return {
        product_id: c.product_id,
        product_name: c.product_name,
        department: c.department,
        price: cat.price || 49,
        mrp: cat.mrp || Math.round((cat.price || 49) * 1.25),
        unit: cat.unit || '1 pack',
        aisle: cat.aisle || '',
        dynamic_prob: c.pred_prob,
        purchase_count: c.purchase_count,
        orders_since_last: c.orders_since_last_purchase,
        actual_reordered: c.actual_reordered_in_next
      };
    }).sort((a, b) => b.dynamic_prob - a.dynamic_prob);
    setPersonalRecResults(scored.slice(0, 10));
  };

  const currentUser = useMemo(() => {
    return initialDemoUsers.find(u => u.user_id === selectedUserId) || initialDemoUsers[0];
  }, [selectedUserId]);

  const departments = useMemo(() => {
    const set = new Set();
    initialCatalog.forEach(p => { if (p.department) set.add(p.department); });
    return ['all', ...Array.from(set).sort()];
  }, []);

  const filteredProducts = useMemo(() => {
    return initialCatalog.filter(p => {
      const matchDept = selectedDept === 'all' || p.department.toLowerCase() === selectedDept.toLowerCase();
      const matchSearch = !searchQuery ||
        p.product_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        p.aisle.toLowerCase().includes(searchQuery.toLowerCase());
      return matchDept && matchSearch;
    });
  }, [selectedDept, searchQuery]);

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
        product_id: c.product_id, product_name: c.product_name,
        department: c.department, price: cat.price || 49,
        mrp: cat.mrp || Math.round((cat.price || 49) * 1.25),
        unit: cat.unit || '1 pack', dynamic_prob: Number(dynamicProb.toFixed(4)),
        cart_synergy: Number(boost.toFixed(3)), in_cart: cartSet.has(c.product_id),
        purchase_count: c.purchase_count, orders_since_last: c.orders_since_last_purchase,
        actual_reordered: c.actual_reordered_in_next
      };
    });
    scored.sort((a, b) => b.dynamic_prob - a.dynamic_prob);
    setDynamicPredictions(scored.slice(0, 10));
  }, [selectedUserId, cart, currentUser]);

  const sideRecommendations = useMemo(() => {
    const recs = [];
    if (lastAddedProduct) {
      const affList = initialAffinities[lastAddedProduct.product_id] || [];
      affList.forEach(aff => {
        const p = initialCatalog.find(item => item.product_id === aff.product_id);
        if (p && p.product_id !== lastAddedProduct.product_id && !cart[p.product_id]) {
          recs.push({ ...p, matchScore: Math.round(aff.affinity * 100), reason: `Pairs with ${lastAddedProduct.product_name.slice(0, 18)}` });
        }
      });
    }
    if (recs.length < 4) {
      dynamicPredictions.forEach(pred => {
        if (!cart[pred.product_id] && (!lastAddedProduct || pred.product_id !== lastAddedProduct.product_id) && !recs.find(r => r.product_id === pred.product_id)) {
          recs.push({ ...pred, matchScore: Math.round(pred.dynamic_prob * 100), reason: 'AI Predicted Next Buy' });
        }
      });
    }
    if (recs.length < 4) {
      initialCatalog.slice(0, 8).forEach(cat => {
        if (!cart[cat.product_id] && !recs.find(r => r.product_id === cat.product_id)) {
          recs.push({ ...cat, matchScore: 88, reason: 'Trending Now' });
        }
      });
    }
    return recs.slice(0, 4);
  }, [lastAddedProduct, dynamicPredictions, cart]);

  const addToCart = (product) => {
    setCart(prev => {
      const existing = prev[product.product_id];
      return { ...prev, [product.product_id]: { product, quantity: (existing ? existing.quantity + 1 : 1) } };
    });
    setLastAddedProduct(product);
  };

  const removeFromCart = (productId) => {
    setCart(prev => {
      const next = { ...prev };
      if (next[productId]) {
        if (next[productId].quantity > 1) next[productId].quantity -= 1;
        else delete next[productId];
      }
      return next;
    });
  };

  const deleteItem = (productId) => {
    setCart(prev => { const next = { ...prev }; delete next[productId]; return next; });
  };

  const totalCartCount = useMemo(() => Object.values(cart).reduce((sum, item) => sum + item.quantity, 0), [cart]);
  const cartSubtotal = useMemo(() => Object.values(cart).reduce((sum, item) => sum + (item.product.price * item.quantity), 0), [cart]);
  const cartTotal = Math.round(cartSubtotal * 1.05);

  const handleCheckout = () => {
    if (totalCartCount === 0) return;
    confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    setCheckoutCelebration(true);
    setCart({});
    setLastAddedProduct(null);
    setTimeout(() => { setCheckoutCelebration(false); setIsCartOpen(false); }, 2800);
  };

  /* ─────────────────── RENDER ─────────────────── */
  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', backgroundColor: '#f8fafc', fontFamily: "'Inter', 'Plus Jakarta Sans', system-ui, -apple-system, sans-serif" }}>

      {/* ═══════════ TOP PROMO BAR ═══════════ */}
      <div style={{
        background: 'linear-gradient(90deg, #0f172a 0%, #1e293b 100%)',
        color: '#94a3b8', padding: '0.4rem 1rem', fontSize: '0.72rem',
        fontWeight: 600, display: 'flex', justifyContent: 'center',
        alignItems: 'center', gap: '1.5rem', letterSpacing: '0.03em'
      }}>
        <span><Zap size={11} style={{ verticalAlign: '-1px' }} /> Free delivery on orders above <span style={{ color: '#fbbf24' }}>₹199</span></span>
        <span style={{ color: '#334155' }}>|</span>
        <span><Clock size={11} style={{ verticalAlign: '-1px' }} /> Express 10-min delivery available</span>
        <span style={{ color: '#334155' }}>|</span>
        <span><ShieldCheck size={11} style={{ verticalAlign: '-1px' }} /> 100% Genuine Products</span>
      </div>

      {/* ═══════════ HEADER / NAVBAR ═══════════ */}
      <header style={{
        backgroundColor: '#ffffff', borderBottom: '1px solid #e2e8f0',
        position: 'sticky', top: 0, zIndex: 50,
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)'
      }}>
        <div style={{
          maxWidth: '1440px', margin: '0 auto', padding: '0.65rem 1.5rem',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          gap: '1.5rem'
        }}>
          {/* Brand */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', cursor: 'pointer', flexShrink: 0 }} onClick={() => setActiveTab('shop')}>
            <div style={{
              width: 40, height: 40, borderRadius: 12,
              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: '1.2rem', fontWeight: 900,
              boxShadow: '0 2px 8px rgba(34,197,94,0.35)'
            }}>🛒</div>
            <div>
              <div style={{ fontSize: '1.15rem', fontWeight: 800, color: '#0f172a', lineHeight: 1.1, letterSpacing: '-0.02em' }}>
                fresh<span style={{ color: '#16a34a' }}>cart</span>
              </div>
              <div style={{ fontSize: '0.62rem', fontWeight: 600, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase' }}>grocery-ai</div>
            </div>
          </div>

          {/* Search */}
          <div style={{ position: 'relative', flex: '1 1 420px', maxWidth: '580px' }}>
            <Search size={17} color="#94a3b8" style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text" placeholder="Search for groceries, fruits, snacks..."
              value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                width: '100%', padding: '0.65rem 2.5rem 0.65rem 2.6rem',
                borderRadius: 50, border: '1.5px solid #e2e8f0', backgroundColor: '#f8fafc',
                fontSize: '0.85rem', fontWeight: 500, outline: 'none',
                transition: 'all 0.2s', color: '#1e293b'
              }}
              onFocus={e => { e.target.style.borderColor = '#22c55e'; e.target.style.backgroundColor = '#fff'; e.target.style.boxShadow = '0 0 0 3px rgba(34,197,94,0.12)'; }}
              onBlur={e => { e.target.style.borderColor = '#e2e8f0'; e.target.style.backgroundColor = '#f8fafc'; e.target.style.boxShadow = 'none'; }}
            />
            {searchQuery && (
              <button onClick={() => setSearchQuery('')} style={{ position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)', color: '#94a3b8' }}>
                <X size={15} />
              </button>
            )}
          </div>

          {/* Right nav actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            {/* User Switcher */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              backgroundColor: '#f0fdf4', padding: '0.4rem 0.7rem',
              borderRadius: 50, border: '1px solid #dcfce7'
            }}>
              <User size={14} color="#16a34a" />
              <select
                value={selectedUserId}
                onChange={(e) => setSelectedUserId(Number(e.target.value))}
                style={{
                  backgroundColor: 'transparent', border: 'none',
                  fontWeight: 700, fontSize: '0.78rem', color: '#15803d',
                  cursor: 'pointer', outline: 'none', maxWidth: 160
                }}
              >
                {initialDemoUsers.map((u) => (
                  <option key={u.user_id} value={u.user_id}>
                    User #{u.user_id} ({u.total_prior_orders} orders)
                  </option>
                ))}
              </select>
            </div>

            {/* Personalized Rec Button */}
            <button
              onClick={() => setShowPersonalRec(!showPersonalRec)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.35rem',
                backgroundColor: showPersonalRec ? '#7c3aed' : '#f5f3ff',
                color: showPersonalRec ? '#fff' : '#7c3aed',
                padding: '0.5rem 0.85rem', borderRadius: 50,
                fontSize: '0.78rem', fontWeight: 700,
                border: '1.5px solid ' + (showPersonalRec ? '#7c3aed' : '#ddd6fe'),
                transition: 'all 0.2s'
              }}
              title="Get personalized recommendations by User ID"
            >
              <Sparkles size={14} />
              AI Recs
            </button>

            {/* Nav Links */}
            <button
              onClick={() => setActiveTab(activeTab === 'shop' ? 'dataset' : 'shop')}
              style={{
                fontSize: '0.8rem', fontWeight: 700,
                color: activeTab === 'dataset' ? '#16a34a' : '#64748b',
                display: 'flex', alignItems: 'center', gap: '0.3rem',
                padding: '0.5rem 0.7rem', borderRadius: 50,
                backgroundColor: activeTab === 'dataset' ? '#f0fdf4' : 'transparent',
                transition: 'all 0.15s'
              }}
            >
              <BarChart3 size={15} />
              {activeTab === 'shop' ? 'Analytics' : 'Shop'}
            </button>

            {/* Cart Button */}
            <button
              onClick={() => setIsCartOpen(true)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                background: 'linear-gradient(135deg, #16a34a, #15803d)',
                color: '#fff', padding: '0.55rem 1.1rem', borderRadius: 50,
                fontWeight: 800, fontSize: '0.85rem',
                boxShadow: '0 2px 10px rgba(22,163,74,0.3)',
                transition: 'all 0.2s'
              }}
            >
              <ShoppingCart size={17} />
              <span>{totalCartCount} · ₹{cartTotal}</span>
            </button>
          </div>
        </div>
      </header>

      {/* ═══════════ PERSONALIZED REC PANEL (slide down) ═══════════ */}
      {showPersonalRec && (
        <div style={{
          backgroundColor: '#faf5ff', borderBottom: '1px solid #e9d5ff',
          padding: '1rem 1.5rem', animation: 'slideDown 0.3s ease'
        }}>
          <div style={{ maxWidth: '1440px', margin: '0 auto' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
              <Sparkles size={18} color="#7c3aed" />
              <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#581c87', margin: 0 }}>
                Personalized Recommendations by User ID
              </h3>
              <button onClick={() => setShowPersonalRec(false)} style={{ marginLeft: 'auto', color: '#a78bfa' }}><X size={18} /></button>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem', marginBottom: '0.75rem' }}>
              <div style={{ position: 'relative', flex: '0 1 300px' }}>
                <Hash size={15} color="#a78bfa" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)' }} />
                <input
                  type="number" placeholder="Enter User ID (e.g. 12640)"
                  value={personalRecInput}
                  onChange={(e) => setPersonalRecInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleFetchPersonalRecs(); }}
                  style={{
                    width: '100%', padding: '0.6rem 0.85rem 0.6rem 2.3rem',
                    borderRadius: 50, border: '1.5px solid #d8b4fe', backgroundColor: '#fff',
                    fontSize: '0.85rem', fontWeight: 600, outline: 'none', color: '#3b0764'
                  }}
                />
              </div>
              <button
                onClick={handleFetchPersonalRecs}
                style={{
                  background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
                  color: '#fff', padding: '0.6rem 1.25rem', borderRadius: 50,
                  fontWeight: 800, fontSize: '0.85rem',
                  boxShadow: '0 2px 8px rgba(124,58,237,0.3)',
                  display: 'flex', alignItems: 'center', gap: '0.35rem'
                }}
              >
                <UserCheck size={15} /> Get Recommendations
              </button>
              <span style={{ fontSize: '0.72rem', color: '#7c3aed', fontWeight: 600 }}>
                Available IDs: {initialDemoUsers.slice(0, 6).map(u => u.user_id).join(', ')}...
              </span>
            </div>

            {personalRecError && (
              <div style={{ color: '#dc2626', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                <Info size={14} /> {personalRecError}
              </div>
            )}

            {personalRecResults.length > 0 && (
              <div>
                <div style={{ fontSize: '0.78rem', fontWeight: 700, color: '#6b21a8', marginBottom: '0.5rem' }}>
                  🎯 Top 10 predicted products for User #{personalRecUserId}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.65rem' }}>
                  {personalRecResults.map((item, idx) => {
                    const inCart = Boolean(cart[item.product_id]);
                    return (
                      <div key={item.product_id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.6rem',
                        backgroundColor: '#fff', padding: '0.65rem 0.85rem',
                        borderRadius: 14, border: inCart ? '1.5px solid #22c55e' : '1px solid #e9d5ff',
                        boxShadow: '0 1px 4px rgba(124,58,237,0.06)',
                        transition: 'all 0.15s'
                      }}>
                        <div style={{
                          width: 32, height: 32, borderRadius: 8,
                          backgroundColor: '#f5f3ff', display: 'flex',
                          alignItems: 'center', justifyContent: 'center',
                          fontSize: '0.75rem', fontWeight: 900, color: '#7c3aed', flexShrink: 0
                        }}>#{idx + 1}</div>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '0.78rem', fontWeight: 700, color: '#1e293b',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>{item.product_name}</div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.15rem' }}>
                            <span style={{ fontSize: '0.78rem', fontWeight: 800, color: '#0f172a' }}>₹{item.price}</span>
                            <span style={{
                              fontSize: '0.62rem', fontWeight: 700,
                              backgroundColor: '#f0fdf4', color: '#16a34a',
                              padding: '0.05rem 0.4rem', borderRadius: 50
                            }}>{Math.round(item.dynamic_prob * 100)}% likely</span>
                          </div>
                        </div>
                        <button
                          onClick={() => addToCart(item)}
                          style={{
                            backgroundColor: inCart ? '#f0fdf4' : '#7c3aed',
                            color: inCart ? '#16a34a' : '#fff',
                            border: inCart ? '1px solid #bbf7d0' : 'none',
                            padding: '0.35rem 0.65rem', borderRadius: 8,
                            fontSize: '0.7rem', fontWeight: 800, flexShrink: 0
                          }}
                        >{inCart ? '✓ Added' : '+ Add'}</button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ MAIN CONTENT ═══════════ */}
      <main style={{ maxWidth: '1440px', margin: '0 auto', padding: '1.25rem 1.5rem', width: '100%', flex: 1 }}>
        {activeTab === 'shop' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) 340px', gap: '1.5rem', alignItems: 'start' }}>

            {/* ──── LEFT: Categories + Products ──── */}
            <div>
              {/* Category chips */}
              <div style={{
                backgroundColor: '#fff', padding: '0.75rem 1rem', borderRadius: 16,
                border: '1px solid #e2e8f0', marginBottom: '1.25rem',
                boxShadow: '0 1px 2px rgba(0,0,0,0.03)'
              }}>
                <div style={{ display: 'flex', gap: '0.45rem', overflowX: 'auto', scrollbarWidth: 'none', paddingBottom: '0.15rem' }}>
                  {departments.map(dept => {
                    const isSelected = selectedDept === dept;
                    const icon = dept === 'all' ? '✨' : (deptIcons[dept.toLowerCase()] || '🛒');
                    const label = dept === 'all' ? 'All' : (deptDisplayName[dept.toLowerCase()] || dept);
                    return (
                      <button key={dept} onClick={() => setSelectedDept(dept)} style={{
                        whiteSpace: 'nowrap', padding: '0.4rem 0.85rem', borderRadius: 50,
                        fontSize: '0.78rem', fontWeight: 700,
                        backgroundColor: isSelected ? '#16a34a' : '#f1f5f9',
                        color: isSelected ? '#fff' : '#475569',
                        border: isSelected ? 'none' : '1px solid #e2e8f0',
                        display: 'flex', alignItems: 'center', gap: '0.35rem',
                        transition: 'all 0.15s', boxShadow: isSelected ? '0 2px 6px rgba(22,163,74,0.25)' : 'none'
                      }}>
                        <span style={{ fontSize: '0.9rem' }}>{icon}</span>
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Section header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.85rem' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                  {selectedDept === 'all' ? 'All Products' : (deptDisplayName[selectedDept.toLowerCase()] || selectedDept)}
                </h2>
                <span style={{
                  fontSize: '0.75rem', color: '#94a3b8', fontWeight: 600,
                  backgroundColor: '#f1f5f9', padding: '0.3rem 0.7rem', borderRadius: 50
                }}>
                  {filteredProducts.length} items
                </span>
              </div>

              {/* Product Grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '0.85rem' }}>
                {filteredProducts.map(product => {
                  const cartItem = cart[product.product_id];
                  const inCart = Boolean(cartItem);
                  const discountPct = Math.round(((product.mrp - product.price) / product.mrp) * 100);
                  return (
                    <div key={product.product_id} style={{
                      backgroundColor: '#fff', borderRadius: 16,
                      border: inCart ? '2px solid #22c55e' : '1px solid #e2e8f0',
                      padding: '0.85rem', display: 'flex', flexDirection: 'column',
                      justifyContent: 'space-between',
                      boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
                      transition: 'all 0.2s',
                      transform: inCart ? 'scale(1.01)' : 'none'
                    }}>
                      {/* Top row: badge + emoji */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.45rem' }}>
                        {discountPct > 0 ? (
                          <span style={{
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            color: '#fff', fontSize: '0.6rem', fontWeight: 800,
                            padding: '0.15rem 0.5rem', borderRadius: 50
                          }}>{discountPct}% OFF</span>
                        ) : (
                          <span style={{
                            backgroundColor: '#f0fdf4', color: '#16a34a',
                            fontSize: '0.6rem', fontWeight: 800,
                            padding: '0.15rem 0.5rem', borderRadius: 50
                          }}>FRESH</span>
                        )}
                        <span style={{ fontSize: '1.5rem' }}>{deptIcons[product.department.toLowerCase()] || '🛒'}</span>
                      </div>

                      {/* Product info */}
                      <div>
                        <span style={{ fontSize: '0.68rem', fontWeight: 600, color: '#94a3b8' }}>{product.unit || '1 pack'}</span>
                        <h4 style={{
                          fontSize: '0.85rem', fontWeight: 700, lineHeight: 1.3,
                          color: '#1e293b', margin: '0.15rem 0 0.2rem', height: '2.2rem',
                          overflow: 'hidden', display: '-webkit-box',
                          WebkitLineClamp: 2, WebkitBoxOrient: 'vertical'
                        }}>{product.product_name}</h4>
                        <p style={{ fontSize: '0.68rem', color: '#94a3b8', textTransform: 'capitalize', margin: 0 }}>{product.aisle}</p>
                      </div>

                      {/* Price + Add */}
                      <div style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        marginTop: '0.75rem', paddingTop: '0.6rem',
                        borderTop: '1px solid #f1f5f9'
                      }}>
                        <div>
                          <div style={{ fontSize: '1.05rem', fontWeight: 900, color: '#0f172a' }}>₹{product.price}</div>
                          <div style={{ fontSize: '0.68rem', color: '#cbd5e1', textDecoration: 'line-through' }}>₹{product.mrp}</div>
                        </div>
                        {inCart ? (
                          <div style={{
                            display: 'flex', alignItems: 'center', gap: '0.2rem',
                            background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                            borderRadius: 10, padding: '0.2rem 0.35rem'
                          }}>
                            <button onClick={() => removeFromCart(product.product_id)} style={{ width: 22, height: 22, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Minus size={13} />
                            </button>
                            <span style={{ fontSize: '0.82rem', fontWeight: 900, color: '#fff', minWidth: 18, textAlign: 'center' }}>{cartItem.quantity}</span>
                            <button onClick={() => addToCart(product)} style={{ width: 22, height: 22, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <Plus size={13} />
                            </button>
                          </div>
                        ) : (
                          <button onClick={() => addToCart(product)} style={{
                            border: '1.5px solid #22c55e', backgroundColor: '#fff',
                            color: '#16a34a', padding: '0.4rem 1rem', borderRadius: 10,
                            fontSize: '0.78rem', fontWeight: 800, transition: 'all 0.15s'
                          }}>+ ADD</button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ──── RIGHT COLUMN: Recs + Cart ──── */}
            <div style={{ position: 'sticky', top: 105, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {/* AI Recommendations Card */}
              <div style={{
                backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 15px rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  background: 'linear-gradient(135deg, #0f172a 0%, #1e293b 100%)',
                  color: '#fff', padding: '0.75rem 1rem',
                  display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: 8,
                    background: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}>
                    <Sparkles size={14} color="#0f172a" />
                  </div>
                  <div>
                    <div style={{ fontSize: '0.78rem', fontWeight: 800, letterSpacing: '0.02em' }}>
                      {lastAddedProduct ? 'Frequently Bought Together' : 'Smart Picks for You'}
                    </div>
                    <div style={{ fontSize: '0.65rem', color: '#94a3b8' }}>
                      {lastAddedProduct ? `Goes well with ${lastAddedProduct.product_name.slice(0, 20)}` : `AI picks for User #${currentUser.user_id}`}
                    </div>
                  </div>
                </div>

                <div style={{ padding: '0.7rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {sideRecommendations.map(item => {
                    const inCart = Boolean(cart[item.product_id]);
                    return (
                      <div key={item.product_id} style={{
                        display: 'flex', alignItems: 'center', gap: '0.55rem',
                        padding: '0.55rem 0.65rem', borderRadius: 14,
                        border: '1px solid #f1f5f9', backgroundColor: '#fafafa',
                        transition: 'all 0.15s'
                      }}>
                        <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{deptIcons[item.department?.toLowerCase()] || '🛒'}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <h5 style={{
                            fontSize: '0.78rem', fontWeight: 700, color: '#1e293b', margin: 0,
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis'
                          }}>{item.product_name}</h5>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', marginTop: '0.1rem' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 800, color: '#0f172a' }}>₹{item.price || 49}</span>
                            <span style={{
                              fontSize: '0.58rem', fontWeight: 700,
                              backgroundColor: item.matchScore > 70 ? '#fef3c7' : '#f0fdf4',
                              color: item.matchScore > 70 ? '#92400e' : '#16a34a',
                              padding: '0.05rem 0.35rem', borderRadius: 50
                            }}>{item.matchScore}% match</span>
                          </div>
                          <div style={{ fontSize: '0.62rem', color: '#94a3b8', marginTop: '0.1rem' }}>{item.reason}</div>
                        </div>
                        <button onClick={() => addToCart(item)} style={{
                          marginLeft: '0.3rem',
                          backgroundColor: inCart ? '#f0fdf4' : '#0f172a',
                          color: inCart ? '#16a34a' : '#fff',
                          border: inCart ? '1px solid #bbf7d0' : 'none',
                          padding: '0.35rem 0.6rem', borderRadius: 8,
                          fontSize: '0.7rem', fontWeight: 800, flexShrink: 0,
                          transition: 'all 0.15s'
                        }}>{inCart ? '✓' : '+ Add'}</button>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Cart Card */}
              <div style={{
                backgroundColor: '#fff', borderRadius: 20, overflow: 'hidden',
                border: '1px solid #e2e8f0',
                boxShadow: '0 4px 15px rgba(0,0,0,0.04)'
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '0.75rem 1rem', borderBottom: '1px solid #f1f5f9'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <ShoppingCart size={17} color="#16a34a" />
                    <h4 style={{ fontSize: '0.95rem', fontWeight: 800, margin: 0, color: '#0f172a' }}>
                      My Basket <span style={{ color: '#94a3b8', fontWeight: 600 }}>({totalCartCount})</span>
                    </h4>
                  </div>
                  {totalCartCount > 0 && (
                    <button onClick={() => { setCart({}); setLastAddedProduct(null); }}
                      style={{ fontSize: '0.72rem', color: '#ef4444', fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 6, backgroundColor: '#fef2f2' }}>
                      Clear all
                    </button>
                  )}
                </div>

                {totalCartCount === 0 ? (
                  <div style={{ textAlign: 'center', padding: '2rem 1rem', color: '#94a3b8' }}>
                    <Package size={36} style={{ margin: '0 auto 0.5rem', opacity: 0.4 }} />
                    <p style={{ fontSize: '0.82rem', fontWeight: 600, color: '#64748b', margin: 0 }}>Your basket is empty</p>
                    <p style={{ fontSize: '0.72rem', margin: '0.2rem 0 0', color: '#cbd5e1' }}>Add items to get started!</p>
                  </div>
                ) : (
                  <div style={{ padding: '0.65rem 1rem' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.45rem', maxHeight: 200, overflowY: 'auto', marginBottom: '0.75rem' }}>
                      {Object.values(cart).map(({ product, quantity }) => (
                        <div key={product.product_id} style={{
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                          fontSize: '0.8rem', padding: '0.3rem 0',
                          borderBottom: '1px solid #f8fafc'
                        }}>
                          <div style={{ flex: 1, minWidth: 0, paddingRight: '0.5rem' }}>
                            <div style={{ fontWeight: 700, color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.product_name}</div>
                            <span style={{ fontSize: '0.7rem', color: '#94a3b8' }}>₹{product.price} × {quantity}</span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                            <div style={{
                              display: 'flex', alignItems: 'center',
                              background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                              borderRadius: 6, padding: '0.1rem 0.2rem'
                            }}>
                              <button onClick={() => removeFromCart(product.product_id)} style={{ color: '#fff', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={10} /></button>
                              <span style={{ color: '#fff', fontSize: '0.72rem', fontWeight: 800, minWidth: 14, textAlign: 'center' }}>{quantity}</span>
                              <button onClick={() => addToCart(product)} style={{ color: '#fff', width: 18, height: 18, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={10} /></button>
                            </div>
                            <button onClick={() => deleteItem(product.product_id)} style={{ color: '#ef4444', padding: '0.1rem', opacity: 0.6 }}><Trash2 size={13} /></button>
                          </div>
                        </div>
                      ))}
                    </div>

                    <div style={{ borderTop: '1px solid #f1f5f9', paddingTop: '0.65rem', marginBottom: '0.65rem', fontSize: '0.78rem', color: '#64748b' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span>Subtotal</span><span>₹{cartSubtotal}</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span>Delivery</span><span style={{ color: '#16a34a', fontWeight: 700 }}>FREE</span>
                      </div>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}>
                        <span>GST (5%)</span><span>₹{Math.round(cartSubtotal * 0.05)}</span>
                      </div>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between',
                        fontSize: '1.05rem', fontWeight: 900, color: '#0f172a',
                        marginTop: '0.4rem', paddingTop: '0.4rem', borderTop: '2px solid #e2e8f0'
                      }}>
                        <span>Total</span><span>₹{cartTotal}</span>
                      </div>
                    </div>

                    <button onClick={handleCheckout} disabled={checkoutCelebration} style={{
                      width: '100%',
                      background: checkoutCelebration ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #16a34a, #15803d)',
                      color: '#fff', padding: '0.7rem', borderRadius: 14,
                      fontWeight: 800, fontSize: '0.88rem',
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem',
                      boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
                      transition: 'all 0.2s'
                    }}>
                      {checkoutCelebration ? (
                        <><CheckCircle2 size={16} /> Order Placed! Arriving in 10 min</>
                      ) : (
                        <><ShoppingBag size={16} /> Checkout · ₹{cartTotal}</>
                      )}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        ) : (
          /* ═══════════ DATASET / ANALYTICS PAGE ═══════════ */
          <div>
            <h2 style={{ fontSize: '1.35rem', fontWeight: 900, color: '#0f172a', marginBottom: '1.25rem' }}>
              📊 Model & Dataset Analytics
            </h2>

            {/* Metric Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '0.85rem', marginBottom: '1.75rem' }}>
              {[
                { label: 'Precision@10', value: `${initialStats.metrics.precision_at_10_percent}%`, icon: <TrendingUp size={18} />, color: '#16a34a', bg: '#f0fdf4', border: '#bbf7d0', sub: `${initialStats.metrics.unseen_validation_users.toLocaleString()} unseen users` },
                { label: 'Recall@10', value: `${initialStats.metrics.recall_at_10_percent}%`, icon: <BarChart3 size={18} />, color: '#0284c7', bg: '#f0f9ff', border: '#bae6fd', sub: 'Coverage of actual basket' },
                { label: 'Total Orders', value: initialStats.orders.toLocaleString(), icon: <Package size={18} />, color: '#7c3aed', bg: '#f5f3ff', border: '#ddd6fe', sub: '206,209 unique shoppers' },
                { label: 'Reorder Rate', value: `${(initialStats.reorder_rate * 100).toFixed(1)}%`, icon: <RefreshCw size={18} />, color: '#ea580c', bg: '#fff7ed', border: '#fed7aa', sub: '49,688 unique products' }
              ].map(m => (
                <div key={m.label} style={{
                  backgroundColor: '#fff', padding: '1.25rem', borderRadius: 18,
                  border: `1px solid ${m.border}`,
                  boxShadow: '0 2px 8px rgba(0,0,0,0.03)'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.5rem' }}>
                    <div style={{
                      width: 32, height: 32, borderRadius: 10,
                      backgroundColor: m.bg, color: m.color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center'
                    }}>{m.icon}</div>
                    <span style={{ fontSize: '0.72rem', fontWeight: 700, color: m.color, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{m.label}</span>
                  </div>
                  <div style={{ fontSize: '2.1rem', fontWeight: 900, color: '#0f172a', lineHeight: 1 }}>{m.value}</div>
                  <p style={{ fontSize: '0.72rem', color: '#94a3b8', margin: '0.3rem 0 0' }}>{m.sub}</p>
                </div>
              ))}
            </div>

            {/* Charts */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: '1.25rem', marginBottom: '2rem' }}>
              {/* Orders by Weekday */}
              <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '1rem' }}>Orders by Day of Week</h3>
                <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.75rem', height: 160, paddingBottom: '1.5rem', position: 'relative' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayName, idx) => {
                    const count = initialStats.orders_by_weekday[idx] || 0;
                    const maxVal = Math.max(...Object.values(initialStats.orders_by_weekday));
                    const heightPct = Math.round((count / maxVal) * 100);
                    const isPeak = idx === 0 || idx === 1;
                    return (
                      <div key={dayName} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', height: '100%', justifyContent: 'flex-end' }}>
                        <span style={{ fontSize: '0.68rem', fontWeight: 700, color: isPeak ? '#16a34a' : '#94a3b8', marginBottom: 4 }}>{(count / 1000).toFixed(0)}k</span>
                        <div style={{
                          width: '100%', height: `${heightPct}%`,
                          background: isPeak ? 'linear-gradient(180deg, #22c55e, #16a34a)' : 'linear-gradient(180deg, #e2e8f0, #cbd5e1)',
                          borderRadius: '8px 8px 0 0', transition: 'height 0.3s'
                        }} />
                        <span style={{ position: 'absolute', bottom: 0, fontSize: '0.72rem', fontWeight: 700, color: '#64748b' }}>{dayName}</span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Top Products */}
              <div style={{ backgroundColor: '#fff', padding: '1.5rem', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 8px rgba(0,0,0,0.03)' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800, color: '#0f172a', marginBottom: '0.75rem' }}>Top 10 Products in Instacart</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.55rem' }}>
                  {initialStats.top_10_products.map((p, idx) => {
                    const maxCount = initialStats.top_10_products[0].order_count;
                    const pct = Math.round((p.order_count / maxCount) * 100);
                    return (
                      <div key={p.product_id}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', fontWeight: 700, marginBottom: 2 }}>
                          <span style={{ color: '#1e293b' }}>{idx + 1}. {p.product_name}</span>
                          <span style={{ color: '#94a3b8' }}>{p.order_count.toLocaleString()}</span>
                        </div>
                        <div style={{ width: '100%', height: 6, backgroundColor: '#f1f5f9', borderRadius: 50, overflow: 'hidden' }}>
                          <div style={{
                            width: `${pct}%`, height: '100%',
                            background: idx === 0 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : 'linear-gradient(90deg, #93c5fd, #3b82f6)',
                            borderRadius: 50, transition: 'width 0.5s'
                          }} />
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

      {/* ═══════════ FOOTER ═══════════ */}
      <footer style={{
        backgroundColor: '#0f172a', borderTop: '1px solid #1e293b',
        padding: '1.25rem 1.5rem', marginTop: 'auto', textAlign: 'center'
      }}>
        <div style={{ fontSize: '0.82rem', color: '#94a3b8', fontWeight: 600 }}>
          <span style={{ color: '#22c55e', fontWeight: 800 }}>freshcart-grocery-ai</span> · Instacart Market Basket Analysis · Powered by LightGBM
        </div>
        <div style={{ fontSize: '0.68rem', color: '#475569', marginTop: '0.3rem' }}>
          Prices in Indian Rupees (₹) · Real Instacart Dataset · © 2026
        </div>
      </footer>

      {/* ═══════════ CART OVERLAY (mobile / full drawer) ═══════════ */}
      {isCartOpen && (
        <div style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          zIndex: 100, display: 'flex', justifyContent: 'flex-end'
        }}>
          <div onClick={() => setIsCartOpen(false)} style={{
            position: 'absolute', inset: 0, backgroundColor: 'rgba(0,0,0,0.4)',
            backdropFilter: 'blur(2px)'
          }} />
          <div style={{
            position: 'relative', width: '100%', maxWidth: 420,
            backgroundColor: '#fff', boxShadow: '-4px 0 20px rgba(0,0,0,0.1)',
            animation: 'slideInRight 0.25s ease', display: 'flex', flexDirection: 'column'
          }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0'
            }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: '#0f172a', margin: 0 }}>
                🛒 Cart ({totalCartCount} items)
              </h3>
              <button onClick={() => setIsCartOpen(false)} style={{ color: '#64748b', padding: '0.25rem' }}><X size={20} /></button>
            </div>

            <div style={{ flex: 1, overflowY: 'auto', padding: '1rem 1.25rem' }}>
              {totalCartCount === 0 ? (
                <div style={{ textAlign: 'center', padding: '3rem 1rem', color: '#94a3b8' }}>
                  <Package size={48} style={{ margin: '0 auto 0.75rem', opacity: 0.3 }} />
                  <p style={{ fontSize: '0.9rem', fontWeight: 600, color: '#64748b' }}>Your cart is empty</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.65rem' }}>
                  {Object.values(cart).map(({ product, quantity }) => (
                    <div key={product.product_id} style={{
                      display: 'flex', alignItems: 'center', gap: '0.75rem',
                      padding: '0.65rem', borderRadius: 14,
                      border: '1px solid #f1f5f9', backgroundColor: '#fafafa'
                    }}>
                      <span style={{ fontSize: '1.5rem' }}>{deptIcons[product.department?.toLowerCase()] || '🛒'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: '0.85rem', color: '#1e293b', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{product.product_name}</div>
                        <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>₹{product.price} × {quantity} = ₹{product.price * quantity}</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                        <div style={{
                          display: 'flex', alignItems: 'center',
                          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
                          borderRadius: 8, padding: '0.15rem 0.3rem'
                        }}>
                          <button onClick={() => removeFromCart(product.product_id)} style={{ color: '#fff', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Minus size={12} /></button>
                          <span style={{ color: '#fff', fontSize: '0.8rem', fontWeight: 800, minWidth: 18, textAlign: 'center' }}>{quantity}</span>
                          <button onClick={() => addToCart(product)} style={{ color: '#fff', width: 22, height: 22, display: 'flex', alignItems: 'center', justifyContent: 'center' }}><Plus size={12} /></button>
                        </div>
                        <button onClick={() => deleteItem(product.product_id)} style={{ color: '#ef4444', padding: '0.15rem' }}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {totalCartCount > 0 && (
              <div style={{ padding: '1rem 1.25rem', borderTop: '1px solid #e2e8f0' }}>
                <div style={{ fontSize: '0.82rem', color: '#64748b', marginBottom: '0.65rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>Subtotal</span><span>₹{cartSubtotal}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.2rem' }}><span>Delivery</span><span style={{ color: '#16a34a', fontWeight: 700 }}>FREE</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}><span>GST (5%)</span><span>₹{Math.round(cartSubtotal * 0.05)}</span></div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1.1rem', fontWeight: 900, color: '#0f172a', marginTop: '0.5rem', paddingTop: '0.5rem', borderTop: '2px solid #e2e8f0' }}>
                    <span>Total</span><span>₹{cartTotal}</span>
                  </div>
                </div>
                <button onClick={handleCheckout} disabled={checkoutCelebration} style={{
                  width: '100%',
                  background: checkoutCelebration ? 'linear-gradient(135deg, #059669, #047857)' : 'linear-gradient(135deg, #16a34a, #15803d)',
                  color: '#fff', padding: '0.8rem', borderRadius: 14,
                  fontWeight: 800, fontSize: '0.95rem',
                  boxShadow: '0 4px 12px rgba(22,163,74,0.3)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem'
                }}>
                  {checkoutCelebration ? <><CheckCircle2 size={18} /> Order Placed!</> : <><ShoppingBag size={18} /> Pay ₹{cartTotal}</>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
