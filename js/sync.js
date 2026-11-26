// Talks to the Apps Script on the teacher's Google account. Runs only in the background.
import * as store from './store.js';
import { mergeRecords, mergeStudent, sameStudent, fileForRecord, collectionForFile, bookingsFromEvent, keepSampleBookings, dateKey, chosenCalendars, mergeCalendarEvents, photoFileName, mediaFolderName, mediaExtension, isVideo, decodePairing, sendsNow, waitingSummary, othersWaitingText, staffList, newId, APP_VERSION, LATE_UPLOAD_MS } from './core.js';
import { currentLogin, updateLogin, forgetLogin, loginRequiredReason } from './identity.js';

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

/**
 * Reads the code that showPairingCode printed, or the whole letter an admin sent a colleague (2026-11-25), which also
 * carries that colleague's login as `staff`.
 */
export function parsePairingCode(code) {
  const value = decodePairing(code);
  if (!value) throw new Error('配對碼格式不對');
  return value;
}

// Called when the cloud stops accepting this device's login (disabled, a new code, or colleagues just started).
const loginLostListeners = new Set();
export function onLoginLost(listener) {
  loginLostListeners.add(listener);
}

async function post(conn, body, timeoutMs) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let response;
  let text;
  try {
    response = await fetch(conn.url, {
      method: 'POST',
      // text/plain keeps this a simple request, which Apps Script can answer across origins.
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(body),
      redirect: 'follow',
      signal: controller.signal,
    });
    text = await response.text();
  } catch (error) {
    const offline = new Error(controller.signal.aborted ? 'Google 太久沒回應' : '連不上 Google，請確認網路，或部署時「誰可以存取」是否選「所有人」');
    offline.network = true;
    throw offline;
  } finally {
    clearTimeout(timeout);
  }
  if (!response.ok) throw new Error(`Google 回應錯誤（${response.status}）`);
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('Google 沒有回傳資料，請確認部署時「誰可以存取」是否選「所有人」');
  }
}

/**
 * One request to the Apps Script. Once colleagues share the app every request carries the signed-in colleague's
 * code, and the script refuses a missing, wrong or disabled one (2026-11-25, part 2).
 */
export async function call(action, payload = {}, timeoutMs = REQUEST_TIMEOUT_MS) {
  const conn = connection();
  if (!conn) throw new Error('尚未連線 Google');
  const login = currentLogin();
  const send = (code) => post(conn, { key: conn.key, action, ...payload, ...(login && code ? { staff: { id: login.id, code } } : {}) }, timeoutMs);
  let data = await send(login?.code);
  // A new code of one's own that has not reached the cloud yet, or reached it before this device knew: try the other.
  if (!data.ok && data.error === 'login' && login?.next) {
    const retry = await send(login.next);
    if (retry.ok) updateLogin({ code: login.next, next: null });
    data = retry;
  }
  if (data.ok) {
    if (!login && loginRequiredReason() && action !== 'ping') store.setMeta('loginRequired', null);
    return data;
  }
  if (data.error === 'login') {
    const error = new Error(LOGIN_LOST[data.reason] || LOGIN_LOST.missing);
    error.login = data.reason || 'missing';
    // The login screen itself only learns the answer; anything else means this device must sign in again.
    if (action !== 'login') {
      // Keep the first reason (say, a new code) rather than the plain "sign in" of a later request without a login.
      if (login || !loginRequiredReason()) forgetLogin(error.login);
      for (const listener of loginLostListeners) listener(error.login);
    }
    throw error;
  }
  throw new Error(data.error === 'unauthorized' ? '配對碼已失效，請重新配對' : data.error);
}

const LOGIN_LOST = {
  missing: '要輸入登入碼才能同步',
  unknown: '登入碼已經換新，請輸入新的登入碼',
  disabled: '這個登入碼已經停用，請找管理者',
  format: '登入碼是 8 個英文字母和數字',
};

// At most this many records go in one request; the rest follow in the next (a cloud file that went missing makes an
// iPad send all it has again).
const PUSH_LIMIT = 400;
const MAX_ROUNDS = 30;

// What the signed-in person may send again when the cloud asks (main.js sets it from team.js, which imports this file).
let resendFilter = () => true;
export function setResendFilter(filter) {
  resendFilter = filter;
}

// Cloud files that could not be read in the last round; what was meant for them waits here.
let brokenFiles = [];

// What waits on this iPad for the cloud (2026-11-26, v47): own records and photos, and records someone else left on
// a shared iPad, which wait for them to sign in here again.
let waiting = { mine: 0, others: {}, oldest: 0, late: false, photos: 0 };
const waitingListeners = new Set();

export function waitingNow() {
  return waiting;
}

export function onWaitingChange(listener) {
  waitingListeners.add(listener);
  return () => waitingListeners.delete(listener);
}

