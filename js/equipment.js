// Which equipment a strength exercise used. The same movement on other equipment is one exercise, with this set per class.
// Each piece has a flat picture, because 啞鈴, 壺鈴 and 槓鈴 look alike as words.
import { h, button, holdButton, openSheet, toast } from './dom.js';
import * as store from './store.js';
import { EQUIPMENT, BAND, BAND_COLORS, chooserOptions, newId } from './core.js';

const NS = 'http://www.w3.org/2000/svg';

// Shapes on a 32 x 32 grid. f: filled shape, s: line, ring: outlined circle.
const SHAPES = {
  啞鈴: [['f', 'M3 10.5a2 2 0 012-2h4a2 2 0 012 2v11a2 2 0 01-2 2H5a2 2 0 01-2-2zM21 10.5a2 2 0 012-2h4a2 2 0 012 2v11a2 2 0 01-2 2h-4a2 2 0 01-2-2zM11 14.5h10v3H11z']],
  槓鈴: [['f', 'M5 6.5a1.5 1.5 0 013 0v19a1.5 1.5 0 01-3 0zM24 6.5a1.5 1.5 0 013 0v19a1.5 1.5 0 01-3 0zM9 10a1 1 0 012 0v12a1 1 0 01-2 0zM21 10a1 1 0 012 0v12a1 1 0 01-2 0zM1 15h30v2H1z']],
  壺鈴: [['s', 'M10.5 15V10a5.5 5.5 0 0111 0v5'], ['f', 'M16 12.5a9 9 0 110 18 9 9 0 010-18z']],
  彈力帶: [['s', 'M4 16c0-5 5-8 12-8s12 3 12 8-5 8-12 8-12-3-12-8z']],
  六角槓: [['s', 'M10 16l3.5-6h5l3.5 6-3.5 6h-5zM1.5 16H10M22 16h8.5'], ['f', 'M3.5 10.5a1.2 1.2 0 012.4 0v11a1.2 1.2 0 01-2.4 0zM26.1 10.5a1.2 1.2 0 012.4 0v11a1.2 1.2 0 01-2.4 0z']],
  藥球: [['ring', '16 16 12'], ['s', 'M4.5 16h23M16 4c-5 4.5-5 19.5 0 24M16 4c5 4.5 5 19.5 0 24']],
  Reformer: [['s', 'M2 22h28M5 22v4M27 22v4M4 12v10M28 12v10M5 19.5h5.5'], ['f', 'M12 16.5h10a1.5 1.5 0 011.5 1.5v2.5h-13V18a1.5 1.5 0 011.5-1.5z']],
  Cadillac: [['s', 'M4 5v23M28 5v23M4 5h24M2 22h28'], ['f', 'M6 18h20v3H6z']],
  Chair: [['f', 'M7 9a2 2 0 012-2h14a2 2 0 012 2v14H7z'], ['s', 'M10 23v5M22 23v5M25 18h4.5']],
  Mat: [['f', 'M2 21a2 2 0 012-2h24a2 2 0 012 2v2a2 2 0 01-2 2H4a2 2 0 01-2-2z'], ['ring', '25 14 3.5']],
  'Arc Barrel': [['s', 'M3 27h26'], ['f', 'M5 26a11 11 0 0122 0z']],
  'Spine Corrector': [['s', 'M3 27h26'], ['f', 'M4 26a8.5 8.5 0 0117 0zM21 20h7v6h-7z']],
  地雷管: [['s', 'M2 28h28M6 25L23 10'], ['f', 'M3 23h6v5H3zM24.5 3.5a5 5 0 110 10 5 5 0 010-10z']],
};

function el(tag, attrs) {
  const node = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) node.setAttribute(key, value);
  return node;
}

