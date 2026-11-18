// Photos with an aligned camera (2026-11-17, v26): the last photo of the same angle shows through the viewfinder,
// so every photo of that angle is taken from the same spot. Short videos and the class-screen camera came in v27.
// Images and videos stay on this iPad and the company Drive.
import { h, button, holdButton, openSheet, toast } from './dom.js';
import * as store from './store.js';
import { photoBlob, syncSoon } from './sync.js';
import {
  dateKey, PHOTO_ANGLES, photoAngleLabel, photosOf, isVideo, mediaLabel, exerciseMedia, mediaExercises,
  VIDEO_MAX_SECONDS, VIDEO_MAX_BYTES, clockText, rowMedia, setText,
} from './core.js';
import { icon } from './icons.js';

const LONG_EDGE = 1200;
const QUALITY = 0.78;
// Portrait 3:4, the way the iPad is held in class. The overlay, the photo and the video use the same frame.
const FRAME = 3 / 4;
// About 11 MB a minute: one upload to Apps Script, and smooth enough to watch form.
const VIDEO_WIDTH = 720;
const VIDEO_HEIGHT = 960;
const VIDEO_BITS = 1_500_000;

const urls = new Map();
// Same set names as the class screen (第二組); file names keep digits so they sort.
const SET_NAMES = ['一', '二', '三', '四', '五'];
const setName = (n) => `第${SET_NAMES[n - 1] || n}組`;

function shortDate(date) {
  return date.slice(5).replace('-', '/');
}

function placeholder(className, text) {
  return h('span', { class: `${className} photo-missing` }, text);
}

/**
 * An <img> or <video> that fills in once read (from this iPad, or once from Drive).
 * `lazy` videos that are not on this iPad yet stay a placeholder, so a list does not download every clip.
 */
function mediaView(item, className = 'photo-img', { lazy = false, controls = false } = {}) {
  const video = isVideo(item);
  const alt = `${item.date.replaceAll('-', '/')} ${mediaLabel(item)}${video ? ' 影片' : ''}`;
  const el = video
    ? h('video', { class: className, playsinline: true, muted: true, preload: 'metadata', controls, 'aria-label': alt })
    : h('img', { class: className, alt });
  if (video) el.muted = true;
  const show = (url) => {
    // #t jumps past the first black frame, so the still in a list shows the movement.
    el.src = video && !controls ? `${url}#t=0.3` : url;
    el.classList.remove('is-loading');
  };
  const ready = urls.get(item.id);
  if (ready) { show(ready); return wrapVideo(el, item, video, controls); }
  el.classList.add('is-loading');
  const fill = (blob) => {
    if (!blob) { el.replaceWith(placeholder(className, '這台 iPad 沒有這個檔案')); return; }
    const url = URL.createObjectURL(blob);
    urls.set(item.id, url);
    show(url);
  };
  const fail = () => el.replaceWith(placeholder(className, '讀不到檔案，連上網路後再試'));
  if (video && lazy) {
    store.readPhotoBlob(item.id).then((blob) => {
      if (blob) fill(blob);
      else el.replaceWith(placeholder(className, '影片 點開再下載'));
    }).catch(fail);
  } else {
    photoBlob(item).then(fill).catch(fail);
  }
  return wrapVideo(el, item, video, controls);
}

/** Lists mark a video with a play sign and its length; a playable one has its own controls. */
function wrapVideo(el, item, video, controls) {
  if (!video || controls) return el;
  return h('span', { class: 'media-wrap' }, el,
    h('span', { class: 'media-badge', 'aria-hidden': 'true' }, icon('play'), clockText(item.duration)));
}

/** Scales and crops a picture to the portrait frame and returns a JPEG. */
function frameToJpeg(source, width, height) {
  let sw = width;
  let sh = height;
  if (sw / sh > FRAME) sw = sh * FRAME;
  else sh = sw / FRAME;
  const scale = Math.min(1, LONG_EDGE / sh);
  const canvas = h('canvas', { width: Math.round(sw * scale), height: Math.round(sh * scale) });
  canvas.getContext('2d').drawImage(source, (width - sw) / 2, (height - sh) / 2, sw, sh, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('無法存成照片'))), 'image/jpeg', QUALITY));
}

