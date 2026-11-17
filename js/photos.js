// Photos with an aligned camera (2026-11-17): the last photo of the same angle shows through the viewfinder,
// so every photo of that angle is taken from the same spot. Images stay on this iPad and the company Drive.
import { h, button, holdButton, openSheet, toast } from './dom.js';
import * as store from './store.js';
import { photoBlob, syncSoon } from './sync.js';
import { dateKey, PHOTO_ANGLES, photoAngleLabel, photosOf } from './core.js';
import { icon } from './icons.js';

const LONG_EDGE = 1200;
const QUALITY = 0.78;
// Portrait 3:4, the way the iPad is held in class. The overlay and the saved photo use the same frame.
const FRAME = 3 / 4;

const urls = new Map();

/** An <img> that fills in once the image is read (from this iPad, or once from Drive). */
function photoImage(photo, className = 'photo-img') {
  const img = h('img', { class: className, alt: `${photo.date.replaceAll('-', '/')} ${photoAngleLabel(photo.angle)}` });
  const ready = urls.get(photo.id);
  if (ready) {
    img.src = ready;
    return img;
  }
  img.classList.add('is-loading');
  photoBlob(photo).then((blob) => {
    if (!blob) { img.replaceWith(h('span', { class: `${className} photo-missing` }, '這台 iPad 沒有這張照片')); return; }
    const url = URL.createObjectURL(blob);
    urls.set(photo.id, url);
    img.src = url;
    img.classList.remove('is-loading');
  }).catch(() => img.replaceWith(h('span', { class: `${className} photo-missing` }, '讀不到照片，連上網路後再試')));
  return img;
}

