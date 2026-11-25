import { h, button, go, tab, tabBar, refreshView } from './dom.js';
import * as store from './store.js';
import { dateKey, chosenCalendars, studentForEvent, bookingIsUnclear, newStudentBookings, doneSessions, studentsNeedingPlan, planCalendarWeeks, newId, nextClassNumber, classLabel, pairClassNumber, laterClassNumber } from './core.js';
import { currentStatus, isConnected, syncNow } from './sync.js';
import { loadDemo } from './demo.js';
import { icon, reformer } from './icons.js';

const KIND = { strength: '重訓', pilates: '皮拉提斯' };

export function kindLabel(kind) {
  return KIND[kind] || '';
}

/** Finds the student for a booking, creating one the first time a new name (or name with birthday) appears. */
export function studentForBooking(event) {
  const existing = studentForEvent(store.all('students'), event);
  if (existing) return existing;
  const student = { id: newId('s'), name: event.student, aliases: [], goal: '', contraindications: '', nextNotes: '', isNew: true };
  if (event.birthday) student.birthday = event.birthday;
  if (event.demo) student.demo = true;
  store.save('students', student);
  return student;
}

/** Two students with the same name are told apart by the birthday written after it in the calendar. */
function birthdayTag(student) {
  return student.birthday ? h('small', { class: 'name-birthday' }, ` ${student.birthday}`) : null;
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
  const student = studentForBooking(event);
  const session = store.all('sessions').find((s) => s.studentId === student.id && s.date === today);
  const last = doneSessions(store.all('sessions'), student.id).find((s) => s.date !== today);
  const plan = store.get('plans', student.id);
  const hasPlan = plan && !plan.used && plan.rows?.length;
  const content = hasPlan ? '用排好的課表' : last ? '帶入上次內容' : '還沒有紀錄';
  const history = doneSessions(store.all('sessions'), student.id).filter((s) => s.date !== today);
  const count = session?.classNo ? { no: session.classNo, size: session.packageSize } : nextClassNumber(history, student);
  return { event, student, session, last, content, count, planned: !!hasPlan, done: session?.status === 'done', inClass: session?.status === 'draft' };
}

/**
 * One class time. A 1:2 class (two names in one calendar title) is one lesson with two students; a student marked
 * 病假 or the like stays listed with the reason but is not in class, and a lesson with nobody in class does not count.
 */
function lessonsOf(items) {
  const lessons = [];
  for (const item of items) {
    const same = item.event.group && lessons.find((lesson) => lesson.group === item.event.group);
    if (same) same.items.push(item);
    else lessons.push({ group: item.event.group || '', items: [item] });
  }
  return lessons.map((lesson) => {
    const present = lesson.items.filter((item) => !item.event.change);
    const away = lesson.items.filter((item) => item.event.change);
    // The pair shares one number (2026-11-24); before either opens, the larger of their two counts.
    const count = present.find((item) => item.session?.classNo)?.count || (present.length ? present.map((item) => item.count).reduce((a, b, i) => pairClassNumber(a, b, !!present[0].student.classStart?.no, !!present[i].student.classStart?.no)) : null);
    return {
      ...lesson,
      event: lesson.items[0].event,
      present,
      away,
      off: !present.length,
      classText: count ? classLabel(count.no, count.size) : '',
      done: present.length > 0 && present.every((item) => item.done),
      inClass: present.some((item) => item.inClass),
    };
  });
}

/** Who to open first in a lesson: the one in class, otherwise the first not finished. */
function firstToOpen(lesson) {
  return lesson.present.find((item) => item.inClass) || lesson.present.find((item) => !item.done) || lesson.present[0];
}

function awayText(lesson) {
  return lesson.away.map((item) => `${item.student.name} ${item.event.change}`).join('、');
}

