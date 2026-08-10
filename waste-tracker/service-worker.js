const CACHE_NAME = "abbq-waste-v11";

const FILES = [
    "./",
    "./index.html",
    "./manifest.json",
    "./style.css",
    "./helper.js",
    "./database.js",
    "./ui.js",
    "./masterData.js",
    "./master.js",
    "./camera.js",
    "./input.js",
    "./history.js",
    "./brokenChicken.js",
    "./dashboard.js",
    "./export.js",
    "./app.js",
    "./logo.png"
];

self.addEventListener("install", event => {
    self.skipWaiting();
    event.waitUntil(
        caches.open(CACHE_NAME).then(cache => cache.addAll(FILES))
    );
});

self.addEventListener("activate", event => {
    event.waitUntil(
        caches.keys().then(keys =>
            Promise.all(
                keys
                    .filter(key => key !== CACHE_NAME)
                    .map(key => caches.delete(key))
            )
        ).then(() => self.clients.claim())
    );
});

self.addEventListener("fetch", event => {
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const clone = response.clone();
                caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
