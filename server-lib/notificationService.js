import { initAdmin, db } from './firebaseAdmin.js';
import admin from 'firebase-admin';

// Initialize Admin SDK
initAdmin();

/**
 * Sends a push notification to a specific user (Resident, Guard, or Admin)
 * 
 * @param {string} residencyId - The ID of the residency
 * @param {string} userId - The username/ID of the target user
 * @param {string} role - 'resident', 'guard', or 'admin'
 * @param {object} notification - { title, body }
 * @param {object} data - Custom data payload
 */
export async function sendPushNotification(residencyId, userId, role, notification, data = {}) {
  try {
    if (!residencyId || !userId || !role) {
      console.error('Missing required parameters for push notification');
      return { success: false, error: 'Missing parameters' };
    }

    let userRef;
    if (role === 'admin') {
      userRef = db().collection('residencies').doc(residencyId);
    } else if (role === 'resident') {
      userRef = db().collection('residencies').doc(residencyId).collection('residents').doc(userId);
    } else if (role === 'guard') {
      userRef = db().collection('residencies').doc(residencyId).collection('guards').doc(userId);
    } else {
      console.error('Invalid role for push notification');
      return { success: false, error: 'Invalid role' };
    }

    const docSnap = await userRef.get();
    if (!docSnap.exists) {
      console.log(`User ${userId} not found for notification`);
      return { success: false, error: 'User not found' };
    }

    const userData = docSnap.data();
    // Support both singular (legacy/prompt) and plural field names just in case
    const tokens = userData.fcmToken || userData.fcmTokens || userData.adminFcmToken || userData.adminFcmTokens || [];

    if (!tokens || tokens.length === 0) {
      console.log(`No FCM tokens found for user ${userId}`);
      return { success: false, error: 'No tokens found' };
    }

    // Ensure tokens is an array
    const tokenArray = Array.isArray(tokens) ? tokens : [tokens];
    
    // Remove duplicates from the token array itself
    const uniqueTokens = [...new Set(tokenArray)];

    const payload = {
      notification: {
        title: notification.title,
        body: notification.body,
      },
      data: {
        ...data,
        click_action: '/', // Open the app on click
        timestamp: Date.now().toString(),
      },
      tokens: uniqueTokens, // Multicast
    };

    if (uniqueTokens.length === 0) return { success: false, skipped: true };

    const response = await admin.messaging().sendMulticast(payload);

    // Cleanup invalid tokens
    if (response.failureCount > 0) {
      const failedTokens = [];
      response.responses.forEach((resp, idx) => {
        if (!resp.success) {
          failedTokens.push(uniqueTokens[idx]);
        }
      });
      
      if (failedTokens.length > 0) {
        console.log('Removing invalid tokens:', failedTokens);
        // We need to remove these from Firestore
        // Note: arrayRemove requires exact match. 
        // If we have mixed field names, we try to update the one we found.
        const fieldName = userData.fcmToken ? 'fcmToken' : 
                          userData.fcmTokens ? 'fcmTokens' : 
                          userData.adminFcmToken ? 'adminFcmToken' : 'adminFcmTokens';
        
        if (fieldName === 'fcmToken' || fieldName === 'adminFcmToken') {
            // Single token field - if it failed, delete the field
            // Note: We only delete if the failed token matches the current one
            // (Since failedTokens could be a list, but for single field, it's just one)
            if (failedTokens.includes(userData[fieldName])) {
                await userRef.update({
                    [fieldName]: admin.firestore.FieldValue.delete()
                });
            }
        } else {
            // Array field
            await userRef.update({
                [fieldName]: admin.firestore.FieldValue.arrayRemove(...failedTokens)
            });
        }
      }
    }

    console.log(`Successfully sent ${response.successCount} notifications`);
    return { success: true, sentCount: response.successCount };

  } catch (error) {
    console.error('Error sending push notification:', error);
    return { success: false, error: error.message };
  }
}
