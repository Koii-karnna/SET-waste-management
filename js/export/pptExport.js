import { CATEGORIES, CATEGORY_LABELS_TH, CATEGORY_COLORS } from "../data/wasteItems.js";
import { round1, sum } from "../utils.js";

const SET_YELLOW = "FBB034";
const SET_BLACK = "23211F";

export async function exportPptx(data, inAgg, outAgg) {
  const PptxGenJS = window.PptxGenJS;
  if (!PptxGenJS) throw new Error("โหลดไลบรารี PowerPoint ไม่สำเร็จ");

  const pptx = new PptxGenJS();
  pptx.defineLayout({ name: "WIDE", width: 13.33, height: 7.5 });
  pptx.layout = "WIDE";

  const totalIn = round1(sum(Object.values(inAgg.itemTotals).flatMap((byB) => Object.values(byB))));
  const totalOut = round1(sum(outAgg.destinations.map((d) => sum(Object.values(outAgg.matrix[d] || {})))));

  // Slide 1: title
  const s1 = pptx.addSlide();
  s1.background = { color: SET_BLACK };
  s1.addText("Zero Waste Dashboard", { x: 0.6, y: 2.6, w: 12, h: 1, fontSize: 40, bold: true, color: "FFFFFF" });
  s1.addText("SET PFM — " + data.label, { x: 0.6, y: 3.5, w: 12, h: 0.6, fontSize: 20, color: SET_YELLOW });

  // Slide 2: summary stats
  const s2 = pptx.addSlide();
  s2.addText("สรุปภาพรวม", { x: 0.5, y: 0.3, fontSize: 26, bold: true, color: SET_BLACK });
  s2.addText(data.label, { x: 0.5, y: 0.9, fontSize: 14, color: "6B6862" });
  s2.addTable(
    [
      [{ text: "รายการ", options: { bold: true, fill: { color: "F7F7F5" } } }, { text: "น้ำหนัก (กก.)", options: { bold: true, fill: { color: "F7F7F5" } } }],
      ["น้ำหนักขาเข้ารวม", String(totalIn)],
      ["น้ำหนักขาออกรวม", String(totalOut)],
      ["จำนวนอาคารที่มีข้อมูล", String(inAgg.buildings.length)],
      ["จำนวนปลายทาง", String(outAgg.destinations.length)],
    ],
    { x: 0.5, y: 1.5, w: 6, colW: [4, 2], fontSize: 14, border: { type: "solid", color: "E7E4DE" } }
  );

  // Slide 3: category chart image
  const chartImg = await renderCategoryChart(inAgg, outAgg);
  const s3 = pptx.addSlide();
  s3.addText("น้ำหนักขยะแยกตามประเภท", { x: 0.5, y: 0.3, fontSize: 26, bold: true, color: SET_BLACK });
  if (chartImg) {
    s3.addImage({ data: chartImg, x: 1.5, y: 1.1, w: 10.3, h: 5.6 });
  }

  // Slide 4: incoming table
  const s4 = pptx.addSlide();
  s4.addText("สรุปขาเข้า แยกตามอาคาร (กก.)", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: SET_BLACK });
  const inHeader = ["รายการ", ...inAgg.buildings.map((b) => `อาคาร ${b}`), "รวม"].map((t) => ({
    text: t,
    options: { bold: true, fill: { color: "F7F7F5" } },
  }));
  const inTableRows = [inHeader];
  for (const cat of CATEGORIES) {
    const rowTotal = round1(sum(inAgg.buildings.map((b) => inAgg.categoryTotals[cat]?.[b] || 0)));
    inTableRows.push([
      { text: CATEGORY_LABELS_TH[cat], options: { bold: true } },
      ...inAgg.buildings.map((b) => String(inAgg.categoryTotals[cat]?.[b] || 0)),
      String(rowTotal),
    ]);
  }
  s4.addTable(inTableRows, { x: 0.5, y: 1.1, w: 12.3, fontSize: 13, border: { type: "solid", color: "E7E4DE" } });

  // Slide 5: outgoing table
  const s5 = pptx.addSlide();
  s5.addText("สรุปขาออก แยกตามปลายทาง (กก.)", { x: 0.5, y: 0.3, fontSize: 24, bold: true, color: SET_BLACK });
  const outHeader = ["ปลายทาง", ...CATEGORIES.map((c) => CATEGORY_LABELS_TH[c]), "รวม"].map((t) => ({
    text: t,
    options: { bold: true, fill: { color: "F7F7F5" } },
  }));
  const outTableRows = [outHeader];
  for (const dest of outAgg.destinations) {
    const row = outAgg.matrix[dest] || {};
    const rowTotal = round1(sum(CATEGORIES.map((c) => row[c] || 0)));
    outTableRows.push([dest, ...CATEGORIES.map((c) => String(row[c] || 0)), String(rowTotal)]);
  }
  s5.addTable(outTableRows, { x: 0.5, y: 1.1, w: 12.3, fontSize: 12, border: { type: "solid", color: "E7E4DE" } });

  await pptx.writeFile({ fileName: `zero-waste-${data.start}_to_${data.end}.pptx` });
}

function renderCategoryChart(inAgg, outAgg) {
  return new Promise((resolve) => {
    const Chart = window.Chart;
    if (!Chart) return resolve(null);
    const canvas = document.createElement("canvas");
    canvas.width = 1000;
    canvas.height = 560;
    canvas.style.position = "fixed";
    canvas.style.left = "-9999px";
    document.body.appendChild(canvas);

    const labels = CATEGORIES.map((c) => CATEGORY_LABELS_TH[c]);
    const inData = CATEGORIES.map((c) => round1(sum(inAgg.buildings.map((b) => inAgg.categoryTotals[c]?.[b] || 0))));
    const outData = CATEGORIES.map((c) => outAgg.categoryGrandTotal[c] || 0);

    const chart = new Chart(canvas, {
      type: "bar",
      data: {
        labels,
        datasets: [
          { label: "ขาเข้า", data: inData, backgroundColor: "#FBB034" },
          { label: "ขาออก", data: outData, backgroundColor: "#23211F" },
        ],
      },
      options: {
        responsive: false,
        animation: false,
        plugins: { legend: { position: "top" } },
        scales: { y: { beginAtZero: true } },
      },
    });

    setTimeout(() => {
      const dataUrl = canvas.toDataURL("image/png");
      chart.destroy();
      canvas.remove();
      resolve(dataUrl);
    }, 250);
  });
}
