/**
 * SmartCompare Pro — Background Service Worker
 * Handles auth tokens, API proxying, watchlist, and panel toggle messaging.
 *
 * CHANGES:
 * - Verified ADD_WATCHLIST handler: POST /api/watchlist with { product_id, target_price } — already correct
 * - Verified REMOVE_WATCHLIST handler: DELETE /api/watchlist/:product_id — already correct
 * - Message types handled: SET_TOKEN, GET_TOKEN, CLEAR_TOKEN, API_REQUEST, COMPARE,
 *   POLL_JOB, ADD_WATCHLIST, REMOVE_WATCHLIST, TOGGLE_PANEL, OBSERVE
 */

const API_BASE = "http://localhost:3000";

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  switch (message.type) {
    case "SET_TOKEN":
      chrome.storage.local.set({ token: message.token }, () => {
        sendResponse({ success: true });
      });
      return true;

    case "GET_TOKEN":
      chrome.storage.local.get("token", (result) => {
        sendResponse({ token: result.token || null });
      });
      return true;

    case "CLEAR_TOKEN":
      chrome.storage.local.remove("token", () => {
        sendResponse({ success: true });
      });
      return true;

    case "API_REQUEST":
      handleApiRequest(message)
        .then((data) => sendResponse({ success: true, data }))
        .catch((err) => sendResponse({ success: false, error: err.message }));
      return true;

    case "COMPARE":
      handleCompare(message.payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: "Network error: " + err.message, code: "NETWORK_ERROR" }));
      return true;

    case "POLL_JOB":
      handlePollJob(message.job_id)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message, code: "POLL_ERROR" }));
      return true;

    case "ADD_WATCHLIST":
      handleAddWatchlist(message.payload)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message, code: "WATCHLIST_ERROR" }));
      return true;

    case "REMOVE_WATCHLIST":
      handleRemoveWatchlist(message.product_id)
        .then((result) => sendResponse(result))
        .catch((err) => sendResponse({ error: err.message, code: "WATCHLIST_ERROR" }));
      return true;

    case "TOGGLE_PANEL":
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab) {
          chrome.tabs.sendMessage(tab.id, { type: "TOGGLE_PANEL" }, () => {
            // Suppress "Receiving end does not exist" when content script is not loaded
            if (chrome.runtime.lastError) { /* silently ignore */ }
          });
        }
      });
      sendResponse({ success: true });
      return true;

    case "OPEN_TAB":
      chrome.tabs.create({ url: message.url, active: true });
      sendResponse({ success: true });
      return true;

    case "OBSERVE":
      handleObserve(message.payload)
        .then(() => sendResponse({ success: true }))
        .catch(() => sendResponse({ success: false }));
      return true;

    default:
      sendResponse({ error: "Unknown message type" });
      return false;
  }
});

/**
 * Proxy generic API requests through background.
 */
async function handleApiRequest({ method, endpoint, body }) {
  const { token } = await chrome.storage.local.get("token");
  const url = `${API_BASE}${endpoint}`;
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const options = { method: method || "GET", headers };
  if (body && method !== "GET") options.body = JSON.stringify(body);

  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
  return data;
}

/**
 * Auto-provision a guest user if no token exists.
 */
async function ensureToken() {
  let { token } = await chrome.storage.local.get("token");
  if (token) return token;

  // Auto-register a guest account
  const guestEmail = `guest_${Date.now()}_${Math.random().toString(36).slice(2,8)}@smartcompare.local`;
  const guestPass = `sc_${Math.random().toString(36).slice(2,14)}`;

  try {
    const res = await fetch(`${API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: guestEmail, password: guestPass }),
    });
    const data = await res.json();
    if (data.token) {
      await chrome.storage.local.set({ token: data.token });
      return data.token;
    }
  } catch (e) {
    // Registration failed
  }
  return null;
}

/**
 * Handle COMPARE message — POST /api/compare with auto-auth retry.
 */
async function handleCompare(payload) {
  let token = await ensureToken();
  if (!token) return { error: "Could not authenticate", code: "NO_TOKEN" };

  try {
    let res = await fetch(`${API_BASE}/api/compare`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    // If 401, token expired — clear and re-provision
    if (res.status === 401) {
      await chrome.storage.local.remove("token");
      token = await ensureToken();
      if (!token) return { error: "Auth failed", code: "NO_TOKEN" };

      res = await fetch(`${API_BASE}/api/compare`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });
    }

    const data = await res.json();
    return { status: res.status, data };
  } catch (err) {
    return { error: "Could not connect to server", code: "NETWORK_ERROR" };
  }
}

/**
 * Handle POLL_JOB — GET /api/compare/results/:job_id
 */
async function handlePollJob(jobId) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return { error: "Not authenticated", code: "NO_TOKEN" };

  const res = await fetch(`${API_BASE}/api/compare/results/${jobId}`, {
    headers: { "Authorization": `Bearer ${token}` },
  });
  return await res.json();
}

/**
 * Handle ADD_WATCHLIST — POST /api/watchlist
 */
async function handleAddWatchlist(payload) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return { error: "Not authenticated", code: "NO_TOKEN" };

  const res = await fetch(`${API_BASE}/api/watchlist`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  return { success: res.ok, data };
}

/**
 * Handle REMOVE_WATCHLIST — DELETE /api/watchlist/:product_id
 */
async function handleRemoveWatchlist(productId) {
  const { token } = await chrome.storage.local.get("token");
  if (!token) return { error: "Not authenticated", code: "NO_TOKEN" };

  const res = await fetch(`${API_BASE}/api/watchlist/${productId}`, {
    method: "DELETE",
    headers: { "Authorization": `Bearer ${token}` },
  });
  const data = await res.json();
  return { success: res.ok, data };
}

/**
 * Handle OBSERVE — POST /api/observe (passive, no auth required)
 */
async function handleObserve(payload) {
  try {
    await fetch(`${API_BASE}/api/observe`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch {
    // Passive observation — silently ignore all errors
  }
}
