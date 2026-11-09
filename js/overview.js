// Who this student is right now, readable in three seconds. Each card shows one point; a tap gives the detail.
import { h, button, holdButton, backButton, go, back, home, openSheet, confirmSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import { classNumberSheet, nextDateSheet } from './classinfo.js';
import {
  dateKey, doneSessions, nextClassNumber, nextClassInfo, findStudentByName, recentPain, learnedSummary, pilatesLevel,
  weightTrends, painSeries, overallStatus, bodyCompSummary, painList, painText, setPainMap,
} from './core.js';
import { openPainSheet, painScores } from './painsheet.js';
import { exportPdf } from './print.js';
import { icon } from './icons.js';
import { trendChart } from './trend.js';
import { termRing, calendarPage, sparkline, painBars, learnedTile, qualityDots } from './charts.js';
import { bodyMap } from './bodymap.js';
import { sessionTable, sessionFacts, sessionTitle } from './history.js';

function shortDate(key) {
  return key.slice(5).replace('-', '/');
}

function editProfileSheet(student) {
  openSheet('學生資料', (close) => {
    const name = h('input', { class: 'input', value: student.name, 'aria-label': '姓名' });
    const aliases = h('input', { class: 'input', value: (student.aliases || []).join('、'), 'aria-label': '日曆上的其他寫法' });
    const goal = h('textarea', { class: 'input', 'aria-label': '訓練目標' });
    goal.value = student.goal || '';
    const contra = h('textarea', { class: 'input', 'aria-label': '疼痛與禁忌' });
    contra.value = student.contraindications || '';
    const current = () => store.get('students', student.id) || student;
    const painButton = h('button', { type: 'button', class: 'btn list-item pain-pick' });
    const paintPain = () => {
      const pain = current().pain;
      const marked = painList(pain || {}).length > 0;
      painButton.classList.toggle('is-marked', marked);
      painButton.replaceChildren(icon('people'), h('span', {}, marked ? `人體圖：${painText(pain)}` : '在人體圖標出疼痛部位'));
    };
    painButton.addEventListener('click', () => openPainSheet('學生資料：疼痛部位', {
      scores: painScores(current().pain),
      note: current().pain?.painNote,
      notePlaceholder: '例如：久坐後下背痛、上樓梯右膝痛',
      onScores: (map) => {
        const pain = { ...(current().pain || {}) };
        setPainMap(pain, map);
        store.save('students', { ...current(), pain });
        paintPain();
      },
      onNote: (value) => store.save('students', { ...current(), pain: { ...(current().pain || {}), painNote: value } }),
      onDone: paintPain,
    }));
    paintPain();
    const notes = h('textarea', { class: 'input', 'aria-label': '下次要注意的事' });
    notes.value = student.nextNotes || '';
    const others = store.all('students').filter((s) => s.id !== student.id);
    const hasRecords = store.all('sessions').some((s) => s.studentId === student.id);
    return h('div', { class: 'stack' },
      h('div', { class: 'stepper-label' }, '姓名'), name,
      h('div', { class: 'stepper-label' }, '日曆上的其他寫法（用、分開）'), aliases,
      h('div', { class: 'stepper-label' }, '訓練目標'), goal,
      h('div', { class: 'stepper-label' }, '疼痛與禁忌'), contra, painButton,
      h('div', { class: 'stepper-label' }, '下次要注意的事'), notes,
      button('儲存', () => {
        const nextName = name.value.trim();
        if (!nextName) { toast('姓名不可空白'); return; }
        store.save('students', {
          ...current(),
          name: nextName,
          aliases: aliases.value.split(/[、,，]/).map((a) => a.trim()).filter(Boolean),
          goal: goal.value,
          contraindications: contra.value,
          nextNotes: notes.value,
          isNew: false,
        });
        close();
        back();
        go('overview', { studentId: student.id });
      }, 'primary'),
      !hasRecords && others.length > 0 && h('div', { class: 'stack' },
        h('div', { class: 'stepper-label' }, '這其實是舊學生的另一個寫法？點選合併：'),
        others.map((other) => button(other.name, () => {
          const merged = findStudentByName(others, other.name);
          store.save('students', { ...merged, aliases: [...new Set([...(merged.aliases || []), student.name])] });
          store.save('students', { ...student, deleted: true });
          close();
          back();
          go('overview', { studentId: merged.id });
          toast(`已把 ${student.name} 併入 ${merged.name}`, {
            label: '復原',
            run: () => {
              store.save('students', merged);
              store.save('students', { ...student, deleted: false });
              back();
              go('overview', { studentId: student.id });
            },
          });
        }, 'list-item'))),
      h('div', { class: 'stack' },
        button('刪除這位學生的所有紀錄', () => confirmSheet(
          `刪除 ${student.name}`,
          `會刪除 ${student.name} 的資料與所有上課紀錄，所有裝置和 Google 雲端同步後都會清除，無法復原。雲端 PDF 資料夾裡已匯出的 PDF 要另外手動刪除。`,
          '確定刪除',
          () => {
            store.eraseStudent(student.id);
            close();
            home();
            toast(`已刪除 ${student.name} 的所有紀錄`);
          },
        ), 'ghost danger-text')));
  });
}

function historySheet(history) {
  openSheet(`過去紀錄（${history.length}）`, () => h('div', { class: 'stack-sm' }, history.map((session) => button(sessionTitle(session), () => {
    openSheet(session.date.replaceAll('-', '/'), () => h('div', { class: 'stack-sm' }, sessionFacts(session), sessionTable(session)), { wide: true });
  }, 'list-item'))));
}

function pdfSheet(student, history) {
  const unsigned = history.filter((s) => !s.studentSignature).length;
  openSheet('匯出 MRE005 PDF', (close) => h('div', { class: 'stack' },
    unsigned > 0 && h('p', { class: 'muted' }, `有 ${unsigned} 堂還沒有學生簽名。`),
    [3, 6, 12].filter((n) => n <= history.length || n === 3).map((n) => button(`最近 ${Math.min(n, history.length)} 堂`, () => {
      close();
      exportPdf(student, history.slice(0, n));
    }, 'list-item')),
    history.length > 12 && button(`全部 ${history.length} 堂`, () => { close(); exportPdf(student, history); }, 'list-item')));
}

/** A card holding one thing to read. It is a button because a tap gives the detail. */
function card(span, title, iconName, onclick, body, className = '') {
  return h('button', { type: 'button', class: `stat-card rise ${span} ${className}`.trim(), onclick },
    h('span', { class: 'card-title' }, iconName && icon(iconName), h('span', {}, title)),
    body);
}

/** Fits the whole text in one size: 20 when it fits, else 16 for all of it. Only past that does it end in "…". */
function fitText(el) {
  requestAnimationFrame(() => {
    if (!el.isConnected) return;
    el.classList.remove('is-small');
    if (el.scrollHeight > el.clientHeight + 1) el.classList.add('is-small');
  });
}

/** Free text read in one go, every word the same size. A tap shows all of it. */
function textCard(student, span, title, iconName, value, emptyText, className = '') {
  const open = value
    ? () => openSheet(title, (close) => h('div', { class: 'stack' },
      h('p', { class: 'contra' }, value),
      button('編輯資料', () => { close(); editProfileSheet(student); }, '')))
    : () => editProfileSheet(student);
  const text = value && h('span', { class: 'card-full' }, value.trim());
  if (text) fitText(text);
  return card(span, title, iconName, open, value
    ? h('span', { class: 'card-text' }, text)
    : h('span', { class: 'card-text' }, h('span', { class: 'card-empty' }, emptyText)), value ? className : '');
}

function termCard(studentId, todaySession, count) {
  const note = count.newTerm ? '新的一期' : count.no === count.size ? '最後一堂' : '';
  return h('button', {
    type: 'button',
    class: 'stat-card rise span-2',
    'aria-label': `${todaySession ? '今天' : '下一堂'}是第 ${count.no} 堂，共 ${count.size} 堂，點一下修正`,
    onclick: () => classNumberSheet(studentId, todaySession, refreshView),
  },
  h('span', { class: 'card-title' }, h('span', {}, todaySession ? '今天第幾堂' : '下一堂第幾堂')),
  h('span', { class: 'term-body' }, termRing(count.no, count.size), h('span', { class: 'term-side' }, h('span', { class: 'muted' }, `共 ${count.size} 堂`), note && h('span', { class: 'small' }, note))));
}

function nextCard(student) {
  const info = nextClassInfo(student, store.all('events'), dateKey());
  // The calendar is the booking; a date picked only in the app still needs booking in the calendar.
  const state = !info.date ? '點一下設定' : info.source === 'calendar' ? '日曆' : '日曆還沒約';
  return h('button', {
    type: 'button',
    class: 'stat-card rise span-2',
    'aria-label': info.date ? `下次上課 ${info.date} ${info.time}，${state}` : '下次上課還沒確定，點一下設定',
    onclick: () => nextDateSheet(student.id, refreshView),
  },
  h('span', { class: 'card-title' }, h('span', {}, '下次上課')),
  h('span', { class: 'term-body' }, calendarPage(info.date), h('span', { class: 'term-side' }, info.time && h('span', { class: 'next-time' }, info.time), h('span', { class: info.source === 'calendar' ? 'muted small' : 'card-note' }, state))));
}

function statusCard(history, span) {
  const status = overallStatus(history);
  const iconName = status.tone === 'up' ? 'up' : status.tone === 'alert' ? 'warn' : 'flat';
  const more = status.reasons.length > 1 || status.notes.length > 0;
  return card(span, '整體狀態', null, () => statusSheet(status), h('span', { class: 'status-body' },
    h('span', { class: 'status-mark' }, icon(iconName)),
    h('span', { class: 'card-head' }, status.label),
    h('span', { class: 'card-rest' }, status.notes[0] || status.detail),
    more && h('span', { class: 'status-more' }, status.notes[0] ? status.detail : `還有 ${status.reasons.length - 1} 項`)), `status-${status.tone}`);
}

/** Every reason behind the status, so the teacher can see why. */
function statusSheet(status) {
  const marks = { alert: 'warn', up: 'up', flat: 'flat' };
  openSheet(`整體狀態：${status.label}`, () => h('div', { class: 'stack' },
    status.reasons.length
      ? h('ul', { class: 'status-list' }, status.reasons.map((item) => h('li', { class: `status-${item.tone}` }, icon(marks[item.tone]), h('span', {}, item.text))))
      : h('p', { class: 'muted' }, status.detail),
    status.notes.length > 0 && h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, '減輕的動作當時的備註'),
      status.notes.map((text) => h('p', {}, text)))));
}

