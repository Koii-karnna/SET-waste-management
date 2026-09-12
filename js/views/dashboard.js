import {
  WASTE_ITEMS, WASTE_ITEM_BY_ID, CATEGORIES, CATEGORY_LABELS_TH,
  CATEGORY_COLORS, BUILDINGS, OTHER_ITEM_ID
} from "../data/wasteItems.js";
import { queryIncomingRange, queryOutgoingRange } from "../db.js";
import { todayISO, parseISO, toISO, addDays, weekRange, round1, sum } from "../utils.js";
import { showToast } from "../main.js";
import { aggregateIncoming, aggregateOutgoing } from "./viewExport.js";
import { exportExcel } from "../export/excelExport.js";
import { exportPptx } from "../export/pptExport.js";

const MS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MF = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const DOW = ["อา.","จ.","อ.","พ.","พฤ.","ศ.","ส."];
const BE = y => y + 543;
const p2 = n => String(n).padStart(2, "0");
const eom = (y, m) => toISO(new Date(y, m + 1, 0));
const fN = n => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });

const STACK_CAT = ["Non Recycle", "Infectious Waste", "Recycle", "Organic", "Hazard"];
const BLD_COL = { A: "#1E88E5", B: "#9B9A8F", C: "#43A047", NP1: "#EF6C00", NP2: "#D32F2F" };
const EST_POP = 900;
const NR_TARGET = 10;

const DISPOSAL_MAP = {
  "รีไซเคิล": "รีไซเคิล", "เผา RDF": "เผา RDF",
  "หมัก/ทำอาหารปลา": "หมัก/อาหารปลา", "หมักปุ๋ย / น้ำหมัก": "หมัก/อาหารปลา",
  "หมัก/ทำอาหารปลา/ทำดิน/ปุ๋ย": "หมัก/อาหารปลา",
  "ทำดิน/ปุ๋ย": "ทำดิน/ปุ๋ย",
  "เผาทำลาย": "เผาทำลาย"
};
const DISPOSAL_ORDER = ["เผา RDF", "รีไซเคิล", "หมัก/อาหารปลา", "ทำดิน/ปุ๋ย", "เผาทำลาย"];
const DISPOSAL_COLOR = { "เผา RDF": "#90CAF9", "รีไซเคิล": "#FFE082", "หมัก/อาหารปลา": "#A5D6A7", "ทำดิน/ปุ๋ย": "#4CAF50", "เผาทำลาย": "#EF9A9A" };
const USABLE_GROUPS = new Set(["รีไซเคิล", "เผา RDF", "หมัก/อาหารปลา", "ทำดิน/ปุ๋ย"]);

function disposalGroup(r) {
  if (r.destination === "SCIeco") return "เผา RDF";
  return DISPOSAL_MAP[r.disposalMethod] || null;
}

let S = { ch: {} };
function init() {
  return { mode: "in", bg: "all", bld: "all", pType: "monthly", pOpts: [], pIdx: 0,
           inD: [], outD: [], allIn: [], allOut: [], ch: {}, root: null };
}
function destroyCh() { if (S.ch) Object.values(S.ch).forEach(c => { try { c.destroy(); } catch (_) {} }); S.ch = {}; }

function fmtWk(s, e) {
  const d1 = parseISO(s), d2 = parseISO(e);
  const [, m1, dd1] = s.split("-").map(Number);
  const [y2, m2, dd2] = e.split("-").map(Number);
  return `${DOW[d1.getDay()]} ${dd1} ${MS[m1 - 1]} – ${DOW[d2.getDay()]} ${dd2} ${MS[m2 - 1]} ${BE(y2)}`;
}

function periodOpts() {
  const now = new Date(), yr = now.getFullYear(), mo = now.getMonth(), be = BE(yr);
  if (S.pType === "monthly") {
    const o = [{ l: `${MS[0]} – ${MS[mo]} ${be}`, s: `${yr}-01-01`, e: eom(yr, mo) }];
    for (let m = mo; m >= 0; m--) o.push({ l: `${MF[m]} ${be}`, s: `${yr}-${p2(m + 1)}-01`, e: eom(yr, m) });
    return o;
  }
  if (S.pType === "weekly") {
    const o = []; let a = todayISO();
    for (let w = 0; w < 16; w++) { const r = weekRange(a); o.push({ l: fmtWk(r.start, r.end), s: r.start, e: r.end }); a = addDays(a, -7); }
    return o;
  }
  return [{ l: `${MS[0]} – ${MS[mo]} ${be} (ทั้งหมด)`, s: `${yr}-01-01`, e: eom(yr, mo) }];
}

/* ── aggregation: by MONTH ── */
function monthlyBk(recs, mode) {
  const bm = {};
  if (mode === "in") {
    for (const r of recs) { const k = r.date.slice(0, 7); if (!bm[k]) { bm[k] = {}; CATEGORIES.forEach(c => bm[k][c] = 0); } for (const [id, kg] of Object.entries(r.items || {})) bm[k][WASTE_ITEM_BY_ID[id]?.category || "Non Recycle"] += kg; }
  } else {
    for (const r of recs) { const k = r.date.slice(0, 7); if (!bm[k]) { bm[k] = {}; CATEGORIES.forEach(c => bm[k][c] = 0); } bm[k][r.category || "Non Recycle"] += r.weightKg; }
  }
  return Object.entries(bm).sort((a, b) => a[0].localeCompare(b[0])).map(([k, cats]) => ({ k, lbl: MS[+k.slice(5, 7) - 1], cats }));
}
function bldMonth(recs) {
  const bm = {};
  for (const r of recs) { const k = r.date.slice(0, 7); if (!bm[k]) bm[k] = {}; const t = sum(Object.values(r.items || {})); bm[k][r.buildingCode] = round1((bm[k][r.buildingCode] || 0) + t); }
  return Object.entries(bm).sort((a, b) => a[0].localeCompare(b[0])).map(([k, b]) => ({ k, lbl: MS[+k.slice(5, 7) - 1], b }));
}

/* ── aggregation: by DATE (weekly mode) ── */
function dailyBk(recs, mode) {
  const bm = {};
  if (mode === "in") {
    for (const r of recs) { const k = r.date; if (!bm[k]) { bm[k] = {}; CATEGORIES.forEach(c => bm[k][c] = 0); } for (const [id, kg] of Object.entries(r.items || {})) bm[k][WASTE_ITEM_BY_ID[id]?.category || "Non Recycle"] += kg; }
  } else {
    for (const r of recs) { const k = r.date; if (!bm[k]) { bm[k] = {}; CATEGORIES.forEach(c => bm[k][c] = 0); } bm[k][r.category || "Non Recycle"] += r.weightKg; }
  }
  return Object.entries(bm).sort((a, b) => a[0].localeCompare(b[0])).map(([k, cats]) => {
    const d = parseISO(k);
    return { k, lbl: `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`, cats };
  });
}
function bldDaily(recs) {
  const bm = {};
  for (const r of recs) { const k = r.date; if (!bm[k]) bm[k] = {}; const t = sum(Object.values(r.items || {})); bm[k][r.buildingCode] = round1((bm[k][r.buildingCode] || 0) + t); }
  return Object.entries(bm).sort((a, b) => a[0].localeCompare(b[0])).map(([k, b]) => {
    const d = parseISO(k);
    return { k, lbl: `${DOW[d.getDay()]} ${d.getDate()}/${d.getMonth() + 1}`, b };
  });
}

