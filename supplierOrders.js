/* ==========================================================================
   OrderEase Supplier — Orders Fulfillment Logic
   ========================================================================== */

const ORDER_STATUSES = [
  { value: 1, label: "Received" },
  { value: 2, label: "Processing" },
  { value: 3, label: "Dispatched" },
  { value: 4, label: "ReadyForPickup" },
  { value: 5, label: "Delivered" }
];

const DELIVERY_METHODS = [
  { value: 1, label: "Dispatch Rider" },
  { value: 2, label: "Motor Park" },
  { value: 3, label: "Customer Pickup" }
];

let allOrders = [];
let orderDetailLoaded = {};
let orderSearchTerm = "";

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_supplier");
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
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading orders...</p>`;

  try {
    const result = await Api.get("/Orders");
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
        o.customerName.toLowerCase().includes(orderSearchTerm) ||
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
  list.innerHTML = filtered.map(renderOrderRow).join("");

  filtered.forEach(order => {
    document.getElementById(`status-${order.id}`).addEventListener("change", (e) => updateStatus(order.id, e.target.value));
    document.getElementById(`toggle-${order.id}`).addEventListener("click", () => toggleOrderDetail(order.id));
  });
}

function renderOrderRow(order) {
  const statusOptions = ORDER_STATUSES.map(s =>
    `<option value="${s.value}" ${s.label === order.orderStatus ? "selected" : ""}>${s.label}</option>`
  ).join("");

  return `
    <div class="sup-order-row">
      <div class="sup-order-main">
        <div class="num">${order.orderNumber}</div>
        <div class="cust">${order.customerName} · ${formatDate(order.orderDate)}</div>
      </div>
      <div class="sup-order-total">${formatNaira(order.totalPrice)}</div>
      <select class="status-select" id="status-${order.id}">${statusOptions}</select>
      <button class="sup-order-toggle" id="toggle-${order.id}">▾</button>
      <div class="sup-order-detail" id="detail-${order.id}">
        <p style="color:var(--color-ink-soft);">Loading order details...</p>
      </div>
    </div>
  `;
}

async function updateStatus(orderId, statusValue) {
  try {
    await Api.patch(`/Orders/${orderId}/status`, { status: Number(statusValue) });
    showToast("Order status updated.", "success");
  } catch (err) {
    showToast(err.message, "error");
    await loadOrders();
  }
}

async function toggleOrderDetail(orderId) {
  const detail = document.getElementById(`detail-${orderId}`);
  const isOpen = detail.classList.toggle("open");

  if (isOpen && !orderDetailLoaded[orderId]) {
    try {
      const [orderResult, deliveryResult] = await Promise.allSettled([
        Api.get(`/Orders/${orderId}`),
        Api.get(`/Delivery/order/${orderId}`)
      ]);

      const order = orderResult.status === "fulfilled" ? orderResult.value.data : null;
      const deliveryMethod = (deliveryResult.status === "fulfilled" && deliveryResult.value.data) ? deliveryResult.value.data.deliveryMethod : null;

      renderOrderDetail(orderId, order, deliveryMethod);
    } catch (err) {
      detail.innerHTML = `<p style="color:var(--color-danger);">Couldn't load order details: ${err.message}</p>`;
    }
    orderDetailLoaded[orderId] = true;
  }
}

function renderOrderDetail(orderId, order, deliveryMethod) {
  const detail = document.getElementById(`detail-${orderId}`);

  const itemLines = order
    ? order.orderItems.map(item => `
        <div class="order-detail-line">
          <div>
            <div class="item-name">${item.title}</div>
            <div class="item-qty">Qty ${item.quantity} × ${formatNaira(item.unitPrice)}</div>
          </div>
          <div class="item-price">${formatNaira(item.subTotal)}</div>
        </div>
      `).join("")
    : `<p style="color:var(--color-danger); font-size:var(--fs-sm);">Couldn't load order items.</p>`;

  const summary = order ? `
    <div class="order-payment-summary">
      <div class="order-payment-row"><span>Order total</span><span class="mono">${formatNaira(order.totalPrice)}</span></div>
      ${order.walletAmountUsed > 0 ? `<div class="order-payment-row"><span>Paid from wallet</span><span class="mono">${formatNaira(order.walletAmountUsed)}</span></div>` : ""}
      <div class="order-payment-row"><span>Total paid</span><span class="mono paid">${formatNaira(order.totalPaid)}</span></div>
      <div class="order-payment-row total"><span>Outstanding balance</span><span class="mono ${order.outstandingBalance > 0 ? "owed" : "cleared"}">${order.outstandingBalance > 0 ? formatNaira(order.outstandingBalance) : "Cleared"}</span></div>
    </div>
  ` : "";

  const deliveryOptions = DELIVERY_METHODS.map(m => {
    const isSelected = deliveryMethod && deliveryMethod.replace(/\s/g, "") === m.label.replace(/\s/g, "");
    return `<option value="${m.value}" ${isSelected ? "selected" : ""}>${m.label}</option>`;
  }).join("");

  const deliveryBlock = `
    <div class="delivery-row" style="margin-top: var(--sp-3);">
      <label>Delivery method</label>
      <select class="delivery-select" id="delivery-${orderId}">${deliveryOptions}</select>
    </div>
  `;

  detail.innerHTML = itemLines + summary + deliveryBlock;
  document.getElementById(`delivery-${orderId}`).addEventListener("change", (e) => updateDelivery(orderId, e.target.value));
}

async function updateDelivery(orderId, methodValue) {
  try {
    await Api.patch(`/Delivery/${orderId}`, { deliveryMethod: Number(methodValue) });
    showToast("Delivery method updated.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}