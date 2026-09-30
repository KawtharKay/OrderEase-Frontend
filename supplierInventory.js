/* ==========================================================================
   OrderEase Supplier Inventory Logic
   ========================================================================== */

let categories = [];
let items = [];
let selectedImageFile = null;
let existingImageUrl = "";
let itemSearchTerm = "";
let itemCategoryFilter = "";
let categorySearchTerm = "";
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 20;
let searchDebounceTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_supplier");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  initItemModal();
  initAddStockModal();

  document.getElementById("newItemBtn").addEventListener("click", () => openItemModal());
  document.getElementById("itemForm").addEventListener("submit", submitItemForm);
  document.getElementById("addCategoryForm").addEventListener("submit", submitNewCategory);
  document.getElementById("imageInput").addEventListener("change", handleImagePreview);

  document.getElementById("itemSearchInput").addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      itemSearchTerm = e.target.value.trim();
      currentPage = 1;
      loadItems();
    }, 300); 
  });

  document.getElementById("itemCategoryFilter").addEventListener("change", (e) => {
    itemCategoryFilter = e.target.value;
    currentPage = 1;
    loadItems();
  });

  document.getElementById("itemsPrevBtn").addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; loadItems(); }
  });

  document.getElementById("itemsNextBtn").addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; loadItems(); }
  });

  document.getElementById("categorySearchInput").addEventListener("input", (e) => {
    categorySearchTerm = e.target.value.trim().toLowerCase();
    renderCategoriesSidebar();
  });

  await loadCategories();
  await loadItems();
});

/* ---------- Categories ---------- */
async function loadCategories() {
  try {
    const result = await Api.get("/Category");
    categories = result?.data || [];
    renderCategoriesSidebar();
    renderCategorySelect();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function renderCategoriesSidebar() {
  const list = document.getElementById("categoriesList");

  const filtered = categorySearchTerm
    ? categories.filter(c => c.name.toLowerCase().includes(categorySearchTerm))
    : categories;

  if (categories.length === 0) {
    list.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm);">No categories yet.</p>`;
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm);">No categories match your search.</p>`;
    return;
  }

  list.innerHTML = filtered.map(cat => `
    <div class="category-item">
      <span>${cat.name}</span>
      <button class="del-cat-btn" data-id="${cat.id}" title="Delete category">✕</button>
    </div>
  `).join("");

  list.querySelectorAll(".del-cat-btn").forEach(btn => {
    btn.addEventListener("click", () => deleteCategory(btn.dataset.id));
  });
}

function renderCategorySelect() {
  const select = document.getElementById("categorySelect");
  select.innerHTML = categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join("");

  const filter = document.getElementById("itemCategoryFilter");
  const previousValue = filter.value;
  filter.innerHTML = `<option value="">All categories</option>` +
    categories.map(cat => `<option value="${cat.id}">${cat.name}</option>`).join("");
  filter.value = previousValue;
}

