// Pure logic with no DOM or storage access, so it can run under `node --test`.

export const MAX_SETS = 5;
export const DEFAULT_TAGS = ['左肩痛', '腰代償', '脖子代償', '肩胛代償', '膝代償', '角度不夠', '太重', '太輕', '縮小腹太多', '骨盆後傾', '肋骨外翻', '肩膀代償'];
export const DEFAULT_PROPS = ['滾筒', '彈力帶', '瑜珈球', 'Box'];
export const APPARATUS = ['Reformer', 'Cadillac', 'Chair', 'Mat', 'Arc Barrel', 'Spine Corrector'];
export const ASSIST_LEVELS = ['無', '少', '中', '多'];
// Each apparatus has its own springs (2026-11-13). Reformer: red, blue, yellow, green. Its low/middle/high bar was
// taken out on 2026-11-26 (使用者：把 reformer 彈簧位置刪除); old records keep what they wrote, such as 2r1b m.
// Chair: black and green, each colour hung in its own Top/High/Middle/Low hole, written in capitals after
// the colour (1kT 1gL, 2026-11-16). Cadillac: yellow, purple, short red, long red, blue.
export const SPRING_SETS = {
  reformer: { colors: ['r', 'b', 'y', 'g'], positions: [], holes: [] },
  chair: { colors: ['k', 'g'], positions: [], holes: ['T', 'H', 'M', 'L'] },
  cadillac: { colors: ['y', 'p', 'rs', 'rl', 'b'], positions: [], holes: [] },
};
const SPRING_ORDER = ['r', 'rs', 'rl', 'b', 'y', 'p', 'k', 'g'];
export const SPRING_WORDS = { r: '紅', rs: '紅短', rl: '紅長', b: '藍', y: '黃', p: '紫', k: '黑', g: '綠' };

/** Which spring set an exercise uses, from its apparatus. */
export function springKind(apparatus) {
  return apparatus === 'Chair' ? 'chair' : apparatus === 'Cadillac' ? 'cadillac' : 'reformer';
}

export function springSet(apparatus) {
  return SPRING_SETS[springKind(apparatus)];
}
export const EQUIPMENT = ['啞鈴', '槓鈴', '壺鈴', '彈力帶', '六角槓', '藥球', '地雷管'];
export const BAND = '彈力帶';
export const BAND_COLORS = ['黃', '紅', '綠', '藍', '黑'];
export const BODY_GROUPS = ['下肢', '胸', '背', '肩', '手臂', '軀幹'];

/**
 * The strength body part 核心 is called 軀幹 since 2026-11-24, so it is never mixed up with the 核心 category.
 * Exercises saved before keep the old word in storage and on Drive; it is read as 軀幹.
 */
export function withTorsoGroup(exercise) {
  if (!exercise || exercise.kind === 'pilates') return exercise;
  const rename = (g) => (g === '核心' ? '軀幹' : g);
  if (exercise.group !== '核心' && !(exercise.groups || []).includes('核心')) return exercise;
  return { ...exercise, group: rename(exercise.group), ...(Array.isArray(exercise.groups) ? { groups: exercise.groups.map(rename) } : {}) };
}

// How strength exercises are classified (2026-11-24, docs/重訓動作分類.md section 2).
export const STRENGTH_PATTERNS = ['蹲類', '硬舉類', '上肢推', '上肢拉', '核心', '其他'];
/** Short names for the learning grid and the plan's count. */
export const PATTERN_SHORT = { 蹲類: '蹲', 硬舉類: '硬舉', 上肢推: '推', 上肢拉: '拉', 核心: '核心', 其他: '其他' };
/** Only pushes and pulls have a direction. */
export const PLANE_PATTERNS = ['上肢推', '上肢拉'];
export const STRENGTH_PLANES = ['水平', '垂直'];
export const STRENGTH_SIDES = ['雙側', '單側'];
/** Muscle words shared with the Pilates classification. */
export const MUSCLES = ['股四頭肌', '臀肌', '腿後肌', '內收肌', '髖外展肌', '小腿肌', '髖屈肌', '腹肌', '腹斜肌', '背伸肌', '闊背肌', '肩胛肌群', '三角肌', '旋轉肌袖', '胸肌', '二頭肌', '三頭肌'];

/** Keeps only known values. The first category is the main one; a direction only goes with a push or pull. */
export function cleanStrengthTags(tags) {
  if (!tags || typeof tags !== 'object') return null;
  const patterns = [...new Set((Array.isArray(tags.patterns) ? tags.patterns : []).filter((p) => STRENGTH_PATTERNS.includes(p)))];
  const clean = {
    patterns,
    plane: patterns.some((p) => PLANE_PATTERNS.includes(p)) && STRENGTH_PLANES.includes(tags.plane) ? tags.plane : '',
    side: STRENGTH_SIDES.includes(tags.side) ? tags.side : '',
    muscles: [...new Set((Array.isArray(tags.muscles) ? tags.muscles : []).filter((m) => typeof m === 'string' && m.trim()).map((m) => m.trim().slice(0, 12)))].slice(0, 6),
  };
  return clean.patterns.length || clean.side || clean.muscles.length ? clean : null;
}

/** The main category of a strength exercise, or 未分類. */
export function mainPattern(exercise) {
  return exercise?.tags?.patterns?.[0] || '未分類';
}

/** One short line under a strength exercise name, such as 上肢推・水平・雙側. */
export function strengthTagText(tags) {
  if (!tags?.patterns) return '';
  return [tags.patterns.join('、'), tags.plane, tags.side].filter(Boolean).join('・');
}

/** Filters strength exercises by 部位, 類別, 方向 and 單雙側. Empty filters let everything through. */
export function filterStrength(list, filters = {}) {
  return list.filter((e) => (!filters.part || exerciseGroups(e).includes(filters.part))
    && (!filters.pattern || (e.tags?.patterns || []).includes(filters.pattern))
    && (!filters.plane || e.tags?.plane === filters.plane)
    && (!filters.side || e.tags?.side === filters.side));
}

/**
 * How many strength exercises of each main category a class or plan holds, such as 蹲 1・推 2,
 * so a missing category shows at a glance. Categories with none are left out.
 */
export function patternCounts(rows, find = () => null) {
  const counts = new Map();
  for (const row of rows || []) {
    if (row.kind !== 'strength') continue;
    const pattern = mainPattern(find(row.exerciseId));
    counts.set(pattern, (counts.get(pattern) || 0) + 1);
  }
  return [...STRENGTH_PATTERNS, '未分類'].filter((p) => counts.has(p)).map((p) => ({ pattern: p, short: PATTERN_SHORT[p] || p, count: counts.get(p) }));
}

/**
 * The calendars to read bookings from. Several are allowed, because the company books Pilates and
 * strength in separate calendars (2026-11-11). Older versions saved one id as calendarId.
 */
export function chosenCalendars(ids, oldId) {
  const list = Array.isArray(ids) ? ids : oldId ? [oldId] : [];
  return [...new Set(list.filter((id) => typeof id === 'string' && id))];
}

/** One list from every calendar: the same booking shared into two calendars counts once, in time order. */
export function mergeCalendarEvents(lists) {
  const byId = new Map();
  for (const list of lists) for (const event of list || []) if (!byId.has(event.id)) byId.set(event.id, event);
  return [...byId.values()].sort((a, b) => (a.date + (a.time || '')).localeCompare(b.date + (b.time || '')) || a.id.localeCompare(b.id));
}

/**
 * Every body part a strength exercise belongs to; the first is its main one (2026-11-09).
 * Finding uses all of them, counting uses only the main one so nothing is counted twice.
 */
export function exerciseGroups(exercise) {
  const list = (exercise?.groups || []).filter(Boolean);
  if (list.length) return list;
  return [exercise?.group || '其他'];
}

/** Stores the chosen parts: `groups` holds all of them, `group` the main one, which older code reads. */
export function withGroups(exercise, groups) {
  const list = [...new Set(groups.filter(Boolean))];
  const clean = list.length ? list : ['其他'];
  return { ...exercise, group: clean[0], groups: clean };
}

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

/**
 * The teacher's own booking calendars (2026-11-12): one calendar per kind of class, so the calendar says
 * Pilates or strength, and the title is only the student's name. Two students with the same name get
 * a four-digit birthday after it: 王小明 0828.
 */
export const CALENDAR_KINDS = [['pilates', '皮拉提斯'], ['strength', '重訓'], ['shared', '公司共用']];

/** A first guess from the calendar's name; the teacher can change it in 設定. */
export function guessCalendarKind(name) {
  const text = String(name || '').toLowerCase();
  if (/皮拉提斯|pilates|器械|reformer/.test(text)) return 'pilates';
  if (/重訓|肌力|weight|strength|健身/.test(text)) return 'strength';
  return 'shared';
}