function learnedSheet(summary) {
  openSheet('學過的動作', () => h('div', { class: 'stack' },
    [...summary.strength.groups, ...summary.pilates.groups].filter((group) => group.learned).map((group) => h('div', { class: 'field' },
      h('div', { class: 'stepper-label' }, `${group.group}（${group.learned}）`),
      h('p', {}, group.names.join('、')))),
    summary.strength.count + summary.pilates.count === 0 && h('p', { class: 'muted' }, '還沒有上課紀錄。')));
}

// Every body part has a tile of the same size, so the card never grows as more exercises are learned.
function learnedCard(history, span) {
  const summary = learnedSummary(history, store.all('exercises'), (id) => store.get('exercises', id));
  const level = pilatesLevel(history);
  const showStrength = summary.strength.count > 0 || summary.pilates.count === 0;
  const tiles = (groups) => h('span', { class: 'learn-tiles' }, groups.map((group) => learnedTile(group.group, group.learned, group.total)));
  return card(span, '學習程度', null, () => learnedSheet(summary), [
    showStrength && h('span', { class: 'learn-block' },
      h('span', { class: 'learn-head' }, h('strong', {}, '重訓'), `學了 ${summary.strength.count} 個`),
      tiles(summary.strength.groups)),
    summary.pilates.count > 0 && h('span', { class: 'learn-block' },
      h('span', { class: 'learn-head' }, h('strong', {}, '皮拉提斯'), `學了 ${summary.pilates.count} 個`),
      tiles(summary.pilates.groups.filter((group) => group.group !== '未分類' || group.learned)),
      (level.quality !== null || level.assist) && h('span', { class: 'level-row' },
        level.quality !== null && h('span', { class: 'level-item' }, h('span', { class: 'muted small' }, '品質'), qualityDots(level.quality), h('span', { class: 'small' }, level.quality)),
        level.assist && h('span', { class: 'level-item' }, h('span', { class: 'muted small' }, '協助'), h('span', { class: 'small' }, level.assist)))),
  ].filter(Boolean));
}

