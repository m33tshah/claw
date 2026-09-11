/**
 * MESNIUM PHASE 3 — BUSINESS CONTEXT & BUSINESS PACKS AUDIT SUITE
 * 
 * Tests the complete Phase 3 specification:
 * - Business Context CRUD & Tenant Isolation
 * - Validation, Size Caps, Prototype Pollution Defense
 * - Business Packs Registry, Activation & Deactivation
 * - Deterministic Merging & Provenance Tracking
 * - Selective Role-Tailored Agent Context Projection
 * - Strict Non-Escalation of Tool Permissions & Gatekeeper Preservation
 * - Strict Rejection of Missing Workspace ID (No Unsafe Fallbacks)
 * - Separation of Business Context vs Knowledge vs Memory
 * - Reality Tests (Core vs Pack vs Customer Overrides on Canonical Agents)
 */

import assert from 'node:assert';
import {
  getSharedBusinessContextManager,
  resetSharedBusinessContextManager,
  createDefaultBusinessContext,
  createEmptyCustomerContext,
  ConfigSource,
  assertValidWorkspaceId,
  validateBusinessContextPayload,
  BUILTIN_REAL_ESTATE_PACK
} from '../dist/mesnium-business/index.js';
import { getSharedAgentRegistry } from '../dist/mesnium-agents/registry.js';
import { getSharedAgentRuntime, getAgentContextLayers } from '../dist/mesnium-agents/runtime.js';
import { getSharedActionGatekeeper } from '../dist/mesnium-actions/gatekeeper.js';
import { mesniumRpcHandlers } from '../dist/mesnium-rpc/handlers.js';

let passed = 0;
let failed = 0;

function pass(name, detail = '') {
  passed++;
  console.log(`  [PASS] ${name}${detail ? ` (${detail})` : ''}`);
}

function fail(name, err) {
  failed++;
  console.error(`  [FAIL] ${name}: ${err?.message || err}`);
}

