import { CATEGORIES, CATEGORY_LABELS_TH, CATEGORY_COLORS } from "../data/wasteItems.js";
import { DISPOSAL_ORDER, DISPOSAL_COLOR, USABLE_GROUPS, disposalGroup } from "../data/disposal.js";
import { round1, sum } from "../utils.js";

const YELLOW = "FBB034";
const BLACK = "23211F";
const MUTED = "6B6862";
const LINE = "E7E4DE";
const PANEL_BG = "FAFAF8";
const STACK_CAT = ["Non Recycle", "Infectious Waste", "Recycle", "Organic", "Hazard"];
const BLD_COLOR_FALLBACK = { A: "1E88E5", B: "9B9A8F", C: "43A047", NP1: "EF6C00", NP2: "D32F2F" };

const hx = (c) => (c || "").replace("#", "");
const fn = (n) => Number(n || 0).toLocaleString("en-US", { maximumFractionDigits: 1 });

// dash is an optional object built by dashboard.js's doPpt() with the exact
// period/building breakdown currently on screen (always incoming for the
// main charts, outgoing for disposal — outgoing already has its own
// disposal-method chart, so there's no separate ขาเข้า/ขาออก toggle here).
// Without it (the simpler View/Export page caller) the deck falls back to
// single-block summaries instead of period trends.
export async function exportPptx(data, inAgg, outAgg, dash) {
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

  if (dash) kpiSlideDash(pptx, data, dash);
  else kpiSlideFallback(pptx, data, { totalIn, totalOut, pctUsableIn, pctUsableOut, buildings: inAgg.buildings.length, destinations: outAgg.destinations.length });

  if (dash && dash.stackLabels.length) trendSlide(pptx, dash);
  else categorySlideFallback(pptx, inCat, outCat);

  if (dash && dash.bldCodes.length) buildingTrendSlide(pptx, dash);
  else if (inAgg.buildings.length > 0) buildingSlideFallback(pptx, inAgg);

  if (dispGrand > 0) disposalSlide(pptx, dispTotals, dispGrand, pctUsableOut);
  if (dash && dash.disposalLabels.length) disposalTrendSlide(pptx, dash);
  if (dash && dash.pcLabels.length) perCapitaSlide(pptx, dash);
  if (dash && dash.yearlyLabels.length) yearlySlide(pptx, dash);
  if (dash && dash.catCards) categoryOverviewSlides(pptx, dash.catCards);

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
  slide.addShape("rect", { x: x + 0.2, y: y + 0.2, w: 0.12, h: 0.12, fill: { color: accent }, line: { type: "none" } });
  slide.addText(label, { x: x + 0.2, y: y + 0.4, w: w - 0.4, h: 0.5, fontSize: 11, color: MUTED, fontFace: "Calibri", isTextBox: true });
  slide.addText([{ text: value, options: { fontSize: 24, bold: true, color: accent } }, { text: " " + unit, options: { fontSize: 11, color: MUTED } }], {
    x: x + 0.2, y: y + 0.85, w: w - 0.4, h: 0.5, fontFace: "Calibri", valign: "top", isTextBox: true,
  });
  if (sub) slide.addText(sub, { x: x + 0.2, y: y + 1.32, w: w - 0.4, h: h - 1.42, fontSize: 9.5, color: MUTED, fontFace: "Calibri", isTextBox: true });
}

