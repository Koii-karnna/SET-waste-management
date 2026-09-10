export function todayISO() {
  const d = new Date();
  const tz = d.getTimezoneOffset() * 60000;
  return new Date(d - tz).toISOString().slice(0, 10);
}

export function parseISO(dateStr) {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function toISO(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function addDays(dateStr, days) {
  const d = parseISO(dateStr);
  d.setDate(d.getDate() + days);
  return toISO(d);
}

// Monday-Sunday week containing dateStr.
export function weekRange(dateStr) {
  const d = parseISO(dateStr);
  const dow = d.getDay() === 0 ? 7 : d.getDay(); // 1=Mon..7=Sun
  const monday = addDays(dateStr, 1 - dow);
  const sunday = addDays(monday, 6);
  return { start: monday, end: sunday };
}

export function monthRange(yyyyMm) {
  const [y, m] = yyyyMm.split("-").map(Number);
  const start = `${yyyyMm}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${yyyyMm}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export function isoWeekLabel(dateStr) {
  const { start, end } = weekRange(dateStr);
  return `${start} - ${end}`;
}

export function round1(n) {
  return Math.round(n * 10) / 10;
}

export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function groupBy(arr, keyFn) {
  const out = {};
  for (const item of arr) {
    const k = keyFn(item);
    (out[k] = out[k] || []).push(item);
  }
  return out;
}
