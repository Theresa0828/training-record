// Plans the next class: starts from last time, then the teacher tweaks it.
import { h, button, holdButton, back, backButton, go, openSheet, toast, dismissActionToast } from './dom.js';
import * as store from './store.js';
import { MAX_SETS, doneSessions, rowsFromSession, makeRow, makeSet, suggestProgression, applySuggestion, swapRow, commonSprings, moveRow, BAND } from './core.js';
import { exercisePicker, rememberSwaps } from './library.js';
import { handoutButton } from './handout.js';
import { springEditor } from './spring.js';
import { numberSheet } from './numpad.js';
import { icon } from './icons.js';
import { dragHandle } from './sortable.js';
import { equipmentControl } from './equipment.js';
import { lastClassCard } from './history.js';
import { paramTile, paramChoice } from './param.js';

function loadPlan(studentId, history) {
  const saved = store.get('plans', studentId);
  if (saved && !saved.used && saved.rows?.length) return JSON.parse(JSON.stringify(saved));
  return { id: studentId, rows: history.length ? rowsFromSession(history[0]) : [], used: false };
}

export function planView({ studentId }) {
  const student = store.get('students', studentId);
  const history = doneSessions(store.all('sessions'), studentId);
  const last = history[0];
  const plan = loadPlan(studentId, history);
  if (student.demo) plan.demo = true;
  const list = h('div', { class: 'stack' });
  const dismissed = new Set();
  const undoStack = [];
  const undoButton = button('復原', () => {
    if (!undoStack.length) return;
    dismissActionToast();
    plan.rows = JSON.parse(undoStack.pop());
    persist();
    draw();
  }, 'ghost', { disabled: true });

  function persist() {
    store.save('plans', plan);
    undoButton.disabled = undoStack.length === 0;
  }

  function undoOnce() {
    undoButton.click();
  }

  function change(fn) {
    undoStack.push(JSON.stringify(plan.rows));
    fn();
    persist();
    draw();
  }

  /** The first set's value is written to every set of the exercise, since sets are usually equal. */
  function adjust(row, field, delta) {
    change(() => {
      for (const set of row.sets) {
        const value = Math.max(0, Math.round((set[field] + delta) * 100) / 100);
        set[field] = value;
        if (field === 'weight') set.planWeight = value;
        if (field === 'reps') set.planReps = value;
      }
    });
  }

  /** Types a value directly, for a jump too big for the plus and minus buttons. */
  function typeValue(row, field, label, unit) {
    numberSheet(`${row.name} ${label}`, row.sets[0]?.[field] ?? 0, unit, field === 'weight', (value) => {
      change(() => {
        for (const set of row.sets) {
          set[field] = value;
          if (field === 'weight') set.planWeight = value;
          if (field === 'reps') set.planReps = value;
        }
      });
    });
  }

  // A plan is set once, so each box has one step each way; any other number is typed by tapping it.
  function weightTile(row) {
    const weight = row.sets[0]?.weight || 0;
    return paramTile({
      name: row.name, label: '重量', iconName: 'dumbbell', value: weight,
      text: weight ? String(weight) : '自體', unit: weight ? 'kg' : '',
      steps: [2], min: 0, className: 'param-weight',
      onStep: (delta) => adjust(row, 'weight', delta),
      onTap: () => typeValue(row, 'weight', '重量', 'kg'),
    });
  }

  function repsTile(row) {
    const reps = row.sets[0]?.reps ?? 0;
    return paramTile({
      name: row.name, label: '次數', iconName: 'repeat', value: reps, unit: '下',
      steps: [1], min: 0,
      onStep: (delta) => adjust(row, 'reps', delta),
      onTap: () => typeValue(row, 'reps', '次數', ''),
    });
  }

  function setsTile(row) {
    return paramTile({
      name: row.name, label: '組數', iconName: 'layers', value: row.sets.length, unit: '組',
      steps: [1], min: 1, max: MAX_SETS,
      onStep: (delta) => change(() => {
        if (delta < 0) row.sets.pop();
        else row.sets.push(makeSet(row.sets[row.sets.length - 1] || {}));
      }),
    });
  }

  function springControl(row) {
    const open = () => openSheet(`${row.name} 的彈簧`, (close) => {
      const area = h('div', { class: 'stack' });
      const paint = () => area.replaceChildren(
        springEditor(row.sets[0]?.spring || '', (text) => {
          change(() => {
            for (const set of row.sets) {
              set.spring = text;
              set.planSpring = text;
            }
          });
          paint();
        }, commonSprings(store.all('sessions'), 4)),
        button('完成', close, 'big primary'));
      paint();
      return area;
    });
    return paramChoice({ label: '彈簧', iconName: 'spring', text: row.sets[0]?.spring || '選擇', ariaLabel: `${row.name} 彈簧 ${row.sets[0]?.spring || '未選'}，點一下選擇`, onTap: open });
  }

  /** Two taps: this button, then the replacement. */
  function swapExercise(row, index) {
    openSheet(`把 ${row.name} 換成`, (close) => exercisePicker(row.kind, (exercise) => {
      close();
      change(() => swapRow(plan.rows, index, exercise, history));
      toast(`已換成 ${exercise.name}`, { label: '復原', run: undoOnce });
    }, { current: store.get('exercises', row.exerciseId) || { id: row.exerciseId, name: row.name, kind: row.kind } }), { wide: true });
  }

  function rowCard(row, index) {
    const suggestion = !dismissed.has(row.id) && row.equipment !== BAND && suggestProgression(row.exerciseId, history);
    const alreadyApplied = suggestion && row.sets[0]?.weight >= suggestion.to;
    const handle = dragHandle({
      name: row.name,
      index,
      count: plan.rows.length,
      getRow: () => rowEl,
      getList: () => list,
      onMove: (from, to) => change(() => moveRow(plan.rows, from, to)),
    });
    const rowEl = h('div', { class: 'plan-row stack-sm' },
      h('div', { class: 'row-between' },
        h('div', { class: 'plan-row-name' }, handle, h('strong', {}, `${index + 1}. ${row.name}`)),
        h('div', { class: 'row-wrap' },
          handoutButton(row.exerciseId),
          h('button', { type: 'button', class: 'btn swap-btn', onclick: () => swapExercise(row, index) }, icon('swap'), h('span', {}, '換動作')),
          holdButton('移除', () => {
            change(() => plan.rows.splice(index, 1));
            toast(`已移除 ${row.name}`, { label: '復原', run: undoOnce });
          }, 'ghost danger-text'))),
      suggestion && !alreadyApplied && h('div', { class: 'suggestion' },
        h('span', {}, `連續兩次達標，建議 ${suggestion.from} → ${suggestion.to} kg`),
        button('採用', () => change(() => applySuggestion(row, suggestion)), 'primary'),
        button('不用', () => { dismissed.add(row.id); draw(); }, 'ghost')),
      row.kind === 'strength' && equipmentControl(row, (equipment, band) => {
        if (equipment === null) { draw(); return; }
        change(() => {
          row.equipment = equipment;
          row.band = band;
        });
      }),
      h('div', { class: 'param-grid' },
        row.kind === 'pilates' && springControl(row),
        row.kind === 'strength' && row.equipment !== BAND && weightTile(row),
        repsTile(row),
        setsTile(row)));
    return rowEl;
  }

  function draw() {
    list.replaceChildren(...plan.rows.map(rowCard));
    if (!plan.rows.length) list.append(h('p', { class: 'muted' }, '還沒有動作，先加入第一個。'));
  }

  draw();

  return h('div', { class: 'screen' },
    h('header', { class: 'topbar' },
      backButton(),
      h('h1', {}, student.name, h('small', {}, '下次課表')),
      h('div', { class: 'topbar-actions' },
        undoButton,
        button('排好了', () => {
          if (!plan.rows.length) { toast('請先加入動作'); return; }
          persist();
          rememberSwaps(plan.rows, plan.demo);
          toast('課表已儲存，下次上課會自動帶入');
          back();
        }, 'primary'))),
    h('main', { class: 'page plan-layout' },
      h('div', { class: 'plan-side stack' },
        (student.contraindications || student.nextNotes) && h('section', { class: 'callout stack-sm' },
          student.contraindications && h('p', { class: 'contra' }, `禁忌：${student.contraindications}`),
          student.nextNotes && h('p', {}, `注意：${student.nextNotes}`)),
        last
          ? lastClassCard(last)
          : h('p', { class: 'muted' }, '這位學生還沒有紀錄'),
        button('看完整總覽', () => go('overview', { studentId }), 'ghost')),
      h('div', { class: 'plan-main stack' },
        list,
        button('＋ 加入動作', () => openSheet('加入動作', (close) => exercisePicker(last?.kind || 'strength', (exercise) => {
          close();
          change(() => plan.rows.push(makeRow(exercise, 3)));
        }), { wide: true }), 'add-row'))));
}
