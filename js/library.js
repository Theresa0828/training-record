import { h, button, holdButton, tabBar, openSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import {
  newId, APPARATUS, usageCounts, searchExercises, commonExercises, swapOptions, learnAlternative,
  PILATES_REGIONS, PILATES_POSTURES, PILATES_FOCUS, PILATES_LEVELS, cleanPilatesTags, pilatesTagText, filterPilates, pilatesSteps,
} from './core.js';
import { handoutSheet, importHandoutSheet } from './handout.js';

function byKind(kind) {
  return store.all('exercises')
    .filter((e) => e.kind === kind)
    .sort((a, b) => (a.group || '').localeCompare(b.group || '', 'zh-Hant')
      // Handout exercises keep the book's order; anything added by hand follows, by name.
      || (a.order ?? Infinity) - (b.order ?? Infinity) || 0
      || a.name.localeCompare(b.name, 'zh-Hant'));
}

function groupsOf(items, kind) {
  const seen = new Set(items.map((item) => item.group || '其他'));
  if (kind === 'pilates') for (const apparatus of APPARATUS) seen.add(apparatus);
  return [...seen];
}

/** A name with its classification underneath, so similar Pilates names can be told apart. */
function exerciseLabel(exercise, prefix = '') {
  const tags = exercise.kind === 'pilates' ? pilatesTagText(exercise.tags) : '';
  return [h('span', { class: 'pick-name' }, `${prefix}${exercise.name}`), tags && h('small', { class: 'pick-tags' }, tags)];
}

const FILTER_ROWS = [['region', '部位', PILATES_REGIONS], ['posture', '姿勢', PILATES_POSTURES], ['focus', '重點', PILATES_FOCUS], ['level', '程度', PILATES_LEVELS]];

function emptyFilters() {
  return { region: '', posture: '', focus: '', level: '', apparatus: '' };
}

/**
 * Rows of filters for Pilates: 部位, 姿勢, 重點, 程度 and, once there is more than one, 器材.
 * One tap per row narrows the list, so a suitable exercise is a few taps away. Only values in use are offered.
 */
function pilatesFinder(items, filters, onChange, renderList) {
  const has = (key, value) => items.some((e) => (key === 'focus' ? (e.tags?.focus || []).includes(value) : e.tags?.[key] === value));
  const valueOf = (key, label) => (key === 'level' ? PILATES_LEVELS.indexOf(label) + 1 : label);
  const rows = FILTER_ROWS
    .map(([key, label, values]) => [key, label, values.filter((value) => has(key, valueOf(key, value)))])
    .filter(([, , values]) => values.length);
  const apparatus = [...new Set(items.map((e) => e.group).filter(Boolean))];
  if (apparatus.length > 1) rows.push(['apparatus', '器材', apparatus]);
  const active = Object.values(filters).some(Boolean);
  const matches = filterPilates(items, filters);
  return h('section', { class: 'finder' },
    rows.map(([key, label, values]) => h('div', { class: 'finder-row', role: 'group', 'aria-label': label },
      h('span', { class: 'finder-label' }, label),
      h('div', { class: 'chips' }, values.map((value) => {
        const wanted = valueOf(key, value);
        return button(value, () => { filters[key] = filters[key] === wanted ? '' : wanted; onChange(); }, 'chip-btn', { 'aria-pressed': filters[key] === wanted ? 'true' : 'false' });
      })))),
    active && h('div', { class: 'row-between finder-count' },
      h('strong', {}, `符合 ${matches.length} 個`),
      button('清除條件', () => { Object.assign(filters, emptyFilters()); onChange(); }, 'ghost')),
    active && (matches.length ? renderList(matches) : h('p', { class: 'muted' }, '沒有符合的動作，少選一個條件試試。')));
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
      list.replaceChildren(...byKind(exercise.kind).filter((item) => item.id !== exercise.id).map((item) => button(exerciseLabel(item), () => {
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
  const filters = emptyFilters();
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
      return button(exerciseLabel(exercise, exercise.pinned ? '★ ' : '☆ '), () => togglePin(exercise), 'pick', { 'aria-pressed': exercise.pinned ? 'true' : 'false' });
    }
    return button(exerciseLabel(exercise), () => onPick(exercise), 'pick');
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
        const latest = store.get('exercises', current.id) || current;
        // A classified Pilates exercise is offered easier, same-level and harder ones instead of its whole apparatus.
        const steps = kind === 'pilates' ? pilatesSteps(latest, items) : null;
        const stepped = steps && steps.easier.length + steps.same.length + steps.harder.length > 0;
        const { sameGroup, list } = swapOptions(latest, items, usage);
        offered = sameGroup && stepped ? [] : list;
        if (offered.length) {
          parts.push(block(sameGroup ? `同${kind === 'pilates' ? '器材' : '部位'}的動作` : '替代動作', offered,
            store.get('exercises', current.id) && button('編輯', () => alternativesSheet(store.get('exercises', current.id), draw), 'ghost')));
        }
        if (stepped) {
          parts.push(h('section', { class: 'pick-block' },
            h('div', { class: 'row-between pick-head' }, h('h3', {}, '退階、同級、進階'), h('span', { class: 'muted small' }, pilatesTagText(latest.tags))),
            h('div', { class: 'step-cols' }, [['easier', '退階'], ['same', '同級'], ['harder', '進階']].map(([key, title]) => h('div', { class: 'step-col' },
              h('span', { class: 'step-title' }, title),
              steps[key].length ? steps[key].map(pick) : h('span', { class: 'muted small' }, '沒有'))))));
          offered = [...offered, ...steps.easier, ...steps.same, ...steps.harder];
        }
      }
      const common = commonExercises(items, usage, current?.id).filter((item) => !offered.includes(item));
      parts.push(block('常用動作', common.length || managing ? (managing ? items : common) : [],
        items.length > 0 && button(managing ? '完成' : '設定常用', () => { managing = !managing; draw(); }, 'ghost')));
      if (!common.length && !managing) parts.push(h('p', { class: 'muted' }, '用過的動作會自動排到這裡，也可以按「設定常用」自己挑。'));
      const tagged = kind === 'pilates' && items.some((item) => item.tags);
      if (!managing && tagged) {
        parts.push(h('section', { class: 'pick-block' }, h('h3', {}, '依分類找'),
          pilatesFinder(items, filters, draw, (list) => h('div', { class: 'pick-grid' }, list.map(pick)))));
        parts.push(button('＋ 新增動作', add, 'add-row'));
      }
      if (!managing && !tagged) {
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

/** Chips for the Pilates classification. The teacher's changes are kept even when the handout is imported again. */
function tagEditor(exercise) {
  const tags = { region: '', posture: '', focus: [], level: 0, muscles: [], family: '', ...(exercise.tags || {}) };
  const area = h('div', { class: 'stack-sm' });
  const muscles = h('input', { class: 'input', value: tags.muscles.join('、'), maxlength: 60, placeholder: '例如：臀肌、腹肌', 'aria-label': '主要肌群' });
  const single = (key, label, values, toValue = (v) => v) => h('div', { class: 'finder-row', role: 'group', 'aria-label': label },
    h('span', { class: 'finder-label' }, label),
    h('div', { class: 'chips' }, values.map((value) => button(value, () => {
      tags[key] = tags[key] === toValue(value) ? (key === 'level' ? 0 : '') : toValue(value);
      draw();
    }, 'chip-btn', { 'aria-pressed': tags[key] === toValue(value) ? 'true' : 'false' }))));
  function draw() {
    area.replaceChildren(
      single('region', '部位', PILATES_REGIONS),
      single('posture', '姿勢', PILATES_POSTURES),
      h('div', { class: 'finder-row', role: 'group', 'aria-label': '重點' },
        h('span', { class: 'finder-label' }, '重點'),
        h('div', { class: 'chips' }, PILATES_FOCUS.map((value) => button(value, () => {
          tags.focus = tags.focus.includes(value) ? tags.focus.filter((f) => f !== value) : [...tags.focus, value];
          draw();
        }, 'chip-btn', { 'aria-pressed': tags.focus.includes(value) ? 'true' : 'false' })))),
      single('level', '程度', PILATES_LEVELS, (v) => PILATES_LEVELS.indexOf(v) + 1),
      h('label', { class: 'field' }, h('span', { class: 'stepper-label' }, '主要肌群（用、分開）'), muscles));
  }
  draw();
  return {
    el: area,
    value: () => cleanPilatesTags({ ...tags, muscles: muscles.value.split(/[、,，]/) }),
  };
}

function editSheet(exercise) {
  openSheet('編輯動作', (close) => {
    const name = h('input', { class: 'input', value: exercise.name, 'aria-label': '動作名稱' });
    const group = h('input', { class: 'input', value: exercise.group || '', 'aria-label': '分類或器材' });
    const tags = exercise.kind === 'pilates' ? tagEditor(exercise) : null;
    return h('div', { class: 'stack' },
      h('div', { class: 'stepper-label' }, '動作名稱'), name,
      h('div', { class: 'stepper-label' }, exercise.kind === 'pilates' ? '器材' : '分類'), group,
      tags && h('div', { class: 'stepper-label' }, '分類（找動作和建議退階、進階用）'),
      tags?.el,
      button(exercise.pinned ? '★ 已設為常用，點一下取消' : '☆ 設為常用', () => {
        store.save('exercises', { ...exercise, pinned: !exercise.pinned });
        close();
        refreshView();
      }, ''),
      button(`設定替代動作（${(exercise.alternatives || []).length}）`, () => { close(); alternativesSheet(store.get('exercises', exercise.id) || exercise); }, ''),
      h('div', { class: 'row-between' },
        holdButton('從動作庫移除', () => {
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
          const next = { ...exercise, name: name.value.trim(), group: group.value.trim() };
          if (tags) {
            const value = tags.value();
            if (JSON.stringify(value) !== JSON.stringify(exercise.tags || null)) Object.assign(next, { tags: value, tagsEdited: true });
          }
          store.save('exercises', next);
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

// Kept while the app is open, so going into an exercise and back keeps the same filters.
const libraryFilters = emptyFilters();

export function libraryView() {
  const open = (exercise) => (exercise.handoutId ? handoutSheet(exercise, { onEdit: editSheet }) : editSheet(exercise));
  const itemButton = (exercise) => button(exerciseLabel(exercise, exercise.pinned ? '★ ' : ''), () => open(exercise), 'pick');
  const pilatesSection = () => {
    const items = byKind('pilates');
    if (!items.some((item) => item.tags)) return section('pilates', '皮拉提斯');
    const area = h('div', { class: 'stack' });
    const draw = () => {
      const active = Object.values(libraryFilters).some(Boolean);
      const regions = [...PILATES_REGIONS, '未分類'];
      area.replaceChildren(...[
        h('div', { class: 'card' }, pilatesFinder(items, libraryFilters, draw, (list) => h('div', { class: 'pick-grid' }, list.map(itemButton)))),
        !active && h('div', { class: 'bento' }, regions.map((region) => {
          const list = items.filter((item) => (item.tags?.region || '未分類') === region);
          return list.length > 0 && h('div', { class: `card stack-sm ${list.length > 10 ? 'span-6' : 'span-3'}` },
            h('h3', {}, `${region}（${list.length}）`),
            h('div', { class: 'pick-grid' }, list.map(itemButton)));
        })),
      ].filter(Boolean));
    };
    draw();
    return h('section', { class: 'stack span-6' }, h('h2', {}, `皮拉提斯（${items.length}）`), area);
  };
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
      items.length === 0 && h('p', { class: 'muted' }, kind === 'pilates' ? '還沒有動作，可以按「匯入講義」。' : '還沒有動作，可以按「批次匯入」。'),
      h('div', { class: 'bento' }, [...groups.entries()].map(([group, list]) => h('div', { class: `card stack-sm ${list.length > 10 ? 'span-6' : 'span-3'}` },
        h('h3', {}, group),
        h('div', { class: 'pick-grid' }, list.map(itemButton))))));
  };
  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title library-bar' },
      h('h1', {}, '動作庫'),
      h('div', { class: 'topbar-actions' },
        button('匯入講義', importHandoutSheet, 'ghost'),
        button('批次匯入', importSheet, 'ghost'),
        button('＋ 新增動作', () => addExerciseSheet('strength', '', null, () => refreshView()), 'primary'))),
    h('main', { class: 'page stack-lg' }, pilatesSection(), section('strength', '重訓')),
    tabBar('library'));
}
