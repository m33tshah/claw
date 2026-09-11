/**
 * MESNIUM WORKFLOW ENGINE — PERSISTENCE STORE (PHASE 4)
 * 
 * Manages tenant-isolated workflow definitions persisted to:
 * ~/.openclaw/mesnium_workflows.json
 * 
 * Features:
 * - Atomic disk writes via temp file replacement.
 * - Multi-tenant isolation: every query and mutation strictly verified by workspaceId.
 * - Process restart recovery.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { 
  assertValidWorkspaceId, 
  validateWorkflowDefinition, 
  validateWorkflowPatch 
} from './validator.js';
import { WorkflowStatus, createDefaultWorkflow } from './types.js';

function getWorkflowsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_workflows.json');
}

export class MesniumWorkflowStore {
  constructor(options = {}) {
    this.filePath = options.filePath || getWorkflowsFilePath();
    this.workflows = new Map(); // id -> workflow
    this.lastLoadedMtime = 0;
    this.load();
  }

  _syncFromDisk() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.mtimeMs > this.lastLoadedMtime) {
        this.load();
      }
    } catch (_) {}
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.workflows)) {
          this.workflows.clear();
          for (const w of data.workflows) {
            if (w && w.id && w.workspaceId) {
              this.workflows.set(w.id, w);
            }
          }
          this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
          return;
        }
      } catch (err) {
        console.error('[Mesnium Workflow Store] Failed to load workflows store:', err.message);
      }
    }
    this.workflows.clear();
    this.save();
  }

  save() {
    try {
      const data = {
        version: '1.4.0',
        updatedAt: Date.now(),
        workflows: Array.from(this.workflows.values())
      };
      const tmpPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
      if (fs.existsSync(this.filePath)) {
        this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
      }
    } catch (err) {
      console.error('[Mesnium Workflow Store] Failed to save workflows store:', err.message);
    }
  }

  listWorkflows(workspaceId) {
    assertValidWorkspaceId(workspaceId, 'listWorkflows');
    this._syncFromDisk();

    const result = [];
    for (const wf of this.workflows.values()) {
      if (wf.workspaceId === workspaceId) {
        result.push(JSON.parse(JSON.stringify(wf)));
      }
    }
    return result.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  }

  getWorkflow(workspaceId, workflowId) {
    assertValidWorkspaceId(workspaceId, 'getWorkflow');
    if (!workflowId) return null;
    this._syncFromDisk();

    const wf = this.workflows.get(workflowId);
    if (!wf || wf.workspaceId !== workspaceId) {
      return null;
    }
    return JSON.parse(JSON.stringify(wf));
  }

  createWorkflow(workspaceId, definition) {
    assertValidWorkspaceId(workspaceId, 'createWorkflow');
    this._syncFromDisk();

    const validated = validateWorkflowDefinition(definition, workspaceId);
    if (this.workflows.has(validated.id)) {
      throw new Error(`Workflow with ID "${validated.id}" already exists.`);
    }

    validated.createdAt = Date.now();
    validated.updatedAt = validated.createdAt;

    this.workflows.set(validated.id, validated);
    this.save();
    return JSON.parse(JSON.stringify(validated));
  }

  updateWorkflow(workspaceId, workflowId, patch) {
    assertValidWorkspaceId(workspaceId, 'updateWorkflow');
    this._syncFromDisk();

    const existing = this.workflows.get(workflowId);
    if (!existing || existing.workspaceId !== workspaceId) {
      throw new Error(`Workflow "${workflowId}" not found for workspace "${workspaceId}".`);
    }

    const validatedPatch = validateWorkflowPatch(patch);
    const updated = {
      ...existing,
      ...validatedPatch,
      id: existing.id,
      workspaceId: existing.workspaceId,
      updatedAt: Date.now()
    };

    this.workflows.set(workflowId, updated);
    this.save();
    return JSON.parse(JSON.stringify(updated));
  }

  deleteWorkflow(workspaceId, workflowId) {
    assertValidWorkspaceId(workspaceId, 'deleteWorkflow');
    this._syncFromDisk();

    const existing = this.workflows.get(workflowId);
    if (!existing || existing.workspaceId !== workspaceId) {
      return false;
    }

    this.workflows.delete(workflowId);
    this.save();
    return true;
  }

  setStatus(workspaceId, workflowId, status) {
    assertValidWorkspaceId(workspaceId, 'setStatus');
    const validStatuses = Object.values(WorkflowStatus);
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status "${status}". Allowed: ${validStatuses.join(', ')}.`);
    }
    return this.updateWorkflow(workspaceId, workflowId, { status });
  }
}