/* ── aggregation: by WEEK (monthly mode, single month) ── */
function weeklyBk(recs, mode) {
  const bm = {};
  if (mode === "in") {
    for (const r of recs) { const wr = weekRange(r.date); const k = wr.start; if (!bm[k]) { bm[k] = { _s: wr.start, _e: wr.end }; CATEGORIES.forEach(c => bm[k][c] = 0); } for (const [id, kg] of Object.entries(r.items || {})) bm[k][WASTE_ITEM_BY_ID[id]?.category || "Non Recycle"] += kg; }
  } else {
    for (const r of recs) { const wr = weekRange(r.date); const k = wr.start; if (!bm[k]) { bm[k] = { _s: wr.start, _e: wr.end }; CATEGORIES.forEach(c => bm[k][c] = 0); } bm[k][r.category || "Non Recycle"] += r.weightKg; }
  }
  return Object.entries(bm).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => {
    const ds = parseISO(v._s), de = parseISO(v._e);
    const lbl = ds.getMonth() === de.getMonth()
      ? `${ds.getDate()}-${de.getDate()} ${MS[de.getMonth()]}`
      : `${ds.getDate()} ${MS[ds.getMonth()]}-${de.getDate()} ${MS[de.getMonth()]}`;
    const cats = {}; CATEGORIES.forEach(c => cats[c] = v[c] || 0);
    return { k, lbl, cats };
  });
}
function bldWeekly(recs) {
  const bm = {};
  for (const r of recs) { const wr = weekRange(r.date); const k = wr.start; if (!bm[k]) bm[k] = { _s: wr.start, _e: wr.end }; const t = sum(Object.values(r.items || {})); bm[k][r.buildingCode] = round1((bm[k][r.buildingCode] || 0) + t); }
  return Object.entries(bm).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => {
    const ds = parseISO(v._s), de = parseISO(v._e);
    const lbl = ds.getMonth() === de.getMonth()
      ? `${ds.getDate()}-${de.getDate()} ${MS[de.getMonth()]}`
      : `${ds.getDate()} ${MS[ds.getMonth()]}-${de.getDate()} ${MS[de.getMonth()]}`;
    const b = {}; Object.keys(v).filter(x => x !== "_s" && x !== "_e").forEach(x => b[x] = v[x]);
    return { k, lbl, b };
  });
}

/* ── dispatchers ── */
function getStackPeriods(recs, mode) {
  if (S.pType === "weekly") return dailyBk(recs, mode);
  if (S.pType === "monthly" && S.pIdx > 0) return weeklyBk(recs, mode);
  return monthlyBk(recs, mode);
}
function getBldPeriods(recs) {
  if (S.pType === "weekly") return bldDaily(recs);
  if (S.pType === "monthly" && S.pIdx > 0) return bldWeekly(recs);
  return bldMonth(recs);
}

/* ── insight helpers ── */
function monthlyInsight(recs, mode, filterFn) {
  const filtered = filterFn ? recs.filter(filterFn) : recs;
  const byM = {};
  if (mode === "in") {
    for (const r of filtered) {
      const m = r.date.slice(0, 7);
      if (!byM[m]) { byM[m] = { total: 0, cats: {}, items: {} }; CATEGORIES.forEach(c => byM[m].cats[c] = 0); }
      for (const [id, kg] of Object.entries(r.items || {})) {
        const cat = WASTE_ITEM_BY_ID[id]?.category || "Non Recycle";
        byM[m].cats[cat] += kg; byM[m].total += kg;
        byM[m].items[id] = (byM[m].items[id] || 0) + kg;
      }
    }
  } else {
    for (const r of filtered) {
      const m = r.date.slice(0, 7);
      if (!byM[m]) { byM[m] = { total: 0, cats: {}, items: {} }; CATEGORIES.forEach(c => byM[m].cats[c] = 0); }
      byM[m].cats[r.category || "Non Recycle"] += r.weightKg; byM[m].total += r.weightKg;
      if (r.itemId) byM[m].items[r.itemId] = (byM[m].items[r.itemId] || 0) + r.weightKg;
    }
  }
  return Object.entries(byM).sort((a, b) => a[0].localeCompare(b[0])).map(([m, d]) => ({
    month: m, total: round1(d.total), cats: d.cats, items: d.items,
    nrPct: d.total > 0 ? round1((d.cats["Non Recycle"] || 0) / d.total * 1000) / 10 : 0,
    organicKg: round1(d.cats.Organic || 0)
  }));
}

function linearReg(xs, ys) {
  const n = xs.length; if (n < 2) return { slope: 0, intercept: ys[0] || 0, r2: 0 };
  const mx = sum(xs) / n, my = sum(ys) / n;
  let ssxx = 0, ssxy = 0, ssyy = 0;
  for (let i = 0; i < n; i++) { ssxx += (xs[i] - mx) ** 2; ssxy += (xs[i] - mx) * (ys[i] - my); ssyy += (ys[i] - my) ** 2; }
  const slope = ssxx > 0 ? ssxy / ssxx : 0;
  const intercept = my - slope * mx;
  const r2 = ssyy > 0 ? (ssxy ** 2) / (ssxx * ssyy) : 0;
  return { slope, intercept, r2 };
}

function sparkCanvas(container, data, opts = {}) {
  if (!container || data.length < 2) return null;
  const cv = document.createElement("canvas");
  const w = opts.w || 120, h = opts.h || 40;
  cv.width = w; cv.height = h;
  cv.style.width = w + "px"; cv.style.height = h + "px";
  container.appendChild(cv);
  const datasets = [{ data, borderColor: opts.color || "#1E88E5", borderWidth: 1.5, pointRadius: 0, tension: 0.3, fill: false }];
  if (opts.target != null) datasets.push({ data: Array(data.length).fill(opts.target), borderColor: "#D32F2F", borderWidth: 1, borderDash: [4, 3], pointRadius: 0, fill: false });
  return new Chart(cv, {
    type: "line", data: { labels: data.map((_, i) => i), datasets },
    options: { responsive: false, animation: false, plugins: { legend: { display: false }, datalabels: { display: false } },
      scales: { x: { display: false }, y: { display: false, min: opts.min, max: opts.max } } }
  });
}

if (typeof ChartDataLabels !== "undefined") Chart.register(ChartDataLabels);

/* ══════════════════════════════════════ MAIN ══════════════════════════════════════ */

export function renderDashboard(container) {
  destroyCh();
  S = init();
  S.root = container;
  container.innerHTML = html();
  listen();
  refreshPR();
  load();
}

