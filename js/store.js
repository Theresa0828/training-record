// Keeps every record in memory for instant reads and writes through to IndexedDB in the background.
import { SEED_EXERCISES, REMOVED_SEEDS, SEED_TAGS } from './seed.js';
import { withTorsoGroup, dueForPurge, stampFields } from './core.js';

const REMOVED_IDS = new Set(REMOVED_SEEDS.map((exercise) => exercise.id));

/**
 * A built-in exercise saved before 2026-11-24 (or from another device) carries no classification, or an older one.
 * Until the teacher re-classifies it by hand (tagsEdited), it shows the current built-in one. Only in memory:
 * nothing is rewritten or re-uploaded because of this.
 */
function withSeedTags(record) {
  const tags = SEED_TAGS.get(record?.id);
  const fresh = tags && !record.tagsEdited ? { ...record, tags } : record;
  return withTorsoGroup(fresh);
}
const DB_NAME = 'training-record';
const COLLECTIONS = ['students', 'exercises', 'sessions', 'plans', 'events', 'options', 'photos'];
// Handout text and images stay on this device: never in memory, never synced.
const HANDOUT_STORES = ['handout', 'handoutImages'];
// Photo files stay out of memory; only their small records (who, when, which angle) are synced as data (2026-11-17).
const PHOTO_STORE = 'photoBlobs';
const STORES = [...COLLECTIONS, 'outbox', 'meta', ...HANDOUT_STORES, PHOTO_STORE];

let db = null;
const memory = { students: new Map(), exercises: new Map(), sessions: new Map(), plans: new Map(), events: new Map(), options: new Map(), photos: new Map() };
const meta = new Map();
const listeners = new Set();
const saveErrorListeners = new Set();
const pending = new Map();
let flushTimer = null;
// The last stored copy of each student, apart from the object the screens hold and may change in place, so a save
// can tell which fields changed (2026-11-26: student details merge field by field).
const studentCopies = new Map();
const copyOf = (record) => JSON.parse(JSON.stringify(record));

// Who is signed in (identity.js registers it): each change waiting for the cloud remembers them (2026-11-26, v47),
// so on a shared iPad one teacher's changes never go up under the next one's login.
let actorOf = () => '';
export function setActorSource(source) {
  actorOf = source;
}

function outboxItem(collection, id, at) {
  return { id: `${collection}|${id}`, collection, recordId: id, at, by: actorOf() || '' };
}

export function onSaveError(listener) {
  saveErrorListeners.add(listener);
}

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 4);
    request.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!request.result.objectStoreNames.contains(name)) {
          request.result.createObjectStore(name, { keyPath: 'id' });
        }
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function readAll(name) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function loadStore() {
  db = await open();
  await Promise.all(COLLECTIONS.map(async (name) => {
    for (const record of await readAll(name)) memory[name].set(record.id, name === 'exercises' ? withSeedTags(record) : record);
  }));
  for (const student of memory.students.values()) studentCopies.set(student.id, copyOf(student));
  for (const item of await readAll('meta')) meta.set(item.id, item.value);
  for (const exercise of SEED_EXERCISES) {
    if (!memory.exercises.has(exercise.id)) memory.exercises.set(exercise.id, exercise);
  }
  for (const exercise of REMOVED_SEEDS) {
    if (!memory.exercises.has(exercise.id)) memory.exercises.set(exercise.id, exercise);
  }
  // Whatever is still waiting goes to disk before the page can be closed or frozen.
  window.addEventListener('pagehide', () => { flush(); });
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flush(); });
  // Ask iOS not to clear this data under storage pressure.
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
}

/**
 * 2026-11-07: the Pilates library holds only the teacher's handouts. Claude's sample Pilates exercises
 * (demo_ex_*) stay hidden unless a handout import linked one to a handout exercise of the same name.
 */
export function isSamplePilates(record) {
  return record.kind === 'pilates' && String(record.id).startsWith('demo_ex_') && !record.handoutId;
}

export function all(collection) {
  // A removed starter exercise stays gone even if this device or Drive holds an older copy of it.
  return [...memory[collection].values()].filter((r) => !r.deleted
    && !(collection === 'exercises' && (REMOVED_IDS.has(r.id) || isSamplePilates(r))));
}

