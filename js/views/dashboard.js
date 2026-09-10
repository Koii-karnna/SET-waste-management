import { CATEGORIES, CATEGORY_LABELS_TH, CATEGORY_COLORS, WASTE_ITEM_BY_ID } from "../data/wasteItems.js";
import { queryIncomingRange } from "../db.js";
import { todayISO, addDays, weekRange, round1, sum } from "../utils.js";

let chartInstances = [];

export async function renderDashboard(container) {
  container.innerHTML = `<p class="muted">กำลังโหลดข้อมูล...</p>`;
  chartInstances.forEach((c) => c.destroy());
  chartInstances = [];

  const today = todayISO();
  const start = addDays(today, -180);
  let records;
  try {
    records = await queryIncomingRange(start, today);
  } catch (err) {
    container.innerHTML = `<p class="muted">โหลดข้อมูลไม่สำเร็จ: ${err.message}</p>`;
    return;
  }

  const weeklyBuckets = bucketByWeek(records);
  const monthlyBuckets = bucketByMonth(records);
  const last4Weeks = weeklyBuckets.slice(-4);
  const last6Months = monthlyBuckets.slice(-6);
  const last12Weeks = weeklyBuckets.slice(-12);

  container.innerHTML = `
    <div class="card">
      <h3>เปรียบเทียบ 4 สัปดาห์ล่าสุด</h3>
      <div class="chart-wrap"><canvas id="chart-4weeks"></canvas></div>
    </div>
    <div class="card">
      <h3>สรุปรายเดือน (6 เดือนล่าสุด)</h3>
      <div class="chart-wrap"><canvas id="chart-monthly"></canvas></div>
    </div>
    <div class="card">
      <h3>แนวโน้มรายสัปดาห์ + ค่าเฉลี่ยเคลื่อนที่ (3 สัปดาห์)</h3>
      <div class="chart-wrap"><canvas id="chart-trend"></canvas></div>
    </div>
    <div class="card">
      <h3>แนวโน้มแต่ละประเภทขยะ</h3>
      <div class="chip-group" id="category-toggles" style="margin-bottom:12px;">
        ${CATEGORIES.map(
          (c) =>
            `<button type="button" class="chip active" data-cat="${c}" style="border-color:${CATEGORY_COLORS[c]}">${CATEGORY_LABELS_TH[c]}</button>`
        ).join("")}
      </div>
      <div class="chart-wrap"><canvas id="chart-category-trend"></canvas></div>
    </div>
  `;

  const Chart = window.Chart;
  if (!Chart) {
    container.innerHTML += `<p class="muted">ไม่สามารถโหลดไลบรารีกราฟได้</p>`;
    return;
  }

  chartInstances.push(
    new Chart(container.querySelector("#chart-4weeks"), {
      type: "bar",
      data: {
        labels: last4Weeks.map((w) => w.label),
        datasets: CATEGORIES.map((cat) => ({
          label: CATEGORY_LABELS_TH[cat],
          data: last4Weeks.map((w) => w.byCategory[cat] || 0),
          backgroundColor: CATEGORY_COLORS[cat],
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    })
  );

  chartInstances.push(
    new Chart(container.querySelector("#chart-monthly"), {
      type: "bar",
      data: {
        labels: last6Months.map((m) => m.label),
        datasets: CATEGORIES.map((cat) => ({
          label: CATEGORY_LABELS_TH[cat],
          data: last6Months.map((m) => m.byCategory[cat] || 0),
          backgroundColor: CATEGORY_COLORS[cat],
        })),
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { stacked: true }, y: { stacked: true, beginAtZero: true } },
      },
    })
  );

  const trendTotals = last12Weeks.map((w) => round1(sum(CATEGORIES.map((c) => w.byCategory[c] || 0))));
  const movingAvg = movingAverage(trendTotals, 3);
  chartInstances.push(
    new Chart(container.querySelector("#chart-trend"), {
      data: {
        labels: last12Weeks.map((w) => w.label),
        datasets: [
          { type: "bar", label: "น้ำหนักรวมต่อสัปดาห์", data: trendTotals, backgroundColor: "#FBB034" },
          {
            type: "line",
            label: "ค่าเฉลี่ยเคลื่อนที่ 3 สัปดาห์",
            data: movingAvg,
            borderColor: "#23211F",
            backgroundColor: "#23211F",
            tension: 0.3,
            fill: false,
          },
        ],
      },
      options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
    })
  );

  const catChart = new Chart(container.querySelector("#chart-category-trend"), {
    type: "line",
    data: {
      labels: last12Weeks.map((w) => w.label),
      datasets: CATEGORIES.map((cat) => ({
        label: CATEGORY_LABELS_TH[cat],
        data: last12Weeks.map((w) => w.byCategory[cat] || 0),
        borderColor: CATEGORY_COLORS[cat],
        backgroundColor: CATEGORY_COLORS[cat],
        tension: 0.3,
        fill: false,
      })),
    },
    options: { responsive: true, maintainAspectRatio: false, scales: { y: { beginAtZero: true } } },
  });
  chartInstances.push(catChart);

  container.querySelector("#category-toggles").addEventListener("click", (e) => {
    const btn = e.target.closest(".chip");
    if (!btn) return;
    btn.classList.toggle("active");
    const idx = CATEGORIES.indexOf(btn.dataset.cat);
    const meta = catChart.getDatasetMeta(idx);
    meta.hidden = !btn.classList.contains("active");
    catChart.update();
  });
}

function bucketByWeek(records) {
  const buckets = {};
  for (const rec of records) {
    const { start } = weekRange(rec.date);
    buckets[start] = buckets[start] || { start, byCategory: {} };
    for (const [itemId, weight] of Object.entries(rec.items || {})) {
      const cat = WASTE_ITEM_BY_ID[itemId]?.category || "Non Recycle";
      buckets[start].byCategory[cat] = round1((buckets[start].byCategory[cat] || 0) + weight);
    }
  }
  return Object.values(buckets)
    .sort((a, b) => a.start.localeCompare(b.start))
    .map((b) => ({ ...b, label: b.start }));
}

function bucketByMonth(records) {
  const buckets = {};
  for (const rec of records) {
    const ym = rec.date.slice(0, 7);
    buckets[ym] = buckets[ym] || { ym, byCategory: {} };
    for (const [itemId, weight] of Object.entries(rec.items || {})) {
      const cat = WASTE_ITEM_BY_ID[itemId]?.category || "Non Recycle";
      buckets[ym].byCategory[cat] = round1((buckets[ym].byCategory[cat] || 0) + weight);
    }
  }
  return Object.values(buckets)
    .sort((a, b) => a.ym.localeCompare(b.ym))
    .map((b) => ({ ...b, label: b.ym }));
}

function movingAverage(arr, window) {
  return arr.map((_, i) => {
    const from = Math.max(0, i - window + 1);
    const slice = arr.slice(from, i + 1);
    return round1(sum(slice) / slice.length);
  });
}
