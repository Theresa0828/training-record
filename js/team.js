// Colleagues and login codes (2026-11-25, multi-user batch 1).
// Until the first colleague exists nothing here shows up and the app works as before, without a login.
// Part 1 checked codes on this device; part 2 has the Apps Script check the code with every request, so a disabled
// colleague's iPad can no longer sync, and an admin mails each colleague one letter that both pairs and signs in.
import { h, button, home, back, tab, openSheet, confirmSheet, refreshView, toast, currentView } from './dom.js';
import * as store from './store.js';
import { icon } from './icons.js';
import {
  STAFF_ROLES, makeLoginCode, hashLoginCode, staffList, multiUserOn, signedInStaff, needsLogin, checkLoginCode, canDisableStaff,
  canEditStaff, normalizeLoginCode, decodePairing, invitationCode, newId, assignmentId, teachersOf, visibleStudents, classTeacherId,
  canDeleteStudent, isRestorable, SEEN_GAP_MS, ownsClass, planIdFor, deviceSummary, leftText,
} from './core.js';
import { currentLogin, saveLogin, updateLogin, forgetLogin, loginRequiredReason } from './identity.js';
import { call, connection, isConnected, syncNow, syncSoon, countWaiting, onWaitingChange } from './sync.js';
import { logSheet } from './accesslog.js';

export function team() {
  return staffList(store.all('options'));
}

/** The colleague using this device, or null when nobody has signed in (or the app is still single-user). */
export function me() {
  return signedInStaff(team(), currentLogin());
}

/**
 * The students the person using this iPad sees (2026-11-24). `everyone` is the admin's 全部; a teacher only ever
 * sees their own. Every record is still on every iPad: this decides what the app shows, like the rest of the roles.
 */
export function visible(students = store.all('students'), everyone = false) {
  return visibleStudents(students, store.all('options'), team(), me(), everyone);
}

export function canSee(student) {
  return !!student && visible([student], true).length > 0;
}

/** The colleagues teaching a student, in the order they were added. A disabled colleague stays listed. */
export function teachersFor(studentId) {
  const everyone = team();
  return teachersOf(store.all('options'), studentId).map((id) => everyone.find((p) => p.id === id)).filter(Boolean);
}

/**
 * The teacher's name and signature for a class's record. A signature lives on its teacher's own iPad, so a class
 * someone else taught gets their name only.
 */
export function classTeacher(session) {
  const everyone = team();
  const id = classTeacherId(session, everyone);
  const who = me();
  const own = !who || id === who.id;
  const name = everyone.find((p) => p.id === id)?.name || (own ? store.getMeta('connection')?.teacher || '' : '');
  return { name, signature: own ? store.getMeta('coachSignature') : null };
}

/**
 * Whether the person using this iPad may change a class (2026-11-26): everyone sees a student's classes, each teacher
 * changes only the ones they taught. Before colleagues, every class is the teacher's own.
 */
export function mine(session) {
  const who = me();
  const everyone = team();
  // Nobody signed in yet on a shared app: nothing here is theirs to change.
  if (!who && multiUserOn(everyone)) return false;
  return !!session && ownsClass(session, everyone, who);
}

/** The id of the plan the person using this iPad writes for a student: each teacher plans their own next class. */
export function myPlanId(studentId) {
  return planIdFor(studentId, me()?.id || '', team());
}

/** The plan the person using this iPad writes for a student, or undefined. */
export function myPlan(studentId) {
  return store.get('plans', myPlanId(studentId));
}

/**
 * Whether the cloud takes this iPad's change of a record: an admin changes anything but others' classes when a student
 * is deleted with all of theirs; a teacher their own classes and plans, and only themselves as a student's teacher.
 */
export function mayChange(collection, record) {
  const who = me();
  if (!who) return !multiUserOn(team());
  if (who.role === 'admin') return true;
  if (collection === 'sessions' || collection === 'plans') return mine(record);
  if (collection === 'options' && record.type === 'assign') return record.staffId === who.id;
  return true;
}