/** The class to act on now: the one in progress, otherwise the first not yet finished. */
function heroCard(lesson, span) {
  const { event, present, classText, inClass } = lesson;
  const pair = present.length > 1;
  const first = firstToOpen(lesson);
  const open = () => go('record', { studentId: first.student.id, kind: event.kind });
  const who = (item, text) => (pair ? `${item.student.name}：${text}` : text);
  const notes = present.flatMap((item) => {
    const { student } = item;
    const needsProfile = !student.contraindications && !student.goal;
    return [
      student.contraindications && h('div', { class: 'hero-note is-alert' }, icon('warn'), h('span', {}, who(item, student.contraindications))),
      student.nextNotes && h('div', { class: 'hero-note' }, icon('clock'), h('span', {}, who(item, student.nextNotes))),
      needsProfile && h('div', { class: 'hero-note' }, icon('warn'), h('span', {}, who(item, '還沒填目標和禁忌，可以先按「看總覽」補上。'))),
    ].filter(Boolean);
  });
  const states = present.map((item) => (item.done ? '已完成' : item.content));
  const meta = pair
    ? (new Set(states).size === 1 ? `兩位都${states[0]}` : present.map((item, i) => `${item.student.name} ${states[i]}`).join('・'))
    : [first.content, first.last ? `上次 ${shortDate(first.last.date)}` : ''].filter(Boolean).join('・');
  return h('section', { class: `hero rise ${span}` },
    h('div', { class: 'hero-top' },
      h('span', { class: 'hero-label' }, inClass ? '正在上課' : '下一堂'),
      h('span', { class: 'hero-chip' }, kindLabel(event.kind), pair ? '・一對二' : '', classText ? `・${classText}` : '')),
    h('div', { class: 'hero-main' },
      h('span', { class: 'hero-time' }, event.time),
      h('span', { class: 'hero-name' }, present.map((item, i) => [i ? h('span', { class: 'hero-pair-sep' }, ' / ') : null, item.student.name, birthdayTag(item.student)]))),
    h('p', { class: 'hero-meta' }, meta),
    lesson.away.length > 0 && h('p', { class: 'hero-meta' }, `${awayText(lesson)}，今天一對一`),
    notes.length > 0 && h('div', { class: 'hero-notes' }, notes),
    h('div', { class: 'hero-actions' },
      h('button', { type: 'button', class: 'btn big primary', onclick: open },
        inClass ? '繼續上課' : '開始上課', pair ? `（${first.student.name}）` : '', icon('arrow')),
      pair
        ? h('div', { class: 'hero-pair-links' }, present.map((item) => button(`${item.student.name} 總覽`, () => go('overview', { studentId: item.student.id }), 'ghost')))
        : button('看總覽', () => go('overview', { studentId: first.student.id }), 'ghost')));
}

/**
 * One of today's students in the 今天的學生 card: time and name, which class, and whether the plan is written.
 * A student on leave stays listed with the reason. A row opens the student's overview.
 */
function todayRow(item, lesson) {
  const { student, event, done, inClass, planned } = item;
  const away = !!event.change;
  const state = away ? '不算一堂' : done ? '已完成' : inClass ? '上課中' : '';
  const meta = away ? [] : [lesson.classText].filter(Boolean);
  return h('button', {
    type: 'button',
    class: `tl-row${done ? ' is-done' : ''}${away ? ' is-away' : ''}`,
    onclick: () => go('overview', { studentId: student.id }),
  },
  h('span', { class: 'tl-dot', 'aria-hidden': 'true' }, done ? icon('check') : ''),
  h('span', { class: 'tl-main' },
    h('span', { class: 'tl-who' },
      h('span', { class: 'tl-time' }, event.time),
      h('span', { class: 'tl-name' }, student.name, birthdayTag(student))),
    h('span', { class: 'tl-meta' },
      away ? h('span', { class: 'tl-tag' }, event.change) : null,
      [...meta, state].filter(Boolean).join('・'),
      !away && !done && !inClass && h('span', { class: `tl-plan${planned ? ' is-ready' : ''}` }, planned ? '已排課表' : '還沒排課表'))));
}

/**
 * 今天的學生 (2026-11-25): every booking of today in one card beside the next class, in place of the 今天進度 and
 * 還沒排課表 tiles. A 1:2 class keeps its two rows together.
 */
