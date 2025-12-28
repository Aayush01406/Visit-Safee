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
    let body = req.body || {};
    
    // Handle case where body is a string (not parsed by middleware)
    if (typeof body === 'string') {
        try {
            body = JSON.parse(body);
        } catch (e) {
            console.warn('[VisitorAction] Failed to parse body string:', e);
            body = {};
        }
    }
    
    // Extract parameters with priority
    // 1. Check Body
    // 2. Check Query
    let actionRaw = body.action || query.action;
    let residencyId = body.residencyId || query.residencyId;
    let requestId = body.requestId || query.requestId;
    const username = body.username || "notification_action";

    // Normalize action
    let action = actionRaw ? String(actionRaw).toLowerCase().trim() : null;

    console.log(`[VisitorAction] Processing action: '${action}' for Request: ${requestId}`);

    if (!action || !["approve", "reject"].includes(action)) {
        console.error(`[VisitorAction] Invalid action received: '${actionRaw}'`);
        res.status(400).json({ error: "Invalid action", received: actionRaw });
        return;
    }
    
    // STRICT status assignment
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
    
    // If attempting to approve/reject, check if it's already done
    if (currentStatus !== "pending") {
        console.log(`[VisitorAction] Request ${requestId} already processed. Current status: ${currentStatus}`);
        if (req.method === "GET") {
             res.redirect(302, "/");
        } else {
             // Return success but indicate it was already processed
             // IMPORTANT: Return the ACTUAL current status so the UI knows
             res.status(200).json({ 
                 success: true, 
                 message: "Request already processed", 
                 status: currentStatus,
                 inputAction: action // Debugging
             });
        }
        return;
    }

    // Update Firestore
    await docRef.update({
        status,
        updatedAt: new Date().toISOString(),
        actionBy: username,
    });

    console.log(`[VisitorAction] Successfully updated request ${requestId} to ${status}`);

    if (req.method === "GET") {
        // Redirect to root if accessed via browser (fallback for old SW)
        res.redirect(302, "/");
    } else {
        res.status(200).json({ success: true, status, inputAction: action });
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
