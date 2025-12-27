import { useEffect } from 'react';
import { useAuth } from '@/hooks/use-auth.jsx';
import { getMessaging, getToken, onMessage, isSupported } from 'firebase/messaging';
import { app } from '@/lib/firebase';
import { storage } from '@/lib/storage';

export function NotificationManager() {
  const { user } = useAuth();

  useEffect(() => {
    if (!user) return;

    const initializeNotifications = async () => {
      try {
        // Check if messaging is supported
        const supported = await isSupported();
        if (!supported) {
          console.warn('FCM not supported in this browser');
          return;
        }

        // Register service worker
        if ('serviceWorker' in navigator) {
          const registration = await navigator.serviceWorker.register('/service-worker.js');
          console.log('Service Worker registered:', registration);
          
          // Wait for service worker to be ready
          await navigator.serviceWorker.ready;
        }

        // Request notification permission
        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') {
            console.warn('Notification permission denied');
            return;
          }
        }

        if (Notification.permission === 'granted') {
          const messaging = getMessaging(app);
          const registration = await navigator.serviceWorker.ready;
          
          // Get FCM token with retry logic
          let token = null;
          let retries = 3;
          
          while (!token && retries > 0) {
            try {
              token = await getToken(messaging, {
                vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
                serviceWorkerRegistration: registration
              });
              
              if (token) {
                console.log('FCM Token generated successfully');
                await storage.saveUserToken(token);
                break;
              }
            } catch (error) {
              console.error(`Token generation attempt ${4 - retries} failed:`, error);
              retries--;
              if (retries > 0) {
                await new Promise(resolve => setTimeout(resolve, 1000));
              }
            }
          }

          if (!token) {
            console.error('Failed to generate FCM token after retries');
            return;
          }

          // Handle foreground messages
          onMessage(messaging, async (payload) => {
            console.log('Foreground message received:', payload);
            
            const { title, body, icon } = payload.notification || {};
            const { requestId, visitorName } = payload.data || {};
            
            // Show notification using service worker
            if (registration) {
              registration.showNotification(title || 'New Visitor Request', {
                body: body || `${visitorName} wants to visit`,
                icon: icon || '/icons/icon-192.png',
                badge: '/icons/icon-192.png',
                tag: requestId || 'default',
                data: payload.data,
                requireInteraction: true,
                actions: [
                  { action: 'APPROVE', title: 'Approve' },
                  { action: 'REJECT', title: 'Reject' }
                ]
              });
            }
          });
        }
      } catch (error) {
        console.error('Error initializing notifications:', error);
      }
    };

    initializeNotifications();
  }, [user]);

  return null;
}