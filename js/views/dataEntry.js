import { WASTE_ITEMS, CATEGORIES, CATEGORY_LABELS_TH, CATEGORY_COLORS, OTHER_ITEM_ID, BUILDINGS } from "../data/wasteItems.js";
import { DESTINATIONS, DESTINATION_BY_NAME, DISPOSAL_METHODS, VEHICLE_TYPES } from "../data/destinations.js";
import { getIncoming, upsertIncoming, addOutgoing } from "../db.js";
import { getCurrentUser } from "../auth.js";
import { todayISO, round1 } from "../utils.js";
import { showToast } from "../main.js";

let subMode = "in"; // "in" | "out"

export function renderDataEntry(container) {
  container.innerHTML = `
    <div class="pill-toggle" id="entry-pill">
      <button data-mode="in" class="${subMode === "in" ? "active" : ""}">ขาเข้า</button>
      <button data-mode="out" class="${subMode === "out" ? "active" : ""}">ขาออก</button>
    </div>
    <div id="entry-body"></div>
  `;
  container.querySelector("#entry-pill").addEventListener("click", (e) => {
    const btn = e.target.closest("button");
    if (!btn) return;
    subMode = btn.dataset.mode;
    renderDataEntry(container);
  });
  const body = container.querySelector("#entry-body");
  if (subMode === "in") renderIncomingForm(body);
  else renderOutgoingForm(body);
}

// ---------------- ขาเข้า ----------------

function renderIncomingForm(root) {
  let buildingGroup = "CMC";
  let buildingCode = "A";

  root.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="field">
          <label>วันที่</label>
          <input type="date" id="in-date" value="${todayISO()}" />
        </div>
        <div class="field">
          <label>กลุ่มอาคาร</label>
          <div class="chip-group" id="in-group">
            <button type="button" class="chip active" data-group="CMC">CMC</button>
            <button type="button" class="chip" data-group="NP">NP</button>
          </div>
        </div>
        <div class="field">
          <label>อาคาร</label>
          <select id="in-building"></select>
        </div>
        <div class="field">
          <button class="ghost" id="in-load">โหลดข้อมูลเดิม</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table" id="in-table"></table>
      </div>
      <div class="field-row" style="margin-top:16px;">
        <button class="primary" id="in-save">บันทึก</button>
        <span class="muted" id="in-status"></span>
      </div>
    </div>
  `;

  const buildingSelect = root.querySelector("#in-building");
  function refreshBuildingOptions() {
    buildingSelect.innerHTML = BUILDINGS[buildingGroup]
      .map((b) => `<option value="${b}">อาคาร ${b}</option>`)
      .join("");
    buildingCode = BUILDINGS[buildingGroup][0];
  }
  refreshBuildingOptions();

  root.querySelector("#in-group").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    buildingGroup = btn.dataset.group;
    [...root.querySelectorAll("#in-group .chip")].forEach((c) => c.classList.toggle("active", c === btn));
    refreshBuildingOptions();
  });
  buildingSelect.addEventListener("change", () => {
    buildingCode = buildingSelect.value;
  });

  buildTable(root);
  bindTableEvents(root);

  root.querySelector("#in-load").addEventListener("click", async () => {
    const date = root.querySelector("#in-date").value;
    const status = root.querySelector("#in-status");
    status.textContent = "กำลังโหลด...";
    try {
      const existing = await getIncoming(date, buildingCode);
      fillTable(root, existing);
      status.textContent = existing ? "โหลดข้อมูลเดิมแล้ว" : "ยังไม่มีข้อมูลวันนี้";
    } catch (err) {
      status.textContent = "";
      showToast("โหลดข้อมูลไม่สำเร็จ: " + err.message, true);
    }
  });

  root.querySelector("#in-save").addEventListener("click", async () => {
    const date = root.querySelector("#in-date").value;
    if (!date) return showToast("กรุณาเลือกวันที่", true);
    const items = {};
    for (const it of WASTE_ITEMS) {
      if (it.id === OTHER_ITEM_ID) continue;
      const input = root.querySelector(`input[data-item="${it.id}"]`);
      const val = parseFloat(input.value);
      if (val > 0) items[it.id] = round1(val);
    }
    const otherInput = root.querySelector(`input[data-item="${OTHER_ITEM_ID}"]`);
    const otherVal = parseFloat(otherInput.value);
    const otherDetail = root.querySelector("#other-detail").value.trim();
    const otherCategory = root.querySelector("#other-category").value;
    const record = {
      date,
      buildingGroup,
      buildingCode,
      items,
    };
    if (otherVal > 0) {
      items[OTHER_ITEM_ID] = round1(otherVal);
      record.otherDetail = otherDetail || null;
      record.otherCategory = otherCategory || null;
    }
    const saveBtn = root.querySelector("#in-save");
    saveBtn.disabled = true;
    try {
      await upsertIncoming(record, getCurrentUser()?.email);
      showToast(`บันทึกข้อมูลขาเข้า อาคาร ${buildingCode} วันที่ ${date} สำเร็จ`);
    } catch (err) {
      showToast("บันทึกไม่สำเร็จ: " + err.message, true);
    } finally {
      saveBtn.disabled = false;
    }
  });
}

function buildTable(root) {
  const table = root.querySelector("#in-table");
  let rows = `<thead><tr><th style="width:36px">#</th><th>รายการ</th><th style="width:110px">น้ำหนัก (กก.)</th></tr></thead><tbody>`;
  for (const cat of CATEGORIES) {
    rows += `<tr class="category-row"><td colspan="3">${CATEGORY_LABELS_TH[cat]}</td></tr>`;
    for (const it of WASTE_ITEMS.filter((w) => w.category === cat)) {
      rows += itemRow(it);
    }
    rows += `<tr class="subtotal-row" data-subtotal="${cat}"><td colspan="2">รวม ${CATEGORY_LABELS_TH[cat]}</td><td><span class="subtotal-val">0</span></td></tr>`;
  }
  // item 35: other
  const other = WASTE_ITEMS.find((w) => w.id === OTHER_ITEM_ID);
  rows += `<tr class="category-row"><td colspan="3">อื่นๆ (ระบุประเภทเอง)</td></tr>`;
  rows += `<tr>
    <td>${other.seq}</td>
    <td>
      อื่นๆ - <input type="text" id="other-detail" placeholder="ระบุรายละเอียด" style="width:180px" />
      <select id="other-category" style="margin-left:6px">
        <option value="">เลือกกลุ่ม</option>
        ${CATEGORIES.map((c) => `<option value="${c}">${CATEGORY_LABELS_TH[c]}</option>`).join("")}
      </select>
    </td>
    <td><input type="number" min="0" step="0.1" data-item="${OTHER_ITEM_ID}" value="" /></td>
  </tr>`;
  rows += `</tbody>`;
  table.innerHTML = rows;
}

