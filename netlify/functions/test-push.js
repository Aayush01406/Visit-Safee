const admin = require('firebase-admin');

// Initialize Firebase Admin
if (!admin.apps.length) {
  try {
    const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT || process.env.FIREBASE_ADMIN_CREDENTIALS;
    if (serviceAccountJson) {
      const serviceAccount = JSON.parse(serviceAccountJson);
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
      });
    } else {
      console.warn('FIREBASE_SERVICE_ACCOUNT env var missing. Push notifications will not be sent.');
    }
  } catch (error) {
    console.error('Firebase Admin initialization failed:', error);
  }
}

exports.handler = async function(event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  // Check if initialized
  if (!admin.apps.length) {
    return { 
      statusCode: 500, 
      body: JSON.stringify({ error: 'Server configuration missing (Firebase Admin)' }) 
    };
  }

  try {
    const { residencyId, flatId } = JSON.parse(event.body);

    if (!residencyId || !flatId) {
      return { statusCode: 400, body: 'Missing residencyId or flatId' };
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
      console.log(`No tokens found for flat ${flatId} in residency ${residencyId}`);
      return { statusCode: 200, body: JSON.stringify({ message: 'No registered devices found for this flat' }) };
    }

    // Send test message
    const message = {
      notification: {
        title: 'Test Notification',
        body: 'This is a test push notification from VisitSafe.',
      },
      data: {
        type: 'test',
        requestId: 'test-' + Date.now(),
        visitorName: 'Test Visitor',
        flatId: String(flatId),
        residencyId: String(residencyId)
      },
      tokens: tokens,
    };

    // Add platform specific configs
    message.android = {
      priority: 'high',
      notification: {
        priority: 'max',
        channelId: 'visitsafe_visitors',
        defaultSound: true,
        visibility: 'public'
      }
    };

    message.webpush = {
      headers: {
        Urgency: 'high'
      },
      fcmOptions: {
        link: '/'
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`${response.successCount} test messages were sent successfully`);
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
          console.error('Failed token:', tokens[idx], resp.error);
        }
      });
      console.log('List of tokens that caused failures: ' + failedTokens);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        sent: response.successCount, 
        failed: response.failureCount,
        totalTokens: tokens.length,
        message: 'Test notification sent successfully'
      })
    };

  } catch (error) {
    console.error('Error sending test push:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};