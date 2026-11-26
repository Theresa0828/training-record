import { go, registerView, installTapGuard, installKeyboardLift, installPenHint, refreshView, currentView, toast } from './dom.js';
import * as store from './store.js';
import { startAutoSync, onStatus, onCalendarChange, onLoginLost, setResendFilter, onWaitingChange } from './sync.js';
import { startFullRecords, onRecordStatus, recordStatusText } from './fullrecord.js';
import { dateKey, legacySpine } from './core.js';
import { todayView } from './today.js';
import { recordView, settleOldDrafts } from './record.js';
import { overviewView } from './overview.js';
import { planView } from './plan.js';
import { libraryView } from './library.js';
import { settingsView, paletteId } from './settings.js';
import { studentsView } from './students.js';
import { reportView } from './report.js';
import { loginView, loginNeeded, canSee, notYoursView, deletedView, noteSeen, mayChange, mine, onSignedIn } from './team.js';

// A button that fails must say so. Silence looks like the tap never landed.
function reportFailure(reason) {
  toast(`這個操作沒有完成：${reason?.message || reason || '未知原因'}`);
}

async function boot() {
  window.addEventListener('error', (e) => reportFailure(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => reportFailure(e.reason));
  installTapGuard();
  installKeyboardLift();
  installPenHint();
  await store.loadStore();
  // 2026-11-07 the teacher chose 砂色＋森林綠: every device switches to it once; a later choice in 設定 is kept.
  if (!store.getMeta('paletteMintOnce')) {
    store.setMeta('palette', 'mint');
    store.setMeta('paletteMintOnce', true);
  }
  document.documentElement.dataset.palette = paletteId(store.getMeta('palette'));
  // 2026-11-09 穩定's 脊椎 joined 軀幹: exercises saved before then are rewritten once, hand edits included.
  for (const exercise of store.all('exercises')) {
    if (exercise.kind !== 'pilates' || !exercise.tags?.stability?.includes?.('脊椎')) continue;
    store.save('exercises', { ...exercise, tags: { ...exercise.tags, stability: legacySpine(exercise.tags) } });
  }
  settleOldDrafts();
  // A teacher's classes left open on earlier days close once they sign in (2026-11-26): on an iPad colleagues share,
  // nobody is signed in when the app starts.
  onSignedIn(() => settleOldDrafts());
  // A student deleted 30 days ago is cleared now (2026-11-25), on whichever iPad gets there first.
  store.purgeExpired(Date.now(), mayChange);

  // Once colleagues share the app (2026-11-25), every screen asks for a login code until someone signs in on this device.
  const guarded = (render) => (params) => (loginNeeded() ? loginView() : render(params));
  // A teacher sees only their own students (2026-11-24). A class already open keeps going, like the login check.
  // A student merged into another opens as that one; a deleted one says so (2026-11-25). Each student screen
  // opened is noted for the admin's access log.
  const ownStudent = (render) => guarded((params) => {
    let student = params?.studentId && store.get('students', params.studentId);
    const into = student?.deleted && student.mergedInto && store.get('students', student.mergedInto);
    if (into && !into.deleted) {
      student = into;
      params = { ...params, studentId: into.id };
    }
    if (student?.deleted) return deletedView(student);
    if (student && !canSee(student)) return notYoursView();
    noteSeen(student?.id);
    return render(params);
  });
  registerView('login', guarded(() => todayView()));
  registerView('today', guarded(todayView));
  registerView('record', guarded((params) => {
    noteSeen(params?.studentId);
    return recordView(params);
  }));
  registerView('overview', ownStudent(overviewView));
  registerView('plan', ownStudent(planView));
  registerView('library', guarded(libraryView));
  registerView('students', guarded(studentsView));
  registerView('settings', guarded(settingsView));
  registerView('report', ownStudent(reportView));
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
  // A colleague disabled on another device has to sign in again here, though never in the middle of a class.
  const askLoginIfNeeded = () => {
    if (!loginNeeded() || currentView()?.name === 'record' || document.querySelector('.login')) return;
    // A panel left open (say, the colleague list) would sit on top of the login screen.
    for (const overlay of document.querySelectorAll('#sheet-root .sheet-overlay')) overlay.remove();
    refreshView();
  };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') askLoginIfNeeded(); });
  // The cloud refused this device's code (disabled, a new code, or colleagues just started): ask at once, class aside.
  onLoginLost(() => askLoginIfNeeded());

  let lastState = null;
  onStatus((status) => {
    const finished = lastState === 'syncing' && (status.state === 'ok' || status.state === 'partial');
    lastState = status.state;
    for (const el of document.querySelectorAll('[data-sync-status]')) {
      el.textContent = status.message;
      el.classList.toggle('warn', status.state === 'error');
    }
    // New bookings may have arrived. Never redraw under an open class record.
    if (finished && currentView()?.name === 'today') refreshView();
    if (finished) askLoginIfNeeded();
    if (finished) store.purgeExpired(Date.now(), mayChange);
    // Taken off this student, or the student deleted or brought back, on another iPad (2026-11-24, 2026-11-25): the
    // overview or report follows at once. A plan being written, a class or an open panel waits for the next screen,
    // so nothing typed is lost.
    const view = currentView();
    const shown = finished && ['overview', 'report'].includes(view?.name) && store.get('students', view.params?.studentId);
    const goneNow = shown && (shown.deleted || !canSee(shown));
    const goneShown = !!document.querySelector('[data-student-gone]');
    if (shown && !shown.mergedInto && goneNow !== goneShown && !document.querySelector('#sheet-root .sheet-overlay')) refreshView();
  });
  // A booking moved in the calendar redraws the screens that show it, but never a class record or an open sheet.
  onCalendarChange(() => {
    if (!['today', 'overview', 'report'].includes(currentView()?.name)) return;
    if (document.querySelector('#sheet-root .sheet-overlay')) return;
    refreshView();
  });
  // Full-record PDFs (2026-11-25) follow each sync round; the settings line follows their progress.
  onRecordStatus((s) => {
    for (const el of document.querySelectorAll('[data-record-status]')) {
      el.textContent = recordStatusText(s);
      el.classList.toggle('warn', !!s.problem);
    }
  });
  // When the cloud asks every iPad to send its copies again (2026-11-26), each person sends what is theirs to change:
  // their own classes and plans, and the shared records they may edit.
  setResendFilter((collection, record) => (collection === 'sessions' || collection === 'plans' ? mine(record) : mayChange(collection, record)));
  // Records that waited over a day for the cloud put a reminder on Today, and it goes once they are up.
  let lateShown = null;
  onWaitingChange((w) => {
    const key = w.late ? `${w.mine}|${w.photos}` : '';
    if (key === lateShown) return;
    const first = lateShown === null;
    lateShown = key;
    if (first && !key) return;
    if (currentView()?.name === 'today' && !document.querySelector('#sheet-root .sheet-overlay')) refreshView();
  });
  startFullRecords();
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
