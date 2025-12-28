const CACHE_NAME = 'visitsafe-v4-connected'; // Bumped version for connected logic
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/favicon.png',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(clients.claim());
});

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
      console.log('[SW] Received background message ', payload);
      
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
            icon: '/icons/cross.png'
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
    let residentId = data.residentId;
    let approvalToken = data.approvalToken || data.token; // Extract token

    // Fallback: Extract from approveUrl/rejectUrl if missing
    if ((!requestId || !residencyId || !approvalToken) && (data.approveUrl || data.rejectUrl)) {
        try {
            const urlStr = data.approveUrl || data.rejectUrl;
            const urlObj = new URL(urlStr);
            if (!requestId) requestId = urlObj.searchParams.get('requestId');
            if (!residencyId) residencyId = urlObj.searchParams.get('residencyId');
            if (!approvalToken) approvalToken = urlObj.searchParams.get('token');
        } catch (e) {
            console.error('[SW] Failed to parse approveUrl for fallback data', e);
        }
    }

    // Construct absolute URL for the API
    const apiUrl = new URL('/api/visitor-action', self.location.origin);
    
    // Set Query Params (Primary Method)
    if (targetAction) apiUrl.searchParams.set('action', targetAction);
    if (requestId) apiUrl.searchParams.set('requestId', requestId);
    if (residencyId) apiUrl.searchParams.set('residencyId', residencyId);

    console.log(`[SW] Sending request to: ${apiUrl.href}`);

    const requestBody = {
        action: targetAction,
        requestId: requestId,
        residencyId: residencyId,
        residentId: residentId,
        token: approvalToken // Send token
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
            throw new Error(`API ${response.status}: ${errorText}`);
        }
        return response.json();
    })
    .then(responseData => {
        console.log('Action success:', responseData);
        
        if (responseData.success) {
            // Determine display status based on SERVER response
            let status = responseData.status; // "approved" or "rejected"
            
            // Validation: Did the server do what we asked?
            const serverAction = responseData.inputAction; // "approve" or "reject"
            const intentMatched = targetAction === serverAction;
            
            // If the status is NOT what we expected, check if it was already processed
            const isAlreadyProcessed = responseData.message && responseData.message.includes('already');
            
            const isApprovedStatus = String(status).toLowerCase() === 'approved';
            
            let title = isApprovedStatus ? 'Visitor Approved' : 'Request Rejected';
            let body = isApprovedStatus ? 'Access granted successfully.' : 'Visitor request has been rejected.';

            if (isAlreadyProcessed) {
                title = `Already ${isApprovedStatus ? 'Approved' : 'Rejected'}`;
                body = `This request was previously ${status}.`;
            } else if (!intentMatched) {
                // Debugging Mismatch
                title = `System Error`;
                body = `Action: ${targetAction}, Server: ${serverAction}. Please retry.`;
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
        self.registration.showNotification('Action Error', {
            body: `Cmd: ${targetAction}, Err: ${err.message}`,
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
