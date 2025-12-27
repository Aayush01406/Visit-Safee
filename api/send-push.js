const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount)
    });
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
  }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  if (!admin.apps.length) {
    return res.status(500).json({ error: 'Server configuration missing' });
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

    // Send multicast message with action buttons
    const message = {
      notification: {
        title: title || 'New Visitor Request',
        body: body || 'You have a new visitor request.',
      },
      data: {
        ...data,
        requestId: data?.requestId || '',
        visitorName: data?.visitorName || '',
        flatId: String(flatId)
      },
      tokens: tokens,
      android: {
        priority: 'high',
        notification: {
          priority: 'max',
          channelId: 'visitor_requests',
          defaultSound: true,
          visibility: 'public',
          actions: [
            { action: 'APPROVE', title: 'Approve' },
            { action: 'REJECT', title: 'Reject' }
          ]
        }
      },
      webpush: {
        headers: {
          Urgency: 'high'
        },
        notification: {
          actions: [
            { action: 'APPROVE', title: 'Approve' },
            { action: 'REJECT', title: 'Reject' }
          ]
        },
        fcmOptions: {
          link: '/'
        }
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    return res.status(200).json({ 
      success: true, 
      sent: response.successCount, 
      failed: response.failureCount 
    });

  } catch (error) {
    console.error('Error sending push:', error);
    return res.status(500).json({ error: error.message });
  }
}