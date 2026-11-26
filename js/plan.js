// Plans the next class: starts from last time, then the teacher tweaks it.
// 2026-11-26: the goal, the movement problems and this class's small goal (學生看得到) are open beside the list; each
// exercise takes props and a note; an exercise goes with a swipe to the left, like in class.
import { h, button, holdButton, back, backButton, go, openSheet, toast, dismissActionToast } from './dom.js';
import * as store from './store.js';
import {
  MAX_SETS, doneSessions, rowsFromSession, makeRow, makeSet, suggestProgression, applySuggestion, swapRow, commonSprings, moveRow, BAND,
  springKind, springForApparatus, patternCounts, dateKey, addDays, dateWithWeek, bookingFrom, partnerFor, planForPartner, ownHistory,
  DEFAULT_PROPS, DEFAULT_TAGS, chooserOptions, noteHasTag, toggleNoteTag, newId, latestAssessment, problemText, PROBLEM_STATUS, startingRows,
} from './core.js';
import { me, team, mine, myPlan, myPlanId } from './team.js';
import { exercisePicker, rememberSwaps } from './library.js';
import { handoutButton } from './handout.js';
import { springEditor } from './spring.js';
import { numberSheet } from './numpad.js';
import { icon } from './icons.js';
import { dragHandle } from './sortable.js';
import { equipmentControl } from './equipment.js';
import { lastClassCard } from './history.js';
import { paramTile, paramChoice } from './param.js';
import { swipeToDelete } from './swipe.js';
import { assessmentSheet, editAssessment, latestSummary } from './assess.js';
import { editProfileSheet } from './overview.js';

const STATUS_LABEL = Object.fromEntries(PROBLEM_STATUS);

/** The apparatus of a Pilates row, which decides its springs. */
export function apparatusOf(row) {
  return store.get('exercises', row.exerciseId)?.group || '';
}

/** The settings used most on the same kind of apparatus, written as this apparatus writes them now. */
export function apparatusSprings(row, limit = 4) {
  const apparatus = apparatusOf(row);
  const kind = springKind(apparatus);
  return commonSprings(store.all('sessions'), limit, (r) => r.kind === 'pilates' && springKind(apparatusOf(r)) === kind,
    (text) => springForApparatus(text, apparatus));
}

/** The props or note tags the teacher added of their own. */
function ownOptions(type) {
  return store.all('options').filter((o) => o.type === type).map((o) => o.name);
}

/**
 * Who shares the student's next class, when it is a 1:2 class (2026-11-24). A class already finished today is behind
 * us, so the next one is looked for from tomorrow.
 */
function nextBooking(studentId) {
  const today = dateKey();
  const doneToday = store.all('sessions').some((s) => s.studentId === studentId && s.date === today && s.status === 'done' && mine(s));
  return bookingFrom(store.all('events'), store.all('students'), studentId, doneToday ? addDays(today, 1) : today);
}

function nextPair(studentId) {
  const booking = nextBooking(studentId);
  const partner = partnerFor(store.all('events'), store.all('students'), booking);
  return partner ? { partner, booking } : null;
}

/** An unused plan of this teacher's for the student, which a copy would replace. */
function ownPlan(studentId) {
  const plan = myPlan(studentId);
  return plan && !plan.used && plan.rows?.length ? plan : null;
}

/** Whose plan it is (2026-11-26): each teacher plans their own next class. Nothing before colleagues. */
function planOwner(studentId) {
  const who = me();
  return who ? { studentId, staffId: who.id } : {};
}

/** Gives the partner the same exercises with their own last weights. Returns what was there before, for undo. */
function copyToPartner(rows, partner) {
  const id = myPlanId(partner.id);
  const before = store.get('plans', id) || null;
  const { rows: copied } = planForPartner(rows, doneSessions(store.all('sessions'), partner.id));
  store.save('plans', { ...(before || {}), id, ...planOwner(partner.id), rows: copied, used: false, ...(partner.demo ? { demo: true } : {}) });
  return before;
}

