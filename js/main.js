import { onAuthChange, login, logout, authErrorMessage, resetPassword, resetErrorMessage, getCurrentRole } from "./auth.js";
import { renderDashboard } from "./views/dashboard.js";
import { renderDataEntry } from "./views/dataEntry.js";
import { renderIncoming } from "./views/incoming.js";
import { renderOutgoing } from "./views/outgoing.js";
import { renderViewExport } from "./views/viewExport.js";

const loginScreen = document.getElementById("login-screen");
const mainScreen = document.getElementById("main-screen");
const loginForm = document.getElementById("login-form");
const loginError = document.getElementById("login-error");
const loginInfo = document.getElementById("login-info");
const forgotPasswordBtn = document.getElementById("forgot-password-btn");
const userEmailEl = document.getElementById("user-email");
const logoutBtn = document.getElementById("logout-btn");
const tabbar = document.getElementById("tabbar");
const viewRoot = document.getElementById("view-root");

const TABS = {
  dashboard: { render: renderDashboard },
  entry: { render: renderDataEntry },
  incoming: { render: renderIncoming },
  outgoing: { render: renderOutgoing },
  viewExport: { render: renderViewExport },
};

let activeTab = "dashboard";

loginForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  loginError.textContent = "";
  loginInfo.hidden = true;
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

forgotPasswordBtn.addEventListener("click", async () => {
  loginError.textContent = "";
  loginInfo.hidden = true;
  const email = document.getElementById("login-email").value.trim();
  if (!email) {
    loginError.textContent = "กรุณากรอกอีเมลก่อนกดลืมรหัสผ่าน";
    return;
  }
  forgotPasswordBtn.disabled = true;
  try {
    await resetPassword(email);
    loginInfo.textContent = `ส่งลิงก์รีเซ็ตรหัสผ่านไปที่ ${email} แล้ว กรุณาตรวจสอบอีเมล (รวมถึงกล่อง Junk/Spam)`;
    loginInfo.hidden = false;
  } catch (err) {
    loginError.textContent = resetErrorMessage(err);
  } finally {
    forgotPasswordBtn.disabled = false;
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
    applyRole();
    setActiveTab(activeTab);
  } else {
    mainScreen.hidden = true;
    loginScreen.hidden = false;
    viewRoot.innerHTML = "";
  }
});

function applyRole() {
  const role = getCurrentRole();
  const isViewer = role === "viewer";
  const entryTab = tabbar.querySelector('[data-tab="entry"]');
  const exportTab = tabbar.querySelector('[data-tab="viewExport"]');
  const roleBadge = document.getElementById("role-badge");
  if (entryTab) entryTab.hidden = isViewer;
  if (exportTab) exportTab.hidden = isViewer;
  if (roleBadge) roleBadge.hidden = !isViewer;
  if (isViewer && (activeTab === "entry" || activeTab === "viewExport")) {
    activeTab = "dashboard";
  }
}

// Password visibility toggle
const pwToggle = document.getElementById("pw-toggle");
const pwInput = document.getElementById("login-password");
if (pwToggle && pwInput) {
  pwToggle.addEventListener("click", () => {
    const show = pwInput.type === "password";
    pwInput.type = show ? "text" : "password";
    pwToggle.querySelector(".eye-open").hidden = show;
    pwToggle.querySelector(".eye-closed").hidden = !show;
  });
}

export function showToast(message, isError) {
  const el = document.createElement("div");
  el.className = "toast" + (isError ? " error" : "");
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 3200);
}