function todayList(lessons, span) {
  const classes = lessons.filter((lesson) => !lesson.off);
  const finished = classes.filter((lesson) => lesson.done).length;
  return h('section', { class: `today-list rise ${span}` },
    h('div', { class: 'tl-head' },
      h('h2', { class: 'tile-title' }, '今天的學生'),
      classes.length > 0 && h('span', { class: 'tl-progress' }, `完成 ${finished} / ${classes.length} 堂`)),
    h('div', { class: 'tl-rows' }, lessons.map((lesson) => (lesson.items.length === 1
      ? todayRow(lesson.items[0], lesson)
      : h('div', { class: 'tl-pair', role: 'group', 'aria-label': `一對二 ${lesson.event.time}` },
        h('span', { class: 'tl-pair-label', 'aria-hidden': 'true' }, '一對二'),
        lesson.items.map((item) => todayRow(item, lesson)))))));
}

function welcome() {
  return h('section', { class: 'welcome rise span-6' },
    reformer(),
    h('h2', {}, '先連上公司 Google 帳號'),
    h('p', {}, '連好後，今天預約的學生會自動列在這裡。還沒準備好的話，可以先用示範資料試按。'),
    button('連線 Google', () => tab('settings'), 'big primary'),
    button('先看示範', () => { loadDemo(); refreshView(); }, 'ghost'));
}

export function todayView() {
  const today = dateKey();
  const events = store.all('events').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // A new student booked for a later day gets a card now, so the first plan can be written before that day.
  newStudentBookings(events, store.all('students'), today).forEach(studentForBooking);
  // A title shared by namesakes with no birthday is listed as unclear instead of creating yet another student.
  const unclear = events.filter((e) => bookingIsUnclear(store.all('students'), e));
  const readable = events.filter((e) => e.date === today && e.student && !unclear.includes(e));
  const unreadable = events.filter((e) => e.unreadable);
  // A class already finished today is behind us, so it does not need planning.
  const finished = new Set(store.all('sessions').filter((s) => s.status === 'done').map((s) => `${s.studentId}|${s.date}`));
  const upcoming = events.filter((e) => {
    if (!e.student || unclear.includes(e)) return false;
    const student = studentForEvent(store.all('students'), e);
    return !(student && finished.has(`${student.id}|${e.date}`));
  });
  const lessons = lessonsOf(readable.map((event) => describe(event, today)));
  // A class today without a plan simply starts from last time, so only later classes are listed as work to do.
  // A plan is used by the student's next class, so someone still to come today waits in today's list (planned or not)
  // and moves onto the calendar once today's class is done; a plan written now would otherwise go to today's class.
  const comingToday = new Set(lessons.flatMap((lesson) => lesson.present.filter((item) => !item.done).map((item) => item.student.id)));
  const need = studentsNeedingPlan(upcoming.filter((e) => e.date > today && !comingToday.has(studentForEvent(store.all('students'), e)?.id)),
    store.all('students'), store.all('plans'), today);
  const connected = isConnected();
  const demo = store.getMeta('demoLoaded');
  const noCalendar = connected && !chosenCalendars(store.getMeta('calendarIds'), store.getMeta('calendarId')).length;
  const status = currentStatus();

  // A lesson with everyone on 病假 is listed but is not a class.
  const items = lessons.filter((lesson) => !lesson.off);
  const hero = items.find((lesson) => lesson.inClass) || items.find((lesson) => !lesson.done);
  const left = items.filter((lesson) => !lesson.done).length;
  const title = !lessons.length ? '今天' : left ? `今天還有 ${left} 堂` : items.length ? '今天都上完了' : '今天';

  return h('div', { class: 'screen has-tabs' },
    h('main', { class: 'page bento' },
      h('header', { class: 'today-head span-6' },
        h('div', {},
          h('p', { class: 'today-date' }, formatDate(today)),
          h('h1', {}, title)),
        connected && h('div', { class: 'sync' },
          h('span', { class: `status${status.state === 'error' ? ' warn' : ''}`, 'data-sync-status': true }, status.message),
          h('button', { type: 'button', class: 'btn ghost', 'aria-label': '同步', onclick: () => syncNow() }, icon('sync')))),
      !connected && !demo && welcome(),
      noCalendar && h('section', { class: 'welcome rise span-6' },
        h('h2', {}, '最後一步：選擇日曆'),
        h('p', {}, '選好存放預約的公司日曆，今天的預約就會出現。'),
        button('選擇日曆', () => tab('settings'), 'big primary')),
      hero && heroCard(hero, 'span-4'),
      !hero && items.length > 0 && h('section', { class: 'empty rise span-4' }, reformer(), h('p', {}, need.length ? '辛苦了。接著可以排下次的課表。' : '辛苦了，今天的紀錄都存好了。')),
      !items.length && !noCalendar && (connected || demo) && h('section', { class: `empty rise ${lessons.length ? 'span-4' : 'span-6'}` }, reformer(), h('p', {}, lessons.length ? '今天的預約都請假了。' : '今天沒有你的預約。')),
      lessons.length > 0 && todayList(lessons, 'span-2'),
      unreadable.length > 0 && h('p', { class: 'warn-text span-6' },
        `有 ${unreadable.length} 筆預約的標題讀不到學生姓名：${unreadable.map((e) => e.title).join('、')}`),
      unclear.length > 0 && h('p', { class: 'warn-text span-6' },
        `有 ${unclear.length} 筆預約分不出是哪一位同名的學生，請在日曆姓名後面加上生日：${[...new Set(unclear.map((e) => `${e.date.slice(5).replace('-', '/')} ${e.student}`))].join('、')}`),
      need.length > 0 && planCalendar(need.map((item) => ({ ...item, count: laterCount(item, events, readable, today) })), today)),
    tabBar('today'));
}

