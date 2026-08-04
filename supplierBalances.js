/* ==========================================================================
   OrderEase Supplier Inventory
   ========================================================================== */

let categories = [];
let items = [];
let selectedImageFile = null;
let existingImageUrl = "";
let expandedGroups = {};
let itemSearchTerm = "";
let categorySearchTerm = "";

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_supplier");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  initItemModal();

  document.getElementById("newItemBtn").addEventListener("click", () => openItemModal());
  document.getElementById("itemForm").addEventListener("submit", submitItemForm);
  document.getElementById("addCategoryForm").addEventListener("submit", submitNewCategory);
  document.getElementById("imageInput").addEventListener("change", handleImagePreview);
  document.getElementById("itemSearchInput").addEventListener("input", (e) => {
    itemSearchTerm = e.target.value.trim().toLowerCase();
    renderGroupedItems();
  document.getElementById("categorySearchInput").addEventListener("input", (e) => {
    categorySearchTerm = e.target.value.trim().toLowerCase();
    renderCategoriesSidebar();
});
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

/* ---------- Items — grouped by category, with search ---------- */
async function loadItems() {
  const list = document.getElementById("itemsList");
  const emptyState = document.getElementById("itemsEmpty");
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading items...</p>`;

  try {
    const result = await Api.get("/Item");
    items = result?.data || [];

    if (items.length === 0) {
      list.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }
    emptyState.style.display = "none";

    renderGroupedItems();
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}

function renderGroupedItems() {
  const list = document.getElementById("itemsList");

  const filteredItems = itemSearchTerm
    ? items.filter(i =>
        i.title.toLowerCase().includes(itemSearchTerm) ||
        (categories.find(c => c.id === i.categoryId)?.name || "").toLowerCase().includes(itemSearchTerm)
      )
    : items;

  const groups = categories.map(cat => ({
    id: cat.id,
    name: cat.name,
    items: filteredItems.filter(i => i.categoryId === cat.id)
  })).filter(g => g.items.length > 0);

  const uncategorized = filteredItems.filter(i => !categories.some(c => c.id === i.categoryId));
  if (uncategorized.length > 0) {
    groups.push({ id: "uncategorized", name: "Uncategorized", items: uncategorized });
  }

  if (groups.length === 0) {
    list.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm); padding: var(--sp-4) 0;">No items match your search.</p>`;
    return;
  }

  list.innerHTML = groups.map(g => renderItemGroup(g, !!itemSearchTerm)).join("");

  groups.forEach(group => {
    document.getElementById(`group-head-${group.id}`).addEventListener("click", () => toggleGroup(group.id));
  });

  filteredItems.forEach(item => {
    document.getElementById(`edit-${item.id}`).addEventListener("click", () => openItemModal(item));
    document.getElementById(`del-${item.id}`).addEventListener("click", () => deleteItem(item.id));
  });
}

function renderItemGroup(group, forceOpen = false) {
  const isOpen = forceOpen || !!expandedGroups[group.id];

  return `
    <div class="item-group">
      <div class="item-group-head" id="group-head-${group.id}">
        <span class="item-group-name">${group.name}</span>
        <span class="item-group-count">${group.items.length} item${group.items.length === 1 ? "" : "s"}</span>
        <span class="item-group-caret ${isOpen ? "open" : ""}">▾</span>
      </div>
      <div class="item-group-body ${isOpen ? "open" : ""}" id="group-body-${group.id}">
        ${group.items.map(renderItemRow).join("")}
      </div>
    </div>
  `;
}

function toggleGroup(groupId) {
  expandedGroups[groupId] = !expandedGroups[groupId];
  document.getElementById(`group-body-${groupId}`).classList.toggle("open");
  document.getElementById(`group-head-${groupId}`).querySelector(".item-group-caret").classList.toggle("open");
}

function renderItemRow(item) {
  const catName = categories.find(c => c.id === item.categoryId)?.name || "Uncategorized";
  const initial = (item.title || "?").charAt(0).toUpperCase();

  return `
    <div class="item-row">
      <div class="item-row-thumb">${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : initial}</div>
      <div class="item-row-info">
        <div class="name">${item.title}</div>
        <div class="meta">${catName} · ${item.quantity} in stock · ${item.isAvailable ? "Available" : "Unavailable"}</div>
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

  if (item) {
    document.getElementById("itemModalTitle").textContent = "Edit item";
    document.getElementById("itemId").value = item.id;
    document.getElementById("categorySelect").value = item.categoryId;
    document.getElementById("titleInput").value = item.title;
    document.getElementById("priceInput").value = item.price;
    document.getElementById("quantityInput").value = item.quantity;
    existingImageUrl = item.imageUrl || "";
    document.getElementById("imagePreview").innerHTML = item.imageUrl
      ? `<img src="${item.imageUrl}" alt="${item.title}">`
      : "No image selected";
  } else {
    document.getElementById("itemModalTitle").textContent = "Add item";
    document.getElementById("itemId").value = "";
    existingImageUrl = "";
    document.getElementById("imagePreview").innerHTML = "No image selected";
  }

  overlay.classList.add("open");
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
  const quantity = Number(document.getElementById("quantityInput").value);

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
      await Api.patch(`/Item/update-item/${itemId}`, { title, imageUrl, price, quantity });
    } else {
      await Api.post("/Item/create-item", { categoryId, title, imageUrl, price, quantity });
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