function html() {
  const bldOpts = ["A", "B", "C", "NP1", "NP2"].map(b => `<option value="${b}">${b.length > 2 ? b : "อาคาร " + b}</option>`).join("");
  return `
<div class="controls">
  <div class="pill-group" id="mp"><button class="pill active" data-v="in">ขาเข้า</button><button class="pill" data-v="out">ขาออก</button></div>
  <div class="pill-group" id="bp"><button class="pill active" data-v="all">ทุกอาคาร</button><button class="pill" data-v="CMC">CMC</button><button class="pill" data-v="NP">NP</button></div>
  <select class="sel" id="bs"><option value="all">ทุกอาคาร</option>${bldOpts}</select>
  <div class="divider"></div>
  <div class="period-pair">
    <select class="sel" id="pt"><option value="monthly" selected>รายเดือน</option><option value="weekly">รายสัปดาห์</option><option value="all">ทั้งหมด</option></select>
    <select class="sel" id="pr"></select>
  </div>
  <span class="spacer"></span>
  <button class="btn" id="bx"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>Excel</button>
  <button class="btn primary" id="bpp"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4M7 10l5 5 5-5M12 15V3"/></svg>PowerPoint</button>
</div>
<div id="kpi" class="kpi-row"></div>
<div class="panel">
  <div class="panel-head"><span class="panel-title">แนวโน้มปริมาณขยะ</span></div>
  <div class="panel-hint">น้ำหนักรวมแยกประเภท (กก.) · % ในแต่ละชั้น · เส้นประ = ค่าเฉลี่ย</div>
  <div class="chart-box" style="height:340px"><canvas id="cS"></canvas></div>
  <div class="change-row" id="cr"></div>
  <div class="stack-legend" id="stLegend"></div>
</div>
<div class="grid-2">
  <div class="panel">
    <div class="panel-head"><span class="panel-title">เปรียบเทียบรายอาคาร</span></div>
    <div class="panel-hint" id="bh">น้ำหนักรวม (กก.)</div>
    <div class="chart-box" style="height:270px"><canvas id="cB"></canvas></div>
  </div>
  <div class="panel">
    <span class="panel-title">รูปแบบการกำจัด</span>
    <div class="panel-hint" id="dh"></div>
    <div class="chart-box" style="height:220px"><canvas id="cD"></canvas></div>
    <div id="dl" style="margin-top:10px"></div>
  </div>
</div>
<div class="panel">
  <div class="panel-head"><span class="panel-title">แนวโน้มรูปแบบการกำจัด</span></div>
  <div class="panel-hint">ปริมาณขยะขาออกแยกตามวิธีกำจัด · ตัวเลขบนแท่ง = % ใช้ได้</div>
  <div class="chart-box" style="height:280px"><canvas id="cDT"></canvas></div>
</div>
<div class="grid-2e">
  <div class="panel">
    <span class="panel-title">ผู้ใช้อาคาร vs ขยะต่อคน</span>
    <div class="panel-hint">กก./คน/วัน (ประมาณจากผู้ใช้ ~${EST_POP} คน/วัน)</div>
    <div class="chart-box" style="height:240px"><canvas id="cP"></canvas></div>
  </div>
  <div class="yearly-placeholder">
    <div style="font-size:40px;margin-bottom:8px">📊</div>
    <div style="font-size:16px;font-weight:600;margin-bottom:6px">แนวโน้มรายปี</div>
    <div style="font-size:13px;color:var(--text-2);max-width:300px">เปรียบเทียบปริมาณขยะย้อนหลังหลายปี<br><br><b style="color:var(--accent-dark)">รอข้อมูลปีก่อนๆ</b></div>
  </div>
</div>
<div id="catCards"></div>
<div class="insight-section">
  <div id="goalCard"></div>
  <div class="insight-grid" id="insightGrid"></div>
</div>`;
}

function listen() {
  const r = S.root;
  r.querySelector("#mp").onclick = e => { const b = e.target.closest(".pill"); if (!b) return; S.mode = b.dataset.v; pills(r.querySelector("#mp"), S.mode); renderAll(); };
  r.querySelector("#bp").onclick = e => { const b = e.target.closest(".pill"); if (!b) return; S.bg = b.dataset.v; pills(r.querySelector("#bp"), S.bg); updBldSel(); S.bld = "all"; r.querySelector("#bs").value = "all"; renderAll(); };
  r.querySelector("#bs").onchange = e => { S.bld = e.target.value; renderAll(); };
  r.querySelector("#pt").onchange = e => { S.pType = e.target.value; refreshPR(); load(); };
  r.querySelector("#pr").onchange = e => { S.pIdx = +e.target.value; load(); };
  r.querySelector("#bx").onclick = doXls;
  r.querySelector("#bpp").onclick = doPpt;
}

function pills(g, v) { g.querySelectorAll(".pill").forEach(p => p.classList.toggle("active", p.dataset.v === v)); }

function updBldSel() {
  const sel = S.root.querySelector("#bs");
  const blds = S.bg === "CMC" ? ["A", "B", "C"] : S.bg === "NP" ? ["NP1", "NP2"] : ["A", "B", "C", "NP1", "NP2"];
  sel.innerHTML = `<option value="all">ทุกอาคาร</option>` + blds.map(b => `<option value="${b}">${b.length > 2 ? b : "อาคาร " + b}</option>`).join("");
}

function refreshPR() {
  S.pOpts = periodOpts(); S.pIdx = 0;
  S.root.querySelector("#pr").innerHTML = S.pOpts.map((o, i) => `<option value="${i}">${o.l}</option>`).join("");
}

async function load() {
  const p = S.pOpts[S.pIdx]; if (!p) return;
  const now = new Date(), yr = now.getFullYear(), mo = now.getMonth();
  const m5 = new Date(yr, mo - 5, 1);
  const histS = `${m5.getFullYear()}-${p2(m5.getMonth() + 1)}-01`;
  const histE = eom(yr, mo);
  const fetchS = histS < p.s ? histS : p.s;
  const fetchE = histE > p.e ? histE : p.e;
  try {
    const [aIn, aOut] = await Promise.all([queryIncomingRange(fetchS, fetchE), queryOutgoingRange(fetchS, fetchE)]);
    S.allIn = aIn; S.allOut = aOut;
    let fS = p.s, fE = p.e;
    if (S.pType === "monthly" && S.pIdx > 0) {
      fS = weekRange(p.s).start;
      fE = weekRange(p.e).end;
    }
    S.inD = aIn.filter(r => r.date >= fS && r.date <= fE);
    S.outD = aOut.filter(r => r.date >= fS && r.date <= fE);
  } catch (err) { showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, true); S.inD = []; S.outD = []; S.allIn = []; S.allOut = []; }
  renderAll();
}

function filt() {
  let inc = S.inD;
  if (S.bg !== "all") inc = inc.filter(r => r.buildingGroup === S.bg);
  if (S.bld !== "all") inc = inc.filter(r => r.buildingCode === S.bld);
  return { inc, out: S.outD };
}

function cwIn(recs) {
  const w = {}; CATEGORIES.forEach(c => w[c] = 0);
  for (const r of recs) for (const [id, kg] of Object.entries(r.items || {})) w[WASTE_ITEM_BY_ID[id]?.category || "Non Recycle"] += kg;
  return w;
}
function cwOut(recs) {
  const w = {}; CATEGORIES.forEach(c => w[c] = 0);
  for (const r of recs) w[r.category || "Non Recycle"] += r.weightKg;
  return w;
}

function itemTot(recs, mode) {
  const t = {};
  if (mode === "in") { for (const r of recs) for (const [id, kg] of Object.entries(r.items || {})) t[id] = round1((t[id] || 0) + kg); }
  else { for (const r of recs) if (r.itemId) t[r.itemId] = round1((t[r.itemId] || 0) + r.weightKg); }
  return t;
}

