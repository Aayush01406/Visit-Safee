import { initAdmin, db } from "./firebaseAdmin.js";
import { sendPushNotification } from "./notificationService.js";

initAdmin();

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  try {
    const { residencyId, requestId, status, username } = req.body || {};
    
    if (!requestId || !status) {
      res.status(400).json({ error: "Missing requestId or status" });
      return;
    }

    // Allow more statuses than just approved/rejected
    const validStatuses = ["approved", "rejected", "arrived", "departed", "waiting_approval"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: "Invalid status" });
      return;
    }

    const firestore = db();
    
    // If residencyId not provided, try to find it from the request
    let targetResidencyId = residencyId;
    if (!targetResidencyId) {
      // Search across all residencies for the request (less efficient but works for service worker calls)
      const residenciesSnap = await firestore.collection("residencies").get();
      for (const residencyDoc of residenciesSnap.docs) {
        const requestRef = residencyDoc.ref.collection("visitor_requests").doc(requestId);
        const requestSnap = await requestRef.get();
        if (requestSnap.exists) {
          targetResidencyId = residencyDoc.id;
          break;
        }
      }
    }
    
    if (!targetResidencyId) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    
    const requestRef = firestore.collection("residencies").doc(targetResidencyId).collection("visitor_requests").doc(requestId);
    
    // 1. Get current request data
    const requestSnap = await requestRef.get();
    if (!requestSnap.exists) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    const requestData = requestSnap.data();
    
    // 2. Update status
    await requestRef.update({
      status,
      updatedAt: new Date().toISOString(),
      actionBy: username || "notification_action",
    });

    // 3. Send Notification
    const flatId = requestData.flatId;
    if (flatId) {
       const residentsRef = firestore.collection("residencies").doc(targetResidencyId).collection("residents");
       const residentsSnap = await residentsRef.where("flatId", "==", flatId).get();
       
       if (!residentsSnap.empty) {
          const notificationPromises = [];
          
          residentsSnap.forEach(residentDoc => {
             const residentId = residentDoc.id;
             let title = "";
             let body = "";
             let shouldSend = false;
             
             if (status === "arrived") {
                title = "Visitor Arrived";
                body = `${requestData.visitorName || "Visitor"} has arrived at the gate.`;
                shouldSend = true;
             } else if (status === "waiting_approval") {
                title = "New Visitor Request";
                body = `${requestData.visitorName || "Visitor"} is waiting for your approval.`;
                shouldSend = true;
             }
             
             if (shouldSend) {
                console.log(`Sending notification to resident ${residentId} for status ${status}`);
                notificationPromises.push(
                  sendPushNotification(targetResidencyId, residentId, "resident", { title, body }, { requestId, status })
                );
             }
          });
          
          await Promise.all(notificationPromises);
       }
    }

    res.status(200).json({ success: true });
  } catch (error) {
    console.error("Update Request Error:", error);
    res.status(500).json({ error: error.message });
  }
}
