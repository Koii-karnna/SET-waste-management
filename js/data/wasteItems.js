// Master list of 35 waste items, in the fixed order used on the paper form.
// Source: แบบฟอร์มบันทึกปริมาณขยะรายวัน.xlsx (sheet "Worksheet")
export const CATEGORIES = ["Organic", "Recycle", "Non Recycle", "Infectious Waste", "Hazard"];

export const CATEGORY_LABELS_TH = {
  Organic: "อินทรีย์ (Organic)",
  Recycle: "รีไซเคิล (Recycle)",
  "Non Recycle": "ทั่วไป (Non Recycle)",
  "Infectious Waste": "ติดเชื้อ (Infectious Waste)",
  Hazard: "อันตราย (Hazard)",
};

export const CATEGORY_COLORS = {
  Organic: "#7CB342",
  Recycle: "#2E9CCA",
  "Non Recycle": "#8D8D8D",
  "Infectious Waste": "#E4572E",
  Hazard: "#B23A48",
};

export const WASTE_ITEMS = [
  { id: "1", seq: 1, nameTh: "เศษอาหาร - pantry / canteen / catering", category: "Organic" },
  { id: "2", seq: 2, nameTh: "ใบไม้ กิ่งไม้", category: "Organic" },
  { id: "3", seq: 3, nameTh: "กระดาษ - ความลับ", category: "Recycle" },
  { id: "4", seq: 4, nameTh: "กระดาษ - กรวยกระดาษ/ แก้วกระดาษ / อื่นๆ", category: "Recycle" },
  { id: "5", seq: 5, nameTh: "กระดาษ - กล่องนม / กล่องผลไม้", category: "Recycle" },
  { id: "6", seq: 6, nameTh: "ห่วงเปิดกระป๋องอลูมิเนียม (ตู้บริจาคทำขาเทียม)", category: "Recycle" },
  { id: "7", seq: 7, nameTh: "พลาสติก - ถุงยืด / บรรจุภัณฑ์ยืด", category: "Recycle" },
  { id: "8", seq: 8, nameTh: "พลาสติก - ซองวิบวับ", category: "Recycle" },
  { id: "9", seq: 9, nameTh: "พลาสติก - กล่อง / บรรจุภัณฑ์แข็ง", category: "Recycle" },
  { id: "10", seq: 10, nameTh: "พลาสติก - แก้ว", category: "Recycle" },
  { id: "11", seq: 11, nameTh: "พลาสติก - ขวด", category: "Recycle" },
  { id: "12", seq: 12, nameTh: "พลาสติก - ฝา", category: "Recycle" },
  { id: "13", seq: 13, nameTh: "พลาสติก - ช้อน-ส้อม", category: "Recycle" },
  { id: "14", seq: 14, nameTh: "พลาสติก - หลอด", category: "Recycle" },
  { id: "15", seq: 15, nameTh: "เหล็ก - กระป๋อง / เศษเหล็ก (แม็ค,คลิปหนีบกระดาษ)", category: "Recycle" },
  { id: "16", seq: 16, nameTh: "อลูมิเนียม - กล่อง / กระป๋องอลูมิเนียม / ฝาขวดน้ำ", category: "Recycle" },
  { id: "17", seq: 17, nameTh: "ขวดแก้ว", category: "Recycle" },
  { id: "18", seq: 18, nameTh: "ขยะอิเล็กทรอนิกส์ (AIS BOX)", category: "Recycle" },
  { id: "19", seq: 19, nameTh: "ปฎิทิน", category: "Recycle" },
  { id: "20", seq: 20, nameTh: "โฟม", category: "Non Recycle" },
  { id: "21", seq: 21, nameTh: "ไม้ - ตะเกียบ/ไม้เสียบ", category: "Non Recycle" },
  { id: "22", seq: 22, nameTh: "บรรจุภัณฑ์ที่ป่นเปื้อนอาหาร (ถุงขนม/ถุงแกง)", category: "Non Recycle" },
  { id: "23", seq: 23, nameTh: "ทิชชู่ห้องน้ำ", category: "Infectious Waste" },
  { id: "24", seq: 24, nameTh: "ทิชชู่เช็ดมือ", category: "Infectious Waste" },
  { id: "25", seq: 25, nameTh: "หน้ากากอนามัย/ATK", category: "Infectious Waste" },
  { id: "26", seq: 26, nameTh: "ผ้าอนามัย", category: "Infectious Waste" },
  { id: "27", seq: 27, nameTh: "แก้วแตก / กระจกแตก", category: "Hazard" },
  { id: "28", seq: 28, nameTh: "กระป๋องสเปรย์", category: "Hazard" },
  { id: "29", seq: 29, nameTh: "บรรจุภัณฑ์ใส่สารเคมี", category: "Hazard" },
  { id: "30", seq: 30, nameTh: "หลอดไฟ", category: "Hazard" },
  { id: "31", seq: 31, nameTh: "ถ่านไฟฉาย", category: "Hazard" },
  { id: "32", seq: 32, nameTh: "ปากกาเมจิก ไวท์บอร์ด", category: "Hazard" },
  { id: "33", seq: 33, nameTh: "กระป๋องสี", category: "Hazard" },
  { id: "34", seq: 34, nameTh: "ของแหลมคม(มีด ,คัตเตอร์, เข็ม) อื่นๆ", category: "Hazard" },
  { id: "35", seq: 35, nameTh: "อื่นๆ", category: null },
];

export const WASTE_ITEM_BY_ID = Object.fromEntries(WASTE_ITEMS.map((it) => [it.id, it]));

export const OTHER_ITEM_ID = "35";

export const BUILDINGS = {
  CMC: ["A", "B", "C"],
  NP: ["NP1", "NP2"],
};
