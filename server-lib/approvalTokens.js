import crypto from 'crypto';

export function generateApprovalToken() {
  return crypto.randomUUID();
}

export function createApprovalUrl(visitorId, token, action) {
  const baseUrl = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000';
  return `${baseUrl}/resident/decision?visitorId=${visitorId}&token=${token}&action=${action}`;
}