import admin from "firebase-admin";

function init() {
  if (admin.apps.length) return;
  const svc = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!svc) throw new Error("FIREBASE_SERVICE_ACCOUNT missing");
  const sa = JSON.parse(svc);
  admin.initializeApp({ credential: admin.credential.cert(sa) });
}

async function getAllResidentTokens(db) {
  const tokens = [];
  const residenciesSnap = await db.collection("residencies").get();
  for (const residencyDoc of residenciesSnap.docs) {
    const residentsSnap = await db.collection("residencies").doc(residencyDoc.id).collection("residents").get();
    residentsSnap.forEach(d => {
      const t = d.data().fcmToken;
      if (t) tokens.push(t);
    });
    const residencyData = residencyDoc.data();
    if (residencyData.adminFcmToken) tokens.push(residencyData.adminFcmToken);
  }
  return [...new Set(tokens)];
}

async function sendBroadcast(tokens) {
  const title = "VisitSafee Notification";
  const body = "This is a live test notification to all residents.";
  const data = {
    title,
    body,
    url: "/",
    status: "pending",
    timestamp: new Date().toISOString()
  };
  let success = 0;
  let failure = 0;
  for (let i = 0; i < tokens.length; i += 500) {
    const batch = tokens.slice(i, i + 500);
    const message = {
      notification: { title, body },
      data,
      tokens: batch
    };
    const resp = await admin.messaging().sendMulticast(message);
    success += resp.successCount;
    failure += resp.failureCount;
  }
  return { success, failure };
}

async function main() {
  init();
  const db = admin.firestore();
  const tokens = await getAllResidentTokens(db);
  if (tokens.length === 0) {
    console.log("No tokens found");
    return;
  }
  const result = await sendBroadcast(tokens);
  console.log(JSON.stringify({ total: tokens.length, success: result.success, failure: result.failure }));
}

main().catch(e => {
  console.error(e);
  process.exit(1);
});