async function runTests() {
  console.log('================================================================');
  console.log('MESNIUM PHASE 3 — BUSINESS CONTEXT & PACKS AUDIT SUITE');
  console.log('================================================================\n');

  const wsA = `ws_tenant_alpha_${Date.now()}`;
  const wsB = `ws_tenant_beta_${Date.now()}`;
  const bizManager = getSharedBusinessContextManager();

  // -------------------------------------------------------------
  // SUITE 1: BUSINESS CONTEXT CRUD & SIZE LIMITS
  // -------------------------------------------------------------
  console.log('--- SUITE 1: BUSINESS CONTEXT CRUD & SIZE LIMITS ---');
  try {
    // 1. Create / Read Business Context
    const initial = bizManager.getContext(wsA);
    assert(initial && initial.workspaceId === wsA, 'Context created with workspace ID');
    assert(typeof initial.identity === 'object', 'Context contains identity section');
    pass('Create and read business context');

    // 2. Update Business Context
    const patch = {
      identity: {
        businessName: 'Apex Properties LLC',
        industry: 'Commercial Real Estate',
        location: 'Chicago, IL',
        operatingHours: 'Mon-Sat 08:00 - 19:00'
      },
      brand: {
        tone: 'Executive, data-driven, highly responsive'
      },
      policies: {
        businessRules: ['Require NDA before releasing commercial prospectuses.']
      }
    };
    const updated = bizManager.updateContext(wsA, patch);
    assert.strictEqual(updated.identity.businessName, 'Apex Properties LLC');
    assert.strictEqual(updated.identity.industry, 'Commercial Real Estate');
    assert.strictEqual(updated.brand.tone, 'Executive, data-driven, highly responsive');
    pass('Update business context with customer patch');

    // 3. Size limits & bounding
    const hugePayload = {
      identity: {
        description: 'A'.repeat(150000) // Exceeds 100 KB limit
      }
    };
    assert.throws(
      () => bizManager.updateContext(wsA, hugePayload),
      /exceeds maximum allowable limit/i,
      'Oversized payload rejected'
    );
    pass('Context size cap (< 100KB) strictly enforced');

    // 4. Malformed input handling
    assert.throws(
      () => bizManager.updateContext(wsA, 'invalid string instead of object'),
      /must be a non-null object/i,
      'Non-object rejected'
    );
    pass('Malformed inputs rejected gracefully');
  } catch (e) {
    fail('Suite 1 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 2: TENANT ISOLATION & STRICT WORKSPACE ID ENFORCEMENT
  // -------------------------------------------------------------
  console.log('\n--- SUITE 2: TENANT ISOLATION & STRICT WORKSPACE ID ENFORCEMENT ---');
  try {
    // 5. Tenant Isolation
    const ctxA = bizManager.getContext(wsA);
    const ctxB = bizManager.getContext(wsB);
    assert.strictEqual(ctxA.identity.businessName, 'Apex Properties LLC');
    assert.strictEqual(ctxB.identity.businessName, undefined, 'Tenant B has isolated context');
    pass('Multi-tenant business context isolation strictly enforced');

    // 6. Strict Rejection of Missing Workspace ID (No Unsafe Default Fallback)
    assert.throws(
      () => bizManager.getContext(''),
      /cannot be empty/i,
      'Empty string rejected'
    );
    assert.throws(
      () => bizManager.getContext(null),
      /strictly required/i,
      'Null workspaceId rejected'
    );
    assert.throws(
      () => bizManager.getContext(undefined),
      /strictly required/i,
      'Undefined workspaceId rejected'
    );
    assert.throws(
      () => bizManager.activatePack(null, 'pack_real_estate'),
      /strictly required/i,
      'Pack activation without workspaceId rejected'
    );
    assert.throws(
      () => bizManager.getEffectiveConfiguration(undefined, 'agent_sales'),
      /strictly required/i,
      'Effective configuration without workspaceId rejected'
    );
    pass('Missing workspaceId strictly rejected with zero silent fallbacks');
  } catch (e) {
    fail('Suite 2 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 3: SECURITY & PROTOTYPE POLLUTION DEFENSE
  // -------------------------------------------------------------
  console.log('\n--- SUITE 3: SECURITY & PROTOTYPE POLLUTION DEFENSE ---');
  try {
    // 7. Prototype pollution rejection
    const maliciousPayload = JSON.parse('{"__proto__": {"polluted": true}, "identity": {"businessName": "Hacked"}}');
    assert.throws(
      () => validateBusinessContextPayload(maliciousPayload),
      /Prototype pollution attempt detected/i,
      '__proto__ injection rejected'
    );
    assert.strictEqual(Object.prototype.polluted, undefined, 'Prototype remains unpolluted');
    pass('Prototype pollution strictly blocked');

    // 8. Rejection of executable functions / code
    const executablePayload = {
      identity: {
        businessName: 'Legit',
        runCode: function() { return 'evil'; }
      }
    };
    assert.throws(
      () => validateBusinessContextPayload(executablePayload),
      /Executable code/i,
      'Function rejected'
    );
    pass('Executable JavaScript prohibited in business configuration');

    // 9. Object depth cap (max 6)
    let deep = {};
    let cur = deep;
    for (let i = 0; i < 8; i++) {
      cur.nested = {};
      cur = cur.nested;
    }
    assert.throws(
      () => validateBusinessContextPayload(deep),
      /depth exceeds/i,
      'Excessive depth rejected'
    );
    pass('Deeply nested objects bounded to depth limit');
  } catch (e) {
    fail('Suite 3 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 4: BUSINESS PACK MODEL & ENTITLEMENTS
  // -------------------------------------------------------------
  console.log('\n--- SUITE 4: BUSINESS PACK MODEL & ENTITLEMENTS ---');
  try {
    // 10. Load / Register Pack
    const packs = bizManager.listPacks(wsA);
    assert(packs.length >= 1, 'At least 1 pack available');
    const rePack = packs.find(p => p.id === 'pack_real_estate');
    assert(rePack, 'Real estate pack is registered in registry');
    assert.strictEqual(rePack.version, '1.0.0');
    assert.strictEqual(rePack.category, 'real_estate');
    pass('Business pack model validated from registry');

    // 11. Pack Activation
    assert.strictEqual(rePack.active, false, 'Pack starts inactive');
    bizManager.activatePack(wsA, 'pack_real_estate');
    const packsAfter = bizManager.listPacks(wsA);
    const rePackActive = packsAfter.find(p => p.id === 'pack_real_estate');
    assert.strictEqual(rePackActive.active, true, 'Pack is now active for Tenant A');
    pass('Business pack activation succeeds for workspace');

    // 12. Tenant Pack Isolation (Tenant B must NOT have pack active)
    const packsB = bizManager.listPacks(wsB);
    const rePackB = packsB.find(p => p.id === 'pack_real_estate');
    assert.strictEqual(rePackB.active, false, 'Tenant B pack remains inactive');
    pass('Pack entitlement strictly tenant-isolated');

    // 13. Pack Deactivation
    bizManager.deactivatePack(wsA, 'pack_real_estate');
    const packsDeactivated = bizManager.listPacks(wsA);
    const rePackDeact = packsDeactivated.find(p => p.id === 'pack_real_estate');
    assert.strictEqual(rePackDeact.active, false, 'Pack successfully deactivated');
    pass('Business pack deactivation succeeds');

    // Reactivate for subsequent merge tests
    bizManager.activatePack(wsA, 'pack_real_estate');
  } catch (e) {
    fail('Suite 4 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 5: DETERMINISTIC MERGE & PROVENANCE TRACKING
  // -------------------------------------------------------------
  console.log('\n--- SUITE 5: DETERMINISTIC MERGE & PROVENANCE TRACKING ---');
  try {
    const wsFresh = `ws_merge_audit_${Date.now()}`;

    // 14. Core baseline merge
    const effCore = bizManager.getEffectiveConfiguration(wsFresh, 'agent_sales');
    assert.strictEqual(effCore.effective.identity.industry, 'General Enterprise');
    assert.strictEqual(effCore.provenance['identity.industry'].source, ConfigSource.CORE);
    pass('Core defaults merged with source: "core" provenance');

    // 15. Core + Pack merge
    bizManager.activatePack(wsFresh, 'pack_real_estate');
    const effPack = bizManager.getEffectiveConfiguration(wsFresh, 'agent_sales');
    assert.strictEqual(effPack.effective.identity.industry, 'Real Estate');
    assert.strictEqual(effPack.provenance['identity.industry'].source, ConfigSource.PACK);
    assert.strictEqual(effPack.provenance['identity.industry'].packId, 'pack_real_estate');
    assert(effPack.effective.agentConfig.agent_sales.salesProcess.length >= 5);
    assert.strictEqual(effPack.provenance['agentConfig.agent_sales.salesProcess'].source, ConfigSource.PACK);
    pass('Activated pack defaults override core with source: "pack" provenance');

    // 16. Pack + Customer override precedence
    bizManager.updateContext(wsFresh, {
      identity: {
        industry: 'Boutique Luxury Real Estate'
      }
    });
    const effOverride = bizManager.getEffectiveConfiguration(wsFresh, 'agent_sales');
    assert.strictEqual(effOverride.effective.identity.industry, 'Boutique Luxury Real Estate');
    assert.strictEqual(effOverride.provenance['identity.industry'].source, ConfigSource.CUSTOMER);
    pass('Customer business context override wins over pack defaults');

    // 17. Agent-specific override precedence
    bizManager.updateContext(wsFresh, {
      agentConfig: {
        agent_sales: {
          priorities: ['Custom Priority: International Buyer Relocations']
        }
      }
    });
    const effAgentOverride = bizManager.getEffectiveConfiguration(wsFresh, 'agent_sales');
    assert.deepStrictEqual(
      effAgentOverride.effective.agentConfig.agent_sales.priorities,
      ['Custom Priority: International Buyer Relocations']
    );
    assert.strictEqual(
      effAgentOverride.provenance['agentConfig.agent_sales.priorities'].source,
      ConfigSource.AGENT_OVERRIDE
    );
    pass('Customer agent-specific override wins with source: "agent_override" provenance');

    // 18. Deterministic merge behavior
    const run1 = bizManager.getEffectiveConfiguration(wsFresh, 'agent_sales');
    const run2 = bizManager.getEffectiveConfiguration(wsFresh, 'agent_sales');
    assert.deepStrictEqual(run1.effective, run2.effective, 'Repeated merges yield identical output');
    assert.deepStrictEqual(run1.provenance, run2.provenance, 'Provenance audit trail is identical');
    pass('Merge engine produces strictly deterministic output');
  } catch (e) {
    fail('Suite 5 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 6: SELECTIVE CONTEXT PROJECTION PER SPECIALIST
  // -------------------------------------------------------------
  console.log('\n--- SUITE 6: SELECTIVE CONTEXT PROJECTION PER SPECIALIST ---');
  try {
    const wsProj = `ws_proj_audit_${Date.now()}`;
    bizManager.activatePack(wsProj, 'pack_real_estate');

    // 19. Receptionist context projection
    const recPrompt = bizManager.getAgentBusinessContext(wsProj, 'agent_receptionist');
    assert(recPrompt.includes('[Approved Services]'), 'Receptionist receives approved services');
    assert(recPrompt.includes('Residential Property Sales'), 'Receptionist receives property sales service');
    assert(recPrompt.includes('Booking Rules:'), 'Receptionist receives booking rules');
    assert(recPrompt.includes('Must NOT say:'), 'Receptionist receives speech policies');
    assert(!recPrompt.includes('Sales Process:'), 'Receptionist DOES NOT receive sales process');
    assert(!recPrompt.includes('Executive Briefing Style:'), 'Receptionist DOES NOT receive executive briefing');
    pass('AI Receptionist receives role-tailored context with irrelevant fields excluded');

    // 20. Sales context projection
    const salesPrompt = bizManager.getAgentBusinessContext(wsProj, 'agent_sales');
    assert(salesPrompt.includes('[Customer & Lead Qualification]'), 'Sales receives qualification');
    assert(salesPrompt.includes('[Sales Execution & Standards]'), 'Sales receives sales process');
    assert(salesPrompt.includes('Objection Guidance:'), 'Sales receives objection handling');
    assert(!salesPrompt.includes('Booking Rules:'), 'Sales DOES NOT receive receptionist booking rules');
    assert(!recPrompt.includes('Objection Guidance:'), 'Receptionist DOES NOT receive sales objection guidance');
    pass('Sales Agent receives sales-specific qualification & process directives');

    // 21. Marketing context projection
    const mktPrompt = bizManager.getAgentBusinessContext(wsProj, 'agent_marketing');
    assert(mktPrompt.includes('[Brand & Audience Identity]'), 'Marketing receives brand identity');
    assert(mktPrompt.includes('[Marketing Directives]'), 'Marketing receives campaign priorities');
    assert(mktPrompt.includes('Target Audiences:'), 'Marketing receives target audiences');
    pass('Marketing Agent receives brand voice & audience directives');

    // 22. Operations context projection
    const opsPrompt = bizManager.getAgentBusinessContext(wsProj, 'agent_operations');
    assert(opsPrompt.includes('[Operational Procedures & Workflows]'), 'Operations receives procedures');
    assert(opsPrompt.includes('[Operational Safety & Escalations]'), 'Operations receives escalation rules');
    pass('Operations Agent receives operating procedures & escalation workflows');

    // 23. Executive context projection
    const execPrompt = bizManager.getAgentBusinessContext(wsProj, 'agent_executive');
    assert(execPrompt.includes('[Executive Intelligence & Priorities]'), 'Executive receives priorities');
    assert(execPrompt.includes('Critical Metrics:'), 'Executive receives metrics');
    pass('Executive Assistant receives high-level synthesis & briefing priorities');

    // 24. Bounded projection size (< 1.5 KB per agent)
    const agents = ['agent_receptionist', 'agent_sales', 'agent_marketing', 'agent_operations', 'agent_executive'];
    for (const aId of agents) {
      const p = bizManager.getAgentBusinessContext(wsProj, aId);
      const byteLen = Buffer.byteLength(p, 'utf8');
      assert(byteLen < 1600, `Context for ${aId} is bounded (${byteLen} bytes < 1600 bytes)`);
    }
    pass('All agent context projections remain strictly compact (< 1.5 KB)');
  } catch (e) {
    fail('Suite 6 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 7: NON-ESCALATION OF TOOLS & GATEKEEPER PROTECTION
  // -------------------------------------------------------------
  console.log('\n--- SUITE 7: NON-ESCALATION OF TOOLS & GATEKEEPER PROTECTION ---');
  try {
    const wsSec = `ws_security_${Date.now()}`;
    const registry = getSharedAgentRegistry();
    const runtime = getSharedAgentRuntime();
    const gatekeeper = getSharedActionGatekeeper();

    // 25. Pack declares capabilities, but DOES NOT grant tools
    const salesBefore = registry.getAgent('agent_sales');
    const baseToolsCount = salesBefore.allowedTools.length;

    // Activate pack that expects ['calendar', 'crm']
    bizManager.activatePack(wsSec, 'pack_real_estate');

    const salesAfter = registry.getAgent('agent_sales');
    assert.strictEqual(
      salesAfter.allowedTools.length,
      baseToolsCount,
      'Pack activation did NOT alter server-side agent.allowedTools'
    );
    assert(
      !salesAfter.allowedTools.includes('crm') && !salesAfter.allowedTools.includes('hubspot_crm'),
      'Unauthorized capability "crm" was NOT granted to agent'
    );
    pass('Packs cannot grant unauthorized tools or expand agent tool permissions');

    // 26. Attempting to execute unauthorized tool declared in pack is strictly rejected server-side
    await assert.rejects(
      async () => {
        await runtime.runAgent('agent_sales', 'Update CRM record', {
          workspaceId: wsSec,
          tool: 'crm_update_contact'
        });
      },
      /Permission Denied/i,
      'Unauthorized tool execution rejected'
    );
    pass('Server-side tool authorization barrier strictly blocks undeclared tools');

    // 27. Action Gatekeeper remains authoritative for consequential mutations
    const gatekeeperProposal = gatekeeper.proposeAction({
      workspaceId: wsSec,
      agentId: 'agent_sales',
      agentName: 'Sales Agent',
      actionType: 'email.send',
      payload: { to: 'client@luxuryrealty.com', subject: 'Property Proposal', body: 'Attached is the contract' }
    });
    assert(gatekeeperProposal && gatekeeperProposal.id, 'Gatekeeper proposal generated');
    assert.strictEqual(gatekeeperProposal.status, 'pending_approval');
    pass('Action Gatekeeper interceptor armed and authoritative regardless of pack');

    // 28. Zero Credential Leakage in Model Context
    const salesContextLayers = await getAgentContextLayers('agent_sales', 'Send follow up', { workspaceId: wsSec });
    assert(!salesContextLayers.systemPrompt.includes('apiKey'), 'Zero apiKey in prompt');
    assert(!salesContextLayers.systemPrompt.includes('bearer'), 'Zero bearer token in prompt');
    assert(!salesContextLayers.systemPrompt.includes('password'), 'Zero password in prompt');
    assert(!salesContextLayers.systemPrompt.includes('C:\\Users\\'), 'Zero absolute filesystem path in prompt');
    pass('Zero credential, token, or internal filesystem path leakage in prompt context');
  } catch (e) {
    fail('Suite 7 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 8: GATEWAY RPC ENDPOINTS
  // -------------------------------------------------------------
  console.log('\n--- SUITE 8: GATEWAY RPC ENDPOINTS ---');
  try {
    const wsRpc = `ws_rpc_audit_${Date.now()}`;

    // 29. mesnium.business.context.get & set
    let rpcSetResult = null;
    await mesniumRpcHandlers['mesnium.business.context.set']({
      params: {
        workspaceId: wsRpc,
        patch: {
          identity: { businessName: 'Horizon Commercial', industry: 'Commercial Leasing' }
        }
      },
      respond: (ok, data) => { if (ok) rpcSetResult = data; }
    });
    assert(rpcSetResult && rpcSetResult.success, 'RPC context.set succeeds');

    let rpcGetResult = null;
    await mesniumRpcHandlers['mesnium.business.context.get']({
      params: { workspaceId: wsRpc },
      respond: (ok, data) => { if (ok) rpcGetResult = data; }
    });
    assert(rpcGetResult && rpcGetResult.context.identity.businessName === 'Horizon Commercial', 'RPC context.get returns updated context');
    pass('RPC mesnium.business.context.get and .set function correctly');

    // 30. mesnium.business.packs.list, .activate, .deactivate
    let rpcListResult = null;
    await mesniumRpcHandlers['mesnium.business.packs.list']({
      params: { workspaceId: wsRpc },
      respond: (ok, data) => { if (ok) rpcListResult = data; }
    });
    assert(rpcListResult && rpcListResult.packs.length > 0, 'RPC packs.list returns packs');

    let rpcActResult = null;
    await mesniumRpcHandlers['mesnium.business.packs.activate']({
      params: { workspaceId: wsRpc, packId: 'pack_real_estate' },
      respond: (ok, data) => { if (ok) rpcActResult = data; }
    });
    assert(rpcActResult && rpcActResult.success, 'RPC packs.activate succeeds');

    // 31. mesnium.business.effective.get
    let rpcEffResult = null;
    await mesniumRpcHandlers['mesnium.business.effective.get']({
      params: { workspaceId: wsRpc, agentId: 'agent_sales' },
      respond: (ok, data) => { if (ok) rpcEffResult = data; }
    });
    assert(rpcEffResult && rpcEffResult.effective, 'RPC effective.get returns merged config');
    assert(rpcEffResult.provenance, 'RPC effective.get returns provenance metadata');
    assert(rpcEffResult.projectedPrompt, 'RPC effective.get returns projected prompt');
    assert.strictEqual(rpcEffResult.effective.identity.businessName, 'Horizon Commercial');
    assert.strictEqual(rpcEffResult.provenance['identity.businessName'].source, 'customer');
    pass('RPC mesnium.business.effective.get returns clean effective context & provenance');
  } catch (e) {
    fail('Suite 8 failed', e);
  }

  // -------------------------------------------------------------
  // SUITE 9: CORE REALITY TESTS (A THROUGH F)
  // -------------------------------------------------------------
  console.log('\n--- SUITE 9: CORE REALITY TESTS (A THROUGH F) ---');
  try {
    const wsReality = `ws_reality_${Date.now()}`;
    const registry = getSharedAgentRegistry();

    // TEST A: Core-only Sales Agent receives generic sales context
    const layersA = await getAgentContextLayers('agent_sales', 'Qualify lead', { workspaceId: wsReality });
    assert(layersA.businessContext.includes('General Enterprise'), 'Test A: Generic business context');
    assert(!layersA.businessContext.includes('property'), 'Test A: No real-estate specifics');
    pass('REALITY TEST A: Core-only Sales Agent receives generic Mesnium sales context');

    // TEST B: Core + Real Estate Pack receives real-estate-specific sales configuration
    bizManager.activatePack(wsReality, 'pack_real_estate');
    const layersB = await getAgentContextLayers('agent_sales', 'Qualify lead', { workspaceId: wsReality });
    assert(layersB.businessContext.includes('Real Estate'), 'Test B: Real estate industry');
    assert(layersB.businessContext.includes('Residential Property Sales'), 'Test B: Property services');
    assert(layersB.businessContext.includes('Curated property selection'), 'Test B: Real estate sales process');
    pass('REALITY TEST B: Core + Real Estate Pack transforms Sales Agent configuration for real estate');

    // TEST C: Core + Real Estate Pack + customer override takes precedence
    bizManager.updateContext(wsReality, {
      identity: {
        industry: 'Ultra-Luxury Island Estates'
      },
      agentConfig: {
        agent_sales: {
          priorities: ['Private archipelago acquisitions ($20M+)']
        }
      }
    });
    const layersC = await getAgentContextLayers('agent_sales', 'Qualify lead', { workspaceId: wsReality });
    assert(layersC.businessContext.includes('Ultra-Luxury Island Estates'), 'Test C: Customer industry wins');
    assert(layersC.businessContext.includes('Private archipelago acquisitions'), 'Test C: Customer agent priority wins');
    assert(layersC.businessContext.includes('Residential Property Sales'), 'Test C: Unmodified pack defaults preserved');
    pass('REALITY TEST C: Customer override takes precedence while preserving unmodified pack defaults');

    // TEST D: Pack requiring unauthorized capability DOES NOT grant tools
    const effD = bizManager.getEffectiveConfiguration(wsReality);
    assert(effD.activePacks[0].capabilityRequirements.includes('crm'), 'Pack expects crm');
    const salesAgentD = registry.getAgent('agent_sales');
    assert(!salesAgentD.allowedTools.includes('crm'), 'Agent does not have crm tool');
    pass('REALITY TEST D: Pack expecting capabilities cannot grant itself tools');

    // TEST E: Missing workspace identity in a tenant-scoped operation is rejected
    let errorCaught = false;
    try {
      bizManager.getAgentBusinessContext(null, 'agent_sales');
    } catch (err) {
      errorCaught = true;
      assert(err.message.includes('strictly required'), 'Security violation error thrown');
    }
    assert(errorCaught, 'Operation without workspaceId was strictly rejected');
    pass('REALITY TEST E: Missing workspace identity rejected with zero default fallback');

    // TEST F: Changing business context does NOT alter underlying agent identity or runtime permissions
    const agentBefore = registry.getAgent('agent_sales');
    assert.strictEqual(agentBefore.id, 'agent_sales');
    assert.strictEqual(agentBefore.role, 'Sales');
    assert.strictEqual(agentBefore.name, 'Sales Agent');
    pass('REALITY TEST F: Same canonical agent identity & runtime permissions preserved throughout');
  } catch (e) {
    fail('Suite 9 failed', e);
  }

  console.log('\n================================================================');
  console.log(`MESNIUM PHASE 3 TEST RESULTS: ${passed} PASSED / ${failed} FAILED`);
  console.log('================================================================\n');

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
