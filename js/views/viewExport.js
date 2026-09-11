import { WASTE_ITEMS, WASTE_ITEM_BY_ID, CATEGORIES, CATEGORY_LABELS_TH, OTHER_ITEM_ID } from "../data/wasteItems.js";
import { queryIncomingRange, queryOutgoingRange } from "../db.js";
import { todayISO, weekRange, monthRange, round1, sum } from "../utils.js";
import { showToast } from "../main.js";
import { exportExcel } from "../export/excelExport.js";
import { exportPptx } from "../export/pptExport.js";

let rangeMode = "week"; // "week" | "month"
let lastData = null; // { incoming, outgoing, start, end, label }

export function renderViewExport(container) {
  const today = todayISO();
  container.innerHTML = `
    <div class="pill-toggle" id="range-pill">
      <button data-mode="week" class="${rangeMode === "week" ? "active" : ""}">รายสัปดาห์ (จ-อา)</button>
      <button data-mode="month" class="${rangeMode === "month" ? "active" : ""}">รายเดือน</button>
    </div>
    <div class="card">
      <div class="field-row">
        <div class="field" id="range-week-field">
          <label>เลือกวันใดก็ได้ในสัปดาห์</label>
          <input type="date" id="week-anchor" value="${today}" />
        </div>
        <div class="field" id="range-month-field" hidden>
          <label>เดือน</label>
          <input type="month" id="month-picker" value="${today.slice(0, 7)}" />
        </div>
        <div class="field">
          <button id="load-range" class="btn primary">แสดงข้อมูล</button>
        </div>
        <div class="field">
          <span class="muted" id="range-label"></span>
        </div>
      </div>
    </div>
    <div id="range-results"></div>
  `;

  const weekField = container.querySelector("#range-week-field");
  const monthField = container.querySelector("#range-month-field");

  container.querySelector("#range-pill").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    rangeMode = btn.dataset.mode;
    [...container.querySelectorAll("#range-pill button")].forEach((b) => b.classList.toggle("active", b === btn));
    weekField.hidden = rangeMode !== "week";
    monthField.hidden = rangeMode !== "month";
  });

  container.querySelector("#load-range").addEventListener("click", () => loadRange(container));

  loadRange(container);
}

async function loadRange(container) {
  let start, end, label;
  if (rangeMode === "week") {
    const anchor = container.querySelector("#week-anchor").value || todayISO();
    const r = weekRange(anchor);
    start = r.start;
    end = r.end;
    label = `สัปดาห์ ${start} ถึง ${end}`;
  } else {
    const month = container.querySelector("#month-picker").value || todayISO().slice(0, 7);
    const r = monthRange(month);
    start = r.start;
    end = r.end;
    label = `เดือน ${month}`;
  }
  container.querySelector("#range-label").textContent = label;

  const resultsEl = container.querySelector("#range-results");
  resultsEl.innerHTML = `<p class="muted">กำลังโหลดข้อมูล...</p>`;
  try {
    const [incoming, outgoing] = await Promise.all([
      queryIncomingRange(start, end),
      queryOutgoingRange(start, end),
    ]);
    lastData = { incoming, outgoing, start, end, label };
    renderResults(resultsEl, lastData);
  } catch (err) {
    resultsEl.innerHTML = `<p class="muted">โหลดข้อมูลไม่สำเร็จ: ${err.message}</p>`;
  }
}

export function aggregateIncoming(records) {
  const buildings = [...new Set(records.map((r) => r.buildingCode))].sort();
  const itemTotals = {}; // itemId -> {buildingCode: weight}
  for (const rec of records) {
    for (const [itemId, weight] of Object.entries(rec.items || {})) {
      itemTotals[itemId] = itemTotals[itemId] || {};
      itemTotals[itemId][rec.buildingCode] = round1((itemTotals[itemId][rec.buildingCode] || 0) + weight);
    }
  }
  const categoryTotals = {};
  for (const cat of CATEGORIES) categoryTotals[cat] = {};
  for (const [itemId, byBuilding] of Object.entries(itemTotals)) {
    const item = WASTE_ITEM_BY_ID[itemId];
    const cat = item?.category || "Non Recycle";
    for (const [b, w] of Object.entries(byBuilding)) {
      categoryTotals[cat][b] = round1((categoryTotals[cat][b] || 0) + w);
    }
  }
  return { buildings, itemTotals, categoryTotals };
}

export function aggregateOutgoing(records) {
  const destinations = [...new Set(records.map((r) => r.destination))].sort();
  const matrix = {}; // destination -> category -> weight
  for (const rec of records) {
    matrix[rec.destination] = matrix[rec.destination] || {};
    const cat = rec.category || "Non Recycle";
    matrix[rec.destination][cat] = round1((matrix[rec.destination][cat] || 0) + rec.weightKg);
  }
  const categoryGrandTotal = {};
  for (const cat of CATEGORIES) {
    categoryGrandTotal[cat] = round1(sum(destinations.map((d) => matrix[d]?.[cat] || 0)));
  }
  return { destinations, matrix, categoryGrandTotal };
}

