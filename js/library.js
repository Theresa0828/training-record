import { h, button, tabBar, openSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import { newId, APPARATUS } from './core.js';

function byKind(kind) {
  return store.all('exercises')
    .filter((e) => e.kind === kind)
    .sort((a, b) => (a.group || '').localeCompare(b.group || '', 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'));
}

function recentIds() {
  const counts = new Map();
  for (const session of store.all('sessions')) {
    for (const row of session.rows) counts.set(row.exerciseId, (counts.get(row.exerciseId) || 0) + 1);
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([id]) => id);
}

/** Search plus most-used first, so adding an exercise in class takes two taps. */
export function exercisePicker(defaultKind, onPick) {
  let kind = defaultKind || 'strength';
  let query = '';
  const results = h('div', { class: 'picker-results' });
  const search = h('input', { class: 'input', placeholder: '搜尋或輸入新動作', 'aria-label': '搜尋動作' });
  const tabs = h('div', { class: 'segmented' });

  function drawTabs() {
    tabs.replaceChildren(
      button('重訓', () => { kind = 'strength'; draw(); }, 'chip-btn', { 'aria-pressed': kind === 'strength' ? 'true' : 'false' }),
      button('皮拉提斯', () => { kind = 'pilates'; draw(); }, 'chip-btn', { 'aria-pressed': kind === 'pilates' ? 'true' : 'false' }));
  }

  function draw() {
    drawTabs();
    const items = byKind(kind);
    const recents = recentIds().map((id) => items.find((e) => e.id === id)).filter(Boolean).slice(0, 8);
    const matches = query ? items.filter((e) => e.name.toLowerCase().includes(query.toLowerCase())) : items;
    const exact = items.some((e) => e.name === query.trim());
    const pick = (exercise) => button(exercise.name, () => onPick(exercise), 'pick');
    results.replaceChildren(
      ...(query ? [] : (recents.length ? [h('div', { class: 'stepper-label' }, '最常用'), h('div', { class: 'pick-grid' }, recents.map(pick))] : [])),
      h('div', { class: 'stepper-label' }, query ? `搜尋結果（${matches.length}）` : '全部'),
      h('div', { class: 'pick-grid' }, matches.map(pick)),
      ...(query.trim() && !exact ? [button(`新增「${query.trim()}」到${kind === 'pilates' ? '皮拉提斯' : '重訓'}`, () => {
        const exercise = { id: newId('ex'), name: query.trim(), kind, group: '其他' };
        store.save('exercises', exercise);
        onPick(exercise);
      }, 'primary')] : []),
      ...(!query && !items.length ? [h('p', { class: 'muted' }, '這裡還沒有動作。輸入名稱就能新增，或到動作庫批次匯入。')] : []));
  }

  search.addEventListener('input', () => {
    query = search.value;
    draw();
  });
  draw();
  return h('div', { class: 'stack' }, tabs, search, results);
}

function editSheet(exercise) {
  openSheet('編輯動作', (close) => {
    const name = h('input', { class: 'input', value: exercise.name, 'aria-label': '動作名稱' });
    const group = h('input', { class: 'input', value: exercise.group || '', 'aria-label': '分類或器材' });
    return h('div', { class: 'stack' },
      h('div', { class: 'stepper-label' }, '動作名稱'), name,
      h('div', { class: 'stepper-label' }, exercise.kind === 'pilates' ? '器材' : '分類'), group,
      h('div', { class: 'row-between' },
        button('從動作庫移除', () => {
          store.save('exercises', { ...exercise, deleted: true });
          close();
          refreshView();
          toast(`已移除 ${exercise.name}，過去的紀錄不受影響`, {
            label: '復原',
            run: () => {
              store.save('exercises', { ...exercise, deleted: false });
              refreshView();
            },
          });
        }, 'ghost'),
        button('儲存', () => {
          if (!name.value.trim()) { toast('名稱不可空白'); return; }
          store.save('exercises', { ...exercise, name: name.value.trim(), group: group.value.trim() });
          close();
          refreshView();
        }, 'primary')));
  });
}

/** Each line is 器材, 動作 or just 動作. Duplicates are skipped so importing twice is safe. */
export function parseImport(text, kind) {
  const existing = new Set(store.all('exercises').filter((e) => e.kind === kind).map((e) => e.name));
  const added = [];
  for (const line of text.split(/\r?\n/)) {
    const parts = line.split(/[,，\t]/).map((p) => p.trim()).filter(Boolean);
    if (!parts.length) continue;
    const name = parts[parts.length - 1];
    const group = parts.length > 1 ? parts[0] : '其他';
    if (existing.has(name)) continue;
    existing.add(name);
    added.push({ id: newId('ex'), name, group, kind });
  }
  return added;
}

function importSheet() {
  openSheet('批次匯入動作', (close) => {
    let kind = 'pilates';
    const area = h('textarea', {
      class: 'input note-area',
      'aria-label': '動作清單',
      placeholder: `每行一個動作，可在前面加器材，例如：\nReformer, Footwork\nMat, Hundred\n器材可用：${APPARATUS.join('、')}`,
    });
    const kinds = h('div', { class: 'segmented' });
    const drawKinds = () => kinds.replaceChildren(
      button('皮拉提斯', () => { kind = 'pilates'; drawKinds(); }, 'chip-btn', { 'aria-pressed': kind === 'pilates' ? 'true' : 'false' }),
      button('重訓', () => { kind = 'strength'; drawKinds(); }, 'chip-btn', { 'aria-pressed': kind === 'strength' ? 'true' : 'false' }));
    drawKinds();
    return h('div', { class: 'stack' }, kinds, area, button('匯入', () => {
      const added = parseImport(area.value, kind);
      for (const exercise of added) store.save('exercises', exercise);
      close();
      refreshView();
      toast(`已新增 ${added.length} 個動作`);
    }, 'primary'));
  }, { wide: true });
}

export function libraryView() {
  const section = (kind, title) => {
    const items = byKind(kind);
    const groups = new Map();
    for (const item of items) {
      const group = item.group || '其他';
      if (!groups.has(group)) groups.set(group, []);
      groups.get(group).push(item);
    }
    return h('section', { class: 'stack' },
      h('h2', {}, `${title}（${items.length}）`),
      items.length === 0 && h('p', { class: 'muted' }, '還沒有動作，可以按「批次匯入」。'),
      [...groups.entries()].map(([group, list]) => h('div', { class: 'stack-sm' },
        h('div', { class: 'stepper-label' }, group),
        h('div', { class: 'pick-grid' }, list.map((exercise) => button(exercise.name, () => editSheet(exercise), 'pick'))))));
  };
  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title' },
      h('h1', {}, '動作庫'),
      h('div', { class: 'topbar-actions' },
        button('批次匯入', importSheet, ''))),
    h('main', { class: 'page stack-lg' }, section('pilates', '皮拉提斯'), section('strength', '重訓')),
    tabBar('library'));
}
