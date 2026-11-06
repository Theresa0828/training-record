// Marking pain on the front and back body: each part gets its own 0–10 score, written on the figure.
// Used for one exercise in class, for how the student felt on arrival, and in the student's profile.
import { h, button, holdButton, openSheet, toast } from './dom.js';
import { painList } from './core.js';
import { bodyMap } from './bodymap.js';

/** The part → score map of anything that holds pain (an exercise row, a day's check-in, a profile). */
export function painScores(target) {
  return Object.fromEntries(painList(target || {}).filter((p) => p.part).map((p) => [p.part, p.score]));
}

/**
 * Opens the body map. Every tap is saved at once through onScores; the note through onNote.
 * Taking a part off needs the held button, and leaves an undo.
 */
export function openPainSheet(title, { scores: initial = {}, note = '', notePlaceholder = '例如：下蹲到底才痛、刺痛', onScores, onNote, onDone }) {
  const scores = { ...initial };
  let active = Object.keys(scores).at(-1) || null;
  const save = () => onScores({ ...scores });
  openSheet(title, (close) => {
    const picked = h('div', { class: 'body-picked' });
    const keypad = h('div', {});
    const remove = (part) => {
      const score = scores[part];
      delete scores[part];
      active = Object.keys(scores).at(-1) || null;
      save();
      draw();
      toast(`已移除 ${part}`, { label: '復原', run: () => { scores[part] = score; active = part; save(); draw(); } });
    };
    // The first tap marks a part and a tap on another marked part moves to it. Taking one off needs the held button.
    const tapPart = (part) => {
      if (part === active) return;
      if (!(part in scores)) {
        scores[part] = null;
        save();
      }
      active = part;
      draw();
    };
    const map = bodyMap(tapPart);
    const noteInput = h('textarea', { class: 'input pain-note', placeholder: notePlaceholder, 'aria-label': '疼痛附註', oninput: () => onNote(noteInput.value) });
    noteInput.value = note || '';
    const draw = () => {
      map.update(scores, active);
      picked.replaceChildren(...(Object.keys(scores).length
        ? Object.entries(scores).map(([part, score]) => button(score === null ? part : `${part} ${score}`, () => { active = part; draw(); }, 'chip-btn', { 'aria-pressed': part === active ? 'true' : 'false' }))
        : [h('p', { class: 'muted' }, '點圖上會痛的地方，再選分數')]));
      keypad.replaceChildren(active ? h('div', { class: 'field' },
        h('div', { class: 'row-between' },
          h('div', { class: 'pain-target' }, `${active} 的疼痛分數`),
          holdButton('移除這個部位', () => remove(active), 'ghost danger-text')),
        h('div', { class: 'chips chips-11' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => button(String(value), () => {
          scores[active] = value;
          save();
          draw();
        }, 'chip-btn', { 'aria-pressed': scores[active] === value ? 'true' : 'false' })))) : '');
    };
    draw();
    return h('div', { class: 'stack' }, map.el, picked, keypad,
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '疼痛附註'), noteInput),
      button('完成', () => { close(); onDone?.(); }, 'big primary'));
  });
}
