import { initAdmin, db } from './firebaseAdmin.js';
import admin from 'firebase-admin';

// Initialize Admin SDK
initAdmin();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Ensure Admin is initialized
  initAdmin();
  if (!admin.apps.length) {
      console.error("Firebase Admin not initialized. Check FIREBASE_ADMIN_CREDENTIALS or FIREBASE_SERVICE_ACCOUNT env var.");
      return res.status(500).json({ error: "Server configuration error: Firebase Admin not initialized" });
  }

  const { residencyId, title, body } = req.body;

  if (!residencyId || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    console.log(`Starting broadcast for residency: ${residencyId}`);

    // 1. Fetch all residents with an fcmToken
    const residentsRef = db().collection('residencies').doc(residencyId).collection('residents');
    // We only want docs that HAVE an fcmToken
    const snapshot = await residentsRef.where('fcmToken', '!=', null).get();

    if (snapshot.empty) {
      console.log('No residents found with tokens.');
      return res.status(200).json({ success: true, sentCount: 0, message: 'No residents have enabled notifications.' });
    }

    // 2. Collect tokens and map them to doc IDs (for cleanup)
    const tokens = [];
    const tokenToDocId = {};

    snapshot.forEach(doc => {
      const data = doc.data();
      if (data.fcmToken) {
        tokens.push(data.fcmToken);
        tokenToDocId[data.fcmToken] = doc.id;
      }
    });

    if (tokens.length === 0) {
      return res.status(200).json({ success: true, sentCount: 0, message: 'No valid tokens found.' });
    }

    // 3. Prepare payload
    const payload = {
      notification: {
        title: title,
        body: body,
      },
      data: {
        type: 'admin-broadcast',
        click_action: '/',
        timestamp: Date.now().toString(),
      },
      tokens: tokens, // Multicast to all
    };

    // 4. Send Multicast
    const response = await admin.messaging().sendEachForMulticast(payload);

    console.log(`Broadcast sent: ${response.successCount} success, ${response.failureCount} failed.`);

    // 5. Cleanup Invalid Tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          const failedToken = tokens[idx];
          failedTokens.push(failedToken);
        }
      });

      if (failedTokens.length > 0) {
        console.log(`Removing ${failedTokens.length} invalid tokens...`);
        
        const batch = db().batch();
        let batchCount = 0;

        failedTokens.forEach(token => {
            const docId = tokenToDocId[token];
            if (docId) {
                const docRef = residentsRef.doc(docId);
                // Remove the fcmToken field
                batch.update(docRef, {
                    fcmToken: admin.firestore.FieldValue.delete(),
                    fcmUpdatedAt: admin.firestore.FieldValue.delete() // Optional: cleanup timestamp too
                });
                batchCount++;
            }
        });

        if (batchCount > 0) {
            await batch.commit();
            console.log('Invalid tokens removed.');
        }
      }
    }

    return res.status(200).json({ success: true, sentCount: response.successCount, failureCount: response.failureCount });

  } catch (error) {
    console.error('Error in broadcastNotification:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
