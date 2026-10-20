/**
 * js/admin-products.js — Admin Product, Category & Inventory Management Logic
 * Phase 8.3: Full CRUD, Validations, Safe Category Deletion, Inventory & Staff Permissions
 */

(function () {
    'use strict';

    // ── 1. RBAC Guard: Require Admin Role ──────────────────────────────────
    if (window.BMW_AUTH_GUARD && typeof window.BMW_AUTH_GUARD.requireRole === 'function') {
        const hasAccess = window.BMW_AUTH_GUARD.requireRole(['admin'], 'index.html');
        if (!hasAccess) return;
    }

    const api = window.BMW_PRODUCTS_API;
    if (!api) {
        console.error('BMW_PRODUCTS_API not loaded.');
        return;
    }

    const currentUser = window.BMW_AUTH_GUARD.getCurrentUser();

    // ── 2. State & Variables ────────────────────────────────────────────────
    let productsList = [];
    let categoriesList = [];
    let filteredProducts = [];
    let currentPage = 1;
    const PAGE_SIZE = 6;

    // Filters
    let searchQuery = '';
    let categoryFilter = 'ALL';
    let stockStatusFilter = 'ALL';
    let sortOption = 'ID_ASC';
    let currentInvFilter = 'ALL';

    // ── 3. DOM Elements ─────────────────────────────────────────────────────
    // Tabs
    const tabBtns = document.querySelectorAll('.dash-tab-btn');
    const tabPanes = document.querySelectorAll('.tab-pane');

    // Products Tab Elements
    const productsTableBody = document.getElementById('products-table-body');
    const productsEmpty = document.getElementById('products-empty');
    const productsLoading = document.getElementById('products-loading');
    const filterCategorySelect = document.getElementById('filter-category');
    const filterStockSelect = document.getElementById('filter-stock');
    const sortSelect = document.getElementById('sort-products');
    const searchInput = document.getElementById('search-products-input');
    const paginationContainer = document.getElementById('products-pagination');
    const paginationInfo = document.getElementById('products-pagination-info');
    const paginationBtns = document.getElementById('products-pagination-btns');
    const btnOpenAddProduct = document.getElementById('btn-open-add-product');

    // Product Modal Elements
    const productModal = document.getElementById('product-modal');
    const productModalTitle = document.getElementById('product-modal-title');
    const productForm = document.getElementById('product-form');
    const productIdInput = document.getElementById('modal-prod-id');
    const productNameInput = document.getElementById('modal-prod-name');
    const productCatSelect = document.getElementById('modal-prod-category');
    const productPriceInput = document.getElementById('modal-prod-price');
    const productOldPriceInput = document.getElementById('modal-prod-old-price');
    const productStockInput = document.getElementById('modal-prod-stock');
    const productTagSelect = document.getElementById('modal-prod-tag');
    const productImageInput = document.getElementById('modal-prod-image');
    const productDescInput = document.getElementById('modal-prod-desc');
    const productFormError = document.getElementById('product-form-error');
    const productModalClose = document.getElementById('product-modal-close');
    const productModalCancel = document.getElementById('product-modal-cancel');

    // Delete Product Modal Elements
    const deleteModal = document.getElementById('delete-product-modal');
    const deleteModalText = document.getElementById('delete-product-text');
    const deleteModalConfirmBtn = document.getElementById('btn-confirm-delete-product');
    const deleteModalCancelBtn = document.getElementById('btn-cancel-delete-product');
    let productToDeleteId = null;

    // Categories Tab Elements
    const categoriesTableBody = document.getElementById('categories-table-body');
    const formAddCategory = document.getElementById('form-add-category');
    const inputNewCategory = document.getElementById('input-new-category');
    const addCatError = document.getElementById('add-cat-error');

    // Category Modals (Rename & Safe Delete)
    const renameCatModal = document.getElementById('rename-category-modal');
    const renameCatOldInput = document.getElementById('rename-cat-old');
    const renameCatNewInput = document.getElementById('rename-cat-new');
    const renameCatError = document.getElementById('rename-cat-error');
    const btnConfirmRenameCat = document.getElementById('btn-confirm-rename-cat');
    const btnCancelRenameCat = document.getElementById('btn-cancel-rename-cat');

    const deleteCatModal = document.getElementById('delete-category-modal');
    const deleteCatWarningText = document.getElementById('delete-cat-warning-text');
    const deleteCatMigrationBox = document.getElementById('delete-cat-migration-box');
    const selectTargetCategory = document.getElementById('select-target-category');
    const deleteCatError = document.getElementById('delete-cat-error');
    const btnConfirmDeleteCat = document.getElementById('btn-confirm-delete-cat');
    const btnCancelDeleteCat = document.getElementById('btn-cancel-delete-cat');
    let categoryToDelete = null;

    // Inventory Tab Elements
    const inventoryTableBody = document.getElementById('inventory-table-body');
    const inputLowStockThreshold = document.getElementById('input-low-stock-threshold');
    const btnSaveThreshold = document.getElementById('btn-save-threshold');
    const statTotalStock = document.getElementById('stat-total-stock');
    const statTotalValue = document.getElementById('stat-total-value');
    const statLowStockCount = document.getElementById('stat-low-stock-count');

    // Staff Permissions Tab Elements
    const permAddProdCheck = document.getElementById('perm-add-prod');
    const permEditProdCheck = document.getElementById('perm-edit-prod');
    const permStockCheck = document.getElementById('perm-stock');
    const btnSaveStaffPerms = document.getElementById('btn-save-staff-perms');

    // Common
    const toastContainer = document.getElementById('dash-toast-container');
    const topbarUserName = document.getElementById('topbar-user-name');
    const topbarUserAvatar = document.getElementById('topbar-user-avatar');
    const sidebarUserName = document.getElementById('sidebar-user-name');
    const sidebarUserAvatar = document.getElementById('sidebar-user-avatar');

    // ── 4. Helper Utilities ─────────────────────────────────────────────────
    function showToast(message, type = 'info') {
        if (!toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `dash-toast ${type}`;
        const iconHtml = type === 'success' ? '✓' : (type === 'error' ? '✕' : 'ℹ️');
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

    function escapeHtml(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    function getStockBadge(stock) {
        const threshold = api.getLowStockThreshold();
        if (stock === 0) {
            return `<span class="badge-status status-danger">Hết hàng (0)</span>`;
        }
        if (stock <= threshold) {
            return `<span class="badge-status status-warning">Sắp hết (${stock})</span>`;
        }
        return `<span class="badge-status status-delivered">Còn hàng (${stock})</span>`;
    }

    function getTagBadge(tag) {
        if (!tag) return `<span class="badge-status status-neutral">Không</span>`;
        const t = tag.toUpperCase();
        if (t === 'NEW') return `<span class="badge-status status-transit">NEW</span>`;
        if (t === 'HOT') return `<span class="badge-status status-ordered">HOT</span>`;
        if (t === 'SALE') return `<span class="badge-status status-danger">SALE</span>`;
        return `<span class="badge-status status-neutral">${escapeHtml(t)}</span>`;
    }

    // ── 5. Data Loading ─────────────────────────────────────────────────────
    function loadAllData() {
        productsList = api.getProducts();
        categoriesList = api.getCategories();

        // Populate Category Filter dropdowns
        populateCategoryDropdowns();

        // Render Tabs
        applyProductFilters();
        renderCategoriesTab();
        renderInventoryTab();
        renderStaffPermissionsTab();
    }

    function populateCategoryDropdowns() {
        const categories = api.getCategories();

        // Filter dropdown in products tab
        if (filterCategorySelect) {
            const currentVal = filterCategorySelect.value;
            filterCategorySelect.innerHTML = `<option value="ALL">Tất cả danh mục (${categories.length})</option>` +
                categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
            if (categories.includes(currentVal)) {
                filterCategorySelect.value = currentVal;
            }
        }

        // Dropdown inside product form modal
        if (productCatSelect) {
            productCatSelect.innerHTML = categories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        }
    }

    // ── 6. Products Tab Logic ───────────────────────────────────────────────
    function applyProductFilters() {
        const threshold = api.getLowStockThreshold();

        filteredProducts = productsList.filter(prod => {
            // Category filter
            if (categoryFilter !== 'ALL') {
                if ((prod.category || '').toLowerCase() !== categoryFilter.toLowerCase()) return false;
            }

            // Stock status filter
            const stock = Number(prod.stock) || 0;
            if (stockStatusFilter === 'IN_STOCK' && stock <= threshold) return false;
            if (stockStatusFilter === 'LOW_STOCK' && (stock === 0 || stock > threshold)) return false;
            if (stockStatusFilter === 'OUT_OF_STOCK' && stock > 0) return false;

            // Search query (name or id)
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const matchId = (prod.id || '').toLowerCase().includes(q);
                const matchName = (prod.name || '').toLowerCase().includes(q);
                const matchCat = (prod.category || '').toLowerCase().includes(q);
                if (!matchId && !matchName && !matchCat) return false;
            }

            return true;
        });

        // Sorting
        filteredProducts.sort((a, b) => {
            const priceA = api.parsePrice(a.price);
            const priceB = api.parsePrice(b.price);
            const stockA = Number(a.stock) || 0;
            const stockB = Number(b.stock) || 0;

            if (sortOption === 'NAME_ASC') return (a.name || '').localeCompare(b.name || '');
            if (sortOption === 'NAME_DESC') return (b.name || '').localeCompare(a.name || '');
            if (sortOption === 'PRICE_ASC') return priceA - priceB;
            if (sortOption === 'PRICE_DESC') return priceB - priceA;
            if (sortOption === 'STOCK_ASC') return stockA - stockB;
            if (sortOption === 'STOCK_DESC') return stockB - stockA;

            // Default ID_ASC
            return (a.id || '').localeCompare(b.id || '', undefined, { numeric: true });
        });

        currentPage = 1;
        renderProductsTable();
    }

    function renderProductsTable() {
        if (!productsTableBody) return;
        if (productsLoading) productsLoading.style.display = 'none';

        if (filteredProducts.length === 0) {
            productsTableBody.innerHTML = '';
            if (productsEmpty) productsEmpty.style.display = 'flex';
            if (paginationContainer) paginationContainer.style.display = 'none';
            return;
        }

        if (productsEmpty) productsEmpty.style.display = 'none';
        if (paginationContainer) paginationContainer.style.display = 'flex';

        const total = filteredProducts.length;
        const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
        if (currentPage > totalPages) currentPage = totalPages;

        const startIndex = (currentPage - 1) * PAGE_SIZE;
        const pageItems = filteredProducts.slice(startIndex, startIndex + PAGE_SIZE);

        productsTableBody.innerHTML = pageItems.map(p => {
            return `
                <tr>
                    <td><strong>${escapeHtml(p.id)}</strong></td>
                    <td>
                        <div class="prod-cell-flex">
                            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" class="prod-table-thumb" onerror="this.src='images/products/performance-oversized-tshirt.jpg'">
                            <div>
                                <div style="font-weight: 600; color: var(--text-primary);">${escapeHtml(p.name)}</div>
                                <div style="font-size: 11.5px; color: var(--text-muted);">${escapeHtml(p.description || '')}</div>
                            </div>
                        </div>
                    </td>
                    <td><span class="badge-status status-neutral">${escapeHtml(p.category)}</span></td>
                    <td style="font-weight: 700; color: var(--accent-blue);">${escapeHtml(p.price)}</td>
                    <td>${getStockBadge(Number(p.stock) || 0)}</td>
                    <td>${getTagBadge(p.tag)}</td>
                    <td>★ ${Number(p.rating || 5.0).toFixed(1)}</td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-table-action primary" data-action="edit-product" data-id="${p.id}" title="Chỉnh sửa sản phẩm">
                                Sửa
                            </button>
                            <button class="btn-table-action" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" data-action="delete-product" data-id="${p.id}" title="Xóa sản phẩm">
                                Xóa
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');

        // Pagination info & buttons
        if (paginationInfo) {
            const from = startIndex + 1;
            const to = Math.min(startIndex + PAGE_SIZE, total);
            paginationInfo.textContent = `Hiển thị ${from}–${to} trên tổng số ${total} sản phẩm`;
        }

        if (paginationBtns) {
            let btnsHtml = `<button class="btn-page" id="btn-prod-prev" ${currentPage <= 1 ? 'disabled' : ''}>&larr;</button>`;
            for (let i = 1; i <= totalPages; i++) {
                btnsHtml += `<button class="btn-page ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
            }
            btnsHtml += `<button class="btn-page" id="btn-prod-next" ${currentPage >= totalPages ? 'disabled' : ''}>&rarr;</button>`;
            paginationBtns.innerHTML = btnsHtml;
        }
    }

    // Open Add Product Modal
    function openAddProductModal() {
        if (!productModal) return;
        productModalTitle.textContent = 'Thêm Sản Phẩm Mới';
        productIdInput.value = '';
        productNameInput.value = '';
        productPriceInput.value = '';
        productOldPriceInput.value = '';
        productStockInput.value = '50';
        productImageInput.value = 'images/products/performance-oversized-tshirt.jpg';
        productDescInput.value = '';
        productTagSelect.value = '';
        if (productFormError) productFormError.style.display = 'none';

        populateCategoryDropdowns();
        productModal.classList.add('show');
    }

    // Open Edit Product Modal
    function openEditProductModal(id) {
        const prod = api.getProductById(id);
        if (!prod || !productModal) return;

        productModalTitle.textContent = `Chỉnh Sửa Sản Phẩm (#${prod.id})`;
        productIdInput.value = prod.id;
        productNameInput.value = prod.name || '';
        populateCategoryDropdowns();
        productCatSelect.value = prod.category || '';
        productPriceInput.value = api.parsePrice(prod.price);
        productOldPriceInput.value = prod.oldPrice ? api.parsePrice(prod.oldPrice) : '';
        productStockInput.value = prod.stock ?? 0;
        productImageInput.value = prod.image || '';
        productDescInput.value = prod.description || '';
        productTagSelect.value = prod.tag || '';
        if (productFormError) productFormError.style.display = 'none';

        productModal.classList.add('show');
    }

    function closeProductModal() {
        if (productModal) productModal.classList.remove('show');
    }

    // Handle Product Form Submit (Add or Edit)
    function handleProductFormSubmit(e) {
        e.preventDefault();
        if (productFormError) productFormError.style.display = 'none';

        const id = productIdInput.value.trim();
        const payload = {
            name: productNameInput.value.trim(),
            category: productCatSelect.value.trim(),
            price: productPriceInput.value.trim(),
            oldPrice: productOldPriceInput.value.trim() || null,
            stock: productStockInput.value.trim(),
            image: productImageInput.value.trim(),
            tag: productTagSelect.value.trim() || null,
            description: productDescInput.value.trim()
        };

        let res;
        if (id) {
            // Edit existing
            res = api.updateProduct(id, payload, currentUser);
        } else {
            // Add new
            res = api.addProduct(payload, currentUser);
        }

        if (res.success) {
            closeProductModal();
            showToast(id ? `Cập nhật sản phẩm #${id} thành công!` : `Thêm sản phẩm mới #${res.product.id} thành công!`, 'success');
            loadAllData();
        } else {
            if (productFormError) {
                productFormError.textContent = res.message;
                productFormError.style.display = 'block';
            }
        }
    }

    // Open Delete Product Confirmation
    function openDeleteProductModal(id) {
        const prod = api.getProductById(id);
        if (!prod || !deleteModal) return;

        productToDeleteId = id;
        deleteModalText.textContent = `Bạn có chắc chắn muốn xóa sản phẩm "${prod.name}" (#${prod.id})? Thao tác này sẽ gỡ sản phẩm khỏi danh mục bán hàng.`;
        deleteModal.classList.add('show');
    }

    function closeDeleteProductModal() {
        productToDeleteId = null;
        if (deleteModal) deleteModal.classList.remove('show');
    }

    function handleConfirmDeleteProduct() {
        if (!productToDeleteId) return;
        const res = api.deleteProduct(productToDeleteId, currentUser);
        closeDeleteProductModal();

        if (res.success) {
            showToast(`Đã xóa sản phẩm thành công!`, 'success');
            loadAllData();
        } else {
            showToast(res.message || 'Lỗi khi xóa sản phẩm.', 'error');
        }
    }

    // ── 7. Categories Tab Logic ─────────────────────────────────────────────
    function renderCategoriesTab() {
        if (!categoriesTableBody) return;
        const categories = api.getCategories();
        const products = api.getProducts();

        categoriesTableBody.innerHTML = categories.map((cat, idx) => {
            const count = products.filter(p => p.category && p.category.toLowerCase() === cat.toLowerCase()).length;
            return `
                <tr>
                    <td><strong>#${idx + 1}</strong></td>
                    <td style="font-weight: 600; font-size: 14px;">${escapeHtml(cat)}</td>
                    <td>
                        <span class="badge-status ${count > 0 ? 'status-delivered' : 'status-neutral'}">
                            ${count} sản phẩm
                        </span>
                    </td>
                    <td>
                        <div class="table-actions">
                            <button class="btn-table-action" data-action="rename-category" data-cat="${escapeHtml(cat)}" title="Đổi tên danh mục">
                                Đổi tên
                            </button>
                            <button class="btn-table-action" style="color: #ef4444; border-color: rgba(239, 68, 68, 0.3);" data-action="delete-category" data-cat="${escapeHtml(cat)}" title="Xóa danh mục">
                                Xóa
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function handleAddCategory(e) {
        e.preventDefault();
        if (addCatError) addCatError.style.display = 'none';

        const name = inputNewCategory ? inputNewCategory.value.trim() : '';
        const res = api.addCategory(name, currentUser);

        if (res.success) {
            if (inputNewCategory) inputNewCategory.value = '';
            showToast(`Đã thêm danh mục "${res.category}" thành công!`, 'success');
            loadAllData();
        } else {
            if (addCatError) {
                addCatError.textContent = res.message;
                addCatError.style.display = 'block';
            }
        }
    }

    // Rename Category Modal Logic
    function openRenameCategoryModal(catName) {
        if (!renameCatModal) return;
        renameCatOldInput.value = catName;
        renameCatNewInput.value = catName;
        if (renameCatError) renameCatError.style.display = 'none';
        renameCatModal.classList.add('show');
    }

    function closeRenameCategoryModal() {
        if (renameCatModal) renameCatModal.classList.remove('show');
    }

    function handleConfirmRenameCategory() {
        const oldName = renameCatOldInput.value.trim();
        const newName = renameCatNewInput.value.trim();
        const res = api.updateCategory(oldName, newName, currentUser);

        if (res.success) {
            closeRenameCategoryModal();
            showToast(`Đổi tên danh mục thành "${newName}" (cập nhật ${res.productsUpdated} sản phẩm)!`, 'success');
            loadAllData();
        } else {
            if (renameCatError) {
                renameCatError.textContent = res.message;
                renameCatError.style.display = 'block';
            }
        }
    }

    // Delete Category Modal Logic (Safe Deletion with Product Migration)
    function openDeleteCategoryModal(catName) {
        if (!deleteCatModal) return;
        categoryToDelete = catName;
        if (deleteCatError) deleteCatError.style.display = 'none';

        const products = api.getProducts();
        const linkedProducts = products.filter(p => p.category && p.category.toLowerCase() === catName.toLowerCase());
        const otherCategories = api.getCategories().filter(c => c.toLowerCase() !== catName.toLowerCase());

        if (linkedProducts.length > 0) {
            deleteCatWarningText.innerHTML = `Danh mục <strong>"${escapeHtml(catName)}"</strong> hiện đang có <strong>${linkedProducts.length}</strong> sản phẩm liên kết. Vui lòng chọn danh mục đích để chuyển toàn bộ sản phẩm sang trước khi xóa:`;
            deleteCatMigrationBox.style.display = 'block';
            selectTargetCategory.innerHTML = otherCategories.map(c => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join('');
        } else {
            deleteCatWarningText.innerHTML = `Danh mục <strong>"${escapeHtml(catName)}"</strong> chưa có sản phẩm nào. Bạn có chắc chắn muốn xóa danh mục này?`;
            deleteCatMigrationBox.style.display = 'none';
        }

        deleteCatModal.classList.add('show');
    }

    function closeDeleteCategoryModal() {
        categoryToDelete = null;
        if (deleteCatModal) deleteCatModal.classList.remove('show');
    }

    function handleConfirmDeleteCategory() {
        if (!categoryToDelete) return;
        const targetCategory = deleteCatMigrationBox.style.display === 'block' ? selectTargetCategory.value : null;

        const res = api.deleteCategory(categoryToDelete, targetCategory, currentUser);

        if (res.success) {
            closeDeleteCategoryModal();
            showToast(`Đã xóa danh mục "${res.deletedCategory}" thành công!`, 'success');
            loadAllData();
        } else {
            if (deleteCatError) {
                deleteCatError.textContent = res.message;
                deleteCatError.style.display = 'block';
            }
        }
    }

    // ── 8. Inventory Tab Logic ──────────────────────────────────────────────
    function renderInventoryTab() {
        const threshold = api.getLowStockThreshold();
        if (inputLowStockThreshold) inputLowStockThreshold.value = threshold;

        const products = api.getProducts();
        const totalItems = products.reduce((sum, p) => sum + (Number(p.stock) || 0), 0);
        const totalValue = products.reduce((sum, p) => sum + (api.parsePrice(p.price) * (Number(p.stock) || 0)), 0);
        const lowStockCount = products.filter(p => (Number(p.stock) || 0) <= threshold && (Number(p.stock) || 0) > 0).length;
        const outOfStockCount = products.filter(p => (Number(p.stock) || 0) === 0).length;

        if (statTotalStock) statTotalStock.textContent = totalItems.toLocaleString('vi-VN');
        if (statTotalValue) statTotalValue.textContent = api.formatVND(totalValue);
        if (statLowStockCount) statLowStockCount.textContent = (lowStockCount + outOfStockCount);

        if (!inventoryTableBody) return;

        let invFiltered = products;
        if (currentInvFilter === 'LOW_STOCK') {
            invFiltered = products.filter(p => (Number(p.stock) || 0) <= threshold && (Number(p.stock) || 0) > 0);
        } else if (currentInvFilter === 'OUT_OF_STOCK') {
            invFiltered = products.filter(p => (Number(p.stock) || 0) === 0);
        } else if (currentInvFilter === 'IN_STOCK') {
            invFiltered = products.filter(p => (Number(p.stock) || 0) > threshold);
        }

        if (invFiltered.length === 0) {
            inventoryTableBody.innerHTML = `
                <tr>
                    <td colspan="6" style="text-align: center; padding: 24px; color: var(--text-muted);">
                        Không có sản phẩm nào thuộc nhóm tồn kho này.
                    </td>
                </tr>
            `;
            return;
        }

        inventoryTableBody.innerHTML = invFiltered.map(p => {
            const stock = Number(p.stock) || 0;
            return `
                <tr>
                    <td><strong>${escapeHtml(p.id)}</strong></td>
                    <td>
                        <div class="prod-cell-flex">
                            <img src="${escapeHtml(p.image)}" alt="${escapeHtml(p.name)}" class="prod-table-thumb" onerror="this.src='images/products/performance-oversized-tshirt.jpg'">
                            <span style="font-weight: 600;">${escapeHtml(p.name)}</span>
                        </div>
                    </td>
                    <td><span class="badge-status status-neutral">${escapeHtml(p.category)}</span></td>
                    <td style="font-weight: 700; font-size: 14px;">${stock} chiếc</td>
                    <td>${getStockBadge(stock)}</td>
                    <td>
                        <div style="display: flex; align-items: center; gap: 6px;">
                            <input type="number" min="1" max="1000" value="20" style="width: 70px; height: 32px; padding: 0 8px; border-radius: 6px; border: 1px solid var(--border-color); background: var(--bg-surface); color: var(--text-primary); font-size: 13px;" data-stock-input="${p.id}">
                            <button class="btn-table-action success" data-action="quick-restock" data-id="${p.id}">
                                + Nhập hàng
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }).join('');
    }

    function handleSaveThreshold() {
        const val = inputLowStockThreshold.value;
        const res = api.setLowStockThreshold(val, currentUser);
        if (res.success) {
            showToast(`Đã lưu ngưỡng cảnh báo tồn kho: ${res.threshold} sản phẩm!`, 'success');
            loadAllData();
        } else {
            showToast(res.message, 'error');
        }
    }

    function handleQuickRestock(id, qty) {
        const prod = api.getProductById(id);
        if (!prod) return;
        const addQty = parseInt(qty, 10);
        if (isNaN(addQty) || addQty <= 0) {
            showToast('Số lượng nhập hàng phải lớn hơn 0.', 'error');
            return;
        }

        const newStock = (Number(prod.stock) || 0) + addQty;
        const res = api.updateProduct(id, { stock: newStock }, currentUser);
        if (res.success) {
            showToast(`Đã nhập thêm +${addQty} chiếc cho "${prod.name}" (Tồn kho mới: ${newStock})!`, 'success');
            loadAllData();
        } else {
            showToast(res.message, 'error');
        }
    }

    // ── 9. Staff Permissions Tab Logic ──────────────────────────────────────
    function renderStaffPermissionsTab() {
        const perms = api.getStaffPermissions();
        if (permAddProdCheck) permAddProdCheck.checked = Boolean(perms.canAddProducts);
        if (permEditProdCheck) permEditProdCheck.checked = Boolean(perms.canEditProducts);
        if (permStockCheck) permStockCheck.checked = Boolean(perms.canManageStock);
    }

    function handleSaveStaffPermissions() {
        const perms = {
            canAddProducts: Boolean(permAddProdCheck?.checked),
            canEditProducts: Boolean(permEditProdCheck?.checked),
            canManageStock: Boolean(permStockCheck?.checked)
        };
        const res = api.setStaffPermissions(perms, currentUser);
        if (res.success) {
            showToast('Đã lưu cấu hình phân quyền nhân viên thành công!', 'success');
        } else {
            showToast(res.message, 'error');
        }
    }

    // ── 10. User Profile Mini Binding ───────────────────────────────────────
    function bindCurrentUser() {
        if (!currentUser) return;
        const displayName = currentUser.fullName || currentUser.username || 'Admin';
        const initial = (currentUser.username || 'A').charAt(0).toUpperCase();

        if (topbarUserName) topbarUserName.textContent = displayName;
        if (sidebarUserName) sidebarUserName.textContent = displayName;

        const avatarHtml = currentUser.avatar 
            ? `<img src="${currentUser.avatar}" alt="${displayName}">`
            : `<span>${initial}</span>`;

        if (topbarUserAvatar) topbarUserAvatar.innerHTML = avatarHtml;
        if (sidebarUserAvatar) sidebarUserAvatar.innerHTML = avatarHtml;
    }

    // ── 11. Event Listeners ─────────────────────────────────────────────────
    function initEvents() {
        // Tab Switching
        tabBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetTab = btn.getAttribute('data-tab');
                tabBtns.forEach(b => b.classList.remove('active'));
                tabPanes.forEach(p => p.classList.remove('active'));

                btn.classList.add('active');
                const pane = document.getElementById(targetTab);
                if (pane) pane.classList.add('active');

                // Update hash in URL
                window.location.hash = targetTab;
            });
        });

        // Handle initial hash in URL (e.g. #tab-categories or #tab-inventory)
        if (window.location.hash) {
            const activeBtn = document.querySelector(`.dash-tab-btn[data-tab="${window.location.hash.substring(1)}"]`);
            if (activeBtn) activeBtn.click();
        }

        // Filters in Products Tab
        if (filterCategorySelect) {
            filterCategorySelect.addEventListener('change', (e) => {
                categoryFilter = e.target.value;
                applyProductFilters();
            });
        }
        if (filterStockSelect) {
            filterStockSelect.addEventListener('change', (e) => {
                stockStatusFilter = e.target.value;
                applyProductFilters();
            });
        }
        if (sortSelect) {
            sortSelect.addEventListener('change', (e) => {
                sortOption = e.target.value;
                applyProductFilters();
            });
        }
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                searchQuery = e.target.value.trim();
                applyProductFilters();
            });
        }

        // Add Product Modal
        if (btnOpenAddProduct) btnOpenAddProduct.addEventListener('click', openAddProductModal);
        if (productModalClose) productModalClose.addEventListener('click', closeProductModal);
        if (productModalCancel) productModalCancel.addEventListener('click', closeProductModal);
        if (productForm) productForm.addEventListener('submit', handleProductFormSubmit);

        // Delete Product Modal
        if (deleteModalConfirmBtn) deleteModalConfirmBtn.addEventListener('click', handleConfirmDeleteProduct);
        if (deleteModalCancelBtn) deleteModalCancelBtn.addEventListener('click', closeDeleteProductModal);

        // Table Action Delegations for Products
        if (productsTableBody) {
            productsTableBody.addEventListener('click', (e) => {
                const btnEdit = e.target.closest('button[data-action="edit-product"]');
                if (btnEdit) {
                    openEditProductModal(btnEdit.getAttribute('data-id'));
                    return;
                }
                const btnDelete = e.target.closest('button[data-action="delete-product"]');
                if (btnDelete) {
                    openDeleteProductModal(btnDelete.getAttribute('data-id'));
                    return;
                }
            });
        }

        // Pagination Buttons Delegation
        if (paginationBtns) {
            paginationBtns.addEventListener('click', (e) => {
                const target = e.target.closest('button');
                if (!target || target.disabled) return;

                if (target.id === 'btn-prod-prev') {
                    if (currentPage > 1) {
                        currentPage--;
                        renderProductsTable();
                    }
                    return;
                }
                if (target.id === 'btn-prod-next') {
                    const totalPages = Math.ceil(filteredProducts.length / PAGE_SIZE);
                    if (currentPage < totalPages) {
                        currentPage++;
                        renderProductsTable();
                    }
                    return;
                }
                const pageNum = Number(target.getAttribute('data-page'));
                if (pageNum && pageNum !== currentPage) {
                    currentPage = pageNum;
                    renderProductsTable();
                }
            });
        }

        // Add Category Form
        if (formAddCategory) formAddCategory.addEventListener('submit', handleAddCategory);

        // Table Action Delegations for Categories
        if (categoriesTableBody) {
            categoriesTableBody.addEventListener('click', (e) => {
                const btnRename = e.target.closest('button[data-action="rename-category"]');
                if (btnRename) {
                    openRenameCategoryModal(btnRename.getAttribute('data-cat'));
                    return;
                }
                const btnDel = e.target.closest('button[data-action="delete-category"]');
                if (btnDel) {
                    openDeleteCategoryModal(btnDel.getAttribute('data-cat'));
                    return;
                }
            });
        }

        // Category Modals Actions
        if (btnConfirmRenameCat) btnConfirmRenameCat.addEventListener('click', handleConfirmRenameCategory);
        if (btnCancelRenameCat) btnCancelRenameCat.addEventListener('click', closeRenameCategoryModal);
        if (btnConfirmDeleteCat) btnConfirmDeleteCat.addEventListener('click', handleConfirmDeleteCategory);
        if (btnCancelDeleteCat) btnCancelDeleteCat.addEventListener('click', closeDeleteCategoryModal);

        // Inventory Tab Actions
        const invPills = document.getElementById('inventory-filter-pills');
        if (invPills) {
            invPills.addEventListener('click', (e) => {
                const btn = e.target.closest('button[data-inv-filter]');
                if (!btn) return;
                invPills.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                currentInvFilter = btn.getAttribute('data-inv-filter') || 'ALL';
                renderInventoryTab();
            });
        }
        if (btnSaveThreshold) btnSaveThreshold.addEventListener('click', handleSaveThreshold);
        if (inventoryTableBody) {
            inventoryTableBody.addEventListener('click', (e) => {
                const btnRestock = e.target.closest('button[data-action="quick-restock"]');
                if (btnRestock) {
                    const id = btnRestock.getAttribute('data-id');
                    const input = inventoryTableBody.querySelector(`input[data-stock-input="${id}"]`);
                    const qty = input ? input.value : 20;
                    handleQuickRestock(id, qty);
                }
            });
        }

        // Staff Permissions Actions
        if (btnSaveStaffPerms) btnSaveStaffPerms.addEventListener('click', handleSaveStaffPermissions);

        // Sidebar Collapse & Mobile Drawer
        const collapseBtn = document.getElementById('sidebar-collapse-btn');
        const layoutEl = document.getElementById('dash-layout');
        const mobileToggleBtn = document.getElementById('sidebar-mobile-toggle');
        const backdropEl = document.getElementById('dash-backdrop');

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
        const logoutBtn = document.getElementById('logout-btn');
        if (logoutBtn) {
            logoutBtn.addEventListener('click', () => {
                window.BMW_AUTH_GUARD.logout();
                window.location.href = 'login.html';
            });
        }
    }

    // ── 12. Init ────────────────────────────────────────────────────────────
    function init() {
        bindCurrentUser();
        loadAllData();
        initEvents();
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})();
