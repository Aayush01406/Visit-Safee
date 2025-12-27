importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.7.0/firebase-messaging-compat.js');

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
  const { requestId, visitorName } = payload.data || {};

  const notificationTitle = title || "New Visitor Request";
  const notificationOptions = {
    body: body || `${visitorName} wants to visit`,
    icon: icon || "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    requireInteraction: true,
    vibrate: [200, 100, 200],
    tag: requestId || 'default',
    data: {
      requestId,
      visitorName,
      url: '/'
    },
    actions: [
      { action: 'APPROVE', title: 'Approve' },
      { action: 'REJECT', title: 'Reject' }
    ]
  };

  return self.registration.showNotification(notificationTitle, notificationOptions);
});

// Notification click handler
self.addEventListener('notificationclick', event => {
  event.notification.close();
  
  const { requestId } = event.notification.data || {};
  
  if (event.action === 'APPROVE') {
    // Handle approve action
    event.waitUntil(
      fetch('/api/visitor-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve', requestId })
      }).then(() => {
        self.registration.showNotification('Visitor Approved', {
          body: 'Access granted successfully',
          icon: '/icons/icon-192.png'
        });
      })
    );
  } else if (event.action === 'REJECT') {
    // Handle reject action
    event.waitUntil(
      fetch('/api/visitor-action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'reject', requestId })
      }).then(() => {
        self.registration.showNotification('Visitor Rejected', {
          body: 'Access denied',
          icon: '/icons/icon-192.png'
        });
      })
    );
  } else {
    // Default click - open app
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then(windowClients => {
          for (let client of windowClients) {
            if (client.url.includes(self.registration.scope) && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow('/');
          }
        })
    );
  }
});
