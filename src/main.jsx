import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";
import { initMessaging, requestToken } from "@/lib/firebase-messaging";

// Register Service Worker in production
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    // Pass Firebase config via URL params to the Service Worker
    const firebaseConfig = new URLSearchParams({
      apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
      authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
      projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
      storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
      appId: import.meta.env.VITE_FIREBASE_APP_ID,
    }).toString();

    navigator.serviceWorker.register(`/firebase-messaging-sw.js?${firebaseConfig}`)
      .then((registration) => {
         console.log('SW registered:', registration);
         // Initialize messaging after SW registration
         initMessaging();
      })
      .catch(error => {
         console.log('SW registration failed:', error);
      });
  });

  // Request permission on user interaction (global click listener)
  window.addEventListener('click', () => {
     requestToken();
  }, { once: true });
}

createRoot(document.getElementById("root")).render(<App />);
