import { initAdmin, db } from './firebaseAdmin.js';
import admin from 'firebase-admin';

// Initialize Admin SDK
initAdmin();

export default async function handler(req, res) {
  // DEPRECATED: This endpoint is deprecated in favor of /api/sendNotification
  // Keeping for backward compatibility but redirecting to new endpoint
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { residencyId, title, body } = req.body;

  if (!residencyId || !title || !body) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  console.log('DEPRECATED: broadcastNotification called, redirecting to sendNotification');
  
  // Redirect to new unified endpoint
  try {
    const response = await fetch('/api/sendNotification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        residencyId,
        title,
        body,
        targetType: 'residents',
        data: {
          type: 'admin-broadcast',
          click_action: '/'
        }
      })
    });
    
    if (response.ok) {
      const result = await response.json();
      return res.status(200).json(result);
    } else {
      throw new Error('Unified notification failed');
    }
  } catch (error) {
    console.error('Error redirecting to sendNotification:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
}