// What colleagues write around a name (2026-11-24 第四輪表單): notes always come after the full name, either stuck
// to it (陳小小女士) or after a space (黃中中女士 會員, 盧OOO 盧姊 VIP). They are dropped and never shown.
const NAME_NOTES = /(會員|VIP|家屬|顧問)$/i;
const HONORIFICS = /(女士|先生|小姐)$/;
const LATIN_WORD = /^[A-Za-z][A-Za-z.'’-]*$/;

/**
 * One person in a title. A change such as 病假 may come first in brackets, sometimes only the closing one
 * ((病假)黃大大, 病假）黃大大). The first word is the name; an English name keeps its surname (Amy Chen).
 * A four-digit birthday may follow, stuck to the name or after a space. Everything else is a note.
 */
function parseTitlePerson(part) {
  let text = String(part || '').trim();
  let change = '';
  const bracket = text.match(/^[（(]?\s*([^（）()\s]{1,8})\s*[）)]\s*/);
  if (bracket) {
    change = bracket[1];
    text = text.slice(bracket[0].length);
  }
  const words = text.split(/[\s　]+/).filter(Boolean);
  if (!words.length) return null;
  let name = words.shift();
  while (LATIN_WORD.test(name.split(' ').pop()) && words.length && LATIN_WORD.test(words[0]) && !/^vip$/i.test(words[0])) name += ` ${words.shift()}`;
  let birthday = '';
  for (;;) {
    const stuck = name.match(/^(.+?)(\d{4})$/);
    if (stuck) { birthday = birthday || stuck[2]; name = stuck[1]; continue; }
    const shorter = name.replace(NAME_NOTES, '').replace(HONORIFICS, '').trim();
    // A name is at least two characters, so 林先生 alone stays as it is.
    if (shorter !== name && shorter.length >= 2) { name = shorter; continue; }
    break;
  }
  if (!birthday) birthday = words.find((word) => /^\d{4}$/.test(word)) || '';
  if (!name || name.length > 12) return null;
  return { student: name, birthday, change };
}

/**
 * A title on the teacher's own calendar. 可排 marks a slot still open for booking: it is no class and is not shown.
 * A 1:2 class has two names split by / (王小明/陳小小). Returns null when a name cannot be read.
 */
export function parseOwnTitle(title) {
  const text = String(title || '').replace(/【[^】]*】/g, '').trim();
  if (!text) return null;
  if (/^可排/.test(text)) return { open: true, people: [] };
  const people = text.split(/[/／]/).map(parseTitlePerson);
  if (people.length > 2 || people.some((person) => !person)) return null;
  return { open: false, people };
}

/** The older one-name reading, kept for anything that only needs the name and birthday. */
export function parsePlainTitle(title) {
  const parsed = parseOwnTitle(title);
  if (!parsed || parsed.open || parsed.people.length !== 1) return null;
  return { student: parsed.people[0].student, birthday: parsed.people[0].birthday };
}

/**
 * One calendar event as the bookings the app keeps. A 1:2 class becomes one booking per student, tied by group,
 * so every per-student list (下次上課, new students, plans) keeps working. 可排 gives none. A change such as
 * (病假) stays on the booking as change: the student is found, but it is not a class.
 */
export function bookingsFromEvent(event, teacher) {
  const own = event.calendarKind && event.calendarKind !== 'shared';
  const base = { id: event.id, date: event.date, time: event.time };
  // An old-style title still reads the same way on any calendar.
  const formal = parseBookingTitle(event.title, teacher);
  if (formal) return [{ ...base, student: formal.student, birthday: '', kind: own ? event.calendarKind : formal.kind, unreadable: false, title: '' }];
  if (!own) return [{ ...base, student: '', birthday: '', kind: 'strength', unreadable: isUnreadableBooking(event.title, teacher), title: event.title }];
  const parsed = parseOwnTitle(event.title);
  if (parsed?.open) return [];
  if (!parsed) return [{ ...base, student: '', birthday: '', kind: event.calendarKind, unreadable: true, title: event.title }];
  const pair = parsed.people.length > 1;
  return parsed.people.map((person, index) => ({
    ...base,
    ...(pair ? { id: `${event.id}#${index + 1}`, group: event.id } : {}),
    student: person.student,
    birthday: person.birthday,
    kind: event.calendarKind,
    unreadable: false,
    title: '',
    ...(person.change ? { change: person.change } : {}),
  }));
}

/** A birthday as four digits (月日), or '' when it is not one. */
export function cleanBirthday(text) {
  const digits = String(text || '').replace(/\D/g, '');
  if (digits.length !== 4) return '';
  const month = Number(digits.slice(0, 2));
  const day = Number(digits.slice(2));
  return month >= 1 && month <= 12 && day >= 1 && day <= 31 ? digits : '';
}

/**
 * Which student a booking is for. Same name (or another name for them) first; when the title has a birthday,
 * only the student with that birthday. A title without one belongs to the only student of that name, or else to the
 * only one of them with no birthday recorded. Anything unclear matches nobody rather than the wrong student.
 */
export function studentForEvent(students, event) {
  const name = String(event?.student || '').trim();
  if (!name) return null;
  const same = students.filter((s) => !s.deleted && (s.name === name || (s.aliases || []).includes(name)));
  const birthday = event.birthday || '';
  if (birthday) {
    // A birthday nobody has yet is a new namesake: mixing two people's records would be worse than a new card,
    // which the teacher can still merge into the old one.
    const exact = same.filter((s) => s.birthday === birthday);
    return exact.length === 1 ? exact[0] : null;
  }
  if (same.length === 1) return same[0];
  const plain = same.filter((s) => !s.birthday);
  return plain.length === 1 ? plain[0] : null;
}

/** Several students share this name, all have birthdays, and the title has none: nobody can tell which. */
export function bookingIsUnclear(students, event) {
  if (!event?.student || event.birthday || studentForEvent(students, event)) return false;
  const name = String(event.student).trim();
  return students.filter((s) => !s.deleted && (s.name === name || (s.aliases || []).includes(name))).length > 1;
}

/**
 * Later bookings for someone not in the student list yet, one per person. Creating them before the first class
 * lets a new student's first plan be written ahead (2026-11-17). Unclear or unreadable titles are left out.
 */
export function newStudentBookings(events, students, today) {
  const seen = new Set();
  const result = [];
  for (const event of events) {
    if (!event?.student || event.unreadable || event.date <= today) continue;
    if (studentForEvent(students, event) || bookingIsUnclear(students, event)) continue;
    const key = `${String(event.student).trim()}|${event.birthday || ''}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(event);
  }
  return result;
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
      ? { weight: set.weight, reps: set.reps, spring: springWithoutBar(set.spring) }
      : { weight: set.planWeight, reps: set.planReps, spring: springWithoutBar(set.planSpring) })),
    rpe: null,
    painScore: null,
    painParts: [],
    painMap: {},
    painNote: '',
    quality: null,
    assist: null,
    props: (row.props || []).slice(),
    tags: [],
    // The note written for the exercise when planning goes on to the next plan, like the props (2026-11-26).
    ...(row.planNote ? { planNote: row.planNote } : {}),
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
    const rows = JSON.parse(JSON.stringify(plan.rows));
    // A plan saved before the Reformer bar went (2026-11-26) is written the new way too.
    for (const row of rows) {
      for (const set of row.sets || []) {
        if (set.spring) set.spring = springWithoutBar(set.spring);
        if (set.planSpring) set.planSpring = springWithoutBar(set.planSpring);
      }
    }
    return rows;
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

/**
 * Which class a later booking will be (2026-11-25, for the 今日 calendar). It is the next number, moved on by one
 * when a class today comes first and is not finished yet; after the last class of a term it starts again from 1.
 * bookedToday: the student has a class today that is not on leave.
 */
export function laterClassNumber(student, sessions, today, bookedToday, staffId = '', staff = []) {
  const step = (count) => (count.no + 1 > count.size ? { no: 1, size: count.size } : { no: count.no + 1, size: count.size });
  // With colleagues, the class booked today is this teacher's own (2026-11-26).
  const own = (s) => !staffId || classTeacherId(s, staff) === staffId;
  const open = sessions.find((s) => s.studentId === student.id && s.date === today && s.status !== 'done' && !s.deleted && own(s));
  if (open?.classNo) return step({ no: open.classNo, size: open.packageSize || termFor(student, staffId, staff).packageSize || PACKAGE_SIZES[0] });
  const history = doneSessions(sessions, student.id);
  const next = classCountFor(history, student, staffId, staff);
  const finishedToday = history.some((s) => s.date === today && own(s));
  return (bookedToday || open) && !finishedToday ? step(next) : { no: next.no, size: next.size };
}

/**
 * The 學生 tab (2026-11-25): a graduated student is archived, folded away at the bottom with every record kept.
 * A search looks through everyone, archived students included, so an old student is never lost.
 */
export function studentGroups(students, query = '') {
  const text = query.trim();
  const matches = students
    .filter((s) => !s.deleted && (!text || s.name.includes(text)))
    .sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant'));
  return { active: matches.filter((s) => !s.archived), archived: matches.filter((s) => s.archived) };
}

/*
 * Colleagues and login codes (2026-11-25, multi-user batch 1, part 1). A colleague is an `options` record of type
 * 'staff' (so it syncs like the other lists, with no new database table): { id, type: 'staff', name, role, codeHash,
 * disabled }. The code itself is shown once, when it is made, and only its hash is kept. Until the first colleague
 * exists the app works as before, without any login.
 */
export const STAFF_ROLES = [['teacher', '老師'], ['admin', '管理者']];
// Letters and digits that cannot be mistaken for one another when read off an email: no I, L, O, 0 or 1.
export const LOGIN_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 8;

/** A new code, 'K7QM-4XPA'. randomByte() gives 0–255; bytes past the last whole round of the alphabet are skipped. */
export function makeLoginCode(randomByte) {
  const limit = 256 - (256 % LOGIN_ALPHABET.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    const byte = randomByte();
    if (byte < limit) code += LOGIN_ALPHABET[byte % LOGIN_ALPHABET.length];
  }
  return `${code.slice(0, 4)}-${code.slice(4)}`;
}

/** What someone typed or pasted, as the 8 letters the hash is made from; '' when it cannot be a code. */
export function normalizeLoginCode(input) {
  const letters = String(input || '').toUpperCase().replace(/[\s\-–—_.]/g, '');
  return letters.length === CODE_LENGTH && [...letters].every((ch) => LOGIN_ALPHABET.includes(ch)) ? letters : '';
}

/** The stored fingerprint of a code. Salted with the colleague's id, so two people never share a hash. */
export async function hashLoginCode(code, salt) {
  const bytes = new TextEncoder().encode(`training-record:${salt}:${normalizeLoginCode(code)}`);
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function staffList(options) {
  return options.filter((o) => o.type === 'staff' && !o.deleted);
}

/** Multi-user mode starts with the first colleague who can sign in. */
export function multiUserOn(staff) {
  return staff.some((s) => !s.disabled);
}

/**
 * The colleague signed in on this device, or null (none, or disabled since). `login` is what this device keeps:
 * { id, name, role } (or only the id). Right after a first sign-in the colleague list may not have arrived yet, so
 * the name and role kept at sign-in stand in until it does.
 */
export function signedInStaff(staff, login) {
  const id = typeof login === 'string' ? login : login?.id;
  if (!id) return null;
  const person = staff.find((s) => s.id === id);
  if (person) return person.disabled ? null : person;
  return login?.name ? { id, name: login.name, role: login.role === 'admin' ? 'admin' : 'teacher' } : null;
}

/** `required`: the cloud has said this device must sign in, even before the colleague list reached it. */
export function needsLogin(staff, login, required = false) {
  return (multiUserOn(staff) || !!required) && !signedInStaff(staff, login);
}

/** Checks a typed code. reason: 'ok', 'format' (not 8 letters), 'disabled', or 'unknown'. */
export async function checkLoginCode(staff, input) {
  if (!normalizeLoginCode(input)) return { reason: 'format', staff: null };
  for (const person of staff) {
    if (person.codeHash && person.codeHash === await hashLoginCode(input, person.id)) {
      return person.disabled ? { reason: 'disabled', staff: null } : { reason: 'ok', staff: person };
    }
  }
  return { reason: 'unknown', staff: null };
}

/** Disabling someone may never lock the team out: not yourself, and never the last admin who can sign in. */
export function canDisableStaff(staff, target, me) {
  if (target.disabled) return { ok: false, reason: '已經停用了' };
  if (target.id === me?.id) return { ok: false, reason: '不能停用自己' };
  const admins = staff.filter((s) => s.role === 'admin' && !s.disabled);
  if (target.role === 'admin' && admins.length <= 1) return { ok: false, reason: '至少要留一位管理者' };
  return { ok: true, reason: '' };
}

/**
 * A new name or role for a colleague. Names stay unique, nobody changes their own role (another admin does), and
 * the last admin who can sign in stays an admin.
 */
export function canEditStaff(staff, target, me, next) {
  const name = String(next.name || '').trim();
  if (!name) return { ok: false, reason: '請輸入姓名' };
  if (staff.some((s) => s.id !== target.id && s.name === name)) return { ok: false, reason: `已經有${name}了` };
  if (next.role !== target.role) {
    if (target.id === me?.id) return { ok: false, reason: '不能改自己的身分，請另一位管理者改' };
    const admins = staff.filter((s) => s.role === 'admin' && !s.disabled);
    if (target.role === 'admin' && !target.disabled && admins.length <= 1) return { ok: false, reason: '至少要留一位管理者' };
  }
  return { ok: true, reason: '' };
}

/**
 * Only an admin deletes a student once colleagues share the app; before that the teacher alone decides (2026-11-25).
 * Whoever is signed in decides by role, even on a device the colleague list has not reached yet.
 */
export function canDeleteStudent(staff, me) {
  return me ? me.role === 'admin' : !multiUserOn(staff);
}

/**
 * A deleted student can be brought back for 30 days (2026-11-25: 只有管理者能刪除學生，30 天內可以復原).
 * The student and every record deleted with them carry deletedWith (the student's id) and the same deletedAt; after
 * 30 days any device clears what they held (purged) and only the empty records stay.
 */
export const DELETE_KEEP_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

function deletedOnPurpose(student) {
  return !!student?.deleted && student.deletedWith === student.id && !!student.deletedAt && !student.purged;
}

export function isRestorable(student, now = Date.now()) {
  return deletedOnPurpose(student) && now - student.deletedAt < DELETE_KEEP_DAYS * DAY_MS;
}

/** Whole days left to bring a deleted student back, at least 1 while it still can be. */
export function restoreDaysLeft(student, now = Date.now()) {
  return Math.max(1, Math.ceil((student.deletedAt + DELETE_KEEP_DAYS * DAY_MS - now) / DAY_MS));
}

/** Students that can still be brought back, the latest deleted first. */
export function recentlyDeleted(students, now = Date.now()) {
  return students.filter((s) => isRestorable(s, now)).sort((a, b) => b.deletedAt - a.deletedAt);
}

/** Students deleted 30 days ago or more whose content is still kept. */
export function dueForPurge(students, now = Date.now()) {
  return students.filter((s) => deletedOnPurpose(s) && now - s.deletedAt >= DELETE_KEEP_DAYS * DAY_MS);
}

/**
 * The deleted student a booking is for, while they can still be brought back. Such a booking does not make a new
 * student card, or bringing the old one back would leave two of the same name. A birthday in the title must match.
 */
export function deletedForBooking(students, event, now = Date.now()) {
  const name = String(event?.student || '').trim();
  if (!name || studentForEvent(students, event)) return null;
  const same = recentlyDeleted(students, now).filter((s) => s.name === name || (s.aliases || []).includes(name));
  return (event.birthday ? same.find((s) => s.birthday === event.birthday) : same[0]) || null;
}

/**
 * Who opened or changed which student (2026-11-25). The Apps Script writes each entry from the login code of the
 * request, and the same person doing the same thing to the same student within 30 minutes is one entry (at to to).
 */
export const SEEN_GAP_MS = 30 * 60 * 1000;

const LOG_WHAT = { students: '改了學生資料', plans: '改了課表', photos: '改了照片影片', assign: '改了負責老師' };
const LOG_ACT = { view: '看過', add: '新增學生', delete: '刪除學生', restore: '復原學生', merge: '併入另一位學生' };
// Two teachers changed the same field before either saw the other's (2026-11-26, v47); the older one gave way.
const CONFLICT_TEXT = '和別人同時改了';

// Which part of the student details a field is (2026-11-26: App 記下誰改了什麼). Unlisted fields are bookkeeping.
const FIELD_PARTS = {
  name: '姓名', aliases: '日曆其他寫法', birthday: '生日', job: '生活與運動', sports: '生活與運動', dailyNeeds: '生活與運動',
  contraindications: '疼痛與禁忌', pain: '疼痛與禁忌', goal: '訓練目標', nextNotes: '下次要注意', assessments: '動作問題',
  bodyComp: '身體組成', packageSize: '第幾堂', classStart: '第幾堂', classCount: '第幾堂', nextClassDate: '下次上課',
  nextClassTime: '下次上課', archived: '封存',
};

/** The parts of the student details a log entry changed, each once: ['訓練目標', '疼痛與禁忌']. */
export function changedParts(fields = []) {
  return [...new Set(fields.map((f) => FIELD_PARTS[f] || (f.startsWith('term_') ? '第幾堂' : '')).filter(Boolean))];
}

export function logActText(entry) {
  if (entry.act === 'conflict') {
    const parts = changedParts((entry.lost || []).map((l) => String(l.field || '').split(':')[0]));
    return `${CONFLICT_TEXT}${parts.join('、') || '學生資料'}，留下比較新的`;
  }
  if (entry.act !== 'edit') return LOG_ACT[entry.act] || '';
  if (entry.what === 'sessions') return entry.day ? `改了 ${dateWithWeek(entry.day)} 的上課紀錄` : '改了上課紀錄';
  const parts = entry.what === 'students' ? changedParts(entry.fields) : [];
  if (parts.length) return `改了${parts.join('、')}`;
  return LOG_WHAT[entry.what] || '改了資料';
}

function clock(ms) {
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** 14:03, or 14:03–14:50 when the entry spans a while. */
export function logTimeText(entry) {
  const from = clock(entry.at);
  const to = entry.to ? clock(entry.to) : from;
  return to === from ? from : `${from}–${to}`;
}

const LOST_LIMIT = 300;

function shortText(text) {
  const value = String(text).trim();
  return value.length > LOST_LIMIT ? `${value.slice(0, LOST_LIMIT)}…` : value;
}

/**
 * What a change that gave way said, for the access log (2026-11-26: 舊的在「誰改過」看得到). Text shows as it was;
 * the pain map as its parts and notes; a movement-problem assessment as its date and problems.
 */
export function lostValueText(field, value) {
  if (value === null || value === undefined || value === '') return '（空白）';
  // The cloud keeps at most 4000 characters of the JSON; a long text shows its start.
  if (typeof value === 'object' && !Array.isArray(value) && typeof value.clipped === 'string') {
    return shortText(value.clipped.replace(/^"/, '').replace(/\\n/g, '\n').replace(/\\"/g, '"'));
  }
  const name = String(field || '').split(':')[0];
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return shortText(value) || '（空白）';
  if (Array.isArray(value) && value.every((v) => typeof v === 'string' || typeof v === 'number')) return shortText(value.join('、')) || '（空白）';
  if (name === 'pain' && typeof value === 'object') return shortText([painText(value), painNoteText(value)].filter(Boolean).join('；')) || '（空白）';
  if (name === 'assessments' && typeof value === 'object') {
    const problems = (value.problems || []).map((p) => p?.text).filter(Boolean);
    return shortText([value.date, problems.join('、'), value.summary].filter(Boolean).join('：')) || '（空白）';
  }
  if (name === 'bodyComp' && typeof value === 'object') {
    return shortText([value.date, value.weight && `體重 ${value.weight}`, value.fat && `體脂 ${value.fat}`, value.muscle && `肌肉量 ${value.muscle}`].filter(Boolean).join(' ')) || '（空白）';
  }
  return '（表格內容，畫面上無法顯示）';
}

/** One lost value's heading: 「被蓋掉的訓練目標（老師乙 14:03 改的）」. `who` is whoever wrote it, or '' when unknown. */
export function lostValueLabel(lost, who) {
  const part = changedParts([String(lost.field || '').split(':')[0]])[0] || '內容';
  return `被蓋掉的${part}（${who || '另一位'}${lost.at ? ` ${clock(lost.at)}` : ''} 改的）`;
}

/**
 * Who wrote a value that gave way (2026-11-26). The entry's own colleague when it was theirs; otherwise the colleague
 * whose logged change of that student's field covers its time. '' when the log does not say.
 */
export function lostValueWriter(entries, entry, lost) {
  if (lost.mine) return entry.by;
  const field = String(lost.field || '').split(':')[0];
  const match = entries.find((e) => e !== entry && e.act === 'edit' && e.what === 'students' && e.student === entry.student
    && e.by !== entry.by && (e.fields || []).includes(field) && e.at <= lost.at && lost.at <= (e.to || e.at));
  return match ? match.by : '';
}

/**
 * What waits on this iPad for the cloud (2026-11-26, v47 不怕丟資料). Each queued change carries who was signed in
 * (`by`, '' before colleagues); only that person's go up, so a shared iPad never sends one teacher's class under the
 * next one's login, which the cloud would refuse. Changes someone else left wait for them, counted by person.
 */
export const LATE_UPLOAD_MS = 24 * 60 * 60 * 1000;

export function sendsNow(item, signedInId = '') {
  return !item.by || item.by === (signedInId || '');
}

/** { mine, others: { staffId: n }, oldest, late }: late once one's own change has waited a day. */
export function waitingSummary(items, signedInId = '', now = Date.now()) {
  let mine = 0;
  let oldest = 0;
  const others = {};
  for (const item of items) {
    if (sendsNow(item, signedInId)) {
      mine += 1;
      const at = item.at || now;
      if (!oldest || at < oldest) oldest = at;
    } else others[item.by] = (others[item.by] || 0) + 1;
  }
  return { mine, others, oldest, late: mine > 0 && now - oldest >= LATE_UPLOAD_MS };
}

function nameIn(staff, id) {
  return staff.find((p) => p.id === id)?.name || '另一位同事';
}

/** 「另外有老師甲的 3 筆紀錄，等老師甲在這台 iPad 登入後上傳」, or '' when nobody else left any. */
export function othersWaitingText(others = {}, staff = []) {
  const rows = Object.entries(others || {}).filter(([, n]) => n > 0);
  if (!rows.length) return '';
  if (rows.length === 1) {
    const name = nameIn(staff, rows[0][0]);
    return `另外有${name}的 ${rows[0][1]} 筆紀錄，等${name}在這台 iPad 登入後上傳`;
  }
  return `另外有${rows.map(([id, n]) => `${nameIn(staff, id)} ${n} 筆`).join('、')}紀錄，等他們在這台 iPad 登入後上傳`;
}

/** 今天 14:03、昨天 09:10、11/20（6 天前）. */
export function lastSyncText(at, now = Date.now()) {
  if (!at) return '還沒同步過';
  const day = (ms) => { const d = new Date(ms); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  const days = Math.round((day(now) - day(at)) / DAY_MS);
  if (days <= 0) return `今天 ${clock(at)}`;
  if (days === 1) return `昨天 ${clock(at)}`;
  const d = new Date(at);
  return `${d.getMonth() + 1}/${d.getDate()}（${days} 天前）`;
}

/**
 * One colleague as the cloud last heard of them (2026-11-26), for the admin before disabling someone: when they last
 * synced, and what their iPads still held then. A shared iPad counts by its latest report, so what one teacher left
 * there is counted once even after several others signed in.
 */
export function deviceSummary(devices = [], staffId = '', now = Date.now()) {
  let lastAt = 0;
  const latest = new Map();
  for (const d of devices || []) {
    if (!d || !d.id) continue;
    if (d.by === staffId && d.at > lastAt) lastAt = d.at;
    if (!latest.has(d.id) || d.at > latest.get(d.id).at) latest.set(d.id, d);
  }
  let records = 0;
  let photos = 0;
  for (const d of latest.values()) {
    if (d.by === staffId) { records += d.records || 0; photos += d.photos || 0; }
    else records += (d.others || {})[staffId] || 0;
  }
  return { lastAt, records, photos, text: lastSyncText(lastAt, now) };
}

/** 「還有 3 筆紀錄、1 個照片影片沒上傳」, or ''. */
export function leftText(records = 0, photos = 0) {
  const bits = [records > 0 && `${records} 筆紀錄`, photos > 0 && `${photos} 個照片影片`].filter(Boolean);
  return bits.length ? `還有 ${bits.join('、')}沒上傳` : '';
}

/** Entries by day (the day each one began), the latest day and entry first. */
export function logDays(entries) {
  const days = new Map();
  for (const entry of [...entries].sort((a, b) => (b.to || b.at) - (a.to || a.at))) {
    const day = dateKey(new Date(entry.at));
    if (!days.has(day)) days.set(day, []);
    days.get(day).push(entry);
  }
  return [...days.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([day, list]) => ({ day, entries: list }));
}

/**
 * Who teaches whom (2026-11-24): one record per student and colleague in options, so two iPads adding different
 * teachers never overwrite each other. A removed teacher keeps the record with deleted set, which syncs the removal.
 */
export function assignmentId(studentId, staffId) {
  return `as_${studentId}_${staffId}`;
}

/**
 * Who taught a class. Classes carry the colleague signed in when they began (2026-11-24); classes from before
 * colleagues shared the app were all taught by the teacher who set it up, the first admin. '' when unknown.
 */
export function classTeacherId(session, staff) {
  return session?.staffId || staff.find((s) => s.first)?.id || '';
}

/**
 * Whether the person using this iPad may change a class (2026-11-26: 其他老師的上課紀錄看得到，但只能改自己上的課).
 * Admins too: they see everyone's classes but change only their own. Before colleagues, everything is the teacher's.
 */
export function ownsClass(session, staff, me) {
  return !me || classTeacherId(session, staff) === me.id;
}

/**
 * Each teacher plans their own next class (2026-11-26): the strength teacher's plan is not the Pilates teacher's.
 * The first admin keeps the plans from before, named by the student; anyone else's is named `student~teacher`.
 */
export function planIdFor(studentId, staffId, staff) {
  if (!staffId || staff.find((s) => s.first)?.id === staffId) return studentId;
  return `${studentId}~${staffId}`;
}

/** Whose student a plan is for: plans from before are named by the student. */
export function planStudentId(plan) {
  return plan?.studentId || plan?.id || '';
}

/**
 * The classes a teacher starts a class or a plan from: their own, newest first. Without any of their own yet (a new
 * teacher, a substitute) the student's classes of the same kind, so a Pilates teacher does not start from squats.
 */
export function ownHistory(history, staff, me, kind = '') {
  if (!me) return history;
  const own = history.filter((s) => classTeacherId(s, staff) === me.id);
  if (own.length) return own;
  return kind ? history.filter((s) => s.kind === kind) : history;
}

/*
 * 第幾堂 (2026-11-25 sixth form): a student's teachers count together, or each their own (各算各的: every teacher
 * counts from class 1 and has their own term size). The first admin keeps the student's own packageSize and
 * classStart; another teacher's sit in `term_<id>`, a field of its own so two iPads never overwrite each other's.
 */
export function countsSeparately(student) {
  return student?.classCount === 'separate';
}

function ownTerm(student, staffId, staff) {
  return countsSeparately(student) && staffId && staff.find((s) => s.first)?.id !== staffId;
}

/** The term size and hand-set start a teacher counts with. */
export function termFor(student, staffId, staff) {
  if (!ownTerm(student, staffId, staff)) return { packageSize: student?.packageSize, classStart: student?.classStart || null };
  const own = student[`term_${staffId}`] || {};
  return { packageSize: own.packageSize || student.packageSize, classStart: own.classStart || null };
}

/** The fields to save for a teacher's term size or start. */
export function termFields(student, staffId, staff, term) {
  if (!ownTerm(student, staffId, staff)) return term;
  return { [`term_${staffId}`]: { ...(student[`term_${staffId}`] || {}), ...term } };
}

/** The classes that count towards a teacher's number. */
export function countedClasses(history, student, staffId, staff) {
  return countsSeparately(student) && staffId ? history.filter((s) => classTeacherId(s, staff) === staffId) : history;
}

/** The number a teacher's next class gets, counted together or on its own. */
export function classCountFor(history, student, staffId, staff) {
  return nextClassNumber(countedClasses(history, student, staffId, staff), { ...student, ...termFor(student, staffId, staff) });
}

/**
 * Whose count a screen shows: the colleague using the iPad, unless the student counts separately and someone else
 * teaches them (an admin looking in), then the teacher of the latest class.
 */
export function countViewerId(student, history, staff, me, teacherIds = []) {
  if (!me) return '';
  if (!countsSeparately(student) || teacherIds.includes(me.id)) return me.id;
  if (history.some((s) => classTeacherId(s, staff) === me.id)) return me.id;
  return classTeacherId(history[0], staff) || me.id;
}

/** The classes of the term running now, newest first: back to the latest class numbered 1. */
export function currentTermClasses(history) {
  const start = history.findIndex((s) => s.classNo === 1);
  return start === -1 ? history : history.slice(0, start + 1);
}

/**
 * Switching to 各算各的 (2026-11-26: 中途換的話要有機制防止記錯堂數). The numbers so far were shared, so each teacher's
 * next number is worked out again from their own classes of this term only: a teacher who joined at class 9 and
 * taught twice goes on with class 3, not 11. The teachers check it once before the switch is saved.
 */
export function separateStart(history, staffId, staff, size) {
  const own = currentTermClasses(history).filter((s) => classTeacherId(s, staff) === staffId);
  return { no: (own.length % size) + 1, size, taught: own.length, last: own[0] || null };
}

/** Switching back to 一起算: everyone goes on from the latest class, whoever taught it. */
export function togetherStart(history, student) {
  const next = nextClassNumber(history, { ...student, classStart: null });
  return { no: next.no, size: next.size, last: history[0] || null };
}

/**
 * Whether a class was numbered before the student's count last switched between 一起算 and 各算各的, so its number
 * follows the other way of counting (乙's 第 10 堂 under 一起算 is followed by their 第 3 堂). A class on the day of the
 * switch counts as before when it was last saved before it.
 */
export function numberedBeforeSwitch(student, session) {
  const at = student?.classCount ? student.fieldAt?.classCount : 0;
  if (!at || !session?.date) return false;
  const day = dateKey(new Date(at));
  return session.date < day || (session.date === day && (session.updatedAt || 0) <= at);
}

/**
 * Whether this iPad makes a class's PDF. Only the teacher who taught it has their signature on their iPad, so each
 * makes their own; an admin also makes those of colleagues who can no longer sign in, so none is left undone.
 */
export function makesRecordFor(session, staff, me) {
  if (!me) return true;
  const id = classTeacherId(session, staff);
  return id === me.id || (me.role === 'admin' && !staff.some((s) => s.id === id && !s.disabled));
}

/** The ids of the colleagues teaching a student, in the order they were added. */
export function teachersOf(options, studentId) {
  return options.filter((o) => o.type === 'assign' && !o.deleted && o.studentId === studentId).map((o) => o.staffId);
}

/**
 * The students this colleague sees (2026-11-24): a teacher their own; an admin their own plus anyone left without a
 * teacher who can sign in, so nobody goes missing, or everybody with `everyone`. Before anyone signs in (one teacher,
 * no colleagues yet) every student shows. Demo students are on each iPad for practice and show for everyone.
 */
export function visibleStudents(students, options, staff, me, everyone = false) {
  if (!me || (me.role === 'admin' && everyone)) return students;
  const active = new Set(staff.filter((s) => !s.disabled).map((s) => s.id));
  const teachers = new Map();
  for (const o of options) {
    if (o.type !== 'assign' || o.deleted) continue;
    if (!teachers.has(o.studentId)) teachers.set(o.studentId, []);
    teachers.get(o.studentId).push(o.staffId);
  }
  return students.filter((student) => {
    if (student.demo) return true;
    const ids = teachers.get(student.id) || [];
    if (ids.includes(me.id)) return true;
    return me.role === 'admin' && !ids.some((id) => active.has(id));
  });
}

/** The pairing code as Apps Script prints it: URL-safe base64 of JSON. Also carries a colleague's login (part 2). */
export function encodePairing(value) {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Reads a pairing code, alone or inside the whole letter an admin sent (the longest run of code letters wins).
 * Returns null when there is none.
 */
export function decodePairing(text) {
  const runs = String(text || '').match(/[A-Za-z0-9_-]{40,}={0,2}/g) || [];
  for (const run of runs.sort((a, b) => b.length - a.length)) {
    try {
      const plain = run.replace(/=+$/, '').replace(/-/g, '+').replace(/_/g, '/');
      const bytes = Uint8Array.from(atob(plain + '='.repeat((4 - (plain.length % 4)) % 4)), (c) => c.charCodeAt(0));
      const value = JSON.parse(new TextDecoder().decode(bytes));
      if (value?.url && value?.key) return value;
    } catch { /* not this run */ }
  }
  return null;
}

/** A colleague's invitation: this device's connection, their own name, and their login code. */
export function invitationCode(connection, person, code) {
  return encodePairing({ ...connection, teacher: person.name, staff: { id: person.id, code: normalizeLoginCode(code) } });
}

export function addDays(key, days) {
  const [y, m, d] = key.split('-').map(Number);
  return dateKey(new Date(y, m - 1, d + days));
}

export function dateWithWeek(key) {
  const [y, m, d] = key.split('-').map(Number);
  return `${m}/${d}（${'日一二三四五六'[new Date(y, m - 1, d).getDay()]}）`;
}

/** The student's first booking after a day, read from the calendar. A booking marked 病假 or the like is not a class. */
export function nextBooking(student, events, today, students = [student]) {
  return events
    .filter((e) => {
      if (e.date <= today || e.change) return false;
      const found = studentForEvent(students, e);
      return !!found && (found === student || (found.id && found.id === student.id));
    })
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] || null;
}

/**
 * The next class. The company calendar wins (2026-11-09): when it holds this student's next booking, that date
 * and time show everywhere, so a booking moved in the calendar never leaves an old time in the app.
 * A date picked in the app only counts while the calendar has no booking for the student yet.
 * source: 'calendar' | 'teacher' | '' (nothing known).
 */
export function nextClassInfo(student, events, today, students = [student]) {
  const booking = nextBooking(student, events, today, students);
  if (booking) return { date: booking.date, time: booking.time || '', confirmed: true, source: 'calendar' };
  if (student.nextClassDate > today) {
    return { date: student.nextClassDate, time: student.nextClassTime || '', confirmed: true, source: 'teacher' };
  }
  return { date: '', time: '', confirmed: false, source: '' };
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

/** Builds spring notation in the teacher's own format: 1r1b m, 1kT 1gL, 1y1rl. Colours follow the apparatus order. */
export function springToText(spring, apparatus) {
  const order = [...new Set([...springSet(apparatus).colors, ...SPRING_ORDER])];
  const holes = spring.holes || {};
  const used = order.filter((c) => spring.counts[c] > 0);
  const withHoles = used.some((c) => holes[c]);
  const counts = used.map((c) => `${spring.counts[c]}${c}${holes[c] || ''}`).join(withHoles ? ' ' : '');
  return spring.bar ? `${counts}${counts ? ' ' : ''}${spring.bar}` : counts;
}

export function springFromText(text) {
  const spring = { counts: Object.fromEntries(SPRING_ORDER.map((c) => [c, 0])), holes: {}, bar: '' };
  const value = String(text || '');
  for (const match of value.matchAll(/(\d+)(rs|rl|[rbypkg])([THML]?)/g)) {
    spring.counts[match[2]] = Number(match[1]);
    if (match[3]) spring.holes[match[2]] = match[3];
  }
  const bar = value.match(/(?:^|\s)([lmhTHML])\s*$/);
  if (bar && /[lmh]/.test(bar[1])) spring.bar = bar[1];
  // v21 wrote one Chair hole for every colour at the end (1k1g T); it now belongs to each colour without one.
  if (bar && /[THML]/.test(bar[1])) {
    for (const c of SPRING_ORDER) if (spring.counts[c] > 0 && !spring.holes[c]) spring.holes[c] = bar[1];
  }
  return spring;
}

/**
 * A saved setting with only what this apparatus has, so an old Reformer value with a bar (2r1b m) reads 2r1b now
 * that the bar is gone (2026-11-26). Colours and holes of another apparatus are left out too.
 */
export function springForApparatus(text, apparatus) {
  const spring = springFromText(text);
  const set = springSet(apparatus);
  return springToText({
    counts: Object.fromEntries(set.colors.map((c) => [c, spring.counts[c] || 0])),
    holes: Object.fromEntries(set.colors.filter((c) => set.holes.includes(spring.holes[c])).map((c) => [c, spring.holes[c]])),
    bar: set.positions.includes(spring.bar) ? spring.bar : '',
  }, apparatus);
}

/**
 * The Reformer bar left out of an old setting (2r1b m → 2r1b), for a plan made from an earlier class. Chair holes are
 * capitals and stay. No apparatus has a bar any more, so this needs no apparatus.
 */
export function springWithoutBar(text) {
  const value = String(text || '');
  return springFromText(value).bar ? value.replace(/\s*[lmh]\s*$/, '') : value;
}

/** Whether a saved setting can be used on an apparatus, so Chair presets never show on the Reformer. */
export function springFits(text, apparatus) {
  const spring = springFromText(text);
  const set = springSet(apparatus);
  const used = SPRING_ORDER.filter((c) => spring.counts[c] > 0);
  return used.every((c) => set.colors.includes(c))
    && Object.values(spring.holes).every((hole) => set.holes.includes(hole))
    && (!spring.bar || set.positions.includes(spring.bar));
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

/*
 * Student details merge field by field (2026-11-26). With several teachers on one student, two iPads changing
 * different fields (one the goal, the other the pain map) both keep their change; only the same field changed in both
 * places goes to the later one. Each record carries fieldAt: when each field last changed. The lists of movement
 * assessments and body measurements go one item further (`assessments:as_1`), so two teachers each adding one keep
 * both; an item taken out leaves its time behind, so it stays out. Records from before have no fieldAt and count as
 * changed all at once at updatedAt. The Apps Script does the same (mergeStudent_ in Code.gs).
 */
export const STUDENT_LIST_FIELDS = { assessments: 'id', bodyComp: 'date' };
const STUDENT_META = new Set(['id', 'updatedAt', 'fieldAt']);

/** JSON with object keys sorted, so the same value written in a different key order counts as the same. */
export function stableJson(value) {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().filter((k) => value[k] !== undefined).map((k) => `${JSON.stringify(k)}:${stableJson(value[k])}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

const sameValue = (a, b) => stableJson(a) === stableJson(b);
const fieldKeys = (record) => Object.keys(record || {}).filter((k) => !STUDENT_META.has(k));
const listItems = (list, by) => (Array.isArray(list) && list.every((item) => item && item[by] !== undefined && item[by] !== null)
  ? new Map(list.map((item) => [String(item[by]), item])) : null);
const hasItemTimes = (record, field) => Object.keys(record?.fieldAt || {}).some((k) => k.startsWith(`${field}:`));

/** When a field last changed in this copy; a copy from before fieldAt changed everything at updatedAt. */
function fieldTime(record, key) {
  if (!record.fieldAt) return record.updatedAt || 0;
  return record.fieldAt[key] ?? -1;
}

/** The times of the fields a save changed, on top of what the copy before it had. */
export function stampFields(before, after, now) {
  const fieldAt = before ? { ...(before.fieldAt || Object.fromEntries(fieldKeys(before).map((k) => [k, before.updatedAt || 0]))) } : {};
  const keys = new Set([...fieldKeys(before), ...fieldKeys(after)]);
  for (const key of keys) {
    const changed = !before || !sameValue(before[key], after[key]);
    if (!changed) continue;
    const by = STUDENT_LIST_FIELDS[key];
    const items = by && listItems(after[key] || [], by);
    if (items) {
      const was = (before && listItems(before[key] || [], by)) || new Map();
      // The first time a list gets item times, the items nobody touched keep the list's old time.
      const first = !hasItemTimes({ fieldAt }, key);
      const old = Math.max(fieldAt[key] ?? 0, 0);
      for (const id of new Set([...was.keys(), ...items.keys()])) {
        if (!sameValue(was.get(id), items.get(id))) fieldAt[`${key}:${id}`] = now;
        else if (first) fieldAt[`${key}:${id}`] = old;
      }
    }
    fieldAt[key] = now;
  }
  return fieldAt;
}

function mergeList(a, b, key, fieldAt) {
  const by = STUDENT_LIST_FIELDS[key];
  const itemsA = listItems(a[key], by) || new Map();
  const itemsB = listItems(b[key], by) || new Map();
  const itemTime = (record, items, id) => {
    const stamp = record.fieldAt?.[`${key}:${id}`];
    if (stamp !== undefined) return stamp;
    // With item times, an item this copy never had is one it did not know about; without, the list is as of its time.
    if (hasItemTimes(record, key)) return items.has(id) ? fieldTime(record, key) : -1;
    return fieldTime(record, key);
  };
  const ids = new Set([...itemsA.keys(), ...itemsB.keys(),
    ...[a, b].flatMap((r) => Object.keys(r.fieldAt || {}).filter((k) => k.startsWith(`${key}:`)).map((k) => k.slice(key.length + 1)))]);
  const kept = new Map();
  for (const id of ids) {
    const ta = itemTime(a, itemsA, id);
    const tb = itemTime(b, itemsB, id);
    const win = tb >= ta ? itemsB : itemsA;
    if (Math.max(ta, tb) >= 0) fieldAt[`${key}:${id}`] = Math.max(ta, tb);
    if (win.has(id)) kept.set(id, win.get(id));
  }
  // The newer copy's order, then anything only the other copy has.
  const first = fieldTime(b, key) >= fieldTime(a, key) ? itemsB : itemsA;
  const order = [...first.keys(), ...ids];
  return [...new Set(order)].filter((id) => kept.has(id)).map((id) => kept.get(id));
}

/** One copy of a student from two, field by field; on a tie the incoming copy b wins. A cleared copy wins outright. */
export function mergeStudent(a, b) {
  if (!a) return b;
  if (!b) return a;
  if (a.purged || b.purged) return b.purged ? b : a;
  const out = { id: b.id };
  const fieldAt = {};
  const keys = new Set([...fieldKeys(a), ...fieldKeys(b),
    ...[a, b].flatMap((r) => Object.keys(r.fieldAt || {}).filter((k) => !k.includes(':')))]);
  for (const key of keys) {
    const ta = fieldTime(a, key);
    const tb = fieldTime(b, key);
    const win = tb >= ta ? b : a;
    if (Math.max(ta, tb) >= 0) fieldAt[key] = Math.max(ta, tb);
    const by = STUDENT_LIST_FIELDS[key];
    if (by && listItems(a[key] || [], by) && listItems(b[key] || [], by) && (hasItemTimes(a, key) || hasItemTimes(b, key))) {
      const list = mergeList(a, b, key, fieldAt);
      if (key in win || list.length) out[key] = list;
    } else if (key in win) out[key] = win[key];
  }
  out.updatedAt = Math.max(a.updatedAt || 0, b.updatedAt || 0);
  out.fieldAt = fieldAt;
  return out;
}

/** Same content, leaving out when it and its fields were saved. */
export function sameStudent(a, b) {
  const strip = (r) => r && Object.fromEntries(Object.entries(r).filter(([k]) => k !== 'updatedAt' && k !== 'fieldAt'));
  return stableJson(strip(a)) === stableJson(strip(b));
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

/** The release on screen in 設定. Must match VERSION in sw.js (a test checks). */
export const APP_VERSION = 'v49';

// How Pilates exercises are classified, so the right one can be found in a few taps.
export const PILATES_REGIONS = ['下肢', '核心', '脊椎', '肩臂', '全身'];
export const PILATES_POSTURES = ['仰躺', '俯趴', '側躺', '坐姿', '跪姿', '四足', '平板', '站姿', '弓箭步'];
// 2026-11-07: 穩定 and 活動度 are the body areas the handout names; 重點 keeps only 協調 and 平衡 (docs/皮拉提斯動作分類.md).
export const PILATES_FOCUS = ['協調', '平衡'];
export const PILATES_STABILITY = ['軀幹中立', '軀幹屈曲', '軀幹伸展', '軀幹旋轉', '軀幹側彎', '骨盆', '肩胛', '手臂', '下肢'];
export const PILATES_MOBILITY = ['髖', '膝', '踝', '脊椎屈曲', '脊椎伸展', '脊椎旋轉', '脊椎側彎', '脊椎', '骨盆', '肩胛', '肩', '肘'];
/** Classification fields that hold several values each. */
export const PILATES_LIST_KEYS = ['stability', 'mobility', 'focus'];
export const PILATES_LEVELS = ['入門', '中階', '進階'];

/**
 * 2026-11-09 穩定's 脊椎 joined 軀幹. Exercises classified before then (or edited by hand) still say 脊椎:
 * it becomes 軀幹 held the ways the spine moves in 活動度, else 軀幹屈曲, as the handout import now does
 * for "spine during articulation". Re-importing the handout gives the exact words-based result.
 */
export function legacySpine(tags) {
  const list = Array.isArray(tags.stability) ? tags.stability : [];
  if (!list.includes('脊椎')) return list;
  const moves = (Array.isArray(tags.mobility) ? tags.mobility : []).filter((m) => typeof m === 'string' && m.startsWith('脊椎') && m !== '脊椎');
  const holds = moves.length ? moves.map((m) => '軀幹' + m.slice(2)) : ['軀幹屈曲'];
  return [...new Set(list.flatMap((area) => (area === '脊椎' ? holds : [area])))];
}

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
    stability: words(legacySpine(tags).filter((f) => PILATES_STABILITY.includes(f)), PILATES_STABILITY.length),
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
    if (event.date < today || event.change) continue;
    const student = studentForEvent(students, event);
    if (!student || seen.has(student.id)) continue;
    seen.add(student.id);
    const plan = plans.find((p) => p.id === student.id);
    if (!plan || plan.used || !plan.rows || !plan.rows.length) result.push({ student, event });
  }
  return result;
}

/**
 * 還沒排課表 on 今日 as a calendar (2026-11-25): whole weeks, Monday first, from this week to the week of the last
 * booking still waiting for a plan. Each day lists those bookings by time; days before today are marked past.
 */
export function planCalendarWeeks(need, today) {
  const parse = (key) => {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d);
  };
  const mondayIndex = (date) => (date.getDay() + 6) % 7;
  const start = parse(today);
  start.setDate(start.getDate() - mondayIndex(start));
  const lastDate = need.reduce((max, item) => (item.event.date > max ? item.event.date : max), today);
  const end = parse(lastDate);
  end.setDate(end.getDate() + 6 - mondayIndex(end));
  const weeks = [];
  for (const day = new Date(start); day <= end; day.setDate(day.getDate() + 1)) {
    if (!weeks.length || weeks[weeks.length - 1].length === 7) weeks.push([]);
    const date = dateKey(day);
    weeks[weeks.length - 1].push({
      date,
      past: date < today,
      today: date === today,
      items: need.filter((item) => item.event.date === date)
        // A booking with no time goes last.
        .sort((a, b) => (a.event.time || '99:99').localeCompare(b.event.time || '99:99')),
    });
  }
  return weeks;
}

/**
 * Every booking after today for the calendar on 今日, with what it needs (2026-11-26, 篩選：全部、未排課、已排課、請假):
 * the student's next class is 'need' until it has a plan and 'planned' after; a later class of the same student is
 * 'wait', since a plan is only for the next class; a booking with a reason in brackets is 'leave'. Students still to
 * come today (waitIds) wait as well, because a plan written now goes to today's class. events come sorted by time.
 */
export function planCalendarItems(events, students, plans, today, waitIds = new Set()) {
  const seen = new Set();
  const items = [];
  for (const event of events) {
    if (event.date <= today) continue;
    const student = studentForEvent(students, event);
    if (!student) continue;
    if (event.change) { items.push({ student, event, state: 'leave' }); continue; }
    if (seen.has(student.id) || waitIds.has(student.id)) { items.push({ student, event, state: 'wait' }); continue; }
    seen.add(student.id);
    const plan = plans.find((p) => p.id === student.id);
    items.push({ student, event, state: plan && !plan.used && plan.rows?.length ? 'planned' : 'need' });
  }
  return items;
}

/** The calendar's four filters, in the order the teacher asked for them. 全部 shows the waiting classes too. */
export const PLAN_FILTERS = [['all', '全部'], ['need', '還沒排'], ['planned', '已排'], ['leave', '請假']];

export function filterPlanItems(items, filter) {
  return filter === 'all' || !PLAN_FILTERS.some(([key]) => key === filter) ? items : items.filter((item) => item.state === filter);
}

/**
 * 今天狀況 in detail (2026-11-26): 睡眠、飲食、心情 each open a list to pick from and a note. The lists are a first
 * draft for the teacher to confirm (CLAUDE.md 待使用者提供).
 */
export const STATUS_DETAILS = {
  sleep: ['睡不到 6 小時', '不好入睡', '半夜醒來', '太早醒', '睡醒還是累'],
  diet: ['還沒吃東西', '剛吃飽', '吃得比平常少', '水喝得少', '喝了咖啡或茶'],
  mood: ['壓力大', '很疲倦', '緊張焦慮', '心情低落', '煩躁'],
};
export const STATUS_NAMES = { pain: '疼痛', sleep: '睡眠', diet: '飲食', mood: '心情' };

/** What was picked and written for one of 睡眠、飲食、心情 in a class; empty when nothing was. */
export function statusDetail(session, key) {
  const detail = session?.flagDetails?.[key] || {};
  return { items: (detail.items || []).filter(Boolean), note: String(detail.note || '').trim() };
}

/** 睡眠（不好入睡、半夜醒來；昨晚加班） for one marked flag, or just 睡眠 when nothing more was noted. */
export function statusText(session, key) {
  const { items, note } = statusDetail(session, key);
  const more = [items.join('、'), note].filter(Boolean).join('；');
  return more ? `${STATUS_NAMES[key]}（${more}）` : STATUS_NAMES[key];
}

/**
 * The calendar's bookings plus the sample ones (示範資料). Those are in no calendar, so a sync while connected would
 * otherwise drop them within minutes; they stay until the sample is cleared (2026-11-24).
 */
export function keepSampleBookings(bookings, current) {
  return [...bookings, ...current.filter((e) => e.demo && !bookings.some((b) => b.id === e.id))];
}

/**
 * The student's first booking on or after a day, leaving out one marked 病假 or the like.
 * Used to find who shares today's or the next class in a 1:2 lesson.
 */
export function bookingFrom(events, students, studentId, fromDate) {
  return events
    .filter((e) => e.date >= fromDate && !e.change && studentForEvent(students, e)?.id === studentId)
    .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))[0] || null;
}