function changeText(change) {
  if (!change) return '持平';
  return `${change > 0 ? '+' : '−'}${Math.abs(change)} kg`;
}

function weightCard(history, span) {
  const trends = weightTrends(history, 2);
  const all = weightTrends(history, 12);
  return card(span, '重量趨勢', null, () => openSheet('重量趨勢', () => h('div', { class: 'stack' },
    all.length ? all.map((item) => trendChart(item.name, item.points, Math.min(window.innerWidth, 620) - 48)) : h('p', { class: 'muted' }, '同一個動作上過兩堂，就會出現趨勢。')), { wide: true }),
  trends.length
    ? h('span', { class: 'series-list' }, trends.map((item) => h('span', { class: 'series-row is-stacked' },
      h('span', { class: 'series-name' }, item.name),
      sparkline(item.points.map((point) => point.weight), `${item.name} 從 ${item.points[0].weight} 到 ${item.points.at(-1).weight} 公斤`),
      h('span', { class: 'series-change' }, item.change > 0 && icon('up'), item.change < 0 && icon('down'), changeText(item.change)))))
    : h('span', { class: 'card-empty' }, '再上一堂才有趨勢'));
}

const PAIN_WORDS = { up: '上升', down: '下降', same: '持平' };

/** The latest score of every part that hurt lately, drawn on the body. Parts back to 0 are left plain. */
function painFigure(series, readOnly) {
  return scoreFigure(Object.fromEntries(series.filter((item) => item.latest > 0 && item.part !== '未標部位').map((item) => [item.part, item.latest])), readOnly);
}