/** The picture for a piece of equipment. One the teacher added shows its first character in a circle. */
export function equipmentIcon(name) {
  const svg = el('svg', { viewBox: '0 0 32 32', class: 'equip-icon', 'aria-hidden': 'true' });
  const shapes = SHAPES[name];
  if (!shapes) {
    svg.append(el('circle', { cx: 16, cy: 16, r: 13, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.5 }));
    const letter = el('text', { x: 16, y: 21.5, 'text-anchor': 'middle', class: 'equip-letter' });
    letter.textContent = [...name][0] || '?';
    svg.append(letter);
    return svg;
  }
  for (const [type, data] of shapes) {
    if (type === 'f') svg.append(el('path', { d: data, fill: 'currentColor' }));
    else if (type === 's') svg.append(el('path', { d: data, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.75, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    else {
      const [cx, cy, r] = data.split(' ');
      svg.append(el('circle', { cx, cy, r, fill: 'none', stroke: 'currentColor', 'stroke-width': 2.75 }));
    }
  }
  return svg;
}

function addedEquipment() {
  return store.all('options').filter((o) => o.type === 'equipment');
}

/** Adds a piece of the teacher's own, and picks it. */
function addEquipmentSheet(onAdded) {
  openSheet('新增器材', (close) => {
    const input = h('input', { class: 'input', maxlength: 6, placeholder: '例如：TRX、滑盤', 'aria-label': '器材名稱' });
    const add = () => {
      const name = input.value.trim();
      if (!name) { toast('名稱不可空白'); return; }
      if (!EQUIPMENT.includes(name) && !addedEquipment().some((o) => o.name === name)) {
        store.save('options', { id: newId('opt'), type: 'equipment', name });
      }
      close();
      onAdded(name);
    };
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') add(); });
    const own = addedEquipment();
    setTimeout(() => input.focus(), 50);
    return h('div', { class: 'stack' },
      input,
      button('加入並選取', add, 'big primary'),
      own.length > 0 && h('div', { class: 'field' },
        h('div', { class: 'stepper-label' }, '你新增的器材'),
        own.map((option) => h('div', { class: 'row-between option-row' },
          h('span', { class: 'row-wrap' }, equipmentIcon(option.name), option.name),
          holdButton('移除', () => {
            store.save('options', { ...option, deleted: true });
            close();
            onAdded(null);
            toast(`已移除 ${option.name}，過去的紀錄不受影響`, {
              label: '復原',
              run: () => { store.save('options', { ...option, deleted: false }); onAdded(null); },
            });
          }, 'ghost danger-text')))));
  });
}

/**
 * A tap picks; a second tap clears it, because bodyweight and machines have no equipment to choose.
 * onPick(equipment, band); onPick(null) only redraws after the teacher's own list changed.
 */
export function equipmentControl(row, onPick) {
  const names = chooserOptions(EQUIPMENT, addedEquipment().map((o) => o.name), row.equipment ? [row.equipment] : []);
  return h('div', { class: 'stack-sm equipment' },
    h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, '器材'),
      h('div', { class: 'equip-grid' },
        names.map((name) => h('button', {
          type: 'button',
          class: 'btn equip-btn',
          'aria-pressed': row.equipment === name ? 'true' : 'false',
          onclick: () => {
            if (row.equipment === name) onPick('', '');
            else onPick(name, name === BAND ? row.band || '' : '');
          },
        }, equipmentIcon(name), h('span', {}, name))),
        h('button', {
          type: 'button',
          class: 'btn equip-btn equip-add',
          'aria-label': '新增器材',
          onclick: () => addEquipmentSheet((name) => (name ? onPick(name, '') : onPick(null))),
        }, h('span', { class: 'equip-plus', 'aria-hidden': 'true' }, '＋'), h('span', {}, '新增')))),
    row.equipment === BAND && h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, '彈力帶顏色'),
      h('div', { class: 'chips chips-5' }, BAND_COLORS.map((color, index) => h('button', {
        type: 'button',
        class: 'btn chip-btn band-chip',
        'aria-pressed': row.band === color ? 'true' : 'false',
        onclick: () => onPick(BAND, row.band === color ? '' : color),
      }, h('span', { class: `band-dot band-${index}`, 'aria-hidden': 'true' }), color)))));
}
