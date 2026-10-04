'use strict';

const CACHE_NAME = 'car-crm-mobile-full-v14';
const SHELL_FILES = ['./', './index.html', './styles.css?v=8', './core.js?v=11', './app.js?v=13', './manifest.webmanifest?v=7', './icon-192.png', './icon-512.png'];
const SHELL_PATHS = new Set(SHELL_FILES.map(path => new URL(path, self.registration.scope).pathname));

self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES)));
  self.skipWaiting();
});

self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(key => (key.startsWith('car-crm-mobile-shell-') || key.startsWith('car-crm-mobile-readonly-') || key.startsWith('car-crm-mobile-full-')) && key !== CACHE_NAME).map(key => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const scopeUrl = new URL(self.registration.scope);

  // แคชเฉพาะไฟล์ตัวแอป ไม่แคชข้อมูล Google Sheets หรือ URL อื่นภายใต้ /mobile/
  if (url.origin !== scopeUrl.origin || !SHELL_PATHS.has(url.pathname)) return;

  event.respondWith(
    fetch(request)
      .then(response => {
        if (response.ok && response.type === 'basic') {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then(response => response || caches.match('./index.html')))
  );
});
