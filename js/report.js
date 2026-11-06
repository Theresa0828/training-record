// Today's class for the student to read on the teacher's iPad. Plain words and pictures, one screen.
// Internal notes, quality scores, help, tags, blood pressure and contraindications are never shown.
// Going back to the records needs a one-second hold, so the student never wanders into another student's file.
import { h, holdButton, back } from './dom.js';
import * as store from './store.js';
import {
  dateKey, doneSessions, nextClassInfo, learnedSummary, exerciseTrend, layRegion,
  reportRows, reportRegions, reportPain, effortLevel, BAND_COLORS,
} from './core.js';
import { termRing, calendarPage } from './charts.js';
import { bodyMap } from './bodymap.js';
import { equipmentIcon } from './equipment.js';
import { icon } from './icons.js';

const NS = 'http://www.w3.org/2000/svg';
const WEEK = '日一二三四五六';
const EFFORT_WORDS = { low: '輕', mid: '中', high: '累' };

function svg(tag, attrs = {}) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  return el;
}

function longDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m} 月 ${d} 日（星期${WEEK[new Date(y, m - 1, d).getDay()]}）`;
}

/** The class to show: the one asked for, else today's once something is done, else the latest finished. */
function pickSession(studentId, sessionId) {
  const all = store.all('sessions').filter((s) => s.studentId === studentId && !s.deleted);
  if (sessionId) return all.find((s) => s.id === sessionId) || null;
  const today = all.filter((s) => s.date === dateKey() && s.rows.some((r) => r.sets.some((x) => x.done))).sort((a, b) => (b.finishedAt || b.updatedAt || 0) - (a.finishedAt || a.updatedAt || 0))[0];
  return today || doneSessions(all, studentId)[0] || null;
}

function card(span, title, ...body) {
  return h('section', { class: `card rp-card ${span}` }, title && h('h3', {}, title), ...body);
}

function goalCard(student) {
  return card('span-2', '我們的目標', h('div', { class: 'rp-goal' },
    h('p', { class: student.goal ? 'rp-say' : 'rp-note' }, student.goal || '下次和老師一起訂')));
}

function termCard(session) {
  if (!session.classNo) return card('span-2', '這一期上到第幾堂', h('p', { class: 'rp-note' }, '老師還沒設定'));
  const left = Math.max(0, session.packageSize - session.classNo);
  return card('span-2', '這一期上到第幾堂', h('div', { class: 'rp-side' },
    termRing(session.classNo, session.packageSize, false),
    h('div', {}, h('p', { class: 'rp-big' }, `第 ${session.classNo} 堂`), h('p', { class: 'rp-say' }, left ? `還有 ${left} 堂` : '這期最後一堂'))));
}

function nextCard(student) {
  const info = nextClassInfo(student, store.all('events'), dateKey());
  if (!info.date) return card('span-2', '下次上課', h('div', { class: 'rp-side' }, calendarPage(''), h('p', { class: 'rp-say' }, '和老師約時間')));
  const [hour, minute] = (info.time || '').split(':').map(Number);
  const time = info.time ? `${hour >= 12 ? '下午' : '上午'} ${hour > 12 ? hour - 12 : hour}:${String(minute).padStart(2, '0')}` : '';
  return card('span-2', '下次上課', h('div', { class: 'rp-side' }, calendarPage(info.date),
    h('div', {}, time ? h('p', { class: 'rp-big' }, time.split(' ')[1]) : null, h('p', { class: 'rp-say' }, time ? time.split(' ')[0] : '時間再確認'))));
}

function dots(colors, prefix) {
  return h('span', { class: 'rp-dots', 'aria-hidden': 'true' }, colors.map((c) => h('i', { class: `${prefix}${c}` })));
}

function amountCell(row) {
  const { amount } = row;
  if (amount.type === 'weight') {
    return h('span', { class: 'rp-amount' }, h('b', { class: 'rp-num' }, amount.weight), h('span', { class: 'rp-unit' }, '公斤'),
      amount.up > 0 && h('span', { class: 'rp-up', 'aria-label': `比上次重 ${amount.up} 公斤` }, `↑${amount.up}`));
  }
  if (amount.type === 'spring') {
    return h('span', { class: 'rp-amount' }, dots(amount.dots, 'spring-'), h('span', { class: 'rp-unit' }, amount.words));
  }
  if (amount.type === 'band') {
    const index = BAND_COLORS.indexOf(amount.color);
    return h('span', { class: 'rp-amount' }, index >= 0 && dots([index], 'band-'), h('span', { class: 'rp-unit' }, `${amount.color}色彈力帶`));
  }
  if (amount.type === 'body') return h('span', { class: 'rp-amount' }, h('span', { class: 'rp-unit' }, '用自己的體重'));
  return h('span', { class: 'rp-amount' }, h('span', { class: 'rp-unit' }, '—'));
}

function effortCell(rpe) {
  if (!rpe) return h('span', { class: 'rp-effort' }, h('span', { class: 'rp-unit' }, '—'));
  const level = effortLevel(rpe);
  return h('span', { class: 'rp-effort', 'aria-label': `費力 ${rpe} 分，10 分最累` },
    h('span', { class: `rp-bar is-${level}`, 'aria-hidden': 'true' }, Array.from({ length: 10 }, (_, i) => h('i', { class: i < rpe ? 'on' : '' }))),
    h('b', {}, rpe));
}

function exercisesCard(rows) {
  const regions = reportRegions(rows);
  const anyUp = rows.some((r) => r.amount.up > 0);
  return card(rows.length > 5 ? 'span-6 rp-ex is-dense' : 'span-6 rp-ex', null,
    h('div', { class: 'rp-ex-top' },
      h('h3', {}, '今天做的動作'),
      h('p', { class: 'rp-sum' }, h('b', {}, `${rows.length} 個動作`), regions.length ? '，練到' : '',
        regions.map((r) => h('span', { class: 'rp-tag' }, `${r.region} ${r.count}`)))),
    h('div', { class: 'rp-head', 'aria-hidden': 'true' },
      h('span', {}, '動作'), h('span', {}, '重量／彈簧'), h('span', {}, '次數・組數'),
      h('span', {}, '費力', ['low', 'mid', 'high'].map((level) => h('span', { class: 'rp-key' }, h('i', { class: `is-${level}` }), EFFORT_WORDS[level])))),
    h('ol', { class: 'rp-list' }, rows.map((row) => h('li', { class: 'rp-row' },
      h('span', { class: 'rp-what' },
        h('span', { class: 'rp-eq' }, row.equipment ? equipmentIcon(row.equipment) : icon('dumbbell')),
        h('span', { class: 'rp-name' }, h('b', { class: row.name.length > 16 ? 'is-long' : '' }, row.name), h('small', {}, [row.equipment, row.region].filter(Boolean).join('・')))),
      amountCell(row),
      h('span', { class: 'rp-reps' }, h('b', {}, row.reps || '—'),
        h('span', { class: 'rp-sets', 'aria-label': `${row.sets} 組` }, Array.from({ length: row.sets }, () => h('i')))),
      effortCell(row.rpe)))),
    h('p', { class: 'rp-legend' },
      anyUp && h('span', {}, h('span', { class: 'rp-up' }, '↑2'), ' 比上次重 2 公斤'),
      h('span', {}, h('span', { class: 'rp-sets' }, h('i')), ' 一個圓點是一組')));
}

function painCard(session, history) {
  const items = reportPain(session, history);
  if (!items.length) return card('span-2', '疼痛', h('p', { class: 'rp-none' }, icon('check'), '今天沒有記到疼痛'));
  const map = bodyMap(() => {}, { readOnly: true });
  map.update(Object.fromEntries(items.filter((i) => i.score > 0).map((i) => [i.part, i.score])), null);
  return card('span-2 rp-pain-card', '疼痛', h('div', { class: 'rp-pain' }, map.el,
    h('div', { class: 'rp-pain-list' }, items.slice(0, 2).map((item) => h('div', {},
      h('p', { class: 'rp-say' }, `${item.part} `, h('b', { class: 'rp-alert' }, `${item.score} 分`)),
      item.before !== null && h('p', { class: 'rp-note' }, `上次 ${item.before} 分`))),
      h('p', { class: 'rp-scale' }, '0 不痛・10 最痛'))));
}

/** One exercise's weight over the last classes: the one done most often that has a line to draw. */
function trendCard(session, history) {
  const ordered = [session, ...history];
  const candidates = session.rows.filter((r) => r.kind === 'strength')
    .map((r) => ({ name: r.name, points: exerciseTrend(r.exerciseId, ordered, 6).filter((p) => p.weight > 0) }))
    .filter((c) => c.points.length >= 2)
    .sort((a, b) => b.points.length - a.points.length);
  const pick = candidates[0];
  if (!pick) return null;
  const values = pick.points.map((p) => p.weight);
  const W = 200; const H = 110; const L = 8; const R = 62; const T = 16; const B = 22;
  const min = Math.min(...values); const max = Math.max(...values);
  const x = (i) => L + (i * (W - L - R)) / (values.length - 1);
  const y = (v) => (max === min ? (H - B + T) / 2 : T + (1 - (v - min) / (max - min)) * (H - T - B));
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'rp-trend', role: 'img', 'aria-label': `${pick.name}的重量：${values.join('、')} 公斤` });
  chart.append(svg('line', { x1: L, x2: W - R + 8, y1: H - B, y2: H - B, class: 'rp-axis' }));
  chart.append(svg('polyline', { points: values.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'rp-line' }));
  values.forEach((v, i) => chart.append(svg('circle', { cx: x(i), cy: y(v), r: i === values.length - 1 ? 5 : 3.5, class: i === values.length - 1 ? 'rp-dot is-last' : 'rp-dot' })));
  const label = svg('text', { x: x(values.length - 1) + 10, y: y(values.at(-1)) + 6, class: 'rp-label' });
  label.textContent = `${values.at(-1)} 公斤`;
  const first = svg('text', { x: L, y: H - 4, class: 'rp-tick' });
  first.textContent = pick.points[0].date.slice(5).replace('-', '/');
  const last = svg('text', { x: x(values.length - 1), y: H - 4, class: 'rp-tick', 'text-anchor': 'middle' });
  last.textContent = '今天';
  chart.append(label, first, last);
  return card('span-2', `${pick.name}的重量`, chart, h('p', { class: 'rp-note' }, `最近 ${values.length} 次：${values[0]} → ${values.at(-1)} 公斤`));
}

function learnedCard(session, history, span) {
  const summary = learnedSummary([session, ...history], store.all('exercises'), (id) => store.get('exercises', id));
  const counts = new Map();
  for (const group of [...summary.strength.groups, ...summary.pilates.groups]) {
    if (!group.learned || group.group === '未分類' || group.group === '其他') continue;
    const name = layRegion(group.group);
    counts.set(name, (counts.get(name) || 0) + group.learned);
  }
  const total = summary.strength.count + summary.pilates.count;
  const tiles = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, span === 'span-2' ? 4 : 6);
  return card(span, '已經學會的動作', h('p', { class: 'rp-big' }, `${total} 個`),
    tiles.length > 0 && h('div', { class: 'rp-tiles' }, tiles.map(([name, n]) => h('div', { class: 'rp-tile' }, h('b', {}, `${n} 個`), h('span', {}, name)))));
}

export function reportView({ studentId, sessionId }) {
  const student = store.get('students', studentId);
  const session = student && pickSession(studentId, sessionId);
  const leave = holdButton('回到紀錄畫面', () => back(), 'rp-back');
  if (!student || !session) {
    return h('div', { class: 'screen report' },
      h('header', { class: 'topbar rp-top' }, h('div', { class: 'rp-title' }, h('h1', {}, student?.name || '')), leave),
      h('p', { class: 'rp-empty' }, '還沒有上課紀錄。'));
  }
  const history = doneSessions(store.all('sessions'), studentId).filter((s) => s.id !== session.id && (s.date + (s.finishedAt || 0)) <= (session.date + (session.finishedAt || Number.MAX_SAFE_INTEGER)));
  const rows = reportRows(session, history, (id) => store.get('exercises', id));
  const trend = trendCard(session, history);
  return h('div', { class: 'screen report' },
    h('header', { class: 'topbar rp-top' },
      h('div', { class: 'rp-title' }, h('h1', {}, student.name), h('p', {}, longDate(session.date))),
      leave),
    h('main', { class: 'page bento rp-grid' },
      goalCard(student),
      termCard(session),
      nextCard(student),
      rows.length ? exercisesCard(rows) : card('span-6', '今天做的動作', h('p', { class: 'rp-note' }, '做完第一組就會出現在這裡。')),
      painCard(session, history),
      trend,
      learnedCard(session, history, trend ? 'span-2' : 'span-4')));
}
