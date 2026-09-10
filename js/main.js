import { onAuthChange, login, logout, authErrorMessage } from "./auth.js";
import { renderDataEntry } from "./views/dataEntry.js";
import { renderViewExport } from "./views/viewExport.js";
import { renderDashboard } from "./views/dashboard.js";

const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");
const tabbar = document.getElementById("tabbar");
const viewRoot = document.getElementById("view-root");

const TABS = {
  entry: { label: "กรอกข้อมูล", render: renderDataEntry },
  viewExport: { label: "View / Export", render: renderViewExport },
  dashboard: { label: "Dashboard", render: renderDashboard },
};

let activeTab = "entry";

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  const email = document.getElementById("login-email").value.trim();
  const password = document.getElementById("login-password").value;
  const submitBtn = loginForm.querySelector("button[type=submit]");
  submitBtn.disabled = true;
  try {
    await login(email, password);
  } catch (err) {
    loginError.textContent = authErrorMessage(err);
  } finally {
    submitBtn.disabled = false;
  }
});

logoutBtn.addEventListener("click", async () => {
  await logout();
});

tabbar.addEventListener("click", (e) => {
  const btn = e.target.closest(".tab-btn");
  if (!btn) return;
  setActiveTab(btn.dataset.tab);
});

function setActiveTab(tab) {
  activeTab = tab;
  [...tabbar.querySelectorAll(".tab-btn")].forEach((b) => {
    b.classList.toggle("active", b.dataset.tab === tab);
  });
  viewRoot.innerHTML = "";
  TABS[tab].render(viewRoot);
}

onAuthChange((user) => {
  if (user) {
    loginScreen.hidden = true;
    mainScreen.hidden = false;
    userEmailEl.textContent = user.email || "";
    setActiveTab(activeTab);
  } else {
    mainScreen.hidden = true;
    loginScreen.hidden = false;
    viewRoot.innerHTML = "";
  }
});

export function showToast(message, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