async function submitNewCategory(e) {
  e.preventDefault();
  const input = document.getElementById("newCategoryInput");
  const name = input.value.trim();
  if (!name) return;

  try {
    await Api.post("/Category/create-category", { name });
    input.value = "";
    await loadCategories();
    showToast("Category added.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function deleteCategory(id) {
  if (!confirm("Delete this category? Items using it may be affected.")) return;

  try {
    await Api.del(`/Category/delete-category/${id}`);
    await loadCategories();
    await loadItems();
    showToast("Category deleted.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------- Items — server-side search, filter, and pagination ---------- */
async function loadItems() {
  const list = document.getElementById("itemsList");
  const emptyState = document.getElementById("itemsEmpty");
  const pagination = document.getElementById("itemsPagination");
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading items...</p>`;
  pagination.style.display = "none";

  try {
    const params = new URLSearchParams({ page: currentPage, pageSize: PAGE_SIZE });
    if (itemSearchTerm) params.set("search", itemSearchTerm);
    if (itemCategoryFilter) params.set("categoryId", itemCategoryFilter);

    const result = await Api.get(`/Item/supplier?${params.toString()}`);
    const data = result?.data;
    items = data?.items || [];
    totalPages = data?.totalPages || 1;
    currentPage = data?.page || 1;

    if (data?.totalCount === 0 && !itemSearchTerm && !itemCategoryFilter) {
      list.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    renderItemsList(data?.totalCount ?? items.length);
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}

function renderItemsList(totalCount) {
  const list = document.getElementById("itemsList");
  const pagination = document.getElementById("itemsPagination");

  if (items.length === 0) {
    list.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm); padding: var(--sp-4) 0;">No items match your search.</p>`;
    pagination.style.display = "none";
    return;
  }

  list.innerHTML = items.map(renderItemRow).join("");

  items.forEach(item => {
    document.getElementById(`edit-${item.id}`).addEventListener("click", () => openItemModal(item));
    document.getElementById(`del-${item.id}`).addEventListener("click", () => deleteItem(item.id));
  });

  if (totalPages > 1) {
    pagination.style.display = "flex";
    document.getElementById("itemsPageInfo").textContent = `Page ${currentPage} of ${totalPages} · ${totalCount} items`;
    document.getElementById("itemsPrevBtn").disabled = currentPage <= 1;
    document.getElementById("itemsNextBtn").disabled = currentPage >= totalPages;
  } else {
    pagination.style.display = "none";
  }
}

function renderItemRow(item) {
  const catName = categories.find(c => c.id === item.categoryId)?.name || "Uncategorized";
  const initial = (item.title || "?").charAt(0).toUpperCase();
  const profit = item.price - item.costPrice;

  return `
    <div class="item-row">
      <div class="item-row-thumb">${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : initial}</div>
      <div class="item-row-info">
        <div class="name">${item.title}</div>
        <div class="meta">${catName} · ${item.quantity} in stock · ${item.isAvailable ? "Available" : "Unavailable"}</div>
        <div class="meta">Cost ${formatNaira(item.costPrice)} · Profit ${formatNaira(profit)}/unit</div>
      </div>
      <div class="item-row-price">${formatNaira(item.price)}</div>
      <div class="item-row-actions">
        <button class="icon-btn" id="edit-${item.id}" title="Edit">✎</button>
        <button class="icon-btn danger" id="del-${item.id}" title="Delete">🗑</button>
      </div>
    </div>
  `;
}

async function deleteItem(id) {
  if (!confirm("Delete this item? This can't be undone.")) return;

  try {
    await Api.del(`/Item/delete-item/${id}`);
    await loadItems();
    showToast("Item deleted.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------- Item modal ---------- */
function initItemModal() {
  const overlay = document.getElementById("itemModal");
  document.getElementById("itemModalCloseBtn").addEventListener("click", () => overlay.classList.remove("open"));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
}

function openItemModal(item = null) {
  const overlay = document.getElementById("itemModal");
  const form = document.getElementById("itemForm");
  form.reset();
  selectedImageFile = null;

  if (categories.length === 0) {
    showToast("Add a category first before creating an item.", "error");
    return;
  }

  const quantityWrap = document.getElementById("quantityFieldWrap");
  const currentStockWrap = document.getElementById("currentStockWrap");

  if (item) {
    document.getElementById("itemModalTitle").textContent = "Edit item";
    document.getElementById("itemId").value = item.id;
    document.getElementById("categorySelect").value = item.categoryId;
    document.getElementById("titleInput").value = item.title;
    document.getElementById("priceInput").value = item.price;
    document.getElementById("costPriceInput").value = item.costPrice;
    existingImageUrl = item.imageUrl || "";
    document.getElementById("imagePreview").innerHTML = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${item.title}">`
      : "No image selected";

    quantityWrap.style.display = "none";
    document.getElementById("quantityInput").required = false;
    currentStockWrap.style.display = "block";
    document.getElementById("currentStockValue").textContent = item.quantity;
    document.getElementById("openAddStockBtn").onclick = () => openAddStockModal(item);
  } else {
    document.getElementById("itemModalTitle").textContent = "Add item";
    document.getElementById("itemId").value = "";
    existingImageUrl = "";
    document.getElementById("imagePreview").innerHTML = "No image selected";

    quantityWrap.style.display = "block";
    document.getElementById("quantityInput").required = true;
    document.getElementById("quantityInput").value = 0;
    currentStockWrap.style.display = "none";
  }

  overlay.classList.add("open");
}

/* ---------- Add stock ---------- */
function initAddStockModal() {
  const overlay = document.getElementById("addStockModal");
  document.getElementById("addStockModalCloseBtn").addEventListener("click", () => overlay.classList.remove("open"));
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.classList.remove("open"); });
  document.getElementById("addStockForm").addEventListener("submit", submitAddStockForm);
}

function openAddStockModal(item) {
  document.getElementById("addStockForm").reset();
  document.getElementById("addStockItemId").value = item.id;
  document.getElementById("addStockItemTitle").textContent = `${item.title} — currently ${item.quantity} in stock`;
  document.getElementById("addStockCostPriceInput").value = item.costPrice;
  document.getElementById("itemModal").classList.remove("open");
  document.getElementById("addStockModal").classList.add("open");
}

async function submitAddStockForm(e) {
  e.preventDefault();
  const btn = document.getElementById("addStockSubmitBtn");
  const itemId = document.getElementById("addStockItemId").value;
  const quantityAdded = Number(document.getElementById("addStockQuantityInput").value);
  const costPrice = Number(document.getElementById("addStockCostPriceInput").value);
  const reference = document.getElementById("addStockReferenceInput").value.trim() || null;

  setButtonLoading(btn, true, "Adding...");

  try {
    const result = await Api.post(`/Item/${itemId}/add-stock`, { quantityAdded, costPrice, reference });
    document.getElementById("addStockModal").classList.remove("open");
    await loadItems();
    showToast(result.message, "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

function handleImagePreview(e) {
  const file = e.target.files[0];
  if (!file) return;
  selectedImageFile = file;

  const reader = new FileReader();
  reader.onload = () => {
    document.getElementById("imagePreview").innerHTML = `<img src="${reader.result}" alt="preview">`;
  };
  reader.readAsDataURL(file);
}

async function submitItemForm(e) {
  e.preventDefault();
  const btn = document.getElementById("itemSubmitBtn");
  const itemId = document.getElementById("itemId").value;

  const categoryId = document.getElementById("categorySelect").value;
  const title = document.getElementById("titleInput").value.trim();
  const price = Number(document.getElementById("priceInput").value);
  const costPrice = Number(document.getElementById("costPriceInput").value);

  if (!itemId && !selectedImageFile) {
    showToast("Please choose a photo for this item.", "error");
    return;
  }

  setButtonLoading(btn, true, "Saving...");

  try {
    let imageUrl = existingImageUrl;

    if (selectedImageFile) {
      const formData = new FormData();
      formData.append("File", selectedImageFile);
      const uploadResult = await Api.upload("/Upload/image", formData);
      imageUrl = uploadResult.data.url;
    }

    if (itemId) {
      await Api.patch(`/Item/update-item/${itemId}`, { title, imageUrl, price, costPrice });
    } else {
      const quantity = Number(document.getElementById("quantityInput").value);
      await Api.post("/Item/create-item", { categoryId, title, imageUrl, price, costPrice, quantity });
    }

    document.getElementById("itemModal").classList.remove("open");
    await loadItems();
    showToast(itemId ? "Item updated." : "Item added.", "success");
  } catch (err) {
    showToast(err.message, "error");
  } finally {
    setButtonLoading(btn, false);
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}