/** Every record, deleted ones too (their Drive copies still need tidying). */
export function allIncludingDeleted(collection) {
  return [...memory[collection].values()];
}

export function get(collection, id) {
  return memory[collection].get(id) || null;
}

export function getMeta(key, fallback = null) {
  return meta.has(key) ? meta.get(key) : fallback;
}

export function setMeta(key, value) {
  meta.set(key, value);
  queue('meta', { id: key, value });
  flushSoon();
}

function queue(store, record) {
  pending.set(`${store}|${record.id}`, { store, record });
}

function flushSoon() {
  if (flushTimer) return;
  flushTimer = setTimeout(flush, 30);
}

function writeBatch(batch) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES, 'readwrite');
    for (const { store, record, remove } of batch) {
      if (remove) tx.objectStore(store).delete(record.id);
      else tx.objectStore(store).put(record);
    }
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Writes queued changes now. Also runs when the app is hidden so nothing is lost. */
export async function flush() {
  clearTimeout(flushTimer);
  flushTimer = null;
  if (!pending.size || !db) return;
  const batch = [...pending.entries()];
  pending.clear();
  const items = batch.map(([, item]) => item);
  try {
    await writeBatch(items);
  } catch (first) {
    try {
      // iOS can close the database while the app is in the background, so reopen once.
      db = await open();
      await writeBatch(items);
    } catch (error) {
      // Keep the changes queued unless a newer one replaced them, and try again shortly.
      for (const [key, item] of batch) {
        if (!pending.has(key)) pending.set(key, item);
      }
      flushTimer = setTimeout(flush, 3000);
      for (const listener of saveErrorListeners) listener(error);
    }
  }
}

/** Saves a record locally and marks it to go to Drive. */
export function save(collection, record) {
  const now = Date.now();
  if (collection === 'students') {
    record.fieldAt = stampFields(studentCopies.get(record.id) || null, record, now);
    studentCopies.set(record.id, copyOf(record));
  }
  record.updatedAt = now;
  memory[collection].set(record.id, record);
  queue(collection, JSON.parse(JSON.stringify(record)));
  if (collection !== 'events') queue('outbox', outboxItem(collection, record.id, record.updatedAt));
  flushSoon();
  for (const listener of listeners) listener(collection, record);
}

/** Stores a record from Drive without sending it back. */
export function saveFromSync(collection, record) {
  if (collection === 'students') studentCopies.set(record.id, copyOf(record));
  memory[collection].set(record.id, collection === 'exercises' ? withSeedTags(record) : record);
  queue(collection, record);
  flushSoon();
}

export function replaceEvents(events) {
  for (const id of memory.events.keys()) {
    if (!events.some((e) => e.id === id)) {
      memory.events.delete(id);
      pending.set(`events|${id}`, { store: 'events', record: { id }, remove: true });
    }
  }
  for (const event of events) {
    memory.events.set(event.id, event);
    queue('events', event);
  }
  flushSoon();
}

export async function readOutbox() {
  await flush();
  return readAll('outbox');
}

export function clearOutbox(items) {
  for (const item of items) {
    // A newer edit made during the sync stays queued for the next one.
    const record = get(item.collection, item.recordId);
    if (record && (record.updatedAt || 0) > item.at) continue;
    pending.set(`outbox|${item.id}`, { store: 'outbox', record: { id: item.id }, remove: true });
  }
  flushSoon();
}

/**
 * Sends this iPad's copies again (2026-11-26, v47): the cloud asks when one of its files went missing or was put back
 * from a backup. Only what `keep` allows (what the signed-in person may change) goes; the cloud keeps whichever copy
 * is newer, so sending again never undoes anything.
 */
export function requeueAll(keep = () => true) {
  let count = 0;
  for (const collection of ['students', 'exercises', 'sessions', 'plans', 'options', 'photos']) {
    for (const record of memory[collection].values()) {
      if (record.demo || !record.updatedAt || !keep(collection, record)) continue;
      queue('outbox', outboxItem(collection, record.id, Date.now()));
      count += 1;
    }
  }
  flushSoon();
  return count;
}

