// Which class of the term this is, and when the student comes next. Used in class, on the overview and at the end of class.
import { h, button, openSheet, toast } from './dom.js';
import * as store from './store.js';
import { PACKAGE_SIZES, addDays, classLabel, dateKey, dateWithWeek, nextClassInfo, nextBooking } from './core.js';

/**
 * Picks the class number. With a session it corrects that class; without one it sets what the next class will be.
 * One tap on a number finishes, because this is done between other things.
 */
export function classNumberSheet(studentId, session, onDone) {
  openSheet(session ? '今天是第幾堂' : '下一堂是第幾堂', (close) => {
    const student = store.get('students', studentId);
    let size = session?.packageSize || student.packageSize || student.classStart?.size || PACKAGE_SIZES[0];
    const current = session?.classNo ?? student.classStart?.no ?? null;
    const area = h('div', { class: 'stack' });

    function pick(no) {
      const latest = store.get('students', studentId);
      if (session) {
        session.classNo = no;
        session.packageSize = size;
        store.save('sessions', session);
        store.save('students', { ...latest, packageSize: size });
      } else {
        store.save('students', { ...latest, packageSize: size, classStart: { no, size } });
      }
      close();
      onDone?.();
    }

    function draw() {
      const numbers = Array.from({ length: size }, (_, i) => i + 1);
      area.replaceChildren(
        h('div', { class: 'field' },
          h('div', { class: 'stepper-label' }, '這期共幾堂'),
          h('div', { class: 'segmented' }, PACKAGE_SIZES.map((option) => button(`${option} 堂`, () => { size = option; draw(); }, 'chip-btn', { 'aria-pressed': option === size ? 'true' : 'false' })))),
        h('div', { class: 'field' },
          h('div', { class: 'stepper-label' }, session ? '點今天是第幾堂' : '點下一堂是第幾堂'),
          h('div', { class: 'chips class-numbers' }, numbers.map((no) => button(String(no), () => pick(no), 'chip-btn', {
            'aria-pressed': no === current ? 'true' : 'false',
            'aria-label': classLabel(no, size),
          })))));
    }

    draw();
    return area;
  });
}

/** The choices for the next class date. Each tap saves at once; the calendar is only read, never changed. */
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
    const info = nextClassInfo(student, events, today);
    const booking = nextBooking(student, events, today);
    const nextWeek = addDays(today, 7);
    const isPicked = (date) => info.confirmed && info.date === date;
    const choice = (label, date, time) => button(label, () => save(isPicked(date) ? '' : date, time), 'chip-btn', { 'aria-pressed': isPicked(date) ? 'true' : 'false' });
    const custom = h('input', { class: 'input', type: 'date', min: addDays(today, 1), 'aria-label': '選其他日期' });
    custom.value = info.confirmed && info.date !== booking?.date && info.date !== nextWeek ? info.date : '';
    custom.addEventListener('change', () => {
      if (!custom.value) return;
      if (custom.value <= today) { toast('下次上課要選今天之後的日期'); custom.value = ''; return; }
      save(custom.value);
    });
    wrap.replaceChildren(...[
      h('p', { class: info.confirmed ? 'next-date-state is-confirmed' : 'next-date-state' },
        info.confirmed ? `已確認：${dateWithWeek(info.date)}${info.time ? ` ${info.time}` : ''}` : '還沒確認，點一個日期'),
      info.conflict && h('p', { class: 'warn-text' }, `日曆上的下一堂是 ${dateWithWeek(booking.date)} ${booking.time}，和你確認的日期不同。`),
      h('div', { class: 'chips' },
        booking && choice(`日曆 ${dateWithWeek(booking.date)} ${booking.time}`, booking.date, booking.time),
        booking?.date !== nextWeek && choice(`下週同一天 ${dateWithWeek(nextWeek)}`, nextWeek, '')),
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
  const info = nextClassInfo(student, store.all('events'), dateKey());
  if (info.confirmed) return `下次 ${dateWithWeek(info.date)}`;
  return info.date ? `下次 ${dateWithWeek(info.date)}？` : '下次未確認';
}
