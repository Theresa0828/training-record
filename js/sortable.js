// Reordering a list by finger. The row follows the finger and the others make room, so it always shows where it will land.
import { h, button, openSheet } from './dom.js';

const START_DISTANCE = 6;
const EDGE = 44;
const EDGE_SPEED = 6;

function scrollParent(el) {
  for (let node = el; node && node !== document.body; node = node.parentElement) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
  }
  return document.scrollingElement;
}

function startDrag(event, { handle, rowEl, list, index, onDrop }) {
  if (event.button) return;
  const rowEls = [...list.children];
  const scroller = scrollParent(list);
  const startScroll = scroller.scrollTop;
  const boxes = rowEls.map((el) => {
    const box = el.getBoundingClientRect();
    return { top: box.top, height: box.height, centre: box.top + box.height / 2 };
  });
  const self = boxes[index];
  const gap = boxes.length > 1 ? boxes[1].top - boxes[0].top - boxes[0].height : 0;
  const lowest = boxes[0].top - self.top;
  const highest = boxes.at(-1).top + boxes.at(-1).height - self.top - self.height;
  const startY = event.clientY;
  let lastY = startY;
  let target = index;
  let dragging = false;
  let timer = 0;

  function place() {
    // Kept inside the list, or the row itself would make the list longer and the edge scroll would never stop.
    const moved = Math.min(highest, Math.max(lowest, lastY - startY + scroller.scrollTop - startScroll));
    rowEl.style.transform = `translateY(${moved}px)`;
    const centre = self.centre + moved;
    target = index;
    boxes.forEach((box, i) => {
      if (i > index && centre > box.centre) target = i;
      if (i < index && centre < box.centre && target >= index) target = i;
    });
    rowEls.forEach((el, i) => {
      if (i === index) return;
      const shift = i > index && i <= target ? -(self.height + gap) : i < index && i >= target ? self.height + gap : 0;
      el.style.transform = shift ? `translateY(${shift}px)` : '';
    });
  }

  // A long list scrolls while the finger rests near the edge.
  function edgeScroll() {
    const box = scroller === document.scrollingElement ? { top: 0, bottom: window.innerHeight } : scroller.getBoundingClientRect();
    if (lastY < box.top + EDGE) scroller.scrollTop -= EDGE_SPEED;
    else if (lastY > box.bottom - EDGE) scroller.scrollTop += EDGE_SPEED;
    place();
  }

  function move(e) {
    lastY = e.clientY;
    if (!dragging) {
      if (Math.abs(lastY - startY) < START_DISTANCE) return;
      dragging = true;
      handle.dataset.dragged = 'true';
      list.classList.add('is-sorting');
      rowEl.classList.add('is-dragging');
      timer = setInterval(edgeScroll, 16);
    }
    place();
  }

  function end(e) {
    handle.removeEventListener('pointermove', move);
    handle.removeEventListener('pointerup', end);
    handle.removeEventListener('pointercancel', end);
    clearInterval(timer);
    if (!dragging) return;
    // The click that follows a drag must not open the sheet, but the next real tap must.
    setTimeout(() => { delete handle.dataset.dragged; }, 80);
    list.classList.remove('is-sorting');
    rowEl.classList.remove('is-dragging');
    rowEls.forEach((el) => { el.style.transform = ''; });
    if (e.type === 'pointerup' && target !== index) onDrop(index, target);
  }

  handle.setPointerCapture?.(event.pointerId);
  handle.addEventListener('pointermove', move);
  handle.addEventListener('pointerup', end);
  handle.addEventListener('pointercancel', end);
}

/** A tap gives plain up and down buttons, for when dragging is awkward. */
function moveSheet(name, index, count, onMove) {
  let at = index;
  openSheet(`調整 ${name} 的順序`, (close) => {
    const position = h('p', { class: 'muted', role: 'status' });
    const up = button('往上移', () => step(-1), '');
    const down = button('往下移', () => step(1), '');
    const paint = () => {
      position.textContent = `目前排第 ${at + 1} 個，共 ${count} 個`;
      up.disabled = at === 0;
      down.disabled = at === count - 1;
    };
    function step(direction) {
      onMove(at, at + direction);
      at += direction;
      paint();
    }
    paint();
    return h('div', { class: 'stack' }, position, h('div', { class: 'panel-actions' }, up, down), button('好了', close, 'big primary'));
  });
}

/**
 * The handle for one row. getRow and getList are functions because the row is built after its handle.
 * onMove(from, to) changes the data and redraws.
 */
export function dragHandle({ name, index, count, getRow, getList, onMove }) {
  const handle = h('button', {
    type: 'button',
    class: 'grid-handle',
    'aria-label': `調整 ${name} 的順序，可以按住拖曳，或點一下用按鈕移動`,
    onclick: () => {
      if (handle.dataset.dragged) { delete handle.dataset.dragged; return; }
      moveSheet(name, index, count, onMove);
    },
  }, h('span', { 'aria-hidden': 'true' }));
  handle.addEventListener('pointerdown', (event) => startDrag(event, { handle, rowEl: getRow(), list: getList(), index, onDrop: onMove }));
  return handle;
}
