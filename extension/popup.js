/**
 * SmartCompare Pro — Popup Script
 * Auth form logic and token management.
 */

const API_BASE = "http://localhost:3000";

document.addEventListener("DOMContentLoaded", () => {
  const authSection = document.getElementById("auth-section");
  const userSection = document.getElementById("user-section");
  const loginForm = document.getElementById("login-form");
  const registerForm = document.getElementById("register-form");
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const authError = document.getElementById("auth-error");
  const userEmail = document.getElementById("user-email");
  const logoutBtn = document.getElementById("logout-btn");

  // Check if already logged in
  chrome.storage.local.get(["token", "email"], (data) => {
    if (data.token) {
      showUserSection(data.email || "");
    }
  });

  // Tab switching
  tabLogin.addEventListener("click", () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    registerForm.classList.add("hidden");
    hideError();
  });

  tabRegister.addEventListener("click", () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    registerForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
    hideError();
  });

  // Login
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("login-email").value.trim();
    const password = document.getElementById("login-password").value;
    hideError();

    try {
      const res = await fetch(`${API_BASE}/api/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Login failed");

      chrome.storage.local.set({ token: data.token, email: data.user.email });
      chrome.runtime.sendMessage({ type: "SET_TOKEN", token: data.token });
      showUserSection(data.user.email);
    } catch (err) {
      showError(err.message);
    }
  });

  // Register
  registerForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    const email = document.getElementById("register-email").value.trim();
    const password = document.getElementById("register-password").value;
    hideError();

    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Registration failed");

      chrome.storage.local.set({ token: data.token, email: data.user.email });
      chrome.runtime.sendMessage({ type: "SET_TOKEN", token: data.token });
      showUserSection(data.user.email);
    } catch (err) {
      showError(err.message);
    }
  });

  // Logout
  logoutBtn.addEventListener("click", () => {
    chrome.storage.local.remove(["token", "email"]);
    chrome.runtime.sendMessage({ type: "CLEAR_TOKEN" });
    showAuthSection();
  });

  // Open Panel
  document.getElementById("open-panel-btn").addEventListener("click", () => {
    chrome.runtime.sendMessage({ type: "TOGGLE_PANEL" });
  });

  function showUserSection(email) {
    authSection.classList.add("hidden");
    userSection.classList.remove("hidden");
    userEmail.textContent = email;
  }

  function showAuthSection() {
    userSection.classList.add("hidden");
    authSection.classList.remove("hidden");
  }

  function showError(msg) {
    authError.textContent = msg;
    authError.classList.remove("hidden");
  }

  function hideError() {
    authError.classList.add("hidden");
  }
});
