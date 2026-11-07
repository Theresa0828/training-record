import { APP_VERSION } from './core.js';
import { h, button, tabBar, confirmSheet, openSheet, refreshView, toast } from './dom.js';
import * as store from './store.js';
import { call, currentStatus, isConnected, parsePairingCode, syncNow } from './sync.js';
import { signaturePad } from './record.js';
import { loadDemo, clearDemo } from './demo.js';

export const DEFAULT_PALETTE = 'slate';
export const PALETTES = [
  ['bordeaux', '砂色＋酒紅', ['#E2DBBE', '#D5D6AA', '#987D7C', '#420C14']],
  ['slate', '砂色＋灰藍', ['#E2DBBE', '#D5D6AA', '#9D858D', '#6C809A']],
];

/** A palette saved by an older version may no longer exist; fall back to the default. */
export function paletteId(saved) {
  return PALETTES.some(([id]) => id === saved) ? saved : DEFAULT_PALETTE;
}

function connectSection() {
  const connected = isConnected();
  const conn = store.getMeta('connection');
  const code = h('textarea', { class: 'input', placeholder: '貼上配對碼', 'aria-label': '配對碼' });
  const message = h('p', { class: 'muted', role: 'status' });
  const calendars = h('div', { class: 'stack' });

  async function loadCalendars() {
    message.textContent = '讀取日曆中';
    try {
      const data = await call('calendars');
      const selected = store.getMeta('calendarId');
      message.textContent = '請選擇存放預約的公司日曆';
      calendars.replaceChildren(...data.calendars.map((calendar) => button(calendar.name, () => {
        store.setMeta('calendarId', calendar.id);
        toast(`已選擇 ${calendar.name}`);
        syncNow();
        loadCalendars();
      }, 'list-item', { 'aria-pressed': calendar.id === selected ? 'true' : 'false' })));
    } catch (error) {
      message.textContent = `讀取失敗：${error.message}`;
    }
  }

  // Right after pairing the calendar is the only thing left to do, so offer it without another tap.
  if (connected && !store.getMeta('calendarId')) loadCalendars();

  return h('section', { class: 'stack settings-card' },
    h('h2', {}, 'Google 連線'),
    connected ? [
      h('p', {}, `已連線，老師姓名：${conn.teacher || '未設定'}`),
      h('div', { class: `status${currentStatus().state === 'error' ? ' warn' : ''}`, 'data-sync-status': true }, currentStatus().message),
      h('div', { class: 'row-wrap' },
        button('立即同步', () => syncNow(), 'primary'),
        button('選擇日曆', loadCalendars, ''),
        button('中斷連線', () => confirmSheet('中斷連線', '這台裝置將不再同步。紀錄仍會留在這台裝置和 Google 雲端。', '中斷連線', () => {
          store.setMeta('connection', null);
          refreshView();
        }), 'ghost')),
    ] : [
      h('p', { class: 'muted' }, '依照「設定步驟」在 Google Apps Script 取得配對碼，貼到下面。'),
      code,
      button('連線', async () => {
        try {
          store.setMeta('connection', parsePairingCode(code.value));
          message.textContent = '測試連線中';
          const result = await call('ping');
          clearDemo();
          toast(`已連上 ${result.email || 'Google'}，示範資料已清除`);
          refreshView();
        } catch (error) {
          store.setMeta('connection', null);
          message.textContent = `無法連線：${error.message}。請確認配對碼完整，再試一次。`;
        }
      }, 'primary'),
    ],
    message,
    calendars);
}

function signatureSection() {
  const saved = store.getMeta('coachSignature');
  return h('section', { class: 'stack settings-card' },
    h('h2', {}, '教練簽名'),
    h('p', { class: 'muted' }, saved ? '已儲存，每堂會自動帶入。' : '簽一次後，每堂會自動帶入。'),
    button(saved ? '重新簽名' : '現在簽名', () => openSheet('教練簽名', (close) => {
      const pad = signaturePad(saved);
      return h('div', { class: 'stack' }, pad.el, h('div', { class: 'row-between' },
        button('重簽', () => pad.clear(), ''),
        button('儲存', () => {
          store.setMeta('coachSignature', pad.isEmpty() ? null : pad.toDataUrl());
          close();
          refreshView();
        }, 'primary')));
    }), ''));
}

function paletteSection() {
  const current = paletteId(store.getMeta('palette'));
  return h('section', { class: 'stack settings-card' },
    h('h2', {}, '配色'),
    h('div', { class: 'palette-grid' }, PALETTES.map(([id, name, colors]) => h('button', {
      type: 'button',
      class: 'btn palette',
      'aria-pressed': id === current ? 'true' : 'false',
      onclick: () => {
        store.setMeta('palette', id);
        document.documentElement.dataset.palette = id;
        refreshView();
      },
    }, h('span', {}, name), h('span', { class: 'swatches' }, colors.map((color) => {
      const swatch = h('span', { class: 'swatch' });
      swatch.style.background = color;
      return swatch;
    }))))));
}

function dataSection() {
  const demo = store.getMeta('demoLoaded');
  return h('section', { class: 'stack settings-card' },
    h('h2', {}, '資料'),
    h('p', { class: 'muted' }, `目前版本 ${APP_VERSION}`),
    h('div', { class: 'row-wrap' },
      demo
        ? button('清除示範資料', () => { clearDemo(); refreshView(); toast('示範資料已清除'); }, '')
        : button('載入示範資料', () => { loadDemo(); toast('已載入示範資料'); refreshView(); }, ''),
      button('顯示備份資料', () => openSheet('備份資料', () => {
        const area = h('textarea', { class: 'input note-area', readonly: true, 'aria-label': '備份資料' });
        area.value = JSON.stringify(store.exportAll());
        return h('div', { class: 'stack' }, h('p', { class: 'muted' }, '全選後複製到安全的地方。內容含學生資料，請勿傳給他人。'), area);
      }), ''),
      button('清除這台裝置的資料', () => confirmSheet(
        '清除這台裝置的資料',
        '只清除這台裝置上的紀錄與配對碼，Google 雲端的資料不受影響。還沒同步的紀錄會遺失，無法復原。',
        '確定清除',
        async () => {
          await store.wipeAll();
          location.reload();
        },
      ), 'ghost')));
}

export function settingsView() {
  return h('div', { class: 'screen has-tabs' },
    h('header', { class: 'topbar page-title' }, h('h1', {}, '設定')),
    h('main', { class: 'page stack' }, connectSection(), signatureSection(), paletteSection(), dataSection()),
    tabBar('settings'));
}
