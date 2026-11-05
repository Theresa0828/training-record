// Made-up students for trying the app before connecting Google. Never sent to Drive.
import * as store from './store.js';
import { dateKey, makeRow, setPainMap } from './core.js';

const DEMO_PILATES = [
  { id: 'demo_ex_1', name: 'Footwork', group: 'Reformer', kind: 'pilates' },
  { id: 'demo_ex_2', name: 'Hundred', group: 'Reformer', kind: 'pilates' },
  { id: 'demo_ex_3', name: 'Elephant', group: 'Reformer', kind: 'pilates' },
  { id: 'demo_ex_4', name: 'Swan', group: 'Arc Barrel', kind: 'pilates' },
];

function strength(name) {
  return store.all('exercises').find((e) => e.name === name);
}

function dayOffset(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return dateKey(date);
}

function doneRow(exercise, weight, reps, sets = 3) {
  const row = makeRow(exercise, sets, { weight, reps });
  row.sets.forEach((set) => { set.done = true; });
  row.rpe = 7;
  return row;
}

function session(id, studentId, date, kind, rows, extra = {}) {
  return {
    id, studentId, date, kind, rows, demo: true, status: 'done', finishedAt: `${date}T12:00`, updatedAt: 1,
    bpSys: 118, bpDia: 76, hr: 72, flags: {}, tags: [], note: '', coachSigned: true, studentSignature: null, ...extra,
  };
}

export function loadDemo() {
  for (const exercise of DEMO_PILATES) store.saveFromSync('exercises', { ...exercise, demo: true, updatedAt: 1 });

  store.saveFromSync('students', {
    id: 'demo_s1', name: '示範學員 A', aliases: [], demo: true, updatedAt: 1,
    goal: '能無痛爬樓梯、增加下肢肌力', contraindications: '左膝半月板術後，避免深屈膝超過 90 度',
    nextNotes: '上次分腿蹲時左膝內夾，先用輕重量確認',
    bodyComp: [
      { date: dayOffset(-100), weight: 63.4, fat: 28.2, muscle: 23.1 },
      { date: dayOffset(-10), weight: 62.6, fat: 26.9, muscle: 23.8 },
    ],
  });
  store.saveFromSync('students', {
    id: 'demo_s2', name: '示範學員 B', aliases: [], demo: true, updatedAt: 1,
    goal: '改善久坐下背緊繃', contraindications: '腰椎第四、五節椎間盤突出，避免負重屈曲',
    nextNotes: 'Elephant 時留意是否腰代償',
  });
  store.saveFromSync('students', { id: 'demo_s3', name: '示範學員 C', aliases: [], demo: true, updatedAt: 1, goal: '', contraindications: '', nextNotes: '' });

  const squat = strength('高腳杯深蹲');
  const row1 = strength('坐姿划船');
  const split = strength('分腿蹲');
  const press = strength('肩推');
  const makeStrength = (w1, w2, painScore) => {
    const fallback = { id: 'demo_ex_s', name: '深蹲', kind: 'strength' };
    const rows = [doneRow(squat || fallback, w1, 10), doneRow(row1 || fallback, w2, 12), doneRow(split || fallback, 8, 8), doneRow(press || fallback, 6, 10)];
    rows[0].equipment = '壺鈴';
    rows[2].equipment = '啞鈴';
    rows[3].equipment = '啞鈴';
    if (painScore) {
      setPainMap(rows[2], { 左膝: painScore });
      rows[2].painNote = '下蹲到底時才痛';
      rows[2].tags = ['膝代償'];
      rows[2].sets[2].done = false;
    }
    return rows;
  };
  store.saveFromSync('sessions', session('demo_a3', 'demo_s1', dayOffset(-35), 'strength', makeStrength(12, 25), { classNo: 2, packageSize: 12 }));
  store.saveFromSync('sessions', session('demo_a4', 'demo_s1', dayOffset(-28), 'strength', makeStrength(14, 27.5), { classNo: 3, packageSize: 12 }));
  store.saveFromSync('sessions', session('demo_a5', 'demo_s1', dayOffset(-21), 'strength', makeStrength(14, 30), { classNo: 4, packageSize: 12 }));
  store.saveFromSync('sessions', session('demo_a1', 'demo_s1', dayOffset(-14), 'strength', makeStrength(16, 30), { classNo: 5, packageSize: 12 }));
  store.saveFromSync('sessions', session('demo_a2', 'demo_s1', dayOffset(-7), 'strength', makeStrength(16, 30, 3), { bpSys: 124, bpDia: 82, flags: { sleep: true }, classNo: 6, packageSize: 12 }));

  const pilatesRow = (exercise, spring, reps) => {
    const row = makeRow(exercise, 2, { spring, reps });
    row.sets.forEach((set) => { set.done = true; });
    row.quality = 4;
    row.assist = '少';
    return row;
  };
  store.saveFromSync('sessions', session('demo_b1', 'demo_s2', dayOffset(-5), 'pilates', [
    pilatesRow(DEMO_PILATES[0], '2r1b m', 10), pilatesRow(DEMO_PILATES[1], '1r1b', 10),
    pilatesRow(DEMO_PILATES[2], '1r1y', 8), pilatesRow(DEMO_PILATES[3], '', 6),
  ], { classNo: 23, packageSize: 24 }));

  const today = dayOffset(0);
  store.replaceEvents([
    { id: 'demo_e1', date: today, time: '10:00', student: '示範學員 A', kind: 'strength', demo: true },
    { id: 'demo_e2', date: today, time: '11:00', student: '示範學員 B', kind: 'pilates', demo: true },
    { id: 'demo_e3', date: today, time: '14:00', student: '示範學員 C', kind: 'strength', demo: true },
    { id: 'demo_e4', date: dayOffset(2), time: '10:00', student: '示範學員 A', kind: 'strength', demo: true },
  ]);
  store.setMeta('demoLoaded', true);
}

export function clearDemo() {
  for (const collection of ['students', 'exercises', 'sessions', 'plans', 'events']) {
    for (const record of store.all(collection)) {
      if (record.demo) store.removeLocal(collection, record.id);
    }
  }
  store.setMeta('demoLoaded', false);
}
