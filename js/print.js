// Lays sessions out like the MRE005 paper form: three classes a page, eight rows, five sets.
import { toast } from './dom.js';
import * as store from './store.js';
import { MAX_SETS, rowDetails, setLoad } from './core.js';
import { call, isConnected } from './sync.js';

const PER_PAGE = 3;
const ROWS = 8;

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function safeImage(src) {
  return typeof src === 'string' && /^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(src) ? src : '';
}

function rowsHtml(session) {
  let html = '';
  const count = Math.max(ROWS, session.rows.length);
  for (let i = 0; i < count; i++) {
    const row = session.rows[i];
    html += `<tr class="${i % 2 === 0 ? 'shade' : ''}"><td class="name">${escapeHtml(row?.name)}</td>`;
    for (let s = 0; s < MAX_SETS; s++) {
      const set = row?.sets[s];
      const shown = set && set.done;
      const first = shown ? setLoad(row, set) : '';
      html += `<td class="sub">${escapeHtml(first)}</td><td class="sub">${shown ? escapeHtml(set.reps) : ''}</td>`;
    }
    if (i === 0) html += `<td class="note" rowspan="${count}">${noteHtml(session)}</td>`;
    html += '</tr>';
  }
  return html;
}

function noteHtml(session) {
  const lines = [];
  for (const row of session.rows) {
    const bits = rowDetails(row);
    if (bits.length) lines.push(`${escapeHtml(row.name)}：${escapeHtml(bits.join('、'))}`);
  }
  if (session.note) lines.push(escapeHtml(session.note));
  return lines.join('<br>');
}

function sessionHtml(session, coachName, coachSignature) {
  const [y, m, d] = session.date.split('-');
  const flag = (key, label) => `${session.flags?.[key] ? '☑' : '☐'}${label}`;
  const coach = safeImage(coachSignature);
  const studentSign = safeImage(session.studentSignature);
  return `<table class="mre">
<colgroup><col class="col-name">${'<col class="col-sub">'.repeat(MAX_SETS * 2)}<col class="col-note"><col class="col-note"></colgroup>
<tr class="head"><td class="label">日期</td><td colspan="3">${y} / ${m} / ${d}</td><td class="label">血壓</td><td colspan="3">${escapeHtml(session.bpSys)} / ${escapeHtml(session.bpDia)} mmHg</td><td class="label">心跳</td><td colspan="2">${escapeHtml(session.hr)} bpm</td><td class="label">簽名</td>
<td class="signs">${coach ? `<img src="${coach}" alt="教練簽名">` : escapeHtml(session.coachSigned ? coachName : '')}${studentSign ? `<img src="${studentSign}" alt="學生簽名">` : ''}</td></tr>
<tr><td class="label">狀況</td><td colspan="12">${flag('pain', '疼痛')} ${flag('sleep', '睡眠')} ${flag('diet', '飲食')} ${flag('mood', '心情')} ${session.special ? '☑' : '☐'}特殊狀況：${escapeHtml(session.special)}</td></tr>
<tr class="head"><td class="name-head" colspan="1">動作</td><td colspan="2">（一）</td><td colspan="2">（二）</td><td colspan="2">（三）</td><td colspan="2">（四）</td><td colspan="2">（五）</td><td colspan="2">備註</td></tr>
${rowsHtml(session).replaceAll('class="note" rowspan', 'class="note" colspan="2" rowspan')}
</table>`;
}

export const PRINT_CSS = `
@page { size: A4; margin: 12mm; }
body { font-family: "Noto Sans TC", "PingFang TC", sans-serif; font-size: 9pt; color: #000; margin: 0; }
table.mre-head, table.mre-foot { width: 100%; }
table.mre-head { margin-bottom: 4mm; }
.mre-title { font-size: 13pt; font-weight: 700; }
.mre-right { text-align: right; }
.mre-page { page-break-after: always; }
.mre-page:last-child { page-break-after: auto; }
table.mre { width: 100%; border-collapse: collapse; border: 2px solid #000; margin-bottom: 3mm; table-layout: fixed; break-inside: avoid; page-break-inside: avoid; }
table.mre td { border: 1px solid #000; padding: 1mm; height: 6mm; text-align: center; overflow: hidden; overflow-wrap: anywhere; }
table.mre tr.head td { font-weight: 500; }
col.col-name { width: 18%; }
col.col-sub { width: 5%; }
col.col-note { width: 16%; }
table.mre td.name, table.mre td.name-head { text-align: left; }
table.mre td.note { text-align: left; vertical-align: top; font-size: 8pt; }
table.mre td.signs img { height: 7mm; max-width: 45%; }
table.mre tr.shade td.name, table.mre tr.shade td.sub { background: #eee; }
table.mre-foot { font-size: 8pt; }
`;

/** Pure layout, so it can be sent to Drive as-is. Every stored value is escaped. */
export function buildFormHtml(student, sessions, coachName, coachSignature, form = {}) {
  const pages = [];
  const ordered = sessions.slice().sort((a, b) => a.date.localeCompare(b.date));
  for (let i = 0; i < ordered.length; i += PER_PAGE) {
    pages.push(`<div class="mre-page">
<table class="mre-head"><tr><td class="mre-title">${escapeHtml(form.title)}</td><td class="mre-right">教練：${escapeHtml(coachName)}　學生：${escapeHtml(student.name)}</td></tr></table>
${ordered.slice(i, i + PER_PAGE).map((s) => sessionHtml(s, coachName, coachSignature)).join('')}
<table class="mre-foot"><tr><td>${escapeHtml(form.footerLeft)}</td><td class="mre-right">${escapeHtml(form.footerRight)}</td></tr></table>
</div>`);
  }
  return pages.join('');
}

export async function exportPdf(student, sessions) {
  const connection = store.getMeta('connection');
  const coachName = connection?.teacher || '';
  const body = buildFormHtml(student, sessions, coachName, store.getMeta('coachSignature'), connection?.form);
  if (isConnected() && navigator.onLine) {
    toast('PDF 製作中，約需幾秒');
    try {
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>${PRINT_CSS}</style></head><body>${body}</body></html>`;
      const stamp = new Date().toISOString().slice(0, 10);
      const { url } = await call('pdf', { name: `MRE005_${student.name}_${stamp}`, html });
      toast('PDF 已存到 Google 雲端的「訓練紀錄 App 資料 / PDF」資料夾', { label: '打開', run: () => window.open(url, '_blank', 'noopener') });
      return;
    } catch (error) {
      toast(`存到雲端失敗：${error.message}。改用列印。`);
    }
  }
  const root = document.getElementById('print-root');
  root.innerHTML = body;
  window.print();
}
