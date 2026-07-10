const CACHE_NAME = 'hablaslice-cache-v2';

// Кешируем ВСЕ возможные варианты обращения к главной странице
const ASSETS_TO_CACHE = [
    '/HablaSlice/',                  // Запрос к корню папки (как обычно открывает телефон)
    '/HablaSlice/index.html',         // Явный запрос к файлу
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

// Установка Service Worker
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[Service Worker] Принудительное кеширование всех ресурсов');
                return cache.addAll(ASSETS_TO_CACHE);
            })
            .then(() => self.skipWaiting())
    );
});

// Активация и удаление старого кеша
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

// Перехват запросов (Стратегия: сначала Кеш, если нет — Сеть)
self.addEventListener('fetch', (event) => {
    // Полностью игнорируем blob-ссылки (аудиофайлы с телефона) и запросы, отличные от GET
    if (event.request.url.startsWith('blob:') || event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request).then((cachedResponse) => {
            if (cachedResponse) {
                return cachedResponse; // Найдено точное совпадение в кеше
            }

            // УМНЫЙ ХАК ДЛЯ GITHUB PAGES:
            // Если пользователь запрашивает подпапку /HablaSlice/ (или с параметрами),
            // а точного совпадения нет, принудительно отдаем закешированный корень.
            const url = new URL(event.request.url);
            if (url.pathname === '/HablaSlice' || url.pathname === '/HablaSlice/') {
                return caches.match('/HablaSlice/');
            }

            // Если в кеше ничего не нашлось, делаем обычный запрос в сеть
            return fetch(event.request).catch((err) => {
                console.error('[Service Worker] Сеть недоступна, ресурс не закеширован:', event.request.url);
                
                // Если сломался запрос к любой странице навигации, аварийно отдаем главную страницу
                if (event.request.mode === 'navigate') {
                    return caches.match('/HablaSlice/');
                }
            });
        })
    );
});
