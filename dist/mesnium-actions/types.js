/**
 * MESNIUM ACTION GATEKEEPER TYPES & SCHEMAS (PHASE 12)
 * 
 * Defines the product-level data model for human-in-the-loop action proposals,
 * deterministic risk classification, approval statuses, and cryptographic integrity.
 */

import crypto from 'node:crypto';

export const ActionType = {
  KNOWLEDGE_SEARCH: 'knowledge.search',
  GOOGLE_DRIVE_READ: 'google.drive.read',
  GMAIL_READ: 'google.gmail.read',
  CALENDAR_READ: 'google.calendar.read',
  EMAIL_DRAFT: 'email.draft',
  EMAIL_SEND: 'email.send',
  CALENDAR_DRAFT: 'calendar.draft',
  CALENDAR_CREATE: 'calendar.create',
  CALENDAR_UPDATE: 'calendar.update',
  CALENDAR_DELETE: 'calendar.delete',
  FILESYSTEM_ORGANIZE: 'filesystem.organize'
};

export const RiskLevel = {
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high'
};

export const ActionStatus = {
  PENDING_APPROVAL: 'pending_approval',
  APPROVED: 'approved',
  REJECTED: 'rejected',
  EXECUTING: 'executing',
  COMPLETED: 'completed',
  FAILED: 'failed',
  EXPIRED: 'expired',
  CANCELLED: 'cancelled'
};

/**
 * Computes a deterministic SHA-256 hash of a payload object.
 * Used for cryptographic approval integrity (tamper-proofing).
 */
export function computePayloadHash(payload) {
  if (!payload) return '';
  const serialized = typeof payload === 'string' ? payload : JSON.stringify(payload, Object.keys(payload).sort());
  return crypto.createHash('sha256').update(serialized).digest('hex');
}
