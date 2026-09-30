/* ==========================================================================
   OrderEase Catalogue / Customer Dashboard Logic
   ========================================================================== */

let allItems = [];
let categoryMap = {};
let cart = {};
let activeCategory = "all";
let searchTerm = "";
let currentPage = 1;
let totalPages = 1;
const PAGE_SIZE = 20;
let searchDebounceTimer = null;

document.addEventListener("DOMContentLoaded", async () => {
  renderNavForAuthState();
  initCartDrawer();
  initSearchAndFilter();
  restoreSavedCart();
  renderCart();

  await loadItems();
});

function restoreSavedCart() {
  try {
    const saved = sessionStorage.getItem("oe_cart");
    if (saved) cart = JSON.parse(saved) || {};
  } catch {
    cart = {};
  }
}

function renderNavForAuthState() {
  const user = TokenStore.getUser();
  const token = TokenStore.get();
  const navLinks = document.getElementById("navLinks");
  const greeting = document.getElementById("greeting");
  const subtitle = document.querySelector(".dash-header p");

  if (user && token) {
    greeting.textContent = `Welcome back, ${user.email || "there"}`;
    subtitle.textContent = "Browse textbooks and school supplies, and add what you need to your order.";

    navLinks.insertAdjacentHTML("beforeend", `
      <a href="myOrders.html">My Orders</a>
      <a href="wallet.html">Wallet</a>
      <a href="profile.html">Profile</a>
      <a href="#" id="logoutLink">Log out</a>
    `);
    document.getElementById("logoutLink").addEventListener("click", handleLogout);
  } else {
    greeting.textContent = "Browse the catalogue";
    subtitle.textContent = "See what's in stock. Sign in when you're ready to place an order.";

    navLinks.insertAdjacentHTML("beforeend", `
      <a href="login.html">Sign in</a>
      <a href="register.html" class="btn btn-primary btn-sm">Create account</a>
    `);
  }
}

async function loadItems() {
  const grid = document.getElementById("itemGrid");
  grid.innerHTML = `<p style="color:var(--color-ink-soft);">Loading catalogue...</p>`;
  document.getElementById("catalogPagination").style.display = "none";

  try {
    const params = new URLSearchParams({ page: currentPage, pageSize: PAGE_SIZE });
    if (searchTerm) params.set("search", searchTerm);
    if (activeCategory !== "all") params.set("categoryId", activeCategory);

    const [itemsResult, categoriesResult] = await Promise.all([
      Api.get(`/Item?${params.toString()}`),
      Api.get("/Category")
    ]);

    (categoriesResult?.data || []).forEach(cat => { categoryMap[cat.id] = cat.name; });

    const data = itemsResult?.data;
    allItems = data?.items || [];
    totalPages = data?.totalPages || 1;
    currentPage = data?.page || 1;

    renderCategoryChips(categoriesResult?.data || []);
    renderItems(data?.totalCount ?? allItems.length);
  } catch (err) {
    grid.innerHTML = "";
    showToast(err.message, "error");
    document.getElementById("emptyState").style.display = "block";
  }
}

function renderCategoryChips(allCategories) {
  const wrap = document.getElementById("categoryChips");
  if (wrap.dataset.built === "true") return;
  wrap.dataset.built = "true";

  allCategories.forEach(cat => {
    const btn = document.createElement("button");
    btn.className = "category-chip";
    btn.dataset.category = cat.id;
    btn.textContent = cat.name;
    btn.addEventListener("click", () => {
      activeCategory = cat.id;
      currentPage = 1;
      document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
      btn.classList.add("active");
      loadItems();
    });
    wrap.appendChild(btn);
  });

  document.querySelector('.category-chip[data-category="all"]').addEventListener("click", (e) => {
    activeCategory = "all";
    currentPage = 1;
    document.querySelectorAll(".category-chip").forEach(c => c.classList.remove("active"));
    e.target.classList.add("active");
    loadItems();
  });
}

function renderItems(totalCount) {
  const grid = document.getElementById("itemGrid");
  const emptyState = document.getElementById("emptyState");
  const pagination = document.getElementById("catalogPagination");

  if (allItems.length === 0) {
    grid.innerHTML = "";
    emptyState.style.display = "block";
    pagination.style.display = "none";
    return;
  }
  emptyState.style.display = "none";

  grid.innerHTML = allItems.map(item => renderItemCard(item)).join("");

  allItems.forEach(item => {
    const card = document.getElementById(`item-${item.id}`);
    const addBtn = card?.querySelector(".add-to-cart-btn");
    if (addBtn) addBtn.addEventListener("click", () => addToCart(item));
  });

  if (totalPages > 1) {
    pagination.style.display = "flex";
    document.getElementById("catalogPageInfo").textContent = `Page ${currentPage} of ${totalPages} · ${totalCount} items`;
    document.getElementById("catalogPrevBtn").disabled = currentPage <= 1;
    document.getElementById("catalogNextBtn").disabled = currentPage >= totalPages;
  } else {
    pagination.style.display = "none";
  }
}

