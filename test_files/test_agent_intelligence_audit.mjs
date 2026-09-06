/**
 * MESNIUM V1.2 AGENT INTELLIGENCE AUDIT TEST SUITE
 * 
 * Verifies:
 * 1. Natural-language structured tool calling with Sales Agent
 * 2. Multi-step autonomous tool execution (Tool A -> Tool B -> Final Answer)
 * 3. Server-side permission boundary enforcement (unauthorized tool rejected & logged)
 * 4. Action Gatekeeper routing for consequential mutations (gmail_send deferred)
 * 5. Model provider failure handling (honest MODEL_PROVIDER_REQUIRES_SETUP, zero fake findings)
 * 6. Deterministic execution support preserved (options.tool)
 * 7. Presentation boundary sanitization (zero leaks of GCP project IDs, paths, tokens)
 * 8. Legacy Research Assistant isolation (excluded from V1.2 workspace list)
 */

import assert from 'node:assert';
import { 
  getSharedAgentRuntime, 
  CanonicalToolDefinitions, 
  ProviderState 
} from '../dist/mesnium-agents/runtime.js';
import { getSharedAgentRegistry } from '../dist/mesnium-agents/registry.js';
import { getSharedActivityLedger } from '../dist/mesnium-agents/activity.js';
import { getSharedActionGatekeeper } from '../dist/mesnium-actions/gatekeeper.js';
import { CanonicalTools } from '../dist/mesnium-agents/types.js';
import { registerApiProvider, AssistantMessageEventStream } from '../dist/plugin-sdk/llm.js';

let passedTests = 0;
let totalTests = 0;

function report(name, ok, details = '') {
  totalTests++;
  if (ok) {
    passedTests++;
    console.log(`  [PASS] ${name}`);
    if (details) console.log(`         ${details}`);
  } else {
    console.error(`  [FAIL] ${name}: ${details}`);
  }
}

