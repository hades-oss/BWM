/**
 * js/admin-orders.js — BMW GYM Admin Order Management Logic
 * Full Order Lifecycle Control, Valid Status Transitions Matrix, Payment Auditing, Restock & Internal Notes
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
    let filteredOrders = [];
    let currentPage = 1;
    const PAGE_SIZE = 8;
    let currentFilterStatus = 'ALL';
    let currentFilterPayment = 'ALL';
    let currentFilterMethod = 'ALL';
    let currentSort = 'newest';
    let searchQuery = '';
    let currentActiveOrderId = null;

    // ── 3. DOM Elements ─────────────────────────────────────────────────────
    const layoutEl = document.getElementById('dash-layout');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const mobileToggleBtn = document.getElementById('sidebar-mobile-toggle');
    const backdropEl = document.getElementById('dash-backdrop');
    const logoutBtn = document.getElementById('logout-btn');

    // Metrics
    const metricTotalOrders = document.getElementById('metric-total-orders');
    const metricTotalRevenue = document.getElementById('metric-total-revenue');
    const metricPendingOrders = document.getElementById('metric-pending-orders');
    const metricShippingOrders = document.getElementById('metric-shipping-orders');
    const metricDeliveredOrders = document.getElementById('metric-delivered-orders');
    const metricCancelledOrders = document.getElementById('metric-cancelled-orders');
    const metricRefundPendingSub = document.getElementById('metric-refund-pending-sub');

    // Filters & Search
    const searchInput = document.getElementById('order-search-input');
    const filterStatusSelect = document.getElementById('filter-order-status');
    const filterPaymentSelect = document.getElementById('filter-payment-status');
    const filterMethodSelect = document.getElementById('filter-payment-method');
    const sortSelect = document.getElementById('sort-orders');
    const refreshBtn = document.getElementById('btn-refresh-orders');

    // Table
    const ordersTableBody = document.getElementById('orders-table-body');
    const tableLoading = document.getElementById('table-loading');
    const tableEmpty = document.getElementById('table-empty');
    const paginationContainer = document.getElementById('table-pagination');
    const paginationInfo = document.getElementById('pagination-info');
    const paginationBtns = document.getElementById('pagination-btns');

    // Modal Elements
    const orderModal = document.getElementById('order-detail-modal');
    const modalCloseBtn = document.getElementById('modal-close-btn');
    const modalCloseFooterBtn = document.getElementById('modal-close-footer-btn');

    // User Profile Elements
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');

    // Toast
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

    function getNormalizedStatus(orderStatus) {
        if (window.BMW_ORDERS_API && typeof window.BMW_ORDERS_API.normalizeOrderStatus === 'function') {
            return window.BMW_ORDERS_API.normalizeOrderStatus(orderStatus);
        }
        return orderStatus || 'Chờ xác nhận';
    }

    function getStatusBadge(orderStatus) {
        const norm = getNormalizedStatus(orderStatus);
        switch (norm) {
            case 'Đã giao':
                return `<span class="badge-status status-delivered">Đã giao thành công</span>`;
            case 'Đang giao hàng':
                return `<span class="badge-status status-transit">Đang giao hàng</span>`;
            case 'Đã bàn giao vận chuyển':
                return `<span class="badge-status status-transit" style="background:rgba(14,165,233,0.12);color:#0284c7;">Đã bàn giao VC</span>`;
            case 'Đang đóng gói':
                return `<span class="badge-status status-dispatch" style="background:rgba(168,85,247,0.12);color:#7e22ce;">Đang đóng gói</span>`;
            case 'Đang xử lý':
                return `<span class="badge-status status-dispatch">Đang xử lý</span>`;
            case 'Đã xác nhận':
                return `<span class="badge-status status-dispatch" style="background:rgba(16,185,129,0.12);color:#059669;">Đã xác nhận</span>`;
            case 'Đã hủy':
                return `<span class="badge-status status-cancelled">Đã hủy</span>`;
            case 'Yêu cầu đổi trả':
                return `<span class="badge-status status-cancelled" style="background:rgba(234,88,12,0.12);color:#c2410c;">Yêu cầu đổi trả</span>`;
            case 'Đã trả hàng':
                return `<span class="badge-status status-cancelled" style="background:#f1f5f9;color:#64748b;">Đã trả hàng</span>`;
            default:
                return `<span class="badge-status status-ordered">Chờ xác nhận</span>`;
        }
    }

    function getPaymentBadge(paymentStatus, paymentMethod) {
        const ps = (paymentStatus || '').toLowerCase();
        const pm = (paymentMethod || 'COD').toUpperCase();

        if (ps === 'paid') {
            return `<span class="badge-status status-paid">${pm} • Đã thanh toán</span>`;
        }
        if (ps === 'refund_pending') {
            return `<span class="badge-status status-pending" style="background:rgba(245,158,11,0.12);color:#d97706;border:1px solid rgba(245,158,11,0.25);">${pm} • Chờ hoàn tiền</span>`;
        }
        if (ps === 'refunded') {
            return `<span class="badge-status status-paid" style="background:rgba(59,130,246,0.12);color:#2563eb;border:1px solid rgba(59,130,246,0.25);">${pm} • Đã hoàn tiền</span>`;
        }
        if (ps === 'cancelled') {
            return `<span class="badge-status status-cancelled">${pm} • Hủy thanh toán</span>`;
        }
        return `<span class="badge-status status-pending">${pm} • Chưa thanh toán</span>`;
    }

    // ── 5. Data Loading & Metrics ───────────────────────────────────────────
    function loadData() {
        if (window.BMW_ORDERS_API && typeof window.BMW_ORDERS_API.getOrders === 'function') {
            allOrders = window.BMW_ORDERS_API.getOrders();
        } else {
            try {
                const raw = localStorage.getItem('bmw_orders');
                allOrders = raw ? JSON.parse(raw) : [];
            } catch (e) {
                allOrders = [];
            }
        }
    }

    function renderMetrics() {
        let totalRevenue = 0;
        let pendingCount = 0;
        let shippingCount = 0;
        let deliveredCount = 0;
        let cancelledCount = 0;
        let refundPendingCount = 0;

        allOrders.forEach(o => {
            const norm = getNormalizedStatus(o.orderStatus);
            if (norm === 'Đã giao') {
                totalRevenue += (Number(o.total) || 0);
                deliveredCount++;
            } else if (norm === 'Chờ xác nhận') {
                pendingCount++;
            } else if (norm === 'Đã xác nhận' || norm === 'Đang xử lý' || norm === 'Đang đóng gói' || norm === 'Đã bàn giao vận chuyển' || norm === 'Đang giao hàng') {
                shippingCount++;
            } else if (norm === 'Đã hủy' || norm === 'Yêu cầu đổi trả' || norm === 'Đã trả hàng') {
                cancelledCount++;
            }

            if (o.paymentStatus === 'refund_pending') {
                refundPendingCount++;
            }
        });

        if (metricTotalOrders) metricTotalOrders.textContent = allOrders.length;
        if (metricTotalRevenue) metricTotalRevenue.textContent = `Doanh thu thực: ${formatVND(totalRevenue)}`;
        if (metricPendingOrders) metricPendingOrders.textContent = pendingCount;
        if (metricShippingOrders) metricShippingOrders.textContent = shippingCount;
        if (metricDeliveredOrders) metricDeliveredOrders.textContent = deliveredCount;
        if (metricCancelledOrders) metricCancelledOrders.textContent = cancelledCount;
        if (metricRefundPendingSub) metricRefundPendingSub.textContent = `${refundPendingCount} đơn chờ hoàn tiền`;
    }

    // ── 6. Filtering, Searching & Sorting ───────────────────────────────────
    function applyFilters() {
        filteredOrders = allOrders.filter(order => {
            const normStatus = getNormalizedStatus(order.orderStatus);

            // Filter by Order Status
            if (currentFilterStatus !== 'ALL') {
                if (normStatus !== currentFilterStatus) return false;
            }

            // Filter by Payment Status
            if (currentFilterPayment !== 'ALL') {
                const ps = (order.paymentStatus || 'pending_payment').toLowerCase();
                if (ps !== currentFilterPayment.toLowerCase()) return false;
            }

            // Filter by Payment Method
            if (currentFilterMethod !== 'ALL') {
                const pm = (order.paymentMethod || 'COD').toUpperCase();
                if (pm !== currentFilterMethod.toUpperCase()) return false;
            }

            // Search query
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

        // Sorting
        filteredOrders.sort((a, b) => {
            if (currentSort === 'newest') return new Date(b.createdAt) - new Date(a.createdAt);
            if (currentSort === 'oldest') return new Date(a.createdAt) - new Date(b.createdAt);
            if (currentSort === 'total_desc') return (Number(b.total) || 0) - (Number(a.total) || 0);
            if (currentSort === 'total_asc') return (Number(a.total) || 0) - (Number(b.total) || 0);
            return 0;
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

        const totalItems = filteredOrders.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredOrders.slice(startIndex, startIndex + PAGE_SIZE);

        ordersTableBody.innerHTML = pageItems.map(order => {
            const customerName = order.customer?.fullName || order.userAccount || 'Khách vãng lai';
            const customerPhone = order.customer?.phone || 'N/A';
            const itemsCount = Array.isArray(order.items) ? order.items.reduce((s, it) => s + (it.quantity || 1), 0) : 0;
            const normStatus = getNormalizedStatus(order.orderStatus);
            const isPending = normStatus === 'Chờ xác nhận';

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
                    <td style="text-align: center;">
                        <div class="table-actions" style="justify-content: center; gap: 6px;">
                            ${isPending ? `
                                <button class="btn-table-action" style="background:#10b981; color:#fff;" data-action="quick-confirm" data-id="${order.orderId}" title="Xác nhận đơn ngay">
                                    ✓
                                </button>
                            ` : ''}
                            <button class="btn-table-action primary" data-action="view" data-id="${order.orderId}">
                                Chi tiết
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Pagination
        if (paginationInfo) {
            const from = startIndex + 1;
            const to = Math.min(startIndex + PAGE_SIZE, totalItems);
            paginationInfo.textContent = `Hiển thị ${from}–${to} trên tổng số ${totalItems} đơn hàng`;
        }

        if (paginationBtns) {
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
            paginationBtns.innerHTML = btnsHtml;
        }
    }

    // ── 7. Order Detail Modal Logic ─────────────────────────────────────────
    function openOrderModal(orderId) {
        currentActiveOrderId = orderId;
        const order = allOrders.find(o => String(o.orderId) === String(orderId));
        if (!order || !orderModal) return;

        // Header info
        document.getElementById('modal-order-id').textContent = `Đơn hàng #${order.orderId}`;
        document.getElementById('modal-order-date').textContent = `Đặt lúc: ${formatDate(order.createdAt)} (Cập nhật lần cuối: ${formatDate(order.updatedAt)})`;
        document.getElementById('modal-badge-order-status').innerHTML = getStatusBadge(order.orderStatus);
        document.getElementById('modal-badge-payment-status').innerHTML = getPaymentBadge(order.paymentStatus, order.paymentMethod);
        document.getElementById('modal-user-account').textContent = order.userAccount ? `@${order.userAccount}` : 'Khách vãng lai';

        // Customer info
        document.getElementById('modal-customer-name').textContent = order.customer?.fullName || 'N/A';
        document.getElementById('modal-customer-phone').textContent = order.customer?.phone || 'N/A';
        document.getElementById('modal-customer-address').textContent = order.customer?.address || 'N/A';
        document.getElementById('modal-customer-notes').textContent = order.customer?.notes || 'Không có';

        // Financial info
        document.getElementById('modal-payment-method').textContent = order.paymentMethod === 'COD' ? 'Tiền mặt khi giao (COD)' : 'Chuyển khoản QR MB Bank';
        document.getElementById('modal-subtotal').textContent = formatVND(order.subtotal || order.total);
        document.getElementById('modal-shipping').textContent = formatVND(order.shippingFee || 0);
        document.getElementById('modal-discount').textContent = `-${formatVND(order.discount || 0)}`;
        document.getElementById('modal-total').textContent = formatVND(order.total);

        // Financial action buttons visibility
        const markPaidBtn = document.getElementById('btn-modal-mark-paid');
        const markRefundedBtn = document.getElementById('btn-modal-mark-refunded');
        if (markPaidBtn) {
            markPaidBtn.style.display = (order.paymentStatus !== 'paid' && order.paymentStatus !== 'refunded') ? 'inline-block' : 'none';
        }
        if (markRefundedBtn) {
            markRefundedBtn.style.display = (order.paymentStatus === 'refund_pending') ? 'inline-block' : 'none';
        }

        // Render product items
        const tbodyItems = document.getElementById('modal-items-tbody');
        if (tbodyItems) {
            const items = Array.isArray(order.items) ? order.items : [];
            tbodyItems.innerHTML = items.map(it => {
                const itemTotal = it.itemTotal || (it.priceNumber ? it.priceNumber * it.quantity : 0);
                return `
                    <tr>
                        <td>
                            <div style="display:flex; align-items:center; gap:10px;">
                                <img src="${it.image || 'images/products/performance-oversized-tshirt.jpg'}" alt="${it.name}" style="width:40px; height:40px; border-radius:4px; object-fit:cover; border:1px solid var(--border-color);" onerror="this.src='images/products/performance-oversized-tshirt.jpg'">
                                <div>
                                    <div style="font-weight:700;">${it.name}</div>
                                    <div style="font-size:11px; color:var(--text-muted);">${it.category || 'BMW Gear'}</div>
                                </div>
                            </div>
                        </td>
                        <td style="text-align:right;">${it.price || formatVND(it.priceNumber)}</td>
                        <td style="text-align:center; font-weight:700;">${it.quantity}</td>
                        <td style="text-align:right; font-weight:700; color:var(--accent-blue);">${formatVND(itemTotal)}</td>
                    </tr>
                `;
            }).join('');
        }

        // Populate valid next status transitions (Requirement 3 & 7)
        const nextStatusSelect = document.getElementById('modal-next-status-select');
        const updateStatusBtn = document.getElementById('btn-modal-update-status');
        const statusNoteInput = document.getElementById('modal-status-note-input');
        if (statusNoteInput) statusNoteInput.value = '';

        const normCurrent = getNormalizedStatus(order.orderStatus);
        const validTransitions = (window.BMW_ORDERS_API && window.BMW_ORDERS_API.VALID_STATUS_TRANSITIONS) 
            ? (window.BMW_ORDERS_API.VALID_STATUS_TRANSITIONS[normCurrent] || window.BMW_ORDERS_API.VALID_STATUS_TRANSITIONS[order.orderStatus] || [])
            : [];

        if (nextStatusSelect) {
            if (validTransitions.length === 0) {
                nextStatusSelect.innerHTML = `<option value="">(Không còn trạng thái khả dụng - Đơn kết thúc)</option>`;
                if (updateStatusBtn) updateStatusBtn.disabled = true;
            } else {
                nextStatusSelect.innerHTML = validTransitions.map(t => {
                    const normT = getNormalizedStatus(t);
                    return `<option value="${normT}">${normT}</option>`;
                }).join('');
                if (updateStatusBtn) updateStatusBtn.disabled = false;
            }
        }

        // Quick action buttons
        const quickConfirmBtn = document.getElementById('btn-quick-confirm-order');
        const quickCancelBtn = document.getElementById('btn-quick-cancel-order');
        const approveReturnBtn = document.getElementById('btn-approve-return');

        if (quickConfirmBtn) {
            quickConfirmBtn.style.display = (normCurrent === 'Chờ xác nhận') ? 'inline-block' : 'none';
        }
        if (quickCancelBtn) {
            quickCancelBtn.style.display = (normCurrent !== 'Đã giao' && normCurrent !== 'Đã hủy' && normCurrent !== 'Đã trả hàng') ? 'inline-block' : 'none';
        }
        if (approveReturnBtn) {
            approveReturnBtn.style.display = (normCurrent === 'Yêu cầu đổi trả') ? 'inline-block' : 'none';
        }

        // Render Status History Timeline
        renderStatusHistory(order);

        // Render Internal Notes
        renderInternalNotes(order);

        orderModal.classList.add('show');
    }

    function closeOrderModal() {
        if (orderModal) orderModal.classList.remove('show');
        currentActiveOrderId = null;
    }

    function renderStatusHistory(order) {
        const container = document.getElementById('modal-status-history-list');
        if (!container) return;

        const history = Array.isArray(order.statusHistory) ? order.statusHistory : [];
        if (history.length === 0) {
            container.innerHTML = `<div style="font-size:12px; color:var(--text-muted);">Chưa có lịch sử trạng thái.</div>`;
            return;
        }

        container.innerHTML = history.slice().reverse().map(h => `
            <div class="timeline-audit-item">
                <div class="timeline-audit-header">
                    <strong>${h.status}</strong>
                    <span>${formatDate(h.at)}</span>
                </div>
                <div style="font-size:11px; color:var(--accent-blue); font-weight:600;">Bởi: ${h.by || 'Hệ thống'}</div>
                <div style="margin-top:2px; color:var(--text-secondary);">${h.note || ''}</div>
            </div>
        `).join('');
    }

    function renderInternalNotes(order) {
        const container = document.getElementById('modal-internal-notes-list');
        if (!container) return;

        const notes = Array.isArray(order.internalNotes) ? order.internalNotes : [];
        if (notes.length === 0) {
            container.innerHTML = `<div style="font-size:12px; color:var(--text-muted);">Chưa có ghi chú nội bộ nào.</div>`;
            return;
        }

        container.innerHTML = notes.map(n => `
            <div class="note-bubble">
                <div class="note-bubble-meta">
                    <strong>${n.by || 'Nhân viên'}</strong>
                    <span>${formatDate(n.at)}</span>
                </div>
                <div>${n.text}</div>
            </div>
        `).join('');
    }

    // ── 8. Action Handlers (Live Storage Persistence) ────────────────────────
    function handleUpdateStatus(orderId, newStatus, note = '') {
        const res = window.BMW_ORDERS_API.updateOrderStatus(orderId, newStatus, note, 'Admin (@admin)');
        if (res.success) {
            showToast(`Cập nhật đơn hàng #${orderId} sang "${newStatus}" thành công!`, 'success');
            loadData();
            renderMetrics();
            applyFilters();
            openOrderModal(orderId);
        } else {
            showToast(res.message || 'Lỗi cập nhật trạng thái đơn hàng', 'error');
        }
    }

    function handleConfirmPayment(orderId, newStatus, note = '') {
        const order = window.BMW_ORDERS_API.updateOrderPaymentStatus(orderId, newStatus, 'Admin (@admin)', note);
        if (order) {
            showToast(`Cập nhật thanh toán đơn #${orderId} sang "${newStatus}" thành công!`, 'success');
            loadData();
            renderMetrics();
            applyFilters();
            openOrderModal(orderId);
        } else {
            showToast(`Lỗi xác nhận thanh toán đơn #${orderId}`, 'error');
        }
    }

    function handleCancelOrder(orderId) {
        const reason = prompt('Nhập lý do hủy đơn hàng (sản phẩm sẽ được tự động hoàn lại vào kho):', 'Hết hàng / Khách yêu cầu hủy qua điện thoại');
        if (!reason || !reason.trim()) return;

        const res = window.BMW_ORDERS_API.cancelOrder(orderId, reason.trim(), 'Admin (@admin)');
        if (res.success) {
            showToast(`Đã hủy đơn hàng #${orderId} và tự động hoàn trả số lượng vào kho!`, 'success');
            loadData();
            renderMetrics();
            applyFilters();
            openOrderModal(orderId);
        } else {
            showToast(res.message || 'Lỗi khi hủy đơn hàng', 'error');
        }
    }

    function handleAddInternalNote(orderId, text) {
        if (!text || !text.trim()) return;
        const res = window.BMW_ORDERS_API.addInternalNote(orderId, text.trim(), 'Admin (@admin)');
        if (res.success) {
            showToast('Đã lưu ghi chú nội bộ', 'success');
            loadData();
            openOrderModal(orderId);
        } else {
            showToast(res.message || 'Lỗi lưu ghi chú', 'error');
        }
    }

    // ── 9. User Profile Binding ─────────────────────────────────────────────
    function bindCurrentUser() {
        let user = null;
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getCurrentUser === 'function') {
            user = window.BMW_AUTH_GUARD.getCurrentUser();
        } else {
            const raw = sessionStorage.getItem('bmw_current_user') || localStorage.getItem('bmw_current_user');
            if (raw) user = JSON.parse(raw);
        }

        if (!user) return;

        const displayName = user.fullName || user.username || 'Admin BMW';
        const initial = (user.username || 'A').charAt(0).toUpperCase();

        if (sidebarUserName) sidebarUserName.textContent = displayName;
        const avatarHtml = user.avatar 
            ? `<img src="${user.avatar}" alt="${displayName}">`
            : `<span>${initial}</span>`;

        if (topbarUserAvatar) topbarUserAvatar.innerHTML = avatarHtml;
        if (sidebarUserAvatar) sidebarUserAvatar.innerHTML = avatarHtml;
    }

    // ── 10. Event Listeners ─────────────────────────────────────────────────
    function initEvents() {
        // Sidebar & Collapse
        if (collapseBtn && layoutEl) {
            collapseBtn.addEventListener('click', () => layoutEl.classList.toggle('sidebar-collapsed'));
        }
        if (mobileToggleBtn && layoutEl) {
            mobileToggleBtn.addEventListener('click', () => layoutEl.classList.toggle('sidebar-mobile-open'));
        }
        if (backdropEl && layoutEl) {
            backdropEl.addEventListener('click', () => layoutEl.classList.remove('sidebar-mobile-open'));
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

        // Search & Filters
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                applyFilters();
            });
        }
        if (filterStatusSelect) {
            filterStatusSelect.addEventListener('change', (e) => {
                currentFilterStatus = e.target.value;
                applyFilters();
            });
        }
        if (filterPaymentSelect) {
            filterPaymentSelect.addEventListener('change', (e) => {
                currentFilterPayment = e.target.value;
                applyFilters();
            });
        }
        if (filterMethodSelect) {
            filterMethodSelect.addEventListener('change', (e) => {
                currentFilterMethod = e.target.value;
                applyFilters();
            });
        }
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                currentSort = e.target.value;
                applyFilters();
            });
        }
        if (refreshBtn) {
            refreshBtn.addEventListener('click', () => {
                loadData();
                renderMetrics();
                applyFilters();
                showToast('Dữ liệu đơn hàng đã được cập nhật mới nhất!', 'success');
            });
        }

        // Table Action Delegations
        if (ordersTableBody) {
            ordersTableBody.addEventListener('click', (e) => {
                const viewBtn = e.target.closest('button[data-action="view"]');
                if (viewBtn) {
                    const id = viewBtn.getAttribute('data-id');
                    openOrderModal(id);
                    return;
                }

                const quickConfirm = e.target.closest('button[data-action="quick-confirm"]');
                if (quickConfirm) {
                    const id = quickConfirm.getAttribute('data-id');
                    handleUpdateStatus(id, 'Đã xác nhận', 'Quản trị viên xác nhận đơn hàng qua danh sách');
                }
            });
        }

        // Pagination Clicks
        if (paginationBtns) {
            paginationBtns.addEventListener('click', (e) => {
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

        // Modal Controls
        if (modalCloseBtn) modalCloseBtn.addEventListener('click', closeOrderModal);
        if (modalCloseFooterBtn) modalCloseFooterBtn.addEventListener('click', closeOrderModal);
        if (orderModal) {
            orderModal.addEventListener('click', (e) => {
                if (e.target === orderModal) closeOrderModal();
            });
        }

        // Modal Action: Update status
        const updateStatusBtn = document.getElementById('btn-modal-update-status');
        if (updateStatusBtn) {
            updateStatusBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                const nextStatusSelect = document.getElementById('modal-next-status-select');
                const noteInput = document.getElementById('modal-status-note-input');
                const selectedStatus = nextStatusSelect?.value;
                if (!selectedStatus) return;

                handleUpdateStatus(currentActiveOrderId, selectedStatus, noteInput?.value.trim() || '');
            });
        }

        // Modal Action: Quick Confirm
        const quickConfirmBtn = document.getElementById('btn-quick-confirm-order');
        if (quickConfirmBtn) {
            quickConfirmBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                handleUpdateStatus(currentActiveOrderId, 'Đã xác nhận', 'Quản trị viên duyệt xác nhận đơn hàng');
            });
        }

        // Modal Action: Cancel Order
        const quickCancelBtn = document.getElementById('btn-quick-cancel-order');
        if (quickCancelBtn) {
            quickCancelBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                handleCancelOrder(currentActiveOrderId);
            });
        }

        // Modal Action: Mark Paid
        const markPaidBtn = document.getElementById('btn-modal-mark-paid');
        if (markPaidBtn) {
            markPaidBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                handleConfirmPayment(currentActiveOrderId, 'paid', 'Quản trị viên xác nhận đã nhận chuyển khoản');
            });
        }

        // Modal Action: Mark Refunded
        const markRefundedBtn = document.getElementById('btn-modal-mark-refunded');
        if (markRefundedBtn) {
            markRefundedBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                handleConfirmPayment(currentActiveOrderId, 'refunded', 'Kế toán xác nhận đã chuyển khoản hoàn tiền thành công');
            });
        }

        // Modal Action: Approve Return
        const approveReturnBtn = document.getElementById('btn-approve-return');
        if (approveReturnBtn) {
            approveReturnBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                handleUpdateStatus(currentActiveOrderId, 'Đã trả hàng', 'Quản trị viên đã nhận sản phẩm đổi trả và hoàn tất xử lý');
            });
        }

        // Modal Action: Add internal note
        const addNoteBtn = document.getElementById('btn-modal-add-note');
        const newNoteInput = document.getElementById('modal-new-note-input');
        if (addNoteBtn && newNoteInput) {
            addNoteBtn.addEventListener('click', () => {
                if (!currentActiveOrderId) return;
                const text = newNoteInput.value.trim();
                if (!text) return;
                handleAddInternalNote(currentActiveOrderId, text);
                newNoteInput.value = '';
            });
            newNoteInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    addNoteBtn.click();
                }
            });
        }
    }

    // ── 11. Initialization ──────────────────────────────────────────────────
    function init() {
        bindCurrentUser();
        loadData();
        renderMetrics();
        applyFilters();
        initEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
