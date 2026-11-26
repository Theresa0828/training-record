// Which class of the term this is, and when the student comes next. Used in class, on the overview and at the end of class.
import { h, button, openSheet, toast } from './dom.js';
import * as store from './store.js';
import {
  PACKAGE_SIZES, addDays, classLabel, dateKey, dateWithWeek, doneSessions, nextClassInfo, nextBooking, classTeacherId, classCountFor, termFor, termFields,
  countsSeparately, countedClasses, separateStart, togetherStart, numberedBeforeSwitch,
} from './core.js';
import { me, team, teachersFor } from './team.js';
import { termRing } from './charts.js';

/**
 * The classes a number is checked against (2026-11-26: 防止記錯堂數): the last few with their dates and numbers, to
 * hold against the student's class card or contract. With colleagues, each says who taught it, and a class numbered
 * before the count switched says so, since its number follows the other way of counting.
 */
function recentClasses(history, student, staff, withNames, limit = 4) {
  if (!history.length) return h('p', { class: 'muted small' }, '還沒上過課。');
  const name = (s) => staff.find((p) => p.id === classTeacherId(s, staff))?.name || '';
  const note = (s) => [withNames ? name(s) : '', numberedBeforeSwitch(student, s) ? '換算法以前' : ''].filter(Boolean).join('・');
  return h('div', { class: 'recent-classes' },
    h('div', { class: 'stepper-label' }, '最近上的課'),
    h('ul', {}, history.slice(0, limit).map((s) => h('li', {},
      h('span', {}, dateWithWeek(s.date)),
      h('b', {}, s.classNo ? `第 ${s.classNo} 堂` : '沒有號碼'),
      h('span', { class: 'muted' }, note(s))))));
}

/**
 * Switching between 一起算 and 各算各的 (2026-11-26). The numbers so far were counted the other way, so the next number
 * is worked out again (each teacher's own classes of this term, or the latest class for everyone) and checked once
 * against the class card or contract. Nothing is saved until 號碼對了; onSaved gets the fields to save.
 */
export function countModeSheet(studentId, mode, onSaved) {
  const separate = mode === 'separate';
  openSheet(separate ? '換成各算各的' : '換成一起算', (close) => {
    const student = store.get('students', studentId);
    const staff = team();
    const history = doneSessions(store.all('sessions'), studentId);
    const after = { ...student, classCount: mode };
    const rows = separate
      ? teachersFor(studentId).filter((p) => !p.disabled).map((p) => ({
        id: p.id, name: p.name, ...separateStart(history, p.id, staff, termFor(after, p.id, staff).packageSize || PACKAGE_SIZES[0]),
      }))
      : [{ id: '', name: '', ...togetherStart(history, student) }];
    const list = h('div', { class: 'count-rows' });

    const done = (row) => {
      if (!separate) return row.last ? `最近一堂 ${dateWithWeek(row.last.date)}${row.last.classNo ? `，第 ${row.last.classNo} 堂` : ''}` : '還沒上過課';
      return row.taught ? `這一期上過 ${row.taught} 堂，最近一堂 ${dateWithWeek(row.last.date)}` : '這一期還沒上過';
    };
    const draw = () => list.replaceChildren(...rows.map((row) => h('section', { class: 'count-row' },
      h('div', { class: 'count-who' },
        row.name ? h('b', {}, row.name) : null,
        h('span', { class: 'muted small' }, done(row))),
      h('div', { class: 'count-fix' },
        h('button', {
          type: 'button', class: 'btn step', disabled: row.no <= 1, 'aria-label': `${row.name}少一堂`,
          onclick: () => { row.no = Math.max(1, row.no - 1); draw(); },
        }, '−'),
        h('span', { class: 'count-no', role: 'status' }, `下一堂第 ${row.no} 堂`),
        h('button', {
          type: 'button', class: 'btn step', disabled: row.no >= row.size, 'aria-label': `${row.name}多一堂`,
          onclick: () => { row.no = Math.min(row.size, row.no + 1); draw(); },
        }, '+')),
      h('div', { class: 'segmented', role: 'group', 'aria-label': `${row.name}這期共幾堂` }, PACKAGE_SIZES.map((option) => button(`共 ${option} 堂`, () => {
        row.size = option;
        row.no = Math.min(row.no, option);
        draw();
      }, 'chip-btn', { 'aria-pressed': option === row.size ? 'true' : 'false' }))))));

    const save = () => {
      const latest = store.get('students', studentId) || student;
      const fields = { classCount: mode };
      if (separate) {
        const switched = { ...latest, classCount: 'separate' };
        for (const row of rows) Object.assign(fields, termFields(switched, row.id, staff, { packageSize: row.size, classStart: { no: row.no, size: row.size } }));
      } else if (rows[0]) {
        Object.assign(fields, { packageSize: rows[0].size, classStart: { no: rows[0].no, size: rows[0].size } });
      }
      close();
      onSaved?.(fields);
    };

    draw();
    return h('div', { class: 'stack' },
      h('p', {}, separate
        ? '每位老師只數自己這一期上的課。請和學生的課卡或合約對一次，對了再按「號碼對了」。'
        : '所有老師接著同一個號碼數。請和學生的課卡或合約對一次，對了再按「號碼對了」。'),
      list,
      // Every class here comes before the switch being made, so none is marked as numbered before an earlier one.
      recentClasses(history, null, staff, staff.length > 0, 6),
      button('號碼對了', save, 'big primary'),
      button('取消，不換', close, 'ghost'));
  }, { wide: true });
}

