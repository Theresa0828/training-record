// Movement problems from each assessment, the A of SOAP (2026-11-23). Every change saves at once.
// Problems carry over to the next assessment until they are solved; a summary in plain words goes with them,
// written beside the training goal so the two stay matched. Never shown in the student's report.
import { h, button, holdButton, openSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import { icon } from './icons.js';
import { bodyMap } from './bodymap.js';
import { painScores } from './painsheet.js';
import {
  PROBLEM_STATUS, DEFAULT_PROBLEMS, assessmentsByDate, latestAssessment, startAssessment, problemCountText, problemText,
  withAssessment, chooserOptions, dateKey, doneSessions, painSeries, newId, previousAssessment, carryCandidates, carryProblem, assessmentOn,
} from './core.js';

const STATUS_LABEL = Object.fromEntries(PROBLEM_STATUS);

function shortDate(key) {
  return (key || '').slice(5).replace('-', '/');
}

/** A tick box big enough for a finger: on means it is brought in (2026-11-27). */
function tickBox(on, label, onTap) {
  return h('button', { type: 'button', class: `tick-btn${on ? ' is-on' : ''}`, role: 'checkbox', 'aria-checked': on ? 'true' : 'false', 'aria-label': label, onclick: onTap },
    h('span', { class: 'tick-box' }, on ? icon('check') : ''));
}

/** The pain to draw under the problems: the latest class scores, or the profile when there are none. */
export function painUnderlay(student) {
  const series = painSeries(doneSessions(store.all('sessions'), student.id));
  const recent = Object.fromEntries(series.filter((item) => item.latest > 0 && item.part !== '未標部位').map((item) => [item.part, item.latest]));
  if (Object.keys(recent).length) return recent;
  return Object.fromEntries(Object.entries(painScores(student.pain)).filter(([, score]) => score !== null && score !== undefined));
}

export function problemLegend() {
  return h('div', { class: 'body-legend', 'aria-hidden': 'true' },
    h('span', {}, h('i', {}), '動作問題'),
    h('span', {}, h('i', { class: 'is-pain' }), '疼痛（數字是分數）'));
}

/** A read-only figure with the problems over the pain. */
export function problemFigure(problems, pain) {
  const map = bodyMap(() => {}, { readOnly: true });
  map.el.classList.add('is-problem');
  map.update(Object.fromEntries(problems.flatMap((p) => p.parts || []).map((part) => [part, null])), null, pain);
  return map.el;
}

/** Choosing the parts of one problem on the body map, with the student's pain beneath. Taps save at once. */
function partsSheet(problem, pain, onChange) {
  openSheet(`${problem.text}：部位`, (close) => {
    const picked = h('p', { class: 'muted' });
    let map;
    const draw = () => {
      map.update(Object.fromEntries((problem.parts || []).map((part) => [part, null])), null, pain);
      picked.textContent = problem.parts?.length ? `已標：${problem.parts.join('、')}` : '點圖上的部位，再點一次取消。不用標部位的問題可以直接按完成。';
    };
    map = bodyMap((part) => {
      const parts = problem.parts || [];
      problem.parts = parts.includes(part) ? parts.filter((p) => p !== part) : [...parts, part];
      onChange();
      draw();
    });
    map.el.classList.add('is-problem');
    draw();
    return h('div', { class: 'stack' }, problemLegend(), map.el, picked, button('完成', close, 'big primary'));
  });
}

function addedProblems() {
  return store.all('options').filter((o) => o.type === 'problem' && !o.deleted).map((o) => o.name);
}

/** The problems the teacher typed herself stay one tap away; here they can be taken off that list, with undo. */
function ownProblemsSheet(onChange) {
  openSheet('我加的常用問題', (close) => {
    const body = h('div', { class: 'stack-sm' });
    const draw = () => {
      const own = store.all('options').filter((o) => o.type === 'problem' && !o.deleted);
      body.replaceChildren(...(own.length
        ? own.map((option) => h('div', { class: 'row-between option-row' },
          h('span', {}, option.name),
          holdButton('移除', () => {
            store.save('options', { ...option, deleted: true });
            draw();
            onChange();
            toast(`已移除 ${option.name}`, { label: '復原', run: () => { store.save('options', { ...option, deleted: false }); draw(); onChange(); } });
          }, 'ghost danger-text')))
        : [h('p', { class: 'muted' }, '沒有自己加的問題了。')]));
    };
    draw();
    return h('div', { class: 'stack' }, h('p', { class: 'muted' }, '移除只是不再列在常用裡，已經寫進評估的問題不會變。'), body, button('完成', close, 'big primary'));
  });
}

/** Daily needs, job and sport from the profile in one line, or '' when none is written. */
export function lifeNeeds(student) {
  return [student?.dailyNeeds, student?.job && `職業：${student.job}`, student?.sports && `運動：${student.sports}`]
    .filter((x) => x?.trim()).join('・');
}

/**
 * Opens one assessment, new (id null) or saved, for writing. Nothing is stored until something changes.
 * A day has one assessment (2026-11-27): asking for a new one on a day that has one opens that one.
 */
export function editAssessment(student, assessmentId = null, onDone = null) {
  const current = () => store.get('students', student.id) || student;
  const openId = assessmentId || assessmentOn(current(), dateKey())?.id || null;
  const saved = openId && (current().assessments || []).find((a) => a.id === openId);
  const a = saved ? JSON.parse(JSON.stringify(saved)) : startAssessment(current(), dateKey(), newId('as'));
  let stored = Boolean(saved);
  const pain = painUnderlay(current());

  openSheet(saved ? `${shortDate(a.date)} 的評估` : '新增評估', (close) => {
    const status = h('p', { class: 'muted small', role: 'status' }, '改了會自動儲存。');
    const persist = () => {
      store.save('students', withAssessment(current(), { ...a, editedAt: Date.now() }));
      stored = true;
      status.textContent = '已自動儲存';
    };

    const date = h('input', { class: 'input', type: 'date', max: dateKey(), value: a.date, 'aria-label': '評估日期' });
    date.addEventListener('change', () => {
      if (!date.value || date.value > dateKey()) { date.value = a.date; toast('請選今天或之前的日期'); return; }
      a.date = date.value;
      persist();
    });

    const list = h('div', { class: 'stack-sm problem-list' });
    const quick = h('div', { class: 'row-wrap' });
    // Last time's unsolved problems and summary are shown, and only what is ticked comes along (2026-11-27).
    const before = previousAssessment(current(), a);
    const candidates = carryCandidates(before);
    const fromBefore = new Set(candidates.map((p) => p.id));
    const entry = (problem) => a.problems.find((p) => p.id === problem.id);
    const bring = (problems) => {
      for (const problem of problems) if (!entry(problem)) a.problems.push(carryProblem(problem));
      persist();
      drawList();
    };
    const leaveOut = (problem) => {
      const index = a.problems.findIndex((p) => p.id === problem.id);
      const was = a.problems[index];
      a.problems.splice(index, 1);
      persist();
      drawList();
      toast(`${problem.text} 不帶入了`, { label: '復原', run: () => { a.problems.splice(index, 0, was); persist(); drawList(); } });
    };

    const drawQuick = () => {
      // Last time's problems are ticked above, never added again as new ones.
      const used = new Set([...a.problems, ...candidates].map((p) => p.text));
      // replaceChildren is the DOM's own: a false here would show as the word "false" (2026-11-24).
      quick.replaceChildren(...chooserOptions(DEFAULT_PROBLEMS, addedProblems()).filter((name) => !used.has(name))
        .map((name) => button(`＋ ${name}`, () => addProblem(name), 'chip-btn chip-add')),
      ...(addedProblems().length > 0 ? [button('整理我加的', () => ownProblemsSheet(drawQuick), 'ghost')] : []));
    };

    const removeProblem = (problem) => {
      const index = a.problems.indexOf(problem);
      a.problems.splice(index, 1);
      persist();
      drawList();
      toast(`已移除 ${problem.text}`, { label: '復原', run: () => { a.problems.splice(index, 0, problem); persist(); drawList(); } });
    };

    // The parts and the three statuses of a problem in this assessment.
    const controls = (problem) => [
      button(problem.parts?.length ? [icon('people'), h('span', {}, problem.parts.join('、'))] : [icon('people'), h('span', {}, '標部位')],
        () => partsSheet(problem, pain, () => { persist(); drawList(); }), `problem-parts${problem.parts?.length ? ' is-marked' : ''}`),
      h('span', { class: 'chip-seg', role: 'group', 'aria-label': `${problem.text}的狀態` },
        PROBLEM_STATUS.map(([value, label]) => button(label, () => {
          problem.status = value;
          persist();
          drawList();
        }, 'chip-btn seg-btn', { 'aria-pressed': (problem.status || 'open') === value ? 'true' : 'false' }))),
    ];

    const drawList = () => {
      const lastTime = (problem) => [problem.parts?.length && problem.parts.join('、'), `上次${STATUS_LABEL[problem.status || 'open']}`].filter(Boolean).join('・');
      // Last time's problems first, ticked or not, then the ones new this time.
      const carriedRows = candidates.map((problem) => {
        const mine = entry(problem);
        return mine
          ? h('div', { class: 'problem-row' },
            tickBox(true, `帶入 ${problem.text}`, () => leaveOut(problem)),
            h('div', { class: 'problem-main' }, h('strong', {}, mine.text), h('span', { class: 'muted small' }, lastTime(problem))),
            ...controls(mine))
          : h('div', { class: 'problem-row is-off' },
            tickBox(false, `帶入 ${problem.text}`, () => bring([problem])),
            h('div', { class: 'problem-main' }, h('strong', {}, problem.text), h('span', { class: 'muted small' }, lastTime(problem))));
      });
      const newRows = a.problems.filter((problem) => !fromBefore.has(problem.id)).map((problem) => h('div', { class: 'problem-row' },
        h('div', { class: 'problem-main' },
          h('strong', {}, problem.text),
          problem.carried && h('span', { class: 'muted small' }, '上次的問題')),
        ...controls(problem),
        holdButton('移除', () => removeProblem(problem), 'ghost danger-text')));
      const missing = candidates.filter((problem) => !entry(problem));
      list.replaceChildren(
        ...(candidates.length ? [h('div', { class: 'row-between carry-head' },
          h('span', { class: 'muted' }, `${shortDate(before.date)} 評估還沒解決的，勾選要帶入的`),
          missing.length > 0 ? button('全部帶入', () => bring(missing), '') : '')] : []),
        ...carriedRows,
        ...(candidates.length && newRows.length ? [h('div', { class: 'muted carry-head' }, '這次新增的')] : []),
        ...newRows,
        ...(!candidates.length && !newRows.length ? [h('p', { class: 'muted' }, '還沒有問題。點下面常用的，或自己寫一個。')] : []));
      drawQuick();
    };

    const addProblem = (text) => {
      const name = text.trim();
      if (!name) { toast('先寫問題內容'); return; }
      const fromLast = candidates.find((p) => p.text === name);
      if (fromLast) { bring([fromLast]); return; }
      if (a.problems.some((p) => p.text === name)) { toast(`${name} 已經在清單裡`); return; }
      a.problems.push({ id: newId('pb'), text: name, parts: [], status: 'open' });
      if (!DEFAULT_PROBLEMS.includes(name) && !addedProblems().includes(name)) store.save('options', { id: newId('opt'), type: 'problem', name });
      persist();
      drawList();
    };

    const typed = h('input', { class: 'input', maxlength: 40, placeholder: '寫一個動作問題，例如：弓箭步膝蓋超過腳尖', 'aria-label': '新的動作問題' });
    typed.addEventListener('keydown', (e) => { if (e.key === 'Enter') { addProblem(typed.value); typed.value = ''; } });

    // The summary is written right beside the goal, so each main problem can be matched to where the training goes.
    const summary = h('textarea', { class: 'input', placeholder: '用學生聽得懂的話，說明主要問題和接下來怎麼練', 'aria-label': '問題總結' });
    summary.value = a.summary || '';
    // Last time's summary, shown in full with a tick to bring it in, so it can be read before deciding (2026-11-27).
    const beforeSummary = before?.summary?.trim() || '';
    const summaryCarry = h('div', { class: 'sg-carry' });
    const drawSummaryCarry = () => {
      if (!beforeSummary) return;
      const on = (a.summary || '').includes(beforeSummary);
      summaryCarry.replaceChildren(h('div', { class: `carry-summary${on ? '' : ' is-off'}` },
        tickBox(on, '帶入上次的問題總結', () => {
          const text = (a.summary || '').trim();
          a.summary = on ? text.replace(beforeSummary, '').trim() : (text ? `${text}\n${beforeSummary}` : beforeSummary);
          summary.value = a.summary;
          persist();
          drawSummaryCarry();
        }),
        h('div', { class: 'carry-summary-text' },
          h('span', { class: 'muted small' }, `${shortDate(before.date)} 的問題總結`),
          h('span', {}, beforeSummary))));
    };
    drawSummaryCarry();
    summary.addEventListener('input', () => { a.summary = summary.value; persist(); drawSummaryCarry(); });
    const goal = h('textarea', { class: 'input', placeholder: '還沒寫訓練目標', 'aria-label': '訓練目標' });
    goal.value = current().goal || '';
    goal.addEventListener('input', () => {
      store.save('students', { ...current(), goal: goal.value, isNew: false });
      status.textContent = '已自動儲存';
    });

    drawList();
    return h('div', { class: 'stack' },
      status,
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '評估日期'), date),
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '動作問題'), list),
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '新增問題'), quick,
        h('div', { class: 'problem-add' }, typed, button('加入', () => { addProblem(typed.value); typed.value = ''; }, ''))),
      h('div', { class: 'summary-goal' },
        // The student's daily needs from the profile, so the summary and goal answer them (2026-11-24).
        lifeNeeds(current()) && h('p', { class: 'sg-life' }, h('span', { class: 'muted small' }, '日常需求'), h('span', {}, lifeNeeds(current()))),
        // Last time's summary across the top, so the summary and goal boxes stay side by side and level.
        beforeSummary && summaryCarry,
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '問題總結（給學生看）'), summary),
        h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '訓練目標（和總結對得上嗎？）'), goal)),
      saved && holdButton('刪除這次評估', () => {
        const before = current();
        store.save('students', withAssessment(before, { ...a, deleted: true }));
        stored = false;
        close();
        toast(`已刪除 ${shortDate(a.date)} 的評估`, { label: '復原', run: () => { store.save('students', withAssessment(current(), { ...a, deleted: false })); refreshView(); } });
      }, 'ghost danger-text'),
      button('完成', close, 'big primary'));
  }, { wide: true, onClose: () => { onDone?.(stored); refreshView(); } });
}

