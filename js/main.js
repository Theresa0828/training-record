import { go, registerView, installTapGuard, installKeyboardLift, refreshView, currentView, toast } from './dom.js';
import * as store from './store.js';
import { startAutoSync, onStatus } from './sync.js';
import { dateKey } from './core.js';
import { todayView } from './today.js';
import { recordView, settleOldDrafts } from './record.js';
import { overviewView } from './overview.js';
import { planView } from './plan.js';
import { libraryView } from './library.js';
import { settingsView, paletteId } from './settings.js';
import { studentsView } from './students.js';
import { reportView } from './report.js';

// A button that fails must say so. Silence looks like the tap never landed.
function reportFailure(reason) {
  toast(`這個操作沒有完成：${reason?.message || reason || '未知原因'}`);
}

async function boot() {
  window.addEventListener('error', (e) => reportFailure(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportFailure(e.reason));
  installTapGuard();
  installKeyboardLift();
  await store.loadStore();
  // 2026-11-07 the teacher chose 砂色＋森林綠: every device switches to it once; a later choice in 設定 is kept.
  if (!store.getMeta('paletteMintOnce')) {
    store.setMeta('palette', 'mint');
    store.setMeta('paletteMintOnce', true);
  }
  document.documentElement.dataset.palette = paletteId(store.getMeta('palette'));
  settleOldDrafts();

  registerView('today', todayView);
  registerView('record', recordView);
  registerView('overview', overviewView);
  registerView('plan', planView);
  registerView('library', libraryView);
  registerView('students', studentsView);
  registerView('settings', settingsView);
  registerView('report', reportView);
  go('today');

  store.onSaveError(() => toast('這台裝置暫時存不了資料，App 會自動再試。請先不要關閉 App，也確認 iPad 還有儲存空間。'));

  // The iPad can keep the app open for days, so a new day must show up by itself.
  let openedOn = dateKey();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible' || dateKey() === openedOn) return;
    openedOn = dateKey();
    if (currentView()?.name !== 'record') settleOldDrafts();
    if (currentView()?.name === 'today') refreshView();
  });

  let lastState = null;
  onStatus((status) => {
    const finished = lastState === 'syncing' && status.state === 'ok';
    lastState = status.state;
    for (const el of document.querySelectorAll('[data-sync-status]')) {
      el.textContent = status.message;
      el.classList.toggle('warn', status.state === 'error');
    }
    // New bookings may have arrived. Never redraw under an open class record.
    if (finished && currentView()?.name === 'today') refreshView();
  });
  startAutoSync();

  if ('serviceWorker' in navigator && window.isSecureContext) {
    // A new release downloads in the background, but this page keeps running the old code until it reloads.
    // Old code would quietly drop newer data (such as new classification fields on a handout import),
    // so reload as soon as the new release takes over, except during a class.
    const hadController = Boolean(navigator.serviceWorker.controller);
    let reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!hadController || reloading) return;
      if (currentView()?.name === 'record') {
        toast('新版本已下載，下課後關掉分頁再開一次就會更新');
        return;
      }
      reloading = true;
      location.reload();
    });
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
}

boot().catch((error) => {
  document.getElementById('app').textContent = `無法開啟資料庫：${error.message}。請關閉 App 後再開一次。`;
});