/**
 * The count runs by itself; this is only for correcting it. With a session it corrects that class,
 * without one it sets what the next class will be. Each tap saves at once.
 */
export function classNumberSheet(studentId, session, onDone, teacherId = undefined) {
  openSheet(session ? '修正今天是第幾堂' : '修正下一堂是第幾堂', (close) => {
    const student = store.get('students', studentId);
    // Whose count: the class's teacher, or the one given. A student counted separately keeps one per teacher (2026-11-25).
    const staff = team();
    const teacher = session ? classTeacherId(session, staff) : teacherId ?? (me()?.id || '');
    const history = doneSessions(store.all('sessions'), studentId).filter((s) => s.id !== session?.id);
    const counted = classCountFor(history, student, teacher, staff);
    let size = session?.packageSize || termFor(student, teacher, staff).packageSize || counted.size;
    let no = session?.classNo || counted.no;
    const area = h('div', { class: 'stack' });

    function save() {
      const latest = store.get('students', studentId);
      if (session) {
        session.classNo = no;
        session.packageSize = size;
        store.save('sessions', session);
        store.save('students', { ...latest, ...termFields(latest, teacher, staff, { packageSize: size }) });
        // A 1:2 class counts for both (2026-11-24), so the partner's class today gets the same number.
        const partnerSession = session.pairWith && store.all('sessions')
          .find((s) => s.studentId === session.pairWith && s.date === session.date && classTeacherId(s, staff) === teacher);
        if (partnerSession) {
          store.save('sessions', { ...partnerSession, classNo: no, packageSize: size });
          const partner = store.get('students', session.pairWith);
          if (partner) store.save('students', { ...partner, ...termFields(partner, teacher, staff, { packageSize: size }) });
        }
      } else {
        store.save('students', { ...latest, ...termFields(latest, teacher, staff, { packageSize: size, classStart: { no, size } }) });
      }
      onDone?.();
    }

    function draw() {
      area.replaceChildren(
        h('div', { class: 'class-fix' },
          h('button', { type: 'button', class: 'btn step class-step', disabled: no <= 1, 'aria-label': '少一堂', onclick: () => { no = Math.max(1, no - 1); save(); draw(); } }, '−'),
          termRing(no, size),
          h('button', { type: 'button', class: 'btn step class-step', disabled: no >= size, 'aria-label': '多一堂', onclick: () => { no = Math.min(size, no + 1); save(); draw(); } }, '+')),
        h('p', { class: 'muted class-fix-text', role: 'status' }, classLabel(no, size)),
        // The classes this number follows, to check it against the class card (2026-11-26).
        recentClasses(countsSeparately(student) && teacher ? countedClasses(history, student, teacher, staff) : history,
          student, staff, staff.length > 0 && !countsSeparately(student)),
        h('div', { class: 'field' },
          h('div', { class: 'stepper-label' }, '這期共幾堂'),
          h('div', { class: 'segmented' }, PACKAGE_SIZES.map((option) => button(`${option} 堂`, () => {
            size = option;
            no = Math.min(no, size);
            save();
            draw();
          }, 'chip-btn', { 'aria-pressed': option === size ? 'true' : 'false' })))),
        button('好了', close, 'big primary'));
    }

    draw();
    return area;
  });
}

