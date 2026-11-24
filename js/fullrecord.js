// Saves each finished class as a full-record PDF in the company Drive (2026-11-25, round-5 form):
// 訓練紀錄 App 資料／完整紀錄／學生姓名／2026-11-24_王小明_第4堂.pdf. Runs by itself after each sync, one class at a
// time, so a long list of earlier classes fills in without holding up the records. Drive keeps an index of what it
// has, so a second device never saves the same class twice.
import * as store from './store.js';
import { call, isConnected, onStatus } from './sync.js';
import { dateKey, nextClassInfo, mediaFolderName } from './core.js';
import { bodyMap } from './bodymap.js';
import { buildRecordHtml, recordFileName, recordJobs, nextAfter, classPainScores, profilePainScores } from './recordhtml.js';

let running = false;
let again = false;
let indexLoaded = false;
// What the settings page shows: how many classes still wait, and why.
let state = { waiting: 0, saved: 0, scriptOld: false, problem: '', busy: false, folderUrl: '' };
const listeners = new Set();

export function recordStatus() {
  return state;
}

export function onRecordStatus(listener) {
  listeners.add(listener);
  listener(state);
  return () => listeners.delete(listener);
}

/** One line for the settings page. */
export function recordStatusText(s = state) {
  if (s.scriptOld) return `完整紀錄 PDF：要等雲端連線程式更新，更新後會自動存${s.waiting ? `（${s.waiting} 堂）` : ''}。`;
  if (s.problem) return `${s.problem}。還有 ${s.waiting} 堂，下次同步再試。`;
  if (s.waiting && s.busy) return `完整紀錄 PDF：正在存，還有 ${s.waiting} 堂。`;
  if (s.waiting) return `完整紀錄 PDF：還有 ${s.waiting} 堂，連上網路會自動存。`;
  if (s.saved) return `完整紀錄 PDF：都存好了，共 ${s.saved} 堂。`;
  return '完整紀錄 PDF：上完課會自動存到公司雲端。';
}

function setState(patch) {
  state = { ...state, ...patch };
  for (const listener of listeners) listener(state);
}

function index() {
  return store.getMeta('recordIndex', {}) || {};
}

function savedCount(map) {
  return Object.keys(map).length;
}

function pendingJobs() {
  return recordJobs(store.all('sessions'), store.all('students'), index(), dateKey());
}

