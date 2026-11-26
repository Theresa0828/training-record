// The in-class screen. A tap changes memory, updates only what it touched, and saves in the background.
import { h, button, holdButton, backButton, back, go, home, swap, openSheet, toast, dismissActionToast } from './dom.js';
import { uploadRecord, isWaiting, isConnected } from './sync.js';
import * as store from './store.js';
import {
  MAX_SETS, DEFAULT_TAGS, DEFAULT_PROPS, chooserOptions, painList, painText, painShort, setPainMap, setText, rowDetails, exerciseHistory, exerciseTrend, ASSIST_LEVELS, dateKey, newId, makeRow, makeSet,
  doneSessions, startingRows, isBpFlagged, expectedDigits, resolveStaleDraft, swapRow, commonSprings, nextClassNumber, classLabel, moveRow, setLoad, equipmentText, BAND, effortLevel,
  bookingFrom, partnerFor, pairClassNumber, planForPartner, rowsFromSession, classTeacherId, classCountFor, termFor, termFields, ownHistory, planIdFor,
  STATUS_DETAILS, statusDetail, statusText,
} from './core.js';
import { kindLabel } from './today.js';
import { exercisePicker, rememberSwaps } from './library.js';
import { handoutButton } from './handout.js';
import { classNumberSheet, nextDateControl, nextDateSheet, nextDateText } from './classinfo.js';
import { springEditor as springControls } from './spring.js';
import { apparatusOf, apparatusSprings } from './plan.js';
import { numberSheet } from './numpad.js';
import { icon } from './icons.js';
import { openPainSheet as openPainMap, painScores } from './painsheet.js';
import { trendChart } from './trend.js';
import { dragHandle } from './sortable.js';
import { swipeToDelete } from './swipe.js';
import { termRing } from './charts.js';
import { equipmentControl } from './equipment.js';
import { paramTile } from './param.js';
import { captureForExercise } from './photos.js';
import { rowMedia } from './core.js';
import { me, team, mine, myPlan, myPlanId, notMineClassView } from './team.js';

const SET_NAMES = ['一', '二', '三', '四', '五'];
const STATUS_FLAGS = [['pain', '疼痛'], ['sleep', '睡眠'], ['diet', '飲食'], ['mood', '心情']];
const PANEL_TABS = [['set', '重量次數'], ['feel', '感受與備註']];
const UNDO_LIMIT = 60;

/**
 * The other student of today's 1:2 class (two names in one calendar title, 2026-11-24), or null.
 * first tells whose name comes first in the title, so the two names keep their places when switching.
 */
export function todayPair(studentId) {
  const today = dateKey();
  const events = store.all('events');
  const students = store.all('students');
  const booking = bookingFrom(events, students, studentId, today);
  const partner = booking?.date === today ? partnerFor(events, students, booking) : null;
  return partner ? { partner, first: String(booking.id).endsWith('#1') } : null;
}

/**
 * The count runs by itself. Classes opened before it did get their number the first time they open.
 * A 1:2 class counts for both (2026-11-24): the partner's number today when they opened first, otherwise the larger
 * of the two counts, so a class one of them missed still counts for the pair.
 * A student who counts each teacher separately (2026-11-25 sixth form) gets this teacher's own number and term size.
 */
function giveClassNumber(session, student) {
  if (session.classNo) return;
  const staff = team();
  const teacher = classTeacherId(session, staff);
  const sameTeacher = (s) => classTeacherId(s, staff) === teacher;
  const history = doneSessions(store.all('sessions'), session.studentId).filter((s) => s.id !== session.id);
  let { no, size } = classCountFor(history, student, teacher, staff);
  const term = termFor(student, teacher, staff);
  const partner = session.pairWith ? store.get('students', session.pairWith) : null;
  if (partner) {
    const theirs = store.all('sessions').find((s) => s.studentId === partner.id && s.date === session.date && s.classNo && sameTeacher(s));
    ({ no, size } = theirs ? { no: theirs.classNo, size: theirs.packageSize }
      : pairClassNumber({ no, size }, classCountFor(doneSessions(store.all('sessions'), partner.id), partner, teacher, staff),
        !!term.classStart?.no, !!termFor(partner, teacher, staff).classStart?.no));
  }
  session.classNo = no;
  session.packageSize = size;
  // A number set by hand is for one class only; after that the count carries on from it.
  if (student && term.classStart) store.save('students', { ...student, ...termFields(student, teacher, staff, { classStart: null, packageSize: size }) });
}

/** Opens today's session for the student, or starts one from the plan or the last class. */
export function openSession(studentId, kind) {
  const today = dateKey();
  const student = store.get('students', studentId);
  // Another teacher's class today stays theirs (2026-11-26): this teacher opens their own.
  const existing = store.all('sessions').find((s) => s.studentId === studentId && s.date === today && mine(s));
  if (existing) {
    if (!existing.classNo) {
      giveClassNumber(existing, student);
      store.save('sessions', existing);
    }
    return existing;
  }
  // Opened from the overview, the kind comes from today's booking on this teacher's calendar (2026-11-26: a Pilates
  // teacher's first class with a strength student is Pilates).
  const booking = bookingFrom(store.all('events'), store.all('students'), studentId, today);
  kind = kind || (booking?.date === today ? booking.kind : '');
  // Each teacher starts from their own plan and their own last class (2026-11-26).
  const history = ownHistory(doneSessions(store.all('sessions'), studentId), team(), me(), kind);
  const plan = myPlan(studentId);
  const partner = todayPair(studentId)?.partner;
  let rows = startingRows(plan, history);
  // A new student in a 1:2 class starts from the partner's exercises today, so the list is not built twice.
  if (!rows.length && partner) {
    const theirs = store.all('sessions').find((s) => s.studentId === partner.id && s.date === today && mine(s));
    const partnerHistory = ownHistory(doneSessions(store.all('sessions'), partner.id), team(), me(), kind);
    rows = planForPartner(theirs ? rowsFromSession(theirs) : startingRows(store.get('plans', myPlanId(partner.id)), partnerHistory), history).rows;
  }
  const session = {
    id: newId('ses'),
    studentId,
    date: today,
    kind: kind || history[0]?.kind || 'strength',
    status: 'draft',
    rows,
    bpSys: null,
    bpDia: null,
    hr: null,
    flags: {},
    special: '',
    note: '',
    coachSigned: false,
    studentSignature: null,
    // A plan holding only this class's small goal is used up by this class too (2026-11-26).
    fromPlan: !!(plan && !plan.used && (plan.rows?.length || plan.classGoal)),
  };
  // 本堂小目標 (2026-11-26): written when planning, shown in class and on the student's report.
  if (plan && !plan.used && plan.classGoal?.trim()) session.classGoal = plan.classGoal.trim();
  if (student?.demo) session.demo = true;
  if (partner) session.pairWith = partner.id;
  // Who taught it (2026-11-24): the record's teacher and signature, and later who may change the class.
  if (me()) session.staffId = me().id;
  giveClassNumber(session, student);
  store.save('sessions', session);
  return session;
}

/** Called when a class ends. A plan is only used up here, so opening a student by mistake costs nothing. */
export function finishSession(session) {
  session.status = 'done';
  session.finishedAt = session.finishedAt || new Date().toISOString();
  store.save('sessions', session);
  const staff = team();
  const plan = store.get('plans', planIdFor(session.studentId, classTeacherId(session, staff), staff));
  if (session.fromPlan && plan && !plan.used) store.save('plans', { ...plan, used: true });
  rememberSwaps(session.rows, session.demo);
}

