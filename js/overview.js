// Who this student is right now, readable in three seconds. Each card shows one point; a tap gives the detail.
import { h, button, holdButton, backButton, go, back, home, openSheet, confirmSheet, toast, refreshView } from './dom.js';
import * as store from './store.js';
import { isConnected, isWaiting } from './sync.js';
import { classNumberSheet, nextDateSheet, countModeSheet } from './classinfo.js';
import {
  dateKey, doneSessions, nextClassNumber, nextClassInfo, findStudentByName, studentForEvent, cleanBirthday, recentPain, painNoteText, learnedSummary, pilatesLevel,
  weightTrends, volumeSeries, ONE_RM_MAX_REPS, painSeries, overallStatus, bodyCompSummary, painList, painText, setPainMap,
  latestAssessment, problemCountText, problemText, openProblems, PROBLEM_STATUS, canDeleteStudent, classTeacherId, classCountFor, countViewerId, countsSeparately,
} from './core.js';
import { openPainSheet, painScores } from './painsheet.js';
import { exportPdf } from './print.js';
import { icon } from './icons.js';
import { trendChart, volumeChart } from './trend.js';
import { photoSheet, rowMediaStrip } from './photos.js';
import { termRing, calendarPage, sparkline, painBars, learnedTile, qualityDots } from './charts.js';
import { bodyMap } from './bodymap.js';
import { assessmentSheet, editAssessment, latestSummary, problemFigure, problemLegend, lifeNeeds } from './assess.js';
import { sessionTable, sessionFacts, sessionTitle } from './history.js';
import { me, team, visible, teachersFor, setTeacher, mine, myPlan, classTeacher } from './team.js';
import { logSheet } from './accesslog.js';

function shortDate(key) {
  return key.slice(5).replace('-', '/');
}