/** A saved plan, or last time's exercises. A plan holding only the small goal still shows last time's exercises. */
function loadPlan(studentId, history) {
  const saved = myPlan(studentId);
  const fromHistory = () => (history.length ? rowsFromSession(history[0]) : []);
  if (saved && !saved.used && (saved.rows?.length || saved.classGoal)) {
    const copy = JSON.parse(JSON.stringify(saved));
    // startingRows also writes an old Reformer bar the new way.
    copy.rows = copy.rows?.length ? startingRows(copy, []) : fromHistory();
    return copy;
  }
  return { id: myPlanId(studentId), ...planOwner(studentId), rows: fromHistory(), used: false };
}

export function planView({ studentId }) {
  const student = store.get('students', studentId);
  // A teacher plans from their own classes; a new teacher from the student's classes of the booked kind (2026-11-26).
  const history = ownHistory(doneSessions(store.all('sessions'), studentId), team(), me(), nextBooking(studentId)?.kind || '');
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

  // Until an exercise is changed, the list shown is only last time's, so writing the small goal alone keeps the plan
  // empty and the student stays on 還沒排課表 (2026-11-26).
  let rowsSaved = !!ownPlan(studentId);
  function persist() {
    store.save('plans', plan);
    rowsSaved = true;
    undoButton.disabled = undoStack.length === 0;
  }

  function saveGoal() {
    store.save('plans', rowsSaved ? plan : { ...plan, rows: [] });
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
        }, apparatusSprings(row), apparatusOf(row)),
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

  /** Props and a note for one exercise (2026-11-26): what to bring and what to watch, shown on it in class. */
  function extrasButton(row) {
    const bits = [...(row.props || []), String(row.planNote || '').trim()].filter(Boolean);
    return h('button', {
      type: 'button',
      class: `plan-extra${bits.length ? ' is-set' : ''}`,
      'aria-label': `${row.name} 的道具和備註：${bits.join('、') || '還沒有'}，點一下修改`,
      onclick: () => extrasSheet(row),
    }, icon(bits.length ? 'pencil' : 'plus'), h('span', { class: 'plan-extra-text' }, bits.length ? bits.join('・') : '道具、備註'));
  }

  function extrasSheet(row) {
    openSheet(`${row.name}：道具和備註`, (close) => {
      const status = h('p', { class: 'muted small', role: 'status' }, '改了會自動儲存。上課時會顯示在這個動作上。');
      const saved = () => { status.textContent = '已自動儲存'; };
      const props = h('div', { class: 'chips' });
      const tags = h('div', { class: 'chips' });
      const note = h('textarea', { class: 'input', placeholder: '例：膝蓋對準腳尖、慢慢下', 'aria-label': `${row.name} 的動作備註` });
      note.value = row.planNote || '';
      const setNote = (value) => {
        row.planNote = value;
        persist();
        saved();
      };
      note.addEventListener('input', () => { setNote(note.value); paintTags(); });
      function paintProps() {
        props.replaceChildren(...chooserOptions(DEFAULT_PROPS, ownOptions('prop'), row.props || []).map((name) => button(name, () => {
          change(() => {
            row.props = row.props || [];
            const at = row.props.indexOf(name);
            if (at === -1) row.props.push(name);
            else row.props.splice(at, 1);
          });
          saved();
          paintProps();
        }, 'chip-btn', { 'aria-pressed': (row.props || []).includes(name) ? 'true' : 'false' })));
      }
      // The class's usual notes take one tap; a tap again takes the word back out of the note.
      function paintTags() {
        tags.replaceChildren(...chooserOptions(DEFAULT_TAGS, ownOptions('tag')).map((tag) => button(tag, () => {
          note.value = toggleNoteTag(note.value, tag);
          setNote(note.value);
          paintTags();
        }, 'chip-btn', { 'aria-pressed': noteHasTag(note.value, tag) ? 'true' : 'false' })));
      }
      const newProp = h('input', { class: 'input', maxlength: 20, placeholder: '新增道具', 'aria-label': '新增道具名稱' });
      const addProp = () => {
        const name = newProp.value.trim();
        if (!name) { toast('名稱不可空白'); return; }
        if (!DEFAULT_PROPS.includes(name) && !ownOptions('prop').includes(name)) store.save('options', { id: newId('opt'), type: 'prop', name });
        if (!(row.props || []).includes(name)) change(() => { row.props = [...(row.props || []), name]; });
        newProp.value = '';
        saved();
        paintProps();
      };
      newProp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addProp(); });
      paintProps();
      paintTags();
      return h('div', { class: 'stack' },
        status,
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '道具'), props,
          h('div', { class: 'add-line' }, newProp, button('加入', addProp, ''))),
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '動作備註'), tags, note),
        button('完成', close, 'big primary'));
    }, { onClose: draw });
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
    // The number is big enough to read at arm's length (2026-11-26); 換動作 is its picture alone, as in class.
    const body = h('div', { class: 'plan-row-body stack-sm' },
      h('div', { class: 'plan-row-head' },
        handle,
        h('span', { class: 'plan-no' }, String(index + 1)),
        h('strong', { class: 'plan-row-title' }, row.name),
        h('div', { class: 'plan-row-tools' },
          handoutButton(row.exerciseId),
          h('button', { type: 'button', class: 'btn swap-btn', 'aria-label': `換動作：${row.name}`, onclick: () => swapExercise(row, index) }, icon('swap')))),
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
        setsTile(row)),
      extrasButton(row));
    const rowEl = h('div', { class: 'plan-row' }, body);
    // Swipe left, then tap 刪除, as on the class list (2026-11-26, 刪除動作的方式改成左滑點刪除); undo stays.
    swipeToDelete(rowEl, row.name, () => {
      change(() => plan.rows.splice(index, 1));
      toast(`已移除 ${row.name}`, { label: '復原', run: undoOnce });
    });
    return rowEl;
  }

  // How many strength exercises of each category, so a missing one shows at a glance (2026-11-24).
  const balance = h('p', { class: 'plan-balance', 'aria-live': 'polite' });
  function drawBalance() {
    const counts = patternCounts(plan.rows, (id) => store.get('exercises', id));
    balance.hidden = !counts.length;
    balance.replaceChildren(h('span', { class: 'muted small' }, '這堂重訓'),
      ...counts.map((c) => h('span', { class: 'balance-item' }, c.short, h('strong', {}, String(c.count)))));
  }

  function draw() {
    list.replaceChildren(...plan.rows.map(rowCard));
    if (!plan.rows.length) list.append(h('p', { class: 'muted' }, '還沒有動作，先加入第一個。'));
    drawBalance();
  }

  draw();

  // 排課排一次兩位都帶入，再各自微調 (2026-11-24): a partner without a plan of their own gets this one at 排好了.
  // Once they have one, it is theirs to adjust, so it is only replaced on purpose with the hold button.
  const pair = nextPair(studentId);
  const pairNote = h('section', { class: 'callout stack-sm pair-note' });
  function drawPair() {
    if (!pair) return;
    const { partner, booking } = pair;
    const theirs = ownPlan(partner.id);
    // replaceChildren writes null as text, so the empty item is filtered out first.
    pairNote.replaceChildren(...[
      h('p', { class: 'pair-note-title' }, `一對二：和 ${partner.name} 一起上`, h('small', {}, ` ${dateWithWeek(booking.date)}${booking.time ? ` ${booking.time}` : ''}`)),
      h('p', { class: 'muted' }, theirs
        ? `${partner.name} 已經有自己的課表，不會被這份蓋掉。`
        : `按「排好了」會一起帶入 ${partner.name} 的課表，重量和次數用 ${partner.name} 上次做的。`),
      theirs && holdButton(`用這份蓋掉 ${partner.name} 的課表`, () => {
        if (!plan.rows.length) { toast('請先加入動作'); return; }
        const before = copyToPartner(plan.rows, partner);
        drawPair();
        toast(`已帶入 ${partner.name} 的課表`, { label: '復原', run: () => { store.save('plans', before); drawPair(); } });
      }, 'ghost'),
      button(`看 ${partner.name} 的課表`, () => go('plan', { studentId: partner.id }), 'ghost'),
    ].filter(Boolean));
  }
  drawPair();

  /** 本堂小目標 (2026-11-26): one line for this class that the student also sees on today's report. */
  function classGoalCard() {
    const area = h('textarea', { class: 'input class-goal-input', placeholder: '例：深蹲時膝蓋對準腳尖', 'aria-label': '本堂小目標，學生看得到' });
    area.value = plan.classGoal || '';
    const status = h('span', { class: 'muted small', role: 'status' }, '學生看得到');
    area.addEventListener('input', () => {
      plan.classGoal = area.value;
      saveGoal();
      status.textContent = '已自動儲存・學生看得到';
    });
    return h('section', { class: 'plan-card class-goal-card stack-sm' },
      h('div', { class: 'plan-card-head' }, h('h2', { class: 'plan-card-title' }, '本堂小目標'), status),
      area);
  }

  const editButton = (label, onclick) => h('button', { type: 'button', class: 'btn ghost plan-card-edit', 'aria-label': label, onclick }, icon('pencil'));

  /** The training goal with the latest summary under it, the two read together as on the profile. */
  function goalCard() {
    const summary = latestSummary(student);
    return h('section', { class: 'plan-card stack-sm' },
      h('div', { class: 'plan-card-head' }, h('h2', { class: 'plan-card-title' }, '訓練目標'),
        editButton('修改訓練目標', () => editProfileSheet(store.get('students', studentId) || student))),
      h('p', { class: student.goal ? 'plan-card-text' : 'muted' }, student.goal || '還沒填寫'),
      summary && h('div', { class: 'plan-card-sub' }, h('span', { class: 'muted small' }, `問題總結・${summary.date}`), h('p', {}, summary.text)));
  }

  /** Movement problems still there at the latest assessment, each with where it stands. */
  function problemsCard() {
    const latest = latestAssessment(student);
    const open = (latest?.problems || []).filter((p) => p.status !== 'solved');
    return h('section', { class: 'plan-card stack-sm' },
      h('div', { class: 'plan-card-head' }, h('h2', { class: 'plan-card-title' }, '動作問題'),
        editButton(latest ? '看動作問題、新增評估' : '新增評估', () => (latest ? assessmentSheet(student) : editAssessment(student)))),
      latest
        ? (open.length
          ? h('ul', { class: 'plan-problems' }, open.map((p) => h('li', {}, h('span', {}, problemText(p)),
            h('span', { class: `problem-status is-${p.status || 'open'}` }, STATUS_LABEL[p.status || 'open']))))
          : h('p', { class: 'muted' }, '問題都解決了'))
        : h('p', { class: 'muted' }, '還沒評估'),
      latest && h('p', { class: 'muted small' }, `${latest.date.slice(5).replace('-', '/')} 評估`));
  }

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
          const partner = pair && !ownPlan(pair.partner.id) ? pair.partner : null;
          if (partner) copyToPartner(plan.rows, partner);
          back();
          if (partner) toast(`課表已儲存，也帶入了 ${partner.name} 的課表`, { label: `看 ${partner.name} 的`, run: () => go('plan', { studentId: partner.id }) });
          else toast('課表已儲存，下次上課會自動帶入');
        }, 'primary'))),
    // Narrow screens read cards, exercises, then last class; a wide one keeps cards and last class in the side column.
    h('main', { class: 'page plan-layout' },
      h('div', { class: 'plan-aside' },
        h('div', { class: 'plan-side' },
          pair && pairNote,
          classGoalCard(),
          (student.contraindications || student.nextNotes) && h('section', { class: 'callout stack-sm plan-alert' },
            student.contraindications && h('p', { class: 'contra' }, `禁忌：${student.contraindications}`),
            student.nextNotes && h('p', {}, `注意：${student.nextNotes}`)),
          goalCard(),
          problemsCard()),
        h('div', { class: 'plan-ref stack' },
          last
            ? lastClassCard(last)
            : h('p', { class: 'muted' }, '這位學生還沒有紀錄'),
          button('看完整總覽', () => go('overview', { studentId }), 'ghost'))),
      h('div', { class: 'plan-main stack' },
        balance,
        list,
        button('＋ 加入動作', () => openSheet('加入動作', (close) => exercisePicker(last?.kind || 'strength', (exercise) => {
          close();
          change(() => plan.rows.push(makeRow(exercise, 3)));
        }), { wide: true }), 'add-row'))));
}
