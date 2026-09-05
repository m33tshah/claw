/**
 * MESNIUM ACTION POLICY ENGINE (PHASE 12)
 * 
 * Deterministic policy evaluator that determines action risk, approval requirements,
 * agent permission compliance, and integration availability.
 */

import { ActionType, RiskLevel } from './types.js';
import { AgentStatus, PermissionMode } from '../mesnium-agents/types.js';
import { getSharedIntegrationRegistry } from '../integrations/registry.js';

export class MesniumActionPolicy {
  constructor() {
    this.integrationRegistry = getSharedIntegrationRegistry();
  }

  /**
   * Deterministically classifies the risk level of an action.
   * This is never left to LLM discretion.
   */
  classifyRisk(actionType) {
    switch (actionType) {
      case ActionType.KNOWLEDGE_SEARCH:
      case ActionType.GOOGLE_DRIVE_READ:
      case ActionType.GMAIL_READ:
      case ActionType.CALENDAR_READ:
        return RiskLevel.LOW;

      case ActionType.EMAIL_DRAFT:
      case ActionType.CALENDAR_DRAFT:
        return RiskLevel.MEDIUM;

      case ActionType.EMAIL_SEND:
      case ActionType.CALENDAR_CREATE:
      case ActionType.CALENDAR_UPDATE:
      case ActionType.CALENDAR_DELETE:
        return RiskLevel.HIGH;

      default:
        return RiskLevel.HIGH; // Default to High for unknown actions
    }
  }

  /**
   * Checks if an action strictly requires human approval before execution.
   */
  requiresApproval(actionType) {
    const risk = this.classifyRisk(actionType);
    return risk === RiskLevel.HIGH;
  }

  /**
   * Evaluates an agent's permissions against a proposed action.
   */
  evaluateAgentPermissions(agent, actionType) {
    if (!agent) {
      return { allowed: false, reason: 'Agent does not exist.' };
    }

    if (agent.status === AgentStatus.PAUSED) {
      return { allowed: false, reason: `Cannot execute action: Agent "${agent.name}" is currently paused.` };
    }

    if (agent.status === AgentStatus.DRAFT) {
      return { allowed: false, reason: `Cannot execute action: Agent "${agent.name}" is in draft mode.` };
    }

    const risk = this.classifyRisk(actionType);

    // Read actions require READ permission
    if (risk === RiskLevel.LOW && agent.permissions && !agent.permissions[PermissionMode.READ]) {
      return { allowed: false, reason: `Agent "${agent.name}" lacks permission to read workspace data.` };
    }

    // High risk actions require PROPOSE permission at minimum
    if (risk === RiskLevel.HIGH && agent.permissions && !agent.permissions[PermissionMode.PROPOSE]) {
      return { allowed: false, reason: `Agent "${agent.name}" is not permitted to propose external actions.` };
    }


    const needsApproval = this.requiresApproval(actionType);

    return {
      allowed: true,
      requiresApproval: needsApproval,
      riskLevel: risk,
      reason: needsApproval
        ? `This action modifies external data (${actionType}), so it requires your approval before execution.`
        : 'Action is safe to execute within agent permissions.'
    };
  }

  /**
   * Checks if required external connections are connected and ready.
   */
  evaluateConnectionPrerequisites(actionType) {
    const googleActions = [
      ActionType.GOOGLE_DRIVE_READ,
      ActionType.GMAIL_READ,
      ActionType.CALENDAR_READ,
      ActionType.EMAIL_DRAFT,
      ActionType.EMAIL_SEND,
      ActionType.CALENDAR_DRAFT,
      ActionType.CALENDAR_CREATE,
      ActionType.CALENDAR_UPDATE,
      ActionType.CALENDAR_DELETE
    ];

    if (googleActions.includes(actionType)) {
      const googleIntegrations = this.integrationRegistry.listAccounts('google');
      const hasConnected = googleIntegrations.some(i => i.status === 'CONNECTED' || i.status === 'connected');
      if (!hasConnected) {
        return {
          ready: false,
          reason: 'Google Workspace connection is required to complete this action. Please reconnect Google Workspace.'
        };
      }
    }

    return { ready: true };
  }
}

let sharedPolicy = null;

export function getSharedActionPolicy() {
  if (!sharedPolicy) {
    sharedPolicy = new MesniumActionPolicy();
  }
  return sharedPolicy;
}
