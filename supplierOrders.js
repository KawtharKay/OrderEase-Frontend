/* ==========================================================================
   OrderEase Supplier -  Orders Fulfillment Logic
   ========================================================================== */

const ORDER_STATUSES = [
  { value: 1, label: "Received" },
  { value: 2, label: "Processing" },
  { value: 3, label: "Dispatched" },
  { value: 4, label: "ReadyForPickup" },
  { value: 5, label: "Delivered" },
  { value: 6, label: "Cancelled" },
  { value: 7, label: "Returned" }
];

const STATUS_SECTION_ORDER = ["Received", "Processing", "Dispatched", "ReadyForPickup", "Delivered", "Returned", "Cancelled"];
const DEFAULT_OPEN_STATUSES = new Set(["Received", "Processing"]);

const DELIVERY_METHODS = [
  { value: 1, label: "Dispatch Rider" },
  { value: 2, label: "Customer Pickup" }
];

const STATUS_DISPLAY_LABELS = {
  Received: "Received",
  Processing: "Processing",
  Dispatched: "Dispatched",
  ReadyForPickup: "Ready for Pickup",
  Delivered: "Delivered",
  Cancelled: "Cancelled",
  Returned: "Returned"
};

let allOrders = [];
let orderDetailLoaded = {};
let orderSearchTerm = "";
let chargeDrafts = {}; 
let expandedSections = {}; 

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_supplier");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  document.getElementById("orderSearchInput").addEventListener("input", (e) => {
    orderSearchTerm = e.target.value.trim().toLowerCase();
    renderOrders();
  });

  document.getElementById("locationsPanelHead").addEventListener("click", () => {
    const body = document.getElementById("locationsBody");
    const caret = document.getElementById("locationsCaret");
    const isOpen = body.style.display !== "none";
    body.style.display = isOpen ? "none" : "block";
    caret.classList.toggle("open", !isOpen);
  });
  document.getElementById("addLocationForm").addEventListener("submit", submitNewLocation);

  await Promise.all([loadOrders(), loadDeliveryLocations()]);
});

/* ---------- Delivery locations (preconfigured fee list) ---------- */
let deliveryLocations = [];

async function loadDeliveryLocations() {
  const list = document.getElementById("locationsList");
  try {
    const result = await Api.get("/DeliveryLocation/supplier");
    deliveryLocations = result?.data || [];
    renderDeliveryLocations();
  } catch (err) {
    list.innerHTML = `<p style="color:var(--color-danger); font-size:var(--fs-sm);">Couldn't load locations: ${err.message}</p>`;
  }
}

function renderDeliveryLocations() {
  const list = document.getElementById("locationsList");

  if (deliveryLocations.length === 0) {
    list.innerHTML = `<p style="color:var(--color-ink-soft); font-size:var(--fs-sm);">No delivery locations configured yet - Dispatch Rider orders will all need a manual fee until you add some.</p>`;
    return;
  }

  list.innerHTML = deliveryLocations.map(loc => `
    <div class="location-row ${loc.isActive ? "" : "inactive"}" data-id="${loc.id}">
      <input type="text" class="loc-name-input" value="${loc.name}" ${loc.isActive ? "" : "disabled"}>
      <input type="number" class="loc-fee-input" value="${loc.fee}" min="0" step="0.01" ${loc.isActive ? "" : "disabled"}>
      <button type="button" class="btn btn-outline btn-sm save-loc-btn">Save</button>
      <button type="button" class="btn btn-outline btn-sm toggle-loc-btn">${loc.isActive ? "Deactivate" : "Reactivate"}</button>
    </div>
  `).join("");

  list.querySelectorAll(".save-loc-btn").forEach(btn => {
    btn.addEventListener("click", (e) => saveLocation(e.target.closest(".location-row")));
  });
  list.querySelectorAll(".toggle-loc-btn").forEach(btn => {
    btn.addEventListener("click", (e) => toggleLocationActive(e.target.closest(".location-row")));
  });
}

