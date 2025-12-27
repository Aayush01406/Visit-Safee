const admin = require('firebase-admin');

// Initialize Firebase Admin
// NOTE: You must set FIREBASE_SERVICE_ACCOUNT environment variable in Netlify
// The value should be the minified JSON string of your service account key
if (!admin.apps.length) {
  try {
    // Try FIREBASE_SERVICE_ACCOUNT first (Netlify), then FIREBASE_ADMIN_CREDENTIALS (local)
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
    const { residencyId, flatId, title, body, data } = JSON.parse(event.body);

    if (!residencyId || !flatId) {
      return { statusCode: 400, body: 'Missing residencyId or flatId' };
    }

    const db = admin.firestore();
    
    // Find residents in the flat
    // Note: This path must match your Firestore structure
    const residentsRef = db.collection('residencies').doc(residencyId).collection('residents');
    const snapshot = await residentsRef.where('flatId', '==', flatId).get();

    const tokens = [];
    snapshot.forEach(doc => {
      const userData = doc.data();
      if (userData.fcmToken) {
        tokens.push(userData.fcmToken);
      }
    });

    if (tokens.length === 0) {
      console.log(`No tokens found for flat ${flatId} in residency ${residencyId}`);
      return { statusCode: 200, body: JSON.stringify({ message: 'No registered devices found for this flat' }) };
    }

    // Send multicast message
    const message = {
      notification: {
        title: title || 'New Visitor',
        body: body || 'You have a new visitor request.',
      },
      data: data || {},
      tokens: tokens,
    };

    // Add Android specific config for priority
    message.android = {
      priority: 'high',
      notification: {
        priority: 'max',
        channelId: 'visitsafe_visitors', // Ensure this channel exists in app or default
        defaultSound: true,
        visibility: 'public'
      }
    };

    // Add Web Push specific config
    message.webpush = {
      headers: {
        Urgency: 'high'
      },
      fcmOptions: {
        link: data?.url || '/'
      }
    };

    const response = await admin.messaging().sendEachForMulticast(message);
    
    console.log(`${response.successCount} messages were sent successfully`);
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(tokens[idx]);
        }
      });
      console.log('List of tokens that caused failures: ' + failedTokens);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ 
        success: true, 
        sent: response.successCount, 
        failed: response.failureCount 
      })
    };

  } catch (error) {
    console.error('Error sending push:', error);
    return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
  }
};
