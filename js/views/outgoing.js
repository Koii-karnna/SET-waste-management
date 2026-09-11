import {
  WASTE_ITEM_BY_ID, CATEGORIES, CATEGORY_LABELS_TH, CATEGORY_COLORS
} from "../data/wasteItems.js";
import { DESTINATIONS, DISPOSAL_METHODS } from "../data/destinations.js";
import { queryOutgoingRange } from "../db.js";
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

let S = {};
function init() {
  return {
    dest: "all", disposal: "all", search: "",
    pIdx: 0, pOpts: [], page: 0,
    raw: [], filtered: [],
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

function prepare(records) {
  return records.map(r => {
    const item = WASTE_ITEM_BY_ID[r.itemId];
    return {
      date: r.date,
      category: r.category || "Non Recycle",
      itemName: item ? item.nameTh : `#${r.itemId}`,
      weight: round1(r.weightKg || 0),
      destination: r.destination || "-",
      disposal: r.disposalMethod || "-",
      vehicle: r.vehicleType || "-",
    };
  }).sort((a, b) => b.date.localeCompare(a.date) || a.destination.localeCompare(b.destination));
}

function applyFilters() {
  let r = S.rows;
  if (S.dest !== "all") r = r.filter(x => x.destination === S.dest);
  if (S.disposal !== "all") r = r.filter(x => x.disposal === S.disposal);
  if (S.search) {
    const q = S.search.toLowerCase();
    r = r.filter(x => x.itemName.toLowerCase().includes(q) || x.destination.toLowerCase().includes(q));
  }
  return r;
}

export function renderOutgoing(container) {
  S = init();
  S.root = container;
  S.pOpts = monthOpts();
  container.innerHTML = buildHTML();
  listen();
  load();
}

function buildHTML() {
  const pSel = S.pOpts.map((o, i) => `<option value="${i}"${i === 0 ? " selected" : ""}>${o.l}</option>`).join("");
  const destNames = DESTINATIONS.map(d => d.destination);
  const destSel = destNames.map(d => `<option value="${d}">${d}</option>`).join("");
  const dispSel = DISPOSAL_METHODS.map(m => `<option value="${m}">${m}</option>`).join("");
  return `
    <div class="controls" id="out-ctrl">
      <select class="sel" id="out-period">${pSel}</select>
      <select class="sel" id="out-dest"><option value="all">ปลายทางทั้งหมด</option>${destSel}</select>
      <select class="sel" id="out-disposal"><option value="all">วิธีกำจัดทั้งหมด</option>${dispSel}</select>
      <span class="spacer"></span>
      <input class="search-box" id="out-search" type="text" placeholder="ค้นหารายการ / ปลายทาง...">
    </div>
    <div class="summary-row cols-4" id="out-summary"></div>
    <div class="panel" id="out-panel">
      <div class="table-wrap"><table class="data" id="out-table">
        <thead><tr>
          <th>วันที่</th><th>ประเภท</th><th>รายการ</th>
          <th style="text-align:right">น้ำหนัก (กก.)</th><th>ปลายทาง</th><th>การกำจัด</th><th>ประเภทรถ</th>
        </tr></thead>
        <tbody id="out-tbody"></tbody>
      </table></div>
      <div class="pagination" id="out-pag"></div>
    </div>`;
}

function listen() {
  const root = S.root;
  root.querySelector("#out-period").addEventListener("change", e => {
    S.pIdx = +e.target.value;
    load();
  });
  root.querySelector("#out-dest").addEventListener("change", e => {
    S.dest = e.target.value; S.page = 0; render();
  });
  root.querySelector("#out-disposal").addEventListener("change", e => {
    S.disposal = e.target.value; S.page = 0; render();
  });
  root.querySelector("#out-search").addEventListener("input", e => {
    S.search = e.target.value.trim(); S.page = 0; render();
  });
}

async function load() {
  const p = S.pOpts[S.pIdx];
  const tbody = S.root.querySelector("#out-tbody");
  tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">กำลังโหลดข้อมูล...</td></tr>`;
  try {
    S.raw = await queryOutgoingRange(p.s, p.e);
    S.rows = prepare(S.raw);
    S.page = 0;
    render();
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">โหลดข้อมูลไม่สำเร็จ: ${err.message}</td></tr>`;
  }
}

function render() {
  const filtered = applyFilters();
  renderSummary(filtered);
  renderTable(filtered);
  renderPag(filtered.length);
}

function renderSummary(rows) {
  const totalW = round1(sum(rows.map(r => r.weight)));
  const trips = rows.length;
  const dests = new Set(rows.map(r => r.destination)).size;
  const recycleW = sum(rows.filter(r => r.category === "Recycle" || r.category === "Organic").map(r => r.weight));
  const pctRecycle = totalW > 0 ? round1((recycleW / totalW) * 100) : 0;
  const el = S.root.querySelector("#out-summary");
  el.innerHTML = [
    sCard("น้ำหนักรวม", `${fN(totalW)}<span class="u"> กก.</span>`),
    sCard("จำนวนเที่ยว", `${trips}<span class="u"> เที่ยว</span>`),
    sCard("ปลายทาง", `${dests}<span class="u"> แห่ง</span>`),
    sCard("Recycle + Organic", `${fN(pctRecycle)}<span class="u"> %</span>`),
  ].join("");
}

function sCard(label, valHtml) {
  return `<div class="sum-card"><div class="label">${label}</div><div class="val num">${valHtml}</div></div>`;
}

function renderTable(rows) {
  const start = S.page * PER_PAGE;
  const slice = rows.slice(start, start + PER_PAGE);
  const tbody = S.root.querySelector("#out-tbody");
  if (slice.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" class="muted" style="text-align:center;padding:24px">ไม่มีข้อมูล</td></tr>`;
    return;
  }
  tbody.innerHTML = slice.map(r => `<tr>
    <td class="num">${fmtDate(r.date)}</td>
    <td><span class="tag ${TAG_CLS[r.category] || ""}">${CATEGORY_LABELS_TH[r.category] || r.category}</span></td>
    <td>${r.itemName}</td>
    <td style="text-align:right" class="num">${fN(r.weight)}</td>
    <td>${r.destination}</td>
    <td>${r.disposal}</td>
    <td>${r.vehicle}</td>
  </tr>`).join("");
}

function renderPag(total) {
  const pages = Math.ceil(total / PER_PAGE) || 1;
  const el = S.root.querySelector("#out-pag");
  const from = total === 0 ? 0 : S.page * PER_PAGE + 1;
  const to = Math.min((S.page + 1) * PER_PAGE, total);
  el.innerHTML = `
    <span>${from}–${to} จาก ${total} รายการ</span>
    <span>
      <button id="out-prev" ${S.page === 0 ? "disabled" : ""}>&#9664; ก่อนหน้า</button>
      <button id="out-next" ${S.page >= pages - 1 ? "disabled" : ""}>ถัดไป &#9654;</button>
    </span>`;
  el.querySelector("#out-prev").addEventListener("click", () => { S.page--; render(); });
  el.querySelector("#out-next").addEventListener("click", () => { S.page++; render(); });
}
