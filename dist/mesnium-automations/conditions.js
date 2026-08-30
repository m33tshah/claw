/**
 * MESNIUM AUTOMATIONS CONDITIONS & VARIABLE RESOLVER (PHASE 13)
 * 
 * Deterministic condition evaluator and variable interpolator for automation workflows.
 */

import { ConditionOperator } from './types.js';

/**
 * Safely resolves a nested dot-notated path from a context object.
 */
export function getNestedValue(obj, path) {
  if (!obj || !path) return undefined;
  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

/**
 * Evaluates a single deterministic condition against execution context.
 */
export function evaluateCondition(condition, context = {}) {
  if (!condition || !condition.field) return true;

  const actualValue = getNestedValue(context, condition.field);
  const targetValue = condition.value;
  const operator = condition.operator || ConditionOperator.EQUALS;

  switch (operator) {
    case ConditionOperator.EQUALS:
      return actualValue === targetValue || String(actualValue) === String(targetValue);

    case ConditionOperator.NOT_EQUALS:
      return actualValue !== targetValue && String(actualValue) !== String(targetValue);

    case ConditionOperator.CONTAINS:
      if (typeof actualValue === 'string') {
        return actualValue.toLowerCase().includes(String(targetValue).toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return actualValue.includes(targetValue);
      }
      return false;

    case ConditionOperator.DOES_NOT_CONTAIN:
      if (typeof actualValue === 'string') {
        return !actualValue.toLowerCase().includes(String(targetValue).toLowerCase());
      }
      if (Array.isArray(actualValue)) {
        return !actualValue.includes(targetValue);
      }
      return true;

    case ConditionOperator.GREATER_THAN:
      return Number(actualValue) > Number(targetValue);

    case ConditionOperator.LESS_THAN:
      return Number(actualValue) < Number(targetValue);

    case ConditionOperator.EXISTS:
      return actualValue !== undefined && actualValue !== null && actualValue !== '';

    case ConditionOperator.DOES_NOT_EXIST:
      return actualValue === undefined || actualValue === null || actualValue === '';

    default:
      return true;
  }
}

/**
 * Evaluates an array of conditions against context using AND logic.
 */
export function evaluateConditions(conditions = [], context = {}) {
  if (!conditions || conditions.length === 0) return true;
  for (const cond of conditions) {
    if (!evaluateCondition(cond, context)) {
      return false;
    }
  }
  return true;
}

/**
 * Interpolates {{variables}} in strings or object payloads using context data.
 */
export function interpolateVariables(target, context = {}) {
  if (typeof target === 'string') {
    return target.replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (match, path) => {
      const val = getNestedValue(context, path);
      if (val !== undefined && val !== null) {
        return typeof val === 'object' ? JSON.stringify(val) : String(val);
      }
      return match;
    });
  }

  if (Array.isArray(target)) {
    return target.map(item => interpolateVariables(item, context));
  }

  if (typeof target === 'object' && target !== null) {
    const res = {};
    for (const [key, value] of Object.entries(target)) {
      res[key] = interpolateVariables(value, context);
    }
    return res;
  }

  return target;
}
