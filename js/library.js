import { h, button, tabBar, openSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import { newId, APPARATUS, usageCounts, searchExercises, commonExercises, swapOptions, learnAlternative } from './core.js';

function byKind(kind) {
  return store.all('exercises')
    .filter((e) => e.kind === kind)
    .sort((a, b) => (a.group || '').localeCompare(b.group || '', 'zh-Hant') || a.name.localeCompare(b.name, 'zh-Hant'));
}

function groupsOf(items, kind) {
  const seen = new Set(items.map((item) => item.group || '其他'));
  if (kind === 'pilates') for (const apparatus of APPARATUS) seen.add(apparatus);
  return [...seen];
}

/** Adds one exercise without leaving the class or the plan. */
function addExerciseSheet(kind, name, group, onAdded) {
  openSheet('新增動作', (close) => {
    let chosen = group || '其他';
    const input = h('input', { class: 'input', value: name || '', maxlength: 40, placeholder: '動作名稱', 'aria-label': '動作名稱' });
    const groups = h('div', { class: 'chips' });
    const drawGroups = () => groups.replaceChildren(...[...new Set([...groupsOf(byKind(kind), kind), '其他'])].map((option) => button(option, () => { chosen = option; drawGroups(); }, 'chip-btn', { 'aria-pressed': option === chosen ? 'true' : 'false' })));
    drawGroups();
    return h('div', { class: 'stack' }, input,
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, kind === 'pilates' ? '器材' : '部位'), groups),
      button('加入', () => {
        const clean = input.value.trim();
        if (!clean) { toast('名稱不可空白'); return; }
        const same = byKind(kind).find((item) => item.name === clean);
        const exercise = same || { id: newId('ex'), name: clean, kind, group: chosen };
        if (!same) store.save('exercises', exercise);
        close();
        onAdded(exercise);
      }, 'big primary'));
  });
}

/** Chooses which exercises to offer in place of this one. */
function alternativesSheet(exercise, onChange) {
  openSheet(`${exercise.name} 的替代動作`, (close) => {
    const list = h('div', { class: 'pick-grid' });
    const draw = () => {
      const latest = store.get('exercises', exercise.id) || exercise;
      const chosen = latest.alternatives || [];
      list.replaceChildren(...byKind(exercise.kind).filter((item) => item.id !== exercise.id).map((item) => button(item.name, () => {
        const next = chosen.includes(item.id) ? chosen.filter((id) => id !== item.id) : [...chosen, item.id];
        store.save('exercises', { ...latest, alternatives: next });
        draw();
        onChange?.();
      }, 'pick', { 'aria-pressed': chosen.includes(item.id) ? 'true' : 'false' })));
    };
    draw();
    return h('div', { class: 'stack' }, h('p', { class: 'muted' }, '點選就會出現在「換動作」最上面，再點一次取消。'), list, button('完成', close, 'big primary'));
  }, { wide: true });
}

/** Keeps the swaps of a finished class or plan, so the menu gets better without any setting up. */
export function rememberSwaps(rows, demo) {
  if (demo) return;
  for (const row of rows) {
    const from = row.replacedFrom && store.get('exercises', row.replacedFrom.id);
    if (from && !from.deleted) store.save('exercises', { ...from, alternatives: learnAlternative(from, row.exerciseId) });
  }
}

/**
 * The quick lists come first, so most changes take one tap after opening it:
 * alternatives for the current exercise, then the common ones. Searching is the fallback.
 */
