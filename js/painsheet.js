// Marking pain on the front and back body: each part gets its own 0–10 score, written on the figure.
// Used for one exercise in class, for how the student felt on arrival, and in the student's profile.
import { h, button, holdButton, openSheet, toast } from './dom.js';
import { icon } from './icons.js';
import { painList, painText } from './core.js';
import { bodyMap } from './bodymap.js';

/** The part → score map of anything that holds pain (an exercise row, a day's check-in, a profile). */
export function painScores(target) {
  return Object.fromEntries(painList(target || {}).filter((p) => p.part).map((p) => [p.part, p.score]));
}

/**
 * Opens the body map. Every tap is saved at once through onScores; each part's note through onPartNotes
 * (2026-11-23), the note for no part in particular through onNote.
 * Taking a part off needs the held button, takes its note with it, and leaves an undo.
 * Nothing waits for 完成 (2026-11-26, 疼痛輸入修改也要可以自動儲存): a line says each change is kept, and closing the
 * sheet any way at all (完成, 關閉) runs onDone, so the screen behind shows the new pain at once.
 * `previous` ({ label, lines, scores, notes }) is the pain recorded last time (2026-11-27): it shows in a light colour under
 * today's, with one tap to bring its parts in for new scores, or to mark them all 0 when nothing hurts today.
 */
export function openPainSheet(title, {
  scores: initial = {}, partNotes: initialNotes = {}, note = '', notePlaceholder = '例如：下蹲到底才痛、刺痛',
  previous = null, onScores, onPartNotes, onNote, onDone,
}) {
  const scores = { ...initial };
  const notes = Object.fromEntries(Object.entries(initialNotes || {}).filter(([part, text]) => part in scores && String(text || '').trim()));
  const status = h('p', { class: 'muted small autosave-status', role: 'status' }, '改了會自動儲存，不用按完成。');
  const saved = () => { status.textContent = '已自動儲存'; };
  const saveNotes = () => { onPartNotes?.({ ...notes }); saved(); };
  let active = Object.keys(scores).at(-1) || null;
  const save = () => { onScores({ ...scores }); saved(); };
  openSheet(title, (close) => {
    const picked = h('div', { class: 'body-picked' });
    const keypad = h('div', {});
    const remove = (part) => {
      const score = scores[part];
      const text = notes[part];
      delete scores[part];
      delete notes[part];
      active = Object.keys(scores).at(-1) || null;
      save();
      if (text) saveNotes();
      draw();
      toast(`已移除 ${part}`, { label: '復原', run: () => {
        scores[part] = score;
        if (text) notes[part] = text;
        active = part;
        save();
        if (text) saveNotes();
        draw();
      } });
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
    const before = previous && Object.keys(previous.scores || {}).length ? previous : null;
    const prevBox = h('div', { class: 'pain-previous' });
    // Last time's parts with new scores to give; the first one is ready for its score.
    const bringIn = () => {
      const missing = Object.keys(before.scores).filter((part) => !(part in scores));
      for (const part of missing) scores[part] = null;
      active = missing[0] || active;
      save();
      draw();
    };
    // Nothing hurts today: last time's parts are written down as 0, so the change shows on the record.
    const noPain = () => {
      for (const part of Object.keys(before.scores)) scores[part] = 0;
      active = null;
      save();
      draw();
    };
    const drawPrevious = () => {
      if (!before) return;
      const missing = Object.keys(before.scores).some((part) => !(part in scores));
      const notesText = Object.entries(before.notes || {}).filter(([part, text]) => part in before.scores && String(text || '').trim())
        .map(([part, text]) => `${part}：${String(text).trim()}`).join('；');
      prevBox.replaceChildren(
        h('div', { class: 'pain-previous-text' },
          h('span', { class: 'stepper-label' }, before.label),
          ...(before.lines || [painText({ painMap: before.scores })]).map((line) => h('strong', {}, line)),
          notesText && h('span', { class: 'muted small' }, notesText)),
        h('div', { class: 'pain-previous-actions' },
          // 完成 stays the one main button (P-1); these two are the usual answers, side by side.
          missing && button('帶入上次的部位', bringIn, ''),
          !Object.keys(scores).length && button('今天都不痛', noPain, '')));
    };
    const noteInput = h('textarea', { class: 'input pain-note', placeholder: '不屬於單一部位的，例如：整天都很緊', 'aria-label': '其他疼痛附註', oninput: () => { onNote(noteInput.value); saved(); } });
    noteInput.value = note || '';
    const drawChips = () => {
      picked.replaceChildren(...(Object.keys(scores).length
        ? Object.entries(scores).map(([part, score]) => {
          const label = score === null ? part : `${part} ${score}`;
          return button(notes[part] ? [label, icon('pencil')] : label, () => { active = part; draw(); }, 'chip-btn', {
            'aria-pressed': part === active ? 'true' : 'false',
            'aria-label': notes[part] ? `${label}，有附註` : label,
          });
        })
        : [h('p', { class: 'muted' }, '點圖上會痛的地方，再選分數')]));
    };
    const draw = () => {
      // Last time's pain shows only where nothing is marked today, so today's score is the one written on a part.
      map.update(scores, active, before ? Object.fromEntries(Object.entries(before.scores).filter(([part]) => !(part in scores))) : {});
      drawChips();
      drawPrevious();
      const partNote = active && h('textarea', {
        class: 'input pain-note', placeholder: notePlaceholder, 'aria-label': `${active} 的附註`,
        oninput: () => {
          const had = !!notes[active];
          if (partNote.value.trim()) notes[active] = partNote.value;
          else delete notes[active];
          saveNotes();
          // The chip's note mark appears or goes as soon as the first letter is typed or the last one erased.
          if (had !== !!notes[active]) drawChips();
        },
      });
      if (partNote) partNote.value = notes[active] || '';
      keypad.replaceChildren(active ? h('div', { class: 'field' },
        h('div', { class: 'row-between' },
          h('div', { class: 'pain-target' }, `${active} 的疼痛分數`),
          holdButton('移除這個部位', () => remove(active), 'ghost danger-text')),
        h('div', { class: 'chips chips-11' }, [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((value) => button(String(value), () => {
          scores[active] = value;
          save();
          draw();
        }, 'chip-btn', { 'aria-pressed': scores[active] === value ? 'true' : 'false' }))),
        h('div', { class: 'stepper-label' }, `${active} 的附註`),
        partNote) : '');
    };
    draw();
    return h('div', { class: 'stack' }, status, before && prevBox, map.el,
      before && h('div', { class: 'body-legend', 'aria-hidden': 'true' },
        h('span', {}, h('i', { class: 'is-pain' }), '上次'), h('span', {}, h('i', { class: 'is-today' }), '今天')),
      picked, keypad,
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '其他附註（不分部位）'), noteInput),
      button('完成', close, 'big primary'));
  }, { onClose: () => onDone?.() });
}
