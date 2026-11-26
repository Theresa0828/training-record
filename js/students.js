// Everyone in one list, for looking someone up outside of today's bookings.
import { h, button, go, tabBar, toast } from './dom.js';
import * as store from './store.js';
import { doneSessions, studentGroups, recentlyDeleted, restoreDaysLeft } from './core.js';
import { studentForBooking, kindLabel } from './today.js';
import { icon } from './icons.js';
import { me, team, visible, canSee, teachersFor, canRestore } from './team.js';

// The admin's choice between their own students and everyone's (2026-11-24); a teacher only has their own.
let showAll = false;

// markArchived: only search results say 已封存; inside the 已封存 fold it would repeat on every row.
// An admin sees who teaches each student, and which students nobody teaches any more.
function row(student, markArchived = true) {
  const last = doneSessions(store.all('sessions'), student.id)[0];
  const needsProfile = !student.contraindications && !student.goal;
  const admin = me()?.role === 'admin' && !student.demo;
  const teachers = admin ? teachersFor(student.id).filter((p) => !p.disabled) : [];
  const chip = student.archived && markArchived ? h('span', { class: 'chip' }, '已封存')
    : admin && !teachers.length ? h('span', { class: 'chip' }, '沒有老師')
      : needsProfile ? h('span', { class: 'chip chip-alert' }, '未建檔') : h('span', {});
  const meta = [last ? `上次 ${last.date.slice(5).replace('-', '/')}・${kindLabel(last.kind)}` : '還沒有紀錄'];
  if (admin && showAll && teachers.length) meta.push(teachers.map((p) => p.name).join('、'));
  return h('button', { type: 'button', class: 'slot student-row', onclick: () => go('overview', { studentId: student.id }) },
    h('span', {},
      h('span', { class: 'slot-name' }, student.name, student.birthday ? h('small', { class: 'muted' }, ` ${student.birthday}`) : null),
      h('span', { class: 'slot-meta' }, meta.join('・'))),
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

// Students deleted in the last 30 days (2026-11-25), for whoever may delete: brought back with one tap.
let deletedOpen = false;

function deletedRow(student, redraw, main = false) {
  const by = student.deletedBy && team().find((p) => p.id === student.deletedBy)?.name;
  const day = new Date(student.deletedAt);
  const restore = () => {
    store.restoreStudent(student.id);
    redraw();
    toast(`已復原 ${student.name} 的所有紀錄`, { label: '打開', run: () => go('overview', { studentId: student.id }) });
  };
  return h('div', { class: 'slot student-row deleted-row' },
    h('span', {},
      h('span', { class: 'slot-name' }, student.name, student.birthday ? h('small', { class: 'muted' }, ` ${student.birthday}`) : null),
      h('span', { class: 'slot-meta' }, `${day.getMonth() + 1}/${day.getDate()} ${by || ''}刪除・還剩 ${restoreDaysLeft(student)} 天`)),
    button('復原', restore, main ? 'primary' : ''));
}

function deletedFold(deleted, redraw) {
  const fold = h('details', { class: 'fold archive-fold deleted-fold', open: deletedOpen },
    h('summary', {},
      h('span', { class: 'stack-xs' }, h('span', {}, `最近刪除（${deleted.length}）`), h('span', { class: 'muted small' }, '30 天內可以復原，之後就清掉')),
      icon('next')),
    h('div', { class: 'fold-body' }, deleted.map((s) => deletedRow(s, redraw))));
  fold.addEventListener('toggle', () => { deletedOpen = fold.open; });
  return fold;
}

/**
 * A typed name that is already a colleague's student. Typing the name does not hand a teacher that student's
 * records: an admin adds them (2026-11-24), or the student's booking on their own calendar does.
 */
function colleaguesStudent(name, shown) {
  const hit = (s) => s.name === name || (s.aliases || []).includes(name);
  return shown.some(hit) ? null : store.all('students').find((s) => hit(s) && !canSee(s)) || null;
}

const notYours = (name) => `已經有一位${name}，是別的老師的學生。要一起教請找管理者加你；他出現在你的預約日曆上時也會自動加進來。`;

export function studentsView() {
  const admin = me()?.role === 'admin';
  if (!admin) showAll = false;
  const list = h('div', { class: 'timeline' });
  const search = h('input', { class: 'input', placeholder: '搜尋姓名，或輸入新學生姓名', 'aria-label': '搜尋或新增學生' });
  const title = h('h1', {});
  const scope = admin ? h('div', { class: 'segmented students-scope', role: 'group', 'aria-label': '顯示哪些學生' }) : null;

  // An admin's search looks through everyone, so a colleague's student is found without switching to 全部.
  const pool = (query) => visible(store.all('students'), showAll || (admin && !!query));

  function draw() {
    const query = search.value.trim();
    const shown = pool(query);
    const { active, archived } = studentGroups(shown, query);
    const taken = query ? colleaguesStudent(query, shown) : null;
    // A search finds a deleted student too, so nobody adds a new card for someone who can still come back.
    const deleted = canRestore() ? recentlyDeleted(store.allIncludingDeleted('students').filter((s) => !s.demo)) : [];
    const deletedHits = query ? deleted.filter((s) => s.name.includes(query) || (s.aliases || []).some((a) => a.includes(query))) : [];
    title.textContent = `${showAll ? '全部學生' : '學生'}（${pool('').filter((s) => !s.archived).length}）`;
    list.replaceChildren(
      ...active.map((s) => row(s)),
      // The empty notes sit above the folds, so a list with only 最近刪除 does not end on 「還沒有學生」.
      ...(!query && !shown.length ? [h('p', { class: 'muted' }, '還沒有學生。有預約時會自動出現，也可以在上面輸入姓名新增。')] : []),
      ...(!query && !active.length && archived.length ? [h('p', { class: 'muted' }, '所有學生都封存了。點下面「已封存」可以找到他們。')] : []),
      // A search shows archived students in the list itself, marked, so nobody has to open the fold to find them.
      ...(query ? archived.map((s) => row(s)) : archived.length ? [archiveFold(archived)] : []),
      ...(query ? deletedHits.map((s) => deletedRow(s, draw, s.name === query)) : deleted.length ? [deletedFold(deleted, draw)] : []),
      ...(taken ? [h('p', { class: 'muted', role: 'status' }, notYours(taken.name))]
        : query && !shown.some((s) => s.name === query)
          ? [button(`新增「${query}」`, () => go('overview', { studentId: studentForBooking({ student: query }).id }), deletedHits.some((s) => s.name === query) ? 'big' : 'big primary')]
          : []));
  }
  function drawScope() {
    if (!scope) return;
    const choice = (value, label) => button(label, () => {
      if (showAll === value) return;
      showAll = value;
      drawScope();
      draw();
    }, 'chip-btn', { 'aria-pressed': showAll === value ? 'true' : 'false' });
    scope.replaceChildren(choice(false, '我的學生'), choice(true, '全部'));
  }
  search.addEventListener('input', draw);
  search.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const query = search.value.trim();
    if (!query) { toast('請先輸入姓名'); return; }
    const taken = colleaguesStudent(query, pool(query));
    if (taken) { toast(notYours(taken.name)); return; }
    if (canRestore() && recentlyDeleted(store.allIncludingDeleted('students')).some((s) => s.name === query)) {
      toast(`${query} 剛刪除不久，按「復原」就找得回來。要新增另一位同名的學生，請按「新增」。`);
      return;
    }
    go('overview', { studentId: studentForBooking({ student: query }).id });
  });
  drawScope();
  draw();

  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title' }, title),
    scope && h('div', { class: 'students-kinds' }, scope),
    h('main', { class: 'page stack' }, search, list),
    tabBar('students'));
}
