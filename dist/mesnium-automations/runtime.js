/**
 * MESNIUM AUTOMATION RUNTIME ENGINE (PHASE 13)
 * 
 * Orchestrates automation triggers, deterministic condition checks, variable resolution,
 * step execution, agent delegation, and Action Gatekeeper routing.
 */

import {
  AutomationStatus,
  AutomationRunStatus,
  ActionStepType
} from './types.js';

import { evaluateConditions, interpolateVariables } from './conditions.js';
import { getSharedAutomationRegistry } from './registry.js';
import { getSharedAgentRuntime } from '../mesnium-agents/runtime.js';
import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { ActionType } from '../mesnium-actions/types.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';
import { getSharedKnowledgeManager } from '../knowledge/agent-tool.js';

export class MesniumAutomationRuntime {
  constructor() {
    this.registry = getSharedAutomationRegistry();
    this.agentRuntime = getSharedAgentRuntime();
    this.agentRegistry = getSharedAgentRegistry();
    this.gatekeeper = getSharedActionGatekeeper();
    this.activityLedger = getSharedActivityLedger();
    this.runs = []; // In-memory + persisted execution history
  }

  /**
   * Triggers execution of an automation.
   */
  async triggerAutomation(automationId, eventPayload = {}, triggerSource = 'manual') {
    const startTime = Date.now();
    const automation = this.registry.getAutomation(automationId);

    if (!automation) {
      throw new Error(`Automation not found: ${automationId}`);
    }

    // 1. Status Guard
    if (automation.status === AutomationStatus.PAUSED) {
      throw new Error(`Cannot trigger automation "${automation.name}": Automation is currently paused. Resume automation to run.`);
    }

    if (automation.status === AutomationStatus.DRAFT) {
      throw new Error(`Cannot trigger automation "${automation.name}": Automation is in draft mode.`);
    }

    const runId = `run_${startTime}_${Math.random().toString(36).slice(2, 7)}`;
    const runRecord = {
      id: runId,
      automationId: automation.id,
      automationName: automation.name,
      status: AutomationRunStatus.RUNNING,
      startedAt: startTime,
      completedAt: null,
      durationMs: 0,
      triggeredBy: triggerSource,
      stepResults: [],
      result: null,
      error: null
    };

    this.runs.unshift(runRecord);
    if (this.runs.length > 500) this.runs.pop();

    const context = {
      trigger: { ...eventPayload, source: triggerSource },
      lead: eventPayload.lead || {},
      steps: {},
      previousStep: { result: null }
    };

    try {
      // 2. Condition Evaluation
      const conditionsMet = evaluateConditions(automation.conditions, context);
      if (!conditionsMet) {
        runRecord.status = AutomationRunStatus.SKIPPED;
        runRecord.completedAt = Date.now();
        runRecord.durationMs = runRecord.completedAt - startTime;
        runRecord.result = 'Conditions not met. Run skipped.';

        this.activityLedger.recordRun({
          agentId: automation.agentId || 'system',
          agentName: automation.name,
          prompt: `Automation Run: ${automation.name}`,
          status: 'skipped',
          result: 'Conditions evaluated to false. Workflow skipped.',
          startedAt: startTime,
          completedAt: Date.now()
        });

        return {
          runId,
          automationId: automation.id,
          status: AutomationRunStatus.SKIPPED,
          reason: 'Conditions not met.'
        };
      }

      // 3. Step Execution Loop
      for (const step of automation.steps) {
        const stepStartTime = Date.now();
        const resolvedPayload = interpolateVariables(step.payload, context);
        let stepOutput = null;

        switch (step.type) {
          // --- Deterministic Knowledge Search ---
          case ActionStepType.SEARCH_KNOWLEDGE: {
            const km = getSharedKnowledgeManager();
            if (km) {
              const hits = await km.search(resolvedPayload.query || '', {
                workspaceId: automation.workspaceId,
                limit: resolvedPayload.limit || 3
              });
              stepOutput = hits.map(h => ({ filename: h.filename, content: h.content }));
            } else {
              stepOutput = [];
            }
            break;
          }

          // --- Agent-Powered Step ---
          case ActionStepType.RUN_AGENT: {
            const targetAgentId = step.agentId || automation.agentId;
            if (!targetAgentId) {
              throw new Error(`Step "${step.id}" requires an Agent, but none was configured.`);
            }
            const agentRun = await this.agentRuntime.runAgent(targetAgentId, resolvedPayload.prompt || '');
            stepOutput = agentRun.answer;
            break;
          }

          // --- External Mutating Actions (Strictly Gated) ---
          case ActionStepType.SEND_EMAIL: {
            const targetAgentId = step.agentId || automation.agentId || 'agent_sales_assistant';
            const proposedAction = this.gatekeeper.proposeAction({
              agentId: targetAgentId,
              workspaceId: automation.workspaceId,
              actionType: ActionType.EMAIL_SEND,
              title: `Automation: ${automation.name} - Email to ${resolvedPayload.to}`,
              description: `Automated email generated by workflow "${automation.name}"`,
              target: resolvedPayload.to || 'Unknown Recipient',
              payload: resolvedPayload
            });

            stepOutput = {
              actionId: proposedAction.id,
              status: proposedAction.status,
              approvalRequired: proposedAction.approvalRequired,
              message: 'Email proposal created and routed to Action Gatekeeper for human approval.'
            };

            // If action is pending approval, pause the automation run in WAITING_APPROVAL state
            if (proposedAction.approvalRequired) {
              runRecord.status = AutomationRunStatus.WAITING_APPROVAL;
              runRecord.result = stepOutput;
              runRecord.completedAt = Date.now();
              runRecord.durationMs = runRecord.completedAt - startTime;

              this.registry.updateAutomation(automation.id, { lastRunAt: Date.now() });
              return {
                runId,
                automationId: automation.id,
                status: AutomationRunStatus.WAITING_APPROVAL,
                actionId: proposedAction.id,
                message: 'Action submitted to Approvals Hub for human review.'
              };
            }
            break;
          }

          default: {
            stepOutput = { success: true, message: `Completed step ${step.id}` };
          }
        }

        context.steps[step.id] = stepOutput;
        context.previousStep.result = stepOutput;

        runRecord.stepResults.push({
          stepId: step.id,
          type: step.type,
          status: 'completed',
          output: stepOutput,
          durationMs: Date.now() - stepStartTime
        });
      }

      // 4. Finalize Run Record
      const endTime = Date.now();
      runRecord.status = AutomationRunStatus.COMPLETED;
      runRecord.completedAt = endTime;
      runRecord.durationMs = endTime - startTime;
      runRecord.result = context.previousStep.result;

      this.registry.updateAutomation(automation.id, { lastRunAt: endTime });

      this.activityLedger.recordRun({
        agentId: automation.agentId || 'system',
        agentName: automation.name,
        prompt: `Automation Run: ${automation.name}`,
        status: 'completed',
        result: typeof runRecord.result === 'object' ? JSON.stringify(runRecord.result) : String(runRecord.result),
        startedAt: startTime,
        completedAt: endTime
      });

      return {
        runId,
        automationId: automation.id,
        status: AutomationRunStatus.COMPLETED,
        durationMs: runRecord.durationMs,
        result: runRecord.result
      };

    } catch (err) {
      const endTime = Date.now();
      runRecord.status = AutomationRunStatus.FAILED;
      runRecord.error = err.message;
      runRecord.completedAt = endTime;
      runRecord.durationMs = endTime - startTime;

      this.activityLedger.recordRun({
        agentId: automation.agentId || 'system',
        agentName: automation.name,
        prompt: `Failed Automation: ${automation.name}`,
        status: 'failed',
        error: err.message,
        startedAt: startTime,
        completedAt: endTime
      });

      throw err;
    }
  }

  listRuns({ automationId = null, limit = 50 } = {}) {
    let list = this.runs;
    if (automationId) {
      list = list.filter(r => r.automationId === automationId);
    }
    return list.slice(0, limit);
  }
}

let sharedRuntime = null;

export function getSharedAutomationRuntime() {
  if (!sharedRuntime) {
    sharedRuntime = new MesniumAutomationRuntime();
  }
  return sharedRuntime;
}