/** Adds or removes one teacher of a student. Returns false when it was already so. */
export function setTeacher(studentId, staffId, on) {
  const id = assignmentId(studentId, staffId);
  const existing = store.get('options', id);
  if (on ? existing && !existing.deleted : !existing || existing.deleted) return false;
  store.save('options', { id, type: 'assign', studentId, staffId, deleted: !on });
  return true;
}

/**
 * The person signed in becomes a teacher of this student: a student they add, or one booked on their own calendar
 * (2026-11-24: 學生出現在某位老師的預約日曆上就自動成為他的學生). Nothing happens before anyone signs in.
 */
export function joinStudent(student) {
  const who = me();
  if (!who || !student || student.demo) return false;
  return setTeacher(student.id, who.id, true);
}

// When each colleague last opened each student here, so one visit is noted once.
const seenAt = new Map();

/**
 * Notes that the signed-in colleague opened a student's screen (2026-11-25), for the admin's access log. Nothing is
 * noted before colleagues share the app. The cloud merges visits within 30 minutes; this skips them before that.
 */
export function noteSeen(studentId) {
  const who = me();
  const student = studentId && store.get('students', studentId);
  if (!who || !student || student.demo || student.deleted) return;
  const key = `${who.id}|${studentId}`;
  const now = Date.now();
  if (now - (seenAt.get(key) || 0) < SEEN_GAP_MS) return;
  seenAt.set(key, now);
  store.setMeta('seenQueue', [...(store.getMeta('seenQueue', []) || []), { student: studentId, by: who.id, at: now }].slice(-300));
  syncSoon();
}

/** Whoever may delete a student may also bring one back. */
export function canRestore() {
  return canDeleteStudent(team(), me());
}

export function loginNeeded() {
  return needsLogin(team(), currentLogin(), isConnected() && loginRequiredReason());
}

// Run after each sign-in: a shared iPad forgets who used it, so work that waits for its teacher starts here.
const signedIn = new Set();
export function onSignedIn(listener) {
  signedIn.add(listener);
}

function keepLogin(person, code, remember) {
  saveLogin({ id: person.id, code: normalizeLoginCode(code), name: person.name, role: person.role }, remember);
  for (const listener of signedIn) listener(person);
  syncNow();
}

/**
 * Signs in with a typed code, or with the whole letter pasted. The cloud decides when it can be reached; offline,
 * the colleague list on this device does, and the cloud checks again at the next sync.
 * reason: 'ok', 'format', 'unknown', 'disabled', 'offline' (nothing here to check against), or 'error' with a message.
 */
export async function signInWithCode(input, remember) {
  let text = String(input || '');
  const letter = text.length > 30 ? decodePairing(text) : null;
  if (letter?.staff?.code) {
    text = letter.staff.code;
    if (!isConnected()) {
      const { staff, ...conn } = letter;
      store.setMeta('connection', conn);
    }
  }
  if (!normalizeLoginCode(text)) return { reason: 'format' };
  if (isConnected()) {
    try {
      const data = await call('login', { code: text });
      keepLogin(data.staff, text, remember);
      return { reason: 'ok', staff: data.staff };
    } catch (error) {
      if (error.login) return { reason: error.login };
      if (!error.network) return { reason: 'error', message: error.message };
    }
  }
  const result = await checkLoginCode(team(), text);
  if (result.reason === 'ok') keepLogin(result.staff, text, remember);
  else if (result.reason === 'unknown' && !team().length) return { reason: 'offline' };
  return result;
}

/**
 * Hands a shared iPad to the next colleague (2026-11-26): their own records go up first if they can; anything that
 * cannot stays on this iPad, marked as theirs, and goes up the next time they sign in here.
 */
async function switchUser() {
  const text = (w) => {
    if (!w.mine) return '你的紀錄都上傳了。下一位要輸入自己的登入碼；你自己回來時，也要再輸入一次你的登入碼。';
    const sending = isConnected() && navigator.onLine ? '，正在上傳' : '';
    return `你還有 ${w.mine} 筆紀錄沒上傳到雲端${sending}。換人的話，沒上傳的會留在這台 iPad，等你下次在這台登入才上傳；有網路的話先等它變成「都上傳了」。下一位要輸入自己的登入碼。`;
  };
  const line = h('span', { 'data-switch-left': true }, text(await countWaiting()));
  const stop = onWaitingChange((w) => { if (line.isConnected) line.textContent = text(w); else stop(); });
  confirmSheet('換人使用', line, '換人使用', () => { stop(); signOut(); });
  syncNow();
}

