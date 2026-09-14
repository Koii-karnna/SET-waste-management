import { auth, db, collection, query, where, getDocs, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "./firebase-init.js";

let currentUser = null;
let currentRole = "viewer";
const listeners = new Set();

onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  currentRole = user ? await fetchRole(user.email) : "viewer";
  listeners.forEach((fn) => fn(user));
});

const INITIAL_EDITORS = new Set([
  "karnjanal@set.or.th",
]);

async function fetchRole(email) {
  try {
    const q = query(collection(db, "users"), where("email", "==", email));
    const snap = await getDocs(q);
    if (!snap.empty) return snap.docs[0].data().role || "viewer";
  } catch (_) {}
  if (INITIAL_EDITORS.has(email)) return "editor";
  return "viewer";
}

export function getCurrentUser() {
  return currentUser;
}

export function getCurrentRole() {
  return currentRole;
}

export function onAuthChange(fn) {
  listeners.add(fn);
  if (currentUser !== undefined) fn(currentUser);
  return () => listeners.delete(fn);
}

export async function login(email, password) {
  const cred = await signInWithEmailAndPassword(auth, email, password);
  return cred.user;
}

export async function logout() {
  await signOut(auth);
}

export function authErrorMessage(err) {
  const code = err && err.code;
  switch (code) {
    case "auth/invalid-email":
      return "รูปแบบอีเมลไม่ถูกต้อง";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "อีเมลหรือรหัสผ่านไม่ถูกต้อง";
    case "auth/too-many-requests":
      return "ลองผิดหลายครั้งเกินไป กรุณารอสักครู่แล้วลองใหม่";
    default:
      return "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง";
  }
}