/* ── KPI: 5 cards matching the Dashboard's KPI row exactly (always ขาเข้า) ── */
function kpiSlideDash(pptx, data, dash) {
  const s = pptx.addSlide();
  const filterLbl = dash.bgLabel + (dash.bldLabel ? " / " + dash.bldLabel : "");
  pageHeader(s, "สรุปภาพรวม (ขาเข้า)", `${data.label} · ${filterLbl}`);

  const cw = dash.cw, total = dash.total;
  const pct = (v) => total > 0 ? (v / total * 100).toFixed(1) : "0.0";
  const ih = round1((cw["Infectious Waste"] || 0) + (cw.Hazard || 0));

  const cardW = 2.25, gap = 0.22, y = 1.75, h = 2.05;
  const x0 = 0.6;
  const cards = [
    { label: "ขยะทั้งหมด", val: fn(total), accent: hx(YELLOW), sub: `เฉลี่ยย้อนหลัง 1 ปี: ${fn(dash.avgMonthly)} กก./เดือน · ${fn(dash.avgWeekly)} กก./สัปดาห์` },
    { label: "Recycle", val: fn(round1(cw.Recycle || 0)), accent: hx(CATEGORY_COLORS.Recycle), sub: pct(cw.Recycle || 0) + "%" },
    { label: "Organic", val: fn(round1(cw.Organic || 0)), accent: hx(CATEGORY_COLORS.Organic), sub: pct(cw.Organic || 0) + "%" },
    { label: "Non Recycle", val: fn(round1(cw["Non Recycle"] || 0)), accent: hx(CATEGORY_COLORS["Non Recycle"]), sub: pct(cw["Non Recycle"] || 0) + "%" },
    { label: "Infectious + Hazard", val: fn(ih), accent: hx(CATEGORY_COLORS["Infectious Waste"]), sub: pct(ih) + "%" },
  ];
  cards.forEach((c, i) => statCard(s, x0 + i * (cardW + gap), y, cardW, h, c.label, c.val, "กก.", c.accent, c.sub));
}

function kpiSlideFallback(pptx, data, k) {
  const s = pptx.addSlide();
  pageHeader(s, "สรุปภาพรวม", data.label);
  const cardW = 2.9, gap = 0.28, y = 1.75, h = 1.7;
  const x0 = 0.6;
  statCard(s, x0, y, cardW, h, "น้ำหนักขาเข้ารวม", fn(k.totalIn), "กก.", hx(YELLOW), `${k.buildings} อาคารที่มีข้อมูล`);
  statCard(s, x0 + (cardW + gap), y, cardW, h, "น้ำหนักขาออกรวม", fn(k.totalOut), "กก.", hx(BLACK), `${k.destinations} ปลายทาง`);
  statCard(s, x0 + 2 * (cardW + gap), y, cardW, h, "% รีไซเคิล+อินทรีย์ (ขาเข้า)", fn(k.pctUsableIn), "%", hx(CATEGORY_COLORS.Organic), "ของขยะขาเข้าทั้งหมด");
  statCard(s, x0 + 3 * (cardW + gap), y, cardW, h, "% กำจัดแบบใช้ประโยชน์ได้", fn(k.pctUsableOut), "%", hx(DISPOSAL_COLOR["ทำดิน/ปุ๋ย"]), "รีไซเคิล+RDF+หมัก+ทำดิน");
}

/* ── แนวโน้มปริมาณขยะ (stacked bar per period, ขาเข้า) — mirrors Dashboard's
   trend chart: same stacking order/colors, per-segment kg labels, and a
   total-weight label above each bar (via an invisible line series) ── */
