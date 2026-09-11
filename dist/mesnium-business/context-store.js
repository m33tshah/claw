/**
 * MESNIUM BUSINESS CONTEXT PERSISTENCE STORE (PHASE 3)
 * 
 * Manages tenant-isolated, persisted business context on disk:
 * ~/.openclaw/mesnium_business_context.json
 * 
 * Security:
 * - Strictly enforces non-empty workspaceId on all reads & writes.
 * - Zero silent fallback to "default".
 * - Atomic write operations using temporary file replacement.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { createEmptyCustomerContext } from './types.js';
import { assertValidWorkspaceId, validateBusinessContextPayload } from './validator.js';

function getBusinessContextFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_business_context.json');
}

export class MesniumBusinessContextStore {
  constructor(options = {}) {
    this.filePath = options.filePath || getBusinessContextFilePath();
    this.contexts = new Map(); // workspaceId -> BusinessContext
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data.contexts === 'object') {
          this.contexts.clear();
          for (const [wsId, ctx] of Object.entries(data.contexts)) {
            this.contexts.set(wsId, ctx);
          }
          return;
        }
      } catch (err) {
        console.warn('[MesniumBusiness] Failed to parse business context store:', err.message);
      }
    }
  }

  save() {
    try {
      const contextsObj = {};
      for (const [wsId, ctx] of this.contexts.entries()) {
        contextsObj[wsId] = ctx;
      }
      const data = {
        version: '1.0.0',
        updatedAt: Date.now(),
        contexts: contextsObj
      };
      const tmpPath = `${this.filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[MesniumBusiness] Failed to write business context to disk:', err.message);
    }
  }

  /**
   * Retrieves the raw customer business context for a workspace.
   * Strictly requires a valid workspaceId.
   */
  getContext(workspaceId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'getContext');
    let ctx = this.contexts.get(validWs);
    if (!ctx) {
      // Lazy initialize empty customer overrides for new workspace
      ctx = createEmptyCustomerContext(validWs);
      this.contexts.set(validWs, ctx);
      this.save();
    }
    return JSON.parse(JSON.stringify(ctx));
  }

  /**
   * Updates customer business context with patch.
   * Strictly requires a valid workspaceId.
   */
  updateContext(workspaceId, patch) {
    const validWs = assertValidWorkspaceId(workspaceId, 'updateContext');
    const sanitizedPatch = validateBusinessContextPayload(patch);

    const current = this.getContext(validWs);

    // Deep merge patch into current customer context
    const updated = this._mergeObjects(current, sanitizedPatch);
    updated.workspaceId = validWs;
    updated.updatedAt = Date.now();

    this.contexts.set(validWs, updated);
    this.save();

    return JSON.parse(JSON.stringify(updated));
  }

  /**
   * Resets customer business context to empty baseline (no overrides).
   */
  resetContext(workspaceId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'resetContext');
    const reset = createEmptyCustomerContext(validWs);
    this.contexts.set(validWs, reset);
    this.save();
    return JSON.parse(JSON.stringify(reset));
  }

  listWorkspaces() {
    return Array.from(this.contexts.keys());
  }

  _mergeObjects(target, source) {
    const result = { ...target };
    for (const key of Object.keys(source)) {
      if (source[key] !== null && typeof source[key] === 'object' && !Array.isArray(source[key])) {
        result[key] = this._mergeObjects(result[key] || {}, source[key]);
      } else {
        result[key] = source[key];
      }
    }
    return result;
  }
}
