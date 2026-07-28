/* ==========================================================================
   OrderEase — Shared Notification Bell (SignalR live push + REST fallback)
   Include on every authenticated page, loaded after api.js, ui.js, and the
   page's own script. Silently does nothing if the visitor isn't logged in.
   ========================================================================== */

let notifState = { unreadCount: 0, notifications: [] };
let signalRConnection = null;

document.addEventListener("DOMContentLoaded", () => {
  const user = TokenStore.getUser();
  const token = TokenStore.get();
  if (!user || !token) return;

  injectBell();
  loadNotifications();
  loadSignalRAndConnect(user.id);
});

function injectBell() {
  const navLinks = document.getElementById("navLinks") || document.querySelector(".nav-links");
  if (!navLinks) return;

  const wrap = document.createElement("span");
  wrap.className = "notif-bell-wrap";
  wrap.innerHTML = `
    <button class="notif-bell-btn" id="notifBellBtn" aria-label="Notifications">
      🔔
      <span class="notif-badge" id="notifBadge">0</span>
    </button>
    <div class="notif-dropdown" id="notifDropdown">
      <div class="notif-dropdown-head">
        <span>Notifications</span>
        <button class="notif-mark-read-btn" id="notifMarkReadBtn">Mark all read</button>
      </div>
      <div id="notifList"><div class="notif-empty">Loading...</div></div>
    </div>
  `;
  navLinks.appendChild(wrap);

  document.getElementById("notifBellBtn").addEventListener("click", (e) => {
    e.stopPropagation();
    document.getElementById("notifDropdown").classList.toggle("open");
  });
  document.addEventListener("click", (e) => {
    if (!wrap.contains(e.target)) document.getElementById("notifDropdown").classList.remove("open");
  });
  document.getElementById("notifMarkReadBtn").addEventListener("click", markAllRead);
}

async function loadNotifications() {
  try {
    const result = await Api.get("/Notification/mine");
    notifState.unreadCount = result.data.unreadCount;
    notifState.notifications = result.data.notifications;
    renderBadge();
    renderList();
  } catch {
    // notifications are supplementary — fail quietly rather than blocking the page
  }
}

function renderBadge() {
  const badge = document.getElementById("notifBadge");
  if (!badge) return;
  badge.textContent = notifState.unreadCount > 9 ? "9+" : notifState.unreadCount;
  badge.classList.toggle("show", notifState.unreadCount > 0);
}

function renderList() {
  const list = document.getElementById("notifList");
  if (!list) return;

  if (notifState.notifications.length === 0) {
    list.innerHTML = `<div class="notif-empty">No notifications yet</div>`;
    return;
  }

  list.innerHTML = notifState.notifications.slice(0, 20).map(n => `
    <div class="notif-item ${n.isRead ? "" : "unread"}">
      <div class="title">${n.title}</div>
      <div class="msg">${n.message}</div>
      <div class="time">${formatDate(n.dateCreated)}</div>
    </div>
  `).join("");

  list.querySelectorAll(".notif-item").forEach((el, i) => {
    el.addEventListener("click", () => handleNotificationClick(notifState.notifications[i]));
  });
}

function handleNotificationClick(notification) {
  document.getElementById("notifDropdown").classList.remove("open");
  const type = notification.notificationType;
  const isSupplier = (TokenStore.getUser().roles || []).includes("app_supplier");

  if (["NewOrder", "OrderStatusChanged"].includes(type)) {
    window.location.href = isSupplier ? "supplierOrders.html" : "myOrders.html";
  } else if (["ReturnRequested", "ReturnApproved", "ReturnRejected"].includes(type)) {
    window.location.href = isSupplier ? "supplierReturns.html" : "returnRequest.html";
  } else if (["PaymentConfirmed", "WalletFunded"].includes(type)) {
    window.location.href = "wallet.html";
  }
}

async function markAllRead() {
  try {
    await Api.patch("/Notification/mark-read");
    notifState.notifications.forEach(n => n.isRead = true);
    notifState.unreadCount = 0;
    renderBadge();
    renderList();
  } catch (err) {
    showToast(err.message, "error");
  }
}

/* ---------- Live push via SignalR ---------- */
function loadSignalRAndConnect(userId) {
  if (window.signalR) {
    connectSignalR(userId);
    return;
  }
  const script = document.createElement("script");
  script.src = "https://cdn.jsdelivr.net/npm/@microsoft/signalr@8.0.0/dist/browser/signalr.min.js";
  script.onload = () => connectSignalR(userId);
  document.head.appendChild(script);
}

async function connectSignalR(userId) {
  try {
    const hubUrl = API_BASE_URL.replace(/\/api\/?$/, "") + "/hubs/notifications";
    signalRConnection = new signalR.HubConnectionBuilder()
      .withUrl(hubUrl, { accessTokenFactory: () => TokenStore.get() })
      .withAutomaticReconnect()
      .build();

    signalRConnection.on("ReceiveNotification", (notification) => {
      notifState.unreadCount += 1;
      notifState.notifications.unshift({
        id: notification.id,
        title: notification.title,
        message: notification.message,
        notificationType: notification.notificationType,
        referenceId: notification.referenceId,
        isRead: false,
        dateCreated: notification.dateCreated
      });
      renderBadge();
      renderList();
      showToast(notification.title, "info");
    });

    await signalRConnection.start();
    await signalRConnection.invoke("JoinUserGroup", userId);
  } catch {
    // live push is a bonus on top of the REST-fetched badge on page load
  }
}