import { WASTE_ITEMS, CATEGORIES, CATEGORY_LABELS_TH, OTHER_ITEM_ID } from "../data/wasteItems.js";
import { round1, sum } from "../utils.js";

export function exportExcel(data, inAgg, outAgg) {
  const XLSX = window.XLSX;
  if (!XLSX) throw new Error("โหลดไลบรารี Excel ไม่สำเร็จ");

  const wb = XLSX.utils.book_new();

  // ---- Sheet 1: incoming by building ----
  const inHeader = ["ลำดับ", "รายการ", "กลุ่ม", ...inAgg.buildings.map((b) => `อาคาร ${b}`), "รวม"];
  const inRows = [inHeader];
  for (const it of WASTE_ITEMS) {
    if (it.id === OTHER_ITEM_ID) continue;
    const byB = inAgg.itemTotals[it.id] || {};
    const rowTotal = round1(sum(inAgg.buildings.map((b) => byB[b] || 0)));
    inRows.push([it.seq, it.nameTh, it.category, ...inAgg.buildings.map((b) => byB[b] || 0), rowTotal]);
  }
  const otherByB = inAgg.itemTotals[OTHER_ITEM_ID] || {};
  const otherTotal = round1(sum(inAgg.buildings.map((b) => otherByB[b] || 0)));
  inRows.push([35, "อื่นๆ", "", ...inAgg.buildings.map((b) => otherByB[b] || 0), otherTotal]);
  inRows.push([]);
  for (const cat of CATEGORIES) {
    inRows.push([
      "",
      `รวม ${CATEGORY_LABELS_TH[cat]}`,
      "",
      ...inAgg.buildings.map((b) => inAgg.categoryTotals[cat]?.[b] || 0),
      round1(sum(inAgg.buildings.map((b) => inAgg.categoryTotals[cat]?.[b] || 0))),
    ]);
  }
  const wsIn = XLSX.utils.aoa_to_sheet(inRows);
  XLSX.utils.book_append_sheet(wb, wsIn, "ขาเข้า");

  // ---- Sheet 2: outgoing by destination ----
  const outHeader = ["ปลายทาง", ...CATEGORIES.map((c) => CATEGORY_LABELS_TH[c]), "รวม"];
  const outRows = [outHeader];
  for (const dest of outAgg.destinations) {
    const row = outAgg.matrix[dest] || {};
    const rowTotal = round1(sum(CATEGORIES.map((c) => row[c] || 0)));
    outRows.push([dest, ...CATEGORIES.map((c) => row[c] || 0), rowTotal]);
  }
  outRows.push([
    "รวมทั้งหมด",
    ...CATEGORIES.map((c) => outAgg.categoryGrandTotal[c] || 0),
    round1(sum(CATEGORIES.map((c) => outAgg.categoryGrandTotal[c] || 0))),
  ]);
  const wsOut = XLSX.utils.aoa_to_sheet(outRows);
  XLSX.utils.book_append_sheet(wb, wsOut, "ขาออก");

  // ---- Sheet 3: raw outgoing detail (for traceability) ----
  const detailHeader = ["วันที่", "รายการ", "กลุ่ม", "น้ำหนัก (กก.)", "ปลายทาง", "รูปแบบการกำจัด", "ที่อยู่ปลายทาง", "ประเภทรถ"];
  const detailRows = [detailHeader];
  for (const rec of data.outgoing) {
    const item = WASTE_ITEMS.find((w) => w.id === rec.itemId);
    detailRows.push([
      rec.date,
      rec.otherLabel || item?.nameTh || rec.itemId,
      rec.category,
      rec.weightKg,
      rec.destination,
      rec.disposalMethod,
      rec.destinationAddress,
      rec.vehicleType,
    ]);
  }
  const wsDetail = XLSX.utils.aoa_to_sheet(detailRows);
  XLSX.utils.book_append_sheet(wb, wsDetail, "รายละเอียดขาออก");

  const filename = `zero-waste-${data.start}_to_${data.end}.xlsx`;
  XLSX.writeFile(wb, filename);
}