async function submitNewLocation(e) {
  e.preventDefault();
  const nameInput = document.getElementById("newLocationName");
  const feeInput = document.getElementById("newLocationFee");
  const name = nameInput.value.trim();
  const fee = Number(feeInput.value);
  if (!name) return;

  try {
    await Api.post("/DeliveryLocation/create", { name, fee });
    nameInput.value = "";
    feeInput.value = "";
    await loadDeliveryLocations();
    showToast("Delivery location added.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function saveLocation(row) {
  const id = row.dataset.id;
  const name = row.querySelector(".loc-name-input").value.trim();
  const fee = Number(row.querySelector(".loc-fee-input").value);
  const location = deliveryLocations.find(l => l.id === id);
  if (!location || !name) return;

  try {
    await Api.patch(`/DeliveryLocation/${id}`, { name, fee, isActive: location.isActive });
    await loadDeliveryLocations();
    showToast("Delivery location updated.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function toggleLocationActive(row) {
  const id = row.dataset.id;
  const location = deliveryLocations.find(l => l.id === id);
  if (!location) return;

  try {
    await Api.patch(`/DeliveryLocation/${id}`, { name: location.name, fee: location.fee, isActive: !location.isActive });
    await loadDeliveryLocations();
    showToast(location.isActive ? "Location deactivated." : "Location reactivated.", "success");
  } catch (err) {
    showToast(err.message, "error");
  }
}

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

  const sections = STATUS_SECTION_ORDER
    .map(status => ({ status, orders: filtered.filter(o => o.orderStatus === status) }))
    .filter(s => s.orders.length > 0);

  list.innerHTML = sections.map(renderStatusSection).join("");

  sections.forEach(({ status }) => {
    document.getElementById(`section-head-${status}`).addEventListener("click", () => toggleSection(status));
  });

  filtered.forEach(order => {
    const select = document.getElementById(`status-${order.id}`);
    if (select && !select.disabled) {
      select.addEventListener("change", (e) => updateStatus(order.id, e.target.value));
    }
    document.getElementById(`toggle-${order.id}`).addEventListener("click", () => toggleOrderDetail(order.id));
  });
}

function renderStatusSection({ status, orders }) {
  const isOpen = expandedSections[status] ?? DEFAULT_OPEN_STATUSES.has(status);

  return `
    <div class="status-section">
      <div class="status-section-head" id="section-head-${status}">
        <span class="status-section-name">${STATUS_DISPLAY_LABELS[status] || status}</span>
        <span class="status-section-count">${orders.length} order${orders.length === 1 ? "" : "s"}</span>
        <span class="status-section-caret ${isOpen ? "open" : ""}">▾</span>
      </div>
      <div class="status-section-body ${isOpen ? "open" : ""}" id="section-body-${status}">
        <table class="orders-table">
          <thead>
            <tr>
              <th>Order</th>
              <th>Total</th>
              <th>Status</th>
              <th></th>
            </tr>
          </thead>
          <tbody>${orders.map(renderOrderRow).join("")}</tbody>
        </table>
      </div>
    </div>
  `;
}

function toggleSection(status) {
  const isOpen = expandedSections[status] ?? DEFAULT_OPEN_STATUSES.has(status);
  expandedSections[status] = !isOpen;
  document.getElementById(`section-body-${status}`).classList.toggle("open");
  document.getElementById(`section-head-${status}`).querySelector(".status-section-caret").classList.toggle("open");
}

function renderOrderRow(order) {
  const isTerminal = !order.allowedNextStatuses || order.allowedNextStatuses.length === 0;

  const currentOption = `<option value="${statusValueFor(order.orderStatus)}" selected>${STATUS_DISPLAY_LABELS[order.orderStatus] || order.orderStatus}</option>`;
  const nextOptions = isTerminal ? "" : order.allowedNextStatuses
    .map(label => `<option value="${statusValueFor(label)}">${STATUS_DISPLAY_LABELS[label] || label}</option>`)
    .join("");

  return `
    <tr class="order-summary-row">
      <td>
        <div class="num">${order.orderNumber}</div>
        <div class="cust">${order.customerName} · ${formatDate(order.orderDate)}</div>
      </td>
      <td class="mono-cell">${formatNaira(order.totalPrice)}</td>
      <td><select class="status-select" id="status-${order.id}" ${isTerminal ? "disabled" : ""}>${currentOption}${nextOptions}</select></td>
      <td style="text-align:right;"><button class="sup-order-toggle" id="toggle-${order.id}">▾</button></td>
    </tr>
    <tr class="order-detail-row">
      <td colspan="4">
        <div class="sup-order-detail" id="detail-${order.id}">
          <p style="color:var(--color-ink-soft);">Loading order details...</p>
        </div>
      </td>
    </tr>
  `;
}

function statusValueFor(label) {
  return ORDER_STATUSES.find(s => s.label === label)?.value ?? "";
}

async function updateStatus(orderId, statusValue) {
  try {
    await Api.patch(`/Orders/${orderId}/status`, { status: Number(statusValue) });
    showToast("Order status updated.", "success");
    await loadOrders(); 
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
      const delivery = (deliveryResult.status === "fulfilled" && deliveryResult.value.data) ? deliveryResult.value.data : null;

      renderOrderDetail(orderId, order, delivery?.deliveryMethod, delivery?.deliveryAddress);
    } catch (err) {
      detail.innerHTML = `<p style="color:var(--color-danger);">Couldn't load order details: ${err.message}</p>`;
    }
    orderDetailLoaded[orderId] = true;
  }
}

function renderOrderDetail(orderId, order, deliveryMethod, deliveryAddress) {
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
      <div class="order-payment-row"><span>Items subtotal</span><span class="mono">${formatNaira(order.itemsSubtotal)}</span></div>
      ${order.deliveryFeeTotal > 0 ? `<div class="order-payment-row"><span>Delivery charges</span><span class="mono">${formatNaira(order.deliveryFeeTotal)}</span></div>` : ""}
      <div class="order-payment-row"><span>Order total</span><span class="mono">${formatNaira(order.totalPrice)}</span></div>
      ${order.walletAmountUsed > 0 ? `<div class="order-payment-row"><span>Paid from wallet</span><span class="mono">${formatNaira(order.walletAmountUsed)}</span></div>` : ""}
      <div class="order-payment-row"><span>Total paid</span><span class="mono paid">${formatNaira(order.totalPaid)}</span></div>
      <div class="order-payment-row total"><span>Outstanding balance</span><span class="mono ${order.outstandingBalance > 0 ? "owed" : "cleared"}">${order.outstandingBalance > 0 ? formatNaira(order.outstandingBalance) : "Cleared"}</span></div>
    </div>
  ` : "";

  const isCustomerPickup = deliveryMethod && deliveryMethod.replace(/\s/g, "") === "CustomerPickup";
  const chargesEditable = order && !isCustomerPickup && (order.orderStatus === "Received" || order.orderStatus === "Processing");
  if (order && !chargeDrafts[orderId]) {
    chargeDrafts[orderId] = order.deliveryCharges.length > 0
      ? order.deliveryCharges.map(c => ({ label: c.label, amount: c.amount }))
      : [];
  }

  const chargesBlock = order ? renderChargesBlock(orderId, order, chargesEditable, isCustomerPickup, deliveryMethod) : "";

  const addressBlock = deliveryAddress ? `
    <div class="order-detail-line" style="border-top: 1px solid var(--color-border); padding-top: var(--sp-3);">
      <div>
        <div class="item-name">Delivery address</div>
        <div class="item-qty">${deliveryAddress}</div>
      </div>
    </div>
  ` : (isCustomerPickup ? "" : `
    <p style="color:var(--color-danger); font-size:var(--fs-sm); margin-top: var(--sp-3);">
      No delivery address on file for this order.
    </p>
  `);

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

  detail.innerHTML = itemLines + summary + addressBlock + deliveryBlock + chargesBlock + (order ? renderStatusTimeline(orderId, order.statusHistory) : "");
  document.getElementById(`delivery-${orderId}`).addEventListener("change", (e) => updateDelivery(orderId, e.target.value));
  document.getElementById(`timeline-toggle-${orderId}`)?.addEventListener("click", () => toggleTimeline(orderId));

  if (order && chargesEditable) {
    bindChargesEditorEvents(orderId);
  }
}

function renderChargesBlock(orderId, order, editable, isCustomerPickup, deliveryMethod) {
  if (isCustomerPickup) {
    return `
      <div class="charges-block" style="margin-top: var(--sp-3);">
        <label>Delivery charges</label>
        <p style="color:var(--color-ink-soft); font-size:var(--fs-sm);">
          Not applicable — this is a Customer Pickup order.
        </p>
      </div>
    `;
  }

  if (!editable) {
    if (order.deliveryCharges.length === 0) return "";
    return `
      <div class="charges-block" style="margin-top: var(--sp-3);">
        <label>Delivery charges</label>
        ${order.deliveryCharges.map(c => `
          <div class="order-payment-row"><span>${c.label}</span><span class="mono">${formatNaira(c.amount)}</span></div>
        `).join("")}
        <p style="color:var(--color-ink-soft); font-size:var(--fs-xs); margin-top: var(--sp-2);">
          Charges are locked once an order moves past Processing.
        </p>
      </div>
    `;
  }

  const draft = chargeDrafts[orderId] || [];

  return `
    <div class="charges-block" id="charges-block-${orderId}" style="margin-top: var(--sp-3);">
      <label>Delivery charges</label>
      <div id="charge-rows-${orderId}">
        ${draft.map((c, i) => renderChargeRow(orderId, c, i)).join("")}
      </div>
      <div style="display:flex; gap: var(--sp-2); margin-top: var(--sp-2);">
        <button type="button" class="btn btn-outline btn-sm" id="addCharge-${orderId}">+ Add charge</button>
        <button type="button" class="btn btn-primary btn-sm" id="saveCharges-${orderId}">Save charges</button>
      </div>
    </div>
  `;
}

function renderChargeRow(orderId, charge, index) {
  return `
    <div class="charge-row" data-index="${index}" style="display:flex; gap: var(--sp-2); margin-bottom: var(--sp-2);">
      <input type="text" class="charge-label-input" placeholder="e.g. Dispatch fee" value="${charge.label || ""}" style="flex:2;">
      <input type="number" class="charge-amount-input" placeholder="Amount (₦)" min="0" step="0.01" value="${charge.amount ?? ""}" style="flex:1;">
      <button type="button" class="icon-btn danger remove-charge-btn" title="Remove">✕</button>
    </div>
  `;
}

function syncChargeDraftFromInputs(orderId) {
  const rowsContainer = document.getElementById(`charge-rows-${orderId}`);
  const rows = rowsContainer.querySelectorAll(".charge-row");
  chargeDrafts[orderId] = Array.from(rows).map(row => ({
    label: row.querySelector(".charge-label-input").value,
    amount: row.querySelector(".charge-amount-input").value
  }));
}

function bindChargesEditorEvents(orderId) {
  const block = document.getElementById(`charges-block-${orderId}`);
  if (!block) return;

  block.addEventListener("click", (e) => {
    const removeBtn = e.target.closest(".remove-charge-btn");
    const addBtn = e.target.closest(`#addCharge-${orderId}`);
    const saveBtn = e.target.closest(`#saveCharges-${orderId}`);

    if (removeBtn) {
      syncChargeDraftFromInputs(orderId);
      const index = Number(removeBtn.closest(".charge-row").dataset.index);
      chargeDrafts[orderId].splice(index, 1);
      rerenderChargeRows(orderId);
    } else if (addBtn) {
      syncChargeDraftFromInputs(orderId);
      chargeDrafts[orderId].push({ label: "", amount: "" });
      rerenderChargeRows(orderId);
    } else if (saveBtn) {
      syncChargeDraftFromInputs(orderId);
      saveDeliveryCharges(orderId);
    }
  });
}

