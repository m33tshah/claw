/**
 * MESNIUM INTEGRATION & IDENTITY LAYER — TYPES & SCHEMAS (PHASE 9)
 * 
 * Defines the Mesnium Identity and Provider-agnostic Integration data models:
 * User -> Workspace -> Connected Accounts -> Providers -> Permissions & Capabilities
 */

export const IntegrationProvider = {
  GOOGLE: 'google',
  MICROSOFT: 'microsoft',
  SLACK: 'slack',
  NOTION: 'notion'
};

export const IntegrationStatus = {
  CONNECTED: 'connected',
  CONNECTING: 'connecting',
  DISCONNECTED: 'disconnected',
  NEEDS_REAUTH: 'needs_reauth',
  ERROR: 'error'
};

export const PermissionLevel = {
  NONE: 'none',
  READ: 'read',
  DRAFT: 'draft',
  WRITE: 'write'
};

export const GoogleServiceType = {
  DRIVE: 'drive',
  GMAIL: 'gmail',
  CALENDAR: 'calendar',
  SHEETS: 'sheets',
  DOCS: 'docs'
};
