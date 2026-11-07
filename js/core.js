// Pure logic with no DOM or storage access, so it can run under `node --test`.

export const MAX_SETS = 5;
export const DEFAULT_TAGS = ['左肩痛', '腰代償', '脖子代償', '肩胛代償', '膝代償', '角度不夠', '太重', '太輕', '縮小腹太多', '骨盆後傾', '肋骨外翻', '肩膀代償'];
export const DEFAULT_PROPS = ['滾筒', '彈力帶', '瑜珈球', 'Box'];
export const APPARATUS = ['Reformer', 'Cadillac', 'Chair', 'Mat', 'Arc Barrel', 'Spine Corrector'];
export const ASSIST_LEVELS = ['無', '少', '中', '多'];
export const SPRING_COLORS = ['r', 'b', 'y', 'g'];
export const SPRING_BARS = ['l', 'm', 'h'];
export const EQUIPMENT = ['啞鈴', '槓鈴', '壺鈴', '彈力帶', '六角槓', '藥球', '地雷管'];
export const BAND = '彈力帶';
export const BAND_COLORS = ['黃', '紅', '綠', '藍', '黑'];
export const BODY_GROUPS = ['下肢', '胸', '背', '肩', '手臂', '核心'];

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
    equipment: '',
    band: '',
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
    equipment: row.equipment || '',
    band: row.band || '',
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
export function suggestProgression(exerciseId, history, step = 2) {
  const rows = [];
  for (const session of history) {
    const row = session.rows.find((r) => r.exerciseId === exerciseId);
    if (row) rows.push(row);
    if (rows.length === 2) break;
  }
  if (rows.length < 2) return null;
  const [latest, previous] = rows;
  if (latest.kind !== 'strength') return null;
  // A band has no weight, and a dumbbell's weight says nothing about a barbell's.
  if (latest.equipment === BAND || previous.equipment === BAND) return null;
  if (latest.equipment && previous.equipment && latest.equipment !== previous.equipment) return null;
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

/** A term is usually 12 or 24 classes. */
export const PACKAGE_SIZES = [12, 24];

/**
 * The number for a new class, counted by itself. history is newest first and leaves out the class being opened.
 * A number the teacher corrected by hand wins, and the count carries on from it.
 */
export function nextClassNumber(history, student) {
  if (student?.classStart?.no) return { no: student.classStart.no, size: student.classStart.size };
  const index = history.findIndex((s) => s.classNo);
  const size = student?.packageSize || history[Math.max(index, 0)]?.packageSize || PACKAGE_SIZES[0];
  if (index === -1) return { no: (history.length % size) + 1, size };
  const lastSize = history[index].packageSize || size;
  const count = history[index].classNo + index + 1;
  return count > lastSize ? { no: count - lastSize, size, newTerm: true } : { no: count, size: lastSize };
}

export function classLabel(no, size) {
  return no ? `第 ${no} / ${size} 堂` : '';
}

export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

export function dateWithWeek(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}/${d}（${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}）`;
}

/** The student's first booking after a day, read from the calendar. */
export function nextBooking(student, events, today) {
  const names = [student.name, ...(student.aliases || [])];
  return events
    .filter((e) => e.date > today && e.student && names.includes(e.student))
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] || null;
}

/** A date the teacher confirmed counts until it passes; a calendar booking alone is only a suggestion. */
export function nextClassInfo(student, events, today) {
  const booking = nextBooking(student, events, today);
  if (student.nextClassDate > today) {
    return {
      date: student.nextClassDate,
      time: student.nextClassTime || (booking?.date === student.nextClassDate ? booking.time : ''),
      confirmed: true,
      conflict: !!booking && booking.date !== student.nextClassDate,
    };
  }
  return { date: booking?.date || '', time: booking?.time || '', confirmed: false, conflict: false };
}

/** Moves one exercise and returns where the given row ended up, so the selection stays on it. */
export function moveRow(rows, from, to, keep = from) {
  const kept = rows[keep];
  rows.splice(to, 0, rows.splice(from, 1)[0]);
  return rows.indexOf(kept);
}

/** What the load of a set is called: a spring, a band's colour, a weight, or bodyweight. */
export function setLoad(row, set, useActual = true) {
  if (row.kind === 'pilates') return (useActual ? set.spring : set.planSpring) || '—';
  if (row.equipment === BAND) return row.band ? `${row.band}帶` : '彈力帶';
  const weight = useActual ? set.weight : set.planWeight;
  return weight ? String(weight) : '自體';
}

/** 啞鈴, or 彈力帶 紅 */
export function equipmentText(row) {
  return [row.equipment, row.equipment === BAND ? row.band : ''].filter(Boolean).join(' ');
}

export function setLabel(row, set, useActual = true) {
  return { first: setLoad(row, set, useActual), reps: String(useActual ? set.reps : set.planReps) };
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

/** A handout file comes from the teacher's own computer, but it is still checked before it is stored. */
export function isHandoutFile(data) {
  if (data?.format !== 'training-record-handout' || data.version !== 1) return false;
  if (!data.images || typeof data.images !== 'object' || !Array.isArray(data.exercises) || !data.exercises.length) return false;
  return data.exercises.every((e) => typeof e?.id === 'string' && e.id
    && typeof e.name === 'string' && e.name.trim()
    && typeof e.group === 'string'
    && e.fields && typeof e.fields === 'object'
    && Array.isArray(e.noteImages) && e.noteImages.every((path) => typeof data.images[path] === 'string')
    && (!e.chartImage || typeof data.images[e.chartImage] === 'string'));
}

/**
 * Importing twice is safe. An exercise from an earlier import stays as the teacher left it,
 * even if renamed or removed; one the teacher already added by the same name gains the handout.
 */
export function planHandoutImport(file, active, getById) {
  // Different apparatus share names (Beats on Reformer and on Chair), so a name only counts as the
  // same exercise on the same apparatus, or when the teacher's own one has no apparatus set.
  const pilates = active.filter((e) => e.kind === 'pilates');
  const byName = new Map(pilates.map((e) => [`${e.group}|${e.name}`, e]));
  const loose = new Map(pilates.filter((e) => !e.handoutId && !APPARATUS.includes(e.group)).map((e) => [e.name, e]));
  const byHandout = new Map(active.filter((e) => e.handoutId).map((e) => [e.handoutId, e]));
  const add = [];
  const link = [];
  const update = [];
  // The classification in the file refreshes on every import, unless the teacher changed it by hand.
  const withTags = (exercise, tags) => (tags && !exercise.tagsEdited ? { ...exercise, tags } : exercise);
  const differs = (a, b) => JSON.stringify(a || null) !== JSON.stringify(b || null);
  for (const item of file.exercises) {
    const id = `hd_${item.id}`;
    const tags = cleanPilatesTags(item.tags);
    const existing = getById(id) || byHandout.get(item.id);
    if (existing) {
      if (tags && !existing.tagsEdited && differs(existing.tags, tags)) update.push({ ...existing, tags });
      continue;
    }
    const same = byName.get(`${item.group}|${item.name}`) || loose.get(item.name);
    if (same) {
      if (!same.handoutId) link.push(withTags({ ...same, handoutId: item.id, order: item.order }, tags));
      byName.set(`${item.group}|${item.name}`, { ...same, handoutId: item.id });
      loose.delete(item.name);
      continue;
    }
    const exercise = withTags({ id, name: item.name, group: item.group, kind: 'pilates', handoutId: item.id, order: item.order }, tags);
    add.push(exercise);
    byName.set(`${item.group}|${item.name}`, exercise);
  }
  return { add, link, update };
}

// How Pilates exercises are classified, so the right one can be found in a few taps.
export const PILATES_REGIONS = ['下肢', '核心', '脊椎', '肩臂', '全身'];
export const PILATES_POSTURES = ['仰躺', '俯趴', '側躺', '坐姿', '跪姿', '四足', '平板', '站姿', '弓箭步'];
// 2026-11-07: 穩定 and 活動度 are the body areas the handout names; 重點 keeps only 協調 and 平衡 (docs/皮拉提斯動作分類.md).
export const PILATES_FOCUS = ['協調', '平衡'];
export const PILATES_STABILITY = ['軀幹中立', '軀幹屈曲', '軀幹伸展', '軀幹旋轉', '軀幹側彎', '脊椎', '骨盆', '肩胛', '手臂', '下肢'];
export const PILATES_MOBILITY = ['髖', '膝', '踝', '脊椎屈曲', '脊椎伸展', '脊椎旋轉', '脊椎側彎', '脊椎', '骨盆', '肩胛', '肩', '肘'];
/** Classification fields that hold several values each. */
export const PILATES_LIST_KEYS = ['stability', 'mobility', 'focus'];
export const PILATES_LEVELS = ['入門', '中階', '進階'];

/** Keeps only known values, so an edited or damaged file can never show odd labels. */
export function cleanPilatesTags(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const one = (value, list) => (list.includes(value) ? value : '');
  const words = (value, max) => (Array.isArray(value)
    ? [...new Set(value.filter((w) => typeof w === 'string' && w.trim()).map((w) => w.trim().slice(0, 12)))].slice(0, max)
    : []);
  const clean = {
    region: one(tags.region, PILATES_REGIONS),
    posture: one(tags.posture, PILATES_POSTURES),
    stability: words((tags.stability || []).filter?.((f) => PILATES_STABILITY.includes(f)), PILATES_STABILITY.length),
    mobility: words((tags.mobility || []).filter?.((f) => PILATES_MOBILITY.includes(f)), PILATES_MOBILITY.length),
    focus: words((tags.focus || []).filter?.((f) => PILATES_FOCUS.includes(f)), PILATES_FOCUS.length),
    level: [1, 2, 3].includes(tags.level) ? tags.level : 0,
    muscles: words(tags.muscles, 6),
    family: typeof tags.family === 'string' ? tags.family.trim().slice(0, 20) : '',
  };
  return clean.region || clean.posture || clean.stability.length || clean.mobility.length || clean.focus.length || clean.level || clean.muscles.length ? clean : null;
}

/** One short line under a Pilates exercise name, such as 下肢・仰躺・入門. */
export function pilatesTagText(tags) {
  if (!tags) return '';
  return [tags.region, tags.posture, PILATES_LEVELS[tags.level - 1]].filter(Boolean).join('・');
}

/** Filters the library by any mix of 部位, 姿勢, 穩定, 活動度, 重點, 程度 and 器材. Empty filters let everything through. */
export function filterPilates(list, filters = {}) {
  return list.filter((e) => (!filters.region || e.tags?.region === filters.region)
    && (!filters.posture || e.tags?.posture === filters.posture)
    && PILATES_LIST_KEYS.every((key) => !filters[key] || (e.tags?.[key] || []).includes(filters[key]))
    && (!filters.level || e.tags?.level === filters.level)
    && (!filters.apparatus || e.group === filters.apparatus));
}

/**
 * Easier, same-level and harder exercises for a Pilates exercise. The same series comes first,
 * then the same body region in the same position or with something in common to stabilise, move or focus on.
 */
export function pilatesSteps(current, library, limit = 3) {
  const empty = { easier: [], same: [], harder: [] };
  const mine = current?.tags;
  if (!mine?.level) return empty;
  const shared = (a = [], b = []) => a.filter((x) => b.includes(x)).length;
  const scored = [];
  for (const e of library) {
    const t = e.tags;
    if (e.id === current.id || e.kind !== 'pilates' || e.deleted || !t?.level) continue;
    const family = mine.family && t.family === mine.family;
    const region = t.region === mine.region;
    const posture = t.posture === mine.posture;
    const focus = shared(t.focus, mine.focus);
    const areas = shared(t.stability, mine.stability) + shared(t.mobility, mine.mobility);
    if (!family && !(region && (posture || focus || areas))) continue;
    scored.push({ e, score: (family ? 100 : 0) + (region ? 20 : 0) + (posture ? 10 : 0) + focus * 3 + areas * 2 + shared(t.muscles, mine.muscles) * 2 - Math.abs(t.level - mine.level) });
  }
  scored.sort((a, b) => b.score - a.score || (a.e.order ?? 0) - (b.e.order ?? 0));
  const pick = (test) => scored.filter(({ e }) => test(e.tags.level)).slice(0, limit).map(({ e }) => e);
  return { easier: pick((l) => l < mine.level), same: pick((l) => l === mine.level), harder: pick((l) => l > mine.level) };
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
  let equipment = '';
  for (const session of history) {
    const row = session.rows.find((r) => r.exerciseId === exerciseId);
    if (!row || row.equipment === BAND) continue;
    // One line follows one kind of equipment: the most recent one. Classes with none noted still count.
    if (equipment && row.equipment && row.equipment !== equipment) continue;
    equipment = equipment || row.equipment || '';
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

export const DAY_PAIN = '上課前';

/** Where a class holds pain: how the student felt on arrival, then each exercise. */
export function painSources(session) {
  return [...(session.dayPain ? [session.dayPain] : []), ...(session.rows || [])];
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
  return `${setLoad(row, set)}×${set.reps}`;
}

/** Everything noted about one exercise in one class, for history lists and the PDF. */
export function rowDetails(row) {
  const pain = painText(row);
  return [
    equipmentText(row),
    row.rpe ? `RPE ${row.rpe}` : '',
    row.replacedFrom ? `由 ${row.replacedFrom.name} 換來` : '',
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
    for (const row of painSources(session)) {
      if (painList(row).length) {
        items.push({ date: session.date, exercise: row.name || DAY_PAIN, text: painText(row), note: row.painNote || '' });
      }
    }
  }
  return items;
}

/** How many times each exercise has been used, for putting the familiar ones first. */
export function usageCounts(sessions) {
  const counts = new Map();
  for (const session of sessions) {
    for (const row of session.rows || []) counts.set(row.exerciseId, (counts.get(row.exerciseId) || 0) + 1);
  }
  return counts;
}

const squeeze = (text) => String(text || '').toLowerCase().replace(/\s+/g, '');

/** Matches the name, the group or another name for it, ignoring spaces and capitals. */
export function searchExercises(items, query) {
  const wanted = squeeze(query);
  if (!wanted) return items;
  return items.filter((item) => [item.name, item.group, ...(item.aliases || [])].some((text) => squeeze(text).includes(wanted)));
}

/** The quick list: the ones the teacher pinned, then the most used. */
export function commonExercises(items, usage, excludeId = null, limit = 12) {
  return items
    .filter((item) => item.id !== excludeId && (item.pinned || usage.get(item.id)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0) || (usage.get(b.id) || 0) - (usage.get(a.id) || 0))
    .slice(0, limit);
}

/** What to offer in place of an exercise: its own alternatives, or else the same group, most used first. */
export function swapOptions(current, items, usage, limit = 8) {
  const byId = new Map(items.map((item) => [item.id, item]));
  const own = (current?.alternatives || []).map((id) => byId.get(id)).filter((item) => item && item.id !== current.id);
  if (own.length) return { sameGroup: false, list: own.slice(0, limit) };
  const list = items
    .filter((item) => item.id !== current?.id && current?.group && item.group === current.group)
    .sort((a, b) => (usage.get(b.id) || 0) - (usage.get(a.id) || 0))
    .slice(0, limit);
  return { sameGroup: true, list };
}

/**
 * Replaces an exercise and returns the new row's position. Sets already done stay on the old exercise,
 * because that is what the student really did; only the sets left move to the new one. The numbers come
 * from the last time this student did the new exercise, since a squat's weight says nothing about a leg press.
 */
export function swapRow(rows, index, exercise, history = []) {
  const row = rows[index];
  const done = row.sets.filter((set) => set.done).length;
  const left = row.sets.filter((set) => !set.done);
  const past = exerciseHistory(exercise.id, history)[0]?.row;
  const pastSet = past ? [...past.sets].reverse().find((set) => set.done) || past.sets[0] : null;
  const fresh = makeRow(exercise, left.length || row.sets.length || 3, {
    weight: pastSet?.weight ?? 0,
    spring: pastSet?.spring ?? '',
    reps: pastSet?.reps ?? left[0]?.reps ?? row.sets[0]?.reps ?? 10,
  });
  fresh.equipment = past?.equipment || '';
  fresh.band = past?.band || '';
  fresh.replacedFrom = { id: row.exerciseId, name: row.name };
  if (!done) {
    rows.splice(index, 1, fresh);
    return index;
  }
  row.sets = row.sets.filter((set) => set.done);
  rows.splice(index + 1, 0, fresh);
  return index + 1;
}

/** Puts a swap the teacher really kept at the front of that exercise's alternatives. */
export function learnAlternative(exercise, replacementId, limit = 8) {
  return [replacementId, ...(exercise.alternatives || []).filter((id) => id !== replacementId)].slice(0, limit);
}

/** The spring settings used most, so a usual setting takes one tap. */
export function commonSprings(sessions, limit = 6) {
  const counts = new Map();
  for (const session of sessions) {
    for (const row of session.rows || []) {
      for (const set of row.sets || []) {
        if (set.spring) counts.set(set.spring, (counts.get(set.spring) || 0) + 1);
      }
    }
  }
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([spring]) => spring);
}

/** How wide text looks: a Latin letter or digit takes about half a Chinese character. */
function textWidth(text) {
  return [...text].reduce((sum, char) => sum + (char.charCodeAt(0) < 128 ? 0.5 : 1), 0);
}

/**
 * Splits free text for a card: a short headline up front, the rest in small type.
 * It breaks at a sentence mark when it can. A 、 only counts after a real phrase, since 第四、五節 must stay together.
 */
export function headline(text, limit = 10) {
  const value = String(text || '').trim();
  if (!value) return { head: '', rest: '' };
  const tidy = (rest) => rest.replace(/^[，。、,;；\s]+/, '');
  const sentence = value.search(/[，。,;；\n]/);
  const first = sentence === -1 ? value : value.slice(0, sentence);
  if (textWidth(first) <= limit) return { head: first, rest: tidy(value.slice(first.length)) };
  const pause = first.indexOf('、');
  if (pause >= 5 && textWidth(first.slice(0, pause)) <= limit) return { head: first.slice(0, pause), rest: tidy(value.slice(pause)) };
  let end = 0;
  while (textWidth(value.slice(0, end + 1)) <= limit) end += 1;
  return { head: `${value.slice(0, end)}…`, rest: value.slice(end) };
}

/** Every exercise the student has really done, by body part or apparatus. */
export function learnedSummary(history, library, find = () => null) {
  const learned = new Map();
  for (const session of history) {
    for (const row of session.rows) {
      if (learned.has(row.exerciseId) || !row.sets.some((s) => s.done)) continue;
      const exercise = find(row.exerciseId);
      const group = row.kind === 'pilates' ? exercise?.tags?.region || '未分類' : exercise?.group || '其他';
      learned.set(row.exerciseId, { name: row.name, kind: row.kind, group });
    }
  }
  const forKind = (kind) => {
    const mine = [...learned.values()].filter((item) => item.kind === kind);
    const totals = new Map();
    for (const item of library) {
      if (item.kind !== kind) continue;
      const group = kind === 'pilates' ? item.tags?.region || '未分類' : item.group;
      totals.set(group, (totals.get(group) || 0) + 1);
    }
    // A fixed list of groups, so the card keeps the same size however many exercises are learned.
    const names = kind === 'strength' ? [...BODY_GROUPS] : [...PILATES_REGIONS];
    for (const item of mine) if (!names.includes(item.group)) names.push(item.group);
    const groups = names.map((group) => {
      const items = mine.filter((item) => item.group === group);
      return { group, learned: items.length, total: Math.max(totals.get(group) || 0, items.length), names: items.map((item) => item.name) };
    });
    return { count: mine.length, groups };
  };
  return { strength: forKind('strength'), pilates: forKind('pilates') };
}

/** Recent Pilates quality and how much help was needed, for the learning card. */
export function pilatesLevel(history, limit = 5) {
  const rows = history.slice(0, limit).flatMap((session) => session.rows.filter((row) => row.kind === 'pilates'));
  const qualities = rows.map((row) => row.quality).filter(Boolean);
  const counts = new Map();
  for (const row of rows) if (row.assist) counts.set(row.assist, (counts.get(row.assist) || 0) + 1);
  const assist = [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] || '';
  return {
    quality: qualities.length ? Math.round((qualities.reduce((a, b) => a + b, 0) / qualities.length) * 10) / 10 : null,
    assist,
  };
}

/** The exercises done most, with how their weight has moved. */
export function weightTrends(history, limit = 3) {
  const seen = new Map();
  for (const session of history.slice(0, 12)) {
    for (const row of session.rows) {
      if (row.kind !== 'strength') continue;
      const item = seen.get(row.exerciseId) || { id: row.exerciseId, name: row.name, count: 0 };
      item.count += 1;
      seen.set(row.exerciseId, item);
    }
  }
  return [...seen.values()]
    .map((item) => ({ ...item, points: exerciseTrend(item.id, history).filter((point) => point.weight > 0) }))
    .filter((item) => item.points.length >= 2)
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map((item) => ({ id: item.id, name: item.name, points: item.points, change: Math.round((item.points.at(-1).weight - item.points[0].weight) * 100) / 100 }));
}

/** Each sore part's highest score per class, oldest first, with a zero for classes it did not hurt. */
export function painSeries(history, limit = 8) {
  const sessions = history.slice(0, limit).reverse();
  const parts = new Map();
  sessions.forEach((session, index) => {
    for (const row of painSources(session)) {
      for (const { part, score } of painList(row)) {
        const name = part || '未標部位';
        if (!parts.has(name)) parts.set(name, new Array(sessions.length).fill(0));
        parts.get(name)[index] = Math.max(parts.get(name)[index], score || 0);
      }
    }
  });
  return [...parts.entries()]
    .filter(([, scores]) => scores.some(Boolean))
    .map(([part, scores]) => {
      const earlier = scores.slice(0, -1).filter(Boolean);
      const before = earlier.at(-1) ?? 0;
      const latest = scores.at(-1);
      return { part, scores, latest, direction: latest > before ? 'up' : latest < before ? 'down' : 'same' };
    })
    .sort((a, b) => b.latest - a.latest || Math.max(...b.scores) - Math.max(...a.scores));
}

/** One word for how training is going. The rules are simple on purpose, so the teacher can check them. */
// Rules in docs/整體狀態判斷.md. Change that file first; when they disagree, the file wins.
export const STATUS_RULES = { painRise: 1, bpClasses: 2, rpeHigh: 8, absentDays: 21, rpeEasier: 1 };

function daysBetween(from, to) {
  const [a, b] = [from, to].map((key) => { const [y, m, d] = key.split('-').map(Number); return Date.UTC(y, m - 1, d); });
  return Math.round((b - a) / 86400000);
}

function maxDoneWeight(row) {
  const done = row.sets.filter((s) => s.done);
  return done.length ? Math.max(...done.map((s) => s.weight)) : null;
}

/** What the teacher wrote about an exercise in one class: its 備註 tags and the pain note. */
function rowNotes(row) {
  return [...(row.tags || []), row.painNote].map((text) => String(text || '').trim()).filter(Boolean);
}

/** Strength exercises done at the same weight as the class before, but felt easier by at least one RPE point. */
function easierCount(history) {
  const [latest, ...older] = history;
  let count = 0;
  for (const row of latest.rows) {
    if (row.kind !== 'strength' || !row.rpe) continue;
    const weight = maxDoneWeight(row);
    if (weight === null) continue;
    for (const session of older) {
      const before = session.rows.find((r) => r.exerciseId === row.exerciseId);
      if (!before) continue;
      if (before.rpe && (before.equipment || '') === (row.equipment || '') && maxDoneWeight(before) === weight
        && before.rpe - row.rpe >= STATUS_RULES.rpeEasier) count += 1;
      break;
    }
  }
  return count;
}

/**
 * The overview's one-glance status. history is newest first.
 * Returns the label and short detail for the card, plus every reason found, for the sheet behind it.
 */
export function overallStatus(history, today = dateKey()) {
  if (!history.length) return { tone: 'none', label: '尚無紀錄', detail: '上完第一堂就會顯示', reasons: [], notes: [] };
  const latest = history[0];
  const alerts = [];
  const gains = [];

  // Things to watch.
  const pains = painSeries(history);
  for (const item of history.length > 1 ? pains.filter((p) => p.direction === 'up') : []) alerts.push(`${item.part}疼痛增加`);
  const bp = history.slice(0, STATUS_RULES.bpClasses);
  if (bp.length === STATUS_RULES.bpClasses && bp.every((s) => s.bpSys && s.bpDia && isBpFlagged(s.bpSys, s.bpDia))) {
    alerts.push(`血壓連續 ${STATUS_RULES.bpClasses} 堂偏高（${latest.bpSys}/${latest.bpDia}）`);
  }
  const rpes = latest.rows.map((row) => row.rpe).filter(Boolean);
  const rpeAverage = rpes.length ? Math.round((rpes.reduce((a, b) => a + b, 0) / rpes.length) * 10) / 10 : null;
  if (rpeAverage !== null && rpeAverage >= STATUS_RULES.rpeHigh) alerts.push(`上次費力偏高（平均 ${rpeAverage}）`);
  const away = today ? daysBetween(latest.date, today) : 0;
  if (away >= STATUS_RULES.absentDays) alerts.push(`已 ${away} 天沒上課`);

  if (history.length < 2) {
    if (alerts.length) return { tone: 'alert', label: '需留意', detail: alerts[0], reasons: alerts.map((text) => ({ tone: 'alert', text })), notes: [] };
    return { tone: 'none', label: '剛開始', detail: '再上一堂就能比較', reasons: [], notes: [] };
  }

  // Changes in weight, with what was written about each lighter exercise.
  const trends = weightTrends(history, 99);
  const heavier = trends.filter((item) => item.change > 0);
  const lighter = trends.filter((item) => item.change < 0);
  const notes = [];
  const classNotes = new Map();
  for (const item of lighter) {
    // The class the lighter weight came from: the latest one where a set of it was done.
    const session = history.find((s) => s.rows.some((r) => r.exerciseId === item.id && r.sets.some((set) => set.done)));
    const row = session?.rows.find((r) => r.exerciseId === item.id);
    const written = row ? rowNotes(row) : [];
    if (written.length) notes.push(`${item.name}：${[...new Set(written)].join('、')}`);
    // The class note is listed once, however many lighter exercises share the class.
    const note = String(session?.note || '').trim();
    if (note) classNotes.set(session.date, note);
  }
  for (const [date, note] of classNotes) notes.push(`${Number(date.slice(5, 7))}/${Number(date.slice(8))} 上課備註：${note}`);
  if (heavier.length) gains.push(`${heavier.length} 個動作加重`);
  const easing = pains.filter((p) => p.direction === 'down');
  for (const item of easing) gains.push(`${item.part}疼痛下降`);
  const quality = (list) => {
    const scores = list.flatMap((session) => session.rows.map((row) => row.quality)).filter(Boolean);
    return scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : null;
  };
  const recent = quality(history.slice(0, 3));
  const older = quality(history.slice(3, 6));
  if (recent !== null && older !== null && recent > older) gains.push('動作品質提升');
  const easier = easierCount(history);
  if (easier) gains.push(`${easier} 個動作同重量更輕鬆`);
  const drop = lighter.length > heavier.length ? `${lighter.length} 個動作減輕` : '';

  const reasons = [
    ...alerts.map((text) => ({ tone: 'alert', text })),
    ...(drop ? [{ tone: 'flat', text: drop }] : []),
    ...gains.map((text) => ({ tone: 'up', text })),
  ];
  if (alerts.length) return { tone: 'alert', label: '需留意', detail: alerts[0], reasons, notes };
  if (drop) return { tone: 'flat', label: '重量下降', detail: drop, reasons, notes };
  if (gains.length) return { tone: 'up', label: '穩定進步', detail: gains[0], reasons, notes };
  return { tone: 'flat', label: '維持穩定', detail: '重量和品質持平', reasons, notes };
}

export const BODY_COMP_DAYS = 90;

/** The latest body measurements, the change since the one before, and whether the next is due (every 3 months). */
export function bodyCompSummary(list, today) {
  const sorted = [...(list || [])].sort((a, b) => b.date.localeCompare(a.date));
  const [latest, previous] = sorted;
  if (!latest) return { latest: null, previous: null, sorted, due: true };
  return { latest, previous: previous || null, sorted, due: addDays(latest.date, BODY_COMP_DAYS) <= today };
}

// ---------- The student's report of today's class ----------
// Read by students with no training background, many of them older: plain words, concrete numbers.

/** Body parts in everyday words. Strength groups and Pilates regions share them where they mean the same. */
export const LAY_REGIONS = {
  下肢: '腿和臀部', 胸: '胸部', 背: '背部', 肩: '肩膀', 手臂: '手臂', 核心: '腹部（核心）',
  脊椎: '脊椎活動', 肩臂: '肩膀和手臂', 全身: '全身',
};

export function layRegion(group) {
  return LAY_REGIONS[group] || group || '';
}

const SPRING_WORDS = { r: '紅', b: '藍', y: '黃', g: '綠' };

/** The springs of one set as colours to draw and words to read: 紅 2・藍 1. */
export function springParts(text) {
  const spring = springFromText(text);
  const colors = SPRING_COLORS.filter((c) => spring.counts[c] > 0);
  return {
    dots: colors.flatMap((c) => Array(spring.counts[c]).fill(c)),
    words: colors.map((c) => `${SPRING_WORDS[c]} ${spring.counts[c]}`).join('・'),
  };
}

/** The heaviest finished set of an exercise in a class, on the given equipment ('' matches any). */
function heaviest(row) {
  const done = row.sets.filter((s) => s.done && s.weight > 0);
  return done.length ? Math.max(...done.map((s) => s.weight)) : 0;
}

/**
 * One line per exercise that had at least one finished set: what it was, how heavy, how many, how hard.
 * history is the student's earlier classes, newest first, for "heavier than last time".
 */
export function reportRows(session, history, find = () => null) {
  return session.rows.filter((row) => row.sets.some((s) => s.done)).map((row) => {
    const exercise = find(row.exerciseId);
    const done = row.sets.filter((s) => s.done);
    const reps = [...new Set(done.map((s) => s.reps).filter(Boolean))].sort((a, b) => a - b);
    const group = row.kind === 'pilates' ? exercise?.tags?.region : exercise?.group;
    let amount;
    if (row.kind === 'pilates') {
      const last = [...done].reverse().find((s) => s.spring);
      amount = last ? { type: 'spring', ...springParts(last.spring) } : { type: 'none' };
    } else if (row.equipment === BAND) {
      amount = { type: 'band', color: row.band || '' };
    } else {
      const weight = heaviest(row);
      let up = 0;
      if (weight) {
        // The last class with this exercise on the same kind of equipment.
        const before = history.map((s) => s.rows.find((r) => r.exerciseId === row.exerciseId))
          .find((r) => r && r.equipment !== BAND && (!r.equipment || !row.equipment || r.equipment === row.equipment) && heaviest(r));
        if (before) up = Math.max(0, Math.round((weight - heaviest(before)) * 100) / 100);
      }
      amount = weight ? { type: 'weight', weight, up } : { type: 'body' };
    }
    return {
      id: row.id,
      name: row.name,
      kind: row.kind,
      equipment: row.kind === 'pilates' ? (exercise?.group || '') : (row.equipment || ''),
      region: layRegion(group),
      amount,
      reps: reps.length ? (reps.length === 1 ? `${reps[0]} 下` : `${reps[0]}–${reps.at(-1)} 下`) : '',
      sets: done.length,
      rpe: row.rpe || null,
    };
  });
}

/** How many of today's exercises worked each part, most first: 腿和臀部 3、背部 1. */
export function reportRegions(rows) {
  const counts = new Map();
  for (const row of rows) if (row.region) counts.set(row.region, (counts.get(row.region) || 0) + 1);
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([region, count]) => ({ region, count }));
}

/** 1–3 easy, 4–6 moderate, 7–10 hard, for colouring the effort bar. */
export function effortLevel(rpe) {
  if (!rpe) return '';
  return rpe >= 7 ? 'high' : rpe >= 4 ? 'mid' : 'low';
}

/** Each sore part's highest score in a class, counting the check-in and every exercise. */
export function classPain(session) {
  const map = {};
  for (const source of painSources(session)) {
    for (const { part, score } of painList(source)) {
      if (!part || score === null || score === undefined) continue;
      map[part] = Math.max(map[part] ?? 0, score);
    }
  }
  return map;
}

/** Today's pain beside the last class that scored the same part. */
export function reportPain(session, history) {
  const today = classPain(session);
  return Object.entries(today).sort((a, b) => b[1] - a[1]).map(([part, score]) => {
    const earlier = history.map(classPain).find((map) => part in map);
    return { part, score, before: earlier ? earlier[part] : null };
  });
}
