/**
 * MESNIUM WORKFLOW ENGINE — TYPES & SCHEMAS (PHASE 4)
 * 
 * Defines the canonical status states, step types, trigger types,
 * and contract schemas for durable business workflows and execution runs.
 */

export const WorkflowStatus = Object.freeze({
  DRAFT: 'draft',
  ACTIVE: 'active',
  PAUSED: 'paused'
});

export const WorkflowRunStatus = Object.freeze({
  RUNNING: 'running',
  WAITING_FOR_APPROVAL: 'waiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const WorkflowStepType = Object.freeze({
  AGENT: 'agent',
  ACTION: 'action',
  TOOL: 'tool',
  CONDITION: 'condition',
  APPROVAL: 'approval',
  DELAY: 'delay',
  WAIT: 'wait',
  NOTIFICATION: 'notification',
  RESULT: 'result'
});

export const TriggerType = Object.freeze({
  MANUAL: 'manual',
  SCHEDULE: 'schedule',
  EVENT: 'event'
});

export const ConditionOperator = Object.freeze({
  EQUALS: '==',
  NOT_EQUALS: '!=',
  GREATER_THAN: '>',
  LESS_THAN: '<',
  GREATER_OR_EQUAL: '>=',
  LESS_OR_EQUAL: '<=',
  INCLUDES: 'includes',
  TRUTHY: 'truthy',
  FALSY: 'falsy'
});

/**
 * Strips secret tokens, credentials, and sensitive internal paths from logs/records.
 */
export function sanitizeWorkflowData(data) {
  if (!data || typeof data !== 'object') return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeWorkflowData);
  }

  const sanitized = {};
  for (const [k, v] of Object.entries(data)) {
    const lk = k.toLowerCase();
    if (
      lk.includes('token') ||
      lk.includes('secret') ||
      lk.includes('password') ||
      lk.includes('apikey') ||
      lk.includes('key_raw') ||
      lk.includes('auth') ||
      lk.includes('hmac')
    ) {
      sanitized[k] = '[REDACTED]';
    } else if (typeof v === 'string' && (v.includes('C:\\Users\\') || v.includes('/home/'))) {
      sanitized[k] = v.replace(/([A-Z]:\\[^\\]+\\[^\\]+\\)|(\/home\/[^\/]+\/)/g, '[INTERNAL_PATH]/');
    } else if (typeof v === 'object' && v !== null) {
      sanitized[k] = sanitizeWorkflowData(v);
    } else {
      sanitized[k] = v;
    }
  }
  return sanitized;
}

export function createDefaultWorkflow(workspaceId, overrides = {}) {
  const now = Date.now();
  const id = overrides.id || `wf_${now}_${Math.random().toString(36).slice(2, 7)}`;
  return {
    id,
    workspaceId,
    name: overrides.name || 'Untitled Business Workflow',
    description: overrides.description || '',
    version: overrides.version || '1.0.0',
    status: overrides.status || WorkflowStatus.DRAFT,
    trigger: overrides.trigger || { type: TriggerType.MANUAL },
    conditions: Array.isArray(overrides.conditions) ? overrides.conditions : [],
    steps: Array.isArray(overrides.steps) ? overrides.steps : [],
    requiredCapabilities: Array.isArray(overrides.requiredCapabilities) ? overrides.requiredCapabilities : [],
    metadata: overrides.metadata ? { ...overrides.metadata } : {},
    createdAt: overrides.createdAt || now,
    updatedAt: overrides.updatedAt || now
  };
}
