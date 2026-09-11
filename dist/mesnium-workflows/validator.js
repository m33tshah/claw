/**
 * MESNIUM WORKFLOW ENGINE — SECURITY & INTEGRITY VALIDATOR (PHASE 4)
 * 
 * Enforces:
 * 1. Strict multi-tenant workspace isolation (no default fallbacks).
 * 2. Prototype pollution immunity (__proto__, constructor, prototype).
 * 3. Execution boundary: Rejects all customer-supplied executable code (eval, Function, scripts).
 * 4. Canonical agent enforcement: Only the 5 locked Mesnium specialists allowed.
 * 5. Bounded payload sizes (< 100 KB) and step counts (max 25).
 * 6. Pure deterministic condition evaluator with zero dynamic code execution.
 */

import { WorkflowStepType, ConditionOperator } from './types.js';

export const LOCKED_CANONICAL_AGENTS = Object.freeze([
  'agent_receptionist',
  'agent_sales',
  'agent_marketing',
  'agent_operations',
  'agent_executive'
]);

export function assertValidWorkspaceId(workspaceId, caller = 'workflow operation') {
  if (
    !workspaceId ||
    typeof workspaceId !== 'string' ||
    workspaceId.trim() === '' ||
    workspaceId.trim().toLowerCase() === 'null' ||
    workspaceId.trim().toLowerCase() === 'undefined'
  ) {
    throw new Error(
      `[SECURITY VIOLATION] workspaceId is strictly required for "${caller}". Multi-tenant boundary violation: silent fallbacks are prohibited.`
    );
  }
  return workspaceId.trim();
}

