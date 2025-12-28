const CACHE_NAME = 'visitsafe-v2';
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
  
  // Normalize action to handle potential browser differences
  const action = event.action ? event.action.toUpperCase() : '';
  const data = event.notification.data || {};
  
  event.notification.close();

  // 1. Handle "Action Confirmation" notifications (Success/Fail messages)
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

    // Construct absolute URL for the API
    // We rely on QUERY PARAMS for the action to ensure it is passed correctly even if body parsing fails
    const apiUrl = new URL('/api/visitor-action', self.location.origin);
    
    if (targetAction) apiUrl.searchParams.set('action', targetAction);
    if (requestId) apiUrl.searchParams.set('requestId', requestId);
    if (residencyId) apiUrl.searchParams.set('residencyId', residencyId);

    console.log(`[SW] Sending request to: ${apiUrl.href}`);

    // We still send a body just in case, but we prioritize the URL param for the action
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
        
        if (responseData.success) {
            // Determine display status
            // TRUST THE INTENT: If the user clicked Approve, and the server said "success", assume it's Approved.
            // Only override if the server explicitly says "already processed" and gives a different status.
            
            let status = isApprove ? 'approved' : 'rejected';
            
            // If already processed, trust the server's status
            if (responseData.message && responseData.message.includes('already processed')) {
                status = responseData.status || status;
            }
            
            const isApprovedStatus = status.toLowerCase() === 'approved';
            
            let title = isApprovedStatus ? 'Visitor Approved' : 'Visitor Rejected';
            let body = isApprovedStatus ? 'Access granted successfully.' : 'Access denied.';

            if (responseData.message && responseData.message.includes('already processed')) {
                title = `Request Already ${isApprovedStatus ? 'Approved' : 'Rejected'}`;
                body = `This request was previously ${status}.`;
            }

            self.registration.showNotification(title, {
                body: body,
                icon: '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                data: { type: 'action_confirmation' },
                timeout: 3000
            });
        }
    })
    .catch(err => {
        console.error('Action failed:', err);
        self.registration.showNotification('Action Failed', {
            body: `Error: ${err.message}`,
            icon: '/icons/icon-192.png',
            data: { type: 'action_confirmation' }
        });
    });

    event.waitUntil(promiseChain);
  } else {
    // 3. Default click (Body click) - Open app
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

  if (url.hostname.includes('firestore.googleapis.com') || 
      url.hostname.includes('firebase') ||
      url.hostname.includes('googleapis.com')) {
    return;
  }
  
  if (url.pathname.startsWith('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (!response || response.status !== 200 || response.type !== 'basic') {
          return response;
        }

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
            if (event.request.mode === 'navigate') {
                return caches.match('/index.html');
            }
        });
      })
  );
});
