// Serves the app from the device so it opens instantly and works offline.
// Bump VERSION on every release so devices fetch the new files.
const VERSION = 'v20';
const CACHE = `training-record-${VERSION}`;
const FILES = [
  './', 'index.html', 'styles.css', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png',
  'fonts/fonts.css',
  'js/main.js', 'js/spring.js', 'js/numpad.js', 'js/dom.js', 'js/icons.js', 'js/bodymap.js', 'js/trend.js', 'js/students.js', 'js/core.js', 'js/seed.js', 'js/store.js', 'js/sync.js', 'js/demo.js',
  'js/today.js', 'js/record.js', 'js/overview.js', 'js/plan.js', 'js/library.js', 'js/handout.js', 'js/classinfo.js', 'js/settings.js', 'js/print.js', 'js/sortable.js', 'js/charts.js', 'js/equipment.js', 'js/history.js', 'js/param.js', 'js/painsheet.js', 'js/report.js',
];
// The rounded typeface, split by character range. Stored up front so it also shows offline.
const FONTS = ["fonts/gsr-400-a-0.woff2","fonts/gsr-400-a-1.woff2","fonts/gsr-400-a-10.woff2","fonts/gsr-400-a-2.woff2","fonts/gsr-400-a-3.woff2","fonts/gsr-400-a-4.woff2","fonts/gsr-400-a-5.woff2","fonts/gsr-400-a-6.woff2","fonts/gsr-400-a-7.woff2","fonts/gsr-400-a-8.woff2","fonts/gsr-400-a-9.woff2","fonts/gsr-400-b-0.woff2","fonts/gsr-400-b-1.woff2","fonts/gsr-400-b-2.woff2","fonts/gsr-400-b-3.woff2","fonts/gsr-400-b-4.woff2","fonts/gsr-400-b-5.woff2","fonts/gsr-400-b-6.woff2","fonts/gsr-400-core.woff2","fonts/gsr-500-a-0.woff2","fonts/gsr-500-a-1.woff2","fonts/gsr-500-a-10.woff2","fonts/gsr-500-a-2.woff2","fonts/gsr-500-a-3.woff2","fonts/gsr-500-a-4.woff2","fonts/gsr-500-a-5.woff2","fonts/gsr-500-a-6.woff2","fonts/gsr-500-a-7.woff2","fonts/gsr-500-a-8.woff2","fonts/gsr-500-a-9.woff2","fonts/gsr-500-b-0.woff2","fonts/gsr-500-b-1.woff2","fonts/gsr-500-b-2.woff2","fonts/gsr-500-b-3.woff2","fonts/gsr-500-b-4.woff2","fonts/gsr-500-b-5.woff2","fonts/gsr-500-b-6.woff2","fonts/gsr-500-core.woff2","fonts/gsr-700-a-0.woff2","fonts/gsr-700-a-1.woff2","fonts/gsr-700-a-10.woff2","fonts/gsr-700-a-2.woff2","fonts/gsr-700-a-3.woff2","fonts/gsr-700-a-4.woff2","fonts/gsr-700-a-5.woff2","fonts/gsr-700-a-6.woff2","fonts/gsr-700-a-7.woff2","fonts/gsr-700-a-8.woff2","fonts/gsr-700-a-9.woff2","fonts/gsr-700-b-0.woff2","fonts/gsr-700-b-1.woff2","fonts/gsr-700-b-2.woff2","fonts/gsr-700-b-3.woff2","fonts/gsr-700-b-4.woff2","fonts/gsr-700-b-5.woff2","fonts/gsr-700-b-6.woff2","fonts/gsr-700-core.woff2"];

self.addEventListener('install', (event) => {
  // cache: 'reload' skips the browser's own short-term cache (GitHub Pages allows 10 minutes),
  // so a new release never stores the previous release's files.
  event.waitUntil(caches.open(CACHE)
    .then((cache) => cache.addAll([...FILES, ...FONTS].map((file) => new Request(file, { cache: 'reload' }))))
    .then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(caches.keys()
    .then((keys) => Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin) return;
  event.respondWith(caches.match(event.request).then((hit) => hit || fetch(event.request)));
});