// Every field saves as it is typed (2026-11-23: the save button sat at the bottom and was easy to miss).
// A blank name or an unreadable birthday is not stored; the old one stays and the line under the field says why.
// The page reads as one line of thought (2026-11-24): daily life and sport → the body (pain, limits, movement
// problems, on one figure) → the training goal, which shows what it rests on while it is written.
export function editProfileSheet(student) {
  let changed = false;
  openSheet('學生資料', (close) => {
    const current = () => store.get('students', student.id) || student;
    const status = h('p', { class: 'muted small', role: 'status' }, '改了會自動儲存，不用按儲存。');
    const saveFields = (fields) => {
      store.save('students', { ...current(), ...fields, isNew: false });
      changed = true;
      status.textContent = '已自動儲存';
      drawBasis();
    };
    const hint = () => h('p', { class: 'muted small field-hint', role: 'status' });
    // One labelled field: the name says where it goes, the small line says what belongs there.
    const field = (label, help, control, ...rest) => h('label', { class: 'pf-field' },
      h('span', { class: 'pf-label' }, label), help && h('span', { class: 'muted small' }, help), control, ...rest);
    const textArea = (key, placeholder, extra = {}) => {
      const el = h('textarea', { class: 'input', placeholder, ...extra });
      el.value = student[key] || '';
      el.addEventListener('input', () => saveFields({ [key]: el.value }));
      return el;
    };
    const textInput = (key, placeholder) => {
      const el = h('input', { class: 'input', value: student[key] || '', placeholder, maxlength: 40 });
      el.addEventListener('input', () => saveFields({ [key]: el.value.trim() }));
      return el;
    };

    // Basic details: rarely changed, so they sit together in one compact row.
    const name = h('input', { class: 'input', value: student.name });
    const nameHint = hint();
    name.addEventListener('input', () => {
      const value = name.value.trim();
      nameHint.textContent = value ? '' : '姓名不可空白，先保留原本的姓名';
      if (value) saveFields({ name: value });
    });
    // Only needed when two students share a name: the calendar title then reads 王小明 0828 (2026-11-12).
    const birthday = h('input', { class: 'input', value: student.birthday || '', inputmode: 'numeric', maxlength: 4, placeholder: '例：0828' });
    const birthdayHint = hint();
    birthday.addEventListener('input', () => {
      const typed = birthday.value.trim();
      const day = cleanBirthday(typed);
      if (!typed || day) {
        birthdayHint.textContent = '';
        saveFields({ birthday: day });
      } else birthdayHint.textContent = typed.length < 4 ? '' : '生日請寫月日 4 碼，例如 0828';
    });
    const aliases = h('input', { class: 'input', value: (student.aliases || []).join('、'), placeholder: '用、分開' });
    aliases.addEventListener('input', () => saveFields({ aliases: aliases.value.split(/[、,，]/).map((a) => a.trim()).filter(Boolean) }));

    // ① Daily life (2026-11-24).
    const job = textInput('job', '例如：久坐辦公、護理師、退休');
    const sports = textInput('sports', '例如：每週爬山、羽球');
    const daily = textArea('dailyNeeds', '例如：抱孫子、爬三樓、提菜籃、蹲下拿東西');

    // ② The body: one figure with the pain and the movement problems, the limits beside it.
    const contra = textArea('contraindications', '例如：左膝術後，避免屈膝超過 90 度');
    const figure = h('div', { class: 'pf-figure' });
    const problems = h('div', { class: 'pf-problems' });
    const openPain = () => openPainSheet('學生資料：疼痛部位', {
      scores: painScores(current().pain),
      partNotes: current().pain?.painPartNotes,
      note: current().pain?.painNote,
      notePlaceholder: '例如：久坐後才痛、上樓梯痛',
      onScores: (map) => {
        const pain = { ...(current().pain || {}) };
        setPainMap(pain, map);
        saveFields({ pain });
        drawBody();
      },
      onPartNotes: (notes) => saveFields({ pain: { ...(current().pain || {}), painPartNotes: notes } }),
      onNote: (value) => saveFields({ pain: { ...(current().pain || {}), painNote: value } }),
      onDone: drawBody,
    });
    const afterAssessment = () => {
      goal.value = current().goal || '';
      drawBody();
      drawBasis();
    };
    function drawBody() {
      const pain = current().pain || {};
      const latest = latestAssessment(current());
      const open = (latest?.problems || []).filter((p) => p.status !== 'solved');
      const painMarked = painList(pain).length > 0;
      figure.replaceChildren(
        button(problemFigure(open, Object.fromEntries(Object.entries(painScores(pain)).filter(([, v]) => v !== null && v !== undefined))), openPain, 'pf-map', { 'aria-label': '在人體圖標疼痛部位' }),
        problemLegend(),
        button([icon('people'), h('span', {}, painMarked ? '改疼痛部位' : '標疼痛部位')], openPain, `pain-pick${painMarked ? ' is-marked' : ''}`));
      problems.replaceChildren(
        h('div', { class: 'row-between' },
          h('span', { class: 'pf-label' }, '動作問題'),
          latest && h('span', { class: 'muted small' }, `${shortDate(latest.date)} 評估・${problemCountText(latest) || '沒有問題'}`)),
        latest
          ? h('div', { class: 'stack-sm' },
            open.length > 0 && h('ul', { class: 'pf-problem-list' }, open.slice(0, 4).map((p) => h('li', {}, problemText(p)))),
            open.length > 4 && h('span', { class: 'muted small' }, `還有 ${open.length - 4} 個`),
            latest.summary?.trim() && h('p', { class: 'pf-summary' }, h('span', { class: 'muted small' }, '問題總結（給學生看）'), h('span', {}, latest.summary.trim())))
          : h('p', { class: 'muted' }, '還沒評估。評估後記下動作問題，會畫在左邊的人體圖上。'),
        h('div', { class: 'row-wrap' },
          button(latest ? '新增評估' : '新增第一次評估', () => editAssessment(current(), null, afterAssessment), ''),
          latest && button([icon('pencil'), h('span', {}, `修改 ${shortDate(latest.date)} 評估`)], () => editAssessment(current(), latest.id, afterAssessment), 'ghost')));
    }

    // ③ The goal, with what it rests on in view (kept current as the fields above change).
    const goal = textArea('goal', '例如：三個月內可以無痛爬三樓', { class: 'input pf-goal' });
    const basis = h('dl', { class: 'pf-basis' });
    function drawBasis() {
      const s = current();
      const life = lifeNeeds(s);
      const body = [painList(s.pain || {}).length && painText(s.pain), s.contraindications?.trim()].filter(Boolean).join('・');
      const summary = latestSummary(s);
      const latest = latestAssessment(s);
      const named = (latest?.problems || []).filter((p) => p.status !== 'solved').map((p) => p.text).join('、');
      const row = (label, text) => [h('dt', {}, label), h('dd', { class: text ? '' : 'muted' }, text || '還沒寫')];
      basis.replaceChildren(...row('① 日常需求', life), ...row('② 疼痛與禁忌', body), ...row('② 動作問題', summary?.text || named));
    }

    const nextNotes = textArea('nextNotes', '例如：先確認左膝角度再加重');
    drawBody();
    drawBasis();

    // A teacher merges only into their own students; an admin into anyone.
    const others = visible(store.all('students'), true).filter((s) => s.id !== student.id);
    const hasRecords = store.all('sessions').some((s) => s.studentId === student.id);
    // A graduated student is archived, not deleted (2026-11-25): folded away in the 學生 list, every record kept.
    // It is undone in one tap, so it needs no hold; the toast offers 復原 as well.
    const archiveSection = () => {
      const s = current();
      const setArchived = (archived, archivedAt) => {
        store.save('students', { ...(store.get('students', student.id) || s), archived, archivedAt, isNew: false });
        refreshView();
      };
      const toggle = () => {
        const was = { archived: !!s.archived, archivedAt: s.archivedAt || '' };
        setArchived(!was.archived, was.archived ? '' : dateKey());
        changed = false;
        close();
        toast(was.archived ? `已取消封存 ${s.name}` : `已封存 ${s.name}，在學生清單最下面`, {
          label: '復原',
          run: () => setArchived(was.archived, was.archivedAt),
        });
      };
      return h('section', { class: 'pf-archive' },
        h('div', { class: 'stack-xs' },
          h('span', { class: 'pf-label' }, s.archived ? '已封存' : '畢業或停課'),
          h('span', { class: 'muted small' }, s.archived
            ? `${s.archivedAt ? `${shortDate(s.archivedAt)} 封存，` : ''}放在學生清單最下面的「已封存」。取消封存就回到清單。`
            : '封存後在學生清單裡收起來，上課紀錄和照片都留著，隨時可以取消封存。')),
        button(s.archived ? '取消封存' : '封存這位學生', toggle, ''));
    };
    // Who teaches this student (2026-11-24). An admin adds or removes a teacher with one tap, undone from the toast;
    // a teacher sees the list. Only shown once colleagues share the app.
    const teachersSection = () => {
      const who = me();
      if (!who || student.demo) return null;
      const box = h('section', { class: 'pf-teachers stack' });
      const draw = () => {
        const teaching = teachersFor(student.id);
        const ids = new Set(teaching.map((p) => p.id));
        const names = teaching.map((p) => (p.disabled ? `${p.name}（已停用）` : p.name)).join('、');
        if (who.role !== 'admin') {
          box.replaceChildren(
            h('span', { class: 'pf-label' }, '負責老師'),
            h('p', {}, names || '還沒有'),
            h('p', { class: 'muted small' }, '要加入或換老師，請找管理者。'));
          return;
        }
        const set = (person, on) => {
          setTeacher(student.id, person.id, on);
          draw();
          refreshView();
          toast(on ? `已把 ${person.name} 加進來` : `已把 ${person.name} 移出`, {
            label: '復原',
            run: () => { setTeacher(student.id, person.id, !on); draw(); refreshView(); },
          });
        };
        // A disabled colleague is listed only while still a teacher here, so the admin can take them off.
        const choices = team().filter((p) => !p.disabled || ids.has(p.id));
        box.replaceChildren(
          h('div', { class: 'stack-xs' },
            h('span', { class: 'pf-label' }, '負責老師'),
            h('span', { class: 'muted small' }, `${teaching.some((p) => !p.disabled)
              ? '點名字加入或移出。轉給別的老師：先點新的老師，再點掉原本的。'
              : '還沒有老師，只有管理者看得到這位學生。點名字加入。'}學生在誰的預約日曆上，誰就會自動加進來。`)),
          h('div', { class: 'chips' }, choices.map((person) => button(
            person.disabled ? `${person.name}（已停用）` : person.name,
            () => set(person, !ids.has(person.id)),
            'chip-btn',
            { 'aria-pressed': ids.has(person.id) ? 'true' : 'false' },
          ))));
      };
      draw();
      return box;
    };
    // 第幾堂 with two or more teachers (2026-11-25 sixth form): one count for the student, or each teacher their own
    // from class 1 with their own term size. Any of the student's teachers may choose; it is part of the details.
    const countSection = () => {
      if (!me() || student.demo) return null;
      const box = h('section', { class: 'pf-teachers pf-count stack' });
      const draw = () => {
        const separate = countsSeparately(current());
        if (teachersFor(student.id).length < 2 && !separate) { box.replaceChildren(); box.hidden = true; return; }
        box.hidden = false;
        // The numbers are checked once before switching (2026-11-26: 中途換的話要有機制防止記錯堂數).
        const choose = (value) => {
          if ((value === 'separate') === countsSeparately(current())) return;
          countModeSheet(student.id, value, (fields) => {
            saveFields(fields);
            draw();
          });
        };
        box.replaceChildren(
          h('div', { class: 'stack-xs' },
            h('span', { class: 'pf-label' }, '第幾堂怎麼算'),
            h('span', { class: 'muted small' }, '好幾位老師教這位學生時，看課程方案選。')),
          h('span', { class: 'chip-seg', role: 'group', 'aria-label': '第幾堂怎麼算' },
            [['together', '一起算'], ['separate', '各算各的']].map(([value, label]) => button(label, () => choose(value),
              'chip-btn seg-btn', { 'aria-pressed': (value === 'separate') === separate ? 'true' : 'false' }))),
          h('p', { class: 'muted small', role: 'status' }, separate
            ? '每位老師只數自己上的課，一期幾堂也各自設定。'
            : '不管哪位老師上課，都接著同一個號碼數。'));
      };
      draw();
      return box;
    };
    // The admin's way into the access log for this student (2026-11-25).
    const logSection = () => me()?.role === 'admin' && !student.demo && h('section', { class: 'pf-archive pf-log' },
      h('div', { class: 'stack-xs' },
        h('span', { class: 'pf-label' }, '存取紀錄'),
        h('span', { class: 'muted small' }, '誰在什麼時候看過、改過這位學生。')),
      button('誰看過、改過', () => logSheet(current()), ''));
    const step =(no, title, help, ...body) => h('section', { class: 'pf-step' },
      h('span', { class: 'pf-no', 'aria-hidden': 'true' }, no),
      h('div', { class: 'pf-step-body' }, h('h3', { class: 'pf-title' }, title), help && h('p', { class: 'muted small' }, help), ...body));
    return h('div', { class: 'stack-lg profile-form' },
      status,
      h('section', { class: 'pf-basic' },
        field('姓名', null, name, nameHint),
        field('生日（同名同姓才填）', null, birthday, birthdayHint),
        field('日曆上的其他寫法', null, aliases)),
      h('div', { class: 'pf-flow' },
        step('1', '生活與運動', '訓練目標要回應的日常需求',
          h('div', { class: 'pf-pair' }, field('職業', null, job), field('運動', null, sports)),
          field('日常動作需求', '想做到、或現在做不好的日常動作', daily)),
        step('2', '身體狀況', '疼痛、禁忌和動作問題畫在同一個人體圖上',
          h('div', { class: 'pf-body' }, figure,
            h('div', { class: 'stack' },
              field('疼痛與禁忌', '哪裡痛、哪些動作不能做', contra),
              problems))),
        step('3', '訓練目標', '根據上面 1、2 寫下想達成的事',
          basis,
          field('訓練目標', null, goal))),
      h('section', { class: 'pf-next' }, field('下次要注意', '只給下一堂課的提醒，上完課可以改', nextNotes)),
      button('完成', close, 'big primary'),
      !hasRecords && others.length > 0 && h('div', { class: 'stack' },
        h('div', { class: 'stepper-label' }, '這其實是舊學生的另一個寫法？點選合併：'),
        others.map((other) => button(other.name, () => {
          const merged = findStudentByName(others, other.name);
          const self = current();
          store.save('students', { ...merged, birthday: merged.birthday || self.birthday || '', aliases: [...new Set([...(merged.aliases || []), self.name])] });
          store.save('students', { ...self, deleted: true, mergedInto: merged.id });
          // The merged student keeps this card's teachers. A teacher moves only themself; the cloud takes only that.
          const mover = me();
          const joined = teachersFor(self.id)
            .filter((p) => (!mover || mover.role === 'admin' || p.id === mover.id) && setTeacher(merged.id, p.id, true));
          changed = false;
          close();
          back();
          go('overview', { studentId: merged.id });
          toast(`已把 ${self.name} 併入 ${merged.name}`, {
            label: '復原',
            run: () => {
              store.save('students', merged);
              store.save('students', { ...self, deleted: false });
              joined.forEach((p) => setTeacher(merged.id, p.id, false));
              back();
              go('overview', { studentId: student.id });
            },
          });
        }, 'list-item'))),
      teachersSection(),
      countSection(),
      logSection(),
      archiveSection(),
      // Once colleagues share the app only an admin deletes a student; a teacher archives instead. It can be undone
      // for 30 days from the bottom of the 學生 list (2026-11-25).
      canDeleteStudent(team(), me()) && h('div', { class: 'stack' },
        button('刪除這位學生的所有紀錄', () => confirmSheet(
          `刪除 ${current().name}`,
          `會刪除 ${current().name} 的學生資料、上課紀錄、課表和照片影片，每台裝置同步後都看不到。30 天內可以在學生清單最下面的「最近刪除」復原，30 天後就清掉、找不回來。雲端「完整紀錄」和「PDF」資料夾裡的 PDF 不會刪，要另外手動刪除。`,
          '確定刪除',
          () => {
            const name = current().name;
            store.deleteStudent(student.id, me()?.id || '');
            changed = false;
            close();
            home();
            toast(`已刪除 ${name}，30 天內可以在學生清單最下面復原`, {
              label: '復原',
              run: () => { store.restoreStudent(student.id); refreshView(); },
            });
          },
        ), 'ghost danger-text')));
  }, { wide: true, onClose: () => { if (changed) refreshView(); } });
}

