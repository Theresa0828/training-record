// One line chart per exercise. Tapping a point shows that class in the line above the chart.
import { h } from './dom.js';
import { trendScale } from './core.js';

const NS = 'http://www.w3.org/2000/svg';
const HEIGHT = 172;
const LEFT = 36;
const RIGHT = 14;
const TOP = 12;
const BOTTOM = 26;

function svg(tag, attrs, text) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  if (text !== undefined) el.textContent = text;
  return el;
}

const days = (date) => Date.parse(`${date}T00:00:00Z`) / 86400000;
const shortDate = (date) => date.slice(5).replace('-', '/');

export function trendChart(name, points, available = Math.min(window.innerWidth, 760) - 64) {
  // A bodyweight exercise has no weight to follow, so its chart follows the reps.
  const byReps = points.every((p) => !p.weight);
  const unit = byReps ? '下' : 'kg';
  const value = (p) => (byReps ? p.reps : p.weight);
  const describe = (p) => (byReps ? `${shortDate(p.date)}：${p.reps} 下` : `${shortDate(p.date)}：${p.weight} kg × ${p.reps} 下`);
  const first = points[0];
  const last = points[points.length - 1];
  const change = value(last) - value(first);

  const width = available;
  const { low, high, ticks } = trendScale(points.map(value));
  const start = days(first.date);
  const span = days(last.date) - start || 1;
  const x = (p) => LEFT + ((days(p.date) - start) / span) * (width - LEFT - RIGHT);
  const y = (v) => TOP + (1 - (v - low) / (high - low)) * (HEIGHT - TOP - BOTTOM);

  const chart = svg('svg', { viewBox: `0 0 ${width} ${HEIGHT}`, class: 'trend-chart', role: 'group', 'aria-label': `${name}，${points.map(describe).join('，')}` });
  for (const tick of ticks) {
    chart.append(
      svg('line', { x1: LEFT, x2: width - RIGHT, y1: y(tick), y2: y(tick), class: 'trend-grid' }),
      svg('text', { x: LEFT - 8, y: y(tick) + 4, 'text-anchor': 'end', class: 'trend-axis' }, String(tick)),
    );
  }
  chart.append(
    svg('text', { x: LEFT, y: HEIGHT - 6, class: 'trend-axis' }, shortDate(first.date)),
    svg('text', { x: width - RIGHT, y: HEIGHT - 6, 'text-anchor': 'end', class: 'trend-axis' }, shortDate(last.date)),
    svg('polyline', { points: points.map((p) => `${x(p)},${y(value(p))}`).join(' '), class: 'trend-line' }),
  );

  const readout = h('p', { class: 'trend-readout' });
  const dots = points.map((p) => svg('circle', { cx: x(p), cy: y(value(p)), r: 4, class: 'trend-dot' }));
  chart.append(...dots);
  const select = (index) => {
    readout.textContent = describe(points[index]);
    dots.forEach((dot, i) => {
      dot.setAttribute('r', i === index ? 7 : 4);
      dot.classList.toggle('is-on', i === index);
    });
  };
  // Each point owns the space up to halfway to its neighbours, so a finger never has to hit the dot itself.
  points.forEach((p, i) => {
    const from = i === 0 ? 0 : (x(points[i - 1]) + x(p)) / 2;
    const to = i === points.length - 1 ? width : (x(p) + x(points[i + 1])) / 2;
    const hit = svg('rect', { x: from, y: 0, width: to - from, height: HEIGHT, class: 'trend-hit', 'data-tap': '', role: 'button', tabindex: 0, 'aria-label': describe(p) });
    hit.addEventListener('click', () => select(i));
    hit.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      e.preventDefault();
      select(i);
    });
    chart.append(hit);
  });
  select(points.length - 1);

  return h('section', { class: 'trend-card' },
    h('div', { class: 'trend-head' },
      h('h3', { class: 'trend-name' }, name),
      h('span', { class: 'trend-now' }, String(value(last)), h('small', {}, ` ${unit}`))),
    h('p', { class: 'trend-change' }, change === 0
      ? `最近 ${points.length} 次持平`
      : `最近 ${points.length} 次${change > 0 ? '增加' : '減少'} ${Math.abs(change)} ${unit}`),
    chart,
    readout);
}
