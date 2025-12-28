import { initAdmin } from './firebaseAdmin.js';
import admin from "firebase-admin";

export default async function handler(req, res) {
  // Allow GET (for direct links) and POST (for programmatic calls)
  if (req.method !== "POST" && req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  console.log(`[VisitorAction] Received ${req.method} request`);

  initAdmin();
  if (!admin.apps.length) {
    res.status(500).json({ error: "Server configuration missing (Firebase Admin)" });
    return;
  }

  // Support both body and query params (for Service Worker fetch)
  const action = req.query.action || req.body.action;
  const residencyId = req.query.residencyId || req.body.residencyId;
  const requestId = req.query.requestId || req.body.requestId;
  const username = req.body.username || "notification_action"; // Optional

  if (!action || !["approve", "reject"].includes(action)) {
    res.status(400).json({ error: "Invalid action" });
    return;
  }
  
  const status = action === "approve" ? "approved" : "rejected";

  if (!residencyId || !requestId) {
    res.status(400).json({ error: "Missing residencyId or requestId" });
    return;
  }

  try {
    const db = admin.firestore();
    const docRef = db.collection("residencies").doc(residencyId).collection("visitor_requests").doc(requestId);
    
    // Check if already processed to avoid re-processing
    const doc = await docRef.get();
    if (!doc.exists) {
        res.status(404).json({ error: "Request not found" });
        return;
    }
    const currentStatus = doc.data().status;
    if (currentStatus !== "pending") {
        res.status(200).json({ success: true, message: "Request already processed", status: currentStatus });
        return;
    }

    await docRef.update({
      status,
      updatedAt: new Date().toISOString(),
      actionBy: username,
    });

    res.status(200).json({ success: true, status });
  } catch (error) {
    console.error("Visitor Action Error:", error);
    res.status(500).json({ error: error.message });
  }
}