function scoreFigure(scores, readOnly) {
  const map = bodyMap(() => {}, { readOnly });
  map.update(scores, null);
  return map.el;
}

function painSheet(history, student) {
  const profile = painList(student.pain || {}).filter((p) => p.part);
  const items = recentPain(history, 12);
  const series = painSeries(history);
  openSheet('疼痛紀錄', () => h('div', { class: 'stack' },
    series.length > 0 && h('div', { class: 'pain-sheet-map' }, painFigure(series, true),
      h('p', { class: 'muted small' }, '圖上的數字是最近一堂的分數，已經不痛的部位不上色。')),
    series.length > 0 && h('div', { class: 'series-list' }, series.map((item) => h('div', { class: 'series-row' },
      h('span', { class: 'series-name' }, item.part),
      painBars(item.scores, `${item.part} 最近 ${item.scores.length} 堂的分數：${item.scores.join('、')}`),
      h('span', { class: 'series-change' }, `${item.latest} 分`, h('span', { class: 'muted small' }, PAIN_WORDS[item.direction]))))),
    items.length
      ? h('div', { class: 'stack-sm' }, h('div', { class: 'stepper-label' }, '每次紀錄'),
        items.map((p) => h('div', { class: 'history-row' }, h('strong', {}, `${shortDate(p.date)} ${p.exercise}`), h('div', {}, p.text), p.note && h('div', { class: 'muted small' }, p.note))))
      : h('p', { class: 'muted' }, '最近沒有上課的疼痛紀錄。'),
    h('div', { class: 'stack-sm' }, h('div', { class: 'stepper-label' }, '學生資料記的疼痛'),
      profile.length
        ? h('div', { class: 'pain-sheet-map' }, scoreFigure(painScores(student.pain), true),
          h('div', {}, h('p', {}, painText(student.pain)), student.pain.painNote && h('p', { class: 'muted small' }, student.pain.painNote)))
        : h('p', { class: 'muted' }, '還沒標。'),
      button(profile.length ? '修改學生資料的疼痛' : '在人體圖標出來', () => editProfileSheet(student), ''))), { wide: true });
}

