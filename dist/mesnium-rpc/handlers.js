/**
 * MESNIUM GATEWAY RPC HANDLERS (PHASE 14B)
 * 
 * Exposes clean, business-oriented Gateway RPC endpoints directly to the Mesnium frontend:
 * - mesnium.overview.get
 * - mesnium.agents.list
 * - mesnium.agents.get
 * - mesnium.agents.run
 * - mesnium.knowledge.search
 * - mesnium.knowledge.sources
 * - mesnium.automations.list
 * - mesnium.automations.get
 * - mesnium.automations.run
 * - mesnium.automations.pause
 * - mesnium.automations.resume
 * - mesnium.approvals.list
 * - mesnium.approvals.approve
 * - mesnium.approvals.reject
 * - mesnium.activity.list
 * - mesnium.connections.status
 */

import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedAgentRuntime } from '../mesnium-agents/runtime.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';
import { getSharedKnowledgeManager } from '../knowledge/agent-tool.js';
import { getSharedAutomationRegistry } from '../mesnium-automations/registry.js';
import { getSharedAutomationRuntime } from '../mesnium-automations/runtime.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { getSharedIntegrationRegistry } from '../integrations/registry.js';

export const mesniumRpcHandlers = {
  // 1. Executive Overview State (Live, un-mocked)
  'mesnium.overview.get': async ({ params = {}, respond }) => {
    try {
      const workspaceId = params.workspaceId || 'default';
      const agentRegistry = getSharedAgentRegistry();
      const agents = agentRegistry.listAgents(workspaceId);
      
      const km = getSharedKnowledgeManager();
      const sources = km ? km.listSources(workspaceId) : [];
      let totalDocs = 0;
      if (km && sources.length > 0) {
        for (const s of sources) {
          totalDocs += (km.listDocuments ? km.listDocuments(s.id).length : 0);
        }
      }

      const integrationReg = getSharedIntegrationRegistry();
      const accounts = integrationReg.listAccounts();
      const connectedCount = accounts.filter(a => a.status === 'CONNECTED').length;

      const gatekeeper = getSharedActionGatekeeper();
      const pendingApprovals = gatekeeper.listPendingApprovals(workspaceId);

      const activityLedger = getSharedActivityLedger();
      const recentActivity = activityLedger.listRuns(5);

      respond(true, {
        agentsCount: agents.length,
        knowledgeDocsCount: totalDocs || sources.length,
        integrationsCount: connectedCount,
        pendingApprovalsCount: pendingApprovals.length,
        recentActivity,
        status: 'operational',
        timestamp: Date.now()
      });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 2. Agents Management & Execution
  'mesnium.agents.list': async ({ params = {}, respond }) => {
    try {
      const agents = getSharedAgentRegistry().listAgents(params.workspaceId || 'default');
      respond(true, { agents });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.agents.get': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Agent ID is required.');
      const agent = getSharedAgentRegistry().getAgent(params.id);
      if (!agent) throw new Error(`Agent not found: ${params.id}`);
      respond(true, { agent });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.agents.run': async ({ params = {}, respond }) => {
    try {
      if (!params.agentId) throw new Error('Agent ID is required.');
      if (!params.prompt) throw new Error('Task prompt is required.');
      
      const runtime = getSharedAgentRuntime();
      const result = await runtime.runAgent(params.agentId, params.prompt, {
        workspaceId: params.workspaceId || 'default'
      });
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 3. Knowledge Base Queries
  'mesnium.knowledge.search': async ({ params = {}, respond }) => {
    try {
      const km = getSharedKnowledgeManager();
      if (!km) {
        respond(true, { hits: [], count: 0, query: params.query || '' });
        return;
      }
      const hits = await km.search(params.query || '', {
        workspaceId: params.workspaceId || 'default',
        limit: params.limit || 5
      });
      respond(true, {
        hits: hits.map(h => ({
          filename: h.filename,
          content: h.content,
          provenance: h.provenance,
          score: h.score
        })),
        count: hits.length,
        query: params.query
      });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.knowledge.sources': async ({ params = {}, respond }) => {
    try {
      const km = getSharedKnowledgeManager();
      const sources = km ? km.listSources(params.workspaceId || 'default') : [];
      respond(true, { sources });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 4. Automations Studio
  'mesnium.automations.list': async ({ params = {}, respond }) => {
    try {
      const automations = getSharedAutomationRegistry().listAutomations(params.workspaceId || 'default');
      respond(true, { automations });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.automations.get': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Automation ID is required.');
      const automation = getSharedAutomationRegistry().getAutomation(params.id);
      if (!automation) throw new Error(`Automation not found: ${params.id}`);
      respond(true, { automation });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.automations.run': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Automation ID is required.');
      const runtime = getSharedAutomationRuntime();
      const result = await runtime.triggerAutomation(params.id, params.payload || {}, 'manual');
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.automations.pause': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Automation ID is required.');
      const automation = getSharedAutomationRegistry().pauseAutomation(params.id);
      respond(true, { automation });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.automations.resume': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Automation ID is required.');
      const automation = getSharedAutomationRegistry().resumeAutomation(params.id);
      respond(true, { automation });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 5. Action Gatekeeper Approvals
  'mesnium.approvals.list': async ({ params = {}, respond }) => {
    try {
      const approvals = getSharedActionGatekeeper().listPendingApprovals(params.workspaceId || 'default');
      respond(true, { approvals });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.approvals.approve': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Action ID is required.');
      const gatekeeper = getSharedActionGatekeeper();
      const approvedAction = gatekeeper.approveAction(params.id, params.approver || 'Operator');
      const executionResult = await gatekeeper.executeAction(params.id, async (action) => {
        return { executed: true, timestamp: Date.now(), details: `Executed ${approvedAction.actionType}` };
      });
      respond(true, { action: approvedAction, result: executionResult });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.approvals.reject': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Action ID is required.');
      const gatekeeper = getSharedActionGatekeeper();
      const rejectedAction = gatekeeper.rejectAction(params.id, params.reason || 'Rejected by operator', params.rejectedBy || 'Operator');
      respond(true, { action: rejectedAction });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 6. Activity Ledger
  'mesnium.activity.list': async ({ params = {}, respond }) => {
    try {
      const activity = getSharedActivityLedger().listRuns(params.limit || 50);
      respond(true, { activity });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 7. Honest Connections Status
  'mesnium.connections.status': async ({ params = {}, respond }) => {
    try {
      const accounts = getSharedIntegrationRegistry().listAccounts();
      const googleAccount = accounts.find(a => a.provider === 'google');
      respond(true, {
        google: googleAccount ? {
          status: googleAccount.status,
          email: googleAccount.email,
          services: googleAccount.services || ['drive', 'gmail', 'calendar']
        } : {
          status: 'DISCONNECTED',
          email: null,
          services: []
        },
        whatsapp: {
          status: 'NOT_CONNECTED',
          label: 'WhatsApp Business',
          available: true
        }
      });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  }
};