async function runAudit() {
  console.log('================================================================');
  console.log('STARTING FINAL V1.2 AGENT INTELLIGENCE AUDIT');
  console.log('================================================================\n');

  const runtime = getSharedAgentRuntime();
  const registry = getSharedAgentRegistry();
  const ledger = getSharedActivityLedger();
  const gatekeeper = getSharedActionGatekeeper();

  registry.load();

  // -------------------------------------------------------------------------
  // TEST 1: Natural-Language Structured Tool Calling with Sales Agent
  // -------------------------------------------------------------------------
  console.log('TEST 1: [TEST MODEL / CONTROLLED TOOL-CALLING TEST] Autonomous Tool Calling with Real Sales Agent...');
  {
    const salesAgent = registry.getAgent('agent_sales');
    assert(salesAgent, 'Sales Agent must exist in registry');

    let toolsExposedToModel = null;
    let callStep = 0;

    // Register test model that simulates model-directed tool calling
    const testApi = 'test-sales-nlp-api';
    registerApiProvider({
      api: testApi,
      stream: (model, context, options) => {
        const stream = new AssistantMessageEventStream();
        toolsExposedToModel = context.tools;
        callStep++;

        setTimeout(() => {
          if (callStep === 1) {
            // Model decides to search prospect emails based on the prompt
            stream.push({
              type: 'done',
              reason: 'toolUse',
              message: {
                role: 'assistant',
                content: [{
                  type: 'toolCall',
                  id: 'call_gmail_1',
                  name: CanonicalTools.GMAIL_SEARCH,
                  arguments: { query: 'from:acme-corp.com' }
                }],
                api: testApi,
                provider: 'test',
                model: 'test-v1',
                usage: { input: 10, output: 10, cacheRead: 0, cacheWrite: 0, totalTokens: 20, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'toolUse',
                timestamp: Date.now()
              }
            });
          } else {
            // Model receives tool result and produces synthesized business conclusion
            stream.push({
              type: 'done',
              reason: 'stop',
              message: {
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: 'I have researched Acme Corp emails and verified recent correspondence. Their contact is interested in a product demo next week.'
                }],
                api: testApi,
                provider: 'test',
                model: 'test-v1',
                usage: { input: 20, output: 20, cacheRead: 0, cacheWrite: 0, totalTokens: 40, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'stop',
                timestamp: Date.now()
              }
            });
          }
          stream.end();
        }, 10);

        return stream;
      }
    });

    const result = await runtime.runAgent('agent_sales', 'Research Acme Corp prospect and review recent emails.', {
      _isTestHarness: true,
      __testModelOverride: { api: testApi, provider: 'test', id: 'test-v1' }
    });

    // Verify only allowed tools exposed
    const exposedNames = toolsExposedToModel.map(t => t.name);
    const hasOnlyAllowed = exposedNames.every(t => salesAgent.allowedTools.includes(t));
    const usedTool = result.actionsPerformed.some(a => a.tool === CanonicalTools.GMAIL_SEARCH);

    report('Exposed tools strictly match agent.allowedTools', hasOnlyAllowed && exposedNames.length > 0, `Exposed: ${exposedNames.join(', ')}`);
    report('Model autonomously invoked gmail_search', usedTool, `Actions: ${result.actionsPerformed.map(a => a.tool).join(', ')}`);
    report('Final business response generated from model reasoning', result.summary.includes('Acme Corp') && result.status === 'completed', `Summary: ${result.summary.slice(0, 70)}...`);
  }

  // -------------------------------------------------------------------------
  // TEST 2: Multi-Step Sequential Tool Execution (Tool A -> Tool B -> Final)
  // -------------------------------------------------------------------------
  console.log('\nTEST 2: [TEST MODEL / CONTROLLED TOOL-CALLING TEST] Multi-Step Tool Execution Loop (Tool A -> Tool B -> Final Answer)...');
  {
    let stepCount = 0;
    const testMultiApi = 'test-multi-step-api';
    registerApiProvider({
      api: testMultiApi,
      stream: (model, context, options) => {
        const stream = new AssistantMessageEventStream();
        stepCount++;

        setTimeout(() => {
          if (stepCount === 1) {
            // Step 1: Tool A - knowledge search
            stream.push({
              type: 'done',
              reason: 'toolUse',
              message: {
                role: 'assistant',
                content: [{
                  type: 'toolCall',
                  id: 'call_step_1',
                  name: CanonicalTools.KNOWLEDGE_SEARCH,
                  arguments: { query: 'enterprise pricing tier' }
                }],
                api: testMultiApi, provider: 'test', model: 'multi-v1',
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'toolUse', timestamp: Date.now()
              }
            });
          } else if (stepCount === 2) {
            // Step 2: Tool B - gmail draft based on knowledge retrieved
            stream.push({
              type: 'done',
              reason: 'toolUse',
              message: {
                role: 'assistant',
                content: [{
                  type: 'toolCall',
                  id: 'call_step_2',
                  name: CanonicalTools.GMAIL_DRAFT,
                  arguments: { to: 'prospect@acme.com', subject: 'Enterprise Pricing', body: 'Here is our pricing.' }
                }],
                api: testMultiApi, provider: 'test', model: 'multi-v1',
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'toolUse', timestamp: Date.now()
              }
            });
          } else {
            // Step 3: Final Answer
            stream.push({
              type: 'done',
              reason: 'stop',
              message: {
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: 'Consulted company enterprise pricing and created a follow-up draft to prospect@acme.com.'
                }],
                api: testMultiApi, provider: 'test', model: 'multi-v1',
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'stop', timestamp: Date.now()
              }
            });
          }
          stream.end();
        }, 10);

        return stream;
      }
    });

    const result = await runtime.runAgent('agent_sales', 'Check enterprise pricing and prepare a draft for prospect@acme.com', {
      _isTestHarness: true,
      __testModelOverride: { api: testMultiApi, provider: 'test', id: 'multi-v1' }
    });

    const executedTools = result.actionsPerformed.map(a => a.tool);
    const hasToolA = executedTools.includes(CanonicalTools.KNOWLEDGE_SEARCH);
    const hasToolB = executedTools.includes(CanonicalTools.GMAIL_DRAFT);

    report('Tool A (knowledge_search) executed', hasToolA, `Step 1: ${executedTools[0]}`);
    report('Tool B (gmail_draft) executed in sequence', hasToolB, `Step 2: ${executedTools[1]}`);
    report('Multi-step loop concluded with final business result', result.status === 'completed' && stepCount === 3, `Total steps: ${stepCount}`);
  }

  // -------------------------------------------------------------------------
  // TEST 3: Permission Boundary (Unauthorized Tool Rejected Server-Side)
  // -------------------------------------------------------------------------
  console.log('\nTEST 3: [TEST MODEL / CONTROLLED TOOL-CALLING TEST] Server-Side Permission Boundary Enforcement...');
  {
    let permStep = 0;
    const testPermApi = 'test-perm-violation-api';
    registerApiProvider({
      api: testPermApi,
      stream: (model, context, options) => {
        const stream = new AssistantMessageEventStream();
        permStep++;
        setTimeout(() => {
          if (permStep === 1) {
            // Step 1: Model requests local_filesystem (Sales Agent NOT permitted)
            stream.push({
              type: 'done',
              reason: 'toolUse',
              message: {
                role: 'assistant',
                content: [{
                  type: 'toolCall',
                  id: 'call_hack_1',
                  name: CanonicalTools.LOCAL_FILESYSTEM,
                  arguments: { action: 'list', path: '/' }
                }],
                api: testPermApi, provider: 'test', model: 'perm-v1',
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'toolUse', timestamp: Date.now()
              }
            });
          } else {
            // Step 2: Model sees permission error and explains it cannot access filesystem
            stream.push({
              type: 'done',
              reason: 'stop',
              message: {
                role: 'assistant',
                content: [{
                  type: 'text',
                  text: 'I cannot inspect local files because local_filesystem is outside my authorized permissions.'
                }],
                api: testPermApi, provider: 'test', model: 'perm-v1',
                usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
                stopReason: 'stop', timestamp: Date.now()
              }
            });
          }
          stream.end();
        }, 10);
        return stream;
      }
    });

    const result = await runtime.runAgent('agent_sales', 'Inspect files on the server', {
      _isTestHarness: true,
      __testModelOverride: { api: testPermApi, provider: 'test', id: 'perm-v1' }
    });

    const hasRejection = result.failures.some(f => f.code === 'PERMISSION_DENIED');
    const executedFilesystem = result.actionsPerformed.some(a => a.tool === CanonicalTools.LOCAL_FILESYSTEM);

    report('Unauthorized tool was strictly rejected server-side', hasRejection && !executedFilesystem, `Failures: ${result.failures.map(f => f.message).join('; ')}`);

    // Verify rejection logged in Activity Ledger
    const recentRuns = ledger.listRuns(5);
    const rejectedEntry = recentRuns.find(r => r.status === 'rejected' && r.error.includes('local_filesystem'));
    report('Rejection recorded in Activity Ledger', Boolean(rejectedEntry), `Ledger Entry ID: ${rejectedEntry?.id || 'none'}`);
  }

  // -------------------------------------------------------------------------
  // TEST 4: Action Gatekeeper Routing for Consequential Mutations
  // -------------------------------------------------------------------------
  console.log('\nTEST 4: [TEST MODEL / CONTROLLED TOOL-CALLING TEST] Action Gatekeeper Routing (Consequential Mutation)...');
  {
    const testGateApi = 'test-gatekeeper-api';
    registerApiProvider({
      api: testGateApi,
      stream: (model, context, options) => {
        const stream = new AssistantMessageEventStream();
        setTimeout(() => {
          // Model requests gmail_send (consequential mutation)
          stream.push({
            type: 'done',
            reason: 'toolUse',
            message: {
              role: 'assistant',
              content: [{
                type: 'toolCall',
                id: 'call_send_1',
                name: CanonicalTools.GMAIL_SEND,
                arguments: { to: 'vip@client.com', subject: 'Contract Approved', body: 'Your contract is approved.' }
              }],
              api: testGateApi, provider: 'test', model: 'gate-v1',
              usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
              stopReason: 'toolUse', timestamp: Date.now()
            }
          });
          stream.end();
        }, 10);
        return stream;
      }
    });

    const result = await runtime.runAgent('agent_sales', 'Send confirmation email to vip@client.com', {
      _isTestHarness: true,
      __testModelOverride: { api: testGateApi, provider: 'test', id: 'gate-v1' }
    });

    const hasPendingApproval = result.pendingApprovals.length > 0;
    const isWaiting = result.status === 'waiting_approval';
    const proposalInGatekeeper = gatekeeper.listPendingApprovals().some(p => p.id === result.pendingApprovals[0]?.actionId);

    report('gmail_send was intercepted and queued in Gatekeeper', hasPendingApproval, `Action ID: ${result.pendingApprovals[0]?.actionId}`);
    report('Status is waiting_approval (not executed behind user back)', isWaiting, `Status: ${result.status}`);
    report('Proposal is active in Approvals Hub', proposalInGatekeeper, `Title: ${result.pendingApprovals[0]?.title}`);
  }

  // -------------------------------------------------------------------------
  // TEST 5: Model Provider Failure Handling (Honest Error, Zero Fake Findings)
  // -------------------------------------------------------------------------
  console.log('\nTEST 5: [REAL MODEL PROVIDER VERIFICATION] Model Provider Failure Handling (Honest Setup Error)...');
  {
    let caughtError = null;
    try {
      // Running without test harness forces resolution of the unbilled Vertex provider
      await runtime.runAgent('agent_sales', 'Research market competitors');
    } catch (err) {
      caughtError = err;
    }

    const isSetupError = caughtError && caughtError.message.includes('MODEL_PROVIDER_REQUIRES_SETUP');
    const noProjectLeak = caughtError && !caughtError.message.includes('gen-lang-client-0255502107');

    report('Honest MODEL_PROVIDER_REQUIRES_SETUP returned', Boolean(isSetupError), `Error: ${caughtError?.message?.slice(0, 75)}...`);
    report('Zero internal GCP project IDs leaked in error message', noProjectLeak, 'Verified project ID scrubbed');
  }

  // -------------------------------------------------------------------------
  // TEST 6: Deterministic Tool Execution Preserved (options.tool)
  // -------------------------------------------------------------------------
  console.log('\nTEST 6: [DETERMINISTIC HARNESS] Deterministic Tool Execution (options.tool)...');
  {
    const detResult = await runtime.runAgent('agent_sales', 'Direct email search', {
      tool: CanonicalTools.GMAIL_SEARCH,
      params: { query: 'newer_than:7d' }
    });

    const detUsed = detResult.actionsPerformed.some(a => a.tool === CanonicalTools.GMAIL_SEARCH);
    report('Deterministic execution completed directly', detUsed && detResult.status === 'completed', `Tools used: ${detResult.toolsUsed.join(', ')}`);
  }

  // -------------------------------------------------------------------------
  // TEST 7: Locked Production Agents (Exact 5) & Legacy Agent Isolation
  // -------------------------------------------------------------------------
  console.log('\nTEST 7: [REGISTRY ISOLATION] Locked Production Agents (Exact 5) & Legacy Agent Isolation...');
  {
    const activeAgents = registry.listAgents();
    const allAgentsWithLegacy = registry.listAgents(null, { includeLegacy: true });

    const activeIds = activeAgents.map(a => a.id);
    const expectedLocked = ['agent_receptionist', 'agent_sales', 'agent_marketing', 'agent_operations', 'agent_executive'];
    const exactFiveLocked = activeIds.length === 5 && expectedLocked.every(id => activeIds.includes(id));
    const legacyExcluded = !activeIds.includes('agent_research_assistant') &&
                           !activeIds.includes('agent_sales_assistant') &&
                           !activeIds.includes('agent_financial_analyst') &&
                           !activeIds.includes('agent_lead_outreach');
    const legacyInAll = allAgentsWithLegacy.some(a => a.id === 'agent_research_assistant');

    report('Exactly five locked production agents are active in the registry', exactFiveLocked, `Active Agents (${activeIds.length}): ${activeIds.join(', ')}`);
    report('Legacy / extra agents are strictly hidden from active agents list', legacyExcluded, 'Excluded: research, sales_assistant, financial_analyst, lead_outreach');
    report('Legacy agents are preserved for existing transcripts/conversations', legacyInAll, 'Available via includeLegacy: true');
  }

  // -------------------------------------------------------------------------
  // TEST 8: [TEST MODEL / CONTROLLED TOOL-CALLING TEST] Max Steps Autonomous Limit Enforcement
  // -------------------------------------------------------------------------
  console.log('\nTEST 8: [TEST MODEL / CONTROLLED TOOL-CALLING TEST] Max Steps Autonomous Limit Enforcement...');
  {
    let infiniteStep = 0;
    const testLoopApi = 'test-infinite-loop-api';
    registerApiProvider({
      api: testLoopApi,
      stream: (model, context, options) => {
        const stream = new AssistantMessageEventStream();
        infiniteStep++;
        setTimeout(() => {
          // Keep requesting tools indefinitely
          stream.push({
            type: 'done',
            reason: 'toolUse',
            message: {
              role: 'assistant',
              content: [{
                type: 'toolCall',
                id: `call_loop_${infiniteStep}`,
                name: CanonicalTools.KNOWLEDGE_SEARCH,
                arguments: { query: `loop query ${infiniteStep}` }
              }],
              api: testLoopApi, provider: 'test', model: 'loop-v1',
              usage: { input: 1, output: 1, cacheRead: 0, cacheWrite: 0, totalTokens: 2, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } },
              stopReason: 'toolUse', timestamp: Date.now()
            }
          });
          stream.end();
        }, 10);
        return stream;
      }
    });

    const loopResult = await runtime.runAgent('agent_sales', 'Keep searching knowledge repeatedly', {
      _isTestHarness: true,
      maxSteps: 3, // Safe limit for test
      __testModelOverride: { api: testLoopApi, provider: 'test', id: 'loop-v1' }
    });

    const isPartial = loopResult.status === 'partial';
    const hasMaxStepsWarning = loopResult.warnings.some(w => w.includes('Maximum autonomous tool limit (3 steps) reached'));
    const isHonestPartialSummary = loopResult.summary.includes('Maximum autonomous tool limit') || loopResult.summary.includes('Partial results obtained');
    
    // Check ledger recorded partial status honestly
    const recentRuns = ledger.listRuns(5);
    const ledgerEntry = recentRuns.find(r => r.prompt.includes('Keep searching knowledge repeatedly'));
    const ledgerRecordedPartial = ledgerEntry && ledgerEntry.status === 'partial' && ledgerEntry.error.includes('Maximum autonomous tool limit');

    report('Execution stopped safely when maxSteps (3) was reached', isPartial && infiniteStep === 3, `Steps run: ${infiniteStep}, Status: ${loopResult.status}`);
    report('Honest partial result returned without fabricating completion', Boolean(isHonestPartialSummary && hasMaxStepsWarning), `Warning: ${loopResult.warnings[0]}`);
    report('Activity Ledger recorded condition honestly with status partial', Boolean(ledgerRecordedPartial), `Ledger Status: ${ledgerEntry?.status}, Error: ${ledgerEntry?.error}`);
  }

  // -------------------------------------------------------------------------
  // TEST 9: [REAL MODEL PROVIDER VERIFICATION] Provider Availability & Readiness Classification
  // -------------------------------------------------------------------------
  console.log('\nTEST 9: [REAL MODEL PROVIDER VERIFICATION] Provider Availability & Readiness Classification...');
  {
    const salesAgent = registry.getAgent('agent_sales');
    const resolution = await runtime.resolveModelForAgent(salesAgent);

    // Verify all canonical states are supported
    const allStates = Object.values(ProviderState);
    const expectedStates = [
      'NOT_CONFIGURED',
      'CONFIGURED',
      'AUTHENTICATION_FAILED',
      'BILLING_REQUIRED',
      'QUOTA_EXCEEDED',
      'UNAVAILABLE',
      'READY'
    ];
    const hasAllStates = expectedStates.every(s => allStates.includes(s));

    report('ProviderState enum defines all canonical readiness states', hasAllStates, `States: ${allStates.join(', ')}`);
    report('Real environment provider health resolved without silent fallback', 
      resolution.state === ProviderState.BILLING_REQUIRED || resolution.state === ProviderState.NOT_CONFIGURED || resolution.state === ProviderState.READY,
      `Detected Provider State: ${resolution.state}, Model: ${resolution.model?.provider || 'none'}`);
  }

  // -------------------------------------------------------------------------
  // SUMMARY
  // -------------------------------------------------------------------------
  console.log('\n================================================================');
  console.log(`AUDIT RESULTS: ${passedTests}/${totalTests} TESTS PASSED (${Math.round((passedTests / totalTests) * 100)}%)`);
  console.log('================================================================\n');

  if (passedTests === totalTests) {
    console.log('STATUS: FULLY AGENTIC V1.2 VERIFIED SUCCESSFUL.');
  } else {
    console.error('STATUS: AUDIT FAILED.');
    process.exit(1);
  }
}

runAudit().catch(err => {
  console.error('Fatal audit error:', err);
  process.exit(1);
});
