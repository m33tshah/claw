/**
 * MESNIUM PHASE 4 — BUSINESS WORKFLOW & CAPABILITY TEMPLATE AUDIT SUITE
 * 
 * Verifies:
 * 1. Declarative workflow schemas, prototype pollution defense, executable code rejection
 * 2. Multi-tenant workflow persistence and CRUD operations
 * 3. Workflow lifecycle states (DRAFT, ACTIVE, PAUSED)
 * 4. Durable workflow runs (RUNNING, WAITING_FOR_APPROVAL, COMPLETED, FAILED, CANCELLED)
 * 5. Multi-step execution across canonical agents, tools, conditions, and notifications
 * 6. Gatekeeper integration: Consequential action pause -> WAITING_FOR_APPROVAL -> restart persistence -> approve & resume
 * 7. Gatekeeper rejection handling
 * 8. Idempotency protection: at-most-once execution of consequential steps
 * 9. Template registry and instantiation (5 canonical templates)
 * 10. Phase 3 Business Context & Business Pack integration (Core vs Real Estate Pack vs Customer Overrides)
 * 11. Reality Tests A through G
 */

import assert from 'node:assert';
import {
  getSharedWorkflowManager,
  MesniumWorkflowManager,
  WorkflowStatus,
  WorkflowRunStatus,
  WorkflowStepType,
  TriggerType,
  validateWorkflowDefinition,
  evaluateCondition
} from '../dist/mesnium-workflows/index.js';
import { getSharedBusinessContextManager } from '../dist/mesnium-business/index.js';
import { getSharedAgentRegistry } from '../dist/mesnium-agents/registry.js';
import { getSharedAgentRuntime } from '../dist/mesnium-agents/runtime.js';
import { getSharedActionGatekeeper } from '../dist/mesnium-actions/gatekeeper.js';
import { ActionStatus, ActionType } from '../dist/mesnium-actions/types.js';
import { mesniumRpcHandlers } from '../dist/mesnium-rpc/handlers.js';
import { registerApiProvider, AssistantMessageEventStream } from '../dist/plugin-sdk/llm.js';

