import { h, button, go, tab, tabBar, refreshView } from './dom.js';
import * as store from './store.js';
import { dateKey, chosenCalendars, studentForEvent, bookingIsUnclear, newStudentBookings, doneSessions, planCalendarItems, PLAN_FILTERS, filterPlanItems, planCalendarWeeks, newId, classLabel, pairClassNumber, laterClassNumber, deletedForBooking, classCountFor, termFor, planStudentId, ownHistory } from './core.js';
import { currentStatus, isConnected, syncNow, waitingNow } from './sync.js';
import { loadDemo } from './demo.js';
import { icon, reformer } from './icons.js';
import { me, team, mine, myPlan, joinStudent, canRestore } from './team.js';

const KIND = { strength: '重訓', pilates: '皮拉提斯' };

export function kindLabel(kind) {
  return KIND[kind] || '';
}

/**
 * Finds the student for a booking, creating one the first time a new name (or name with birthday) appears. A new
 * student belongs to the colleague signed in.
 */
export function studentForBooking(event) {
  const existing = studentForEvent(store.all('students'), event);
  if (existing) return existing;
  const student = { id: newId('s'), name: event.student, aliases: [], goal: '', contraindications: '', nextNotes: '', isNew: true };
  if (event.birthday) student.birthday = event.birthday;
  if (event.demo) student.demo = true;
  store.save('students', student);
  joinStudent(student);
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

/** Whether the teacher using this iPad set the student's next number by hand (修正下一堂是第幾堂). */
function byHand(student) {
  return !!termFor(student, me()?.id || '', team()).classStart?.no;
}

/** This teacher's plans, each under its student's id (2026-11-26: each teacher plans their own next class). */
function myPlans(students) {
  return students.map((s) => myPlan(s.id)).filter(Boolean).map((p) => ({ ...p, id: planStudentId(p) }));
}

/** What is known about one of today's bookings. */
function describe(event, today) {
  const student = studentForBooking(event);
  // Today lists this teacher's own classes; another teacher's class with the student today is theirs (2026-11-26).
  const session = store.all('sessions').find((s) => s.studentId === student.id && s.date === today && mine(s));
  // The class starts from this teacher's own last class (or the student's last of this kind), so say that one.
  const last = ownHistory(doneSessions(store.all('sessions'), student.id).filter((s) => s.date !== today), team(), me(), event.kind)[0];
  const plan = myPlan(student.id);
  const hasPlan = plan && !plan.used && plan.rows?.length;
  const content = hasPlan ? '用排好的課表' : last ? '帶入上次內容' : '還沒有紀錄';
  const history = doneSessions(store.all('sessions'), student.id).filter((s) => !(s.date === today && mine(s)));
  const count = session?.classNo ? { no: session.classNo, size: session.packageSize } : classCountFor(history, student, me()?.id || '', team());
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
    const count = present.find((item) => item.session?.classNo)?.count || (present.length ? present.map((item) => item.count).reduce((a, b, i) => pairClassNumber(a, b, byHand(present[0].student), byHand(present[i].student))) : null);
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
  const booked = store.all('events').sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
  // A booking for a student deleted in the last 30 days (2026-11-25) makes no new card: it is listed apart, so the
  // student can still be brought back without a namesake appearing beside them.
  const everyone = store.allIncludingDeleted('students');
  const gone = booked.filter((e) => e.student && e.date >= today && deletedForBooking(everyone, e));
  const events = booked.filter((e) => !gone.includes(e));
  // A new student booked for a later day gets a card now, so the first plan can be written before that day.
  newStudentBookings(events, store.all('students'), today).forEach(studentForBooking);
  // A title shared by namesakes with no birthday is listed as unclear instead of creating yet another student.
  const unclear = events.filter((e) => bookingIsUnclear(store.all('students'), e));
  // Everyone booked on this teacher's own calendar is theirs (2026-11-24), also a colleague's student who now takes
  // the other kind of class with them. The calendars chosen on this iPad are the signed-in teacher's own.
  for (const e of events) {
    if (e.student && e.date >= today && !unclear.includes(e)) joinStudent(studentForEvent(store.all('students'), e));
  }
  const readable = events.filter((e) => e.date === today && e.student && !unclear.includes(e));
  const unreadable = events.filter((e) => e.unreadable);
  // A class already finished today is behind us, so it does not need planning.
  const finished = new Set(store.all('sessions').filter((s) => s.status === 'done' && mine(s)).map((s) => `${s.studentId}|${s.date}`));
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
  // Every later booking goes on the calendar with what it needs, to be filtered there (2026-11-26).
  const calendar = planCalendarItems(upcoming, store.all('students'), myPlans(store.all('students')), today, comingToday);
  const need = calendar.filter((item) => item.state === 'need');
  const connected = isConnected();
  const demo = store.getMeta('demoLoaded');
  const noCalendar = connected && !chosenCalendars(store.getMeta('calendarIds'), store.getMeta('calendarId')).length;
  const status = currentStatus();
  const waiting = waitingNow();

  // A lesson with everyone on 病假 is listed but is not a class.
  const items = lessons.filter((lesson) => !lesson.off);
  const hero = items.find((lesson) => lesson.inClass) || items.find((lesson) => !lesson.done);
  const left = items.filter((lesson) => !lesson.done).length;
  const who = me();
  const title = !lessons.length ? '今天' : left ? `今天還有 ${left} 堂` : items.length ? '今天都上完了' : '今天';

  return h('div', { class: 'screen has-tabs' },
    h('main', { class: 'page bento' },
      h('header', { class: 'today-head span-6' },
        h('div', {},
          h('p', { class: 'today-date' }, formatDate(today), who ? `・${who.name}` : ''),
          h('h1', {}, title)),
        connected && h('div', { class: 'sync' },
          h('span', { class: `status${status.state === 'error' ? ' warn' : ''}`, 'data-sync-status': true }, status.message),
          h('button', { type: 'button', class: 'btn ghost', 'aria-label': '同步', onclick: () => syncNow() }, icon('sync')))),
      connected && waiting.late && lateUploads(waiting),
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
      gone.length > 0 && h('p', { class: 'warn-text span-6' },
        `有 ${gone.length} 筆預約的學生已經刪除：${[...new Set(gone.map((e) => `${e.date.slice(5).replace('-', '/')} ${e.student}`))].join('、')}。`,
        canRestore()
          ? '要找回來，到學生清單最下面的「最近刪除」復原；不用的話，請把日曆上的預約刪掉。'
          : '要找回來請找管理者復原；不用的話，請把日曆上的預約刪掉。'),
      calendar.length > 0 && planCalendar(calendar.map((item) => ({
        ...item,
        // Only the student's next class has a number yet; a later one or a day off does not.
        count: item.state === 'need' || item.state === 'planned' ? laterCount(item, events, readable, today) : null,
      })), today)),
    tabBar('today'));
}

/**
 * Records that have waited over a day for the cloud (2026-11-26, v47): until they are up they exist only on this iPad,
 * so a lost or broken iPad would take them along. Shown at the top of Today until they go.
 */
function lateUploads(w) {
  const what = [w.mine > 0 && `${w.mine} 筆紀錄`, w.photos > 0 && `${w.photos} 個照片影片`].filter(Boolean).join('、');
  const first = new Date(w.oldest);
  return h('section', { class: 'late-uploads warn-text span-6', role: 'status' },
    h('p', {}, `有 ${what}還沒上傳到雲端（最早一筆在 ${first.getMonth() + 1}/${first.getDate()}），現在只存在這台 iPad。連上網路後按「立即同步」，一直不行請找管理者。`),
    button('立即同步', () => syncNow(), ''));
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

const FILTER_KEY = 'planCalendarFilter';
const STATE_WORDS = { need: '還沒排課表', planned: '已排課表', wait: '上完前一堂才能排', leave: '請假' };
const FILTER_EMPTY = { all: '接下來沒有預約。', need: '接下來的課都排好了。', planned: '還沒有排好的課表。', leave: '接下來沒有人請假。' };

/** The filter last picked on this iPad; 全部 the first time. */
function savedFilter() {
  try {
    const value = localStorage.getItem(FILTER_KEY);
    return PLAN_FILTERS.some(([key]) => key === value) ? value : 'all';
  } catch {
    return 'all';
  }
}

/** One booking on the calendar. Only the next class of a student can be planned; the rest open the overview. */
function calendarChip({ student, event, count, state }) {
  const plannable = state === 'need' || state === 'planned';
  return h('button', {
    type: 'button',
    class: `pc-chip is-${state}`,
    'aria-label': `${[fullDay(event.date), event.time, student.name, student.birthday, count ? `第 ${count.no} 堂` : ''].filter(Boolean).join(' ')}，${state === 'leave' ? event.change : STATE_WORDS[state]}，${plannable ? '排課表' : '看總覽'}`,
    onclick: () => go(plannable ? 'plan' : 'overview', { studentId: student.id }),
  },
  h('span', { class: 'pc-time' }, event.time),
  h('span', { class: 'pc-name' }, student.name, birthdayTag(student)),
  count && h('span', { class: 'pc-count' }, `第 ${count.no} 堂`),
  state === 'planned' && h('span', { class: 'pc-state' }, icon('check'), '已排'),
  state === 'wait' && h('span', { class: 'pc-state' }, '上完再排'),
  state === 'leave' && h('span', { class: 'pc-state' }, event.change));
}

/**
 * Every later booking on a calendar (2026-11-25), filtered by what it needs (2026-11-26: 全部、還沒排、已排、請假).
 * A name that can be planned opens its plan. On a phone the empty days drop out and it reads as a list of days.
 */
function planCalendar(items, today) {
  let filter = savedFilter();
  const counts = Object.fromEntries(PLAN_FILTERS.map(([key]) => [key, filterPlanItems(items, key).length]));
  const section = h('section', { class: 'stack rise span-6' });
  function draw() {
    const shown = filterPlanItems(items, filter);
    const days = planCalendarWeeks(shown, today).flat();
    section.replaceChildren(
      h('div', { class: 'pc-top' },
        h('h2', { class: 'section-title' }, '接下來的課'),
        h('div', { class: 'segmented pc-filters', role: 'group', 'aria-label': '只看哪些課' }, PLAN_FILTERS.map(([key, label]) => button(
          [h('span', {}, label), h('span', { class: 'pc-filter-count' }, String(counts[key]))],
          () => {
            filter = key;
            try { localStorage.setItem(FILTER_KEY, key); } catch { /* the choice is only a convenience */ }
            draw();
          },
          'chip-btn',
          { 'aria-pressed': filter === key ? 'true' : 'false', 'aria-label': `${label}，${counts[key]} 堂` },
        )))),
      shown.length
        ? h('div', { class: 'plan-cal' },
          WEEK_LABELS.map((label) => h('span', { class: 'pc-head', 'aria-hidden': 'true' }, label)),
          days.map((day, i) => h('div', {
            class: `pc-day${day.past ? ' is-past' : ''}${day.today ? ' is-today' : ''}${day.items.length ? '' : ' is-empty'}`,
          },
          h('span', { class: 'pc-num', 'aria-hidden': 'true' }, dayNumber(day, i === 0)),
          h('span', { class: 'pc-full', 'aria-hidden': 'true' }, fullDay(day.date)),
          day.items.length > 0 && h('div', { class: 'pc-items' }, day.items.map(calendarChip)))))
        : h('p', { class: 'muted pc-none' }, FILTER_EMPTY[filter]));
  }
  draw();
  return section;
}

/**
 * Which class a booking on the calendar will be. A class today that is still to come goes first. The two students of a
 * 1:2 class share one number, like on the day itself.
 */
function laterCount(item, events, todays, today) {
  const students = store.all('students');
  const sessions = store.all('sessions');
  const countOf = (student) => laterClassNumber(student, sessions, today,
    todays.some((e) => !e.change && studentForEvent(students, e)?.id === student.id), me()?.id || '', team());
  const own = countOf(item.student);
  if (!item.event.group) return own;
  const partnerEvent = events.find((e) => e.group === item.event.group && e.date === item.event.date && !e.change && e !== item.event);
  const partner = partnerEvent && studentForEvent(students, partnerEvent);
  if (!partner || partner.id === item.student.id) return own;
  return pairClassNumber(own, countOf(partner), byHand(item.student), byHand(partner));
}
