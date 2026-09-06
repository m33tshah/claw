/**
 * MESNIUM PERSISTENT TASKS ENGINE (PRODUCT COMPLETION SPRINT)
 * 
 * Manages persistent business tasks across the 6 canonical lifecycle states:
 * - pending
 * - in_progress
 * - waiting_approval
 * - completed
 * - failed
 * - cancelled
 * 
 * Persisted to disk in ~/.openclaw/mesnium_tasks.json
 * Connected directly to MesniumAgentRuntime for execution.
 * Respects tenant workspace isolation and zero dummy data defaults.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getSharedAgentRuntime } from '../mesnium-agents/runtime.js';
import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';

export const TaskStatus = Object.freeze({
  PENDING: 'pending',
  IN_PROGRESS: 'in_progress',
  WAITING_APPROVAL: 'waiting_approval',
  COMPLETED: 'completed',
  FAILED: 'failed',
  CANCELLED: 'cancelled'
});

export const TaskPriority = Object.freeze({
  LOW: 'low',
  MEDIUM: 'medium',
  HIGH: 'high',
  URGENT: 'urgent'
});

function getTasksFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_tasks.json');
}

export class MesniumTaskManager {
  constructor(options = {}) {
    this.filePath = options.filePath || getTasksFilePath();
    this.tasks = new Map();
    this.lastLoadedMtime = 0;
    this.runtime = options.runtime || null;
    this.activityLedger = options.activityLedger || null;
    this.load();
  }

  _syncFromDisk() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.mtimeMs > this.lastLoadedMtime) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tasks)) {
          this.tasks.clear();
          for (const t of data.tasks) {
            this.tasks.set(t.id, t);
          }
          this.lastLoadedMtime = stats.mtimeMs;
        }
      }
    } catch (_) {}
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tasks)) {
          this.tasks.clear();
          for (const t of data.tasks) {
            this.tasks.set(t.id, t);
          }
          this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
          return;
        }
      } catch (err) {
        console.error('[Mesnium Tasks] Failed to load tasks store:', err.message);
      }
    }
    // Clean initial state: zero dummy data
    this.tasks.clear();
    this.save();
  }

  save() {
    try {
      const data = {
        version: '1.0.0',
        updatedAt: Date.now(),
        tasks: Array.from(this.tasks.values())
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
      if (fs.existsSync(this.filePath)) {
        this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
      }
    } catch (err) {
      console.error('[Mesnium Tasks] Failed to save tasks store:', err.message);
    }
  }

  _resolveWorkspace(target) {
    if (!target) return 'default';
    if (typeof target === 'string') return target;
    return target.workspaceId || target.tenantId || 'default';
  }

  listTasks(options = {}) {
    this._syncFromDisk();
    const workspaceId = this._resolveWorkspace(options);
    const statusFilter = options.status || null;
    const agentIdFilter = options.agentId || null;

    let list = Array.from(this.tasks.values()).filter(t => (t.workspaceId || t.tenantId || 'default') === workspaceId);

    if (statusFilter && statusFilter !== 'all') {
      list = list.filter(t => t.status === statusFilter);
    }

    if (agentIdFilter) {
      list = list.filter(t => t.agentId === agentIdFilter);
    }

    // Sort newest first
    list.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    if (options.limit && typeof options.limit === 'number') {
      list = list.slice(0, options.limit);
    }

    return list;
  }

  getTask(id, workspaceOrOptions = 'default') {
    this._syncFromDisk();
    const task = this.tasks.get(id);
    if (!task) return null;
    const workspaceId = this._resolveWorkspace(workspaceOrOptions);
    if (workspaceId && (task.workspaceId || task.tenantId || 'default') !== workspaceId) return null;
    return task;
  }

  createTask(data = {}) {
    this._syncFromDisk();
    if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
      throw new Error('Task title is required.');
    }

    const id = data.id || ('task_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 7));
    const now = Date.now();

    // Default agent assignment to agent_operations or specified agent
    const agentId = data.agentId || 'agent_operations';
    const workspaceId = this._resolveWorkspace(data);

    const newTask = {
      id,
      title: data.title.trim(),
      description: (data.description || '').trim(),
      instruction: (data.instruction || data.title).trim(),
      agentId,
      workspaceId,
      tenantId: workspaceId,
      status: TaskStatus.PENDING,
      priority: data.priority || TaskPriority.MEDIUM,
      createdAt: now,
      updatedAt: now,
      completedAt: null,
      result: null,
      error: null,
      runHistory: []
    };

    this.tasks.set(id, newTask);
    this.save();
    return newTask;
  }

  updateTask(id, updates = {}, workspaceOrOptions = 'default') {
    this._syncFromDisk();
    const resolvedWs = updates.workspaceId || updates.tenantId
      ? this._resolveWorkspace(updates)
      : this._resolveWorkspace(workspaceOrOptions);
    const task = this.getTask(id, resolvedWs);
    if (!task) {
      throw new Error(`Task "${id}" not found.`);
    }

    if (updates.title !== undefined) {
      if (!updates.title.trim()) throw new Error('Task title cannot be empty.');
      task.title = updates.title.trim();
    }
    if (updates.description !== undefined) task.description = updates.description.trim();
    if (updates.instruction !== undefined) task.instruction = updates.instruction.trim();
    if (updates.agentId !== undefined) task.agentId = updates.agentId;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.status !== undefined) {
      if (!Object.values(TaskStatus).includes(updates.status)) {
        throw new Error(`Invalid task status: ${updates.status}`);
      }
      task.status = updates.status;
      if (updates.status === TaskStatus.COMPLETED && !task.completedAt) {
        task.completedAt = Date.now();
      }
    }
    if (updates.result !== undefined) task.result = updates.result;
    if (updates.error !== undefined) task.error = updates.error;

    task.updatedAt = Date.now();
    this.tasks.set(id, task);
    this.save();
    return task;
  }

  deleteTask(id, workspaceOrOptions = 'default') {
    this._syncFromDisk();
    const workspaceId = this._resolveWorkspace(workspaceOrOptions);
    const task = this.getTask(id, workspaceId);
    if (!task) {
      throw new Error(`Task "${id}" not found.`);
    }

    this.tasks.delete(id);
    this.save();
    return { ok: true, deletedId: id };
  }

  async runTask(id, options = {}) {
    this._syncFromDisk();
    const workspaceId = this._resolveWorkspace(options);
    const task = this.getTask(id, workspaceId);
    if (!task) {
      throw new Error(`Task "${id}" not found.`);
    }

    if (task.status === TaskStatus.CANCELLED) {
      throw new Error(`Cannot run cancelled task "${task.title}".`);
    }

    // Set in-progress state
    task.status = TaskStatus.IN_PROGRESS;
    task.updatedAt = Date.now();
    this.tasks.set(id, task);
    this.save();

    const runtime = this.runtime || getSharedAgentRuntime();
    const startTime = Date.now();

    try {
      const runPrompt = task.instruction || task.title;
      const runOptions = {
        workspaceId,
        taskId: task.id,
        ...options
      };

      const result = await runtime.runAgent(task.agentId || 'agent_operations', runPrompt, runOptions);
      const durationMs = Date.now() - startTime;

      // Handle consequential action approval wait
      if (result.waitingApproval || result.status === 'waiting_approval') {
        task.status = TaskStatus.WAITING_APPROVAL;
        task.result = result.summary || 'Task paused: waiting for operator confirmation in Approvals.';
        task.pendingApprovals = result.pendingApprovals || (result.actionId ? [result.actionId] : []);
        task.updatedAt = Date.now();
      } else if (result.status === 'partial') {
        task.status = TaskStatus.COMPLETED;
        task.completedAt = Date.now();
        task.result = result.summary || 'Task completed partially.';
        task.updatedAt = Date.now();
      } else {
        task.status = TaskStatus.COMPLETED;
        task.completedAt = Date.now();
        task.result = result.summary || result.response || (result.content ? result.content.map(c => c.text).join('\n') : 'Task completed successfully.');
        task.updatedAt = Date.now();
      }

      task.error = null;
      task.runHistory.unshift({
        runAt: startTime,
        durationMs,
        status: task.status,
        resultSummary: task.result
      });
      if (task.runHistory.length > 20) task.runHistory = task.runHistory.slice(0, 20);

      this.tasks.set(id, task);
      this.save();

      return {
        ok: true,
        task,
        execution: result
      };
    } catch (err) {
      const durationMs = Date.now() - startTime;
      task.status = TaskStatus.FAILED;
      task.error = err.message || 'Task execution failed.';
      task.updatedAt = Date.now();
      task.runHistory.unshift({
        runAt: startTime,
        durationMs,
        status: TaskStatus.FAILED,
        error: task.error
      });
      if (task.runHistory.length > 20) task.runHistory = task.runHistory.slice(0, 20);

      this.tasks.set(id, task);
      this.save();

      throw err;
    }
  }
}

let sharedTaskManager = null;

export function getSharedTaskManager(options = {}) {
  if (!sharedTaskManager) {
    sharedTaskManager = new MesniumTaskManager(options);
  }
  return sharedTaskManager;
}

export function resetSharedTaskManager() {
  sharedTaskManager = null;
}
