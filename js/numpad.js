// A large number pad for jumping straight to a value, so the system keyboard never opens.
import { h, button, openSheet } from './dom.js';

const MAX_VALUE = 999;

export function numberSheet(title, value, unit, decimals, onDone) {
  openSheet(title, (close) => {
    let typed = '';
    const display = h('div', { class: 'numpad-value', role: 'status' });
    const paint = () => {
      display.replaceChildren(typed || String(value ?? 0), unit ? h('small', {}, unit) : '');
      display.classList.toggle('is-old', !typed);
    };
    const press = (key) => {
      if (key === '.' && (typed.includes('.') || !decimals)) return;
      const next = key === '.' && !typed ? '0.' : typed === '0' && key !== '.' ? key : typed + key;
      if (next.length > 5 || Number(next) > MAX_VALUE) return;
      typed = next;
      paint();
    };
    const key = (label) => button(label, () => press(label), 'key', { 'data-repeat': true, disabled: label === '.' && !decimals });
    paint();
    return h('div', { class: 'stack' },
      display,
      h('div', { class: 'keypad' },
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0'].map(key),
        button('刪除', () => { typed = typed.slice(0, -1); paint(); }, 'key', { 'data-repeat': true })),
      button('確定', () => {
        close();
        if (typed && Number.isFinite(Number(typed))) onDone(Number(typed));
      }, 'big primary'));
  });
}
