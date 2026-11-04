// Talks to the Apps Script on the teacher's Google account. Runs only in the background.
import * as store from './store.js';
import { mergeRecords, fileForRecord, collectionForFile, parseBookingTitle, isUnreadableBooking, dateKey } from './core.js';

const statusListeners = new Set();
let status = { state: 'idle', message: '' };
let running = false;
let again = false;
let timer = null;
const REQUEST_TIMEOUT_MS = 60000;

export function currentStatus() {
  return status;
}

export function onStatus(listener) {
  statusListeners.add(listener);
  listener(status);
}

function setStatus(state, message) {
  status = { state, message };
  for (const listener of statusListeners) listener(status);
}

export function connection() {
  return store.getMeta('connection');
}

export function isConnected() {
  return !!connection();
}

/** Reads the code that showPairingCode printed. */
export function parsePairingCode(code) {
  const cleaned = String(code).trim().replace(/^.*?([A-Za-z0-9_-]{40,}={0,2}).*$/s, '$1');
  let value;
  try {
    const binary = atob(cleaned.replace(/-/g, '+').replace(/_/g, '/'));
    const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
    value = JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new Error('配對碼格式不對');
  }
  if (!value?.url || !value?.key) throw new Error('配對碼格式不對');
  return value;
}

export async function call(action, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const conn = connection();
  if (!conn) throw new Error('尚未連線 Google');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  try {
    response = await fetch(conn.url, {
      method: 'POST',
      // text/plain keeps this a simple request, which Apps Script can answer across origins.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ key: conn.key, action, ...payload }),
      redirect: 'follow',
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    throw new Error(controller.signal.aborted ? 'Google 太久沒回應' : '連不上 Google，請確認網路，或部署時「誰可以存取」是否選「所有人」');
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Google 回應錯誤（${response.status}）`);
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    throw new Error('Google 沒有回傳資料，請確認部署時「誰可以存取」是否選「所有人」');
  }
  if (!data.ok) throw new Error(data.error === 'unauthorized' ? '配對碼已失效，請重新配對' : data.error);
  return data;
}

async function syncRecords() {
  const outbox = await store.readOutbox();
  const push = {};
  for (const item of outbox) {
    const record = store.get(item.collection, item.recordId);
    if (!record || record.demo) continue;
    const file = fileForRecord(item.collection, record);
    (push[file] = push[file] || []).push(record);
  }
  const since = store.getMeta('fileVersions', {});
  const data = await call('sync', { push, since });
  store.clearOutbox(outbox);
  for (const file of Object.keys(data.pull || {})) {
    const collection = collectionForFile(file);
    const existing = data.pull[file].map((r) => store.get(collection, r.id)).filter(Boolean);
    const { changed } = mergeRecords(existing, data.pull[file]);
    for (const record of changed) store.saveFromSync(collection, record);
  }
  store.setMeta('fileVersions', data.versions || {});
}

async function syncCalendar() {
  const calendarId = store.getMeta('calendarId');
  if (!calendarId) return;
  const today = dateKey();
  const { teacher } = connection();
  const { events } = await call('events', { calendarId, from: today });
  store.replaceEvents(events.map((event) => {
    const parsed = parseBookingTitle(event.title, teacher);
    return {
      id: event.id,
      date: event.date,
      time: event.time,
      student: parsed ? parsed.student : '',
      kind: parsed ? parsed.kind : 'strength',
      unreadable: isUnreadableBooking(event.title, teacher),
      title: parsed ? '' : event.title,
    };
  }));
}

/** Runs one round. Calls made during a round queue exactly one more. */
export async function syncNow() {
  if (!isConnected()) return;
  if (running) { again = true; return; }
  if (!navigator.onLine) {
    setStatus('offline', '離線中，紀錄已存在這台裝置');
    return;
  }
  running = true;
  setStatus('syncing', '同步中');
  try {
    await syncRecords();
    await syncCalendar();
    store.setMeta('lastSyncAt', Date.now());
    const now = new Date();
    setStatus('ok', `已同步 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
  } catch (error) {
    setStatus('error', `同步失敗：${error.message}。紀錄仍在這台裝置。`);
  } finally {
    running = false;
    if (again) {
      again = false;
      syncNow();
    }
  }
}

export function syncSoon(delay = 5000) {
  clearTimeout(timer);
  timer = setTimeout(syncNow, delay);
}

export function startAutoSync() {
  store.subscribe((collection) => {
    if (collection !== 'events') syncSoon();
  });
  window.addEventListener('online', () => syncNow());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncNow();
    else store.flush();
  });
  window.addEventListener('pagehide', () => store.flush());
  syncNow();
}
