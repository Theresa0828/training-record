// Small view helpers. All text goes through textContent, so stored names can never become markup.
import { icon } from './icons.js';

export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'onclick') el.addEventListener('click', value);
    else if (key === 'oninput') el.addEventListener('input', value);
    else if (key === 'value') el.value = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else el.setAttribute(key, value === true ? '' : value);
  }
  append(el, children);
  return el;
}

function append(el, children) {
  for (const child of children.flat(Infinity)) {
    if (child === null || child === undefined || child === false) continue;
    el.append(child instanceof Node ? child : String(child));
  }
}

export function button(label, onclick, className = '', props = {}) {
  return h('button', { type: 'button', class: `btn ${className}`, onclick, ...props }, label);
}

export const HOLD_MS = 1000;

/**
 * A button that only acts after being held for one second, for everything that removes or deletes.
 * A short tap fills nothing and says how to use it, so a stray finger never deletes.
 */
export function holdButton(label, onHold, className = '', props = {}) {
  const fill = h('span', { class: 'hold-fill', 'aria-hidden': 'true' });
  const el = h('button', { type: 'button', class: `btn hold ${className}`.trim(), 'aria-label': `${label}，按住 1 秒`, ...props },
    fill, h('span', { class: 'hold-label' }, label, h('small', {}, '按住 1 秒')));
  let timer = null;
  let started = 0;
  const begin = () => {
    if (timer) return;
    started = Date.now();
    el.classList.add('is-holding');
    timer = setTimeout(() => {
      timer = null;
      el.classList.remove('is-holding');
      navigator.vibrate?.(15);
      onHold();
    }, HOLD_MS);
  };
  const end = (hint) => {
    if (!timer) return;
    clearTimeout(timer);
    timer = null;
    el.classList.remove('is-holding');
    if (hint && Date.now() - started < HOLD_MS) toast(`要按住 1 秒才會${label.includes('刪除') ? '刪除' : label.includes('移除') ? '移除' : label}`);
  };
  el.addEventListener('pointerdown', (e) => { if (e.button === 0) begin(); });
  el.addEventListener('pointerup', () => end(true));
  el.addEventListener('pointerleave', () => end(false));
  el.addEventListener('pointercancel', () => end(false));
  el.addEventListener('contextmenu', (e) => e.preventDefault());
  el.addEventListener('keydown', (e) => { if ((e.key === 'Enter' || e.key === ' ') && !e.repeat) { e.preventDefault(); begin(); } });
  el.addEventListener('keyup', (e) => { if (e.key === 'Enter' || e.key === ' ') end(true); });
  return el;
}

const views = new Map();
const history = [];
let current = null;

export function registerView(name, render) {
  views.set(name, render);
}

function paint(motion) {
  const root = document.getElementById('app');
  dismissActionToast();
  const screen = views.get(current.name)(current.params);
  // The new screen is live at once. The movement is only a hint of where it came from.
  if (motion) screen.classList.add(`enter-${motion}`);
  root.replaceChildren(screen);
  root.scrollTop = 0;
  window.scrollTo(0, 0);
}

export function go(name, params = {}) {
  if (current) history.push(current);
  current = { name, params };
  paint('forward');
}

export function back(fallback = 'today') {
  current = history.pop() || { name: fallback, params: {} };
  paint('back');
}

/** Returns to the home screen and forgets the path taken to get there. */
export function home() {
  history.length = 0;
  current = { name: 'today', params: {} };
  paint('fade');
}

/** Jumps to one of the four main screens. */
export function tab(name) {
  history.length = 0;
  current = { name, params: {} };
  paint('fade');
}

const TABS = [['today', '今日', 'today'], ['students', '學生', 'people'], ['library', '動作庫', 'dumbbell'], ['settings', '設定', 'gear']];

export function tabBar(active) {
  return h('nav', { class: 'tabbar', 'aria-label': '主選單' }, TABS.map(([name, label, glyph]) => h('button', {
    type: 'button',
    class: `tab${name === active ? ' is-active' : ''}`,
    'aria-current': name === active ? 'page' : null,
    onclick: () => { if (name !== active) tab(name); },
  }, icon(glyph), h('span', {}, label))));
}

export function backButton() {
  return h('button', { type: 'button', class: 'btn ghost back', 'aria-label': '返回', onclick: () => back() }, icon('back'), h('span', {}, '返回'));
}

export function refreshView() {
  if (current) paint();
}

export function currentView() {
  return current;
}

/** Slides up a panel over the current view. Returns a function that closes it. */
export function openSheet(title, build, { wide = false } = {}) {
  const root = document.getElementById('sheet-root');
  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    // It stops taking taps right away, so the exit animation can never catch a finger.
    overlay.classList.add('closing');
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setTimeout(() => overlay.remove(), reduced ? 0 : 160);
  };
  const body = h('div', { class: 'sheet-body' });
  const overlay = h('div', { class: 'sheet-overlay' },
    h('div', { class: `sheet${wide ? ' sheet-wide' : ''}`, role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
      h('div', { class: 'sheet-head' }, h('h2', {}, title), button('關閉', close, 'ghost')),
      body));
  root.append(overlay);
  body.append(build(close));
  return close;
}

