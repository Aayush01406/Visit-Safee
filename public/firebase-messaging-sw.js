const CACHE_NAME = 'visitsafe-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

// Import Firebase Scripts (Compat versions)
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/9.0.0/firebase-messaging-compat.js');

// Initialize Firebase using URL params
// We read the config from the registration URL (location.search)
const params = new URLSearchParams(self.location.search);
const firebaseConfig = {
  apiKey: params.get('apiKey'),
  authDomain: params.get('authDomain'),
  projectId: params.get('projectId'),
  storageBucket: params.get('storageBucket'),
  messagingSenderId: params.get('messagingSenderId'),
  appId: params.get('appId'),
};

// Initialize Firebase Messaging if config is present
if (firebaseConfig.apiKey) {
    firebase.initializeApp(firebaseConfig);
    const messaging = firebase.messaging();

    // Background Message Handler (Step 4)
    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      
      const { title, body, icon } = payload.notification || {};
      const { type, actionUrlApprove, actionUrlReject } = payload.data || {};

      const notificationTitle = title || "New Notification";
      const notificationOptions = {
        body: body,
        icon: icon || '/icons/icon-192.png',
        tag: payload.messageId, // Step 6: De-duplication
        data: payload.data // Store data for click handler
      };

      // Add Actions if it's a visitor request
      if (type === 'visitor_request' && actionUrlApprove && actionUrlReject) {
          notificationOptions.actions = [
              { action: 'approve', title: 'Approve', icon: '/icons/check.png' },
              { action: 'reject', title: 'Reject', icon: '/icons/x.png' }
          ];
          // Keep notification interaction valid for longer
          notificationOptions.requireInteraction = true;
      }

      self.registration.showNotification(notificationTitle, notificationOptions);
    });
}

// Handle Notification Clicks
self.addEventListener('notificationclick', function(event) {
  event.notification.close();

  const data = event.notification.data;

  if (event.action === 'approve' && data?.actionUrlApprove) {
      // Handle Approve Action
      event.waitUntil(
          fetch(data.actionUrlApprove, { method: 'POST' })
            .then(response => response.json())
            .then(res => {
                // Show confirmation
                self.registration.showNotification("Visitor Approved", {
                    body: "The visitor has been granted entry.",
                    icon: '/icons/icon-192.png'
                });
            })
            .catch(err => console.error('Approve failed', err))
      );
  } else if (event.action === 'reject' && data?.actionUrlReject) {
      // Handle Reject Action
      event.waitUntil(
          fetch(data.actionUrlReject, { method: 'POST' })
            .then(response => response.json())
            .then(res => {
                // Show confirmation
                self.registration.showNotification("Visitor Rejected", {
                    body: "The visitor has been denied entry.",
                    icon: '/icons/icon-192.png'
                });
            })
            .catch(err => console.error('Reject failed', err))
      );
  } else {
      // Default click (open app)
      event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then(windowClients => {
            // Check if there is already a window open and if so, focus it.
            for (let i = 0; i < windowClients.length; i++) {
                const client = windowClients[i];
                if (client.url.includes(self.location.origin) && 'focus' in client) {
                    return client.focus();
                }
            }
            // If no window is open, open one.
            if (clients.openWindow) {
                return clients.openWindow('/');
            }
        })
      );
  }
});

// === PWA LOGIC ===

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(STATIC_ASSETS);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          if (cacheName !== CACHE_NAME) {
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // ❌ Do NOT cache Firestore requests
  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }
  
  // ❌ Do NOT cache API calls
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  // Network First Strategy
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Check if valid response
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

        // Only cache same-origin requests (static assets)
        if (url.origin === location.origin) {
            const responseToCache = response.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
        }
        
        return response;
      })
      .catch(() => {
        return caches.match(event.request).then((response) => {
            if (response) {
                return response;
            }
            // Offline fallback for navigation
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        });
      })
  );
});