/** Removes a record from this device only. Used for demo data, which never reaches Drive. */
export function removeLocal(collection, id) {
  memory[collection].delete(id);
  if (collection === 'students') studentCopies.delete(id);
  pending.set(`${collection}|${id}`, { store: collection, record: { id }, remove: true });
  pending.set(`outbox|${collection}|${id}`, { store: 'outbox', record: { id: `${collection}|${id}` }, remove: true });
  flushSoon();
}

export function subscribe(listener) {
  listeners.add(listener);
}

/** The student's records that go and come back with them. Records deleted on their own earlier stay as they are. */
function recordsOf(studentId) {
  const list = [];
  for (const session of memory.sessions.values()) if (session.studentId === studentId) list.push(['sessions', session]);
  // Each teacher's plan (2026-11-26); the plan from before colleagues is named by the student.
  for (const plan of memory.plans.values()) if (plan.id === studentId || plan.studentId === studentId) list.push(['plans', plan]);
  // Who taught them (2026-11-24); the record holds only the two ids.
  for (const option of memory.options.values()) if (option.type === 'assign' && option.studentId === studentId) list.push(['options', option]);
  for (const photo of memory.photos.values()) if (photo.studentId === studentId) list.push(['photos', photo]);
  return list;
}

/**
 * Deletes a student with every record of theirs (2026-11-25: only an admin, and it can be undone for 30 days).
 * Nothing is cleared yet: each record is marked with the student and the moment, so restoreStudent brings back
 * exactly these. Photos on Drive go to its trash on the next sync, which keeps them 30 days too.
 */
export function deleteStudent(studentId, by = '') {
  const student = memory.students.get(studentId);
  if (!student || student.deleted) return 0;
  const at = Date.now();
  for (const [collection, record] of recordsOf(studentId)) {
    if (!record.deleted) save(collection, { ...record, deleted: true, deletedWith: studentId, deletedAt: at });
  }
  save('students', { ...student, deleted: true, deletedWith: studentId, deletedAt: at, deletedBy: by });
  return at;
}

/** Brings a deleted student back with what was deleted with them. The cloud takes it only with restoredAt. */
export function restoreStudent(studentId) {
  const student = memory.students.get(studentId);
  if (!student?.deleted || student.deletedWith !== studentId || student.purged) return false;
  const at = student.deletedAt;
  // Later than the deletion even when this iPad's clock runs behind the one that deleted.
  const restoredAt = Math.max(Date.now(), (at || 0) + 1);
  const back = (collection, record) => {
    const { deletedWith, deletedAt, deletedBy, ...rest } = record;
    save(collection, { ...rest, deleted: false, restoredAt });
  };
  for (const [collection, record] of recordsOf(studentId)) {
    if (record.deleted && record.deletedWith === studentId && record.deletedAt === at) back(collection, record);
  }
  back('students', student);
  return true;
}

/**
 * 30 days after a deletion its content is cleared on this iPad and, through the sync, everywhere. Only empty records
 * stay, so an iPad that was offline cannot bring the content back.
 */
export function purgeStudent(studentId) {
  const student = memory.students.get(studentId);
  if (!student?.deleted || student.deletedWith !== studentId || student.purged) return;
  const at = student.deletedAt;
  for (const [collection, record] of recordsOf(studentId)) {
    if (record.deletedWith !== studentId || record.deletedAt !== at || record.purged || collection === 'options') continue;
    clearRecord(collection, record, studentId, at);
  }
  save('students', { id: student.id, deleted: true, deletedWith: studentId, deletedAt: at, purged: true, deletedBy: student.deletedBy || '' });
}

/** What is left of one class, plan or photo once its student is cleared. */
function clearRecord(collection, record, studentId, at) {
  const empty = (extra = {}) => ({ id: record.id, deleted: true, deletedWith: studentId, deletedAt: at, purged: true, ...extra });
  if (collection === 'sessions') save('sessions', empty({ studentId }));
  else if (collection === 'plans') save('plans', empty(record.studentId ? { studentId: record.studentId, staffId: record.staffId } : {}));
  else {
    // The Drive copy is in its trash already, or goes there on the next sync.
    save('photos', empty({ studentId, erased: true, driveId: record.driveId, driveTrashed: record.driveTrashed }));
    removePhotoBlob(record.id).catch(() => {});
  }
}

