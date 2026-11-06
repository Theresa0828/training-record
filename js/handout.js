// Handout details and handwritten-note pages. They are imported on each device and never synced,
// because the handout may not be reproduced and the images are too large for the sync bridge.
import { h, button, openSheet, refreshView, toast } from './dom.js';
import * as store from './store.js';
import { isHandoutFile, planHandoutImport } from './core.js';

const MAIN_FIELDS = [
  ['setup', '器材設定'], ['start', '開始姿勢'], ['steps', '動作步驟'], ['finish', '結束'],
  ['focus', '重點'], ['modifications', '調整方式'], ['notes', '注意事項'],
];
const MORE_FIELDS = [
  ['essence', '目標肌群'], ['stability', '穩定'], ['endurance', '肌耐力'], ['mobility', '活動度'],
  ['coordination', '協調'], ['sequencing', '順序'], ['balance', '平衡'],
];

function textBlocks(fields, list) {
  return list.filter(([key]) => fields[key]).map(([key, label]) => h('section', { class: 'handout-block' },
    h('h3', {}, label),
    h('p', { class: 'handout-text', lang: 'en' }, fields[key])));
}

/** A page of the handout. There is no pinch zoom in this app, so a tap enlarges it instead. */
function notePage(path, label) {
  const frame = h('div', { class: 'note-frame' }, h('p', { class: 'muted note-loading' }, '載入中'));
  store.readHandoutImage(path).then((record) => {
    if (!record) {
      frame.replaceChildren(h('p', { class: 'muted note-loading' }, '找不到這張圖片，請重新匯入講義'));
      return;
    }
    const tap = h('button', {
      type: 'button',
      class: 'note-page',
      'aria-label': `${label}，點一下放大或縮小`,
      'aria-pressed': 'false',
      onclick: () => {
        const zoomed = frame.classList.toggle('is-zoomed');
        tap.setAttribute('aria-pressed', zoomed ? 'true' : 'false');
      },
    }, h('img', { src: `data:image/jpeg;base64,${record.data}`, alt: label }));
    frame.replaceChildren(tap);
  }).catch(() => {
    frame.replaceChildren(h('p', { class: 'muted note-loading' }, '圖片讀取失敗，請關閉後再試一次'));
  });
  return frame;
}

function pageList(paths, label) {
  return h('div', { class: 'stack' },
    h('p', { class: 'muted' }, '點一下圖片可以放大，放大後可以上下左右滑動。'),
    paths.map((path, index) => notePage(path, paths.length > 1 ? `${label} 第 ${index + 1} 張` : label)));
}

function handoutBody(entry, exercise, onEdit, close) {
  const tabs = [['content', '講義內容']];
  if (entry.noteImages?.length) tabs.push(['notes', '手寫筆記']);
  if (entry.chartImage) tabs.push(['chart', '總表']);
  const tabBar = h('div', { class: 'segmented handout-tabs' });
  const panel = h('div', { class: 'stack' });
  const edit = onEdit && button('編輯動作', () => { close(); onEdit(exercise); }, 'ghost');

  function content() {
    const reference = [entry.springs, entry.reps].filter(Boolean).join('・');
    const more = textBlocks(entry.fields, MORE_FIELDS);
    return h('div', { class: 'stack' },
      reference && h('p', { class: 'handout-reference' }, `講義總表參考：${reference}`),
      textBlocks(entry.fields, MAIN_FIELDS),
      more.length > 0 && h('details', { class: 'fold' },
        h('summary', {}, '肌群與其他'),
        h('div', { class: 'fold-body stack' }, more)),
      h('p', { class: 'muted' }, `講義第 ${entry.pages} 頁`));
  }

  function show(name) {
    tabBar.replaceChildren(...tabs.map(([key, label]) => button(label, () => show(key), 'chip-btn', { 'aria-pressed': key === name ? 'true' : 'false' })));
    if (name === 'notes') panel.replaceChildren(pageList(entry.noteImages, `${exercise.name} 的手寫筆記`));
    else if (name === 'chart') panel.replaceChildren(pageList([entry.chartImage], '講義總表'));
    else panel.replaceChildren(content());
  }

  show('content');
  return h('div', { class: 'stack' }, tabs.length > 1 && tabBar, panel, edit);
}

/** Opens at once and fills in from the device, so a tap always answers immediately. */
export function handoutSheet(exercise, { onEdit } = {}) {
  openSheet(exercise.name, (close) => {
    const area = h('div', { class: 'stack' }, h('p', { class: 'muted' }, '載入中'));
    store.readHandout(exercise.handoutId).then((entry) => {
      if (entry) {
        area.replaceChildren(handoutBody(entry, exercise, onEdit, close));
        return;
      }
      area.replaceChildren(
        h('p', {}, '這台裝置還沒有這個動作的講義內容。'),
        button('匯入講義', () => { close(); importHandoutSheet(); }, 'big primary'),
        onEdit && button('編輯動作', () => { close(); onEdit(exercise); }, 'ghost'));
    }).catch(() => {
      area.replaceChildren(h('p', {}, '講義內容讀取失敗，請關閉後再試一次。'));
    });
    return area;
  }, { wide: true });
}

/** The way in from a class or a plan. Returns nothing for exercises without a handout. */
export function handoutButton(exerciseId) {
  const exercise = store.get('exercises', exerciseId);
  if (!exercise?.handoutId) return null;
  return button('講義', () => handoutSheet(exercise), 'ghost', { 'aria-label': `看 ${exercise.name} 的講義` });
}

function importMessage(error) {
  if (error?.name === 'QuotaExceededError') return '這台裝置的空間不夠。清出一些空間後再試一次，原本的資料沒有變動。';
  return '匯入沒有完成，原本的資料沒有變動。請再試一次。';
}

export function importHandoutSheet() {
  openSheet('匯入講義', (close) => {
    const status = h('p', { class: 'muted', role: 'status' }, '選擇電腦上產生的「講義匯入檔」。這個檔案也是備份，請留著；資料不見時再匯入一次就能復原。');
    const input = h('input', { type: 'file', accept: '.json,application/json', class: 'file-input', 'aria-label': '選擇講義匯入檔' });
    const choose = button('選擇匯入檔', () => input.click(), 'big primary');

    input.addEventListener('change', async () => {
      const file = input.files?.[0];
      input.value = '';
      if (!file) return;
      choose.disabled = true;
      status.textContent = '匯入中，請不要關閉這個畫面';
      try {
        let data;
        try {
          data = JSON.parse(await file.text());
        } catch {
          data = null;
        }
        if (!isHandoutFile(data)) {
          status.textContent = '這不是講義匯入檔，請確認選到的檔案。';
          choose.disabled = false;
          return;
        }
        await store.saveHandout(data);
        const plan = planHandoutImport(data, store.all('exercises'), (id) => store.get('exercises', id));
        for (const exercise of [...plan.add, ...plan.link, ...plan.update]) store.save('exercises', exercise);
        await store.flush();
        refreshView();
        close();
        toast(`講義已匯入：新增 ${plan.add.length} 個動作${plan.update.length ? `，更新 ${plan.update.length} 個分類` : ''}，${data.exercises.length} 個動作可看講義`);
      } catch (error) {
        status.textContent = importMessage(error);
        choose.disabled = false;
      }
    });

    return h('div', { class: 'stack' }, status, input, choose);
  });
}
