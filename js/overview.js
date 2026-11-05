// Everything needed to understand a student in under a minute, most important first.
import { h, button, backButton, go, back, home, openSheet, confirmSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import { classNumberSheet, nextDateSheet, nextDateText } from './classinfo.js';
import { dateKey, doneSessions, nextClassNumber, classLabel, recentPain, exerciseTrend, isBpFlagged, findStudentByName, setText, rowDetails } from './core.js';
import { kindLabel } from './today.js';
import { exportPdf } from './print.js';
import { icon } from './icons.js';
import { trendChart } from './trend.js';

function shortDate(key) {
  return key.slice(5).replace('-', '/');
}

function sessionTable(session) {
  return h('div', { class: 'stack-sm' }, session.rows.map((row) => {
    const missed = row.sets.filter((s) => !s.done).length;
    const details = rowDetails(row).join('・');
    return h('div', { class: 'history-row' },
      h('div', { class: 'history-main' },
        h('strong', {}, row.name),
        h('span', { class: 'history-sets' }, row.sets.map((set) => h('span', { class: set.done ? '' : 'set-missed' }, setText(row, set))))),
      missed > 0 && h('span', { class: 'chip chip-alert' }, `${missed} 組未完成`),
      details && h('div', { class: 'muted small' }, details));
  }));
}


function editProfileSheet(student) {
  openSheet('學生資料', (close) => {
    const name = h('input', { class: 'input', value: student.name, 'aria-label': '姓名' });
    const aliases = h('input', { class: 'input', value: (student.aliases || []).join('、'), 'aria-label': '日曆上的其他寫法' });
    const goal = h('textarea', { class: 'input', 'aria-label': '訓練目標' });
    goal.value = student.goal || '';
    const contra = h('textarea', { class: 'input', 'aria-label': '疼痛與禁忌' });
    contra.value = student.contraindications || '';
    const others = store.all('students').filter((s) => s.id !== student.id);
    const hasRecords = store.all('sessions').some((s) => s.studentId === student.id);
    return h('div', { class: 'stack' },
      h('div', { class: 'stepper-label' }, '姓名'), name,
      h('div', { class: 'stepper-label' }, '日曆上的其他寫法（用、分開）'), aliases,
      h('div', { class: 'stepper-label' }, '訓練目標'), goal,
      h('div', { class: 'stepper-label' }, '疼痛與禁忌'), contra,
      button('儲存', () => {
        const nextName = name.value.trim();
        if (!nextName) { toast('姓名不可空白'); return; }
        store.save('students', {
          ...student,
          name: nextName,
          aliases: aliases.value.split(/[、,，]/).map((a) => a.trim()).filter(Boolean),
          goal: goal.value,
          contraindications: contra.value,
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

function pdfSheet(student, history) {
  openSheet('匯出 MRE005 PDF', (close) => h('div', { class: 'stack' },
    [3, 6, 12].filter((n) => n <= history.length || n === 3).map((n) => button(`最近 ${Math.min(n, history.length)} 堂`, () => {
      close();
      exportPdf(student, history.slice(0, n));
    }, 'list-item')),
    history.length > 12 && button(`全部 ${history.length} 堂`, () => { close(); exportPdf(student, history); }, 'list-item')));
}

export function overviewView({ studentId }) {
  const student = store.get('students', studentId);
  const history = doneSessions(store.all('sessions'), studentId);
  const last = history[0];
  const pains = recentPain(history);
  const plan = store.get('plans', studentId);
  const hasPlan = plan && !plan.used && plan.rows?.length;
  const unsigned = history.filter((s) => !s.studentSignature).length;
  const exerciseIds = last ? last.rows.filter((r) => r.kind === 'strength').map((r) => r.exerciseId) : [];
  const today = dateKey();
  const inClass = store.all('sessions').some((s) => s.studentId === studentId && s.date === today && s.status === 'draft');
  const bookedToday = store.all('events').some((e) => e.date === today && e.student && findStudentByName([student], e.student));
  const needsProfile = !student.contraindications && !student.goal;
  const todaySession = store.all('sessions').find((s) => s.studentId === studentId && s.date === today && s.classNo !== undefined);
  const count = todaySession ? { no: todaySession.classNo, size: todaySession.packageSize } : nextClassNumber(history.filter((s) => s.date !== today), student);
  const classText = classLabel(count.no, count.size);
  // Whatever this student needs next is the one big button.
  const classFirst = inClass || bookedToday || hasPlan;
  const trends = exerciseIds.map((id) => {
    const points = exerciseTrend(id, history);
    if (points.length < 2) return null;
    const name = last.rows.find((r) => r.exerciseId === id).name;
    return trendChart(name, points);
  }).filter(Boolean);

  return h('div', { class: 'screen has-action' },
    h('header', { class: 'topbar' },
      backButton(),
      h('h1', {}, student.name),
      button('編輯資料', () => editProfileSheet(student), 'ghost')),
    h('main', { class: 'page bento' },
      h('section', { class: `first-card rise span-4${student.contraindications || pains.length ? ' is-alert' : ''}` },
        h('div', { class: 'card-title' }, icon('warn'), h('span', {}, '疼痛與禁忌')),
        student.contraindications
          ? h('p', { class: 'contra' }, student.contraindications)
          : h('div', { class: 'row-between' }, h('p', {}, '還沒填寫'), button('現在填寫', () => editProfileSheet(student), needsProfile ? 'primary' : '')),
        pains.length > 0 && h('ul', { class: 'plain-list' }, pains.slice(0, 5).map((p) => h('li', {},
          `${shortDate(p.date)} ${p.exercise}：${p.text}${p.note ? `（${p.note}）` : ''}`)))),
      h('section', { class: 'first-card rise span-2' },
        h('div', { class: 'card-title' }, icon('clock'), h('span', {}, '下次要注意的事')),
        student.nextNotes ? h('p', { class: 'contra' }, student.nextNotes) : h('p', { class: 'muted' }, '沒有註記')),
      h('button', { type: 'button', class: 'class-card rise span-3', onclick: () => classNumberSheet(studentId, todaySession, refreshView) },
        h('span', { class: 'stepper-label' }, todaySession ? '今天' : '下一堂'),
        h('strong', {}, classText || '還沒設定'),
        h('span', { class: 'muted' }, classText ? (count.newTerm ? '新的一期，點一下修改' : count.no === count.size ? '這期最後一堂，點一下修改' : '點一下修改') : '點一下設定第幾堂')),
      h('button', { type: 'button', class: 'class-card rise span-3', onclick: () => nextDateSheet(studentId, refreshView) },
        h('span', { class: 'stepper-label' }, '下次上課'),
        h('strong', {}, nextDateText(student).replace(/^下次 ?/, '')),
        h('span', { class: 'muted' }, '點一下確認')),
      h('section', { class: 'first-card rise span-6' },
        h('div', { class: 'card-title' }, icon('check'), h('span', {}, '上次上課')),
        last ? [
          h('div', {},
            h('p', {}, `${last.date.replaceAll('-', '/')}・${kindLabel(last.kind)}${last.classNo ? `・${classLabel(last.classNo, last.packageSize)}` : ''}`),
            (last.bpSys || last.hr) && h('p', { class: 'muted' },
              last.bpSys ? `血壓 ${last.bpSys}/${last.bpDia}${isBpFlagged(last.bpSys, last.bpDia) ? ' 偏高' : ''}` : '',
              last.bpSys && last.hr ? '・' : '',
              last.hr ? `心跳 ${last.hr}` : '')),
          Object.entries(last.flags || {}).some(([, v]) => v) && h('p', {}, '當天狀況：', Object.entries({ pain: '疼痛', sleep: '睡眠', diet: '飲食', mood: '心情' }).filter(([k]) => last.flags[k]).map(([, v]) => v).join('、')),
          last.special && h('p', {}, `特殊狀況：${last.special}`),
          last.note && h('p', {}, `備註：${last.note}`),
          sessionTable(last),
        ] : h('p', { class: 'muted' }, '還沒有上課紀錄')),
      student.goal && fold('訓練目標', h('p', {}, student.goal)),
      trends.length > 0 && history.length > 1 && fold('重量趨勢', trends),
      history.length > 1 && fold(`過去紀錄（${history.length}）`, history.slice(1).map((session) => button(`${session.date.replaceAll('-', '/')}・${kindLabel(session.kind)}${session.classNo ? `・${classLabel(session.classNo, session.packageSize)}` : ''}`, () => {
        openSheet(session.date.replaceAll('-', '/'), () => sessionTable(session), { wide: true });
      }, 'list-item'))),
      history.length > 0 && fold('匯出 PDF', [
        unsigned > 0 && h('p', { class: 'muted' }, `有 ${unsigned} 堂還沒有學生簽名。`),
        button('選擇要匯出的課', () => pdfSheet(student, history), 'list-item'),
      ])),
    h('div', { class: 'action-bar' },
      button('排下次', () => go('plan', { studentId }), classFirst ? '' : 'primary'),
      button(inClass ? '繼續上課' : '開始上課', () => go('record', { studentId }), classFirst ? 'primary' : '')));
}

function fold(title, ...body) {
  return h('details', { class: 'fold span-6' },
    h('summary', {}, h('span', {}, title), icon('next')),
    h('div', { class: 'fold-body' }, body));
}
