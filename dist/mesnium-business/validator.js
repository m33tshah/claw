/**
 * MESNIUM BUSINESS CONTEXT VALIDATOR & SECURITY BOUNDARY (PHASE 3)
 * 
 * Enforces:
 * - Strict workspaceId presence for tenant-scoped operations (Zero silent fallbacks)
 * - Prototype pollution defense (__proto__, constructor, prototype)
 * - Depth bounding (max 6 levels)
 * - String length bounds & payload size caps (< 100KB)
 * - Rejection of executable code, functions, and malformed structures
 */

import { MAX_LIMITS } from './types.js';

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

/**
 * Validates and enforces presence of a valid, non-empty workspaceId.
 * Throws immediately if missing or invalid — NO SILENT FALLBACK.
 */
export function assertValidWorkspaceId(workspaceId, operation = 'operation') {
  if (workspaceId === undefined || workspaceId === null || typeof workspaceId !== 'string') {
    throw new Error(`Tenant Security Violation: workspaceId is strictly required for tenant-scoped ${operation}. No fallback allowed.`);
  }
  const trimmed = workspaceId.trim();
  if (!trimmed || trimmed.length === 0) {
    throw new Error(`Tenant Security Violation: workspaceId cannot be empty for ${operation}.`);
  }
  if (trimmed.length > 64) {
    throw new Error(`Tenant Security Violation: workspaceId exceeds maximum length of 64 characters.`);
  }
  // Prevent directory traversal or invalid path characters
  if (/[/\\?%*:|"<>.]/.test(trimmed) && trimmed !== 'default') {
    throw new Error(`Tenant Security Violation: workspaceId contains invalid characters.`);
  }
  return trimmed;
}

/**
 * Recursively inspects and sanitizes an object against prototype pollution,
 * deep nesting, and illegal executable types.
 */
export function validateAndSanitizeObject(obj, depth = 0) {
  if (depth > MAX_LIMITS.MAX_OBJECT_DEPTH) {
    throw new Error(`Validation Error: Object depth exceeds maximum allowed limit (${MAX_LIMITS.MAX_OBJECT_DEPTH}).`);
  }

  if (obj === null || obj === undefined) {
    return null;
  }

  const type = typeof obj;
  if (type === 'function' || type === 'symbol') {
    throw new Error(`Security Violation: Executable code or symbols are not permitted in business configuration.`);
  }

  if (type === 'string') {
    if (obj.length > MAX_LIMITS.MAX_STRING_LENGTH) {
      return obj.slice(0, MAX_LIMITS.MAX_STRING_LENGTH);
    }
    return obj;
  }

  if (type === 'number' || type === 'boolean') {
    return obj;
  }

  if (Array.isArray(obj)) {
    if (obj.length > MAX_LIMITS.MAX_ARRAY_ITEMS) {
      obj = obj.slice(0, MAX_LIMITS.MAX_ARRAY_ITEMS);
    }
    return obj.map(item => validateAndSanitizeObject(item, depth + 1));
  }

  if (type === 'object') {
    const clean = Object.create(null); // Pure null-prototype object to prevent prototype pollution
    for (const key of Object.keys(obj)) {
      if (FORBIDDEN_KEYS.has(key)) {
        throw new Error(`Security Violation: Prototype pollution attempt detected via key "${key}".`);
      }
      if (key.length > MAX_LIMITS.MAX_NAME_LENGTH) {
        throw new Error(`Validation Error: Key name "${key.slice(0, 20)}..." exceeds max length.`);
      }
      clean[key] = validateAndSanitizeObject(obj[key], depth + 1);
    }
    return clean;
  }

  return null;
}

/**
 * Validates an incoming business context patch or payload.
 */
export function validateBusinessContextPayload(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new Error('Validation Error: Business context must be a non-null object.');
  }

  // Size limit check on JSON serialization
  let serialized;
  try {
    serialized = JSON.stringify(payload);
  } catch (err) {
    throw new Error('Validation Error: Business context contains circular references or cannot be serialized.');
  }

  if (serialized.length > MAX_LIMITS.MAX_CONTEXT_BYTES) {
    throw new Error(`Validation Error: Business context size (${serialized.length} bytes) exceeds maximum allowable limit (${MAX_LIMITS.MAX_CONTEXT_BYTES} bytes).`);
  }

  // Deep sanitization and structure verification
  return validateAndSanitizeObject(payload);
}