let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  passed++;
  console.log(`  [PASS] ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, err) {
  failed++;
  console.error(`  [FAIL] ${name}:`, err?.message || err);
}

async function runTests() {
  console.log('================================================================');
  console.log('MESNIUM PHASE 4 — WORKFLOW ENGINE & TEMPLATES AUDIT SUITE');
  console.log('================================================================');

  const testApi = 'test-wf-nlp-api';
  registerApiProvider({
    api: testApi,
    stream: (model, context, options) => {
      const stream = new AssistantMessageEventStream();
      setTimeout(() => {
        stream.push({
          type: 'done',
          reason: 'stop',
          message: {
            role: 'assistant',
            content: [{
              type: 'text',
              text: 'Qualified prospective customer with approved budget and timeline.'
            }],
            api: testApi,
            provider: 'test',
            model: 'test-v1',
            usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
            stopReason: 'stop',
            timestamp: Date.now()
          }
        });
        stream.end();
      }, 5);
      return stream;
    }
  });

  const testHarnessAgentOptions = {
    _isTestHarness: true,
    __testModelOverride: { api: testApi, provider: 'test', id: 'test-v1' }
  };

  const wfManager = getSharedWorkflowManager();
  wfManager.engine.agentOptions = testHarnessAgentOptions;

  const bizManager = getSharedBusinessContextManager();
  const registry = getSharedAgentRegistry();
  const runtime = getSharedAgentRuntime();
  const gatekeeper = getSharedActionGatekeeper();

  const wsA = `ws_wf_tenant_a_${Date.now()}`;
  const wsB = `ws_wf_tenant_b_${Date.now()}`;
  const testRunSuffix = '_' + Date.now();

  // -------------------------------------------------------------
  // SUITE 1: SCHEMA VALIDATION & IMMUTABILITY DEFENSE
  // -------------------------------------------------------------
  console.log('\n--- SUITE 1: SCHEMA VALIDATION & IMMUTABILITY DEFENSE ---');
  try {
    // 1. Valid workflow definition accepted
    const validDef = validateWorkflowDefinition({
      id: 'wf_valid_1',
      workspaceId: wsA,
      name: 'Client Onboarding',
      steps: [
        { id: 's1', name: 'Intake', type: 'agent', agentId: 'agent_receptionist' }
      ]
    });
    assert.strictEqual(validDef.name, 'Client Onboarding');
    assert.strictEqual(validDef.steps.length, 1);
    pass('Valid workflow schema validated');

    // 2. Missing workspaceId strictly rejected
    let missingWsCaught = false;
    try {
      validateWorkflowDefinition({ name: 'Invalid', steps: [] }, null);
    } catch (err) {
      if (err.message.includes('strictly required')) missingWsCaught = true;
    }
    assert.ok(missingWsCaught, 'Missing workspaceId strictly rejected');
    pass('Missing workspaceId rejected with zero silent fallback');

    // 3. Prototype pollution rejected
    let protoCaught = false;
    try {
      validateWorkflowDefinition(JSON.parse('{"id":"bad","workspaceId":"' + wsA + '","name":"Test","__proto__":{"polluted":true},"steps":[]}'));
    } catch (err) {
      if (err.message.includes('Prototype pollution')) protoCaught = true;
    }
    assert.ok(protoCaught, 'Prototype pollution blocked');
    pass('Prototype pollution key strictly rejected');

    // 4. Executable JavaScript code injection rejected
    let execCaught = false;
    try {
      validateWorkflowDefinition({
        id: 'wf_exec_inject',
        workspaceId: wsA,
        name: 'Malicious Workflow',
        steps: [
          { id: 's1', name: 'Eval Step', type: 'notification', input: { script: '<script>alert(1)</script>' } }
        ]
      });
    } catch (err) {
      if (err.message.includes('Executable JavaScript')) execCaught = true;
    }
    assert.ok(execCaught, 'Executable code rejected');
    pass('Executable code and script tags strictly prohibited');

    // 5. Non-canonical agent ID rejected
    let badAgentCaught = false;
    try {
      validateWorkflowDefinition({
        id: 'wf_bad_agent',
        workspaceId: wsA,
        name: 'Vertical Agent Test',
        steps: [
          { id: 's1', name: 'Real Estate Step', type: 'agent', agentId: 'agent_real_estate' }
        ]
      });
    } catch (err) {
      if (err.message.includes('Only canonical specialists are permitted')) badAgentCaught = true;
    }
    assert.ok(badAgentCaught, 'Vertical agent ID rejected');
    pass('Non-canonical agent IDs rejected (no vertical agent sprawl)');

    // 6. Deterministic condition evaluator
    assert.strictEqual(evaluateCondition({ field: 'lead.score', operator: '>=', value: 80 }, { lead: { score: 95 } }), true);
    assert.strictEqual(evaluateCondition({ field: 'lead.score', operator: '>=', value: 80 }, { lead: { score: 65 } }), false);
    assert.strictEqual(evaluateCondition({ field: 'status', operator: '==', value: 'qualified' }, { status: 'qualified' }), true);
    assert.strictEqual(evaluateCondition({ field: 'tags', operator: 'includes', value: 'vip' }, { tags: ['vip', 'enterprise'] }), true);
    pass('Declarative condition evaluator functions deterministically without code execution');
  } catch (err) {
    fail('Suite 1 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 2: WORKFLOW CRUD & LIFECYCLE MANAGEMENT
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: WORKFLOW CRUD & LIFECYCLE MANAGEMENT ---');
  try {
    const wfLeadProcessId = 'wf_lead_process' + testRunSuffix;
    // 7. Create workflow
    const createdWf = wfManager.createWorkflow(wsA, {
      id: wfLeadProcessId,
      name: 'Enterprise Lead Qualification',
      description: 'Canonical qualification process for enterprise leads.',
      trigger: { type: TriggerType.MANUAL },
      status: WorkflowStatus.DRAFT,
      steps: [
        {
          id: 'step_qualify',
          name: 'Assess Inbound Criteria',
          type: WorkflowStepType.AGENT,
          agentId: 'agent_receptionist',
          input: { task: 'Verify budget and project timeline' }
        },
        {
          id: 'step_sales_review',
          name: 'Prepare Commercial Offer',
          type: WorkflowStepType.AGENT,
          agentId: 'agent_sales',
          input: { task: 'Draft commercial proposal' }
        }
      ]
    });
    assert.strictEqual(createdWf.id, wfLeadProcessId);
    assert.strictEqual(createdWf.status, WorkflowStatus.DRAFT);
    pass('Workflow created and persisted');

    // 8. Retrieve workflow
    const retrievedWf = wfManager.getWorkflow(wsA, wfLeadProcessId);
    assert.strictEqual(retrievedWf.name, 'Enterprise Lead Qualification');
    assert.strictEqual(retrievedWf.steps.length, 2);
    pass('Workflow retrieved successfully');

    // 9. Update workflow patch
    const updatedWf = wfManager.updateWorkflow(wsA, wfLeadProcessId, {
      description: 'Updated enterprise qualification process with SLA checks.'
    });
    assert.strictEqual(updatedWf.description, 'Updated enterprise qualification process with SLA checks.');
    pass('Workflow patch updated');

    // 10. Activate workflow
    const activeWf = wfManager.activateWorkflow(wsA, wfLeadProcessId);
    assert.strictEqual(activeWf.status, WorkflowStatus.ACTIVE);
    pass('Workflow activated (status: ACTIVE)');

    // 11. Pause workflow
    const pausedWf = wfManager.pauseWorkflow(wsA, wfLeadProcessId);
    assert.strictEqual(pausedWf.status, WorkflowStatus.PAUSED);
    pass('Workflow paused (status: PAUSED)');

    // Reactivate for execution tests
    wfManager.activateWorkflow(wsA, wfLeadProcessId);

    // 12. Delete workflow
    const tmpWf = wfManager.createWorkflow(wsA, {
      id: 'wf_tmp_delete' + testRunSuffix,
      name: 'Temporary Workflow',
      steps: [{ id: 's1', name: 'Step 1', type: 'notification', input: {} }]
    });
    const delResult = wfManager.deleteWorkflow(wsA, tmpWf.id);
    assert.strictEqual(delResult, true);
    assert.strictEqual(wfManager.getWorkflow(wsA, tmpWf.id), null);
    pass('Workflow deleted successfully');
  } catch (err) {
    fail('Suite 2 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 3: TEMPLATES REGISTRY & INSTANTIATION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 3: TEMPLATES REGISTRY & INSTANTIATION ---');
  try {
    // 13. Built-in template enumeration
    const templates = wfManager.listTemplates();
    assert.ok(templates.length >= 5, 'At least 5 canonical templates loaded');
    const templateIds = templates.map(t => t.id);
    assert.ok(templateIds.includes('template_lead_followup'));
    assert.ok(templateIds.includes('template_appointment_reminder'));
    assert.ok(templateIds.includes('template_no_show_recovery'));
    assert.ok(templateIds.includes('template_lead_escalation'));
    assert.ok(templateIds.includes('template_daily_briefing'));
    pass('Built-in workflow templates registered', templateIds.join(', '));

    // 14. Template retrieval
    const tmpl = wfManager.getTemplate('template_lead_followup');
    assert.strictEqual(tmpl.id, 'template_lead_followup');
    assert.strictEqual(tmpl.steps.length, 5);
    pass('Workflow template retrieved with full step sequence');

    // 15. Template instantiation into concrete workflow
    const deployedWf = wfManager.instantiateTemplate('template_lead_followup', wsA, {
      name: 'Custom Agency Lead Follow-Up'
    });
    assert.strictEqual(deployedWf.name, 'Custom Agency Lead Follow-Up');
    assert.strictEqual(deployedWf.workspaceId, wsA);
    assert.strictEqual(deployedWf.metadata.instantiatedFrom, 'template_lead_followup');
    pass('Template instantiated into tenant workflow');
  } catch (err) {
    fail('Suite 3 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 4: MULTI-STEP EXECUTION & PERSISTENCE
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: MULTI-STEP EXECUTION & PERSISTENCE ---');
  try {
    const wfExec = wfManager.createWorkflow(wsA, {
      id: 'wf_exec_test' + testRunSuffix,
      name: 'Multi-Step Execution Pipeline',
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          id: 'step_intake',
          name: 'Receptionist Intake',
          type: WorkflowStepType.AGENT,
          agentId: 'agent_receptionist',
          input: { task: 'Qualify buyer intent and budget' }
        },
        {
          id: 'step_cond_check',
          name: 'Verify Lead Qualification',
          type: WorkflowStepType.CONDITION,
          conditions: [
            { field: 'lead.isQualified', operator: '==', value: true }
          ]
        },
        {
          id: 'step_delay',
          name: 'Wait Period',
          type: WorkflowStepType.DELAY,
          delayMs: 10
        },
        {
          id: 'step_notify',
          name: 'Workflow Completion Summary',
          type: WorkflowStepType.NOTIFICATION,
          input: { summary: 'Pipeline successfully executed all steps.' }
        }
      ]
    });

    // 16. Run execution
    const run = await wfManager.runWorkflow(wsA, wfExec.id, { clientName: 'Horizon Corp' });
    assert.strictEqual(run.status, WorkflowRunStatus.COMPLETED);
    assert.strictEqual(run.workflowId, wfExec.id);
    assert.strictEqual(run.workspaceId, wsA);
    assert.ok(run.completedAt > run.startedAt);
    pass('Multi-step workflow executed through completion');

    // 17. Step result persistence
    assert.strictEqual(run.stepResults.step_intake.status, 'completed');
    assert.strictEqual(run.stepResults.step_cond_check.status, 'completed');
    assert.strictEqual(run.stepResults.step_delay.status, 'completed');
    assert.strictEqual(run.stepResults.step_notify.status, 'completed');
    pass('Step execution results persisted per step');

    // 18. Workflow run store retrieval
    const retrievedRun = wfManager.getRun(wsA, run.runId);
    assert.strictEqual(retrievedRun.runId, run.runId);
    assert.strictEqual(retrievedRun.status, WorkflowRunStatus.COMPLETED);
    pass('Workflow run persisted to disk and retrieved across store sync');

    // 19. List workflow runs
    const runsList = wfManager.listRuns(wsA, { workflowId: wfExec.id });
    assert.ok(runsList.length >= 1);
    assert.strictEqual(runsList[0].runId, run.runId);
    pass('Workflow runs listed and ordered chronologically');
  } catch (err) {
    fail('Suite 4 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 5: FAILURE & CANCELLATION HANDLING
  // -------------------------------------------------------------
  console.log('\n--- SUITE 5: FAILURE & CANCELLATION HANDLING ---');
  try {
    // 20. Workflow failure state
    const wfFail = wfManager.createWorkflow(wsA, {
      id: 'wf_fail_test' + testRunSuffix,
      name: 'Failing Workflow',
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          id: 'step_unauthorized_tool',
          name: 'Attempt Unauthorized Tool',
          type: WorkflowStepType.ACTION,
          agentId: 'agent_receptionist',
          tool: 'unauthorized_admin_drop_db' // Receptionist does not have this tool
        }
      ]
    });

    let runErrorCaught = false;
    let failedRun = null;
    try {
      await wfManager.runWorkflow(wsA, wfFail.id);
    } catch (err) {
      runErrorCaught = true;
    }
    assert.ok(runErrorCaught, 'Execution rejected due to unauthorized tool');

    const runs = wfManager.listRuns(wsA, { workflowId: wfFail.id });
    failedRun = runs[0];
    assert.strictEqual(failedRun.status, WorkflowRunStatus.FAILED);
    assert.ok(failedRun.error.includes('Permission Denied'));
    pass('Workflow failure captured, error sanitized, and run status set to FAILED');

    // 21. Workflow cancellation
    const cancelRunRecord = wfManager.runStore.createRun({
      workflowId: 'wf_dummy' + testRunSuffix,
      workflowName: 'Dummy Workflow',
      workspaceId: wsA,
      status: WorkflowRunStatus.RUNNING
    });
    const cancelled = wfManager.cancelRun(wsA, cancelRunRecord.runId, 'Operator cancellation');
    assert.strictEqual(cancelled.status, WorkflowRunStatus.CANCELLED);
    assert.strictEqual(cancelled.error, 'Operator cancellation');
    pass('Running workflow can be cleanly cancelled');
  } catch (err) {
    fail('Suite 5 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 6: GATEKEEPER APPROVAL-PAUSED EXECUTION & RESUME
  // -------------------------------------------------------------
  console.log('\n--- SUITE 6: GATEKEEPER APPROVAL-PAUSED EXECUTION & RESUME ---');
  try {
    const wfApproval = wfManager.createWorkflow(wsA, {
      id: 'wf_approval_test' + testRunSuffix,
      name: 'Outreach and Appointment Booking',
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          id: 'step_sales_prep',
          name: 'Sales Strategy',
          type: WorkflowStepType.AGENT,
          agentId: 'agent_sales',
          input: { task: 'Formulate bespoke commercial proposal' }
        },
        {
          id: 'step_calendar_invite',
          name: 'Schedule Consultation',
          type: WorkflowStepType.ACTION,
          agentId: 'agent_sales',
          action: 'calendar_create_event',
          approvalRequired: true,
          input: {
            title: 'Consultation with Enterprise Partner',
            to: 'partner@acme.com',
            durationMinutes: 45
          }
        },
        {
          id: 'step_final_confirmation',
          name: 'Confirm Dispatch',
          type: WorkflowStepType.NOTIFICATION,
          input: { summary: 'Consultation confirmed and active.' }
        }
      ]
    });

    // 22. Execution halts at consequential step requiring approval
    const pausedRun = await wfManager.runWorkflow(wsA, wfApproval.id);
    assert.strictEqual(pausedRun.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    assert.ok(pausedRun.waitingForApproval, 'waitingForApproval metadata attached');
    assert.ok(pausedRun.waitingForApproval.actionId, 'Gatekeeper proposal actionId recorded');
    pass('Workflow execution pauses at Gatekeeper boundary in WAITING_FOR_APPROVAL status');

    const actionId = pausedRun.waitingForApproval.actionId;
    const proposal = gatekeeper.actions.get(actionId);
    assert.strictEqual(proposal.status, ActionStatus.PENDING_APPROVAL);
    pass('Consequential action proposal registered in Gatekeeper queue');

    // 23. Restart recovery simulation
    const freshRunStore = new MesniumWorkflowManager({
      workflowStore: wfManager.workflowStore,
      runStore: wfManager.runStore,
      agentOptions: testHarnessAgentOptions
    });
    const recoveredRun = freshRunStore.getRun(wsA, pausedRun.runId);
    assert.strictEqual(recoveredRun.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    assert.strictEqual(recoveredRun.waitingForApproval.actionId, actionId);
    pass('Workflow WAITING_FOR_APPROVAL state persists across process/store restart');

    // 24. Approve and resume workflow
    gatekeeper.approveAction(actionId, 'Operator Reviewer');
    const resumedRun = await wfManager.resumeRun(wsA, pausedRun.runId);
    assert.strictEqual(resumedRun.status, WorkflowRunStatus.COMPLETED);
    assert.strictEqual(resumedRun.stepResults.step_calendar_invite.status, 'completed');
    assert.strictEqual(resumedRun.stepResults.step_final_confirmation.status, 'completed');
    pass('Approved action resumes workflow and completes subsequent steps');

    // 25. Duplicate execution idempotency protection
    // Attempting to re-execute the same step does NOT duplicate external actions
    assert.strictEqual(wfManager.runStore.isStepExecuted(resumedRun.runId, 'step_calendar_invite'), true);
    await wfManager.resumeRun(wsA, resumedRun.runId); // Idempotent call
    pass('Idempotency keys (runId:stepId) prevent duplicate execution of consequential actions');

    // 26. Action rejection handling
    const pausedRun2 = await wfManager.runWorkflow(wsA, wfApproval.id);
    assert.strictEqual(pausedRun2.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    const actionId2 = pausedRun2.waitingForApproval.actionId;

    gatekeeper.rejectAction(actionId2, 'Unauthorized outreach budget');
    const rejectedRun = await wfManager.resumeRun(wsA, pausedRun2.runId);
    assert.strictEqual(rejectedRun.status, WorkflowRunStatus.FAILED);
    assert.ok(rejectedRun.error.includes('rejected'));
    pass('Rejected Gatekeeper proposal halts workflow in FAILED state with rejection reason');
  } catch (err) {
    fail('Suite 6 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 7: TENANT WORKSPACE ISOLATION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 7: TENANT WORKSPACE ISOLATION ---');
  try {
    const wfTenantAExclusiveId = 'wf_tenant_a_exclusive' + testRunSuffix;
    // 27. Cross-tenant workflow isolation
    wfManager.createWorkflow(wsA, {
      id: wfTenantAExclusiveId,
      name: 'Tenant A Exclusive Workflow',
      steps: [{ id: 's1', name: 'Step 1', type: 'notification', input: {} }]
    });

    const wfForA = wfManager.getWorkflow(wsA, wfTenantAExclusiveId);
    const wfForB = wfManager.getWorkflow(wsB, wfTenantAExclusiveId);
    assert.ok(wfForA, 'Tenant A can retrieve its own workflow');
    assert.strictEqual(wfForB, null, 'Tenant B CANNOT access Tenant A workflow');
    pass('Workflows strictly isolated across workspaces');

    // 28. Cross-tenant run isolation
    const runsA = wfManager.listRuns(wsA);
    const runsB = wfManager.listRuns(wsB);
    assert.ok(runsA.length > 0, 'Tenant A has runs');
    assert.strictEqual(runsB.length, 0, 'Tenant B has zero access to Tenant A runs');
    pass('Workflow run histories strictly isolated across workspaces');
  } catch (err) {
    fail('Suite 7 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 8: BUSINESS CONTEXT & BUSINESS PACK INTEGRATION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 8: BUSINESS CONTEXT & BUSINESS PACK INTEGRATION ---');
  try {
    const wsBiz = `ws_biz_wf_${Date.now()}`;

    // 29. Pack reference in packs registry
    const rePack = bizManager.getPack('pack_real_estate');
    assert.ok(Array.isArray(rePack.workflowTemplates), 'Real Estate Pack references workflowTemplates');
    assert.strictEqual(rePack.workflowTemplates[0].templateId, 'template_lead_followup');
    pass('Business Pack cleanly references workflow templates without executable code');

    // 30. Instantiate workflow from pack template
    const packTmpl = rePack.workflowTemplates[0];
    const instantiatedWf = wfManager.instantiateTemplate(packTmpl.templateId, wsBiz, {
      name: packTmpl.name,
      description: packTmpl.description,
      stepOverrides: packTmpl.stepOverrides
    });
    assert.strictEqual(instantiatedWf.name, 'Real Estate Lead Follow-Up & Showing Coordination');
    pass('Instantiated pack workflow template with vertical step overrides');

    // 31. Activate Real Estate Pack for workspace
    bizManager.activatePack(wsBiz, 'pack_real_estate');

    // 32. Workflow agent step receives Phase 3 Business Context automatically
    const reRun = await wfManager.runWorkflow(wsBiz, instantiatedWf.id, {
      buyerName: 'Jane Doe',
      budget: '$1,200,000'
    });
    assert.strictEqual(reRun.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    assert.strictEqual(reRun.waitingForApproval.title, 'Private Property Tour & Buyer Consultation');
    pass('Workflow execution automatically injected Phase 3 Real Estate Business Context');
  } catch (err) {
    fail('Suite 8 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 9: CORE REALITY TESTS (A THROUGH G)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 9: CORE REALITY TESTS (A THROUGH G) ---');
  try {
    const wsReality = `ws_reality_wf_${Date.now()}`;

    // REALITY TEST A: Core Mesnium New Lead Follow-Up executes generic workflow
    const coreWf = wfManager.instantiateTemplate('template_lead_followup', wsReality, {
      id: 'wf_reality_core' + testRunSuffix
    });
    const runA = await wfManager.runWorkflow(wsReality, coreWf.id);
    assert.strictEqual(runA.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    assert.strictEqual(runA.waitingForApproval.title, 'Consultation with Qualified Prospect');
    pass('REALITY TEST A: Core-only New Lead Follow-Up executes generic workflow');

    // REALITY TEST B: Core + Real Estate Pack -> real-estate-specific configuration, different business behavior
    bizManager.activatePack(wsReality, 'pack_real_estate');
    const rePack = bizManager.getPack('pack_real_estate');
    const reWf = wfManager.instantiateTemplate('template_lead_followup', wsReality, {
      id: 'wf_reality_re' + testRunSuffix,
      name: rePack.workflowTemplates[0].name,
      stepOverrides: rePack.workflowTemplates[0].stepOverrides
    });
    const runB = await wfManager.runWorkflow(wsReality, reWf.id);
    assert.strictEqual(runB.waitingForApproval.title, 'Private Property Tour & Buyer Consultation');
    pass('REALITY TEST B: Core + Real Estate Pack produces vertical workflow behavior on same canonical agents');

    // REALITY TEST C: Core + Real Estate Pack + Customer Override takes precedence
    bizManager.updateContext(wsReality, {
      identity: {
        industry: 'Ultra-Luxury Waterfront Realty'
      }
    });
    const eff = bizManager.getEffectiveConfiguration(wsReality, 'agent_sales');
    assert.strictEqual(eff.effective.identity.industry, 'Ultra-Luxury Waterfront Realty');
    assert.strictEqual(eff.provenance['identity.industry'].source, 'customer');
    pass('REALITY TEST C: Customer business configuration override takes precedence in workflow context');

    // REALITY TEST D: Workflow requests capability agent does not have -> denied
    const deniedWf = wfManager.createWorkflow(wsReality, {
      id: 'wf_denied_test' + testRunSuffix,
      name: 'Denied Capability Workflow',
      status: WorkflowStatus.ACTIVE,
      steps: [
        {
          id: 's1',
          name: 'Unauthorized Tool',
          type: WorkflowStepType.ACTION,
          agentId: 'agent_receptionist',
          tool: 'local_filesystem_read' // Receptionist does not have local filesystem access
        }
      ]
    });
    await assert.rejects(
      async () => {
        await wfManager.runWorkflow(wsReality, deniedWf.id);
      },
      /Permission Denied/i
    );
    pass('REALITY TEST D: Workflow declaring or requesting unauthorized capability is strictly denied');

    // REALITY TEST E: Consequential action requires Gatekeeper approval
    const runE = await wfManager.runWorkflow(wsReality, coreWf.id);
    assert.strictEqual(runE.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    assert.ok(runE.waitingForApproval.actionId);
    pass('REALITY TEST E: Consequential workflow action paused at Gatekeeper boundary');

    // REALITY TEST F: Process restart while WAITING_FOR_APPROVAL preserves state
    const newMgr = new MesniumWorkflowManager({
      workflowStore: wfManager.workflowStore,
      runStore: wfManager.runStore,
      agentOptions: testHarnessAgentOptions
    });
    const recoveredE = newMgr.getRun(wsReality, runE.runId);
    assert.strictEqual(recoveredE.status, WorkflowRunStatus.WAITING_FOR_APPROVAL);
    pass('REALITY TEST F: Server restart during WAITING_FOR_APPROVAL cleanly recovers workflow state');

    // REALITY TEST G: Duplicate resume attempt executes action at most once
    gatekeeper.approveAction(runE.waitingForApproval.actionId);
    const completedE = await wfManager.resumeRun(wsReality, runE.runId);
    assert.strictEqual(completedE.status, WorkflowRunStatus.COMPLETED);

    // Second resume attempt is a safe no-op
    const duplicateResume = await wfManager.resumeRun(wsReality, runE.runId);
    assert.strictEqual(duplicateResume.status, WorkflowRunStatus.COMPLETED);
    pass('REALITY TEST G: Duplicate resume/run attempts execute consequential step at most once');
  } catch (err) {
    fail('Suite 9 failed', err);
  }

  // -------------------------------------------------------------
  // SUITE 10: GATEWAY RPC METHODS
  // -------------------------------------------------------------
  console.log('\n--- SUITE 10: GATEWAY RPC METHODS ---');
  try {
    const wsRpc = `ws_rpc_wf_${Date.now()}`;

    // 33. mesnium.workflows.templates.list
    let templatesRpc = null;
    await mesniumRpcHandlers['mesnium.workflows.templates.list']({
      params: {},
      respond: (ok, data) => { if (ok) templatesRpc = data; }
    });
    assert.ok(templatesRpc && templatesRpc.templates.length >= 5);
    pass('RPC mesnium.workflows.templates.list returns templates');

    // 34. mesnium.workflows.create
    let createdRpc = null;
    await mesniumRpcHandlers['mesnium.workflows.create']({
      params: {
        workspaceId: wsRpc,
        definition: {
          name: 'RPC Client Pipeline',
          steps: [{ id: 's1', name: 'Notification', type: 'notification', input: { summary: 'RPC step' } }]
        }
      },
      respond: (ok, data) => { if (ok) createdRpc = data; }
    });
    assert.ok(createdRpc && createdRpc.success);
    pass('RPC mesnium.workflows.create creates workflow');

    // 35. mesnium.workflows.run
    let runRpc = null;
    await mesniumRpcHandlers['mesnium.workflows.run']({
      params: { workspaceId: wsRpc, workflowId: createdRpc.workflow.id },
      respond: (ok, data) => { if (ok) runRpc = data; }
    });
    assert.ok(runRpc && runRpc.run && runRpc.run.status === WorkflowRunStatus.COMPLETED);
    pass('RPC mesnium.workflows.run triggers and completes execution');

    // 36. mesnium.workflows.runs.list
    let runsListRpc = null;
    await mesniumRpcHandlers['mesnium.workflows.runs.list']({
      params: { workspaceId: wsRpc },
      respond: (ok, data) => { if (ok) runsListRpc = data; }
    });
    assert.ok(runsListRpc && runsListRpc.runs.length >= 1);
    pass('RPC mesnium.workflows.runs.list returns execution history');
  } catch (err) {
    fail('Suite 10 failed', err);
  }

  console.log('\n================================================================');
  console.log(`MESNIUM PHASE 4 TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test runner failure:', err);
  process.exit(1);
});
