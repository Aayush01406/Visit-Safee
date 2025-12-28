import { initAdmin, db } from './firebaseAdmin.js';

initAdmin();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { visitorId, token, action, residentId } = req.body;

    if (!visitorId || !token || !action || !residentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
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
        error: `Request already ${requestData.status}`,
        status: requestData.status
      });
    }

    // Validate resident exists and has access to this flat
    const residentDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('residents').doc(residentId).get();
    
    if (!residentDoc.exists) {
      return res.status(403).json({ error: 'Resident not found' });
    }

    const residentData = residentDoc.data();
    
    // Validate flat access
    let hasAccess = false;
    if (residentData.flatId === requestData.flatId) {
      hasAccess = true;
    } else {
      // Check legacy block/flat matching
      try {
        const flatDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('flats').doc(requestData.flatId).get();
        if (flatDoc.exists) {
          const flatData = flatDoc.data();
          if (flatData.blockId) {
            const blockDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('blocks').doc(flatData.blockId).get();
            if (blockDoc.exists) {
              const blockName = blockDoc.data().name;
              if (residentData.flat === String(flatData.number) && 
                  (residentData.block === blockName || residentData.block === `BLOCK ${blockName}`)) {
                hasAccess = true;
              }
            }
          }
        }
      } catch (error) {
        console.error('Error validating flat access:', error);
      }
    }

    if (!hasAccess) {
      return res.status(403).json({ error: 'Access denied - not authorized for this flat' });
    }

    // Update visitor status
    const requestRef = firestore.collection('residencies').doc(targetResidencyId).collection('visitor_requests').doc(visitorId);
    
    const updateData = {
      status: action === 'approve' ? 'approved' : 'rejected',
      updatedAt: new Date().toISOString(),
      actionBy: residentId
    };

    if (action === 'approve') {
      updateData.approvedBy = residentId;
      updateData.approvedAt = new Date().toISOString();
    } else {
      updateData.rejectedBy = residentId;
      updateData.rejectedAt = new Date().toISOString();
    }

    await requestRef.update(updateData);

    console.log(`Visitor ${visitorId} ${action}d by resident ${residentId}`);

    return res.status(200).json({ 
      success: true, 
      message: action === 'approve' ? 'Visitor approved - Access granted' : 'Visitor rejected - Access denied',
      status: updateData.status
    });

  } catch (error) {
    console.error('Error processing visitor decision:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}