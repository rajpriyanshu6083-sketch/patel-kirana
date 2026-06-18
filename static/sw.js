const CACHE_NAME = 'patel-kirana-cache-v4';
const ASSETS_TO_CACHE = [
    '/static/icons/icon-192.png',
    '/static/icons/icon-512.png',
    '/static/icons/apple-touch-icon.png'
];

self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => cache.addAll(ASSETS_TO_CACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', event => {
    event.waitUntil(
        caches.keys().then(keys => Promise.all(
            keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
        ))
    );
    self.clients.claim();
});

self.addEventListener('fetch', event => {
    const url = new URL(event.request.url);

    // Never cache API calls — always go to network so session-check is always fresh
    if (url.pathname.startsWith('/api/') || url.pathname === '/') {
        event.respondWith(fetch(event.request));
        return;
    }

    // For static assets: network first, fall back to cache
    event.respondWith(
        fetch(event.request)
            .then(response => {
                const responseClone = response.clone();
                if (event.request.method === 'GET' && response.status === 200) {
                    caches.open(CACHE_NAME).then(cache => cache.put(event.request, responseClone));
                }
                return response;
            })
            .catch(() => caches.match(event.request))
    );
});