function painCard(history, student) {
  const series = painSeries(history);
  const sore = series.filter((item) => item.latest > 0);
  const profile = painList(student.pain || {}).filter((p) => p.part);
  const fromProfile = !series.length && profile.length > 0;
  return card('span-3', '疼痛變化', null, () => painSheet(history, student),
    fromProfile
      ? h('span', { class: 'pain-card' },
        scoreFigure(painScores(student.pain), true),
        h('span', { class: 'pain-list' },
          profile.slice(0, 3).map((item) => h('span', { class: 'pain-item' },
            h('span', { class: 'pain-part' }, item.part),
            h('span', { class: 'pain-score' }, item.score === null ? '—' : `${item.score} 分`))),
          h('span', { class: 'muted small' }, '學生資料記的')))
    : series.length
      ? h('span', { class: 'pain-card' },
        painFigure(series, true),
        h('span', { class: 'pain-list' },
          (sore.length ? sore : series).slice(0, 3).map((item) => h('span', { class: 'pain-item' },
            h('span', { class: 'pain-part' }, item.part),
            h('span', { class: 'pain-score' }, `${item.latest} 分`),
            h('span', { class: 'muted small' }, PAIN_WORDS[item.direction]))),
          series.length > 3 && h('span', { class: 'muted small' }, `共 ${series.length} 個部位`)))
      : h('span', { class: 'pain-none' }, icon('check'), h('span', { class: 'card-head' }, history.length ? '沒有疼痛' : '尚無紀錄')),
    sore.length || fromProfile ? 'is-alert' : '');
}

const BODY_FIELDS = [['weight', '體重', 'kg', 400], ['fat', '體脂', '%', 80], ['muscle', '肌肉量', 'kg', 200]];

function bodySheet(student) {
  openSheet('身體組成', (close) => {
    const date = h('input', { class: 'input', type: 'date', max: dateKey(), 'aria-label': '量測日期' });
    date.value = dateKey();
    const inputs = BODY_FIELDS.map(([key, label, unit]) => [key, h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: '0.1', min: '0', 'aria-label': `${label}（${unit}）` })]);
    const { sorted } = bodyCompSummary(student.bodyComp, dateKey());
    const saveList = (list) => store.save('students', { ...store.get('students', student.id), bodyComp: list });
    const add = () => {
      const entry = { date: date.value };
      if (!entry.date || entry.date > dateKey()) { toast('請選今天或之前的日期'); return; }
      for (const [[key, input], [, label, , max]] of inputs.map((pair, i) => [pair, BODY_FIELDS[i]])) {
        if (input.value === '') continue;
        const value = Number(input.value);
        if (!(value > 0 && value <= max)) { toast(`${label}的數字不合理，請再看一次`); return; }
        entry[key] = value;
      }
      if (Object.keys(entry).length === 1) { toast('至少填一個數字'); return; }
      const others = (store.get('students', student.id).bodyComp || []).filter((item) => item.date !== entry.date);
      saveList([...others, entry]);
      close();
      refreshView();
    };
    return h('div', { class: 'stack' },
      h('p', { class: 'muted' }, '每 3 個月量一次。有量的才填。'),
      h('div', { class: 'field' }, h('div', { class: 'stepper-label' }, '量測日期'), date),
      h('div', { class: 'body-inputs' }, inputs.map(([, input], i) => h('label', { class: 'field' }, h('span', { class: 'stepper-label' }, `${BODY_FIELDS[i][1]}（${BODY_FIELDS[i][2]}）`), input))),
      button('儲存這次量測', add, 'big primary'),
      sorted.length > 0 && h('div', { class: 'stack-sm' },
        h('div', { class: 'stepper-label' }, '過去量測'),
        sorted.map((item) => h('div', { class: 'row-between option-row' },
          h('span', {}, `${item.date.replaceAll('-', '/')}　${BODY_FIELDS.filter(([key]) => item[key]).map(([key, label, unit]) => `${label} ${item[key]}${unit}`).join('・')}`),
          holdButton('移除', () => {
            const before = store.get('students', student.id).bodyComp || [];
            saveList(before.filter((other) => other.date !== item.date));
            close();
            refreshView();
            toast('已移除這次量測', { label: '復原', run: () => { saveList(before); refreshView(); } });
          }, 'ghost danger-text')))));
  });
}

