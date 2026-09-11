import {
  WASTE_ITEMS, WASTE_ITEM_BY_ID, CATEGORIES, CATEGORY_LABELS_TH,
  CATEGORY_COLORS, BUILDINGS, OTHER_ITEM_ID
} from "../data/wasteItems.js";
import { queryIncomingRange } from "../db.js";
import { todayISO, toISO, parseISO, round1, sum } from "../utils.js";
import { showToast } from "../main.js";

const MS = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];
const MF = ["มกราคม","กุมภาพันธ์","มีนาคม","เมษายน","พฤษภาคม","มิถุนายน","กรกฎาคม","สิงหาคม","กันยายน","ตุลาคม","พฤศจิกายน","ธันวาคม"];
const BE = y => y + 543;
const p2 = n => String(n).padStart(2, "0");
const eom = (y, m) => toISO(new Date(y, m + 1, 0));
const fN = n => n.toLocaleString("th-TH", { maximumFractionDigits: 1 });
const PER_PAGE = 20;

const TAG_CLS = {
  Organic: "tag-organic",
  Recycle: "tag-recycle",
  "Non Recycle": "tag-nonrecycle",
  "Infectious Waste": "tag-infectious",
  Hazard: "tag-hazard",
};
const BLD_CLS = { A: "b-a", B: "b-b", C: "b-c", NP1: "b-np1", NP2: "b-np2" };

let S = {};
function init() {
  return {
    bg: "all", bld: "all", cat: "all", search: "",
    pIdx: 0, pOpts: [], page: 0,
    raw: [], rows: [],
    root: null,
  };
}

function monthOpts() {
  const now = new Date(), yr = now.getFullYear(), mo = now.getMonth(), be = BE(yr);
  const o = [{ l: `${MF[0]} – ${MF[mo]} ${be}`, s: `${yr}-01-01`, e: eom(yr, mo) }];
  for (let m = mo; m >= 0; m--) o.push({ l: `${MF[m]} ${be}`, s: `${yr}-${p2(m + 1)}-01`, e: eom(yr, m) });
  return o;
}

function fmtDate(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${MS[m - 1]} ${BE(y)}`;
}

function flatten(records) {
  const out = [];
  for (const rec of records) {
    if (!rec.items) continue;
    for (const [itemId, weight] of Object.entries(rec.items)) {
      if (weight <= 0) continue;
      const item = WASTE_ITEM_BY_ID[itemId];
      const cat = item?.category || rec.otherCategory || "Non Recycle";
      out.push({
        date: rec.date,
        building: rec.buildingCode,
        buildingGroup: rec.buildingGroup,
        category: cat,
        itemId,
        itemName: item ? item.nameTh : `#${itemId}`,
        weight: round1(weight),
      });
    }
  }
  out.sort((a, b) => b.date.localeCompare(a.date) || a.building.localeCompare(b.building) || a.itemName.localeCompare(b.itemName));
  return out;
}

function applyFilters() {
  let r = S.rows;
  if (S.bg !== "all") r = r.filter(x => x.buildingGroup === S.bg);
  if (S.bld !== "all") r = r.filter(x => x.building === S.bld);
  if (S.cat !== "all") r = r.filter(x => x.category === S.cat);
  if (S.search) {
    const q = S.search.toLowerCase();
    r = r.filter(x => x.itemName.toLowerCase().includes(q));
  }
  return r;
}

function catWeight(rows, cat) {
  return round1(sum(rows.filter(r => r.category === cat).map(r => r.weight)));
}

export function renderIncoming(container) {
  S = init();
  S.root = container;
  S.pOpts = monthOpts();
  container.innerHTML = buildHTML();
  listen();
  load();
}

function buildHTML() {
  const pSel = S.pOpts.map((o, i) => `<option value="${i}"${i === 0 ? " selected" : ""}>${o.l}</option>`).join("");
  const catSel = CATEGORIES.map(c => `<option value="${c}">${CATEGORY_LABELS_TH[c]}</option>`).join("");
  return `
    <div class="controls" id="in-ctrl">
      <div class="pill-group" id="in-bg">
        <button class="pill active" data-v="all">ทั้งหมด</button>
        <button class="pill" data-v="CMC">CMC</button>
        <button class="pill" data-v="NP">NP</button>
      </div>
      <div class="pill-group" id="in-bld"></div>
      <select class="sel" id="in-period">${pSel}</select>
      <select class="sel" id="in-cat"><option value="all">ประเภททั้งหมด</option>${catSel}</select>
      <span class="spacer"></span>
      <input class="search-box" id="in-search" type="text" placeholder="ค้นหารายการ...">
    </div>
    <div class="summary-row" id="in-summary"></div>
    <div class="panel" id="in-panel">
      <div class="table-wrap"><table class="data" id="in-table">
        <thead><tr>
          <th>วันที่</th><th>อาคาร</th><th>ประเภท</th><th>รายการ</th><th style="text-align:right">น้ำหนัก (กก.)</th>
        </tr></thead>
        <tbody id="in-tbody"></tbody>
      </table></div>
      <div class="pagination" id="in-pag"></div>
    </div>`;
}