function trendSlide(pptx, dash) {
  const s = pptx.addSlide();
  const filterLbl = dash.bgLabel + (dash.bldLabel ? " / " + dash.bldLabel : "");
  pageHeader(s, "แนวโน้มปริมาณขยะ (ขาเข้า)", `น้ำหนักรวมแยกประเภท (กก.) · ${filterLbl}`);

  const labels = dash.stackLabels;
  const totals = dash.stackCats.map((c) => round1(sum(STACK_CAT.map((cat) => c[cat] || 0))));
  const barSeries = STACK_CAT.map((cat) => ({
    name: CATEGORY_LABELS_TH[cat] || cat,
    labels,
    values: dash.stackCats.map((c) => round1(c[cat] || 0)),
  }));
  const totalSeries = [{ name: "รวม", labels, values: totals }];

  s.addChart(
    [
      {
        type: pptx.ChartType.bar,
        data: barSeries,
        options: {
          chartColors: STACK_CAT.map((c) => hx(CATEGORY_COLORS[c])),
          showValue: true, dataLabelPosition: "ctr", dataLabelColor: "FFFFFF", dataLabelFontSize: 8.5, dataLabelFormatCode: "#,##0",
        },
      },
      {
        type: pptx.ChartType.line,
        data: totalSeries,
        options: {
          chartColors: ["FFFFFF"], lineSize: 1, lineDataSymbol: "none",
          showValue: true, dataLabelPosition: "t", dataLabelColor: BLACK, dataLabelFontSize: 11, dataLabelFontBold: true, dataLabelFormatCode: "#,##0",
        },
      },
    ],
    {
      x: 0.4, y: 1.7, w: 12.53, h: 5.2,
      barDir: "col", barGrouping: "stacked",
      showLegend: true, legendPos: "b", legendFontSize: 10,
      catAxisLabelFontSize: 10, catAxisLabelColor: MUTED,
      valAxisHidden: true,
      valGridLine: { style: "none" }, catGridLine: { style: "none" },
      plotArea: { fill: { color: "FFFFFF" } },
    }
  );
}