function rerenderChargeRows(orderId) {
  const rowsContainer = document.getElementById(`charge-rows-${orderId}`);
  const draft = chargeDrafts[orderId] || [];
  rowsContainer.innerHTML = draft.map((c, i) => renderChargeRow(orderId, c, i)).join("");
}

const chargesSaveInFlight = {};

async function saveDeliveryCharges(orderId) {
  if (chargesSaveInFlight[orderId]) return;
  chargesSaveInFlight[orderId] = true;

  const btn = document.getElementById(`saveCharges-${orderId}`);
  const draft = (chargeDrafts[orderId] || [])
    .filter(c => c.label && c.label.trim())
    .map(c => ({ label: c.label.trim(), amount: Number(c.amount) || 0 }));

  setButtonLoading(btn, true, "Saving...");

  try {
    await Api.put(`/Orders/${orderId}/delivery-charges`, { charges: draft });
    showToast("Delivery charges updated.", "success");
    delete chargeDrafts[orderId];
    await refreshOrderDetail(orderId);
  } catch (err) {
    showToast(err.message, "error");
    setButtonLoading(btn, false);
  } finally {
    delete chargesSaveInFlight[orderId];
  }
}

async function refreshOrderDetail(orderId) {
  try {
    const [orderResult, deliveryResult] = await Promise.allSettled([
      Api.get(`/Orders/${orderId}`),
      Api.get(`/Delivery/order/${orderId}`)
    ]);

    const order = orderResult.status === "fulfilled" ? orderResult.value.data : null;
    const delivery = (deliveryResult.status === "fulfilled" && deliveryResult.value.data) ? deliveryResult.value.data : null;

    const rowIndex = allOrders.findIndex(o => o.id === orderId);
    if (rowIndex !== -1 && order) allOrders[rowIndex].totalPrice = order.totalPrice;
    const detailRow = document.getElementById(`detail-${orderId}`)?.closest("tr");
    const totalEl = detailRow?.previousElementSibling?.querySelector(".mono-cell");
    if (totalEl && order) totalEl.textContent = formatNaira(order.totalPrice);

    renderOrderDetail(orderId, order, delivery?.deliveryMethod, delivery?.deliveryAddress);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function updateDelivery(orderId, methodValue) {
  try {
    const result = await Api.patch(`/Delivery/${orderId}`, { deliveryMethod: Number(methodValue) });
    showToast(result.message, "success");
    delete chargeDrafts[orderId];
    await refreshOrderDetail(orderId);
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}