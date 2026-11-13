// Which class of the term this is, and when the student comes next. Used in class, on the overview and at the end of class.
import { h, button, openSheet, toast } from './dom.js';
import * as store from './store.js';
import { PACKAGE_SIZES, addDays, classLabel, dateKey, dateWithWeek, doneSessions, nextClassInfo, nextBooking, nextClassNumber } from './core.js';
import { termRing } from './charts.js';

/**
 * The count runs by itself; this is only for correcting it. With a session it corrects that class,
 * without one it sets what the next class will be. Each tap saves at once.
 */
export function classNumberSheet(studentId, session, onDone) {
  openSheet(session ? '修正今天是第幾堂' : '修正下一堂是第幾堂', (close) => {
    const student = store.get('students', studentId);
    const history = doneSessions(store.all('sessions'), studentId).filter((s) => s.id !== session?.id);
    const counted = nextClassNumber(history, student);
    let size = session?.packageSize || student.packageSize || counted.size;
    let no = session?.classNo || counted.no;
    const area = h('div', { class: 'stack' });

    function save() {
      const latest = store.get('students', studentId);
      if (session) {
        session.classNo = no;
        session.packageSize = size;
        store.save('sessions', session);
        store.save('students', { ...latest, packageSize: size });
      } else {
        store.save('students', { ...latest, packageSize: size, classStart: { no, size } });
      }
      onDone?.();
    }

    function draw() {
      area.replaceChildren(
        h('div', { class: 'class-fix' },
          h('button', { type: 'button', class: 'btn step class-step', disabled: no <= 1, 'aria-label': '少一堂', onclick: () => { no -= 1; save(); draw(); } }, '−'),
          termRing(no, size),
          h('button', { type: 'button', class: 'btn step class-step', disabled: no >= size, 'aria-label': '多一堂', onclick: () => { no += 1; save(); draw(); } }, '+')),
        h('p', { class: 'muted class-fix-text', role: 'status' }, classLabel(no, size)),
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