export function signOut() {
  forgetLogin('switch');
  tab('login');
}

function randomCode() {
  const bytes = new Uint8Array(64);
  crypto.getRandomValues(bytes);
  let i = 0;
  return makeLoginCode(() => {
    if (i === bytes.length) { crypto.getRandomValues(bytes); i = 0; }
    return bytes[i++];
  });
}

/**
 * Makes a code for a colleague, keeps only its hash, and hands the code back to be shown once. A new code of one's
 * own waits as `next` until it reaches the cloud, which still knows only the old one.
 */
async function giveCode(person) {
  const code = randomCode();
  store.save('options', { ...person, codeHash: await hashLoginCode(code, person.id), codeAt: new Date().toISOString() });
  if (currentLogin()?.id === person.id) updateLogin({ next: normalizeLoginCode(code) });
  return code;
}

// Five wrong codes in a row make the screen wait 30 seconds, so nobody can sit and guess.
const MAX_TRIES = 5;
const WAIT_MS = 30000;
let wrongTries = 0;
let waitUntil = 0;

const REASONS = {
  format: '登入碼是 8 個英文字母和數字，例如 K7QM-4XPA。',
  unknown: '找不到這個登入碼。請再確認一次，或請管理者重設。',
  disabled: '這個登入碼已經停用，請找管理者。',
  offline: '現在連不上網路，連上後再輸入一次。',
};
// Why the login screen came back by itself: the cloud stopped accepting the code this device used.
const WHY = {
  missing: '開始和同事一起用了，請輸入你的登入碼。',
  unknown: '你的登入碼已經換新，請輸入新的登入碼。這台 iPad 上的紀錄都還在。',
  disabled: '你的登入碼已經停用，請找管理者。這台 iPad 上的紀錄都還在。',
};

export function loginView() {
  const input = h('input', {
    class: 'input login-code', placeholder: 'XXXX-XXXX', 'aria-label': '登入碼', autocomplete: 'off', autocapitalize: 'characters', spellcheck: 'false', maxlength: 4000,
  });
  const remember = h('input', { type: 'checkbox', checked: true });
  const message = h('p', { class: 'login-message', role: 'status' }, WHY[loginRequiredReason()] || '');
  let busy = false;
  async function enter() {
    if (busy) return;
    const wait = Math.ceil((waitUntil - Date.now()) / 1000);
    if (wait > 0) { message.textContent = `輸入錯太多次，請等 ${wait} 秒再試。`; return; }
    busy = true;
    message.textContent = '確認中…';
    try {
      const result = await signInWithCode(input.value, remember.checked);
      if (result.reason === 'ok') {
        wrongTries = 0;
        home();
        toast(`${result.staff.name}，歡迎`);
        return;
      }
      if (result.reason === 'offline' || result.reason === 'error') {
        message.textContent = result.message ? `現在無法確認：${result.message}` : REASONS.offline;
        return;
      }
      wrongTries += 1;
      if (wrongTries >= MAX_TRIES) {
        wrongTries = 0;
        waitUntil = Date.now() + WAIT_MS;
        message.textContent = `${REASONS[result.reason]}輸入錯太多次，請等 30 秒再試。`;
        return;
      }
      message.textContent = REASONS[result.reason];
    } finally {
      busy = false;
    }
  }
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') enter(); });
  input.addEventListener('input', () => { message.textContent = ''; });
  return h('div', { class: 'screen login' },
    h('main', { class: 'page login-page' },
      h('section', { class: 'login-card' },
        h('h1', {}, '輸入你的登入碼'),
        h('p', { class: 'muted' }, '登入碼在管理者寄給你的信裡：8 個英文字母和數字，也可以貼上整封信。'),
        input,
        h('label', { class: 'login-remember' }, remember, h('span', {}, '這是我自己的 iPad，記住我')),
        h('p', { class: 'muted small' }, '大家輪流用的 iPad 不要勾：關掉分頁後要重新輸入。'),
        button('進入', enter, 'big primary'),
        message)));
}

