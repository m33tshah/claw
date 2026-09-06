/**
 * MESNIUM ACTION DESCRIBER (PHASE 2 INTEGRATION)
 * 
 * Generates deterministic, human-readable plain-language descriptions of consequential
 * actions requiring operator approval in the Mesnium Action Gatekeeper.
 * 
 * Answers clearly:
 * - WHAT is going to happen
 * - WHO / WHAT it affects
 * - WHEN it will happen
 * - WHY / WHAT the operator is confirming
 * 
 * CRITICAL SECURITY INVARIANT:
 * This module is DISPLAY DATA ONLY. It never modifies, weakens, or participates in
 * cryptographic SHA-256 payload integrity hashing.
 * 
 * It is completely deterministic, synchronous, side-effect free, and requires zero LLM calls.
 */

import path from 'node:path';

const SENSITIVE_KEY_REGEX = /(key|token|secret|password|credential|auth|hash|nonce|checksum|bearer)/i;

/**
 * Format an ISO or natural date string into human-readable English.
 * Fallback to raw string if unparseable.
 */
export function formatDateTime(isoString) {
  if (!isoString || typeof isoString !== 'string') return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) {
    return isoString.trim();
  }
  try {
    const datePart = d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
    const timePart = d.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    });
    return `${datePart} at ${timePart}`;
  } catch (_) {
    return isoString;
  }
}

/**
 * Calculates human duration between two date strings (e.g. "30 minutes", "1 hour").
 */
export function formatDuration(startIso, endIso) {
  if (!startIso || !endIso) return '';
  const d1 = new Date(startIso);
  const d2 = new Date(endIso);
  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '';
  const diffMs = d2.getTime() - d1.getTime();
  if (diffMs <= 0) return '';
  const diffMins = Math.round(diffMs / 60000);
  if (diffMins < 60) {
    return `${diffMins} minute${diffMins === 1 ? '' : 's'}`;
  }
  const hours = Math.floor(diffMins / 60);
  const remainingMins = diffMins % 60;
  if (remainingMins === 0) {
    return `${hours} hour${hours === 1 ? '' : 's'}`;
  }
  return `${hours}h ${remainingMins}m`;
}

/**
 * Sanitize file paths so internal filesystem directories (e.g. C:\Users\...)
 * are not leaked to UI display cards.
 */
export function sanitizeFilePath(filePath) {
  if (!filePath || typeof filePath !== 'string') return '';
  const normalized = filePath.replace(/\\/g, '/');
  // Check if it is inside user home or contains sensitive segments
  const baseName = path.basename(filePath);
  if (normalized.includes('/.openclaw/') || normalized.includes('/AppData/') || normalized.includes('/Users/')) {
    return `[File: ${baseName}]`;
  }
  return baseName || filePath;
}

/**
 * Truncate long text strings with ellipses.
 */
function truncate(text, maxLen = 140) {
  if (!text || typeof text !== 'string') return '';
  const clean = text.trim().replace(/\s+/g, ' ');
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1) + '…';
}

/**
 * Main deterministic describer function.
 * 
 * @param {string} actionType - Canonical action type (e.g. 'calendar.create', 'email.send', etc.)
 * @param {object} payload - Authoritative action payload arguments
 * @param {object} meta - Context metadata (agentName, title, target)
 * @returns {object} Structured display description
 */
