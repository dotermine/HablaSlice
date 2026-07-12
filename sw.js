const CACHE_NAME = 'hablaslice-v1';

// Кэшируем только основные файлы (без привязки к папке)
const FILES_TO_CACHE = [
    '.',                    // Текущая папка (главная страница)
    'index.html',
    'manifest.json'
    // Иконки загружаются отдельно, если они есть
];

// Установка
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[SW] Кэшируем файлы');
                return cache.addAll(FILES_TO_CACHE);
            })
            .then(function() {
                return self.skipWaiting();
            })
    );
});

// Активация - удаляем старый кэш
self.addEventListener('activate', function(event) {
    event.waitUntil(
        caches.keys().then(function(cacheNames) {
            return Promise.all(
                cacheNames.map(function(name) {
                    if (name !== CACHE_NAME) {
                        console.log('[SW] Удаляем старый кэш:', name);
                        return caches.delete(name);
                    }
                })
            );
        }).then(function() {
            return self.clients.claim();
        })
    );
});

// Перехват запросов
self.addEventListener('fetch', function(event) {
    // Игнорируем blob (аудио) и не-GET запросы
    if (event.request.url.startsWith('blob:') || event.request.method !== 'GET') {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                if (response) {
                    return response; // Найдено в кэше
                }
                return fetch(event.request); // Идем в сеть
            })
            .catch(function() {
                // Если сеть недоступна, пытаемся отдать главную страницу
                if (event.request.mode === 'navigate') {
                    return caches.match('index.html');
                }
            })
    );
});