/* ══════════════════════════════════ RENDER ALL ═══════════════════════════════════ */

function renderAll() {
  destroyCh();
  const { inc, out } = filt();
  const active = S.mode === "in" ? inc : out;
  const cw = S.mode === "in" ? cwIn(active) : cwOut(active);
  const total = round1(sum(Object.values(cw)));
  renderKPI(cw, total, active);
  renderStack(getStackPeriods(active, S.mode));
  S.mode === "in" ? renderBld(getBldPeriods(inc), inc) : renderBld([], []);
  renderDonut();
  renderDisposalTrend();
  renderPC(active);
  renderCategoryCards();
  renderInsight();
}

/* ══════════════════════════════════ CHARTS ═══════════════════════════════════════ */

function renderKPI(cw, total, recs) {
  const ih = round1((cw["Infectious Waste"] || 0) + (cw["Hazard"] || 0));
  const pct = v => total > 0 ? (v / total * 100).toFixed(1) : "0.0";
  const nMo = new Set(recs.map(r => (r.date || "").slice(0, 7))).size || 1;
  S.root.querySelector("#kpi").innerHTML = `
    <div class="kpi hl"><div class="kpi-label">ขยะทั้งหมด</div><div class="kpi-val num">${fN(total)}<span class="u">กก.</span></div><div class="kpi-sub">เฉลี่ย ${fN(round1(total / nMo))} กก./เดือน</div></div>
    <div class="kpi"><div class="kpi-label"><span class="kpi-dot" style="background:var(--recycle)"></span>Recycle</div><div class="kpi-val num" style="color:var(--recycle)">${fN(round1(cw.Recycle || 0))}<span class="u">กก.</span></div><div class="kpi-sub">${pct(cw.Recycle || 0)}%</div></div>
    <div class="kpi"><div class="kpi-label"><span class="kpi-dot" style="background:var(--organic)"></span>Organic</div><div class="kpi-val num" style="color:var(--organic)">${fN(round1(cw.Organic || 0))}<span class="u">กก.</span></div><div class="kpi-sub">${pct(cw.Organic || 0)}%</div></div>
    <div class="kpi"><div class="kpi-label"><span class="kpi-dot" style="background:var(--nonrecycle)"></span>Non Recycle</div><div class="kpi-val num" style="color:var(--nonrecycle)">${fN(round1(cw["Non Recycle"] || 0))}<span class="u">กก.</span></div><div class="kpi-sub">${pct(cw["Non Recycle"] || 0)}%</div></div>
    <div class="kpi"><div class="kpi-label"><span class="kpi-dot" style="background:var(--infectious)"></span>Infectious + <span style="color:var(--hazard)">Hazard</span></div><div class="kpi-val num" style="color:var(--infectious)">${fN(ih)}<span class="u">กก.</span></div><div class="kpi-sub">${pct(ih)}%</div></div>`;
}

function renderStack(periods) {
  const labels = periods.map(p => p.lbl);
  const totals = periods.map(p => round1(sum(CATEGORIES.map(c => p.cats[c] || 0))));
  const avg = totals.length ? round1(sum(totals) / totals.length) : 0;

  const ds = STACK_CAT.map((cat, i) => ({
    label: CATEGORY_LABELS_TH[cat] || cat,
    data: periods.map(p => round1(p.cats[cat] || 0)),
    backgroundColor: CATEGORY_COLORS[cat],
    borderRadius: i === STACK_CAT.length - 1 ? { topLeft: 3, topRight: 3 } : 0,
    order: 2,
    datalabels: {
      display: ctx => { const t = totals[ctx.dataIndex]; return t > 0 && (ctx.dataset.data[ctx.dataIndex] / t * 100) >= 5; },
      formatter: (v, ctx) => { const t = totals[ctx.dataIndex]; return t > 0 ? (v / t * 100).toFixed(1) + "%" : ""; }
    }
  }));
  ds.push({ label: "ค่าเฉลี่ย", data: Array(periods.length).fill(avg), type: "line", borderColor: "#23211F", borderWidth: 2, borderDash: [6, 4], pointRadius: 0, order: 1, fill: false, datalabels: { display: false } });

  S.ch.st = new Chart(S.root.querySelector("#cS"), {
    type: "bar", data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        datalabels: { color: "#fff", font: { size: 10.5, weight: "bold", family: "DM Sans" }, anchor: "center", align: "center" }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } },
        y: { stacked: true, grid: { color: "#E8E6DF" }, ticks: { font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000) + "k" : v } }
      }
    }
  });

  const cr = S.root.querySelector("#cr"); cr.innerHTML = "";
  totals.forEach((t, i) => {
    const d = document.createElement("div"); d.className = "change-cell";
    if (i === 0 || totals[i - 1] === 0) { d.innerHTML = '<span class="flat">—</span>'; }
    else { const c = ((t - totals[i - 1]) / totals[i - 1] * 100).toFixed(1); d.innerHTML = +c > 0 ? `<span class="up">↑ +${c}%</span>` : +c < 0 ? `<span class="down">↓ ${c}%</span>` : '<span class="flat">0%</span>'; }
    cr.appendChild(d);
  });
  requestAnimationFrame(() => {
    if (S.ch.st?.chartArea) {
      const ca = S.ch.st.chartArea;
      cr.style.paddingLeft = ca.left + "px";
      cr.style.paddingRight = (S.ch.st.width - ca.right) + "px";
    }
  });

  const stL = S.root.querySelector("#stLegend");
  stL.innerHTML = STACK_CAT.map(cat =>
    `<span class="st-leg-item"><span class="st-leg-dot" style="background:${CATEGORY_COLORS[cat]}"></span>${CATEGORY_LABELS_TH[cat] || cat}</span>`
  ).join("") + `<span class="st-leg-item"><span class="st-leg-line"></span>ค่าเฉลี่ย</span>`;
}

function renderBld(data, recs) {
  const cv = S.root.querySelector("#cB");
  if (!data.length || S.mode === "out") {
    S.root.querySelector("#bh").textContent = S.mode === "out" ? "เฉพาะข้อมูลขาเข้า" : "ไม่มีข้อมูล";
    S.ch.bl = new Chart(cv, { type: "line", data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } } } });
    return;
  }
  const blds = [...new Set(recs.map(r => r.buildingCode))].sort();
  S.root.querySelector("#bh").textContent = `น้ำหนักรวม (กก.) — ${blds.map(b => "อาคาร " + b).join(" / ")}`;
  S.ch.bl = new Chart(cv, {
    type: "line",
    data: {
      labels: data.map(d => d.lbl),
      datasets: blds.map(b => ({
        label: "อาคาร " + b, data: data.map(d => round1(d.b[b] || 0)),
        borderColor: BLD_COL[b] || "#999", tension: 0.4, borderWidth: 2.5,
        pointRadius: 5, pointBackgroundColor: BLD_COL[b] || "#999", pointBorderColor: "#fff", pointBorderWidth: 2, fill: false,
        datalabels: { display: false }
      }))
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 14, font: { size: 11.5 } } }, datalabels: { display: false } },
      scales: { x: { grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } }, y: { grid: { color: "#E8E6DF" }, ticks: { font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000) + "k" : v } } },
      interaction: { intersect: false, mode: "index" }
    }
  });
}