/**
 * A student's screen for someone who no longer teaches them: an admin took this teacher off while the screen was
 * open, or another iPad did. The records stay; the admin can add the teacher again.
 */
export function notYoursView() {
  return h('div', { class: 'screen login', 'data-student-gone': '' },
    h('main', { class: 'page login-page' },
      h('section', { class: 'login-card' },
        h('h1', {}, '這位學生不在你的名單裡'),
        h('p', { class: 'muted' }, '你現在不是這位學生的負責老師，可能是管理者把你移出了。紀錄都還在，要繼續教請找管理者加你。'),
        button('回到今日', () => home(), 'big primary'))));
}

/**
 * A student's screen after the student was deleted, here or on another iPad (2026-11-25). Whoever can delete brings
 * them back here within 30 days; a teacher learns whom to ask.
 */
export function deletedView(student) {
  const restorable = canRestore() && isRestorable(student);
  const restore = () => {
    store.restoreStudent(student.id);
    refreshView();
    toast(`已復原 ${student.name} 的所有紀錄`);
  };
  return h('div', { class: 'screen login', 'data-student-gone': '' },
    h('main', { class: 'page login-page' },
      h('section', { class: 'login-card' },
        h('h1', {}, student.name ? `${student.name}已經刪除` : '這位學生已經刪除'),
        h('p', { class: 'muted' }, restorable
          ? '30 天內可以復原：上課紀錄、課表、照片影片和負責老師都會回來。'
          : canRestore()
            ? '已經超過 30 天，App 裡找不回來了。'
            : '是管理者刪除的。要找回來請找管理者，30 天內可以復原。'),
        restorable && button('復原這位學生', restore, 'big primary'),
        button('回到今日', () => home(), restorable ? 'big' : 'big primary'))));
}

/** Another teacher's class, opened to change it (2026-11-26: 其他老師的上課紀錄看得到，但只能改自己上的課). */
export function notMineClassView(session) {
  const teacher = classTeacher(session).name;
  return h('div', { class: 'screen login', 'data-not-mine': '' },
    h('main', { class: 'page login-page' },
      h('section', { class: 'login-card' },
        h('h1', {}, teacher ? `這堂是${teacher}上的課` : '這堂是別的老師上的課'),
        h('p', { class: 'muted' }, '別的老師的上課紀錄可以看，只有上課的老師自己能改。要改請找上課的老師。'),
        button('回上一頁', () => back(), 'big primary'))));
}

/** The letter an admin mails: it pairs a new device and signs its owner in with one paste. '' before pairing. */
function letterFor(person, code, self) {
  const conn = connection();
  if (!conn) return '';
  const site = `${location.origin}${location.pathname.replace(/index\.html$/, '')}`;
  const invite = invitationCode(conn, person, code);
  return (self ? [
    `訓練紀錄 App：${person.name}的連線碼`,
    `手機或電腦第一次用時，用 Chrome 打開 ${site} ，到「設定」→「Google 連線」，把這整封信貼上，按「連線」。`,
    `連線碼：${invite}`,
    `大家輪流用的 iPad 只要輸入登入碼：${code}`,
    '這封信等於你的鑰匙，請不要轉寄。',
  ] : [
    `${person.name}你好：`,
    `這是「訓練紀錄」App 的連線碼。請在你自己的 iPad 用 Chrome 打開 ${site} ，到「設定」→「Google 連線」，把這整封信貼上，按「連線」。之後這台 iPad 會記住你。`,
    `連線碼：${invite}`,
    `大家輪流用的 iPad 不用貼這封信，輸入登入碼就好：${code}`,
    '這封信等於你的鑰匙，請不要轉寄。忘了登入碼請找我重設。',
  ]).join('\n\n');
}

/**
 * The code, shown once. Copying takes the whole letter (connection and code) when this device is paired.
 * Where copying is refused, the letter opens so it can be selected by hand.
 */
