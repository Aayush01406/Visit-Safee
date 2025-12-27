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
        const supported = await isSupported();
        if (!supported) return;

        if ('serviceWorker' in navigator) {
          await navigator.serviceWorker.register('/service-worker.js');
        }

        if (Notification.permission === 'default') {
          const permission = await Notification.requestPermission();
          if (permission !== 'granted') return;
        }

        if (Notification.permission === 'granted') {
          const messaging = getMessaging(app);
          const registration = await navigator.serviceWorker.ready;
          
          const token = await getToken(messaging, {
            vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
            serviceWorkerRegistration: registration
          });

          if (token) {
            await storage.saveUserToken(token);
          }

          onMessage(messaging, async (payload) => {
            const { title, body, icon } = payload.notification || {};
            const { requestId, visitorName } = payload.data || {};
            
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