function renderItemCard(item) {
  const available = item.quantity > 0;
  const initial = (item.title || "?").charAt(0).toUpperCase();

  return `
    <div class="item-card ${available ? "" : "unavailable"}" id="item-${item.id}">
      <div class="item-thumb">
        ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.title}">` : initial}
      </div>
      <div class="item-body">
        <div class="item-name">${item.title}</div>
        <div class="item-meta">${available ? `${item.quantity} in stock` : "Out of stock"}</div>
        <div class="item-footer">
          <span class="item-price">${formatNaira(item.price)}</span>
          <button class="add-to-cart-btn" ${available ? "" : "disabled"}>
            ${available ? "Add" : "Unavailable"}
          </button>
        </div>
      </div>
    </div>
  `;
}

/* ---------- Cart ---------- */
function addToCart(item) {
  if (cart[item.id]) {
    cart[item.id].quantity += 1;
  } else {
    cart[item.id] = { item, quantity: 1 };
  }
  renderCart();
  showToast(`${item.title} added to your order.`, "success");
}

function updateCartQuantity(itemId, delta) {
  const entry = cart[itemId];
  if (!entry) return;

  entry.quantity += delta;
  if (entry.quantity <= 0) delete cart[itemId];
  renderCart();
}

function removeFromCart(itemId) {
  delete cart[itemId];
  renderCart();
}

function renderCart() {
  sessionStorage.setItem("oe_cart", JSON.stringify(cart));

  const body = document.getElementById("cartBody");
  const entries = Object.values(cart);
  const countEl = document.getElementById("cartCount");
  const totalEl = document.getElementById("cartTotal");
  const checkoutBtn = document.getElementById("checkoutBtn");

  const totalCount = entries.reduce((sum, e) => sum + e.quantity, 0);
  countEl.textContent = totalCount;
  countEl.style.display = totalCount > 0 ? "flex" : "none";

  if (entries.length === 0) {
    body.innerHTML = `
      <div class="empty-state" id="cartEmptyState">
        <h3>Your cart is empty</h3>
        <p>Add items from the catalogue to get started.</p>
      </div>`;
    totalEl.textContent = formatNaira(0);
    checkoutBtn.disabled = true;
    return;
  }

  let total = 0;
  body.innerHTML = entries.map(({ item, quantity }) => {
    total += item.price * quantity;
    const initial = (item.title || "?").charAt(0).toUpperCase();
    return `
      <div class="cart-line">
        <div class="cart-line-thumb">${item.imageUrl ? `<img src="${item.imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm);">` : initial}</div>
        <div class="cart-line-info">
          <div class="name">${item.title}</div>
          <div class="price">${formatNaira(item.price)} each</div>
          <div class="cart-line-qty">
            <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
            <span>${quantity}</span>
            <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
          </div>
        </div>
        <button class="cart-remove-btn" data-id="${item.id}">Remove</button>
      </div>
    `;
  }).join("");

  totalEl.textContent = formatNaira(total);
  checkoutBtn.disabled = false;

  body.querySelectorAll('[data-action="inc"]').forEach(btn =>
    btn.addEventListener("click", () => updateCartQuantity(btn.dataset.id, 1)));
  body.querySelectorAll('[data-action="dec"]').forEach(btn =>
    btn.addEventListener("click", () => updateCartQuantity(btn.dataset.id, -1)));
  body.querySelectorAll(".cart-remove-btn").forEach(btn =>
    btn.addEventListener("click", () => removeFromCart(btn.dataset.id)));
}

function initCartDrawer() {
  const drawer = document.getElementById("cartDrawer");
  const overlay = document.getElementById("cartOverlay");

  const open = () => { drawer.classList.add("open"); overlay.classList.add("open"); };
  const close = () => { drawer.classList.remove("open"); overlay.classList.remove("open"); };

  document.getElementById("cartToggleBtn").addEventListener("click", open);
  document.getElementById("cartCloseBtn").addEventListener("click", close);
  overlay.addEventListener("click", close);

  document.getElementById("checkoutBtn").addEventListener("click", () => {
    sessionStorage.setItem("oe_cart", JSON.stringify(cart));

    if (!TokenStore.get()) {
      showToast("Sign in to complete your order — your cart is saved.", "info");
      window.location.href = "login.html?redirect=checkout";
      return;
    }
    window.location.href = "checkout.html";
  });
}

function initSearchAndFilter() {
  const input = document.getElementById("searchInput");
  input.addEventListener("input", (e) => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      searchTerm = e.target.value.trim();
      currentPage = 1;
      loadItems();
    }, 300); 
  });

  document.getElementById("catalogPrevBtn").addEventListener("click", () => {
    if (currentPage > 1) { currentPage--; loadItems(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });

  document.getElementById("catalogNextBtn").addEventListener("click", () => {
    if (currentPage < totalPages) { currentPage++; loadItems(); window.scrollTo({ top: 0, behavior: "smooth" }); }
  });
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}