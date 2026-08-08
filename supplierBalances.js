/* ==========================================================================
   OrderEase Supplier - Customer Balances
   ========================================================================== */

document.addEventListener("DOMContentLoaded", async () => {
  const user = requireAuth("app_supplier");
  if (!user) return;

  document.getElementById("logoutLink").addEventListener("click", handleLogout);
  await loadBalances();
});

async function loadBalances() {
  const body = document.getElementById("balanceTableBody");
  const emptyState = document.getElementById("emptyState");

  try {
    const result = await Api.get("/Payments/balances");
    const balances = result?.data || [];

    if (balances.length === 0) {
      emptyState.style.display = "block";
      return;
    }

    balances.sort((a, b) => b.outstandingBalance - a.outstandingBalance);

    body.innerHTML = balances.map(b => `
      <tr>
        <td>${b.customerName}</td>
        <td>${b.customerEmail}</td>
        <td class="mono-cell">${formatNaira(b.totalBilled)}</td>
        <td class="mono-cell">${formatNaira(b.totalPaid)}</td>
        <td class="mono-cell ${b.outstandingBalance > 0 ? "outstanding" : "cleared"}">
          ${b.outstandingBalance > 0 ? formatNaira(b.outstandingBalance) : "Cleared"}
        </td>
      </tr>
    `).join("");
  } catch (err) {
    showToast(err.message, "error");
  }
}

function handleLogout(e) {
  e.preventDefault();
  TokenStore.clear();
  window.location.href = "login.html";
}
