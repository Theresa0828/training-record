// The in-class screen. A tap changes memory, updates only what it touched, and saves in the background.
import { h, button, holdButton, backButton, go, home, openSheet, toast, dismissActionToast } from './dom.js';
import * as store from './store.js';
import {
  MAX_SETS, DEFAULT_TAGS, DEFAULT_PROPS, chooserOptions, painList, painText, painShort, setPainMap, setText, rowDetails, exerciseHistory, exerciseTrend, ASSIST_LEVELS, dateKey, newId, makeRow, makeSet,
  doneSessions, startingRows, isBpFlagged, expectedDigits, resolveStaleDraft, swapRow, commonSprings, nextClassNumber, classLabel, moveRow, setLoad, equipmentText, BAND,
} from './core.js';
import { kindLabel } from './today.js';
import { exercisePicker, rememberSwaps } from './library.js';
import { handoutButton } from './handout.js';
import { classNumberSheet, nextDateControl, nextDateSheet, nextDateText } from './classinfo.js';
import { springEditor as springControls } from './spring.js';
import { numberSheet } from './numpad.js';
import { icon } from './icons.js';
import { bodyMap } from './bodymap.js';
import { trendChart } from './trend.js';
import { dragHandle } from './sortable.js';
import { termRing } from './charts.js';
import { equipmentControl } from './equipment.js';
import { paramTile } from './param.js';

const SET_NAMES = ['一', '二', '三', '四', '五'];
const STATUS_FLAGS = [['pain', '疼痛'], ['sleep', '睡眠'], ['diet', '飲食'], ['mood', '心情']];
const PANEL_TABS = [['set', '重量次數'], ['feel', '感受與標籤']];
const UNDO_LIMIT = 60;

/** The count runs by itself. Classes opened before it did get their number the first time they open. */
function giveClassNumber(session, student) {
  if (session.classNo) return;
  const history = doneSessions(store.all('sessions'), session.studentId).filter((s) => s.id !== session.id);
  const { no, size } = nextClassNumber(history, student);
  session.classNo = no;
  session.packageSize = size;
  // A number set by hand is for one class only; after that the count carries on from it.
  if (student?.classStart) store.save('students', { ...student, classStart: null, packageSize: size });
}

/** Opens today's session for the student, or starts one from the plan or the last class. */
export function openSession(studentId, kind) {
  const today = dateKey();
  const student = store.get('students', studentId);
  const existing = store.all('sessions').find((s) => s.studentId === studentId && s.date === today);
  if (existing) {
    if (!existing.classNo) {
      giveClassNumber(existing, student);
      store.save('sessions', existing);
    }
    return existing;
  }
  const history = doneSessions(store.all('sessions'), studentId);
  const plan = store.get('plans', studentId);
  const session = {
    id: newId('ses'),
    studentId,
    date: today,
    kind: kind || history[0]?.kind || 'strength',
    status: 'draft',
    rows: startingRows(plan, history),
    bpSys: null,
    bpDia: null,
    hr: null,
    flags: {},
    special: '',
    note: '',
    coachSigned: false,
    studentSignature: null,
    fromPlan: !!(plan && !plan.used && plan.rows?.length),
  };
  if (student?.demo) session.demo = true;
  giveClassNumber(session, student);
  store.save('sessions', session);
  return session;
}

/** Called when a class ends. A plan is only used up here, so opening a student by mistake costs nothing. */
export function finishSession(session) {
  session.status = 'done';
  session.finishedAt = session.finishedAt || new Date().toISOString();
  store.save('sessions', session);
  const plan = store.get('plans', session.studentId);
  if (session.fromPlan && plan && !plan.used) store.save('plans', { ...plan, used: true });
  rememberSwaps(session.rows, session.demo);
}

/** Closes classes left open on earlier days. */
export function settleOldDrafts() {
  const today = dateKey();
  for (const session of store.all('sessions')) {
    const action = resolveStaleDraft(session, today);
    if (action === 'finish') finishSession(session);
    if (action === 'discard') store.save('sessions', { ...session, deleted: true });
  }
}

