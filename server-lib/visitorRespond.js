import { initAdmin, db } from './firebaseAdmin.js';

initAdmin();

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { visitorRequestId, action, residentId, notificationToken } = req.body;

    // Validate required fields
    if (!visitorRequestId || !action || !residentId) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Validate action
    if (!['APPROVE', 'REJECT'].includes(action)) {
      return res.status(400).json({ error: 'Invalid action' });
    }

    const firestore = db();

    // Find the visitor request across all residencies
    let targetResidencyId = null;
    let requestData = null;
    
    const residenciesSnap = await firestore.collection('residencies').get();
    for (const residencyDoc of residenciesSnap.docs) {
      const requestRef = residencyDoc.ref.collection('visitor_requests').doc(visitorRequestId);
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

    // Check if request is still pending
    if (requestData.status !== 'pending') {
      return res.status(400).json({ error: 'Request already processed' });
    }

    // Validate resident authorization - check if resident belongs to the requested flat
    const residentsRef = firestore.collection('residencies').doc(targetResidencyId).collection('residents');
    const residentDoc = await residentsRef.doc(residentId).get();
    
    if (!residentDoc.exists) {
      return res.status(403).json({ error: 'Resident not found' });
    }

    const residentData = residentDoc.data();
    const requestFlatId = requestData.flatId;

    // Validate resident has access to this flat
    let hasAccess = false;
    
    // Check by flatId (primary method)
    if (residentData.flatId === requestFlatId) {
      hasAccess = true;
    } else {
      // Check by block/flat combination (fallback for legacy data)
      try {
        const flatDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('flats').doc(requestFlatId).get();
        if (flatDoc.exists) {
          const flatData = flatDoc.data();
          const flatNumber = String(flatData.number);
          
          if (flatData.blockId) {
            const blockDoc = await firestore.collection('residencies').doc(targetResidencyId).collection('blocks').doc(flatData.blockId).get();
            if (blockDoc.exists) {
              const blockData = blockDoc.data();
              const blockName = blockData.name;
              
              // Check if resident's block/flat matches
              if (residentData.flat === flatNumber && 
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

    // Update visitor request status
    const requestRef = firestore.collection('residencies').doc(targetResidencyId).collection('visitor_requests').doc(visitorRequestId);
    
    const updateData = {
      status: action === 'APPROVE' ? 'approved' : 'rejected',
      updatedAt: new Date().toISOString(),
      actionBy: residentId
    };

    if (action === 'APPROVE') {
      updateData.approvedBy = residentId;
      updateData.approvedAt = new Date().toISOString();
    } else {
      updateData.rejectedBy = residentId;
      updateData.rejectedAt = new Date().toISOString();
    }

    await requestRef.update(updateData);

    console.log(`Visitor request ${visitorRequestId} ${action.toLowerCase()}d by resident ${residentId}`);

    return res.status(200).json({ 
      success: true, 
      message: `Visitor ${action.toLowerCase()}d successfully`,
      status: updateData.status
    });

  } catch (error) {
    console.error('Error in visitor respond:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}