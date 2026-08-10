/* ==========================================================================
   OrderEase My Orders Logic
   ========================================================================== */

const orderDetailCache = {};
let allOrders = [];
let orderSearchTerm = "";
let walletBalance = 0;

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_customer");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  document.getElementById("orderSearchInput").addEventListener("input", (e) => {
    orderSearchTerm = e.target.value.trim().toLowerCase();
    renderOrders();
  });

  await Promise.all([loadOrders(), loadWalletBalance()]);
});

async function loadWalletBalance() {
  try {
    const result = await Api.get("/Wallet/balance");
    walletBalance = result?.data?.balance || 0;
  } catch {
    walletBalance = 0;
  }
}

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
    await fetchAndRenderOrderDetail(orderId);
  }
}

async function fetchAndRenderOrderDetail(orderId) {
  const detail = document.getElementById(`detail-${orderId}`);
  try {
    const result = await Api.get(`/Orders/${orderId}`);
    orderDetailCache[orderId] = result.data;
    renderOrderDetail(orderId, result.data);
  } catch (err) {
    detail.innerHTML = `<p style="color:var(--color-danger); font-size:var(--fs-sm);">Couldn't load items: ${err.message}</p>`;
  }
}

function renderOrderDetail(orderId, order) {
  const detail = document.getElementById(`detail-${orderId}`);
  const isCancelled = order.orderStatus === "Cancelled";

  const itemLines = order.orderItems.map(item => `
    <div class="order-detail-line">
      <div>
        <div class="item-name">${item.title}</div>
        <div class="item-qty">Qty ${item.quantity} × ${formatNaira(item.unitPrice)}</div>
      </div>
      <div class="item-price">${formatNaira(item.subTotal)}</div>
    </div>
  `).join("");

  let paymentButtons = "";
  if (order.outstandingBalance > 0 && !isCancelled) {
    const walletButton = walletBalance > 0
      ? `<button class="btn btn-outline btn-block" style="margin-top: var(--sp-2);" onclick="useWallet('${orderId}')">Use wallet (${formatNaira(walletBalance)} available)</button>`
      : "";
    paymentButtons = `
      <button class="btn btn-primary btn-block" style="margin-top: var(--sp-3);" onclick="payViaPaystack('${orderId}')">Pay</button>
      ${walletButton}
    `;
  }

  const cancelButton = (order.orderStatus !== "Delivered" && !isCancelled)
    ? `<button class="btn btn-outline btn-block" style="margin-top: var(--sp-2);" onclick="cancelOrder('${orderId}')">Cancel order</button>`
    : "";

  const summary = `
    <div class="order-payment-summary">
      <div class="order-payment-row"><span>Order total</span><span class="mono">${formatNaira(order.totalPrice)}</span></div>
      ${order.walletAmountUsed > 0 ? `<div class="order-payment-row"><span>Paid from wallet</span><span class="mono">${formatNaira(order.walletAmountUsed)}</span></div>` : ""}
      <div class="order-payment-row"><span>Total paid</span><span class="mono paid">${formatNaira(order.totalPaid)}</span></div>
      <div class="order-payment-row total"><span>Outstanding balance</span><span class="mono ${order.outstandingBalance > 0 && !isCancelled ? "owed" : "cleared"}">${isCancelled ? "—" : (order.outstandingBalance > 0 ? formatNaira(order.outstandingBalance) : "Cleared")}</span></div>
      ${paymentButtons}
      ${cancelButton}
    </div>
  `;

  detail.innerHTML = itemLines + summary;
}

async function useWallet(orderId) {
  try {
    const result = await Api.post(`/Orders/${orderId}/pay-with-wallet`, {});
    showToast(result.message, "success");
    delete orderDetailCache[orderId];
    await fetchAndRenderOrderDetail(orderId);
    await loadWalletBalance();
    renderOrderDetail(orderId, orderDetailCache[orderId]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function payViaPaystack(orderId) {
  const order = orderDetailCache[orderId];
  showPayAmountModal(orderId, order.outstandingBalance);
}

function showPayAmountModal(orderId, maxAmount) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(43,36,32,0.45);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  `;
  overlay.innerHTML = `
    <div style="background: var(--color-white); border-radius: var(--radius-lg); padding: var(--sp-6); max-width: 380px; width: 90%;">
      <h2 style="margin-bottom: var(--sp-2); text-align:center;">Pay via Paystack</h2>
      <p style="color: var(--color-ink-soft); margin-bottom: var(--sp-4); text-align:center;">
        Enter how much you'd like to pay now (up to ${formatNaira(maxAmount)}).
      </p>
      <input type="number" id="payAmountInput"
        style="width:100%; height:46px; padding:0 var(--sp-4); border:1.5px solid var(--color-border); border-radius:var(--radius-sm);
               font-family: var(--font-mono); font-size: var(--fs-md); text-align:center; margin-bottom: var(--sp-2);"
        value="${maxAmount.toFixed(2)}" min="1" max="${maxAmount}" step="0.01">
      <div id="payAmountError" style="color: var(--color-danger); font-size: var(--fs-xs); text-align:center; min-height: 16px; margin-bottom: var(--sp-4);"></div>
      <button class="btn btn-primary btn-block" id="payAmountConfirmBtn" style="margin-bottom: var(--sp-3);">Continue to Paystack</button>
      <button class="btn btn-outline btn-block" id="payAmountCancelBtn">Cancel</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("payAmountCancelBtn").addEventListener("click", () => overlay.remove());
  overlay.addEventListener("click", (e) => { if (e.target === overlay) overlay.remove(); });

  document.getElementById("payAmountConfirmBtn").addEventListener("click", async () => {
    const input = document.getElementById("payAmountInput");
    const errorEl = document.getElementById("payAmountError");
    const amount = Number(input.value);

    if (!amount || amount <= 0 || amount > maxAmount) {
      errorEl.textContent = `Enter an amount between ₦0 and ${formatNaira(maxAmount)}`;
      return;
    }

    const btn = document.getElementById("payAmountConfirmBtn");
    setButtonLoading(btn, true, "Redirecting...");

    try {
      const result = await Api.post("/Payments/initiate", { orderId, amount });
      window.location.href = result.data.authorizationUrl;
    } catch (err) {
      errorEl.textContent = err.message;
      setButtonLoading(btn, false);
    }
  });
}

async function cancelOrder(orderId) {
  if (!confirm("Cancel this order? Any amount already paid will be refunded to your wallet. This can't be undone.")) return;

  try {
    const result = await Api.post(`/Orders/${orderId}/cancel`, {});
    showToast(result.message, "success");
    delete orderDetailCache[orderId];
    await Promise.all([loadOrders(), loadWalletBalance()]);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}