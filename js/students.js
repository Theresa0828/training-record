// Everyone in one list, for looking someone up outside of today's bookings.
import { h, button, go, tabBar, toast } from './dom.js';
import * as store from './store.js';
import { doneSessions, studentGroups } from './core.js';
import { studentForBooking, kindLabel } from './today.js';
import { icon } from './icons.js';

// markArchived: only search results say 已封存; inside the 已封存 fold it would repeat on every row.
function row(student, markArchived = true) {
  const last = doneSessions(store.all('sessions'), student.id)[0];
  const needsProfile = !student.contraindications && !student.goal;
  const chip = student.archived && markArchived ? h('span', { class: 'chip' }, '已封存')
    : needsProfile ? h('span', { class: 'chip chip-alert' }, '未建檔') : h('span', {});
  return h('button', { type: 'button', class: 'slot student-row', onclick: () => go('overview', { studentId: student.id }) },
    h('span', {},
      h('span', { class: 'slot-name' }, student.name, student.birthday ? h('small', { class: 'muted' }, ` ${student.birthday}`) : null),
      h('span', { class: 'slot-meta' }, last ? `上次 ${last.date.slice(5).replace('-', '/')}・${kindLabel(last.kind)}` : '還沒有紀錄')),
    chip,
    icon('next', 'go'));
}

// Graduated students fold away at the bottom (2026-11-25); the fold stays as it was left while searching.
let archiveOpen = false;

function archiveFold(archived) {
  const fold = h('details', { class: 'fold archive-fold', open: archiveOpen },
    h('summary', {},
      h('span', { class: 'stack-xs' }, h('span', {}, `已封存（${archived.length}）`), h('span', { class: 'muted small' }, '畢業或停課的學生，紀錄都留著')),
      icon('next')),
    h('div', { class: 'fold-body' }, archived.map((s) => row(s, false))));
  fold.addEventListener('toggle', () => { archiveOpen = fold.open; });
  return fold;
}

export function studentsView() {
  const everyone = store.all('students');
  const list = h('div', { class: 'timeline' });
  const search = h('input', { class: 'input', placeholder: '搜尋姓名，或輸入新學生姓名', 'aria-label': '搜尋或新增學生' });

  function draw() {
    const query = search.value.trim();
    const { active, archived } = studentGroups(everyone, query);
    list.replaceChildren(
      ...active.map((s) => row(s)),
      ...(!query && !active.length && archived.length ? [h('p', { class: 'muted' }, '所有學生都封存了。點下面「已封存」可以找到他們。')] : []),
      // A search shows archived students in the list itself, marked, so nobody has to open the fold to find them.
      ...(query ? archived.map((s) => row(s)) : archived.length ? [archiveFold(archived)] : []),
      ...(query && !everyone.some((s) => s.name === query)
        ? [button(`新增「${query}」`, () => go('overview', { studentId: studentForBooking({ student: query }).id }), 'big primary')]
        : []),
      ...(!query && !everyone.length ? [h('p', { class: 'muted' }, '還沒有學生。有預約時會自動出現，也可以在上面輸入姓名新增。')] : []));
  }
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    if (!search.value.trim()) { toast('請先輸入姓名'); return; }
    go('overview', { studentId: studentForBooking({ student: search.value.trim() }).id });
  });
  draw();

  const activeCount = everyone.filter((s) => !s.archived).length;
  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title' }, h('h1', {}, `學生（${activeCount}）`)),
    h('main', { class: 'page stack' }, search, list),
    tabBar('students'));
}
