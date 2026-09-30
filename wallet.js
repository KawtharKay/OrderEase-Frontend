/* ==========================================================================
   OrderEase Wallet
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_customer");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  document.getElementById("fundForm").addEventListener("submit", handleFundWallet);

  await Promise.all([loadBalance(), loadHistory()]);
});

async function loadBalance() {
  try {
    const result = await Api.get("/Wallet/balance");
    document.getElementById("balanceAmount").textContent = formatNaira(result?.data?.balance || 0);
  } catch (err) {
    showToast(err.message, "error");
  }
}

async function loadHistory() {
  const list = document.getElementById("transactionList");
  const emptyState = document.getElementById("emptyTransactions");
  list.innerHTML = `<p style="color:var(--color-ink-soft);">Loading transactions...</p>`;

  try {
    const result = await Api.get("/Wallet/history");
    const transactions = result?.data?.transactions || [];

    if (transactions.length === 0) {
      list.innerHTML = "";
      emptyState.style.display = "block";
      return;
    }

    transactions.sort((a, b) => new Date(b.dateCreated) - new Date(a.dateCreated));

    list.innerHTML = transactions.map(tx => {
      const isCredit = tx.type === "Credit";
      return `
        <div class="transaction-row">
          <div>
            <div class="transaction-desc">${tx.description}</div>
            <div class="transaction-date">${formatDate(tx.dateCreated)}</div>
          </div>
          <div class="transaction-amount ${isCredit ? "credit" : "debit"}">
            ${isCredit ? "+" : "−"}${formatNaira(tx.amount)}
          </div>
        </div>
      `;
    }).join("");
  } catch (err) {
    list.innerHTML = "";
    showToast(err.message, "error");
  }
}

async function handleFundWallet(e) {
  e.preventDefault();
  const btn = document.getElementById("fundBtn");
  const amount = Number(document.getElementById("fundAmount").value);

  if (!amount || amount < 100) {
    showToast("Enter an amount of at least ₦100.", "error");
    return;
  }

  setButtonLoading(btn, true, "Redirecting...");

  try {
    const result = await Api.post("/Wallet/fund-wallet", { amount });
    window.location.href = result.data.authorizationUrl;
  } catch (err) {
    showToast(err.message, "error");
    setButtonLoading(btn, false);
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}