export function describeAction(actionType, payload = {}, meta = {}) {
  const safePayload = (payload && typeof payload === 'object') ? payload : {};
  const safeMeta = (meta && typeof meta === 'object') ? meta : {};
  const agentName = safeMeta.agentName || 'Mesnium Agent';
  const rawType = String(actionType || '').toLowerCase();

  // ─── 1. CALENDAR FAMILY ───────────────────────────────────────────────────
  if (
    rawType === 'calendar.create' ||
    rawType === 'calendar_create_event' ||
    rawType === 'google.calendar.create'
  ) {
    const summary = safePayload.summary || safePayload.title || 'Appointment';
    const startFormatted = formatDateTime(safePayload.start || safePayload.startTime);
    const duration = formatDuration(
      safePayload.start || safePayload.startTime,
      safePayload.end || safePayload.endTime
    );
    const attendee = safePayload.attendee || safePayload.attendees || safePayload.email || '';
    const location = safePayload.location || '';
    const notes = safePayload.description ? truncate(safePayload.description, 120) : '';

    const details = [
      { label: 'Event', value: summary }
    ];
    if (startFormatted) {
      details.push({ label: 'When', value: startFormatted });
    }
    if (duration) {
      details.push({ label: 'Duration', value: duration });
    }
    if (attendee) {
      const attendeeVal = Array.isArray(attendee) ? attendee.join(', ') : String(attendee);
      details.push({ label: 'With', value: attendeeVal });
    }
    if (location) {
      details.push({ label: 'Location', value: location });
    }
    if (notes) {
      details.push({ label: 'Notes', value: notes });
    }
    if (agentName) {
      details.push({ label: 'Requested by', value: agentName });
    }

    const shortWhen = startFormatted ? ` on ${startFormatted}` : '';
    const shortWith = attendee ? ` with ${Array.isArray(attendee) ? attendee[0] : attendee}` : '';

    return {
      category: 'calendar',
      actionVerb: 'Book Appointment',
      riskBadge: 'Calendar Mutation',
      title: 'Book a calendar appointment',
      summary: `Schedule "${summary}"${shortWhen}${shortWith}`,
      details
    };
  }

  if (
    rawType === 'calendar.update' ||
    rawType === 'calendar_update_event'
  ) {
    const eventId = safePayload.eventId || safePayload.id || safeMeta.target || 'Selected Event';
    const summary = safePayload.summary || 'Updated Meeting';
    const startFormatted = formatDateTime(safePayload.start || safePayload.startTime);

    const details = [
      { label: 'Event', value: summary },
      { label: 'Event ID', value: String(eventId) }
    ];
    if (startFormatted) {
      details.push({ label: 'New Time', value: startFormatted });
    }
    if (agentName) {
      details.push({ label: 'Requested by', value: agentName });
    }

    return {
      category: 'calendar',
      actionVerb: 'Update Appointment',
      riskBadge: 'Calendar Mutation',
      title: 'Update calendar appointment',
      summary: `Modify appointment details for "${summary}"`,
      details
    };
  }

  if (
    rawType === 'calendar.delete' ||
    rawType === 'calendar_delete_event'
  ) {
    const eventId = safePayload.eventId || safePayload.id || safePayload.summary || safeMeta.target || 'Appointment';
    const details = [
      { label: 'Event to Cancel', value: String(eventId) },
      { label: 'Requested by', value: agentName }
    ];

    return {
      category: 'calendar',
      actionVerb: 'Cancel Appointment',
      riskBadge: 'Calendar Deletion',
      title: 'Cancel calendar appointment',
      summary: `Remove appointment "${eventId}" from your calendar`,
      details
    };
  }

  // ─── 2. EMAIL FAMILY ──────────────────────────────────────────────────────
  if (
    rawType === 'email.send' ||
    rawType === 'gmail_send' ||
    rawType === 'gmail.send'
  ) {
    const to = safePayload.to || safePayload.recipient || safePayload.email || '';
    const toVal = Array.isArray(to) ? to.join(', ') : String(to || 'Recipient');
    const subject = safePayload.subject || '(No subject)';
    const bodyPreview = safePayload.body ? truncate(safePayload.body, 140) : '';
    const attachments = Array.isArray(safePayload.attachments)
      ? safePayload.attachments.map(a => (typeof a === 'string' ? path.basename(a) : a.name || 'Attachment')).join(', ')
      : '';

    const details = [
      { label: 'To', value: toVal },
      { label: 'Subject', value: subject }
    ];
    if (safePayload.cc) {
      details.push({ label: 'CC', value: Array.isArray(safePayload.cc) ? safePayload.cc.join(', ') : String(safePayload.cc) });
    }
    if (bodyPreview) {
      details.push({ label: 'Message Preview', value: bodyPreview });
    }
    if (attachments) {
      details.push({ label: 'Attachments', value: attachments });
    }
    if (agentName) {
      details.push({ label: 'Requested by', value: agentName });
    }

    return {
      category: 'email',
      actionVerb: 'Send Email',
      riskBadge: 'Outbound Email',
      title: 'Send an external email',
      summary: `Send email to ${toVal} regarding "${subject}"`,
      details
    };
  }

  if (
    rawType === 'email.draft' ||
    rawType === 'gmail_draft'
  ) {
    const to = safePayload.to || 'Recipient';
    const subject = safePayload.subject || '(No subject)';
    const details = [
      { label: 'To', value: String(to) },
      { label: 'Subject', value: subject },
      { label: 'Requested by', value: agentName }
    ];

    return {
      category: 'email',
      actionVerb: 'Create Draft',
      riskBadge: 'Email Draft',
      title: 'Create an email draft',
      summary: `Draft email to ${to} with subject "${subject}"`,
      details
    };
  }

  if (
    rawType === 'gmail_reply' ||
    rawType === 'email.reply'
  ) {
    const to = safePayload.to || 'Sender';
    const subject = safePayload.subject || 'Reply';
    return {
      category: 'email',
      actionVerb: 'Send Reply',
      riskBadge: 'Outbound Email',
      title: 'Send an email reply',
      summary: `Reply to ${to} regarding "${subject}"`,
      details: [
        { label: 'To', value: String(to) },
        { label: 'Subject', value: subject },
        { label: 'Requested by', value: agentName }
      ]
    };
  }

  if (
    rawType === 'gmail_trash' ||
    rawType === 'email.trash'
  ) {
    const messageId = safePayload.messageId || safePayload.id || 'Selected Email';
    return {
      category: 'email',
      actionVerb: 'Trash Email',
      riskBadge: 'Email Deletion',
      title: 'Move email to trash',
      summary: `Move email message "${messageId}" to trash`,
      details: [
        { label: 'Message ID', value: String(messageId) },
        { label: 'Requested by', value: agentName }
      ]
    };
  }

  // ─── 3. GOOGLE DRIVE FAMILY ───────────────────────────────────────────────
  if (
    rawType === 'google.drive.upload' ||
    rawType === 'google_drive_upload' ||
    rawType === 'drive_upload'
  ) {
    const fileName = sanitizeFilePath(safePayload.name || safePayload.filename || 'Document');
    const folder = safePayload.folder || 'Google Drive Root';
    const details = [
      { label: 'File', value: fileName },
      { label: 'Destination', value: folder }
    ];
    if (safePayload.content && typeof safePayload.content === 'string') {
      const sizeBytes = Buffer.byteLength(safePayload.content, 'utf8');
      details.push({ label: 'Size', value: `${(sizeBytes / 1024).toFixed(1)} KB` });
    }
    details.push({ label: 'Requested by', value: agentName });

    return {
      category: 'drive',
      actionVerb: 'Upload File',
      riskBadge: 'Cloud Storage',
      title: 'Upload file to Google Drive',
      summary: `Upload "${fileName}" to ${folder}`,
      details
    };
  }

  if (
    rawType === 'google_drive_delete' ||
    rawType === 'drive_delete'
  ) {
    const targetFile = sanitizeFilePath(safePayload.name || safePayload.fileId || safeMeta.target || 'File');
    return {
      category: 'drive',
      actionVerb: 'Delete File',
      riskBadge: 'Cloud Deletion',
      title: 'Delete file from Google Drive',
      summary: `Permanently delete "${targetFile}" from Google Drive`,
      details: [
        { label: 'File to Delete', value: targetFile },
        { label: 'Requested by', value: agentName }
      ]
    };
  }

  // ─── 4. FILESYSTEM FAMILY ─────────────────────────────────────────────────
  if (
    rawType === 'filesystem.organize' ||
    rawType === 'local_filesystem'
  ) {
    const folder = sanitizeFilePath(safePayload.folder || 'Desktop');
    const action = safePayload.action || 'organize';
    const details = [
      { label: 'Target Folder', value: folder },
      { label: 'Operation', value: action === 'execute_organization' ? 'File Reorganization & Archiving' : action },
      { label: 'Requested by', value: agentName }
    ];

    return {
      category: 'filesystem',
      actionVerb: 'Organize Files',
      riskBadge: 'Local System',
      title: 'Organize local files',
      summary: `Execute file reorganization on ${folder}`,
      details
    };
  }

  // ─── 5. WHATSAPP & MESSAGING FAMILY (AURA COMPATIBILITY) ──────────────────
  if (
    rawType === 'whatsapp' ||
    rawType === 'whatsapp.send'
  ) {
    const to = safePayload.to || safePayload.recipient || 'Customer';
    const text = safePayload.message ? truncate(safePayload.message, 120) : '';
    const details = [
      { label: 'To', value: String(to) }
    ];
    if (text) {
      details.push({ label: 'Message Preview', value: text });
    }
    details.push({ label: 'Requested by', value: agentName });

    return {
      category: 'messaging',
      actionVerb: 'Send WhatsApp',
      riskBadge: 'External Message',
      title: 'Send a WhatsApp message',
      summary: `Send customer message to ${to}`,
      details
    };
  }

  // ─── 6. UNKNOWN / GENERIC CONTEXT FALLBACK ────────────────────────────────
  // Safe fallback that never leaks internal object dumps or crashes
  const fallbackTitle = safeMeta.title || 'Action requires approval';
  const fallbackDetails = [];

  // Filter safe primitive payload properties (no secrets, no internal IDs)
  for (const [key, val] of Object.entries(safePayload)) {
    if (SENSITIVE_KEY_REGEX.test(key)) continue;
    if (val === null || val === undefined) continue;
    if (typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean') {
      const label = key.charAt(0).toUpperCase() + key.slice(1).replace(/_/g, ' ');
      fallbackDetails.push({
        label,
        value: typeof val === 'string' ? truncate(val, 80) : String(val)
      });
      if (fallbackDetails.length >= 4) break;
    }
  }

  if (safeMeta.target) {
    fallbackDetails.unshift({ label: 'Target', value: truncate(String(safeMeta.target), 60) });
  }
  fallbackDetails.push({ label: 'Requested by', value: agentName });

  return {
    category: 'system',
    actionVerb: 'Confirm Action',
    riskBadge: 'Consequential Action',
    title: fallbackTitle,
    summary: safeMeta.description || `A Mesnium action is requesting your approval.`,
    details: fallbackDetails
  };
}
