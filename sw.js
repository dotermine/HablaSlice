const CACHE_NAME = 'hablaslice-v1';

// Кэшируем файлы, используя абсолютные пути от корня домена
const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json'
];

// Установка сервис-воркера
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(function(cache) {
                console.log('[SW] Кэшируем файлы');
                // На период отладки можно использовать map, но addAll надежнее,
                // если вы уверены, что все файлы по путям физически существуют.
                return cache.addAll(FILES_TO_CACHE);
            })
            .then(function() {
                return self.skipWaiting();
            })
            .catch(function(error) {
                console.error('[SW] Ошибка при первичной установке кэша:', error);
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
    // Игнорируем blob (аудио), chrome-extension, и не-GET запросы
    if (
        event.request.url.startsWith('blob:') || 
        event.request.url.startsWith('chrome-extension:') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request)
            .then(function(response) {
                // Если файл найден в кэше — отдаем его сразу
                if (response) {
                    return response; 
                }
                
                // Если файла нет в кэше — идем в сеть
                return fetch(event.request).catch(function(err) {
                    // Если сеть недоступна (офлайн) и это запрос навигации (переход по страницам)
                    if (event.request.mode === 'navigate') {
                        return caches.match('/index.html');
                    }
                    // Для остальных ресурсов (например, картинок/скриптов) возвращаем ошибку
                    throw err;
                });
            })
    );
});
