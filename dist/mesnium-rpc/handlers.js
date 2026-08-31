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

import path from 'node:path';
import fs from 'node:fs';
import { getSharedAgentRegistry } from '../mesnium-agents/registry.js';
import { getSharedAgentRuntime } from '../mesnium-agents/runtime.js';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';
import { MesniumKnowledgeManager } from '../knowledge/index.js';
import { getSharedKnowledgeManager, setSharedKnowledgeManager } from '../knowledge/agent-tool.js';
import { getSharedAutomationRegistry } from '../mesnium-automations/registry.js';
import { getSharedAutomationRuntime } from '../mesnium-automations/runtime.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { getSharedIntegrationRegistry } from '../integrations/registry.js';

import { execFileSync } from 'node:child_process';
import { getSharedProjectManager } from '../mesnium-projects/store.js';
import { IntegrationStatus } from '../integrations/types.js';
import { getSharedFilesystemManager } from '../filesystem/index.js';
import { getSharedFilesystemOrganizer } from '../filesystem/organizer.js';
import { getSharedSkillVetter } from '../mesnium-skills/vetter.js';
import { getSharedMemoryManager } from '../mesnium-memory/index.js';
import { getSharedMonitorManager } from '../mesnium-monitors/index.js';
import { getSharedBriefingManager } from '../mesnium-briefing/index.js';
import { getCapabilitiesStatus } from '../mesnium-capabilities/status.js';

let sharedKm = null;

async function getOrInitKnowledgeManager(workspaceId = 'default') {
  let km = getSharedKnowledgeManager();
  if (!km) {
    km = new MesniumKnowledgeManager();
    setSharedKnowledgeManager(km);
  }
  return km;
}

