// Pure logic with no DOM or storage access, so it can run under `node --test`.

export const MAX_SETS = 5;
export const DEFAULT_TAGS = ['左肩痛', '腰代償', '脖子代償', '肩胛代償', '膝代償', '角度不夠', '太重', '太輕', '縮小腹太多'];
export const DEFAULT_PROPS = ['滾筒', '彈力帶', '瑜珈球', 'Box'];
export const APPARATUS = ['Reformer', 'Cadillac', 'Chair', 'Mat', 'Arc Barrel', 'Spine Corrector'];
export const ASSIST_LEVELS = ['無', '少', '中', '多'];
export const SPRING_COLORS = ['r', 'b', 'y', 'g'];
export const SPRING_BARS = ['l', 'm', 'h'];

export function newId(prefix = 'x') {
  const random = Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${random}`;
}

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parses a booking title such as 老師名一對一器械皮拉提斯（學生名）【私人預約】.
 * Returns null when the booking is not this teacher's or has no student name.
 */
export function parseBookingTitle(title, teacher) {
  const text = String(title || '').trim();
  if (!teacher || !text.startsWith(teacher) || !text.includes('一對一')) return null;
  const match = text.match(/[（(]([^（）()]+)[）)]/);
  const student = match ? match[1].trim() : '';
  if (!student) return null;
  return { student, kind: text.includes('皮拉提斯') ? 'pilates' : 'strength' };
}

/** A title that belongs to this teacher but cannot be read, shown so no booking is silently lost. */
export function isUnreadableBooking(title, teacher) {
  const text = String(title || '').trim();
  return !!teacher && text.startsWith(teacher) && text.includes('一對一') && !parseBookingTitle(text, teacher);
}

export function findStudentByName(students, name) {
  const target = String(name || '').trim();
  return students.find((s) => !s.deleted && (s.name === target || (s.aliases || []).includes(target))) || null;
}

/** Normal means below both 120 systolic and 80 diastolic, as the teacher defined it. */
export function isBpFlagged(sys, dia) {
  return (Number(sys) >= 120) || (Number(dia) >= 80);
}

/**
 * How many digits complete a vital reading, so the keypad can move on by itself.
 * Readings that start with 1 or 2 are three digits for systolic. For diastolic
 * and heart rate only a leading 1 means three digits.
 */
export function expectedDigits(field, typed) {
  const first = String(typed)[0];
  if (field === 'sys') return first === '1' || first === '2' ? 3 : 2;
  return first === '1' ? 3 : 2;
}

export function makeSet(plan = {}) {
  return {
    planWeight: plan.planWeight ?? plan.weight ?? 0,
    planReps: plan.planReps ?? plan.reps ?? 10,
    planSpring: plan.planSpring ?? plan.spring ?? '',
    weight: plan.weight ?? plan.planWeight ?? 0,
    reps: plan.reps ?? plan.planReps ?? 10,
    spring: plan.spring ?? plan.planSpring ?? '',
    done: false,
  };
}

export function makeRow(exercise, setCount = 3, base = {}) {
  const sets = [];
  for (let i = 0; i < Math.min(setCount, MAX_SETS); i++) sets.push(makeSet(base));
  return {
    id: newId('row'),
    exerciseId: exercise.id,
    name: exercise.name,
    kind: exercise.kind,
    sets,
    rpe: null,
    painScore: null,
    painParts: [],
    painMap: {},
    painNote: '',
    quality: null,
    assist: null,
    props: [],
    tags: [],
  };
}

export function doneSessions(sessions, studentId) {
  return sessions
    .filter((s) => s.studentId === studentId && s.status === 'done' && !s.deleted)
    .sort((a, b) => (b.date + (b.finishedAt || 0)).localeCompare(a.date + (a.finishedAt || 0)));
}

/** Turns what was actually done into the next plan. Skipped sets keep their old plan values. */
export function rowsFromSession(session) {
  return session.rows.map((row) => ({
    id: newId('row'),
    exerciseId: row.exerciseId,
    name: row.name,
    kind: row.kind,
    sets: row.sets.map((set) => makeSet(set.done
      ? { weight: set.weight, reps: set.reps, spring: set.spring }
      : { weight: set.planWeight, reps: set.planReps, spring: set.planSpring })),
    rpe: null,
    painScore: null,
    painParts: [],
    painMap: {},
    painNote: '',
    quality: null,
    assist: null,
    props: (row.props || []).slice(),
    tags: [],
  }));
}

export function rowMetTarget(row) {
  return row.sets.length > 0 && row.sets.every((s) => s.done && s.reps >= s.planReps && s.weight >= s.planWeight);
}

/**
 * Strength only. Suggests a heavier load after two sessions in a row met the plan,
 * unless the latest one recorded any pain. The teacher always decides whether to use it.
 */
export function suggestProgression(exerciseId, history, step = 2.5) {
  const rows = [];
  for (const session of history) {
    const row = session.rows.find((r) => r.exerciseId === exerciseId);
    if (row) rows.push(row);
    if (rows.length === 2) break;
  }
  if (rows.length < 2) return null;
  const [latest, previous] = rows;
  if (latest.kind !== 'strength') return null;
  if (!rowMetTarget(latest) || !rowMetTarget(previous)) return null;
  if ((latest.painScore || 0) >= 1) return null;
  const weight = Math.max(...latest.sets.map((s) => s.weight));
  if (!weight) return null;
  return { from: weight, to: weight + step };
}

export function applySuggestion(row, suggestion) {
  for (const set of row.sets) {
    set.planWeight = suggestion.to;
    set.weight = suggestion.to;
  }
}

/** Starting rows for a new session: the saved plan first, otherwise a copy of last time. */
export function startingRows(plan, history) {
  if (plan && !plan.used && plan.rows && plan.rows.length) {
    return JSON.parse(JSON.stringify(plan.rows));
  }
  return history.length ? rowsFromSession(history[0]) : [];
}

/**
 * What to do with a class left open on an earlier day. Recorded work is kept as a
 * finished class, and a session opened by mistake with nothing recorded is discarded.
 */
export function resolveStaleDraft(session, today) {
  if (session.status !== 'draft' || session.date >= today) return null;
  const recorded = session.rows.some((row) => row.sets.some((s) => s.done))
    || session.bpSys || session.bpDia || session.hr || session.note;
  return recorded ? 'finish' : 'discard';
}

export function sessionSummary(session) {
  let planned = 0;
  let done = 0;
  for (const row of session.rows) {
    planned += row.sets.length;
    done += row.sets.filter((s) => s.done).length;
  }
  return { planned, done, percent: planned ? Math.round((done / planned) * 100) : 0 };
}

export function setLabel(row, set, useActual = true) {
  const weight = useActual ? set.weight : set.planWeight;
  const reps = useActual ? set.reps : set.planReps;
  const spring = useActual ? set.spring : set.planSpring;
  const first = row.kind === 'pilates' ? (spring || '—') : (weight ? String(weight) : '自體');
  return { first, reps: String(reps) };
}

/** Builds spring notation in the teacher's own format, such as 1r1b or 2r l. */
export function springToText(spring) {
  const counts = SPRING_COLORS.filter((c) => spring.counts[c] > 0).map((c) => `${spring.counts[c]}${c}`).join('');
  return spring.bar ? `${counts}${counts ? ' ' : ''}${spring.bar}` : counts;
}

export function springFromText(text) {
  const spring = { counts: { r: 0, b: 0, y: 0, g: 0 }, bar: '' };
  const value = String(text || '');
  for (const match of value.matchAll(/(\d+)([rbyg])/g)) spring.counts[match[2]] = Number(match[1]);
  const bar = value.match(/(?:^|\s)([lmh])\s*$/);
  if (bar) spring.bar = bar[1];
  return spring;
}

/** Keeps the newer copy of each record. Used on both the device and the Drive side. */
export function mergeRecords(existing, incoming) {
  const byId = new Map(existing.map((r) => [r.id, r]));
  const changed = [];
  for (const record of incoming) {
    const current = byId.get(record.id);
    if (!current || (record.updatedAt || 0) > (current.updatedAt || 0)) {
      byId.set(record.id, record);
      changed.push(record);
    }
  }
  return { records: [...byId.values()], changed };
}

export function fileForRecord(collection, record) {
  return collection === 'sessions' ? `sessions-${record.studentId}` : collection;
}

export function collectionForFile(file) {
  return file.startsWith('sessions-') ? 'sessions' : file;
}

/** Bookings from the calendar that have no unused plan yet, for the "needs planning" list. */
export function studentsNeedingPlan(events, students, plans, today) {
  const seen = new Set();
  const result = [];
  for (const event of events) {
    if (event.date < today) continue;
    const student = findStudentByName(students, event.student);
    if (!student || seen.has(student.id)) continue;
    seen.add(student.id);
    const plan = plans.find((p) => p.id === student.id);
    if (!plan || plan.used || !plan.rows || !plan.rows.length) result.push({ student, event });
  }
  return result;
}

/** Weight per session for the overview trend, oldest first. */
export function exerciseTrend(exerciseId, history, limit = 8) {
  const points = [];
  for (const session of history) {
    const row = session.rows.find((r) => r.exerciseId === exerciseId);
    if (!row) continue;
    const done = row.sets.filter((s) => s.done);
    if (done.length) points.push({ date: session.date, weight: Math.max(...done.map((s) => s.weight)), reps: Math.max(...done.map((s) => s.reps)) });
    if (points.length === limit) break;
  }
  return points.reverse();
}

/** Round axis values for a line chart: at most about three steps, never a flat range. */
export function trendScale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50, 100].find((s) => span / s <= 3) || Math.ceil(span / 3);
  let low = Math.floor(min / step) * step;
  let high = Math.ceil(max / step) * step;
  if (low === high) {
    low = Math.max(0, low - step);
    high += step;
  }
  const ticks = [];
  for (let tick = low; tick <= high; tick += step) ticks.push(tick);
  return { low, high, ticks };
}

/** What a chooser offers: the built-in names, the teacher's own, and anything already picked but since removed. */
export function chooserOptions(defaults, added, picked = []) {
  return [...new Set([...defaults, ...added, ...picked])];
}

/** Every painful part of a row with its own score. Rows saved before per-part scores share one score. */
export function painList(row) {
  const map = row.painMap || {};
  const parts = Object.keys(map);
  if (parts.length) return parts.map((part) => ({ part, score: map[part] }));
  if (row.painParts?.length) return row.painParts.map((part) => ({ part, score: row.painScore ?? null }));
  return row.painScore ? [{ part: '', score: row.painScore }] : [];
}

/** Stores the per-part scores and keeps the summary fields in step. */
export function setPainMap(row, map) {
  row.painMap = map;
  row.painParts = Object.keys(map);
  const scores = Object.values(map).filter((score) => score !== null);
  row.painScore = scores.length ? Math.max(...scores) : null;
}

/** 左膝 4、下背 2 */
export function painText(row) {
  return painList(row).map(({ part, score }) => [part, score ?? ''].filter((bit) => bit !== '').join(' ')).join('、');
}

/** The short form for the narrow exercise column. */
export function painShort(row) {
  const list = painList(row);
  if (list.length < 2) return painText(row);
  const scores = list.map((p) => p.score).filter((score) => score !== null);
  return `${list.length} 處${scores.length ? `・最高 ${Math.max(...scores)}` : ''}`;
}

export function setText(row, set) {
  const load = row.kind === 'pilates' ? (set.spring || '—') : (set.weight ? `${set.weight}` : '自體');
  return `${load}×${set.reps}`;
}

/** Everything noted about one exercise in one class, for history lists and the PDF. */
export function rowDetails(row) {
  const pain = painText(row);
  return [
    row.rpe ? `RPE ${row.rpe}` : '',
    pain ? `痛 ${pain}` : '',
    row.painNote ? `疼痛附註：${row.painNote}` : '',
    row.quality ? `品質 ${row.quality}` : '',
    row.assist ? `協助 ${row.assist}` : '',
    ...(row.props || []),
    ...(row.tags || []),
  ].filter(Boolean);
}

/** One student's past classes that included this exercise, newest first. */
export function exerciseHistory(exerciseId, history) {
  return history.flatMap((session) => session.rows
    .filter((row) => row.exerciseId === exerciseId)
    .map((row) => ({ date: session.date, row })));
}

export function recentPain(history, limit = 5) {
  const items = [];
  for (const session of history.slice(0, limit)) {
    for (const row of session.rows) {
      if (painList(row).length) {
        items.push({ date: session.date, exercise: row.name, text: painText(row), note: row.painNote || '' });
      }
    }
  }
  return items;
}
