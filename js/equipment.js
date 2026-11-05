// Which equipment a strength exercise used. The same movement on other equipment is one exercise, with this set per class.
import { h, button } from './dom.js';
import { EQUIPMENT, BAND, BAND_COLORS } from './core.js';

/** A tap picks; a second tap clears it, because bodyweight and machines have no equipment to choose. */
export function equipmentControl(row, onPick) {
  return h('div', { class: 'stack-sm equipment' },
    h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, '器材'),
      h('div', { class: 'chips chips-4' }, EQUIPMENT.map((name) => button(name, () => {
        if (row.equipment === name) onPick('', '');
        else onPick(name, name === BAND ? row.band || '' : '');
      }, 'chip-btn', { 'aria-pressed': row.equipment === name ? 'true' : 'false' })))),
    row.equipment === BAND && h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, '彈力帶顏色'),
      h('div', { class: 'chips chips-5' }, BAND_COLORS.map((color, index) => h('button', {
        type: 'button',
        class: 'btn chip-btn band-chip',
        'aria-pressed': row.band === color ? 'true' : 'false',
        onclick: () => onPick(BAND, row.band === color ? '' : color),
      }, h('span', { class: `band-dot band-${index}`, 'aria-hidden': 'true' }), color)))));
}