function buildBldPills() {
  const el = S.root.querySelector("#in-bld");
  if (S.bg === "all") { el.innerHTML = ""; return; }
  const codes = BUILDINGS[S.bg] || [];
  el.innerHTML = `<button class="pill active" data-v="all">ทั้งหมด</button>` +
    codes.map(c => `<button class="pill" data-v="${c}">${c}</button>`).join("");
  el.querySelectorAll(".pill").forEach(b => b.addEventListener("click", () => {
    S.bld = b.dataset.v;
    [...el.querySelectorAll(".pill")].forEach(p => p.classList.toggle("active", p === b));
    S.page = 0;
    render();
  }));
}

function listen() {
  const root = S.root;
  root.querySelector("#in-bg").addEventListener("click", e => {
    const b = e.target.closest(".pill"); if (!b) return;
    S.bg = b.dataset.v; S.bld = "all"; S.page = 0;
    [...root.querySelectorAll("#in-bg .pill")].forEach(p => p.classList.toggle("active", p === b));
    buildBldPills();
    render();
  });
  root.querySelector("#in-period").addEventListener("change", e => {
    S.pIdx = +e.target.value;
    load();
  });
  root.querySelector("#in-cat").addEventListener("change", e => {
    S.cat = e.target.value; S.page = 0; render();
  });
  root.querySelector("#in-search").addEventListener("input", e => {
    S.search = e.target.value.trim(); S.page = 0; render();
  });
}

async function load() {
  const p = S.pOpts[S.pIdx];
  const tbody = S.root.querySelector("#in-tbody");
  tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">กำลังโหลดข้อมูล...</td></tr>`;
  try {
    S.raw = await queryIncomingRange(p.s, p.e);
    S.rows = flatten(S.raw);
    S.page = 0;
    render();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

function render() {
  const filtered = applyFilters();
  renderSummary(filtered);
  renderTable(filtered);
  renderPag(filtered.length);
}

function renderSummary(rows) {
  const total = round1(sum(rows.map(r => r.weight)));
  const org = catWeight(rows, "Organic");
  const rec = catWeight(rows, "Recycle");
  const nr = catWeight(rows, "Non Recycle");
  const infHaz = round1(catWeight(rows, "Infectious Waste") + catWeight(rows, "Hazard"));
  const el = S.root.querySelector("#in-summary");
  el.innerHTML = [
    card("น้ำหนักรวม", total, "กก.", ""),
    card("Organic", org, "กก.", "organic"),
    card("Recycle", rec, "กก.", "recycle"),
    card("Non Recycle", nr, "กก.", "nonrecycle"),
    card("Infectious + Hazard", infHaz, "กก.", "infectious"),
  ].join("");
}

function card(label, val, unit, colorKey) {
  const dot = colorKey ? `<span class="kpi-dot" style="background:var(--${colorKey})"></span>` : "";
  return `<div class="sum-card">
    <div class="label">${dot} ${label}</div>
    <div class="val num">${fN(val)}<span class="u">${unit}</span></div>
  </div>`;
}

function renderTable(rows) {
  const start = S.page * PER_PAGE;
  const slice = rows.slice(start, start + PER_PAGE);
  const tbody = S.root.querySelector("#in-tbody");
  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" class="muted" style="text-align:center;padding:24px">ไม่มีข้อมูล</td></tr>`;
    return;
  }
  tbody.innerHTML = slice.map(r => `<tr>
    <td class="num">${fmtDate(r.date)}</td>
    <td><span class="building-badge ${BLD_CLS[r.building] || ""}">${r.building}</span></td>
    <td><span class="tag ${TAG_CLS[r.category] || ""}">${CATEGORY_LABELS_TH[r.category] || r.category}</span></td>
    <td>${r.itemName}</td>
    <td style="text-align:right" class="num">${fN(r.weight)}</td>
  </tr>`).join("");
}

function renderPag(total) {
  const pages = Math.ceil(total / PER_PAGE) || 1;
  const el = S.root.querySelector("#in-pag");
  const from = total === 0 ? 0 : S.page * PER_PAGE + 1;
  const to = Math.min((S.page + 1) * PER_PAGE, total);
  el.innerHTML = `
    <span>${from}–${to} จาก ${total} รายการ</span>
    <span>
      <button id="in-prev" ${S.page === 0 ? "disabled" : ""}>&#9664; ก่อนหน้า</button>
      <button id="in-next" ${S.page >= pages - 1 ? "disabled" : ""}>ถัดไป &#9654;</button>
    </span>`;
  el.querySelector("#in-prev").addEventListener("click", () => { S.page--; render(); });
  el.querySelector("#in-next").addEventListener("click", () => { S.page++; render(); });
}