async function fileToJpeg(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('這個檔案不是照片'));
      el.src = url;
    });
    return await frameToJpeg(img, img.naturalWidth, img.naturalHeight);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** A video picked from the album is kept as it is; only its length is read. */
async function videoInfo(file) {
  if (file.size > VIDEO_MAX_BYTES) throw new Error(`影片太大（超過 ${VIDEO_MAX_BYTES / 1024 / 1024} MB），請先在相簿剪短`);
  const url = URL.createObjectURL(file);
  try {
    const duration = await new Promise((resolve, reject) => {
      const el = document.createElement('video');
      el.preload = 'metadata';
      el.onloadedmetadata = () => resolve(el.duration);
      el.onerror = () => reject(new Error('這個影片打不開'));
      el.src = url;
    });
    return { type: 'video', mime: file.type || 'video/mp4', duration: Number.isFinite(duration) ? Math.round(duration * 10) / 10 : 0 };
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** Keeps the file on this iPad first, then the record that syncs. `fields` says what it shows (angle or exercise). */
async function saveMedia(student, fields, blob, info = {}) {
  const id = `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await store.savePhotoBlob(id, blob);
  } catch (error) {
    toast(error?.name === 'QuotaExceededError' ? 'iPad 空間不夠，沒有存到' : '沒有存到，請再拍一次');
    return null;
  }
  const item = { id, studentId: student.id, ...fields, date: dateKey(), takenAt: Date.now() };
  if (info.type === 'video') Object.assign(item, { type: 'video', mime: info.mime, duration: info.duration });
  store.save('photos', item);
  syncSoon(1000);
  return item;
}

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Asks the video to play without waiting forever: play() never settles when the camera sends nothing. */
function startPlaying(video) {
  return Promise.race([video.play().catch(() => {}), wait(1000)]);
}

/** Plays the camera and waits for its first frame (up to 4 seconds). */
async function showsPicture(video) {
  const deadline = Date.now() + 4000;
  startPlaying(video);
  while (Date.now() < deadline) {
    if (video.videoWidth && video.readyState >= 2 && !video.paused) return true;
    await wait(100);
    if (video.paused) startPlaying(video);
  }
  return false;
}

/** True when an image, video frame or canvas is entirely black. */
function looksBlack(source) {
  const probe = h('canvas', { width: 24, height: 32 });
  const ctx = probe.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(source, 0, 0, 24, 32);
  const { data } = ctx.getImageData(0, 0, 24, 32);
  for (let i = 0; i < data.length; i += 4) if (data[i] > 10 || data[i + 1] > 10 || data[i + 2] > 10) return false;
  return true;
}

/** True when a picture is entirely black: the camera gave no image. A dark room still has some light. */
async function isBlank(blob) {
  const url = URL.createObjectURL(blob);
  try {
    const img = await new Promise((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    return looksBlack(img);
  } catch {
    return false;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function recorderType() {
  if (typeof MediaRecorder === 'undefined') return null;
  const types = ['video/mp4;codecs=avc1', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm'];
  return types.find((type) => MediaRecorder.isTypeSupported?.(type)) ?? '';
}

/**
 * Full-screen camera with 拍照／錄影. The latest photo of the same angle or exercise lies over the live picture.
 * onShot(blob, info) gets a JPEG, or a video with { type: 'video', mime, duration }.
 */
function openCamera({ title, ghost, onShot }) {
  // A second quick tap must not stack a second camera on the first.
  if (document.querySelector('.camera')) return;
  const video = h('video', { class: 'camera-video', autoplay: true, playsinline: true, muted: true });
  video.muted = true;
  const ghostImg = ghost ? mediaView(ghost, 'camera-ghost') : null;
  const message = h('p', { class: 'camera-message', hidden: true });
  const canRecord = recorderType() !== null;
  let stream = null;
  let facing = 'environment';
  let opacity = 0.45;
  let mode = 'photo';
  let recording = null;
  let closed = false;

  const stop = () => stream?.getTracks().forEach((track) => track.stop());
  const close = () => {
    if (recording) { recording.finish(); return; }
    closed = true;
    stop();
    overlay.remove();
    document.removeEventListener('visibilitychange', onHidden);
  };
  // iPadOS stops the camera when the page is hidden: a clip in progress is kept, then the camera closes.
  const onHidden = () => { if (document.visibilityState === 'hidden') close(); };
  document.addEventListener('visibilitychange', onHidden);

  async function start() {
    stop();
    shutter.disabled = true;
    message.hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
    } catch {
      message.hidden = false;
      message.textContent = '打不開相機。請在 Chrome 允許使用相機，或改用「從相簿選」。';
      return;
    }
    // Closed while the camera was starting: turn it off again at once.
    if (closed) { stop(); return; }
    video.srcObject = stream;
    // iPad Chrome does not always start a camera picture by itself (2026-11-18: the viewfinder stayed black).
    // The shutter waits for the first real frame, so a photo is never taken of nothing.
    if (await showsPicture(video)) {
      shutter.disabled = false;
    } else {
      message.hidden = false;
      message.textContent = '相機畫面沒有出來。請按「取消」再開一次；還是不行，關掉分頁重新打開。';
    }
  }

  async function takePhoto() {
    shutter.disabled = true;
    try {
      if (video.paused) await startPlaying(video);
      const blob = await frameToJpeg(video, video.videoWidth, video.videoHeight);
      if (await isBlank(blob)) {
        shutter.disabled = false;
        toast('拍到的是全黑畫面，沒有存。請等畫面出來再拍一次');
        return;
      }
      close();
      onShot(blob, {});
    } catch {
      shutter.disabled = false;
      toast('照片沒有存到，請再拍一次');
    }
  }

  /** Records what the frame shows: the camera is drawn into a 3:4 canvas, so the clip matches the viewfinder. */
  function startRecording() {
    const canvas = h('canvas', { width: VIDEO_WIDTH, height: VIDEO_HEIGHT });
    const ctx = canvas.getContext('2d');
    let frame = 0;
    let drawn = 0;
    // Recording the camera directly cannot be checked; the 3:4 canvas can (2026-11-18: no black clips).
    let sawPicture = !canvas.captureStream;
    const draw = () => {
      const vw = video.videoWidth;
      const vh = video.videoHeight;
      if (vw && vh) {
        let sw = vw;
        let sh = vh;
        if (sw / sh > FRAME) sw = sh * FRAME;
        else sh = sw / FRAME;
        ctx.drawImage(video, (vw - sw) / 2, (vh - sh) / 2, sw, sh, 0, 0, VIDEO_WIDTH, VIDEO_HEIGHT);
        drawn += 1;
        if (!sawPicture && drawn % 15 === 0 && !looksBlack(canvas)) sawPicture = true;
      }
      frame = requestAnimationFrame(draw);
    };
    draw();
    const source = canvas.captureStream ? canvas.captureStream(30) : stream;
    const type = recorderType();
    let recorder;
    try {
      recorder = new MediaRecorder(source, { ...(type ? { mimeType: type } : {}), videoBitsPerSecond: VIDEO_BITS });
    } catch {
      cancelAnimationFrame(frame);
      toast('這台裝置不能錄影，請改用相機 App 錄好再「從相簿選」');
      return;
    }
    const chunks = [];
    const startedAt = Date.now();
    recorder.ondataavailable = (event) => { if (event.data?.size) chunks.push(event.data); };
    recorder.onstop = () => {
      cancelAnimationFrame(frame);
      clearInterval(tick);
      clearTimeout(limit);
      source.getTracks?.().forEach((track) => { if (source !== stream) track.stop(); });
      recording = null;
      const duration = Math.round((Date.now() - startedAt) / 100) / 10;
      const mime = recorder.mimeType || type || 'video/mp4';
      const blob = new Blob(chunks, { type: mime.split(';')[0] });
      close();
      if (!blob.size) { toast('影片沒有錄到，請再錄一次'); return; }
      if (!sawPicture) { toast('錄到的是全黑畫面，沒有存。請等畫面出來再錄一次'); return; }
      onShot(blob, { type: 'video', mime: blob.type, duration });
    };
    recording = { finish: () => { if (recorder.state !== 'inactive') recorder.stop(); } };
    recorder.start(1000);
    overlay.classList.add('is-recording');
    const tick = setInterval(() => { timer.textContent = `${clockText((Date.now() - startedAt) / 1000)} / ${clockText(VIDEO_MAX_SECONDS)}`; }, 250);
    const limit = setTimeout(() => recording?.finish(), VIDEO_MAX_SECONDS * 1000);
    timer.textContent = `0:00 / ${clockText(VIDEO_MAX_SECONDS)}`;
    shutter.setAttribute('aria-label', '停止錄影並儲存');
    cancel.disabled = true;
    flip.disabled = true;
  }

  const shutter = h('button', { type: 'button', class: 'camera-shutter', 'aria-label': '拍照', disabled: true });
  shutter.addEventListener('click', () => {
    if (!video.videoWidth) return;
    if (mode === 'photo') takePhoto();
    else if (recording) recording.finish();
    else startRecording();
  });
  const timer = h('span', { class: 'camera-timer', 'aria-live': 'polite' });

  const modeButton = (value, label) => h('button', {
    type: 'button',
    class: 'camera-mode',
    'aria-pressed': String(mode === value),
    onclick: () => {
      if (recording) return;
      mode = value;
      overlay.classList.toggle('is-video', mode === 'video');
      shutter.setAttribute('aria-label', mode === 'video' ? '開始錄影' : '拍照');
      for (const b of modes.children) b.setAttribute('aria-pressed', String(b === modeButtons[value]));
    },
  }, label);
  const modeButtons = { photo: modeButton('photo', '拍照'), video: modeButton('video', `錄影（最長 ${VIDEO_MAX_SECONDS} 秒）`) };
  const modes = h('div', { class: 'camera-modes', role: 'group', 'aria-label': '拍照或錄影' }, modeButtons.photo, canRecord && modeButtons.video);

  const slider = h('input', { type: 'range', min: '0', max: '80', step: '5', value: String(opacity * 100), class: 'camera-slider', 'aria-label': '上次照片的濃淡' });
  const sliderValue = h('span', { class: 'camera-slider-value' }, `${Math.round(opacity * 100)}%`);
  slider.addEventListener('input', () => {
    opacity = Number(slider.value) / 100;
    if (ghostImg) ghostImg.style.opacity = String(opacity);
    sliderValue.textContent = `${slider.value}%`;
  });
  if (ghostImg) ghostImg.style.opacity = String(opacity);

  const cancel = button('取消', close, 'ghost camera-text');
  const flip = button('換鏡頭', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); }, 'ghost camera-text');
  const overlay = h('div', { class: 'camera', role: 'dialog', 'aria-modal': 'true', 'aria-label': `拍攝：${title}` },
    h('div', { class: 'camera-bar' }, cancel, h('strong', {}, title), flip),
    h('div', { class: 'camera-frame' },
      video,
      ghostImg,
      h('span', { class: 'camera-guide is-v', 'aria-hidden': 'true' }),
      h('span', { class: 'camera-guide is-h', 'aria-hidden': 'true' }),
      timer,
      message),
    h('div', { class: 'camera-controls' },
      ghost
        ? h('label', { class: 'camera-blend' }, h('span', {}, `${shortDate(ghost.date)} 的照片`), slider, sliderValue)
        : h('p', { class: 'camera-hint' }, '還沒有照片。拍一張，下次會疊在畫面上對齊'),
      modes,
      shutter));
  document.body.append(overlay);
  start();
}

function pickFile(onFile) {
  const input = h('input', { type: 'file', accept: 'image/*,video/*', class: 'visually-hidden' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) onFile(file);
  });
  document.body.append(input);
  input.click();
}

/** Turns a camera shot or an album file into a saved item. */
async function keep(student, fields, blob, info) {
  const item = await saveMedia(student, fields, blob, info);
  if (item) toast(isVideo(item) ? `影片已存到 iPad（${clockText(item.duration)}）` : '照片已存到 iPad');
  return item;
}

async function keepFile(student, fields, file) {
  try {
    if (file.type.startsWith('video/')) return await keep(student, fields, file, await videoInfo(file));
    return await keep(student, fields, await fileToJpeg(file), {});
  } catch (error) {
    toast(error.message);
    return null;
  }
}

/** Which class and set an item from class belongs to, with that set's numbers as they are now. */
function mediaDetail(item) {
  if (!item.exercise) return '';
  const session = item.sessionId ? store.get('sessions', item.sessionId) : null;
  const row = session?.rows.find((r) => r.id === item.rowId);
  const set = item.set ? row?.sets[item.set - 1] : null;
  return [
    item.classNo ? `第${item.classNo}堂` : '',
    item.set ? setName(item.set) : '',
    set ? setText(row, set) : '',
  ].filter(Boolean).join('・');
}

/** The newest photo (not video) to lay over the viewfinder. */
function ghostOf(list) {
  return list.find((item) => !isVideo(item)) || null;
}

/**
 * One group (an angle, or an exercise filmed in class): compare a chosen item with the newest,
 * take the next one, or delete one.
 */
function groupView(student, group, body, onBack) {
  let chosen = null;
  function draw() {
    const list = group.list();
    const latest = list[0];
    if (chosen && !list.some((p) => p.id === chosen)) chosen = null;
    const older = list.find((p) => p.id === chosen) || list.at(-1);
    const after = (item) => { if (item) { chosen = latest?.id || null; draw(); } };
    const take = () => openCamera({
      title: group.label,
      ghost: ghostOf(list),
      onShot: async (blob, info) => after(await keep(student, group.fields, blob, info)),
    });
    const fromFile = () => pickFile(async (file) => after(await keepFile(student, group.fields, file)));
    const remove = (item) => {
      store.save('photos', { ...item, deleted: true });
      syncSoon(1000);
      draw();
      toast(`已刪除 ${shortDate(item.date)} 的${isVideo(item) ? '影片' : '照片'}`, {
        label: '復原',
        run: () => { store.save('photos', { ...store.get('photos', item.id), deleted: false }); syncSoon(1000); draw(); },
      });
    };
    const figure = (item, label) => h('figure', { class: 'photo-figure' },
      mediaView(item, 'photo-img', { controls: true }),
      h('figcaption', {},
        h('strong', {}, shortDate(item.date)), ` ${label}`,
        isVideo(item) && h('span', { class: 'muted' }, `・影片 ${clockText(item.duration)}`),
        mediaDetail(item) && h('span', { class: 'muted small photo-detail' }, mediaDetail(item))));
    const target = list.length >= 2 ? older : latest;

    body.replaceChildren(...[
      h('div', { class: 'row-between photo-head' },
        button('全部', onBack, 'ghost', { 'aria-label': '回到全部照片影片' }),
        h('h3', {}, group.label, h('small', { class: 'muted' }, ` ${list.length} 個`))),
      list.length >= 2
        ? h('div', { class: 'photo-compare' }, figure(older, older === list.at(-1) ? '第一個' : '比較'), figure(latest, '最新'))
        : list.length === 1
          ? h('div', { class: 'photo-compare is-single' }, figure(latest, '最新'))
          : h('p', { class: 'muted photo-empty' }, '還沒有照片或影片。拍第一張照片，之後每次都會疊在畫面上對齊。'),
      h('div', { class: 'photo-actions' },
        button(h('span', { class: 'btn-inline' }, icon('camera'), list.length ? '對位拍攝' : '拍第一個'), take, 'big primary'),
        button('從相簿選', fromFile, '')),
      list.length >= 2 && h('div', { class: 'stack-sm' },
        h('div', { class: 'stepper-label' }, '點一個和最新的比較'),
        h('div', { class: 'photo-strip' }, list.slice(1).map((item) => h('button', {
          type: 'button',
          class: 'photo-thumb',
          'aria-pressed': String(item === older),
          'aria-label': `和 ${shortDate(item.date)} 的${isVideo(item) ? '影片' : '照片'}比較`,
          onclick: () => { chosen = item.id; draw(); },
        }, mediaView(item, 'photo-thumb-img', { lazy: true }), h('span', {}, shortDate(item.date)))))),
      list.length > 0 && h('div', { class: 'photo-delete' },
        holdButton(`刪除 ${shortDate(target.date)} 這個${isVideo(target) ? '影片' : '照片'}`, () => remove(target), 'ghost danger-text')),
    ].filter(Boolean));
  }
  draw();
}

function tile(list, label, onclick) {
  return h('button', { type: 'button', class: `photo-tile${list.length ? '' : ' is-empty'}`, onclick },
    list.length ? mediaView(list[0], 'photo-tile-img', { lazy: true }) : h('span', { class: 'photo-tile-img photo-tile-blank', 'aria-hidden': 'true' }, icon('plus')),
    h('span', { class: 'photo-tile-name' }, label),
    h('span', { class: 'muted small' }, list.length ? `${list.length} 個・${shortDate(list[0].date)}` : '還沒拍'));
}

const angleGroup = (student, angle) => ({
  label: photoAngleLabel(angle),
  fields: { angle },
  list: () => photosOf(store.all('photos'), student.id, angle),
});

const exerciseGroup = (student, name) => ({
  label: name,
  fields: { exercise: name },
  list: () => exerciseMedia(store.all('photos'), student.id, name),
});

/** Every angle as a tile with its newest item, the exercises filmed in class, then one group in detail. */
export function photoSheet(student) {
  openSheet(`${student.name} 的照片與影片`, () => {
    const body = h('div', { class: 'stack' });
    const grid = () => {
      const all = photosOf(store.all('photos'), student.id);
      const exercises = mediaExercises(store.all('photos'), student.id);
      // Class photos and videos come first: that is where most of them are taken (2026-11-17).
      body.replaceChildren(...[
        h('p', { class: 'muted small' }, '存在這台 iPad 和公司 Google 雲端，不會給學生看。上課時按動作旁的「拍攝」，會自動對到那一堂、那個動作和那一組。'),
        exercises.length > 0 && h('h3', { class: 'photo-section' }, '上課拍的動作'),
        exercises.length > 0 && h('div', { class: 'photo-grid' }, exercises.map(({ name, list }) => tile(
          list,
          name,
          () => groupView(student, exerciseGroup(student, name), body, grid),
        ))),
        h('h3', { class: 'photo-section' }, '體態與動作角度'),
        h('div', { class: 'photo-grid' }, PHOTO_ANGLES.map((angle) => tile(
          all.filter((p) => p.angle === angle.id),
          angle.label,
          () => groupView(student, angleGroup(student, angle.id), body, grid),
        ))),
      ].filter(Boolean));
    };
    grid();
    return body;
  }, { wide: true });
}

/**
 * From the class screen: the camera opens at once for the exercise and set in progress (2 taps to a saved photo).
 * The item keeps the class, exercise and set, so Drive names and files it by itself.
 */
export function captureForExercise(student, session, row, setIndex, onSaved) {
  const group = exerciseGroup(student, row.name);
  const fields = {
    exercise: row.name,
    ...(row.exerciseId ? { exerciseId: row.exerciseId } : {}),
    sessionId: session.id,
    rowId: row.id,
    ...(setIndex !== null && setIndex !== undefined ? { set: setIndex + 1 } : {}),
    ...(session.classNo ? { classNo: session.classNo } : {}),
  };
  const what = `${row.name}${fields.set ? ` ${setName(fields.set)}` : ''}`;
  openCamera({
    title: what,
    ghost: ghostOf(group.list()),
    onShot: async (blob, info) => {
      const item = await saveMedia(student, fields, blob, info);
      if (!item) return;
      toast(`${isVideo(item) ? `影片（${clockText(item.duration)}）` : '照片'}已存：${what}`);
      onSaved?.(item);
    },
  });
}

/** Thumbnails under an exercise of a past class; a tap plays or enlarges it. */
export function rowMediaStrip(session, row) {
  const list = rowMedia(store.all('photos'), session.id, row.id);
  if (!list.length) return null;
  return h('div', { class: 'photo-strip row-media' }, list.map((item) => h('button', {
    type: 'button',
    class: 'photo-thumb',
    'aria-label': `看${item.set ? `${setName(item.set)}的` : ''}${isVideo(item) ? '影片' : '照片'}`,
    onclick: () => openSheet(`${row.name}${item.set ? ` ${setName(item.set)}` : ''}`, () => h('div', { class: 'stack-sm media-viewer' },
      mediaView(item, 'photo-img', { controls: true }),
      h('p', { class: 'muted' }, [shortDate(item.date), mediaDetail(item), isVideo(item) ? `影片 ${clockText(item.duration)}` : ''].filter(Boolean).join('・')))),
  }, mediaView(item, 'photo-thumb-img', { lazy: true }), h('span', {}, item.set ? setName(item.set) : (isVideo(item) ? '影片' : '照片')))));
}