/** Closes classes left open on earlier days. */
export function settleOldDrafts() {
  const today = dateKey();
  for (const session of store.all('sessions')) {
    // Another teacher's open class is closed on their own iPad (2026-11-26).
    if (!mine(session)) continue;
    const action = resolveStaleDraft(session, today);
    if (action === 'finish') finishSession(session);
    if (action === 'discard') store.save('sessions', { ...session, deleted: true });
  }
}

export function recordView({ studentId, kind, sessionId }) {
  const student = store.get('students', studentId);
  // A class from an earlier day opens as a copy (2026-11-16). Nothing is stored or uploaded while it is changed;
  // 存檔上傳 stores it once and sends it at once, so Drive never gets half-finished versions.
  const original = sessionId ? store.get('sessions', sessionId) : null;
  const editing = !!original && original.date !== dateKey();
  if (editing && !mine(original)) return notMineClassView(original);
  let session = editing ? JSON.parse(JSON.stringify(original)) : openSession(studentId, kind);
  let dirty = false;
  let uploadState = 'clean';
  // Changes to a past class are kept on this iPad only (never sent) until 存檔上傳, so a closed tab loses nothing.
  const drafts = () => ({ ...(store.getMeta('editDrafts', {}) || {}) });
  const keepDraft = () => store.setMeta('editDrafts', { ...drafts(), [session.id]: { session: JSON.parse(JSON.stringify(session)), savedAt: Date.now() } });
  const dropDraft = () => {
    const all = drafts();
    if (!all[session.id]) return;
    delete all[session.id];
    store.setMeta('editDrafts', all);
  };
  const previous = doneSessions(store.all('sessions'), studentId).find((s) => s.id !== session.id && s.date <= session.date);
  // A 1:2 class: the two names sit at the top and one tap switches (2026-11-24). A past class is edited alone.
  const pair = editing || session.date !== dateKey() ? null : todayPair(studentId);
  const undoStack = [];
  const firstOpenRow = Math.max(session.rows.findIndex((row) => row.sets.some((s) => !s.done)), 0);
  let selected = session.rows.length ? { row: firstOpenRow, set: firstOpenSet(session.rows[firstOpenRow]) } : null;
  // The blood pressure comes first in every class, so a new class opens on it.
  let mode = session.status === 'draft' && !session.bpSys && !session.hr && !session.rows.some((row) => row.sets.some((s) => s.done)) ? 'vitals' : 'set';
  let drawnMode = null;
  let bumped = null;
  let lastGuide = '';
  const cells = [];

  const panel = h('div', { class: 'panel' });
  const tableBody = h('div', { class: 'grid-body' });
  const vitalsBp = h('button', { type: 'button', class: 'vital', onclick: () => setMode('vitals') });
  const vitalsHr = h('button', { type: 'button', class: 'vital', onclick: () => setMode('vitals') });
  const vitalsFlags = h('button', { type: 'button', class: 'vital', onclick: () => setMode('vitals') });
  const noteButton = h('button', { type: 'button', class: 'vital', onclick: () => openNoteSheet() });
  const undoButton = h('button', { type: 'button', class: 'btn ghost undo', disabled: true, onclick: undo }, icon('undo'), h('span', {}, '復原'));
  const finishButton = editing
    ? h('button', { type: 'button', class: 'btn save-upload', onclick: () => confirmUpload() })
    : button(session.status === 'done' ? '更新完成' : '完成上課', () => openFinishSheet(), '');
  const classChip = h('button', { type: 'button', class: 'class-chip', disabled: editing, onclick: () => classNumberSheet(studentId, session, paintClassInfo) });
  const nextChip = h('button', { type: 'button', class: 'class-chip', onclick: () => nextDateSheet(studentId, paintClassInfo) });
  const guideText = h('span', { class: 'sr-only', role: 'status' });
  const addButton = h('button', { type: 'button', class: 'grid-add', 'aria-label': '加入動作', onclick: () => openPicker() }, icon('plus'), h('span', { class: 'grid-add-text' }, '加入動作'));

  function setMode(next) {
    mode = next;
    refresh();
  }

  function mutate(change) {
    // The position goes with the data, so undoing a finished set puts the ring back on that set.
    dismissActionToast();
    undoStack.push(JSON.stringify({ session, selected, mode: mode === 'vitals' ? 'set' : mode }));
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    change();
    persist();
    undoButton.disabled = false;
  }

  /** Today's class is stored at every tap. A past class only marks that it has changes waiting for 存檔上傳. */
  function persist() {
    if (!editing) {
      store.save('sessions', session);
      return;
    }
    dirty = true;
    uploadState = 'clean';
    keepDraft();
    paintSave();
  }

  function paintSave() {
    if (!editing) return;
    const [label, iconName, disabled] = dirty ? ['存檔上傳', 'sync', false]
      : uploadState === 'uploading' ? ['上傳中…', 'sync', true]
        : uploadState === 'uploaded' ? ['已上傳', 'check', true]
          : uploadState === 'local' ? ['已存在 iPad', 'check', true]
            : uploadState === 'pending' ? ['再上傳一次', 'sync', false]
              : ['沒有修改', null, true];
    finishButton.replaceChildren(iconName ? icon(iconName) : '', h('span', {}, label));
    finishButton.disabled = disabled;
    finishButton.classList.toggle('primary', dirty || uploadState === 'pending');
    finishButton.classList.toggle('is-ready', dirty);
    finishButton.classList.toggle('is-uploaded', !dirty && uploadState === 'uploaded');
  }

  function confirmUpload() {
    if (!dirty && uploadState === 'pending') { upload(); return; }
    openSheet('存檔並上傳', (close) => h('div', { class: 'stack' },
      h('p', {}, `把 ${session.date.replaceAll('-', '/')} 這堂的修改存到 iPad，並上傳到公司 Google 雲端，取代雲端上原本的這一堂。`),
      h('p', { class: 'muted' }, '上傳完成前請不要關閉工具。'),
      h('div', { class: 'row-between' },
        button('再看看', close, ''),
        button('存檔上傳', () => { close(); upload(); }, 'primary'))));
  }

  async function upload() {
    if (dirty) {
      session.editedAt = new Date().toISOString();
      // A separate copy is stored, so later changes on screen stay out of the saved class until the next 存檔上傳.
      store.save('sessions', JSON.parse(JSON.stringify(session)));
      dropDraft();
      dirty = false;
    }
    uploadState = 'uploading';
    paintSave();
    const result = await uploadRecord('sessions', session.id);
    uploadState = result === 'offline' ? 'pending' : result;
    paintSave();
    toast({
      uploaded: '已上傳到雲端',
      local: '已存在這台 iPad。還沒連 Google，所以沒有上傳。',
      offline: '已存在 iPad，但現在沒有網路。連上網路後按「再上傳一次」。',
      pending: '已存在 iPad，但上傳沒有成功。等一下再按「再上傳一次」。',
    }[result]);
  }

  /** Leaving a past class with changes not uploaded asks first. The changes stay on this iPad unless thrown away. */
  function leave(then) {
    if (!dirty) { then(); return; }
    openSheet('還沒存檔', (close) => h('div', { class: 'stack' },
      h('p', {}, '這堂的修改暫存在這台 iPad，還沒上傳到雲端。'),
      h('div', { class: 'stack' },
        button('繼續修改', close, 'big primary'),
        button('先離開，保留暫存', () => {
          close();
          toast('修改暫存在這台 iPad。紀錄清單會標「還沒存檔」，記得回來按「存檔上傳」。');
          then();
        }, ''),
        holdButton('放棄修改', () => { dropDraft(); close(); then(); }, 'ghost danger-text'))));
  }

  /** A past class with changes left from last time offers to carry on with them. */
  function offerDraft() {
    const saved = drafts()[session.id];
    if (!saved?.session) return;
    const when = new Date(saved.savedAt);
    const stamp = `${when.getMonth() + 1}/${when.getDate()} ${String(when.getHours()).padStart(2, '0')}:${String(when.getMinutes()).padStart(2, '0')}`;
    openSheet('上次還沒存檔', (close) => h('div', { class: 'stack' },
      h('p', {}, `這堂有上次改到一半的內容（${stamp} 暫存在這台 iPad），還沒上傳。要接著改嗎？`),
      h('div', { class: 'stack' },
        button('接著改', () => {
          close();
          session = JSON.parse(JSON.stringify(saved.session));
          dirty = true;
          uploadState = 'clean';
          if (selected && (!session.rows[selected.row] || !session.rows[selected.row].sets[selected.set])) {
            selected = session.rows.length ? { row: 0, set: 0 } : null;
          }
          buildGrid();
          refresh();
          paintSave();
        }, 'big primary'),
        holdButton('不要，用原本的', () => { dropDraft(); close(); }, 'ghost danger-text'))));
  }

  function undo() {
    if (!undoStack.length) return;
    dismissActionToast();
    ({ session, selected, mode } = JSON.parse(undoStack.pop()));
    persist();
    undoButton.disabled = undoStack.length === 0;
    if (selected && (!session.rows[selected.row] || !session.rows[selected.row].sets[selected.set])) {
      selected = session.rows.length ? { row: 0, set: 0 } : null;
    }
    buildGrid();
    refresh();
  }

  function firstOpenSet(row) {
    const index = row.sets.findIndex((s) => !s.done);
    return index === -1 ? 0 : index;
  }

  function isRowDone(row) {
    return row.sets.length > 0 && row.sets.every((s) => s.done);
  }

  function isAllDone() {
    return session.rows.length > 0 && session.rows.every(isRowDone);
  }

  /** The next exercise still open, looking forward first and then back to any that were skipped. */
  function nextOpenRow(from) {
    for (let i = 1; i <= session.rows.length; i++) {
      const index = (from + i) % session.rows.length;
      if (!isRowDone(session.rows[index])) return index;
    }
    return -1;
  }

  function stamp(r, s) {
    const cell = cells[r].cells[s];
    cell.classList.remove('stamp');
    cell.classList.add('stamp');
    cell.addEventListener('animationend', () => cell.classList.remove('stamp'), { once: true });
  }

  /** After a set is done the ring moves to the next one, or asks how the exercise felt once they are all done. */
  function moveOn(r) {
    const row = session.rows[r];
    if (isRowDone(row)) {
      selected = { row: r, set: selected?.row === r ? selected.set : 0 };
      mode = 'feel';
    } else {
      selected = { row: r, set: firstOpenSet(row) };
      mode = 'set';
    }
  }

  function tapSet(r, s) {
    const row = session.rows[r];
    if (s >= row.sets.length) {
      // An empty cell adds one more set, copied from the last one.
      mutate(() => {
        const last = row.sets[row.sets.length - 1];
        const copy = last ? { weight: last.weight, reps: last.reps, spring: last.spring } : {};
        const next = makeSet(copy);
        next.done = true;
        row.sets.push(next);
      });
      selected = { row: r, set: row.sets.length - 1 };
      stamp(r, s);
      moveOn(r);
    } else if (row.sets[s].done) {
      // A tap only ever marks a set done. Here it opens the set for correcting; undoing it is a separate button.
      selected = { row: r, set: s };
      mode = 'set';
    } else {
      selected = { row: r, set: s };
      mutate(() => { row.sets[s].done = true; });
      stamp(r, s);
      moveOn(r);
    }
    refresh();
  }

  function tapRow(r) {
    selected = { row: r, set: firstOpenSet(session.rows[r]) };
    mode = 'set';
    refresh();
  }

  function paintClassInfo() {
    classChip.replaceChildren(termRing(session.classNo, session.packageSize, false), h('span', {}, `${session.classNo}/${session.packageSize}`));
    classChip.setAttribute('aria-label', `今天是${classLabel(session.classNo, session.packageSize)}，點一下修正`);
    const text = nextDateText(store.get('students', studentId));
    // 「下次」 is its own piece so a 1:2 class on an iPad mini can leave it out and keep one line (2026-11-24).
    const word = text.match(/^下次\s?/)?.[0] || '';
    nextChip.replaceChildren(icon('today'), h('span', {}, word && h('span', { class: 'next-word' }, word), text.slice(word.length)));
    nextChip.classList.toggle('is-unset', text.endsWith('未確認') || text.endsWith('？'));
    nextChip.setAttribute('aria-label', `${text}，點一下確認下次上課日期`);
  }

  /** Moves a row as one undo step. The ring stays on the set it was on. */
  function shiftRow(from, to) {
    if (from === to || to < 0 || to >= session.rows.length) return;
    mutate(() => {
      const target = moveRow(session.rows, from, to, selected?.row ?? from);
      if (selected) selected.row = target;
    });
    buildGrid();
    refresh();
  }

  function buildGrid() {
    tableBody.replaceChildren();
    cells.length = 0;
    session.rows.forEach((row, r) => {
      const name = h('button', { type: 'button', class: 'grid-name', onclick: () => {
        tapRow(r);
        openExerciseHistory(session.rows[r]);
      } });
      const rowCells = [];
      const sets = [];
      for (let s = 0; s < MAX_SETS; s++) {
        const cell = h('button', { type: 'button', class: 'cell', onclick: () => tapSet(r, s) },
          h('span', { class: 'cell-a' }), h('span', { class: 'cell-b' }));
        rowCells.push(cell);
        sets.push(cell);
      }
      cells.push({ name, cells: rowCells });
      const swap = h('button', { type: 'button', class: 'grid-swap', 'aria-label': `換掉 ${row.name}`, onclick: () => openSwap(r) }, icon('swap'));
      const handle = dragHandle({ name: row.name, index: r, count: session.rows.length, getRow: () => rowEl, getList: () => tableBody, onMove: shiftRow });
      const rowEl = h('div', { class: 'grid-row' }, h('div', { class: 'grid-lead' }, handle, name, swap), sets);
      // Swiping left shows 刪除 for the whole exercise; 復原 brings it back (2026-11-16).
      swipeToDelete(rowEl, row.name, () => removeRowAt(r));
      tableBody.append(rowEl);
    });
    // The list keeps room for every exercise, so the whole class is visible without scrolling.
    const rowCount = String(Math.max(session.rows.length, 1));
    tableBody.style.setProperty('--rows', rowCount);
    tableBody.parentElement?.style.setProperty('--rows', rowCount);
  }

  function paintCell(r, s) {
    const row = session.rows[r];
    const cell = cells[r].cells[s];
    const set = row.sets[s];
    const [a, b] = cell.children;
    const isSelected = selected?.row === r && selected?.set === s;
    cell.classList.toggle('is-selected', isSelected && mode !== 'vitals' && mode !== 'feel');
    if (!set) {
      cell.className = 'cell is-empty';
      const canAdd = s === row.sets.length;
      a.textContent = canAdd ? '＋' : '';
      b.textContent = '';
      cell.disabled = !canAdd;
      cell.setAttribute('aria-label', canAdd ? `${row.name} 多做一組` : '');
      return;
    }
    cell.disabled = false;
    const changed = set.weight !== set.planWeight || set.reps !== set.planReps || set.spring !== set.planSpring;
    cell.classList.remove('is-empty');
    cell.classList.toggle('is-done', set.done);
    cell.classList.toggle('is-changed', changed);
    cell.classList.toggle('is-next', isSelected && !set.done && mode === 'set');
    cell.classList.toggle('is-spring', row.kind === 'pilates');
    a.textContent = setLoad(row, set);
    b.textContent = set.reps;
    cell.setAttribute('aria-label', `${row.name} 第${SET_NAMES[s]}組 ${a.textContent} ${b.textContent} 下${set.done ? ' 已完成' : ''}`);
  }

  function paintName(r) {
    const row = session.rows[r];
    const { name } = cells[r];
    name.classList.toggle('is-selected', selected?.row === r);
    name.parentElement?.parentElement?.classList.toggle('is-current', selected?.row === r && mode !== 'vitals');
    const media = rowMedia(store.all('photos'), session.id, row.id).length;
    const meta = [
      equipmentText(row),
      row.rpe ? `RPE ${row.rpe}` : '',
      painList(row).length ? `痛 ${painShort(row)}` : '',
      row.tags.length ? `${row.tags.length} 標籤` : '',
      media ? `影像 ${media}` : '',
    ].filter(Boolean).join('・');
    // Long names get smaller type and a third line rather than being cut off.
    name.replaceChildren(h('span', { class: `grid-name-text${row.name.length > 26 ? ' is-long' : ''}` }, row.name), meta ? h('span', { class: 'grid-name-meta' }, meta) : '');
  }

  function paintVitals() {
    const flagged = isBpFlagged(session.bpSys, session.bpDia);
    vitalsBp.classList.toggle('is-alert', !!flagged);
    vitalsBp.replaceChildren(h('span', { class: 'vital-label' }, flagged ? '血壓偏高' : '血壓'),
      h('span', { class: 'vital-value' }, session.bpSys || session.bpDia
        ? `${session.bpSys || '—'}/${session.bpDia || '—'}`
        : (previous?.bpSys ? `上次 ${previous.bpSys}/${previous.bpDia}` : '未量')));
    vitalsHr.replaceChildren(h('span', { class: 'vital-label' }, '心跳'),
      h('span', { class: 'vital-value' }, session.hr || (previous?.hr ? `上次 ${previous.hr}` : '未量')));
    const marked = STATUS_FLAGS.filter(([key]) => session.flags[key])
      .map(([key, label]) => (key === 'pain' && painList(session.dayPain || {}).length ? `疼痛 ${painShort(session.dayPain)}` : label));
    vitalsFlags.classList.toggle('is-marked', marked.length > 0);
    vitalsFlags.replaceChildren(h('span', { class: 'vital-label' }, '今天狀況'),
      h('span', { class: 'vital-value' }, marked.length ? marked.join('、') : '都正常'));
    noteButton.classList.toggle('is-marked', false);
    noteButton.replaceChildren(h('span', { class: 'vital-label' }, '小目標・備註'),
      h('span', { class: 'vital-value' }, session.classGoal?.trim() || session.note || session.special ? '已寫' : '點這裡寫'));
  }

  /** Says in one sentence what to do now, so the screen never leaves the teacher guessing. */
  function guideMessage() {
    if (mode === 'vitals') return '先量血壓和心跳，輸入完會自動跳下一格';
    if (!session.rows.length) return '先加入第一個動作';
    const row = selected && session.rows[selected.row];
    if (editing && isAllDone()) return '改好後按右上角「存檔上傳」';
    if (isAllDone()) return `全部做完了，按右上角「${session.status === 'done' ? '更新完成' : '完成上課'}」`;
    if (!row) return '點一個動作開始';
    if (mode === 'feel') return `${row.name} 做完了，記一下費力和感受`;
    const set = row.sets[selected.set];
    if (set?.done) return `正在修改 ${row.name} 第${SET_NAMES[selected.set]}組`;
    return `現在做 ${row.name} 第${SET_NAMES[selected.set]}組，做完點亮起的格子`;
  }

  /**
   * The next step is shown, not written: whatever should be tapped now gets the accent ring and a slow pulse.
   * Blood pressure at the start, the add button in an empty class, the set being done, and 完成上課 at the end.
   */
  function paintGuide() {
    const allDone = isAllDone();
    const anyDone = session.rows.some((row) => row.sets.some((s) => s.done));
    if (!editing) {
      finishButton.classList.toggle('primary', allDone);
      finishButton.classList.toggle('is-ready', allDone && session.status !== 'done');
    }
    const vitalsDue = mode === 'vitals' || (session.status === 'draft' && !session.bpSys && !session.hr && !anyDone);
    vitalsBp.classList.toggle('is-next', vitalsDue);
    vitalsHr.classList.toggle('is-next', mode === 'vitals');
    addButton.classList.toggle('is-next', !session.rows.length && mode !== 'vitals');
    const message = guideMessage();
    if (message !== lastGuide) {
      lastGuide = message;
      guideText.textContent = message;
    }
  }

  function refresh() {
    screen.classList.toggle('is-vitals', mode === 'vitals');
    session.rows.forEach((row, r) => {
      paintName(r);
      for (let s = 0; s < MAX_SETS; s++) paintCell(r, s);
    });
    paintVitals();
    paintClassInfo();
    renderPanel();
  }

  function adjustSet(field, delta) {
    const row = session.rows[selected.row];
    bumped = field;
    mutate(() => {
      for (let s = selected.set; s < row.sets.length; s++) {
        const set = row.sets[s];
        // Later sets not done yet follow the change, so a load change takes one tap, not five.
        if (s > selected.set && set.done) continue;
        set[field] = Math.max(0, Math.round((set[field] + delta) * 100) / 100);
      }
    });
    for (let s = selected.set; s < MAX_SETS; s++) paintCell(selected.row, s);
    renderPanel();
  }

  /** Types a value directly and carries it to the later sets still to do, like the buttons do. */
  function typeSet(field, label, unit) {
    const row = session.rows[selected.row];
    numberSheet(`${row.name} ${label}`, row.sets[selected.set][field], unit, field === 'weight', (value) => {
      bumped = field;
      mutate(() => {
        for (let s = selected.set; s < row.sets.length; s++) {
          if (s === selected.set || !row.sets[s].done) row.sets[s][field] = value;
        }
      });
      for (let s = selected.set; s < MAX_SETS; s++) paintCell(selected.row, s);
      renderPanel();
    });
  }

  function stepper(label, value, field, steps, unit) {
    const bodyweight = field === 'weight' && !value;
    return paramTile({
      label,
      iconName: field === 'weight' ? 'dumbbell' : 'repeat',
      value,
      text: bodyweight ? '自體' : String(value),
      unit: bodyweight ? '' : unit,
      steps,
      min: 0,
      bump: bumped === field,
      onStep: (delta) => adjustSet(field, delta),
      onTap: () => typeSet(field, label, unit),
    });
  }

  function springEditor(row, set) {
    const update = (text) => {
      mutate(() => {
        for (let s = selected.set; s < row.sets.length; s++) {
          if (s > selected.set && row.sets[s].done) continue;
          row.sets[s].spring = text;
        }
      });
      for (let s = selected.set; s < MAX_SETS; s++) paintCell(selected.row, s);
      renderPanel();
    };
    return springControls(set.spring || '', update, apparatusSprings(row), apparatusOf(row));
  }

  function addedOptions(type) {
    return store.all('options').filter((o) => o.type === type).map((o) => o.name);
  }

  /** One group in 感受與備註: a picture and a name on the left, its choices beside it. */
  function feelBox(label, iconName, options, current, onPick, { className = '', extra = null, chipClass = () => '' } = {}) {
    return h('div', { class: `feel-box ${className}`.trim(), role: 'group', 'aria-label': label },
      h('div', { class: 'feel-head' }, icon(iconName), h('span', {}, label)),
      h('div', { class: 'feel-chips' }, options.map((option) => button(String(option), () => onPick(option), `chip-btn ${chipClass(option)}`.trim(), {
        'aria-pressed': current === option || (Array.isArray(current) && current.includes(option)) ? 'true' : 'false',
      })), extra));
  }

  function toggleIn(list, value) {
    const index = list.indexOf(value);
    if (index === -1) list.push(value);
    else list.splice(index, 1);
  }

  /** Tab one: the numbers for this set, and the button that finishes it. */
  /** The panel's first line: the exercise, the two tabs, and its own buttons, all on one row to leave room for the list. */
  function panelTop(row, sub, tools) {
    return h('div', { class: 'panel-top' },
      h('div', { class: 'panel-title' }, h('strong', {}, row.name), sub && h('span', { class: 'muted' }, sub),
        // The note written for it when planning (2026-11-26).
        String(row.planNote || '').trim() && h('span', { class: 'panel-note' }, row.planNote.trim())),
      panelTabs(),
      tools && h('div', { class: 'panel-tools' }, tools));
  }

  function setTab() {
    const row = session.rows[selected.row];
    const set = row.sets[selected.set];
    const planText = set ? `計畫 ${setLoad(row, set, false)} × ${set.planReps ?? '—'}` : '';
    const open = row.sets.findIndex((s) => !s.done);
    return [
      panelTop(row, set && `第${SET_NAMES[selected.set]}組・${planText}`, [
        handoutButton(row.exerciseId),
        // Photo or video of this exercise and set, named and filed by itself (2026-11-17).
        h('button', {
          type: 'button',
          class: 'btn swap-btn',
          'aria-label': `拍攝 ${row.name}${set ? ` 第${SET_NAMES[selected.set]}組` : ''}`,
          onclick: () => {
            const r = selected.row;
            captureForExercise(student, session, row, set ? selected.set : null, () => { if (session.rows[r] === row) paintName(r); });
          },
        }, icon('camera'), h('span', {}, '拍攝')),
        h('button', { type: 'button', class: 'btn swap-btn', onclick: () => openSwap(selected.row) }, icon('swap'), h('span', {}, '換動作')),
      ]),
      row.kind === 'strength' && equipmentControl(row, (equipment, band) => {
        if (equipment === null) { renderPanel(); return; }
        mutate(() => {
          row.equipment = equipment;
          row.band = band;
        });
        paintName(selected.row);
        for (let s = 0; s < MAX_SETS; s++) paintCell(selected.row, s);
        renderPanel();
      }),
      set && row.kind === 'pilates' && springEditor(row, set),
      set && h('div', { class: 'param-grid' },
        row.kind === 'strength' && row.equipment !== BAND && stepper('重量', set.weight, 'weight', [1, 2], 'kg'),
        stepper('次數', set.reps, 'reps', [1, 2])),
      // The one main button and the smaller ones share a row.
      set && h('div', { class: 'panel-do' },
        !set.done && h('button', {
          type: 'button',
          class: 'btn big primary',
          onclick: () => tapSet(selected.row, selected.set),
        }, icon('check'), `第${SET_NAMES[selected.set]}組做完了`),
        set.done && open !== -1 && h('button', {
          type: 'button',
          class: 'btn big primary',
          onclick: () => { moveOn(selected.row); refresh(); },
        }, `回到第${SET_NAMES[open]}組`, icon('arrow')),
        !isRowDone(row) && button('全部做完', () => {
          mutate(() => row.sets.forEach((s) => { s.done = true; }));
          moveOn(selected.row);
          refresh();
          toast(`${row.name} 已全部標為做完`, { label: '復原', run: undo });
        }, ''),
        set.done && button('這組沒做', () => {
          mutate(() => { set.done = false; });
          refresh();
        }, ''),
        // Any set can go, down to one; the whole exercise goes with 移除動作 or a swipe (2026-11-16).
        row.sets.length > 1 && holdButton('刪除這組', removeSet, 'ghost danger-text'),
        holdButton('移除動作', removeRow, 'ghost danger-text')),
    ];
  }

  /** Tab two: how the exercise felt, then on to the next one. */
  function feelTab() {
    const row = session.rows[selected.row];
    const change = (fn) => {
      mutate(fn);
      paintName(selected.row);
      renderPanel();
    };
    const next = nextOpenRow(selected.row);
    const pains = painList(row);
    const pilates = row.kind === 'pilates';
    return [
      panelTop(row, '', null),
      h('div', { class: 'feel-grid' },
        feelBox('費力', 'effort', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], row.rpe, (v) => change(() => { row.rpe = row.rpe === v ? null : v; }),
          { className: 'is-wide feel-rpe', chipClass: (v) => `rpe-${effortLevel(v)}` }),
        pilates && feelBox('品質', 'star', [1, 2, 3, 4, 5], row.quality, (v) => change(() => { row.quality = row.quality === v ? null : v; }), { className: 'feel-even span-3' }),
        pilates && feelBox('協助', 'hand', ASSIST_LEVELS, row.assist, (v) => change(() => { row.assist = row.assist === v ? null : v; }), { className: 'feel-even span-3' }),
        h('div', { class: 'feel-box span-2', role: 'group', 'aria-label': '疼痛' },
          h('div', { class: 'feel-head' }, icon('body'), h('span', {}, '疼痛')),
          h('div', { class: 'feel-chips' }, button(pains.length ? painText(row) : '記錄疼痛', () => openPainSheet(row), `chip-btn feel-pain${pains.length ? ' is-pain' : ''}`, { 'aria-pressed': pains.length ? 'true' : 'false' }))),
        feelBox('道具', 'layers', chooserOptions(DEFAULT_PROPS, addedOptions('prop'), row.props), row.props, (v) => change(() => toggleIn(row.props, v)),
          { className: 'span-4', extra: button('＋', () => openOptionSheet('prop', '道具', DEFAULT_PROPS, row.props), 'chip-btn chip-add', { 'aria-label': '新增道具' }) }),
        feelBox('備註', 'tag', chooserOptions(DEFAULT_TAGS, addedOptions('tag'), row.tags), row.tags, (v) => change(() => toggleIn(row.tags, v)),
          { className: 'is-wide feel-tags', extra: button('＋ 新增', () => openOptionSheet('tag', '備註標籤', DEFAULT_TAGS, row.tags), 'chip-btn chip-add') })),
      next !== -1 && h('button', { type: 'button', class: 'btn big primary pinned', onclick: () => tapRow(next) }, `下一個：${session.rows[next].name}`, icon('arrow')),
      next === -1 && isAllDone() && !editing && h('button', { type: 'button', class: 'btn big primary pinned', onclick: () => openFinishSheet() }, session.status === 'done' ? '更新完成' : '完成上課', icon('arrow')),
    ];
  }

  function removeSet() {
    const r = selected.row;
    const row = session.rows[r];
    if (row.sets.length <= 1) return;
    const number = SET_NAMES[selected.set];
    mutate(() => row.sets.splice(selected.set, 1));
    selected = { row: r, set: Math.min(selected.set, row.sets.length - 1) };
    refresh();
    toast(`已刪除 ${row.name} 第${number}組`, { label: '復原', run: undo });
  }

  function removeRow() {
    removeRowAt(selected.row);
  }

  function removeRowAt(r) {
    const name = session.rows[r].name;
    mutate(() => session.rows.splice(r, 1));
    const at = selected ? (selected.row > r ? selected.row - 1 : selected.row) : 0;
    selected = session.rows.length ? { row: Math.min(at, session.rows.length - 1), set: 0 } : null;
    mode = 'set';
    buildGrid();
    refresh();
    toast(`已移除 ${name}`, { label: '復原', run: undo });
  }

  function vitalsPanel() {
    const fields = [['sys', '收縮壓', 'bpSys'], ['dia', '舒張壓', 'bpDia'], ['hr', '心跳', 'hr']];
    let index = fields.findIndex(([, , key]) => !session[key]);
    if (index === -1) index = 0;
    let typed = '';
    const wrap = h('div', { class: 'stack' });

    function draw() {
      wrap.replaceChildren(
        h('div', { class: 'vital-fields' }, fields.map(([, label, key], i) => h('button', {
          type: 'button',
          class: `vital-field${i === index ? ' is-active' : ''}`,
          onclick: () => { index = i; typed = ''; draw(); },
        }, h('span', { class: 'stepper-label' }, label), h('span', { class: 'vital-value' }, i === index && typed ? typed : (session[key] || '—'))))),
        h('div', { class: 'keypad' },
          [1, 2, 3, 4, 5, 6, 7, 8, 9, 0].map((d) => key(String(d))),
          button('清除', () => {
            typed = '';
            mutate(() => { session[fields[index][2]] = null; });
            paintVitals();
            draw();
          }, 'key'),
          button(session.bpSys || session.hr ? '量好了' : '先跳過', () => setMode('set'), 'key primary')),
        h('div', { class: 'field' },
          h('div', { class: 'stepper-label' }, '今天狀況（有問題才點）'),
          h('div', { class: 'chips chips-4' }, STATUS_FLAGS.map(([flag, label]) => (flag === 'pain'
            ? button(painList(session.dayPain || {}).length ? `疼痛 ${painShort(session.dayPain)}` : label, () => openDayPain(draw),
              `chip-btn${session.flags.pain ? ' is-pain' : ''}`, { 'aria-pressed': session.flags.pain ? 'true' : 'false' })
            : button(label, () => openStatusSheet(flag, label, draw), 'chip-btn', { 'aria-pressed': session.flags[flag] ? 'true' : 'false' })))),
          statusLine()));
    }

    /** What was picked for 睡眠、飲食、心情, under the four checks, so the details show without opening them. */
    function statusLine() {
      const lines = ['sleep', 'diet', 'mood'].filter((key) => session.flags[key]).map((key) => statusText(session, key)).filter((text) => text.includes('（'));
      return lines.length > 0 && h('p', { class: 'muted small status-details' }, lines.join('　'));
    }

    function key(digit) {
      return h('button', {
        type: 'button',
        class: 'btn key',
        'data-repeat': true,
        onclick: () => {
          typed += digit;
          const [field, , prop] = fields[index];
          if (typed.length >= expectedDigits(field, typed)) {
            const value = Number(typed);
            mutate(() => { session[prop] = value; });
            paintVitals();
            typed = '';
            if (index < fields.length - 1) index += 1;
            else { setMode('set'); return; }
          }
          draw();
        },
      }, digit);
    }

    draw();
    return wrap;
  }

  function panelTabs() {
    return h('div', { class: 'panel-tabs', role: 'tablist' }, PANEL_TABS.map(([id, label]) => h('button', {
      type: 'button',
      class: 'panel-tab',
      role: 'tab',
      'aria-selected': mode === id ? 'true' : 'false',
      onclick: () => {
        if (mode === id) return;
        mode = id;
        refresh();
      },
    }, id === 'set' && session.kind === 'pilates' ? '彈簧次數' : label)));
  }

  function renderPanel() {
    paintGuide();
    const changed = drawnMode !== mode;
    const previousScroll = panel.scrollTop;
    const body = h('div', { class: `panel-body${changed ? ' is-new' : ''}` });
    if (mode === 'vitals') {
      body.append(vitalsPanel());
      panel.replaceChildren(body);
    } else if (selected && session.rows[selected.row]) {
      const [top, ...parts] = mode === 'feel' ? feelTab() : setTab();
      body.append(...parts.filter(Boolean));
      panel.replaceChildren(top, body);
      if (mode === 'feel') fitFeel(body.querySelector('.feel-grid'));
    } else {
      body.append(h('div', { class: 'stack' },
        button('加入動作', openPicker, 'big primary')));
      panel.replaceChildren(body);
    }
    // Keeps the buttons under the finger when the same tab redraws after a tap.
    panel.scrollTop = changed ? 0 : previousScroll;
    drawnMode = mode;
    bumped = null;
  }

  /** When the exercise list is long, the boxes get tighter and the 備註 tags slide sideways, so nothing needs scrolling. */
  function fitFeel(grid) {
    if (!grid) return;
    for (const level of ['is-tight', 'is-tighter']) {
      if (panel.scrollHeight <= panel.clientHeight + 1) return;
      grid.classList.add(level);
    }
  }

  function openPicker() {
    openSheet('加入動作', (close) => exercisePicker(session.kind, (exercise) => {
      close();
      mutate(() => session.rows.push(makeRow(exercise, 3)));
      selected = { row: session.rows.length - 1, set: 0 };
      mode = 'set';
      buildGrid();
      refresh();
    }), { wide: true });
  }

  /** Two taps from anywhere in class: the swap button, then the replacement. */
  function openSwap(r) {
    const row = session.rows[r];
    const current = store.get('exercises', row.exerciseId) || { id: row.exerciseId, name: row.name, kind: row.kind };
    const history = doneSessions(store.all('sessions'), session.studentId).filter((s) => s.id !== session.id);
    openSheet(`把 ${row.name} 換成`, (close) => exercisePicker(row.kind, (exercise) => {
      close();
      let target = r;
      mutate(() => { target = swapRow(session.rows, r, exercise, history); });
      selected = { row: target, set: 0 };
      mode = 'set';
      buildGrid();
      refresh();
      toast(`已換成 ${exercise.name}`, { label: '復原', run: undo });
    }, { current }), { wide: true });
  }

  function openPainSheet(row) {
    openPainMap(`疼痛：${row.name}`, {
      scores: painScores(row),
      partNotes: row.painPartNotes,
      note: row.painNote,
      onScores: (map) => mutate(() => setPainMap(row, map)),
      onPartNotes: (notes) => { row.painPartNotes = notes; persist(); },
      onNote: (value) => { row.painNote = value; persist(); },
      onDone: refresh,
    });
  }

  /** How the student feels on arrival: the 疼痛 check opens the body map, and the check stays on while a part is marked. */
  function openDayPain(after) {
    openPainMap('今天上課前的疼痛', {
      scores: painScores(session.dayPain),
      partNotes: session.dayPain?.painPartNotes,
      note: session.dayPain?.painNote,
      notePlaceholder: '例如：早上起床比較緊、走路才痛',
      onScores: (map) => {
        mutate(() => {
          session.dayPain = { ...(session.dayPain || {}) };
          setPainMap(session.dayPain, map);
          session.flags.pain = Object.keys(map).length > 0;
        });
        paintVitals();
        after();
      },
      onPartNotes: (notes) => { session.dayPain = { ...(session.dayPain || {}), painPartNotes: notes }; persist(); },
      onNote: (value) => { session.dayPain = { ...(session.dayPain || {}), painNote: value }; persist(); },
      onDone: after,
    });
  }

  /**
   * 睡眠、飲食、心情 in detail (2026-11-26, 各自可以再點進去選取細節和輸入備註). The tap marks it at once, as before,
   * and opens what to pick and a note; 取消標記 takes the mark and its details off (held when there are details).
   */
  function openStatusSheet(flag, label, after) {
    if (!session.flags[flag]) {
      mutate(() => { session.flags[flag] = true; });
      paintVitals();
      after();
    }
    openSheet(`今天的${label}`, (close) => {
      const status = h('p', { class: 'muted small', role: 'status' }, `已標記${label}有狀況。改了會自動儲存。`);
      const saved = () => { status.textContent = '已自動儲存'; };
      const chips = h('div', { class: 'chips' });
      const note = h('textarea', { class: 'input', placeholder: '其他要記的，例如：昨晚加班到很晚', 'aria-label': `${label}的備註` });
      note.value = statusDetail(session, flag).note;
      const write = (items, text) => {
        session.flagDetails = { ...(session.flagDetails || {}), [flag]: { items, note: text } };
      };
      const paint = () => {
        const picked = statusDetail(session, flag).items;
        chips.replaceChildren(...[...new Set([...STATUS_DETAILS[flag], ...picked])].map((item) => button(item, () => {
          const items = statusDetail(session, flag).items;
          const at = items.indexOf(item);
          if (at === -1) items.push(item);
          else items.splice(at, 1);
          mutate(() => write(items, note.value));
          saved();
          paint();
          paintVitals();
        }, 'chip-btn', { 'aria-pressed': picked.includes(item) ? 'true' : 'false' })));
        paintUnmark();
      };
      note.addEventListener('input', () => {
        write(statusDetail(session, flag).items, note.value);
        persist();
        saved();
        paintUnmark();
      });
      const unmark = () => {
        mutate(() => {
          session.flags[flag] = false;
          if (session.flagDetails) {
            session.flagDetails = { ...session.flagDetails };
            delete session.flagDetails[flag];
          }
        });
        close();
      };
      // Once something is picked or written, taking the mark off also takes that away, so it needs the held button.
      const unmarkSlot = h('div', { class: 'stack' });
      let held = null;
      function paintUnmark() {
        const detail = statusDetail(session, flag);
        const hold = !!(detail.items.length || detail.note);
        if (hold === held) return;
        held = hold;
        unmarkSlot.replaceChildren(hold
          ? holdButton('取消標記', () => { unmark(); toast(`已取消${label}的標記`, { label: '復原', run: undo }); }, 'ghost')
          : button(`${label}沒問題，取消標記`, unmark, 'ghost'));
      }
      paint();
      return h('div', { class: 'stack' },
        status,
        chips,
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '備註'), note),
        button('完成', close, 'big primary'),
        unmarkSlot);
    }, { onClose: () => { paintVitals(); after(); } });
  }

  /** This student's earlier classes with this exercise, so the last numbers are one tap away. */
  function openExerciseHistory(row) {
    const history = doneSessions(store.all('sessions'), session.studentId).filter((s) => s.id !== session.id);
    const past = exerciseHistory(row.exerciseId, history);
    const points = row.kind === 'strength' ? exerciseTrend(row.exerciseId, history) : [];
    openSheet(`${row.name} 過去紀錄`, () => h('div', { class: 'stack' },
      points.length > 1 && trendChart(row.name, points, Math.min(window.innerWidth, 620) - 48),
      past.length
        ? past.map(({ date, row: old }) => h('div', { class: 'history-row' },
          h('div', { class: 'history-main' },
            h('strong', {}, date.replaceAll('-', '/')),
            h('span', { class: 'history-sets' }, old.sets.map((set) => h('span', { class: set.done ? '' : 'set-missed' }, setText(old, set))))),
          rowDetails(old).length > 0 && h('div', { class: 'muted small' }, rowDetails(old).join('・'))))
        : h('p', { class: 'muted' }, '這位學生第一次做這個動作，還沒有過去紀錄。')));
  }

  /** Adds a tag or prop of the teacher's own and picks it for this row. */
  function openOptionSheet(type, label, defaults, list) {
    const pick = (name) => {
      mutate(() => { if (!list.includes(name)) list.push(name); });
      refresh();
    };
    openSheet(`新增${label}`, (close) => {
      const input = h('input', { class: 'input', maxlength: 20, placeholder: `輸入${label}名稱`, 'aria-label': `${label}名稱` });
      const add = () => {
        const name = input.value.trim();
        if (!name) { toast('名稱不可空白'); return; }
        if (!defaults.includes(name) && !addedOptions(type).includes(name)) {
          store.save('options', { id: newId('opt'), type, name });
        }
        close();
        pick(name);
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
      const own = store.all('options').filter((o) => o.type === type);
      return h('div', { class: 'stack' },
        input,
        button('加入並選取', add, 'big primary'),
        own.length > 0 && h('div', { class: 'field' },
          h('div', { class: 'stepper-label' }, `你新增的${label}`),
          own.map((option) => h('div', { class: 'row-between option-row' },
            h('span', {}, option.name),
            holdButton('移除', () => {
              store.save('options', { ...option, deleted: true });
              close();
              refresh();
              toast(`已移除 ${option.name}，過去的紀錄不受影響`, {
                label: '復原',
                run: () => { store.save('options', { ...option, deleted: false }); refresh(); },
              });
            }, 'ghost danger-text')))));
    });
    document.querySelector('.sheet .input')?.focus();
  }

  function openNoteSheet() {
    openSheet('小目標與備註', (close) => {
      const goal = h('textarea', { class: 'input class-goal-input', placeholder: '例：深蹲時膝蓋對準腳尖', 'aria-label': '本堂小目標，學生看得到' });
      goal.value = session.classGoal || '';
      const special = h('input', { class: 'input', value: session.special || '', placeholder: '特殊狀況', 'aria-label': '特殊狀況' });
      const note = h('textarea', { class: 'input note-area', 'aria-label': '備註', placeholder: '備註' });
      note.value = session.note || '';
      const save = () => {
        session.classGoal = goal.value;
        session.special = special.value;
        session.note = note.value;
        persist();
        paintVitals();
        paintBanner();
      };
      goal.addEventListener('input', save);
      special.addEventListener('input', save);
      note.addEventListener('input', save);
      return h('div', { class: 'stack' },
        h('p', { class: 'muted' }, '改了會自動儲存。可以直接用 Apple Pencil 在框內手寫，iPad 會轉成文字。'),
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '本堂小目標（學生看得到）'), goal),
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '特殊狀況和備註（學生看不到）'), special, note),
        button('完成', close, 'big primary'));
    });
  }

  function openFinishSheet() {
    const coachSignature = store.getMeta('coachSignature');
    openSheet('完成上課', (close) => {
      const notes = h('textarea', { class: 'input', 'aria-label': '下次要注意的事', placeholder: '下次要注意的事' });
      notes.value = student.nextNotes || '';
      const canvas = signaturePad(session.studentSignature);
      return h('div', { class: 'stack-lg' },
        h('div', { class: 'stack' }, h('div', { class: 'stepper-label' }, '下次上課'), nextDateControl(studentId, paintClassInfo)),
        h('div', { class: 'stack' }, h('div', { class: 'stepper-label' }, '下次要注意的事'), notes),
        h('div', { class: 'stack no-select' },
          h('div', { class: 'stepper-label' }, `教練簽名：${coachSignature ? '已帶入' : '已帶入姓名（可到設定存手寫簽名）'}`),
          h('div', { class: 'row-between' }, h('div', { class: 'stepper-label' }, '請學生在下面簽名'), button('重簽', () => canvas.clear(), 'ghost')),
          canvas.el),
        h('div', { class: 'stack' },
          button('儲存紀錄', () => finish(canvas.isEmpty() ? null : canvas.toDataUrl()), 'big primary'),
          button('儲存，給學生看今天的報告', () => finish(canvas.isEmpty() ? null : canvas.toDataUrl(), true), ''),
          button('先不簽，稍後補', () => finish(null), 'ghost')));

      function finish(signature, showReport = false) {
        session.coachSigned = true;
        session.studentSignature = signature;
        finishSession(session);
        store.save('students', { ...store.get('students', studentId), nextNotes: notes.value, isNew: false });
        close();
        // In a 1:2 class the other student comes next, unless they are finished already.
        const next = pair && !store.all('sessions').some((s) => s.studentId === pair.partner.id && s.date === session.date && s.status === 'done' && mine(s)) ? pair.partner : null;
        toast(next ? `${student.name} 的紀錄已儲存，接著是 ${next.name}` : `${student.name} 的紀錄已儲存`);
        home();
        if (showReport) go('report', { studentId, sessionId: session.id });
        else if (next) go('record', { studentId: next.id, kind: session.kind });
      }
    });
  }

  buildGrid();

  // 禁忌 and 注意 from the profile, and this class's small goal (2026-11-26), which can change in 小目標與備註.
  const banner = h('div', { class: 'banner' });
  function paintBanner() {
    const warn = student.contraindications || student.nextNotes;
    const goal = String(session.classGoal || '').trim();
    banner.hidden = !warn && !goal;
    banner.replaceChildren(icon(warn ? 'warn' : 'star'),
      h('div', {},
        student.contraindications && h('p', {}, `禁忌：${student.contraindications}`),
        student.nextNotes && h('p', {}, `注意：${student.nextNotes}`),
        goal && h('p', { class: 'banner-goal' }, `小目標：${goal}`)));
  }
  paintBanner();

  const screen = h('div', { class: 'screen record' },
    h('header', { class: `topbar${pair ? ' is-pair' : ''}` },
      editing
        ? h('button', { type: 'button', class: 'btn ghost back', 'aria-label': '返回', onclick: () => leave(back) }, icon('back'), h('span', {}, '返回'))
        : backButton(),
      pair ? pairSwitch(pair, student, session) : h('h1', {}, student.name, h('small', {}, editing ? `${session.date.slice(5).replace('-', '/')} 修改中` : kindLabel(session.kind))),
      h('div', { class: 'class-chips' }, classChip, !editing && nextChip),
      h('div', { class: 'topbar-actions' },
        button('總覽', () => leave(() => go('overview', { studentId })), 'ghost'),
        undoButton,
        finishButton)),
    banner,
    h('div', { class: 'vitals' }, vitalsBp, vitalsHr, vitalsFlags, noteButton),
    guideText,
    h('div', { class: 'record-main' },
      h('div', { class: 'grid' },
        h('div', { class: 'grid-head' },
          addButton,
          SET_NAMES.map((n) => h('span', {}, `第${n}組`))),
        tableBody),
      panel));

  tableBody.parentElement.style.setProperty('--rows', String(Math.max(session.rows.length, 1)));
  refresh();
  if (editing) {
    paintSave();
    offerDraft();
    // A class stored earlier but never sent says so at once.
    isWaiting('sessions', session.id).then((waiting) => {
      if (waiting && !dirty && isConnected()) { uploadState = 'pending'; paintSave(); }
    });
  }
  return screen;
}