function itemRow(it) {
  return `<tr>
    <td>${it.seq}</td>
    <td>${it.nameTh}</td>
    <td><input type="number" min="0" step="0.1" data-item="${it.id}" data-category="${it.category}" value="" /></td>
  </tr>`;
}

function bindTableEvents(root) {
  const table = root.querySelector("#in-table");
  table.addEventListener("input", (e) => {
    if (e.target.matches("input[data-category]")) {
      recomputeSubtotal(root, e.target.dataset.category);
    }
  });
}

function recomputeSubtotal(root, category) {
  const inputs = root.querySelectorAll(`input[data-category="${category}"]`);
  let total = 0;
  inputs.forEach((i) => {
    const v = parseFloat(i.value);
    if (!isNaN(v)) total += v;
  });
  const cell = root.querySelector(`tr[data-subtotal="${category}"] .subtotal-val`);
  if (cell) cell.textContent = round1(total);
}

function fillTable(root, record) {
  // reset all inputs first
  root.querySelectorAll("#in-table input[type=number]").forEach((i) => (i.value = ""));
  const other = root.querySelector("#other-detail");
  const otherCat = root.querySelector("#other-category");
  if (other) other.value = "";
  if (otherCat) otherCat.value = "";
  if (record && record.items) {
    for (const [itemId, weight] of Object.entries(record.items)) {
      const input = root.querySelector(`input[data-item="${itemId}"]`);
      if (input) input.value = weight;
    }
    if (record.otherDetail) other.value = record.otherDetail;
    if (record.otherCategory) otherCat.value = record.otherCategory;
  }
  for (const cat of CATEGORIES) recomputeSubtotal(root, cat);
}

// ---------------- ขาออก ----------------

let pendingRows = [];

