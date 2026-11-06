// One number to set, such as weight, reps or sets. Each sits in its own box with a picture and a name on top,
// so the boxes can be told apart at a glance, and minus never looks like plus.
import { h } from './dom.js';
import { icon } from './icons.js';

/**
 * steps: the step sizes on each side, smallest first, e.g. [1, 2] gives −2 −1 value +1 +2.
 * onTap, when given, lets the value be typed directly.
 */
export function paramTile({ name = '', label, iconName, value, text = String(value), unit = '', steps, onStep, onTap, min, max, bump = false, className = '' }) {
  const stepButton = (delta) => h('button', {
    type: 'button',
    class: `btn param-step ${delta < 0 ? 'is-minus' : 'is-plus'}`,
    'data-repeat': true,
    disabled: (delta < 0 && min !== undefined && value <= min) || (delta > 0 && max !== undefined && value >= max),
    'aria-label': `${name} ${label} ${delta > 0 ? '加' : '減'} ${Math.abs(delta)}`.trim(),
    onclick: () => onStep(delta),
  }, `${delta > 0 ? '+' : '−'}${steps.length > 1 || Math.abs(delta) !== 1 ? Math.abs(delta) : ''}`);
  const shown = [text, unit ? h('small', {}, unit) : ''];
  const valueEl = onTap
    ? h('button', { type: 'button', class: `param-value value-tap${bump ? ' bump' : ''}`, 'aria-label': `${name} ${label} ${text}${unit}，點一下直接輸入`.trim(), onclick: onTap }, ...shown)
    : h('span', { class: `param-value${bump ? ' bump' : ''}`, 'aria-label': `${name} ${label} ${text}${unit}`.trim() }, ...shown);
  return h('div', { class: `param ${className}`.trim(), role: 'group', 'aria-label': label },
    h('div', { class: 'param-head' }, icon(iconName), h('span', {}, label)),
    h('div', { class: 'param-controls' },
      [...steps].reverse().map((s) => stepButton(-s)),
      valueEl,
      steps.map((s) => stepButton(s))));
}

/** A box like the others whose value opens a chooser, for the spring setting. */
export function paramChoice({ label, iconName, text, ariaLabel, onTap }) {
  return h('div', { class: 'param', role: 'group', 'aria-label': label },
    h('div', { class: 'param-head' }, icon(iconName), h('span', {}, label)),
    h('button', { type: 'button', class: 'btn param-choice', 'aria-label': ariaLabel, onclick: onTap }, text));
}