function bodyCard(student, span) {
  const { latest, previous, due } = bodyCompSummary(student.bodyComp, dateKey());
  const delta = (key) => {
    if (!latest?.[key] || !previous?.[key]) return '';
    const change = Math.round((latest[key] - previous[key]) * 10) / 10;
    return change ? `${change > 0 ? '+' : '−'}${Math.abs(change)}` : '持平';
  };
  return card(span, '身體組成', null, () => bodySheet(student),
    latest
      ? [
        h('span', { class: 'body-stats' }, BODY_FIELDS.map(([key, label, unit]) => h('span', { class: 'body-stat' },
          h('span', { class: 'muted small' }, label),
          h('span', { class: 'body-value' }, latest[key] ?? '—', latest[key] ? h('small', {}, unit) : ''),
          h('span', { class: 'muted small' }, delta(key) || ' ')))),
        h('span', { class: due ? 'card-note' : 'muted small' }, due ? `${shortDate(latest.date)} 量的，該量了` : `${shortDate(latest.date)} 量測`),
      ]
      : h('span', { class: 'card-empty' }, '點一下新增量測'));
}

export function overviewView({ studentId }) {
  const student = store.get('students', studentId);
  const history = doneSessions(store.all('sessions'), studentId);
  const plan = store.get('plans', studentId);
  const hasPlan = plan && !plan.used && plan.rows?.length;
  const today = dateKey();
  const inClass = store.all('sessions').some((s) => s.studentId === studentId && s.date === today && s.status === 'draft');
  const bookedToday = store.all('events').some((e) => e.date === today && e.student && findStudentByName([student], e.student));
  const todaySession = store.all('sessions').find((s) => s.studentId === studentId && s.date === today && s.classNo);
  const count = todaySession ? { no: todaySession.classNo, size: todaySession.packageSize } : nextClassNumber(history.filter((s) => s.date !== today), student);
  // Whatever this student needs next is the one big button.
  const classFirst = inClass || bookedToday || hasPlan;
  const hasStrength = history.some((session) => session.rows.some((row) => row.kind === 'strength'));
  const hasPilates = history.some((session) => session.rows.some((row) => row.kind === 'pilates'));
  const pilatesOnly = hasPilates && !hasStrength;

  // Fits one iPad screen: text first, then class count and date, learning and pain, then the numbers.
  return h('div', { class: 'screen has-action overview' },
    h('header', { class: 'topbar' },
      backButton(),
      h('h1', {}, student.name),
      h('div', { class: 'topbar-actions' },
        history.length > 0 && button(`紀錄 ${history.length}`, () => historySheet(history), 'ghost', { 'aria-label': `過去紀錄，共 ${history.length} 堂` }),
        history.length > 0 && button('PDF', () => pdfSheet(student, history), 'ghost', { 'aria-label': '匯出 PDF' }),
        history.length > 0 && button('給學生看', () => go('report', { studentId: student.id }), 'ghost'),
        button('編輯資料', () => editProfileSheet(student), 'ghost'))),
    h('main', { class: 'page bento' },
      textCard(student, 'span-3', '疼痛與禁忌', 'warn', student.contraindications, '還沒填寫，點一下填寫', 'is-alert'),
      textCard(student, 'span-3', '下次要注意', null, student.nextNotes, '沒有註記'),
      textCard(student, 'span-2', '訓練目標', null, student.goal, '還沒填寫，點一下填寫'),
      termCard(studentId, todaySession, count),
      nextCard(student),
      learnedCard(history, 'span-3'),
      painCard(history, student),
      statusCard(history, pilatesOnly ? 'span-3' : 'span-2'),
      !pilatesOnly && weightCard(history, 'span-2'),
      bodyCard(student, pilatesOnly ? 'span-3' : 'span-2')),
    h('div', { class: 'action-bar' },
      button('排下次', () => go('plan', { studentId }), classFirst ? '' : 'primary'),
      button(inClass ? '繼續上課' : '開始上課', () => go('record', { studentId }), classFirst ? 'primary' : '')));
}
