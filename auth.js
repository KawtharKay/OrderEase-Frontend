/* ==========================================================================
   OrderEase Auth Page Logic — login.html and register.html
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
  const existingUser = TokenStore.getUser();
  if (existingUser && TokenStore.get()) {
    redirectToDashboard(existingUser.roles);
    return;
  }

  initPasswordToggle();

  if (document.getElementById("login-form")) initLoginForm();
  if (document.getElementById("register-form")) initRegisterForm();
});

/* ---------- JWT decoding ----------
   Login only returns { Id, Token } — no user/role object — so email and
   role come from the token's claims instead. .NET's JwtSecurityTokenHandler
   writes ClaimTypes as full XML-schema URIs by default, so check both the
   long and short claim names. */
function decodeJwt(token) {
  try {
    const payload = token.split(".")[1];
    const base64 = payload.replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(base64).split("").map(c => "%" + c.charCodeAt(0).toString(16).padStart(2, "0")).join("")
    );
    const claims = JSON.parse(json);

    const email = claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/emailaddress"] || claims.email;
    const roleClaim =
      claims["http://schemas.microsoft.com/ws/2008/06/identity/claims/role"] ??
      claims["http://schemas.xmlsoap.org/ws/2005/05/identity/claims/role"] ??
      claims.role;
    const roles = Array.isArray(roleClaim) ? roleClaim : (roleClaim ? [roleClaim] : []);

    return { email, roles };
  } catch {
    return null;
  }
}

/* ---------- Password visibility toggle ---------- */
function initPasswordToggle() {
  const toggleBtn = document.getElementById("togglePassword");
  if (!toggleBtn) return;

  const passwordInput = document.getElementById("passwordInput");
  const icon = document.getElementById("toggleIcon");

  toggleBtn.addEventListener("click", () => {
    const isHidden = passwordInput.type === "password";
    passwordInput.type = isHidden ? "text" : "password";
    icon.classList.toggle("bi-eye", !isHidden);
    icon.classList.toggle("bi-eye-slash", isHidden);
  });
}

/* ---------- Login ---------- */
function initLoginForm() {
  const form = document.getElementById("login-form");
  const btn = document.getElementById("login-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);

    const email = document.getElementById("emailInput").value.trim();
    const password = document.getElementById("passwordInput").value;

    let hasError = false;
    if (!email) { showFieldError("email-error", "Email is required."); hasError = true; }
    if (!password) { showFieldError("password-error", "Password is required."); hasError = true; }
    if (hasError) return;

    setSubmitLoading(btn, true);

    try {
      const result = await Api.post("/auth/login", { email, password }, { auth: false });
      const token = result.data.token;
      const claims = decodeJwt(token);

      const user = {
        id: result.data.id,
        email: claims?.email || email,
        roles: claims?.roles || []
      };

      TokenStore.set(token);
      TokenStore.setUser(user);

      const params = new URLSearchParams(window.location.search);
      if (params.get("redirect") === "checkout") {
        window.location.href = "checkout.html";
      } else {
        redirectToDashboard(user.roles);
      }
    } catch (err) {
    if (err.message === "Please verify your email address") {
      showFormError(`${err.message}: <a href="verify-email.html" style="color:var(--color-secondary); font-weight:700;">resend the verification email</a>`);
    } else {
      showFormError(err.message);
    }
  }
  });
}

/* ---------- Register ---------- */
function initRegisterForm() {
  const form = document.getElementById("register-form");
  const btn = document.getElementById("register-btn");

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    clearErrors(form);

    const name = document.getElementById("nameInput").value.trim();
    const email = document.getElementById("emailInput").value.trim();
    const phone = document.getElementById("phoneInput").value.trim();
    const address = document.getElementById("addressInput").value.trim();
    const password = document.getElementById("passwordInput").value;

    let hasError = false;
    if (!name) { showFieldError("name-error", "Full name is required."); hasError = true; }
    if (!email) { showFieldError("email-error", "Email is required."); hasError = true; }
    if (!phone) { showFieldError("phone-error", "Phone number is required."); hasError = true; }
    if (!address) { showFieldError("address-error", "Address is required."); hasError = true; }
    if (password.length < 6) { showFieldError("password-error", "Password must be at least 6 characters."); hasError = true; }
    if (hasError) return;

    setSubmitLoading(btn, true);

    try {
      // Step 1: create the base user account (sends a verification email)
      const userResult = await Api.post("/auth/create-user", { email, password }, { auth: false });
      const userId = userResult.data.id;

      // Step 2: attach the customer profile to that user
      await Api.post("/auth/register-customer", {
        userId,
        name,
        phoneNumber: phone,
        address
      }, { auth: false });

      showToast(userResult.message || "Account created!", "success");
      setTimeout(() => { window.location.href = `verify-email.html?email=${encodeURIComponent(email)}`; }, 1200);
    } catch (err) {
      showFormError(err.message);
    } finally {
      setSubmitLoading(btn, false);
    }
  });
}

/* ---------- Shared helpers ---------- */
function setSubmitLoading(button, isLoading) {
  const text = button.querySelector("#btn-text");
  const spinner = button.querySelector("#btn-spinner");
  button.disabled = isLoading;
  if (spinner) spinner.classList.toggle("show", isLoading);
  if (text) text.style.opacity = isLoading ? "0.7" : "1";
}

function clearErrors(form) {
  const banner = document.getElementById("form-error");
  if (banner) { banner.textContent = ""; banner.classList.remove("show"); }
  form.querySelectorAll(".field-error").forEach(el => el.textContent = "");
  form.querySelectorAll(".is-invalid").forEach(el => el.classList.remove("is-invalid"));
}

function showFieldError(elementId, message) {
  const el = document.getElementById(elementId);
  if (el) el.textContent = message;
}

function showFormError(message) {
  const banner = document.getElementById("form-error");
  if (banner) {
    banner.innerHTML = message;
    banner.classList.add("show");
  } else {
    showToast(message, "error");
  }
}

function redirectToDashboard(roles) {
  if (Array.isArray(roles) && roles.includes("app_supplier")) {
    window.location.href = "supplierDashboard.html";
  } else {
    window.location.href = "catalogue.html";
  }
}