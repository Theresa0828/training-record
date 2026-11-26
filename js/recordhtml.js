// The full record of one class as a PDF page (2026-11-25, round-5 form). Kept for 10 years in the company Drive,
// readable without the app, and given to the student, family or a doctor on request, so it says everything in plain
// words. One file per class, with the student's profile as it was that day, so an old goal or contraindication
// is never lost when the profile changes. Pure: no screen, no storage, so it is tested in Node.
import {
  painList, painText, painNoteText, setLoad, equipmentText, assessmentsByDate, problemText, PROBLEM_STATUS,
  bodyCompSummary, dateWithWeek, isBpFlagged, springFromText, SPRING_WORDS, statusText,
} from './core.js';

const UNSAFE_FILE_CHARS = /[\\/:*?"<>|]/g;
// A class changed again within this time is still being worked on; its PDF waits for the next round.
export const RECORD_SETTLE_MS = 60 * 1000;

export function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeImage(src) {
  return typeof src === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src) ? src : '';
}

function pad(n) {
  return String(n).padStart(2, '0');
}

/** 2026-11-25 14:30 in the device's own time. */
export function stampText(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * Drive file name, like the photos (2026-11-17): 2026-11-24_王小明_第4堂. A past class changed with 存檔上傳
 * gets a new file next to the old one: 2026-11-24_王小明_第4堂_修改_2026-11-25-1430.
 */
export function recordFileName(session, student, editedAt = null) {
  const parts = [session.date, String(student?.name || '').trim() || '學生'];
  if (session.classNo) parts.push(`第${session.classNo}堂`);
  if (editedAt) parts.push('修改', stampText(editedAt).replace(' ', '-').replace(':', ''));
  return parts.join('_').replace(UNSAFE_FILE_CHARS, '_');
}

/**
 * What a class still needs, given the files Drive already has for it (newest version first wins):
 *  - 'first': no file yet (a class just finished, or one from before this feature);
 *  - 'replace': changed again on its own day, which is still part of the class, so the day's file is redone;
 *  - 'edit': changed on a later day, so the old file stays and a new one is added (round-5 form);
 *  - null: nothing to do.
 * Only real classes of real students: no sample data, nothing deleted, nothing still open.
 */
export function recordJob(session, student, entries, today, now = Date.now()) {
  if (!session || session.status !== 'done' || session.deleted || session.demo) return null;
  if (!student || student.deleted || student.demo) return null;
  const at = session.updatedAt || 0;
  if (now - at < RECORD_SETTLE_MS) return null;
  const list = entries || [];
  if (!list.length) return 'first';
  const newest = Math.max(...list.map((e) => e.at || 0));
  if (at <= newest) return null;
  return session.date === today ? 'replace' : 'edit';
}

/** Every class waiting for its PDF, oldest first, so a long backlog fills in the order the classes happened. */
export function recordJobs(sessions, students, index, today, now = Date.now()) {
  const byId = new Map(students.map((s) => [s.id, s]));
  return sessions
    .map((session) => ({ session, kind: recordJob(session, byId.get(session.studentId), index?.[session.id], today, now) }))
    .filter((job) => job.kind)
    .sort((a, b) => (a.session.date + (a.session.finishedAt || '')).localeCompare(b.session.date + (b.session.finishedAt || '')));
}

/**
 * The profile as it was on the class day. Assessments and body measurements carry dates, so the newest one on or
 * before that day is used. Goal, contraindications and the rest keep only their latest text; a class saved after
 * its day (`late`) says so, so nobody reads today's goal as that day's.
 */
export function profileOnDate(student, date) {
  const assessment = assessmentsByDate(student).find((a) => (a.date || '') <= date) || null;
  const summary = assessmentsByDate(student).find((a) => (a.date || '') <= date && a.summary?.trim()) || null;
  const comp = bodyCompSummary((student.bodyComp || []).filter((m) => m.date <= date), date);
  return { assessment, summary, body: comp.latest, bodyBefore: comp.previous };
}

/**
 * The next class after this one: the student's next class in the app, or, for the newest class, the calendar
 * booking or the date the teacher picked (`upcoming`).
 */
export function nextAfter(session, sessions, upcoming = null) {
  const later = sessions
    .filter((s) => s.studentId === session.studentId && !s.deleted && s.status === 'done' && s.date > session.date)
    .sort((a, b) => a.date.localeCompare(b.date))[0];
  if (later) return { date: later.date, time: '' };
  return upcoming?.date > session.date ? upcoming : null;
}

/** Combines every exercise's pain into one map: the highest score each part reached in class. */
export function classPainScores(session) {
  const scores = {};
  for (const row of session.rows || []) {
    for (const { part, score } of painList(row)) {
      if (!part) continue;
      const prior = scores[part];
      scores[part] = prior === undefined || prior === null ? score : (score === null ? prior : Math.max(prior, score));
    }
  }
  return scores;
}

export function profilePainScores(target) {
  return Object.fromEntries(painList(target || {}).filter((p) => p.part).map((p) => [p.part, p.score]));
}

const KIND_NAMES = { strength: '重訓', pilates: '皮拉提斯' };

function kindText(session) {
  const kinds = [...new Set((session.rows || []).map((r) => r.kind).filter(Boolean))];
  const list = kinds.length ? kinds : [session.kind];
  return list.map((k) => KIND_NAMES[k] || k).join('＋');
}

function dateText(key) {
  if (!key) return '';
  const [y] = key.split('-');
  return `${y}/${dateWithWeek(key)}`;
}

/** 16 kg × 10, 1r1b × 8, 紅帶 × 12, 自體 × 15. Each set stays on one line; lines break between sets. */
function setsHtml(row) {
  const done = (row.sets || []).filter((s) => s.done);
  if (!done.length) return '沒有做';
  return done.map((set) => {
    const load = setLoad(row, set);
    const unit = row.kind !== 'pilates' && /^\d+(\.\d+)?$/.test(load) ? ' kg' : '';
    return `<span class="set">${esc(`${load}${unit} × ${set.reps ?? ''}`)}</span>`;
  }).join('、');
}

// Column shares of the page width. Google's PDF conversion spreads columns evenly unless told, which squeezed the
// exercise name to two lines and broke a set in the middle (2026-11-25 test conversion in the company account).
const COLUMN_SHARE = { n: 4, name: 17, sets: 27, rpe: 8, pain: 17, quality: 8, assist: 8, extra: 15 };

function painCell(target) {
  const text = painText(target);
  const note = painNoteText(target);
  return [text, note && `（${note}）`].filter(Boolean).join('');
}

/** 2026/11/25 00:43: the one way the page writes a time (file names keep their own form). */
function displayStamp(ms) {
  const d = new Date(ms);
  return `${d.getFullYear()}/${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Birthdays are stored as 0828 (month and day, used to tell namesakes apart); the page writes 8/28. */
function birthdayText(value) {
  const text = String(value || '').trim();
  const m = text.match(/^(\d{2})(\d{2})$/);
  return m ? `${Number(m[1])}/${Number(m[2])}` : text;
}

/** 左膝 3（高腳杯深蹲、分腿蹲）、下背 2（硬舉）: each part's highest score in class and the exercises that hurt. */
export function classPainSummary(session) {
  const parts = new Map();
  for (const row of session.rows || []) {
    for (const { part, score } of painList(row)) {
      if (!part) continue;
      const entry = parts.get(part) || { score: null, names: [] };
      if (score !== null && score !== undefined) entry.score = entry.score === null ? score : Math.max(entry.score, score);
      if (row.name && !entry.names.includes(row.name)) entry.names.push(row.name);
      parts.set(part, entry);
    }
  }
  return [...parts].map(([part, { score, names }]) => `${part}${score === null ? '' : ` ${score}`}${names.length ? `（${names.join('、')}）` : ''}`).join('、');
}

/** What the spring letters of this class mean, so a reader outside the studio can follow 2r1b (only letters used). */
export function springLegend(rows) {
  const used = new Set();
  let bar = false;
  let holes = false;
  for (const row of rows || []) {
    if (row.kind !== 'pilates') continue;
    for (const set of row.sets || []) {
      if (!set.done || !set.spring) continue;
      const spring = springFromText(set.spring);
      for (const [color, count] of Object.entries(spring.counts)) if (count > 0) used.add(color);
      if (spring.bar) bar = true;
      if (Object.keys(spring.holes).length) holes = true;
    }
  }
  if (!used.size) return '';
  const colors = Object.keys(SPRING_WORDS).filter((c) => used.has(c)).map((c) => `${c} ${SPRING_WORDS[c]}`).join('、');
  return [`彈簧寫法：數字是條數，字母是顏色（${colors}）`, bar && 'l／m／h 是位置 low／middle／high',
    holes && 'Chair 的 T／H／M／L 是掛孔 Top／High／Middle／Low'].filter(Boolean).join('；');
}

const EMPTY = '<span class="empty">—</span>';

function cell(value, cls = '') {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return `<td${cls ? ` class="${cls}"` : ''}>${text ? esc(text) : EMPTY}</td>`;
}

function line(label, value) {
  return value ? `<tr><th>${esc(label)}</th><td>${value}</td></tr>` : '';
}

function para(text) {
  return esc(String(text || '').trim()).replace(/\n/g, '<br>');
}

function mapBlock(image, caption) {
  const src = safeImage(image);
  return src ? `<div class="map"><img src="${src}" alt="${esc(caption)}"><div class="cap">${esc(caption)}</div></div>` : '';
}

/**
 * The body maps in one row, left to right in time (profile, before class, in class), in three fixed thirds so a map
 * keeps its size and place however many there are (Google spreads unsized cells evenly).
 */
function mapsRow(items) {
  const cells = items.map(([image, caption]) => mapBlock(image, caption)).filter(Boolean);
  if (!cells.length) return '';
  const padded = [...cells, '', ''].slice(0, Math.max(3, cells.length));
  return `<table class="maps"><tr>${padded.map((c) => `<td width="33.3%" style="width:33.3%">${c}</td>`).join('')}</tr></table>`;
}

function exercisesHtml(session, apparatus = {}) {
  const rows = session.rows || [];
  if (!rows.length) return `<p class="muted">${esc(dateText(session.date))}沒有記錄動作。</p>`;
  const has = (key) => rows.some((r) => (Array.isArray(r[key]) ? r[key].length : r[key]));
  const show = {
    rpe: has('rpe'),
    pain: rows.some((r) => painText(r) || painNoteText(r)),
    quality: has('quality'),
    assist: has('assist'),
    extra: rows.some((r) => r.props?.length || r.tags?.length || r.replacedFrom || String(r.planNote || '').trim()),
  };
  const columns = [['n', 'n', '#'], ['name', '', '動作'], ['sets', '', '每組（重量或彈簧 × 次數）'],
    show.rpe && ['rpe', 's', '自覺<br>費力<br><small>RPE<br>1–10</small>'],
    show.pain && ['pain', '', '疼痛<br><small>部位 分數 0–10</small>'],
    show.quality && ['quality', 's', '動作<br>品質<br><small>1–5</small>'],
    show.assist && ['assist', 's', '老師<br>協助'],
    show.extra && ['extra', '', '道具・標籤<br>排課備註・換動作']].filter(Boolean);
  const total = columns.reduce((sum, [key]) => sum + COLUMN_SHARE[key], 0);
  const head = columns.map(([key, cls, label]) => {
    const share = Math.round((COLUMN_SHARE[key] / total) * 1000) / 10;
    return `<th${cls ? ` class="${cls}"` : ''} width="${share}%" style="width:${share}%">${label}</th>`;
  }).join('');
  const body = rows.map((row, i) => {
    const equipment = equipmentText(row) || (row.kind === 'pilates' ? apparatus[row.exerciseId] || '' : '');
    // The note written when planning (2026-11-26) is named as such, so it is not read as something seen in class.
    const planNote = String(row.planNote || '').trim();
    const extra = [...(row.props || []), ...(row.tags || []), planNote ? `排課備註：${planNote}` : '',
      row.replacedFrom?.name ? `由「${row.replacedFrom.name}」換來` : '']
      .filter(Boolean).join('、');
    return `<tr><td class="n">${i + 1}</td>
<td><b>${esc(row.name)}</b>${equipment ? `<br><small>${esc(equipment)}</small>` : ''}</td>
<td>${setsHtml(row)}</td>
${show.rpe ? cell(row.rpe, 's') : ''}
${show.pain ? cell(painCell(row)) : ''}
${show.quality ? cell(row.quality, 's') : ''}
${show.assist ? cell(row.assist, 's') : ''}
${show.extra ? cell(extra) : ''}</tr>`;
  }).join('');
  // What every number, letter and dash means, right under the table, for a reader who has never used the app.
  const legend = ['— 表示沒有記錄', show.rpe && '自覺費力 RPE 1–10，10 是最費力', show.pain && '疼痛 0–10，0 是不痛',
    show.quality && '動作品質 1–5，5 是最好', show.assist && '老師協助分無、少、中、多', springLegend(rows)].filter(Boolean).join('。');
  return `<table class="grid"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table><p class="legend">${esc(legend)}。</p>`;
}

function statusLabel(status) {
  return (PROBLEM_STATUS.find(([key]) => key === status) || PROBLEM_STATUS[0])[1];
}

/** Body composition as a small table: this measure, the one before, and the change. */
function bodyTable(m, before) {
  if (!m) return '';
  const rows = [['weight', '體重', ' kg'], ['fat', '體脂', '%'], ['muscle', '肌肉量', ' kg']].filter(([key]) => m[key]);
  if (!rows.length) return '';
  const head = `<tr><th>項目</th><th>${esc(dateText(m.date))}</th>${before ? `<th>${esc(dateText(before.date))}</th><th>變化</th>` : ''}</tr>`;
  const body = rows.map(([key, label, unit]) => {
    const now = `${m[key]}${unit}`;
    if (!before) return `<tr><td>${label}</td><td>${esc(now)}</td></tr>`;
    const old = before[key] ? `${before[key]}${unit}` : '—';
    const diff = before[key] ? Math.round((m[key] - before[key]) * 10) / 10 : null;
    return `<tr><td>${label}</td><td>${esc(now)}</td><td>${esc(old)}</td><td>${diff === null ? '—' : esc(`${diff > 0 ? '+' : ''}${diff}${unit}`)}</td></tr>`;
  }).join('');
  return `<table class="mini">${head}${body}</table>`;
}

export const RECORD_CSS = `
@page { size: A4; margin: 14mm 12mm; }
body { font-family: "Noto Sans TC", "PingFang TC", "Microsoft JhengHei", sans-serif; font-size: 10pt; line-height: 1.5; color: #020300; margin: 0; }
h1 { font-size: 16pt; margin: 0; }
h2 { font-size: 12pt; margin: 12pt 0 4pt; padding-bottom: 2pt; border-bottom: 2px solid #020300; page-break-after: avoid; }
small { font-size: 8.5pt; color: #59544B; }
.muted { color: #59544B; }
.top { width: 100%; border-collapse: collapse; border-bottom: 1px solid #59544B; }
.top td { vertical-align: bottom; padding: 0 0 4pt; }
.top .right { text-align: right; }
.id { font-size: 9.5pt; color: #36311F; margin-top: 2pt; }
.note { border: 1px solid #59544B; padding: 4pt 6pt; margin: 6pt 0 0; font-size: 9pt; }
.late { font-size: 8.5pt; color: #59544B; margin: 4pt 0 0; }
.alert { border: 1.5px solid #420C14; padding: 5pt 7pt; margin: 8pt 0 0; page-break-inside: avoid; }
.alert .t { font-weight: 700; color: #420C14; }
.flag { font-weight: 700; color: #420C14; }
.empty { color: #8C877C; }
table.info { width: 100%; border-collapse: collapse; }
table.info th { width: 20%; text-align: left; vertical-align: top; font-weight: 700; padding: 3pt 6pt 3pt 0; }
table.info td { vertical-align: top; padding: 3pt 0; }
table.info tr { border-bottom: 1px solid #D5D0C0; }
table.grid { width: 100%; border-collapse: collapse; margin-top: 4pt; }
table.grid thead { display: table-header-group; }
table.grid th, table.grid td { border: 1px solid #59544B; padding: 3pt 4pt; text-align: left; vertical-align: top; }
table.grid th { background: #EFEBDD; font-weight: 700; font-size: 9pt; }
table.grid .n, table.grid .s { text-align: center; }
.set { white-space: nowrap; }
.legend { font-size: 8.5pt; color: #59544B; margin: 3pt 0 0; }
table.mini { border-collapse: collapse; }
table.mini th, table.mini td { border: 1px solid #D5D0C0; padding: 2pt 8pt; text-align: left; font-size: 9.5pt; }
table.mini th { font-weight: 700; background: #F4F1E6; }
table.maps { width: 100%; border-collapse: collapse; margin-top: 6pt; page-break-inside: avoid; }
tr, .note { page-break-inside: avoid; }
table.maps td { vertical-align: top; text-align: center; padding: 0 2pt; }
.map img { width: 54mm; }
.cap { font-size: 9pt; color: #59544B; }
.sign { margin-right: 10mm; }
.sign img { height: 14mm; vertical-align: middle; }
ul.problems { margin: 0; padding-left: 14pt; }
.foot { margin-top: 14pt; padding-top: 4pt; border-top: 1px solid #59544B; font-size: 8.5pt; color: #59544B; }
`;

/**
 * The whole page, ordered like a clinical record (2026-11-25 layout review): who and when → contraindications and
 * pain first → the class day (check-in, body maps) → what was done → assessment and plan → background → signatures.
 * `images` holds PNG data URLs of the body maps (made on the device): dayPain, classPain, profilePain.
 * `late` marks a class saved after its day (filled in from earlier classes, or after a change).
 * `apparatus` names each Pilates exercise's apparatus by exercise id (Reformer, Chair…).
 */
export function buildRecordHtml({
  student, session, partnerName = '', coachName = '', coachSignature = null, next = null,
  images = {}, kind = 'first', savedAt = Date.now(), late = false, apparatus = {},
}) {
  const profile = profileOnDate(student, session.date);
  const day = dateText(session.date);
  const shortDay = session.date ? session.date.replace(/-/g, '/') : '';
  const flags = session.flags || {};
  // 睡眠、飲食、心情 with what was picked and noted for each (2026-11-26).
  const flagNames = ['sleep', 'diet', 'mood', 'pain'].filter((key) => flags[key]).map((key) => (key === 'pain' ? '疼痛' : statusText(session, key)));
  const condition = [flagNames.length ? `有狀況：${flagNames.join('、')}` : '睡眠、飲食、心情、疼痛都沒有特別狀況',
    session.special && `特殊狀況：${session.special}`].filter(Boolean).join('；');
  // The teacher's own line (CLAUDE.md): 120/80 or more is marked, so a doctor reading the file sees it at once.
  const hasBp = session.bpSys || session.bpDia;
  const bp = hasBp ? `血壓 ${esc(`${session.bpSys ?? '—'} / ${session.bpDia ?? '—'} mmHg`)}${isBpFlagged(session.bpSys, session.bpDia) ? '<span class="flag">（高於 120/80）</span>' : ''}` : '';
  const vitals = [bp, session.hr && esc(`心跳 ${session.hr} 次/分`)].filter(Boolean).join('、') || '沒有量';
  const coachSign = safeImage(coachSignature);
  const studentSign = safeImage(session.studentSignature);
  // Each signature says whose it is; a missing one says so, so a blank is never read as signed.
  const signs = [coachSign ? `<span class="sign">教練 <img src="${coachSign}" alt="教練簽名"></span>`
    : `<span class="sign">教練 ${session.coachSigned ? `${esc(coachName)}（已簽）` : '沒有簽'}</span>`,
  studentSign ? `<span class="sign">學生 <img src="${studentSign}" alt="學生簽名"></span>` : '<span class="sign">學生 沒有簽</span>'].join('');
  const dayPain = painCell(session.dayPain || {});
  const classPain = classPainSummary(session);
  const lifeBits = [student.job && `職業：${para(student.job)}`, student.sports && `運動：${para(student.sports)}`,
    student.dailyNeeds && `日常動作需求：${para(student.dailyNeeds)}`].filter(Boolean).join('<br>');
  const a = profile.assessment;
  const problems = a?.problems?.length
    ? `<ul class="problems">${a.problems.map((p) => `<li>${esc(problemText(p))}：${esc(statusLabel(p.status))}</li>`).join('')}</ul><small>${esc(dateText(a.date))} 評估</small>`
    : '';
  const profilePainText = painCell(student.pain || {});
  const term = session.classNo ? `第 ${session.classNo} 堂${session.packageSize ? `（這一期共 ${session.packageSize} 堂）` : ''}` : '';
  const nextText = next?.date ? `${dateText(next.date)}${next.time ? ` ${next.time}` : ''}` : '還沒排';
  const birthday = birthdayText(student.birthday);
  const idBits = [birthday && `生日 ${birthday}`, coachName && `老師 ${coachName}`, `課程 ${kindText(session)}`].filter(Boolean).join('　');
  const versionNote = kind === 'edit'
    ? `<div class="note">這是修改後的版本，修改時間 ${esc(displayStamp(Date.parse(session.editedAt || '') || session.updatedAt || savedAt))}。修改前的版本另外保留在同一個資料夾。</div>`
    : '';
  const lateNote = late
    ? `<p class="late">這份紀錄在 ${esc(displayStamp(savedAt))} 產生（上課日之後）：禁忌、學生資料的疼痛、訓練目標、下次要注意、生活與運動是產生時的內容；動作問題和身體組成用 ${esc(shortDay)} 以前最近的一次。</p>`
    : '';
  const alert = `<div class="alert"><span class="t">禁忌與疼痛</span><br>禁忌：${student.contraindications ? para(student.contraindications) : '沒有記錄'}${profilePainText ? `<br>疼痛：${esc(profilePainText)}` : ''}</div>`;

  const body = `
<table class="top"><tr><td><h1>訓練紀錄・${esc(student.name)}</h1>${idBits ? `<div class="id">${esc(idBits)}</div>` : ''}</td>
<td class="right"><b>${esc(day)}</b>${term ? `<br>${esc(term)}` : ''}</td></tr></table>
${versionNote}
${lateNote}
${alert}
<h2>${esc(day)}</h2>
<table class="info">
${line('一對二', partnerName ? `和 ${esc(partnerName)} 一起上` : '')}
${line('本堂小目標', para(session.classGoal))}
${line('血壓、心跳', vitals)}
${line('今天的狀況', esc(condition))}
${line('上課前疼痛', dayPain ? esc(dayPain) : '沒有')}
${line('上課中疼痛', classPain ? esc(classPain) : '沒有')}
</table>
${mapsRow([[images.profilePain, '學生資料標的疼痛'], [images.dayPain, '上課前疼痛'], [images.classPain, '上課中疼痛（各部位最高分）']])}
<h2>訓練內容</h2>
${exercisesHtml(session, apparatus)}
${session.note ? `<table class="info">${line('備註', para(session.note))}</table>` : ''}
<h2>評估與計畫</h2>
<table class="info">
${line('訓練目標', para(student.goal))}
${line('問題總結', profile.summary ? `${para(profile.summary.summary)}<br><small>${esc(dateText(profile.summary.date))} 評估</small>` : '')}
${line('動作問題', problems)}
${line('下次要注意', para(student.nextNotes))}
${line('下次上課', esc(nextText))}
</table>
${lifeBits || profile.body ? `<h2>背景資料（${esc(shortDay)} 當天）</h2>
<table class="info">
${line('生活與運動', lifeBits)}
${line('身體組成', bodyTable(profile.body, profile.bodyBefore))}
</table>` : ''}
<h2>簽名</h2>
<p class="signs">${signs}</p>
<div class="foot">${esc(student.name)}・${esc(day)}${term ? `・${esc(term)}` : ''}。由訓練紀錄 App 於 ${esc(displayStamp(savedAt))} 產生。</div>`;
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(recordFileName(session, student))}</title><style>${RECORD_CSS}</style></head><body>${body}</body></html>`;
}