function _scanForExecutablePatterns(val, path = '') {
  if (typeof val === 'string') {
    if (/<script|eval\s*\(|new\s+Function\s*\(|javascript:/i.test(val)) {
      throw new Error(
        `[SECURITY REJECTION] Executable JavaScript or script markup detected at "${path}". Workflows are strictly declarative configuration.`
      );
    }
  } else if (Array.isArray(val)) {
    for (let i = 0; i < val.length; i++) {
      _scanForExecutablePatterns(val[i], `${path}[${i}]`);
    }
  } else if (val && typeof val === 'object') {
    for (const [k, v] of Object.entries(val)) {
      if (k === '__proto__' || k === 'constructor' || k === 'prototype') {
        throw new Error(`[SECURITY REJECTION] Prototype pollution key "${k}" detected at "${path}".`);
      }
      _scanForExecutablePatterns(v, path ? `${path}.${k}` : k);
    }
  }
}

export function validateWorkflowDefinition(def, workspaceId = null) {
  if (!def || typeof def !== 'object' || Array.isArray(def)) {
    throw new Error('Invalid workflow definition: Expected a structured JSON object.');
  }

  // Size bounding (< 100 KB)
  const jsonStr = JSON.stringify(def);
  const byteLen = Buffer.byteLength(jsonStr, 'utf8');
  if (byteLen > 100 * 1024) {
    throw new Error(`Workflow definition exceeds 100 KB limit (${byteLen} bytes).`);
  }

  // Deep prototype pollution and executable code scan
  _scanForExecutablePatterns(def);

  const clean = JSON.parse(jsonStr);

  // Tenant workspace check
  const ws = workspaceId || clean.workspaceId;
  assertValidWorkspaceId(ws, 'validateWorkflowDefinition');
  clean.workspaceId = ws;

  if (!clean.name || typeof clean.name !== 'string' || clean.name.trim().length === 0) {
    throw new Error('Workflow definition must include a non-empty "name" string.');
  }
  clean.name = clean.name.trim().slice(0, 120);

  if (!clean.id || typeof clean.id !== 'string') {
    clean.id = `wf_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  }

  if (!Array.isArray(clean.steps)) {
    clean.steps = [];
  }

  if (clean.steps.length > 25) {
    throw new Error(`Workflow exceeds maximum allowed steps (found ${clean.steps.length}, max 25).`);
  }

  const validStepTypes = Object.values(WorkflowStepType);

  clean.steps = clean.steps.map((step, idx) => {
    if (!step || typeof step !== 'object') {
      throw new Error(`Workflow step at index ${idx} is invalid.`);
    }

    const sType = String(step.type || '').toLowerCase();
    if (!validStepTypes.includes(sType)) {
      throw new Error(`Workflow step "${step.id || idx}" has unsupported type: "${step.type}".`);
    }

    // Step ID enforcement
    const stepId = step.id ? String(step.id).trim() : `step_${idx + 1}`;
    const stepName = step.name ? String(step.name).trim().slice(0, 100) : `Step ${idx + 1}`;

    // Canonical agent constraint
    if (sType === 'agent') {
      if (!step.agentId || !LOCKED_CANONICAL_AGENTS.includes(step.agentId)) {
        throw new Error(
          `Workflow step "${stepId}" specifies invalid agentId "${step.agentId}". Only canonical specialists are permitted: ${LOCKED_CANONICAL_AGENTS.join(', ')}.`
        );
      }
    }

    return {
      id: stepId,
      name: stepName,
      type: sType,
      agentId: step.agentId || null,
      action: step.action || step.tool || null,
      input: step.input || step.payload || {},
      conditions: Array.isArray(step.conditions) ? step.conditions : (step.condition ? [step.condition] : []),
      requiredCapabilities: Array.isArray(step.requiredCapabilities) ? step.requiredCapabilities : [],
      approvalRequired: Boolean(step.approvalRequired),
      continueOnError: Boolean(step.continueOnError),
      delayMs: typeof step.delayMs === 'number' && step.delayMs >= 0 ? step.delayMs : null
    };
  });

  return clean;
}

export function validateWorkflowPatch(patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) {
    throw new Error('Workflow patch must be a valid object.');
  }

  _scanForExecutablePatterns(patch);

  const allowedKeys = [
    'name',
    'description',
    'status',
    'trigger',
    'conditions',
    'steps',
    'requiredCapabilities',
    'metadata'
  ];

  for (const k of Object.keys(patch)) {
    if (k === 'id' || k === 'workspaceId') {
      throw new Error(`Cannot modify immutable workflow field "${k}".`);
    }
    if (!allowedKeys.includes(k)) {
      throw new Error(`Unrecognized or prohibited patch key "${k}".`);
    }
  }

  if (patch.steps) {
    if (!Array.isArray(patch.steps)) {
      throw new Error('steps must be an array.');
    }
    if (patch.steps.length > 25) {
      throw new Error('steps array exceeds max length 25.');
    }
    for (const step of patch.steps) {
      if (step.type === 'agent' && step.agentId && !LOCKED_CANONICAL_AGENTS.includes(step.agentId)) {
        throw new Error(`Invalid agentId in step: ${step.agentId}`);
      }
    }
  }

  return JSON.parse(JSON.stringify(patch));
}

/**
 * Pure declarative condition evaluator.
 * Safely resolves nested property paths and applies simple comparison operators.
 */
export function evaluateCondition(condition, context = {}) {
  if (!condition || typeof condition !== 'object') return true;

  const { field, operator = '==', value } = condition;
  if (!field || typeof field !== 'string') return true;

  // Resolve dot-notated property
  const parts = field.split('.');
  let current = context;
  for (const p of parts) {
    if (current === null || current === undefined) {
      current = undefined;
      break;
    }
    current = current[p];
  }

  switch (operator) {
    case '==':
    case 'equals':
    case ConditionOperator.EQUALS:
      return current == value;

    case '!=':
    case 'not_equals':
    case ConditionOperator.NOT_EQUALS:
      return current != value;

    case '>':
    case ConditionOperator.GREATER_THAN:
      return Number(current) > Number(value);

    case '<':
    case ConditionOperator.LESS_THAN:
      return Number(current) < Number(value);

    case '>=':
    case ConditionOperator.GREATER_OR_EQUAL:
      return Number(current) >= Number(value);

    case '<=':
    case ConditionOperator.LESS_OR_EQUAL:
      return Number(current) <= Number(value);

    case 'includes':
    case ConditionOperator.INCLUDES:
      if (Array.isArray(current)) return current.includes(value);
      if (typeof current === 'string') return current.includes(String(value));
      return false;

    case 'truthy':
    case ConditionOperator.TRUTHY:
      return Boolean(current);

    case 'falsy':
    case ConditionOperator.FALSY:
      return !Boolean(current);

    default:
      return Boolean(current);
  }
}
