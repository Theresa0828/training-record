// How a past class is shown: on the overview's list and beside the plan for reference.
import { h } from './dom.js';
import { classLabel, isBpFlagged, painText, rowDetails, setText } from './core.js';
import { kindLabel } from './today.js';
import { icon } from './icons.js';

const FLAG_NAMES = { pain: '疼痛', sleep: '睡眠', diet: '飲食', mood: '心情' };

export function sessionTitle(session) {
  return `${session.date.replaceAll('-', '/')}・${kindLabel(session.kind)}${session.classNo ? `・${classLabel(session.classNo, session.packageSize)}` : ''}`;
}

export function sessionTable(session) {
  return h('div', { class: 'stack-sm' }, session.rows.map((row) => {
    const missed = row.sets.filter((s) => !s.done).length;
    const details = rowDetails(row).join('・');
    return h('div', { class: 'history-row' },
      h('div', { class: 'history-main' },
        h('strong', {}, row.name),
        h('span', { class: 'history-sets' }, row.sets.map((set) => h('span', { class: set.done ? '' : 'set-missed' }, setText(row, set))))),
      missed > 0 && h('span', { class: 'chip chip-alert' }, `${missed} 組未完成`),
      details && h('div', { class: 'muted small' }, details));
  }));
}

/** Everything about one class apart from its exercises. */
export function sessionFacts(session) {
  const vitals = [
    session.bpSys ? `血壓 ${session.bpSys}/${session.bpDia}${isBpFlagged(session.bpSys, session.bpDia) ? ' 偏高' : ''}` : '',
    session.hr ? `心跳 ${session.hr}` : '',
  ].filter(Boolean).join('・');
  const flags = Object.entries(FLAG_NAMES).filter(([key]) => session.flags?.[key])
    .map(([key, name]) => (key === 'pain' && session.dayPain && painText(session.dayPain) ? `疼痛（${painText(session.dayPain)}）` : name));
  return [
    vitals && h('p', { class: 'muted' }, vitals),
    flags.length > 0 && h('p', {}, `當天狀況：${flags.join('、')}`),
    session.special && h('p', {}, `特殊狀況：${session.special}`),
    session.note && h('p', {}, `備註：${session.note}`),
  ].filter(Boolean);
}

/** Last class, beside the plan. Open from the start, since planning is what it is there for. */
export function lastClassCard(session) {
  return h('details', { class: 'fold last-class', open: true },
    h('summary', {},
      h('span', { class: 'stack-xs' }, h('span', {}, '上次上課'), h('span', { class: 'muted small' }, sessionTitle(session))),
      icon('next')),
    h('div', { class: 'fold-body' }, sessionFacts(session), sessionTable(session)));
}