/**
 * The two students of a 1:2 class, in the order of the calendar title. The one shown is pressed; tapping the other
 * opens their class (started from the plan or last time on the first tap) without adding a step to 返回.
 * A check marks a student already finished today.
 */
function pairSwitch(pair, student, session) {
  const finished = (id) => store.all('sessions').some((s) => s.studentId === id && s.date === session.date && s.status === 'done' && mine(s));
  const name = (who, current) => h('button', {
    type: 'button',
    class: 'pair-name',
    'aria-pressed': current ? 'true' : 'false',
    'aria-label': current ? `${who.name}，正在看` : `換到 ${who.name}`,
    onclick: current ? null : () => swap('record', { studentId: who.id, kind: session.kind }),
  }, h('span', { class: who.name.length > 4 ? 'is-long' : null }, who.name), finished(who.id) ? icon('check') : null);
  const names = [name(student, true), name(pair.partner, false)];
  return h('div', { class: 'pair-switch', role: 'group', 'aria-label': `一對二・${kindLabel(session.kind)}` },
    h('h1', { class: 'sr-only' }, student.name),
    ...(pair.first ? names : names.reverse()));
}

/**
 * A drawing area for signatures. Stored small so each class stays a few kilobytes.
 * 2026-11-23 (Apple Pencil kept missing strokes or selecting text): every touch on the pad is claimed so iOS
 * never turns it into text selection, scrolling or handwriting-to-text; once the Pencil has been used, finger and
 * palm touches are ignored; each move draws only its new piece (with the Pencil's in-between points), and a tap leaves a dot.
 */