export function recordView({ studentId, kind }) {
  const student = store.get('students', studentId);
  let session = openSession(studentId, kind);
  const previous = doneSessions(store.all('sessions'), studentId).find((s) => s.id !== session.id);
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
  const finishButton = button(session.status === 'done' ? '更新完成' : '完成上課', () => openFinishSheet(), '');
  const classChip = h('button', { type: 'button', class: 'class-chip', onclick: () => classNumberSheet(studentId, session, paintClassInfo) });
  const nextChip = h('button', { type: 'button', class: 'class-chip', onclick: () => nextDateSheet(studentId, paintClassInfo) });
  const guideText = h('span', { class: 'guide-text', role: 'status' });
  const guide = h('div', { class: 'guide' }, icon('arrow'), guideText);

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
    store.save('sessions', session);
    undoButton.disabled = false;
  }

  function undo() {
    if (!undoStack.length) return;
    dismissActionToast();
    ({ session, selected, mode } = JSON.parse(undoStack.pop()));
    store.save('sessions', session);
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
    nextChip.replaceChildren(icon('today'), h('span', {}, text));
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
      tableBody.append(rowEl);
    });
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
    const meta = [
      equipmentText(row),
      row.rpe ? `RPE ${row.rpe}` : '',
      painList(row).length ? `痛 ${painShort(row)}` : '',
      row.tags.length ? `${row.tags.length} 標籤` : '',
    ].filter(Boolean).join('・');
    name.replaceChildren(h('span', { class: 'grid-name-text' }, row.name), meta ? h('span', { class: 'grid-name-meta' }, meta) : '');
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
    const marked = STATUS_FLAGS.filter(([key]) => session.flags[key]).map(([, label]) => label);
    vitalsFlags.classList.toggle('is-marked', marked.length > 0);
    vitalsFlags.replaceChildren(h('span', { class: 'vital-label' }, '今天狀況'),
      h('span', { class: 'vital-value' }, marked.length ? marked.join('、') : '都正常'));
    noteButton.classList.toggle('is-marked', false);
    noteButton.replaceChildren(h('span', { class: 'vital-label' }, '備註'),
      h('span', { class: 'vital-value' }, session.note || session.special ? '已寫' : '點這裡寫'));
  }

  /** Says in one sentence what to do now, so the screen never leaves the teacher guessing. */
  function guideMessage() {
    if (mode === 'vitals') return '先量血壓和心跳，輸入完會自動跳下一格';
    if (!session.rows.length) return '先加入第一個動作';
    const row = selected && session.rows[selected.row];
    if (isAllDone()) return `全部做完了，按右上角「${session.status === 'done' ? '更新完成' : '完成上課'}」`;
    if (!row) return '點一個動作開始';
    if (mode === 'feel') return `${row.name} 做完了，記一下 RPE 和感受`;
    const set = row.sets[selected.set];
    if (set?.done) return `正在修改 ${row.name} 第${SET_NAMES[selected.set]}組`;
    return `現在做 ${row.name} 第${SET_NAMES[selected.set]}組，做完點亮起的格子`;
  }

  function paintGuide() {
    const allDone = isAllDone();
    finishButton.classList.toggle('primary', allDone);
    finishButton.classList.toggle('is-ready', allDone && session.status !== 'done');
    const message = guideMessage();
    if (message !== lastGuide) {
      lastGuide = message;
      guideText.textContent = message;
      guide.classList.remove('is-new');
      // Reading a layout value restarts the animation.
      void guide.offsetWidth;
      guide.classList.add('is-new');
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
    return springControls(set.spring || '', update, commonSprings(store.all('sessions'), 4));
  }

  function addedOptions(type) {
    return store.all('options').filter((o) => o.type === type).map((o) => o.name);
  }

  function chooser(label, options, current, onPick, className = '', extra = null) {
    return h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, label),
      h('div', { class: `chips ${className}` }, options.map((option) => button(String(option), () => onPick(option), 'chip-btn', {
        'aria-pressed': current === option || (Array.isArray(current) && current.includes(option)) ? 'true' : 'false',
      })), extra));
  }

  function toggleIn(list, value) {
    const index = list.indexOf(value);
    if (index === -1) list.push(value);
    else list.splice(index, 1);
  }

  /** Tab one: the numbers for this set, and the button that finishes it. */
  function setTab() {
    const row = session.rows[selected.row];
    const set = row.sets[selected.set];
    const planText = set ? `計畫 ${setLoad(row, set, false)} × ${set.planReps ?? '—'}` : '';
    const open = row.sets.findIndex((s) => !s.done);
    return [
      h('div', { class: 'panel-head' },
        h('div', { class: 'panel-title' },
          h('strong', {}, row.name),
          set && h('span', { class: 'muted' }, `第${SET_NAMES[selected.set]}組・${planText}`)),
        h('div', { class: 'row-wrap' },
          handoutButton(row.exerciseId),
          h('button', { type: 'button', class: 'btn swap-btn', onclick: () => openSwap(selected.row) }, icon('swap'), h('span', {}, '換動作')))),
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
      set && !set.done && h('button', {
        type: 'button',
        class: 'btn big primary pinned',
        onclick: () => tapSet(selected.row, selected.set),
      }, icon('check'), `第${SET_NAMES[selected.set]}組做完了`),
      set?.done && open !== -1 && h('button', {
        type: 'button',
        class: 'btn big primary pinned',
        onclick: () => { moveOn(selected.row); refresh(); },
      }, `回到第${SET_NAMES[open]}組`, icon('arrow')),
      set && h('div', { class: 'panel-actions' },
        !isRowDone(row) && button('這個動作全部做完', () => {
          mutate(() => row.sets.forEach((s) => { s.done = true; }));
          moveOn(selected.row);
          refresh();
          toast(`${row.name} 已全部標為做完`, { label: '復原', run: undo });
        }, ''),
        set.done && button('這組沒做', () => {
          mutate(() => { set.done = false; });
          refresh();
        }, ''),
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
    return [
      h('div', { class: 'panel-head' }, h('strong', {}, row.name), h('span', { class: 'muted' }, '有才點，沒有就跳過')),
      chooser('RPE', [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], row.rpe, (v) => change(() => { row.rpe = row.rpe === v ? null : v; }), 'chips-10'),
      button(painList(row).length ? `疼痛：${painText(row)}` : '記錄疼痛', () => openPainSheet(row), painList(row).length ? 'alert' : ''),
      row.kind === 'pilates' && chooser('動作品質', [1, 2, 3, 4, 5], row.quality, (v) => change(() => { row.quality = row.quality === v ? null : v; }), 'chips-5'),
      row.kind === 'pilates' && chooser('協助程度', ASSIST_LEVELS, row.assist, (v) => change(() => { row.assist = row.assist === v ? null : v; })),
      chooser('標籤', chooserOptions(DEFAULT_TAGS, addedOptions('tag'), row.tags), row.tags, (v) => change(() => toggleIn(row.tags, v)), '',
        button('＋ 新增', () => openOptionSheet('tag', '標籤', DEFAULT_TAGS, row.tags), 'chip-btn chip-add')),
      chooser('道具', chooserOptions(DEFAULT_PROPS, addedOptions('prop'), row.props), row.props, (v) => change(() => toggleIn(row.props, v)), '',
        button('＋ 新增', () => openOptionSheet('prop', '道具', DEFAULT_PROPS, row.props), 'chip-btn chip-add')),
      next !== -1 && h('button', { type: 'button', class: 'btn big primary pinned', onclick: () => tapRow(next) }, `下一個：${session.rows[next].name}`, icon('arrow')),
      next === -1 && isAllDone() && h('button', { type: 'button', class: 'btn big primary pinned', onclick: () => openFinishSheet() }, session.status === 'done' ? '更新完成' : '完成上課', icon('arrow')),
    ];
  }

  function removeRow() {
    const name = session.rows[selected.row].name;
    mutate(() => session.rows.splice(selected.row, 1));
    selected = session.rows.length ? { row: Math.min(selected.row, session.rows.length - 1), set: 0 } : null;
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
          [1, 2, 3, 4, 5, 6, 7, 8, 9].map((d) => key(String(d))),
          button('清除', () => {
            typed = '';
            mutate(() => { session[fields[index][2]] = null; });
            paintVitals();
            draw();
          }, 'key'),
          key('0'),
          button(session.bpSys || session.hr ? '量好了' : '先跳過', () => setMode('set'), 'key primary')),
        h('div', { class: 'field' },
          h('div', { class: 'stepper-label' }, '今天狀況（有問題才點）'),
          h('div', { class: 'chips chips-4' }, STATUS_FLAGS.map(([flag, label]) => button(label, () => {
            mutate(() => { session.flags[flag] = !session.flags[flag]; });
            paintVitals();
            draw();
          }, 'chip-btn', { 'aria-pressed': session.flags[flag] ? 'true' : 'false' })))));
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
      const parts = mode === 'feel' ? feelTab() : setTab();
      body.append(...parts.filter(Boolean));
      panel.replaceChildren(panelTabs(), body);
    } else {
      body.append(h('div', { class: 'stack' },
        h('p', {}, '還沒有動作。加入第一個動作就可以開始記錄。'),
        button('加入動作', openPicker, 'big primary')));
      panel.replaceChildren(body);
    }
    // Keeps the buttons under the finger when the same tab redraws after a tap.
    panel.scrollTop = changed ? 0 : previousScroll;
    drawnMode = mode;
    bumped = null;
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
    const scores = Object.fromEntries(painList(row).filter((p) => p.part).map((p) => [p.part, p.score]));
    let active = Object.keys(scores).at(-1) || null;
    const save = () => mutate(() => setPainMap(row, { ...scores }));
    openSheet(`疼痛：${row.name}`, (close) => {
      const picked = h('div', { class: 'body-picked' });
      const keypad = h('div', {});
      const remove = (part) => {
        const score = scores[part];
        delete scores[part];
        active = Object.keys(scores).at(-1) || null;
        save();
        draw();
        toast(`已移除 ${part}`, { label: '復原', run: () => { scores[part] = score; active = part; save(); draw(); } });
      };
      // The first tap marks a part and a tap on another marked part moves to it. Taking one off needs the held button.
      const tapPart = (part) => {
        if (part === active) return;
        if (!(part in scores)) {
          scores[part] = null;
          save();
        }
        active = part;
        draw();
      };
      const map = bodyMap(tapPart);
      const note = h('textarea', { class: 'input pain-note', placeholder: '例如：下蹲到底才痛、刺痛', 'aria-label': '疼痛附註', oninput: () => {
        row.painNote = note.value;
        store.save('sessions', session);
      } });
      note.value = row.painNote || '';
      const draw = () => {
        map.update(scores, active);
        picked.replaceChildren(...(Object.keys(scores).length
          ? Object.entries(scores).map(([part, score]) => button(score === null ? part : `${part} ${score}`, () => { active = part; draw(); }, 'chip-btn', { 'aria-pressed': part === active ? 'true' : 'false' }))
          : [h('p', { class: 'muted' }, '點圖上會痛的地方，再選分數')]));
        keypad.replaceChildren(active ? h('div', { class: 'field' },
          h('div', { class: 'row-between' },
            h('div', { class: 'pain-target' }, `${active} 的疼痛分數`),
            holdButton('移除這個部位', () => remove(active), 'ghost danger-text')),
          h('div', { class: 'chips chips-11' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => button(String(value), () => {
            scores[active] = value;
            save();
            draw();
          }, 'chip-btn', { 'aria-pressed': scores[active] === value ? 'true' : 'false' })))) : '');
      };
      draw();
      return h('div', { class: 'stack' }, map.el, picked, keypad,
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '疼痛附註'), note),
        button('完成', () => { close(); refresh(); }, 'big primary'));
    });
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
    openSheet('備註', (close) => {
      const special = h('input', { class: 'input', value: session.special || '', placeholder: '特殊狀況', 'aria-label': '特殊狀況' });
      const note = h('textarea', { class: 'input note-area', 'aria-label': '備註' });
      note.value = session.note || '';
      const save = () => {
        session.special = special.value;
        session.note = note.value;
        store.save('sessions', session);
        paintVitals();
      };
      special.addEventListener('input', save);
      note.addEventListener('input', save);
      return h('div', { class: 'stack' },
        h('p', { class: 'muted' }, '可以直接用 Apple Pencil 在框內手寫，iPad 會轉成文字。'),
        special, note, button('完成', close, 'big primary'));
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
        h('div', { class: 'stack' },
          h('div', { class: 'stepper-label' }, `教練簽名：${coachSignature ? '已帶入' : '已帶入姓名（可到設定存手寫簽名）'}`),
          h('div', { class: 'row-between' }, h('div', { class: 'stepper-label' }, '請學生在下面簽名'), button('重簽', () => canvas.clear(), 'ghost')),
          canvas.el),
        h('div', { class: 'stack' },
          button('儲存紀錄', () => finish(canvas.isEmpty() ? null : canvas.toDataUrl()), 'big primary'),
          button('先不簽，稍後補', () => finish(null), 'ghost')));

      function finish(signature) {
        session.coachSigned = true;
        session.studentSignature = signature;
        finishSession(session);
        store.save('students', { ...store.get('students', studentId), nextNotes: notes.value, isNew: false });
        close();
        toast(`${student.name} 的紀錄已儲存`);
        home();
      }
    });
  }

  buildGrid();

  const screen = h('div', { class: 'screen record' },
    h('header', { class: 'topbar' },
      backButton(),
      h('h1', {}, student.name, h('small', {}, kindLabel(session.kind))),
      h('div', { class: 'class-chips' }, classChip, nextChip),
      h('div', { class: 'topbar-actions' },
        button('總覽', () => go('overview', { studentId }), 'ghost'),
        undoButton,
        finishButton)),
    guide,
    (student.contraindications || student.nextNotes) && h('div', { class: 'banner' },
      icon('warn'),
      h('div', {},
        student.contraindications && h('p', {}, `禁忌：${student.contraindications}`),
        student.nextNotes && h('p', {}, `注意：${student.nextNotes}`))),
    h('div', { class: 'vitals' }, vitalsBp, vitalsHr, vitalsFlags, noteButton),
    h('div', { class: 'record-main' },
      h('div', { class: 'grid' },
        h('div', { class: 'grid-head' },
          h('button', { type: 'button', class: 'grid-add', 'aria-label': '加入動作', onclick: openPicker }, icon('plus'), h('span', { class: 'grid-add-text' }, '加入動作')),
          SET_NAMES.map((n) => h('span', {}, `第${n}組`))),
        tableBody),
      panel));

  refresh();
  return screen;
}

