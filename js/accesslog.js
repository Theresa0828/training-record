// Who opened or changed which student, and when (2026-11-25: 管理者查誰在什麼時候看過改過哪位學生).
// The Apps Script keeps the log in the cloud and takes who it was from each request's login code, so the log is
// read online and only an admin gets it.
import { h, button, openSheet } from './dom.js';
import * as store from './store.js';
import { call, isConnected } from './sync.js';
import { staffList, logDays, logActText, logTimeText, dateWithWeek, lostValueText, lostValueLabel, lostValueWriter } from './core.js';

const NOTE = '打開學生的畫面算「看過」，同一人 30 分鐘內算一次。只記開始和同事一起用以後、在 App 裡的動作；直接打開雲端資料夾看檔案不會記下。';
const MAX_MONTHS = 24;

function studentName(id) {
  const student = store.get('students', id);
  if (!student?.name) return '已刪除的學生';
  return student.deleted ? `${student.name}（已刪除）` : student.name;
}

/** The admin's view of the log: everyone's (with a colleague to pick), or one student's. */
export function logSheet(student = null) {
  openSheet(student ? `誰看過、改過${student.name}` : '誰看過、改過學生', () => {
    const staff = staffList(store.all('options'));
    const nameOf = (id) => staff.find((p) => p.id === id)?.name || '已移除的同事';
    let months = 3;
    let by = '';
    let entries = [];
    let more = false;
    let asked = 0;
    const filters = student ? null : h('div', { class: 'chips log-filters', role: 'group', 'aria-label': '只看一位同事' });
    const status = h('p', { class: 'muted', role: 'status' });
    const list = h('div', { class: 'log-list' });
    const earlier = button('再看更早的 3 個月', () => { months = Math.min(MAX_MONTHS, months + 3); load(); }, '');
    const again = button('再試一次', () => load(), '');

    function drawFilters() {
      if (!filters) return;
      const chip = (id, label) => button(label, () => {
        by = id;
        drawFilters();
        draw();
      }, 'chip-btn', { 'aria-pressed': by === id ? 'true' : 'false' });
      filters.replaceChildren(chip('', '全部'), ...staff.map((p) => chip(p.id, p.disabled ? `${p.name}（已停用）` : p.name)));
    }

    function draw() {
      const shown = by ? entries.filter((e) => e.by === by) : entries;
      const span = `最近 ${months} 個月`;
      status.textContent = shown.length
        ? `${span}，${shown.length} 筆${more ? '（太多了，只列最新的 1000 筆）' : ''}`
        : `${span}沒有紀錄。`;
      list.replaceChildren(...logDays(shown).map(({ day, entries: items }) => h('section', { class: 'log-day' },
        h('h3', { class: 'log-date' }, dateWithWeek(day)),
        h('ul', { class: 'log-rows' }, items.map((e) => h('li', { class: 'log-row' },
          h('span', { class: 'log-time' }, logTimeText(e)),
          h('span', { class: 'log-who' }, nameOf(e.by)),
          h('span', { class: 'log-what' }, student ? logActText(e) : `${studentName(e.student)}・${logActText(e)}`),
          // What gave way when two teachers changed the same field (2026-11-26), so it can be typed back if needed.
          e.act === 'conflict' && h('ul', { class: 'log-lost' }, (e.lost || []).map((l) => h('li', {},
            h('span', { class: 'log-lost-label' }, lostValueLabel(l, lostValueWriter(entries, e, l) ? nameOf(lostValueWriter(entries, e, l)) : '')),
            h('span', { class: 'log-lost-value' }, l.erased ? '（這位學生刪除滿 30 天，內容已經清掉）' : lostValueText(l.field, l.value)))))))))));
      earlier.hidden = months >= MAX_MONTHS || more;
    }

    async function load() {
      const ask = ++asked;
      again.hidden = true;
      earlier.hidden = true;
      if (!isConnected()) {
        status.textContent = '這台裝置還沒連 Google。存取紀錄存在雲端，要連上才看得到。';
        return;
      }
      status.textContent = '讀取中…';
      try {
        const data = await call('log', { months, ...(student ? { student: student.id } : {}) });
        if (ask !== asked) return;
        entries = data.events || [];
        more = !!data.more;
        draw();
      } catch (error) {
        if (ask !== asked) return;
        // The sync's own wording names deployment settings; whoever reads the log only needs to know to get online.
        status.textContent = /unknown action/.test(error.message)
          ? '雲端連線程式還沒更新，更新後才會開始記錄。'
          : /連不上|太久沒回應|沒有回傳/.test(error.message)
            ? '連不上 Google，可能是網路斷了。存取紀錄存在雲端，連上網路後按「再試一次」。'
            : `讀不到存取紀錄：${error.message}`;
        again.hidden = /unknown action/.test(error.message);
      }
    }

    drawFilters();
    load();
    return h('div', { class: 'stack' }, filters, status, again, list, earlier, h('p', { class: 'muted small' }, NOTE));
  }, { wide: true });
}
