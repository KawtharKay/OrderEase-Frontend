/* ==========================================================================
   OrderEase My Orders Logic
   ========================================================================== */

const orderDetailCache = {};
let allOrders = [];
let orderSearchTerm = "";

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_customer");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  document.getElementById("orderSearchInput").addEventListener("input", (e) => {
    orderSearchTerm = e.target.value.trim().toLowerCase();
    renderOrders();
  });

  await loadOrders();
});

async function loadOrders() {
  const list = document.getElementById("ordersList");
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading your orders...</p>`;

  try {
    const result = await Api.get("/Orders/my-orders");
    allOrders = result?.data || [];
    allOrders.sort((a, b) => new Date(b.orderDate) - new Date(a.orderDate));
    renderOrders();
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}

function renderOrders() {
  const list = document.getElementById("ordersList");
  const emptyState = document.getElementById("emptyState");

  const filtered = orderSearchTerm
    ? allOrders.filter(o =>
        o.orderNumber.toLowerCase().includes(orderSearchTerm) ||
        o.orderStatus.toLowerCase().includes(orderSearchTerm)
      )
    : allOrders;

  if (allOrders.length === 0) {
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector("h3").textContent = "No orders yet";
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector("h3").textContent = "No orders match your search";
    return;
  }

  emptyState.style.display = "none";
  list.innerHTML = filtered.map(renderOrderCard).join("");

  filtered.forEach(order => {
    document.getElementById(`head-${order.id}`).addEventListener("click", () => toggleOrder(order.id));
  });
}

function renderOrderCard(order) {
  return `
    <div class="order-card">
      <div class="order-card-head" id="head-${order.id}">
        <div>
          <div class="order-id">${order.orderNumber}</div>
          <div class="order-date">${formatDate(order.orderDate)}</div>
        </div>
        <span class="status-badge status-${order.orderStatus}">${order.orderStatus}</span>
        <div class="order-total">${formatNaira(order.totalPrice)}</div>
        <span class="order-caret">▾</span>
      </div>
      <div class="order-detail" id="detail-${order.id}">
        <p style="color:var(--color-ink-soft); font-size:var(--fs-sm);">Loading items...</p>
      </div>
    </div>
  `;
}

async function toggleOrder(orderId) {
  const head = document.getElementById(`head-${orderId}`);
  const detail = document.getElementById(`detail-${orderId}`);

  const isOpen = detail.classList.toggle("open");
  head.classList.toggle("expanded", isOpen);

  if (isOpen && !orderDetailCache[orderId]) {
    try {
      const result = await Api.get(`/Orders/${orderId}`);
      orderDetailCache[orderId] = result.data;
      renderOrderDetail(orderId, result.data);
    } catch (err) {
      detail.innerHTML = `<p style="color:var(--color-danger); font-size:var(--fs-sm);">Couldn't load items: ${err.message}</p>`;
    }
  }
}

function renderOrderDetail(orderId, order) {
  const detail = document.getElementById(`detail-${orderId}`);

  const itemLines = order.orderItems.map(item => `
    <div class="order-detail-line">
      <div>
        <div class="item-name">${item.title}</div>
        <div class="item-qty">Qty ${item.quantity} × ${formatNaira(item.unitPrice)}</div>
      </div>
      <div class="item-price">${formatNaira(item.subTotal)}</div>
    </div>
  `).join("");

  const payButton = order.outstandingBalance > 0
    ? `<button class="btn btn-primary btn-block" style="margin-top: var(--sp-3);" onclick="payOutstandingBalance('${orderId}')">Pay ${formatNaira(order.outstandingBalance)} now</button>`
    : "";

  const summary = `
    <div class="order-payment-summary">
      <div class="order-payment-row"><span>Order total</span><span class="mono">${formatNaira(order.totalPrice)}</span></div>
      ${order.walletAmountUsed > 0 ? `<div class="order-payment-row"><span>Paid from wallet</span><span class="mono">${formatNaira(order.walletAmountUsed)}</span></div>` : ""}
      <div class="order-payment-row"><span>Total paid</span><span class="mono paid">${formatNaira(order.totalPaid)}</span></div>
      <div class="order-payment-row total"><span>Outstanding balance</span><span class="mono ${order.outstandingBalance > 0 ? "owed" : "cleared"}">${order.outstandingBalance > 0 ? formatNaira(order.outstandingBalance) : "Cleared"}</span></div>
      ${payButton}
    </div>
  `;

  detail.innerHTML = itemLines + summary;
}

async function payOutstandingBalance(orderId) {
  try {
    const result = await Api.post("/Payments/initiate", { orderId });
    window.location.href = result.data.authorizationUrl;
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}