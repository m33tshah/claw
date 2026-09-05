/**
 * MESNIUM AGENT TYPES & SCHEMA (PHASE 11)
 * 
 * Defines the product-level data model for Mesnium Agents, Capabilities, Permissions, and Activity.
 */

export const AgentStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DRAFT: 'draft',
  ERROR: 'error'
};

export const AgentRole = {
  RECEPTIONIST: 'Receptionist',
  SALES: 'Sales',
  MARKETING: 'Marketing',
  OPERATIONS: 'Operations',
  EXECUTIVE: 'Executive',
  RESEARCH: 'Research',
  FINANCE: 'Finance',
  SUPPORT: 'Support',
  GENERAL: 'General'
};

/**
 * Normalized Canonical Tool Identifiers
 * Exactly one canonical identifier per underlying tool capability.
 */
export const CanonicalTools = {
  KNOWLEDGE_SEARCH: 'knowledge_search',
  GOOGLE_DRIVE_SEARCH: 'google_drive_search',
  GOOGLE_DRIVE_UPLOAD: 'google_drive_upload',
  GMAIL_SEARCH: 'gmail_search',
  GMAIL_DRAFT: 'gmail_draft',
  GMAIL_SEND: 'gmail_send',
  CALENDAR_AGENDA: 'calendar_agenda',
  CALENDAR_CREATE_EVENT: 'calendar_create_event',
  CALENDAR_DELETE_EVENT: 'calendar_delete_event',
  LOCAL_FILESYSTEM: 'local_filesystem',
  WEB_SEARCH: 'web_search',
  BRIEFING_GENERATE: 'briefing_generate',
  MONITORS_RUN: 'monitors_run',
  AUTOMATIONS_LIST: 'automations_list',
  AUTOMATIONS_RUN: 'automations_run'
};

export const AgentCapability = {
  KNOWLEDGE_SEARCH: 'knowledge.search',
  GOOGLE_DRIVE_READ: 'google.drive.read',
  GOOGLE_DRIVE_WRITE: 'google.drive.write',
  GMAIL_READ: 'google.gmail.read',
  GMAIL_SEND: 'google.gmail.send',
  CALENDAR_READ: 'google.calendar.read',
  CALENDAR_WRITE: 'google.calendar.write',
  WEB_RESEARCH: 'web.research',
  FILESYSTEM_READ: 'filesystem.read',
  FILESYSTEM_ORGANIZE: 'filesystem.organize',
  BRIEFING: 'briefing.view',
  MONITORS: 'monitors.view'
};

export const CapabilityToolMapping = {
  [AgentCapability.KNOWLEDGE_SEARCH]: CanonicalTools.KNOWLEDGE_SEARCH,
  [AgentCapability.GOOGLE_DRIVE_READ]: CanonicalTools.GOOGLE_DRIVE_SEARCH,
  [AgentCapability.GOOGLE_DRIVE_WRITE]: CanonicalTools.GOOGLE_DRIVE_UPLOAD,
  [AgentCapability.GMAIL_READ]: CanonicalTools.GMAIL_SEARCH,
  [AgentCapability.GMAIL_SEND]: CanonicalTools.GMAIL_SEND,
  [AgentCapability.CALENDAR_READ]: CanonicalTools.CALENDAR_AGENDA,
  [AgentCapability.CALENDAR_WRITE]: CanonicalTools.CALENDAR_CREATE_EVENT,
  [AgentCapability.WEB_RESEARCH]: CanonicalTools.WEB_SEARCH,
  [AgentCapability.FILESYSTEM_READ]: CanonicalTools.LOCAL_FILESYSTEM,
  [AgentCapability.FILESYSTEM_ORGANIZE]: CanonicalTools.LOCAL_FILESYSTEM,
  [AgentCapability.BRIEFING]: CanonicalTools.BRIEFING_GENERATE,
  [AgentCapability.MONITORS]: CanonicalTools.MONITORS_RUN,
  // Canonical tool aliases for legacy or alternative tool names
  'calendar_list': CanonicalTools.CALENDAR_AGENDA,
  'file_search': CanonicalTools.LOCAL_FILESYSTEM,
  'file_inspect': CanonicalTools.LOCAL_FILESYSTEM,
  'file_read': CanonicalTools.LOCAL_FILESYSTEM,
  'file_organize_propose': CanonicalTools.LOCAL_FILESYSTEM,
  'file_organize_execute': CanonicalTools.LOCAL_FILESYSTEM,
  'drive_search': CanonicalTools.GOOGLE_DRIVE_SEARCH,
  'drive_upload': CanonicalTools.GOOGLE_DRIVE_UPLOAD,
  'gmail_list': CanonicalTools.GMAIL_SEARCH
};

export const PermissionMode = {
  READ: 'read',         // Safe read-only knowledge and API retrieval
  PROPOSE: 'propose',   // Can draft actions for human review
  EXECUTE: 'execute'    // Deterministic or approved operations
};

