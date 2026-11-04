// The tap-to-choose body figures, front and back. Shapes are drawn for the viewer's left side and mirrored.
const NS = 'http://www.w3.org/2000/svg';
const VIEW_BOX = '10 0 180 424';
const CENTER = 100;
const WIDEN = 1.2; // Broader than life, so an arm or a knee is big enough for a fingertip.
const CORNER = 5;

const HEAD = 'M100 6C114 6 122 16 122 28C122 40 113 48 100 48C87 48 78 40 78 28C78 16 86 6 100 6Z';
const SHAPES = {
  neck: [[90, 50], [110, 50], [113, 67], [87, 67]],
  chest: [[87, 69], [113, 69], [128, 74], [126, 128], [74, 128], [72, 74]],
  belly: [[74, 130], [126, 130], [124, 176], [76, 176]],
  pelvis: [[87, 178], [113, 178], [112, 210], [100, 220], [88, 210]],
  hip: [[76, 178], [85, 178], [86, 214], [70, 226], [64, 208]],
  buttock: [[76, 178], [99, 178], [99, 222], [84, 218], [70, 226], [64, 208]],
  shoulder: [[85, 68], [68, 72], [55, 79], [49, 90], [46, 108], [67, 110], [70, 90]],
  upperArm: [[46, 110], [67, 112], [63, 158], [42, 156]],
  elbow: [[42, 158], [63, 160], [61, 182], [38, 180]],
  forearm: [[38, 182], [61, 184], [53, 228], [36, 226]],
  wrist: [[36, 228], [53, 230], [52, 254], [45, 270], [33, 266], [31, 246]],
  thigh: [[70, 228], [85, 220], [98, 226], [95, 302], [69, 302]],
  knee: [[69, 304], [95, 304], [94, 336], [70, 336]],
  shin: [[70, 338], [94, 338], [90, 392], [75, 392]],
  ankle: [[75, 394], [90, 394], [92, 418], [64, 418], [71, 408]],
};

/** Draws a polygon with its corners softened. */
function rounded(points) {
  const wide = points.map(([x, y]) => [CENTER + (x - CENTER) * WIDEN, y]);
  const toward = (from, to) => {
    const length = Math.hypot(to[0] - from[0], to[1] - from[1]);
    const t = Math.min(CORNER, length / 2) / length;
    return [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t];
  };
  return wide.map((point, i) => {
    const before = toward(point, wide[(i + wide.length - 1) % wide.length]);
    const after = toward(point, wide[(i + 1) % wide.length]);
    return `${i ? 'L' : 'M'}${before[0].toFixed(1)} ${before[1].toFixed(1)}Q${point[0].toFixed(1)} ${point[1]} ${after[0].toFixed(1)} ${after[1].toFixed(1)}`;
  }).join('') + 'Z';
}

const FIGURES = [
  {
    label: '正面',
    eyes: true,
    near: '右',
    far: '左',
    center: [['頭', 'head'], ['頸', 'neck'], ['胸', 'chest'], ['腹', 'belly'], ['骨盆', 'pelvis']],
    sides: [['肩', 'shoulder'], ['上臂', 'upperArm'], ['肘', 'elbow'], ['前臂', 'forearm'], ['腕', 'wrist'], ['髖', 'hip'], ['大腿前', 'thigh'], ['膝', 'knee'], ['小腿前', 'shin'], ['踝', 'ankle']],
  },
  {
    label: '背面',
    near: '左',
    far: '右',
    center: [['頭', 'head'], ['頸', 'neck'], ['上背', 'chest'], ['下背', 'belly']],
    sides: [['肩', 'shoulder'], ['上臂', 'upperArm'], ['肘', 'elbow'], ['前臂', 'forearm'], ['腕', 'wrist'], ['臀', 'buttock'], ['大腿後', 'thigh'], ['膝', 'knee'], ['小腿後', 'shin'], ['踝', 'ankle']],
  },
];

function svg(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text) el.textContent = text;
  return el;
}

function centerOf(shape, mirror) {
  if (shape === 'head') return [100, 40];
  const points = SHAPES[shape];
  const x = CENTER + (points.reduce((sum, p) => sum + p[0], 0) / points.length - CENTER) * WIDEN;
  const y = points.reduce((sum, p) => sum + p[1], 0) / points.length;
  return [mirror ? 200 - x : x, y];
}

function figure({ label, near, far, center, sides, eyes }, onToggle) {
  const root = svg('svg', { viewBox: VIEW_BOX, class: 'body-figure', role: 'group', 'aria-label': label });
  root.append(svg('text', { x: 14, y: 18, class: 'body-side' }, near), svg('text', { x: 186, y: 18, 'text-anchor': 'end', class: 'body-side' }, far));
  const part = (name, shape, mirror) => {
    const path = svg('path', { d: shape === 'head' ? HEAD : rounded(SHAPES[shape]), class: 'body-part', 'data-tap': '', 'data-part': name, role: 'button', tabindex: 0, 'aria-label': name });
    if (mirror) path.setAttribute('transform', 'matrix(-1 0 0 1 200 0)');
    path.addEventListener('click', () => onToggle(name));
    path.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      onToggle(name);
    });
    const [x, y] = centerOf(shape, mirror);
    scores.push(svg('text', { x, y: y + 5, 'text-anchor': 'middle', class: 'body-score', 'data-score': name }));
    return path;
  };
  const scores = [];
  for (const [name, shape] of center) root.append(part(name, shape, false));
  for (const [name, shape] of sides) root.append(part(near + name, shape, false), part(far + name, shape, true));
  if (eyes) root.append(svg('circle', { cx: 91, cy: 25, r: 2.6, class: 'body-eye' }), svg('circle', { cx: 109, cy: 25, r: 2.6, class: 'body-eye' }));
  root.append(...scores);
  return root;
}

/** Returns the two figures. update(scores, active) lights each marked part and writes its score on it; a joint shows on both. */
export function bodyMap(onTap) {
  const figures = FIGURES.map((data) => {
    const wrap = document.createElement('div');
    wrap.className = 'body-view';
    const caption = document.createElement('div');
    caption.className = 'body-caption';
    caption.textContent = data.label;
    wrap.append(caption, figure(data, onTap));
    return wrap;
  });
  const el = document.createElement('div');
  el.className = 'body-map';
  el.append(...figures);
  const parts = [...el.querySelectorAll('.body-part')];
  const labels = [...el.querySelectorAll('.body-score')];
  const update = (scores, active) => {
    for (const path of parts) {
      const name = path.getAttribute('data-part');
      const on = name in scores;
      path.classList.toggle('is-on', on);
      path.classList.toggle('is-active', name === active);
      path.setAttribute('aria-pressed', on ? 'true' : 'false');
      path.setAttribute('aria-label', on && scores[name] !== null ? `${name} ${scores[name]} 分` : name);
    }
    for (const label of labels) {
      const score = scores[label.getAttribute('data-score')];
      label.textContent = score === null || score === undefined ? '' : String(score);
    }
  };
  return { el, update };
}
