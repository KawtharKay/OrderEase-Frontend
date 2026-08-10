/* ==========================================================================
   OrderEase Checkout
   ========================================================================== */

let checkoutCart = {};

document.addEventListener("DOMContentLoaded", async () => {
  if (!TokenStore.get() || !TokenStore.getUser()) {
    window.location.href = "login.html?redirect=checkout";
    return;
  }
  const user = requireAuth("app_customer");
  if (!user) return;

  loadCart();
  initDeliveryOptions();
  await loadWalletBalance();

  document.getElementById("placeOrderBtn").addEventListener("click", placeOrder);
});

function loadCart() {
  try {
    checkoutCart = JSON.parse(sessionStorage.getItem("oe_cart") || "{}");
  } catch {
    checkoutCart = {};
  }

  const entries = Object.values(checkoutCart);

  if (entries.length === 0) {
    document.getElementById("checkoutContent").style.display = "none";
    document.getElementById("checkoutEmpty").style.display = "block";
    return;
  }

  renderOrderLines(entries);
  updateSummary(entries);
}

function renderOrderLines(entries) {
  const wrap = document.getElementById("orderLines");
  wrap.innerHTML = entries.map(({ item, quantity }) => {
    const initial = (item.title || "?").charAt(0).toUpperCase();
    return `
      <div class="checkout-line">
        <div class="checkout-line-thumb">${item.imageUrl ? `<img src="${item.imageUrl}" style="width:100%;height:100%;object-fit:cover;border-radius:var(--radius-sm);">` : initial}</div>
        <div class="checkout-line-info">
          <div class="name">${item.title}</div>
          <div class="qty">Qty ${quantity} × ${formatNaira(item.price)}</div>
        </div>
        <div class="checkout-line-price">${formatNaira(item.price * quantity)}</div>
      </div>
    `;
  }).join("");
}

function getSubtotal(entries) {
  return entries.reduce((sum, { item, quantity }) => sum + item.price * quantity, 0);
}

let walletBalance = 0;

async function loadWalletBalance() {
  try {
    const result = await Api.get("/Wallet/balance");
    walletBalance = result?.data?.balance || 0;
  } catch {
    walletBalance = 0;
  }
  updateSummary(Object.values(checkoutCart));
}

function updateSummary(entries) {
  const subtotal = getSubtotal(entries);
  const walletApplied = Math.min(walletBalance, subtotal);
  const remaining = subtotal - walletApplied;

  document.getElementById("summarySubtotal").textContent = formatNaira(subtotal);
  document.getElementById("summaryWallet").textContent = `${formatNaira(walletApplied)} of ${formatNaira(walletBalance)}`;
  document.getElementById("summaryTotal").textContent = formatNaira(remaining);

  const note = document.getElementById("walletNote");
  if (walletApplied > 0) {
    note.style.display = "block";
    note.textContent = remaining > 0
      ? `${formatNaira(walletApplied)} will be deducted from your wallet automatically. You'll choose how to handle the remaining ${formatNaira(remaining)} after placing the order.`
      : `This order is fully covered by your wallet balance — no further payment needed.`;
  } else {
    note.style.display = "none";
  }
}

function initDeliveryOptions() {
  const options = document.querySelectorAll(".delivery-option");
  options.forEach(opt => {
    opt.addEventListener("click", () => {
      options.forEach(o => o.classList.remove("selected"));
      opt.classList.add("selected");
      opt.querySelector("input").checked = true;
    });
  });
  options[0].classList.add("selected");
}

async function placeOrder() {
  const btn = document.getElementById("placeOrderBtn");
  const entries = Object.values(checkoutCart);
  if (entries.length === 0) return;

  const deliveryMethod = Number(document.querySelector('input[name="deliveryMethod"]:checked').value);

  setButtonLoading(btn, true, "Placing order...");

  try {
    const orderResult = await Api.post("/Orders", {
      items: entries.map(({ item, quantity }) => ({ itemId: item.id, quantity }))
    });
    const order = orderResult.data;

    try {
      await Api.post("/Delivery/create-delivery", {
        orderId: order.id,
        deliveryMethod
      });
    } catch (deliveryErr) {
      showToast(`Order placed, but delivery method couldn't be saved: ${deliveryErr.message}`, "error");
    }

    sessionStorage.removeItem("oe_cart");

    if (order.amountOwed > 0) {
      showPayChoiceModal(order);
    } else {
      showToast("Order placed! Fully covered by your wallet balance.", "success");
      setTimeout(() => { window.location.href = "myOrders.html"; }, 1200);
    }
  } catch (err) {
    showToast(err.message, "error");
    setButtonLoading(btn, false);
  }
}

function showPayChoiceModal(order) {
  const overlay = document.createElement("div");
  overlay.style.cssText = `
    position: fixed; inset: 0; background: rgba(43,36,32,0.45);
    display: flex; align-items: center; justify-content: center; z-index: 100;
  `;
  overlay.innerHTML = `
    <div style="background: var(--color-white); border-radius: var(--radius-lg); padding: var(--sp-6); max-width: 420px; width: 90%; text-align: center;">
      <h2 style="margin-bottom: var(--sp-2);">Order placed!</h2>
      <p style="color: var(--color-ink-soft); margin-bottom: var(--sp-5);">
        ₦${order.amountOwed.toFixed(2)} is still outstanding on this order. Would you like to pay now, or pay later from My Orders?
      </p>
      <button class="btn btn-primary btn-block" id="payChoiceNowBtn" style="margin-bottom: var(--sp-3);">Pay now</button>
      <button class="btn btn-outline btn-block" id="payChoiceLaterBtn">Pay later</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("payChoiceNowBtn").addEventListener("click", () => {
    overlay.remove();
    showPayAmountModal(order.id, order.amountOwed);
  });

  document.getElementById("payChoiceLaterBtn").addEventListener("click", () => {
    window.location.href = "myOrders.html";
  });
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
      <button class="btn btn-outline btn-block" id="payAmountCancelBtn">Pay later instead</button>
    </div>
  `;
  document.body.appendChild(overlay);

  document.getElementById("payAmountCancelBtn").addEventListener("click", () => {
    window.location.href = "myOrders.html";
  });
  overlay.addEventListener("click", (e) => { if (e.target === overlay) window.location.href = "myOrders.html"; });

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