// Each past class can be opened again and changed (2026-11-16). The change is stored and sent only with 存檔上傳,
// and the list says which classes are still waiting to reach Drive.
function historySheet(history) {
  openSheet(`過去紀錄（${history.length}）`, (closeList) => {
    const items = history.map((session) => {
      const badge = h('span', { class: 'upload-badge' });
      const item = button([h('span', {}, sessionTitle(session)), badge], () => {
        // With colleagues, each class says who taught it, and only that teacher can change it (2026-11-26).
        const teacher = team().length ? classTeacher(session).name : '';
        const edited = session.editedAt ? `修改過 ${session.editedAt.slice(5, 10).replace('-', '/')}` : '';
        openSheet(session.date.replaceAll('-', '/'), (close) => h('div', { class: 'stack-sm' },
          h('div', { class: 'row-between' },
            h('span', { class: 'muted small' }, [teacher && `${teacher}上的課`, edited].filter(Boolean).join('・')),
            mine(session)
              ? button([icon('pencil'), h('span', {}, '編輯這堂')], () => {
                close();
                closeList();
                go('record', { studentId: session.studentId, sessionId: session.id });
              }, '')
              : h('span', { class: 'muted small' }, '只有上課的老師能改')),
          sessionFacts(session), sessionTable(session, (row) => rowMediaStrip(session, row))), { wide: true });
      }, 'list-item history-item');
      // Changes kept on this iPad but not yet saved come first; then saved ones still waiting for Drive.
      if ((store.getMeta('editDrafts', {}) || {})[session.id]) badge.textContent = '還沒存檔';
      else if (isConnected()) {
        isWaiting('sessions', session.id).then((waiting) => {
          if (waiting) badge.textContent = '還沒上傳';
        });
      }
      return item;
    });
    return h('div', { class: 'stack-sm' }, items);
  });
}