function codePanel(person, code) {
  const self = person.id === currentLogin()?.id;
  const letter = letterFor(person, code, self);
  const field = h('input', { class: 'input code-show', value: code, readonly: true, 'aria-label': `${person.name}的登入碼` });
  const area = letter ? h('textarea', { class: 'input letter-area', readonly: true, 'aria-label': '要寄的信' }) : null;
  if (area) area.value = letter;
  const fold = area ? h('details', { class: 'fold letter-fold' }, h('summary', {}, h('span', {}, '看信的內容'), icon('next')), h('div', { class: 'fold-body' }, area)) : null;
  const copy = () => navigator.clipboard.writeText(letter || code)
    .then(() => toast(letter ? '已複製，貼到公司信箱寄出' : '已複製登入碼'))
    .catch(() => {
      if (fold) { fold.open = true; area.select(); } else field.select();
      toast('請按住文字，選「全選」再「拷貝」');
    });
  let note;
  if (!letter) note = `只會顯示這一次。這台 iPad 還沒連 Google，只能複製登入碼${self ? '' : `寄給${person.name}`}；連上 Google 後重設登入碼，就能寄可以直接連線的信。`;
  else if (self) note = '只會顯示這一次。按「複製」寄給自己：手機、電腦第一次用時貼上整封信就好。忘了可以在這裡重設。';
  else note = `只會顯示這一次。按「複製」，用公司信箱寄給${person.name}：對方在自己的 iPad 貼上整封信，就連好也登入好。大家輪流用的 iPad 輸入上面 8 個字。`;
  return h('section', { class: 'code-panel', role: 'status' },
    h('p', { class: 'pf-label' }, `${person.name}的登入碼`),
    h('div', { class: 'code-row' }, field, button(letter ? (self ? '複製給自己的信' : `複製給${person.name}的信`) : '複製', copy, 'primary')),
    h('p', { class: 'muted small' }, note),
    fold);
}

// The admin's own new code stays on 設定 until leaving the screen, and while it shows, copying it is the one
// main button there (2026-11-25: 立即同步 and 複製 were both green right after creating it).
let fresh = null;

export function showingFreshCode() {
  return !!fresh && fresh.view === currentView();
}

function roleLabel(role) {
  return (STAFF_ROLES.find(([value]) => value === role) || STAFF_ROLES[0])[1];
}

function roleChooser(initial, onChange) {
  let role = initial;
  const group = h('span', { class: 'chip-seg', role: 'group', 'aria-label': '身分' });
  const draw = () => group.replaceChildren(...STAFF_ROLES.map(([value, label]) => button(label, () => { role = value; draw(); onChange?.(value); },
    'chip-btn seg-btn', { 'aria-pressed': value === role ? 'true' : 'false' })));
  draw();
  return { el: group, value: () => role };
}

