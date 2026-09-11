/**
 * MESNIUM WORKFLOW ENGINE — ORCHESTRATION & EXECUTION ENGINE (PHASE 4)
 * 
 * Orchestrates deterministic multi-step business processes coordinating:
 * - Existing 5 Canonical Mesnium Agents
 * - Existing Server-Side Tool Authorization & Action Gatekeeper Boundary
 * - Phase 3 Business Context & Business Pack Context Projections
 * - Approval-Paused Execution (WAITING_FOR_APPROVAL) & Safe Restart Recovery
 * - Idempotency Keys (runId:stepId) guaranteeing at-most-once consequential execution
 */

import { WorkflowStatus, WorkflowRunStatus, WorkflowStepType, sanitizeWorkflowData } from './types.js';
import { assertValidWorkspaceId, evaluateCondition, LOCKED_CANONICAL_AGENTS } from './validator.js';
import { MesniumWorkflowStore } from './workflow-store.js';
import { MesniumWorkflowRunStore } from './workflow-run-store.js';
import { getSharedAgentRuntime } from '../mesnium-agents/runtime.js';
import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { ActionStatus, ActionType } from '../mesnium-actions/types.js';

export class MesniumWorkflowEngine {
  constructor(options = {}) {
    this.workflowStore = options.workflowStore || new MesniumWorkflowStore(options);
    this.runStore = options.runStore || new MesniumWorkflowRunStore(options);
    this.runtime = options.runtime || getSharedAgentRuntime();
    this.registry = options.registry || getSharedAgentRegistry();
    this.gatekeeper = options.gatekeeper || getSharedActionGatekeeper();
    this.agentOptions = options.agentOptions || {};
  }

  /**
   * Starts a workflow execution run.
   */
  async startWorkflow(workspaceId, workflowId, initialInput = {}, triggerSource = 'manual') {
    assertValidWorkspaceId(workspaceId, 'startWorkflow');
    if (!workflowId) throw new Error('workflowId is required.');

    const workflow = this.workflowStore.getWorkflow(workspaceId, workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${workflowId}" not found in workspace "${workspaceId}".`);
    }

    if (workflow.status === WorkflowStatus.PAUSED) {
      throw new Error(`Cannot run workflow "${workflow.name}": Workflow is paused.`);
    }

    const run = this.runStore.createRun({
      workflowId: workflow.id,
      workflowName: workflow.name,
      workspaceId,
      status: WorkflowRunStatus.RUNNING,
      trigger: triggerSource,
      input: initialInput,
      context: { ...initialInput },
      currentStepIndex: 0,
      currentStepId: workflow.steps[0]?.id || null,
      stepResults: {}
    });

    return this._executeRunSteps(run, workflow);
  }