/**
 * The other student of a 1:2 booking (two names in one calendar title, 2026-11-24), or null.
 * A partner marked 病假 is not in class, so the lesson runs as a 1:1 that day.
 */
export function partnerFor(events, students, booking) {
  if (!booking?.group || booking.change) return null;
  const other = events.find((e) => e.group === booking.group && e.id !== booking.id && !e.change);
  const student = other ? studentForEvent(students, other) : null;
  return student && !student.deleted ? student : null;
}

/**
 * A 1:2 class counts for both students together (2026-11-24 第三輪表單). When one missed a class the other came to,
 * the pair carries on from the larger count, because that class was still part of their term.
 */
export function pairClassNumber(mine, theirs, mineByHand = false, theirsByHand = false) {
  // A number the teacher set by hand (修正下一堂是第幾堂) wins, so a new term can start lower.
  if (mineByHand || !theirs) return mine;
  if (theirsByHand) return theirs;
  return theirs.no > mine.no ? theirs : mine;
}

/**
 * A plan written for one student of a 1:2 class, made ready for the other (2026-11-24): the same exercises, order
 * and number of sets, with each weight, reps and spring taken from the partner's own last time on that exercise
 * with the same equipment, since the two usually lift different weights. An exercise the partner has never done keeps
 * the planned values and is listed in fresh. history is the partner's finished classes, newest first.
 */