/** The admin's list: add a colleague, change a name or role, disable or re-enable one, make a new code. */
function teamSheet() {
  openSheet('同事與登入碼', () => {
    const shown = h('div', {});
    const list = h('div', { class: 'staff-list' });
    const name = h('input', { class: 'input', placeholder: '同事姓名', 'aria-label': '同事姓名', maxlength: 20 });
    const roles = roleChooser('teacher');
    const hint = h('p', { class: 'muted small', role: 'status' });
    let editingId = null;

    // Copying a new code, or saving a change, is the next step while on screen: 新增 steps back from being the main button.
    const mainButton = () => addButton.classList.toggle('primary', !shown.childElementCount && !editingId);
    const show = (person, code) => {
      shown.replaceChildren(codePanel(person, code));
      mainButton();
      shown.scrollIntoView?.({ block: 'nearest' });
    };
    const setDisabled = (person, disabled) => {
      store.save('options', { ...store.get('options', person.id), disabled });
      draw();
      refreshView();
    };
    const restore = (id, before) => {
      store.save('options', { ...store.get('options', id), name: before.name, role: before.role });
      draw();
      refreshView();
    };

    function editRow(person, self) {
      const isSelf = person.id === self?.id;
      const input = h('input', { class: 'input', value: person.name, maxlength: 20, 'aria-label': '姓名' });
      const chooser = isSelf ? null : roleChooser(person.role);
      const note = h('p', { class: 'muted small', role: 'status' }, isSelf ? `你是${roleLabel(person.role)}。自己的身分要請另一位管理者改。` : '');
      const save = () => {
        const next = { name: input.value.trim(), role: chooser ? chooser.value() : person.role };
        const check = canEditStaff(team(), person, self, next);
        if (!check.ok) { note.textContent = check.reason; input.focus(); return; }
        const before = store.get('options', person.id);
        editingId = null;
        if (before.name !== next.name || before.role !== next.role) {
          store.save('options', { ...before, ...next });
          // Redrawn first: redrawing the screen clears an undo toast shown before it.
          refreshView();
          toast(`已更新 ${next.name}`, { label: '復原', run: () => restore(person.id, before) });
        }
        draw();
      };
      input.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
      return h('div', { class: 'staff-row is-editing' },
        h('div', { class: 'staff-edit' }, input, chooser?.el, note),
        h('span', { class: 'staff-actions' },
          button('取消', () => { editingId = null; draw(); }, ''),
          button('儲存', save, 'primary')));
    }

    // When each colleague last synced and what their iPads still held then (2026-11-26), as the cloud told this
    // admin's iPad at its own last sync.
    function syncLine(person) {
      const s = deviceSummary(store.getMeta('teamDevices', []), person.id);
      const left = leftText(s.records, s.photos);
      return h('span', { class: `staff-sync${left ? ' warn' : ''}` },
        `最後同步 ${s.text}`, s.lastAt ? `・${left || '都上傳了'}` : '');
    }

    function draw() {
      const everyone = team();
      const self = me();
      list.replaceChildren(...everyone.map((person) => {
        if (person.id === editingId) return editRow(person, self);
        const check = canDisableStaff(everyone, person, self);
        return h('div', { class: `staff-row${person.disabled ? ' is-off' : ''}` },
          h('span', { class: 'staff-who' },
            h('span', { class: 'staff-name' }, person.name, person.id === self?.id ? h('small', { class: 'muted' }, '（你）') : null),
            h('span', { class: 'staff-meta' },
              h('span', { class: `chip${person.role === 'admin' ? ' chip-admin' : ''}` }, roleLabel(person.role)),
              person.disabled && h('span', { class: 'chip' }, '已停用')),
            syncLine(person)),
          h('span', { class: 'staff-actions' },
            button('修改', () => { editingId = person.id; draw(); list.querySelector('.is-editing input')?.focus(); }, 'ghost'),
            !person.disabled && button('重設登入碼', () => confirmSheet(
              `重設${person.name}的登入碼`,
              person.id === self?.id
                ? '你原本的登入碼同步後就不能用。這台 iPad 會自動換成新的；你的手機、電腦要輸入新的登入碼。新的登入碼只會顯示一次。'
                : `${person.name}原本的登入碼同步後就不能用，用舊登入碼的 iPad 要輸入新的登入碼。新的登入碼只會顯示一次。`,
              '重設',
              async () => show(person, await giveCode(store.get('options', person.id))),
            ), 'ghost'),
            person.disabled
              ? button('重新啟用', () => {
                setDisabled(person, false);
                toast(`已重新啟用 ${person.name}`, { label: '復原', run: () => setDisabled(person, true) });
              }, '')
              : person.id !== self?.id && button('停用', () => {
                if (!check.ok) { toast(check.reason); return; }
                const disable = () => {
                  setDisabled(person, true);
                  toast(`已停用 ${person.name}，對方的 iPad 同步時就會被擋下`, { label: '復原', run: () => setDisabled(person, false) });
                };
                // A disabled iPad cannot send anything more, so records still on it would stay there (2026-11-26).
                const left = deviceSummary(store.getMeta('teamDevices', []), person.id);
                if (!left.records && !left.photos) { disable(); return; }
                confirmSheet(`停用${person.name}`,
                  `${person.name}${leftText(left.records, left.photos)}（${person.name}最後同步：${left.text}）。停用後${person.name}就不能再上傳，這些只會留在 iPad 上。建議先請${person.name}連上網路同步，這裡變成「都上傳了」再停用。`,
                  '仍然停用', disable);
              }, '')));
      }));
      mainButton();
    }

    const add = async () => {
      const typed = name.value.trim();
      if (!typed) { hint.textContent = '請先輸入同事姓名'; name.focus(); return; }
      if (team().some((p) => p.name === typed)) { hint.textContent = `已經有${typed}了。要重新給登入碼，按那一列的「重設登入碼」。`; return; }
      const person = { id: newId('st'), type: 'staff', name: typed, role: roles.value() };
      const code = await giveCode(person);
      name.value = '';
      hint.textContent = '';
      draw();
      show(person, code);
    };
    const addButton = button('新增並產生登入碼', add, 'primary');
    name.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    draw();

    return h('div', { class: 'stack' },
      shown,
      h('section', { class: 'staff-add' },
        h('p', { class: 'pf-label' }, '新增同事'),
        h('div', { class: 'staff-add-row' }, name, roles.el),
        addButton,
        hint),
      h('p', { class: 'muted small' }, '停用後，那位同事的 iPad 同步時會被擋下，要重新輸入登入碼，輸入停用的碼也會被拒絕。紀錄都留著，可以重新啟用。'),
      list);
  }, { wide: true, onClose: refreshView });
}

