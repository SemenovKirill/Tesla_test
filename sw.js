const CACHE_NAME = "robot-controller-v1";

const ASSETS = [
  "./",
  "./index.html",
  "./style.css",
  "./main.js",
  "./companion.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-192-maskable.png",
  "./icons/icon-512.png",
  "./icons/icon-512-maskable.png",
];

// Установка SW: кладём нужные файлы в кеш
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Активация SW: чистим старые кеши
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.map((key) => {
            if (key !== CACHE_NAME) {
              return caches.delete(key);
            }
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

// Обработка запросов: сначала пробуем кеш, потом сеть
self.addEventListener("fetch", (event) => {
  const request = event.request;

  // Только GET, остальное не трогаем
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Кешируем только запросы к нашему origin
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) {
        return cached;
      }
      return fetch(request);
    })
  );
});