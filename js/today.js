import { h, button, go, tab, tabBar, refreshView } from './dom.js';
import * as store from './store.js';
import { dateKey, findStudentByName, doneSessions, studentsNeedingPlan, newId, sessionSummary } from './core.js';
import { currentStatus, isConnected, syncNow } from './sync.js';
import { loadDemo } from './demo.js';
import { icon, reformer } from './icons.js';

const KIND = { strength: '重訓', pilates: '皮拉提斯' };

export function kindLabel(kind) {
  return KIND[kind] || '';
}

/** Finds the student for a booking, creating one the first time a new name appears. */
export function studentForBooking(name, demo) {
  const existing = findStudentByName(store.all('students'), name);
  if (existing) return existing;
  const student = { id: newId('s'), name, aliases: [], goal: '', contraindications: '', nextNotes: '', isNew: true };
  if (demo) student.demo = true;
  store.save('students', student);
  return student;
}

function formatDate(key) {
  const [y, m, d] = key.split('-').map(Number);
  const week = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  return `${m} 月 ${d} 日（${week}）`;
}

function shortDate(key) {
  return key.slice(5).replace('-', '/');
}

/** What is known about one of today's bookings. */
function describe(event, today) {
  const student = studentForBooking(event.student, event.demo);
  const session = store.all('sessions').find((s) => s.studentId === student.id && s.date === today);
  const last = doneSessions(store.all('sessions'), student.id).find((s) => s.date !== today);
  const plan = store.get('plans', student.id);
  const hasPlan = plan && !plan.used && plan.rows?.length;
  const content = hasPlan ? '用排好的課表' : last ? '帶入上次內容' : '還沒有紀錄';
  return { event, student, session, last, content, done: session?.status === 'done', inClass: session?.status === 'draft' };
}

/** The class to act on now: the one in progress, otherwise the first not yet finished. */
function heroCard(item) {
  const { event, student, last, content, inClass } = item;
  const needsProfile = !student.contraindications && !student.goal;
  const open = () => go('record', { studentId: student.id, kind: event.kind });
  return h('section', { class: 'hero rise' },
    h('div', { class: 'hero-top' },
      h('span', { class: 'hero-label' }, inClass ? '正在上課' : '下一堂'),
      h('span', { class: 'hero-chip' }, kindLabel(event.kind))),
    h('div', { class: 'hero-main' },
      h('span', { class: 'hero-time' }, event.time),
      h('span', { class: 'hero-name' }, student.name)),
    h('p', { class: 'hero-meta' }, content, last ? `・上次 ${shortDate(last.date)} 完成 ${sessionSummary(last).percent}%` : ''),
    (student.contraindications || student.nextNotes || needsProfile) && h('div', { class: 'hero-notes' },
      student.contraindications && h('div', { class: 'hero-note is-alert' }, icon('warn'), h('span', {}, student.contraindications)),
      student.nextNotes && h('div', { class: 'hero-note' }, icon('clock'), h('span', {}, student.nextNotes)),
      needsProfile && h('div', { class: 'hero-note' }, icon('warn'), h('span', {}, '還沒填目標和禁忌，可以先按「看總覽」補上。'))),
    h('div', { class: 'hero-actions' },
      h('button', { type: 'button', class: 'btn big hero-go', onclick: open }, inClass ? '繼續上課' : '開始上課', icon('arrow')),
      button('看總覽', () => go('overview', { studentId: student.id }), 'ghost')));
}

function slot(item) {
  const { event, student, last, content, done } = item;
  return h('button', {
    type: 'button',
    class: `slot${done ? ' is-done' : ''}`,
    onclick: () => go('overview', { studentId: student.id }),
  },
  h('span', { class: 'slot-dot' }, done ? icon('check') : ''),
  h('span', { class: 'slot-time' }, event.time),
  h('span', {},
    h('span', { class: 'slot-name' }, student.name),
    h('span', { class: 'slot-meta' }, done
      ? `${kindLabel(event.kind)}・已完成`
      : `${kindLabel(event.kind)}・${content}${last ? `・上次 ${shortDate(last.date)}` : ''}`)),
  icon('next', 'go'));
}