function renderResults(el, data) {
  const { incoming, outgoing } = data;
  const inAgg = aggregateIncoming(incoming);
  const outAgg = aggregateOutgoing(outgoing);

  const totalIn = round1(
    sum(Object.values(inAgg.itemTotals).flatMap((byB) => Object.values(byB)))
  );
  const totalOut = round1(sum(outAgg.destinations.map((d) => sum(Object.values(outAgg.matrix[d] || {})))));

  el.innerHTML = `
    <div class="stat-row">
      <div class="stat-card"><div class="stat-label">น้ำหนักขาเข้ารวม</div><div class="stat-value">${totalIn.toLocaleString()} กก.</div></div>
      <div class="stat-card"><div class="stat-label">น้ำหนักขาออกรวม</div><div class="stat-value">${totalOut.toLocaleString()} กก.</div></div>
      <div class="stat-card"><div class="stat-label">จำนวนอาคารที่มีข้อมูล</div><div class="stat-value">${inAgg.buildings.length}</div></div>
      <div class="stat-card"><div class="stat-label">จำนวนปลายทาง</div><div class="stat-value">${outAgg.destinations.length}</div></div>
    </div>

    <div class="card">
      <h3>สรุปขาเข้า แยกตามอาคาร (กก.)</h3>
      <div class="table-wrap">${buildIncomingTableHtml(inAgg)}</div>
    </div>

    <div class="card">
      <h3>สรุปขาออก แยกตามปลายทาง (กก.)</h3>
      <div class="table-wrap">${buildOutgoingTableHtml(outAgg)}</div>
    </div>

    <div class="card">
      <h3>ส่งออกรายงาน</h3>
      <div class="field-row">
        <button class="btn" id="export-excel">ออก Excel (.xlsx)</button>
        <button class="btn" id="export-pptx">ออก PowerPoint (.pptx)</button>
      </div>
    </div>
  `;

  el.querySelector("#export-excel").addEventListener("click", () => {
    try {
      exportExcel(data, inAgg, outAgg);
      showToast("ดาวน์โหลดไฟล์ Excel แล้ว");
    } catch (err) {
      showToast("ส่งออก Excel ไม่สำเร็จ: " + err.message, true);
    }
  });
  el.querySelector("#export-pptx").addEventListener("click", async () => {
    try {
      await exportPptx(data, inAgg, outAgg);
      showToast("ดาวน์โหลดไฟล์ PowerPoint แล้ว");
    } catch (err) {
      showToast("ส่งออก PowerPoint ไม่สำเร็จ: " + err.message, true);
    }
  });
}

function buildIncomingTableHtml(inAgg) {
  if (inAgg.buildings.length === 0) return `<p class="muted">ไม่มีข้อมูลในช่วงนี้</p>`;
  let html = `<table class="data-table"><thead><tr><th>#</th><th>รายการ</th>${inAgg.buildings
    .map((b) => `<th>อาคาร ${b}</th>`)
    .join("")}<th>รวม</th></tr></thead><tbody>`;
  for (const cat of CATEGORIES) {
    html += `<tr class="category-row"><td colspan="${inAgg.buildings.length + 3}">${CATEGORY_LABELS_TH[cat]}</td></tr>`;
    for (const it of WASTE_ITEMS.filter((w) => w.category === cat)) {
      const byB = inAgg.itemTotals[it.id] || {};
      const rowTotal = round1(sum(inAgg.buildings.map((b) => byB[b] || 0)));
      if (rowTotal === 0) continue;
      html += `<tr><td>${it.seq}</td><td>${it.nameTh}</td>${inAgg.buildings
        .map((b) => `<td>${byB[b] || 0}</td>`)
        .join("")}<td><strong>${rowTotal}</strong></td></tr>`;
    }
    const subtotal = round1(sum(inAgg.buildings.map((b) => inAgg.categoryTotals[cat]?.[b] || 0)));
    html += `<tr class="subtotal-row"><td colspan="2">รวม ${CATEGORY_LABELS_TH[cat]}</td>${inAgg.buildings
      .map((b) => `<td>${inAgg.categoryTotals[cat]?.[b] || 0}</td>`)
      .join("")}<td>${subtotal}</td></tr>`;
  }
  const otherByB = inAgg.itemTotals[OTHER_ITEM_ID] || {};
  const otherTotal = round1(sum(inAgg.buildings.map((b) => otherByB[b] || 0)));
  if (otherTotal > 0) {
    html += `<tr><td>35</td><td>อื่นๆ</td>${inAgg.buildings
      .map((b) => `<td>${otherByB[b] || 0}</td>`)
      .join("")}<td><strong>${otherTotal}</strong></td></tr>`;
  }
  html += `</tbody></table>`;
  return html;
}

function buildOutgoingTableHtml(outAgg) {
  if (outAgg.destinations.length === 0) return `<p class="muted">ไม่มีข้อมูลในช่วงนี้</p>`;
  let html = `<table class="data-table"><thead><tr><th>ปลายทาง</th>${CATEGORIES.map(
    (c) => `<th>${CATEGORY_LABELS_TH[c]}</th>`
  ).join("")}<th>รวม</th></tr></thead><tbody>`;
  for (const dest of outAgg.destinations) {
    const row = outAgg.matrix[dest] || {};
    const rowTotal = round1(sum(CATEGORIES.map((c) => row[c] || 0)));
    html += `<tr><td>${dest}</td>${CATEGORIES.map((c) => `<td>${row[c] || 0}</td>`).join(
      ""
    )}<td><strong>${rowTotal}</strong></td></tr>`;
  }
  const grandTotal = round1(sum(CATEGORIES.map((c) => outAgg.categoryGrandTotal[c] || 0)));
  html += `<tr class="subtotal-row"><td>รวมทั้งหมด</td>${CATEGORIES.map(
    (c) => `<td>${outAgg.categoryGrandTotal[c] || 0}</td>`
  ).join("")}<td>${grandTotal}</td></tr>`;
  html += `</tbody></table>`;
  return html;
}