function renderOutgoingForm(root) {
  pendingRows = [];
  root.innerHTML = `
    <div class="card">
      <div class="field-row">
        <div class="field">
          <label>วันที่</label>
          <input type="date" id="out-date" value="${todayISO()}" />
        </div>
        <div class="field" style="min-width:220px">
          <label>ปลายทาง</label>
          <select id="out-destination">
            ${DESTINATIONS.map((d) => `<option value="${d.destination}">${d.destination}</option>`).join("")}
            <option value="__new__">+ เพิ่มปลายทางใหม่</option>
          </select>
        </div>
        <div class="field" id="out-new-dest-field" hidden>
          <label>ชื่อปลายทางใหม่</label>
          <input type="text" id="out-new-dest" />
        </div>
      </div>
      <div class="field-row">
        <div class="field" style="min-width:180px">
          <label>รูปแบบการกำจัด</label>
          <input list="disposal-methods" type="text" id="out-disposal" />
          <datalist id="disposal-methods">
            ${DISPOSAL_METHODS.map((m) => `<option value="${m}"></option>`).join("")}
          </datalist>
        </div>
        <div class="field" style="min-width:260px">
          <label>ที่อยู่ปลายทาง</label>
          <input type="text" id="out-address" />
        </div>
        <div class="field" style="min-width:160px">
          <label>ประเภทรถ</label>
          <input list="vehicle-types" type="text" id="out-vehicle" />
          <datalist id="vehicle-types">
            ${VEHICLE_TYPES.map((v) => `<option value="${v}"></option>`).join("")}
          </datalist>
        </div>
      </div>
      <div class="field-row">
        <div class="field" style="min-width:260px">
          <label>รายการขยะ</label>
          <select id="out-item">
            ${WASTE_ITEMS.map((it) => `<option value="${it.id}">${it.seq}. ${it.nameTh}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label>น้ำหนัก (กก.)</label>
          <input type="number" min="0" step="0.1" id="out-weight" />
        </div>
        <div class="field">
          <button id="out-add">เพิ่มรายการ</button>
        </div>
      </div>
      <div class="table-wrap">
        <table class="data-table" id="out-pending-table">
          <thead><tr><th>รายการ</th><th>น้ำหนัก</th><th>ปลายทาง</th><th></th></tr></thead>
          <tbody></tbody>
        </table>
      </div>
      <div class="field-row" style="margin-top:12px;">
        <button class="primary" id="out-save-all">บันทึกทั้งหมด</button>
        <span class="muted" id="out-status"></span>
      </div>
    </div>
  `;

  const destSelect = root.querySelector("#out-destination");
  const newDestField = root.querySelector("#out-new-dest-field");
  const disposalInput = root.querySelector("#out-disposal");
  const addressInput = root.querySelector("#out-address");
  const vehicleInput = root.querySelector("#out-vehicle");

  function applyDestinationDefaults(name) {
    const known = DESTINATION_BY_NAME[name];
    if (known) {
      disposalInput.value = known.disposalMethod;
      addressInput.value = known.destinationAddress;
      vehicleInput.value = known.vehicleType;
    }
  }
  applyDestinationDefaults(destSelect.value);

  destSelect.addEventListener("change", () => {
    if (destSelect.value === "__new__") {
      newDestField.hidden = false;
      disposalInput.value = "";
      addressInput.value = "";
      vehicleInput.value = "";
    } else {
      newDestField.hidden = true;
      applyDestinationDefaults(destSelect.value);
    }
  });

  root.querySelector("#out-add").addEventListener("click", () => {
    const itemId = root.querySelector("#out-item").value;
    const weight = parseFloat(root.querySelector("#out-weight").value);
    let destination = destSelect.value;
    if (destination === "__new__") {
      destination = root.querySelector("#out-new-dest").value.trim();
    }
    if (!destination) return showToast("กรุณาระบุปลายทาง", true);
    if (!(weight > 0)) return showToast("กรุณาระบุน้ำหนักที่มากกว่า 0", true);

    const item = WASTE_ITEMS.find((w) => w.id === itemId);
    pendingRows.push({
      itemId,
      itemLabel: item.nameTh,
      category: item.category,
      weightKg: round1(weight),
      destination,
      disposalMethod: disposalInput.value.trim(),
      destinationAddress: addressInput.value.trim(),
      vehicleType: vehicleInput.value.trim(),
    });
    root.querySelector("#out-weight").value = "";
    renderPendingTable(root);
  });

  renderPendingTable(root);

  root.querySelector("#out-save-all").addEventListener("click", async () => {
    const date = root.querySelector("#out-date").value;
    if (!date) return showToast("กรุณาเลือกวันที่", true);
    if (pendingRows.length === 0) return showToast("ยังไม่มีรายการให้บันทึก", true);
    const status = root.querySelector("#out-status");
    const btn = root.querySelector("#out-save-all");
    btn.disabled = true;
    status.textContent = "กำลังบันทึก...";
    try {
      const user = getCurrentUser()?.email;
      for (const row of pendingRows) {
        await addOutgoing(
          {
            date,
            itemId: row.itemId,
            category: row.category,
            weightKg: row.weightKg,
            destination: row.destination,
            disposalMethod: row.disposalMethod,
            destinationAddress: row.destinationAddress,
            vehicleType: row.vehicleType,
          },
          user
        );
      }
      showToast(`บันทึกรายการขาออก ${pendingRows.length} รายการสำเร็จ`);
      pendingRows = [];
      renderPendingTable(root);
      status.textContent = "";
    } catch (err) {
      showToast("บันทึกไม่สำเร็จ: " + err.message, true);
      status.textContent = "";
    } finally {
      btn.disabled = false;
    }
  });
}

function renderPendingTable(root) {
  const tbody = root.querySelector("#out-pending-table tbody");
  if (pendingRows.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" class="muted">ยังไม่มีรายการ</td></tr>`;
    return;
  }
  tbody.innerHTML = pendingRows
    .map(
      (r, i) => `<tr>
        <td>${r.itemLabel}</td>
        <td>${r.weightKg} กก.</td>
        <td>${r.destination}</td>
        <td><button class="ghost" data-remove="${i}">ลบ</button></td>
      </tr>`
    )
    .join("");
  tbody.querySelectorAll("button[data-remove]").forEach((btn) => {
    btn.addEventListener("click", () => {
      pendingRows.splice(Number(btn.dataset.remove), 1);
      renderPendingTable(root);
    });
  });
}
