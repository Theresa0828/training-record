// Line icons and the few drawings the app uses. One stroke weight with round ends, to match the rounded type.
const NS = 'http://www.w3.org/2000/svg';

const PATHS = {
  back: 'M15 5l-7 7 7 7',
  next: 'M9 5l7 7-7 7',
  arrow: 'M4 12h15M13 6l6 6-6 6',
  swap: 'M7 4L3 8l4 4M3 8h15M17 12l4 4-4 4M21 16H6',
  undo: 'M8 5L4 9l4 4M4 9h10a6 6 0 010 12h-3',
  today: 'M4 8a2 2 0 012-2h12a2 2 0 012 2v11a2 2 0 01-2 2H6a2 2 0 01-2-2zM4 11h16M8 3v4M16 3v4',
  people: 'M9 11a4 4 0 100-8 4 4 0 000 8zM2 21c0-4 3-7 7-7s7 3 7 7M16 3.5a4 4 0 010 7.5M18.5 14.5c2.2 1 3.5 3.4 3.5 6.5',
  dumbbell: 'M3 10v4M6.5 7v10M17.5 7v10M21 10v4M6.5 12h11',
  gear: 'M12 15a3 3 0 100-6 3 3 0 000 6zM12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M18.4 5.6l-2.1 2.1M7.7 16.3l-2.1 2.1',
  check: 'M5 12.5l4.5 4.5L19 7.5',
  warn: 'M12 4l9 16H3zM12 10v4M12 17.5v.1',
  sync: 'M4 12a8 8 0 0113.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 01-13.7 5.7L4 15.5M4 20v-4.5h4.5',
  plus: 'M12 5v14M5 12h14',
  clock: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
};

export function icon(name, className = '') {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', `icon ${className}`.trim());
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', PATHS[name]);
  svg.append(path);
  return svg;
}

/** Share of sets completed, drawn as a ring with the number inside. */
export function ring(percent) {
  const RADIUS = 26;
  const length = 2 * Math.PI * RADIUS;
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 64 64');
  svg.setAttribute('class', 'ring');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `完成 ${percent}%`);
  const circle = (className) => {
    const c = document.createElementNS(NS, 'circle');
    c.setAttribute('cx', 32);
    c.setAttribute('cy', 32);
    c.setAttribute('r', RADIUS);
    c.setAttribute('class', className);
    return c;
  };
  const value = circle('ring-value');
  value.setAttribute('stroke-dasharray', `${(length * percent) / 100} ${length}`);
  const text = document.createElementNS(NS, 'text');
  text.setAttribute('x', 32);
  text.setAttribute('y', 37);
  text.setAttribute('text-anchor', 'middle');
  text.textContent = `${percent}%`;
  svg.append(circle('ring-track'), value, text);
  return svg;
}

/** A Reformer in side view, for screens with nothing on them yet. */
export function reformer() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 240 96');
  svg.setAttribute('class', 'drawing');
  svg.setAttribute('aria-hidden', 'true');
  const shapes = [
    'M16 66h208',
    'M28 66v14M212 66v14',
    'M84 50h74a4 4 0 014 4v8H80v-8a4 4 0 014-4z',
    'M92 50v-8a4 4 0 014-4h8M150 50v-8',
    'M28 66V30a6 6 0 0112 0v36',
    'M40 40h26',
    'M162 58l8-4 6 8 6-8 6 8 6-8 6 8 6-8',
    'M212 66V44',
  ];
  for (const d of shapes) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}
