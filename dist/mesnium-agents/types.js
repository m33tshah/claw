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
  RESEARCH: 'Research',
  SALES: 'Sales',
  OPERATIONS: 'Operations',
  EXECUTIVE: 'Executive',
  FINANCE: 'Finance',
  SUPPORT: 'Support',
  GENERAL: 'General'
};

export const AgentCapability = {
  KNOWLEDGE_SEARCH: 'knowledge.search',
  GOOGLE_DRIVE_READ: 'google.drive.read',
  GMAIL_READ: 'google.gmail.read',
  CALENDAR_READ: 'google.calendar.read',
  WEB_RESEARCH: 'web.research',
  EMAIL_DRAFT: 'email.draft',
  CALENDAR_DRAFT: 'calendar.draft'
};

export const CapabilityToolMapping = {
  [AgentCapability.KNOWLEDGE_SEARCH]: 'knowledge_search',
  [AgentCapability.GOOGLE_DRIVE_READ]: 'google_drive_search',
  [AgentCapability.GMAIL_READ]: 'gmail_search',
  [AgentCapability.CALENDAR_READ]: 'calendar_agenda'
};

export const CapabilityDescriptions = {
  [AgentCapability.KNOWLEDGE_SEARCH]: 'Search workspace documents, spreadsheets, slides, and reports for grounded facts.',
  [AgentCapability.GOOGLE_DRIVE_READ]: 'Read and search indexed Google Drive files and documents.',
  [AgentCapability.GMAIL_READ]: 'Search recent emails and messages for context.',
  [AgentCapability.CALENDAR_READ]: 'View upcoming meetings, events, and agenda schedules.',
  [AgentCapability.WEB_RESEARCH]: 'Perform live online research for market intelligence.',
  [AgentCapability.EMAIL_DRAFT]: 'Draft email responses (Requires human approval before sending).',
  [AgentCapability.CALENDAR_DRAFT]: 'Draft calendar invites and meetings (Requires human approval before creating).'
};

export const PermissionMode = {
  READ: 'read',         // Safe read-only knowledge and API retrieval
  PROPOSE: 'propose',   // Can draft actions for human review
  EXECUTE: 'execute'    // Deterministic or approved operations
};
