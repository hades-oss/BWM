/**
 * js/admin-promotions.js — BMW GYM Admin Promotion Management Logic (Phase 8.6)
 * Handles promotions listing, KPI metrics, filtering, pagination, creation,
 * auto-generation of 6-character coupon codes, editing, toggling, and termination.
 */

(function () {
    'use strict';

    // ── 1. RBAC Guard: Require Admin Role ──────────────────────────────────
    if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.requireRole === 'function') {
        const hasAccess = window.BMW_AUTH_GUARD.requireRole(['admin'], 'index.html');
        if (!hasAccess) return;
    }

    // ── 2. State Variables ──────────────────────────────────────────────────
    let allPromotions = [];
    let filteredPromotions = [];
    let currentFilterStatus = 'ALL';
    let currentFilterType = 'ALL';
    let searchQuery = '';
    let currentPage = 1;
    const PAGE_SIZE = 6;

    let pendingConfirmAction = null;

    // ── 3. DOM Elements ─────────────────────────────────────────────────────
    const layoutEl = document.getElementById('dash-layout');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const mobileToggleBtn = document.getElementById('sidebar-mobile-toggle');
    const backdropEl = document.getElementById('dash-backdrop');
    const logoutBtn = document.getElementById('logout-btn');
    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    // Sidebar & Topbar User Info
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');

    // KPI Metric Elements
    const statTotalPromos = document.getElementById('stat-total-promos');
    const statActivePromos = document.getElementById('stat-active-promos');
    const statUsedPromos = document.getElementById('stat-used-promos');
    const statRemainingPromos = document.getElementById('stat-remaining-promos');

    // Filters & Search
    const filterStatusSelect = document.getElementById('filter-promo-status');
    const filterTypeSelect = document.getElementById('filter-promo-type');
    const filterSearchInput = document.getElementById('filter-promo-search');

    // Table & Pagination
    const promoTableBody = document.getElementById('promotions-table-body');
    const promoTableEmpty = document.getElementById('promos-table-empty');
    const promoPagination = document.getElementById('promos-pagination');
    const promoPaginationInfo = document.getElementById('promos-pagination-info');
    const promoPaginationBtns = document.getElementById('promos-pagination-btns');

    // Create Modal Elements
    const btnOpenCreatePromo = document.getElementById('btn-open-create-promo');
    const modalCreatePromo = document.getElementById('modal-create-promo');
    const btnCloseCreatePromo = document.getElementById('btn-close-create-promo');
    const btnCancelCreatePromo = document.getElementById('btn-cancel-create-promo');
    const formCreatePromo = document.getElementById('form-create-promo');
    const btnAutoGenCode = document.getElementById('btn-auto-gen-code');

    const inputPromoName = document.getElementById('promo-name');
    const inputPromoCode = document.getElementById('promo-code');
    const selectPromoType = document.getElementById('promo-type');
    const inputPromoDiscount = document.getElementById('promo-discount');
    const inputPromoUsageLimit = document.getElementById('promo-usage-limit');
    const selectPromoScope = document.getElementById('promo-scope');
    const promoCategoryBox = document.getElementById('promo-category-box');
    const selectPromoCategory = document.getElementById('promo-category');
    const inputPromoStartDate = document.getElementById('promo-start-date');
    const inputPromoEndDate = document.getElementById('promo-end-date');
    const textareaPromoDesc = document.getElementById('promo-desc');

    // Error feedback spans
    const errPromoName = document.getElementById('err-promo-name');
    const errPromoCode = document.getElementById('err-promo-code');
    const errPromoDiscount = document.getElementById('err-promo-discount');
    const errPromoUsage = document.getElementById('err-promo-usage');
    const errPromoEndDate = document.getElementById('err-promo-end-date');

    // Edit Modal Elements
    const modalEditPromo = document.getElementById('modal-edit-promo');
    const btnCloseEditPromo = document.getElementById('btn-close-edit-promo');
    const btnCancelEditPromo = document.getElementById('btn-cancel-edit-promo');
    const formEditPromo = document.getElementById('form-edit-promo');
    const editPromoId = document.getElementById('edit-promo-id');
    const editPromoName = document.getElementById('edit-promo-name');
    const editPromoCode = document.getElementById('edit-promo-code');
    const editPromoType = document.getElementById('edit-promo-type');
    const editPromoDiscount = document.getElementById('edit-promo-discount');
    const editPromoUsageLimit = document.getElementById('edit-promo-usage-limit');
    const editPromoStartDate = document.getElementById('edit-promo-start-date');
    const editPromoEndDate = document.getElementById('edit-promo-end-date');
    const editPromoDesc = document.getElementById('edit-promo-desc');
    const editPromoIsActive = document.getElementById('edit-promo-is-active');

    // Confirm Modal Elements
    const modalConfirm = document.getElementById('modal-confirm');
    const btnCloseConfirm = document.getElementById('btn-close-confirm');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    const btnConfirmAccept = document.getElementById('btn-confirm-accept');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalMessage = document.getElementById('confirm-modal-message');

    // Toast Container
    const toastContainer = document.getElementById('dash-toast-container');

    // ── 4. Helper Utilities ─────────────────────────────────────────────────
    function formatVND(num) {
        if (num === null || num === undefined || isNaN(num)) return '0₫';
        return new Intl.NumberFormat('vi-VN').format(Math.round(num)) + '₫';
    }

    function formatDateShort(isoStr) {
        if (!isoStr) return 'N/A';
        try {
            const d = new Date(isoStr);
            return d.toLocaleDateString('vi-VN', {
                year: 'numeric',
                month: '2-digit',
                day: '2-digit'
            });
        } catch (e) {
            return isoStr;
        }
    }

    function toInputDateString(isoStr) {
        if (!isoStr) return '';
        try {
            const d = new Date(isoStr);
            const yr = d.getFullYear();
            const mo = String(d.getMonth() + 1).padStart(2, '0');
            const day = String(d.getDate()).padStart(2, '0');
            return `${yr}-${mo}-${day}`;
        } catch (e) {
            return '';
        }
    }

    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `dash-toast toast-${type}`;

        const iconSvg = type === 'success'
            ? '<svg viewBox="0 0 24 24"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
            : type === 'danger'
            ? '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
            : '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>';

        toast.innerHTML = `
            ${iconSvg}
            <span>${message}</span>
        `;
        toastContainer.appendChild(toast);

        setTimeout(() => {
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(10px)';
            toast.style.transition = 'all 0.3s ease';
            setTimeout(() => toast.remove(), 300);
        }, 3500);
    }

    function getCurrentActor() {
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getCurrentUser === 'function') {
            const user = window.BMW_AUTH_GUARD.getCurrentUser();
            if (user) {
                return {
                    username: user.username,
                    role: user.role,
                    fullName: user.fullName || user.username
                };
            }
        }
        return { username: 'admin', role: 'admin', fullName: 'Administrator' };
    }

    // ── 5. Data Loading & Metrics ───────────────────────────────────────────
    function loadData() {
        if (window.BMW_PROMOTIONS_API && typeof window.BMW_PROMOTIONS_API.getPromotions === 'function') {
            allPromotions = window.BMW_PROMOTIONS_API.getPromotions();
        } else {
            try {
                allPromotions = JSON.parse(localStorage.getItem('bmw_promotions')) || [];
            } catch (e) {
                allPromotions = [];
            }
        }
    }

    function renderMetrics() {
        const total = allPromotions.length;
        let activeCount = 0;
        let totalUsed = 0;
        let totalRemaining = 0;

        allPromotions.forEach(p => {
            const status = p.status || (window.BMW_PROMOTIONS_API ? window.BMW_PROMOTIONS_API.computePromotionStatus(p) : 'ACTIVE');
            if (status === 'ACTIVE') {
                activeCount++;
            }
            const used = parseInt(p.usedCount, 10) || 0;
            const limit = parseInt(p.usageLimit, 10) || 0;
            totalUsed += used;
            totalRemaining += Math.max(0, limit - used);
        });

        if (statTotalPromos) statTotalPromos.textContent = total;
        if (statActivePromos) statActivePromos.textContent = activeCount;
        if (statUsedPromos) statUsedPromos.textContent = totalUsed;
        if (statRemainingPromos) statRemainingPromos.textContent = totalRemaining;
    }

    // ── 6. Filtering & Table Rendering ──────────────────────────────────────
    function applyFilters() {
        const query = searchQuery.trim().toLowerCase();

        filteredPromotions = allPromotions.filter(p => {
            const status = p.status || 'ACTIVE';
            const type = p.type || 'STANDARD';

            // Filter by status
            if (currentFilterStatus !== 'ALL') {
                if (status !== currentFilterStatus) return false;
            }

            // Filter by type
            if (currentFilterType !== 'ALL') {
                if (type !== currentFilterType) return false;
            }

            // Search query
            if (query) {
                const nameMatch = (p.name || '').toLowerCase().includes(query);
                const codeMatch = (p.code || '').toLowerCase().includes(query);
                const descMatch = (p.description || '').toLowerCase().includes(query);
                if (!nameMatch && !codeMatch && !descMatch) return false;
            }

            return true;
        });

        currentPage = 1;
        renderTable();
    }

    function renderTable() {
        if (!promoTableBody) return;

        if (filteredPromotions.length === 0) {
            promoTableBody.innerHTML = '';
            if (promoTableEmpty) promoTableEmpty.style.display = 'block';
            if (promoPagination) promoPagination.style.display = 'none';
            return;
        }

        if (promoTableEmpty) promoTableEmpty.style.display = 'none';
        if (promoPagination) promoPagination.style.display = 'flex';

        // Pagination slice
        const totalItems = filteredPromotions.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredPromotions.slice(startIndex, startIndex + PAGE_SIZE);

        let rowsHtml = '';
        pageItems.forEach(p => {
            const code = p.code || 'N/A';
            const name = p.name || 'Không có tên';
            const type = p.type || 'STANDARD';
            const discount = p.discountPercent || 0;
            const scope = p.scope || 'ALL';
            const category = p.category || 'ALL';
            const usageLimit = parseInt(p.usageLimit, 10) || 0;
            const usedCount = parseInt(p.usedCount, 10) || 0;
            const remaining = Math.max(0, usageLimit - usedCount);
            const usagePercent = usageLimit > 0 ? Math.min(100, Math.round((usedCount / usageLimit) * 100)) : 0;
            const startDateStr = formatDateShort(p.startDate);
            const endDateStr = formatDateShort(p.endDate);
            const status = p.status || 'ACTIVE';
            const isActive = p.isActive !== false;

            // Type badge class & text
            let typeBadgeClass = 'type-standard';
            let typeLabel = 'Thông dụng';
            if (type === 'SPECIAL') {
                typeBadgeClass = 'type-special';
                typeLabel = 'Đặc biệt (VIP)';
            } else if (type === 'LIMITED') {
                typeBadgeClass = 'type-limited';
                typeLabel = 'Giới hạn';
            }

            // Status badge class & text
            let statusBadgeClass = 'active';
            let statusLabel = 'Đang hiệu lực';
            if (status === 'UPCOMING') {
                statusBadgeClass = 'upcoming';
                statusLabel = 'Sắp diễn ra';
            } else if (status === 'EXPIRED') {
                statusBadgeClass = 'expired';
                statusLabel = 'Hết hiệu lực';
            } else if (status === 'OUT_OF_STOCK') {
                statusBadgeClass = 'out_of_stock';
                statusLabel = 'Hết lượt dùng';
            } else if (status === 'DISABLED') {
                statusBadgeClass = 'disabled';
                statusLabel = 'Đã tắt';
            } else if (status === 'DRAFT') {
                statusBadgeClass = 'draft';
                statusLabel = 'Bản nháp';
            }

            // Scope badge text
            const scopeLabel = scope === 'CATEGORY'
                ? `<span style="font-size:12px; font-weight:600; color:var(--accent-blue);">Danh mục: ${escapeHtml(category)}</span>`
                : `<span style="font-size:12px; color:var(--text-muted);">Toàn bộ sản phẩm</span>`;

            rowsHtml += `
                <tr data-promo-id="${escapeHtml(p.id)}">
                    <td>
                        <div style="display:flex; flex-direction:column; gap:4px;">
                            <div style="display:flex; align-items:center; gap:8px;">
                                <span class="code-pill" title="Click để sao chép mã" onclick="window.BMW_ADMIN_PROMOS.copyPromoCode('${escapeHtml(code)}')">
                                    ${escapeHtml(code)}
                                    <svg viewBox="0 0 24 24" style="width:12px; height:12px; stroke:currentColor; fill:none; stroke-width:2;"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                                </span>
                                <span class="type-badge ${typeBadgeClass}">${typeLabel}</span>
                            </div>
                            <strong style="font-size:14px; margin-top:2px;">${escapeHtml(name)}</strong>
                            ${p.description ? `<span style="font-size:12px; color:var(--text-muted);">${escapeHtml(p.description)}</span>` : ''}
                        </div>
                    </td>
                    <td>
                        <span style="font-size:16px; font-weight:800; color:#ef4444;">-${discount}%</span>
                    </td>
                    <td>
                        ${scopeLabel}
                    </td>
                    <td style="min-width: 140px;">
                        <div style="font-size:13px; font-weight:600;">
                            ${usedCount} / ${usageLimit} <span style="font-size:11px; font-weight:normal; color:var(--text-muted);">(Còn ${remaining})</span>
                        </div>
                        <div class="progress-bar-wrap" title="${usagePercent}% đã sử dụng">
                            <div class="progress-bar-fill" style="width: ${usagePercent}%; background: ${usagePercent >= 100 ? '#ef4444' : 'var(--accent-blue, #2563eb)'};"></div>
                        </div>
                    </td>
                    <td>
                        <div style="font-size:12px; line-height:1.4;">
                            <div>Từ: <strong>${startDateStr}</strong></div>
                            <div>Đến: <strong>${endDateStr}</strong></div>
                        </div>
                    </td>
                    <td>
                        <span class="status-badge ${statusBadgeClass}">
                            <span style="width:6px; height:6px; border-radius:50%; background:currentColor;"></span>
                            ${statusLabel}
                        </span>
                    </td>
                    <td style="text-align: right;">
                        <div style="display:inline-flex; gap:6px;">
                            <button class="btn-action" title="${isActive ? 'Tắt mã' : 'Bật mã'}" onclick="window.BMW_ADMIN_PROMOS.toggleActive('${escapeHtml(p.id)}')">
                                ${isActive ? 'Tắt' : 'Bật'}
                            </button>
                            <button class="btn-action" title="Sửa thông tin" onclick="window.BMW_ADMIN_PROMOS.openEditModal('${escapeHtml(p.id)}')">
                                Sửa
                            </button>
                            <button class="btn-action" title="Kết thúc sớm" onclick="window.BMW_ADMIN_PROMOS.endPromoEarly('${escapeHtml(p.id)}')">
                                Kết thúc
                            </button>
                            <button class="btn-action danger" title="Xóa mã" onclick="window.BMW_ADMIN_PROMOS.confirmDelete('${escapeHtml(p.id)}')">
                                Xóa
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        promoTableBody.innerHTML = rowsHtml;
        renderPagination(totalItems, totalPages);
    }

    function renderPagination(totalItems, totalPages) {
        if (!promoPaginationInfo || !promoPaginationBtns) return;

        const start = (currentPage - 1) * PAGE_SIZE + 1;
        const end = Math.min(currentPage * PAGE_SIZE, totalItems);
        promoPaginationInfo.textContent = `Hiển thị ${start}–${end} trên ${totalItems} chương trình`;

        let btnsHtml = '';

        btnsHtml += `
            <button class="page-btn ${currentPage === 1 ? 'disabled' : ''}" 
                    ${currentPage === 1 ? 'disabled' : ''} 
                    onclick="window.BMW_ADMIN_PROMOS.goToPage(${currentPage - 1})">
                &laquo;
            </button>
        `;

        for (let i = 1; i <= totalPages; i++) {
            btnsHtml += `
                <button class="page-btn ${i === currentPage ? 'active' : ''}" 
                        onclick="window.BMW_ADMIN_PROMOS.goToPage(${i})">
                    ${i}
                </button>
            `;
        }

        btnsHtml += `
            <button class="page-btn ${currentPage === totalPages ? 'disabled' : ''}" 
                    ${currentPage === totalPages ? 'disabled' : ''} 
                    onclick="window.BMW_ADMIN_PROMOS.goToPage(${currentPage + 1})">
                &raquo;
            </button>
        `;

        promoPaginationBtns.innerHTML = btnsHtml;
    }

    function escapeHtml(str) {
        if (str === null || str === undefined) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    // ── 7. Modals: Create, Edit & Confirm ───────────────────────────────────
    function openCreateModal() {
        if (!modalCreatePromo) return;

        // Reset form
        formCreatePromo.reset();
        clearCreateErrors();

        // Auto-generate a valid 6-character code
        if (window.BMW_PROMOTIONS_API && typeof window.BMW_PROMOTIONS_API.generateCouponCode === 'function') {
            inputPromoCode.value = window.BMW_PROMOTIONS_API.generateCouponCode();
        }

        // Set default dates: today to +30 days
        const today = new Date();
        const future = new Date();
        future.setDate(today.getDate() + 30);
        inputPromoStartDate.value = toInputDateString(today);
        inputPromoEndDate.value = toInputDateString(future);

        // Hide category selection initially
        if (promoCategoryBox) promoCategoryBox.style.display = 'none';

        modalCreatePromo.classList.add('active');
        modalCreatePromo.setAttribute('aria-hidden', 'false');
    }

    function closeCreateModal() {
        if (!modalCreatePromo) return;
        modalCreatePromo.classList.remove('active');
        modalCreatePromo.setAttribute('aria-hidden', 'true');
    }

    function clearCreateErrors() {
        [errPromoName, errPromoCode, errPromoDiscount, errPromoUsage, errPromoEndDate].forEach(el => {
            if (el) {
                el.textContent = '';
                el.style.display = 'none';
            }
        });
    }

    function handleCreateSubmit(e) {
        e.preventDefault();
        clearCreateErrors();

        const name = (inputPromoName.value || '').trim();
        const code = (inputPromoCode.value || '').trim().toUpperCase();
        const type = selectPromoType.value;
        const discount = parseFloat(inputPromoDiscount.value);
        const usageLimit = parseInt(inputPromoUsageLimit.value, 10);
        const scope = selectPromoScope.value;
        const category = selectPromoCategory.value;
        const startDate = inputPromoStartDate.value;
        const endDate = inputPromoEndDate.value;
        const desc = (textareaPromoDesc.value || '').trim();

        let hasError = false;

        if (!name) {
            errPromoName.textContent = 'Vui lòng nhập tên chương trình.';
            errPromoName.style.display = 'block';
            hasError = true;
        }

        if (!code) {
            errPromoCode.textContent = 'Vui lòng nhập hoặc tự sinh mã coupon.';
            errPromoCode.style.display = 'block';
            hasError = true;
        } else if (window.BMW_PROMOTIONS_API && !window.BMW_PROMOTIONS_API.isValidCouponFormat(code)) {
            errPromoCode.textContent = 'Mã phải đúng chuẩn 6 ký tự gồm 4 chữ cái A-Z và 2 số 0-9 (VD: AB12CD).';
            errPromoCode.style.display = 'block';
            hasError = true;
        } else {
            // Check duplicate
            const existing = allPromotions.find(p => p.code && p.code.toUpperCase() === code);
            if (existing) {
                errPromoCode.textContent = 'Mã coupon này đã tồn tại trong hệ thống. Vui lòng chọn mã khác.';
                errPromoCode.style.display = 'block';
                hasError = true;
            }
        }

        if (isNaN(discount) || discount <= 0 || discount > 100) {
            errPromoDiscount.textContent = 'Mức giảm phải lớn hơn 0% và không vượt quá 100%.';
            errPromoDiscount.style.display = 'block';
            hasError = true;
        }

        if (isNaN(usageLimit) || usageLimit <= 0) {
            errPromoUsage.textContent = 'Số lượng phát hành phải là số nguyên dương lớn hơn 0.';
            errPromoUsage.style.display = 'block';
            hasError = true;
        }

        if (!startDate || !endDate) {
            errPromoEndDate.textContent = 'Vui lòng chọn ngày bắt đầu và kết thúc.';
            errPromoEndDate.style.display = 'block';
            hasError = true;
        } else {
            const startD = new Date(startDate);
            const endD = new Date(endDate);
            if (endD.getTime() < startD.getTime()) {
                errPromoEndDate.textContent = 'Ngày kết thúc không được trước ngày bắt đầu.';
                errPromoEndDate.style.display = 'block';
                hasError = true;
            }
        }

        if (hasError) return;

        const actor = getCurrentActor();
        const payload = {
            name,
            code,
            type,
            discountPercent: discount,
            usageLimit,
            scope,
            category: scope === 'CATEGORY' ? category : 'ALL',
            startDate,
            endDate,
            description: desc,
            isActive: true
        };

        const res = window.BMW_PROMOTIONS_API.createPromotion(payload, actor);
        if (res && res.success) {
            showToast(`Đã tạo thành công chương trình "${name}" với mã "${code}"!`, 'success');
            closeCreateModal();
            loadData();
            renderMetrics();
            applyFilters();
        } else {
            showToast((res && res.message) || 'Lỗi khi tạo chương trình khuyến mãi.', 'danger');
        }
    }

    function openEditModal(promoId) {
        const promo = allPromotions.find(p => String(p.id) === String(promoId));
        if (!promo) return;

        editPromoId.value = promo.id;
        editPromoName.value = promo.name || '';
        editPromoCode.value = promo.code || '';
        editPromoType.value = promo.type || 'STANDARD';
        editPromoDiscount.value = promo.discountPercent || 10;
        editPromoUsageLimit.value = promo.usageLimit || 100;
        editPromoStartDate.value = toInputDateString(promo.startDate);
        editPromoEndDate.value = toInputDateString(promo.endDate);
        editPromoDesc.value = promo.description || '';
        editPromoIsActive.checked = promo.isActive !== false;

        modalEditPromo.classList.add('active');
        modalEditPromo.setAttribute('aria-hidden', 'false');
    }

    function closeEditModal() {
        if (!modalEditPromo) return;
        modalEditPromo.classList.remove('active');
        modalEditPromo.setAttribute('aria-hidden', 'true');
    }

    function handleEditSubmit(e) {
        e.preventDefault();

        const id = editPromoId.value;
        const name = (editPromoName.value || '').trim();
        const type = editPromoType.value;
        const discount = parseFloat(editPromoDiscount.value);
        const usageLimit = parseInt(editPromoUsageLimit.value, 10);
        const startDate = editPromoStartDate.value;
        const endDate = editPromoEndDate.value;
        const desc = (editPromoDesc.value || '').trim();
        const isActive = editPromoIsActive.checked;

        if (!name) {
            showToast('Tên chương trình không được để trống.', 'danger');
            return;
        }

        if (isNaN(discount) || discount <= 0 || discount > 100) {
            showToast('Mức giảm phải từ 1% đến 100%.', 'danger');
            return;
        }

        if (isNaN(usageLimit) || usageLimit <= 0) {
            showToast('Hạn mức phát hành phải là số nguyên dương.', 'danger');
            return;
        }

        const startD = new Date(startDate);
        const endD = new Date(endDate);
        if (endD.getTime() < startD.getTime()) {
            showToast('Ngày kết thúc không được trước ngày bắt đầu.', 'danger');
            return;
        }

        const actor = getCurrentActor();
        const res = window.BMW_PROMOTIONS_API.updatePromotion(id, {
            name,
            type,
            discountPercent: discount,
            usageLimit,
            startDate,
            endDate,
            description: desc,
            isActive
        }, actor);

        if (res && res.success) {
            showToast(`Đã cập nhật khuyến mãi "${name}".`, 'success');
            closeEditModal();
            loadData();
            renderMetrics();
            renderTable();
        } else {
            showToast((res && res.message) || 'Lỗi khi cập nhật.', 'danger');
        }
    }

    function toggleActive(promoId) {
        const actor = getCurrentActor();
        const res = window.BMW_PROMOTIONS_API.togglePromotionActive(promoId, actor);
        if (res && res.success) {
            showToast(`Đã ${res.isActive ? 'bật' : 'tắt'} chương trình.`, 'info');
            loadData();
            renderMetrics();
            renderTable();
        } else {
            showToast((res && res.message) || 'Không thể đổi trạng thái.', 'danger');
        }
    }

    function endPromoEarly(promoId) {
        const promo = allPromotions.find(p => String(p.id) === String(promoId));
        if (!promo) return;

        openConfirmModal(
            'Kết Thúc Sớm Khuyến Mãi',
            `Bạn có chắc chắn muốn kết thúc sớm chương trình <strong>"${escapeHtml(promo.name)}" (${escapeHtml(promo.code)})</strong> ngay lập tức? Khách hàng sẽ không thể tiếp tục áp dụng mã này.`,
            () => {
                const actor = getCurrentActor();
                const res = window.BMW_PROMOTIONS_API.endPromotion(promoId, actor);
                if (res && res.success) {
                    showToast(`Đã kết thúc sớm mã "${promo.code}".`, 'success');
                    loadData();
                    renderMetrics();
                    renderTable();
                } else {
                    showToast('Không thể kết thúc chương trình.', 'danger');
                }
            }
        );
    }

    function confirmDelete(promoId) {
        const promo = allPromotions.find(p => String(p.id) === String(promoId));
        if (!promo) return;

        const used = parseInt(promo.usedCount, 10) || 0;
        let warningText = '';
        if (used > 0) {
            warningText = `<br><span style="color:#ef4444; font-size:12px;">Chú ý: Mã này đã được sử dụng ${used} lần trong các đơn hàng trước đây. Các đơn cũ vẫn sẽ bảo lưu dữ liệu giảm giá đã ghi nhận.</span>`;
        }

        openConfirmModal(
            'Xóa Chương Trình Khuyến Mãi',
            `Bạn có chắc chắn muốn xóa mã <strong>"${escapeHtml(promo.code)}"</strong> — <em>"${escapeHtml(promo.name)}"</em>?${warningText}`,
            () => {
                const actor = getCurrentActor();
                const res = window.BMW_PROMOTIONS_API.deletePromotion(promoId, actor);
                if (res && res.success) {
                    showToast(`Đã xóa thành công mã "${promo.code}".`, 'info');
                    loadData();
                    renderMetrics();
                    applyFilters();
                } else {
                    showToast('Không thể xóa mã.', 'danger');
                }
            }
        );
    }

    function openConfirmModal(title, messageHtml, onConfirmCallback) {
        if (!modalConfirm) return;
        if (confirmModalTitle) confirmModalTitle.textContent = title;
        if (confirmModalMessage) confirmModalMessage.innerHTML = messageHtml;
        pendingConfirmAction = onConfirmCallback;
        modalConfirm.classList.add('active');
        modalConfirm.setAttribute('aria-hidden', 'false');
    }

    function closeConfirmModal() {
        if (!modalConfirm) return;
        modalConfirm.classList.remove('active');
        modalConfirm.setAttribute('aria-hidden', 'true');
        pendingConfirmAction = null;
    }

    function copyPromoCode(code) {
        if (!code) return;
        if (navigator.clipboard && navigator.clipboard.writeText) {
            navigator.clipboard.writeText(code).then(() => {
                showToast(`Đã sao chép mã "${code}" vào clipboard!`, 'success');
            }).catch(() => {
                fallbackCopy(code);
            });
        } else {
            fallbackCopy(code);
        }
    }

    function fallbackCopy(text) {
        const temp = document.createElement('textarea');
        temp.value = text;
        document.body.appendChild(temp);
        temp.select();
        try {
            document.execCommand('copy');
            showToast(`Đã sao chép mã "${text}"!`, 'success');
        } catch (err) {
            showToast(`Mã coupon: ${text}`, 'info');
        }
        document.body.removeChild(temp);
    }

    // ── 8. Initialization & Event Binding ───────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        // Populate sidebar & topbar user
        const currentUser = getCurrentActor();
        if (sidebarUserName) sidebarUserName.textContent = currentUser.fullName || currentUser.username;
        if (sidebarUserAvatar) sidebarUserAvatar.textContent = (currentUser.fullName || currentUser.username || 'A')[0].toUpperCase();
        if (topbarUserAvatar) topbarUserAvatar.textContent = (currentUser.fullName || currentUser.username || 'A')[0].toUpperCase();

        // Responsive sidebar collapse / mobile toggle
        if (collapseBtn && layoutEl) {
            collapseBtn.addEventListener('click', () => {
                layoutEl.classList.toggle('sidebar-collapsed');
            });
        }

        if (mobileToggleBtn && layoutEl) {
            mobileToggleBtn.addEventListener('click', () => {
                layoutEl.classList.toggle('mobile-open');
            });
        }

        if (backdropEl && layoutEl) {
            backdropEl.addEventListener('click', () => {
                layoutEl.classList.remove('mobile-open');
            });
        }

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.logoutUser === 'function') {
                    window.BMW_AUTH_GUARD.logoutUser();
                } else {
                    localStorage.removeItem('bmw_current_user');
                    window.location.href = 'login.html';
                }
            });
        }

        // Scope change listener
        if (selectPromoScope && promoCategoryBox) {
            selectPromoScope.addEventListener('change', () => {
                if (selectPromoScope.value === 'CATEGORY') {
                    promoCategoryBox.style.display = 'block';
                } else {
                    promoCategoryBox.style.display = 'none';
                }
            });
        }

        // Auto-generate code button
        if (btnAutoGenCode && inputPromoCode) {
            btnAutoGenCode.addEventListener('click', () => {
                if (window.BMW_PROMOTIONS_API && typeof window.BMW_PROMOTIONS_API.generateCouponCode === 'function') {
                    inputPromoCode.value = window.BMW_PROMOTIONS_API.generateCouponCode();
                    showToast(`Đã sinh mã mới: ${inputPromoCode.value}`, 'info');
                }
            });
        }

        // Create Modal Events
        if (btnOpenCreatePromo) btnOpenCreatePromo.addEventListener('click', openCreateModal);
        if (btnCloseCreatePromo) btnCloseCreatePromo.addEventListener('click', closeCreateModal);
        if (btnCancelCreatePromo) btnCancelCreatePromo.addEventListener('click', closeCreateModal);
        if (formCreatePromo) formCreatePromo.addEventListener('submit', handleCreateSubmit);

        // Edit Modal Events
        if (btnCloseEditPromo) btnCloseEditPromo.addEventListener('click', closeEditModal);
        if (btnCancelEditPromo) btnCancelEditPromo.addEventListener('click', closeEditModal);
        if (formEditPromo) formEditPromo.addEventListener('submit', handleEditSubmit);

        // Confirm Modal Events
        if (btnCloseConfirm) btnCloseConfirm.addEventListener('click', closeConfirmModal);
        if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', closeConfirmModal);
        if (btnConfirmAccept) {
            btnConfirmAccept.addEventListener('click', () => {
                if (typeof pendingConfirmAction === 'function') {
                    pendingConfirmAction();
                }
                closeConfirmModal();
            });
        }

        // Filter & Search Events
        if (filterStatusSelect) {
            filterStatusSelect.addEventListener('change', () => {
                currentFilterStatus = filterStatusSelect.value;
                applyFilters();
            });
        }

        if (filterTypeSelect) {
            filterTypeSelect.addEventListener('change', () => {
                currentFilterType = filterTypeSelect.value;
                applyFilters();
            });
        }

        if (filterSearchInput) {
            let searchTimeout;
            filterSearchInput.addEventListener('input', () => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    searchQuery = filterSearchInput.value;
                    applyFilters();
                }, 250);
            });
        }

        // Initial Data Load & Render
        loadData();
        renderMetrics();
        applyFilters();
    });

    // ── 9. Expose functions to window for onclick handlers ───────────────────
    window.BMW_ADMIN_PROMOS = {
        goToPage: function (page) {
            currentPage = page;
            renderTable();
        },
        copyPromoCode,
        openEditModal,
        toggleActive,
        endPromoEarly,
        confirmDelete
    };

})();
