// Keeps every record in memory for instant reads and writes through to IndexedDB in the background.
import { SEED_EXERCISES, REMOVED_SEEDS } from './seed.js';

const REMOVED_IDS = new Set(REMOVED_SEEDS.map((exercise) => exercise.id));
const DB_NAME = 'training-record';
const COLLECTIONS = ['students', 'exercises', 'sessions', 'plans', 'events', 'options'];
// Handout text and images stay on this device: never in memory, never synced.
const HANDOUT_STORES = ['handout', 'handoutImages'];
const STORES = [...COLLECTIONS, 'outbox', 'meta', ...HANDOUT_STORES];

let db = null;
const memory = { students: new Map(), exercises: new Map(), sessions: new Map(), plans: new Map(), events: new Map(), options: new Map() };
const meta = new Map();
const listeners = new Set();
const saveErrorListeners = new Set();
const pending = new Map();
let flushTimer = null;

export function onSaveError(listener) {
  saveErrorListeners.add(listener);
}

function open() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 3);
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
    for (const record of await readAll(name)) memory[name].set(record.id, record);
  }));
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

export function all(collection) {
  // A removed starter exercise stays gone even if this device or Drive holds an older copy of it.
  return [...memory[collection].values()].filter((r) => !r.deleted && !(collection === 'exercises' && REMOVED_IDS.has(r.id)));
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
  record.updatedAt = Date.now();
  memory[collection].set(record.id, record);
  queue(collection, JSON.parse(JSON.stringify(record)));
  if (collection !== 'events') queue('outbox', { id: `${collection}|${record.id}`, collection, recordId: record.id, at: record.updatedAt });
  flushSoon();
  for (const listener of listeners) listener(collection, record);
}

/** Stores a record from Drive without sending it back. */
export function saveFromSync(collection, record) {
  memory[collection].set(record.id, record);
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

/** Removes a record from this device only. Used for demo data, which never reaches Drive. */
export function removeLocal(collection, id) {
  memory[collection].delete(id);
  pending.set(`${collection}|${id}`, { store: collection, record: { id }, remove: true });
  pending.set(`outbox|${collection}|${id}`, { store: 'outbox', record: { id: `${collection}|${id}` }, remove: true });
  flushSoon();
}

export function subscribe(listener) {
  listeners.add(listener);
}

/** Erases a student everywhere: other devices and Drive receive empty records in place of the content. */
export function eraseStudent(studentId) {
  const stamp = (collection, record) => {
    const erased = { id: record.id, deleted: true };
    if (record.studentId) erased.studentId = record.studentId;
    save(collection, erased);
  };
  for (const session of memory.sessions.values()) {
    if (session.studentId === studentId) stamp('sessions', session);
  }
  if (memory.plans.has(studentId)) stamp('plans', memory.plans.get(studentId));
  if (memory.students.has(studentId)) stamp('students', memory.students.get(studentId));
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
