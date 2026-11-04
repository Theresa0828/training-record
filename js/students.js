// Everyone in one list, for looking someone up outside of today's bookings.
import { h, button, go, tabBar, toast } from './dom.js';
import * as store from './store.js';
import { doneSessions } from './core.js';
import { studentForBooking, kindLabel } from './today.js';
import { icon } from './icons.js';

function row(student) {
  const last = doneSessions(store.all('sessions'), student.id)[0];
  const needsProfile = !student.contraindications && !student.goal;
  return h('button', { type: 'button', class: 'slot student-row', onclick: () => go('overview', { studentId: student.id }) },
    h('span', {},
      h('span', { class: 'slot-name' }, student.name),
      h('span', { class: 'slot-meta' }, last ? `上次 ${last.date.slice(5).replace('-', '/')}・${kindLabel(last.kind)}` : '還沒有紀錄')),
    needsProfile ? h('span', { class: 'chip chip-alert' }, '未建檔') : h('span', {}),
    icon('next', 'go'));
}

export function studentsView() {
  const students = store.all('students').sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  const list = h('div', { class: 'timeline' });
  const search = h('input', { class: 'input', placeholder: '搜尋姓名，或輸入新學生姓名', 'aria-label': '搜尋或新增學生' });

  function draw() {
    const query = search.value.trim();
    const matches = query ? students.filter((s) => s.name.includes(query)) : students;
    list.replaceChildren(
      ...matches.map(row),
      ...(query && !students.some((s) => s.name === query)
        ? [button(`新增「${query}」`, () => go('overview', { studentId: studentForBooking(query, false).id }), 'big primary')]
        : []),
      ...(!query && !students.length ? [h('p', { class: 'muted' }, '還沒有學生。有預約時會自動出現，也可以在上面輸入姓名新增。')] : []));
  }
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!search.value.trim()) { toast('請先輸入姓名'); return; }
    go('overview', { studentId: studentForBooking(search.value.trim(), false).id });
  });
  draw();

  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title' }, h('h1', {}, `學生（${students.length}）`)),
    h('main', { class: 'page stack' }, search, list),
    tabBar('students'));
}
