
const CACHE='abbq-v3';
const FILES=['./','./index.html','./app.js','./manifest.json','./abbq_logo.png'];

self.addEventListener('install',e=>{
 self.skipWaiting();
 e.waitUntil(caches.open(CACHE).then(c=>c.addAll(FILES)));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
  );
  self.clients.claim();
});

self.addEventListener('fetch',e=>{
 e.respondWith(
   fetch(e.request)
     .then(r => { const c = r.clone(); caches.open(CACHE).then(cache => cache.put(e.request, c)); return r; })
     .catch(() => caches.match(e.request))
 );
});