/** All assessments of one student: the newest in full, older ones to open. */
export function assessmentSheet(student) {
  openSheet('動作問題', (close) => {
    const all = assessmentsByDate(student);
    const latest = all[0];
    const pain = painUnderlay(student);
    const reopen = (id) => { close(); editAssessment(student, id); };
    return h('div', { class: 'stack' },
      button(latest?.date === dateKey() ? '修改今天的評估' : '新增評估', () => { close(); editAssessment(student); }, 'big primary'),
      latest && h('div', { class: 'stack-sm' },
        h('div', { class: 'row-between' },
          h('strong', {}, `${shortDate(latest.date)} 評估`),
          button([icon('pencil'), h('span', {}, '修改')], () => reopen(latest.id), '')),
        latest.summary && h('p', { class: 'contra' }, latest.summary),
        // Solved problems stay listed below but leave the figure, so the map shows only what is still there.
        latest.problems.some((p) => p.status !== 'solved' && p.parts?.length) && h('div', { class: 'problem-map' }, problemFigure(latest.problems.filter((p) => p.status !== 'solved'), pain), problemLegend()),
        latest.problems.map((problem) => h('div', { class: 'row-between option-row' },
          h('span', {}, problemText(problem)),
          h('span', { class: `problem-status is-${problem.status || 'open'}` }, STATUS_LABEL[problem.status || 'open'])))),
      all.length > 1 && h('div', { class: 'stack-sm' },
        h('div', { class: 'stepper-label' }, '以前的評估'),
        all.slice(1).map((item) => button([h('span', {}, `${shortDate(item.date)} 評估`), h('span', { class: 'muted small' }, problemCountText(item) || '沒有問題')],
          () => reopen(item.id), 'list-item history-item'))),
      !latest && h('p', { class: 'muted' }, '每次評估後在這裡記下動作問題，下次評估會自動帶入沒解決的問題。'));
  }, { wide: true });
}

/** For the profile: the newest summary, shown beside the goal while it is written. */
export function latestSummary(student) {
  const latest = latestAssessment(student);
  return latest?.summary?.trim() ? { date: shortDate(latest.date), text: latest.summary.trim(), id: latest.id } : null;
}