function welcome() {
  return h('section', { class: 'welcome rise' },
    reformer(),
    h('h2', {}, '先連上公司 Google 帳號'),
    h('p', {}, '連好後，今天預約的學生會自動列在這裡。還沒準備好的話，可以先用示範資料試按。'),
    button('連線 Google', () => tab('settings'), 'big primary'),
    button('先看示範', () => { loadDemo(); refreshView(); }, 'ghost'));
}

export function todayView() {
  const today = dateKey();
  const events = store.all('events').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  const readable = events.filter((e) => e.date === today && e.student);
  const unreadable = events.filter((e) => e.unreadable);
  // A class already finished today is behind us, so it does not need planning.
  const finished = new Set(store.all('sessions').filter((s) => s.status === 'done').map((s) => `${s.studentId}|${s.date}`));
  const upcoming = events.filter((e) => {
    if (!e.student) return false;
    const student = findStudentByName(store.all('students'), e.student);
    return !(student && finished.has(`${student.id}|${e.date}`));
  });
  // A class today without a plan simply starts from last time, so only later classes are listed as work to do.
  const need = studentsNeedingPlan(upcoming.filter((e) => e.date > today), store.all('students'), store.all('plans'), today);
  const connected = isConnected();
  const demo = store.getMeta('demoLoaded');
  const noCalendar = connected && !store.getMeta('calendarId');
  const status = currentStatus();

  const items = readable.map((event) => describe(event, today));
  const hero = items.find((item) => item.inClass) || items.find((item) => !item.done);
  const others = items.filter((item) => item !== hero);
  const left = items.filter((item) => !item.done).length;
  const title = !items.length ? '今天' : left ? `今天還有 ${left} 堂` : '今天都上完了';

  return h('div', { class: 'screen has-tabs' },
    h('main', { class: 'page stack-lg' },
      h('header', { class: 'today-head' },
        h('div', {},
          h('p', { class: 'today-date' }, formatDate(today)),
          h('h1', {}, title)),
        connected && h('div', { class: 'sync' },
          h('span', { class: `status${status.state === 'error' ? ' warn' : ''}`, 'data-sync-status': true }, status.message),
          h('button', { type: 'button', class: 'btn ghost', 'aria-label': '同步', onclick: () => syncNow() }, icon('sync')))),
      !connected && !demo && welcome(),
      noCalendar && h('section', { class: 'welcome rise' },
        h('h2', {}, '最後一步：選擇日曆'),
        h('p', {}, '選好存放預約的公司日曆，今天的預約就會出現。'),
        button('選擇日曆', () => tab('settings'), 'big primary')),
      hero && heroCard(hero),
      !hero && items.length > 0 && h('section', { class: 'empty rise' }, reformer(), h('p', {}, need.length ? '辛苦了。接著可以排下次的課表。' : '辛苦了，今天的紀錄都存好了。')),
      !items.length && !noCalendar && (connected || demo) && h('section', { class: 'empty rise' }, reformer(), h('p', {}, '今天沒有你的預約。')),
      unreadable.length > 0 && h('p', { class: 'warn-text' },
        `有 ${unreadable.length} 筆預約的標題讀不到學生姓名：${unreadable.map((e) => e.title).join('、')}`),
      others.length > 0 && h('section', { class: 'stack rise' },
        h('h2', { class: 'section-title' }, '今天的其他課'),
        h('div', { class: 'timeline' }, others.map(slot))),
      need.length > 0 && h('section', { class: 'stack rise' },
        h('h2', { class: 'section-title' }, `還沒排課表（${need.length}）`),
        h('div', { class: 'timeline' }, need.map(({ student, event }) => h('button', {
          type: 'button',
          class: 'slot',
          onclick: () => go('plan', { studentId: student.id }),
        },
        h('span', { class: 'slot-dot task-dot' }, icon('plus')),
        h('span', { class: 'slot-time' }, shortDate(event.date)),
        h('span', {}, h('span', { class: 'slot-name' }, student.name), h('span', { class: 'slot-meta' }, `${event.time} 上課，按這裡排課表`)),
        icon('next', 'go')))))),
    tabBar('today'));
}
