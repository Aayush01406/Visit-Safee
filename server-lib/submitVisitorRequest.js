import { initAdmin } from './firebaseAdmin.js';
import admin from "firebase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  initAdmin();
  if (!admin.apps.length) {
      return res.status(500).json({ error: "Server configuration missing (Firebase Admin)" });
  }
  
  const db = admin.firestore();

  try {
    const { residencyId, visitorName, visitorPhone, flatId, purpose, vehicleNumber } = req.body;

    if (!residencyId || !visitorName || !flatId) {
      return res.status(400).json({ error: "Missing required fields" });
    }

    // 1. Create Request in Firestore
    const requestData = {
      visitorName,
      visitorPhone,
      flatId: String(flatId),
      purpose,
      vehicleNumber: vehicleNumber || null,
      residencyId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const requestRef = await db.collection("residencies").doc(residencyId).collection("visitor_requests").add(requestData);
    const requestId = requestRef.id;

    // 2. Find Residents to Notify
    const residentsRef = db.collection("residencies").doc(residencyId).collection("residents");
    const snapshot = await residentsRef.where("flatId", "==", String(flatId)).get();

    const tokens = [];
    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) {
        tokens.push(data.fcmToken);
      }
    });

    // Also notify Admin if needed (optional)
    try {
        const residencyDoc = await db.collection("residencies").doc(residencyId).get();
        if (residencyDoc.exists) {
            const rData = residencyDoc.data();
            if (rData.adminFcmToken) {
                tokens.push(rData.adminFcmToken);
            }
        }
    } catch (e) {
        console.warn("Failed to fetch admin token:", e);
    }

    const uniqueTokens = [...new Set(tokens)];
    
    // Construct Base URL for Action Links
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;

    if (uniqueTokens.length > 0) {
      const message = {
        notification: {
          title: "New Visitor Request",
          body: `${visitorName} is requesting entry.`,
        },
        data: {
          type: "visitor_request",
          requestId: requestId,
          residencyId: residencyId,
          visitorName: visitorName,
          flatId: String(flatId),
          click_action: "/resident/dashboard",
          actionUrlApprove: `${baseUrl}/api/visitor-action?action=approve&residencyId=${residencyId}&requestId=${requestId}`,
          actionUrlReject: `${baseUrl}/api/visitor-action?action=reject&residencyId=${residencyId}&requestId=${requestId}`
        },
        webpush: {
            headers: {
                Urgency: "high"
            },
            fcmOptions: {
                link: "/resident/dashboard"
            }
        },
        tokens: uniqueTokens
      };

      try {
        const response = await admin.messaging().sendMulticast(message);
        console.log(`[SubmitRequest] Notifications sent: ${response.successCount} success, ${response.failureCount} failed`);
      } catch (pushError) {
        console.error("[SubmitRequest] Push notification error:", pushError);
        // Don't fail the request if push fails
      }
    } else {
        console.log("[SubmitRequest] No tokens found for notification.");
    }

    return res.status(200).json({ success: true, requestId });

  } catch (error) {
    console.error("[SubmitRequest] Error:", error);
    return res.status(500).json({ error: error.message });
  }
}