/**
 * The next class date. The company calendar wins: with a booking there, it is shown and the way to change it is
 * the calendar. Without one, the teacher picks a date here; each tap saves at once. The calendar is never changed.
 */
export function nextDateControl(studentId, onChange) {
  const wrap = h('div', { class: 'stack-sm next-date' });

  function save(date, time = '') {
    const student = store.get('students', studentId);
    store.save('students', { ...student, nextClassDate: date, nextClassTime: time });
    draw();
    onChange?.();
  }

  function draw() {
    const student = store.get('students', studentId);
    const today = dateKey();
    const events = store.all('events');
    const info = nextClassInfo(student, events, today, store.all('students'));
    const booking = nextBooking(student, events, today, store.all('students'));
    if (booking) {
      wrap.replaceChildren(
        h('p', { class: 'next-date-state is-confirmed' }, `日曆：${dateWithWeek(booking.date)}${booking.time ? ` ${booking.time}` : ''}`),
        h('p', { class: 'muted' }, '以公司日曆為準。要改時間，請在公司日曆修改，這裡會自動跟著更新。'));
      return;
    }
    const nextWeek = addDays(today, 7);
    const isPicked = (date) => info.confirmed && info.date === date;
    const choice = (label, date, time) => button(label, () => save(isPicked(date) ? '' : date, time), 'chip-btn', { 'aria-pressed': isPicked(date) ? 'true' : 'false' });
    const custom = h('input', { class: 'input', type: 'date', min: addDays(today, 1), 'aria-label': '選其他日期' });
    custom.value = info.confirmed && info.date !== nextWeek ? info.date : '';
    custom.addEventListener('change', () => {
      if (!custom.value) return;
      if (custom.value <= today) { toast('下次上課要選今天之後的日期'); custom.value = ''; return; }
      save(custom.value);
    });
    wrap.replaceChildren(...[
      h('p', { class: info.confirmed ? 'next-date-state is-confirmed' : 'next-date-state' },
        info.confirmed ? `已確認：${dateWithWeek(info.date)}${info.time ? ` ${info.time}` : ''}` : '日曆上還沒有預約，點一個日期'),
      info.confirmed && h('p', { class: 'muted' }, '日曆上還沒有預約。在日曆約好後，會改用日曆的日期和時間。'),
      h('div', { class: 'chips' }, choice(`下週同一天 ${dateWithWeek(nextWeek)}`, nextWeek, '')),
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '其他日期'), custom),
    ].filter(Boolean));
  }

  draw();
  return wrap;
}

export function nextDateSheet(studentId, onDone) {
  openSheet('下次上課', (close) => h('div', { class: 'stack' },
    nextDateControl(studentId, onDone),
    button('好了', close, 'big primary')));
}

/** The short text for the next class, for a button or a list. */
export function nextDateText(student) {
  const info = nextClassInfo(student, store.all('events'), dateKey(), store.all('students'));
  if (info.confirmed) return `下次 ${dateWithWeek(info.date)}`;
  return info.date ? `下次 ${dateWithWeek(info.date)}？` : '下次未確認';
}
