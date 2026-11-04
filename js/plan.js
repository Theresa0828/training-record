// Plans the next class: starts from last time, then the teacher tweaks it.
import { h, button, back, backButton, go, openSheet, toast, dismissActionToast } from './dom.js';
import * as store from './store.js';
import { MAX_SETS, doneSessions, rowsFromSession, makeRow, makeSet, suggestProgression, applySuggestion, sessionSummary, swapRow, commonSprings } from './core.js';
import { exercisePicker, rememberSwaps } from './library.js';
import { springEditor } from './spring.js';
import { numberSheet } from './numpad.js';
import { icon } from './icons.js';
import { kindLabel } from './today.js';

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

  function step(row, field, delta) {
    return h('button', {
      type: 'button',
      class: 'btn step',
      'data-repeat': true,
      'aria-label': `${row.name} ${field === 'weight' ? '重量' : '次數'} ${delta > 0 ? '加' : '減'} ${Math.abs(delta)}`,
      onclick: () => adjust(row, field, delta),
    }, `${delta > 0 ? '+' : '−'}${Math.abs(delta)}`);
  }

  function setsControl(row) {
    return h('div', { class: 'plan-control' },
      h('span', { class: 'stepper-label' }, '組數'),
      h('button', {
        type: 'button',
        class: 'btn step',
        disabled: row.sets.length <= 1,
        'aria-label': `${row.name} 減少一組`,
        onclick: () => change(() => row.sets.pop()),
      }, '−'),
      h('span', { class: 'stepper-value' }, row.sets.length),
      h('button', {
        type: 'button',
        class: 'btn step',
        disabled: row.sets.length >= MAX_SETS,
        'aria-label': `${row.name} 增加一組`,
        onclick: () => change(() => row.sets.push(makeSet(row.sets[row.sets.length - 1] || {}))),
      }, '+'));
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
    return h('div', { class: 'plan-control' }, h('span', { class: 'stepper-label' }, '彈簧'),
      button(row.sets[0]?.spring || '選擇彈簧', open, 'plan-spring', { 'aria-label': `${row.name} 彈簧` }));
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
    const suggestion = !dismissed.has(row.id) && suggestProgression(row.exerciseId, history);
    const alreadyApplied = suggestion && row.sets[0]?.weight >= suggestion.to;
    const first = row.sets[0] || {};
    return h('div', { class: 'plan-row stack-sm' },
      h('div', { class: 'row-between' },
        h('strong', {}, `${index + 1}. ${row.name}`),
        h('div', { class: 'row-wrap' },
          h('button', { type: 'button', class: 'btn swap-btn', onclick: () => swapExercise(row, index) }, icon('swap'), h('span', {}, '換動作')),
          button('上移', () => change(() => { plan.rows.splice(index - 1, 0, plan.rows.splice(index, 1)[0]); }), 'ghost', { disabled: index === 0 }),
          button('移除', () => {
            change(() => plan.rows.splice(index, 1));
            toast(`已移除 ${row.name}`, { label: '復原', run: undoOnce });
          }, 'ghost'))),
      suggestion && !alreadyApplied && h('div', { class: 'suggestion' },
        h('span', {}, `連續兩次達標，建議 ${suggestion.from} → ${suggestion.to} kg`),
        button('採用', () => change(() => applySuggestion(row, suggestion)), 'primary'),
        button('不用', () => { dismissed.add(row.id); draw(); }, 'ghost')),
      h('div', { class: 'plan-controls' },
        row.kind === 'pilates'
          ? springControl(row)
          : h('div', { class: 'plan-control' }, h('span', { class: 'stepper-label' }, '重量'),
            step(row, 'weight', -2.5), step(row, 'weight', -1),
            h('button', { type: 'button', class: 'stepper-value value-tap', 'aria-label': `${row.name} 直接輸入重量`, onclick: () => typeValue(row, 'weight', '重量', 'kg') }, first.weight || '自體'),
            step(row, 'weight', 1), step(row, 'weight', 2.5)),
        h('div', { class: 'plan-control' }, h('span', { class: 'stepper-label' }, '次數'),
          step(row, 'reps', -1),
          h('button', { type: 'button', class: 'stepper-value value-tap', 'aria-label': `${row.name} 直接輸入次數`, onclick: () => typeValue(row, 'reps', '次數', '') }, first.reps ?? '—'),
          step(row, 'reps', 1)),
        setsControl(row)));
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
    h('main', { class: 'page stack' },
      h('section', { class: 'callout stack-sm' },
        student.contraindications && h('p', { class: 'contra' }, `禁忌：${student.contraindications}`),
        student.nextNotes && h('p', {}, `注意：${student.nextNotes}`),
        last
          ? h('p', { class: 'muted' }, `已複製上次（${last.date.replaceAll('-', '/')}・${kindLabel(last.kind)}・完成 ${sessionSummary(last).percent}%）的實際內容`)
          : h('p', { class: 'muted' }, '這位學生還沒有紀錄'),
        button('看完整總覽', () => go('overview', { studentId }), 'ghost')),
      list,
      button('＋ 加入動作', () => openSheet('加入動作', (close) => exercisePicker(last?.kind || 'strength', (exercise) => {
        close();
        change(() => plan.rows.push(makeRow(exercise, 3)));
      }), { wide: true }), 'add-row')));
}
