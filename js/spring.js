// Choosing springs by color, so no keyboard ever opens. Used in class and when planning.
import { h, button } from './dom.js';
import { SPRING_COLORS, SPRING_BARS, springFromText, springToText } from './core.js';

const COLOR_NAMES = { r: '紅', b: '藍', y: '黃', g: '綠' };
const BAR_NAMES = { l: '低 l', m: '中 m', h: '高 h' };
const EMPTY = () => ({ counts: { r: 0, b: 0, y: 0, g: 0 }, bar: '' });

/** Returns the controls for one spring setting. onChange gets the new text, such as "1r1b m". */
export function springEditor(text, onChange, presets = []) {
  const spring = springFromText(text);
  const send = () => onChange(springToText(spring));
  const name = (color) => COLOR_NAMES[color];
  return h('div', { class: 'spring-editor' },
    h('div', { class: 'spring-top' },
      h('div', { class: 'spring-value', 'aria-label': `目前彈簧 ${text || '未設定'}` }, text || '未設定'),
      h('div', { class: 'spring-bars', role: 'group', 'aria-label': '彈簧位置' },
        SPRING_BARS.map((bar) => button(BAR_NAMES[bar] || bar, () => { spring.bar = spring.bar === bar ? '' : bar; send(); }, 'chip-btn', { 'aria-pressed': spring.bar === bar ? 'true' : 'false' })),
        button('清除', () => onChange(springToText(EMPTY())), 'chip-btn')),
      presets.length > 0 && h('div', { class: 'spring-presets', role: 'group', 'aria-label': '常用組合' },
        presets.map((preset) => button(preset, () => onChange(preset), 'chip-btn', { 'aria-pressed': preset === text ? 'true' : 'false' })))),
    h('div', { class: 'spring-colors' }, SPRING_COLORS.map((color) => h('div', { class: 'spring-card' },
      h('button', {
        type: 'button',
        class: 'spring-minus',
        'data-repeat': true,
        disabled: !spring.counts[color],
        'aria-label': `${name(color)}色彈簧減一條`,
        onclick: () => { spring.counts[color] -= 1; send(); },
      }, '−'),
      h('button', {
        type: 'button',
        class: 'spring-add',
        'data-repeat': true,
        'aria-label': `${name(color)}色彈簧加一條，目前 ${spring.counts[color]} 條`,
        onclick: () => { spring.counts[color] += 1; send(); },
      }, h('span', { class: `spring-dot spring-${color}`, 'aria-hidden': 'true' }), h('span', {}, name(color)), h('strong', {}, spring.counts[color]))))),
  );
}