export function planForPartner(rows, history) {
  const same = (a, b) => (a.exerciseId ? a.exerciseId === b.exerciseId : a.name === b.name) && (a.equipment || '') === (b.equipment || '');
  const fresh = [];
  const copied = rows.map((row) => {
    const copy = JSON.parse(JSON.stringify(row));
    copy.id = newId('row');
    let own = null;
    for (const session of history) {
      own = (session.rows || []).find((r) => same(r, row) && r.sets?.some((set) => set.done));
      if (own) break;
    }
    if (!own) {
      fresh.push(row.name);
      return copy;
    }
    const done = own.sets.filter((set) => set.done);
    copy.sets = row.sets.map((set, i) => {
      const from = done[Math.min(i, done.length - 1)];
      return makeSet({ weight: from.weight, reps: from.reps, spring: springWithoutBar(from.spring) });
    });
    if (own.band) copy.band = own.band;
    return copy;
  });
  return { rows: copied, fresh };
}

// Past this many reps the estimate drifts too far, so those sets do not count (2026-11-17).
export const ONE_RM_MAX_REPS = 12;

/** Estimated one-rep max from one set (Epley), rounded to 0.5 kg. 0 when the set cannot tell. */
export function estimateOneRm(weight, reps) {
  const w = Number(weight) || 0;
  const r = Number(reps) || 0;
  if (w <= 0 || r < 1 || r > ONE_RM_MAX_REPS) return 0;
  return r === 1 ? w : Math.round(w * (1 + r / 30) * 2) / 2;
}

