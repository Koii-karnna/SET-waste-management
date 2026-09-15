import { CATEGORIES, CATEGORY_LABELS_TH, CATEGORY_COLORS } from "../data/wasteItems.js";
import { DISPOSAL_ORDER, DISPOSAL_COLOR, USABLE_GROUPS, disposalGroup } from "../data/disposal.js";
import { round1, sum } from "../utils.js";

const YELLOW = "FBB034";
const BLACK = "23211F";
const MUTED = "6B6862";
const LINE = "E7E4DE";
const PANEL_BG = "FAFAF8";
const BLD_COLOR = { A: "1E88E5", B: "9B9A8F", C: "43A047", NP1: "EF6C00", NP2: "D32F2F" };

const hx = (c) => (c || "").replace("#", "");
const fn = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });

export async function exportPptx(data, inAgg, outAgg) {
  const PptxGenJS = window.PptxGenJS;
  if (!PptxGenJS) throw new Error("โหลดไลบรารี PowerPoint ไม่สำเร็จ");

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const totalIn = round1(sum(Object.values(inAgg.itemTotals).flatMap((byB) => Object.values(byB))));
  const totalOut = round1(sum(outAgg.destinations.map((d) => sum(Object.values(outAgg.matrix[d] || {})))));
  const inCat = Object.fromEntries(CATEGORIES.map((c) => [c, round1(sum(inAgg.buildings.map((b) => inAgg.categoryTotals[c]?.[b] || 0)))]));
  const outCat = Object.fromEntries(CATEGORIES.map((c) => [c, round1(outAgg.categoryGrandTotal[c] || 0)]));
  const pctUsableIn = totalIn > 0 ? round1(((inCat.Recycle || 0) + (inCat.Organic || 0)) / totalIn * 1000) / 10 : 0;

  const dispTotals = {};
  DISPOSAL_ORDER.forEach((g) => (dispTotals[g] = 0));
  for (const r of data.outgoing) {
    const g = disposalGroup(r);
    if (g) dispTotals[g] += r.weightKg || 0;
  }
  const dispGrand = round1(sum(Object.values(dispTotals)));
  const usableOut = round1(sum(DISPOSAL_ORDER.filter((g) => USABLE_GROUPS.has(g)).map((g) => dispTotals[g])));
  const pctUsableOut = dispGrand > 0 ? round1((usableOut / dispGrand) * 1000) / 10 : 0;

  titleSlide(pptx, data);
  kpiSlide(pptx, data, { totalIn, totalOut, pctUsableIn, pctUsableOut, buildings: inAgg.buildings.length, destinations: outAgg.destinations.length });
  categorySlide(pptx, inCat, outCat);
  if (inAgg.buildings.length > 0) buildingSlide(pptx, inAgg);
  if (dispGrand > 0) disposalSlide(pptx, dispTotals, dispGrand, pctUsableOut);
  incomingTableSlide(pptx, inAgg);
  outgoingTableSlide(pptx, outAgg);

  await pptx.writeFile({ fileName: `zero-waste-${data.start}_to_${data.end}.pptx` });
}

function pageHeader(slide, title, subtitle) {
  slide.addText(title, { x: 0.6, y: 0.45, w: 12, h: 0.6, fontSize: 26, bold: true, color: BLACK, fontFace: "Calibri", isTextBox: true });
  slide.addText(subtitle, { x: 0.6, y: 0.95, w: 12, h: 0.4, fontSize: 13, color: MUTED, fontFace: "Calibri", isTextBox: true });
}

function titleSlide(pptx, data) {
  const s = pptx.addSlide();
  s.background = { color: BLACK };
  s.addShape("ellipse", { x: 10.6, y: -2.2, w: 6.5, h: 6.5, fill: { color: YELLOW, transparency: 88 }, line: { type: "none" } });
  s.addShape("ellipse", { x: 11.8, y: 3.8, w: 3.4, h: 3.4, fill: { color: YELLOW, transparency: 85 }, line: { type: "none" } });
  s.addText("Zero Waste Dashboard", { x: 0.8, y: 2.75, w: 11, h: 1.1, fontSize: 44, bold: true, color: "FFFFFF", fontFace: "Cambria", isTextBox: true });
  s.addText("รายงานสรุปปริมาณขยะ · SET PFM", { x: 0.8, y: 3.75, w: 11, h: 0.5, fontSize: 18, color: YELLOW, fontFace: "Calibri", isTextBox: true });
  s.addText(data.label, { x: 0.8, y: 4.25, w: 11, h: 0.45, fontSize: 14, color: "C9C6BE", fontFace: "Calibri", isTextBox: true });
}

