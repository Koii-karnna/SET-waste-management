// Disposal-method grouping for outgoing records, shared by the dashboard and the
// PowerPoint/Excel exports so both compute the same "% usable" figure.
export const DISPOSAL_MAP = {
  "รีไซเคิล": "รีไซเคิล", "เผา RDF": "เผา RDF",
  "หมัก/ทำอาหารปลา": "หมัก/อาหารปลา", "หมักทำปุ๋ย": "หมัก/อาหารปลา",
  "หมัก/ทำอาหารปลา/ทำดิน/ปุ๋ย": "หมัก/อาหารปลา",
  "ทำดิน/ปุ๋ย": "ทำดิน/ปุ๋ย", "หมักปุ๋ย / น้ำหมัก": "ทำดิน/ปุ๋ย",
  "เผาทำลาย": "เผาทำลาย",
  "ฝังกลบ": "ฝังกลบ"
};
export const DISPOSAL_ORDER = ["เผา RDF", "รีไซเคิล", "หมัก/อาหารปลา", "ทำดิน/ปุ๋ย", "เผาทำลาย", "ฝังกลบ"];
export const DISPOSAL_COLOR = { "เผา RDF": "#90CAF9", "รีไซเคิล": "#FFE082", "หมัก/อาหารปลา": "#A5D6A7", "ทำดิน/ปุ๋ย": "#4CAF50", "เผาทำลาย": "#EF9A9A", "ฝังกลบ": "#BDBDBD" };
export const USABLE_GROUPS = new Set(["รีไซเคิล", "เผา RDF", "หมัก/อาหารปลา", "ทำดิน/ปุ๋ย"]);

export function disposalGroup(r) {
  if (r.destination === "SCIeco") return "เผา RDF";
  return DISPOSAL_MAP[r.disposalMethod] || null;
}
