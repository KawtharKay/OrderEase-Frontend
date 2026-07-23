/* ==========================================================================
   OrderEase API Client
   Central fetch wrapper — handles base URL, JWT attachment, and errors.
   ========================================================================== */

const API_BASE_URL = "https://localhost:7185/api";

const TokenStore = {
  get() { return sessionStorage.getItem("oe_token"); },
  set(token) { sessionStorage.setItem("oe_token", token); },
  clear() { sessionStorage.removeItem("oe_token"); sessionStorage.removeItem("oe_user"); },
  getUser() {
    const raw = sessionStorage.getItem("oe_user");
    return raw ? JSON.parse(raw) : null;
  },
  setUser(user) { sessionStorage.setItem("oe_user", JSON.stringify(user)); }
};

/**
 * Core request helper.
 * @param {string} path - e.g. "/auth/login"
 * @param {object} options - { method, body, auth }
 */
async function apiRequest(path, { method = "GET", body = null, auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (auth) {
    const token = TokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  let response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      cache: "no-store",
      body: body ? JSON.stringify(body) : undefined
    });
  } catch (networkErr) {
    throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
  }

  let data = null;
  const text = await response.text();
  if (text) {
    try { data = JSON.parse(text); } catch { data = null; }
  }

  if (response.status === 401) {
    TokenStore.clear();
    window.location.href = "login.html";
    throw new ApiError("Session expired. Please log in again.", 401);
  }

  if (!response.ok) {
    const message = data?.message || data?.title || "Something went wrong. Please try again.";
    throw new ApiError(message, response.status, data);
  }

  // Your Result<T> wrapper returns HTTP 200 even on business-logic failures
  // (wrong password, unverified account, insufficient stock, etc.) — the
  // failure only shows up in the response body's `status` field, not the
  // HTTP status code. Without this check, every such failure silently
  // returns data: null to the caller, which then crashes trying to read
  // a property off it instead of showing the real error message.
  if (data && data.status === false) {
    throw new ApiError(data.message || "Request failed. Please try again.", response.status, data);
  }

  return data;
}

class ApiError extends Error {
  constructor(message, status, data) {
    super(message);
    this.status = status;
    this.data = data;
  }
}

const Api = {
  get: (path, opts = {}) => apiRequest(path, { method: "GET", ...opts }),
  post: (path, body, opts = {}) => apiRequest(path, { method: "POST", body, ...opts }),
  put: (path, body) => apiRequest(path, { method: "PUT", body }),
  patch: (path, body) => apiRequest(path, { method: "PATCH", body }),
  del: (path) => apiRequest(path, { method: "DELETE" }),

  async upload(path, formData) {
    const headers = {};
    const token = TokenStore.get();
    if (token) headers["Authorization"] = `Bearer ${token}`;

    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, { method: "POST", headers, body: formData });
    } catch {
      throw new ApiError("Could not reach the server. Check your connection and try again.", 0);
    }

    let data = null;
    const text = await response.text();
    if (text) {
      try { data = JSON.parse(text); } catch { data = null; }
    }

    if (response.status === 401) {
      TokenStore.clear();
      window.location.href = "login.html";
      throw new ApiError("Session expired. Please log in again.", 401);
    }

    if (!response.ok) {
      throw new ApiError(data?.message || "Upload failed. Please try again.", response.status, data);
    }

    if (data && data.status === false) {
      throw new ApiError(data.message || "Upload failed. Please try again.", response.status, data);
    }

    return data;
  }
};