// sw.js - Service Worker
const CACHE_NAME = 'hablaslice-v13';
const ASSETS = [
    './',
    './index.html',
    './manifest.json',
    './icons/icon-72.png',
    './icons/icon-96.png',
    './icons/icon-128.png',
    './icons/icon-144.png',
    './icons/icon-152.png',
    './icons/icon-192.png',
    './icons/icon-384.png',
    './icons/icon-512.png'
];

// Указываем базовый путь для PWA
const BASE_PATH = self.location.pathname.replace(/\/[^\/]*$/, '/');

self.addEventListener('install', event => {
    console.log('[SW] Installing...', BASE_PATH);
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                console.log('[SW] Caching assets');
                // Кешируем все ассеты с правильными путями
                const assetsToCache = ASSETS.map(asset => {
                    // Если ассет начинается с './', то добавляем базовый путь
                    if (asset.startsWith('./')) {
                        return BASE_PATH + asset.substring(2);
                    }
                    return asset;
                });
                // Добавляем основной файл
                assetsToCache.push(BASE_PATH);
                assetsToCache.push(BASE_PATH + 'index.html');
                return cache.addAll(assetsToCache);
            })
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    console.log('[SW] Activating...');
    event.waitUntil(
        caches.keys().then(cacheNames => {
            return Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) {
                        console.log('[SW] Deleting old cache:', cacheName);
                        return caches.delete(cacheName);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

self.addEventListener('fetch', event => {
    // Пропускаем запросы к внешним ресурсам
    const url = new URL(event.request.url);
    if (url.origin !== self.location.origin) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(response => {
                if (response) {
                    return response;
                }
                // Пытаемся получить из сети и кешировать
                return fetch(event.request)
                    .then(response => {
                        // Проверяем, что ответ валидный
                        if (!response || response.status !== 200 || response.type !== 'basic') {
                            return response;
                        }
                        const responseToCache = response.clone();
                        caches.open(CACHE_NAME)
                            .then(cache => {
                                cache.put(event.request, responseToCache);
                            });
                        return response;
                    })
                    .catch(() => {
                        // Возвращаем страницу ошибки или кешированную главную
                        return caches.match(BASE_PATH + 'index.html')
                            .then(cached => cached || new Response('Offline', { status: 503 }));
                    });
            })
    );
});
