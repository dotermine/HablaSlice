const CACHE_NAME = 'hablaslice-cache-v1';

// Указываем пути строго с учетом папки репозитория на GitHub Pages
const ASSETS_TO_CACHE = [
    '/HablaSlice/',
    '/HablaSlice/index.html',
    '/HablaSlice/manifest.json',
    '/HablaSlice/icons/icon-72.png',
    '/HablaSlice/icons/icon-96.png',
    '/HablaSlice/icons/icon-128.png',
    '/HablaSlice/icons/icon-144.png',
    '/HablaSlice/icons/icon-152.png',
    '/HablaSlice/icons/icon-192.png',
    '/HablaSlice/icons/icon-384.png',
    '/HablaSlice/icons/icon-512.png',
    '/HablaSlice/screenshots/screenshot-mobile.png'
];

// Установка воркера и кеширование всех ресурсов
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Кеширование ресурсов...');
                // catch возвращает пустую строку, предотвращая падение, если какого-то файла нет
                return cache.addAll(ASSETS_TO_CACHE).catch(err => console.error('Ошибка кеширования файлов:', err));
            })
            .then(() => self.skipWaiting())
    );
});

// Активация и очистка старых версий кеша
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames.map((cache) => {
                    if (cache !== CACHE_NAME) {
                        console.log('[Service Worker] Удаление старого кеша:', cache);
                        return caches.delete(cache);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Перехват запросов (Стратегия Cache First)
self.addEventListener('fetch', (event) => {
    // Игнорируем blob-файлы (локальные аудиозаписи) и не-GET запросы
    if (event.request.url.startsWith('blob:') || event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse;
            }
            return fetch(event.request);
        })
    );
});
