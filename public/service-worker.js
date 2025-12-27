importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.7.0/firebase-messaging-compat.js');

const firebaseConfig = {
  apiKey: "AIzaSyBTwsbAP2oJ0Y35-F6azy-BG4lCpWoQzx0",
  authDomain: "visitsafe-3b609.firebaseapp.com",
  projectId: "visitsafe-3b609",
  storageBucket: "visitsafe-3b609.firebasestorage.app",
  messagingSenderId: "457616438306",
  appId: "1:457616438306:web:6796565799e0ce2620867b"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

// Background message handler
messaging.onBackgroundMessage((payload) => {
  console.log('[service-worker.js] Received background message:', payload);
  
  const { title, body, icon } = payload.notification || {};
  const { requestId } = payload.data || {};

  const notificationTitle = title || "New Visitor Request";
  const notificationOptions = {
    body: body || "You have a new visitor",
    icon: icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    requireInteraction: true,
    vibrate: [200, 100, 200],
    tag: requestId || 'default',
    data: payload.data || {}
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then(windowClients => {
        // Check if there is already a window/tab open with the target URL
        for (let client of windowClients) {
          if (client.url.includes(self.registration.scope) && 'focus' in client) {
            return client.focus();
          }
        }
        // If not, then open the target URL in a new window/tab
        if (clients.openWindow) {
          return clients.openWindow('/');
        }
      })
  );
});
