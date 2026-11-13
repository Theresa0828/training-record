// Choosing springs by color, so no keyboard ever opens. Used in class and when planning.
// Each apparatus shows its own springs (2026-11-13): Reformer, Chair and Cadillac differ.
import { h, button } from './dom.js';
import { SPRING_WORDS, springKind, springSet, springFromText, springToText } from './core.js';

const POSITION_NAMES = {
  reformer: { l: '低 l', m: '中 m', h: '高 h' },
  chair: { T: '頂 T', H: '高 H', M: '中 M', L: '低 L' },
};
const POSITION_LABEL = { reformer: '彈簧位置', chair: '掛孔' };

const empty = () => ({ counts: {}, bar: '' });

/** Returns the controls for one spring setting. onChange gets the new text, such as "1r1b m" or "1k1g T". */
export function springEditor(text, onChange, presets = [], apparatus = 'Reformer') {
  const kind = springKind(apparatus);
  const set = springSet(apparatus);
  const spring = springFromText(text);
  // A setting from another apparatus keeps only what this one has.
  if (spring.bar && !set.positions.includes(spring.bar)) spring.bar = '';
  const send = () => onChange(springToText({ counts: Object.fromEntries(set.colors.map((c) => [c, spring.counts[c] || 0])), bar: spring.bar }, apparatus));
  const name = (color) => SPRING_WORDS[color];
  const shown = springToText(spring, apparatus);
  return h('div', { class: 'spring-editor' },
    h('div', { class: 'spring-top' },
      h('div', { class: 'spring-value', 'aria-label': `目前彈簧 ${shown || '未設定'}` }, shown || '未設定'),
      h('div', { class: 'spring-bars', role: 'group', 'aria-label': POSITION_LABEL[kind] || '彈簧' },
        set.positions.length > 0 && h('span', { class: 'muted small' }, POSITION_LABEL[kind]),
        set.positions.map((bar) => button(POSITION_NAMES[kind][bar] || bar, () => { spring.bar = spring.bar === bar ? '' : bar; send(); }, 'chip-btn', { 'aria-pressed': spring.bar === bar ? 'true' : 'false' })),
        button('清除', () => onChange(springToText(empty(), apparatus)), 'chip-btn')),
      presets.length > 0 && h('div', { class: 'spring-presets', role: 'group', 'aria-label': '常用組合' },
        presets.map((preset) => button(preset, () => onChange(preset), 'chip-btn', { 'aria-pressed': preset === text ? 'true' : 'false' })))),
    h('div', { class: `spring-colors is-${set.colors.length}` }, set.colors.map((color) => h('div', { class: 'spring-card' },
      h('button', {
        type: 'button',
        class: 'spring-minus',
        'data-repeat': true,
        disabled: !spring.counts[color],
        'aria-label': `${name(color)}彈簧減一條`,
        onclick: () => { spring.counts[color] -= 1; send(); },
      }, '−'),
      h('button', {
        type: 'button',
        class: 'spring-add',
        'data-repeat': true,
        'aria-label': `${name(color)}彈簧加一條，目前 ${spring.counts[color] || 0} 條`,
        onclick: () => { spring.counts[color] = (spring.counts[color] || 0) + 1; send(); },
      }, h('span', { class: `spring-dot spring-${color}`, 'aria-hidden': 'true' }), h('span', {}, name(color)), h('strong', {}, spring.counts[color] || 0))))),
  );
}
