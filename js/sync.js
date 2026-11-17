// Talks to the Apps Script on the teacher's Google account. Runs only in the background.
import * as store from './store.js';
import { mergeRecords, fileForRecord, collectionForFile, parseBookingTitle, isUnreadableBooking, dateKey, chosenCalendars, mergeCalendarEvents, parsePlainTitle, photoFileName, mediaFolderName, mediaExtension, isVideo } from './core.js';

const statusListeners = new Set();
let status = { state: 'idle', message: '' };
let running = false;
let again = false;
let timer = null;
const REQUEST_TIMEOUT_MS = 60000;
// A minute of video is about 11 MB; on classroom Wi-Fi that can take a while each way.
const VIDEO_TIMEOUT_MS = 240000;
// While the app stays open, the calendar is read again this often, so a booking moved elsewhere shows up by itself.
const CALENDAR_REFRESH_MS = 5 * 60 * 1000;
const calendarListeners = new Set();
let calendarSignature = null;

/** Called after a calendar read that changed a booking. */
export function onCalendarChange(listener) {
  calendarListeners.add(listener);
}

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

// Photos (2026-11-17). Their small records travel with the other data; the images go one by one.
// An Apps Script deployed before photos existed answers 'unknown action': photos then wait on the iPad.
let photoProblem = '';

export function photoUploadProblem() {
  return photoProblem;
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] || '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function syncPhotos() {
  photoProblem = '';
  const isDemo = (photo) => store.get('students', photo.studentId)?.demo;
  for (const photo of store.all('photos')) {
    if (photo.driveId || isDemo(photo)) continue;
    const blob = await store.readPhotoBlob(photo.id);
    if (!blob) continue;
    const student = store.get('students', photo.studentId);
    try {
      // Named and filed by student, so the Drive folder needs no sorting by hand (2026-11-17).
      const data = await call('media', {
        id: photo.id,
        name: photoFileName(photo, student?.name || ''),
        folder: mediaFolderName(student),
        ext: mediaExtension(photo),
        data: await blobToBase64(blob),
      }, isVideo(photo) ? VIDEO_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
      store.save('photos', { ...store.get('photos', photo.id), driveId: data.fileId });
    } catch (error) {
      photoProblem = /unknown action/.test(error.message) ? '照片影片還沒上傳：雲端連線程式要更新（照設定步驟重新部署）' : `照片影片上傳失敗：${error.message}`;
      return;
    }
  }
  // Deleted photos go to the Drive trash; undo brings them back.
  for (const record of store.allIncludingDeleted('photos')) {
    if (!record.driveId || !!record.deleted === !!record.driveTrashed) continue;
    try {
      await call('photoTrash', { fileId: record.driveId, trashed: !!record.deleted });
      store.save('photos', { ...store.get('photos', record.id), driveTrashed: !!record.deleted });
    } catch (error) {
      photoProblem = `照片影片刪除還沒同步：${error.message}`;
      return;
    }
  }
}

/** The image of a photo: from this iPad, or fetched once from Drive and kept here. */
export async function photoBlob(photo) {
  const local = await store.readPhotoBlob(photo.id);
  if (local || !photo.driveId || !isConnected()) return local;
  const data = await call('photoGet', { fileId: photo.driveId }, isVideo(photo) ? VIDEO_TIMEOUT_MS : REQUEST_TIMEOUT_MS);
  const bytes = Uint8Array.from(atob(data.data), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: isVideo(photo) ? (photo.mime || 'video/mp4').split(';')[0] : 'image/jpeg' });
  await store.savePhotoBlob(photo.id, blob);
  return blob;
}

async function syncCalendar() {
  const ids = chosenCalendars(store.getMeta('calendarIds'), store.getMeta('calendarId'));
  if (!ids.length) return;
  const today = dateKey();
  const { teacher } = connection();
  // All or nothing: if one calendar cannot be read, the bookings already shown stay instead of half vanishing.
  // Each calendar is Pilates, strength, or the shared company one whose titles carry the teacher's name (2026-11-12).
  const kinds = store.getMeta('calendarKinds', {}) || {};
  const lists = await Promise.all(ids.map((calendarId) => {
    const kind = kinds[calendarId] || 'shared';
    return call('events', { calendarId, from: today, all: kind !== 'shared' })
      .then((data) => data.events.map((event) => ({ ...event, calendarKind: kind })));
  }));
  const events = mergeCalendarEvents(lists);
  const signature = JSON.stringify(events.map((e) => [e.id, e.date, e.time, e.title]));
  const changed = calendarSignature !== null && signature !== calendarSignature;
  calendarSignature = signature;
  store.replaceEvents(events.map((event) => {
    const own = event.calendarKind !== 'shared';
    // An old-style title still reads the same way on any calendar; otherwise the title is the student's name.
    const formal = parseBookingTitle(event.title, teacher);
    const parsed = formal || (own ? parsePlainTitle(event.title) : null);
    return {
      id: event.id,
      date: event.date,
      time: event.time,
      student: parsed ? parsed.student : '',
      birthday: parsed?.birthday || '',
      kind: own ? event.calendarKind : parsed ? parsed.kind : 'strength',
      unreadable: own ? !parsed : isUnreadableBooking(event.title, teacher),
      title: parsed ? '' : event.title,
    };
  }));
  if (changed) for (const listener of calendarListeners) listener();
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
    await syncPhotos();
    // A photo that just got its Drive copy sends its record in the same round.
    if (store.all('photos').some((p) => p.driveId) && (await store.readOutbox()).some((item) => item.collection === 'photos')) await syncRecords();
    await syncCalendar();
    store.setMeta('lastSyncAt', Date.now());
    const now = new Date();
    setStatus(photoProblem ? 'error' : 'ok', photoProblem || `已同步 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
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

/**
 * Sends one record now and says whether it reached Drive (2026-11-16, editing a past class).
 * 'uploaded', 'pending' (still queued, e.g. the round failed), 'offline', or 'local' when no Google account is paired.
 */
export async function uploadRecord(collection, id) {
  if (!isConnected()) return 'local';
  if (!navigator.onLine) return 'offline';
  await store.flush();
  // Wait for a round already running, then run one that includes this record.
  for (let waited = 0; running && waited < REQUEST_TIMEOUT_MS * 2; waited += 200) await new Promise((r) => setTimeout(r, 200));
  await syncNow();
  return (await isWaiting(collection, id)) ? 'pending' : 'uploaded';
}

/** Whether a record still waits in the queue for Drive. */
export async function isWaiting(collection, id) {
  const outbox = await store.readOutbox();
  return outbox.some((item) => item.collection === collection && item.recordId === id);
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
  setInterval(() => {
    if (document.visibilityState === 'visible') syncNow();
  }, CALENDAR_REFRESH_MS);
  syncNow();
}