/** Queued changes that still have something to send (demo data and records gone from this iPad never go). */
function sendable(outbox) {
  return outbox.filter((item) => {
    const record = store.get(item.collection, item.recordId);
    return record && !record.demo;
  });
}

/** Photos taken here whose image has not reached Drive: [{ at }]. */
async function photosOnlyHere() {
  const left = [];
  for (const photo of store.all('photos')) {
    if (photo.driveId || store.get('students', photo.studentId)?.demo) continue;
    if (await store.readPhotoBlob(photo.id)) left.push({ at: photo.takenAt || photo.updatedAt || Date.now() });
  }
  return left;
}

/** Counts what waits here now and tells whoever shows it. */
export async function countWaiting() {
  const items = sendable(await store.readOutbox());
  const summary = waitingSummary(items, currentLogin()?.id || '');
  const photos = await photosOnlyHere();
  const now = Date.now();
  const oldPhoto = photos.some((photo) => now - photo.at >= LATE_UPLOAD_MS);
  const next = { ...summary, photos: photos.length, late: summary.late || oldPhoto,
    oldest: Math.min(summary.oldest || now, ...photos.map((photo) => photo.at)) };
  waiting = next;
  for (const listener of waitingListeners) listener(next);
  return next;
}

/** Everything still on this iPad only, whoever left it: what a sign-out or disconnect would leave behind. */
export function waitingTotal(state = waiting) {
  return state.mine + Object.values(state.others || {}).reduce((sum, n) => sum + n, 0);
}

function deviceId() {
  let id = store.getMeta('deviceId', null);
  if (!id) {
    id = newId('dv');
    store.setMeta('deviceId', id);
  }
  return id;
}

/** One round of records. Returns true when more of one's own wait for another round. */
async function syncRecords() {
  const outbox = await store.readOutbox();
  const signedIn = currentLogin();
  const me = signedIn?.id || '';
  const push = {};
  // Only the signed-in person's changes go up (2026-11-26): on a shared iPad, what the teacher before left waits for
  // them, because the cloud would refuse their classes under someone else's login and the changes would be lost.
  const skipped = outbox.filter((item) => !sendable([item]).length);
  const own = sendable(outbox).filter((item) => sendsNow(item, me));
  const sending = own.slice(0, PUSH_LIMIT);
  for (const item of sending) {
    const record = store.get(item.collection, item.recordId);
    const file = fileForRecord(item.collection, record);
    (push[file] = push[file] || []).push(record);
  }
  const since = store.getMeta('fileVersions', {}) || {};
  // Which students the signed-in colleague opened (2026-11-25), for the admin's access log. Only their own go up;
  // one left by someone else on a shared iPad waits for them, at most a week.
  const queued = store.getMeta('seenQueue', []) || [];
  const seen = signedIn ? queued.filter((s) => s.by === signedIn.id) : [];
  // What this iPad will still hold after this round, for the admin's colleague list (2026-11-26).
  const others = waitingSummary(sendable(outbox), me).others;
  const device = { id: deviceId(), version: APP_VERSION, records: own.length - sending.length, photos: (await photosOnlyHere()).length, others };
  const startedAt = Date.now();
  const pulledAt = store.getMeta('pulledAt', 0) || 0;
  const data = await call('sync', { push, since, device, ...(pulledAt ? { pulledAt } : {}), ...(seen.length ? { seen } : {}) });
  // A cloud file that cannot be read keeps what was meant for it on this iPad until an admin restores it (2026-11-26).
  const broken = new Set(data.broken || []);
  brokenFiles = [...broken];
  const kept = sending.filter((item) => broken.has(fileForRecord(item.collection, store.get(item.collection, item.recordId))));
  store.clearOutbox([...sending.filter((item) => !kept.includes(item)), ...skipped]);
  if (queued.length) {
    const sent = new Set(seen);
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    store.setMeta('seenQueue', (store.getMeta('seenQueue', []) || []).filter((s) => !sent.has(s) && s.at > weekAgo));
  }
  // A new code of one's own went up with this round, so the cloud checks the new one from now on.
  const login = currentLogin();
  if (login?.next && (push.options || []).some((r) => r.id === login.id && r.type === 'staff')) updateLogin({ code: login.next, next: null });
  for (const file of Object.keys(data.pull || {})) {
    const collection = collectionForFile(file);
    // Student details go field by field (2026-11-26): a field changed here meanwhile stays, the rest comes in.
    if (collection === 'students') {
      for (const record of data.pull[file]) {
        const local = store.get('students', record.id);
        const merged = mergeStudent(local, record);
        if (!local || !sameStudent(local, merged)) store.saveFromSync('students', merged);
      }
      continue;
    }
    const existing = data.pull[file].map((r) => store.get(collection, r.id)).filter(Boolean);
    const { changed } = mergeRecords(existing, data.pull[file]);
    for (const record of changed) store.saveFromSync(collection, record);
    // A photo cleared 30 days after its student was deleted leaves this iPad too.
    if (collection === 'photos') for (const record of changed) if (record.erased) store.removePhotoBlob(record.id).catch(() => {});
  }
  // What the cloud refused (say, a change to a student an admin deleted meanwhile) gives way to the cloud's copy,
  // so this iPad does not keep showing something no other one has.
  for (const file of Object.keys(data.rejected || {})) {
    const collection = collectionForFile(file);
    for (const record of data.rejected[file]) store.saveFromSync(collection, record);
  }
  store.setMeta('fileVersions', data.versions || {});
  store.setMeta('pulledAt', startedAt);
  if (data.devices) store.setMeta('teamDevices', data.devices);
  // A cloud file went missing, was put back from a backup, or the whole folder was replaced (2026-11-26): every iPad
  // sends its copies once more. Each request has its own id. A new iPad has just taken everything and sends nothing.
  let more = own.length > sending.length;
  if (data.resendId && data.resendId !== store.getMeta('resentId', null)) {
    store.setMeta('resentId', data.resendId);
    if (Object.keys(since).length && store.requeueAll(resendFilter)) more = true;
  }
  return more;
}

