// Who is signed in on this device (2026-11-25, multi-user part 2): { id, code, name, role }, plus `next` while a new
// code of one's own waits to reach the cloud. The cloud checks the code with every request.
// An own iPad keeps it in its database; a shared iPad only for this tab, so closing the tab signs out.
// It is never synced and never part of the backup shown in 設定.
import * as store from './store.js';

const TAB_KEY = 'training-record-staff';
const META_KEY = 'staffLogin';

function fromTab() {
  try {
    const text = sessionStorage.getItem(TAB_KEY);
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

function toTab(value) {
  try {
    if (value) sessionStorage.setItem(TAB_KEY, JSON.stringify(value));
    else sessionStorage.removeItem(TAB_KEY);
  } catch { /* private mode: the database copy still works for an own iPad */ }
}

export function currentLogin() {
  return fromTab() || store.getMeta(META_KEY, null);
}

// Each change waiting for the cloud remembers who made it (2026-11-26, v47).
store.setActorSource(() => currentLogin()?.id || '');

export function loginRemembered() {
  return !fromTab() && !!store.getMeta(META_KEY, null);
}

export function saveLogin(value, remember) {
  store.setMeta(META_KEY, remember ? value : null);
  toTab(remember ? null : value);
  store.setMeta('loginRequired', null);
}

/** Changes the kept login in place, wherever it is kept. */
export function updateLogin(changes) {
  const login = currentLogin();
  if (!login) return;
  const value = { ...login, ...changes };
  if (!value.next) delete value.next;
  if (fromTab()) toTab(value);
  else store.setMeta(META_KEY, value);
}

/** Signs out. `reason` ('missing', 'unknown', 'disabled') says why the cloud asked for a new sign-in. */
export function forgetLogin(reason = null) {
  store.setMeta(META_KEY, null);
  toTab(null);
  if (reason) store.setMeta('loginRequired', reason);
}

export function loginRequiredReason() {
  return store.getMeta('loginRequired', null);
}
