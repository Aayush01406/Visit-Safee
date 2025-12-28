import { initAdmin } from './firebaseAdmin.js';
import admin from "firebase-admin";

export default async function handler(req, res) {
  const debugLog = [];
  function log(msg) {
      console.log(`[VisitorAction] ${msg}`);
      debugLog.push(msg);
  }

  try {
    // Allow GET (for direct links) and POST (for programmatic calls)
    if (req.method !== "POST" && req.method !== "GET") {
        res.status(405).json({ error: "Method Not Allowed" });
        return;
    }

    log(`Received ${req.method} request`);

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
    let residentId = body.residentId || query.residentId;
    let token = body.token || query.token;
    const username = body.username || "notification_action";

    // Normalize action
    let action = actionRaw ? String(actionRaw).toLowerCase().trim() : null;

    // Fix: Explicitly handle "approve_visitor" / "reject_visitor" if passed directly
    if (action === 'approve_visitor') action = 'approve';
    if (action === 'reject_visitor') action = 'reject';

    log(`Processing action: '${action}' (Raw: ${actionRaw}) for Request: ${requestId}`);

    if (!action || !["approve", "reject"].includes(action)) {
        console.error(`[VisitorAction] Invalid action received: '${actionRaw}'`);
        res.status(400).json({ 
            error: "Invalid action", 
            received: actionRaw,
            debug: debugLog
        });
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
             console.error("Request not found:", requestId);
             res.redirect(302, "/");
        } else {
             res.status(404).json({ error: "Request not found" });
        }
        return;
    }
    
    const requestData = doc.data();
    const currentStatus = requestData.status;

    // --- VALIDATION LOGIC (Mirrors visitorDecision.js) ---

    // 1. Validate Token
    // Only enforce if the request has a token (backwards compatibility for old requests without token)
    if (requestData.approvalToken) {
        if (requestData.approvalToken !== token) {
            console.warn(`[VisitorAction] Invalid token. Expected: ${requestData.approvalToken}, Got: ${token}`);
            return res.status(403).json({ error: "Invalid approval token" });
        }
    }

    // 2. Validate Resident Access
    if (residentId && residentId !== 'admin') {
        const residentDoc = await db.collection("residencies").doc(residencyId).collection("residents").doc(residentId).get();
        
        if (!residentDoc.exists) {
            return res.status(403).json({ error: 'Resident not found' });
        }

        const residentData = residentDoc.data();
        
        // Validate flat access
        let hasAccess = false;
        
        // Direct Flat ID Match
        if (requestData.flatId && residentData.flatId && String(residentData.flatId) === String(requestData.flatId)) {
            hasAccess = true;
        } else {
            // Legacy Match: Flat Number + Block Name
            try {
                // If request has flatId, look it up to get details
                let requestFlatNum = requestData.flatNumber; // Legacy field?
                let requestBlockId = requestData.blockId; // Legacy field?
                
                // If not in request, fetch from flatId
                if (!requestFlatNum && requestData.flatId) {
                     const flatDoc = await db.collection("residencies").doc(residencyId).collection("flats").doc(requestData.flatId).get();
                     if (flatDoc.exists) {
                         const fd = flatDoc.data();
                         requestFlatNum = fd.number;
                         requestBlockId = fd.blockId;
                     }
                }

                if (requestFlatNum && requestBlockId) {
                    const blockDoc = await db.collection("residencies").doc(residencyId).collection("blocks").doc(requestBlockId).get();
                    if (blockDoc.exists) {
                        const blockName = blockDoc.data().name;
                        
                        // Check if resident matches this flat/block
                        // Resident block might be "BLOCK A" or "A"
                        const normalize = s => String(s||'').toUpperCase().replace(/^(BLOCK|TOWER|WING)\s+/, "").trim();
                        
                        if (String(residentData.flat) === String(requestFlatNum) && 
                            normalize(residentData.block) === normalize(blockName)) {
                            hasAccess = true;
                        }
                    }
                }
            } catch (error) {
                console.error('Error validating flat access:', error);
            }
        }

        if (!hasAccess) {
             console.warn(`[VisitorAction] Access denied for resident ${residentId}`);
             return res.status(403).json({ error: 'Access denied - not authorized for this flat' });
        }
    }
    // -----------------------------------------------------
    
    // If attempting to approve/reject, check if it's already done
    if (currentStatus !== "pending") {
        log(`Request ${requestId} already processed. Current status: ${currentStatus}`);
        
        // CORRECTION: If the user sends "approve", and it is ALREADY "approved", return success/approved.
        // If the user sends "approve", but it is "rejected", return success/rejected (with message).
        
        if (req.method === "GET") {
             res.redirect(302, "/");
        } else {
             res.status(200).json({ 
                 success: true, 
                 message: `Request already ${currentStatus}`, 
                 status: currentStatus,
                 inputAction: action,
                 debug: debugLog
             });
        }
        return;
    }

    // Update Firestore with detailed fields (matching visitorDecision.js logic)
    const updateData = {
        status,
        updatedAt: new Date().toISOString(),
        actionBy: residentId || username,
    };

    if (status === 'approved') {
        updateData.approvedBy = residentId || username;
        updateData.approvedAt = new Date().toISOString();
    } else {
        updateData.rejectedBy = residentId || username;
        updateData.rejectedAt = new Date().toISOString();
    }

    await docRef.update(updateData);

    log(`Successfully updated request ${requestId} to ${status}`);

    if (req.method === "GET") {
        res.redirect(302, "/");
    } else {
        // Return explicit confirmation of what happened
        res.status(200).json({ 
            success: true, 
            status, 
            inputAction: action,
            debug: debugLog 
        });
    }
  } catch (error) {
    console.error("Visitor Action Error:", error);
    if (req.method === "GET") {
        res.redirect(302, "/");
    } else {
        res.status(500).json({ error: error.message, debug: debugLog });
    }
  }
}
