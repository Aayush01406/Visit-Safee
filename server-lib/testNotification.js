import { initAdmin, db } from './firebaseAdmin.js';

initAdmin();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { requestId } = req.query;
    
    if (!requestId) {
      return res.status(400).json({ error: 'Missing requestId parameter' });
    }

    // Find the request across all residencies
    let targetResidencyId = null;
    let requestData = null;
    
    const residenciesSnap = await db().collection('residencies').get();
    for (const residencyDoc of residenciesSnap.docs) {
      const requestRef = residencyDoc.ref.collection('visitor_requests').doc(requestId);
      const requestSnap = await requestRef.get();
      if (requestSnap.exists) {
        targetResidencyId = residencyDoc.id;
        requestData = { id: requestSnap.id, ...requestSnap.data() };
        break;
      }
    }

    if (!requestData) {
      return res.status(404).json({ error: 'Request not found' });
    }

    // Get flat and block details
    let flatDetails = null;
    let blockDetails = null;
    
    if (requestData.flatId) {
      try {
        const flatDoc = await db().collection('residencies').doc(targetResidencyId).collection('flats').doc(requestData.flatId).get();
        if (flatDoc.exists) {
          flatDetails = flatDoc.data();
          if (flatDetails.blockId) {
            const blockDoc = await db().collection('residencies').doc(targetResidencyId).collection('blocks').doc(flatDetails.blockId).get();
            if (blockDoc.exists) {
              blockDetails = blockDoc.data();
            }
          }
        }
      } catch (error) {
        console.error('Error fetching details:', error);
      }
    }

    return res.status(200).json({
      success: true,
      request: requestData,
      flat: flatDetails,
      block: blockDetails,
      residencyId: targetResidencyId,
      testResults: {
        hasNotificationSent: !!requestData.notificationSent,
        status: requestData.status,
        hasApprovalData: !!(requestData.approvedBy || requestData.rejectedBy),
        timestamp: new Date().toISOString()
      }
    });

  } catch (error) {
    console.error('Error in test endpoint:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}