let toastTimer = null;
/** Removes a toast's undo button once it would no longer undo what it says. */
export function dismissActionToast() {
  document.querySelector('.toast.has-action')?.remove();
}

export function toast(message, action) {
  document.querySelector('.toast')?.remove();
  const top = document.querySelector('.record') ? ' toast-top' : '';
  const el = h('div', { class: `toast${top}${action ? ' has-action' : ''}`, role: 'status' }, h('span', {}, message),
    action && button(action.label, () => { el.remove(); action.run(); }, 'ghost'));
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), action ? 6000 : 3000);
}

/** A confirmation built into the page, used only where undo is impossible. */
export function confirmSheet(title, message, confirmLabel, onConfirm) {
  openSheet(title, (close) => h('div', { class: 'stack' },
    h('p', {}, message),
    h('div', { class: 'row-between' },
      button('取消', close, ''),
      holdButton(confirmLabel, () => { close(); onConfirm(); }, 'danger'))));
}

/**
 * Stops the common causes of a wrong tap: a palm or second finger resting on the
 * screen, a tap that was really a scroll, the fingers holding the iPad at its edge,
 * and an accidental double tap. It runs before any button handler.
 */
export function installTapGuard() {
  const EDGE = 12;
  const MOVE_LIMIT = 12;
  const PALM_SIZE = 150; // iPad reports a normal fingertip as 40-110 wide, so only a real palm passes this.
  const DOUBLE_TAP_MS = 280;
  const DOUBLE_TAP_DISTANCE = 30;
  const TWO_FINGER_MS = 120;
  const active = new Map();
  let down = null;
  let moved = false;
  let blocked = false;
  let lastTap = null;

  document.addEventListener('touchstart', () => {}, { passive: true });

  document.addEventListener('pointerdown', (e) => {
    if (e.pointerType === 'mouse') {
      blocked = false;
      moved = false;
      down = { x: e.clientX, y: e.clientY };
      return;
    }
    // A first finger means nothing else is touching, even if a lift was never reported.
    if (e.isPrimary) active.clear();
    const palm = e.width > PALM_SIZE || e.height > PALM_SIZE;
    const edge = e.pointerType === 'touch' && (e.clientX < EDGE || e.clientX > window.innerWidth - EDGE);
    if (palm || edge) {
      // A thumb or palm holding the iPad must not stop the other hand from tapping.
      if (!active.size) blocked = true;
      return;
    }
    const now = performance.now();
    blocked = [...active.values()].some((time) => now - time < TWO_FINGER_MS);
    active.set(e.pointerId, now);
    moved = false;
    down = { x: e.clientX, y: e.clientY };
  }, true);

  // Measured while the finger moves. The click's own position cannot be used, because iOS
  // snaps a slightly missed tap onto the nearest button, which looks like movement.
  document.addEventListener('pointermove', (e) => {
    if (!down || (e.pointerType !== 'mouse' && !active.has(e.pointerId))) return;
    if (Math.abs(e.clientX - down.x) > MOVE_LIMIT || Math.abs(e.clientY - down.y) > MOVE_LIMIT) moved = true;
  }, true);

  const release = (e) => active.delete(e.pointerId);
  document.addEventListener('pointerup', release, true);
  document.addEventListener('pointercancel', release, true);

  document.addEventListener('click', (e) => {
    const target = e.target.closest('button, [data-tap]');
    if (!target || e.detail === 0) return;
    const now = performance.now();
    // Compared by place, because the panel rebuilds its buttons after every tap.
    const repeated = lastTap && now - lastTap.time < DOUBLE_TAP_MS && !target.hasAttribute('data-repeat')
      && Math.abs(e.clientX - lastTap.x) < DOUBLE_TAP_DISTANCE && Math.abs(e.clientY - lastTap.y) < DOUBLE_TAP_DISTANCE;
    if (blocked || moved || repeated) {
      e.stopPropagation();
      e.preventDefault();
      return;
    }
    lastTap = { time: now, x: e.clientX, y: e.clientY };
  }, true);

  // iOS would otherwise zoom on double tap and pinch, which moves every button.
  document.addEventListener('gesturestart', (e) => e.preventDefault());
}

/** Lifts sheets above the on-screen keyboard, which iOS does not account for. */
export function installKeyboardLift() {
  const viewport = window.visualViewport;
  if (!viewport) return;
  const update = () => {
    const covered = Math.max(0, window.innerHeight - viewport.height - viewport.offsetTop);
    document.documentElement.style.setProperty('--keyboard', `${covered}px`);
    // iPad leaves the whole page pushed up after the keyboard closes; put it back.
    if (!covered && (window.scrollY || document.documentElement.scrollTop)) window.scrollTo(0, 0);
  };
  document.addEventListener('focusout', () => setTimeout(() => {
    if (!document.activeElement || document.activeElement === document.body) window.scrollTo(0, 0);
  }, 100));
  viewport.addEventListener('resize', update);
  viewport.addEventListener('scroll', update);
}