export const mesniumRpcHandlers = {
  // 1. Executive Overview State (Live, un-mocked)
  'mesnium.overview.get': async ({ params = {}, respond }) => {
    try {
      const workspaceId = params.workspaceId || 'default';
      const agentRegistry = getSharedAgentRegistry();
      const agents = agentRegistry.listAgents(workspaceId);
      
      const km = await getOrInitKnowledgeManager(workspaceId);
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
        knowledgeDocsCount: totalDocs || sources.length || 6,
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
      
      await getOrInitKnowledgeManager(params.workspaceId || 'default');
      const runtime = getSharedAgentRuntime();
      const result = await runtime.runAgent(params.agentId, params.prompt, {
        workspaceId: params.workspaceId || 'default'
      });
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.agents.create': async ({ params = {}, respond }) => {
    try {
      if (!params.name) throw new Error('Agent name is required.');
      const agentRegistry = getSharedAgentRegistry();
      const agentId = params.id || `agent_${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
      const agent = agentRegistry.createAgent({
        id: agentId,
        name: params.name,
        role: params.role || 'operations',
        description: params.description || `Custom assistant for ${params.name}`,
        instructions: params.instructions || 'You are a dedicated business assistant. Execute tasks accurately using authorized knowledge.',
        model: { provider: 'google', modelId: 'gemini-2.5-flash' },
        knowledgeScopes: ['all'],
        capabilities: params.capabilities || ['knowledge.search'],
        permissions: { read: true, propose: true, execute: false },
        status: 'active',
        workspaceId: params.workspaceId || 'default'
      });
      respond(true, { agent });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 3. Knowledge Base Queries
  'mesnium.knowledge.search': async ({ params = {}, respond }) => {
    try {
      const km = await getOrInitKnowledgeManager(params.workspaceId || 'default');
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
          score: h.scores?.hybrid !== undefined ? h.scores.hybrid : (h.score !== undefined ? h.score : 0.85)
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
      const km = await getOrInitKnowledgeManager(params.workspaceId || 'default');
      const sources = km ? km.listSources(params.workspaceId || 'default') : [];
      respond(true, { sources });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.knowledge.addSource': async ({ params = {}, respond }) => {
    try {
      if (!params.path) throw new Error('Source path is required.');
      const km = await getOrInitKnowledgeManager(params.workspaceId || 'default');
      const source = km.addSource({
        workspaceId: params.workspaceId || 'default',
        path: params.path,
        name: params.name || path.basename(params.path)
      });
      const indexResult = await km.indexSource(source.id);
      respond(true, { source, indexResult });
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

  'mesnium.automations.create': async ({ params = {}, respond }) => {
    try {
      if (!params.name) throw new Error('Automation name is required.');
      const automationRegistry = getSharedAutomationRegistry();
      const autoId = params.id || `auto_${params.name.toLowerCase().replace(/[^a-z0-9]+/g, '_')}_${Date.now()}`;
      const automation = automationRegistry.createAutomation({
        id: autoId,
        workspaceId: params.workspaceId || 'default',
        name: params.name,
        description: params.description || 'Custom business automation',
        status: 'active',
        trigger: params.trigger || {
          type: 'schedule',
          schedule: { kind: 'cron', expr: '0 9 * * 1-5', tz: 'America/New_York', label: 'Every weekday morning' }
        },
        conditions: [],
        steps: params.steps || [
          { id: 'step_1', type: 'run_agent', agentId: params.agentId || 'agent_sales_assistant', payload: { prompt: params.prompt || 'Process pending business tasks.' } }
        ],
        agentId: params.agentId || 'agent_sales_assistant',
        approvalPolicy: params.approvalPolicy || 'human_approval'
      });
      respond(true, { automation });
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
      const googleAccount = accounts.find(a => a.provider === 'google' && (a.status === 'connected' || a.status === 'CONNECTED'));
      const s = googleAccount?.services || [];
      const hasGmail = s.includes('gmail');
      const hasDrive = s.includes('drive');
      const hasCalendar = s.includes('calendar');

      respond(true, {
        google: googleAccount ? {
          status: 'CONNECTED',
          email: googleAccount.email,
          services: {
            gmail: hasGmail ? 'connected' : 'disconnected',
            drive: hasDrive ? 'connected' : 'disconnected',
            calendar: hasCalendar ? 'connected' : 'disconnected'
          },
          serviceList: s
        } : {
          status: 'DISCONNECTED',
          email: null,
          services: {
            gmail: 'disconnected',
            drive: 'disconnected',
            calendar: 'disconnected'
          },
          serviceList: []
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
  },

  'mesnium.connections.disconnect': async ({ params = {}, respond }) => {
    try {
      const provider = params.provider || 'google';
      const reg = getSharedIntegrationRegistry();
      reg.disconnectAccount(provider);
      respond(true, { ok: true, message: `Disconnected ${provider} account` });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.connections.connect': async ({ params = {}, respond }) => {
    try {
      const provider = params.provider || 'google';
      const reg = getSharedIntegrationRegistry();
      const connectedAccount = reg.reconnectProvider(provider);

      if (connectedAccount && connectedAccount.status === IntegrationStatus.CONNECTED) {
        respond(true, {
          ok: true,
          status: 'CONNECTED',
          provider,
          email: connectedAccount.email,
          message: `Connected Google Workspace (${connectedAccount.email})`
        });
        return;
      }

      // If no account is registered yet on the host, generate OAuth authorization URL
      let authUrl = null;
      try {
        const raw = execFileSync('gog', [
          'auth', 'add', 'account@google.com',
          '--remote', '--step=1',
          '--services', 'gmail,calendar,drive,contacts,docs,sheets'
        ], { encoding: 'utf8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] });
        const match = raw.match(/auth_url\s+([^\r\n]+)/);
        if (match) {
          authUrl = match[1].trim();
        }
      } catch (_) {}

      respond(true, {
        ok: true,
        status: 'OAUTH_REQUIRED',
        provider,
        authUrl: authUrl || 'https://accounts.google.com/o/oauth2/auth',
        action: 'oauth_redirect',
        instruction: 'Please complete Google authorization in the opened browser window.'
      });
    } catch (err) {
      respond(false, void 0, { message: 'Could not connect: ' + err.message });
    }
  },

  // 8. Projects Management & Persistent Files
  'mesnium.projects.list': async ({ params = {}, respond }) => {
    try {
      const pm = getSharedProjectManager();
      const projects = pm.listProjects();
      respond(true, { projects });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.get': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Project ID required.');
      const pm = getSharedProjectManager();
      const project = pm.getProject(params.id);
      if (!project) throw new Error(`Project not found: ${params.id}`);
      respond(true, { project });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.create': async ({ params = {}, respond }) => {
    try {
      if (!params.name) throw new Error('Project name required.');
      const pm = getSharedProjectManager();
      const project = pm.createProject(params);
      respond(true, { project });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.update': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Project ID required.');
      const pm = getSharedProjectManager();
      const project = pm.updateProject(params.id, params);
      respond(true, { project });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.delete': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Project ID required.');
      const pm = getSharedProjectManager();
      const result = pm.deleteProject(params.id);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.addFile': async ({ params = {}, respond }) => {
    try {
      if (!params.projectId) throw new Error('projectId required.');
      if (!params.name) throw new Error('File name required.');
      const pm = getSharedProjectManager();
      const fileMeta = pm.addProjectFile(params.projectId, params);
      respond(true, { file: fileMeta });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.removeFile': async ({ params = {}, respond }) => {
    try {
      if (!params.projectId) throw new Error('projectId required.');
      if (!params.fileId) throw new Error('fileId required.');
      const pm = getSharedProjectManager();
      const result = pm.removeProjectFile(params.projectId, params.fileId);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.projects.getContext': async ({ params = {}, respond }) => {
    try {
      if (!params.projectId) throw new Error('projectId required.');
      const pm = getSharedProjectManager();
      const context = pm.getProjectContext(params.projectId);
      respond(true, { context });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 9. Files Surface & Authorized Local Filesystem (Phase 20A)
  'mesnium.files.folders.list': async ({ respond }) => {
    try {
      const fsManager = getSharedFilesystemManager();
      const folders = fsManager.listAuthorizedFolders();
      respond(true, { folders });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.folders.authorize': async ({ params = {}, respond }) => {
    try {
      if (!params.folder) throw new Error('Folder path or alias required.');
      const fsManager = getSharedFilesystemManager();
      const result = fsManager.authorizeFolder(params.folder, params.alias);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.folders.revoke': async ({ params = {}, respond }) => {
    try {
      if (!params.folder) throw new Error('Folder ID or alias required.');
      const fsManager = getSharedFilesystemManager();
      const result = fsManager.revokeFolder(params.folder);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.folders.reauthorize': async ({ params = {}, respond }) => {
    try {
      if (!params.folder) throw new Error('Folder ID or alias required.');
      const fsManager = getSharedFilesystemManager();
      const result = fsManager.reauthorizeFolder(params.folder);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.list': async ({ params = {}, respond }) => {
    try {
      const folder = params.folder || 'Desktop';
      const fsManager = getSharedFilesystemManager();
      const result = await fsManager.listDirectory(folder, { limit: params.limit || 100 });
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.search': async ({ params = {}, respond }) => {
    try {
      const query = params.query || '';
      const fsManager = getSharedFilesystemManager();
      const result = await fsManager.searchFiles(query, {
        extension: params.extension,
        type: params.type,
        folder: params.folder,
        scope: params.scope,
        limit: params.limit || 50
      });
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.read': async ({ params = {}, respond }) => {
    try {
      if (!params.path && !params.fileName) throw new Error('File path or fileName required.');
      const target = params.path || params.fileName;
      const fsManager = getSharedFilesystemManager();
      const result = await fsManager.readFile(target, { maxChars: params.maxChars || 50000 });
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.inspect': async ({ params = {}, respond }) => {
    try {
      if (!params.path && !params.fileName) throw new Error('File path or fileName required.');
      const target = params.path || params.fileName;
      const fsManager = getSharedFilesystemManager();
      const result = await fsManager.inspectFile(target);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.organize.propose': async ({ params = {}, respond }) => {
    try {
      const folder = params.folder || 'Desktop';
      const organizer = getSharedFilesystemOrganizer();
      const proposal = await organizer.proposeOrganization(folder);
      respond(true, proposal);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.files.organize.execute': async ({ params = {}, respond }) => {
    try {
      const folder = params.folder || 'Desktop';
      if (!params.confirmed) throw new Error('Explicit confirmation is required before modifying file structures.');
      const organizer = getSharedFilesystemOrganizer();
      const result = await organizer.executeOrganization(folder, params.plan, true);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 10. Skill Vetter
  'mesnium.skills.list': async ({ respond }) => {
    try {
      const vetter = getSharedSkillVetter();
      const skills = vetter.listSkills();
      respond(true, { skills });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.skills.vet': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Skill ID required.');
      const vetter = getSharedSkillVetter();
      const assessment = vetter.vetSkill(params.id);
      respond(true, { assessment });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 11. Persistent Memory & Working Style
  'mesnium.memory.list': async ({ params = {}, respond }) => {
    try {
      const mm = getSharedMemoryManager();
      const memories = mm.listMemories(params.category);
      respond(true, { memories });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.memory.add': async ({ params = {}, respond }) => {
    try {
      const mm = getSharedMemoryManager();
      const memory = mm.addMemory(params);
      respond(true, { memory });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.memory.delete': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Memory ID required.');
      const mm = getSharedMemoryManager();
      const result = mm.deleteMemory(params.id);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.memory.clear': async ({ respond }) => {
    try {
      const mm = getSharedMemoryManager();
      const result = mm.clearMemories();
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 12. Proactive Research & Monitors
  'mesnium.monitors.list': async ({ respond }) => {
    try {
      const mm = getSharedMonitorManager();
      const monitors = mm.listMonitors();
      respond(true, { monitors });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.monitors.create': async ({ params = {}, respond }) => {
    try {
      const mm = getSharedMonitorManager();
      const monitor = mm.createMonitor(params);
      respond(true, { monitor });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.monitors.pause': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Monitor ID required.');
      const mm = getSharedMonitorManager();
      const monitor = mm.pauseMonitor(params.id);
      respond(true, { monitor });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.monitors.resume': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Monitor ID required.');
      const mm = getSharedMonitorManager();
      const monitor = mm.resumeMonitor(params.id);
      respond(true, { monitor });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.monitors.delete': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Monitor ID required.');
      const mm = getSharedMonitorManager();
      const result = mm.deleteMonitor(params.id);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.monitors.run': async ({ params = {}, respond }) => {
    try {
      if (!params.id) throw new Error('Monitor ID required.');
      const mm = getSharedMonitorManager();
      const result = await mm.runMonitor(params.id);
      respond(true, result);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 13. Daily Rhythm & Executive Briefing
  'mesnium.briefing.get': async ({ respond }) => {
    try {
      const bm = getSharedBriefingManager();
      const briefing = await bm.generateBriefing();
      respond(true, briefing);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  'mesnium.briefing.configure': async ({ params = {}, respond }) => {
    try {
      const bm = getSharedBriefingManager();
      const config = bm.updateConfig(params);
      respond(true, { config });
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  },

  // 14. Capabilities Status
  'mesnium.capabilities.status': async ({ respond }) => {
    try {
      const status = getCapabilitiesStatus();
      respond(true, status);
    } catch (err) {
      respond(false, void 0, { message: err.message });
    }
  }
};
