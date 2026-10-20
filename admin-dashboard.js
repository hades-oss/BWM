/**
 * js/admin-dashboard.js — BMW GYM Admin Dashboard Logic
 * Role-Based Access Control, Real Metrics, Orders Table, Interactive Filters & Modals
 */

(function () {
    'use strict';

    // ── 1. RBAC Guard: Require Admin Role ──────────────────────────────────
    if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.requireRole === 'function') {
        const hasAccess = window.BMW_AUTH_GUARD.requireRole(['admin'], 'index.html');
        if (!hasAccess) return;
    }

    // ── 2. State & Variables ────────────────────────────────────────────────
    let allOrders = [];
    let allUsers = [];
    let allProducts = [];
    let filteredOrders = [];
    let currentPage = 1;
    const PAGE_SIZE = 5;
    let currentFilterStatus = 'ALL';
    let searchQuery = '';

    // ── 3. DOM Elements ─────────────────────────────────────────────────────
    const layoutEl = document.getElementById('dash-layout');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const mobileToggleBtn = document.getElementById('sidebar-mobile-toggle');
    const backdropEl = document.getElementById('dash-backdrop');
    const notifBtn = document.getElementById('notif-btn');
    const notifMenu = document.getElementById('notif-menu');
    const notifDot = document.getElementById('notif-dot');
    const notifCountBadge = document.getElementById('notif-count-badge');
    const notifList = document.getElementById('notif-list');
    const logoutBtn = document.getElementById('logout-btn');
    const breadcrumbCurrent = document.getElementById('breadcrumb-current');

    // Stats Elements
    const statRevenueEl = document.getElementById('stat-revenue');
    const statRevenueSubEl = document.getElementById('stat-revenue-sub');
    const statOrdersEl = document.getElementById('stat-orders');
    const statOrdersSubEl = document.getElementById('stat-orders-sub');
    const statProductsEl = document.getElementById('stat-products');
    const statProductsSubEl = document.getElementById('stat-products-sub');
    const statCustomersEl = document.getElementById('stat-customers');
    const statCustomersSubEl = document.getElementById('stat-customers-sub');

    // Chart & Top Products Elements
    const chartBarsContainer = document.getElementById('status-chart-bars');
    const topProductsContainer = document.getElementById('top-products-container');

    // Table Elements
    const ordersTableBody = document.getElementById('orders-table-body');
    const tableLoading = document.getElementById('table-loading');
    const tableEmpty = document.getElementById('table-empty');
    const filterStatusSelect = document.getElementById('filter-status-select');
    const tableSearchInput = document.getElementById('table-search-input');
    const topbarSearchInput = document.getElementById('topbar-search-input');
    const paginationContainer = document.getElementById('table-pagination');
    const pageInfoText = document.getElementById('pagination-info');
    const paginationBtnsWrapper = document.getElementById('pagination-btns');
    const refreshDataBtn = document.getElementById('btn-refresh-data');

    // Modal Elements
    const orderModal = document.getElementById('order-detail-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCloseFooterBtn = document.getElementById('modal-close-footer-btn');

    // User Profile Elements in Header & Sidebar
    const topbarUserName = document.getElementById('topbar-user-name');
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');

    // Toast Container
    const toastContainer = document.getElementById('dash-toast-container');

    // ── 4. Helper Utilities ─────────────────────────────────────────────────
    function formatVND(num) {
        if (num === null || num === undefined || isNaN(num)) return '0₫';
        return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + '₫';
    }

    function formatDate(isoStr) {
        if (!isoStr) return 'N/A';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            });
        } catch (e) {
            return isoStr;
        }
    }

    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `dash-toast ${type}`;
        
        let iconHtml = 'ℹ️';
        if (type === 'success') iconHtml = '✓';
        if (type === 'error') iconHtml = '✕';

        toast.innerHTML = `
            <span class="dash-toast-icon">${iconHtml}</span>
            <span class="dash-toast-msg">${message}</span>
        `;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function getStatusBadge(orderStatus) {
        const s = (orderStatus || '').toLowerCase();
        if (s.includes('delivered') || s.includes('giao')) {
            return `<span class="badge-status status-delivered">Đã giao hàng</span>`;
        }
        if (s.includes('transit') || s.includes('đang giao')) {
            return `<span class="badge-status status-transit">Đang vận chuyển</span>`;
        }
        if (s.includes('dispatch') || s.includes('chuẩn bị')) {
            return `<span class="badge-status status-dispatch">Chờ xuất kho</span>`;
        }
        if (s.includes('cancelled') || s.includes('hủy')) {
            return `<span class="badge-status status-cancelled">Đã hủy</span>`;
        }
        if (s.includes('return') || s.includes('trả')) {
            return `<span class="badge-status status-cancelled" style="background: rgba(234,88,12,0.12); color: #c2410c;">Đổi trả</span>`;
        }
        return `<span class="badge-status status-ordered">Chờ xử lý</span>`;
    }

    function getPaymentBadge(paymentStatus, paymentMethod) {
        const ps = (paymentStatus || '').toLowerCase();
        const pm = (paymentMethod || 'COD').toUpperCase();
        if (ps === 'paid') {
            return `<span class="badge-status status-paid">${pm} • Đã thanh toán</span>`;
        }
        if (ps === 'refund_pending') {
            return `<span class="badge-status status-pending" style="background: rgba(245,158,11,0.12); color: #d97706; border: 1px solid rgba(245,158,11,0.25);">${pm} • Chờ hoàn tiền</span>`;
        }
        if (ps === 'refunded') {
            return `<span class="badge-status status-paid" style="background: rgba(59,130,246,0.12); color: #2563eb; border: 1px solid rgba(59,130,246,0.25);">${pm} • Đã hoàn tiền</span>`;
        }
        if (ps === 'cancelled') {
            return `<span class="badge-status status-cancelled">${pm} • Hủy thanh toán</span>`;
        }
        return `<span class="badge-status status-pending">${pm} • Chờ thanh toán</span>`;
    }

    function getNormalizedStatus(status) {
        if (window.BMW_ORDERS_API && typeof window.BMW_ORDERS_API.normalizeOrderStatus === 'function') {
            return window.BMW_ORDERS_API.normalizeOrderStatus(status);
        }
        const s = String(status || '').trim().toLowerCase();
        if (s === 'order placed' || s === 'đã đặt hàng' || s === 'chờ xác nhận') return 'Chờ xác nhận';
        if (s === 'awaiting dispatch' || s === 'đang xử lý') return 'Đang xử lý';
        if (s === 'packing' || s === 'đang đóng gói') return 'Đang đóng gói';
        if (s === 'handed over' || s === 'đã bàn giao vận chuyển') return 'Đã bàn giao vận chuyển';
        if (s === 'in transit' || s === 'đang giao hàng') return 'Đang giao hàng';
        if (s === 'delivered' || s === 'đã giao' || s === 'đã giao đơn hàng') return 'Đã giao';
        if (s === 'cancelled' || s === 'đã hủy') return 'Đã hủy';
        if (s === 'return requested' || s === 'yêu cầu đổi trả') return 'Yêu cầu đổi trả';
        if (s === 'returned' || s === 'đã trả hàng') return 'Đã trả hàng';
        return status || 'Chờ xác nhận';
    }

    function isOrderPaid(order) {
        if (!order) return false;
        const ps = String(order.paymentStatus || '').toLowerCase();
        if (ps === 'paid') return true;
        const norm = getNormalizedStatus(order.orderStatus);
        if (order.paymentMethod === 'COD' && (norm === 'Đã giao' || order.orderStatus === 'Delivered')) {
            return true;
        }
        return false;
    }

    function isOrderCancelledOrReturned(order) {
        if (!order) return false;
        const norm = getNormalizedStatus(order.orderStatus);
        const ps = String(order.paymentStatus || '').toLowerCase();
        return norm === 'Đã hủy' || norm === 'Cancelled' || norm === 'Đã trả hàng' || norm === 'Returned' || ps === 'cancelled' || ps === 'refunded';
    }

    function isOrderCancelled(order) {
        if (!order) return false;
        const norm = getNormalizedStatus(order.orderStatus);
        const ps = String(order.paymentStatus || '').toLowerCase();
        return norm === 'Đã hủy' || norm === 'Cancelled' || ps === 'cancelled';
    }

    // ── 5. Data Fetching (Real Local Storage) ───────────────────────────────
    function loadData() {
        // 1. Load Orders
        try {
            if (window.BMW_ORDERS_API && typeof window.BMW_ORDERS_API.getOrders === 'function') {
                allOrders = window.BMW_ORDERS_API.getOrders();
            } else {
                const raw = localStorage.getItem('bmw_orders');
                allOrders = raw ? JSON.parse(raw) : [];
            }
        } catch (e) {
            console.error('Error loading orders:', e);
            allOrders = [];
        }

        // 2. Load Users
        try {
            if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getUsers === 'function') {
                allUsers = window.BMW_AUTH_GUARD.getUsers();
            } else {
                const raw = localStorage.getItem('bmw_users');
                allUsers = raw ? JSON.parse(raw) : [];
            }
        } catch (e) {
            console.error('Error loading users:', e);
            allUsers = [];
        }

        // 3. Load Products
        try {
            const raw = localStorage.getItem('bmw_products');
            if (raw) {
                allProducts = JSON.parse(raw);
            } else if (typeof products !== 'undefined' && Array.isArray(products)) {
                allProducts = products;
            } else {
                allProducts = [];
            }
        } catch (e) {
            console.error('Error loading products:', e);
            allProducts = (typeof products !== 'undefined' && Array.isArray(products)) ? products : [];
        }
    }

    // ── 6. Metrics Calculation & Rendering ──────────────────────────────────
    function renderMetrics() {
        // 1. Total Realized Collected Revenue (exclude Cancelled & Returned orders, and exclude unpaid orders)
        const validPaidOrders = allOrders.filter(o => !isOrderCancelledOrReturned(o) && isOrderPaid(o));
        const totalRevenue = validPaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const deliveredOrdersCount = allOrders.filter(o => getNormalizedStatus(o.orderStatus) === 'Đã giao').length;

        if (statRevenueEl) statRevenueEl.textContent = formatVND(totalRevenue);
        if (statRevenueSubEl) statRevenueSubEl.textContent = `${deliveredOrdersCount} đơn đã giao thành công`;

        // 2. Total Orders
        if (statOrdersEl) statOrdersEl.textContent = allOrders.length;
        const pendingOrdersCount = allOrders.filter(o => {
            const s = getNormalizedStatus(o.orderStatus);
            return s === 'Chờ xác nhận' || s === 'Đang xử lý' || s === 'Đang đóng gói';
        }).length;
        if (statOrdersSubEl) statOrdersSubEl.textContent = `${pendingOrdersCount} đơn đang chờ xử lý`;

        // 3. Products
        if (statProductsEl) statProductsEl.textContent = allProducts.length;
        const categories = new Set(allProducts.map(p => p.category).filter(Boolean));
        if (statProductsSubEl) statProductsSubEl.textContent = `${categories.size} danh mục phân loại`;

        // 4. Customers (role === 'customer')
        const customers = allUsers.filter(u => (u.role || 'customer').toLowerCase() === 'customer');
        const activeCustomers = customers.filter(u => (u.status || 'active').toLowerCase() === 'active');
        if (statCustomersEl) statCustomersEl.textContent = customers.length;
        if (statCustomersSubEl) statCustomersSubEl.textContent = `${activeCustomers.length} tài khoản đang hoạt động`;
    }

    // ── 7. Order Status Distribution Chart ──────────────────────────────────
    function renderStatusChart() {
        if (!chartBarsContainer) return;
        const total = allOrders.length;

        if (total === 0) {
            chartBarsContainer.innerHTML = `
                <div class="dash-empty" style="padding: 24px 0;">
                    <p>Chưa có dữ liệu đơn hàng để phân tích.</p>
                </div>
            `;
            return;
        }

        const counts = {
            ordered: allOrders.filter(o => o.orderStatus === 'Order Placed').length,
            dispatch: allOrders.filter(o => o.orderStatus === 'Awaiting Dispatch').length,
            transit: allOrders.filter(o => o.orderStatus === 'In Transit').length,
            delivered: allOrders.filter(o => o.orderStatus === 'Delivered').length,
            cancelled: allOrders.filter(o => o.orderStatus === 'Cancelled').length
        };

        const pendingTotal = counts.ordered + counts.dispatch;
        const pendingPct = Math.round((pendingTotal / total) * 100);
        const transitPct = Math.round((counts.transit / total) * 100);
        const deliveredPct = Math.round((counts.delivered / total) * 100);
        const cancelledPct = Math.round((counts.cancelled / total) * 100);

        chartBarsContainer.innerHTML = `
            <div class="chart-bar-item">
                <div class="bar-label-row">
                    <span>Chờ xử lý / Đóng gói</span>
                    <span>${pendingTotal} đơn (${pendingPct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill amber" style="width: ${pendingPct}%;"></div>
                </div>
            </div>
            <div class="chart-bar-item">
                <div class="bar-label-row">
                    <span>Đang vận chuyển</span>
                    <span>${counts.transit} đơn (${transitPct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill blue" style="width: ${transitPct}%;"></div>
                </div>
            </div>
            <div class="chart-bar-item">
                <div class="bar-label-row">
                    <span>Giao thành công</span>
                    <span>${counts.delivered} đơn (${deliveredPct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill green" style="width: ${deliveredPct}%;"></div>
                </div>
            </div>
            <div class="chart-bar-item">
                <div class="bar-label-row">
                    <span>Đã hủy</span>
                    <span>${counts.cancelled} đơn (${cancelledPct}%)</span>
                </div>
                <div class="bar-track">
                    <div class="bar-fill red" style="width: ${cancelledPct}%;"></div>
                </div>
            </div>
        `;
    }

    // ── 8. Top Selling Products ─────────────────────────────────────────────
    function renderTopProducts() {
        if (!topProductsContainer) return;

        // Aggregate sales from order items
        const itemStats = {};
        allOrders.forEach(order => {
            if (order.orderStatus === 'Cancelled') return;
            if (Array.isArray(order.items)) {
                order.items.forEach(it => {
                    const pid = it.id || it.name;
                    if (!itemStats[pid]) {
                        itemStats[pid] = {
                            id: pid,
                            name: it.name || 'Sản phẩm BMW',
                            image: it.image || 'images/products/performance-oversized-tshirt.jpg',
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    const qty = Number(it.quantity) || 1;
                    const price = Number(it.priceNumber) || 0;
                    itemStats[pid].quantity += qty;
                    itemStats[pid].revenue += (price > 0 ? price * qty : (Number(it.itemTotal) || 0));
                });
            }
        });

        const sortedItems = Object.values(itemStats).sort((a, b) => b.quantity - a.quantity).slice(0, 4);

        if (sortedItems.length === 0) {
            topProductsContainer.innerHTML = `
                <div class="dash-empty" style="padding: 24px 0;">
                    <p>Chưa phát sinh dữ liệu bán hàng từ đơn hàng.</p>
                </div>
            `;
            return;
        }

        topProductsContainer.innerHTML = sortedItems.map((item, idx) => `
            <div class="top-product-item">
                <span class="top-prod-rank">#${idx + 1}</span>
                <img src="${item.image}" alt="${item.name}" class="top-prod-thumb" onerror="this.src='images/products/performance-oversized-tshirt.jpg'">
                <div class="top-prod-info">
                    <div class="top-prod-name" title="${item.name}">${item.name}</div>
                    <div class="top-prod-sales">Đã bán: <strong>${item.quantity}</strong> chiếc</div>
                </div>
                <div class="top-prod-rev">${formatVND(item.revenue)}</div>
            </div>
        `).join('');
    }

    // ── 9. Notifications Bell & List ────────────────────────────────────────
    function renderNotifications() {
        if (!notifList) return;
        const pendingOrders = allOrders.filter(o => o.orderStatus === 'Order Placed' || o.orderStatus === 'Awaiting Dispatch');
        const lowStockProducts = allProducts.filter(p => (Number(p.stock) || 0) <= 20);

        const totalNotifs = pendingOrders.length + lowStockProducts.length;

        if (notifCountBadge) {
            notifCountBadge.textContent = totalNotifs;
            notifCountBadge.style.display = totalNotifs > 0 ? 'inline-block' : 'none';
        }
        if (notifDot) {
            notifDot.style.display = totalNotifs > 0 ? 'block' : 'none';
        }

        if (totalNotifs === 0) {
            notifList.innerHTML = `
                <div class="dash-empty" style="padding: 20px;">
                    <p>Không có thông báo mới.</p>
                </div>
            `;
            return;
        }

        let html = '';
        pendingOrders.slice(0, 3).forEach(o => {
            html += `
                <div class="notif-item">
                    <div class="notif-item-title">Đơn hàng mới #${o.orderId}</div>
                    <div>Khách: ${o.customer?.fullName || 'Khách vãng lai'} • ${formatVND(o.total)}</div>
                    <div class="notif-item-time">${formatDate(o.createdAt)}</div>
                </div>
            `;
        });

        lowStockProducts.slice(0, 3).forEach(p => {
            html += `
                <div class="notif-item">
                    <div class="notif-item-title" style="color:#ef4444;">⚠️ Cảnh báo tồn kho thấp</div>
                    <div>${p.name}: còn lại ${p.stock} sản phẩm.</div>
                </div>
            `;
        });

        notifList.innerHTML = html;
    }

    // ── 10. Table Filtering, Search & Pagination ────────────────────────────
    function applyTableFilters() {
        filteredOrders = allOrders.filter(order => {
            // Status Filter
            if (currentFilterStatus !== 'ALL') {
                const s = (order.orderStatus || '').toLowerCase();
                if (currentFilterStatus === 'ORDERED' && s !== 'order placed' && s !== 'awaiting dispatch') return false;
                if (currentFilterStatus === 'TRANSIT' && s !== 'in transit') return false;
                if (currentFilterStatus === 'DELIVERED' && s !== 'delivered') return false;
                if (currentFilterStatus === 'CANCELLED' && s !== 'cancelled') return false;
            }

            // Search Query
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchId = (order.orderId || '').toLowerCase().includes(q);
                const matchName = (order.customer?.fullName || '').toLowerCase().includes(q);
                const matchPhone = (order.customer?.phone || '').toLowerCase().includes(q);
                const matchUser = (order.userAccount || '').toLowerCase().includes(q);
                if (!matchId && !matchName && !matchPhone && !matchUser) return false;
            }

            return true;
        });

        currentPage = 1;
        renderTable();
    }

    function renderTable() {
        if (!ordersTableBody) return;

        if (tableLoading) tableLoading.style.display = 'none';

        if (filteredOrders.length === 0) {
            ordersTableBody.innerHTML = '';
            if (tableEmpty) tableEmpty.style.display = 'flex';
            if (paginationContainer) paginationContainer.style.display = 'none';
            return;
        }

        if (tableEmpty) tableEmpty.style.display = 'none';
        if (paginationContainer) paginationContainer.style.display = 'flex';

        // Calculate pagination slices
        const totalItems = filteredOrders.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredOrders.slice(startIndex, startIndex + PAGE_SIZE);

        // Render Rows
        ordersTableBody.innerHTML = pageItems.map(order => {
            const customerName = order.customer?.fullName || order.userAccount || 'Khách vãng lai';
            const customerPhone = order.customer?.phone || 'N/A';
            const itemsCount = Array.isArray(order.items) ? order.items.reduce((s, it) => s + (it.quantity || 1), 0) : 0;

            return `
                <tr>
                    <td><strong>#${order.orderId}</strong></td>
                    <td>
                        <div style="font-weight: 600;">${customerName}</div>
                        <div style="font-size: 11.5px; color: var(--text-muted);">${customerPhone}</div>
                    </td>
                    <td>${formatDate(order.createdAt)}</td>
                    <td>${itemsCount} món</td>
                    <td style="font-weight: 700; color: var(--accent-blue);">${formatVND(order.total)}</td>
                    <td>${getPaymentBadge(order.paymentStatus, order.paymentMethod)}</td>
                    <td>${getStatusBadge(order.orderStatus)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-table-action primary" data-action="view" data-id="${order.orderId}">
                                Chi tiết
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Render Pagination Info & Buttons
        if (pageInfoText) {
            const from = startIndex + 1;
            const to = Math.min(startIndex + PAGE_SIZE, totalItems);
            pageInfoText.textContent = `Hiển thị ${from}–${to} trên tổng số ${totalItems} đơn hàng`;
        }

        if (paginationBtnsWrapper) {
            let btnsHtml = `
                <button class="btn-page" id="btn-page-prev" ${currentPage <= 1 ? 'disabled' : ''}>&larr;</button>
            `;
            for (let i = 1; i <= totalPages; i++) {
                btnsHtml += `
                    <button class="btn-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>
                `;
            }
            btnsHtml += `
                <button class="btn-page" id="btn-page-next" ${currentPage >= totalPages ? 'disabled' : ''}>&rarr;</button>
            `;
            paginationBtnsWrapper.innerHTML = btnsHtml;
        }
    }

    // ── 11. Order Details Modal Logic ───────────────────────────────────────
    function openOrderModal(orderId) {
        const order = allOrders.find(o => String(o.orderId) === String(orderId));
        if (!order || !orderModal) return;

        const modalOrderId = document.getElementById('modal-order-id');
        const modalCustomerName = document.getElementById('modal-customer-name');
        const modalCustomerPhone = document.getElementById('modal-customer-phone');
        const modalCustomerAddress = document.getElementById('modal-customer-address');
        const modalCustomerNotes = document.getElementById('modal-customer-notes');
        const modalOrderDate = document.getElementById('modal-order-date');
        const modalOrderPayment = document.getElementById('modal-order-payment');
        const modalOrderStatus = document.getElementById('modal-order-status');
        const modalItemsList = document.getElementById('modal-items-list');
        const modalSubtotal = document.getElementById('modal-subtotal');
        const modalShipping = document.getElementById('modal-shipping');
        const modalDiscount = document.getElementById('modal-discount');
        const modalTotal = document.getElementById('modal-total');

        if (modalOrderId) modalOrderId.textContent = `#${order.orderId}`;
        if (modalCustomerName) modalCustomerName.textContent = order.customer?.fullName || order.userAccount || 'N/A';
        if (modalCustomerPhone) modalCustomerPhone.textContent = order.customer?.phone || 'N/A';
        if (modalCustomerAddress) modalCustomerAddress.textContent = order.customer?.address || 'N/A';
        if (modalCustomerNotes) modalCustomerNotes.textContent = order.customer?.notes || 'Không có';
        if (modalOrderDate) modalOrderDate.textContent = formatDate(order.createdAt);
        if (modalOrderPayment) modalOrderPayment.innerHTML = getPaymentBadge(order.paymentStatus, order.paymentMethod);
        if (modalOrderStatus) modalOrderStatus.innerHTML = getStatusBadge(order.orderStatus);

        // Render item rows
        if (modalItemsList) {
            const items = Array.isArray(order.items) ? order.items : [];
            modalItemsList.innerHTML = items.map(it => {
                const itemTotal = it.itemTotal || (it.priceNumber ? it.priceNumber * it.quantity : 0);
                return `
                    <div class="modal-item-row">
                        <div class="modal-item-left">
                            <img src="${it.image || 'images/products/performance-oversized-tshirt.jpg'}" alt="${it.name}" class="modal-item-img" onerror="this.src='images/products/performance-oversized-tshirt.jpg'">
                            <div>
                                <div class="modal-item-title">${it.name}</div>
                                <div class="modal-item-qty">Số lượng: ${it.quantity} × ${it.price || formatVND(it.priceNumber)}</div>
                            </div>
                        </div>
                        <div style="font-weight: 700;">${formatVND(itemTotal)}</div>
                    </div>
                `;
            }).join('');
        }

        if (modalSubtotal) modalSubtotal.textContent = formatVND(order.subtotal || order.total);
        if (modalShipping) modalShipping.textContent = formatVND(order.shippingFee || 0);
        if (modalDiscount) modalDiscount.textContent = `-${formatVND(order.discount || 0)}`;
        if (modalTotal) modalTotal.textContent = formatVND(order.total);

        orderModal.classList.add('show');
    }

    function closeOrderModal() {
        if (orderModal) orderModal.classList.remove('show');
    }

    // ── 12. User Profile Binding ────────────────────────────────────────────
    function bindCurrentUser() {
        let user = null;
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getCurrentUser === 'function') {
            user = window.BMW_AUTH_GUARD.getCurrentUser();
        } else {
            const raw = sessionStorage.getItem('bmw_current_user') || localStorage.getItem('bmw_current_user');
            if (raw) user = JSON.parse(raw);
        }

        if (!user) return;

        const displayName = user.fullName || user.username || 'Admin';
        const initial = (user.username || 'A').charAt(0).toUpperCase();

        if (topbarUserName) topbarUserName.textContent = displayName;
        if (sidebarUserName) sidebarUserName.textContent = displayName;

        const avatarHtml = user.avatar 
            ? `<img src="${user.avatar}" alt="${displayName}">`
            : `<span>${initial}</span>`;

        if (topbarUserAvatar) topbarUserAvatar.innerHTML = avatarHtml;
        if (sidebarUserAvatar) sidebarUserAvatar.innerHTML = avatarHtml;
    }

    // ── 13. Event Listeners Initialization ──────────────────────────────────
    function initEvents() {
        // Sidebar Collapse (Desktop)
        if (collapseBtn && layoutEl) {
            collapseBtn.addEventListener('click', () => {
                layoutEl.classList.toggle('sidebar-collapsed');
            });
        }

        // Sidebar Mobile Toggle & Backdrop
        if (mobileToggleBtn && layoutEl) {
            mobileToggleBtn.addEventListener('click', () => {
                layoutEl.classList.toggle('sidebar-mobile-open');
            });
        }
        if (backdropEl && layoutEl) {
            backdropEl.addEventListener('click', () => {
                layoutEl.classList.remove('sidebar-mobile-open');
            });
        }

        // Notification Menu Toggle
        if (notifBtn && notifMenu) {
            notifBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                notifMenu.classList.toggle('show');
            });
            document.addEventListener('click', () => {
                notifMenu.classList.remove('show');
            });
        }

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.logout === 'function') {
                    window.BMW_AUTH_GUARD.logout();
                } else {
                    sessionStorage.removeItem('bmw_current_user');
                    localStorage.removeItem('bmw_current_user');
                }
                showToast('Đã đăng xuất thành công', 'info');
                setTimeout(() => window.location.href = 'login.html', 400);
            });
        }

        // Table Status Filter
        if (filterStatusSelect) {
            filterStatusSelect.addEventListener('change', (e) => {
                currentFilterStatus = e.target.value;
                applyTableFilters();
            });
        }

        // Table Search
        if (tableSearchInput) {
            tableSearchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                applyTableFilters();
            });
        }

        // Topbar Quick Search
        if (topbarSearchInput) {
            topbarSearchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                if (tableSearchInput) tableSearchInput.value = searchQuery;
                applyTableFilters();
            });
        }

        // Refresh Data Button
        if (refreshDataBtn) {
            refreshDataBtn.addEventListener('click', () => {
                loadData();
                renderMetrics();
                renderStatusChart();
                renderTopProducts();
                renderNotifications();
                applyTableFilters();
                showToast('Dữ liệu đã được làm mới từ LocalStorage', 'success');
            });
        }

        // Table Action Delegations (View Order)
        if (ordersTableBody) {
            ordersTableBody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="view"]');
                if (btn) {
                    const id = btn.getAttribute('data-id');
                    openOrderModal(id);
                }
            });
        }

        // Pagination Buttons Delegation
        if (paginationBtnsWrapper) {
            paginationBtnsWrapper.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target || target.disabled) return;

                if (target.id === 'btn-page-prev') {
                    if (currentPage > 1) {
                        currentPage--;
                        renderTable();
                    }
                    return;
                }
                if (target.id === 'btn-page-next') {
                    const totalPages = Math.ceil(filteredOrders.length / PAGE_SIZE);
                    if (currentPage < totalPages) {
                        currentPage++;
                        renderTable();
                    }
                    return;
                }
                const pageNum = Number(target.getAttribute('data-page'));
                if (pageNum && pageNum !== currentPage) {
                    currentPage = pageNum;
                    renderTable();
                }
            });
        }

        // Modal Close
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeOrderModal);
        if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeOrderModal);
        if (orderModal) {
            orderModal.addEventListener('click', (e) => {
                if (e.target === orderModal) closeOrderModal();
            });
        }

        // Sidebar Navigation Links & Multi-pane View Switcher
        const navLinks = document.querySelectorAll('.dash-nav-item');
        navLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                const href = link.getAttribute('href');
                if (href && href.startsWith('#')) {
                    e.preventDefault();
                    switchView(href);
                    // Close mobile drawer if open
                    if (layoutEl) layoutEl.classList.remove('sidebar-mobile-open');
                }
            });
        });

        // Listen to hashchange on window
        window.addEventListener('hashchange', () => {
            if (window.location.hash) {
                switchView(window.location.hash);
            }
        });

        // Reports View Event Handlers
        initReportsEvents();

        // System Settings Event Handlers
        initSettingsEvents();
    }

    // ── 14. Multi-View Pane Routing (Phase 8.7) ─────────────────────────────
    function switchView(viewId) {
        const targetHash = (viewId || '#view-dashboard').replace('#', '');
        const paneDashboard = document.getElementById('view-dashboard');
        const paneReports = document.getElementById('view-reports');
        const paneSettings = document.getElementById('view-settings');

        const navDashboard = document.getElementById('nav-dashboard');
        const navReports = document.getElementById('nav-reports');
        const navSettings = document.getElementById('nav-settings');

        // Reset Panes
        [paneDashboard, paneReports, paneSettings].forEach(p => {
            if (p) {
                p.classList.remove('active');
                p.style.display = 'none';
            }
        });

        // Reset Navs
        [navDashboard, navReports, navSettings].forEach(n => {
            if (n) n.classList.remove('active');
        });

        if (targetHash === 'view-reports') {
            if (paneReports) {
                paneReports.classList.add('active');
                paneReports.style.display = 'block';
            }
            if (navReports) navReports.classList.add('active');
            if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Báo cáo thống kê';
            window.location.hash = 'view-reports';
            renderReportsView();
        } else if (targetHash === 'view-settings') {
            if (paneSettings) {
                paneSettings.classList.add('active');
                paneSettings.style.display = 'block';
            }
            if (navSettings) navSettings.classList.add('active');
            if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Cài đặt hệ thống';
            window.location.hash = 'view-settings';
            renderSettingsView();
        } else {
            if (paneDashboard) {
                paneDashboard.classList.add('active');
                paneDashboard.style.display = 'block';
            }
            if (navDashboard) navDashboard.classList.add('active');
            if (breadcrumbCurrent) breadcrumbCurrent.textContent = 'Bảng điều khiển';
            window.location.hash = 'view-dashboard';
            renderMetrics();
            renderStatusChart();
            renderTopProducts();
            applyTableFilters();
        }
    }

    // ── 15. Reports View Logic (Requirement 1 & Phase 8.7) ───────────────────
    let reportFilterFrom = '';
    let reportFilterTo = '';
    let reportFilterStatus = 'ALL';
    let reportFilterProduct = 'ALL';
    let reportTimelineMode = 'DAY'; // 'DAY' or 'MONTH'
    let reportTableSearch = '';
    let reportCurrentPage = 1;
    const REPORT_PAGE_SIZE = 6;
    let currentScopedOrders = [];

    function populateReportProductDropdown() {
        const prodSelect = document.getElementById('report-filter-product');
        if (!prodSelect) return;
        const currentVal = prodSelect.value;
        prodSelect.innerHTML = `<option value="ALL">Tất cả sản phẩm (${allProducts.length})</option>` +
            allProducts.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
        if (currentVal) prodSelect.value = currentVal;
    }

    function getScopedReportOrders() {
        return allOrders.filter(o => {
            // 1. Date Range Filter
            if (reportFilterFrom) {
                const fDate = new Date(reportFilterFrom + 'T00:00:00');
                const oDate = new Date(o.createdAt);
                if (!isNaN(fDate.getTime()) && oDate < fDate) return false;
            }
            if (reportFilterTo) {
                const tDate = new Date(reportFilterTo + 'T23:59:59.999');
                const oDate = new Date(o.createdAt);
                if (!isNaN(tDate.getTime()) && oDate > tDate) return false;
            }

            // 2. Status Filter
            const norm = getNormalizedStatus(o.orderStatus);
            if (reportFilterStatus !== 'ALL') {
                if (reportFilterStatus === 'DELIVERED' && norm !== 'Đã giao') return false;
                if (reportFilterStatus === 'PROCESSING' && norm !== 'Chờ xác nhận' && norm !== 'Đang xử lý' && norm !== 'Đang đóng gói') return false;
                if (reportFilterStatus === 'SHIPPING' && norm !== 'Đã bàn giao vận chuyển' && norm !== 'Đang giao hàng') return false;
                if (reportFilterStatus === 'CANCELLED' && norm !== 'Đã hủy') return false;
                if (reportFilterStatus === 'RETURNED' && norm !== 'Yêu cầu đổi trả' && norm !== 'Đã trả hàng') return false;
            }

            // 3. Product Filter
            if (reportFilterProduct !== 'ALL') {
                const hasProd = Array.isArray(o.items) && o.items.some(it => String(it.id) === String(reportFilterProduct) || it.name === reportFilterProduct);
                if (!hasProd) return false;
            }

            return true;
        });
    }

    function renderReportsView() {
        populateReportProductDropdown();
        currentScopedOrders = getScopedReportOrders();

        // Financial Metrics Calculation (Strict Non-Fake & Distinction)
        // 1. Real collected revenue (paid & delivered, no cancelled, no unpaid)
        const realPaidOrders = currentScopedOrders.filter(o => !isOrderCancelledOrReturned(o) && isOrderPaid(o));
        const realRevenue = realPaidOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        // 2. Pipeline value (in progress / unpaid valid orders)
        const pipelineOrders = currentScopedOrders.filter(o => !isOrderCancelledOrReturned(o) && !isOrderPaid(o));
        const pipelineValue = pipelineOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        // 3. Cancelled & Returned value (strictly separated and NOT added to real revenue)
        const cancelledOrders = currentScopedOrders.filter(o => isOrderCancelledOrReturned(o));
        const cancelledValue = cancelledOrders.reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        // 4. Volume metrics
        const totalOrdersCount = currentScopedOrders.length;
        const totalProductsCount = allProducts.length;
        const customers = allUsers.filter(u => (u.role || 'customer').toLowerCase() === 'customer');
        
        const validOrders = currentScopedOrders.filter(o => !isOrderCancelled(o));
        const deliveredOrders = currentScopedOrders.filter(o => getNormalizedStatus(o.orderStatus) === 'Đã giao');
        const successRate = validOrders.length > 0 ? Math.round((deliveredOrders.length / validOrders.length) * 100) : 0;

        // Render Metric DOM elements
        const statRealRevEl = document.getElementById('report-stat-real-revenue');
        const statRealRevSubEl = document.getElementById('report-stat-real-revenue-sub');
        const statPipelineEl = document.getElementById('report-stat-pipeline');
        const statPipelineSubEl = document.getElementById('report-stat-pipeline-sub');
        const statCancelledEl = document.getElementById('report-stat-cancelled');
        const statCancelledSubEl = document.getElementById('report-stat-cancelled-sub');
        const statOrdersCountEl = document.getElementById('report-stat-orders-count');
        const statOrdersSubEl = document.getElementById('report-stat-orders-sub');
        const statProductsEl = document.getElementById('report-stat-products');
        const statProductsSubEl = document.getElementById('report-stat-products-sub');
        const statCustomersEl = document.getElementById('report-stat-customers');
        const statCustomersSubEl = document.getElementById('report-stat-customers-sub');
        const statSuccessRateEl = document.getElementById('report-stat-success-rate');
        const statSuccessRateSubEl = document.getElementById('report-stat-success-rate-sub');

        if (statRealRevEl) statRealRevEl.textContent = formatVND(realRevenue);
        if (statRealRevSubEl) statRealRevSubEl.textContent = `${realPaidOrders.length} đơn đã thanh toán & giao thành công`;

        if (statPipelineEl) statPipelineEl.textContent = formatVND(pipelineValue);
        if (statPipelineSubEl) statPipelineSubEl.textContent = `${pipelineOrders.length} đơn đang xử lý hoặc COD chờ phát`;

        if (statCancelledEl) statCancelledEl.textContent = formatVND(cancelledValue);
        if (statCancelledSubEl) statCancelledSubEl.textContent = `${cancelledOrders.length} đơn hủy / đổi trả (bị loại khỏi DT)`;

        if (statOrdersCountEl) statOrdersCountEl.textContent = totalOrdersCount;
        if (statOrdersSubEl) statOrdersSubEl.textContent = `Trong phạm vi lọc dữ liệu thực tế`;

        if (statProductsEl) statProductsEl.textContent = totalProductsCount;
        if (statProductsSubEl) {
            const categories = new Set(allProducts.map(p => p.category).filter(Boolean));
            statProductsSubEl.textContent = `${categories.size} danh mục sản phẩm`;
        }

        if (statCustomersEl) statCustomersEl.textContent = customers.length;
        if (statCustomersSubEl) {
            const activeCust = customers.filter(u => (u.status || 'active').toLowerCase() === 'active');
            statCustomersSubEl.textContent = `${activeCust.length} tài khoản đang hoạt động`;
        }

        if (statSuccessRateEl) statSuccessRateEl.textContent = `${successRate}%`;
        if (statSuccessRateSubEl) statSuccessRateSubEl.textContent = `${deliveredOrders.length}/${validOrders.length} đơn giao thành công`;

        // Render sub-visualizations
        renderReportTimeline(currentScopedOrders);
        renderReportTopProducts(currentScopedOrders);
        renderReportStatusBars(currentScopedOrders);
        renderReportPaymentBreakdown(currentScopedOrders);
        renderReportOrdersTable(currentScopedOrders);
    }

    // ── 16. Revenue Timeline (Daily / Monthly in Actual Data Scope) ──────────
    function renderReportTimeline(orders) {
        const container = document.getElementById('report-timeline-container');
        if (!container) return;

        if (orders.length === 0) {
            container.innerHTML = `
                <div class="dash-empty" style="padding: 30px 0;">
                    <p>Chưa có dữ liệu đơn hàng trong phạm vi thời gian này.</p>
                </div>
            `;
            return;
        }

        // Group by Date or Month
        const grouped = {};
        orders.forEach(o => {
            if (!o.createdAt) return;
            const d = new Date(o.createdAt);
            if (isNaN(d.getTime())) return;

            let key = '';
            if (reportTimelineMode === 'MONTH') {
                key = d.toISOString().slice(0, 7); // 'YYYY-MM'
            } else {
                key = d.toISOString().slice(0, 10); // 'YYYY-MM-DD'
            }

            if (!grouped[key]) {
                grouped[key] = {
                    key: key,
                    dateObj: d,
                    totalOrders: 0,
                    realRevenue: 0,
                    pipelineValue: 0,
                    cancelledValue: 0
                };
            }

            grouped[key].totalOrders++;
            const total = Number(o.total) || 0;
            if (isOrderCancelledOrReturned(o)) {
                grouped[key].cancelledValue += total;
            } else if (isOrderPaid(o)) {
                grouped[key].realRevenue += total;
            } else {
                grouped[key].pipelineValue += total;
            }
        });

        const sortedKeys = Object.keys(grouped).sort();
        if (sortedKeys.length === 0) {
            container.innerHTML = `<div class="dash-empty" style="padding: 24px 0;"><p>Chưa có dữ liệu.</p></div>`;
            return;
        }

        const maxTotal = Math.max(...sortedKeys.map(k => grouped[k].realRevenue + grouped[k].pipelineValue), 1);

        container.innerHTML = sortedKeys.map(k => {
            const item = grouped[k];
            const realPct = Math.round((item.realRevenue / maxTotal) * 100);
            const pipePct = Math.round((item.pipelineValue / maxTotal) * 100);

            let label = k;
            if (reportTimelineMode === 'MONTH') {
                const [y, m] = k.split('-');
                label = `Tháng ${m}/${y}`;
            } else {
                const [y, m, d] = k.split('-');
                label = `${d}/${m}/${y}`;
            }

            return `
                <div class="report-timeline-row">
                    <div class="report-timeline-header">
                        <span class="report-timeline-date">${label}</span>
                        <span class="report-timeline-rev">${formatVND(item.realRevenue)}</span>
                    </div>
                    <div class="report-timeline-bar-track">
                        <div class="report-timeline-bar-fill" style="width: ${Math.max(realPct, 4)}%;"></div>
                    </div>
                    <div class="report-timeline-meta">
                        <span>${item.totalOrders} đơn phát sinh</span>
                        <span>Đang xử lý / Chờ thu: <strong>${formatVND(item.pipelineValue)}</strong></span>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── 17. Top Selling Products by Quantity (Requirement 1) ─────────────────
    function renderReportTopProducts(orders) {
        const container = document.getElementById('report-top-products-container');
        if (!container) return;

        // Exclude cancelled and returned orders from sales ranking
        const validOrders = orders.filter(o => !isOrderCancelledOrReturned(o));
        const itemStats = {};

        validOrders.forEach(order => {
            if (Array.isArray(order.items)) {
                order.items.forEach(it => {
                    const pid = it.id || it.name;
                    if (!itemStats[pid]) {
                        itemStats[pid] = {
                            id: pid,
                            name: it.name || 'Sản phẩm BMW',
                            image: it.image || 'images/products/performance-oversized-tshirt.jpg',
                            category: it.category || 'BMW Gear',
                            quantity: 0,
                            revenue: 0
                        };
                    }
                    const qty = Number(it.quantity) || 1;
                    const price = Number(it.priceNumber) || 0;
                    itemStats[pid].quantity += qty;
                    itemStats[pid].revenue += (price > 0 ? price * qty : (Number(it.itemTotal) || 0));
                });
            }
        });

        // Strictly rank by quantity sold descending
        const ranked = Object.values(itemStats).sort((a, b) => b.quantity - a.quantity);

        if (ranked.length === 0) {
            container.innerHTML = `
                <div class="dash-empty" style="padding: 24px 0;">
                    <p>Chưa có dữ liệu sản phẩm bán ra trong kỳ lọc này.</p>
                </div>
            `;
            return;
        }

        container.innerHTML = ranked.slice(0, 5).map((item, idx) => `
            <div class="top-product-item">
                <span class="top-prod-rank">#${idx + 1}</span>
                <img src="${item.image}" alt="${item.name}" class="top-prod-thumb" onerror="this.src='images/products/performance-oversized-tshirt.jpg'">
                <div class="top-prod-info">
                    <div class="top-prod-name" title="${item.name}">${item.name}</div>
                    <div class="top-prod-sales">Đã bán: <strong style="color:var(--accent-blue);">${item.quantity}</strong> chiếc • <span style="font-size:11px;color:var(--text-muted);">${item.category}</span></div>
                </div>
                <div class="top-prod-rev">${formatVND(item.revenue)}</div>
            </div>
        `).join('');
    }

    // ── 18. Order Status Distribution Breakdown ──────────────────────────────
    function renderReportStatusBars(orders) {
        const container = document.getElementById('report-status-bars-container');
        if (!container) return;

        const total = orders.length;
        if (total === 0) {
            container.innerHTML = `<div class="dash-empty" style="padding: 20px 0;"><p>Chưa có dữ liệu đơn hàng.</p></div>`;
            return;
        }

        const counts = {
            pending: 0,
            processing: 0,
            shipping: 0,
            delivered: 0,
            returned: 0,
            cancelled: 0
        };

        orders.forEach(o => {
            const norm = getNormalizedStatus(o.orderStatus);
            if (norm === 'Chờ xác nhận') counts.pending++;
            else if (norm === 'Đang xử lý' || norm === 'Đang đóng gói') counts.processing++;
            else if (norm === 'Đã bàn giao vận chuyển' || norm === 'Đang giao hàng') counts.shipping++;
            else if (norm === 'Đã giao') counts.delivered++;
            else if (norm === 'Yêu cầu đổi trả' || norm === 'Đã trả hàng') counts.returned++;
            else if (norm === 'Đã hủy') counts.cancelled++;
            else counts.pending++;
        });

        const statuses = [
            { label: 'Giao hàng thành công', count: counts.delivered, color: 'green' },
            { label: 'Đang vận chuyển', count: counts.shipping, color: 'blue' },
            { label: 'Chờ xử lý / Đóng gói', count: counts.processing + counts.pending, color: 'amber' },
            { label: 'Đổi trả / Hoàn hàng', count: counts.returned, color: 'amber' },
            { label: 'Đã hủy', count: counts.cancelled, color: 'red' }
        ];

        container.innerHTML = statuses.map(s => {
            const pct = Math.round((s.count / total) * 100) || 0;
            return `
                <div class="chart-bar-item">
                    <div class="bar-label-row">
                        <span>${s.label}</span>
                        <span>${s.count} đơn (${pct}%)</span>
                    </div>
                    <div class="bar-track">
                        <div class="bar-fill ${s.color}" style="width: ${pct}%;"></div>
                    </div>
                </div>
            `;
        }).join('');
    }

    // ── 19. Payment Methods & Status Distribution ────────────────────────────
    function renderReportPaymentBreakdown(orders) {
        const methodsContainer = document.getElementById('report-payment-methods-container');
        const statusContainer = document.getElementById('report-payment-status-container');
        if (!methodsContainer || !statusContainer) return;

        const total = orders.length;
        if (total === 0) {
            methodsContainer.innerHTML = `<div style="font-size:12px; color:var(--text-muted);">Chưa có dữ liệu.</div>`;
            statusContainer.innerHTML = `<div style="font-size:12px; color:var(--text-muted);">Chưa có dữ liệu.</div>`;
            return;
        }

        // Methods breakdown
        const codOrders = orders.filter(o => (o.paymentMethod || 'COD').toUpperCase() === 'COD');
        const qrOrders = orders.filter(o => (o.paymentMethod || '').toUpperCase() === 'QR' || (o.paymentMethod || '').toUpperCase() === 'BANK');

        const codPaid = codOrders.filter(o => isOrderPaid(o)).reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const codPending = codOrders.filter(o => !isOrderPaid(o) && !isOrderCancelledOrReturned(o)).reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        const qrPaid = qrOrders.filter(o => o.paymentStatus === 'paid').reduce((sum, o) => sum + (Number(o.total) || 0), 0);
        const qrPending = qrOrders.filter(o => o.paymentStatus === 'pending_payment' && !isOrderCancelledOrReturned(o)).reduce((sum, o) => sum + (Number(o.total) || 0), 0);

        methodsContainer.innerHTML = `
            <div style="background:var(--bg-primary); padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:13px;">COD (Tiền mặt khi nhận hàng)</strong>
                    <div style="font-size:11.5px; color:var(--text-muted);">${codOrders.length} đơn • Đã thu: <span style="color:#10b981; font-weight:700;">${formatVND(codPaid)}</span></div>
                </div>
                <div style="font-size:12px; color:#f59e0b; font-weight:700;">Chờ thu: ${formatVND(codPending)}</div>
            </div>
            <div style="background:var(--bg-primary); padding:10px 14px; border-radius:6px; border:1px solid var(--border-color); display:flex; justify-content:space-between; align-items:center;">
                <div>
                    <strong style="font-size:13px;">Chuyển khoản VietQR Online</strong>
                    <div style="font-size:11.5px; color:var(--text-muted);">${qrOrders.length} đơn • Đã thanh toán: <span style="color:#10b981; font-weight:700;">${formatVND(qrPaid)}</span></div>
                </div>
                <div style="font-size:12px; color:#f59e0b; font-weight:700;">Chờ thanh toán: ${formatVND(qrPending)}</div>
            </div>
        `;

        // Payment status breakdown
        const statusCounts = {
            paid: orders.filter(o => o.paymentStatus === 'paid').length,
            pending: orders.filter(o => o.paymentStatus === 'pending_payment').length,
            refund_pending: orders.filter(o => o.paymentStatus === 'refund_pending').length,
            refunded: orders.filter(o => o.paymentStatus === 'refunded').length,
            cancelled: orders.filter(o => o.paymentStatus === 'cancelled').length
        };

        statusContainer.innerHTML = `
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0;">
                <span>✓ Đã thanh toán online:</span>
                <strong>${statusCounts.paid} đơn</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0;">
                <span>⏳ Chờ thanh toán / COD chờ phát:</span>
                <strong>${statusCounts.pending} đơn</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; color:#d97706;">
                <span>⚠️ Chờ hoàn tiền (cần chuyển khoản):</span>
                <strong>${statusCounts.refund_pending} đơn</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; color:#2563eb;">
                <span>✓ Đã hoàn tiền giao dịch thật:</span>
                <strong>${statusCounts.refunded} đơn</strong>
            </div>
            <div style="display:flex; justify-content:space-between; font-size:12px; padding:4px 0; color:#ef4444;">
                <span>✕ Hủy thanh toán:</span>
                <strong>${statusCounts.cancelled} đơn</strong>
            </div>
        `;
    }

    // ── 20. Orders Table in Reports View ─────────────────────────────────────
    function renderReportOrdersTable(orders) {
        const tbody = document.getElementById('report-orders-table-body');
        const emptyEl = document.getElementById('report-table-empty');
        const paginationContainer = document.getElementById('report-table-pagination');
        const pageInfo = document.getElementById('report-pagination-info');
        const paginationBtns = document.getElementById('report-pagination-btns');
        if (!tbody) return;

        let filtered = orders;
        if (reportTableSearch) {
            const q = reportTableSearch.toLowerCase();
            filtered = orders.filter(o => {
                const matchId = (o.orderId || '').toLowerCase().includes(q);
                const matchName = (o.customer?.fullName || '').toLowerCase().includes(q);
                const matchPhone = (o.customer?.phone || '').toLowerCase().includes(q);
                return matchId || matchName || matchPhone;
            });
        }

        if (filtered.length === 0) {
            tbody.innerHTML = '';
            if (emptyEl) emptyEl.style.display = 'block';
            if (paginationContainer) paginationContainer.style.display = 'none';
            return;
        }

        if (emptyEl) emptyEl.style.display = 'none';
        if (paginationContainer) paginationContainer.style.display = 'flex';

        const total = filtered.length;
        const totalPages = Math.ceil(total / REPORT_PAGE_SIZE) || 1;
        if (reportCurrentPage > totalPages) reportCurrentPage = totalPages;

        const start = (reportCurrentPage - 1) * REPORT_PAGE_SIZE;
        const pageItems = filtered.slice(start, start + REPORT_PAGE_SIZE);

        tbody.innerHTML = pageItems.map(o => {
            const customerName = o.customer?.fullName || o.userAccount || 'Khách vãng lai';
            const customerPhone = o.customer?.phone || 'N/A';
            const itemsCount = Array.isArray(o.items) ? o.items.reduce((sum, it) => sum + (it.quantity || 1), 0) : 0;

            return `
                <tr>
                    <td><strong>#${o.orderId}</strong></td>
                    <td>
                        <div style="font-weight:600;">${customerName}</div>
                        <div style="font-size:11.5px; color:var(--text-muted);">${customerPhone}</div>
                    </td>
                    <td>${formatDate(o.createdAt)}</td>
                    <td>${itemsCount} món</td>
                    <td style="font-weight:700; color:var(--accent-blue);">${formatVND(o.total)}</td>
                    <td>${getPaymentBadge(o.paymentStatus, o.paymentMethod)}</td>
                    <td>${getStatusBadge(o.orderStatus)}</td>
                    <td>
                        <button class="btn-table-action primary" data-action="view" data-id="${o.orderId}">
                            Chi tiết
                        </button>
                    </td>
                </tr>
            `;
        }).join('');

        if (pageInfo) {
            const from = start + 1;
            const to = Math.min(start + REPORT_PAGE_SIZE, total);
            pageInfo.textContent = `Hiển thị ${from}–${to} trên tổng số ${total} đơn hàng`;
        }

        if (paginationBtns) {
            let btnsHtml = `
                <button class="btn-page" id="report-page-prev" ${reportCurrentPage <= 1 ? 'disabled' : ''}>&larr;</button>
            `;
            for (let i = 1; i <= totalPages; i++) {
                btnsHtml += `
                    <button class="btn-page ${i === reportCurrentPage ? 'active' : ''}" data-report-page="${i}">${i}</button>
                `;
            }
            btnsHtml += `
                <button class="btn-page" id="report-page-next" ${reportCurrentPage >= totalPages ? 'disabled' : ''}>&rarr;</button>
            `;
            paginationBtns.innerHTML = btnsHtml;
        }
    }

    function initReportsEvents() {
        // Date Presets
        const presetsRow = document.getElementById('report-date-presets');
        if (presetsRow) {
            presetsRow.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-preset]');
                if (!btn) return;
                presetsRow.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');

                const preset = btn.getAttribute('data-preset');
                const fromInput = document.getElementById('report-filter-from');
                const toInput = document.getElementById('report-filter-to');
                const now = new Date();
                const todayStr = now.toISOString().slice(0, 10);

                if (preset === 'ALL') {
                    reportFilterFrom = '';
                    reportFilterTo = '';
                    if (fromInput) fromInput.value = '';
                    if (toInput) toInput.value = '';
                } else if (preset === 'TODAY') {
                    reportFilterFrom = todayStr;
                    reportFilterTo = todayStr;
                    if (fromInput) fromInput.value = todayStr;
                    if (toInput) toInput.value = todayStr;
                } else if (preset === '7DAYS') {
                    const past = new Date(now.getTime() - 7 * 86400000);
                    const pastStr = past.toISOString().slice(0, 10);
                    reportFilterFrom = pastStr;
                    reportFilterTo = todayStr;
                    if (fromInput) fromInput.value = pastStr;
                    if (toInput) toInput.value = todayStr;
                } else if (preset === '30DAYS') {
                    const past = new Date(now.getTime() - 30 * 86400000);
                    const pastStr = past.toISOString().slice(0, 10);
                    reportFilterFrom = pastStr;
                    reportFilterTo = todayStr;
                    if (fromInput) fromInput.value = pastStr;
                    if (toInput) toInput.value = todayStr;
                } else if (preset === 'THIS_MONTH') {
                    const firstDayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
                    reportFilterFrom = firstDayStr;
                    reportFilterTo = todayStr;
                    if (fromInput) fromInput.value = firstDayStr;
                    if (toInput) toInput.value = todayStr;
                }

                reportCurrentPage = 1;
                renderReportsView();
            });
        }

        // Apply Filters Button
        const btnApply = document.getElementById('btn-apply-report-filters');
        if (btnApply) {
            btnApply.addEventListener('click', () => {
                const fInput = document.getElementById('report-filter-from');
                const tInput = document.getElementById('report-filter-to');
                const sInput = document.getElementById('report-filter-status');
                const pInput = document.getElementById('report-filter-product');

                reportFilterFrom = fInput ? fInput.value : '';
                reportFilterTo = tInput ? tInput.value : '';
                reportFilterStatus = sInput ? sInput.value : 'ALL';
                reportFilterProduct = pInput ? pInput.value : 'ALL';

                reportCurrentPage = 1;
                renderReportsView();
                showToast('Đã áp dụng bộ lọc báo cáo', 'info');
            });
        }

        // Reset Filters Button
        const btnReset = document.getElementById('btn-reset-report-filters');
        if (btnReset) {
            btnReset.addEventListener('click', () => {
                const fInput = document.getElementById('report-filter-from');
                const tInput = document.getElementById('report-filter-to');
                const sInput = document.getElementById('report-filter-status');
                const pInput = document.getElementById('report-filter-product');

                if (fInput) fInput.value = '';
                if (tInput) tInput.value = '';
                if (sInput) sInput.value = 'ALL';
                if (pInput) pInput.value = 'ALL';

                reportFilterFrom = '';
                reportFilterTo = '';
                reportFilterStatus = 'ALL';
                reportFilterProduct = 'ALL';
                reportTableSearch = '';

                const presetBtns = document.querySelectorAll('#report-date-presets button');
                presetBtns.forEach(b => b.classList.remove('active'));
                const allBtn = document.querySelector('#report-date-presets button[data-preset="ALL"]');
                if (allBtn) allBtn.classList.add('active');

                reportCurrentPage = 1;
                renderReportsView();
                showToast('Đã đặt lại toàn bộ bộ lọc', 'info');
            });
        }

        // Refresh Button
        const btnRefresh = document.getElementById('btn-refresh-reports');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => {
                loadData();
                renderReportsView();
                showToast('Dữ liệu báo cáo đã được làm mới từ LocalStorage', 'success');
            });
        }

        // Print Button
        const btnPrint = document.getElementById('btn-print-reports');
        if (btnPrint) {
            btnPrint.addEventListener('click', () => {
                window.print();
            });
        }

        // Timeline Day vs Month Mode
        const btnDay = document.getElementById('btn-group-by-date');
        const btnMonth = document.getElementById('btn-group-by-month');
        if (btnDay && btnMonth) {
            btnDay.addEventListener('click', () => {
                btnDay.classList.add('active');
                btnMonth.classList.remove('active');
                reportTimelineMode = 'DAY';
                renderReportTimeline(currentScopedOrders);
            });
            btnMonth.addEventListener('click', () => {
                btnMonth.classList.add('active');
                btnDay.classList.remove('active');
                reportTimelineMode = 'MONTH';
                renderReportTimeline(currentScopedOrders);
            });
        }

        // Search Input in Report Table
        const searchInput = document.getElementById('report-table-search-input');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                reportTableSearch = e.target.value.trim();
                reportCurrentPage = 1;
                renderReportOrdersTable(currentScopedOrders);
            });
        }

        // Report Table Action Delegations
        const reportTbody = document.getElementById('report-orders-table-body');
        if (reportTbody) {
            reportTbody.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-action="view"]');
                if (btn) {
                    const id = btn.getAttribute('data-id');
                    openOrderModal(id);
                }
            });
        }

        // Report Table Pagination
        const reportPagination = document.getElementById('report-pagination-btns');
        if (reportPagination) {
            reportPagination.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target || target.disabled) return;

                if (target.id === 'report-page-prev') {
                    if (reportCurrentPage > 1) {
                        reportCurrentPage--;
                        renderReportOrdersTable(currentScopedOrders);
                    }
                    return;
                }
                if (target.id === 'report-page-next') {
                    const totalPages = Math.ceil(currentScopedOrders.length / REPORT_PAGE_SIZE);
                    if (reportCurrentPage < totalPages) {
                        reportCurrentPage++;
                        renderReportOrdersTable(currentScopedOrders);
                    }
                    return;
                }
                const p = Number(target.getAttribute('data-report-page'));
                if (p && p !== reportCurrentPage) {
                    reportCurrentPage = p;
                    renderReportOrdersTable(currentScopedOrders);
                }
            });
        }
    }

    // ── 21. System Settings View Logic (Requirement 2 & Phase 8.7) ───────────
    function renderSettingsView() {
        if (!window.BMW_SETTINGS_API) return;
        const s = window.BMW_SETTINGS_API.getSettings();

        const nameInput = document.getElementById('setting-store-name');
        const taglineInput = document.getElementById('setting-tagline');
        const phoneInput = document.getElementById('setting-phone');
        const emailInput = document.getElementById('setting-email');
        const addressInput = document.getElementById('setting-address');
        const hoursInput = document.getElementById('setting-hours');
        const copyrightInput = document.getElementById('setting-copyright');
        const lowStockInput = document.getElementById('setting-low-stock-threshold');
        const itemsPerPageInput = document.getElementById('setting-items-per-page');
        const enableBannerInput = document.getElementById('setting-enable-banner');
        const bannerTextInput = document.getElementById('setting-banner-text');
        const maintenanceInput = document.getElementById('setting-maintenance-mode');
        const lastUpdatedEl = document.getElementById('setting-last-updated');
        const noticeEl = document.getElementById('settings-admin-notice');
        const saveBtn = document.getElementById('btn-save-settings');
        const resetBtn = document.getElementById('btn-reset-settings');

        if (nameInput) nameInput.value = s.storeName || '';
        if (taglineInput) taglineInput.value = s.tagline || '';
        if (phoneInput) phoneInput.value = s.phone || '';
        if (emailInput) emailInput.value = s.email || '';
        if (addressInput) addressInput.value = s.address || '';
        if (hoursInput) hoursInput.value = s.businessHours || '';
        if (copyrightInput) copyrightInput.value = s.websiteCopyright || '';
        if (lowStockInput) lowStockInput.value = s.lowStockThreshold || 15;
        if (itemsPerPageInput) itemsPerPageInput.value = s.itemsPerPage || 6;
        if (enableBannerInput) enableBannerInput.checked = Boolean(s.enableAnnouncement);
        if (bannerTextInput) bannerTextInput.value = s.announcementBanner || '';
        if (maintenanceInput) maintenanceInput.checked = Boolean(s.maintenanceMode);

        if (lastUpdatedEl) {
            lastUpdatedEl.textContent = `Lần cập nhật cuối: ${formatDate(s.updatedAt)} bởi ${s.updatedBy || 'admin'}`;
        }

        // RBAC Enforcement: Check if user has admin role
        let currentUser = null;
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getCurrentUser === 'function') {
            currentUser = window.BMW_AUTH_GUARD.getCurrentUser();
        }

        const isAdmin = currentUser && currentUser.role === 'admin';
        if (!isAdmin) {
            if (noticeEl) noticeEl.style.display = 'block';
            if (saveBtn) saveBtn.disabled = true;
            if (resetBtn) resetBtn.disabled = true;
            const formInputs = document.querySelectorAll('#system-settings-form input, #system-settings-form select');
            formInputs.forEach(i => { i.disabled = true; });
        } else {
            if (noticeEl) noticeEl.style.display = 'none';
            if (saveBtn) saveBtn.disabled = false;
            if (resetBtn) resetBtn.disabled = false;
            const formInputs = document.querySelectorAll('#system-settings-form input, #system-settings-form select');
            formInputs.forEach(i => {
                if (i.id !== 'setting-out-stock-threshold') i.disabled = false;
            });
        }
    }

    function handleSaveSettings() {
        if (!window.BMW_SETTINGS_API) return;

        let currentUser = null;
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getCurrentUser === 'function') {
            currentUser = window.BMW_AUTH_GUARD.getCurrentUser();
        }

        if (!currentUser || currentUser.role !== 'admin') {
            showToast('Chỉ Quản trị viên (Admin) mới có quyền lưu cấu hình hệ thống.', 'error');
            return;
        }

        const payload = {
            storeName: document.getElementById('setting-store-name')?.value,
            tagline: document.getElementById('setting-tagline')?.value,
            phone: document.getElementById('setting-phone')?.value,
            email: document.getElementById('setting-email')?.value,
            address: document.getElementById('setting-address')?.value,
            businessHours: document.getElementById('setting-hours')?.value,
            websiteCopyright: document.getElementById('setting-copyright')?.value,
            lowStockThreshold: document.getElementById('setting-low-stock-threshold')?.value,
            itemsPerPage: document.getElementById('setting-items-per-page')?.value,
            enableAnnouncement: document.getElementById('setting-enable-banner')?.checked,
            announcementBanner: document.getElementById('setting-banner-text')?.value,
            maintenanceMode: document.getElementById('setting-maintenance-mode')?.checked
        };

        const res = window.BMW_SETTINGS_API.saveSettings(payload, currentUser);
        if (res.success) {
            showToast('Cập nhật Cài đặt hệ thống thành công!', 'success');
            renderSettingsView();
        } else {
            showToast(res.message || 'Lỗi khi lưu cài đặt.', 'error');
        }
    }

    function handleResetSettings() {
        if (!window.BMW_SETTINGS_API) return;

        let currentUser = null;
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getCurrentUser === 'function') {
            currentUser = window.BMW_AUTH_GUARD.getCurrentUser();
        }

        if (!currentUser || currentUser.role !== 'admin') {
            showToast('Chỉ Quản trị viên (Admin) mới có quyền khôi phục cài đặt mặc định.', 'error');
            return;
        }

        const confirmed = confirm('Bạn có chắc chắn muốn khôi phục toàn bộ cài đặt hệ thống về mặc định?');
        if (!confirmed) return;

        const res = window.BMW_SETTINGS_API.resetDefaults(currentUser);
        if (res.success) {
            showToast('Đã khôi phục cài đặt mặc định thành công!', 'success');
            renderSettingsView();
        } else {
            showToast(res.message || 'Lỗi khi khôi phục cài đặt.', 'error');
        }
    }

    function initSettingsEvents() {
        const saveBtn = document.getElementById('btn-save-settings');
        if (saveBtn) {
            saveBtn.addEventListener('click', handleSaveSettings);
        }

        const resetBtn = document.getElementById('btn-reset-settings');
        if (resetBtn) {
            resetBtn.addEventListener('click', handleResetSettings);
        }
    }

    // ── 22. Initialize Dashboard ────────────────────────────────────────────
    function init() {
        bindCurrentUser();
        loadData();
        renderMetrics();
        renderStatusChart();
        renderTopProducts();
        renderNotifications();
        applyTableFilters();
        initEvents();

        // Check if page opened with specific hash
        if (window.location.hash) {
            switchView(window.location.hash);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
