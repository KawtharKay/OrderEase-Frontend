/* ==========================================================================
   OrderEase Return Requests Logic
   ========================================================================== */

let myOrders = [];
let itemCategoryMap = {};
let currentOrderItems = [];
let allReturnRequests = [];
let returnSearchTerm = "";
const returnDetailCache = {};

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_customer");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  initModal();

  document.getElementById("orderSelect").addEventListener("change", onOrderSelected);
  document.getElementById("returnForm").addEventListener("submit", submitReturnRequest);
  document.getElementById("returnSearchInput").addEventListener("input", (e) => {
    returnSearchTerm = e.target.value.trim().toLowerCase();
    renderReturnRequests();
  });

  await Promise.all([loadReturnRequests(), loadOrdersForDropdown(), loadItemCategoryMap()]);
});

async function loadReturnRequests() {
  const list = document.getElementById("returnsList");
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading return requests...</p>`;

  try {
    const result = await Api.get("/ReturnRequests/my-requests");
    allReturnRequests = result?.data || [];
    allReturnRequests.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
    renderReturnRequests();
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}

function renderReturnRequests() {
  const list = document.getElementById("returnsList");
  const emptyState = document.getElementById("emptyState");

  const filtered = returnSearchTerm
    ? allReturnRequests.filter(r =>
        r.orderNumber.toLowerCase().includes(returnSearchTerm) ||
        r.reason.toLowerCase().includes(returnSearchTerm) ||
        r.status.toLowerCase().includes(returnSearchTerm)
      )
    : allReturnRequests;

  if (allReturnRequests.length === 0) {
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector("h3").textContent = "No return requests yet";
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector("h3").textContent = "No return requests match your search";
    return;
  }

  emptyState.style.display = "none";
  list.innerHTML = filtered.map(r => `
      <div class="return-card" id="head-${r.id}">
        <div>
          <div class="order-ref">Return for order ${r.orderNumber}</div>
          <div class="reason">${r.reason}</div>
          <div class="date">${formatDate(r.dateCreated)}</div>
        </div>
        <span class="status-badge status-${r.status}">${r.status}</span>
      </div>
      <div class="return-detail" id="detail-${r.id}"></div>
    `).join("");

  filtered.forEach(r => {
    document.getElementById(`head-${r.id}`).addEventListener("click", () => toggleReturnDetail(r.id));
  });
}

async function toggleReturnDetail(id) {
  const detail = document.getElementById(`detail-${id}`);
  const isOpen = detail.classList.toggle("open");
  if (!isOpen) return;

  if (returnDetailCache[id]) {
    renderReturnDetail(id, returnDetailCache[id]);
    return;
  }

  detail.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm); padding: var(--sp-3) var(--sp-5);">Loading details...</p>`;

  try {
    const result = await Api.get(`/ReturnRequests/${id}`);
    returnDetailCache[id] = result.data;
    renderReturnDetail(id, result.data);
  } catch (err) {
    detail.innerHTML = `<p style="color:var(--color-danger); font-size:var(--fs-sm); padding: var(--sp-3) var(--sp-5);">Couldn't load details: ${err.message}</p>`;
  }
}

function renderReturnDetail(id, r) {
  const detail = document.getElementById(`detail-${id}`);

  const itemLines = r.returnRequestItems.map(item => `
    <div class="order-detail-line">
      <div>
        <div class="item-name">${item.title}</div>
        <div class="item-qty">Qty ${item.quantity} × ${formatNaira(item.unitPrice)}</div>
      </div>
      <div class="item-price">${formatNaira(item.subTotal)}</div>
    </div>
  `).join("");

  let outcome = "";
  if (r.status === "Approved") {
    outcome = `
      <div class="order-payment-summary">
        <div class="order-payment-row"><span>Total refund value</span><span class="mono">${formatNaira(r.refundAmount)}</span></div>
        ${r.walletCreditAmount > 0 ? `<div class="order-payment-row"><span>Credited to your wallet</span><span class="mono paid">+${formatNaira(r.walletCreditAmount)}</span></div>` : ""}
        ${r.debtReductionAmount > 0 ? `<div class="order-payment-row"><span>Deducted from outstanding balance</span><span class="mono paid">${formatNaira(r.debtReductionAmount)}</span></div>` : ""}
      </div>
    `;
  } else if (r.status === "Rejected" && r.rejectionReason) {
    outcome = `
      <div class="order-payment-summary">
        <div class="order-payment-row"><span>Rejection reason</span></div>
        <p style="font-size: var(--fs-sm); color: var(--color-ink); margin-top: var(--sp-1);">${r.rejectionReason}</p>
      </div>
    `;
  }

  detail.innerHTML = itemLines + outcome;
}

