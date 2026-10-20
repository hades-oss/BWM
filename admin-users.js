/**
 * js/admin-users.js — BMW GYM Admin Account Management Logic (Phase 8.5)
 * CRUD, RBAC, Granular Staff Permissions, Safe Deactivation, Session Invalidation & Audit Logging
 */

(function () {
    'use strict';

    // ── 1. RBAC Guard: Require Admin Role ──────────────────────────────────
    if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.requireRole === 'function') {
        const hasAccess = window.BMW_AUTH_GUARD.requireRole(['admin'], 'index.html');
        if (!hasAccess) return;
    }

    // ── 2. State & Variables ────────────────────────────────────────────────
    let allUsers = [];
    let allOrders = [];
    let allAuditLogs = [];
    let filteredUsers = [];
    let currentTab = 'customers'; // 'customers' | 'staff' | 'audit'
    let currentFilterStatus = 'ALL';
    let searchQuery = '';
    let auditSearchQuery = '';
    let currentPage = 1;
    const PAGE_SIZE = 6;

    // Pending Action State for Confirm Modal
    let pendingConfirmAction = null;

    // ── 3. DOM Elements ─────────────────────────────────────────────────────
    const layoutEl = document.getElementById('dash-layout');
    const collapseBtn = document.getElementById('sidebar-collapse-btn');
    const mobileToggleBtn = document.getElementById('sidebar-mobile-toggle');
    const backdropEl = document.getElementById('dash-backdrop');
    const logoutBtn = document.getElementById('logout-btn');

    // Sidebar & Topbar User Info
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');

    // KPI Metrics
    const statTotalUsers = document.getElementById('stat-total-users');
    const statCustomersCount = document.getElementById('stat-customers-count');
    const statCustomersSub = document.getElementById('stat-customers-sub');
    const statStaffCount = document.getElementById('stat-staff-count');
    const statStaffSub = document.getElementById('stat-staff-sub');
    const statLockedCount = document.getElementById('stat-locked-count');

    // Tabs
    const tabBtns = document.querySelectorAll('.dash-tab-btn');
    const tabUsersView = document.getElementById('tab-users-view');
    const tabAuditPane = document.getElementById('tab-audit-pane');
    const usersTabTitle = document.getElementById('users-tab-title');

    // Table & Filters
    const filterUserStatus = document.getElementById('filter-user-status');
    const filterUserSearch = document.getElementById('filter-user-search');
    const usersTableBody = document.getElementById('users-table-body');
    const usersTableEmpty = document.getElementById('users-table-empty');
    const usersPagination = document.getElementById('users-pagination');
    const usersPaginationInfo = document.getElementById('users-pagination-info');
    const usersPaginationBtns = document.getElementById('users-pagination-btns');

    // Audit Table & Search
    const filterAuditSearch = document.getElementById('filter-audit-search');
    const auditTableBody = document.getElementById('audit-table-body');
    const auditTableEmpty = document.getElementById('audit-table-empty');

    // Modals
    const btnOpenCreateStaff = document.getElementById('btn-open-create-staff');
    const modalCreateStaff = document.getElementById('modal-create-staff');
    const btnCloseCreateStaff = document.getElementById('btn-close-create-staff');
    const btnCancelCreateStaff = document.getElementById('btn-cancel-create-staff');
    const formCreateStaff = document.getElementById('form-create-staff');

    const modalViewUser = document.getElementById('modal-view-user');
    const btnCloseViewUser = document.getElementById('btn-close-view-user');
    const btnCloseViewUserFooter = document.getElementById('btn-close-view-user-footer');

    const modalEditUser = document.getElementById('modal-edit-user');
    const btnCloseEditUser = document.getElementById('btn-close-edit-user');
    const btnCancelEditUser = document.getElementById('btn-cancel-edit-user');
    const formEditUser = document.getElementById('form-edit-user');
    const editInputRole = document.getElementById('edit-input-role');
    const editStaffPermsBox = document.getElementById('edit-staff-perms-box');

    const modalConfirm = document.getElementById('modal-confirm');
    const btnCloseConfirm = document.getElementById('btn-close-confirm');
    const btnConfirmCancel = document.getElementById('btn-confirm-cancel');
    const btnConfirmAccept = document.getElementById('btn-confirm-accept');
    const confirmModalTitle = document.getElementById('confirm-modal-title');
    const confirmModalMessage = document.getElementById('confirm-modal-message');
    const confirmModalExtra = document.getElementById('confirm-modal-extra');

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

    // ── 5. Data Loading & KPI Metrics ───────────────────────────────────────
    function loadData() {
        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getUsers === 'function') {
            allUsers = window.BMW_AUTH_GUARD.getUsers();
        } else {
            try {
                allUsers = JSON.parse(localStorage.getItem('bmw_users')) || [];
            } catch (e) { allUsers = []; }
        }

        if (window.BMW_ORDERS_API && typeof window.BMW_ORDERS_API.getOrders === 'function') {
            allOrders = window.BMW_ORDERS_API.getOrders();
        } else {
            try {
                allOrders = JSON.parse(localStorage.getItem('bmw_orders')) || [];
            } catch (e) { allOrders = []; }
        }

        if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.getAuditLogs === 'function') {
            allAuditLogs = window.BMW_AUTH_GUARD.getAuditLogs();
        } else {
            try {
                allAuditLogs = JSON.parse(localStorage.getItem('bmw_audit_logs')) || [];
            } catch (e) { allAuditLogs = []; }
        }
    }

    function renderMetrics() {
        const total = allUsers.length;
        const customers = allUsers.filter(u => u.role === 'customer').length;
        const staff = allUsers.filter(u => u.role === 'staff' || u.role === 'admin').length;
        const locked = allUsers.filter(u => u.status === 'locked' || u.status === 'banned').length;

        if (statTotalUsers) statTotalUsers.textContent = total;
        if (statCustomersCount) statCustomersCount.textContent = customers;
        if (statStaffCount) statStaffCount.textContent = staff;
        if (statLockedCount) statLockedCount.textContent = locked;

        if (statCustomersSub) {
            const customerOrders = allOrders.length;
            statCustomersSub.textContent = `${customerOrders} đơn hàng toàn hệ thống`;
        }
        if (statStaffSub) {
            const admins = allUsers.filter(u => u.role === 'admin').length;
            const regularStaff = allUsers.filter(u => u.role === 'staff').length;
            statStaffSub.textContent = `${admins} Admin, ${regularStaff} Staff`;
        }
    }

    // ── 6. Filter & Render Users Table ──────────────────────────────────────
    function applyUserFilters() {
        filteredUsers = allUsers.filter(u => {
            // Tab condition
            if (currentTab === 'customers') {
                if (u.role !== 'customer') return false;
            } else if (currentTab === 'staff') {
                if (u.role !== 'staff' && u.role !== 'admin') return false;
            }

            // Status filter
            if (currentFilterStatus !== 'ALL') {
                if (currentFilterStatus === 'locked' && (u.status !== 'locked' && u.status !== 'banned')) {
                    return false;
                }
                if (currentFilterStatus === 'active' && u.status !== 'active') {
                    return false;
                }
            }

            // Search query
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchName = u.fullName && u.fullName.toLowerCase().includes(q);
                const matchUser = u.username && u.username.toLowerCase().includes(q);
                const matchEmail = u.email && u.email.toLowerCase().includes(q);
                const matchPhone = u.phone && u.phone.toLowerCase().includes(q);
                const matchGmail = u.linkedGmail && u.linkedGmail.email && u.linkedGmail.email.toLowerCase().includes(q);
                if (!matchName && !matchUser && !matchEmail && !matchPhone && !matchGmail) {
                    return false;
                }
            }

            return true;
        });

        currentPage = 1;
        renderUsersTable();
    }

    function getUserOrderStats(user) {
        if (!user) return { count: 0, totalAmount: 0, orders: [] };
        const orders = allOrders.filter(o => {
            if (!o) return false;
            const matchesId = user.id && o.userId && String(o.userId) === String(user.id);
            const matchesAccount = user.username && o.userAccount && o.userAccount.toLowerCase() === user.username.toLowerCase();
            return matchesId || matchesAccount;
        });

        const totalAmount = orders.reduce((sum, o) => sum + (Number(o.finalTotal || o.totalAmount || 0)), 0);
        return {
            count: orders.length,
            totalAmount: totalAmount,
            orders: orders
        };
    }

    function renderUsersTable() {
        if (!usersTableBody) return;
        usersTableBody.innerHTML = '';

        if (filteredUsers.length === 0) {
            if (usersTableEmpty) usersTableEmpty.style.display = 'block';
            if (usersPagination) usersPagination.style.display = 'none';
            return;
        }

        if (usersTableEmpty) usersTableEmpty.style.display = 'none';
        if (usersPagination) usersPagination.style.display = 'flex';

        const totalItems = filteredUsers.length;
        const totalPages = Math.ceil(totalItems / PAGE_SIZE);
        if (currentPage > totalPages) currentPage = totalPages || 1;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const endIndex = Math.min(startIndex + PAGE_SIZE, totalItems);
        const pageUsers = filteredUsers.slice(startIndex, endIndex);

        pageUsers.forEach(user => {
            const tr = document.createElement('tr');

            // Avatar initial or img
            const initial = (user.fullName || user.username || 'U').charAt(0).toUpperCase();
            const avatarHtml = user.avatar
                ? `<img src="${user.avatar}" alt="${user.username}">`
                : initial;

            // Gmail linked badge
            const gmailBadgeHtml = user.linkedGmail && user.linkedGmail.email
                ? `<span class="gmail-linked-badge" title="Gmail liên kết: ${user.linkedGmail.email}">🔗 ${user.linkedGmail.email}</span>`
                : '';

            // Role Pill
            const roleClass = user.role === 'admin' ? 'admin' : (user.role === 'staff' ? 'staff' : 'customer');
            const roleLabel = user.role === 'admin' ? 'Admin' : (user.role === 'staff' ? 'Staff' : 'Customer');

            // Status Pill
            const isLocked = user.status === 'locked' || user.status === 'banned';
            const statusClass = isLocked ? 'locked' : 'active';
            const statusLabel = isLocked ? 'Đã khóa' : 'Hoạt động';

            // Orders stats
            const orderStats = getUserOrderStats(user);
            const ordersDisplay = orderStats.count > 0
                ? `<strong style="color: var(--accent-blue);">${orderStats.count} đơn</strong> <br><small style="color: var(--text-muted);">${formatVND(orderStats.totalAmount)}</small>`
                : `<span style="color: var(--text-muted); font-size: 12px;">Chưa có</span>`;

            // Action Buttons
            const lockIcon = isLocked
                ? `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Mở khóa`
                : `<svg viewBox="0 0 24 24" style="width:14px;height:14px;stroke:currentColor;fill:none;stroke-width:2;"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg> Khóa`;

            tr.innerHTML = `
                <td>
                    <div class="user-cell">
                        <div class="user-cell-avatar">${avatarHtml}</div>
                        <div class="user-cell-info">
                            <span class="user-cell-name">${user.fullName || 'Chưa cập nhật'}</span>
                            <span class="user-cell-handle">@${user.username}</span>
                            ${gmailBadgeHtml}
                        </div>
                    </div>
                </td>
                <td>
                    <div>${user.email || 'N/A'}</div>
                    <div style="font-size: 12px; color: var(--text-muted);">${user.phone || 'Chưa có SĐT'}</div>
                </td>
                <td>
                    <span class="role-pill ${roleClass}">${roleLabel}</span>
                    ${user.role === 'staff' && Array.isArray(user.permissions) ? `<div style="margin-top: 4px; font-size: 10px; color: var(--text-muted);">${user.permissions.length} quyền cấp</div>` : ''}
                </td>
                <td>
                    <span class="status-pill ${statusClass}">${statusLabel}</span>
                </td>
                <td>${ordersDisplay}</td>
                <td><small>${formatDate(user.createdAt)}</small></td>
                <td style="text-align: right;">
                    <div style="display: inline-flex; gap: 6px;">
                        <button class="btn-action" data-action="view" data-id="${user.id}" title="Xem chi tiết hồ sơ & lịch sử đơn">
                            Xem
                        </button>
                        <button class="btn-action" data-action="edit" data-id="${user.id}" title="Sửa thông tin & phân quyền">
                            Sửa
                        </button>
                        <button class="btn-action ${isLocked ? 'success' : ''}" data-action="toggle-lock" data-id="${user.id}" title="${isLocked ? 'Mở khóa tài khoản' : 'Khóa tài khoản'}">
                            ${lockIcon}
                        </button>
                        <button class="btn-action danger" data-action="safe-delete" data-id="${user.id}" title="Xóa hoặc Vô hiệu hóa tài khoản">
                            Xóa
                        </button>
                    </div>
                </td>
            `;

            usersTableBody.appendChild(tr);
        });

        // Pagination info
        if (usersPaginationInfo) {
            usersPaginationInfo.textContent = `Hiển thị ${startIndex + 1}–${endIndex} trên tổng số ${totalItems} tài khoản`;
        }

        renderPaginationControls(totalPages);
    }

    function renderPaginationControls(totalPages) {
        if (!usersPaginationBtns) return;
        usersPaginationBtns.innerHTML = '';

        if (totalPages <= 1) return;

        // Prev btn
        const prevBtn = document.createElement('button');
        prevBtn.className = `btn-page ${currentPage === 1 ? 'disabled' : ''}`;
        prevBtn.id = 'btn-users-prev';
        prevBtn.innerHTML = '&lsaquo; Trước';
        prevBtn.disabled = currentPage === 1;
        usersPaginationBtns.appendChild(prevBtn);

        // Page numbers
        for (let i = 1; i <= totalPages; i++) {
            const pageBtn = document.createElement('button');
            pageBtn.className = `btn-page ${i === currentPage ? 'active' : ''}`;
            pageBtn.setAttribute('data-page', i);
            pageBtn.textContent = i;
            usersPaginationBtns.appendChild(pageBtn);
        }

        // Next btn
        const nextBtn = document.createElement('button');
        nextBtn.className = `btn-page ${currentPage === totalPages ? 'disabled' : ''}`;
        nextBtn.id = 'btn-users-next';
        nextBtn.innerHTML = 'Sau &rsaquo;';
        nextBtn.disabled = currentPage === totalPages;
        usersPaginationBtns.appendChild(nextBtn);
    }

    // ── 7. Render Audit Logs Table ──────────────────────────────────────────
    function renderAuditTable() {
        if (!auditTableBody) return;
        auditTableBody.innerHTML = '';

        let logs = allAuditLogs;
        if (auditSearchQuery) {
            const q = auditSearchQuery.toLowerCase();
            logs = logs.filter(l => 
                (l.actor && l.actor.username && l.actor.username.toLowerCase().includes(q)) ||
                (l.action && l.action.toLowerCase().includes(q)) ||
                (l.details && l.details.toLowerCase().includes(q)) ||
                (l.targetUser && l.targetUser.username && l.targetUser.username.toLowerCase().includes(q))
            );
        }

        if (logs.length === 0) {
            if (auditTableEmpty) auditTableEmpty.style.display = 'block';
            return;
        }

        if (auditTableEmpty) auditTableEmpty.style.display = 'none';

        logs.forEach(log => {
            const tr = document.createElement('tr');

            let actionBadgeClass = 'audit-update';
            if (log.action.includes('CREATE')) actionBadgeClass = 'audit-create';
            else if (log.action.includes('LOCK')) actionBadgeClass = 'audit-lock';
            else if (log.action.includes('DELETE') || log.action.includes('DEACTIVATE')) actionBadgeClass = 'audit-delete';

            const actorDisplay = log.actor
                ? `<strong style="color: var(--accent-blue);">@${log.actor.username}</strong> <small style="color: var(--text-muted);">(${log.actor.role})</small>`
                : 'Hệ thống';

            const targetDisplay = log.targetUser
                ? `@${log.targetUser.username} <small style="color: var(--text-muted);">(${log.targetUser.role})</small>`
                : '—';

            tr.innerHTML = `
                <td><small style="font-family: monospace;">${formatDate(log.timestamp)}</small></td>
                <td>${actorDisplay}</td>
                <td><span class="audit-action-badge ${actionBadgeClass}">${log.action}</span></td>
                <td>${targetDisplay}</td>
                <td style="font-size: 13px;">${log.details}</td>
            `;

            auditTableBody.appendChild(tr);
        });
    }

    // ── 8. Tab Switch Logic ─────────────────────────────────────────────────
    function switchTab(targetTab) {
        currentTab = targetTab;
        tabBtns.forEach(btn => {
            if (btn.getAttribute('data-tab') === targetTab) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        if (targetTab === 'audit') {
            if (tabUsersView) tabUsersView.style.display = 'none';
            if (tabAuditPane) tabAuditPane.style.display = 'block';
            renderAuditTable();
        } else {
            if (tabUsersView) tabUsersView.style.display = 'block';
            if (tabAuditPane) tabAuditPane.style.display = 'none';

            if (usersTabTitle) {
                usersTabTitle.textContent = targetTab === 'customers'
                    ? 'Danh Sách Khách Hàng (Customer)'
                    : 'Đội Ngũ Nhân Viên & Quản Trị (Staff & Admin)';
            }
            applyUserFilters();
        }
    }

    // ── 9. Modal Handlers: Create Staff ─────────────────────────────────────
    function openCreateStaffModal() {
        if (!formCreateStaff || !modalCreateStaff) return;
        formCreateStaff.reset();
        clearCreateStaffErrors();
        const staffCountrySelect = document.getElementById('staff-country-code');
        if (window.BMW_PHONE_UTILS && staffCountrySelect) {
            window.BMW_PHONE_UTILS.populateCountrySelect(staffCountrySelect, '+84');
        }
        modalCreateStaff.classList.add('active');
        modalCreateStaff.setAttribute('aria-hidden', 'false');
    }

    function closeCreateStaffModal() {
        if (!modalCreateStaff) return;
        modalCreateStaff.classList.remove('active');
        modalCreateStaff.setAttribute('aria-hidden', 'true');
    }

    function clearCreateStaffErrors() {
        const errorSpans = modalCreateStaff.querySelectorAll('.field-error');
        errorSpans.forEach(s => {
            s.textContent = '';
            s.style.display = 'none';
        });
    }

    function handleCreateStaffSubmit(e) {
        e.preventDefault();
        clearCreateStaffErrors();

        const fullnameInput = document.getElementById('staff-input-fullname');
        const usernameInput = document.getElementById('staff-input-username');
        const emailInput = document.getElementById('staff-input-email');
        const phoneInput = document.getElementById('staff-input-phone');
        const passwordInput = document.getElementById('staff-input-password');
        const confirmPwInput = document.getElementById('staff-input-confirm-pw');
        const dobInput = document.getElementById('staff-input-dob');
        const addressInput = document.getElementById('staff-input-address');

        const fullname = fullnameInput ? fullnameInput.value.trim() : '';
        const username = usernameInput ? usernameInput.value.trim().toLowerCase() : '';
        const email = emailInput ? emailInput.value.trim().toLowerCase() : '';
        const phone = phoneInput ? phoneInput.value.trim() : '';
        const password = passwordInput ? passwordInput.value : '';
        const confirmPw = confirmPwInput ? confirmPwInput.value : '';
        const dob = dobInput ? dobInput.value : '';
        const address = addressInput ? addressInput.value.trim() : '';

        // Password matching
        if (password !== confirmPw) {
            const errSpan = document.getElementById('err-staff-confirm-pw');
            if (errSpan) {
                errSpan.textContent = 'Mật khẩu xác nhận không khớp.';
                errSpan.style.display = 'block';
            }
            return;
        }

        // Phone validation & format
        const staffCountrySelect = document.getElementById('staff-country-code');
        const staffDialCode = staffCountrySelect ? staffCountrySelect.value : '+84';
        if (window.BMW_PHONE_UTILS) {
            const phoneCheck = window.BMW_PHONE_UTILS.validatePhone(staffDialCode, phone, true);
            if (!phoneCheck.valid) {
                const errSpan = document.getElementById('err-staff-phone');
                if (errSpan) {
                    errSpan.textContent = phoneCheck.message;
                    errSpan.style.display = 'block';
                }
                return;
            }
        }
        const fullStaffPhone = window.BMW_PHONE_UTILS ? window.BMW_PHONE_UTILS.formatPhoneToSave(staffDialCode, phone) : phone;

        // Granular permissions
        const checkedPerms = [];
        const permCheckboxes = modalCreateStaff.querySelectorAll('input[name="staff_perm"]:checked');
        permCheckboxes.forEach(cb => checkedPerms.push(cb.value));

        const staffData = {
            fullName: fullname,
            username: username,
            email: email,
            phone: fullStaffPhone,
            password: password,
            dob: dob,
            address: address,
            permissions: checkedPerms
        };

        const result = window.BMW_AUTH_GUARD.createStaffAccount(staffData);
        if (!result.success) {
            const errSpan = document.getElementById(`err-staff-${result.field || 'password'}`);
            if (errSpan) {
                errSpan.textContent = result.message;
                errSpan.style.display = 'block';
            } else {
                showToast(result.message, 'danger');
            }
            return;
        }

        showToast(`Đã tạo thành công tài khoản Nhân viên @${username}!`, 'success');
        closeCreateStaffModal();
        loadData();
        renderMetrics();
        applyUserFilters();
        if (currentTab === 'staff') {
            renderUsersTable();
        } else {
            switchTab('staff');
        }
    }

    // ── 10. Modal Handlers: View User Detail ────────────────────────────────
    function openViewUserModal(userId) {
        const user = allUsers.find(u => String(u.id) === String(userId));
        if (!user || !modalViewUser) return;

        const nameEl = document.getElementById('view-user-fullname');
        const userEl = document.getElementById('view-user-username');
        const roleEl = document.getElementById('view-user-role-badge');
        const statusEl = document.getElementById('view-user-status-badge');
        const avatarEl = document.getElementById('view-user-avatar');
        const emailEl = document.getElementById('view-user-email');
        const phoneEl = document.getElementById('view-user-phone');
        const dobEl = document.getElementById('view-user-dob');
        const createdEl = document.getElementById('view-user-created');
        const addressEl = document.getElementById('view-user-address');
        const gmailBox = document.getElementById('view-user-gmail-box');
        const gmailVal = document.getElementById('view-user-gmail-val');

        const permsRow = document.getElementById('view-user-perms-row');
        const permsList = document.getElementById('view-user-perms-list');

        const orderStatsEl = document.getElementById('view-user-order-stats');
        const ordersBody = document.getElementById('view-user-orders-body');

        if (nameEl) nameEl.textContent = user.fullName || 'Chưa cập nhật';
        if (userEl) userEl.textContent = `@${user.username}`;
        if (emailEl) emailEl.textContent = user.email || 'N/A';
        if (phoneEl) phoneEl.textContent = user.phone || 'Chưa có SĐT';
        if (dobEl) dobEl.textContent = user.dob || 'Chưa cập nhật';
        if (createdEl) createdEl.textContent = formatDate(user.createdAt);
        if (addressEl) addressEl.textContent = user.address || 'Chưa cập nhật';

        if (avatarEl) {
            const initial = (user.fullName || user.username || 'U').charAt(0).toUpperCase();
            avatarEl.innerHTML = user.avatar ? `<img src="${user.avatar}" alt="${user.username}">` : initial;
        }

        if (roleEl) {
            const role = (user.role || 'customer').toLowerCase();
            roleEl.className = `role-pill ${role}`;
            roleEl.textContent = role.toUpperCase();
        }

        if (statusEl) {
            const isLocked = user.status === 'locked' || user.status === 'banned';
            statusEl.className = `status-pill ${isLocked ? 'locked' : 'active'}`;
            statusEl.textContent = isLocked ? 'ĐÃ KHÓA' : 'HOẠT ĐỘNG';
        }

        if (user.linkedGmail && user.linkedGmail.email) {
            if (gmailBox) gmailBox.style.display = 'block';
            if (gmailVal) gmailVal.textContent = user.linkedGmail.email;
        } else {
            if (gmailBox) gmailBox.style.display = 'none';
        }

        // Staff permissions
        if (user.role === 'staff' && Array.isArray(user.permissions) && user.permissions.length > 0) {
            if (permsRow) permsRow.style.display = 'block';
            if (permsList) {
                permsList.innerHTML = user.permissions.map(p => `<span class="perm-tag">${p}</span>`).join(' ');
            }
        } else {
            if (permsRow) permsRow.style.display = 'none';
        }

        // Order history
        const orderStats = getUserOrderStats(user);
        if (orderStatsEl) {
            orderStatsEl.textContent = `${orderStats.count} đơn hàng (${formatVND(orderStats.totalAmount)})`;
        }

        if (ordersBody) {
            ordersBody.innerHTML = '';
            if (orderStats.orders.length === 0) {
                ordersBody.innerHTML = '<tr><td colspan="5" style="text-align: center; color: var(--text-muted); padding: 16px;">Tài khoản chưa có đơn hàng nào trong hệ thống.</td></tr>';
            } else {
                orderStats.orders.forEach(o => {
                    const row = document.createElement('tr');
                    const itemsCount = Array.isArray(o.items) ? o.items.reduce((s, it) => s + (it.quantity || 1), 0) : 1;
                    row.innerHTML = `
                        <td><strong>${o.orderId || o.id}</strong></td>
                        <td>${formatDate(o.createdAt || o.orderDate)}</td>
                        <td>${itemsCount} sản phẩm</td>
                        <td><strong style="color: var(--accent-blue);">${formatVND(o.finalTotal || o.totalAmount)}</strong></td>
                        <td><span class="badge-status status-processing">${o.orderStatus || 'Đang xử lý'}</span></td>
                    `;
                    ordersBody.appendChild(row);
                });
            }
        }

        modalViewUser.classList.add('active');
        modalViewUser.setAttribute('aria-hidden', 'false');
    }

    function closeViewUserModal() {
        if (!modalViewUser) return;
        modalViewUser.classList.remove('active');
        modalViewUser.setAttribute('aria-hidden', 'true');
    }

    // ── 11. Modal Handlers: Edit User & Permissions ─────────────────────────
    function openEditUserModal(userId) {
        const user = allUsers.find(u => String(u.id) === String(userId));
        if (!user || !modalEditUser) return;

        const idInput = document.getElementById('edit-user-id');
        const fullnameInput = document.getElementById('edit-input-fullname');
        const phoneInput = document.getElementById('edit-input-phone');
        const roleInput = document.getElementById('edit-input-role');
        const statusInput = document.getElementById('edit-input-status');
        const dobInput = document.getElementById('edit-input-dob');
        const addressInput = document.getElementById('edit-input-address');
        const passwordInput = document.getElementById('edit-input-password');

        if (idInput) idInput.value = user.id;
        if (fullnameInput) fullnameInput.value = user.fullName || '';
        const editCountrySelect = document.getElementById('edit-country-code');
        if (window.BMW_PHONE_UTILS && editCountrySelect) {
            const parsedPhone = window.BMW_PHONE_UTILS.parsePhoneNumber(user.phone || '');
            window.BMW_PHONE_UTILS.populateCountrySelect(editCountrySelect, parsedPhone.dialCode);
            if (phoneInput) phoneInput.value = parsedPhone.phone;
        } else {
            if (phoneInput) phoneInput.value = user.phone || '';
        }
        if (roleInput) roleInput.value = user.role || 'customer';
        if (statusInput) statusInput.value = (user.status === 'locked' || user.status === 'banned') ? 'locked' : 'active';
        if (dobInput) dobInput.value = user.dob || '';
        if (addressInput) addressInput.value = user.address || '';
        if (passwordInput) passwordInput.value = '';

        // Last Admin protection notice on role change
        const isLastAdmin = window.BMW_AUTH_GUARD.isLastActiveAdmin(user.id);
        if (isLastAdmin && roleInput) {
            // Cannot demote last admin
            const nonAdminOptions = roleInput.querySelectorAll('option[value="staff"], option[value="customer"]');
            nonAdminOptions.forEach(opt => opt.disabled = true);
        } else if (roleInput) {
            const allOptions = roleInput.querySelectorAll('option');
            allOptions.forEach(opt => opt.disabled = false);
        }

        // Toggle permissions box
        toggleEditPermissionsBox(user.role || 'customer', user.permissions || []);

        modalEditUser.classList.add('active');
        modalEditUser.setAttribute('aria-hidden', 'false');
    }

    function toggleEditPermissionsBox(role, currentPerms = []) {
        if (!editStaffPermsBox) return;
        if (role === 'staff') {
            editStaffPermsBox.style.display = 'block';
            const checkboxes = editStaffPermsBox.querySelectorAll('input[name="edit_staff_perm"]');
            checkboxes.forEach(cb => {
                cb.checked = currentPerms.includes(cb.value);
            });
        } else {
            editStaffPermsBox.style.display = 'none';
        }
    }

    function closeEditUserModal() {
        if (!modalEditUser) return;
        modalEditUser.classList.remove('active');
        modalEditUser.setAttribute('aria-hidden', 'true');
    }

    function handleEditUserSubmit(e) {
        e.preventDefault();
        const idInput = document.getElementById('edit-user-id');
        const userId = idInput ? idInput.value : null;
        if (!userId) return;

        const fullnameInput = document.getElementById('edit-input-fullname');
        const phoneInput = document.getElementById('edit-input-phone');
        const roleInput = document.getElementById('edit-input-role');
        const statusInput = document.getElementById('edit-input-status');
        const dobInput = document.getElementById('edit-input-dob');
        const addressInput = document.getElementById('edit-input-address');
        const passwordInput = document.getElementById('edit-input-password');

        const newRole = roleInput ? roleInput.value : 'customer';
        const newStatus = statusInput ? statusInput.value : 'active';

        // Check last admin protection
        const adminCheck = window.BMW_AUTH_GUARD.validateAdminChange(userId, newRole, newStatus);
        if (!adminCheck.allowed) {
            showToast(adminCheck.message, 'danger');
            return;
        }

        // Phone validation & formatting
        const editCountrySelect = document.getElementById('edit-country-code');
        const editDialCode = editCountrySelect ? editCountrySelect.value : '+84';
        const rawEditPhone = phoneInput ? phoneInput.value.trim() : '';
        if (rawEditPhone && window.BMW_PHONE_UTILS) {
            const editPhoneCheck = window.BMW_PHONE_UTILS.validatePhone(editDialCode, rawEditPhone, false);
            if (!editPhoneCheck.valid) {
                const errSpan = document.getElementById('err-edit-phone');
                if (errSpan) {
                    errSpan.textContent = editPhoneCheck.message;
                    errSpan.style.display = 'block';
                }
                return;
            }
        }
        const formattedEditPhone = (rawEditPhone && window.BMW_PHONE_UTILS)
            ? window.BMW_PHONE_UTILS.formatPhoneToSave(editDialCode, rawEditPhone)
            : rawEditPhone;

        const checkedPerms = [];
        if (newRole === 'staff' && editStaffPermsBox) {
            const permCbs = editStaffPermsBox.querySelectorAll('input[name="edit_staff_perm"]:checked');
            permCbs.forEach(cb => checkedPerms.push(cb.value));
        }

        const updateData = {
            fullName: fullnameInput ? fullnameInput.value.trim() : '',
            phone: formattedEditPhone,
            role: newRole,
            status: newStatus,
            dob: dobInput ? dobInput.value : '',
            address: addressInput ? addressInput.value.trim() : '',
            permissions: checkedPerms
        };

        if (passwordInput && passwordInput.value.trim()) {
            updateData.password = passwordInput.value.trim();
        }

        const result = window.BMW_AUTH_GUARD.updateUser(userId, updateData);
        if (!result.success) {
            showToast(result.message, 'danger');
            return;
        }

        showToast('Cập nhật thông tin và phân quyền thành công!', 'success');
        closeEditUserModal();
        loadData();
        renderMetrics();
        applyUserFilters();
        if (currentTab === 'audit') renderAuditTable();
    }

    // ── 12. Modal Handlers: Confirmation Dialog (Lock / Safe Deactivate / Delete) ─
    function openConfirmModal(title, message, extra, onAccept) {
        if (!modalConfirm) return;
        confirmModalTitle.textContent = title;
        confirmModalMessage.innerHTML = message;
        confirmModalExtra.innerHTML = extra || '';
        pendingConfirmAction = onAccept;
        modalConfirm.classList.add('active');
        modalConfirm.setAttribute('aria-hidden', 'false');
    }

    function closeConfirmModal() {
        if (!modalConfirm) return;
        modalConfirm.classList.remove('active');
        modalConfirm.setAttribute('aria-hidden', 'true');
        pendingConfirmAction = null;
    }

    // Toggle Lock User
    function handleToggleLock(userId) {
        const user = allUsers.find(u => String(u.id) === String(userId));
        if (!user) return;

        const willLock = user.status === 'active';
        if (willLock && user.role === 'admin' && window.BMW_AUTH_GUARD.isLastActiveAdmin(userId)) {
            showToast('Không thể khóa Quản trị viên (Admin) duy nhất còn hoạt động trong hệ thống!', 'danger');
            return;
        }

        const actionText = willLock ? 'Khóa tài khoản' : 'Mở khóa tài khoản';
        const msg = willLock
            ? `Bạn có chắc chắn muốn <strong>KHÓA</strong> tài khoản <code>@${user.username}</code>?<br>Người dùng sẽ bị chấm dứt phiên làm việc ngay lập tức và không thể đăng nhập.`
            : `Bạn có muốn <strong>MỞ KHÓA</strong> cho tài khoản <code>@${user.username}</code> để người dùng tiếp tục hoạt động?`;

        openConfirmModal(actionText, msg, '', () => {
            const res = window.BMW_AUTH_GUARD.toggleLockUser(userId);
            if (res.success) {
                showToast(`Đã ${willLock ? 'khóa' : 'mở khóa'} thành công tài khoản @${user.username}!`, 'success');
                loadData();
                renderMetrics();
                applyUserFilters();
            } else {
                showToast(res.message, 'danger');
            }
        });
    }

    // Safe Delete / Deactivation User
    function handleSafeDelete(userId) {
        const user = allUsers.find(u => String(u.id) === String(userId));
        if (!user) return;

        const check = window.BMW_AUTH_GUARD.canDeleteUser(userId);

        if (check.isLastAdmin) {
            showToast(check.message, 'danger');
            return;
        }

        if (check.hasOrders) {
            // User HAS orders -> prioritize SAFE DEACTIVATION over HARD DELETE
            const title = 'Ưu Tiên Vô Hiệu Hóa An Toàn';
            const msg = `Tài khoản <code>@${user.username}</code> hiện có <strong>${check.orderCount} đơn hàng liên kết</strong>.<br><br>` +
                        `⚠️ Theo quy tắc an toàn dữ liệu, hệ thống <strong>chặn xóa cứng</strong> để bảo toàn lịch sử giao dịch và mã đơn của khách hàng.<br>` +
                        `Thay vào đó, tài khoản sẽ được <strong>Vô hiệu hóa (Khóa)</strong> an toàn.`;
            const extra = 'Dữ liệu đơn hàng, doanh thu và tham chiếu người dùng sẽ được lưu giữ nguyên vẹn 100%.';

            openConfirmModal(title, msg, extra, () => {
                const res = window.BMW_AUTH_GUARD.deactivateUser(userId, 'Vô hiệu hóa an toàn do có lịch sử đơn hàng');
                if (res.success) {
                    showToast(`Đã vô hiệu hóa an toàn tài khoản @${user.username} (Lịch sử ${check.orderCount} đơn hàng được bảo toàn)!`, 'success');
                    loadData();
                    renderMetrics();
                    applyUserFilters();
                } else {
                    showToast(res.message, 'danger');
                }
            });
        } else {
            // User has NO orders -> ALLOW permanent deletion with confirmation
            const title = 'Xác Nhận Xóa Vĩnh Viễn';
            const msg = `Tài khoản <code>@${user.username}</code> chưa có đơn hàng liên kết.<br>` +
                        `Bạn có chắc chắn muốn <strong>XÓA VĨNH VIỄN</strong> tài khoản này khỏi hệ thống? Thao tác không thể hoàn tác.`;

            openConfirmModal(title, msg, '', () => {
                const res = window.BMW_AUTH_GUARD.deleteUser(userId);
                if (res.success) {
                    showToast(`Đã xóa vĩnh viễn tài khoản @${user.username}!`, 'success');
                    loadData();
                    renderMetrics();
                    applyUserFilters();
                } else {
                    showToast(res.message, 'danger');
                }
            });
        }
    }

    // ── 13. Bind Current User Info in Topbar & Sidebar ───────────────────────
    function bindCurrentUser() {
        const currentUser = window.BMW_AUTH_GUARD.getCurrentUser();
        if (!currentUser) return;

        const displayName = currentUser.fullName || currentUser.username || 'Admin';
        const initial = displayName.charAt(0).toUpperCase();

        if (topbarUserAvatar) {
            topbarUserAvatar.textContent = initial;
            if (currentUser.avatar) {
                topbarUserAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${displayName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            }
        }
        if (sidebarUserName) sidebarUserName.textContent = displayName;
        if (sidebarUserAvatar) {
            sidebarUserAvatar.textContent = initial;
            if (currentUser.avatar) {
                sidebarUserAvatar.innerHTML = `<img src="${currentUser.avatar}" alt="${displayName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`;
            }
        }
    }

    // ── 14. Event Listeners Setup ───────────────────────────────────────────
    function initEvents() {
        // Sidebar collapse & mobile drawer
        if (collapseBtn) {
            collapseBtn.addEventListener('click', () => {
                if (layoutEl) layoutEl.classList.toggle('sidebar-collapsed');
            });
        }
        if (mobileToggleBtn) {
            mobileToggleBtn.addEventListener('click', () => {
                if (layoutEl) layoutEl.classList.toggle('sidebar-mobile-open');
            });
        }
        if (backdropEl) {
            backdropEl.addEventListener('click', () => {
                if (layoutEl) layoutEl.classList.remove('sidebar-mobile-open');
            });
        }

        // Logout
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.BMW_AUTH_GUARD.logout();
                window.location.replace('login.html');
            });
        }

        // Tabs
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                if (targetTab === 'tab-customers') switchTab('customers');
                else if (targetTab === 'tab-staff') switchTab('staff');
                else if (targetTab === 'tab-audit') switchTab('audit');
            });
        });

        // Filter status & search
        if (filterUserStatus) {
            filterUserStatus.addEventListener('change', () => {
                currentFilterStatus = filterUserStatus.value;
                applyUserFilters();
            });
        }

        if (filterUserSearch) {
            filterUserSearch.addEventListener('input', () => {
                searchQuery = filterUserSearch.value.trim();
                applyUserFilters();
            });
        }

        if (filterAuditSearch) {
            filterAuditSearch.addEventListener('input', () => {
                auditSearchQuery = filterAuditSearch.value.trim();
                renderAuditTable();
            });
        }

        // Pagination buttons click
        if (usersPaginationBtns) {
            usersPaginationBtns.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target || target.disabled) return;

                if (target.id === 'btn-users-prev') {
                    if (currentPage > 1) {
                        currentPage--;
                        renderUsersTable();
                    }
                    return;
                }

                if (target.id === 'btn-users-next') {
                    const totalPages = Math.ceil(filteredUsers.length / PAGE_SIZE);
                    if (currentPage < totalPages) {
                        currentPage++;
                        renderUsersTable();
                    }
                    return;
                }

                const pageNum = Number(target.getAttribute('data-page'));
                if (pageNum && pageNum !== currentPage) {
                    currentPage = pageNum;
                    renderUsersTable();
                }
            });
        }

        // Table Action Delegations
        if (usersTableBody) {
            usersTableBody.addEventListener('click', (e) => {
                const actionBtn = e.target.closest('button[data-action]');
                if (!actionBtn) return;

                const action = actionBtn.getAttribute('data-action');
                const userId = actionBtn.getAttribute('data-id');

                if (action === 'view') {
                    openViewUserModal(userId);
                } else if (action === 'edit') {
                    openEditUserModal(userId);
                } else if (action === 'toggle-lock') {
                    handleToggleLock(userId);
                } else if (action === 'safe-delete') {
                    handleSafeDelete(userId);
                }
            });
        }

        // Create Staff Modal
        if (btnOpenCreateStaff) btnOpenCreateStaff.addEventListener('click', openCreateStaffModal);
        if (btnCloseCreateStaff) btnCloseCreateStaff.addEventListener('click', closeCreateStaffModal);
        if (btnCancelCreateStaff) btnCancelCreateStaff.addEventListener('click', closeCreateStaffModal);
        if (formCreateStaff) formCreateStaff.addEventListener('submit', handleCreateStaffSubmit);

        // View User Modal
        if (btnCloseViewUser) btnCloseViewUser.addEventListener('click', closeViewUserModal);
        if (btnCloseViewUserFooter) btnCloseViewUserFooter.addEventListener('click', closeViewUserModal);

        // Edit User Modal
        if (btnCloseEditUser) btnCloseEditUser.addEventListener('click', closeEditUserModal);
        if (btnCancelEditUser) btnCancelEditUser.addEventListener('click', closeEditUserModal);
        if (formEditUser) formEditUser.addEventListener('submit', handleEditUserSubmit);
        if (editInputRole) {
            editInputRole.addEventListener('change', () => {
                toggleEditPermissionsBox(editInputRole.value);
            });
        }

        // Confirm Modal
        if (btnCloseConfirm) btnCloseConfirm.addEventListener('click', closeConfirmModal);
        if (btnConfirmCancel) btnConfirmCancel.addEventListener('click', closeConfirmModal);
        if (btnConfirmAccept) {
            btnConfirmAccept.addEventListener('click', () => {
                if (typeof pendingConfirmAction === 'function') {
                    const action = pendingConfirmAction;
                    closeConfirmModal();
                    action();
                } else {
                    closeConfirmModal();
                }
            });
        }

        // Close modals on background click
        [modalCreateStaff, modalViewUser, modalEditUser, modalConfirm].forEach(m => {
            if (m) {
                m.addEventListener('click', (e) => {
                    if (e.target === m) {
                        m.classList.remove('active');
                        m.setAttribute('aria-hidden', 'true');
                    }
                });
            }
        });
    }

    // ── 15. Initialization ──────────────────────────────────────────────────
    function init() {
        bindCurrentUser();
        loadData();
        renderMetrics();
        applyUserFilters();
        initEvents();

        // Check hash in URL (e.g. #tab-staff or #tab-audit)
        if (window.location.hash === '#tab-staff') {
            switchTab('staff');
        } else if (window.location.hash === '#tab-audit') {
            switchTab('audit');
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }

    // Expose for automated testing
    window.BMW_ADMIN_USERS_UI = {
        loadData,
        renderMetrics,
        applyUserFilters,
        switchTab,
        handleToggleLock,
        handleSafeDelete
    };

})();
