const CACHE_NAME = 'hablaslice-v5';

// Пути скорректированы под подпапку GitHub Pages
const FILES_TO_CACHE = [
    '/HablaSlice/',
    '/HablaSlice/index.html',
    '/HablaSlice/manifest.json',
    '/HablaSlice/icons/icon-192.png',
    '/HablaSlice/icons/icon-512.png'
];

self.addEventListener('install', function(event) {
    event.waitUntil(
        caches.open(CACHE_NAME).then(function(cache) {
            console.log('[SW] Кэширование файлов для GitHub Pages...');
            return Promise.all(
                FILES_TO_CACHE.map(function(url) {
                    return cache.add(url).catch(function(err) {
                        console.error('[SW] Ошибка кэширования ресурса:', url, err);
                    });
                })
            );
        }).then(function() {
            return self.skipWaiting();
        })
    );
});

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
                return cachedResponse; 
            }

            return fetch(event.request).then(function(networkResponse) {
                if (networkResponse && networkResponse.status === 200) {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME).then(function(cache) {
                        cache.put(event.request, responseToCache);
                    });
                }
                return networkResponse;
            }).catch(function(err) {
                if (event.request.mode === 'navigate') {
                    return caches.match('/HablaSlice/index.html');
                }
                throw err;
            });
        })
    );
});