export function exercisePicker(defaultKind, onPick, { current = null } = {}) {
  let kind = current?.kind || defaultKind || 'strength';
  let query = '';
  let group = null;
  let managing = false;
  const results = h('div', { class: 'picker-results' });
  const search = h('input', { class: 'input', placeholder: '搜尋動作，中英文都可以', 'aria-label': '搜尋動作' });
  const tabs = h('div', { class: 'segmented' });

  function drawTabs() {
    const choose = (next) => () => { kind = next; group = null; draw(); };
    tabs.replaceChildren(
      button('重訓', choose('strength'), 'chip-btn', { 'aria-pressed': kind === 'strength' ? 'true' : 'false' }),
      button('皮拉提斯', choose('pilates'), 'chip-btn', { 'aria-pressed': kind === 'pilates' ? 'true' : 'false' }));
  }

  function togglePin(exercise) {
    store.save('exercises', { ...exercise, pinned: !exercise.pinned });
    draw();
  }

  function pick(exercise) {
    if (managing) {
      return button(`${exercise.pinned ? '★' : '☆'} ${exercise.name}`, () => togglePin(exercise), 'pick', { 'aria-pressed': exercise.pinned ? 'true' : 'false' });
    }
    return button(exercise.name, () => onPick(exercise), 'pick');
  }

  const block = (title, list, extra) => h('section', { class: 'pick-block' },
    h('div', { class: 'row-between pick-head' }, h('h3', {}, title), extra),
    h('div', { class: 'pick-grid' }, list.map(pick)));

  function draw() {
    drawTabs();
    const items = byKind(kind);
    const usage = usageCounts(store.all('sessions'));
    const wanted = query.trim();
    const parts = [];
    const add = () => addExerciseSheet(kind, wanted, group, onPick);
    if (wanted) {
      const matches = searchExercises(items, wanted);
      // Adding is the main button only when nothing matched; a match is almost always what was meant.
      if (matches.length) parts.push(block(`找到 ${matches.length} 個`, matches));
      else parts.push(h('p', { class: 'muted' }, '動作庫裡沒有這個名字。'));
      if (!items.some((item) => item.name === wanted)) parts.push(button(`＋ 新增「${wanted}」`, add, matches.length ? 'add-row' : 'big primary'));
    } else {
      let offered = [];
      if (current && current.kind === kind && !managing) {
        const { sameGroup, list } = swapOptions(store.get('exercises', current.id) || current, items, usage);
        offered = list;
        if (list.length) {
          parts.push(block(sameGroup ? `同${kind === 'pilates' ? '器材' : '部位'}的動作` : '替代動作', list,
            store.get('exercises', current.id) && button('編輯', () => alternativesSheet(store.get('exercises', current.id), draw), 'ghost')));
        }
      }
      const common = commonExercises(items, usage, current?.id).filter((item) => !offered.includes(item));
      parts.push(block('常用動作', common.length || managing ? (managing ? items : common) : [],
        items.length > 0 && button(managing ? '完成' : '設定常用', () => { managing = !managing; draw(); }, 'ghost')));
      if (!common.length && !managing) parts.push(h('p', { class: 'muted' }, '用過的動作會自動排到這裡，也可以按「設定常用」自己挑。'));
      if (!managing) {
        const groups = groupsOf(items, kind);
        parts.push(h('section', { class: 'pick-block' },
          h('h3', {}, kind === 'pilates' ? '依器材找' : '依部位找'),
          h('div', { class: 'chips' }, groups.map((option) => button(option, () => { group = group === option ? null : option; draw(); }, 'chip-btn', { 'aria-pressed': group === option ? 'true' : 'false' })))));
        if (group) {
          const inGroup = items.filter((item) => (item.group || '其他') === group);
          parts.push(inGroup.length ? h('div', { class: 'pick-grid' }, inGroup.map(pick)) : h('p', { class: 'muted' }, `${group} 還沒有動作。`));
        }
        parts.push(button('＋ 新增動作', add, 'add-row'));
      }
    }
    results.replaceChildren(...parts);
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
      button(exercise.pinned ? '★ 已設為常用，點一下取消' : '☆ 設為常用', () => {
        store.save('exercises', { ...exercise, pinned: !exercise.pinned });
        close();
        refreshView();
      }, ''),
      button(`設定替代動作（${(exercise.alternatives || []).length}）`, () => { close(); alternativesSheet(store.get('exercises', exercise.id) || exercise); }, ''),
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
    return h('section', { class: 'stack span-6' },
      h('h2', {}, `${title}（${items.length}）`),
      items.length === 0 && h('p', { class: 'muted' }, '還沒有動作，可以按「批次匯入」。'),
      h('div', { class: 'bento' }, [...groups.entries()].map(([group, list]) => h('div', { class: `card stack-sm ${list.length > 10 ? 'span-6' : 'span-3'}` },
        h('h3', {}, group),
        h('div', { class: 'pick-grid' }, list.map((exercise) => button(exercise.pinned ? `★ ${exercise.name}` : exercise.name, () => editSheet(exercise), 'pick')))))));
  };
  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title' },
      h('h1', {}, '動作庫'),
      h('div', { class: 'topbar-actions' },
        button('批次匯入', importSheet, 'ghost'),
        button('＋ 新增動作', () => addExerciseSheet('strength', '', null, () => refreshView()), 'primary'))),
    h('main', { class: 'page stack-lg' }, section('pilates', '皮拉提斯'), section('strength', '重訓')),
    tabBar('library'));
}
