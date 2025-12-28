import { initAdmin, db } from './firebaseAdmin.js';

initAdmin();

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { visitorId, token } = req.query;

    if (!visitorId || !token) {
      return res.status(400).json({ error: 'Missing visitorId or token' });
    }

    const firestore = db();

    // Find visitor request across all residencies
    let targetResidencyId = null;
    let requestData = null;
    
    const residenciesSnap = await firestore.collection('residencies').get();
    for (const residencyDoc of residenciesSnap.docs) {
      const requestRef = residencyDoc.ref.collection('visitor_requests').doc(visitorId);
      const requestSnap = await requestRef.get();
      if (requestSnap.exists) {
        targetResidencyId = residencyDoc.id;
        requestData = requestSnap.data();
        break;
      }
    }

    if (!targetResidencyId || !requestData) {
      return res.status(404).json({ error: 'Visitor request not found' });
    }

    // Validate token
    if (requestData.approvalToken !== token) {
      return res.status(403).json({ error: 'Invalid approval token' });
    }

    // Check if already processed
    if (requestData.status !== 'pending') {
      return res.status(400).json({ 
        error: 'Request already processed',
        status: requestData.status
      });
    }

    // Get flat and block details
    let flatDetails = null;
    let blockDetails = null;
    
    try {
      const flatDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('flats').doc(requestData.flatId).get();
      if (flatDoc.exists) {
        flatDetails = flatDoc.data();
        if (flatDetails.blockId) {
          const blockDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('blocks').doc(flatDetails.blockId).get();
          if (blockDoc.exists) {
            blockDetails = blockDoc.data();
          }
        }
      }
    } catch (error) {
      console.error('Error fetching flat/block details:', error);
    }

    const visitorDetails = {
      id: visitorId,
      visitorName: requestData.visitorName,
      visitorPhone: requestData.visitorPhone,
      purpose: requestData.purpose,
      vehicleNumber: requestData.vehicleNumber,
      blockName: blockDetails?.name || 'Unknown Block',
      flatNumber: flatDetails?.number || 'Unknown Flat',
      status: requestData.status,
      createdAt: requestData.createdAt
    };

    return res.status(200).json({ 
      success: true, 
      visitor: visitorDetails
    });

  } catch (error) {
    console.error('Error fetching visitor details:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}