function pdfSheet(student, history) {
  const unsigned = history.filter((s) => !s.studentSignature).length;
  openSheet('匯出 MRE005 PDF', (close) => h('div', { class: 'stack' },
    unsigned > 0 && h('p', { class: 'muted' }, `有 ${unsigned} 堂還沒有學生簽名。`),
    // Shorter ranges only when they leave something out; "all" is always there (2026-11-17: 5 classes could not export all 5).
    [3, 6, 12].filter((n) => n < history.length).map((n) => button(`最近 ${n} 堂`, () => {
      close();
      exportPdf(student, history.slice(0, n));
    }, 'list-item')),
    button(`全部 ${history.length} 堂`, () => { close(); exportPdf(student, history); }, 'list-item')));
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

const PROBLEM_LABEL = Object.fromEntries(PROBLEM_STATUS);

/**
 * Movement problems from the latest assessment. Each one still there is named with its status in front (2026-11-27:
 * 「還在 3」 did not say what the 3 was, nor which were still there and which were better).
 */
function problemCard(student, span) {
  const latest = latestAssessment(student);
  const open = openProblems(latest);
  const solved = (latest?.problems || []).length - open.length;
  const shown = open.slice(0, 3);
  return card(span, '動作問題', null, () => (latest ? assessmentSheet(student) : editAssessment(student)), latest
    ? [
      h('span', { class: 'card-head' }, open.length ? `${open.length} 個問題還沒解決` : (solved ? '問題都解決了' : '沒有問題')),
      shown.length > 0 && h('span', { class: 'problem-card-list' }, shown.map((p) => h('span', { class: 'problem-card-row' },
        h('span', { class: `problem-status is-${p.status || 'open'}` }, PROBLEM_LABEL[p.status || 'open']),
        h('span', { class: 'problem-card-text' }, problemText(p))))),
      h('span', { class: 'muted small' }, [`${shortDate(latest.date)} 評估`, open.length > 3 && `還有 ${open.length - 3} 個點開看`, solved > 0 && `已解決 ${solved} 個`].filter(Boolean).join('・')),
    ]
    : h('span', { class: 'card-empty' }, '還沒評估，點一下新增'));
}

/**
 * 第幾堂. `whose` names the teacher when each teacher counts separately. Another teacher's class today is corrected
 * by that teacher (2026-11-26: 只能改自己上的課).
 */
function termCard(studentId, todaySession, count, viewer, whose) {
  const note = count.newTerm ? '新的一期' : count.no === count.size ? '最後一堂' : '';
  const theirs = todaySession && !mine(todaySession);
  return h('button', {
    type: 'button',
    class: 'stat-card rise span-2',
    'aria-label': `${whose ? `${whose}的` : ''}${todaySession ? '今天' : '下一堂'}是第 ${count.no} 堂，共 ${count.size} 堂${theirs ? '' : '，點一下修正'}`,
    onclick: () => (theirs
      ? toast(`今天這堂是${classTeacher(todaySession).name || '別的老師'}上的課，要修正請找上課的老師`)
      : classNumberSheet(studentId, todaySession, refreshView, viewer)),
  },
  h('span', { class: 'card-title' }, h('span', {}, todaySession ? '今天第幾堂' : '下一堂第幾堂')),
  h('span', { class: 'term-body' }, termRing(count.no, count.size), h('span', { class: 'term-side' },
    whose && h('span', { class: 'small' }, `${whose}的課`),
    h('span', { class: 'muted' }, `共 ${count.size} 堂`), note && h('span', { class: 'small' }, note))));
}

function nextCard(student) {
  const info = nextClassInfo(student, store.all('events'), dateKey(), store.all('students'));
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
  const summary = learnedSummary(history, store.all('exercises'), (id) => store.get('exercises', id), { byPattern: true });
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

// Volume per class on top, then one chart per exercise: heaviest set, or the estimated 1RM (2026-11-17).
function weightSheet(history, all) {
  openSheet('重量趨勢', () => {
    const width = Math.min(window.innerWidth, 620) - 48;
    const volumes = volumeSeries(history);
    let metric = 'weight';
    const tabs = h('div', { class: 'segmented' });
    const charts = h('div', { class: 'stack' });
    const draw = () => {
      tabs.replaceChildren(
        button('最重一組', () => { metric = 'weight'; draw(); }, 'chip-btn', { 'aria-pressed': String(metric === 'weight') }),
        button('推估最大重量', () => { metric = 'e1rm'; draw(); }, 'chip-btn', { 'aria-pressed': String(metric === 'e1rm') }));
      const items = all
        .map((item) => (metric === 'e1rm' ? { ...item, points: item.points.filter((p) => p.e1rm > 0) } : item))
        .filter((item) => item.points.length >= 2);
      charts.replaceChildren(...[
        metric === 'e1rm' && h('p', { class: 'muted small' }, `用每組的重量和次數推算只做 1 下的最大重量（Epley 公式），超過 ${ONE_RM_MAX_REPS} 下的組不算。只是估計，不用真的去測。`),
        ...(items.length
          ? items.map((item) => trendChart(item.name, item.points, width, metric))
          : [h('p', { class: 'muted' }, '同一個動作上過兩堂，就會出現趨勢。')]),
      ].filter(Boolean));
    };
    draw();
    return h('div', { class: 'stack' },
      volumes.length > 0 && volumeChart(volumes, width),
      all.length > 0 && tabs,
      charts);
  }, { wide: true });
}

function weightCard(history, span) {
  const trends = weightTrends(history, 2);
  const all = weightTrends(history, 12);
  return card(span, '重量趨勢', null, () => weightSheet(history, all),
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
          h('div', {}, h('p', {}, painText(student.pain)), painNoteText(student.pain) && h('p', { class: 'muted small' }, painNoteText(student.pain))))
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
  const plan = myPlan(studentId);
  const hasPlan = plan && !plan.used && plan.rows?.length;
  const today = dateKey();
  // 開始上課 opens this teacher's own class: another teacher's class today stays theirs (2026-11-26).
  const inClass = store.all('sessions').some((s) => s.studentId === studentId && s.date === today && s.status === 'draft' && mine(s));
  const bookedToday = store.all('events').some((e) => e.date === today && !e.change && studentForEvent(store.all('students'), e)?.id === student.id);
  // Whose class count shows (2026-11-25 sixth form): one count when counted together, else the teacher's own.
  const staff = team();
  const viewer = countViewerId(student, history, staff, me(), teachersFor(studentId).map((p) => p.id));
  const byViewer = (s) => !viewer || classTeacherId(s, staff) === viewer;
  const todaySession = store.all('sessions').find((s) => s.studentId === studentId && s.date === today && s.classNo && byViewer(s));
  const count = todaySession ? { no: todaySession.classNo, size: todaySession.packageSize }
    : classCountFor(history.filter((s) => !(s.date === today && byViewer(s))), student, viewer, staff);
  const whose = countsSeparately(student) && viewer && teachersFor(studentId).length > 1 ? staff.find((p) => p.id === viewer)?.name || '' : '';
  // Whatever this student needs next is the one big button.
  const classFirst = inClass || bookedToday || hasPlan;
  const hasStrength = history.some((session) => session.rows.some((row) => row.kind === 'strength'));
  const hasPilates = history.some((session) => session.rows.some((row) => row.kind === 'pilates'));
  const pilatesOnly = hasPilates && !hasStrength;

  // Fits one iPad screen: text first, then class count and date, learning and pain, then the numbers.
  return h('div', { class: 'screen has-action overview' },
    h('header', { class: 'topbar' },
      backButton(),
      h('h1', {}, student.name, student.birthday ? h('small', { class: 'name-birthday' }, ` ${student.birthday}`) : null,
        student.archived && h('span', { class: 'chip archived-chip' }, '已封存')),
      h('div', { class: 'topbar-actions' },
        history.length > 0 && button(`紀錄 ${history.length}`, () => historySheet(history), 'ghost', { 'aria-label': `過去紀錄，共 ${history.length} 堂` }),
        history.length > 0 && button('PDF', () => pdfSheet(student, history), 'ghost', { 'aria-label': '匯出 PDF' }),
        history.length > 0 && button('給學生看', () => go('report', { studentId: student.id }), 'ghost'),
        button('照片影片', () => photoSheet(student), 'ghost', { 'aria-label': '照片與影片' }),
        button('編輯資料', () => editProfileSheet(student), 'ghost'))),
    h('main', { class: 'page bento' },
      textCard(student, 'span-3', '疼痛與禁忌', 'warn', student.contraindications, '還沒填寫，點一下填寫', 'is-alert'),
      textCard(student, 'span-3', '下次要注意', null, student.nextNotes, '沒有註記'),
      // The goal sits beside the movement problems so the two can be read against each other (2026-11-23).
      textCard(student, 'span-3', '訓練目標', null, student.goal, '還沒填寫，點一下填寫'),
      problemCard(student, 'span-3'),
      termCard(studentId, todaySession, count, viewer, whose),
      nextCard(student),
      statusCard(history, 'span-2'),
      learnedCard(history, 'span-3'),
      painCard(history, student),
      !pilatesOnly && weightCard(history, 'span-3'),
      bodyCard(student, pilatesOnly ? 'span-6' : 'span-3')),
    h('div', { class: 'action-bar' },
      button('排下次', () => go('plan', { studentId }), classFirst ? '' : 'primary'),
      button(inClass ? '繼續上課' : '開始上課', () => go('record', { studentId }), classFirst ? 'primary' : '')));
}
