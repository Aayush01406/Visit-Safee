import { initAdmin } from './firebaseAdmin.js';
import admin from "firebase-admin";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  initAdmin();
  if (!admin.apps.length) {
    res.status(500).json({ error: "Server configuration missing (Firebase Admin)" });
    return;
  }

  try {
    const { residencyId, userId, flatId, title, body, data, broadcast } = req.body || {};
    if (!residencyId) {
      res.status(400).json({ error: "Missing residencyId" });
      return;
    }

    const db = admin.firestore();

    // 1. Idempotency Check & Update
    let requestRef;
    if (data?.requestId) {
      requestRef = db.collection("residencies").doc(residencyId).collection("visitor_requests").doc(data.requestId);
      const requestDoc = await requestRef.get();
      if (requestDoc.exists) {
          const reqData = requestDoc.data();
          if (reqData.notificationSent) {
            console.log(`Notification already sent for request ${data.requestId}`);
            res.status(200).json({ success: true, message: "Notification already sent" });
            return;
          }
          if (reqData.status !== "pending") {
            console.log(`Request ${data.requestId} is no longer pending`);
            res.status(200).json({ success: true, message: "Request not pending" });
            return;
          }
      }
    }

    let tokens = [];
    let flatNumber;
    let blockName;

    // Fetch tokens logic
    if (broadcast) {
      const residentsRef = db.collection("residencies").doc(residencyId).collection("residents");
      const snapshot = await residentsRef.get();
      snapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.fcmToken) tokens.push(userData.fcmToken);
      });
    } else if (userId) {
      const userDoc = await db.collection("residencies").doc(residencyId).collection("residents").doc(userId).get();
      if (userDoc.exists) {
        const u = userDoc.data();
        if (u.fcmToken) tokens.push(u.fcmToken);
      }
    } else if (flatId) {
      const residentsRef = db.collection("residencies").doc(residencyId).collection("residents");
      const snapshot = await residentsRef.where("flatId", "==", String(flatId)).get();
      snapshot.forEach((doc) => {
        const userData = doc.data();
        if (userData.fcmToken) {
          tokens.push(userData.fcmToken);
        }
      });
      const flatDoc = await db.collection("residencies").doc(residencyId).collection("flats").doc(String(flatId)).get();
      if (flatDoc.exists) {
        const fd = flatDoc.data();
        flatNumber = String(fd.number || "");
        if (fd.blockId) {
          const blockDoc = await db.collection("residencies").doc(residencyId).collection("blocks").doc(fd.blockId).get();
          if (blockDoc.exists) {
            blockName = blockDoc.data().name || "";
          }
        }
      }
    }

    // Always fetch Admin Token for the residency to ensure admins/owners get notified
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

    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      res.status(200).json({ message: "No registered devices found" });
      return;
    }

    // Construct Action URLs
    const protocol = req.headers['x-forwarded-proto'] || 'https';
    const host = req.headers.host;
    const baseUrl = `${protocol}://${host}`;
    
    // We pass these in the 'data' payload for the Service Worker
    const actionData = {
        ...data,
        actionUrlApprove: `${baseUrl}/api/visitor-action?action=approve&residencyId=${residencyId}&requestId=${data.requestId}`,
        actionUrlReject: `${baseUrl}/api/visitor-action?action=reject&residencyId=${residencyId}&requestId=${data.requestId}`
    };

    const message = {
      notification: {
        title: title || "New Visitor Request",
        body: body || "You have a new visitor.",
      },
      data: {
        ...actionData,
        // Convert all values to strings for FCM
        requestId: String(data.requestId || ""),
        residencyId: String(residencyId || ""),
        visitorName: String(data.visitorName || ""),
        flatId: String(data.flatId || ""),
        block: String(blockName || ""),
        flat: String(flatNumber || ""),
        actionUrlApprove: actionData.actionUrlApprove,
        actionUrlReject: actionData.actionUrlReject
      },
      tokens: tokens,
      android: {
        priority: "high",
        notification: {
          priority: "max",
          channelId: "visitor_requests",
          visibility: "public",
          defaultSound: true,
          defaultVibrateTimings: true
        }
      },
      apns: {
        headers: {
          "apns-priority": "10"
        },
        payload: {
          aps: {
            alert: {
              title: title || "New Visitor Request",
              body: body || "You have a new visitor.",
            },
            sound: "default",
            badge: 1,
            "content-available": 1
          }
        }
      }
    };

    // Helper for retry logic
    const sendWithRetry = async (msg, maxRetries = 2) => {
        let currentTokens = [...msg.tokens];
        let finalSuccessCount = 0;
        let finalFailureCount = 0;
        let finalResponses = [];

        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            if (currentTokens.length === 0) break;

            if (attempt > 0) {
                console.log(`Retry attempt ${attempt} for ${currentTokens.length} tokens...`);
                await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
            }

            const batchResponse = await admin.messaging().sendMulticast({ ...msg, tokens: currentTokens });
            
            finalSuccessCount += batchResponse.successCount;
            
            const retryTokens = [];
            batchResponse.responses.forEach((resp, idx) => {
                if (!resp.success) {
                    const errCode = resp.error?.code;
                    // Only retry for internal errors or unavailable service
                    // Do NOT retry for invalid tokens
                    if (errCode === 'messaging/internal-error' || errCode === 'messaging/server-unavailable') {
                        retryTokens.push(currentTokens[idx]);
                    } else {
                        console.error(`Failed to send to token ${currentTokens[idx]}:`, resp.error);
                        finalFailureCount++;
                    }
                }
            });
            
            currentTokens = retryTokens;
        }
        
        // Treat remaining tokens as failed after max retries
        finalFailureCount += currentTokens.length;

        return { successCount: finalSuccessCount, failureCount: finalFailureCount };
    };

    const response = await sendWithRetry(message);
    
    console.log(`Push result for request ${data.requestId}: Success=${response.successCount}, Failure=${response.failureCount}`);

    // 2. Mark as Sent
    if (requestRef && response.successCount > 0) {
        await requestRef.update({ notificationSent: true });
    }

    res.status(200).json({ success: true, response });

  } catch (error) {
    console.error("Push Error:", error);
    res.status(500).json({ error: error.message });
  }
}