/**
 * A class, plan or photo saved on an iPad that had not heard of the deletion yet reaches the others after it. It goes
 * with the student: back on a restore, cleared with the rest; after the 30 days it is cleared on the next pass, once
 * the cloud has it as deleted. A record restored after the deletion is left alone, the student's restore is on its way.
 * `mayChange` leaves out what the person on this iPad may not change (another teacher's class): its own iPad, or an
 * admin's, hides it, so the cloud does not refuse this one again at every sync.
 */
export function followDeletions(mayChange = () => true) {
  for (const student of memory.students.values()) {
    if (!student.deleted || student.deletedWith !== student.id) continue;
    const at = student.deletedAt;
    for (const [collection, record] of recordsOf(student.id)) {
      if (record.purged) continue;
      if (!record.deleted) {
        if ((Number(record.restoredAt) || 0) <= (at || 0) && mayChange(collection, record)) save(collection, { ...record, deleted: true, deletedWith: student.id, deletedAt: at });
      } else if (student.purged && record.deletedWith === student.id && collection !== 'options') {
        clearRecord(collection, record, student.id, at);
      }
    }
  }
}

export function purgeExpired(now = Date.now(), mayChange = undefined) {
  followDeletions(mayChange);
  for (const student of dueForPurge([...memory.students.values()], now)) purgeStudent(student.id);
}

function readOne(name, id) {
  return new Promise((resolve, reject) => {
    const request = db.transaction(name).objectStore(name).get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

/** iOS can close the database while the app is in the background, so reopen once. */
async function readHandoutRecord(name, id) {
  try {
    return await readOne(name, id);
  } catch {
    db = await open();
    return readOne(name, id);
  }
}

/** The image file of one photo on this device, or null when only Drive has it. */
export async function readPhotoBlob(id) {
  return (await readHandoutRecord(PHOTO_STORE, id))?.blob || null;
}

function writePhotoBlob(id, blob, remove = false) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(PHOTO_STORE, 'readwrite');
    if (remove) tx.objectStore(PHOTO_STORE).delete(id);
    else tx.objectStore(PHOTO_STORE).put({ id, blob });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Written at once, not batched: a photo must be on disk before it is shown as taken. */
export async function savePhotoBlob(id, blob) {
  try {
    await writePhotoBlob(id, blob);
  } catch (error) {
    if (error?.name === 'QuotaExceededError') throw error;
    db = await open();
    await writePhotoBlob(id, blob);
  }
}

export async function removePhotoBlob(id) {
  try {
    await writePhotoBlob(id, null, true);
  } catch {
    db = await open();
    await writePhotoBlob(id, null, true);
  }
}

export function readHandout(id) {
  return readHandoutRecord('handout', id);
}

export function readHandoutImage(id) {
  return readHandoutRecord('handoutImages', id);
}

/** Stores a whole handout file in one step, so a failed import leaves the old data as it was. */
export async function saveHandout(file) {
  try {
    await writeHandout(file);
  } catch (error) {
    if (error?.name === 'QuotaExceededError') throw error;
    // iOS can close the database while the app is in the background, so reopen once.
    db = await open();
    await writeHandout(file);
  }
}

function writeHandout(file) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(HANDOUT_STORES, 'readwrite');
    const entries = tx.objectStore('handout');
    const images = tx.objectStore('handoutImages');
    for (const { id, pages, springs, reps, noteImages, chartImage, fields } of file.exercises) {
      entries.put({ id, source: file.source, pages, springs, reps, noteImages, chartImage, fields });
    }
    for (const [id, data] of Object.entries(file.images)) images.put({ id, data });
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export function exportAll() {
  const data = {};
  for (const name of COLLECTIONS) data[name] = [...memory[name].values()].filter((r) => name !== 'exercises' || r.updatedAt);
  return data;
}

export async function wipeAll() {
  await flush();
  const tx = db.transaction(STORES, 'readwrite');
  for (const name of STORES) tx.objectStore(name).clear();
  await new Promise((resolve, reject) => {
    tx.oncomplete = resolve;
    tx.onerror = () => reject(tx.error);
  });
}