function statCard(slide, x, y, w, h, label, value, unit, accent, sub) {
  slide.addShape("roundRect", { x, y, w, h, rectRadius: 0.09, fill: { color: "FFFFFF" }, line: { color: LINE, width: 1 }, shadow: { type: "outer", color: "000000", opacity: 0.08, blur: 6, offset: 2, angle: 90 } });
  slide.addShape("rect", { x: x + 0.22, y: y + 0.22, w: 0.12, h: 0.12, fill: { color: accent }, line: { type: "none" } });
  slide.addText(label, { x: x + 0.22, y: y + 0.42, w: w - 0.44, h: 0.3, fontSize: 12, color: MUTED, fontFace: "Calibri", isTextBox: true });
  slide.addText([{ text: value, options: { fontSize: 30, bold: true, color: accent } }, { text: " " + unit, options: { fontSize: 13, color: MUTED } }], {
    x: x + 0.22, y: y + 0.72, w: w - 0.44, h: 0.55, fontFace: "Calibri", valign: "top", isTextBox: true,
  });
  if (sub) slide.addText(sub, { x: x + 0.22, y: y + 1.28, w: w - 0.44, h: 0.3, fontSize: 11, color: MUTED, fontFace: "Calibri", isTextBox: true });
}

function kpiSlide(pptx, data, k) {
  const s = pptx.addSlide();
  pageHeader(s, "สรุปภาพรวม", data.label);
  const cardW = 2.9, gap = 0.28, y = 1.75, h = 1.7;
  const x0 = 0.6;
  statCard(s, x0, y, cardW, h, "น้ำหนักขาเข้ารวม", fn(k.totalIn), "กก.", hx(YELLOW), `${k.buildings} อาคารที่มีข้อมูล`);
  statCard(s, x0 + (cardW + gap), y, cardW, h, "น้ำหนักขาออกรวม", fn(k.totalOut), "กก.", hx(BLACK), `${k.destinations} ปลายทาง`);
  statCard(s, x0 + 2 * (cardW + gap), y, cardW, h, "% รีไซเคิล+อินทรีย์ (ขาเข้า)", fn(k.pctUsableIn), "%", hx(CATEGORY_COLORS.Organic), "ของขยะขาเข้าทั้งหมด");
  statCard(s, x0 + 3 * (cardW + gap), y, cardW, h, "% กำจัดแบบใช้ประโยชน์ได้", fn(k.pctUsableOut), "%", hx(DISPOSAL_COLOR["ทำดิน/ปุ๋ย"]), "รีไซเคิล+RDF+หมัก+ทำดิน");

  s.addShape("roundRect", { x: 0.6, y: 3.75, w: 12.13, h: 1.35, rectRadius: 0.09, fill: { color: PANEL_BG }, line: { type: "none" } });
  s.addText(
    [
      { text: "สรุป: ", options: { bold: true, color: BLACK } },
      { text: `น้ำหนักขยะขาเข้ารวม ${fn(k.totalIn)} กก. และขาออกรวม ${fn(k.totalOut)} กก. ในช่วงที่เลือก — `, options: { color: BLACK } },
      { text: `${fn(k.pctUsableIn)}%`, options: { bold: true, color: hx(CATEGORY_COLORS.Organic) } },
      { text: " ของขยะขาเข้าเป็นรีไซเคิล/อินทรีย์ และ ", options: { color: BLACK } },
      { text: `${fn(k.pctUsableOut)}%`, options: { bold: true, color: hx(DISPOSAL_COLOR["ทำดิน/ปุ๋ย"]) } },
      { text: " ของขยะขาออกถูกกำจัดแบบใช้ประโยชน์ได้", options: { color: BLACK } },
    ],
    { x: 0.95, y: 3.75, w: 11.5, h: 1.35, fontSize: 14, valign: "middle", fontFace: "Calibri", isTextBox: true }
  );
}

function categorySlide(pptx, inCat, outCat) {
  const s = pptx.addSlide();
  pageHeader(s, "น้ำหนักขยะแยกตามประเภท", "เปรียบเทียบขาเข้าและขาออก (กก.)");

  const catLabels = CATEGORIES.map((c) => CATEGORY_LABELS_TH[c]);
  const colors = CATEGORIES.map((c) => hx(CATEGORY_COLORS[c]));

  s.addText("ขาเข้า", { x: 0.6, y: 1.6, w: 6, h: 0.35, fontSize: 15, bold: true, color: BLACK, fontFace: "Calibri", isTextBox: true });
  s.addChart(pptx.ChartType.bar, [{ name: "ขาเข้า", labels: catLabels, values: CATEGORIES.map((c) => inCat[c] || 0) }], {
    x: 0.4, y: 2.0, w: 6.1, h: 5.0,
    barDir: "col", chartColors: colors, showLegend: false,
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: BLACK, dataLabelFontSize: 10,
    catAxisLabelFontSize: 10, catAxisLabelColor: MUTED, valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });

  s.addText("ขาออก", { x: 6.85, y: 1.6, w: 6, h: 0.35, fontSize: 15, bold: true, color: BLACK, fontFace: "Calibri", isTextBox: true });
  s.addChart(pptx.ChartType.bar, [{ name: "ขาออก", labels: catLabels, values: CATEGORIES.map((c) => outCat[c] || 0) }], {
    x: 6.65, y: 2.0, w: 6.1, h: 5.0,
    barDir: "col", chartColors: colors, showLegend: false,
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: BLACK, dataLabelFontSize: 10,
    catAxisLabelFontSize: 10, catAxisLabelColor: MUTED, valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });
}

