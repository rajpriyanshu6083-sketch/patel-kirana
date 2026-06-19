        // Global fetch interceptor to handle session expiration (401 / 403)
        (function() {
            const originalFetch = window.fetch;
            window.fetch = function(...args) {
                return originalFetch.apply(this, args).then(response => {
                    if (response.status === 401 || response.status === 403) {
                        const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
                        if (!url.includes('/api/logout') && !url.includes('/api/owner/login') && !url.includes('/api/verify-otp') && !url.includes('/api/session-check')) {
                            console.warn("Session expired on server (HTTP " + response.status + "). Logging out...");
                            // Run logout in next tick to avoid blocking fetch resolves
                            setTimeout(() => {
                                if (typeof logout === 'function') logout();
                            }, 10);
                        }
                    }
                    return response;
                });
            };
        })();

        // =============================================
        // CUSTOM ANIMATED TOAST NOTIFICATION SYSTEM
        // =============================================
        (function () {
            const container = document.createElement('div');
            container.id = 'toast-container';
            document.body.appendChild(container);
        })();

        function showToast(message, type = 'info', duration = 4000) {
            const container = document.getElementById('toast-container');
            if (!container) return;

            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`;

            // Map types to FontAwesome icons
            let iconClass = 'fa-circle-info';
            if (type === 'success') iconClass = 'fa-circle-check';
            else if (type === 'error') iconClass = 'fa-circle-xmark';
            else if (type === 'warning') iconClass = 'fa-triangle-exclamation';

            // Clean standard emoji prefixes if we already display them via dynamic type styles
            let cleanMsg = message;
            if (cleanMsg.startsWith('❌')) cleanMsg = cleanMsg.replace(/^❌\s*/, '');
            else if (cleanMsg.startsWith('✅')) cleanMsg = cleanMsg.replace(/^✅\s*/, '');
            else if (cleanMsg.startsWith('⚠️')) cleanMsg = cleanMsg.replace(/^⚠️\s*/, '');
            else if (cleanMsg.startsWith('🛍️')) cleanMsg = cleanMsg.replace(/^🛍️\s*/, '');
            else if (cleanMsg.startsWith('📦')) cleanMsg = cleanMsg.replace(/^📦\s*/, '');
            else if (cleanMsg.startsWith('💳')) cleanMsg = cleanMsg.replace(/^💳\s*/, '');

            toast.innerHTML = `
                <div class="toast-icon">
                    <i class="fa-solid ${iconClass}"></i>
                </div>
                <div class="toast-content">
                    <div class="toast-title">${type.charAt(0).toUpperCase() + type.slice(1)}</div>
                    <div class="toast-message">${cleanMsg}</div>
                </div>
                <button class="toast-close" onclick="this.parentElement.classList.add('hide'); setTimeout(() => this.parentElement.remove(), 400);">
                    <i class="fa-solid fa-xmark"></i>
                </button>
                <div class="toast-progress">
                    <div class="toast-progress-bar" style="animation: toastProgress ${duration}ms linear forwards;"></div>
                </div>
            `;

            container.appendChild(toast);

            // Trigger reflow & show animation
            toast.offsetHeight;
            toast.classList.add('show');

            // Auto dismiss timer
            const dismissTimer = setTimeout(() => {
                toast.classList.add('hide');
                setTimeout(() => {
                    toast.remove();
                }, 400);
            }, duration);

            // Pause progress bar & clear timer on hover
            toast.addEventListener('mouseenter', () => {
                clearTimeout(dismissTimer);
                const bar = toast.querySelector('.toast-progress-bar');
                if (bar) {
                    bar.style.animationPlayState = 'paused';
                }
            });
        }

        // Override standard window.alert
        window.alert = function (msg) {
            let type = 'info';
            const lowerMsg = msg.toLowerCase();

            if (msg.includes('⚠️') || lowerMsg.includes('warning') || lowerMsg.includes('please') || lowerMsg.includes('fill')) {
                type = 'warning';
            } else if (msg.includes('❌') || lowerMsg.includes('error') || lowerMsg.includes('fail') || lowerMsg.includes('incorrect') || lowerMsg.includes('invalid') || lowerMsg.includes('missing')) {
                type = 'error';
            } else if (msg.includes('✅') || lowerMsg.includes('success') || lowerMsg.includes('confirmed') || lowerMsg.includes('granted') || lowerMsg.includes('saved')) {
                type = 'success';
            }

            showToast(msg, type);
        };

        // Global Dynamic App Memory State
        // =============================================
        // PERSISTENT STATE  (localStorage + backend DB)
        // =============================================
        const _LS_KEY = 'pg_state_v1'; // localStorage key

        function _saveState() {
            try {
                localStorage.setItem(_LS_KEY, JSON.stringify({
                    userProfile,
                    addresses,
                    cart,
                    khataBalance,
                    isOwner,
                    currentUser
                }));
            } catch (e) { /* storage full / private mode */ }
            // Also push to server DB if logged in as customer
            if (userProfile.contact && !isOwner) {
                fetch('/api/customer/save-profile', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        phone: userProfile.contact,
                        email: userProfile.email,
                        name: userProfile.name,
                        addresses,
                        khata_bal: khataBalance
                    })
                }).catch(() => { }); // fire-and-forget
            }
        }

        function _loadState() {
            try {
                const raw = localStorage.getItem(_LS_KEY);
                if (!raw) return false;
                const s = JSON.parse(raw);
                userProfile = s.userProfile || { name: '', contact: '', email: '' };
                addresses = s.addresses || [];
                cart = s.cart || {};
                khataBalance = s.khataBalance || 0;
                isOwner = s.isOwner || false;
                currentUser = s.currentUser || '';
                return !!currentUser;
            } catch (e) { return false; }
        }

        // App state
        let userProfile = { name: '', contact: '', email: '' };
        let khataBalance = 0;
        let addresses = [];
        let cart = {};
        let activeCategory = null;
        let freebieClaimed = false;
        let currentUser = '';
        let isOwner = false;
        let currentlyInAdminView = false;
        let _pendingCheckoutType = null;

        // Try to restore previous session immediately
        function _restoreSession() {
            const hasSession = _loadState();

            // If no local session, nothing to restore — login screen stays visible
            if (!hasSession) {
                // Still load inventory overrides for the product list
                fetch('/api/inventory/overrides').then(r => r.json()).then(overrideData => {
                    if (overrideData && overrideData.success && overrideData.overrides) {
                        overrideData.overrides.forEach(override => {
                            const product = inventory.find(p => p.id == override.product_id);
                            if (product) {
                                product.inStock = override.in_stock === 1;
                                if (override.price !== null) product.price = override.price;
                            }
                        });
                    }
                }).catch(() => {});
                return;
            }

            // We have local session data — validate with server before showing app
            // Show a loading indicator so user knows something is happening
            const loginContainer = document.getElementById('login-container');
            if (loginContainer) {
                loginContainer.style.opacity = '0.4';
                loginContainer.style.pointerEvents = 'none';
            }

            // Run session-check and inventory overrides IN PARALLEL for faster startup
            Promise.all([
                fetch('/api/session-check').then(r => r.json()).catch(() => null),
                fetch('/api/inventory/overrides').then(r => r.json()).catch(() => null)
            ]).then(([sess, overrideData]) => {
                // Restore login container opacity
                if (loginContainer) {
                    loginContainer.style.opacity = '';
                    loginContainer.style.pointerEvents = '';
                }

                // --- Session validation ---
                if (hasSession && sess) {
                    const clientIsOwner = isOwner;
                    const clientPhone = userProfile.contact;
                    if (!sess.is_logged_in ||
                        (clientIsOwner !== sess.is_owner) ||
                        (!clientIsOwner && clientPhone !== sess.customer_phone)) {
                        console.warn('Session mismatch detected. Clearing local state and showing login...');
                        // Clear local state without running the full logout animation
                        // (nothing is shown yet, so we just reset state and show login)
                        cart = {};
                        addresses = [];
                        khataBalance = 0;
                        userProfile = { name: '', contact: '', email: '' };
                        currentUser = '';
                        isOwner = false;
                        localStorage.removeItem('patel_groceries_session');
                        localStorage.removeItem(_LS_KEY);
                        // Call backend logout to clear server session too
                        fetch('/api/logout', { method: 'POST' }).catch(() => {});
                        // Show login screen cleanly (it's already visible, just ensure it's visible)
                        if (loginContainer) {
                            loginContainer.classList.remove('hidden');
                            loginContainer.style.display = 'flex';
                            loginContainer.style.visibility = 'visible';
                            loginContainer.style.opacity = '1';
                            loginContainer.style.pointerEvents = '';
                        }
                        return;
                    }
                } else if (sess && sess.is_logged_in && !hasSession) {
                    fetch('/api/logout', { method: 'POST' }).catch(() => {});
                }

                // --- Apply inventory overrides ---
                if (overrideData && overrideData.success && overrideData.overrides) {
                    overrideData.overrides.forEach(override => {
                        const product = inventory.find(p => p.id == override.product_id);
                        if (product) {
                            product.inStock = override.in_stock === 1;
                            if (override.price !== null) product.price = override.price;
                        }
                    });
                    overrideData.overrides.forEach(override => {
                        if (override.in_stock === 0 && cart[override.product_id]) {
                            delete cart[override.product_id];
                        }
                    });
                    if (hasSession) _saveState();
                }

                continueRestore(hasSession);
            }).catch(err => {
                console.error('Session restore failed:', err);
                // On network error, restore from localStorage without server validation
                if (loginContainer) {
                    loginContainer.style.opacity = '';
                    loginContainer.style.pointerEvents = '';
                }
                continueRestore(hasSession);
            });

            function continueRestore(hasSession) {
                if (!hasSession) return;
                // We have a saved session — skip the login screen
                document.getElementById('login-container').classList.add('hidden');
                setTimeout(() => {
                    document.getElementById('login-container').style.display = 'none';
                }, 800);
                if (isOwner) {
                    document.getElementById('app-container').style.display = 'none';
                    document.getElementById('ow-greeting').innerText = `Good day, ${currentUser} 👋`;
                    
                    const ownerShell = document.getElementById('owner-shell');
                    ownerShell.style.display = 'flex';
                    ownerShell.style.opacity = '0';
                    ownerShell.style.transform = 'scale(0.95) translateZ(-30px)';
                    ownerShell.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                    
                    document.getElementById('ow-prod-count').innerText =
                        `${inventory.length} products in catalogue`;
                    setTimeout(() => {
                        ownerShell.classList.add('active');
                        ownerShell.style.opacity = '1';
                        ownerShell.style.transform = 'scale(1) translateZ(0)';
                        switchOwnerTab('orders');
                    }, 50);
                } else {
                    document.getElementById('owner-shell').classList.remove('active');
                    
                    const appContainer = document.getElementById('app-container');
                    appContainer.style.display = 'block';
                    appContainer.style.opacity = '0';
                    appContainer.style.transform = 'scale(0.95) translateZ(-30px)';
                    appContainer.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                    
                    document.getElementById('sidebar-name').innerText = userProfile.name;
                    document.getElementById('sidebar-contact').innerText = userProfile.contact;
                    document.getElementById('owner-toggle-btn').style.display = 'none';
                    document.getElementById('header-cart-icon').style.display = 'block';
                    setTimeout(() => {
                        appContainer.style.opacity = '1';
                        appContainer.style.transform = 'scale(1) translateZ(0)';
                        filterProducts();
                        updateCartCount();
                        updateCustomerDashboard();
                    }, 50);
                }
            }
        }

        // ==========================================
        // CUSTOMER DASHBOARD & LOOKUP LOGIC
        // ==========================================
        let userPastOrdersCount = 0;
        let _lookupTimeout = null;

        function checkPhoneNumberLookup() {
            const phoneRaw = document.getElementById('login-phone').value.trim();
            const statusDiv = document.getElementById('lookup-status');
            const sendBtn = document.getElementById('btn-send-otp');
 
            let phone = phoneRaw.replace(/[\s\-\(\)\+]/g, '');
            if (phone.startsWith('91') && phone.length === 12) {
                phone = phone.substring(2);
            } else if (phone.startsWith('0') && phone.length === 11) {
                phone = phone.substring(1);
            }
 
            if (/^[6-9]\d{9}$/.test(phone)) {
                statusDiv.style.display = 'block';
                statusDiv.innerHTML = `<span style="color:var(--text-muted);"><i class="fa-solid fa-circle-notch fa-spin"></i> Checking account...</span>`;
 
                clearTimeout(_lookupTimeout);
                // 600ms debounce — fewer server hits on slow/mobile typing
                _lookupTimeout = setTimeout(() => {
                    fetch(`/api/customer/load-profile?phone=${encodeURIComponent(phone)}`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.success && data.name) {
                                if (customerMode === 'login') {
                                    statusDiv.innerHTML = `<span style="color:var(--primary);"><i class="fa-solid fa-circle-check"></i> Welcome back, ${data.name}! Ready to send OTP.</span>`;
                                } else {
                                    statusDiv.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> Phone number already registered! Please switch to Login.</span>`;
                                }
                            } else {
                                if (customerMode === 'login') {
                                    statusDiv.innerHTML = `<span style="color:#ef4444;"><i class="fa-solid fa-circle-exclamation"></i> Account not found. Please register first.</span>`;
                                } else {
                                    statusDiv.innerHTML = `<span style="color:var(--primary);"><i class="fa-solid fa-circle-check"></i> Phone number available for registration!</span>`;
                                }
                            }
                        })
                        .catch(() => {
                            statusDiv.style.display = 'none';
                        });
                }, 300);
            } else {
                statusDiv.style.display = 'none';
                newFields.style.display = 'none';
                sendBtn.innerText = "Send OTP";
            }
        }

        function updateCustomerDashboard() {
            const container = document.getElementById('customer-dashboard-widget');
            if (!container) return;

            container.style.display = 'none';
            return;

            const activeAddressText = addresses.length > 0
                ? (typeof addresses[0] === 'string' ? addresses[0] : addresses[0].text)
                : "No address saved yet. Tap below to add.";

            container.innerHTML = `
                <div class="dashboard-card" style="
                    background: linear-gradient(135deg, rgba(255,255,255,0.9), rgba(240,253,244,0.9));
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                    padding: 18px;
                    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.03);
                    margin-bottom: 20px;
                    animation: formFadeIn 0.5s ease-out;
                ">
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:15px; flex-wrap:wrap; gap:10px;">
                        <div>
                            <h3 style="font-size:1.15rem; font-weight:800; color:#0f172a; display:flex; align-items:center; gap:6px;">
                                👋 Welcome back, <span id="dash-cust-name" style="background: linear-gradient(to right, var(--primary), var(--primary-dark)); -webkit-background-clip: text; -webkit-text-fill-color: transparent;">${userProfile.name || currentUser}</span>
                            </h3>
                            <p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Phone: ${userProfile.contact} | Email: ${userProfile.email}</p>
                        </div>
                        <button onclick="openFeatureScreen('profile')" style="background:white; border:1px solid var(--border-color); color:var(--primary); font-size:0.75rem; font-weight:700; padding:6px 12px; border-radius:8px; cursor:pointer;">
                            <i class="fa-regular fa-user"></i> Edit Profile
                        </button>
                    </div>

                    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:15px;">
                        <!-- Address Box -->
                        <div style="background:white; padding:12px; border-radius:12px; border:1px solid #f1f5f9; display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">📍 Default Delivery Address</span>
                                <p id="dash-cust-address" style="font-size:0.8rem; font-weight:500; color:#1e293b; margin-top:5px; line-height:1.3; overflow:hidden; text-overflow:ellipsis; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical;">
                                    ${activeAddressText}
                                </p>
                            </div>
                            <button onclick="openFeatureScreen('address')" style="background:none; border:none; color:var(--primary); font-size:0.75rem; font-weight:700; text-align:left; cursor:pointer; padding:0; margin-top:8px; display:flex; align-items:center; gap:4px;">
                                Manage Addresses <i class="fa-solid fa-chevron-right" style="font-size:0.6rem;"></i>
                            </button>
                        </div>

                        <!-- Khata Box -->
                        <div style="background:white; padding:12px; border-radius:12px; border:1px solid #f1f5f9; display:flex; flex-direction:column; justify-content:space-between;">
                            <div>
                                <span style="font-size:0.7rem; font-weight:700; color:var(--text-muted); text-transform:uppercase; letter-spacing:0.5px;">💜 Digital Ledger (Khata)</span>
                                <h4 id="dash-cust-khata" style="font-size:1.1rem; font-weight:800; color:var(--khata); margin-top:5px;">
                                    ₹${khataBalance}
                                </h4>
                                <p style="font-size:0.65rem; color:var(--text-muted); margin-top:1px;">Pending Settlement</p>
                            </div>
                            <button onclick="openFeatureScreen('khata')" style="background:none; border:none; color:var(--khata); font-size:0.75rem; font-weight:700; text-align:left; cursor:pointer; padding:0; margin-top:8px; display:flex; align-items:center; gap:4px;">
                                Clear Balance <i class="fa-solid fa-chevron-right" style="font-size:0.6rem;"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Past Orders Section -->
                    <div style="border-top: 1px dashed #e2e8f0; padding-top:15px;">
                        <h4 style="font-size:0.8rem; font-weight:700; color:#1e293b; margin-bottom:10px; display:flex; align-items:center; justify-content:space-between;">
                            <span>🛍️ Recent Past Orders</span>
                            <button onclick="openFeatureScreen('orders')" id="dash-view-all-orders" style="background:none; border:none; color:var(--primary); font-size:0.75rem; font-weight:700; cursor:pointer;">
                                View All (0)
                            </button>
                        </h4>
                        <div id="dash-past-orders-list" style="display:flex; flex-direction:column; gap:10px;">
                            <div style="padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center;">
                                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                                    <div class="skeleton-shimmer" style="width: 50%; height: 12px; border-radius: 4px;"></div>
                                    <div class="skeleton-shimmer" style="width: 80%; height: 10px; border-radius: 3px;"></div>
                                </div>
                                <div class="skeleton-shimmer" style="width: 55px; height: 24px; border-radius: 6px; margin-left: 12px;"></div>
                            </div>
                            <div style="padding: 10px; border-radius: 10px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); display: flex; justify-content: space-between; align-items: center;">
                                <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                                    <div class="skeleton-shimmer" style="width: 40%; height: 12px; border-radius: 4px;"></div>
                                    <div class="skeleton-shimmer" style="width: 75%; height: 10px; border-radius: 3px;"></div>
                                </div>
                                <div class="skeleton-shimmer" style="width: 55px; height: 24px; border-radius: 6px; margin-left: 12px;"></div>
                            </div>
                        </div>
                    </div>
                </div>
            `;

            const phone = encodeURIComponent(userProfile.contact || '');
            const email = encodeURIComponent(userProfile.email || '');

            fetch(`/api/my-orders?phone=${phone}&email=${email}`)
                .then(r => r.json())
                .then(data => {
                    const ordersListContainer = document.getElementById('dash-past-orders-list');
                    if (!ordersListContainer) return;

                    if (data.success && data.orders && data.orders.length > 0) {
                        userPastOrdersCount = data.orders.length;
                        const viewAllBtn = document.getElementById('dash-view-all-orders');
                        if (viewAllBtn) viewAllBtn.innerText = `View All (${userPastOrdersCount})`;

                        const recentOrders = data.orders.slice(0, 2);

                        const statusLabel = {
                            waiting_payment: 'Awaiting Pay',
                            pending: 'Pending',
                            packing: 'Packing',
                            delivery: 'Out for Delivery',
                            delivered: 'Delivered',
                            cancelled: 'Cancelled'
                        };
                        const statusColor = {
                            waiting_payment: '#d97706',
                            pending: '#d97706',
                            packing: '#2563eb',
                            delivery: '#7c3aed',
                            delivered: '#16a34a',
                            cancelled: '#ef4444'
                        };

                        ordersListContainer.innerHTML = recentOrders.map(o => {
                            const itemsStr = Object.entries(o.items || {}).map(([n, q]) => `${q}× ${n}`).join(', ') || '—';
                            const date = new Date(o.created_at * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short' });
                            const sl = statusLabel[o.order_status] || o.order_status;
                            const sc = statusColor[o.order_status] || '#64748b';
                            const orderJsonStr = JSON.stringify(o.items).replace(/"/g, '&quot;');

                            return `
                            <div style="background:white; padding:10px; border-radius:10px; border:1px solid #f1f5f9; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:8px;">
                                <div style="flex:1; min-width:180px; padding-right:10px;">
                                    <div style="display:flex; align-items:center; gap:8px; margin-bottom:3px; flex-wrap:wrap;">
                                        <span style="font-weight:700; font-size:0.78rem; color:#0f172a;">Order #${o.id.slice(0, 8).toUpperCase()}</span>
                                        <span style="font-size:0.7rem; color:var(--text-muted);">${date}</span>
                                        <span style="font-size:0.65rem; font-weight:700; color:white; background:${sc}; padding:1px 6px; border-radius:4px; white-space:nowrap;">${sl}</span>
                                    </div>
                                    <div style="font-size:0.75rem; color:#475569; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">
                                        ${itemsStr}
                                    </div>
                                </div>
                                <div style="display:flex; align-items:center; gap:12px; margin-left:auto;">
                                    <span style="font-weight:700; font-size:0.85rem; color:#0f172a; white-space:nowrap;">₹${o.total}</span>
                                    <button onclick="reorderPastItems('${orderJsonStr}')" style="background:#f0fdf4; border:1px solid #bbf7d0; color:var(--primary); font-size:0.7rem; font-weight:700; padding:5px 10px; border-radius:6px; cursor:pointer; display:flex; align-items:center; gap:4px; transition:0.2s;">
                                        <i class="fa-solid fa-arrows-rotate"></i> Reorder
                                    </button>
                                </div>
                            </div>
                        `;
                        }).join('');
                    } else {
                        userPastOrdersCount = 0;
                        const viewAllBtn = document.getElementById('dash-view-all-orders');
                        if (viewAllBtn) viewAllBtn.innerText = `View All (0)`;
                        ordersListContainer.innerHTML = `
                        <div style="font-size:0.78rem; color:var(--text-muted); text-align:center; padding:10px; border:1px dashed #cbd5e1; border-radius:10px;">
                            No past orders found. Place your first order today! 🛒
                        </div>
                    `;
                    }
                })
                .catch(err => {
                    console.error("Dashboard past orders fetch failed:", err);
                    const ordersListContainer = document.getElementById('dash-past-orders-list');
                    if (ordersListContainer) {
                        ordersListContainer.innerHTML = `<div style="font-size:0.78rem; color:#ef4444; text-align:center; padding:10px;">Unable to load past orders.</div>`;
                    }
                });
        }

        function reorderPastItems(itemsJsonStr) {
            try {
                const items = typeof itemsJsonStr === 'string' ? JSON.parse(itemsJsonStr) : itemsJsonStr;
                let addedCount = 0;
                let outOfStockCount = 0;

                for (const [name, qty] of Object.entries(items)) {
                    const p = inventory.find(x => x.name === name);
                    if (p) {
                        if (p.inStock !== false) {
                            cart[p.id] = (cart[p.id] || 0) + qty;
                            addedCount++;
                        } else {
                            outOfStockCount++;
                        }
                    }
                }

                if (addedCount > 0) {
                    _saveState();
                    if (typeof renderCartContent === 'function') renderCartContent();
                    filterProducts();
                    updateCartCount();
                    bounceCartIcon();

                    let msg = `✅ Reordered items added to your cart!`;
                    if (outOfStockCount > 0) {
                        msg += ` (${outOfStockCount} items were out of stock and skipped)`;
                    }
                    showToast(msg, 'success');
                    openCart();
                } else {
                    alert("❌ Could not reorder. All items are currently out of stock.");
                }
            } catch (err) {
                console.error("Reorder failed:", err);
                alert("❌ Error processing reorder.");
            }
        }

        // ==========================================
        // LOGIN GATEWAY LOGIC & AI REGEX VALIDATION
        // ==========================================
        let customerMode = 'login'; // 'login' or 'register'
        let ownerMode = 'login'; // 'login' or 'register'

        function switchLoginTab(type) {
            const tabCustomer = document.getElementById('tab-customer');
            const tabOwner = document.getElementById('tab-owner');
            const formCustomer = document.getElementById('customer-form');
            const formOwner = document.getElementById('owner-form');

            if (type === 'customer') {
                tabCustomer.classList.add('active');
                tabOwner.classList.remove('active');
                formCustomer.style.display = 'block';
                formOwner.style.display = 'none';
            } else {
                tabOwner.classList.add('active');
                tabCustomer.classList.remove('active');
                formOwner.style.display = 'block';
                formCustomer.style.display = 'none';

                // Reset owner form to standard login mode
                ownerMode = 'login';
                document.getElementById('owner-register-fields-name').style.display = 'none';
                document.getElementById('owner-register-fields-email').style.display = 'none';
                document.getElementById('owner-register-fields-phone').style.display = 'none';
                document.getElementById('owner-password-group').style.display = 'block';
                document.getElementById('btn-owner-action').style.display = 'block';
                document.getElementById('owner-toggle-mode').style.display = 'block';
                document.getElementById('owner-forgot-pass-link-group').style.display = 'block';
                document.getElementById('owner-forgot-pass-link').innerText = 'Forgot Password?';
                document.getElementById('owner-forgot-pass-section').style.display = 'none';

                document.getElementById('owner-username').value = '';
                document.getElementById('owner-password').value = '';
            }
        }

        function toggleCustomerMode() {
            const nameField = document.getElementById('customer-register-fields-name');
            const emailField = document.getElementById('customer-register-fields-email');
            const title = document.getElementById('customer-mode-title');
            const toggleBtn = document.getElementById('customer-toggle-mode');
            const actionBtn = document.getElementById('btn-send-otp');
            const lookupStatus = document.getElementById('lookup-status');

            document.getElementById('login-name').value = '';
            document.getElementById('login-email').value = '';
            lookupStatus.style.display = 'none';

            if (customerMode === 'login') {
                customerMode = 'register';
                nameField.style.display = 'block';
                emailField.style.display = 'block';
                title.innerText = 'Customer Registration';
                toggleBtn.innerText = 'Already have an account? Login';
                actionBtn.innerText = 'Register & Send OTP';
            } else {
                customerMode = 'login';
                nameField.style.display = 'none';
                emailField.style.display = 'none';
                title.innerText = 'Customer Login';
                toggleBtn.innerText = 'New here? Create an account';
                actionBtn.innerText = 'Send OTP';
            }
        }

        function toggleOwnerMode() {
            const nameField = document.getElementById('owner-register-fields-name');
            const emailField = document.getElementById('owner-register-fields-email');
            const phoneField = document.getElementById('owner-register-fields-phone');
            const title = document.getElementById('owner-mode-title');
            const toggleBtn = document.getElementById('owner-toggle-mode');
            const actionBtn = document.getElementById('btn-owner-action');
            const forgotLinkGroup = document.getElementById('owner-forgot-pass-link-group');

            document.getElementById('owner-username').value = '';
            document.getElementById('owner-password').value = '';
            document.getElementById('owner-name').value = '';
            document.getElementById('owner-email').value = '';
            document.getElementById('owner-phone').value = '';

            // Reset forgot password state
            document.getElementById('owner-forgot-pass-section').style.display = 'none';
            document.getElementById('owner-forgot-pass-link').innerText = 'Forgot Password?';
            document.getElementById('owner-password-group').style.display = 'block';
            actionBtn.style.display = 'block';
            toggleBtn.style.display = 'block';

            if (ownerMode === 'login') {
                ownerMode = 'register';
                nameField.style.display = 'block';
                emailField.style.display = 'block';
                phoneField.style.display = 'block';
                title.innerText = 'Owner Registration';
                toggleBtn.innerText = 'Already have an owner account? Login';
                actionBtn.innerText = 'Register Owner Dashboard';
                forgotLinkGroup.style.display = 'none';
            } else {
                ownerMode = 'login';
                nameField.style.display = 'none';
                emailField.style.display = 'none';
                phoneField.style.display = 'none';
                title.innerText = 'Owner Login';
                toggleBtn.innerText = 'New owner? Register dashboard';
                actionBtn.innerText = 'Login to Dashboard';
                forgotLinkGroup.style.display = 'block';
            }
        }

        function toggleOwnerForgotMode() {
            const pwdGroup = document.getElementById('owner-password-group');
            const actionBtn = document.getElementById('btn-owner-action');
            const toggleRegBtn = document.getElementById('owner-toggle-mode');
            const forgotLink = document.getElementById('owner-forgot-pass-link');
            const forgotSection = document.getElementById('owner-forgot-pass-section');
            const nameField = document.getElementById('owner-register-fields-name');
            const emailField = document.getElementById('owner-register-fields-email');
            const phoneField = document.getElementById('owner-register-fields-phone');

            document.getElementById('owner-password').value = '';
            document.getElementById('owner-reset-otp').value = '';
            document.getElementById('owner-reset-new-password').value = '';

            if (ownerMode !== 'forgot') {
                ownerMode = 'forgot';
                pwdGroup.style.display = 'none';
                actionBtn.style.display = 'none';
                toggleRegBtn.style.display = 'none';
                nameField.style.display = 'none';
                emailField.style.display = 'none';
                phoneField.style.display = 'none';

                forgotLink.innerText = 'Back to Login';
                forgotSection.style.display = 'block';
                document.getElementById('owner-reset-step1').style.display = 'block';
                document.getElementById('owner-reset-step2').style.display = 'none';
            } else {
                ownerMode = 'login';
                pwdGroup.style.display = 'block';
                actionBtn.style.display = 'block';
                toggleRegBtn.style.display = 'block';
                forgotSection.style.display = 'none';

                forgotLink.innerText = 'Forgot Password?';
            }
        }

        function sendOwnerResetCode() {
            const username = document.getElementById('owner-username').value.trim();
            if (!username) {
                alert("❌ Please enter your username first.");
                return;
            }

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-paper-plane";
            document.getElementById('ai-loader-title').innerText = "🤖 Sending Reset Code";
            document.getElementById('ai-subtext').innerText = "Locating owner email...";
            loader.classList.add('active');

            fetch('/api/owner/forgot-password-send', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw err; });
                }
                return response.json();
            })
            .then(data => {
                loader.classList.remove('active');
                if (data.success) {
                    alert('✅ Verification code sent to your registered email address.');
                    document.getElementById('owner-reset-step1').style.display = 'none';
                    document.getElementById('owner-reset-step2').style.display = 'block';
                } else {
                    alert('❌ ' + data.message);
                }
            })
            .catch((err) => {
                loader.classList.remove('active');
                alert('❌ Error: ' + (err.message || 'Connection failed. Please try again.'));
            });
        }

        function confirmOwnerPasswordReset() {
            const otp = document.getElementById('owner-reset-otp').value.trim();
            const password = document.getElementById('owner-reset-new-password').value.trim();

            if (!otp || !password) {
                alert("❌ Please enter both the verification code and your new password.");
                return;
            }

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-key";
            document.getElementById('ai-loader-title').innerText = "🤖 Resetting Password";
            document.getElementById('ai-subtext').innerText = "Updating credentials...";
            loader.classList.add('active');

            fetch('/api/owner/reset-password', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ otp, password })
            })
            .then(response => {
                if (!response.ok) {
                    return response.json().then(err => { throw err; });
                }
                return response.json();
            })
            .then(data => {
                loader.classList.remove('active');
                if (data.success) {
                    alert('✅ ' + data.message);
                    toggleOwnerForgotMode();
                } else {
                    alert('❌ ' + data.message);
                }
            })
            .catch((err) => {
                loader.classList.remove('active');
                alert('❌ Error: ' + (err.message || 'Connection failed. Please try again.'));
            });
        }

        function requestOTP() {
            const name = document.getElementById('login-name').value.trim();
            const email = document.getElementById('login-email').value.trim();
            const phoneRaw = document.getElementById('login-phone').value.trim();

            if (customerMode === 'register' && (!name || !email || !phoneRaw)) {
                alert("❌ Error: Please fill in your Name, Email, and Phone Number before registering.");
                return;
            }
            if (customerMode === 'login' && !phoneRaw) {
                alert("❌ Error: Please enter your Phone Number before logging in.");
                return;
            }

            if (customerMode === 'register') {
                const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
                if (!emailRegex.test(email)) {
                    alert("❌ Error: Please enter a valid email address.");
                    return;
                }
            }

            let phone = phoneRaw.replace(/[\s\-\(\)\+]/g, '');
            if (phone.startsWith('91') && phone.length === 12) {
                phone = phone.substring(2);
            } else if (phone.startsWith('0') && phone.length === 11) {
                phone = phone.substring(1);
            }

            const phoneRegex = /^[6-9]\d{9}$/;
            if (!phoneRegex.test(phone)) {
                alert("❌ Error: Please enter a valid 10-digit Indian phone number (e.g. 9876543210).");
                return;
            }

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-shield-halved";
            document.getElementById('ai-loader-title').innerText = "🤖 AI Verification Engine";
            document.getElementById('ai-subtext').innerText = "Verifying customer identity...";
            loader.classList.add('active');

            fetch('/api/send-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ name, email, phone, action: customerMode })
            })
                .then(response => {
                    const contentType = response.headers.get("content-type");
                    if (contentType && contentType.includes("application/json")) {
                        return response.json().then(data => ({ ok: response.ok, status: response.status, body: data }));
                    } else {
                        return response.text().then(text => ({ ok: false, status: response.status, body: { message: `Server returned non-JSON response (Status ${response.status}).` } }));
                    }
                })
                .then(result => {
                    loader.classList.remove('active');
                    if (!result.ok || !result.body.success) {
                        alert(`❌ ${result.body.message || 'Verification failed.'}`);
                        return;
                    }

                    userProfile.name = name;
                    userProfile.contact = phone;
                    userProfile.email = email;
                    showOTPInput();
                    document.getElementById('otp-instruction').innerText = `OTP sent. Check your email inbox and enter it below. Valid for 10 minutes.`;
                })
                .catch(error => {
                    loader.classList.remove('active');
                    alert('❌ Connection failed: Unable to connect to the server. Please verify the backend server is running and try again.');
                    console.error(error);
                });
        }

        function showOTPInput() {
            document.getElementById('btn-send-otp').style.display = 'none';
            document.getElementById('otp-section').style.display = 'block';
        }

        function verifyOTP() {
            const otp = document.getElementById('login-otp').value.trim();
            if (!otp) {
                alert('Please enter the OTP received by email.');
                return;
            }

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-lock-open";
            document.getElementById('ai-loader-title').innerText = "🤖 Verifying Your Code";
            document.getElementById('ai-subtext').innerText = "Please wait...";
            loader.classList.add('active');

            fetch('/api/verify-otp', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ otp })
            })
                .then(response => response.json().then(data => ({ status: response.status, body: data })))
                .then(result => {
                    loader.classList.remove('active');
                    if (!result.body.success) {
                        alert(`❌ ${result.body.message}`);
                        return;
                    }

                    userProfile.name = result.body.name || userProfile.name;
                    userProfile.contact = result.body.phone || userProfile.contact;
                    userProfile.email = result.body.email || userProfile.email;
                    loginSuccess(userProfile.name, userProfile.contact, false);
                })
                .catch(error => {
                    loader.classList.remove('active');
                    alert('❌ Verification failed. Please try again.');
                    console.error(error);
                });
        }

        function handleOwnerAction() {
            if (ownerMode === 'login') {
                ownerLogin();
            } else {
                ownerRegister();
            }
        }

        function ownerRegister() {
            const username = document.getElementById('owner-username').value.trim();
            const password = document.getElementById('owner-password').value.trim();
            const name = document.getElementById('owner-name').value.trim();
            const email = document.getElementById('owner-email').value.trim();
            const phone = document.getElementById('owner-phone').value.trim();

            if (!username || !password || !name || !email || !phone) {
                alert("❌ Error: All fields are required for Owner registration.");
                return;
            }

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-user-plus";
            document.getElementById('ai-loader-title').innerText = "🤖 Registering Owner Account";
            document.getElementById('ai-subtext').innerText = "Setting up owner dashboard...";
            loader.classList.add('active');

            fetch('/api/owner/register', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password, name, email, phone })
            })
            .then(r => r.json())
            .then(data => {
                loader.classList.remove('active');
                if (data.success) {
                    alert('✅ Owner account registered successfully! Please login now.');
                    toggleOwnerMode();
                } else {
                    alert('❌ ' + data.message);
                }
            })
            .catch(() => {
                loader.classList.remove('active');
                alert('❌ Connection failed. Please try again.');
            });
        }

        function ownerLogin() {
            const username = document.getElementById('owner-username').value.trim();
            const password = document.getElementById('owner-password').value.trim();

            if (!username || !password) {
                alert("❌ Error: Username and password are required.");
                return;
            }

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-lock-open";
            document.getElementById('ai-loader-title').innerText = "🤖 Verifying Credentials";
            document.getElementById('ai-subtext').innerText = "Checking owner database...";
            loader.classList.add('active');

            fetch('/api/owner/login', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ username, password })
            })
            .then(response => response.json().then(data => ({ status: response.status, body: data })))
            .then(result => {
                loader.classList.remove('active');
                if (!result.body.success) {
                    alert('❌ ' + (result.body.message || 'Invalid Credentials.'));
                    return;
                }
                const owner = result.body.owner;
                userProfile.name = owner.name;
                userProfile.email = owner.email;
                userProfile.contact = owner.phone;
                loginSuccess(owner.name, owner.phone, true);
            })
            .catch(() => {
                loader.classList.remove('active');
                alert('❌ Connection failed. Please try again.');
            });
        }

        function loginSuccess(name, contact, ownerStatus) {
            currentUser = name;
            isOwner = ownerStatus;
            userProfile.name = name;
            userProfile.contact = contact;

            // Legacy session key (kept for compatibility)
            localStorage.setItem('patel_groceries_session', JSON.stringify({
                name, contact, email: userProfile.email, isOwner: ownerStatus
            }));

            if (!ownerStatus) {
                // Try to load previously saved profile from server DB
                fetch(`/api/customer/load-profile?phone=${encodeURIComponent(contact)}`)
                    .then(r => r.json())
                    .then(data => {
                        if (data.success) {
                            // Restore server-saved data (name, email, addresses, khata balance)
                            userProfile.name = data.name || userProfile.name;
                            currentUser = userProfile.name;
                            userProfile.email = data.email || userProfile.email;

                            // Update sidebar name just in case it changed
                            document.getElementById('sidebar-name').innerText = userProfile.name;
                            document.getElementById('sidebar-contact').innerText = userProfile.contact;

                            const serverAddrs = data.addresses || [];
                            const localAddrs = addresses.filter(a => {
                                const t = typeof a === 'string' ? a : a.text;
                                return !serverAddrs.some(b => (typeof b === 'string' ? b : b.text) === t);
                            });
                            addresses = [...serverAddrs, ...localAddrs];
                            khataBalance = data.khata_bal || khataBalance;
                        }
                        _saveState();
                        updateCustomerDashboard();
                    })
                    .catch(() => {
                        _saveState();
                        updateCustomerDashboard();
                    });
            } else {
                _saveState();
            }

            // Setup success checkmark colors and animations
            const overlay = document.getElementById('login-success-overlay');
            const welcomeText = document.getElementById('success-welcome-text');
            const checkmark = document.querySelector('.success-checkmark');

            // Reset SVG checkmark animation by cloning it
            const newCheckmark = checkmark.cloneNode(true);
            checkmark.parentNode.replaceChild(newCheckmark, checkmark);

            if (ownerStatus) {
                welcomeText.style.color = '#7c3aed';
                newCheckmark.style.stroke = '#7c3aed';
                newCheckmark.querySelector('.checkmark-circle').style.stroke = '#7c3aed';
                newCheckmark.querySelector('.checkmark-check').style.stroke = '#7c3aed';
                welcomeText.innerText = `Welcome back, Owner Admin!`;

                // Add specific owner keyframes style color overrides in-line
                newCheckmark.style.animation = 'fillCheckmarkOwner .4s ease-in-out .4s forwards, scaleCheckmark .3s ease-in-out .9s alternate both';

                // Ensure helper style exists for the owner purple glow ring
                let styleOverride = document.getElementById('owner-checkmark-style');
                if (!styleOverride) {
                    styleOverride = document.createElement('style');
                    styleOverride.id = 'owner-checkmark-style';
                    styleOverride.innerHTML = `@keyframes fillCheckmarkOwner { 100% { box-shadow: inset 0px 0px 0px 45px rgba(124, 58, 237, 0.08); } }`;
                    document.head.appendChild(styleOverride);
                }
            } else {
                welcomeText.style.color = '#16a34a';
                newCheckmark.style.stroke = '#16a34a';
                newCheckmark.querySelector('.checkmark-circle').style.stroke = '#16a34a';
                newCheckmark.querySelector('.checkmark-check').style.stroke = '#16a34a';
                welcomeText.innerText = `Welcome, ${name}!`;

                newCheckmark.style.animation = 'fillCheckmark .4s ease-in-out .4s forwards, scaleCheckmark .3s ease-in-out .9s alternate both';
            }

            // Show success overlay
            overlay.style.display = 'flex';
            setTimeout(() => {
                overlay.style.opacity = '1';
            }, 10);

            // Animate text slide-up
            setTimeout(() => {
                welcomeText.style.transform = 'translateY(0)';
                welcomeText.style.opacity = '1';
            }, 400);

            // Set up app layouts underneath the fading screen with 3D scale-up transitions
            if (isOwner) {
                // ── Owner path: show the dedicated owner shell ──
                document.getElementById('app-container').style.display = 'none';
                document.getElementById('ow-greeting').innerText = `Good day, ${name} 👋`;
                
                const ownerShell = document.getElementById('owner-shell');
                ownerShell.style.display = 'flex';
                ownerShell.style.opacity = '0';
                ownerShell.style.transform = 'scale(0.9) translateZ(-50px)';
                ownerShell.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                
                document.getElementById('ow-prod-count').innerText =
                    `${inventory.length} products in catalogue`;
                switchOwnerTab('orders');
                
                setTimeout(() => {
                    ownerShell.classList.add('active');
                    ownerShell.style.opacity = '1';
                    ownerShell.style.transform = 'scale(1) translateZ(0)';
                }, 50);
            } else {
                // ── Customer path: show the storefront ──
                document.getElementById('owner-shell').classList.remove('active');
                
                const appContainer = document.getElementById('app-container');
                appContainer.style.display = 'block';
                appContainer.style.opacity = '0';
                appContainer.style.transform = 'scale(0.9) translateZ(-50px)';
                appContainer.style.transition = 'opacity 0.8s cubic-bezier(0.16, 1, 0.3, 1), transform 0.8s cubic-bezier(0.16, 1, 0.3, 1)';
                
                document.getElementById('sidebar-name').innerText = name;
                document.getElementById('sidebar-contact').innerText = contact;
                document.getElementById('owner-toggle-btn').style.display = 'none';
                document.getElementById('header-cart-icon').style.display = 'block';
                filterProducts();
                
                setTimeout(() => {
                    appContainer.style.opacity = '1';
                    appContainer.style.transform = 'scale(1) translateZ(0)';
                }, 50);
            }

            // Hide the entire login container with a smooth fade-out after checkmark animation completes
            // Cut total delay from 1800ms → 900ms: animation still plays, just exits sooner
            setTimeout(() => {
                const lc = document.getElementById('login-container');
                lc.classList.add('hidden');
                setTimeout(() => {
                    lc.style.display = 'none';
                    lc.style.visibility = '';   // clear inline visibility so .hidden CSS takes full control
                    lc.style.opacity = '';      // clear inline opacity — .hidden owns it now
                    lc.style.transform = '';    // clear inline transform
                    lc.style.transition = '';   // clear inline transition
                    // Reset overlay state for next logins
                    overlay.style.display = 'none';
                    overlay.style.opacity = '0';
                    welcomeText.style.transform = 'translateY(20px)';
                    welcomeText.style.opacity = '0';
                }, 400);
            }, 900);
        }

        function logout() {
            // Call backend logout to terminate session
            fetch('/api/logout', { method: 'POST' }).catch(() => {});

            // Capture active containers
            const appContainer = document.getElementById('app-container');
            const ownerShell = document.getElementById('owner-shell');
            const loginContainer = document.getElementById('login-container');

            const activeContainer = isOwner ? ownerShell : appContainer;

            // Step 1: Smoothly animate the active container out (fade and shrink back in 3D)
            if (activeContainer) {
                activeContainer.style.transition = 'opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1), transform 0.6s cubic-bezier(0.16, 1, 0.3, 1)';
                activeContainer.style.opacity = '0';
                activeContainer.style.transform = 'scale(0.9) translateZ(-50px)';
            }

            // Step 2: Clear all state
            cart = {};
            addresses = [];
            khataBalance = 0;
            userProfile = { name: '', contact: '', email: '' };
            currentUser = '';
            isOwner = false;
            currentlyInAdminView = false;

            const cartCount = document.getElementById('cart-count');
            if (cartCount) cartCount.innerText = 0;

            // Clear all localStorage keys
            localStorage.removeItem('patel_groceries_session');
            localStorage.removeItem(_LS_KEY);

            // Close any open sidebars/modals
            try { toggleSidebar(false); } catch (e) { }
            try { closeModal(); } catch (e) { }
            try { closeAdminModal(); } catch (e) { }

            // Step 3: Wait for active container fade-out, then reset views and transition login screen back
            setTimeout(() => {
                if (appContainer) appContainer.style.display = 'none';
                if (ownerShell) {
                    ownerShell.classList.remove('active');
                    ownerShell.style.display = 'none';
                }

                if (loginContainer) {
                    // Fix: remove .hidden FIRST (clears visibility:hidden + pointer-events:none)
                    // then force a reflow before starting the transition, so the browser
                    // registers the initial state correctly and the fade-in actually plays.
                    loginContainer.classList.remove('hidden');
                    loginContainer.style.display = 'flex';
                    loginContainer.style.visibility = 'visible';
                    loginContainer.style.opacity = '0';
                    loginContainer.style.transform = 'scale(1.05) translateZ(30px)';
                    loginContainer.style.transition = 'none';

                    // Force reflow — without this the browser skips the initial state
                    void loginContainer.offsetHeight;

                    loginContainer.style.transition = 'opacity 0.5s cubic-bezier(0.16, 1, 0.3, 1), transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)';
                    loginContainer.style.opacity = '1';
                    loginContainer.style.transform = 'scale(1) translateZ(0)';
                }
            }, 500);

            // Reset login form fields
            ['login-name', 'login-email', 'login-phone', 'login-otp',
                'owner-username', 'owner-password'].forEach(id => {
                    const el = document.getElementById(id);
                    if (el) el.value = '';
                });
                
            const lookupStatus = document.getElementById('lookup-status');
            if (lookupStatus) {
                lookupStatus.style.display = 'none';
                lookupStatus.innerHTML = '';
            }
            
            // Reset customer mode to login
            customerMode = 'login';
            const nameField = document.getElementById('customer-register-fields-name');
            const emailField = document.getElementById('customer-register-fields-email');
            if (nameField) nameField.style.display = 'none';
            if (emailField) emailField.style.display = 'none';
            
            const title = document.getElementById('customer-mode-title');
            if (title) title.innerText = 'Customer Login';
            
            const toggleBtn = document.getElementById('customer-toggle-mode');
            if (toggleBtn) toggleBtn.innerText = 'New here? Create an account';
            
            const actionBtn = document.getElementById('btn-send-otp');
            if (actionBtn) {
                actionBtn.innerText = 'Send OTP';
                actionBtn.style.display = 'block';
            }

            const dashboardWidget = document.getElementById('customer-dashboard-widget');
            if (dashboardWidget) dashboardWidget.style.display = 'none';
            
            const otpSection = document.getElementById('otp-section');
            if (otpSection) otpSection.style.display = 'none';
            
            const otpInstruction = document.getElementById('otp-instruction');
            if (otpInstruction) otpInstruction.innerText = '';
            
            switchLoginTab('customer');
            filterProducts();
        }

        // Legacy stubs (kept so old sidebar references don't break)
        function toggleOwnerView() { }
        function renderAdminDashboard() { }

        // ===========================================================
        // OWNER COMMAND CENTRE — full JS logic
        // ===========================================================

        // Live orders — populated from backend
        let ownerOrders = [];

        const owStatusFlow = {
            pending: { next: 'packing', btnClass: 'btn-accept', btnLabel: '✅ Accept', chip: 'chip-pending', chipLabel: '⏳ Pending', cardClass: 'pending' },
            packing: { next: 'delivery', btnClass: 'btn-pack', btnLabel: '📦 Mark Packing', chip: 'chip-packing', chipLabel: '📦 Packing', cardClass: 'packing' },
            delivery: { next: 'delivered', btnClass: 'btn-deliver', btnLabel: '🛵 Out for Delivery', chip: 'chip-delivery', chipLabel: '🛵 Out for Delivery', cardClass: 'delivery' },
            delivered: { next: null, btnClass: 'btn-done', btnLabel: '✔ Delivered', chip: 'chip-delivered', chipLabel: '✔ Delivered', cardClass: 'delivered' },
        };

        function switchOwnerTab(tab) {
            ['orders', 'products', 'ledger', 'support', 'analytics', 'settings'].forEach(t => {
                document.getElementById('ow-panel-' + t).classList.toggle('active', t === tab);
                document.getElementById('ow-nav-' + t).classList.toggle('active', t === tab);
            });
            const fab = document.getElementById('ow-fab');
            fab.classList.toggle('visible', tab === 'products');

            if (tab === 'orders') renderOwnerOrders();
            if (tab === 'products') renderOwnerProducts();
            if (tab === 'ledger') renderOwnerLedger();
            if (tab === 'support') renderOwnerSupport();
            if (tab === 'analytics') renderOwnerAnalytics();
            if (tab === 'settings') {
                document.getElementById('ow-prod-count').innerText =
                    `${inventory.length} products in catalogue`;
            }
        }

        // ── Orders — fully live from backend ──────────────────────
        function renderOwnerOrders() {
            const list = document.getElementById('ow-orders-list');
            const statsEl = document.getElementById('ow-order-stats');
            let orderSkeleton = '';
            for (let i = 0; i < 3; i++) {
                orderSkeleton += `
                    <div style="padding: 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div class="skeleton-shimmer" style="width: 120px; height: 14px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 70px; height: 18px; border-radius: 9px;"></div>
                        </div>
                        <div class="skeleton-shimmer" style="width: 80%; height: 12px; border-radius: 4px;"></div>
                        <div class="skeleton-shimmer" style="width: 90%; height: 12px; border-radius: 4px;"></div>
                        <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                            <div class="skeleton-shimmer" style="width: 60px; height: 16px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 50px; height: 12px; border-radius: 3px;"></div>
                        </div>
                        <div style="display: flex; gap: 10px; margin-top: 8px;">
                            <div class="skeleton-shimmer" style="flex: 1; height: 32px; border-radius: 6px;"></div>
                            <div class="skeleton-shimmer" style="flex: 1; height: 32px; border-radius: 6px;"></div>
                        </div>
                    </div>
                `;
            }
            list.innerHTML = orderSkeleton;

            fetch('/api/owner/orders')
                .then(r => r.json())
                .then(data => {
                    if (!data.success) { list.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">❌ Failed to load orders.</div>'; return; }

                    // Sync into local ownerOrders so updateOrderStatus / cancelOrder still work
                    ownerOrders = data.orders.map(o => ({
                        id: o.id,
                        customer: o.customer_name,
                        phone: o.customer_phone || '—',
                        items: Object.entries(o.items || {}).map(([n, q]) => `${q}× ${n}`).join(', ') || '—',
                        total: o.total,
                        time: new Date(o.created_at * 1000).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }),
                        status: o.order_status === 'waiting_payment' ? 'pending'
                            : o.order_status === 'pending' ? 'pending'
                                : o.order_status === 'packing' ? 'packing'
                                    : o.order_status === 'delivery' ? 'delivery'
                                        : o.order_status === 'delivered' ? 'delivered'
                                            : 'pending',
                        payment_status: o.payment_status,
                        raw: o
                    }));

                    const pending = ownerOrders.filter(o => o.status === 'pending').length;
                    const packing = ownerOrders.filter(o => o.status === 'packing').length;
                    const delivery = ownerOrders.filter(o => o.status === 'delivery').length;
                    const delivered = ownerOrders.filter(o => o.status === 'delivered').length;
                    const revenue = ownerOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);

                    statsEl.innerHTML = `
                    <div class="ow-stat-card amber"><div class="stat-icon">⏳</div><div class="stat-value">${pending}</div><div class="stat-label">Pending</div></div>
                    <div class="ow-stat-card blue"><div class="stat-icon">📦</div><div class="stat-value">${packing + delivery}</div><div class="stat-label">In Progress</div></div>
                    <div class="ow-stat-card green"><div class="stat-icon">✅</div><div class="stat-value">${delivered}</div><div class="stat-label">Delivered Today</div></div>
                    <div class="ow-stat-card red"><div class="stat-icon">🧾</div><div class="stat-value">₹${revenue}</div><div class="stat-label">Today's Revenue</div></div>`;

                    list.innerHTML = '';

                    // UPI-pending verification section at the top
                    const upiPending = ownerOrders.filter(o => o.payment_status === 'pending_verification');
                    if (upiPending.length) {
                        const upiSection = document.createElement('div');
                        upiSection.innerHTML = `
                        <div style="font-size:0.75rem;font-weight:800;color:#d97706;letter-spacing:1px;text-transform:uppercase;margin-bottom:10px;">
                            💸 UPI PAYMENTS — Awaiting Verification (${upiPending.length})
                        </div>
                        ${upiPending.map(o => `
                        <div class="upi-verify-banner" id="upi-card-${o.id}">
                            <div class="upi-verify-info">
                                <div class="upi-verify-customer">📱 ${o.customer}</div>
                                <div class="upi-verify-meta">📞 ${o.phone} · ${o.items}</div>
                                <div class="upi-verify-actions">
                                    <button class="upi-confirm-btn" onclick="ownerVerifyUpi('${o.id}','confirm')">✅ Confirm Paid</button>
                                    <button class="upi-reject-btn" onclick="ownerVerifyUpi('${o.id}','reject')">❌ Not Received</button>
                                </div>
                            </div>
                            <div class="upi-verify-amount">₹${o.total}</div>
                        </div>`).join('')}
                        <hr style="border:none;border-top:1px solid #e2e8f0;margin:14px 0;">`;
                        list.appendChild(upiSection);
                    }

                    // Regular order cards (exclude UPI-still-pending)
                    const activeOrders = ownerOrders.filter(o => o.payment_status !== 'pending_verification' && o.status !== 'cancelled');
                    const statusOrder = { pending: 0, packing: 1, delivery: 2, delivered: 3 };
                    const sorted = [...activeOrders].sort((a, b) => (statusOrder[a.status] || 0) - (statusOrder[b.status] || 0));

                    if (!sorted.length && !upiPending.length) {
                        list.innerHTML += '<div style="text-align:center;color:#94a3b8;padding:30px;">No orders yet today.</div>';
                        return;
                    }

                    sorted.forEach(order => {
                        const s = owStatusFlow[order.status] || owStatusFlow['pending'];
                        const nextBtns = s.next
                            ? `<button class="ow-action-btn ${s.btnClass}" onclick="updateOrderStatus('${order.id}','${s.next}')">${s.btnLabel}</button>`
                            : `<button class="ow-action-btn btn-done" disabled>✔ Completed</button>`;

                        // Map button — only shown when delivery address is available
                        const rawO = order.raw || {};
                        const hasAddr = rawO.delivery_address && rawO.delivery_address.trim();
                        const addrSafe = hasAddr ? rawO.delivery_address.replace(/'/g, "\\'") : '';
                        const latVal = rawO.delivery_lat || 'null';
                        const lngVal = rawO.delivery_lng || 'null';
                        const mapBtn = hasAddr
                            ? `<button class="ow-action-btn" style="background:#dbeafe;color:#1d4ed8;flex:none;" onclick="openOwnerMap('${addrSafe}',${latVal},${lngVal})">📍 Map</button>`
                            : '';

                        // Address preview line
                        const addrPreview = hasAddr
                            ? `<div style="font-size:0.76rem;color:#64748b;margin-bottom:8px;display:flex;align-items:flex-start;gap:5px;"><i class="fa-solid fa-location-dot" style="color:var(--primary);margin-top:2px;flex-shrink:0;"></i> ${rawO.delivery_address}</div>`
                            : `<div style="font-size:0.76rem;color:#ef4444;margin-bottom:8px;">⚠️ No delivery address provided</div>`;

                        list.innerHTML += `
                    <div class="order-card ${s.cardClass}" id="ocard-${order.id}">
                        <div class="order-card-top">
                            <div>
                                <div class="order-customer">${order.customer}</div>
                                <div class="order-time">📞 ${order.phone} &nbsp;·&nbsp; ${order.time}</div>
                            </div>
                            <span class="status-chip ${s.chip}">${s.chipLabel}</span>
                        </div>
                        ${addrPreview}
                        <div class="order-items">🛒 ${order.items}</div>
                        <div style="display:flex;justify-content:space-between;align-items:center;">
                            <span class="order-total">₹${order.total}</span>
                            <span style="font-size:0.75rem;color:#94a3b8;">${order.id.slice(0, 8).toUpperCase()}</span>
                        </div>
                        <div class="order-actions">
                            ${nextBtns}
                            ${mapBtn}
                            <button class="ow-action-btn btn-danger" onclick="cancelOrder('${order.id}')">✕ Cancel</button>
                        </div>
                    </div>`;
                    });
                    // Apply 3D tilt
                    if (typeof applyGeneric3DTilt === 'function') {
                        applyGeneric3DTilt('.ow-stat-card', 6);
                        applyGeneric3DTilt('.order-card', 5);
                    }
                })
                .catch(() => {
                    list.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">❌ Could not connect to server.</div>';
                });
        }

        function ownerVerifyUpi(orderId, action) {
            const label = action === 'confirm' ? 'Confirm payment received?' : 'Mark as NOT received?';
            if (!confirm(label)) return;

            fetch('/api/owner/verify-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: orderId, action })
            })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        alert('✅ ' + data.message);
                        renderOwnerOrders(); // Refresh
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(() => alert('❌ Network error.'));
        }

        function updateOrderStatus(id, newStatus) {
            fetch('/api/owner/update-status', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: id, status: newStatus })
            })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        renderOwnerOrders();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(() => alert('❌ Network error. Could not update order.'));
        }

        function cancelOrder(id) {
            if (!confirm('Cancel this order?')) return;
            fetch('/api/owner/cancel-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ order_id: id })
            })
                .then(r => r.json())
                .then(data => {
                    if (data.success) {
                        renderOwnerOrders();
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(() => alert('❌ Network error. Could not cancel order.'));
        }

        // ── Products ──────────────────────────────────────────────
        function renderOwnerProducts() {
            const q = (document.getElementById('ow-prod-search')?.value || '').toLowerCase();
            const list = document.getElementById('ow-products-list');
            list.innerHTML = '';

            const filtered = inventory.filter(p => p.name.toLowerCase().includes(q));

            if (!filtered.length) {
                list.innerHTML = '<div style="text-align:center;color:#94a3b8;padding:30px;">No products found</div>';
                return;
            }

            filtered.forEach(p => {
                const inStock = p.inStock !== false;
                const qty = p.qty !== undefined ? p.qty : (inStock ? 50 : 0);
                if (p.qty === undefined) p.qty = qty;
                list.innerHTML += `
                <div class="ow-product-row" id="owprod-${p.id}">
                    <img src="${p.image}" class="ow-prod-img" onerror="this.src='https://via.placeholder.com/52x52/f1f5f9/94a3b8?text=📦'">
                    <div class="ow-prod-info">
                        <div class="ow-prod-name">${p.name}</div>
                        <div class="ow-prod-meta">₹${p.price} &nbsp;·&nbsp; ${p.weight} &nbsp;·&nbsp; ${p.category}</div>
                    </div>
                    <div class="ow-prod-actions">
                        <div class="qty-stepper">
                            <button onclick="owChangeQty(${p.id},-1)">−</button>
                            <span id="ow-qty-${p.id}">${qty}</span>
                            <button onclick="owChangeQty(${p.id},+1)">+</button>
                        </div>
                        <button class="stock-toggle ${inStock ? 'in' : 'out'}" id="ow-stock-${p.id}"
                            onclick="owToggleStock(${p.id})">${inStock ? '● In Stock' : '● Out of Stock'}</button>
                        <div style="display:flex; gap:6px;">
                            <button class="ow-edit-btn" onclick="openProductEditor(${p.id})">✏ Edit</button>
                            <button class="ow-delete-btn" onclick="deleteProduct(${p.id})">🗑 Delete</button>
                        </div>
                    </div>
                </div>`;
            });
            // Apply 3D tilt
            if (typeof applyGeneric3DTilt === 'function') {
                applyGeneric3DTilt('.ow-product-row', 3);
            }
        }

        function owChangeQty(id, delta) {
            const prod = inventory.find(p => p.id === id);
            if (!prod) return;
            prod.qty = Math.max(0, (prod.qty || 0) + delta);
            const el = document.getElementById('ow-qty-' + id);
            if (el) el.innerText = prod.qty;
            // auto-mark out of stock if qty hits 0
            if (prod.qty === 0 && prod.inStock !== false) {
                prod.inStock = false;
                const st = document.getElementById('ow-stock-' + id);
                if (st) { st.className = 'stock-toggle out'; st.innerText = '● Out of Stock'; }
                
                // Post stock update to server overrides table
                fetch('/api/owner/update-inventory', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        product_id: prod.id,
                        in_stock: 0,
                        price: prod.price
                    })
                }).catch(err => console.error("Error updating stock status on server:", err));
            }
        }

        function owToggleStock(id) {
            const prod = inventory.find(p => p.id === id);
            if (!prod) return;
            prod.inStock = !(prod.inStock !== false);
            if (!prod.inStock) prod.qty = 0;
            else if ((prod.qty || 0) === 0) prod.qty = 10;
            const btn = document.getElementById('ow-stock-' + id);
            const qtyEl = document.getElementById('ow-qty-' + id);
            if (btn) { btn.className = 'stock-toggle ' + (prod.inStock ? 'in' : 'out'); btn.innerText = prod.inStock ? '● In Stock' : '● Out of Stock'; }
            if (qtyEl) qtyEl.innerText = prod.qty;
            filterProducts(); // update storefront live

            // Post stock update to server overrides table
            fetch('/api/owner/update-inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: prod.id,
                    in_stock: prod.inStock ? 1 : 0,
                    price: prod.price
                })
            }).catch(err => console.error("Error updating stock status on server:", err));
        }

        function deleteProduct(id) {
            if (!confirm("Are you sure you want to delete this product?")) return;
            const index = inventory.findIndex(p => p.id === id);
            if (index !== -1) {
                inventory.splice(index, 1);
                // Also remove from cart
                delete cart[id];
                // Re-render views
                renderOwnerProducts();
                filterProducts();
                if (typeof renderCartContent === 'function') renderCartContent();
                if (typeof updateCartCount === 'function') updateCartCount();
                _saveState();
                alert("✅ Product deleted successfully!");
            }
        }

        // ── Analytics ─────────────────────────────────────────────
        function renderOwnerAnalytics() {
            const revenue = ownerOrders.filter(o => o.status === 'delivered').reduce((s, o) => s + o.total, 0);
            const totalOrders = ownerOrders.filter(o => o.status !== 'cancelled').length;
            const inStockCount = inventory.filter(p => p.inStock !== false).length;
            const outCount = inventory.filter(p => p.inStock === false).length;

            document.getElementById('ow-analytics-stats').innerHTML = `
                <div class="ow-stat-card green">
                    <div class="stat-icon">💰</div>
                    <div class="stat-value">₹${revenue}</div>
                    <div class="stat-label">Today's Revenue</div>
                </div>
                <div class="ow-stat-card blue">
                    <div class="stat-icon">📋</div>
                    <div class="stat-value">${totalOrders}</div>
                    <div class="stat-label">Orders Today</div>
                </div>
                <div class="ow-stat-card amber">
                    <div class="stat-icon">✅</div>
                    <div class="stat-value">${inStockCount}</div>
                    <div class="stat-label">In Stock Items</div>
                </div>
                <div class="ow-stat-card red">
                    <div class="stat-icon">⚠️</div>
                    <div class="stat-value">${outCount}</div>
                    <div class="stat-label">Out of Stock</div>
                </div>`;

            const alerts = document.getElementById('ow-stock-alerts');
            alerts.innerHTML = '';
            const outItems = inventory.filter(p => p.inStock === false);
            if (!outItems.length) {
                alerts.innerHTML = '<div style="color:#16a34a;font-weight:700;text-align:center;padding:20px;">✅ All items are in stock!</div>';
            } else {
                outItems.forEach(p => {
                    alerts.innerHTML += `
                    <div class="ow-alert-row" style="display:flex;align-items:center;justify-content:space-between;">
                        <span>⚠️ <b>${p.name}</b> — Out of Stock</span>
                        <button class="stock-toggle out" style="font-size:0.65rem;" onclick="owToggleStock(${p.id}); renderOwnerAnalytics();">Mark In Stock</button>
                    </div>`;
                });
            }
            // Apply 3D tilt
            if (typeof applyGeneric3DTilt === 'function') {
                applyGeneric3DTilt('.ow-stat-card', 6);
            }
        }

        // ── Digital Ledger (Khata) ────────────────────────────────
        function renderOwnerLedger() {
            const list = document.getElementById('ow-ledger-list');
            const statsEl = document.getElementById('ow-ledger-stats');
            let ledgerSkeleton = '';
            for (let i = 0; i < 4; i++) {
                ledgerSkeleton += `
                    <div style="padding: 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); margin-bottom: 10px; display: flex; justify-content: space-between; align-items: center;">
                        <div style="flex: 1; display: flex; flex-direction: column; gap: 6px;">
                            <div class="skeleton-shimmer" style="width: 130px; height: 14px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 95px; height: 10px; border-radius: 3px;"></div>
                        </div>
                        <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 6px;">
                            <div class="skeleton-shimmer" style="width: 50px; height: 16px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 70px; height: 24px; border-radius: 6px;"></div>
                        </div>
                    </div>
                `;
            }
            list.innerHTML = ledgerSkeleton;

            fetch('/api/owner/orders')
                .then(r => r.json())
                .then(data => {
                    if (!data.success) {
                        list.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">\u274c Failed to load khata.</div>';
                        return;
                    }

                    // Filter only khata orders that are not cancelled
                    const khataOrders = data.orders.filter(o => o.payment_method === 'khata');

                    // Group by customer phone (fallback to email)
                    const customerMap = {};
                    khataOrders.forEach(o => {
                        const key = o.customer_phone || o.customer_email || o.customer_name;
                        if (!customerMap[key]) {
                            customerMap[key] = {
                                name: o.customer_name,
                                phone: o.customer_phone || '\u2014',
                                email: o.customer_email || '\u2014',
                                orders: [],
                                total: 0
                            };
                        }
                        customerMap[key].orders.push(o);
                        if (o.order_status !== 'cancelled') {
                            customerMap[key].total += o.total;
                        }
                    });

                    const customers = Object.values(customerMap);
                    const totalOwed = customers.reduce((s, c) => s + c.total, 0);
                    const activeCount = customers.filter(c => c.total > 0).length;

                    // Summary stats
                    statsEl.innerHTML = `
                    <div class="ow-stat-card" style="background:#f3e8ff;border:1px solid #c4b5fd;">
                        <div class="stat-icon">\ud83d\udc65</div>
                        <div class="stat-value" style="color:#7c3aed;">${activeCount}</div>
                        <div class="stat-label">Customers</div>
                    </div>
                    <div class="ow-stat-card" style="background:#fef2f2;border:1px solid #fca5a5;">
                        <div class="stat-icon">\u20b9</div>
                        <div class="stat-value" style="color:#dc2626;">\u20b9${totalOwed.toFixed(0)}</div>
                        <div class="stat-label">Total Due</div>
                    </div>`;

                    if (!customers.length) {
                        list.innerHTML = `
                        <div style="text-align:center;padding:40px 20px;">
                            <div style="font-size:2.5rem;margin-bottom:10px;">\ud83d\udcd2</div>
                            <div style="font-weight:700;color:#0f172a;">No Khata Yet</div>
                            <div style="color:#94a3b8;font-size:0.9rem;margin-top:4px;">No store credit orders placed.</div>
                        </div>`;
                        return;
                    }

                    // Sort: highest balance first
                    customers.sort((a, b) => b.total - a.total);

                    list.innerHTML = customers.map((c, idx) => {
                        const ordersHtml = c.orders
                            .sort((a, b) => b.created_at - a.created_at)
                            .map(o => {
                                const itemsStr = Object.entries(o.items || {}).map(([n, q]) => `${q}\u00d7 ${n}`).join(', ') || '\u2014';
                                const date = new Date(o.created_at * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                                const cancelled = o.order_status === 'cancelled';
                                return `
                            <div style="background:${cancelled ? '#f8fafc' : '#fdf4ff'};border:1px solid ${cancelled ? '#e2e8f0' : '#ede9fe'};border-radius:8px;padding:10px 12px;margin-bottom:8px;opacity:${cancelled ? 0.6 : 1};">
                                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:4px;">
                                    <span style="font-size:0.75rem;font-weight:700;color:#7c3aed;">#${o.id.slice(0, 8).toUpperCase()}</span>
                                    <span style="font-size:0.75rem;color:#94a3b8;">${date}</span>
                                </div>
                                <div style="font-size:0.8rem;color:#475569;margin-bottom:4px;">\ud83d\uded2 ${itemsStr}</div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-size:0.72rem;color:${cancelled ? '#94a3b8' : '#7c3aed'};background:${cancelled ? '#f1f5f9' : '#f3e8ff'};padding:1px 7px;border-radius:8px;font-weight:700;">
                                        ${cancelled ? '\u274c Cancelled' : '\ud83d\udcd2 Pending'}
                                    </span>
                                    <span style="font-weight:800;color:${cancelled ? '#94a3b8' : '#dc2626'};">${cancelled ? '\u2014' : '\u20b9' + o.total}</span>
                                </div>
                            </div>`;
                            }).join('');

                        return `
                    <div class="ow-ledger-card" style="background:#fff;border:2px solid ${c.total > 0 ? '#c4b5fd' : '#e2e8f0'};border-radius:16px;margin-bottom:16px;overflow:hidden;box-shadow:0 2px 8px rgba(124,58,237,0.07);">
                        <!-- Customer header -->
                        <div onclick="this.nextElementSibling.style.display=this.nextElementSibling.style.display==='none'?'block':'none'"
                             style="padding:14px 16px;cursor:pointer;background:${c.total > 0 ? 'linear-gradient(135deg,#fdf4ff,#f3e8ff)' : '#f8fafc'};">
                            <div style="display:flex;justify-content:space-between;align-items:flex-start;">
                                <div style="flex:1;">
                                    <div style="font-weight:800;font-size:1rem;color:#0f172a;margin-bottom:4px;">
                                        \ud83d\udc64 ${c.name}
                                    </div>
                                    <div style="font-size:0.78rem;color:#64748b;line-height:1.6;">
                                        \ud83d\udcde ${c.phone}<br>
                                        \u2709\ufe0f ${c.email}
                                    </div>
                                </div>
                                <div style="text-align:right;margin-left:12px;">
                                    <div style="font-size:1.3rem;font-weight:900;color:${c.total > 0 ? '#dc2626' : '#22c55e'};">
                                        ${c.total > 0 ? '\u20b9' + c.total.toFixed(0) : '\u2714 Clear'}
                                    </div>
                                    <div style="font-size:0.7rem;color:#94a3b8;">
                                        ${c.orders.length} order${c.orders.length !== 1 ? 's' : ''} \u2022 tap to expand
                                    </div>
                                </div>
                            </div>
                        </div>
                        <!-- Order breakdown (hidden by default) -->
                        <div style="display:none;padding:12px 12px 4px;">
                            ${ordersHtml}
                        </div>
                    </div>`;
                    }).join('');
                    // Apply 3D tilt
                    if (typeof applyGeneric3DTilt === 'function') {
                        applyGeneric3DTilt('.ow-stat-card', 6);
                        applyGeneric3DTilt('.ow-ledger-card', 4);
                    }
                })
                .catch(() => {
                    list.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">\u274c Could not connect to server.</div>';
                });
        }

        // ── Customer Support ──────────────────────────────────────
        function renderOwnerSupport() {
            const list = document.getElementById('ow-support-list');
            const statsEl = document.getElementById('ow-support-stats');

            let supportSkeleton = '';
            for (let i = 0; i < 3; i++) {
                supportSkeleton += `
                    <div style="padding: 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); margin-bottom: 10px; display: flex; flex-direction: column; gap: 8px;">
                        <div style="display: flex; justify-content: space-between; align-items: center;">
                            <div class="skeleton-shimmer" style="width: 120px; height: 14px; border-radius: 4px;"></div>
                            <div class="skeleton-shimmer" style="width: 70px; height: 18px; border-radius: 9px;"></div>
                        </div>
                        <div class="skeleton-shimmer" style="width: 90%; height: 12px; border-radius: 4px;"></div>
                        <div style="display: flex; gap: 10px; margin-top: 8px;">
                            <div class="skeleton-shimmer" style="flex: 1; height: 32px; border-radius: 6px;"></div>
                            <div class="skeleton-shimmer" style="flex: 1; height: 32px; border-radius: 6px;"></div>
                        </div>
                    </div>
                `;
            }
            list.innerHTML = supportSkeleton;

            fetch('/api/owner/support-tickets')
                .then(r => r.json())
                .then(data => {
                    if (!data.success) {
                        list.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">❌ Failed to load support tickets.</div>';
                        return;
                    }

                    const tickets = data.tickets;
                    const pendingCount = tickets.filter(t => t.status === 'pending').length;
                    const resolvedCount = tickets.filter(t => t.status === 'resolved').length;

                    statsEl.innerHTML = `
                        <div class="ow-stat-card blue">
                            <div class="stat-icon">🎧</div>
                            <div class="stat-value" style="color:#0284c7;">${pendingCount}</div>
                            <div class="stat-label">Active Tickets</div>
                        </div>
                        <div class="ow-stat-card green">
                            <div class="stat-icon">✅</div>
                            <div class="stat-value" style="color:#16a34a;">${resolvedCount}</div>
                            <div class="stat-label">Resolved Tickets</div>
                        </div>
                    `;

                    if (tickets.length === 0) {
                        list.innerHTML = `
                            <div style="text-align:center;padding:40px 20px;">
                                <div style="font-size:2.5rem;margin-bottom:10px;">🎉</div>
                                <div style="font-weight:700;color:#0f172a;">All Clear!</div>
                                <div style="color:#94a3b8;font-size:0.9rem;margin-top:4px;">No support tickets submitted yet.</div>
                            </div>`;
                        return;
                    }

                    list.innerHTML = tickets.map(t => {
                        const date = new Date(t.created_at * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                        const isPending = t.status === 'pending';
                        
                        let cardBorder = isPending ? 'border: 2px solid #f59e0b;' : 'border: 2px solid #e2e8f0; opacity: 0.75;';
                        let badgeBg = isPending ? 'background: #fffbeb; color: #b45309;' : 'background: #f0fdf4; color: #15803d;';
                        let badgeLabel = isPending ? '⏳ PENDING' : '✅ RESOLVED';

                        return `
                            <div class="feature-card" style="${cardBorder} margin-bottom: 12px; border-radius:16px; background:#fff; padding:16px; box-shadow:0 2px 8px rgba(0,0,0,0.04);">
                                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:10px;">
                                    <div>
                                        <span style="font-size:0.75rem; font-weight:700; color:#94a3b8;">${date}</span>
                                        <h4 style="font-weight:800; font-size:1rem; color:#0f172a; margin-top:2px;">👤 ${t.customer_name}</h4>
                                    </div>
                                    <span style="font-size:0.68rem; font-weight:800; padding:2px 8px; border-radius:12px; ${badgeBg}">${badgeLabel}</span>
                                </div>
                                <div style="font-size:0.8rem; font-weight:700; color:#4b5563; margin-bottom:12px; padding:10px; background:#f9fafb; border-radius:8px;">
                                    <span style="font-size:0.75rem; color:#6b7280; font-weight:800; text-transform:uppercase; display:block; margin-bottom:4px;">💬 Category: ${t.category}</span>
                                    "${t.issue}"
                                </div>
                                <div style="font-size:0.78rem; color:#4b5563; margin-bottom:12px; line-height:1.5;">
                                    📞 <b>Phone:</b> <a href="tel:${t.customer_phone}" style="color:var(--primary); font-weight:700; text-decoration:none;">${t.customer_phone}</a><br>
                                    ✉️ <b>Email:</b> <a href="mailto:${t.customer_email}" style="color:var(--primary); font-weight:700; text-decoration:none;">${t.customer_email || '—'}</a>
                                </div>
                                <div style="display:flex; gap:8px; margin-top:10px;">
                                    ${isPending ? `
                                        <button onclick="resolveOwnerTicket('${t.id}')" style="flex:1; background:#22c55e; color:white; border:none; padding:10px; border-radius:8px; font-size:0.78rem; font-weight:800; cursor:pointer; display:flex; align-items:center; justify-content:center; gap:5px; transition: transform 0.1s;">
                                            ✅ Resolve Ticket
                                        </button>
                                    ` : ''}
                                    <a href="tel:${t.customer_phone}" style="flex:1; display:flex; align-items:center; justify-content:center; gap:5px; background:#eff6ff; color:#1d4ed8; text-decoration:none; padding:10px; border-radius:8px; font-size:0.78rem; font-weight:800; text-align:center;">
                                        📞 Call Customer
                                    </a>
                                </div>
                            </div>
                        `;
                    }).join('');

                    if (typeof applyGeneric3DTilt === 'function') {
                        applyGeneric3DTilt('.ow-stat-card', 6);
                    }
                })
                .catch(() => {
                    list.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">❌ Could not connect to server.</div>';
                });
        }

        function resolveOwnerTicket(ticketId) {
            fetch('/api/owner/support-tickets/resolve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ticket_id: ticketId })
            })
            .then(r => r.json())
            .then(data => {
                if (data.success) {
                    alert("Ticket marked as resolved!");
                    renderOwnerSupport();
                } else {
                    alert("Failed to resolve ticket: " + data.message);
                }
            })
            .catch(() => alert("Network error resolving ticket."));
        }

        // ── Settings helpers ──────────────────────────────────────
        function owToggleSetting(btn) {
            btn.classList.toggle('on');
        }

        function openProductEditor(id) {
            document.getElementById('admin-slide-modal').classList.add('open');
            document.getElementById('global-modal-overlay').style.display = 'block';

            if (id) {
                const p = inventory.find(i => i.id === id);
                document.getElementById('admin-modal-title').innerText = "Edit Product";
                document.getElementById('edit-prod-id').value = p.id;
                document.getElementById('edit-prod-name').value = p.name;
                document.getElementById('edit-prod-category').value = p.category;
                document.getElementById('edit-prod-price').value = p.price;
                document.getElementById('edit-prod-mrp').value = p.mrp || '';
                document.getElementById('edit-prod-weight').value = p.weight;
                document.getElementById('edit-prod-image').value = p.image;
                document.getElementById('edit-prod-stock').checked = p.inStock !== false;
            } else {
                document.getElementById('admin-modal-title').innerText = "Add New Product";
                document.getElementById('edit-prod-id').value = "";
                document.getElementById('edit-prod-name').value = "";
                document.getElementById('edit-prod-category').value = "Vegetables";
                document.getElementById('edit-prod-price').value = "";
                document.getElementById('edit-prod-mrp').value = "";
                document.getElementById('edit-prod-weight').value = "";
                document.getElementById('edit-prod-image').value = "https://images.unsplash.com/photo-1542838132-92c53300491e?w=500&auto=format&fit=crop";
                document.getElementById('edit-prod-stock').checked = true;
            }
        }

        function closeAdminModal() {
            document.getElementById('admin-slide-modal').classList.remove('open');
            document.getElementById('global-modal-overlay').style.display = 'none';
        }

        function saveAdminProduct() {
            const id = document.getElementById('edit-prod-id').value;
            const name = document.getElementById('edit-prod-name').value.trim();
            const category = document.getElementById('edit-prod-category').value;
            const price = parseFloat(document.getElementById('edit-prod-price').value);
            const mrp = parseFloat(document.getElementById('edit-prod-mrp').value);
            const weight = document.getElementById('edit-prod-weight').value.trim();
            const image = document.getElementById('edit-prod-image').value.trim();
            const inStock = document.getElementById('edit-prod-stock').checked;

            if (!name || !price || !weight || !image) {
                alert("Please fill all required fields!");
                return;
            }

            let finalId;
            if (id) {
                finalId = parseInt(id);
                const p = inventory.find(i => i.id == id);
                p.name = name;
                p.category = category;
                p.price = price;
                p.mrp = isNaN(mrp) ? null : mrp;
                p.weight = weight;
                p.image = image;
                p.inStock = inStock;

                if (!inStock && cart[id]) {
                    delete cart[id];
                }
            } else {
                finalId = Date.now();
                inventory.unshift({
                    id: finalId,
                    name: name,
                    category: category,
                    price: price,
                    mrp: isNaN(mrp) ? null : mrp,
                    weight: weight,
                    image: image,
                    inStock: inStock
                });
            }

            // Post inventory stock status update to the server overrides table
            fetch('/api/owner/update-inventory', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    product_id: finalId,
                    in_stock: inStock ? 1 : 0,
                    price: price
                })
            }).catch(err => console.error("Error updating inventory override on server:", err));

            closeAdminModal();
            renderAdminDashboard();
            renderCartContent();
            filterProducts();
            _saveState(); // ← persist admin edits that affect cart
            // Refresh owner products tab if owner is active
            if (isOwner) renderOwnerProducts();
            alert("✅ Product saved successfully! Updates are live on the storefront.");
        }

        // ==========================================
        // MASSIVE 60+ PRODUCT INVENTORY
        // ==========================================
        // MASSIVE 60+ PRODUCT INVENTORY
        // ==========================================
        const inventory = [
            { id: 1, name: "Fresh Potatoes", weight: "1 kg", price: 30, image: "https://images.unsplash.com/photo-1518977676601-b53f82aba655?fm=jpg&q=60&w=3000&auto=format&fit=crop&ixlib=rb-4.1.0", category: "Vegetables" },
            { id: 2, name: "Fresh Red Onion", weight: "1 kg", price: 45, image: "https://m.media-amazon.com/images/I/51DJ-9xkuQL.jpg", category: "Vegetables" },
            { id: 3, name: "Fresh Tomatoes", weight: "500 g", price: 30, image: "https://images-prod.healthline.com/hlcmsresource/images/AN_images/tomatoes-1296x728-feature.jpg", category: "Vegetables" },
            { id: 7, name: "Coca-Cola Cold Drink", weight: "250 ml", price: 20, image: "/static/coca_cola.png", category: "Beverages" },
            { id: 8, name: "Pepsi Cold Drink", weight: "500 ml", price: 40, image: "/static/pepsi.png", category: "Beverages" },
            { id: 11, name: "Amul Milk Gold", weight: "500 ml", price: 27, image: "https://www.bbassets.com/media/uploads/p/xl/40090893_8-amul-amul-gold.jpg", category: "Dairy & Bakery" },
            { id: 15, name: "Britannia Bread", weight: "400 g", price: 40, image: "https://www.bbassets.com/media/uploads/p/l/40092241_8-britannia-brown-bread-with-goodness-of-wheat-enriched-with-vitamins.jpg", category: "Dairy & Bakery" },
            { id: 17, name: "Aashirvaad Whole Wheat Flour", weight: "5 kg", price: 215, image: "https://www.bbassets.com/media/uploads/p/l/40127505_9-aashirvaad-shudh-chakki-atta.jpg", category: "Staples" },
            { id: 19, name: "Tata Split Pigeon Peas (Toor Dal)", weight: "500 g", price: 85, image: "https://www.tatanutrikorner.com/cdn/shop/files/71efuJ3pamL._SL1500.jpg?v=1745494795&width=1445", category: "Staples" },
            { id: 22, name: "Fortune Sunflower Oil", weight: "1 L", price: 135, image: "https://m.media-amazon.com/images/I/81FbVYZJYyL.jpg", category: "Spices & Oils" },
            { id: 23, name: "Tata Salt", weight: "1 kg", price: 25, image: "https://www.bbassets.com/media/uploads/p/l/241600_9-tata-salt-iodized.jpg", category: "Spices & Oils" },
            { id: 27, name: "Maggi Noodles", weight: "140 g", price: 28, image: "https://m.media-amazon.com/images/I/51OyngH9SeL._AC_UF894,1000_QL80_.jpg", category: "Snacks & Drinks" },
            { id: 30, name: "Parle-G Biscuits", weight: "800 g", price: 80, image: "https://m.media-amazon.com/images/I/714PuAiIeeL.jpg", category: "Snacks & Drinks" },
            { id: 38, name: "Surf Excel Detergent Powder", weight: "1 kg", price: 130, image: "https://m.media-amazon.com/images/I/619HRPW3elL._AC_UF1000,1000_QL80_.jpg", category: "Care & Cleaning" },
            { id: 39, name: "Vim Dishwashing Liquid", weight: "250 ml", price: 20, image: "https://m.media-amazon.com/images/I/61szrCRWOEL.jpg", category: "Care & Cleaning" },
            { id: 101, name: "Fresh Garlic (Lahsun)", weight: "100 g", price: 25, image: "/static/garlic.png", category: "Vegetables" },
            { id: 102, name: "Fresh Ginger (Adrak)", weight: "100 g", price: 20, image: "/static/ginger.png", category: "Vegetables" },
            { id: 103, name: "Fresh Green Chilies", weight: "100 g", price: 15, image: "/static/green_chilies.png", category: "Vegetables" },
            { id: 104, name: "Fresh Lemons (Pack of 4)", weight: "4 pcs", price: 20, image: "/static/lemons.png", category: "Vegetables" },
            { id: 112, name: "Sprite Cold Drink", weight: "750 ml", price: 45, image: "/static/sprite.png", category: "Beverages" },
            { id: 114, name: "Frooti Mango Drink", weight: "150 ml", price: 10, image: "/static/frooti.png", category: "Beverages" },
            { id: 120, name: "Amul Butter", weight: "100 g", price: 56, image: "https://images.unsplash.com/photo-1589985270826-4b7bb135bc9d?w=500&auto=format&fit=crop", category: "Dairy & Bakery" },
            { id: 122, name: "Fresh Cottage Cheese (Paneer)", weight: "200 g", price: 85, image: "https://images.unsplash.com/photo-1631452180519-c014fe946bc7?w=500&auto=format&fit=crop", category: "Dairy & Bakery" },
            { id: 124, name: "Brown Eggs", weight: "6 pcs", price: 60, image: "https://images.unsplash.com/photo-1506976785307-8732e854ad03?w=500&auto=format&fit=crop", category: "Dairy & Bakery" },
            { id: 128, name: "India Gate Basmati Rice", weight: "1 kg", price: 120, image: "https://images.unsplash.com/photo-1586201375761-83865001e31c?w=500&auto=format&fit=crop", category: "Staples" },
            { id: 133, name: "Madhur Pure Sugar", weight: "1 kg", price: 45, image: "https://images.unsplash.com/photo-1581798459219-318e76aecc7b?w=500&auto=format&fit=crop", category: "Staples" },
            { id: 147, name: "Red Label Tea", weight: "250 g", price: 140, image: "https://images.unsplash.com/photo-1576092768241-dec231879fc3?w=500&auto=format&fit=crop", category: "Snacks & Drinks" },
            { id: 149, name: "Lays Classic Salted Chips", weight: "50 g", price: 20, image: "https://images.unsplash.com/photo-1566478989037-eec170784d20?w=500&auto=format&fit=crop", category: "Snacks & Drinks" },
            { id: 155, name: "Dettol Original Soap", weight: "4x125g", price: 150, image: "https://images.unsplash.com/photo-1607006342411-9a3363b63b2f?w=500&auto=format&fit=crop", category: "Care & Cleaning" }
        ];

        const categories = [
            { name: "Vegetables", icon: "🥦" }, { name: "Beverages", icon: "🥤" },
            { name: "Dairy & Bakery", icon: "🥛" }, { name: "Staples", icon: "🌾" },
            { name: "Spices & Oils", icon: "🧂" }, { name: "Snacks & Drinks", icon: "🍜" },
            { name: "Care & Cleaning", icon: "🧼" }
        ];

        const recipeKits = [
            { id: 'k1', name: "Sunday Mutton Curry Base", icon: "🍲", desc: "Onion, Tomato, Oil & Salt", items: [{ id: 2, qty: 1 }, { id: 3, qty: 1 }, { id: 22, qty: 1 }, { id: 23, qty: 1 }] },
            { id: 'k2', name: "Quick Tea & Biscuits", icon: "☕", desc: "Amul Milk + Parle-G Biscuits", items: [{ id: 11, qty: 1 }, { id: 30, qty: 1 }] },
            { id: 'k3', name: "Bachelor's Survival Kit", icon: "🍜", desc: "Maggi, Bread & Eggs", items: [{ id: 27, qty: 2 }, { id: 15, qty: 1 }, { id: 124, qty: 1 }] }
        ];

        // ==========================================
        // SIDEBAR NAV TOGGLE
        // ==========================================
        function toggleSidebar(forceState) {
            const sidebar = document.getElementById('sidebar');
            const overlay = document.getElementById('sidebar-overlay');
            if (!sidebar || !overlay) return;

            const show = (typeof forceState === 'boolean') ? forceState : !sidebar.classList.contains('open');

            if (show) {
                sidebar.classList.add('open');
                overlay.classList.add('active');
                document.body.classList.add('sidebar-open');

                // Stagger sidebar items in one by one
                const items = sidebar.querySelectorAll('.sidebar-item, .sidebar-divider');
                items.forEach(function(el) { el.classList.remove('sb-visible'); });
                items.forEach(function(el, i) {
                    setTimeout(function() { el.classList.add('sb-visible'); }, 80 + i * 60);
                });
            } else {
                sidebar.classList.remove('open');
                overlay.classList.remove('active');
                document.body.classList.remove('sidebar-open');

                // Reset so items re-animate on next open
                const items = sidebar.querySelectorAll('.sidebar-item, .sidebar-divider');
                items.forEach(function(el) { el.classList.remove('sb-visible'); });
            }
        }

        // ==========================================
        // INTERACTIVE SCREEN CONTROLLERS
        // ==========================================
        function openFeatureScreen(feature) {
            toggleSidebar(false);

            const modalTitle = document.getElementById('modal-title');
            const modalBody = document.getElementById('modal-body');
            const modalFooter = document.getElementById('modal-footer');

            modalFooter.style.display = 'none';
            let htmlContent = '';

            if (feature === 'support') {
                modalTitle.innerHTML = `<i class="fa-solid fa-robot"></i> AI Support Assistant`;
                htmlContent = `
                    <div class="chat-container">
                        <div class="chat-history" id="chat-history">
                            <div class="chat-msg msg-bot">
                                Hi <b>${userProfile.name}</b>! 👋 I am the Patel Groceries AI Assistant. How can I help you with your order today?
                            </div>
                        </div>
                        <div class="chat-input-area">
                            <input type="text" id="chat-input" placeholder="Type your issue (e.g. order delayed, refund)..." onkeypress="if(event.key === 'Enter') sendChatMessage()">
                            <button onclick="sendChatMessage()"><i class="fa-solid fa-paper-plane"></i></button>
                        </div>
                    </div>
                `;
            }
            else if (feature === 'orders') {
                modalTitle.innerText = "My Orders";
                let modalSkeletons = '';
                for (let i = 0; i < 3; i++) {
                    modalSkeletons += `
                        <div style="padding: 15px; border-radius: 12px; border: 1px solid rgba(255,255,255,0.05); background: rgba(255,255,255,0.02); margin-bottom: 12px; display: flex; flex-direction: column; gap: 8px;">
                            <div style="display: flex; justify-content: space-between; align-items: center;">
                                <div class="skeleton-shimmer" style="width: 100px; height: 14px; border-radius: 4px;"></div>
                                <div class="skeleton-shimmer" style="width: 80px; height: 18px; border-radius: 4px;"></div>
                            </div>
                            <div class="skeleton-shimmer" style="width: 90%; height: 12px; border-radius: 4px;"></div>
                            <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 5px;">
                                <div class="skeleton-shimmer" style="width: 50px; height: 16px; border-radius: 4px;"></div>
                                <div class="skeleton-shimmer" style="width: 80px; height: 28px; border-radius: 6px;"></div>
                            </div>
                        </div>
                    `;
                }
                htmlContent = `<div id="my-orders-container" style="min-height:100px;">${modalSkeletons}</div>`;

                // Fetch after DOM is injected (setTimeout 0 ensures element exists)
                setTimeout(() => {
                    const phone = encodeURIComponent(userProfile.contact || '');
                    const email = encodeURIComponent(userProfile.email || '');
                    fetch(`/api/my-orders?phone=${phone}&email=${email}`)
                        .then(r => r.json())
                        .then(data => {
                            const container = document.getElementById('my-orders-container');
                            if (!container) return;
                            if (!data.success || !data.orders.length) {
                                container.innerHTML = `
                                <div style="text-align:center;padding:40px 20px;">
                                    <div style="font-size:3rem;margin-bottom:12px;">🛍️</div>
                                    <div style="font-weight:700;font-size:1.1rem;color:#0f172a;margin-bottom:6px;">No orders yet</div>
                                    <div style="color:#94a3b8;font-size:0.9rem;">Your placed orders will appear here.</div>
                                </div>`;
                                return;
                            }

                            const statusLabel = {
                                waiting_payment: '⏳ Awaiting Payment',
                                pending: '⏳ Pending',
                                packing: '📦 Packing',
                                delivery: '🛵 Out for Delivery',
                                delivered: '✅ Delivered',
                                cancelled: '❌ Cancelled'
                            };
                            const statusColor = {
                                waiting_payment: '#d97706',
                                pending: '#d97706',
                                packing: '#2563eb',
                                delivery: '#7c3aed',
                                delivered: '#16a34a',
                                cancelled: '#ef4444'
                            };

                            container.innerHTML = data.orders.map(o => {
                                const itemsStr = Object.entries(o.items || {}).map(([n, q]) => `${q}× ${n}`).join(', ') || '—';
                                const date = new Date(o.created_at * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
                                const sl = statusLabel[o.order_status] || o.order_status;
                                const sc = statusColor[o.order_status] || '#64748b';
                                const payBadge = o.payment_method === 'upi'
                                    ? '<span style="background:#e0f2fe;color:#0284c7;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">UPI</span>'
                                    : o.payment_method === 'khata'
                                        ? '<span style="background:#f3e8ff;color:#7c3aed;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">Khata</span>'
                                        : '<span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:12px;font-size:0.72rem;font-weight:700;">Cash</span>';
                                return `
                            <div class="feature-card" style="margin-bottom:12px;">
                                <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px;">
                                    <div>
                                        <div class="feature-title" style="margin-bottom:3px;">Order #${o.id.slice(0, 8).toUpperCase()}</div>
                                        <div style="font-size:0.75rem;color:#94a3b8;">${date}</div>
                                    </div>
                                    <span style="color:${sc};font-weight:700;font-size:0.82rem;text-align:right;">${sl}</span>
                                </div>
                                <div class="feature-text" style="margin-bottom:8px;">🛒 ${itemsStr}</div>
                                <div style="display:flex;justify-content:space-between;align-items:center;">
                                    <span style="font-weight:800;font-size:1rem;color:#0f172a;">₹${o.total}</span>
                                    ${payBadge}
                                </div>
                            </div>`;
                            }).join('');
                        })
                        .catch(() => {
                            const c = document.getElementById('my-orders-container');
                            if (c) c.innerHTML = '<div style="text-align:center;color:#ef4444;padding:30px;">❌ Could not load orders.</div>';
                        });
                }, 0);

            } else if (feature === 'khata') {
                modalTitle.innerText = "Digital Ledger";
                htmlContent = `
                    <div style="text-align:center; padding: 20px 0;">
                        <i class="fa-solid fa-book" style="font-size: 3rem; color: var(--khata); margin-bottom:15px;"></i>
                        <h2 style="font-size: 2rem; color: #0f172a;">₹${khataBalance}</h2>
                        <p style="color: var(--text-muted); margin-bottom: 20px;">Total Pending Ledger Balance</p>
                        <button class="pay-khata-btn" onclick="clearKhataLedger()">Clear Balance via UPI</button>
                    </div>
                    <h4 style="margin-bottom:10px;">Ledger Statement Transactions</h4>
                    ${khataBalance > 0 ? `
                    <div class="feature-card">
                        <div style="display:flex; justify-content:space-between;">
                            <b>Groceries Purchased on Credit</b><b style="color: #ef4444;">+ ₹${khataBalance}</b>
                        </div>
                        <div class="feature-text">Pending Settlement</div>
                    </div>` : '<div class="feature-text" style="text-align:center; padding:10px;">No pending bills! You are all clear. 👍</div>'}
                `;
            } else if (feature === 'profile') {
                modalTitle.innerText = "My Profile";
                htmlContent = `
                    <div id="profile-view-state">
                        <div style="text-align:center; padding: 20px 0;">
                            <div class="user-avatar" style="width: 80px; height: 80px; font-size: 2.5rem; margin: 0 auto 10px auto; background: var(--bg-color); color: var(--primary);">
                                <i class="fa-solid fa-user"></i>
                            </div>
                            <h2>${userProfile.name}</h2>
                            <p class="feature-text">${userProfile.contact}</p>
                            <p class="feature-text" style="margin-top:-5px;">${userProfile.email}</p>
                        </div>
                        <button class="pay-khata-btn" onclick="activateProfileEditMode()" style="background:var(--card-bg); color:var(--text-main); border:1px solid var(--border-color);">Edit Account Details</button>
                    </div>
                    <div id="profile-edit-state" style="display:none; padding:10px 0;">
                        <div class="input-group">
                            <label>Full Name</label>
                            <input type="text" id="edit-profile-name" value="${userProfile.name}">
                        </div>
                        <div class="input-group">
                            <label>Phone Number</label>
                            <input type="tel" id="edit-profile-contact" value="${userProfile.contact}" inputmode="numeric" pattern="[0-9]*">
                        </div>
                        <div class="input-group">
                            <label>Email Address</label>
                            <input type="text" id="edit-profile-email" value="${userProfile.email}">
                        </div>
                        <button class="btn-full" onclick="saveActiveProfileChanges()">Save Changes</button>
                    </div>
                `;
            } else if (feature === 'address') {
                modalTitle.innerHTML = `<i class="fa-solid fa-map-location-dot" style="color:var(--primary);"></i> Delivery Addresses`;
                let addrList = '';
                if (addresses.length === 0) {
                    addrList = `
                        <div style="text-align:center; padding:30px 10px;">
                            <div style="font-size:2.5rem; margin-bottom:10px;">📍</div>
                            <div style="font-weight:700; color:var(--text-main); margin-bottom:6px;">No addresses saved yet</div>
                            <div style="font-size:0.85rem; color:var(--text-muted);">Add your delivery location so the owner knows where to bring your order.</div>
                        </div>`;
                }
                addresses.forEach((addr, i) => {
                    const addrText = typeof addr === 'string' ? addr : addr.text;
                    const hasCoords = typeof addr === 'object' && addr.lat && addr.lng;
                    const mapsUrl = hasCoords
                        ? `https://www.google.com/maps?q=${addr.lat},${addr.lng}`
                        : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addrText)}`;
                    addrList += `
                        <div class="feature-card" style="${i === 0 ? 'border: 2px solid var(--primary); background: #f0fdf4;' : ''}">
                            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
                                <div class="feature-title" style="margin-bottom:0;">
                                    <i class="fa-solid fa-location-dot" style="color:var(--primary);"></i>
                                    ${i === 0 ? '✅ Default Address' : `Address #${i + 1}`}
                                </div>
                                ${i === 0 ? '<span style="font-size:0.65rem;font-weight:800;background:#dcfce7;color:#15803d;padding:2px 7px;border-radius:10px;">PRIMARY</span>' : ''}
                            </div>
                            <div class="feature-text" style="font-size:0.85rem; color:var(--text-main); line-height:1.4;">${addrText}</div>
                            ${hasCoords ? `<div style="font-size:0.7rem;color:var(--text-muted);margin-top:3px;">📌 ${addr.lat.toFixed(4)}, ${addr.lng.toFixed(4)}</div>` : ''}
                            <div style="margin-top:10px; display:flex; gap:8px;">
                                <button onclick="openOwnerMap('${addrText.replace(/'/g, "\\'").replace(/"/g, '&quot;')}', ${hasCoords ? addr.lat : 'null'}, ${hasCoords ? addr.lng : 'null'})" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:#eff6ff; color:#1d4ed8; border:none; padding:8px; border-radius:8px; font-size:0.78rem; font-weight:700; cursor:pointer;">
                                    <i class="fa-solid fa-map-location-dot"></i> View on Map
                                </button>
                                <a href="${mapsUrl}" target="_blank" style="flex:1; display:flex; align-items:center; justify-content:center; gap:6px; background:#e0f2fe; color:#0369a1; text-decoration:none; padding:8px; border-radius:8px; font-size:0.78rem; font-weight:700;">
                                    <i class="fa-brands fa-google"></i> Google Maps
                                </a>
                            </div>
                        </div>`;
                });
                htmlContent = addrList + `
                    <button class="pay-khata-btn" onclick="openMapPicker()" style="display:flex; align-items:center; justify-content:center; gap:8px; margin-top:5px;">
                        <i class="fa-solid fa-map-location-dot"></i> Add Address via Map
                    </button>`;
            } else if (feature === 'settings') {
                modalTitle.innerText = "Settings";
                htmlContent = `
                    <div class="feature-card" style="display:flex; justify-content:space-between; align-items:center;">
                        <b>WhatsApp Order Tracking Updates</b>
                        <input type="checkbox" checked style="width:20px; height:20px; accent-color: var(--primary);">
                    </div>
                `;
            } else if (feature === 'terms') {
                modalTitle.innerHTML = `<i class="fa-solid fa-file-contract"></i> Terms &amp; Policies`;
                htmlContent = `
                <div class="terms-hero">
                    <i class="fa-solid fa-shield-halved"></i>
                    <h3>Patel Groceries &mdash; Legal Centre</h3>
                    <p>Last updated: June 2026 &nbsp;&bull;&nbsp; Effective immediately upon use of our service</p>
                </div>

                <div class="terms-tabs">
                    <div class="terms-tab active" id="terms-tab-tos" onclick="switchTermsTab('tos')">&#128196; Terms of Use</div>
                    <div class="terms-tab" id="terms-tab-privacy" onclick="switchTermsTab('privacy')">&#128274; Privacy</div>
                    <div class="terms-tab" id="terms-tab-refund" onclick="switchTermsTab('refund')">&#8617; Refunds</div>
                </div>

                <!-- TERMS OF SERVICE -->
                <div id="terms-panel-tos" class="terms-panel active">
                    <div class="terms-section open">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-circle-info"></i></div>
                            <span class="terms-section-title">1. About Patel Groceries</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            Patel Groceries is a neighbourhood grocery delivery service operating locally in Patna, Bihar, India. By accessing or using our application, you agree to be bound by these Terms of Service and all applicable laws. If you do not agree, please do not use our service.
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-user-check"></i></div>
                            <span class="terms-section-title">2. Eligibility &amp; Account Registration</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            <ul>
                                <li>You must be at least <strong>18 years of age</strong> (or have parental consent) to use this service.</li>
                                <li>You must provide a <strong>valid name, phone number and email address</strong> during registration.</li>
                                <li>OTPs are used for secure, passwordless login. <strong>Never share your OTP</strong> with anyone, including our staff.</li>
                                <li>You are responsible for all activities conducted through your account session.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-cart-shopping"></i></div>
                            <span class="terms-section-title">3. Orders &amp; Delivery</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            <ul>
                                <li>We strive to deliver within <strong>10 minutes</strong>. Actual times may vary based on demand, weather and availability.</li>
                                <li>All orders are subject to <strong>product availability</strong>. Out-of-stock items will be notified before dispatch.</li>
                                <li>Prices shown are <strong>inclusive of all taxes</strong> unless otherwise stated.</li>
                                <li>Orders once confirmed <strong>cannot be cancelled</strong> without immediately contacting support.</li>
                                <li>The <strong>Digital Ledger</strong> feature allows trusted customers to buy on store credit, subject to a limit set by the owner.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-ban"></i></div>
                            <span class="terms-section-title">4. Prohibited Conduct</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            You agree not to:
                            <ul>
                                <li>Place <strong>fraudulent or false orders</strong> with no intent to pay.</li>
                                <li>Misuse the Digital Ledger / Store Credit system.</li>
                                <li>Attempt to <strong>reverse-engineer, scrape or hack</strong> any part of the application.</li>
                                <li>Use abusive or threatening language with our delivery staff or support team.</li>
                                <li>Submit <strong>misleading images</strong> to the AI grocery-list scanner.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-gavel"></i></div>
                            <span class="terms-section-title">5. Limitation of Liability</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            Patel Groceries shall not be liable for any <strong>indirect, incidental or consequential damages</strong> arising from use of our service. Our maximum liability in any dispute shall not exceed the <strong>value of the specific order</strong> in question. We are not responsible for delays caused by third-party payment providers or network outages.
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-pen-to-square"></i></div>
                            <span class="terms-section-title">6. Changes to Terms</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            We reserve the right to update these Terms at any time. Continued use of the app after changes are posted constitutes your acceptance of the revised Terms. Registered users will be notified of significant changes via email.
                        </div>
                    </div>
                    <p class="terms-updated">Governing Law: Republic of India &nbsp;&bull;&nbsp; Jurisdiction: Patna, Bihar</p>
                </div>

                <!-- PRIVACY POLICY -->
                <div id="terms-panel-privacy" class="terms-panel">
                    <div class="terms-section open">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-database"></i></div>
                            <span class="terms-section-title">1. Data We Collect</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            We collect the following when you use Patel Groceries:
                            <ul>
                                <li><strong>Personal Identifiers:</strong> Full name, email address and mobile number provided at login.</li>
                                <li><strong>Delivery Information:</strong> Addresses you save in the app.</li>
                                <li><strong>Order History:</strong> Items purchased, amounts paid and store credit usage.</li>
                                <li><strong>Device &amp; Usage Data:</strong> Browser type, IP address and session activity for security.</li>
                                <li><strong>Uploaded Images:</strong> Grocery list photos processed locally by the AI scanner &mdash; not stored on our servers.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-circle-nodes"></i></div>
                            <span class="terms-section-title">2. How We Use Your Data</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            <ul>
                                <li>To send <strong>OTP login codes</strong> to your email securely via Gmail SMTP.</li>
                                <li>To process, fulfil and deliver your <strong>grocery orders</strong>.</li>
                                <li>To manage your <strong>Digital Ledger</strong> account balance.</li>
                                <li>To improve app features, fix bugs and personalise your shopping experience.</li>
                                <li>To contact you via phone or email about your orders, refunds or support tickets.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-share-nodes"></i></div>
                            <span class="terms-section-title">3. Data Sharing &amp; Third Parties</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            We <strong>do not sell or rent</strong> your personal data. Data may only be shared with:
                            <ul>
                                <li><strong>Google (Gmail SMTP)</strong> &mdash; solely for sending OTP verification emails.</li>
                                <li><strong>Payment providers</strong> (e.g., UPI apps) &mdash; limited transaction data when you clear store credit.</li>
                                <li><strong>Legal authorities</strong> &mdash; if required by applicable Indian law or a valid court order.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-lock"></i></div>
                            <span class="terms-section-title">4. Data Security</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            We implement industry-standard security measures including:
                            <ul>
                                <li><strong>SSL/TLS encryption</strong> on all data in transit.</li>
                                <li><strong>Signed server-side sessions</strong> with secure secret keys for OTP management.</li>
                                <li><strong>App-specific Gmail passwords</strong> with 2FA enabled on our email account.</li>
                                <li>No payment card details are ever stored on our servers.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-sliders"></i></div>
                            <span class="terms-section-title">5. Your Rights</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            You have the right to:
                            <ul>
                                <li><strong>Access</strong> the personal data we hold about you.</li>
                                <li><strong>Correct</strong> inaccurate information via My Profile in the app.</li>
                                <li><strong>Request deletion</strong> of your account by contacting our support team.</li>
                                <li>Withdraw consent for promotional communications at any time.</li>
                            </ul>
                            To exercise any right, use the Help &amp; Support chat in the app.
                        </div>
                    </div>
                    <p class="terms-updated">Privacy queries: rajpriyanshu6083@gmail.com</p>
                </div>

                <!-- REFUND POLICY -->
                <div id="terms-panel-refund" class="terms-panel">
                    <div class="terms-section open">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-rotate-left"></i></div>
                            <span class="terms-section-title">1. Eligibility for Refunds</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            We offer refunds or replacements when:
                            <ul>
                                <li>Item received is <strong>damaged, spoiled or expired</strong> at the time of delivery.</li>
                                <li>A <strong>wrong item</strong> was delivered that differs from what you ordered.</li>
                                <li>An item was <strong>missing</strong> from your order at delivery.</li>
                                <li>Order was <strong>not delivered</strong> despite being marked as delivered.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-clock"></i></div>
                            <span class="terms-section-title">2. Refund Timeframe</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            <ul>
                                <li>Requests must be raised <strong>within 30 minutes</strong> of delivery via the Help &amp; Support chat.</li>
                                <li>Approved refunds are credited to your <strong>original payment method or store credit</strong> within 24&ndash;48 hours.</li>
                                <li>Digital Ledger adjustments are processed immediately upon approval.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-circle-xmark"></i></div>
                            <span class="terms-section-title">3. Non-Refundable Items</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            The following are <strong>not eligible</strong> for refund:
                            <ul>
                                <li>Items that have been <strong>fully consumed or partially used</strong>.</li>
                                <li>Perishables where the complaint is raised <strong>more than 30 minutes after delivery</strong>.</li>
                                <li>Items returned without <strong>original packaging or billing proof</strong>.</li>
                                <li>Products clearly listed as <strong>clearance or no-return</strong> items.</li>
                            </ul>
                        </div>
                    </div>
                    <div class="terms-section">
                        <button class="terms-section-header" onclick="toggleTermsSection(this)">
                            <div class="terms-section-icon"><i class="fa-solid fa-headset"></i></div>
                            <span class="terms-section-title">4. How to Raise a Refund</span>
                            <i class="fa-solid fa-chevron-down terms-section-chevron"></i>
                        </button>
                        <div class="terms-section-body">
                            To request a refund:
                            <ul>
                                <li>Open <strong>Help &amp; Support</strong> from the sidebar menu.</li>
                                <li>Describe your issue to the AI Assistant (e.g., &ldquo;wrong item delivered&rdquo;).</li>
                                <li>A live agent will call your registered number within <strong>5 minutes</strong> (8 AM &ndash; 10 PM IST).</li>
                                <li>Or email us directly at <strong>rajpriyanshu6083@gmail.com</strong>.</li>
                            </ul>
                        </div>
                    </div>
                    <p class="terms-updated">We stand behind every order. Customer satisfaction is our #1 priority. 🛒</p>
                </div>
                `;
            }

            modalBody.innerHTML = htmlContent;
            document.getElementById('slide-modal').classList.add('open');
            document.getElementById('modal-overlay').classList.add('active');
        }

        // ==========================================
        // AI CHATBOT LOGIC
        // ==========================================
        function sendChatMessage() {
            const inputField = document.getElementById('chat-input');
            const msg = inputField.value.trim();
            if (!msg) return;

            const chatHistory = document.getElementById('chat-history');
            chatHistory.innerHTML += `<div class="chat-msg msg-user">${msg}</div>`;
            inputField.value = '';
            chatHistory.scrollTop = chatHistory.scrollHeight;

            setTimeout(() => {
                let category = "General Inquiry";
                const lowerMsg = msg.toLowerCase();

                if (lowerMsg.includes("delay") || lowerMsg.includes("late") || lowerMsg.includes("time") || lowerMsg.includes("where")) {
                    category = "Delayed Delivery";
                } else if (lowerMsg.includes("refund") || lowerMsg.includes("money") || lowerMsg.includes("pay") || lowerMsg.includes("upi")) {
                    category = "Payment/Refund Issue";
                } else if (lowerMsg.includes("missing") || lowerMsg.includes("wrong") || lowerMsg.includes("item") || lowerMsg.includes("forgot")) {
                    category = "Order Discrepancy";
                } else if (lowerMsg.includes("bad") || lowerMsg.includes("rotten") || lowerMsg.includes("quality") || lowerMsg.includes("expired")) {
                    category = "Quality Complaint";
                }

                const greeting = `I understand you are facing a <b>${category}</b>. Let me immediately connect you to a live human agent with your details.`;

                chatHistory.innerHTML += `
                    <div class="chat-msg msg-bot">
                        ${greeting}
                    </div>
                `;
                chatHistory.scrollTop = chatHistory.scrollHeight;

                setTimeout(() => {
                    const transmitting = `<b><i class="fa-solid fa-satellite-dish"></i> TRANSMITTING TO LIVE AGENT...</b>`;

                    chatHistory.innerHTML += `
                        <div class="chat-msg msg-system">
                            ${transmitting}<br><br>
                            <div style="text-align:left;">
                                <b>Name:</b> ${userProfile.name}<br>
                                <b>Contact:</b> ${userProfile.contact}<br>
                                <b>Email:</b> ${userProfile.email}<br>
                                <b>Issue Logged:</b> "${msg}"
                            </div>
                        </div>
                    `;
                    chatHistory.scrollTop = chatHistory.scrollHeight;

                    setTimeout(() => {
                        const committed = `✅ Ticket generated and sent to the team! A support agent will call you at <b>${userProfile.contact}</b> within 5 minutes with a solution.`;

                        // Persist support ticket in SQLite via Flask backend
                        fetch('/api/support/create', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                customer_name: userProfile.name || 'Guest',
                                customer_phone: userProfile.contact || 'None',
                                customer_email: userProfile.email || 'None',
                                issue: msg,
                                category: category
                            })
                        })
                        .then(r => r.json())
                        .then(data => {
                            if (!data.success) {
                                console.error("Error logging support ticket:", data.message);
                            }
                        })
                        .catch(err => console.error("Network error logging support ticket:", err));

                        chatHistory.innerHTML += `
                            <div class="chat-msg msg-bot">
                                ${committed}
                            </div>
                        `;
                        chatHistory.scrollTop = chatHistory.scrollHeight;
                    }, 2000);

                }, 1500);

            }, 1000);
        }

        // ==========================================
        // DYNAMIC STATE ACTION MODULES
        // ==========================================
        function activateProfileEditMode() {
            document.getElementById('profile-view-state').style.display = 'none';
            document.getElementById('profile-edit-state').style.display = 'block';
        }

        function saveActiveProfileChanges() {
            const upName = document.getElementById('edit-profile-name').value.trim();
            const upContact = document.getElementById('edit-profile-contact').value.trim();
            const upEmail = document.getElementById('edit-profile-email').value.trim();

            if (!upName || !upContact || !upEmail) {
                alert("Fields cannot be left blank.");
                return;
            }
            userProfile.name = upName;
            userProfile.contact = upContact;
            userProfile.email = upEmail;

            document.getElementById('sidebar-name').innerText = upName;
            document.getElementById('sidebar-contact').innerText = upContact;
            currentUser = upName;
            _saveState();
            updateCustomerDashboard();
            alert("Changes successfully committed!");
            openFeatureScreen('profile');
        }

        function clearKhataLedger() {
            if (khataBalance <= 0) {
                alert("Account balance is already balanced out.");
                return;
            }

            const loader = document.getElementById('ai-loader');
            const icon = document.getElementById('ai-loader-icon');
            const title = document.getElementById('ai-loader-title');
            const subtext = document.getElementById('ai-subtext');

            icon.className = "fa-solid fa-indian-rupee-sign";
            title.innerText = "Secure UPI Gateway";
            subtext.innerText = "Waiting for you to complete payment on your UPI app...";
            loader.classList.add('active');

            setTimeout(() => {
                subtext.innerText = "Payment received! Verifying transaction securely...";
                setTimeout(() => {
                    khataBalance = 0;
                    loader.classList.remove('active');
                    alert("✅ Payment Verified Successfully! Your Digital Ledger balance is now ₹0.");
                    openFeatureScreen('khata');
                }, 1500);
            }, 3000);
        }

        function executeReorder() {
            cart[1] = (cart[1] || 0) + 2;
            cart[11] = (cart[11] || 0) + 1;
            cart[15] = (cart[15] || 0) + 1;
            _saveState();
            alert("Past elements fetched and dropped directly into active cart.");
            openCart();
        }

        function processCheckoutOrder(type) {
            if (type === 'khata') {
                if (Object.keys(cart).length === 0) {
                    alert('Your cart is empty.');
                    return;
                }
                const _da_k = _getDefaultDeliveryAddress();
                if (!_da_k.text) {
                    alert("📍 Please add a delivery address to complete your Store Credit order.");
                    _pendingCheckoutType = 'khata';
                    openMapPicker();
                    return;
                }
                const items = {};
                Object.keys(cart).forEach(id => {
                    const p = inventory.find(x => x.id == id);
                    if (p) items[p.name] = cart[id];
                });
                const total = Object.keys(cart).reduce((s, id) => {
                    const p = inventory.find(x => x.id == id);
                    return s + (p ? p.price * cart[id] : 0);
                }, 0);

                const loader = document.getElementById('ai-loader');
                document.getElementById('ai-loader-icon').className = 'fa-solid fa-book';
                document.getElementById('ai-loader-title').innerText = 'Adding to Digital Ledger…';
                document.getElementById('ai-subtext').innerText = 'Recording store credit…';
                loader.classList.add('active');
                fetch('/api/place-order', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customer_name: userProfile.name,
                        customer_phone: userProfile.contact,
                        customer_email: userProfile.email,
                        payment_method: 'khata',
                        total, items,
                        veggie_video: document.getElementById('veggie-video-check')?.checked || false,
                        delivery_address: _da_k.text,
                        delivery_lat: _da_k.lat,
                        delivery_lng: _da_k.lng
                    })
                })
                    .then(r => r.json())
                    .then(data => {
                        loader.classList.remove('active');
                        if (!data.success) {
                            alert('❌ ' + (data.message || 'Could not record store credit.'));
                            return;
                        }
                        khataBalance += total;   // update local ledger balance
                        cart = {};
                        _saveState(); // ← persist empty cart & khata
                        updateCustomerDashboard();
                        document.getElementById('cart-count').innerText = 0;
                        closeModal();
                        filterProducts();
                        alert(`✅ ₹${total} added to your Digital Ledger (Store Credit).\nYour total balance: ₹${khataBalance}`);
                    })
                    .catch(() => {
                        loader.classList.remove('active');
                        alert('❌ Network error. Please try again.');
                    });
            }
        }

        // ── PAYMENT SELECTION FLOW ────────────────────────────────

        let _payOrderTotal = 0;
        let _payPollTimer = null;

        function openPaymentSelection() {
            // Check if address exists first!
            const _da = _getDefaultDeliveryAddress();
            if (!_da.text) {
                alert("📍 Please add a delivery address to complete your order.");
                _pendingCheckoutType = 'payment_selection';
                openMapPicker();
                return;
            }

            // Calculate total
            _payOrderTotal = Object.keys(cart).reduce((s, id) => {
                const p = inventory.find(x => x.id == id);
                return s + (p ? p.price * cart[id] : 0);
            }, 0);

            // Inject payment selection into modal body (replace cart content temporarily)
            const modalBody = document.getElementById('modal-body');
            const modalFooter = document.getElementById('modal-footer');
            const modalTitle = document.getElementById('modal-title');

            modalTitle.innerHTML = '💳 Choose Payment';
            modalFooter.style.display = 'none';

            // Build delivery address section
            const addrSection = _da.text
                ? `<div style="background:#f0fdf4; border:1.5px solid var(--primary); border-radius:12px; padding:11px 13px; margin-bottom:14px;">
                      <div style="font-size:0.65rem; font-weight:800; color:var(--primary); text-transform:uppercase; letter-spacing:1px; margin-bottom:4px;">📦 Delivering to</div>
                      <div style="font-size:0.82rem; color:var(--text-main); font-weight:600; line-height:1.4;">${_da.text}</div>
                      <button onclick="openMapPicker()" style="background:none; border:none; color:var(--primary); font-size:0.75rem; font-weight:700; cursor:pointer; padding:4px 0 0; display:flex; align-items:center; gap:4px;">
                          <i class="fa-solid fa-pencil"></i> Change Address
                      </button>
                   </div>`
                : `<div style="background:#fff7ed; border:1.5px solid #fdba74; border-radius:12px; padding:11px 13px; margin-bottom:14px;">
                      <div style="font-size:0.82rem; color:#c2410c; font-weight:700; margin-bottom:6px;">📍 No delivery address saved</div>
                      <button onclick="openMapPicker()" style="display:flex; align-items:center; justify-content:center; gap:6px; width:100%; background:var(--primary); color:white; border:none; padding:9px; border-radius:8px; font-size:0.82rem; font-weight:800; cursor:pointer;">
                          <i class="fa-solid fa-map-location-dot"></i> Add Delivery Address
                      </button>
                   </div>`;

            modalBody.innerHTML = `
                <div style="text-align:center; margin-bottom:10px;">
                    <div style="font-size:0.85rem;color:var(--text-muted);">Order Total</div>
                    <div style="font-size:2rem;font-weight:900;color:var(--primary);">₹${_payOrderTotal}</div>
                </div>
                ${addrSection}
                <div class="pay-method-grid">
                    <div class="pay-method-card cash" onclick="processCashOrder()">
                        <div class="pay-method-icon">💵</div>
                        <div class="pay-method-label">Cash on Delivery</div>
                        <div class="pay-method-sub">Pay when order arrives</div>
                    </div>
                    <div class="pay-method-card upi" onclick="showUpiQrScreen()">
                        <div class="pay-method-icon">📱</div>
                        <div class="pay-method-label">Pay Online (UPI)</div>
                        <div class="pay-method-sub">PhonePe · GPay · Paytm</div>
                    </div>
                </div>
                <button onclick="openCart()" style="width:100%;background:none;border:1px solid var(--border-color);border-radius:10px;padding:10px;font-size:0.85rem;color:var(--text-muted);cursor:pointer;">
                    ← Back to Cart
                </button>
            `;
        }

        function processCashOrder() {
            const items = {};
            Object.keys(cart).forEach(id => {
                const p = inventory.find(x => x.id == id);
                if (p) items[p.name] = cart[id];
            });

            const loader = document.getElementById('ai-loader');
            document.getElementById('ai-loader-icon').className = 'fa-solid fa-bag-shopping';
            document.getElementById('ai-loader-title').innerText = 'Placing your order…';
            document.getElementById('ai-subtext').innerText = 'Almost done!';
            loader.classList.add('active');

            const _da_c = _getDefaultDeliveryAddress();
            fetch('/api/place-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_name: userProfile.name,
                    customer_phone: userProfile.contact,
                    customer_email: userProfile.email,
                    payment_method: 'cash',
                    total: _payOrderTotal,
                    items,
                    veggie_video: document.getElementById('veggie-video-check')?.checked || false,
                    delivery_address: _da_c.text,
                    delivery_lat: _da_c.lat,
                    delivery_lng: _da_c.lng
                })
            })
                .then(r => r.json())
                .then(data => {
                    loader.classList.remove('active');
                    if (data.success) {
                        cart = {};
                        _saveState(); // ← persist empty cart
                        updateCustomerDashboard();
                        document.getElementById('cart-count').innerText = 0;
                        filterProducts();
                        closeModal();
                        setTimeout(() => alert(`✅ Order confirmed!\n\nOrder ID: ${data.order_id.slice(0, 8).toUpperCase()}\n\n💵 Pay ₹${_payOrderTotal} cash on delivery.\nWe'll deliver within 10 minutes!`), 200);
                    } else {
                        alert('❌ ' + data.message);
                    }
                })
                .catch(() => {
                    loader.classList.remove('active');
                    alert('❌ Network error. Please try again.');
                });
        }

        window.copyUpiIdToClipboard = function(text, btnId) {
            navigator.clipboard.writeText(text).then(() => {
                const btn = document.getElementById(btnId);
                if (btn) {
                    const originalHtml = btn.innerHTML;
                    btn.innerHTML = `<i class="fa-solid fa-check"></i> Copied!`;
                    btn.classList.add('copied');
                    setTimeout(() => {
                        btn.innerHTML = originalHtml;
                        btn.classList.remove('copied');
                    }, 2000);
                }
            }).catch(err => {
                console.error("Failed to copy UPI ID: ", err);
                alert("Could not copy automatically. UPI ID is: " + text);
            });
        };

        function showUpiQrScreen() {
            const modalBody = document.getElementById('modal-body');
            const modalTitle = document.getElementById('modal-title');
            modalTitle.innerHTML = '📱 Pay via UPI';
            modalBody.innerHTML = `
                <div style="text-align:center; padding: 40px 20px; color: var(--text-muted);">
                    <i class="fa-solid fa-circle-notch fa-spin" style="font-size:2rem; color:var(--primary); margin-bottom:12px;"></i>
                    <div>Generating dynamic UPI QR code...</div>
                </div>
            `;

            fetch('/api/config/upi')
                .then(r => r.json())
                .then(config => {
                    const upiId = '6206709800@nyes';
                    const upiName = config.name || 'Priyanshu Raj';
                    const merchantName = upiName.toUpperCase();

                    const os = (function() {
                        const ua = navigator.userAgent || navigator.vendor || window.opera;
                        if (/android/i.test(ua)) return 'android';
                        if (/iPad|iPhone|iPod/.test(ua) && !window.MSStream) return 'ios';
                        return 'desktop';
                    })();

                    const upiParams = `pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${_payOrderTotal}&cu=INR&tn=PatelGroceriesOrder`;
                    const upiUrl = `upi://pay?${upiParams}`;
                    const qrCodeSrc = `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(upiUrl)}`;

                    // App deep links
                    let gpayUrl = upiUrl;
                    let phonepeUrl = upiUrl;
                    let paytmUrl = upiUrl;
                    let bhimUrl = upiUrl;

                    if (os === 'android') {
                        gpayUrl = `intent://pay?${upiParams}#Intent;scheme=upi;package=com.google.android.apps.nbu.paisa.user;end`;
                        phonepeUrl = `intent://pay?${upiParams}#Intent;scheme=upi;package=com.phonepe.app;end`;
                        paytmUrl = `intent://pay?${upiParams}#Intent;scheme=upi;package=net.one97.paytm;end`;
                        bhimUrl = `intent://pay?${upiParams}#Intent;scheme=in.org.npci.upiapp;end`;
                    } else if (os === 'ios') {
                        gpayUrl = `gpay://upi/pay?${upiParams}`;
                        phonepeUrl = `phonepe://upi/pay?${upiParams}`;
                        paytmUrl = `paytmmp://upi/pay?${upiParams}`;
                        bhimUrl = `bhim://upi/pay?${upiParams}`;
                    }

                    // Build platform specific HTML
                    let platformHtml = '';
                    if (os === 'desktop') {
                        platformHtml = `
                            <div class="upi-desktop-info-card">
                                <p>🖥️ <b>Paying from Desktop?</b> Scan the QR code above with Google Pay, PhonePe, Paytm, or BHIM on your phone.</p>
                                <div class="upi-instruction-title" style="margin-top: 10px;">Or Copy UPI ID:</div>
                                <div class="upi-copy-container">
                                    <span class="upi-copy-text">${upiId}</span>
                                    <button id="desktop-copy-btn" class="upi-copy-btn" onclick="copyUpiIdToClipboard('${upiId}', 'desktop-copy-btn')">
                                        <i class="fa-solid fa-copy"></i> Copy ID
                                    </button>
                                </div>
                            </div>
                            <div class="upi-or-divider">OR</div>
                            <a href="${upiUrl}" style="display:block;background:linear-gradient(135deg,#374151,#1f2937);color:white;text-decoration:none;padding:14px;border-radius:12px;font-weight:800;font-size:0.95rem;margin-bottom:12px;box-shadow:0 4px 14px rgba(0,0,0,0.15);">
                                📲 Open Default UPI App (Desktop)
                            </a>
                        `;
                    } else {
                        // Mobile (Android / iOS)
                        platformHtml = `
                            <div class="upi-platform-container">
                                <div class="upi-instruction-title">⚡ Pay Directly via Installed App</div>
                                <div class="upi-app-grid">
                                    <a href="${gpayUrl}" class="upi-app-btn gpay">
                                        <i class="fa-brands fa-google-pay" style="font-size: 1.4rem;"></i> GPay
                                    </a>
                                    <a href="${phonepeUrl}" class="upi-app-btn phonepe">
                                        <i class="fa-solid fa-mobile-screen-button"></i> PhonePe
                                    </a>
                                    <a href="${paytmUrl}" class="upi-app-btn paytm">
                                        <i class="fa-solid fa-wallet"></i> Paytm
                                    </a>
                                    <a href="${bhimUrl}" class="upi-app-btn bhim">
                                        <i class="fa-solid fa-bolt"></i> BHIM
                                    </a>
                                    <a href="${upiUrl}" class="upi-app-btn generic">
                                        📲 Other / All UPI Apps
                                    </a>
                                </div>
                                
                                <div class="upi-or-divider">OR</div>
                                
                                <div class="upi-desktop-info-card" style="padding: 10px; margin-bottom: 0;">
                                    <p style="margin-bottom: 6px; font-size: 0.8rem; text-align: center;">Need to copy the UPI ID?</p>
                                    <div class="upi-copy-container" style="margin-top: 0;">
                                        <span class="upi-copy-text" style="font-size: 0.8rem;">${upiId}</span>
                                        <button id="mobile-copy-btn" class="upi-copy-btn" onclick="copyUpiIdToClipboard('${upiId}', 'mobile-copy-btn')">
                                            <i class="fa-solid fa-copy"></i> Copy
                                        </button>
                                    </div>
                                </div>
                            </div>
                        `;
                    }

                    modalBody.innerHTML = `
                    <div class="upi-qr-screen">
                        <div class="upi-Pate-groceries-header">
                            <div class="upi-Pate-groceries-logo">Pe</div>
                            <div class="upi-Pate-groceries-name">PhonePe</div>
                        </div>
                        <span class="upi-accepted-tag">✦ Accepted Here</span>

                        <div class="upi-qr-wrap" style="margin: 20px auto; width: 220px; height: 220px; background: white; padding: 10px; border-radius: 16px; border: 1px solid var(--border-color); display: flex; align-items: center; justify-content: center; box-shadow: 0 4px 10px rgba(0,0,0,0.05);">
                            <img src="${qrCodeSrc}" alt="UPI QR Code" style="width: 200px; height: 200px; display: block; border-radius: 8px;">
                        </div>

                        <div class="upi-amount-badge">₹${_payOrderTotal}</div>
                        <div class="upi-scan-hint">
                            Scan with any UPI app · PhonePe · Google Pay · Paytm · BHIM<br>
                            <b>${merchantName}</b>
                        </div>

                        ${platformHtml}

                        <button class="upi-paid-btn" onclick="claimUpiPayment()" style="margin-top: 10px;">
                            ✅ I've Paid — Notify Owner
                        </button>
                        <button class="upi-back-link" onclick="openPaymentSelection()">← Change payment method</button>
                    </div>
                `;
                })
                .catch(err => {
                    console.error("UPI config load failed:", err);
                    modalBody.innerHTML = `
                    <div style="text-align:center; padding:30px; color:#ef4444;">
                        ❌ Could not load payment configuration. Please try again.
                        <br><br>
                        <button onclick="openPaymentSelection()" style="width:auto; padding:8px 15px;">Back</button>
                    </div>
                `;
                });
        }

        function claimUpiPayment() {
            const items = {};
            Object.keys(cart).forEach(id => {
                const p = inventory.find(x => x.id == id);
                if (p) items[p.name] = cart[id];
            });

            const modalBody = document.getElementById('modal-body');
            const modalTitle = document.getElementById('modal-title');
            modalTitle.innerHTML = '⏳ Waiting for Confirmation';

            // Show waiting screen immediately
            modalBody.innerHTML = `
                <div class="pay-waiting-screen">
                    <span class="pay-waiting-icon">🔔</span>
                    <div class="pay-waiting-title">Notifying the owner…</div>
                    <div class="pay-waiting-sub">
                        The owner has been notified via SMS & email.<br>
                        They will verify your UPI payment and confirm shortly.<br><br>
                        <b>Please don't close this screen.</b>
                    </div>
                    <div class="pay-status-dots" style="margin-top:18px;">
                        <span></span><span></span><span></span>
                    </div>
                    <div style="margin-top:20px;font-size:0.78rem;color:var(--text-muted);" id="pay-wait-time">Waiting…</div>
                </div>
            `;

            // Start wait timer display
            let secs = 0;
            const timerEl = document.getElementById('pay-wait-time');
            const dispTimer = setInterval(() => {
                secs++;
                if (timerEl) timerEl.innerText = `Waiting ${secs}s…`;
            }, 1000);

            const _da_u = _getDefaultDeliveryAddress();
            // POST to backend
            fetch('/api/place-order', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customer_name: userProfile.name,
                    customer_phone: userProfile.contact,
                    customer_email: userProfile.email,
                    payment_method: 'upi',
                    total: _payOrderTotal,
                    items,
                    veggie_video: document.getElementById('veggie-video-check')?.checked || false,
                    delivery_address: _da_u.text,
                    delivery_lat: _da_u.lat,
                    delivery_lng: _da_u.lng
                })
            })
                .then(r => r.json())
                .then(data => {
                    if (!data.success) {
                        clearInterval(dispTimer);
                        alert('❌ ' + data.message);
                        return;
                    }
                    const orderId = data.order_id;
                    // Start polling
                    if (_payPollTimer) clearInterval(_payPollTimer);
                    _payPollTimer = setInterval(() => pollPaymentStatus(orderId, dispTimer), 4000);
                })
                .catch(() => {
                    clearInterval(dispTimer);
                    alert('❌ Network error. Please try again.');
                });
        }

        function pollPaymentStatus(orderId, dispTimer) {
            fetch(`/api/payment-status/${orderId}`)
                .then(r => r.json())
                .then(data => {
                    if (!data.success) return;
                    const status = data.payment_status;

                    if (status === 'paid_upi') {
                        // Confirmed!
                        clearInterval(_payPollTimer);
                        clearInterval(dispTimer);
                        cart = {};
                        _saveState(); // ← persist empty cart
                        updateCustomerDashboard();
                        document.getElementById('cart-count').innerText = 0;
                        filterProducts();

                        document.getElementById('modal-title').innerHTML = '✅ Payment Confirmed!';
                        document.getElementById('modal-body').innerHTML = `
                        <div class="pay-success-screen">
                            <span class="pay-result-icon">🎉</span>
                            <div class="pay-result-title" style="color:#16a34a;">Payment Confirmed!</div>
                            <div class="pay-result-sub">
                                Your UPI payment of <b>₹${_payOrderTotal}</b> has been verified.<br>
                                Order <b>#${orderId.slice(0, 8).toUpperCase()}</b> is now being packed.<br>
                                Expected delivery: <b>10 minutes</b> 🛵
                            </div>
                            <button onclick="closeModal()" class="btn-full">🏠 Back to Shopping</button>
                        </div>
                    `;

                    } else if (status === 'rejected') {
                        // Rejected
                        clearInterval(_payPollTimer);
                        clearInterval(dispTimer);

                        document.getElementById('modal-title').innerHTML = '❌ Payment Not Verified';
                        document.getElementById('modal-body').innerHTML = `
                        <div class="pay-rejected-screen">
                            <span class="pay-result-icon">😔</span>
                            <div class="pay-result-title" style="color:#ef4444;">Payment Not Received</div>
                            <div class="pay-result-sub">
                                The owner could not verify your UPI payment.<br>
                                Please try again or choose Cash on Delivery.
                            </div>
                            <button onclick="openPaymentSelection()" class="btn-full" style="margin-bottom:10px;">🔄 Try Again</button>
                            <button onclick="closeModal()" style="width:100%;background:none;border:1px solid var(--border-color);border-radius:10px;padding:12px;cursor:pointer;">Cancel</button>
                        </div>
                    `;
                    }
                    // If still 'pending_verification', keep polling
                })
                .catch(() => { }); // Silent fail — keep polling
        }

        // ==========================================
        // CART MODAL CONTAINER CONTROL
        // ==========================================
        function openCart() {
            document.getElementById('modal-title').innerText = "Your Cart";
            document.getElementById('modal-footer').style.display = 'flex';
            renderCartContent();
            document.getElementById('slide-modal').classList.add('open');
            document.getElementById('modal-overlay').classList.add('active');
        }

        function closeModal() {
            document.getElementById('slide-modal').classList.remove('open');
            document.getElementById('modal-overlay').classList.remove('active');
        }

        // ==========================================
        // REAL TIME CAMERA PARCHI AI SCANNING
        // ==========================================
        async function processRealAI(input) {
            if (!input.files || input.files.length === 0) return;
            const file = input.files[0];
            const loader = document.getElementById('ai-loader');
            const subtext = document.getElementById('ai-subtext');
            document.getElementById('ai-loader-icon').className = "fa-solid fa-file-image";
            document.getElementById('ai-loader-title').innerText = "🤖 AI Engine Running...";
            loader.classList.add('active');
            subtext.innerText = "Analyzing handwritten text structural layers... Please wait.";

            try {
                const result = await Tesseract.recognize(file, 'eng');
                const recognizedText = result.data.text.toLowerCase();
                subtext.innerText = "Scanning completed! Filtering matched listings...";

                const keywordMap = {
                    "potato": 1, "aloo": 1, "onion": 2, "pyaz": 2, "tomato": 3,
                    "coke": 7, "pepsi": 8, "milk": 11, "dudh": 11,
                    "bread": 15, "atta": 17, "flour": 17, "dal": 19, "toor": 19,
                    "oil": 22, "tel": 22, "salt": 23, "namak": 23, "maggi": 27,
                    "noodles": 27, "biscuit": 30, "parle": 30, "surf": 38,
                    "detergent": 38, "vim": 39, "dishwash": 39,
                    "garlic": 101, "lahsun": 101, "ginger": 102, "adrak": 102,
                    "chili": 103, "chilies": 103, "mirchi": 103, "lemon": 104, "nimbu": 104,
                    "sprite": 112, "frooti": 114, "juice": 114,
                    "paneer": 122, "egg": 124, "eggs": 124, "anda": 124,
                    "sugar": 133, "chini": 133, "tea": 147, "chai": 147,
                    "coffee": 148, "soap": 155, "sabun": 155
                };

                let itemsAddedCount = 0;
                for (const [word, id] of Object.entries(keywordMap)) {
                    if (recognizedText.includes(word)) {
                        if (!cart[id]) cart[id] = 0;
                        cart[id] += 1;
                        itemsAddedCount++;
                    }
                }

                loader.classList.remove('active');
                _saveState(); // ← persist new AI cart items
                filterProducts();
                bounceCartIcon();
                input.value = '';

                if (itemsAddedCount > 0) {
                    alert(`🤖 AI Scanner identified & loaded ${itemsAddedCount} items from list parsing execution.`);
                    openCart();
                } else {
                    alert(`🤖 AI analysis finished but found no vocabulary mapping parameters matched current catalog. Try writing more clearly!`);
                }
            } catch (error) {
                console.error(error);
                loader.classList.remove('active');
                alert("OCR verification routine exception captured.");
            }
        }

        // ==========================================
        // DYNAMIC SCREEN RENDER CONTROLLERS
        // ==========================================
        function renderCategories() {
            const container = document.getElementById('category-container');
            container.innerHTML = '';

            categories.forEach(cat => {
                const isActive = activeCategory === cat.name ? 'active' : '';
                const displayName = cat.name;
                container.innerHTML += `<div class="category-card ${isActive}" onclick="toggleCategory('${cat.name}')"><div class="category-icon">${cat.icon}</div><span class="category-name">${displayName}</span></div>`;
            });
            // Apply 3D tilt
            if (typeof applyGeneric3DTilt === 'function') applyGeneric3DTilt('.category-card', 6);
        }

        function renderKits() {
            const container = document.getElementById('kits-container');
            container.innerHTML = '';

            recipeKits.forEach(kit => {
                let kitPrice = 0;
                kit.items.forEach(item => {
                    const prod = inventory.find(p => p.id === item.id);
                    if (prod) {
                        kitPrice += (prod.price * item.qty);
                    }
                });

                const name = kit.name;
                const desc = kit.desc;
                const btnText = "ADD KIT";

                container.innerHTML += `<div class="kit-card"><div class="kit-header"><div class="kit-title">${name}</div><div class="kit-icon">${kit.icon}</div></div><div class="kit-desc">${desc}</div><div class="kit-footer"><div style="font-weight: 700; font-size: 0.9rem;">₹${kitPrice}</div><button class="kit-btn" onclick="addKitToCart('${kit.id}')">${btnText}</button></div></div>`;
            });
            // Apply 3D tilt
            if (typeof applyGeneric3DTilt === 'function') applyGeneric3DTilt('.kit-card', 8);
        }

        function toggleCategory(categoryName) {
            activeCategory = activeCategory === categoryName ? null : categoryName;
            document.getElementById('searchInput').value = '';
            document.getElementById('products-heading').innerText = activeCategory ? activeCategory : "All Items";
            renderCategories(); filterProducts();
        }

        function filterProducts() {
            const searchQuery = document.getElementById('searchInput').value.toLowerCase();
            const grid = document.getElementById('products-grid');
            grid.innerHTML = '';

            const filteredProducts = inventory.filter(p => {
                const matchesSearch = p.name.toLowerCase().includes(searchQuery);
                const matchesCategory = activeCategory ? p.category === activeCategory : true;
                return matchesSearch && matchesCategory;
            });

            if (filteredProducts.length === 0) {
                grid.innerHTML = `<p style="grid-column: 1/-1; text-align:center; color: #64748b; padding: 20px;">No products found.</p>`;
                return;
            }

            filteredProducts.forEach(p => {
                const qty = cart[p.id] || 0;

                let discountTag = '';
                let priceHTML = `<div class="product-price">₹${p.price}</div>`;

                if (p.mrp && p.mrp > p.price) {
                    let percentOff = Math.round(((p.mrp - p.price) / p.mrp) * 100);
                    discountTag = `<div class="discount-tag">${percentOff}% OFF</div>`;
                    priceHTML = `
                        <div style="display:flex; flex-direction:column;">
                            <span style="font-size:0.65rem; color:var(--text-muted); text-decoration:line-through;">₹${p.mrp}</span>
                            <span class="product-price">₹${p.price}</span>
                        </div>
                    `;
                }

                let stockOverlay = '';
                let buttonHTML = '';
                const btnLabel = "ADD";

                if (p.inStock === false) {
                    stockOverlay = `<div class="out-of-stock-overlay">OUT OF STOCK</div>`;
                    buttonHTML = `<button class="add-btn" style="background:#e2e8f0; color:#94a3b8; border-color:#e2e8f0; cursor:not-allowed;">${btnLabel}</button>`;
                } else {
                    buttonHTML = qty === 0
                        ? `<button class="add-btn" onclick="updateQuantity(${p.id}, 1)">${btnLabel}</button>`
                        : `<div class="qty-controls"><button onclick="updateQuantity(${p.id}, -1)">-</button><span>${qty}</span><button onclick="updateQuantity(${p.id}, 1)">+</button></div>`;
                }

                grid.innerHTML += `
                    <div class="product-card">
                        ${stockOverlay}
                        ${discountTag}
                        <div class="delivery-tag" style="${discountTag ? 'top:40px;' : 'top:10px;'}">10 MINS</div>
                        <div class="product-image"><img src="${p.image}" alt="${p.name}"></div>
                        <div class="product-title">${p.name}</div>
                        <div class="product-weight">${p.weight}</div>
                        <div class="price-row">
                            ${priceHTML}
                            ${buttonHTML}
                        </div>
                    </div>`;
            });
            // Apply 3D tilt
            if (typeof applyGeneric3DTilt === 'function') applyGeneric3DTilt('.product-card', 6);
        }

        function updateQuantity(productId, change) {
            if (!cart[productId]) cart[productId] = 0;
            cart[productId] += change;
            if (cart[productId] <= 0) delete cart[productId];

            _saveState(); // ← persist
            renderCartContent(); filterProducts(); bounceCartIcon();
        }

        function addKitToCart(kitId) {
            const kit = recipeKits.find(k => k.id === kitId);
            kit.items.forEach(item => {
                if (!cart[item.id]) cart[item.id] = 0;
                cart[item.id] += item.qty;
            });
            _saveState(); // ← persist
            renderCartContent(); filterProducts(); bounceCartIcon();
            alert(`✅ ${kit.name} elements linked into cart processing register.`);
        }

        function bounceCartIcon() {
            const badge = document.getElementById('cart-count');
            badge.style.transform = "scale(1.4)";
            setTimeout(() => badge.style.transform = "scale(1)", 200);
        }

        function claimFreebie() {
            freebieClaimed = true;
            renderCartContent();
        }

        function renderCartContent() {
            if (document.getElementById('modal-title').innerText !== "Your Cart") return;

            const modalBody = document.getElementById('modal-body');
            const modalFooter = document.getElementById('modal-footer');
            const cartTotalPriceSpan = document.getElementById('cart-total-price');

            let totalItems = 0; let totalPrice = 0; let vegetableTotal = 0;
            modalBody.innerHTML = '';

            Object.keys(cart).forEach(id => {
                const qty = cart[id];
                const product = inventory.find(p => p.id == id);
                if (!product) return;
                totalItems += qty; totalPrice += (product.price * qty);
                if (product.category === "Vegetables") vegetableTotal += (product.price * qty);

                modalBody.innerHTML += `<div class="cart-item"><div class="cart-item-info"><div class="cart-item-name">${product.name}</div><div class="cart-item-price">₹${product.price} x ${qty}</div></div><div class="qty-controls"><button onclick="updateQuantity(${product.id}, -1)">-</button><span>${qty}</span><button onclick="updateQuantity(${product.id}, 1)">+</button></div></div>`;
            });

            if (vegetableTotal >= 300) {
                if (!freebieClaimed) {
                    modalBody.innerHTML = `<div class="freebie-banner" onclick="claimFreebie()">🌶️ Tap to claim FREE Coriander & Green Chilies! 🎁</div>` + modalBody.innerHTML;
                } else {
                    modalBody.innerHTML += `<div class="freebie-item"><div class="cart-item-info"><div class="cart-item-name">🌿 Fresh Coriander & Green Chilies</div><span class="free-tag">FREE</span></div><div style="font-size: 1.4rem;">✅</div></div>`;
                }
            } else if (vegetableTotal > 0 && vegetableTotal < 300) {
                freebieClaimed = false;
                let remaining = 300 - vegetableTotal;
                modalBody.innerHTML = `<div class="progress-banner">Add ₹${remaining} more of Vegetables to get <b>FREE Coriander & Green Chilies</b>! 🌿</div>` + modalBody.innerHTML;
            } else {
                freebieClaimed = false;
            }

            if (totalItems === 0) {
                modalBody.innerHTML = `<div class="empty-cart-msg">Your cart is empty. Add some items! 🛒</div>`;
                modalFooter.style.opacity = '0.5'; modalFooter.style.pointerEvents = 'none';
            } else {
                modalFooter.style.opacity = '1'; modalFooter.style.pointerEvents = 'auto';
            }

            document.getElementById('cart-count').innerText = totalItems;
            cartTotalPriceSpan.innerText = `₹${totalPrice}`;
        }

        let deferredPrompt = null;

        window.addEventListener('beforeinstallprompt', event => {
            event.preventDefault();
            deferredPrompt = event;
            document.getElementById('install-banner').classList.add('active');
        });

        window.addEventListener('appinstalled', () => {
            deferredPrompt = null;
            document.getElementById('install-banner').classList.remove('active');
            alert('Patel Groceries has been installed successfully!');
        });

        function promptPWAInstall() {
            const banner = document.getElementById('install-banner');
            if (!deferredPrompt) return;
            deferredPrompt.prompt();
            deferredPrompt.userChoice.then(choiceResult => {
                if (choiceResult.outcome === 'accepted') {
                    console.log('PWA installation accepted');
                } else {
                    console.log('PWA installation dismissed');
                }
                deferredPrompt = null;
                banner.classList.remove('active');
            });
        }

        function hideInstallBanner() {
            document.getElementById('install-banner').classList.remove('active');
        }

        if ('serviceWorker' in navigator) {
            navigator.serviceWorker.register('/sw.js')
                .then(reg => {
                    console.log('Service Worker registered with scope:', reg.scope);
                    reg.onupdatefound = () => {
                        const installingWorker = reg.installing;
                        if (installingWorker) {
                            installingWorker.onstatechange = () => {
                                if (installingWorker.state === 'installed' && navigator.serviceWorker.controller) {
                                    console.log('New service worker available; activating...');
                                }
                            };
                        }
                    };
                })
                .catch(err => console.warn('Service Worker registration failed:', err));

            let refreshing = false;
            navigator.serviceWorker.addEventListener('controllerchange', () => {
                if (!refreshing) {
                    refreshing = true;
                    window.location.reload();
                }
            });
        }

        // ==========================================
        // MYSTERY GACHA BOX SERVICES
        // ==========================================
        let isGachaRolling = false;

        function openGachaModal() {
            const cube = document.getElementById('gacha-cube');
            const rollBtn = document.getElementById('gacha-roll-btn');
            const strip = document.getElementById('gacha-items-strip');
            const winBanner = document.getElementById('gacha-win-banner');
            const label = document.getElementById('gacha-status-label');
            const glow = document.getElementById('gacha-glow-ring');

            // Reset state
            cube.style.animation = 'gcIdleFloat 3s ease-in-out infinite';
            cube.style.opacity = '1';
            strip.innerHTML = '';
            winBanner.style.display = 'none';
            label.innerText = 'Tap ROLL to unlock your mystery snacks!';
            rollBtn.disabled = false;
            rollBtn.style.opacity = '1';
            glow.style.width = '200px';
            glow.style.height = '200px';
            glow.style.background = 'radial-gradient(circle, rgba(167,139,250,0.35) 0%, transparent 70%)';

            document.getElementById('gacha-modal').classList.add('open');
            document.getElementById('modal-overlay').classList.add('active');
        }

        function closeGachaModal() {
            if (window._gcAnimFrame) { cancelAnimationFrame(window._gcAnimFrame); window._gcAnimFrame = null; }
            document.getElementById('gacha-modal').classList.remove('open');
            document.getElementById('modal-overlay').classList.remove('active');
            isGachaRolling = false;
        }

        function rollGacha() {
            if (isGachaRolling) return;
            isGachaRolling = true;

            const cube = document.getElementById('gacha-cube');
            const rollBtn = document.getElementById('gacha-roll-btn');
            const label = document.getElementById('gacha-status-label');
            const strip = document.getElementById('gacha-items-strip');
            const banner = document.getElementById('gacha-win-banner');
            const glow = document.getElementById('gacha-glow-ring');
            const canvas = document.getElementById('gacha-canvas');

            rollBtn.disabled = true;
            rollBtn.style.opacity = '0.4';
            strip.innerHTML = '';
            banner.style.display = 'none';

            const gachaPool = [
                {
                    items: [{ id: 27, qty: 2, emoji: '🍜', label: 'Maggi x2' },
                    { id: 149, qty: 1, emoji: '🥔', label: 'Lays Chips' }],
                    text: 'Maggi Noodles (x2) & Lays Chips!'
                },
                {
                    items: [{ id: 11, qty: 1, emoji: '🥛', label: 'Amul Milk' },
                    { id: 30, qty: 1, emoji: '🍪', label: 'Parle-G' },
                    { id: 149, qty: 1, emoji: '🥔', label: 'Lays Chips' }],
                    text: 'Amul Milk, Parle-G & Lays!'
                },
                {
                    items: [{ id: 15, qty: 1, emoji: '🍞', label: 'Britannia' },
                    { id: 120, qty: 1, emoji: '🧈', label: 'Amul Butter' },
                    { id: 27, qty: 1, emoji: '🍜', label: 'Maggi' }],
                    text: 'Britannia Bread, Butter & Maggi!'
                },
                {
                    items: [{ id: 122, qty: 1, emoji: '🧀', label: 'Paneer' },
                    { id: 27, qty: 2, emoji: '🍜', label: 'Maggi x2' }],
                    text: 'Fresh Paneer & Maggi (x2)!'
                }
            ];

            const selectedCombo = gachaPool[Math.floor(Math.random() * gachaPool.length)];

            // ── PHASE 1: TURBO SPIN (0 – 2.2s) ─────────────────────────────
            label.innerText = '🌀 Rolling your mystery combo…';
            cube.style.animation = 'gcTurboSpin 0.55s linear infinite';

            // Glow intensifies while spinning
            let glowSize = 200;
            const glowGrow = setInterval(() => {
                glowSize = Math.min(320, glowSize + 8);
                glow.style.width = glowSize + 'px';
                glow.style.height = glowSize + 'px';
                glow.style.background = `radial-gradient(circle, rgba(236,72,153,0.5) 0%, rgba(167,139,250,0.3) 40%, transparent 70%)`;
            }, 60);

            // ── PHASE 2: EXPLODE BURST (2.2s) ───────────────────────────────
            setTimeout(() => {
                clearInterval(glowGrow);
                label.innerText = '💥 Opening the mystery box…';
                cube.style.animation = 'gcExplodeBurst 0.7s cubic-bezier(0.68,-0.55,0.27,1.55) forwards';

                // Canvas particle burst
                gcParticleBurst(canvas);

                // ── PHASE 3: ITEM REVEAL (2.9s+) ────────────────────────────
                setTimeout(() => {
                    cube.style.opacity = '0';
                    label.innerText = '🎉 Your snack combo is…';
                    glow.style.background = 'radial-gradient(circle, rgba(251,191,36,0.5) 0%, transparent 70%)';
                    glow.style.width = '240px';
                    glow.style.height = '240px';

                    selectedCombo.items.forEach((item, idx) => {
                        setTimeout(() => {
                            const card = document.createElement('div');
                            card.className = 'gc-item-card';
                            card.style.animationDelay = '0s';
                            card.innerHTML = `
                                <span class="gc-item-emoji">${item.emoji}</span>
                                <span class="gc-item-label">${item.label}</span>`;
                            strip.appendChild(card);
                            // Add to cart
                            cart[item.id] = (cart[item.id] || 0) + item.qty;
                        }, idx * 320);
                    });

                    // ── PHASE 4: WIN BANNER + confetti (3.9s+) ──────────────
                    const revealTime = selectedCombo.items.length * 320 + 200;
                    setTimeout(() => {
                        gcConfettiBurst(canvas);
                        banner.style.display = 'block';
                        banner.innerHTML = `🎊 Added to cart: <b>${selectedCombo.text}</b>`;

                        renderCartContent();
                        filterProducts();
                        bounceCartIcon();
                        isGachaRolling = false;

                        setTimeout(() => { closeGachaModal(); openCart(); }, 2400);
                    }, revealTime);

                }, 700);
            }, 2200);
        }

        // ── Canvas helpers ────────────────────────────────────────────────────
        function gcParticleBurst(canvas) {
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            const cx = canvas.width / 2, cy = canvas.height / 2;
            const particles = [];
            const colors = ['#a855f7', '#ec4899', '#fbbf24', '#34d399', '#60a5fa', '#f97316'];
            for (let i = 0; i < 60; i++) {
                const angle = Math.random() * Math.PI * 2;
                const speed = 3 + Math.random() * 7;
                particles.push({
                    x: cx, y: cy,
                    vx: Math.cos(angle) * speed,
                    vy: Math.sin(angle) * speed,
                    r: 4 + Math.random() * 6,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    alpha: 1, life: 40 + Math.random() * 30
                });
            }
            function draw() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                let alive = false;
                particles.forEach(p => {
                    if (p.life <= 0) return;
                    alive = true;
                    p.x += p.vx; p.y += p.vy;
                    p.vy += 0.25;      // gravity
                    p.alpha -= 1 / p.life;
                    p.life--;
                    ctx.save();
                    ctx.globalAlpha = Math.max(0, p.alpha);
                    ctx.fillStyle = p.color;
                    ctx.shadowColor = p.color;
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.restore();
                });
                if (alive) window._gcAnimFrame = requestAnimationFrame(draw);
                else { ctx.clearRect(0, 0, canvas.width, canvas.height); window._gcAnimFrame = null; }
            }
            draw();
        }

        function gcConfettiBurst(canvas) {
            const ctx = canvas.getContext('2d');
            canvas.width = canvas.offsetWidth;
            canvas.height = canvas.offsetHeight;
            const confetti = [];
            const colors = ['#a855f7', '#ec4899', '#fbbf24', '#34d399', '#60a5fa', '#f97316', '#ffffff'];
            for (let i = 0; i < 90; i++) {
                confetti.push({
                    x: Math.random() * canvas.width,
                    y: -10 - Math.random() * 100,
                    w: 6 + Math.random() * 8,
                    h: 3 + Math.random() * 5,
                    vy: 2 + Math.random() * 4,
                    vx: -1 + Math.random() * 2,
                    rot: Math.random() * 360,
                    rotV: -4 + Math.random() * 8,
                    color: colors[Math.floor(Math.random() * colors.length)],
                    life: 80
                });
            }
            function draw() {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                let alive = false;
                confetti.forEach(c => {
                    if (c.y > canvas.height + 20) return;
                    alive = true;
                    c.x += c.vx; c.y += c.vy; c.rot += c.rotV;
                    ctx.save();
                    ctx.translate(c.x, c.y);
                    ctx.rotate(c.rot * Math.PI / 180);
                    ctx.fillStyle = c.color;
                    ctx.globalAlpha = 0.9;
                    ctx.fillRect(-c.w / 2, -c.h / 2, c.w, c.h);
                    ctx.restore();
                });
                if (alive) window._gcAnimFrame = requestAnimationFrame(draw);
                else { ctx.clearRect(0, 0, canvas.width, canvas.height); window._gcAnimFrame = null; }
            }
            draw();
        }

        renderCategories();
        renderKits();
        filterProducts();

        // Restore session from localStorage if exists
        const savedSession = localStorage.getItem('patel_groceries_session');
        if (savedSession) {
            try {
                const sessionData = JSON.parse(savedSession);
                userProfile.name = sessionData.name;
                userProfile.contact = sessionData.contact;
                userProfile.email = sessionData.email || "";
                loginSuccess(sessionData.name, sessionData.contact, sessionData.isOwner);
            } catch (e) {
                console.error("Failed to restore session", e);
                localStorage.removeItem('patel_groceries_session');
            }
        }

        // ==========================================
        // TERMS & POLICIES HELPERS
        // ==========================================
        function switchTermsTab(tab) {
            ['tos', 'privacy', 'refund'].forEach(t => {
                document.getElementById('terms-tab-' + t).classList.toggle('active', t === tab);
                document.getElementById('terms-panel-' + t).classList.toggle('active', t === tab);
            });
        }

        function toggleTermsSection(btn) {
            const section = btn.closest('.terms-section');
            section.classList.toggle('open');
        }

        // ==========================================
        // MAP PICKER v2 — Leaflet + Nominatim
        // Search | Map Pin | Manual Address
        // ==========================================
        let _mapPickerMap = null;
        let _mapPickerCoords = null;
        let _mapPickerAddress = '';
        let _geocodeTimer = null;
        let _gpsWatchId = null;
        let _searchDebounce = null;

        // Helper — default delivery address
        function _getDefaultDeliveryAddress() {
            if (!addresses.length) return { text: '', lat: null, lng: null };
            const a = addresses[0];
            return typeof a === 'string'
                ? { text: a, lat: null, lng: null }
                : { text: a.text || '', lat: a.lat || null, lng: a.lng || null };
        }

        // ─── OPEN MAP PICKER ─────────────────────────────
        function openMapPicker() {
            document.getElementById('gmap-overlay').classList.add('active');

            if (_mapPickerMap) {
                setTimeout(() => _mapPickerMap.invalidateSize(), 150);
                return;
            }

            setTimeout(() => {
                const mapEl = document.getElementById('google-map-canvas');
                const defaultCenter = [25.5941, 85.1376]; // Patna, Bihar

                _mapPickerMap = L.map(mapEl, {
                    center: defaultCenter,
                    zoom: 18,           // High zoom so building/street names visible
                    zoomControl: false, // We'll add it positioned nicely
                    attributionControl: false
                });

                // Zoom control bottom-right
                L.control.zoom({ position: 'bottomright' }).addTo(_mapPickerMap);
                // Scale bar bottom-left
                L.control.scale({ imperial: false, position: 'bottomleft' }).addTo(_mapPickerMap);

                // OpenStreetMap tiles — show full place names
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    attribution: '\u00a9 OpenStreetMap',
                    maxZoom: 20, maxNativeZoom: 19
                }).addTo(_mapPickerMap);

                // Reverse-geocode whenever map stops moving
                _mapPickerMap.on('moveend zoomend', () => {
                    const c = _mapPickerMap.getCenter();
                    _mapPickerCoords = { lat: c.lat, lng: c.lng };
                    clearTimeout(_geocodeTimer);
                    const el = document.getElementById('gmap-addr-text');
                    if (el) { el.textContent = '\ud83d\udd0d Finding address\u2026'; el.classList.add('loading'); }
                    _geocodeTimer = setTimeout(() => _doReverseGeocode(c.lat, c.lng), 700);
                });

                _mapPickerMap.invalidateSize();
                _startHighAccuracyGPS(); // Start GPS after map is ready
            }, 200);
        }

        // ─── HIGH-ACCURACY GPS ─────────────────────────
        function _startHighAccuracyGPS() {
            if (!navigator.geolocation) return;
            const badge = document.getElementById('gmap-accuracy-badge');
            const badgeTxt = document.getElementById('gmap-accuracy-text');
            if (badge) badge.style.display = 'flex';
            if (badgeTxt) badgeTxt.textContent = 'Getting GPS\u2026';

            // Clear any previous watch
            if (_gpsWatchId !== null) navigator.geolocation.clearWatch(_gpsWatchId);

            let bestAccuracy = Infinity;

            _gpsWatchId = navigator.geolocation.watchPosition(
                pos => {
                    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
                    if (accuracy < bestAccuracy) {
                        bestAccuracy = accuracy;
                        if (_mapPickerMap) {
                            _mapPickerMap.setView([lat, lng],
                                accuracy < 15 ? 19 : accuracy < 50 ? 18 : 17);
                        }
                        _mapPickerCoords = { lat, lng };
                        if (badgeTxt) badgeTxt.textContent = `GPS \u00b1${Math.round(accuracy)} m`;
                    }
                    // Good enough — stop watching
                    if (accuracy <= 15) {
                        navigator.geolocation.clearWatch(_gpsWatchId);
                        _gpsWatchId = null;
                        setTimeout(() => { if (badge) badge.style.display = 'none'; }, 2500);
                    }
                },
                err => {
                    if (badge) badge.style.display = 'none';
                    // GPS denied — geocode Patna default
                    _mapPickerCoords = { lat: 25.5941, lng: 85.1376 };
                    _doReverseGeocode(25.5941, 85.1376);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );

            // Auto-stop after 20 s to save battery
            setTimeout(() => {
                if (_gpsWatchId !== null) {
                    navigator.geolocation.clearWatch(_gpsWatchId);
                    _gpsWatchId = null;
                    if (badge) badge.style.display = 'none';
                }
            }, 20000);
        }

        function goToMyLocation() {
            _startHighAccuracyGPS();
        }

        // ─── REVERSE GEOCODE (Nominatim) ───────────────
        function _doReverseGeocode(lat, lng) {
            const el = document.getElementById('gmap-addr-text');
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18`,
                { headers: { 'Accept-Language': 'en' } })
                .then(r => r.json())
                .then(data => {
                    if (el) el.classList.remove('loading');
                    _mapPickerAddress = data.display_name || `${lat.toFixed(5)}\u00b0N, ${lng.toFixed(5)}\u00b0E`;
                    if (el) el.textContent = _mapPickerAddress;
                })
                .catch(() => {
                    if (el) el.classList.remove('loading');
                    _mapPickerAddress = `${lat.toFixed(5)}\u00b0N, ${lng.toFixed(5)}\u00b0E`;
                    if (el) el.textContent = _mapPickerAddress;
                });
        }

        // ─── SEARCH (Nominatim forward geocoding) ──────
        function onMapSearchInput() {
            const val = document.getElementById('gmap-search-input').value;
            document.getElementById('gmap-search-clear').style.display = val ? 'block' : 'none';
            clearTimeout(_searchDebounce);
            if (val.length >= 3) {
                _searchDebounce = setTimeout(() => _fetchSuggestions(val), 600);
            } else {
                document.getElementById('gmap-suggestions').classList.remove('visible');
            }
        }

        function _fetchSuggestions(q) {
            const el = document.getElementById('gmap-suggestions');
            el.innerHTML = '<div class="gmap-suggestion-item"><i class="fa-solid fa-spinner fa-spin"></i> Searching\u2026</div>';
            el.classList.add('visible');
            fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&limit=6&countrycodes=IN&addressdetails=0`,
                { headers: { 'Accept-Language': 'en' } }
            )
                .then(r => r.json())
                .then(results => {
                    if (!results.length) {
                        el.innerHTML = '<div class="gmap-suggestion-item" style="color:#94a3b8;">No results found. Try a broader search.</div>';
                        return;
                    }
                    el.innerHTML = results.map(r =>
                        `<div class="gmap-suggestion-item" onclick="selectSearchResult(${r.lat},${r.lon},'${(r.display_name || '').replace(/'/g, "\\'").replace(/"/g, '&quot;')}')">
                        <i class="fa-solid fa-location-dot"></i>
                        <span>${r.display_name}</span>
                    </div>`
                    ).join('');
                })
                .catch(() => {
                    el.innerHTML = '<div class="gmap-suggestion-item" style="color:#ef4444;">\u274c Search failed. Check connection.</div>';
                });
        }

        function clearMapSearch() {
            document.getElementById('gmap-search-input').value = '';
            document.getElementById('gmap-search-clear').style.display = 'none';
            document.getElementById('gmap-suggestions').classList.remove('visible');
        }

        function selectSearchResult(lat, lng, name) {
            document.getElementById('gmap-suggestions').classList.remove('visible');
            document.getElementById('gmap-search-input').value = name;
            if (_mapPickerMap) _mapPickerMap.setView([parseFloat(lat), parseFloat(lng)], 18);
            _mapPickerCoords = { lat: parseFloat(lat), lng: parseFloat(lng) };
            _mapPickerAddress = name;
            const el = document.getElementById('gmap-addr-text');
            if (el) { el.textContent = name; el.classList.remove('loading'); }
        }

        // ─── TAB SWITCHING ───────────────────────────
        function switchMapTab(tab) {
            const isMap = tab === 'map';
            document.getElementById('gmap-tab-map').classList.toggle('active', isMap);
            document.getElementById('gmap-tab-manual').classList.toggle('active', !isMap);
            document.getElementById('gmap-map-section').style.display = isMap ? '' : 'none';
            document.getElementById('gmap-manual-section').style.display = isMap ? 'none' : 'block';
            document.getElementById('gmap-bottom-map').style.display = isMap ? '' : 'none';
            document.getElementById('gmap-bottom-manual').style.display = isMap ? 'none' : 'block';
            if (isMap && _mapPickerMap) setTimeout(() => _mapPickerMap.invalidateSize(), 100);
        }

        // ─── CLOSE & CONFIRM ────────────────────────
        function closeMapPicker() {
            document.getElementById('gmap-overlay').classList.remove('active');
            document.getElementById('gmap-suggestions').classList.remove('visible');
            // Stop GPS watch to save battery
            if (_gpsWatchId !== null) {
                navigator.geolocation.clearWatch(_gpsWatchId);
                _gpsWatchId = null;
            }
        }

        function confirmMapAddress() {
            const isManual = document.getElementById('gmap-tab-manual').classList.contains('active');

            if (isManual) {
                const house = document.getElementById('manual-house').value.trim();
                const street = document.getElementById('manual-street').value.trim();
                const landmark = document.getElementById('manual-landmark').value.trim();
                const city = document.getElementById('manual-city').value.trim();

                if (!house && !street) {
                    alert('\u274c Please enter at least your house/flat number or street name.');
                    return;
                }
                const addrText = [house, street, landmark, city].filter(Boolean).join(', ');
                addresses.push({
                    text: addrText,
                    lat: _mapPickerCoords ? _mapPickerCoords.lat : null,
                    lng: _mapPickerCoords ? _mapPickerCoords.lng : null
                });
                _saveState(); // ← persist
                updateCustomerDashboard();
                closeMapPicker();

                if (_pendingCheckoutType === 'khata') {
                    _pendingCheckoutType = null;
                    processCheckoutOrder('khata');
                } else if (_pendingCheckoutType === 'payment_selection') {
                    _pendingCheckoutType = null;
                    openPaymentSelection();
                } else {
                    openFeatureScreen('address');
                }
                return;
            }

            // Map pin mode
            if (!_mapPickerCoords) {
                alert('\u274c Location not detected yet. Please wait or search for your area.');
                return;
            }
            const addrToSave = _mapPickerAddress ||
                `${_mapPickerCoords.lat.toFixed(5)}\u00b0N, ${_mapPickerCoords.lng.toFixed(5)}\u00b0E`;

            const already = addresses.some(a => (typeof a === 'string' ? a : a.text) === addrToSave);
            if (!already) addresses.push({ text: addrToSave, lat: _mapPickerCoords.lat, lng: _mapPickerCoords.lng });
            _saveState(); // ← persist
            updateCustomerDashboard();
            closeMapPicker();

            if (_pendingCheckoutType === 'khata') {
                _pendingCheckoutType = null;
                processCheckoutOrder('khata');
            } else if (_pendingCheckoutType === 'payment_selection') {
                _pendingCheckoutType = null;
                openPaymentSelection();
            } else {
                openFeatureScreen('address');
            }
        }

        // ─── OWNER MAP (OpenStreetMap iframe) ──────────
        function openOwnerMap(address, lat, lng) {
            document.getElementById('owner-map-modal').classList.add('active');
            document.getElementById('owner-map-addr').textContent = address || 'Address not available';
            const mapsUrl = (lat && lat !== 'null' && lng && lng !== 'null')
                ? `https://www.google.com/maps?q=${lat},${lng}&z=17`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address || '')}`;
            document.getElementById('owner-gmaps-link').href = mapsUrl;
            const canvas = document.getElementById('owner-map-canvas');
            canvas.innerHTML = '';
            if (lat && lat !== 'null' && lng && lng !== 'null') {
                const latF = parseFloat(lat), lngF = parseFloat(lng), d = 0.004;
                canvas.innerHTML = `<iframe src="https://www.openstreetmap.org/export/embed.html?bbox=${lngF - d},${latF - d},${lngF + d},${latF + d}&layer=mapnik&marker=${latF},${lngF}" style="width:100%;height:100%;border:none;" loading="lazy"></iframe>`;
            } else {
                canvas.innerHTML = `<iframe src="https://www.openstreetmap.org/export/embed.html?query=${encodeURIComponent(address || '')}&layer=mapnik" style="width:100%;height:100%;border:none;" loading="lazy"></iframe>`;
            }
        }

        function closeOwnerMap() {
            document.getElementById('owner-map-modal').classList.remove('active');
            document.getElementById('owner-map-canvas').innerHTML = '';
        }

        function appendNewAddressRecord() {
            openMapPicker();
        }

        // ALWAYS ensure login screen is visible first before any async work
        // This prevents the blank dark screen while session-check is in flight
        (function() {
            const lc = document.getElementById('login-container');
            if (lc) {
                lc.classList.remove('hidden');
                lc.style.display = 'flex';
                lc.style.visibility = 'visible';
                lc.style.opacity = '1';
                lc.style.pointerEvents = 'auto';
                lc.style.transform = '';
                lc.style.transition = '';
            }
        })();

        // Restore session after everything is fully loaded and declared
        _restoreSession();

        // =============================================
        // THREE.JS 3D BACKGROUND ENGINE (Disabled)
        // =============================================
        function init3DBackground() {
            // Background 3D effects disabled in favor of liquid glass CSS background
        }

        // =============================================
        // DYNAMIC 3D CARD TILT ENGINE
        // =============================================
        function init3DTilt() {
            const card = document.querySelector('.login-card');
            if (!card) return;

            card.addEventListener('pointermove', (e) => {
                const rect = card.getBoundingClientRect();
                
                // Centered coordinates relative to card
                const x = (e.clientX - rect.left) / rect.width - 0.5;
                const y = (e.clientY - rect.top) / rect.height - 0.5;

                // Max 22 degrees rotation
                const tiltX = -y * 22;
                const tiltY = x * 22;

                card.style.transform = `perspective(1500px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-2px)`;
                
                // Shift shadow dynamically for realism
                const shadowX = -x * 25;
                const shadowY = -y * 25;
                card.style.boxShadow = `
                    ${shadowX}px ${shadowY}px 45px rgba(0, 0, 0, 0.55),
                    0 30px 60px rgba(0, 0, 0, 0.6),
                    inset 0 1px 1px rgba(255, 255, 255, 0.15),
                    0 0 60px rgba(34, 197, 94, 0.15)
                `;
            });

            card.addEventListener('pointerleave', () => {
                card.style.transform = 'perspective(1500px) rotateX(0deg) rotateY(0deg) translateZ(0)';
                card.style.boxShadow = `
                    0 4px 30px rgba(0, 0, 0, 0.4),
                    0 30px 60px rgba(0, 0, 0, 0.6),
                    inset 0 1px 1px rgba(255, 255, 255, 0.1),
                    0 0 60px rgba(34, 197, 94, 0.1)
                `;
            });
        }

        // Generic 3D tilt applicator for lists/cards
        function applyGeneric3DTilt(selector, maxTilt = 8) {
            document.querySelectorAll(selector).forEach(element => {
                if (element.dataset.tiltInitialized) return;
                element.dataset.tiltInitialized = "true";
                
                element.style.transformStyle = 'preserve-3d';
                element.style.perspective = '1000px';
                element.style.transition = 'transform 0.15s ease-out';
                
                element.addEventListener('pointermove', (e) => {
                    const rect = element.getBoundingClientRect();
                    const x = (e.clientX - rect.left) / rect.width - 0.5;
                    const y = (e.clientY - rect.top) / rect.height - 0.5;
                    const tiltX = -y * maxTilt * 2;
                    const tiltY = x * maxTilt * 2;
                    element.style.transform = `perspective(1000px) rotateX(${tiltX}deg) rotateY(${tiltY}deg) translateY(-2px)`;
                });

                element.addEventListener('pointerleave', () => {
                    element.style.transform = 'perspective(1000px) rotateX(0deg) rotateY(0deg) translateY(0)';
                });
            });
        }

        // Initialize visual features
        init3DBackground();
        init3DTilt();
        setTimeout(() => {
            applyGeneric3DTilt('.gacha-banner', 5);
            applyGeneric3DTilt('.parchi-banner', 5);
        }, 100);
