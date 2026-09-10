import { auth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "./firebase-init.js";

let currentUser = null;
const listeners = new Set();

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  listeners.forEach((fn) => fn(user));
});

export function getCurrentUser() {
  return currentUser;
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
