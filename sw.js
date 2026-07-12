const CACHE_NAME = 'hablaslice-v4';

const FILES_TO_CACHE = [
    '/',
    '/index.html',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// Установка: Безопасное поочередное кэширование
self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Кэширование обязательных ресурсов...');
            return Promise.all(
                FILES_TO_CACHE.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.error('[SW] Не удалось загрузить в кэш:', url, err);
                    });
                })
            );
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

// Активация: Очистка старых версий кэша
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

// Перехват запросов (Стратегия: Сначала Кэш, если нет — Сеть с динамическим кэшированием)
self.addEventListener('fetch', function(event) {
    if (
        event.request.url.startsWith('blob:') || 
        event.request.url.startsWith('chrome-extension:') ||
        event.request.method !== 'GET'
    ) {
        return;
    }

    event.respondWith(
        caches.match(event.request).then(function(cachedResponse) {
            if (cachedResponse) {
                return cachedResponse; // Мгновенный ответ из кэша (офлайн работает!)
            }

            return fetch(event.request).then(function(networkResponse) {
                // Если файл (например, иконка другого размера) успешно скачался из сети,
                // автоматически добавляем его копию в кэш на будущее
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(function(err) {
                // Защита от полной потери связи при перезагрузке
                if (event.request.mode === 'navigate') {
                    return caches.match('/index.html');
                }
                throw err;
            });
        })
    );
});