function renderDonut() {
  const p = S.pOpts[S.pIdx];
  S.root.querySelector("#dh").textContent = p?.l || "";

  const groupW = {}; DISPOSAL_ORDER.forEach(g => groupW[g] = 0);
  for (const r of S.outD) { const g = disposalGroup(r); if (g) groupW[g] += r.weightKg || 0; }
  const data = DISPOSAL_ORDER.map(g => round1(groupW[g]));
  const cols = DISPOSAL_ORDER.map(g => DISPOSAL_COLOR[g]);
  const total = round1(sum(data));
  const usableKg = round1(sum(DISPOSAL_ORDER.filter(g => USABLE_GROUPS.has(g)).map(g => groupW[g])));
  const usablePct = total > 0 ? round1(usableKg / total * 1000) / 10 : 0;

  S.ch.dn = new Chart(S.root.querySelector("#cD"), {
    type: "doughnut",
    data: { labels: DISPOSAL_ORDER, datasets: [{ data, backgroundColor: cols, borderColor: "#fff", borderWidth: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { display: false }, datalabels: { display: false } } },
    plugins: [{
      id: "centerText",
      afterDraw(chart) {
        const { ctx, chartArea } = chart; if (!chartArea) return;
        const cx = (chartArea.left + chartArea.right) / 2, cy = (chartArea.top + chartArea.bottom) / 2;
        ctx.save(); ctx.textAlign = "center"; ctx.textBaseline = "middle";
        ctx.font = 'bold 26px "DM Sans"'; ctx.fillStyle = "#43A047";
        ctx.fillText(usablePct.toFixed(1) + "%", cx, cy - 8);
        ctx.font = '600 13px "Sarabun"'; ctx.fillStyle = "#888";
        ctx.fillText("% ใช้ได้", cx, cy + 14);
        ctx.restore();
      }
    }]
  });

  S.root.querySelector("#dl").innerHTML = DISPOSAL_ORDER.map((g, i) => {
    const pct = total > 0 ? (data[i] / total * 100).toFixed(1) : "0.0";
    return `<div class="donut-legend-row"><span><span class="donut-legend-dot" style="background:${cols[i]}"></span>${g}</span><span class="num" style="font-weight:600">${fN(data[i])} กก. · ${pct}%</span></div>`;
  }).join("") + `<div class="donut-legend-row" style="margin-top:6px;padding-top:6px;border-top:1px solid var(--border)"><span style="font-weight:600">% ใช้ได้ (รีไซเคิล+RDF+หมัก+ทำดิน)</span><span class="num" style="font-weight:700;color:#43A047">${usablePct.toFixed(1)}%</span></div>`;
}

function getDisposalPeriods() {
  const byK = {};
  for (const r of S.outD) {
    let k, _s, _e;
    if (S.pType === "weekly") { k = r.date; }
    else if (S.pType === "monthly" && S.pIdx > 0) { const wr = weekRange(r.date); k = wr.start; _s = wr.start; _e = wr.end; }
    else { k = r.date.slice(0, 7); }
    if (!byK[k]) { byK[k] = { _s, _e }; DISPOSAL_ORDER.forEach(g => byK[k][g] = 0); }
    if (_s) { byK[k]._s = _s; byK[k]._e = _e; }
    const g = disposalGroup(r); if (g) byK[k][g] += r.weightKg || 0;
  }
  return Object.entries(byK).sort((a, b) => a[0].localeCompare(b[0])).map(([k, v]) => {
    let lbl;
    if (S.pType === "weekly") { const dt = parseISO(k); lbl = `${DOW[dt.getDay()]} ${dt.getDate()}/${dt.getMonth() + 1}`; }
    else if (S.pType === "monthly" && S.pIdx > 0) {
      const ds = parseISO(v._s), de = parseISO(v._e);
      lbl = ds.getMonth() === de.getMonth() ? `${ds.getDate()}-${de.getDate()} ${MS[de.getMonth()]}` : `${ds.getDate()} ${MS[ds.getMonth()]}-${de.getDate()} ${MS[de.getMonth()]}`;
    } else { lbl = MS[+k.slice(5, 7) - 1]; }
    const d = {}; DISPOSAL_ORDER.forEach(g => d[g] = round1(v[g] || 0));
    return { k, lbl, d };
  });
}

function renderDisposalTrend() {
  const cv = S.root.querySelector("#cDT"); if (!cv) return;
  const periods = getDisposalPeriods();
  if (!periods.length) { S.ch.dt = new Chart(cv, { type: "bar", data: { labels: [], datasets: [] }, options: { responsive: true, maintainAspectRatio: false, plugins: { datalabels: { display: false } } } }); return; }

  const labels = periods.map(p => p.lbl);
  const totals = periods.map(p => round1(sum(DISPOSAL_ORDER.map(g => p.d[g]))));
  const usablePcts = periods.map((p, i) => totals[i] > 0 ? round1(sum(DISPOSAL_ORDER.filter(g => USABLE_GROUPS.has(g)).map(g => p.d[g])) / totals[i] * 1000) / 10 : 0);

  const ds = DISPOSAL_ORDER.map((g, i) => ({
    label: g, data: periods.map(p => round1(p.d[g])),
    backgroundColor: DISPOSAL_COLOR[g], borderColor: DISPOSAL_COLOR[g], borderWidth: 1,
    borderRadius: i === DISPOSAL_ORDER.length - 1 ? { topLeft: 3, topRight: 3 } : 0,
    datalabels: {
      display: ctx => { const t = totals[ctx.dataIndex]; return t > 0 && ctx.dataset.data[ctx.dataIndex] > 0 && (ctx.dataset.data[ctx.dataIndex] / t * 100) >= 5; },
      formatter: v => fN(v),
      color: "#444", font: { size: 10, weight: "bold", family: "DM Sans" }, anchor: "center", align: "center"
    }
  }));

  const usableTextPlugin = {
    id: "usableText",
    afterDraw(chart) {
      const { ctx, scales: { x, y } } = chart;
      ctx.save();
      for (let i = 0; i < labels.length; i++) {
        const xPos = x.getPixelForValue(i), yPos = y.getPixelForValue(totals[i]);
        ctx.font = 'bold 11px "DM Sans"'; ctx.fillStyle = "#2E7D32";
        ctx.textAlign = "center"; ctx.textBaseline = "bottom";
        ctx.fillText(usablePcts[i].toFixed(1) + "% ใช้ได้", xPos, yPos - 4);
      }
      ctx.restore();
    }
  };

  const leadLinePlugin = {
    id: "leadLine",
    afterDatasetsDraw(chart) {
      const { ctx } = chart;
      chart.data.datasets.forEach((dataset, dsIdx) => {
        const meta = chart.getDatasetMeta(dsIdx);
        meta.data.forEach((bar, i) => {
          const v = dataset.data[i]; if (!v || v <= 0) return;
          const t = totals[i], pct = t > 0 ? v / t * 100 : 0;
          if (pct >= 5 || pct < 0.5) return;
          const cy = (bar.y + bar.base) / 2;
          const x1 = bar.x + bar.width / 2 + 2, x2 = x1 + 18;
          ctx.save();
          ctx.beginPath(); ctx.moveTo(x1, cy); ctx.lineTo(x2, cy);
          ctx.strokeStyle = "#aaa"; ctx.lineWidth = 0.8; ctx.stroke();
          ctx.font = '9px "DM Sans"'; ctx.fillStyle = "#666";
          ctx.textAlign = "left"; ctx.textBaseline = "middle";
          ctx.fillText(fN(v), x2 + 2, cy);
          ctx.restore();
        });
      });
    }
  };

  S.ch.dt = new Chart(cv, {
    type: "bar", data: { labels, datasets: ds },
    options: {
      responsive: true, maintainAspectRatio: false,
      layout: { padding: { top: 22 } },
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 12, font: { size: 11 } } }, datalabels: { display: false } },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 11 }, maxRotation: 45 } },
        y: { stacked: true, grid: { color: "#E8E6DF" }, ticks: { font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000) + "k" : v } }
      }
    },
    plugins: [usableTextPlugin, leadLinePlugin]
  });
}

