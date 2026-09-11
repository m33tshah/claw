/**
 * MESNIUM WORKFLOW ENGINE — RUNS & EXECUTION HISTORY STORE (PHASE 4)
 * 
 * Persists durable workflow execution state to:
 * ~/.openclaw/mesnium_workflow_runs.json
 * 
 * Features:
 * - Survives server and process restart.
 * - Retains WAITING_FOR_APPROVAL state with pending Gatekeeper action reference.
 * - Idempotency tracking (runId:stepId) to guarantee at-most-once execution for consequential steps.
 * - Strips secrets, credentials, and sensitive internal paths.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assertValidWorkspaceId } from './validator.js';
import { WorkflowRunStatus, sanitizeWorkflowData } from './types.js';

function getWorkflowRunsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_workflow_runs.json');
}

export class MesniumWorkflowRunStore {
  constructor(options = {}) {
    this.filePath = options.filePath || getWorkflowRunsFilePath();
    this.runs = new Map(); // runId -> run
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
        if (Array.isArray(data.runs)) {
          this.runs.clear();
          for (const r of data.runs) {
            if (r && r.runId && r.workspaceId) {
              this.runs.set(r.runId, r);
            }
          }
          this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
          return;
        }
      } catch (err) {
        console.error('[Mesnium Workflow Run Store] Failed to load runs store:', err.message);
      }
    }
    this.runs.clear();
    this.save();
  }

  save() {
    try {
      const data = {
        version: '1.4.0',
        updatedAt: Date.now(),
        runs: Array.from(this.runs.values())
      };
      const tmpPath = `${this.filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 6)}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
      if (fs.existsSync(this.filePath)) {
        this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
      }
    } catch (err) {
      console.error('[Mesnium Workflow Run Store] Failed to save runs store:', err.message);
    }
  }

  createRun(record) {
    assertValidWorkspaceId(record.workspaceId, 'createRun');
    this._syncFromDisk();

    const now = Date.now();
    const runId = record.runId || `wfrun_${now}_${Math.random().toString(36).slice(2, 7)}`;

    const run = {
      runId,
      id: runId, // Backward compatibility
      workflowId: record.workflowId,
      workflowName: record.workflowName || 'Workflow',
      workspaceId: record.workspaceId,
      status: record.status || WorkflowRunStatus.RUNNING,
      trigger: record.trigger || 'manual',
      currentStepIndex: record.currentStepIndex || 0,
      currentStepId: record.currentStepId || null,
      startedAt: record.startedAt || now,
      updatedAt: record.updatedAt || now,
      completedAt: record.completedAt || null,
      input: sanitizeWorkflowData(record.input || {}),
      context: sanitizeWorkflowData(record.context || {}),
      stepResults: sanitizeWorkflowData(record.stepResults || {}),
      executedStepKeys: Array.isArray(record.executedStepKeys) ? [...record.executedStepKeys] : [],
      waitingForApproval: record.waitingForApproval ? sanitizeWorkflowData(record.waitingForApproval) : null,
      error: record.error ? String(record.error).slice(0, 500) : null
    };

    this.runs.set(runId, run);
    this.save();
    return JSON.parse(JSON.stringify(run));
  }

  updateRun(runId, patch) {
    this._syncFromDisk();
    const existing = this.runs.get(runId);
    if (!existing) {
      throw new Error(`Workflow run "${runId}" not found.`);
    }

    const updated = {
      ...existing,
      ...patch,
      input: patch.input !== undefined ? sanitizeWorkflowData(patch.input) : existing.input,
      context: patch.context !== undefined ? sanitizeWorkflowData(patch.context) : existing.context,
      stepResults: patch.stepResults !== undefined ? sanitizeWorkflowData(patch.stepResults) : existing.stepResults,
      waitingForApproval: patch.waitingForApproval !== undefined ? (patch.waitingForApproval ? sanitizeWorkflowData(patch.waitingForApproval) : null) : existing.waitingForApproval,
      executedStepKeys: Array.isArray(patch.executedStepKeys) ? [...patch.executedStepKeys] : existing.executedStepKeys,
      runId: existing.runId,
      id: existing.runId,
      workspaceId: existing.workspaceId,
      workflowId: existing.workflowId,
      updatedAt: Date.now()
    };

    if (patch.error) {
      updated.error = String(patch.error).slice(0, 500);
    }

    this.runs.set(runId, updated);
    this.save();
    return JSON.parse(JSON.stringify(updated));
  }

  getRun(workspaceId, runId) {
    assertValidWorkspaceId(workspaceId, 'getRun');
    if (!runId) return null;
    this._syncFromDisk();

    const run = this.runs.get(runId);
    if (!run || run.workspaceId !== workspaceId) {
      return null;
    }
    return JSON.parse(JSON.stringify(run));
  }

  listRuns(workspaceId, { workflowId = null, limit = 50 } = {}) {
    assertValidWorkspaceId(workspaceId, 'listRuns');
    this._syncFromDisk();

    const result = [];
    for (const r of this.runs.values()) {
      if (r.workspaceId === workspaceId) {
        if (!workflowId || r.workflowId === workflowId) {
          result.push(JSON.parse(JSON.stringify(r)));
        }
      }
    }
    result.sort((a, b) => (b.startedAt || 0) - (a.startedAt || 0));
    return result.slice(0, limit);
  }

  isStepExecuted(runId, stepId) {
    this._syncFromDisk();
    const run = this.runs.get(runId);
    if (!run || !Array.isArray(run.executedStepKeys)) return false;
    const key = `${runId}:${stepId}`;
    return run.executedStepKeys.includes(key);
  }

  markStepExecuted(runId, stepId) {
    this._syncFromDisk();
    const run = this.runs.get(runId);
    if (!run) return;
    const key = `${runId}:${stepId}`;
    if (!Array.isArray(run.executedStepKeys)) run.executedStepKeys = [];
    if (!run.executedStepKeys.includes(key)) {
      run.executedStepKeys.push(key);
      this.save();
    }
  }
}
