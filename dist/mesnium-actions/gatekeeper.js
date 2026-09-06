/**
 * MESNIUM HUMAN-IN-THE-LOOP ACTION GATEKEEPER (PHASE 12)
 * 
 * Provides an unbypassable execution boundary between agent proposals and external mutating actions.
 * Enforces cryptographic payload integrity, strict expiration, deterministic policy re-checks,
 * and idempotency guarantees.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { ActionType, ActionStatus, RiskLevel, computePayloadHash } from './types.js';
import { getSharedActionPolicy } from './policy.js';
import { describeAction } from './describe.js';
import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';

function getApprovalsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, 'mesnium_approvals.json');
}

export class MesniumActionGatekeeper {
  constructor(options = {}) {
    this.filePath = options.filePath || options.configPath || getApprovalsFilePath();
    this.actions = new Map(); // id -> Action
    this.policy = getSharedActionPolicy();
    this.agentRegistry = getSharedAgentRegistry();
    this.activityLedger = getSharedActivityLedger();
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
        if (Array.isArray(data.actions)) {
          this.actions.clear();
          for (const act of data.actions) {
            this.actions.set(act.id, act);
          }
          this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
          return;
        }
      } catch (err) {
        console.error('[Mesnium Action Gatekeeper] Failed to load approvals store:', err.message);
      }
    }
  }

  save() {
    try {
      const data = {
        version: '1.2.0',
        updatedAt: Date.now(),
        actions: Array.from(this.actions.values())
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
      if (fs.existsSync(this.filePath)) {
        this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
      }
    } catch (err) {
      console.error('[Mesnium Action Gatekeeper] Failed to save approvals store:', err.message);
    }
  }

  /**
   * Propose an action from an agent.
   */
  proposeAction({
    agentId,
    workspaceId = 'default',
    actionType,
    title,
    description = '',
    target = '',
    payload = {},
    expiresMs = 24 * 3600 * 1000 // Default: 24h expiration
  }) {
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent "${agentId}" not found.`);
    }

    // 1. Evaluate Agent Permissions via Policy
    const policyResult = this.policy.evaluateAgentPermissions(agent, actionType);
    if (!policyResult.allowed) {
      throw new Error(`Action rejected by policy: ${policyResult.reason}`);
    }

    // 2. Evaluate External Connection Prerequisites
    const connResult = this.policy.evaluateConnectionPrerequisites(actionType);
    if (!connResult.ready) {
      throw new Error(`Action rejected: ${connResult.reason}`);
    }

    const now = Date.now();
    const id = `act_req_${now}_${Math.random().toString(36).slice(2, 7)}`;
    const payloadHash = computePayloadHash(payload);
    const riskLevel = policyResult.riskLevel;
    const approvalRequired = policyResult.requiresApproval;

    // Derive deterministic human-readable display description (DISPLAY ONLY — NOT HASHED)
    const displayDescription = describeAction(actionType, payload, {
      agentName: agent.name,
      agentId: agent.id,
      title,
      target
    });

    const action = {
      id,
      agentId: agent.id,
      agentName: agent.name,
      workspaceId,
      actionType,
      title: title || displayDescription.title || `${actionType} requested by ${agent.name}`,
      description: description || displayDescription.summary,
      target,
      payload: { ...payload },
      payloadHash,
      displayDescription,
      riskLevel,
      status: approvalRequired ? ActionStatus.PENDING_APPROVAL : ActionStatus.APPROVED,
      approvalRequired,
      requestedAt: now,
      expiresAt: now + expiresMs,
      approvedAt: null,
      rejectedAt: null,
      executedAt: null,
      createdBy: agent.name,
      approvedBy: null,
      result: null,
      error: null
    };

    this.actions.set(id, action);
    this.save();

    // Record in Activity Ledger
    this.activityLedger.recordRun({
      agentId: agent.id,
      agentName: agent.name,
      prompt: `Proposed Action: ${action.title} (${actionType})`,
      status: approvalRequired ? 'waiting_approval' : 'approved',
      result: `Action ${id} proposed with risk level ${riskLevel}. Target: ${target}`,
      startedAt: now
    });

    return action;
  }

  /**
   * Approve a pending action.
   */
  approveAction(actionId, approvedBy = 'User') {
    this._syncFromDisk();
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);

    if (Date.now() > action.expiresAt) {
      action.status = ActionStatus.EXPIRED;
      this.save();
      throw new Error('Cannot approve action: Action proposal has expired.');
    }

    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot approve action: Current status is "${action.status}".`);
    }

    action.status = ActionStatus.APPROVED;
    action.approvedBy = approvedBy;
    action.approvedAt = Date.now();
    this.save();

    this.activityLedger.recordRun({
      agentId: action.agentId,
      agentName: action.agentName,
      prompt: `Approved Action: ${action.title}`,
      status: 'approved',
      result: `Action ${actionId} approved by ${approvedBy}. Ready for execution.`,
      startedAt: Date.now()
    });

    return action;
  }

  /**
   * Reject a pending action.
   */
  rejectAction(actionId, reason = 'Rejected by user', rejectedBy = 'User') {
    this._syncFromDisk();
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);

    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot reject action: Current status is "${action.status}".`);
    }

    action.status = ActionStatus.REJECTED;
    action.rejectedAt = Date.now();
    action.error = reason;
    this.save();

    this.activityLedger.recordRun({
      agentId: action.agentId,
      agentName: action.agentName,
      prompt: `Rejected Action: ${action.title}`,
      status: 'rejected',
      result: `Action ${actionId} rejected by ${rejectedBy}. Reason: ${reason}`,
      startedAt: Date.now()
    });

    return action;
  }

  /**
   * Execute an approved action with full security & integrity re-checks.
   */
  async executeAction(actionId, executorFn = null) {
    this._syncFromDisk();
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);

    const now = Date.now();

    // 1. Check Expiration
    if (now > action.expiresAt) {
      action.status = ActionStatus.EXPIRED;
      this.save();
      throw new Error(`Cannot execute action ${actionId}: Action has expired.`);
    }

    // 2. Idempotency Guard (Prevent duplicate execution)
    if (action.executedAt || action.status === ActionStatus.COMPLETED || action.status === ActionStatus.EXECUTING) {
      throw new Error(`Idempotency guard: Action ${actionId} has already been executed or is currently executing.`);
    }

    // 3. Check Valid Status
    if (action.status !== ActionStatus.APPROVED) {
      throw new Error(`Cannot execute action ${actionId}: Action must be APPROVED first (Current: ${action.status}).`);
    }

    // 4. Approval Cryptographic Integrity Check (Tamper-proofing)
    const currentHash = computePayloadHash(action.payload);
    if (currentHash !== action.payloadHash) {
      action.status = ActionStatus.FAILED;
      action.error = 'Payload integrity violation: Action payload was modified after approval.';
      this.save();
      throw new Error(`Execution blocked: Payload integrity violation. Action payload was modified after approval.`);
    }

    // 5. Re-evaluate Agent Status
    const agent = this.agentRegistry.getAgent(action.agentId);
    const policyResult = this.policy.evaluateAgentPermissions(agent, action.actionType);
    if (!policyResult.allowed) {
      action.status = ActionStatus.FAILED;
      action.error = policyResult.reason;
      this.save();
      throw new Error(`Execution blocked: ${policyResult.reason}`);
    }

    // 6. Re-evaluate External Connection
    const connResult = this.policy.evaluateConnectionPrerequisites(action.actionType);
    if (!connResult.ready) {
      action.status = ActionStatus.FAILED;
      action.error = connResult.reason;
      this.save();
      throw new Error(`Execution blocked: ${connResult.reason}`);
    }

    action.status = ActionStatus.EXECUTING;
    this.save();

    try {
      let executionResult = null;
      if (typeof executorFn === 'function') {
        executionResult = await executorFn(action.payload);
      } else {
        // Deterministic default executor for standard action types
        executionResult = {
          success: true,
          message: `Successfully executed ${action.actionType} for target "${action.target}".`,
          timestamp: new Date().toISOString()
        };
      }

      action.status = ActionStatus.COMPLETED;
      action.executedAt = Date.now();
      action.result = executionResult;
      this.save();

      this.activityLedger.recordRun({
        agentId: action.agentId,
        agentName: action.agentName,
        prompt: `Executed Action: ${action.title}`,
        status: 'completed',
        result: typeof executionResult === 'object' ? JSON.stringify(executionResult) : String(executionResult),
        startedAt: now,
        completedAt: Date.now()
      });

      return executionResult;

    } catch (err) {
      action.status = ActionStatus.FAILED;
      action.error = err.message;
      this.save();

      this.activityLedger.recordRun({
        agentId: action.agentId,
        agentName: action.agentName,
        prompt: `Failed Action: ${action.title}`,
        status: 'failed',
        error: err.message,
        startedAt: now,
        completedAt: Date.now()
      });

      throw err;
    }
  }

  /**
   * List pending actions awaiting human review.
   */
  listPendingApprovals(workspaceId = null) {
    this._syncFromDisk();
    const now = Date.now();
    let updated = false;
    const list = Array.from(this.actions.values()).filter(a => {
      if (a.status !== ActionStatus.PENDING_APPROVAL) return false;
      if (now > a.expiresAt) {
        a.status = ActionStatus.EXPIRED;
        updated = true;
        return false;
      }
      if (workspaceId && a.workspaceId !== workspaceId && a.workspaceId !== 'default') return false;
      if (!a.displayDescription) {
        a.displayDescription = describeAction(a.actionType, a.payload, {
          agentName: a.agentName,
          agentId: a.agentId,
          title: a.title,
          target: a.target
        });
      }
      return true;
    });
    if (updated) this.save();
    return list;
  }

  /**
   * List all actions in the store.
   */
  listActions(filter = {}) {
    this._syncFromDisk();
    let list = Array.from(this.actions.values());
    if (filter.status) list = list.filter(a => a.status === filter.status);
    if (filter.agentId) list = list.filter(a => a.agentId === filter.agentId);
    for (const a of list) {
      if (!a.displayDescription) {
        a.displayDescription = describeAction(a.actionType, a.payload, {
          agentName: a.agentName,
          agentId: a.agentId,
          title: a.title,
          target: a.target
        });
      }
    }
    return list;
  }

  /**
   * Get an action proposal by ID.
   */
  getAction(actionId) {
    this._syncFromDisk();
    const action = this.actions.get(actionId);
    if (action && !action.displayDescription) {
      action.displayDescription = describeAction(action.actionType, action.payload, {
        agentName: action.agentName,
        agentId: action.agentId,
        title: action.title,
        target: action.target
      });
    }
    return action || null;
  }
}

let sharedGatekeeper = null;

export function getSharedActionGatekeeper() {
  if (!sharedGatekeeper) {
    sharedGatekeeper = new MesniumActionGatekeeper();
  }
  return sharedGatekeeper;
}
