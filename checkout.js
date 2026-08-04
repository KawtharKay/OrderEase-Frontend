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
      ? `${formatNaira(walletApplied)} will be deducted from your wallet automatically. You'll pay the remaining ${formatNaira(remaining)} via Paystack.`
      : `This order is fully covered by your wallet balance — no payment needed.`;
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

    if (order.amountOwed > 0) {
      const paymentResult = await Api.post("/Payments/initiate", { orderId: order.id });
      sessionStorage.removeItem("oe_cart");
      window.location.href = paymentResult.data.authorizationUrl;
      return;
    }

    sessionStorage.removeItem("oe_cart");
    showToast("Order placed! Fully covered by your wallet balance.", "success");
    setTimeout(() => { window.location.href = "myOrders.html"; }, 1200);

  } catch (err) {
    showToast(err.message, "error");
    setButtonLoading(btn, false);
  }
}