/* ==========================================================================
   OrderEase Supplier — Return Requests Logic
   ========================================================================== */

let allReturns = [];
let returnSearchTerm = "";
const returnDetailCache = {};

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_supplier");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  document.getElementById("returnSearchInput").addEventListener("input", (e) => {
    returnSearchTerm = e.target.value.trim().toLowerCase();
    renderReturns();
  });

  await loadReturns();
});

async function loadReturns() {
  const list = document.getElementById("returnsList");
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading return requests...</p>`;

  try {
    const result = await Api.get("/ReturnRequests");
    allReturns = result?.data || [];
    allReturns.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));
    renderReturns();
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}

function renderReturns() {
  const list = document.getElementById("returnsList");
  const emptyState = document.getElementById("emptyState");

  const filtered = returnSearchTerm
    ? allReturns.filter(r =>
        r.customerName.toLowerCase().includes(returnSearchTerm) ||
        r.orderNumber.toLowerCase().includes(returnSearchTerm) ||
        r.categoryName.toLowerCase().includes(returnSearchTerm) ||
        r.status.toLowerCase().includes(returnSearchTerm)
      )
    : allReturns;

  if (allReturns.length === 0) {
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector("h3").textContent = "No return requests";
    return;
  }

  if (filtered.length === 0) {
    list.innerHTML = "";
    emptyState.style.display = "block";
    emptyState.querySelector("h3").textContent = "No return requests match your search";
    return;
  }

  emptyState.style.display = "none";
  list.innerHTML = filtered.map(renderReturnRow).join("");

  filtered.forEach(r => {
    document.getElementById(`toggle-${r.id}`).addEventListener("click", () => toggleReturnDetail(r.id));
  });

  filtered.filter(r => r.status === "Pending").forEach(r => {
    document.getElementById(`approve-${r.id}`).addEventListener("click", () => approveReturn(r.id));
    document.getElementById(`reject-${r.id}`).addEventListener("click", () => toggleRejectForm(r.id));
    document.getElementById(`reject-confirm-${r.id}`).addEventListener("click", () => rejectReturn(r.id));
  });
}

function renderReturnRow(r) {
  const isPending = r.status === "Pending";

  return `
    <div class="sup-return-row">
      <div class="sup-return-head" id="toggle-${r.id}" style="cursor:pointer;">
        <div class="info">
          <div class="cust">${r.customerName}</div>
          <div class="meta">Order ${r.orderNumber} · ${r.categoryName} · ${formatDate(r.dateCreated)}</div>
        </div>
        <span class="status-badge status-${r.status}">${r.status}</span>
      </div>
      <div class="sup-return-reason">${r.reason}</div>
      <div class="return-detail" id="detail-${r.id}"></div>

      ${isPending ? `
        <div class="sup-return-actions">
          <button class="btn btn-primary btn-sm" id="approve-${r.id}">Approve</button>
          <button class="btn btn-outline btn-sm" id="reject-${r.id}">Reject</button>
        </div>
        <div id="reject-form-${r.id}" style="display:none; margin-top: var(--sp-3);">
          <textarea id="reject-reason-${r.id}" rows="2" maxlength="500" placeholder="Reason for rejecting this return..."
            style="width:100%; padding: var(--sp-3); border:1.5px solid var(--color-border); border-radius:var(--radius-sm); font-family:var(--font-body); resize:vertical; margin-bottom: var(--sp-2);"></textarea>
          <button class="btn btn-danger btn-sm" id="reject-confirm-${r.id}">Confirm rejection</button>
        </div>
      ` : ""}
    </div>
  `;
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
        ${r.walletCreditAmount > 0 ? `<div class="order-payment-row"><span>Credited to customer's wallet</span><span class="mono paid">${formatNaira(r.walletCreditAmount)}</span></div>` : ""}
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

async function approveReturn(id) {
  if (!confirm("Approve this return? Stock will be restored and the customer refunded/credited automatically.")) return;

  try {
    await Api.patch(`/ReturnRequests/${id}/approve`, {});
    showToast("Return request approved.", "success");
    delete returnDetailCache[id];
    await loadReturns();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function toggleRejectForm(id) {
  const form = document.getElementById(`reject-form-${id}`);
  form.style.display = form.style.display === "none" ? "block" : "none";
}

async function rejectReturn(id) {
  const reason = document.getElementById(`reject-reason-${id}`).value.trim();
  if (!reason) {
    showToast("Please provide a reason for rejecting this return.", "error");
    return;
  }

  try {
    await Api.patch(`/ReturnRequests/${id}/reject`, { rejectionReason: reason });
    showToast("Return request rejected.", "success");
    delete returnDetailCache[id];
    await loadReturns();
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}