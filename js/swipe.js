// Swipe a row left to show a delete button under it (2026-11-16, the class list). Only one row is open at a time.
import { h } from './dom.js';
import { icon } from './icons.js';

const OPEN = 96;
let openRow = null;

function setOffset(row, x) {
  if (x) row.style.setProperty('--swipe', `${x}px`);
  else row.style.removeProperty('--swipe');
}

export function closeSwipe(row = openRow) {
  if (!row) return;
  row.classList.remove('is-swiped');
  setOffset(row, 0);
  if (openRow === row) openRow = null;
}

/** Lets rowEl slide left to reveal a delete button. onDelete runs on a tap of that button. */
export function swipeToDelete(rowEl, name, onDelete) {
  const remove = h('button', {
    type: 'button',
    class: 'swipe-delete',
    tabindex: '-1',
    'aria-label': `刪除 ${name} 整個動作`,
    onclick: (event) => {
      event.stopPropagation();
      closeSwipe(rowEl);
      onDelete();
    },
  }, icon('trash'), h('span', {}, '刪除'));
  rowEl.classList.add('can-swipe');
  rowEl.append(remove);

  let start = null;
  let swiping = false;
  let base = 0;
  let dx = 0;
  let quietUntil = 0;

  // A swipe or the tap that closes an open row must not also press the set it started on.
  rowEl.addEventListener('click', (event) => {
    if (Date.now() < quietUntil && !event.target.closest('.swipe-delete')) {
      event.stopPropagation();
      event.preventDefault();
    }
  }, true);

  rowEl.addEventListener('pointerdown', (event) => {
    if (event.target.closest('.grid-handle, .swipe-delete')) return;
    if (openRow && openRow !== rowEl) {
      closeSwipe(openRow);
      quietUntil = Date.now() + 500;
    }
    start = { x: event.clientX, y: event.clientY, id: event.pointerId };
    base = rowEl.classList.contains('is-swiped') ? -OPEN : 0;
    swiping = false;
    dx = 0;
  });

  rowEl.addEventListener('pointermove', (event) => {
    if (!start || event.pointerId !== start.id) return;
    dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (!swiping) {
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx)) { start = null; return; }
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
      swiping = true;
      rowEl.classList.add('is-swiping');
      try { rowEl.setPointerCapture(start.id); } catch { /* the pointer already ended */ }
    }
    setOffset(rowEl, Math.min(0, Math.max(-OPEN - 24, base + dx)));
  });

  const end = () => {
    if (!start) return;
    rowEl.classList.remove('is-swiping');
    if (swiping) {
      quietUntil = Date.now() + 500;
      if (base + dx < -OPEN / 2) {
        rowEl.classList.add('is-swiped');
        setOffset(rowEl, -OPEN);
        openRow = rowEl;
      } else closeSwipe(rowEl);
    } else if (base) {
      // A tap on an open row only closes it.
      quietUntil = Date.now() + 500;
      closeSwipe(rowEl);
    }
    start = null;
    swiping = false;
  };
  rowEl.addEventListener('pointerup', end);
  rowEl.addEventListener('pointercancel', end);
}