async function loadOrdersForDropdown() {
  try {
    const result = await Api.get("/Orders/my-orders");
    myOrders = result?.data || [];

    const select = document.getElementById("orderSelect");
    myOrders
      .filter(order => order.orderStatus === "Delivered")
      .sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate))
      .forEach(order => {
        const opt = document.createElement("option");
        opt.value = order.id;
        opt.textContent = `${order.orderNumber} — ${formatNaira(order.totalPrice)}`;
        select.appendChild(opt);
      });

    if (select.options.length === 1) {
      const opt = document.createElement("option");
      opt.disabled = true;
      opt.textContent = "No delivered orders yet — returns are only available once an order is delivered";
      select.appendChild(opt);
    }
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function loadItemCategoryMap() {
  try {
    const result = await Api.get("/Item");
    (result?.data || []).forEach(item => { itemCategoryMap[item.id] = item.categoryId; });
  } catch {}
}

function initModal() {
  const overlay = document.getElementById("returnModal");
  const open = () => { overlay.classList.add("open"); };
  const close = () => { overlay.classList.remove("open"); resetForm(); };

  document.getElementById("newReturnBtn").addEventListener("click", open);
  document.getElementById("modalCloseBtn").addEventListener("click", close);
  overlay.addEventListener("click", (e) => { if (e.target === overlay) close(); });
}

function resetForm() {
  document.getElementById("returnForm").reset();
  document.getElementById("returnItemsSection").style.display = "none";
  document.getElementById("returnItemsList").innerHTML = "";
  document.getElementById("categoryWarning").classList.remove("show");
  currentOrderItems = [];
}

async function onOrderSelected(e) {
  const orderId = e.target.value;
  const section = document.getElementById("returnItemsSection");
  const list = document.getElementById("returnItemsList");

  if (!orderId) {
    section.style.display = "none";
    return;
  }

  list.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm);">Loading items...</p>`;
  section.style.display = "block";

  try {
    const result = await Api.get(`/Orders/${orderId}`);
    currentOrderItems = result.data.orderItems;
    renderReturnItems();
  } catch (err) {
    list.innerHTML = `<p style="color:var(--color-danger); font-size:var(--fs-sm);">${err.message}</p>`;
  }
}

function renderReturnItems() {
  const list = document.getElementById("returnItemsList");

  list.innerHTML = currentOrderItems.map(item => `
    <div class="return-item-row" id="row-${item.itemId}">
      <input type="checkbox" class="return-item-check" data-item-id="${item.itemId}">
      <div class="item-name">${item.title}</div>
      <div class="item-ordered">of ${item.quantity} ordered</div>
      <input type="number" class="qty-input" data-item-id="${item.itemId}" min="1" max="${item.quantity}" value="1" disabled>
    </div>
  `).join("");

  list.querySelectorAll(".return-item-check").forEach(cb => {
    cb.addEventListener("change", () => {
      const qtyInput = list.querySelector(`.qty-input[data-item-id="${cb.dataset.itemId}"]`);
      qtyInput.disabled = !cb.checked;
      validateCategorySelection();
    });
  });
}

function getSelectedReturnItems() {
  const list = document.getElementById("returnItemsList");
  return [...list.querySelectorAll(".return-item-check:checked")].map(cb => {
    const itemId = cb.dataset.itemId;
    const qty = Number(list.querySelector(`.qty-input[data-item-id="${itemId}"]`).value);
    return { itemId, quantity: qty };
  });
}

function validateCategorySelection() {
  const selected = getSelectedReturnItems();
  const warning = document.getElementById("categoryWarning");

  const categories = new Set(selected.map(s => itemCategoryMap[s.itemId]).filter(Boolean));
  const isMixed = categories.size > 1;
  warning.classList.toggle("show", isMixed);
  return !isMixed;
}

async function submitReturnRequest(e) {
  e.preventDefault();

  const selected = getSelectedReturnItems();
  const reason = document.getElementById("reasonInput").value.trim();
  const btn = document.getElementById("submitReturnBtn");

  if (selected.length === 0) {
    showToast("Select at least one item to return.", "error");
    return;
  }
  if (!validateCategorySelection()) {
    showToast("Items must all be from the same category.", "error");
    return;
  }

  const categoryId = itemCategoryMap[selected[0].itemId];
  const orderId = document.getElementById("orderSelect").value;

  setButtonLoading(btn, true, "Submitting...");

  try {
    await Api.post("/ReturnRequests", { orderId, categoryId, reason, items: selected });

    showToast("Return request submitted.", "success");
    document.getElementById("returnModal").classList.remove("open");
    resetForm();
    await loadReturnRequests();
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