function renderPC(recs) {
  const byM = {};
  if (S.mode === "in") { for (const r of recs) { const k = r.date.slice(0, 7); byM[k] = round1((byM[k] || 0) + sum(Object.values(r.items || {}))); } }
  else { for (const r of recs) { const k = r.date.slice(0, 7); byM[k] = round1((byM[k] || 0) + r.weightKg); } }

  const months = Object.keys(byM).sort();
  const labels = months.map(k => MS[+k.slice(5, 7) - 1]);
  const kpd = months.map(k => { const [y, m] = k.split("-").map(Number); const days = new Date(y, m, 0).getDate(); return Math.round(byM[k] / EST_POP / days * 100) / 100; });

  S.ch.pc = new Chart(S.root.querySelector("#cP"), {
    type: "line",
    data: {
      labels,
      datasets: [
        { label: "กก./คน/วัน", data: kpd, borderColor: "#FBB034", backgroundColor: "#FBB03420", fill: true, tension: 0.35, borderWidth: 2.5, pointBackgroundColor: "#FBB034", pointRadius: 4, datalabels: { display: false } },
        { label: "ขยะรวม (พัน กก.)", data: months.map(k => round1(byM[k] / 1000)), borderColor: "#1E88E5", fill: false, tension: 0.35, borderWidth: 2, borderDash: [5, 3], pointRadius: 3, yAxisID: "y2", datalabels: { display: false } }
      ]
    },
    options: {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { position: "bottom", labels: { usePointStyle: true, padding: 12, font: { size: 11 } } }, datalabels: { display: false } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 12 } } },
        y: { position: "left", grid: { color: "#E8E6DF" }, title: { display: true, text: "กก./คน/วัน", font: { size: 11 } }, ticks: { font: { size: 11 } } },
        y2: { position: "right", grid: { display: false }, title: { display: true, text: "พัน กก.", font: { size: 11 } }, ticks: { font: { size: 11 } } }
      }
    }
  });
}

const CAT_ABBR = { Recycle: "RC", Organic: "OG", "Non Recycle": "NR", "Infectious Waste": "IW", Hazard: "HZ" };

function renderCategoryCards() {
  const { inc, out } = filt();
  const active = S.mode === "in" ? inc : out;
  const totals = itemTot(active, S.mode);
  const grandTotal = round1(sum(Object.values(totals)));

  const buildFilter = r => {
    if (S.bg !== "all" && r.buildingGroup !== S.bg) return false;
    if (S.bld !== "all" && r.buildingCode !== S.bld) return false;
    return true;
  };
  const histRecs = S.mode === "in" ? S.allIn : S.allOut;
  const filterFn = S.mode === "in" ? buildFilter : null;
  const mStats = monthlyInsight(histRecs, S.mode, filterFn);

  const catOrder = ["Recycle", "Organic", "Non Recycle", "Infectious Waste", "Hazard"];
  let cards = "";

  for (const cat of catOrder) {
    const catItems = WASTE_ITEMS.filter(it => it.category === cat && it.id !== OTHER_ITEM_ID)
      .map(it => ({ id: it.id, name: it.nameTh, kg: totals[it.id] || 0 }))
      .sort((a, b) => b.kg - a.kg);
    const catTotal = round1(sum(catItems.map(it => it.kg)));
    const catPct = grandTotal > 0 ? (catTotal / grandTotal * 100).toFixed(1) : "0.0";
    const itemCount = catItems.filter(it => it.kg > 0).length;
    const top3 = catItems.slice(0, 3);
    const maxKg = top3.length ? top3[0].kg : 1;

    const itemsHtml = top3.filter(it => it.kg > 0).map(it => {
      const pct = catTotal > 0 ? (it.kg / catTotal * 100).toFixed(1) : "0.0";
      const bw = maxKg > 0 ? Math.max(it.kg / maxKg * 100, 1) : 0;
      return `<div class="cc-item-row"><span class="cc-item-name" title="${it.name}">${it.name}</span><span class="cc-item-val num">${fN(it.kg)} กก. ${pct}%</span></div><div class="cc-bar-wrap"><div class="cc-bar" style="width:${bw}%;background:${CATEGORY_COLORS[cat]}"></div></div>`;
    }).join("") || '<div style="font-size:13px;color:var(--text-3)">ไม่มีข้อมูล</div>';

    let trendHtml = "";
    if (mStats.length >= 2) {
      const lastM = mStats[mStats.length - 1];
      const trendLines = top3.filter(it => it.kg > 0).map(it => {
        const avg = sum(mStats.map(m => m.items[it.id] || 0)) / mStats.length;
        if (avg === 0) return "";
        const lastVal = lastM.items[it.id] || 0;
        const pc = round1(((lastVal - avg) / avg) * 100);
        const abs = Math.abs(pc);
        const lbl = it.name.length > 22 ? it.name.slice(0, 22) + "…" : it.name;
        if (pc > 5) return `<div class="cc-trend-line"><span class="cc-ta cc-up">↑</span> ${lbl} เพิ่มขึ้น ${abs.toFixed(0)}% จากค่าเฉลี่ย</div>`;
        if (pc < -5) return `<div class="cc-trend-line"><span class="cc-ta cc-down">↓</span> ${lbl} ลดลง ${abs.toFixed(0)}% จากค่าเฉลี่ย</div>`;
        return `<div class="cc-trend-line"><span class="cc-ta cc-flat">→</span> ${lbl} คงที่</div>`;
      }).join("");

      const catAvg = round1(sum(mStats.map(m => { let s = 0; for (const it of catItems) s += (m.items[it.id] || 0); return s; })) / mStats.length);
      let lastCatKg = 0; for (const it of catItems) lastCatKg += (lastM.items[it.id] || 0);
      lastCatKg = round1(lastCatKg);
      const catCh = catAvg > 0 ? round1(((lastCatKg - catAvg) / catAvg) * 100) : 0;
      const catCls = catCh > 0 ? "cc-up" : catCh < 0 ? "cc-down" : "cc-flat";
      const catArr = catCh > 0 ? "↑" : catCh < 0 ? "↓" : "→";
      const mLbl = MS[+lastM.month.slice(5, 7) - 1];

      trendHtml = `<div class="cc-col-title">แนวโน้ม (เฉลี่ยปี vs เดือนล่าสุด)</div><div class="cc-trend-text">${trendLines}</div><div class="cc-trend-cmp">เฉลี่ย ${fN(catAvg)} กก./เดือน → ${mLbl} ${fN(lastCatKg)} กก. <span class="cc-ta ${catCls}">${catArr} ${catCh > 0 ? '+' : ''}${catCh.toFixed(1)}%</span></div>`;
    } else {
      trendHtml = `<div class="cc-col-title">แนวโน้ม</div><div style="font-size:13px;color:var(--text-3)">ต้องมีข้อมูลอย่างน้อย 2 เดือน</div>`;
    }

    cards += `
    <div class="cat-card">
      <div class="cat-head">
        <div class="cat-head-l"><div class="cat-badge" style="background:${CATEGORY_COLORS[cat]}">${CAT_ABBR[cat]}</div><div><div class="cat-name">${cat}</div><div class="cat-sub">${catPct}% ของขยะทั้งหมด</div></div></div>
        <div class="cat-head-r"><div class="cat-total num" style="color:${CATEGORY_COLORS[cat]}">${fN(catTotal)}</div><div class="cat-total-sub">กก. ทั้งหมด &nbsp; <b style="color:var(--text)">${itemCount}</b> รายการ</div></div>
      </div>
      <div class="cat-body"><div class="cat-col"><div class="cc-col-title">รายการสูงสุด</div>${itemsHtml}</div><div class="cat-col">${trendHtml}</div></div>
    </div>`;
  }

  S.root.querySelector("#catCards").innerHTML = cards;
}

