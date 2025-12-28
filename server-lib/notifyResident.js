import { db } from './firebaseAdmin.js';
import { sendPushNotification } from './notificationService.js';

function normalizeBlockName(name) {
    if (!name) return "";
    const n = String(name).trim().toUpperCase();
    // If it's just a letter "A", return "BLOCK A"
    if (/^[A-Z]$/.test(n)) return `BLOCK ${n}`;
    // If it's "BLOCK A", return "BLOCK A"
    return n;
}

export default async function handler(req, res) {
  // DEPRECATED: This endpoint is deprecated in favor of /api/sendNotification
  // Keeping for backward compatibility but redirecting to new endpoint
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { residencyId, flatId, visitorName, visitorId } = req.body;

  if (!residencyId || !flatId || !visitorName || !visitorId) {
    console.error('Missing required fields for notification:', { residencyId, flatId, visitorName, visitorId });
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log('DEPRECATED: notifyResident called, redirecting to sendNotification');
  
  // Redirect to new unified endpoint
  try {
    const response = await fetch('/api/sendNotification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residencyId,
        title: 'New Visitor Request',
        body: `${visitorName} is requesting entry to visit. Please approve or reject.`,
        targetType: 'specific_flat',
        targetId: flatId,
        data: {
          type: 'visitor_request',
          actionType: 'visitor_request',
          requestId: visitorId,
          visitorName: visitorName,
          flatId: flatId
        }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      return res.status(200).json({ success: true, notifications: [{ result }] });
    } else {
      throw new Error('Unified notification failed');
    }
  } catch (error) {
    console.error('Error redirecting to sendNotification:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