function categorySlideFallback(pptx, inCat, outCat) {
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

/* ── เปรียบเทียบรายอาคาร (line chart per building, ขาเข้า) ── */
function buildingTrendSlide(pptx, dash) {
  const s = pptx.addSlide();
  pageHeader(s, "เปรียบเทียบรายอาคาร (ขาเข้า)", "น้ำหนักรวมแต่ละอาคาร (กก.)");

  const labels = dash.bldLabels;
  const series = dash.bldCodes.map((b) => ({
    name: "อาคาร " + b,
    labels,
    values: dash.bldData.map((d) => round1(d[b] || 0)),
  }));

  s.addChart(pptx.ChartType.line, series, {
    x: 0.6, y: 1.6, w: 12.13, h: 5.3,
    chartColors: dash.bldCodes.map((b) => hx((dash.bldColors && dash.bldColors[b]) || BLD_COLOR_FALLBACK[b] || "9B9A8F")),
    showLegend: true, legendPos: "b", legendFontSize: 11,
    lineDataSymbolSize: 6, lineSize: 2.5,
    catAxisLabelFontSize: 11, catAxisLabelColor: MUTED,
    valAxisLabelFontSize: 10, valAxisLabelColor: MUTED,
    valGridLine: { color: LINE }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });
}

function buildingSlideFallback(pptx, inAgg) {
  const s = pptx.addSlide();
  pageHeader(s, "เปรียบเทียบรายอาคาร (ขาเข้า)", "น้ำหนักรวมแต่ละอาคาร (กก.)");

  const labels = inAgg.buildings.map((b) => "อาคาร " + b);
  const values = inAgg.buildings.map((b) => round1(sum(CATEGORIES.map((c) => inAgg.categoryTotals[c]?.[b] || 0))));
  const colors = inAgg.buildings.map((b) => BLD_COLOR_FALLBACK[b] || "9B9A8F");

  s.addChart(pptx.ChartType.bar, [{ name: "น้ำหนัก", labels, values }], {
    x: 1.5, y: 1.7, w: 10.3, h: 5.3,
    barDir: "col", chartColors: colors, showLegend: false,
    showValue: true, dataLabelPosition: "outEnd", dataLabelColor: BLACK, dataLabelFontSize: 12,
    catAxisLabelFontSize: 12, catAxisLabelColor: MUTED, valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });
}

/* ── รูปแบบการกำจัด (donut, ขาออก) ── */
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

/* ── แนวโน้มรูปแบบการกำจัด (stacked bar per period, ขาออก) ── */
function disposalTrendSlide(pptx, dash) {
  const s = pptx.addSlide();
  pageHeader(s, "แนวโน้มรูปแบบการกำจัด (ขาออก)", "ปริมาณขยะขาออกแยกตามวิธีกำจัด (กก.)");

  const labels = dash.disposalLabels;
  const series = DISPOSAL_ORDER.map((g) => ({
    name: g,
    labels,
    values: dash.disposalData.map((d) => round1(d[g] || 0)),
  }));

  s.addChart(pptx.ChartType.bar, series, {
    x: 0.4, y: 1.65, w: 12.53, h: 4.5,
    barDir: "col", barGrouping: "stacked",
    chartColors: DISPOSAL_ORDER.map((g) => hx(DISPOSAL_COLOR[g])),
    showLegend: true, legendPos: "b", legendFontSize: 10,
    showValue: true, dataLabelPosition: "ctr", dataLabelColor: BLACK, dataLabelFontSize: 7.5, dataLabelFormatCode: "#,##0",
    catAxisLabelFontSize: 10, catAxisLabelColor: MUTED,
    valAxisHidden: true,
    valGridLine: { style: "none" }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });

  const totalsPer = dash.disposalData.map((d) => round1(sum(DISPOSAL_ORDER.map((g) => d[g] || 0))));
  const usablePer = dash.disposalData.map((d) => round1(sum(DISPOSAL_ORDER.filter((g) => USABLE_GROUPS.has(g)).map((g) => d[g] || 0))));
  const pctTxt = labels.map((l, i) => (totalsPer[i] > 0 ? `${l}: ${(usablePer[i] / totalsPer[i] * 100).toFixed(0)}% ใช้ได้` : `${l}: -`)).join("    ");
  s.addText("% ใช้ได้ต่อช่วง — " + pctTxt, { x: 0.4, y: 6.3, w: 12.53, h: 0.6, fontSize: 9.5, color: MUTED, fontFace: "Calibri", isTextBox: true });
}

/* ── ผู้ใช้อาคาร vs ขยะต่อคน (line, ขาเข้า) ── */
function perCapitaSlide(pptx, dash) {
  const s = pptx.addSlide();
  pageHeader(s, "ผู้ใช้อาคาร vs ขยะต่อคน (ขาเข้า)", dash.pcHint || "กก./คน/วัน (ประมาณจากผู้ใช้ ~900 คน/วัน)");

  s.addChart(pptx.ChartType.line, [{ name: "กก./คน/วัน", labels: dash.pcLabels, values: dash.pcKpd }], {
    x: 1.2, y: 1.7, w: 10.93, h: 5.3,
    chartColors: [hx(YELLOW)],
    showLegend: false,
    lineDataSymbolSize: 6, lineSize: 2.5,
    showValue: true, dataLabelPosition: "t", dataLabelColor: BLACK, dataLabelFontSize: 10,
    catAxisLabelFontSize: 11, catAxisLabelColor: MUTED,
    valAxisLabelFontSize: 10, valAxisLabelColor: MUTED,
    valGridLine: { color: LINE }, catGridLine: { style: "none" },
    plotArea: { fill: { color: "FFFFFF" } },
  });
}

/* ── เปรียบเทียบรายปี (stacked bar per year, ขาเข้า) ── */
function yearlySlide(pptx, dash) {
  const s = pptx.addSlide();
  pageHeader(s, "เปรียบเทียบรายปี (ขาเข้า)", "ปริมาณขยะรวมแต่ละปี แยกตามประเภท (กก.)");

  const labels = dash.yearlyLabels;
  const totals = dash.yearlyCatTotals.map((cw) => round1(sum(CATEGORIES.map((c) => cw[c] || 0))));
  const barSeries = CATEGORIES.map((cat) => ({
    name: CATEGORY_LABELS_TH[cat] || cat,
    labels,
    values: dash.yearlyCatTotals.map((cw) => round1(cw[cat] || 0)),
  }));
  const totalSeries = [{ name: "รวม", labels, values: totals }];

  s.addChart(
    [
      {
        type: pptx.ChartType.bar,
        data: barSeries,
        options: {
          chartColors: CATEGORIES.map((c) => hx(CATEGORY_COLORS[c])),
          showValue: true, dataLabelPosition: "ctr", dataLabelColor: "FFFFFF", dataLabelFontSize: 10, dataLabelFormatCode: "#,##0",
        },
      },
      {
        type: pptx.ChartType.line,
        data: totalSeries,
        options: {
          chartColors: ["FFFFFF"], lineSize: 1, lineDataSymbol: "none",
          showValue: true, dataLabelPosition: "t", dataLabelColor: BLACK, dataLabelFontSize: 12, dataLabelFontBold: true, dataLabelFormatCode: "#,##0",
        },
      },
    ],
    {
      x: 1.0, y: 1.6, w: 11.33, h: 5.3,
      barDir: "col", barGrouping: "stacked",
      showLegend: true, legendPos: "b", legendFontSize: 11,
      catAxisLabelFontSize: 12, catAxisLabelColor: MUTED,
      valAxisHidden: true,
      valGridLine: { style: "none" }, catGridLine: { style: "none" },
      plotArea: { fill: { color: "FFFFFF" } },
    }
  );
}

/* ── category overview slides (ขาเข้า): the same "รายการสูงสุด" and
   "แนวโน้ม (เฉลี่ยปี vs เดือนล่าสุด)" data as the Dashboard's category
   cards, laid out the same way Dashboard does it — the avg-vs-last-month
   comparison sits below the trend lines behind a divider, not squeezed
   next to the header — which only leaves room for 2 categories per slide
   at a readable size ── */
function categoryOverviewSlides(pptx, cards) {
  const perSlide = 2;
  const pages = [];
  for (let p = 0; p < cards.length; p += perSlide) pages.push(cards.slice(p, p + perSlide));

  pages.forEach((chunk, pageIdx) => {
    const s = pptx.addSlide();
    const suffix = pages.length > 1 ? ` (${pageIdx + 1}/${pages.length})` : "";
    pageHeader(s, "รายละเอียดตามหมวดหมู่ (ขาเข้า)" + suffix, "รายการสูงสุด และแนวโน้ม (เฉลี่ยปี vs เดือนล่าสุด) แยกตามหมวดหมู่");

    const x0 = 0.4, fullW = 12.53, rowH = 2.9, gap = 0.1, y0 = 1.4;
    chunk.forEach((card, i) => {
      const y = y0 + i * (rowH + gap);
      const color = hx(CATEGORY_COLORS[card.cat]);

      s.addShape("roundRect", { x: x0, y, w: fullW, h: rowH, rectRadius: 0.08, fill: { color: i % 2 === 0 ? "FFFFFF" : PANEL_BG }, line: { color: LINE, width: 0.75 } });

      // header: category name as a colored pill + total
      s.addShape("roundRect", { x: x0 + 0.25, y: y + 0.18, w: 2.6, h: 0.46, rectRadius: 0.23, fill: { color }, line: { type: "none" } });
      s.addText(card.cat, { x: x0 + 0.25, y: y + 0.18, w: 2.6, h: 0.46, align: "center", valign: "middle", fontSize: 15, bold: true, color: "FFFFFF", fontFace: "Calibri", isTextBox: true });
      s.addText([{ text: fn(card.catTotal), options: { fontSize: 22, bold: true, color } }, { text: " กก.", options: { fontSize: 11.5, color: MUTED } }], {
        x: x0 + fullW - 3.4, y: y + 0.16, w: 3.2, h: 0.42, align: "right", fontFace: "Calibri", isTextBox: true,
      });
      s.addText(`${fn(card.catPct)}% ของขยะขาเข้าทั้งหมด · ${card.itemCount} รายการ`, { x: x0 + 0.25, y: y + 0.72, w: 5.0, h: 0.24, fontSize: 11, color: MUTED, fontFace: "Calibri", isTextBox: true });

      // two columns: รายการสูงสุด | แนวโน้ม
      const itemsX = x0 + 0.4, colW = fullW / 2 - 0.55;
      const trendX = x0 + fullW / 2 + 0.15;
      const labelY = y + 1.08, bodyY = y + 1.34;
      s.addText("รายการสูงสุด", { x: itemsX, y: labelY, w: colW, h: 0.24, fontSize: 11.5, bold: true, color: BLACK, fontFace: "Calibri", isTextBox: true });
      s.addText("แนวโน้ม (เฉลี่ยปี vs เดือนล่าสุด)", { x: trendX, y: labelY, w: colW, h: 0.24, fontSize: 11.5, bold: true, color: BLACK, fontFace: "Calibri", isTextBox: true });

      if (card.items.length === 0) {
        s.addText("ไม่มีข้อมูล", { x: itemsX, y: bodyY, w: colW, h: 0.28, fontSize: 11, color: MUTED, fontFace: "Calibri", isTextBox: true });
      } else {
        const maxKg = card.items[0].kg || 1;
        let iy = bodyY;
        for (const it of card.items) {
          s.addText(it.name, { x: itemsX, y: iy, w: colW * 0.6, h: 0.24, fontSize: 11, color: BLACK, fontFace: "Calibri", isTextBox: true, valign: "top" });
          s.addText(`${fn(it.kg)} กก. ${fn(it.pct)}%`, { x: itemsX + colW * 0.6, y: iy, w: colW * 0.4, h: 0.24, align: "right", fontSize: 10.5, color: MUTED, fontFace: "Calibri", isTextBox: true });
          const bw = Math.max((it.kg / maxKg) * colW, 0.08);
          s.addShape("roundRect", { x: itemsX, y: iy + 0.25, w: colW, h: 0.09, rectRadius: 0.025, fill: { color: "F0EEE9" }, line: { type: "none" } });
          s.addShape("roundRect", { x: itemsX, y: iy + 0.25, w: bw, h: 0.09, rectRadius: 0.025, fill: { color }, line: { type: "none" } });
          iy += 0.48;
        }
      }

      if (card.trendLines.length === 0) {
        s.addText("ต้องมีข้อมูลอย่างน้อย 2 เดือน", { x: trendX, y: bodyY, w: colW, h: 0.28, fontSize: 11, color: MUTED, fontFace: "Calibri", isTextBox: true });
      } else {
        let ty = bodyY;
        for (const t of card.trendLines) {
          const up = t.pc > 5, down = t.pc < -5;
          const arrow = up ? "▲" : down ? "▼" : "→";
          const clr = up ? "D32F2F" : down ? hx(CATEGORY_COLORS.Organic) : MUTED;
          const detail = up || down ? `${t.name} ${t.pc > 0 ? "+" : ""}${fn(t.pc)}%` : `${t.name} คงที่`;
          s.addText(
            [{ text: arrow + " ", options: { color: clr, bold: true } }, { text: detail, options: { color: BLACK } }],
            { x: trendX, y: ty, w: colW, h: 0.3, fontSize: 11, fontFace: "Calibri", isTextBox: true, valign: "top" }
          );
          ty += 0.29;
        }

        // avg-vs-last-month comparison, below the trend lines behind a divider (matches Dashboard's .cc-trend-cmp)
        const cmpY = ty + 0.12;
        s.addShape("line", { x: trendX, y: cmpY, w: colW, h: 0.001, line: { color: LINE, width: 0.75 } });
        const catUp = card.catCh > 0, catDown = card.catCh < 0;
        const cmpArrow = catUp ? "▲" : catDown ? "▼" : "→";
        const cmpClr = catUp ? "D32F2F" : catDown ? hx(CATEGORY_COLORS.Organic) : MUTED;
        s.addText(
          [
            { text: `เฉลี่ย ${fn(card.catAvg)} กก./เดือน → ${card.mLbl} ${fn(card.lastCatKg)} กก.  `, options: { color: MUTED } },
            { text: `${cmpArrow} ${card.catCh > 0 ? "+" : ""}${fn(card.catCh)}%`, options: { color: cmpClr, bold: true } },
          ],
          { x: trendX, y: cmpY + 0.08, w: colW, h: 0.26, fontSize: 11, fontFace: "Calibri", isTextBox: true }
        );
      }
    });
  });
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