/* ══════════════════════════════════ INSIGHT CARDS ════════════════════════════════ */

function renderInsight() {
  const buildFilter = r => {
    if (S.bg !== "all" && r.buildingGroup !== S.bg) return false;
    if (S.bld !== "all" && r.buildingCode !== S.bld) return false;
    return true;
  };
  const histRecs = S.mode === "in" ? S.allIn : S.allOut;
  const filterFn = S.mode === "in" ? buildFilter : null;
  const mStats = monthlyInsight(histRecs, S.mode, filterFn);

  renderGoal(mStats);
  renderAnomalyCards(mStats);
}

function renderGoal(mStats) {
  const container = S.root.querySelector("#goalCard");
  if (!mStats.length) { container.innerHTML = ""; return; }

  const { inc, out } = filt();
  const active = S.mode === "in" ? inc : out;
  const cw = S.mode === "in" ? cwIn(active) : cwOut(active);
  const total = round1(sum(Object.values(cw)));
  const nrKg = round1(cw["Non Recycle"] || 0);
  const nrPct = total > 0 ? round1(nrKg / total * 1000) / 10 : 0;
  const passed = nrPct <= NR_TARGET;

  const prevP = S.pOpts[S.pIdx + 1];
  let trend = null;
  if (prevP) {
    const prevRecs = S.mode === "in"
      ? S.allIn.filter(r => r.date >= prevP.s && r.date <= prevP.e && (S.bg === "all" || r.buildingGroup === S.bg) && (S.bld === "all" || r.buildingCode === S.bld))
      : S.allOut.filter(r => r.date >= prevP.s && r.date <= prevP.e);
    const prevCw = S.mode === "in" ? cwIn(prevRecs) : cwOut(prevRecs);
    const prevTotal = round1(sum(Object.values(prevCw)));
    const prevNrPct = prevTotal > 0 ? round1((prevCw["Non Recycle"] || 0) / prevTotal * 1000) / 10 : 0;
    trend = round1((nrPct - prevNrPct) * 10) / 10;
  }

  const margin = round1((NR_TARGET - nrPct) * 10) / 10;
  const marginKg = total > 0 ? round1(Math.abs(margin) / 100 * total) : 0;
  const detail = passed
    ? `ต่ำกว่าเป้า ${Math.abs(margin).toFixed(1)}% — เหลือ margin ${fN(marginKg)} กก.`
    : `ต้องลดอีก ${fN(marginKg)} กก. เพื่อให้ถึงเป้า`;

  const barW = Math.min(nrPct / 15 * 100, 100);
  const barC = passed ? "var(--success)" : "var(--danger)";
  const last6 = mStats.slice(-6);

  container.innerHTML = `
    <div class="goal-card ${passed ? 'pass' : 'fail'}">
      <div class="goal-header">🎯 เป้าหมาย: Non Recycle ≤ ${NR_TARGET}%</div>
      <div class="goal-body">
        <div class="goal-main">
          <div class="goal-progress"><div class="goal-bar" style="width:${barW}%;background:${barC}"></div></div>
          <div style="display:flex;align-items:baseline;gap:12px;flex-wrap:wrap">
            <span class="num" style="color:${barC};font-size:28px;font-weight:700">${nrPct.toFixed(1)}%</span>
            <span style="color:${barC};font-weight:600;font-size:14px">${passed ? '✅ ผ่านเป้า' : '⚠️ เกินเป้า'}</span>
          </div>
          <div style="font-size:13px;color:var(--text-2);margin-top:6px">${fN(nrKg)} กก. จากทั้งหมด ${fN(total)} กก.</div>
          ${trend !== null ? `<div style="font-size:13px;margin-top:4px;color:${trend > 0 ? 'var(--danger)' : trend < 0 ? 'var(--success)' : 'var(--text-3)'}">${trend > 0 ? '↑ เพิ่ม' : trend < 0 ? '↓ ลด' : '→ เท่าเดิม'} ${Math.abs(trend).toFixed(1)}% จากงวดก่อน</div>` : ''}
          <div style="font-size:13px;color:var(--text-2);margin-top:4px;font-weight:500">${detail}</div>
        </div>
        <div class="goal-spark" id="goalSpark"></div>
      </div>
    </div>`;

  if (last6.length >= 2) {
    const el = container.querySelector("#goalSpark");
    const vals = last6.map(m => m.nrPct);
    S.ch.goalSp = sparkCanvas(el, vals, { w: 180, h: 70, color: "#1E88E5", target: NR_TARGET, min: 0, max: Math.max(15, ...vals) + 2 });
  }
}