// Photos (2026-11-17). Their small records travel with the other data; the images go one by one.
// An Apps Script deployed before photos existed answers 'unknown action': photos then wait on the iPad.
let photoProblem = '';
// Photos kept on this iPad only because the Apps Script predates them (2026-11-23: the records themselves did sync,
// so this is a notice, not a red error that makes the teacher think her records are at risk).
let photosAwaitingScript = 0;

export function photoUploadProblem() {
  return photoProblem;
}

export function photosWaitingForScript() {
  return photosAwaitingScript;
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
  photosAwaitingScript = 0;
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
      if (/unknown action/.test(error.message)) {
        photosAwaitingScript = store.all('photos').filter((p) => !p.driveId && !isDemo(p)).length;
      } else {
        photoProblem = `照片影片上傳失敗：${error.message}。照片影片仍在這台 iPad`;
      }
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
  // One booking per student: a 1:2 class gives two, 可排 none (2026-11-24).
  // The sample bookings stay, so the sample students can still be tried while connected.
  store.replaceEvents(keepSampleBookings(events.flatMap((event) => bookingsFromEvent(event, teacher)), store.all('events')));
  if (changed) for (const listener of calendarListeners) listener();
}

/** Runs one round. Calls made during a round queue exactly one more. */
export async function syncNow() {
  if (!isConnected()) return;
  if (running) { again = true; return; }
  if (!navigator.onLine) {
    const left = await countWaiting();
    setStatus('offline', left.mine ? `離線中，${left.mine} 筆紀錄先存在這台 iPad，連上網路會自動上傳` : '離線中，紀錄已存在這台裝置');
    return;
  }
  // Signed out after the cloud refused the code: nothing gets through until someone signs in.
  if (!currentLogin() && loginRequiredReason()) {
    const left = waitingTotal(await countWaiting());
    setStatus('error', `要先輸入登入碼才能同步。${left ? `${left} 筆紀錄先存在這台 iPad。` : '紀錄仍在這台裝置。'}`);
    return;
  }
  running = true;
  setStatus('syncing', '同步中');
  try {
    for (let round = 0; (await syncRecords()) && round < MAX_ROUNDS; round += 1);
    await syncPhotos();
    // A photo that just got its Drive copy sends its record in the same round.
    if (store.all('photos').some((p) => p.driveId) && (await store.readOutbox()).some((item) => item.collection === 'photos' && sendsNow(item, currentLogin()?.id || ''))) await syncRecords();
    await syncCalendar();
    store.setMeta('lastSyncAt', Date.now());
    const now = new Date();
    const synced = `已同步 ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
    const left = await countWaiting();
    // Records a teacher before left on this shared iPad wait for them; say whose, so nobody thinks they are lost.
    const theirs = othersWaitingText(left.others, staffList(store.all('options')));
    const tail = theirs ? `。${theirs}` : '';
    if (brokenFiles.length) setStatus('error', `${synced}，但雲端有 ${brokenFiles.length} 個資料檔讀不出來，${left.mine} 筆紀錄先留在這台 iPad。請管理者照「設定步驟」還原備份${tail}`);
    else if (photoProblem) setStatus('error', `${synced}，紀錄都已上傳。${photoProblem}${tail}`);
    else if (photosAwaitingScript) setStatus('partial', `${synced}，紀錄都已上傳。照片影片 ${photosAwaitingScript} 個先存在這台 iPad，雲端連線程式更新後會自動補傳${tail}`);
    else setStatus('ok', `${synced}${tail}`);
  } catch (error) {
    const left = await countWaiting().catch(() => waiting);
    setStatus('error', `同步失敗：${error.message}。${left.mine ? `${left.mine} 筆紀錄還沒上傳，仍在這台 iPad。` : '紀錄仍在這台裝置。'}`);
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