function buildingSlide(pptx, inAgg) {
  const s = pptx.addSlide();
  pageHeader(s, "เปรียบเทียบรายอาคาร (ขาเข้า)", "น้ำหนักรวมแต่ละอาคาร (กก.)");

  const labels = inAgg.buildings.map((b) => "อาคาร " + b);
  const values = inAgg.buildings.map((b) => round1(sum(CATEGORIES.map((c) => inAgg.categoryTotals[c]?.[b] || 0))));
  const colors = inAgg.buildings.map((b) => BLD_COLOR[b] || "9B9A8F");

  s.addChart(pptx.ChartType.bar, [{ name: "น้ำหนัก", labels, values }], {
    x: 1.5, y: 1.7, w: 10.3, h: 5.3,
    barDir: "col", chartColors: colors, showLegend: false,
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: BLACK, dataLabelFontSize: 12,
    catAxisLabelFontSize: 12, catAxisLabelColor: MUTED, valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });
}

function disposalSlide(pptx, dispTotals, dispGrand, pctUsable) {
  const s = pptx.addSlide();
  pageHeader(s, "รูปแบบการกำจัด (ขาออก)", "สัดส่วนน้ำหนักขยะแยกตามวิธีกำจัด");

  const labels = DISPOSAL_ORDER;
  const values = DISPOSAL_ORDER.map((g) => round1(dispTotals[g] || 0));
  const colors = DISPOSAL_ORDER.map((g) => hx(DISPOSAL_COLOR[g]));

  s.addChart(pptx.ChartType.doughnut, [{ name: "การกำจัด", labels, values }], {
    x: 0.6, y: 1.6, w: 6.4, h: 5.4,
    chartColors: colors, showLegend: true, legendPos: "b", legendFontSize: 11,
    showValue: false, dataBorder: { color: "FFFFFF", pt: 2 },
    holeSize: 55,
  });

  s.addShape("roundRect", { x: 7.3, y: 1.9, w: 5.4, h: 1.5, rectRadius: 0.1, fill: { color: PANEL_BG }, line: { type: "none" } });
  s.addText([{ text: fn(pctUsable) + "%", options: { fontSize: 40, bold: true, color: hx(CATEGORY_COLORS.Organic) } }], { x: 7.3, y: 2.0, w: 5.4, h: 0.9, align: "center", fontFace: "Calibri", isTextBox: true });
  s.addText("% ขยะที่ใช้ประโยชน์ได้ (รีไซเคิล+RDF+หมัก+ทำดิน)", { x: 7.3, y: 2.85, w: 5.4, h: 0.45, align: "center", fontSize: 12, color: MUTED, fontFace: "Calibri", isTextBox: true });

  let ly = 3.75;
  for (const g of DISPOSAL_ORDER) {
    const v = round1(dispTotals[g] || 0);
    const pct = dispGrand > 0 ? (v / dispGrand * 100).toFixed(1) : "0.0";
    s.addShape("rect", { x: 7.3, y: ly + 0.06, w: 0.14, h: 0.14, fill: { color: hx(DISPOSAL_COLOR[g]) }, line: { type: "none" } });
    s.addText(g, { x: 7.55, y: ly, w: 3.0, h: 0.28, fontSize: 12, color: BLACK, fontFace: "Calibri", isTextBox: true });
    s.addText(`${fn(v)} กก. · ${pct}%`, { x: 10.2, y: ly, w: 2.5, h: 0.28, fontSize: 12, color: MUTED, fontFace: "Calibri", align: "right", isTextBox: true });
    ly += 0.4;
  }
}

function zebra(i) {
  return i % 2 === 0 ? "FFFFFF" : PANEL_BG;
}