export function signaturePad(initial) {
  const WIDTH = 600;
  const HEIGHT = 200;
  const el = h('canvas', { class: 'signature', width: WIDTH, height: HEIGHT, 'aria-label': '簽名區' });
  const ctx = el.getContext('2d');
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#020300';
  ctx.fillStyle = '#020300';
  let empty = !initial;
  let stroke = null; // { id, last: [x, y] }
  let penUsed = false;
  if (initial) {
    const image = new Image();
    // Signatures saved before 2026-11-23 are a wider 480×140: keep their shape.
    image.onload = () => {
      const scale = Math.min(WIDTH / image.width, HEIGHT / image.height);
      ctx.drawImage(image, 0, (HEIGHT - image.height * scale) / 2, image.width * scale, image.height * scale);
    };
    image.src = initial;
  }
  const point = (e) => {
    const rect = el.getBoundingClientRect();
    return [(e.clientX - rect.left) * (WIDTH / rect.width), (e.clientY - rect.top) * (HEIGHT / rect.height)];
  };
  // A light Pencil touch reports little pressure; never let that make the line vanish.
  const widthOf = (e) => (e.pointerType === 'pen' && e.pressure > 0 ? 2.2 + e.pressure * 2.2 : 3.2);
  const claim = (e) => { if (e.cancelable) e.preventDefault(); };
  for (const type of ['touchstart', 'touchmove', 'touchend']) el.addEventListener(type, claim, { passive: false });
  el.addEventListener('selectstart', claim);
  el.addEventListener('contextmenu', claim);

  el.addEventListener('pointerdown', (e) => {
    claim(e);
    if (e.pointerType === 'pen') penUsed = true;
    // The hand resting on the screen while signing with the Pencil.
    else if (penUsed && e.pointerType === 'touch') return;
    if (stroke && !(e.pointerType === 'pen' && stroke.type !== 'pen')) return;
    try { el.setPointerCapture(e.pointerId); } catch { /* the pointer may already be gone */ }
    const at = point(e);
    stroke = { id: e.pointerId, type: e.pointerType, last: at };
    empty = false;
    ctx.beginPath();
    ctx.arc(at[0], at[1], widthOf(e) / 2, 0, Math.PI * 2);
    ctx.fill();
  });
  el.addEventListener('pointermove', (e) => {
    if (!stroke || e.pointerId !== stroke.id) return;
    claim(e);
    const events = e.getCoalescedEvents?.().length ? e.getCoalescedEvents() : [e];
    for (const piece of events) {
      const at = point(piece);
      ctx.lineWidth = widthOf(piece);
      ctx.beginPath();
      ctx.moveTo(...stroke.last);
      ctx.lineTo(...at);
      ctx.stroke();
      stroke.last = at;
    }
  });
  const stop = (e) => { if (stroke && e.pointerId === stroke.id) stroke = null; };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  el.addEventListener('lostpointercapture', stop);
  return {
    el,
    clear: () => { ctx.clearRect(0, 0, WIDTH, HEIGHT); empty = true; },
    isEmpty: () => empty,
    toDataUrl: () => el.toDataURL('image/png'),
  };
}
