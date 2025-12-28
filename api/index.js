
import createOwner from '../server-lib/createOwner.js';
import broadcastNotification from '../server-lib/broadcastNotification.js';
import deleteResidency from '../server-lib/deleteResidency.js';
import importResidents from '../server-lib/importResidents.js';
import ownerLogin from '../server-lib/ownerLogin.js';
import ownerResidencies from '../server-lib/ownerResidencies.js';
import registerResidency from '../server-lib/registerResidency.js';
import notifyResident from '../server-lib/notifyResident.js';
import residencyStatus from '../server-lib/residencyStatus.js';
import toggleService from '../server-lib/toggleService.js';
import updateRequestStatus from '../server-lib/update-request-status.js';
import uploadResidentsFromPDF from '../server-lib/uploadResidentsFromPDF.js';
import sendNotification from '../server-lib/sendNotification.js';
import visitorDetails from '../server-lib/visitorDetails.js';
import visitorDecision from '../server-lib/visitorDecision.js';
import visitorAction from '../server-lib/visitor-action.js';

const handlers = {
  createOwner,
  'broadcast-notification': broadcastNotification,
  deleteResidency,
  importResidents,
  'notify-resident': notifyResident,
  ownerLogin,
  ownerResidencies,
  registerResidency,
  residencyStatus,
  toggleService,
  'update-request-status': updateRequestStatus,
  uploadResidentsFromPDF,
  sendNotification,
  'visitor-details': visitorDetails,
  'visitor-decision': visitorDecision,
  'visitor-action': visitorAction,
};

export default async function handler(req, res) {
  // Parse the route from the URL
  // Expected format: /api/<route_name>?...
  const url = new URL(req.url, `http://${req.headers.host}`);
  const pathname = url.pathname;
  
  // Extract the last segment of the path as the route name
  // e.g. /api/createOwner -> createOwner
  // e.g. /api/update-request-status -> update-request-status
  let route = pathname.split('/').pop();
  
  // Handle case where URL might be just /api (though vercel.json rewrites /api/(.*))
  if (!route || route === 'api') {
      return res.status(404).json({ error: 'API route not specified' });
  }

  // Check if handler exists
  const handlerFn = handlers[route];
  
  if (handlerFn) {
    try {
      return await handlerFn(req, res);
    } catch (err) {
      console.error(`API Handler Error (${route}):`, err);
      return res.status(500).json({ error: 'Internal Server Error', message: err.message });
    }
  } else {
    return res.status(404).json({ error: `Route '${route}' not found` });
  }
}
