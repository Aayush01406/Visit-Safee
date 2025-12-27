import { getMessaging, getToken, onMessage } from "firebase/messaging";
import { app } from "./firebase";
import { storage } from "./storage";

let messaging = null;

export const initMessaging = async () => {
  if (typeof window !== "undefined" && "serviceWorker" in navigator) {
    try {
      messaging = getMessaging(app);

      // Foreground message handler
      onMessage(messaging, (payload) => {
        console.log("Foreground Message received: ", payload);
        const { title, body, icon } = payload.notification || {};
        
        // Show notification if permission granted
        if (Notification.permission === "granted") {
           // De-duplication using tag
           const notificationOptions = {
               body: body,
               icon: icon || '/icons/icon-192.png',
               tag: payload.messageId // Use messageId to prevent duplicates
           };
           
           if (navigator.serviceWorker.controller) {
               navigator.serviceWorker.ready.then(registration => {
                   registration.showNotification(title, notificationOptions);
               });
           } else {
               new Notification(title, notificationOptions);
           }
        }
      });
    } catch (error) {
      console.error("Messaging initialization failed", error);
    }
  }
};

export const requestToken = async () => {
  if (!messaging) await initMessaging();
  if (!messaging) return;

  try {
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const registration = await navigator.serviceWorker.ready;
      
      const token = await getToken(messaging, {
        vapidKey: import.meta.env.VITE_FIREBASE_VAPID_KEY,
        serviceWorkerRegistration: registration
      });

      if (token) {
        console.log("FCM Token:", token);
        await storage.saveUserToken(token);
      }
    }
  } catch (error) {
    console.error("Error retrieving token:", error);
  }
};
