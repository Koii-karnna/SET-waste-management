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

let S = { ch: {} };
function init() {
  return { mode: "in", bg: "all", bld: "all", pType: "monthly", pOpts: [], pIdx: 0, inD: [], outD: [], ch: {}, root: null };
}
function destroyCh() { if (S.ch) Object.values(S.ch).forEach(c => c.destroy()); S.ch = {}; }

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

if (typeof ChartDataLabels !== "undefined") Chart.register(ChartDataLabels);

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
  const catLeg = CATEGORIES.map(c =>
    `<span style="font-size:12px;color:var(--text-3);display:flex;align-items:center;gap:5px"><span style="width:10px;height:10px;border-radius:2px;background:${CATEGORY_COLORS[c]};display:inline-block"></span>${c}</span>`
  ).join("");

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
</div>
<div class="grid-2">
  <div class="panel">
    <div class="panel-head"><span class="panel-title">เปรียบเทียบรายอาคาร</span></div>
    <div class="panel-hint" id="bh">น้ำหนักรวม (กก.)</div>
    <div class="chart-box" style="height:270px"><canvas id="cB"></canvas></div>
  </div>
  <div class="panel">
    <span class="panel-title">สัดส่วนขยะ</span>
    <div class="panel-hint" id="dh"></div>
    <div class="chart-box" style="height:220px"><canvas id="cD"></canvas></div>
    <div id="dl" style="margin-top:10px"></div>
  </div>
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
<div class="panel">
  <div class="panel-head"><span class="panel-title">รายการขยะทั้ง 35 รายการ — เรียงจากมากไปน้อย</span></div>
  <div class="panel-hint">น้ำหนักรวม (กก.) · สีตามประเภท</div>
  <div style="display:flex;gap:16px;margin-bottom:14px;flex-wrap:wrap">${catLeg}</div>
  <div id="br" style="display:flex;flex-direction:column;gap:4px"></div>
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
  try {
    [S.inD, S.outD] = await Promise.all([queryIncomingRange(p.s, p.e), queryOutgoingRange(p.s, p.e)]);
  } catch (err) { showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, true); S.inD = []; S.outD = []; }
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

function itemTot(recs, mode) {
  const t = {};
  if (mode === "in") { for (const r of recs) for (const [id, kg] of Object.entries(r.items || {})) t[id] = round1((t[id] || 0) + kg); }
  else { for (const r of recs) if (r.itemId) t[r.itemId] = round1((t[r.itemId] || 0) + r.weightKg); }
  return t;
}

function renderAll() {
  destroyCh();
  const { inc, out } = filt();
  const active = S.mode === "in" ? inc : out;
  const cw = S.mode === "in" ? cwIn(active) : cwOut(active);
  const total = round1(sum(Object.values(cw)));
  renderKPI(cw, total, active);
  renderStack(monthlyBk(active, S.mode));
  S.mode === "in" ? renderBld(bldMonth(inc), inc) : renderBld([], []);
  renderDonut(cw, total);
  renderPC(active);
  renderRace(itemTot(active, S.mode), total);
}

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
        legend: { position: "bottom", labels: { usePointStyle: true, pointStyle: "rect", boxWidth: 10, padding: 12, font: { size: 11 } } },
        datalabels: { color: "#fff", font: { size: 10.5, weight: "bold", family: "DM Sans" }, anchor: "center", align: "center" }
      },
      scales: {
        x: { stacked: true, grid: { display: false }, ticks: { font: { size: 12 } } },
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
      scales: { x: { grid: { display: false }, ticks: { font: { size: 12 } } }, y: { grid: { color: "#E8E6DF" }, ticks: { font: { size: 11 }, callback: v => v >= 1000 ? (v / 1000) + "k" : v } } },
      interaction: { intersect: false, mode: "index" }
    }
  });
}

function renderDonut(cw, total) {
  const p = S.pOpts[S.pIdx];
  S.root.querySelector("#dh").textContent = p?.l || "";
  const order = ["Recycle", "Organic", "Infectious Waste", "Non Recycle", "Hazard"];
  const data = order.map(c => round1(cw[c] || 0));
  const cols = order.map(c => CATEGORY_COLORS[c]);

  S.ch.dn = new Chart(S.root.querySelector("#cD"), {
    type: "doughnut",
    data: { labels: order, datasets: [{ data, backgroundColor: cols, borderColor: "#fff", borderWidth: 3 }] },
    options: { responsive: true, maintainAspectRatio: false, cutout: "58%", plugins: { legend: { display: false }, datalabels: { display: false } } }
  });

  S.root.querySelector("#dl").innerHTML = order.map((c, i) => {
    const pct = total > 0 ? (data[i] / total * 100).toFixed(1) : "0.0";
    return `<div class="donut-legend-row"><span><span class="donut-legend-dot" style="background:${cols[i]}"></span>${c}</span><span class="num" style="font-weight:600">${fN(data[i])} กก. · ${pct}%</span></div>`;
  }).join("");
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

function renderRace(totals, grand) {
  const items = WASTE_ITEMS.filter(it => it.id !== OTHER_ITEM_ID)
    .map(it => ({ id: it.id, n: it.nameTh, cat: it.category, kg: totals[it.id] || 0 }))
    .sort((a, b) => b.kg - a.kg);
  const otherKg = totals[OTHER_ITEM_ID] || 0;
  if (otherKg > 0) items.push({ id: OTHER_ITEM_ID, n: "อื่นๆ", cat: "Non Recycle", kg: otherKg });

  const maxKg = items.length ? items[0].kg : 1;
  S.root.querySelector("#br").innerHTML = items.map((it, i) => {
    const pct = grand > 0 ? (it.kg / grand * 100).toFixed(1) : "0.0";
    const bw = maxKg > 0 ? Math.max(it.kg / maxKg * 100, 0.5) : 0;
    const col = CATEGORY_COLORS[it.cat] || "#999";
    return `<div class="race-row"><div class="race-rank">${i + 1}</div><div class="race-cat" style="background:${col}"></div><div class="race-label" title="${it.n}">${it.n}</div><div class="race-bar-wrap"><div class="race-bar" style="width:${bw}%;background:${col}">${bw > 12 ? `<span>${fN(it.kg)} กก.</span>` : ""}</div></div><div class="race-val num">${fN(it.kg)} กก.</div><div class="race-pct num">${pct}%</div></div>`;
  }).join("");
}

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