function incomingTableSlide(pptx, inAgg) {
  const s = pptx.addSlide();
  pageHeader(s, "สรุปขาเข้า แยกตามอาคาร", "น้ำหนักรวมแต่ละหมวดหมู่ (กก.)");

  const header = ["หมวดหมู่", ...inAgg.buildings.map((b) => "อาคาร " + b), "รวม"].map((t) => ({
    text: t, options: { bold: true, color: "FFFFFF", fill: { color: BLACK }, fontSize: 12, align: t === "หมวดหมู่" ? "left" : "right" },
  }));
  const rows = [header];
  CATEGORIES.forEach((cat, i) => {
    const rowTotal = round1(sum(inAgg.buildings.map((b) => inAgg.categoryTotals[cat]?.[b] || 0)));
    rows.push([
      { text: CATEGORY_LABELS_TH[cat], options: { bold: true, color: hx(CATEGORY_COLORS[cat]), fill: { color: zebra(i) }, fontSize: 12 } },
      ...inAgg.buildings.map((b) => ({ text: fn(inAgg.categoryTotals[cat]?.[b] || 0), options: { fill: { color: zebra(i) }, fontSize: 12, align: "right" } })),
      { text: fn(rowTotal), options: { bold: true, fill: { color: zebra(i) }, fontSize: 12, align: "right" } },
    ]);
  });
  const grand = round1(sum(CATEGORIES.map((cat) => sum(inAgg.buildings.map((b) => inAgg.categoryTotals[cat]?.[b] || 0)))));
  rows.push([
    { text: "รวมทั้งหมด", options: { bold: true, color: "FFFFFF", fill: { color: BLACK }, fontSize: 12 } },
    ...inAgg.buildings.map((b) => ({
      text: fn(round1(sum(CATEGORIES.map((c) => inAgg.categoryTotals[c]?.[b] || 0)))),
      options: { bold: true, color: "FFFFFF", fill: { color: BLACK }, fontSize: 12, align: "right" },
    })),
    { text: fn(grand), options: { bold: true, color: YELLOW, fill: { color: BLACK }, fontSize: 12, align: "right" } },
  ]);

  s.addTable(rows, { x: 0.6, y: 1.65, w: 12.13, autoPage: false, border: { type: "solid", color: LINE, pt: 0.75 }, valign: "middle", rowH: 0.42 });
}

function outgoingTableSlide(pptx, outAgg) {
  const s = pptx.addSlide();
  pageHeader(s, "สรุปขาออก แยกตามปลายทาง", "น้ำหนักรวมแต่ละหมวดหมู่ (กก.)");

  if (outAgg.destinations.length === 0) {
    s.addText("ไม่มีข้อมูลขาออกในช่วงนี้", { x: 0.6, y: 2.5, w: 10, h: 0.5, fontSize: 16, color: MUTED, fontFace: "Calibri", isTextBox: true });
    return;
  }

  const header = ["ปลายทาง", ...CATEGORIES.map((c) => CATEGORY_LABELS_TH[c]), "รวม"].map((t) => ({
    text: t, options: { bold: true, color: "FFFFFF", fill: { color: BLACK }, fontSize: 10.5, align: t === "ปลายทาง" ? "left" : "right" },
  }));
  const rows = [header];
  outAgg.destinations.forEach((dest, i) => {
    const row = outAgg.matrix[dest] || {};
    const rowTotal = round1(sum(CATEGORIES.map((c) => row[c] || 0)));
    rows.push([
      { text: dest, options: { bold: true, fill: { color: zebra(i) }, fontSize: 10.5 } },
      ...CATEGORIES.map((c) => ({ text: fn(row[c] || 0), options: { fill: { color: zebra(i) }, fontSize: 10.5, align: "right" } })),
      { text: fn(rowTotal), options: { bold: true, fill: { color: zebra(i) }, fontSize: 10.5, align: "right" } },
    ]);
  });
  const grand = round1(sum(CATEGORIES.map((c) => outAgg.categoryGrandTotal[c] || 0)));
  rows.push([
    { text: "รวมทั้งหมด", options: { bold: true, color: "FFFFFF", fill: { color: BLACK }, fontSize: 10.5 } },
    ...CATEGORIES.map((c) => ({ text: fn(outAgg.categoryGrandTotal[c] || 0), options: { bold: true, color: "FFFFFF", fill: { color: BLACK }, fontSize: 10.5, align: "right" } })),
    { text: fn(grand), options: { bold: true, color: YELLOW, fill: { color: BLACK }, fontSize: 10.5, align: "right" } },
  ]);

  s.addTable(rows, { x: 0.4, y: 1.5, w: 12.53, autoPage: true, autoPageRepeatHeader: true, border: { type: "solid", color: LINE, pt: 0.75 }, valign: "middle", rowH: 0.38, newSlideStartY: 0.6 });
}