function renderAnomalyCards(mStats) {
  const grid = S.root.querySelector("#insightGrid");
  if (mStats.length < 2) { grid.innerHTML = '<div class="insight-box increase"><div class="insight-box-title">🔺 เพิ่มขึ้นมากที่สุด</div><div style="font-size:13px;color:var(--text-3);padding:12px 0">ต้องมีข้อมูลอย่างน้อย 2 เดือน</div></div><div class="insight-box decrease"><div class="insight-box-title">🔻 ลดลงดี</div><div style="font-size:13px;color:var(--text-3);padding:12px 0">ต้องมีข้อมูลอย่างน้อย 2 เดือน</div></div>' + renderForecastHtml(mStats); return; }

  const { inc, out } = filt();
  const active = S.mode === "in" ? inc : out;
  const curItems = itemTot(active, S.mode);

  const prevP = S.pOpts[S.pIdx + 1];
  let prevItems = {};
  if (prevP) {
    const prevRecs = S.mode === "in"
      ? S.allIn.filter(r => r.date >= prevP.s && r.date <= prevP.e && (S.bg === "all" || r.buildingGroup === S.bg) && (S.bld === "all" || r.buildingCode === S.bld))
      : S.allOut.filter(r => r.date >= prevP.s && r.date <= prevP.e);
    prevItems = itemTot(prevRecs, S.mode);
  } else {
    const m2 = mStats.slice(-2);
    if (m2.length === 2) prevItems = m2[0].items;
  }

  const changes = [];
  const allIds = new Set([...Object.keys(curItems), ...Object.keys(prevItems)]);
  for (const id of allIds) {
    const cur = curItems[id] || 0, prev = prevItems[id] || 0;
    if (prev === 0 && cur === 0) continue;
    const pct = prev > 0 ? round1(((cur - prev) / prev * 100) * 10) / 10 : (cur > 0 ? 100 : 0);
    const item = WASTE_ITEM_BY_ID[id];
    if (!item) continue;
    changes.push({ id, name: item.nameTh, cat: item.category, cur: round1(cur), prev: round1(prev), pct });
  }

  const increases = changes.filter(c => c.pct > 15 && c.cur > 10).sort((a, b) => b.pct - a.pct).slice(0, 3);
  const decreases = changes.filter(c => c.pct < -15 && c.prev > 10).sort((a, b) => a.pct - b.pct).slice(0, 3);

  const last4 = mStats.slice(-4);
  const itemSpk = id => last4.map(m => round1(m.items[id] || 0));

  let spkIdx = 0;
  const mkCard = (items, cls, title, isUp) => {
    if (!items.length) return `<div class="insight-box ${cls}"><div class="insight-box-title">${title}</div><div style="font-size:13px;color:var(--text-3);padding:12px 0">ไม่พบรายการที่เปลี่ยนแปลง${isUp ? 'เพิ่มขึ้น' : 'ลดลง'}เกิน 15%</div></div>`;
    const warn = isUp ? items.filter(c => c.pct > 30) : [];
    const rows = items.map((c, i) => {
      const sid = `isp${spkIdx++}`;
      return `<div class="insight-item"><div class="insight-rank">${i + 1}.</div><div class="insight-item-name" title="${c.name}">${c.name}</div><div class="insight-item-val num">${fN(c.cur)} กก.</div><div class="insight-item-pct num" style="color:${isUp ? 'var(--danger)' : 'var(--success)'}">${isUp ? '↑' : '↓'} ${c.pct > 0 ? '+' : ''}${c.pct.toFixed(1)}%</div><div class="insight-spark" id="${sid}"></div></div>`;
    }).join("");
    return `<div class="insight-box ${cls}"><div class="insight-box-title">${title}</div>${rows}${warn.length ? `<div class="insight-warn">⚠️ ${warn.map(w => w.name).join(', ')} เพิ่มเกิน 30%</div>` : ''}</div>`;
  };

  const incHtml = mkCard(increases, "increase", "🔺 เพิ่มขึ้นมากที่สุด", true);
  const decHtml = mkCard(decreases, "decrease", "🔻 ลดลงดี", false);
  const foreHtml = renderForecastHtml(mStats);

  grid.innerHTML = incHtml + decHtml + foreHtml;

  spkIdx = 0;
  for (const item of [...increases, ...decreases]) {
    const el = grid.querySelector(`#isp${spkIdx}`);
    if (el) {
      const color = increases.includes(item) ? "#EF6C00" : "#43A047";
      S.ch[`isp${spkIdx}`] = sparkCanvas(el, itemSpk(item.id), { w: 50, h: 22, color });
    }
    spkIdx++;
  }
}

function renderForecastHtml(mStats) {
  if (mStats.length < 3) return `<div class="insight-box forecast"><div class="insight-box-title">📈 พยากรณ์ 3 เดือนข้างหน้า</div><div style="font-size:13px;color:var(--text-3);padding:12px 0">ต้องมีข้อมูลอย่างน้อย 3 เดือนเพื่อพยากรณ์</div></div>`;

  const recent = mStats.slice(-6);
  const xs = recent.map((_, i) => i);
  const fc = n => round1(n * 10) / 10;

  const totReg = linearReg(xs, recent.map(m => m.total));
  const totFc = Math.max(0, round1(totReg.slope * (recent.length + 2) + totReg.intercept));
  const totDir = totReg.slope > 50 ? '↗ เพิ่มขึ้น' : totReg.slope < -50 ? '↘ ลดลง' : '→ คงที่';

  const nrReg = linearReg(xs, recent.map(m => m.nrPct));
  const nrFc = fc(Math.max(0, nrReg.slope * (recent.length + 2) + nrReg.intercept));
  const nrDir = nrReg.slope > 0.1 ? '↗' : nrReg.slope < -0.1 ? '↘' : '→';
  const nrStatus = nrFc <= NR_TARGET ? '✅ ยังอยู่ใต้เป้า' : '⚠️ อาจเกินเป้า';

  const orgReg = linearReg(xs, recent.map(m => m.organicKg));
  const orgFc = Math.max(0, round1(orgReg.slope * (recent.length + 2) + orgReg.intercept));
  const orgDir = orgReg.slope > 30 ? '↗ เพิ่มต่อเนื่อง' : orgReg.slope < -30 ? '↘ ลดลง' : '→ คงที่';

  const avgR2 = (totReg.r2 + nrReg.r2 + orgReg.r2) / 3;
  let conf, confC;
  if (avgR2 > 0.7) { conf = "สูง"; confC = "var(--success)"; }
  else if (avgR2 > 0.4) { conf = "ปานกลาง"; confC = "var(--accent)"; }
  else { conf = "ต่ำ"; confC = "var(--danger)"; }

  return `<div class="insight-box forecast">
    <div class="insight-box-title">📈 พยากรณ์ 3 เดือนข้างหน้า</div>
    <div class="forecast-row"><div class="forecast-label">ขยะรวม</div><div class="forecast-val num">~${fN(totFc)} กก./เดือน</div><div class="forecast-trend">${totDir}</div></div>
    <div class="forecast-row"><div class="forecast-label">Non Recycle</div><div class="forecast-val num">~${nrFc.toFixed(1)}%</div><div class="forecast-trend">${nrDir} ${nrStatus}</div></div>
    <div class="forecast-row"><div class="forecast-label">Organic</div><div class="forecast-val num">~${fN(orgFc)} กก.</div><div class="forecast-trend">${orgDir}</div></div>
    <div class="forecast-confidence" style="color:${confC}">ความมั่นใจ: ${conf} (ข้อมูล ${recent.length} เดือน, R² ${avgR2.toFixed(2)})</div>
  </div>`;
}

/* ══════════════════════════════════ EXPORT ═══════════════════════════════════════ */

async function doXls() {
  const { inc, out } = filt(); const p = S.pOpts[S.pIdx];
  try { exportExcel({ incoming: inc, outgoing: out, start: p.s, end: p.e, label: p.l }, aggregateIncoming(inc), aggregateOutgoing(out)); showToast("ดาวน์โหลดไฟล์ Excel แล้ว"); }
  catch (e) { showToast("Export Excel ไม่สำเร็จ: " + e.message, true); }
}
async function doPpt() {
  const { inc, out } = filt(); const p = S.pOpts[S.pIdx];
  try { await exportPptx({ incoming: inc, outgoing: out, start: p.s, end: p.e, label: p.l }, aggregateIncoming(inc), aggregateOutgoing(out)); showToast("ดาวน์โหลดไฟล์ PowerPoint แล้ว"); }
  catch (e) { showToast("Export PowerPoint ไม่สำเร็จ: " + e.message, true); }
}
