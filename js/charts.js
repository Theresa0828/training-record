// Small charts for the overview. Each one has a different shape, so a glance tells them apart.
import { h } from './dom.js';

const NS = 'http://www.w3.org/2000/svg';

function svg(tag, attrs = {}, ...kids) {
  const el = document.createElementNS(NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
  el.append(...kids);
  return el;
}

function arc(cx, cy, r, from, to) {
  const point = (angle) => [cx + r * Math.cos(angle), cy + r * Math.sin(angle)];
  const [x1, y1] = point(from);
  const [x2, y2] = point(to);
  return `M ${x1} ${y1} A ${r} ${r} 0 ${to - from > Math.PI ? 1 : 0} 1 ${x2} ${y2}`;
}

/** The term as a ring with one piece per class: finished, the next one, and those still to come. */
export function termRing(no, size, withNumber = true) {
  const chart = svg('svg', { viewBox: '0 0 96 96', class: 'term-ring', role: 'img', 'aria-label': `第 ${no} 堂，共 ${size} 堂` });
  const gap = size > 12 ? 0.07 : 0.1;
  const piece = (Math.PI * 2) / size;
  for (let i = 0; i < size; i++) {
    const from = -Math.PI / 2 + i * piece + gap / 2;
    const state = i + 1 < no ? 'is-done' : i + 1 === no ? 'is-now' : '';
    chart.append(svg('path', { d: arc(48, 48, 41, from, from + piece - gap), class: `term-piece ${state}` }));
  }
  if (withNumber) {
    const number = svg('text', { x: 48, y: 58, 'text-anchor': 'middle', class: 'term-number' });
    number.textContent = no;
    chart.append(number);
  }
  return chart;
}

/** The next class as a tear-off calendar page. */
export function calendarPage(date) {
  if (!date) return h('div', { class: 'cal-page is-empty', 'aria-hidden': 'true' }, h('span', { class: 'cal-month' }, '未約'), h('span', { class: 'cal-day' }, '?'), h('span', { class: 'cal-week' }, ' '));
  const [y, m, d] = date.split('-').map(Number);
  const week = '日一二三四五六'[new Date(y, m - 1, d).getDay()];
  return h('div', { class: 'cal-page', 'aria-hidden': 'true' },
    h('span', { class: 'cal-month' }, `${m} 月`),
    h('span', { class: 'cal-day' }, d),
    h('span', { class: 'cal-week' }, `週${week}`));
}

/** A line with no axes, for following a change. The last value is marked because it is the one that matters. */
export function sparkline(values, label) {
  const W = 120;
  const H = 36;
  const PAD = 6;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const x = (i) => (values.length > 1 ? PAD + (i / (values.length - 1)) * (W - PAD * 2) : W / 2);
  const y = (v) => (max === min ? H / 2 : H - PAD - ((v - min) / (max - min)) * (H - PAD * 2));
  return svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'spark', role: 'img', 'aria-label': label },
    svg('polyline', { points: values.map((v, i) => `${x(i)},${y(v)}`).join(' '), class: 'spark-line' }),
    svg('circle', { cx: x(values.length - 1), cy: y(values.at(-1)), r: 4, class: 'spark-dot' }));
}

/** One bar per class on a fixed 0 to 10 scale, so a score of 3 always looks like a 3. */
export function painBars(scores, label) {
  const W = 120;
  const H = 36;
  const bar = W / Math.max(scores.length, 8);
  const chart = svg('svg', { viewBox: `0 0 ${W} ${H}`, class: 'pain-bars', role: 'img', 'aria-label': label });
  scores.forEach((score, i) => {
    const height = score ? Math.max(4, (score / 10) * H) : 2;
    chart.append(svg('rect', {
      x: W - (scores.length - i) * bar + 1,
      y: H - height,
      width: bar - 2,
      height,
      rx: score ? 2 : 1,
      class: score ? 'pain-bar' : 'pain-bar is-zero',
    }));
  });
  return chart;
}

/** A horizontal bar: how much of a body part or apparatus has been learned. */
export function learnedBar(label, learned, total) {
  const fill = h('span', { class: 'learn-fill' });
  fill.style.width = `${total ? Math.min(100, (learned / total) * 100) : 0}%`;
  return h('div', { class: 'learn-row', role: 'img', 'aria-label': `${label} 學了 ${learned} 個，共 ${total} 個` },
    h('span', { class: 'learn-name' }, label),
    h('span', { class: 'learn-track' }, fill),
    h('span', { class: 'learn-count' }, `${learned}/${total}`));
}

/** Five dots for the Pilates quality score. */
export function qualityDots(value) {
  const dots = [1, 2, 3, 4, 5].map((n) => h('span', { class: `quality-dot${value >= n - 0.25 ? ' is-on' : ''}` }));
  return h('span', { class: 'quality-dots', role: 'img', 'aria-label': `動作品質平均 ${value} 分，滿分 5` }, dots);
}