const WEEK_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

function fullDay(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}/${d}（${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}）`;
}

/** The day number in a calendar cell; the first cell and the 1st of a month also show the month. */
function dayNumber(day, first) {
  if (day.today) return '今天';
  const [, m, d] = day.date.split('-').map(Number);
  return first || d === 1 ? `${m}/${d}` : String(d);
}

/**
 * Students booked but still without a plan, on a calendar (2026-11-25), so the week's planning shows at a glance.
 * Each name opens its plan. On a phone the empty days drop out and it reads as a list of days.
 */
function planCalendar(need, today) {
  const days = planCalendarWeeks(need, today).flat();
  return h('section', { class: 'stack rise span-6' },
    h('h2', { class: 'section-title' }, `還沒排課表（${need.length}）`),
    h('div', { class: 'plan-cal' },
      WEEK_LABELS.map((label) => h('span', { class: 'pc-head', 'aria-hidden': 'true' }, label)),
      days.map((day, i) => h('div', {
        class: `pc-day${day.past ? ' is-past' : ''}${day.today ? ' is-today' : ''}${day.items.length ? '' : ' is-empty'}`,
      },
      h('span', { class: 'pc-num', 'aria-hidden': 'true' }, dayNumber(day, i === 0)),
      h('span', { class: 'pc-full', 'aria-hidden': 'true' }, fullDay(day.date)),
      day.items.length > 0 && h('div', { class: 'pc-items' }, day.items.map(({ student, event, count }) => h('button', {
        type: 'button',
        class: 'pc-chip',
        'aria-label': `${[fullDay(event.date), event.time, student.name, student.birthday, count ? `第 ${count.no} 堂` : ''].filter(Boolean).join(' ')}，排課表`,
        onclick: () => go('plan', { studentId: student.id }),
      },
      h('span', { class: 'pc-time' }, event.time),
      h('span', { class: 'pc-name' }, student.name, birthdayTag(student)),
      count && h('span', { class: 'pc-count' }, `第 ${count.no} 堂`))))))));
}

/**
 * Which class a booking on the calendar will be. A class today that is still to come goes first. The two students of a
 * 1:2 class share one number, like on the day itself.
 */
function laterCount(item, events, todays, today) {
  const students = store.all('students');
  const sessions = store.all('sessions');
  const countOf = (student) => laterClassNumber(student, sessions, today,
    todays.some((e) => !e.change && studentForEvent(students, e)?.id === student.id));
  const mine = countOf(item.student);
  if (!item.event.group) return mine;
  const partnerEvent = events.find((e) => e.group === item.event.group && e.date === item.event.date && !e.change && e !== item.event);
  const partner = partnerEvent && studentForEvent(students, partnerEvent);
  if (!partner || partner.id === item.student.id) return mine;
  return pairClassNumber(mine, countOf(partner), !!item.student.classStart?.no, !!partner.classStart?.no);
}
