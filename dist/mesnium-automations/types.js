/**
 * MESNIUM AUTOMATIONS TYPES & SCHEMAS (PHASE 13)
 * 
 * Defines the product-level data model for Mesnium Automations, Triggers,
 * Conditions, Action Steps, Approval Policies, and Execution Runs.
 */

export const AutomationStatus = {
  ACTIVE: 'active',
  PAUSED: 'paused',
  DRAFT: 'draft',
  ERROR: 'error'
};

export const TriggerType = {
  SCHEDULE: 'schedule',
  EVENT: 'event',
  MANUAL: 'manual'
};

export const ScheduleKind = {
  INTERVAL: 'interval',   // e.g. every 30m, every 1h
  CRON: 'cron',           // e.g. 0 9 * * 1-5
  AT: 'at'                // e.g. one-shot ISO timestamp
};

export const ConditionOperator = {
  EQUALS: 'equals',
  NOT_EQUALS: 'not_equals',
  CONTAINS: 'contains',
  DOES_NOT_CONTAIN: 'does_not_contain',
  GREATER_THAN: 'greater_than',
  LESS_THAN: 'less_than',
  EXISTS: 'exists',
  DOES_NOT_EXIST: 'does_not_exist'
};

export const AutomationApprovalPolicy = {
  NO_APPROVAL: 'no_approval',                 // For safe deterministic actions
  ALWAYS_APPROVE: 'always_approve',           // For external mutating actions
  INHERIT_AGENT_POLICY: 'inherit_agent_policy' // Follow the bound agent's permissions
};

export const ActionStepType = {
  RUN_AGENT: 'run_agent',
  SEARCH_KNOWLEDGE: 'search_knowledge',
  READ_GMAIL: 'read_gmail',
  READ_CALENDAR: 'read_calendar',
  READ_DRIVE: 'read_drive',
  CREATE_REPORT: 'create_report',
  DRAFT_EMAIL: 'draft_email',
  SEND_EMAIL: 'send_email',
  DRAFT_CALENDAR_EVENT: 'draft_calendar_event',
  CREATE_CALENDAR_EVENT: 'create_calendar_event'
};

export const AutomationRunStatus = {
  RUNNING: 'running',
  COMPLETED: 'completed',
  FAILED: 'failed',
  WAITING_APPROVAL: 'waiting_approval',
  SKIPPED: 'skipped'
};
