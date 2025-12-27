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
    const { action, requestId, residencyId } = req.body;

    if (!action || !requestId) {
      return res.status(400).json({ error: 'Missing action or requestId' });
    }

    const status = action === 'approve' ? 'approved' : 'rejected';
    const db = admin.firestore();
    
    // Update visitor request status
    if (residencyId) {
      const docRef = db.collection('residencies').doc(residencyId).collection('visitor_requests').doc(requestId);
      await docRef.update({
        status,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        actionBy: 'notification'
      });
    }

    return res.status(200).json({ success: true, status });
  } catch (error) {
    console.error('Error updating visitor request:', error);
    return res.status(500).json({ error: error.message });
  }
}