/** A drawing area for signatures. Stored small so each class stays a few kilobytes. */
export function signaturePad(initial) {
  const WIDTH = 480;
  const HEIGHT = 140;
  const el = h('canvas', { class: 'signature', width: WIDTH, height: HEIGHT, 'aria-label': '簽名區' });
  const ctx = el.getContext('2d');
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.strokeStyle = '#020300';
  let drawing = false;
  let empty = !initial;
  if (initial) {
    const image = new Image();
    image.onload = () => ctx.drawImage(image, 0, 0);
    image.src = initial;
  }
  const point = (e) => {
    const rect = el.getBoundingClientRect();
    return [(e.clientX - rect.left) * (WIDTH / rect.width), (e.clientY - rect.top) * (HEIGHT / rect.height)];
  };
  el.addEventListener('pointerdown', (e) => {
    drawing = true;
    empty = false;
    el.setPointerCapture(e.pointerId);
    ctx.beginPath();
    ctx.moveTo(...point(e));
  });
  el.addEventListener('pointermove', (e) => {
    if (!drawing) return;
    ctx.lineTo(...point(e));
    ctx.stroke();
  });
  const stop = () => { drawing = false; };
  el.addEventListener('pointerup', stop);
  el.addEventListener('pointercancel', stop);
  return {
    el,
    clear: () => { ctx.clearRect(0, 0, WIDTH, HEIGHT); empty = true; },
    isEmpty: () => empty,
    toDataUrl: () => el.toDataURL('image/png'),
  };
}
