import admin from "firebase-admin";

export function initAdmin() {
  if (admin.apps.length) return;
  
  const serviceAccountVar = process.env.FIREBASE_ADMIN_CREDENTIALS || process.env.FIREBASE_SERVICE_ACCOUNT;
  
  try {
      if (serviceAccountVar) {
          const serviceAccount = JSON.parse(serviceAccountVar);
          admin.initializeApp({
              credential: admin.credential.cert(serviceAccount)
          });
      } else {
          // Initialize without credentials (relies on ADC or open rules for dev)
          // For local development with "firebase-admin" without service account, 
          // we must provide projectId at minimum if not using ADC.
          // However, for pure local dev with NO auth, it often fails.
          // Let's try to use the environment variables we DO have if they exist.
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
