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

    // Background Message Handler with Action Buttons
    messaging.onBackgroundMessage((payload) => {
      console.log('[firebase-messaging-sw.js] Received background message ', payload);
      
      const { title, body, icon } = payload.notification || {};
      const data = payload.data || {};
      
      // Check if this is a visitor request notification
      // Match actionType sent from backend
      const isVisitorRequest = data.actionType === 'VISITOR_REQUEST' || data.type === 'visitor_request';
      
      const notificationOptions = {
        body: body,
        icon: icon || '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        tag: data.visitorId || payload.messageId,
        requireInteraction: isVisitorRequest,
        data: data
      };
      
      // Add action buttons for visitor requests
      if (isVisitorRequest) {
        notificationOptions.actions = [
          {
            action: 'APPROVE_VISITOR',
            title: '✅ Approve',
            icon: '/icons/check.png'
          },
          {
            action: 'REJECT_VISITOR', 
            title: '❌ Reject',
            icon: '/icons/x.png'
          }
        ];
      }

      self.registration.showNotification(title, notificationOptions);
    });
}

// Handle notification clicks and actions
self.addEventListener('notificationclick', (event) => {
  console.log('[SW] Notification click received:', event);
  
  const action = event.action;
  const data = event.notification.data || {};
  
  event.notification.close();

  // 1. Handle "Action Confirmation" notifications (Success/Fail messages)
  // If the user clicks these, we just dismiss them. Do NOT open the app.
  if (data.type === 'action_confirmation') {
      return;
  }
  
  // 2. Handle Action Buttons (Approve / Reject)
  if (action === 'APPROVE_VISITOR' || action === 'REJECT_VISITOR') {
    const isApprove = action === 'APPROVE_VISITOR';
    const targetAction = isApprove ? 'approve' : 'reject';
    
    console.log(`[SW] Processing action: ${action} -> ${targetAction}`);
    
    // Robust data extraction
    let requestId = data.requestId || data.visitorId;
    let residencyId = data.residencyId;

    // Fallback: Extract from approveUrl/rejectUrl if missing
    if ((!requestId || !residencyId) && (data.approveUrl || data.rejectUrl)) {
        try {
            const urlStr = data.approveUrl || data.rejectUrl;
            const urlObj = new URL(urlStr);
            if (!requestId) requestId = urlObj.searchParams.get('requestId');
            if (!residencyId) residencyId = urlObj.searchParams.get('residencyId');
            console.log(`[SW] Extracted missing data from URL: requestId=${requestId}, residencyId=${residencyId}`);
        } catch (e) {
            console.error('[SW] Failed to parse approveUrl for fallback data', e);
        }
    }

    // Construct absolute URL for the API with query params as fallback
    const apiUrl = new URL('/api/visitor-action', self.location.origin);
    // Explicitly set action, requestId, and residencyId in the URL params for safety
    if (targetAction) apiUrl.searchParams.set('action', targetAction);
    if (requestId) apiUrl.searchParams.set('requestId', requestId);
    if (residencyId) apiUrl.searchParams.set('residencyId', residencyId);

    console.log(`[SW] Sending request to: ${apiUrl.href} with body:`, { action: targetAction, requestId, residencyId });

    // Use JSON body for robustness
    const requestBody = {
        action: targetAction,
        requestId: requestId,
        residencyId: residencyId
    };

    const promiseChain = fetch(apiUrl.href, { 
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        credentials: 'include', // Important: Send cookies/auth data
        body: JSON.stringify(requestBody)
    })
    .then(async response => {
        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`API request failed: ${response.status} ${errorText}`);
        }
        return response.json();
    })
    .then(responseData => {
        console.log('Action success:', responseData);
        // User requested NOT to open the app on action. 
        // We just log success and show a confirmation notification.
        if (responseData.success) {
            self.registration.showNotification(isApprove ? 'Visitor Approved' : 'Visitor Rejected', {
                body: isApprove ? 'Access granted successfully.' : 'Access denied.',
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                data: { type: 'action_confirmation' }, // Tag this so clicking it doesn't open app
                timeout: 3000
            });
        }
    })
    .catch(err => {
        console.error('Action failed:', err);
        // Show error notification instead of opening app
        // Display the actual error message for debugging
        self.registration.showNotification('Action Failed', {
            body: `Error: ${err.message}`,
            icon: '/icons/icon-192.png',
            data: { type: 'action_confirmation' }
        });
    });

    event.waitUntil(promiseChain);
  } else {
    // 3. Default click (Body click) - Open app
    // Only open app if it's NOT a background action
    const urlToOpen = data.click_action || '/';
    event.waitUntil(
      clients.matchAll({ type: 'window', includeUncontrolled: true })
        .then((clientList) => {
          for (const client of clientList) {
            if (client.url.includes(self.location.origin) && 'focus' in client) {
              return client.focus();
            }
          }
          if (clients.openWindow) {
            return clients.openWindow(urlToOpen);
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
