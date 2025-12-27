import admin from 'firebase-admin';

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(
      JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
    ),
  });
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const { residencyId, flatId, title, body, data } = req.body;

    if (!residencyId || !flatId) {
      return res.status(400).json({ error: 'Missing residencyId or flatId' });
    }

    const db = admin.firestore();
    
    // Find residents in the flat
    const residentsRef = db.collection('residencies').doc(residencyId).collection('residents');
    const snapshot = await residentsRef.where('flatId', '==', flatId).get();

    const tokens = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    // Also get admin token
    const residencyDoc = await db.collection('residencies').doc(residencyId).get();
    if (residencyDoc.exists) {
      const rData = residencyDoc.data();
      if (rData.adminFcmToken) {
        tokens.push(rData.adminFcmToken);
      }
    }

    if (tokens.length === 0) {
      return res.status(200).json({ message: 'No registered devices found' });
    }

    // Send to each token
    const promises = tokens.map(token => 
      admin.messaging().send({
        token,
        notification: {
          title: title || 'New Visitor Request',
          body: body || 'You have a new visitor request.'
        },
        data: {
          ...data,
          requestId: data?.requestId || '',
          visitorName: data?.visitorName || '',
          flatId: String(flatId)
        },
        webpush: {
          notification: {
            requireInteraction: true,
            actions: [
              { action: 'APPROVE', title: 'Approve' },
              { action: 'REJECT', title: 'Reject' }
            ]
          }
        }
      })
    );

    const results = await Promise.allSettled(promises);
    const successful = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    
    return res.status(200).json({ 
      success: true, 
      sent: successful, 
      failed: failed 
    });

  } catch (error) {
    console.error('Error sending push:', error);
    return res.status(500).json({ error: error.message });
  }
}