function shortDate(date) {
  return date.slice(5).replace('-', '/');
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

async function savePhoto(student, angle, blob) {
  const id = `ph_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    await store.savePhotoBlob(id, blob);
  } catch (error) {
    toast(error?.name === 'QuotaExceededError' ? 'iPad 空間不夠，照片沒有存到' : '照片沒有存到，請再拍一次');
    return null;
  }
  const photo = { id, studentId: student.id, angle, date: dateKey(), takenAt: Date.now() };
  store.save('photos', photo);
  syncSoon(1000);
  return photo;
}

/** Full-screen camera. The previous photo of this angle lies over the live picture at the chosen strength. */
function openCamera({ title, ghost, onShot }) {
  const video = h('video', { class: 'camera-video', autoplay: true, playsinline: true, muted: true });
  video.muted = true;
  const ghostImg = ghost ? photoImage(ghost, 'camera-ghost') : null;
  const message = h('p', { class: 'camera-message', hidden: true });
  let stream = null;
  let facing = 'environment';
  let opacity = 0.45;

  const stop = () => stream?.getTracks().forEach((track) => track.stop());
  const close = () => {
    stop();
    overlay.remove();
    document.removeEventListener('visibilitychange', onHidden);
  };
  // iPadOS stops the camera when the page is hidden; closing keeps it from coming back black.
  const onHidden = () => { if (document.visibilityState === 'hidden') close(); };
  document.addEventListener('visibilitychange', onHidden);

  async function start() {
    stop();
    message.hidden = true;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: facing, width: { ideal: 1920 }, height: { ideal: 1440 } }, audio: false });
      video.srcObject = stream;
      shutter.disabled = false;
    } catch {
      shutter.disabled = true;
      message.hidden = false;
      message.textContent = '打不開相機。請在 Chrome 允許使用相機，或改用「從相簿選」。';
    }
  }

  const shutter = h('button', { type: 'button', class: 'camera-shutter', 'aria-label': '拍照', disabled: true });
  shutter.addEventListener('click', async () => {
    if (!video.videoWidth) return;
    shutter.disabled = true;
    try {
      const blob = await frameToJpeg(video, video.videoWidth, video.videoHeight);
      close();
      onShot(blob);
    } catch {
      shutter.disabled = false;
      toast('照片沒有存到，請再拍一次');
    }
  });

  const slider = h('input', { type: 'range', min: '0', max: '80', step: '5', value: String(opacity * 100), class: 'camera-slider', 'aria-label': '上次照片的濃淡' });
  const sliderValue = h('span', { class: 'camera-slider-value' }, `${Math.round(opacity * 100)}%`);
  slider.addEventListener('input', () => {
    opacity = Number(slider.value) / 100;
    if (ghostImg) ghostImg.style.opacity = String(opacity);
    sliderValue.textContent = `${slider.value}%`;
  });
  if (ghostImg) ghostImg.style.opacity = String(opacity);

  const overlay = h('div', { class: 'camera', role: 'dialog', 'aria-modal': 'true', 'aria-label': `拍照：${title}` },
    h('div', { class: 'camera-bar' },
      button('取消', close, 'ghost camera-text'),
      h('strong', {}, title),
      button('換鏡頭', () => { facing = facing === 'environment' ? 'user' : 'environment'; start(); }, 'ghost camera-text')),
    h('div', { class: 'camera-frame' },
      video,
      ghostImg,
      h('span', { class: 'camera-guide is-v', 'aria-hidden': 'true' }),
      h('span', { class: 'camera-guide is-h', 'aria-hidden': 'true' }),
      message),
    h('div', { class: 'camera-controls' },
      ghost
        ? h('label', { class: 'camera-blend' }, h('span', {}, `${shortDate(ghost.date)} 的照片`), slider, sliderValue)
        : h('p', { class: 'camera-hint' }, '這是這個角度的第一張，下次會疊在畫面上對齊'),
      shutter));
  document.body.append(overlay);
  start();
}

function pickFile(onFile) {
  const input = h('input', { type: 'file', accept: 'image/*', class: 'visually-hidden' });
  input.addEventListener('change', () => {
    const file = input.files?.[0];
    input.remove();
    if (file) onFile(file);
  });
  document.body.append(input);
  input.click();
}

/** One angle: compare a chosen photo with the newest, take the next one, or delete one. */
function angleView(student, angle, body, onBack) {
  let chosen = null;
  function draw() {
    const list = photosOf(store.all('photos'), student.id, angle);
    const latest = list[0];
    if (chosen && !list.some((p) => p.id === chosen)) chosen = null;
    const older = list.find((p) => p.id === chosen) || list.at(-1);
    const take = () => openCamera({
      title: photoAngleLabel(angle),
      ghost: latest,
      onShot: async (blob) => {
        if (await savePhoto(student, angle, blob)) { chosen = latest?.id || null; draw(); toast('照片已存到 iPad'); }
      },
    });
    const fromFile = () => pickFile(async (file) => {
      try {
        if (await savePhoto(student, angle, await fileToJpeg(file))) { chosen = latest?.id || null; draw(); toast('照片已存到 iPad'); }
      } catch (error) {
        toast(error.message);
      }
    });
    const remove = (photo) => {
      store.save('photos', { ...photo, deleted: true });
      syncSoon(1000);
      draw();
      toast(`已刪除 ${shortDate(photo.date)} 的照片`, {
        label: '復原',
        run: () => { store.save('photos', { ...store.get('photos', photo.id), deleted: false }); syncSoon(1000); draw(); },
      });
    };
    const figure = (photo, label) => h('figure', { class: 'photo-figure' },
      photoImage(photo),
      h('figcaption', {}, h('strong', {}, shortDate(photo.date)), ` ${label}`));

    body.replaceChildren(...[
      h('div', { class: 'row-between photo-head' },
        button('全部角度', onBack, 'ghost', { 'aria-label': '回到全部角度' }),
        h('h3', {}, photoAngleLabel(angle), h('small', { class: 'muted' }, ` ${list.length} 張`))),
      list.length >= 2
        ? h('div', { class: 'photo-compare' }, figure(older, older === list.at(-1) ? '第一張' : '比較'), figure(latest, '最新'))
        : list.length === 1
          ? h('div', { class: 'photo-compare is-single' }, figure(latest, '最新'))
          : h('p', { class: 'muted photo-empty' }, '還沒有這個角度的照片。拍第一張，之後每次都會疊在畫面上對齊。'),
      h('div', { class: 'photo-actions' },
        button(h('span', { class: 'btn-inline' }, icon('plus'), list.length ? '對位拍照' : '拍第一張'), take, 'big primary'),
        button('從相簿選', fromFile, '')),
      list.length >= 2 && h('div', { class: 'stack-sm' },
        h('div', { class: 'stepper-label' }, '點一張和最新的比較'),
        h('div', { class: 'photo-strip' }, list.slice(1).map((photo) => h('button', {
          type: 'button',
          class: 'photo-thumb',
          'aria-pressed': String(photo === older),
          'aria-label': `和 ${shortDate(photo.date)} 的照片比較`,
          onclick: () => { chosen = photo.id; draw(); },
        }, photoImage(photo, 'photo-thumb-img'), h('span', {}, shortDate(photo.date)))))),
      list.length > 0 && h('div', { class: 'photo-delete' },
        holdButton(`刪除 ${shortDate((list.length >= 2 ? older : latest).date)} 這張`, () => remove(list.length >= 2 ? older : latest), 'ghost danger-text')),
    ].filter(Boolean));
  }
  draw();
}

/** Every angle as a tile with its newest photo, then one angle in detail. */
export function photoSheet(student) {
  openSheet(`${student.name} 的照片`, () => {
    const body = h('div', { class: 'stack' });
    const grid = () => {
      const all = photosOf(store.all('photos'), student.id);
      body.replaceChildren(
        h('p', { class: 'muted small' }, '選一個角度。照片存在這台 iPad 和公司 Google 雲端，不會給學生看。'),
        h('div', { class: 'photo-grid' }, PHOTO_ANGLES.map((angle) => {
          const list = all.filter((p) => p.angle === angle.id);
          return h('button', {
            type: 'button',
            class: `photo-tile${list.length ? '' : ' is-empty'}`,
            onclick: () => angleView(student, angle.id, body, grid),
          },
          list.length ? photoImage(list[0], 'photo-tile-img') : h('span', { class: 'photo-tile-img photo-tile-blank', 'aria-hidden': 'true' }, icon('plus')),
          h('span', { class: 'photo-tile-name' }, angle.label),
          h('span', { class: 'muted small' }, list.length ? `${list.length} 張・${shortDate(list[0].date)}` : '還沒拍'));
        })));
    };
    grid();
    return body;
  }, { wide: true });
}
