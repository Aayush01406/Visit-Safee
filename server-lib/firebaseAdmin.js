import admin from "firebase-admin";

export function initAdmin() {
  if (admin.apps.length) return;
  
  const serviceAccountVar = process.env.FIREBASE_ADMIN_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  
  try {
      if (serviceAccountVar && serviceAccountVar.trim().startsWith('{')) {
          try {
            const serviceAccount = JSON.parse(serviceAccountVar);
            admin.initializeApp({
                credential: admin.credential.cert(serviceAccount)
            });
          } catch (jsonErr) {
            console.error("Error parsing FIREBASE_ADMIN_CREDENTIALS:", jsonErr);
            // Fallback to project ID if JSON parse fails
            const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "visitsafe-3b609";
            admin.initializeApp({ projectId });
          }
      } else {
          // Initialize without credentials (relies on ADC or open rules for dev)
          const projectId = process.env.VITE_FIREBASE_PROJECT_ID || "visitsafe-3b609";
          
          if (projectId) {
              admin.initializeApp({
                  projectId: projectId
              });
          } else {
              admin.initializeApp();
          }
      }
  } catch (e) {
      console.error("Firebase Admin Init Error:", e);
  }
}

export const db = admin.firestore;
