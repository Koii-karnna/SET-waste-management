import {
  db,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  writeBatch,
} from "./firebase-init.js";

const INCOMING = "incomingRecords";
const OUTGOING = "outgoingRecords";

export function incomingDocId(date, buildingCode) {
  return `${date}_${buildingCode}`;
}

export async function getIncoming(date, buildingCode) {
  const ref = doc(db, INCOMING, incomingDocId(date, buildingCode));
  const snap = await getDoc(ref);
  return snap.exists() ? snap.data() : null;
}

export async function upsertIncoming(record, userEmail) {
  const id = incomingDocId(record.date, record.buildingCode);
  const ref = doc(db, INCOMING, id);
  await setDoc(ref, {
    ...record,
    updatedBy: userEmail || null,
    updatedAt: new Date().toISOString(),
  });
  return id;
}

export async function queryIncomingRange(startDate, endDate, buildingGroup) {
  const clauses = [where("date", ">=", startDate), where("date", "<=", endDate)];
  if (buildingGroup) clauses.push(where("buildingGroup", "==", buildingGroup));
  const q = query(collection(db, INCOMING), ...clauses, orderBy("date", "asc"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function addOutgoing(record, userEmail) {
  const ref = await addDoc(collection(db, OUTGOING), {
    ...record,
    createdBy: userEmail || null,
    createdAt: new Date().toISOString(),
  });
  return ref.id;
}

export async function queryOutgoingRange(startDate, endDate) {
  const q = query(
    collection(db, OUTGOING),
    where("date", ">=", startDate),
    where("date", "<=", endDate),
    orderBy("date", "asc")
  );
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function updateOutgoingRecord(id, data, userEmail) {
  const ref = doc(db, OUTGOING, id);
  await updateDoc(ref, {
    ...data,
    updatedBy: userEmail || null,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteOutgoingRecord(id) {
  await deleteDoc(doc(db, OUTGOING, id));
}

// One-time historical import helper, used by tools/import-seed.html only.
export async function batchImportIncoming(records) {
  await batchWrite(records, (rec) => ({
    ref: doc(db, INCOMING, incomingDocId(rec.date, rec.buildingCode)),
    data: { ...rec, updatedBy: "seed-import", updatedAt: new Date().toISOString() },
  }));
}

export async function batchImportOutgoing(records) {
  await batchWrite(records, (rec) => ({
    ref: doc(collection(db, OUTGOING)),
    data: { ...rec, createdBy: "seed-import", createdAt: new Date().toISOString() },
  }));
}

async function batchWrite(records, mapFn) {
  const CHUNK = 400;
  for (let i = 0; i < records.length; i += CHUNK) {
    const chunk = records.slice(i, i + CHUNK);
    const batch = writeBatch(db);
    for (const rec of chunk) {
      const { ref, data } = mapFn(rec);
      batch.set(ref, data);
    }
    await batch.commit();
  }
}