/** Weight × reps of every finished strength set in one class. Bands have no weight, so they add nothing. */
export function sessionVolume(session) {
  let total = 0;
  for (const row of session.rows || []) {
    if (row.kind !== 'strength' || row.equipment === BAND) continue;
    for (const set of row.sets || []) if (set.done) total += (Number(set.weight) || 0) * (Number(set.reps) || 0);
  }
  return Math.round(total);
}

/** Training volume of recent classes that lifted anything, oldest first. */
export function volumeSeries(history, limit = 12) {
  return history
    .map((session) => ({ date: session.date, volume: sessionVolume(session) }))
    .filter((point) => point.volume > 0)
    .slice(0, limit)
    .reverse();
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
    if (done.length) {
      // The set the estimate came from, so the chart can say which one it was.
      const best = done.reduce((top, s) => (estimateOneRm(s.weight, s.reps) > estimateOneRm(top.weight, top.reps) ? s : top), done[0]);
      const e1rm = estimateOneRm(best.weight, best.reps);
      points.push({
        date: session.date,
        weight: Math.max(...done.map((s) => s.weight)),
        reps: Math.max(...done.map((s) => s.reps)),
        e1rm,
        e1rmSet: e1rm ? `${best.weight} kg × ${best.reps} 下` : '',
      });
    }
    if (points.length === limit) break;
  }
  return points.reverse();
}