/** Draws the two body figures with the pain scores written on them, as a PNG for the PDF. */
export async function painMapPng(scores) {
  if (!Object.keys(scores).length) return '';
  const { el, update } = bodyMap(null, { readOnly: true });
  update(scores, null);
  const figures = [...el.querySelectorAll('svg.body-figure')];
  const captions = [...el.querySelectorAll('.body-caption')].map((c) => c.textContent);
  const W = 180;
  const H = 424;
  const GAP = 24;
  const TOP = 28;
  const NS = 'http://www.w3.org/2000/svg';
  const outer = document.createElementNS(NS, 'svg');
  outer.setAttribute('xmlns', NS);
  outer.setAttribute('viewBox', `0 0 ${W * 2 + GAP} ${H + TOP}`);
  outer.setAttribute('width', String((W * 2 + GAP) * 2));
  outer.setAttribute('height', String((H + TOP) * 2));
  const style = document.createElementNS(NS, 'style');
  // Fixed colours: the page's theme colours do not exist inside a picture. Marked parts are a light wine with a dark
  // outline, so they also read in black-and-white print.
  style.textContent = `
    .body-part{fill:#F1EDDD;stroke:#8C877C;stroke-width:1.2}
    .body-part.is-on{fill:#E3B3B8;stroke:#420C14;stroke-width:2}
    .body-score{font:700 17px sans-serif;fill:#020300}
    .body-side{font:500 12px sans-serif;fill:#59544B}
    .body-eye{fill:#8C877C}
    .cap{font:700 14px sans-serif;fill:#020300}`;
  outer.append(style);
  figures.forEach((svg, i) => {
    const x = i * (W + GAP);
    const caption = document.createElementNS(NS, 'text');
    caption.setAttribute('x', String(x + W / 2));
    caption.setAttribute('y', '18');
    caption.setAttribute('text-anchor', 'middle');
    caption.setAttribute('class', 'cap');
    caption.textContent = captions[i] || '';
    const copy = svg.cloneNode(true);
    copy.setAttribute('x', String(x));
    copy.setAttribute('y', String(TOP));
    copy.setAttribute('width', String(W));
    copy.setAttribute('height', String(H));
    outer.append(caption, copy);
  });
  const text = new XMLSerializer().serializeToString(outer);
  const url = URL.createObjectURL(new Blob([text], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error('人體圖畫不出來'));
      image.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = (W * 2 + GAP) * 2;
    canvas.height = (H + TOP) * 2;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/png');
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The page for one class, with the student's profile as it is now (the class day, for a class just finished). */
export async function recordPage(session, kind, savedAt = Date.now()) {
  const student = store.get('students', session.studentId);
  const sessions = store.all('sessions');
  const upcoming = nextClassInfo(student, store.all('events'), dateKey(), store.all('students'));
  const apparatus = {};
  for (const row of session.rows || []) {
    if (row.kind === 'pilates' && row.exerciseId) apparatus[row.exerciseId] = store.get('exercises', row.exerciseId)?.group || '';
  }
  const [dayPain, classPain, profilePain] = await Promise.all([
    painMapPng(profilePainScores(session.dayPain)),
    painMapPng(classPainScores(session)),
    painMapPng(profilePainScores(student.pain)),
  ]);
  return buildRecordHtml({
    student,
    session,
    partnerName: session.pairWith ? store.get('students', session.pairWith)?.name || '' : '',
    coachName: store.getMeta('connection')?.teacher || '',
    coachSignature: store.getMeta('coachSignature'),
    next: nextAfter(session, sessions, upcoming.date ? upcoming : null),
    images: { dayPain, classPain, profilePain },
    kind,
    savedAt,
    late: session.date !== dateKey(new Date(savedAt)),
    apparatus,
  });
}

async function refreshIndex() {
  const data = await call('records');
  store.setMeta('recordIndex', data.index || {});
  indexLoaded = true;
  setState({ folderUrl: data.folderUrl || '', scriptOld: false });
}

/** Saves every class still waiting. Calls made while it runs queue one more round. */
export async function saveFullRecords() {
  if (!isConnected() || !navigator.onLine) {
    setState({ waiting: pendingJobs().length, saved: savedCount(index()), busy: false });
    return;
  }
  if (running) { again = true; return; }
  running = true;
  try {
    // Drive's list is read once per opening, and again whenever something waits, so a class another device saved
    // is not saved twice and a change is filed the right way (same day: redone; later: kept next to the old one).
    if (!indexLoaded || pendingJobs().length) await refreshIndex();
    let jobs = pendingJobs();
    setState({ waiting: jobs.length, saved: savedCount(index()), busy: jobs.length > 0, problem: '' });
    // Each class is tried once per round, so an answer that does not settle it can never loop.
    const tried = new Set();
    while (jobs.some((job) => !tried.has(job.session.id))) {
      const { session, kind } = jobs.find((job) => !tried.has(job.session.id));
      tried.add(session.id);
      const student = store.get('students', session.studentId);
      const savedAt = Date.now();
      const editedAt = kind === 'edit' ? Date.parse(session.editedAt || '') || session.updatedAt : null;
      const data = await call('record', {
        sessionId: session.id,
        at: session.updatedAt || 0,
        kind,
        // Named like the student's photo folder (王小明, or 王小明 0828 for namesakes).
        folder: mediaFolderName(student),
        name: recordFileName(session, student, editedAt),
        html: await recordPage(session, kind, savedAt),
      });
      store.setMeta('recordIndex', { ...index(), [session.id]: data.entries || [] });
      jobs = pendingJobs();
      setState({ waiting: jobs.length, saved: savedCount(index()) });
    }
    setState({ busy: false });
  } catch (error) {
    const old = /unknown action/.test(error.message);
    setState({ busy: false, scriptOld: old, problem: old ? '' : `完整紀錄 PDF 還沒存好：${error.message}`, waiting: pendingJobs().length });
  } finally {
    running = false;
    if (again) {
      again = false;
      saveFullRecords();
    }
  }
}

let timer = null;

/** Starts after every finished sync round; a class finished a minute ago is picked up by the next one. */
export function startFullRecords() {
  onStatus((s) => {
    if (s.state === 'ok' || s.state === 'partial') {
      clearTimeout(timer);
      timer = setTimeout(saveFullRecords, 1500);
    }
  });
  // A class waits a minute after its last change; check again then, even if nothing else syncs.
  setInterval(() => {
    if (document.visibilityState === 'visible' && !running && pendingJobs().length) saveFullRecords();
  }, 70 * 1000);
}