/** 設定: who is signed in; the admin also manages colleagues here. Before multi-user, how to start it. */
export function teamSection() {
  const everyone = team();
  const freshPanel = showingFreshCode() ? codePanel(fresh.person, fresh.code) : null;
  if (!multiUserOn(everyone) && !currentLogin()) {
    const conn = store.getMeta('connection');
    const name = h('input', { class: 'input', value: conn?.teacher || '', placeholder: '你的姓名', 'aria-label': '你的姓名', maxlength: 20 });
    const hint = h('p', { class: 'muted small', role: 'status' });
    return h('section', { class: 'stack settings-card' },
      h('h2', {}, '同事與登入碼'),
      h('p', { class: 'muted' }, '現在只有你在用，不需要登入。開始和同事一起用時，先建立你自己的管理者登入碼：這台 iPad 會記住你，手機、電腦第一次打開要輸入一次。'),
      h('div', { class: 'staff-add-row' }, name,
        button('建立我的管理者登入碼', async () => {
          const typed = name.value.trim();
          if (!typed) { hint.textContent = '請先輸入你的姓名'; name.focus(); return; }
          // An Apps Script from before v43 cannot check codes: the phone and computer could never sign in (2026-11-26).
          if (isConnected()) {
            hint.textContent = '確認雲端連線程式中…';
            try {
              const result = await call('ping');
              if (!('team' in result)) {
                hint.textContent = '雲端連線程式還是舊版，還不能建立登入碼。等搬到共用帳號、更新雲端程式時再建立。';
                return;
              }
            } catch {
              hint.textContent = '要連上網路才能建立登入碼，請連上網路再試一次。';
              return;
            }
            hint.textContent = '';
          }
          const person ={ id: newId('st'), type: 'staff', name: typed, role: 'admin', first: true };
          const code = await giveCode(person);
          // Every student so far is this teacher's own; colleagues join theirs from their calendars later.
          for (const student of store.all('students')) if (!student.demo) setTeacher(student.id, person.id, true);
          keepLogin(person, code, true);
          fresh = { person, code, view: currentView() };
          refreshView();
        }, '')),
      hint);
  }
  const self = me();
  const off = everyone.filter((p) => p.disabled).length;
  return h('section', { class: 'stack settings-card' },
    h('h2', {}, '同事與登入碼'),
    freshPanel,
    h('div', { class: 'row-between' },
      h('p', {}, '現在使用：', h('b', {}, self?.name || '—'), self ? `（${roleLabel(self.role)}）` : ''),
      button('換人使用', switchUser, 'ghost')),
    self?.role === 'admin' && [
      h('p', { class: 'muted' }, everyone.length
        ? `可以登入的 ${everyone.length - off} 位（含你）${off ? `，停用 ${off} 位` : ''}。`
        : '同事名單還在從雲端下載。'),
      h('div', { class: 'row-wrap' },
        button('管理同事與登入碼', teamSheet, ''),
        button('誰看過、改過學生', () => logSheet(), '')),
    ]);
}
