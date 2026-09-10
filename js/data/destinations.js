// Known outgoing destinations with their usual disposal method / address / vehicle,
// derived from historical CMC records (majority value per destination).
// Used to auto-fill the ขาออก form; all fields stay editable, and a new destination can be added.
export const DESTINATIONS = [
  {
    destination: "GC",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "888/9 ถนนมาบชะลูด-แหลมสน ตำบลห้วยโป่ง อำเภอเมืองระยอง จังหวัดระยอง 21150",
    vehicleType: "รถกระบะตู้ทึบ",
  },
  {
    destination: "SCGP",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "โรงอัดเศษกระดาษรังสิต 10 หมู่ 3 ต.คลองหนึ่ง อ.คลองหลวง จ.ปทุมธานี 12120",
    vehicleType: "รถกระบะ",
  },
  {
    destination: "SCIeco",
    disposalMethod: "เผา RDF",
    destinationAddress: "33/3 ม.3 ถ.มิตรภาพ ต.บ้านป่า อ.แก่งคอย จ.สระบุรี",
    vehicleType: "รถกระบะตู้ทึบ",
  },
  {
    destination: "วัดจากแดง",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "16 หมู่ที่ 6 ถนนเพชรหึงษ์ ซอย 10 ตำบลทรงคนอง อำเภอพระประแดง สมุทรปราการ 10130",
    vehicleType: "รถตู้ SET",
  },
  {
    destination: "บ่อปลามีนบุรี",
    disposalMethod: "หมัก/ทำอาหารปลา",
    destinationAddress: "139 ถนน สามวา แขวงบางชัน เขตคลองสามวา กรุงเทพมหานคร 10510",
    vehicleType: "รถบรรทุก 4 ล้อใหญ่",
  },
  {
    destination: "ห้องทำดิน C1",
    disposalMethod: "หมักปุ๋ย / น้ำหมัก",
    destinationAddress: "93 ถ. รัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400",
    vehicleType: "-",
  },
  {
    destination: "JOURNEY TO ZERO WASTE",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "97 หมู่ 2 ถ.พุทธมณฑล สาย 4 ต.กระทุ่มล้ม อ.สามพราน จ.นครปฐม 73220",
    vehicleType: "ไปรษณีย์",
  },
  {
    destination: "BigC(บริจาค)",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "125 ถ.รัชดาภิเษก แขวงดินแดง เขตดินแดง กรุงเทพมหานคร 10400",
    vehicleType: "รถตู้ SET",
  },
  {
    destination: "IFS",
    disposalMethod: "เผาทำลาย",
    destinationAddress: "365/1 ถนนพหลโยธิน แขวงอนุสาวรีย์ เขตบางเขน กรุงเทพมหานคร 10220",
    vehicleType: "รถกระบะตู้ทึบ",
  },
  {
    destination: "AIS",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "88 หมู่ 8 ต. บ่อวิน อ. ศรีราชา จ.ชลบุรี 20230",
    vehicleType: "ไปรษณีย์",
  },
  {
    destination: "APK",
    disposalMethod: "เผาทำลาย",
    destinationAddress: "792 หมู่ที่ 2 ซอย 1C/1 นิคมอุตสาหกรรมบางปู ถ.สุขุมวิท ต.บางปูใหม่ อ.เมืองสมุทรปราการ จ.สมุทรปราการ 10280",
    vehicleType: "รถกระบะ",
  },
  {
    destination: "Iron Mountain",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "69 หมู่ 2 ซอยวัดหนามแดง ถนนศรีนครินทร์ ตำบลบางแก้ว อำเภอบางพลี จังหวัดสมุทรปราการ 10540",
    vehicleType: "รถตู้",
  },
  {
    destination: "ศูนย์เทคโนโลยีการศึกษาเพื่อคนตาบอด",
    disposalMethod: "รีไซเคิล",
    destinationAddress: "78/2 หมู่ 1 ซอยติวานนท์-ปากเกร็ด 1 อำเภอปากเกร็ด จังหวัดนนทบุรี 11120",
    vehicleType: "รถตู้ SET",
  },
];

export const DESTINATION_BY_NAME = Object.fromEntries(DESTINATIONS.map((d) => [d.destination, d]));

export const DISPOSAL_METHODS = [
  "รีไซเคิล",
  "เผา RDF",
  "เผาทำลาย",
  "หมัก/ทำอาหารปลา",
  "หมักปุ๋ย / น้ำหมัก",
  "ทำดิน/ปุ๋ย",
];

export const VEHICLE_TYPES = ["รถกระบะ", "รถกระบะตู้ทึบ", "รถตู้", "รถตู้ SET", "รถบรรทุก 4 ล้อใหญ่", "ไปรษณีย์", "-"];