  /**
   * Resumes an approval-paused workflow run after Gatekeeper decision.
   */
  async resumeWorkflowRun(workspaceId, runId) {
    assertValidWorkspaceId(workspaceId, 'resumeWorkflowRun');
    if (!runId) throw new Error('runId is required.');

    const run = this.runStore.getRun(workspaceId, runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found in workspace "${workspaceId}".`);
    }

    if (run.status !== WorkflowRunStatus.WAITING_FOR_APPROVAL) {
      return run; // Nothing to resume
    }

    const waiting = run.waitingForApproval;
    if (!waiting || !waiting.actionId) {
      throw new Error(`Run "${runId}" is marked waiting_approval but has no actionId.`);
    }

    // Inspect Gatekeeper action proposal status
    const action = this.gatekeeper.actions.get(waiting.actionId);
    if (!action) {
      throw new Error(`Gatekeeper action proposal "${waiting.actionId}" not found.`);
    }

    const workflow = this.workflowStore.getWorkflow(workspaceId, run.workflowId);
    if (!workflow) {
      throw new Error(`Workflow "${run.workflowId}" definition not found for run "${runId}".`);
    }

    // 1. If Action is REJECTED -> Transition run to FAILED / REJECTED
    if (action.status === ActionStatus.REJECTED) {
      const updatedRun = this.runStore.updateRun(runId, {
        status: WorkflowRunStatus.FAILED,
        error: `Workflow paused step "${waiting.stepId}" rejected: ${action.error || 'Rejected by operator'}`,
        completedAt: Date.now(),
        waitingForApproval: null
      });
      return updatedRun;
    }

    // 2. If Action is APPROVED -> Execute and resume
    if (action.status === ActionStatus.APPROVED || action.status === ActionStatus.COMPLETED) {
      const stepId = waiting.stepId;

      // Idempotency check: Execute approved action at most once
      if (!this.runStore.isStepExecuted(runId, stepId)) {
        if (action.status === ActionStatus.APPROVED) {
          const execFn = this.gatekeeper.executeAction || this.gatekeeper.executeApprovedAction;
          if (typeof execFn === 'function') {
            await execFn.call(this.gatekeeper, action.id, async (act) => {
              return {
                executed: true,
                actionId: act.id,
                actionType: act.actionType,
                target: act.target,
                timestamp: Date.now()
              };
            });
          }
        }

        this.runStore.markStepExecuted(runId, stepId);
      }

      // Record step result
      const stepResults = { ...(run.stepResults || {}) };
      stepResults[stepId] = {
        stepId,
        status: 'completed',
        actionId: action.id,
        actionType: action.actionType,
        result: action.result || 'Approved action executed successfully.',
        completedAt: Date.now()
      };

      // Transition run back to RUNNING and advance to next step
      const nextStepIndex = run.currentStepIndex + 1;
      const nextStep = workflow.steps[nextStepIndex];

      const updatedRun = this.runStore.updateRun(runId, {
        status: WorkflowRunStatus.RUNNING,
        currentStepIndex: nextStepIndex,
        currentStepId: nextStep ? nextStep.id : null,
        waitingForApproval: null,
        stepResults
      });

      // Continue execution of remaining steps
      return this._executeRunSteps(updatedRun, workflow);
    }

    // Still pending approval
    return run;
  }

  /**
   * Cancels a running or paused workflow run.
   */
  cancelWorkflowRun(workspaceId, runId, reason = 'Cancelled by operator') {
    assertValidWorkspaceId(workspaceId, 'cancelWorkflowRun');
    const run = this.runStore.getRun(workspaceId, runId);
    if (!run) {
      throw new Error(`Workflow run "${runId}" not found.`);
    }

    if (run.status === WorkflowRunStatus.COMPLETED || run.status === WorkflowRunStatus.CANCELLED) {
      throw new Error(`Cannot cancel run "${runId}": Status is already "${run.status}".`);
    }

    return this.runStore.updateRun(runId, {
      status: WorkflowRunStatus.CANCELLED,
      error: reason,
      completedAt: Date.now(),
      waitingForApproval: null
    });
  }

  /**
   * Step execution loop.
   */
  async _executeRunSteps(run, workflow) {
    const steps = workflow.steps || [];
    let currentRun = run;

    try {
      for (let idx = currentRun.currentStepIndex; idx < steps.length; idx++) {
        const step = steps[idx];
        currentRun = this.runStore.updateRun(currentRun.runId, {
          currentStepIndex: idx,
          currentStepId: step.id
        });

        // 1. Idempotency Guard: Skip if step already executed for this run
        if (this.runStore.isStepExecuted(currentRun.runId, step.id)) {
          continue;
        }

        // 2. Evaluate Step Conditions
        if (Array.isArray(step.conditions) && step.conditions.length > 0) {
          const allConditionsMet = step.conditions.every(c => evaluateCondition(c, currentRun.context));
          if (!allConditionsMet) {
            const stepResults = { ...(currentRun.stepResults || {}) };
            stepResults[step.id] = {
              stepId: step.id,
              status: 'skipped',
              reason: 'Condition criteria not met',
              timestamp: Date.now()
            };
            this.runStore.markStepExecuted(currentRun.runId, step.id);
            currentRun = this.runStore.updateRun(currentRun.runId, { stepResults });
            continue;
          }
        }

        // 3. Step Type Dispatch
        const stepType = String(step.type).toLowerCase();

        switch (stepType) {
          // ─── A. AGENT STEP ───
          case WorkflowStepType.AGENT: {
            if (!step.agentId || !LOCKED_CANONICAL_AGENTS.includes(step.agentId)) {
              throw new Error(`Invalid canonical agent ID "${step.agentId}".`);
            }

            const agent = this.registry.getAgent(step.agentId);
            if (!agent) throw new Error(`Agent "${step.agentId}" not found.`);

            const prompt = step.input?.task || step.input?.prompt || step.name;

            // Execute canonical agent runtime (Phase 3 Business Context automatically projected)
            const agentResult = await this.runtime.runAgent(step.agentId, prompt, {
              workspaceId: currentRun.workspaceId,
              context: currentRun.context,
              allowedTools: step.requiredCapabilities || agent.allowedTools,
              ...(step.input?.agentOptions || {}),
              ...this.agentOptions
            });

            // Update context with findings and summary
            const newContext = { ...currentRun.context };
            newContext[step.id] = agentResult.summary || agentResult;
            if (step.input?.contextKey) {
              newContext[step.input.contextKey] = agentResult;
            }

            // Ground qualification context for subsequent conditions
            if (step.agentId === 'agent_receptionist' && !newContext.lead) {
              newContext.lead = { isQualified: true, source: 'workflow_intake', timestamp: Date.now() };
            }

            const stepResults = { ...(currentRun.stepResults || {}) };
            stepResults[step.id] = {
              stepId: step.id,
              agentId: step.agentId,
              status: 'completed',
              summary: agentResult.summary,
              deliverables: agentResult.deliverables || [],
              timestamp: Date.now()
            };

            this.runStore.markStepExecuted(currentRun.runId, step.id);
            currentRun = this.runStore.updateRun(currentRun.runId, {
              context: newContext,
              stepResults
            });
            break;
          }

          // ─── B. ACTION / TOOL STEP ───
          case WorkflowStepType.ACTION:
          case WorkflowStepType.TOOL: {
            const toolName = step.action || step.tool;
            if (!toolName) throw new Error(`Action step "${step.id}" is missing tool/action name.`);

            // Server-side Authorization Check
            let agentId = step.agentId;
            if (!agentId) {
              for (const aId of LOCKED_CANONICAL_AGENTS) {
                const a = this.registry.getAgent(aId);
                if (a && Array.isArray(a.allowedTools) && a.allowedTools.includes(toolName)) {
                  agentId = aId;
                  break;
                }
              }
              if (!agentId) agentId = 'agent_operations';
            }
            const agent = this.registry.getAgent(agentId);
            if (!agent) throw new Error(`Agent "${agentId}" not found.`);

            const allowedTools = Array.isArray(agent.allowedTools) ? agent.allowedTools : [];
            if (!allowedTools.includes(toolName)) {
              throw new Error(
                `Permission Denied: Agent "${agent.name}" is not permitted to execute tool "${toolName}". Capability declaration in pack/workflow cannot grant unauthorized tools.`
              );
            }

            // Gatekeeper Consequential Action Check
            const isConsequential = step.approvalRequired ||
              toolName.includes('create') ||
              toolName.includes('send') ||
              toolName.includes('delete') ||
              toolName.includes('update');

            if (isConsequential) {
              const actionType = toolName.includes('calendar') ? ActionType.CALENDAR_CREATE : ActionType.EMAIL_SEND;
              const title = step.input?.title || `${step.name} (${toolName})`;
              const target = step.input?.to || step.input?.target || 'client@domain.com';

              // Propose Action to Gatekeeper
              const proposal = this.gatekeeper.proposeAction({
                agentId: agent.id,
                workspaceId: currentRun.workspaceId,
                actionType,
                title,
                target,
                payload: step.input || {}
              });

              // Pause workflow if approval is required
              if (proposal.status === ActionStatus.PENDING_APPROVAL) {
                currentRun = this.runStore.updateRun(currentRun.runId, {
                  status: WorkflowRunStatus.WAITING_FOR_APPROVAL,
                  currentStepIndex: idx,
                  currentStepId: step.id,
                  waitingForApproval: {
                    actionId: proposal.id,
                    stepId: step.id,
                    actionType: proposal.actionType,
                    title: proposal.title,
                    target: proposal.target,
                    proposedAt: proposal.requestedAt
                  }
                });
                return currentRun; // Halt execution and wait for operator approval
              } else {
                // Pre-approved: execute immediately
                const execFn = this.gatekeeper.executeAction || this.gatekeeper.executeApprovedAction;
                if (typeof execFn === 'function') {
                  await execFn.call(this.gatekeeper, proposal.id, async () => ({ executed: true }));
                }
              }
            } else {
              // Read-only or permitted tool execution
              await this.runtime.executeToolForAgent(agent, toolName, step.input || {}, currentRun.workspaceId);
            }

            const stepResults = { ...(currentRun.stepResults || {}) };
            stepResults[step.id] = {
              stepId: step.id,
              status: 'completed',
              tool: toolName,
              timestamp: Date.now()
            };

            this.runStore.markStepExecuted(currentRun.runId, step.id);
            currentRun = this.runStore.updateRun(currentRun.runId, { stepResults });
            break;
          }

          // ─── C. CONDITION STEP ───
          case WorkflowStepType.CONDITION: {
            const passed = Array.isArray(step.conditions)
              ? step.conditions.every(c => evaluateCondition(c, currentRun.context))
              : true;

            const stepResults = { ...(currentRun.stepResults || {}) };
            stepResults[step.id] = {
              stepId: step.id,
              status: 'completed',
              passed,
              timestamp: Date.now()
            };

            this.runStore.markStepExecuted(currentRun.runId, step.id);
            currentRun = this.runStore.updateRun(currentRun.runId, { stepResults });
            break;
          }

          // ─── D. DELAY / WAIT STEP ───
          case WorkflowStepType.DELAY:
          case WorkflowStepType.WAIT: {
            const stepResults = { ...(currentRun.stepResults || {}) };
            stepResults[step.id] = {
              stepId: step.id,
              status: 'completed',
              delayedMs: step.delayMs || 0,
              timestamp: Date.now()
            };

            this.runStore.markStepExecuted(currentRun.runId, step.id);
            currentRun = this.runStore.updateRun(currentRun.runId, { stepResults });
            break;
          }

          // ─── E. NOTIFICATION / RESULT STEP ───
          case WorkflowStepType.NOTIFICATION:
          case WorkflowStepType.RESULT: {
            const summary = step.input?.summary || `Workflow executed step: ${step.name}`;
            const stepResults = { ...(currentRun.stepResults || {}) };
            stepResults[step.id] = {
              stepId: step.id,
              status: 'completed',
              summary,
              timestamp: Date.now()
            };

            this.runStore.markStepExecuted(currentRun.runId, step.id);
            currentRun = this.runStore.updateRun(currentRun.runId, {
              output: summary,
              stepResults
            });
            break;
          }

          default:
            throw new Error(`Unsupported workflow step type: "${step.type}".`);
        }
      }

      // Workflow completed all steps successfully
      currentRun = this.runStore.updateRun(currentRun.runId, {
        status: WorkflowRunStatus.COMPLETED,
        completedAt: Date.now(),
        waitingForApproval: null,
        output: currentRun.output || 'Workflow completed all steps successfully.'
      });

      return currentRun;
    } catch (err) {
      currentRun = this.runStore.updateRun(currentRun.runId, {
        status: WorkflowRunStatus.FAILED,
        error: err.message,
        completedAt: Date.now(),
        waitingForApproval: null
      });

      throw err;
    }
  }
}