/** Round axis values for a line chart: at most about three steps, never a flat range. */
export function trendScale(values) {
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min;
  const step = [1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 2500, 5000, 10000].find((s) => span / s <= 3) || Math.ceil(span / 3);
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

/** Part → score of anything that holds pain, leaving out pain with no part. */
export function painScoreMap(target) {
  return Object.fromEntries(painList(target || {}).filter((p) => p.part).map((p) => [p.part, p.score]));
}

/** The highest score of each part over several pain records; a part marked with no score stays null until one has a score. */
export function maxPainScores(targets) {
  const scores = {};
  for (const target of targets) {
    for (const [part, score] of Object.entries(painScoreMap(target))) {
      const prior = scores[part];
      scores[part] = prior === undefined || prior === null ? score : (score === null ? prior : Math.max(prior, score));
    }
  }
  return scores;
}

/**
 * The pain recorded last before a class (2026-11-27, 填寫人體疼痛圖時要可以看到最近一次的疼痛記錄圖): the latest earlier
 * class with any pain, from any teacher, on arrival (`arrival`) and the highest during its exercises (`during`); before
 * any class has pain, the pain in the profile. `scores` is the two together, each part at its highest.
 * { from: 'class' | 'profile', date, scores, arrival, during, notes } or null.
 */
export function lastPainRecord(sessions, student, current) {
  const earlier = doneSessions(sessions, student?.id).filter((s) => s.id !== current?.id && (!current?.date || s.date <= current.date));
  for (const s of earlier) {
    const arrival = painScoreMap(s.dayPain);
    const during = maxPainScores(s.rows || []);
    if (!Object.keys(arrival).length && !Object.keys(during).length) continue;
    return { from: 'class', date: s.date, scores: maxPainScores([{ painMap: arrival }, { painMap: during }]), arrival, during,
      notes: { ...(s.dayPain?.painPartNotes || {}) } };
  }
  const scores = painScoreMap(student?.pain);
  return Object.keys(scores).length
    ? { from: 'profile', date: '', scores, arrival: scores, during: {}, notes: { ...(student.pain.painPartNotes || {}) } }
    : null;
}

/** Whether that pain should be asked about again: some part hurt (a score above 0, or marked without a score). */
export function painToFollow(record) {
  return !!record && Object.values(record.scores).some((score) => score === null || score > 0);
}

/** Whether a class has its arrival pain written: any part marked, a 0 included (今天都不痛 marks the old parts 0). */
export function dayPainWritten(session) {
  return Object.keys(painScoreMap(session?.dayPain)).length > 0;
}

/** Whether a pain map holds pain worth flagging; parts all at 0 mean it is gone. */
export function hasPain(map) {
  return Object.values(map || {}).some((score) => score === null || score > 0);
}

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

/**
 * Each marked part's own note (2026-11-23: one shared note could not say which part it was about).
 * Only parts still marked count, in the order they were marked: ['左膝：下蹲到底才痛'].
 */
export function painPartNotes(target) {
  const notes = target?.painPartNotes || {};
  return painList(target || {})
    .filter((p) => p.part && String(notes[p.part] || '').trim())
    .map((p) => `${p.part}：${String(notes[p.part]).trim()}`);
}

/** Every pain note of one exercise, check-in or profile: each part's first, then the note for no part in particular. */
export function painNoteText(target) {
  return [...painPartNotes(target), String(target?.painNote || '').trim()].filter(Boolean).join('；');
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

// A plan note's usual words are split off at Chinese and Western list marks, never at spaces, so English text
// such as "keep neutral spine" stays whole (2026-11-26).
const NOTE_SEP = /[、，,；;\n]+/;

/** Whether one of the usual notes (腰代償) is already in a plan note. */
export function noteHasTag(text, tag) {
  return String(text || '').split(NOTE_SEP).map((part) => part.trim()).includes(tag);
}

/** Adds a usual note to the end of a plan note, or takes it back out when it is there. */
export function toggleNoteTag(text, tag) {
  const value = String(text || '').trim();
  if (noteHasTag(value, tag)) return value.split(NOTE_SEP).map((part) => part.trim()).filter((part) => part && part !== tag).join('、');
  return value ? `${value}、${tag}` : tag;
}

/** Everything noted about one exercise in one class, for history lists and the PDF. */
export function rowDetails(row) {
  const pain = painText(row);
  return [
    equipmentText(row),
    row.rpe ? `RPE ${row.rpe}` : '',
    row.replacedFrom ? `由 ${row.replacedFrom.name} 換來` : '',
    pain ? `痛 ${pain}` : '',
    painNoteText(row) ? `疼痛附註：${painNoteText(row)}` : '',
    row.quality ? `品質 ${row.quality}` : '',
    row.assist ? `協助 ${row.assist}` : '',
    ...(row.props || []),
    ...(row.tags || []),
    row.planNote ? `排課備註：${row.planNote}` : '',
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
        items.push({ date: session.date, exercise: row.name || DAY_PAIN, text: painText(row), note: painNoteText(row) });
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
  return items.filter((item) => [item.name, ...exerciseGroups(item), ...(item.tags?.patterns || []), ...(item.aliases || [])].some((text) => squeeze(text).includes(wanted)));
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
    .filter((item) => item.id !== current?.id && current?.group && exerciseGroups(item).some((g) => exerciseGroups(current).includes(g)))
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

/**
 * The spring settings used most, so a usual setting takes one tap. `tidy` rewrites each one first, so old values
 * that differ only in what is no longer written (the Reformer bar) count as one.
 */
export function commonSprings(sessions, limit = 6, keep = () => true, tidy = (text) => text) {
  const counts = new Map();
  for (const session of sessions) {
    for (const row of (session.rows || []).filter(keep)) {
      for (const set of row.sets || []) {
        const text = set.spring && tidy(set.spring);
        if (text) counts.set(text, (counts.get(text) || 0) + 1);
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

/**
 * Every exercise the student has really done. Pilates goes by region. Strength goes by body part
 * (the student report), or by category with `byPattern` (the overview's grid, 2026-11-24).
 */
export function learnedSummary(history, library, find = () => null, { byPattern = false } = {}) {
  const strengthGroup = (exercise) => (byPattern ? PATTERN_SHORT[mainPattern(exercise)] || '未分類' : exercise?.group || '其他');
  const learned = new Map();
  for (const session of history) {
    for (const row of session.rows) {
      if (learned.has(row.exerciseId) || !row.sets.some((s) => s.done)) continue;
      const exercise = find(row.exerciseId);
      const group = row.kind === 'pilates' ? exercise?.tags?.region || '未分類' : strengthGroup(exercise);
      learned.set(row.exerciseId, { name: row.name, kind: row.kind, group });
    }
  }
  const forKind = (kind) => {
    const mine = [...learned.values()].filter((item) => item.kind === kind);
    const totals = new Map();
    for (const item of library) {
      if (item.kind !== kind) continue;
      const group = kind === 'pilates' ? item.tags?.region || '未分類' : strengthGroup(item);
      totals.set(group, (totals.get(group) || 0) + 1);
    }
    // A fixed list of groups, so the card keeps the same size however many exercises are learned.
    const names = kind === 'pilates' ? [...PILATES_REGIONS] : byPattern ? STRENGTH_PATTERNS.map((p) => PATTERN_SHORT[p]) : [...BODY_GROUPS];
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
  return [...(row.tags || []), painNoteText(row)].map((text) => String(text || '').trim()).filter(Boolean);
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
  下肢: '腿和臀部', 胸: '胸部', 背: '背部', 肩: '肩膀', 手臂: '手臂', 軀幹: '腹部（核心）', 核心: '腹部（核心）',
  脊椎: '脊椎活動', 肩臂: '肩膀和手臂', 全身: '全身',
};

export function layRegion(group) {
  return LAY_REGIONS[group] || group || '';
}

/** The springs of one set as colours to draw and words to read: 紅 2・藍 1. Bar and hole stay out of the student report. */
export function springParts(text, apparatus) {
  const spring = springFromText(text);
  const colors = [...new Set([...springSet(apparatus).colors, ...SPRING_ORDER])].filter((c) => spring.counts[c] > 0);
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
      amount = last ? { type: 'spring', ...springParts(last.spring, exercise?.group) } : { type: 'none' };
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

// 對位拍照的角度（2026-11-17，參考其他治療師的工具）。同一個角度的照片會疊在取景框上對齊。
export const PHOTO_ANGLES = [
  { id: 'front', label: '體態正面' },
  { id: 'side', label: '體態側面' },
  { id: 'back', label: '體態背面' },
  { id: 'squat', label: '深蹲' },
  { id: 'hinge', label: '硬舉' },
  { id: 'single-leg', label: '單腳站' },
  { id: 'bend', label: '前彎' },
  { id: 'gait', label: '步態' },
  { id: 'other', label: '其他' },
];

export function photoAngleLabel(id) {
  return PHOTO_ANGLES.find((angle) => angle.id === id)?.label || '其他';
}

/** One student's photos of one angle (or all angles), newest first. */
export function photosOf(photos, studentId, angle = null) {
  return photos
    .filter((p) => !p.deleted && p.studentId === studentId && (!angle || p.angle === angle))
    .sort((a, b) => (b.date + (b.takenAt || 0)).localeCompare(a.date + (a.takenAt || 0)) || (b.takenAt || 0) - (a.takenAt || 0));
}

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|]/g;

/**
 * Drive file name, so the folder needs no sorting by hand (2026-11-17):
 * 2026-11-17_王小明_第6堂_高腳杯深蹲_第2組 from class, 2026-11-17_王小明_體態正面 from the photo list.
 * The id and the extension are added by Drive.
 */
export function photoFileName(photo, studentName) {
  const parts = [photo.date, String(studentName || '').trim() || '學生'];
  if (photo.exercise) {
    if (photo.classNo) parts.push(`第${photo.classNo}堂`);
    parts.push(photo.exercise);
    if (photo.set) parts.push(`第${photo.set}組`);
  } else {
    parts.push(photoAngleLabel(photo.angle));
  }
  return parts.join('_').replace(UNSAFE_FILE_CHARS, '_');
}

/** One Drive folder per student; namesakes are told apart by the birthday, as in the calendar (王小明 0828). */
export function mediaFolderName(student) {
  const name = String(student?.name || '').trim() || '未分類';
  return (student?.birthday ? `${name} ${student.birthday}` : name).replace(UNSAFE_FILE_CHARS, '_');
}

/** Media taken during one exercise of one class. */
export function rowMedia(photos, sessionId, rowId) {
  if (!sessionId || !rowId) return [];
  return photos.filter((p) => !p.deleted && p.sessionId === sessionId && p.rowId === rowId)
    .sort((a, b) => (a.takenAt || 0) - (b.takenAt || 0));
}

// Videos (2026-11-17, v27) share the photo list: same sync, same delete; `type: 'video'` marks them.
export const VIDEO_MAX_SECONDS = 60;
// Larger files would not fit one upload to Apps Script once encoded.
export const VIDEO_MAX_BYTES = 30 * 1024 * 1024;

export function isVideo(item) {
  return item?.type === 'video';
}

/** What a photo or video shows: the exercise when taken in class, otherwise the angle. */
export function mediaLabel(item) {
  return item?.exercise || photoAngleLabel(item?.angle);
}

/** One student's media taken in class of one exercise, newest first. */
export function exerciseMedia(photos, studentId, exercise) {
  return photosOf(photos, studentId).filter((p) => p.exercise === exercise);
}

/** Exercises that have media from class, the most recently filmed first. */
export function mediaExercises(photos, studentId) {
  const groups = new Map();
  for (const item of photosOf(photos, studentId)) {
    if (!item.exercise) continue;
    if (!groups.has(item.exercise)) groups.set(item.exercise, []);
    groups.get(item.exercise).push(item);
  }
  return [...groups].map(([name, list]) => ({ name, list }));
}

/** File extension for Drive, from the recorded type. */
export function mediaExtension(item) {
  if (!isVideo(item)) return 'jpg';
  const mime = String(item.mime || '');
  if (mime.includes('webm')) return 'webm';
  if (mime.includes('quicktime')) return 'mov';
  return 'mp4';
}

/** 0:07, 1:00. Whole seconds counted down, like the video player shows them. */
export function clockText(seconds) {
  const s = Math.max(0, Math.floor((seconds || 0) + 0.001));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

// Movement problems found at an assessment, the A of SOAP (2026-11-23). They live on the student record,
// one entry per assessment, and each problem keeps its id from one assessment to the next so it can be followed.
export const PROBLEM_STATUS = [['open', '還在'], ['better', '改善'], ['solved', '解決']];
// A first list for one-tap picking; the teacher confirms it and adds her own (2026-11-23, to be confirmed).
export const DEFAULT_PROBLEMS = [
  '深蹲膝內夾', '深蹲骨盆後捲', '骨盆前傾', '骨盆後傾', '肋骨外翻', '頭前傾', '圓肩', '肩胛穩定不足',
  '胸椎活動度不足', '髖屈曲活動度不足', '踝背屈不足', '單腳站骨盆下沉', '核心控制不足', '呼吸代償', '左右不對稱',
];

/** Newest first; two on one day keep the order they were made in. */
export function assessmentsByDate(student) {
  return [...(student?.assessments || [])].filter((a) => !a.deleted)
    .sort((a, b) => (b.date || '').localeCompare(a.date || '') || (b.createdAt || 0) - (a.createdAt || 0));
}

export function latestAssessment(student) {
  return assessmentsByDate(student)[0] || null;
}

/** The summary the student sees on a class's report: the newest one written on or before that class (2026-11-24). */
export function summaryForDate(student, date) {
  const found = assessmentsByDate(student).find((a) => (a.date || '') <= (date || '9999') && a.summary?.trim());
  return found ? { date: found.date, text: found.summary.trim() } : null;
}

/**
 * A new assessment starts empty (2026-11-27, 動作問題要可以勾選帶入之前的內容): the last one's unsolved problems and its
 * summary are shown beside it, and only what the teacher ticks comes along (carryProblem, see assess.js).
 */
export function startAssessment(student, date, id) {
  return { id, date, problems: [], summary: '', createdAt: Date.now() };
}

/** The assessment before this one (newest first by date, then by when it was made), or null. */
export function previousAssessment(student, assessment) {
  return assessmentsByDate(student).find((a) => a.id !== assessment.id
    && ((a.date || '') < (assessment.date || '') || ((a.date || '') === (assessment.date || '') && (a.createdAt || 0) < (assessment.createdAt || 0)))) || null;
}

/** The problems from before that can be brought in: the ones not solved, in their order. */
export function carryCandidates(previous) {
  return (previous?.problems || []).filter((p) => p.status !== 'solved');
}

/** A problem brought in from last time keeps its id, parts and status, to be checked again. */
export function carryProblem(problem) {
  return { id: problem.id, text: problem.text, parts: [...(problem.parts || [])], status: problem.status || 'open', carried: true };
}

/**
 * The problems still there, in the order to read them: 還在 first, then 改善 (2026-11-27, the card's 「還在 3」 did not
 * say what the 3 counted).
 */
export function openProblems(assessment) {
  const list = (assessment?.problems || []).filter((p) => p.status !== 'solved');
  return [...list.filter((p) => (p.status || 'open') === 'open'), ...list.filter((p) => p.status === 'better')];
}

export function problemCounts(assessment) {
  const counts = { open: 0, better: 0, solved: 0 };
  for (const p of assessment?.problems || []) counts[p.status in counts ? p.status : 'open'] += 1;
  return counts;
}

/** 還在 2・改善 1・解決 1, leaving out the zeros. */
export function problemCountText(assessment) {
  const counts = problemCounts(assessment);
  return PROBLEM_STATUS.filter(([key]) => counts[key]).map(([key, label]) => `${label} ${counts[key]}`).join('・');
}

/** One line per problem for reading back: 骨盆前傾（下背）. */
export function problemText(problem) {
  const parts = (problem.parts || []).join('、');
  return parts ? `${problem.text}（${parts}）` : problem.text;
}

/** Puts an assessment in the student's list, replacing the one with the same id. */
export function withAssessment(student, assessment) {
  const others = (student.assessments || []).filter((a) => a.id !== assessment.id);
  return { ...student, assessments: [...others, assessment] };
}
