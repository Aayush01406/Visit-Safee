import { initAdmin, db } from './firebaseAdmin.js';
import admin from 'firebase-admin';

// Initialize Admin SDK
initAdmin();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { residencyId, title, body, data = {}, targetType = 'residents', targetId } = req.body;

  if (!residencyId || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields: residencyId, title, body' });
  }

  try {
    console.log(`Sending notification: ${title} to ${targetType} in residency ${residencyId}`);
    let tokens = [];
    const tokenToDocId = {};

    if (targetType === 'residents') {
      // Send to all residents (admin broadcast)
      const residentsRef = db().collection('residencies').doc(residencyId).collection('residents');
      const snapshot = await residentsRef.where('fcmToken', '!=', null).get();

      snapshot.forEach(doc => {
        const docData = doc.data();
        if (docData.fcmToken) {
          tokens.push(docData.fcmToken);
          tokenToDocId[docData.fcmToken] = doc.id;
        }
      });
    } else if (targetType === 'specific_flat' && targetId) {
      // Send to specific flat residents (visitor request)
      const residentsRef = db().collection('residencies').doc(residencyId).collection('residents');
      const residentsMap = new Map();

      // Strategy 1: Find by flatId
      const snapshotById = await residentsRef.where('flatId', '==', targetId).get();
      snapshotById.forEach(doc => residentsMap.set(doc.id, doc));

      // Strategy 2: Find by Block + Flat (legacy)
      try {
        const flatDoc = await db().collection('residencies').doc(residencyId).collection('flats').doc(targetId).get();
        
        if (flatDoc.exists) {
          const flatData = flatDoc.data();
          const flatNumber = String(flatData.number);
          const blockId = flatData.blockId;

          if (blockId) {
            const blockDoc = await db().collection('residencies').doc(residencyId).collection('blocks').doc(blockId).get();
            
            if (blockDoc.exists) {
              const blockData = blockDoc.data();
              const blockName = blockData.name;
              const normalizedBlock = blockName.toUpperCase().includes('BLOCK') ? blockName : `BLOCK ${blockName}`;
              
              const [snap1, snap2] = await Promise.all([
                residentsRef.where('flat', '==', flatNumber).where('block', '==', normalizedBlock).get(),
                residentsRef.where('flat', '==', flatNumber).where('block', '==', blockName).get()
              ]);

              snap1.forEach(doc => residentsMap.set(doc.id, doc));
              snap2.forEach(doc => residentsMap.set(doc.id, doc));
            }
          }
        }
      } catch (lookupError) {
        console.error("Error looking up flat/block details:", lookupError);
      }

      // Collect tokens from found residents
      for (const doc of residentsMap.values()) {
        const docData = doc.data();
        if (docData.fcmToken) {
          tokens.push(docData.fcmToken);
          tokenToDocId[docData.fcmToken] = doc.id;
        }
      }

    }

    // Remove duplicates
    tokens = [...new Set(tokens)];

    if (tokens.length === 0) {
      return res.status(200).json({ 
        success: true, 
        sentCount: 0, 
        message: 'No residents found with FCM tokens' 
      });
    }

    // Prepare FCM payload with action buttons for visitor requests
    const payload = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        ...data,
        click_action: '/',
        timestamp: Date.now().toString(),
      },
      tokens: tokens,
    };

    // For visitor requests, send individual notifications with approval URLs
    if (data.actionType === 'VISITOR_REQUEST' && targetType === 'specific_flat') {
      const individualNotifications = [];
      
      // Send same notification to all residents (no resident-specific data needed)
      for (const [token, residentId] of Object.entries(tokenToDocId)) {
        const individualPayload = {
          notification: {
            title: title,
            body: body,
          },
          data: {
            visitorId: data.visitorId,
            actionType: 'VISITOR_REQUEST',
            approvalToken: data.approvalToken,
            approveUrl: data.approveUrl,
            rejectUrl: data.rejectUrl,
            visitorName: data.visitorName || 'Unknown',
            blockName: data.blockName || 'Unknown',
            flatNumber: data.flatNumber || 'Unknown',
            purpose: data.purpose || 'Visit',
            click_action: '/',
            timestamp: Date.now().toString(),
          },
          token: token,
        };
        
        individualNotifications.push(admin.messaging().send(individualPayload));
      }
      
      // Send all individual notifications
      const results = await Promise.allSettled(individualNotifications);
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failureCount = results.filter(r => r.status === 'rejected').length;
      
      console.log(`Visitor notifications sent: ${successCount} success, ${failureCount} failed`);
      
      return res.status(200).json({ 
        success: true, 
        sentCount: successCount, 
        failureCount: failureCount 
      });
    }

    // Send notification
    const response = await admin.messaging().sendEachForMulticast(payload);

    console.log(`Notification sent: ${response.successCount} success, ${response.failureCount} failed`);

    // Cleanup invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });

      if (failedTokens.length > 0) {
        console.log(`Removing ${failedTokens.length} invalid tokens...`);
        
        const batch = db().batch();
        let batchCount = 0;

        failedTokens.forEach(token => {
          const docId = tokenToDocId[token];
          if (docId) {
            const docRef = db().collection('residencies').doc(residencyId).collection('residents').doc(docId);
            batch.update(docRef, {
              fcmToken: admin.firestore.FieldValue.delete()
            });
            batchCount++;
          }
        });

        if (batchCount > 0) {
          await batch.commit();
          console.log('Invalid tokens removed');
        }
      }
    }

    return res.status(200).json({ 
      success: true, 
      sentCount: response.successCount, 
      failureCount: response.failureCount 
    });

  } catch (error) {
    console.error('Error in sendNotification:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}