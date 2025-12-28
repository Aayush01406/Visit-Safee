import { initAdmin } from './firebaseAdmin.js';
import admin from "firebase-admin";

export default async function handler(req, res) {
  try {
    // Allow GET (for direct links) and POST (for programmatic calls)
    if (req.method !== "POST" && req.method !== "GET") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }

    console.log(`[VisitorAction] Received ${req.method} request`);

    try {
        initAdmin();
    } catch (initErr) {
        console.error("InitAdmin failed:", initErr);
        res.status(500).json({ error: "Firebase Init Failed", details: initErr.message });
        return;
    }

    if (!admin.apps.length) {
        res.status(500).json({ error: "Server configuration missing (Firebase Admin)" });
        return;
    }

    // Support both body and query params (for Service Worker fetch)
    const query = req.query || {};
    const body = req.body || {};
    
    const action = query.action || body.action;
    const residencyId = query.residencyId || body.residencyId;
    const requestId = query.requestId || body.requestId;
    const username = body.username || "notification_action"; // Optional

    if (!action || !["approve", "reject"].includes(action)) {
        res.status(400).json({ error: "Invalid action" });
        return;
    }
    
    const status = action === "approve" ? "approved" : "rejected";

    if (!residencyId || !requestId) {
        res.status(400).json({ error: "Missing residencyId or requestId" });
        return;
    }

    const db = admin.firestore();
    const docRef = db.collection("residencies").doc(residencyId).collection("visitor_requests").doc(requestId);
    
    // Check if already processed to avoid re-processing
    const doc = await docRef.get();
    if (!doc.exists) {
        if (req.method === "GET") {
             // Even if not found, redirect to home to avoid 404/500 to user
             console.error("Request not found:", requestId);
             res.redirect(302, "/");
        } else {
             res.status(404).json({ error: "Request not found" });
        }
        return;
    }
    
    const currentStatus = doc.data().status;
    if (currentStatus !== "pending") {
        if (req.method === "GET") {
             res.redirect(302, "/");
        } else {
             res.status(200).json({ success: true, message: "Request already processed", status: currentStatus });
        }
        return;
    }

    await docRef.update({
        status,
        updatedAt: new Date().toISOString(),
        actionBy: username,
    });

    if (req.method === "GET") {
        // Redirect to root if accessed via browser (fallback for old SW)
        res.redirect(302, "/");
    } else {
        res.status(200).json({ success: true, status });
    }
  } catch (error) {
    console.error("Visitor Action Error:", error);
    if (req.method === "GET") {
        // Redirect to home on error to be safe for user experience
        res.redirect(302, "/");
    } else {
        res.status(500).json({ error: error.message });
    }
  }
}
