/* ==========================================================================
   OrderEase Shared UI Helpers
   ========================================================================== */

function ensureToastStack() {
  let stack = document.querySelector(".toast-stack");
  if (!stack) {
    stack = document.createElement("div");
    stack.className = "toast-stack";
    document.body.appendChild(stack);
  }
  return stack;
}

/**
 * Show a toast notification.
 * @param {string} message
 * @param {"success"|"error"|"info"} type
 */
function showToast(message, type = "info") {
  const stack = ensureToastStack();
  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.textContent = message;
  stack.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transition = "opacity 200ms ease";
    setTimeout(() => toast.remove(), 200);
  }, 3500);
}

function formatNaira(amount) {
  return "₦" + Number(amount || 0).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatDate(dateString) {
  const d = new Date(dateString);
  return d.toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" }) +
    " · " + d.toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
}

const TIMELINE_STATUS_LABELS = {
  Received: "Received", Processing: "Processing", Dispatched: "Dispatched",
  ReadyForPickup: "Ready for Pickup", Delivered: "Delivered", Cancelled: "Cancelled", Returned: "Returned"
};

function renderStatusTimeline(orderId, statusHistory) {
  if (!statusHistory || statusHistory.length === 0) return "";

  const entries = statusHistory.map(h => `
    <div class="timeline-entry">
      <div class="timeline-dot"></div>
      <div class="timeline-content">
        <div class="timeline-status">${TIMELINE_STATUS_LABELS[h.newStatus] || h.newStatus}</div>
        <div class="timeline-time">${formatDate(h.changedAt)}</div>
      </div>
    </div>
  `).join("");

  return `
    <div class="order-timeline-block">
      <button type="button" class="timeline-toggle-btn" id="timeline-toggle-${orderId}">
        <span>Order timeline</span>
        <span class="timeline-caret" id="timeline-caret-${orderId}">▾</span>
      </button>
      <div class="order-timeline" id="timeline-${orderId}">${entries}</div>
    </div>
  `;
}

function toggleTimeline(orderId) {
  document.getElementById(`timeline-${orderId}`).classList.toggle("open");
  document.getElementById(`timeline-caret-${orderId}`).classList.toggle("open");
}

function setButtonLoading(button, isLoading, loadingText = "Please wait...") {
  if (isLoading) {
    button.dataset.originalText = button.textContent;
    button.textContent = loadingText;
    button.disabled = true;
  } else {
    button.textContent = button.dataset.originalText || button.textContent;
    button.disabled = false;
  }
}

function initNavToggle() {
  const toggle = document.querySelector(".nav-toggle");
  const links = document.querySelector(".nav-links");
  if (toggle && links) {
    toggle.addEventListener("click", () => links.classList.toggle("open"));
  }
}

function requireAuth(allowedRole = null) {
  const token = TokenStore.get();
  const user = TokenStore.getUser();
  if (!token || !user) {
    window.location.href = "/login.html";
    return null;
  }
  if (allowedRole && !(user.roles || []).includes(allowedRole)) {
    window.location.href = "/login.html";
    return null;
  }
  return user;
}

document.addEventListener("DOMContentLoaded", initNavToggle);