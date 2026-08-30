/**
 * MESNIUM HUMAN-IN-THE-LOOP ACTION GATEKEEPER (PHASE 12)
 * 
 * Provides an unbypassable execution boundary between agent proposals and external mutating actions.
 * Enforces cryptographic payload integrity, strict expiration, deterministic policy re-checks,
 * and idempotency guarantees.
 */

import { ActionType, ActionStatus, RiskLevel, computePayloadHash } from './types.js';
import { getSharedActionPolicy } from './policy.js';
import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';

export class MesniumActionGatekeeper {
  constructor() {
    this.actions = new Map(); // id -> Action
    this.policy = getSharedActionPolicy();
    this.agentRegistry = getSharedAgentRegistry();
    this.activityLedger = getSharedActivityLedger();
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

    const action = {
      id,
      agentId: agent.id,
      agentName: agent.name,
      workspaceId,
      actionType,
      title: title || `${actionType} requested by ${agent.name}`,
      description,
      target,
      payload: { ...payload },
      payloadHash,
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
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);

    if (Date.now() > action.expiresAt) {
      action.status = ActionStatus.EXPIRED;
      throw new Error('Cannot approve action: Action proposal has expired.');
    }

    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot approve action: Current status is "${action.status}".`);
    }

    action.status = ActionStatus.APPROVED;
    action.approvedBy = approvedBy;
    action.approvedAt = Date.now();

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
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);

    if (action.status !== ActionStatus.PENDING_APPROVAL) {
      throw new Error(`Cannot reject action: Current status is "${action.status}".`);
    }

    action.status = ActionStatus.REJECTED;
    action.rejectedAt = Date.now();
    action.error = reason;

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
    const action = this.actions.get(actionId);
    if (!action) throw new Error(`Action not found: ${actionId}`);

    const now = Date.now();

    // 1. Check Expiration
    if (now > action.expiresAt) {
      action.status = ActionStatus.EXPIRED;
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
      throw new Error(`Execution blocked: Payload integrity violation. Action payload was modified after approval.`);
    }

    // 5. Re-evaluate Agent Status
    const agent = this.agentRegistry.getAgent(action.agentId);
    const policyResult = this.policy.evaluateAgentPermissions(agent, action.actionType);
    if (!policyResult.allowed) {
      action.status = ActionStatus.FAILED;
      action.error = policyResult.reason;
      throw new Error(`Execution blocked: ${policyResult.reason}`);
    }

    // 6. Re-evaluate External Connection
    const connResult = this.policy.evaluateConnectionPrerequisites(action.actionType);
    if (!connResult.ready) {
      action.status = ActionStatus.FAILED;
      action.error = connResult.reason;
      throw new Error(`Execution blocked: ${connResult.reason}`);
    }

    action.status = ActionStatus.EXECUTING;

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
    const now = Date.now();
    const list = Array.from(this.actions.values()).filter(a => {
      if (a.status !== ActionStatus.PENDING_APPROVAL) return false;
      if (now > a.expiresAt) {
        a.status = ActionStatus.EXPIRED;
        return false;
      }
      if (workspaceId && a.workspaceId !== workspaceId && a.workspaceId !== 'default') return false;
      return true;
    });
    return list;
  }

  /**
   * List all actions in the store.
   */
  listActions(filter = {}) {
    let list = Array.from(this.actions.values());
    if (filter.status) list = list.filter(a => a.status === filter.status);
    if (filter.agentId) list = list.filter(a => a.agentId === filter.agentId);
    return list;
  }
}

let sharedGatekeeper = null;

export function getSharedActionGatekeeper() {
  if (!sharedGatekeeper) {
    sharedGatekeeper = new MesniumActionGatekeeper();
  }
  return sharedGatekeeper;
}
