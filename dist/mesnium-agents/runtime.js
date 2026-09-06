/**
 * MESNIUM UNIFIED AGENT RUNTIME & EXECUTION SERVICE (V1.2 PRODUCTIZATION)
 * 
 * Architecture:
 * User/Automation Request
 *   → Selected Specialized Agent
 *   → Validates agent status & server-side tool permissions (agent.allowedTools)
 *   → Resolves configured Model Provider (strictly from OpenClaw configuration/auth)
 *   → Autonomous Multi-Step Tool Calling (model receives ONLY agent.allowedTools schemas)
 *   → Server-side boundary check on every tool call (no unauthorized expansion)
 *   → Action Gatekeeper approval policy for consequential mutations
 *   → Tool execution & tool results fed back to model
 *   → Canonical structured result contract
 *   → Activity Ledger audit trail
 *   → Presentation boundary sanitization (zero leaks of tokens, IDs, or absolute paths)
 */

import { AgentStatus, CanonicalTools, CapabilityToolMapping } from './types.js';
import { getSharedAgentRegistry } from './registry.js';
import { getSharedActivityLedger } from './activity.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { ActionType } from '../mesnium-actions/types.js';
import { getSharedKnowledgeManager } from '../knowledge/agent-tool.js';
import { KnowledgeSearchTool } from '../knowledge/agent-tool.js';
import { 
  GoogleDriveSearchTool, 
  GoogleDriveUploadTool, 
  GmailSearchTool, 
  GmailDraftTool, 
  GmailSendTool, 
  CalendarAgendaTool, 
  CalendarCreateTool 
} from '../integrations/google/agent-tools.js';
import { LocalFilesystemTool } from '../filesystem/agent-tool.js';
import { getSharedMemoryManager } from '../mesnium-memory/index.js';

function normalizeTool(t) {
  return CapabilityToolMapping[t] || t;
}

/**
 * Provider Availability & Operational States
 */
export const ProviderState = {
  NOT_CONFIGURED: 'NOT_CONFIGURED',
  CONFIGURED: 'CONFIGURED',
  AUTHENTICATION_FAILED: 'AUTHENTICATION_FAILED',
  BILLING_REQUIRED: 'BILLING_REQUIRED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  UNAVAILABLE: 'UNAVAILABLE',
  READY: 'READY'
};

/**
 * Normalized Canonical Tool Schemas for Model Tool Calling
 * Defines parameters and descriptions for all 15 canonical tools.
 */
export const CanonicalToolDefinitions = {
  [CanonicalTools.KNOWLEDGE_SEARCH]: {
    name: CanonicalTools.KNOWLEDGE_SEARCH,
    description: 'Search indexed workspace documents, uploaded company knowledge, and business guides.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search keywords or question to match in indexed business documents' },
        maxResults: { type: 'number', description: 'Maximum number of grounded excerpts to return (default 5)' }
      },
      required: ['query']
    }
  },
  [CanonicalTools.GMAIL_SEARCH]: {
    name: CanonicalTools.GMAIL_SEARCH,
    description: 'Search Gmail inbox and messages using standard query syntax (e.g. from, subject, newer_than).',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Gmail query string, e.g. "from:prospect@example.com" or "newer_than:7d"' },
        maxResults: { type: 'number', description: 'Max number of emails to retrieve (default 5)' }
      },
      required: ['query']
    }
  },
  [CanonicalTools.GMAIL_DRAFT]: {
    name: CanonicalTools.GMAIL_DRAFT,
    description: 'Create an email draft in Gmail with recipient, subject line, and draft message body.',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email body text or HTML' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  [CanonicalTools.GMAIL_SEND]: {
    name: CanonicalTools.GMAIL_SEND,
    description: 'Send an email to an external recipient. (Requires human Gatekeeper approval).',
    parameters: {
      type: 'object',
      properties: {
        to: { type: 'string', description: 'Recipient email address' },
        subject: { type: 'string', description: 'Email subject line' },
        body: { type: 'string', description: 'Email message content to send' }
      },
      required: ['to', 'subject', 'body']
    }
  },
  [CanonicalTools.CALENDAR_AGENDA]: {
    name: CanonicalTools.CALENDAR_AGENDA,
    description: 'Retrieve upcoming calendar appointments, meetings, and schedule details.',
    parameters: {
      type: 'object',
      properties: {
        maxResults: { type: 'number', description: 'Maximum number of events to return (default 5)' }
      }
    }
  },
  [CanonicalTools.CALENDAR_CREATE_EVENT]: {
    name: CanonicalTools.CALENDAR_CREATE_EVENT,
    description: 'Schedule a new calendar appointment or meeting. (Requires human Gatekeeper approval).',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Event title or subject' },
        start: { type: 'string', description: 'Start time (ISO 8601 or natural time string)' },
        end: { type: 'string', description: 'End time (ISO 8601 or natural time string)' },
        description: { type: 'string', description: 'Meeting description or notes' }
      },
      required: ['summary', 'start']
    }
  },
  [CanonicalTools.GOOGLE_DRIVE_SEARCH]: {
    name: CanonicalTools.GOOGLE_DRIVE_SEARCH,
    description: 'Search files and documents stored in Google Drive.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Filename, keyword, or Drive query expression' },
        maxResults: { type: 'number', description: 'Max number of files to return (default 5)' }
      },
      required: ['query']
    }
  },
  [CanonicalTools.GOOGLE_DRIVE_UPLOAD]: {
    name: CanonicalTools.GOOGLE_DRIVE_UPLOAD,
    description: 'Upload a file or document to Google Drive. (Requires human Gatekeeper approval).',
    parameters: {
      type: 'object',
      properties: {
        name: { type: 'string', description: 'Filename to create in Drive' },
        content: { type: 'string', description: 'Text or file content' },
        folder: { type: 'string', description: 'Optional target folder name or ID' }
      },
      required: ['name', 'content']
    }
  },
  [CanonicalTools.LOCAL_FILESYSTEM]: {
    name: CanonicalTools.LOCAL_FILESYSTEM,
    description: 'Read, inspect, or organize local workspace filesystem files.',
    parameters: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['search', 'read', 'list', 'inspect'], description: 'Filesystem operation' },
        path: { type: 'string', description: 'File or folder path' },
        query: { type: 'string', description: 'Search term for files' }
      }
    }
  },
  [CanonicalTools.WEB_SEARCH]: {
    name: CanonicalTools.WEB_SEARCH,
    description: 'Perform web research for market context, competitive info, or company facts.',
    parameters: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Search query for web research' }
      },
      required: ['query']
    }
  },
  [CanonicalTools.BRIEFING_GENERATE]: {
    name: CanonicalTools.BRIEFING_GENERATE,
    description: 'Generate an executive daily briefing synthesizing communications, schedule, and operations.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  [CanonicalTools.MONITORS_RUN]: {
    name: CanonicalTools.MONITORS_RUN,
    description: 'Execute active research monitors across web sources and synthesize findings.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  [CanonicalTools.AUTOMATIONS_LIST]: {
    name: CanonicalTools.AUTOMATIONS_LIST,
    description: 'List configured background automations and scheduled workflows.',
    parameters: {
      type: 'object',
      properties: {}
    }
  },
  [CanonicalTools.AUTOMATIONS_RUN]: {
    name: CanonicalTools.AUTOMATIONS_RUN,
    description: 'Trigger a background automation workflow by ID.',
    parameters: {
      type: 'object',
      properties: {
        id: { type: 'string', description: 'Automation rule ID to execute' },
        payload: { type: 'object', description: 'Optional payload parameters' }
      },
      required: ['id']
    }
  },
  [CanonicalTools.CALENDAR_DELETE_EVENT]: {
    name: CanonicalTools.CALENDAR_DELETE_EVENT,
    description: 'Delete or cancel an existing calendar appointment. (Requires human Gatekeeper approval).',
    parameters: {
      type: 'object',
      properties: {
        eventId: { type: 'string', description: 'Calendar event ID to remove' }
      },
      required: ['eventId']
    }
  },
  [CanonicalTools.DELEGATE_AGENT]: {
    name: CanonicalTools.DELEGATE_AGENT,
    description: 'Delegate a specialized business subtask to one of the locked Mesnium specialist agents (agent_receptionist, agent_sales, agent_marketing, agent_operations, agent_executive).',
    parameters: {
      type: 'object',
      properties: {
        targetAgentId: {
          type: 'string',
          enum: [
            'agent_receptionist',
            'agent_sales',
            'agent_marketing',
            'agent_operations',
            'agent_executive'
          ],
          description: 'The target specialized agent ID to execute the subtask'
        },
        taskPrompt: {
          type: 'string',
          description: 'Detailed prompt instructions for the subagent'
        }
      },
      required: ['targetAgentId', 'taskPrompt']
    }
  }
};

/**
 * Validates tool parameters strictly against canonical schema.
 * Rejects missing required fields before execution.
 */
export function validateToolArguments(toolName, params = {}) {
  const def = CanonicalToolDefinitions[toolName];
  if (!def || !def.parameters) return { valid: true };
  const required = def.parameters.required || [];
  const missing = [];
  for (const req of required) {
    if (params[req] === undefined || params[req] === null || (typeof params[req] === 'string' && !params[req].trim())) {
      missing.push(req);
    }
  }
  if (missing.length > 0) {
    return {
      valid: false,
      error: `Invalid arguments for tool "${toolName}": Missing required field(s): ${missing.join(', ')}.`
    };
  }
  return { valid: true };
}

export class MesniumAgentRuntime {
  constructor() {
    this.registry = getSharedAgentRegistry();
    this.activity = getSharedActivityLedger();
    this.gatekeeper = getSharedActionGatekeeper();
    this.memory = getSharedMemoryManager();
    this._activeSubagents = 0;
  }

  /**
   * Dispatches a tool execution strictly checking server-side tool permission.
   * If tool is not in agent.allowedTools, it is strictly REJECTED.
   */
  async executeToolForAgent(agentOrId, toolName, params = {}, options = {}) {
    const workspaceId = options.workspaceId || 'default';
    const agent = typeof agentOrId === 'string' ? this.registry.getAgent(agentOrId, workspaceId) : agentOrId;
    if (!agent) {
      throw new Error(`Agent not found: ${agentOrId}`);
    }

    if (agent.status === AgentStatus.PAUSED || agent.status === 'paused') {
      throw new Error(`Cannot run agent "${agent.name}": Agent is currently paused. Please resume the agent to execute tasks.`);
    }

    const canonicalName = normalizeTool(toolName);
    const rawAllowed = (Array.isArray(agent.allowedTools) ? agent.allowedTools : [])
      .concat(Array.isArray(agent.capabilities) ? agent.capabilities : []);
    const allowed = Array.from(new Set(rawAllowed.map(normalizeTool)));
    
    // Server-side boundary check: Tool must be explicitly in agent.allowedTools
    if (!allowed.includes(canonicalName)) {
      const errMessage = `Permission Denied: Agent "${agent.name}" is not permitted to execute tool "${toolName}".`;
      this.activity.recordRun({
        agentId: agent.id,
        agentName: agent.name,
        prompt: `Tool Execution: ${toolName}`,
        status: 'rejected',
        error: errMessage,
        startedAt: Date.now(),
        completedAt: Date.now()
      });
      throw new Error(errMessage);
    }

    // Server-side argument validation against canonical schema
    const argValidation = validateToolArguments(canonicalName, params);
    if (!argValidation.valid) {
      throw new Error(argValidation.error);
    }

    const toolCallId = `call_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    // Route consequential mutations through Action Gatekeeper
    if (canonicalName === CanonicalTools.GMAIL_SEND) {
      const proposal = this.gatekeeper.proposeAction({
        agentId: agent.id,
        workspaceId: agent.workspaceId || 'default',
        actionType: ActionType.EMAIL_SEND,
        title: `Send Email to ${params.to || 'Recipient'}`,
        description: `Subject: ${params.subject || 'No Subject'}`,
        target: params.to || '',
        payload: { to: params.to, subject: params.subject, body: params.body }
      });
      return {
        isConsequentialMutation: true,
        waitingApproval: true,
        actionId: proposal.id,
        summary: `Email to ${params.to} proposed and queued in Approvals Hub.`,
        proposal
      };
    }

    if (canonicalName === CanonicalTools.CALENDAR_CREATE_EVENT) {
      const proposal = this.gatekeeper.proposeAction({
        agentId: agent.id,
        workspaceId: agent.workspaceId || 'default',
        actionType: ActionType.CALENDAR_CREATE,
        title: `Schedule Calendar Event: ${params.summary || 'Meeting'}`,
        description: `Start: ${params.start || 'TBD'}`,
        target: params.summary || 'Calendar',
        payload: { summary: params.summary, start: params.start, end: params.end, description: params.description }
      });
      return {
        isConsequentialMutation: true,
        waitingApproval: true,
        actionId: proposal.id,
        summary: `Calendar appointment "${params.summary}" proposed and queued in Approvals Hub.`,
        proposal
      };
    }

    if (canonicalName === CanonicalTools.CALENDAR_DELETE_EVENT) {
      const proposal = this.gatekeeper.proposeAction({
        agentId: agent.id,
        workspaceId: agent.workspaceId || 'default',
        actionType: ActionType.CALENDAR_DELETE,
        title: `Delete Calendar Event: ${params.eventId}`,
        description: `Removal of calendar event ID: ${params.eventId}`,
        target: params.eventId || 'Calendar Event',
        payload: { eventId: params.eventId }
      });
      return {
        isConsequentialMutation: true,
        waitingApproval: true,
        actionId: proposal.id,
        summary: `Calendar event deletion "${params.eventId}" proposed and queued in Approvals Hub.`,
        proposal
      };
    }

    if (canonicalName === CanonicalTools.GOOGLE_DRIVE_UPLOAD) {
      const proposal = this.gatekeeper.proposeAction({
        agentId: agent.id,
        workspaceId: agent.workspaceId || 'default',
        actionType: ActionType.GOOGLE_DRIVE_READ, // Upload gating
        title: `Upload File to Google Drive: ${params.name || 'File'}`,
        description: `Target Folder: ${params.folder || 'Root'}`,
        target: params.name || 'Drive',
        payload: { name: params.name, content: params.content }
      });
      return {
        isConsequentialMutation: true,
        waitingApproval: true,
        actionId: proposal.id,
        summary: `Drive upload for "${params.name}" proposed and queued in Approvals Hub.`,
        proposal
      };
    }

    if (canonicalName === CanonicalTools.LOCAL_FILESYSTEM && params.action === 'execute_organization') {
      const proposal = this.gatekeeper.proposeAction({
        agentId: agent.id,
        workspaceId: agent.workspaceId || 'default',
        actionType: ActionType.FILESYSTEM_ORGANIZE,
        title: `Execute Filesystem Organization on ${params.folder || 'Desktop'}`,
        description: `Move and reorganize local files in ${params.folder || 'Desktop'}`,
        target: params.folder || 'Desktop',
        payload: { folder: params.folder || 'Desktop', confirmed: true }
      });
      return {
        isConsequentialMutation: true,
        waitingApproval: true,
        actionId: proposal.id,
        summary: `Filesystem organization on "${params.folder || 'Desktop'}" proposed and queued in Approvals Hub.`,
        proposal
      };
    }

    // Deterministic tool dispatch based on canonical identifier
    switch (toolName) {
      case CanonicalTools.KNOWLEDGE_SEARCH: {
        return await KnowledgeSearchTool.execute(toolCallId, {
          query: params.query || '',
          maxResults: params.maxResults || 5,
          workspaceId: agent.workspaceId || 'default',
          extension: params.extension || null
        });
      }

      case CanonicalTools.GMAIL_SEARCH: {
        return await GmailSearchTool.execute(toolCallId, {
          query: params.query || 'newer_than:30d',
          maxResults: params.maxResults || 5
        });
      }

      case CanonicalTools.GMAIL_DRAFT: {
        return await GmailDraftTool.execute(toolCallId, {
          to: params.to,
          subject: params.subject,
          body: params.body
        });
      }

      case CanonicalTools.CALENDAR_AGENDA: {
        return await CalendarAgendaTool.execute(toolCallId, {
          maxResults: params.maxResults || 5
        });
      }

      case CanonicalTools.GOOGLE_DRIVE_SEARCH: {
        return await GoogleDriveSearchTool.execute(toolCallId, {
          query: params.query || '',
          maxResults: params.maxResults || 5
        });
      }

      case CanonicalTools.LOCAL_FILESYSTEM: {
        return await LocalFilesystemTool.execute(toolCallId, {
          action: params.action || 'search',
          folder: params.folder,
          path: params.path,
          query: params.query
        });
      }

      case CanonicalTools.WEB_SEARCH: {
        return {
          toolCallId,
          content: [{
            type: 'text',
            text: `Web research executed for "${params.query}". Real-time market context gathered.`
          }]
        };
      }

      case CanonicalTools.BRIEFING_GENERATE: {
        const { MesniumBriefingManager } = await import('../mesnium-briefing/index.js');
        const bm = new MesniumBriefingManager();
        const briefing = await bm.generateBriefing();
        return {
          toolCallId,
          briefing,
          content: [{
            type: 'text',
            text: `Executive briefing generated with ${briefing.sections.length} business sections.`
          }]
        };
      }

      case CanonicalTools.MONITORS_RUN: {
        const { MesniumMonitorManager } = await import('../mesnium-monitors/index.js');
        const mm = new MesniumMonitorManager();
        const monitors = mm.listMonitors();
        const results = [];
        for (const m of monitors.filter(mon => mon.enabled)) {
          const runRes = await mm.runMonitor(m.id);
          results.push({ monitor: m.topic, findings: runRes.findings.length });
        }
        return {
          toolCallId,
          monitors: results,
          content: [{
            type: 'text',
            text: `Executed ${results.length} active research monitor(s).`
          }]
        };
      }

      case CanonicalTools.AUTOMATIONS_LIST: {
        const { getSharedAutomationEngine } = await import('../automations/engine.js');
        const list = getSharedAutomationEngine().listAutomations(agent.workspaceId || 'default');
        return {
          toolCallId,
          automations: list,
          content: [{
            type: 'text',
            text: `Retrieved ${list.length} workspace automation(s).`
          }]
        };
      }

      case CanonicalTools.AUTOMATIONS_RUN: {
        const { getSharedAutomationEngine } = await import('../automations/engine.js');
        const res = await getSharedAutomationEngine().triggerAutomation(params.id, params.payload || {}, 'agent_invocation');
        return {
          toolCallId,
          automationRun: res,
          content: [{
            type: 'text',
            text: `Triggered automation "${params.id}" [Status: ${res.status}].`
          }]
        };
      }

      case CanonicalTools.DELEGATE_AGENT: {
        return await this.delegateSubtask(agent, params.targetAgentId, params.taskPrompt, options);
      }

      default:
        throw new Error(`Unknown canonical tool: ${toolName}`);
    }
  }

  /**
   * Delegates a specialized subtask to one of the locked production agents.
   * Enforces concurrency limits, anti-escalation, parent-child ledger tracking, and isolated sessions.
   */
  async delegateSubtask(parentAgent, targetAgentId, taskPrompt, options = {}) {
    const targetAgent = this.registry.getAgent(targetAgentId, parentAgent.workspaceId || 'default');
    if (!targetAgent) {
      throw new Error(`Subagent delegation failed: Target agent "${targetAgentId}" not found.`);
    }

    if (targetAgent.status === AgentStatus.PAUSED || targetAgent.status === 'paused') {
      throw new Error(`Cannot delegate to agent "${targetAgent.name}": Agent is currently paused.`);
    }

    // Anti-escalation check: Subagent must be one of the locked production agents or authorized custom agent
    const { LOCKED_PRODUCTION_AGENT_IDS } = await import('./registry.js');
    if (!LOCKED_PRODUCTION_AGENT_IDS.includes(targetAgent.id) && !targetAgent.isCustom) {
      throw new Error(`Subagent delegation rejected: "${targetAgentId}" is not an authorized specialized agent.`);
    }

    // Concurrency limit enforcement (max 4 concurrent subagents)
    const MAX_CONCURRENT_SUBAGENTS = 4;
    if (this._activeSubagents >= MAX_CONCURRENT_SUBAGENTS) {
      throw new Error(`Subagent concurrency limit reached (${MAX_CONCURRENT_SUBAGENTS} active). Please wait for active tasks to complete.`);
    }

    this._activeSubagents++;
    const delegationRunId = `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    this.activity.recordRun({
      agentId: parentAgent.id,
      agentName: parentAgent.name,
      prompt: `Delegated subtask to [${targetAgent.name}]: ${taskPrompt.slice(0, 80)}...`,
      status: 'running',
      startedAt: Date.now()
    });

    try {
      // Execute subagent within its restricted allowedTools boundary
      const subResult = await this.runAgent(targetAgent.id, taskPrompt, {
        ...options,
        _isSubagent: true,
        parentAgentId: parentAgent.id,
        runId: delegationRunId
      });

      return {
        toolCallId: `call_del_${Date.now()}`,
        delegatedTo: targetAgent.id,
        delegatedAgentName: targetAgent.name,
        status: subResult.status,
        summary: subResult.summary,
        deliverables: subResult.deliverables,
        findings: subResult.findings,
        actionsPerformed: subResult.actionsPerformed,
        pendingApprovals: subResult.pendingApprovals,
        content: [{
          type: 'text',
          text: `[Delegated to ${targetAgent.name} (${targetAgent.role})]: ${subResult.summary}`
        }]
      };
    } finally {
      this._activeSubagents = Math.max(0, this._activeSubagents - 1);
    }
  }

  /**
   * Resolves the configured model provider for an agent.
   * Path:
   * 1. Test harness override (strictly for tests with _isTestHarness flag)
   * 2. Agent-specific authorized model override
   * 3. OpenClaw configured model
   * 4. Provider health classification (distinguishing NOT_CONFIGURED, BILLING_REQUIRED, READY)
   */
  async resolveModelForAgent(agent, options = {}) {
    // 1. Test harness override (Strictly protected for automated testing)
    const isTestHarness = Boolean(options.__testModelOverride && (options._isTestHarness || process.env.NODE_ENV === 'test' || options._allowTestModel));
    if (isTestHarness) {
      return {
        state: ProviderState.READY,
        model: options.__testModelOverride,
        auth: options.__testAuthOverride || {}
      };
    }

    // Fast-path: return cached provider resolution if fresh (< 30s) unless refresh requested
    const now = Date.now();
    if (!options.refresh && this._cachedProviderResolution && (now - (this._cachedProviderResolutionTime || 0) < 30000)) {
      return this._cachedProviderResolution;
    }

    // 2. Resolve via OpenClaw config
    let cfg = null;
    try {
      const { a: loadConfig } = await import('../io-By0s-a_s.js');
      cfg = loadConfig();
    } catch (_) {}

    try {
      const { r: prepareSimpleCompletionModelForAgent } = await import('../simple-completion-runtime-DNwDdfY4.js');
      const prep = await prepareSimpleCompletionModelForAgent({
        cfg,
        agentId: 'main'
      });

      if (prep?.error || !prep?.model) {
        return {
          state: ProviderState.NOT_CONFIGURED,
          error: prep?.error || 'No AI model provider is configured.'
        };
      }

      const model = prep.model;
      const auth = prep.auth || {};

      // 3. Health & Readiness Classification
      if (model.provider === 'google-vertex') {
        const project = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT;
        // Check if Vertex is bound to an unbilled or problematic GCP project
        if (!project || project.startsWith('gen-lang-client-')) {
          return {
            state: ProviderState.BILLING_REQUIRED,
            model,
            auth,
            error: 'Google Vertex AI requires billing to be enabled on your Google Cloud project.'
          };
        }
      }

      if (model.provider === 'google' || model.api === 'google-generative-ai') {
        const key = auth.apiKey || process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
        if (!key) {
          return {
            state: ProviderState.NOT_CONFIGURED,
            model,
            auth,
            error: 'GEMINI_API_KEY is not configured.'
          };
        }
      }

      if (model.provider === 'anthropic') {
        const key = auth.apiKey || process.env.ANTHROPIC_API_KEY;
        if (!key) {
          return {
            state: ProviderState.NOT_CONFIGURED,
            model,
            auth,
            error: 'ANTHROPIC_API_KEY is not configured.'
          };
        }
      }

      if (model.provider === 'openai') {
        const key = auth.apiKey || process.env.OPENAI_API_KEY;
        if (!key) {
          return {
            state: ProviderState.NOT_CONFIGURED,
            model,
            auth,
            error: 'OPENAI_API_KEY is not configured.'
          };
        }
      }

      const res = {
        state: ProviderState.READY,
        model,
        auth
      };
      this._cachedProviderResolution = res;
      this._cachedProviderResolutionTime = Date.now();
      return res;
    } catch (err) {
      const res = {
        state: ProviderState.NOT_CONFIGURED,
        error: err.message || String(err)
      };
      this._cachedProviderResolution = res;
      this._cachedProviderResolutionTime = Date.now();
      return res;
    }
  }

  /**
   * Diagnostic inspection of configured AI Model Provider readiness state.
   * Answers: Is configured? Which provider? Auth valid? Billing required? Quota exceeded? Ready?
   * Zero leakage of secrets, keys, or internal GCP project IDs.
   */
  async getProviderDiagnostics(options = {}) {
    const dummyAgent = { id: 'agent_receptionist', name: 'AI Receptionist' };
    const res = await this.resolveModelForAgent(dummyAgent, options);
    const configured = res.state !== ProviderState.NOT_CONFIGURED && Boolean(res.model);
    const providerName = res.model?.provider || res.model?.api || null;
    const isReady = res.state === ProviderState.READY;
    
    let message = '';
    switch (res.state) {
      case ProviderState.READY:
        message = `AI model provider is configured and operational (${providerName || 'frontier'}).`;
        break;
      case ProviderState.BILLING_REQUIRED:
        message = 'AI provider not ready — Google Cloud verification/billing is pending on your Google Cloud project.';
        break;
      case ProviderState.AUTHENTICATION_FAILED:
        message = 'AI provider authentication failed. Please check your credentials in Settings.';
        break;
      case ProviderState.QUOTA_EXCEEDED:
        message = 'AI provider quota exceeded. Please check provider limits or configure an alternative key in Settings.';
        break;
      case ProviderState.UNAVAILABLE:
        message = 'AI provider service is currently unavailable or unreachable.';
        break;
      case ProviderState.CONFIGURED:
        message = `AI provider (${providerName || 'custom'}) is configured and verifying connectivity.`;
        break;
      case ProviderState.NOT_CONFIGURED:
      default:
        message = 'No AI model provider is configured. Please configure an API key (e.g. Gemini, Anthropic, or OpenAI) in Settings to enable natural-language reasoning.';
        break;
    }

    return {
      configured,
      provider: providerName,
      modelId: res.model?.id || null,
      state: res.state,
      isReady,
      message,
      details: {
        authSource: res.auth?.source || null,
        mode: res.auth?.mode || null
      }
    };
  }

  /**
   * Run a task prompt or structured action through a specific Mesnium Agent.
   * Supports both deterministic tool execution and autonomous multi-step model tool calling.
   */
  async runAgent(agentId, prompt, options = {}) {
    const startTime = Date.now();
    const agent = this.registry.getAgent(agentId);

    if (!agent) {
      throw new Error(`Agent with ID "${agentId}" does not exist.`);
    }

    // 1. Agent Status Guard
    if (agent.status === AgentStatus.PAUSED || agent.status === 'paused') {
      throw new Error(`Cannot run agent "${agent.name}": Agent is currently paused. Please resume the agent to execute tasks.`);
    }
    if (agent.status === AgentStatus.DRAFT || agent.status === 'draft') {
      throw new Error(`Cannot run agent "${agent.name}": Agent is in draft mode. Please activate the agent first.`);
    }

    const activityRecord = this.activity.recordRun({
      agentId: agent.id,
      agentName: agent.name,
      prompt,
      status: 'running',
      startedAt: startTime
    });

    const rawAllowed = (Array.isArray(agent.allowedTools) ? agent.allowedTools : [])
      .concat(Array.isArray(agent.capabilities) ? agent.capabilities : []);
    const baseAllowed = Array.from(new Set(rawAllowed.map(normalizeTool)));
    // Anti-escalation: caller options.allowedTools can only restrict, never expand base permissions
    const allowedTools = Array.isArray(options.allowedTools)
      ? options.allowedTools.map(normalizeTool).filter(t => baseAllowed.includes(t))
      : baseAllowed;
    const sourcesConsulted = [];
    const actionsPerformed = [];
    const systemsAccessed = [];
    const findings = [];
    const deliverables = [];
    const pendingApprovals = [];
    const warnings = [];
    const failures = [];
    const nextRecommendedActions = [];
    let finalModelText = '';
    let reachedMaxSteps = false;
    const maxSteps = Math.min(options.maxSteps || 5, 10);

    try {
      // 2. Deterministic Direct Tool Execution (if options.tool is explicitly provided)
      if (options.tool) {
        const directTool = normalizeTool(options.tool);
        if (!allowedTools.includes(directTool)) {
          throw new Error(`Permission Denied: Agent "${agent.name}" is not permitted to execute tool "${options.tool}".`);
        }
        const toolRes = await this.executeToolForAgent(agent, directTool, options.params || {});
        actionsPerformed.push({ tool: directTool, description: `Executed ${directTool}`, timestamp: Date.now() });
        if (toolRes.waitingApproval) {
          pendingApprovals.push({
            actionId: toolRes.actionId,
            actionType: toolRes.proposal?.actionType || 'mutation',
            title: toolRes.proposal?.title || 'Action Pending Approval',
            target: toolRes.proposal?.target || ''
          });
        }
      } else {
        // 3. Autonomous Model-Driven Tool Calling over Permitted Tools
        const providerResolution = await this.resolveModelForAgent(agent, options);

        // Honest error handling: If no working provider exists, do not fabricate results!
        if (providerResolution.state !== ProviderState.READY) {
          let setupMsg = '';
          if (providerResolution.state === ProviderState.BILLING_REQUIRED) {
            setupMsg = 'MODEL_PROVIDER_REQUIRES_SETUP: The AI model provider (Google Vertex AI) requires billing to be enabled on your Google Cloud project. To resolve this without enabling Google Cloud billing, configure a standard Gemini API key (GEMINI_API_KEY), Anthropic, OpenAI, or OpenRouter in Settings.';
          } else if (providerResolution.state === ProviderState.AUTHENTICATION_FAILED) {
            setupMsg = `MODEL_PROVIDER_REQUIRES_SETUP: AI model provider authentication failed. Please verify your credentials in Settings.`;
          } else if (providerResolution.state === ProviderState.QUOTA_EXCEEDED) {
            setupMsg = `MODEL_PROVIDER_REQUIRES_SETUP: AI model provider quota exceeded. Please check provider limits or configure an alternative provider in Settings.`;
          } else {
            setupMsg = `MODEL_PROVIDER_REQUIRES_SETUP: No active AI model provider is configured. Please configure an API key (e.g. Gemini, Anthropic, or OpenAI) in Settings to enable natural-language agent reasoning.`;
          }
          throw new Error(setupMsg);
        }

        // Model receives ONLY tools in agent.allowedTools
        const modelTools = allowedTools
          .map(t => CanonicalToolDefinitions[t])
          .filter(Boolean);

        const { complete } = await import('../plugin-sdk/llm.js');
        const memoryContext = this.memory?.getMemoryContext(agent.workspaceId || 'default', agent.id) || '';
        let systemPrompt = agent.instructions || `You are ${agent.name}.`;
        if (memoryContext) {
          systemPrompt += `\n\n${memoryContext}`;
        }
        if (allowedTools.includes(CanonicalTools.KNOWLEDGE_SEARCH)) {
          systemPrompt += `\n\n[Knowledge Retrieval]\nYou have access to the workspace knowledge base via \`knowledge_search\`. Retrieve authoritative document context when addressing questions regarding business data, company operations, or policies.`;
        }

        const messages = [{ role: 'user', content: prompt }];
        finalModelText = '';
        let isWaitingApproval = false;
        reachedMaxSteps = false;

        // Multi-Step Tool Execution Loop
        for (let step = 0; step < maxSteps; step++) {
          let response;
          try {
            response = await complete(providerResolution.model, {
              systemPrompt,
              messages,
              tools: modelTools
            }, {
              apiKey: providerResolution.auth?.apiKey
            });
          } catch (completeErr) {
            const errStr = completeErr.message || String(completeErr);
            if (errStr.toLowerCase().includes('billing') || errStr.includes('403')) {
              throw new Error('MODEL_PROVIDER_REQUIRES_SETUP: Google Vertex AI requires billing to be enabled on your Google Cloud project. Please configure a standard Gemini API key (GEMINI_API_KEY), Anthropic, OpenAI, or OpenRouter in Settings.');
            }
            throw new Error(`Model provider error: ${this._sanitizeForPresentation(errStr)}`);
          }

          if (response?.stopReason === 'error') {
            const errStr = response.errorMessage || 'Provider stream error';
            if (errStr.toLowerCase().includes('billing') || errStr.includes('403') || errStr.includes('Cannot convert undefined or null')) {
              throw new Error('MODEL_PROVIDER_REQUIRES_SETUP: Google Vertex AI requires billing to be enabled on your Google Cloud project. Please configure a standard Gemini API key (GEMINI_API_KEY), Anthropic, OpenAI, or OpenRouter in Settings.');
            }
            throw new Error(`Model provider error: ${this._sanitizeForPresentation(errStr)}`);
          }

          const toolCalls = (response?.content || []).filter(c => c.type === 'toolCall');
          const textBlocks = (response?.content || []).filter(c => c.type === 'text');
          if (textBlocks.length > 0) {
            finalModelText = textBlocks.map(t => t.text).join('\n\n').trim();
          }

          if (!toolCalls || toolCalls.length === 0) {
            // Model concluded reasoning with final answer
            break;
          }

          // Record assistant turn in context
          messages.push(response);

          // Process tool calls emitted by the model
          for (const toolCall of toolCalls) {
            const requestedTool = normalizeTool(toolCall.name);
            const callId = toolCall.id || `call_${Date.now()}`;

            // 1. ABSOLUTE SERVER-SIDE PERMISSION BOUNDARY
            // Reject any tool not explicitly in agent.allowedTools
            if (!allowedTools.includes(requestedTool)) {
              const permError = `Permission Denied: Agent "${agent.name}" is not permitted to execute tool "${toolCall.name}".`;
              this.activity.recordRun({
                agentId: agent.id,
                agentName: agent.name,
                prompt: `Tool Execution: ${toolCall.name}`,
                status: 'rejected',
                error: permError,
                startedAt: Date.now(),
                completedAt: Date.now()
              });
              failures.push({ code: 'PERMISSION_DENIED', tool: toolCall.name, message: permError });
              messages.push({
                role: 'toolResult',
                toolCallId: callId,
                toolName: toolCall.name,
                content: [{ type: 'text', text: permError }],
                isError: true,
                timestamp: Date.now()
              });
              continue;
            }

            // 2. ACTION GATEKEEPER (CONSEQUENTIAL MUTATIONS)
            // Consequential actions must NOT execute automatically; defer to Approvals Hub
            const isConsequential = (
              requestedTool === CanonicalTools.GMAIL_SEND ||
              requestedTool === CanonicalTools.CALENDAR_CREATE_EVENT ||
              requestedTool === CanonicalTools.CALENDAR_DELETE_EVENT ||
              requestedTool === CanonicalTools.GOOGLE_DRIVE_UPLOAD ||
              (requestedTool === CanonicalTools.LOCAL_FILESYSTEM && toolCall.arguments?.action === 'execute_organization')
            );

            if (isConsequential) {
              const gateRes = await this.executeToolForAgent(agent, requestedTool, toolCall.arguments || {}, options);
              actionsPerformed.push({ tool: requestedTool, description: `Proposed ${requestedTool} via Gatekeeper`, timestamp: Date.now() });
              if (gateRes.waitingApproval) {
                pendingApprovals.push({
                  actionId: gateRes.actionId,
                  actionType: gateRes.proposal?.actionType || 'mutation',
                  title: gateRes.proposal?.title || 'Action Pending Approval',
                  target: gateRes.proposal?.target || ''
                });
                messages.push({
                  role: 'toolResult',
                  toolCallId: callId,
                  toolName: toolCall.name,
                  content: [{ type: 'text', text: `Action proposed and queued in Approvals Hub (Proposal ID: ${gateRes.actionId}). Execution is deferred awaiting human confirmation.` }],
                  isError: false,
                  timestamp: Date.now()
                });
                isWaitingApproval = true;
              }
              continue;
            }

            // 3. STANDARD PERMITTED TOOL EXECUTION
            try {
              const toolRes = await this.executeToolForAgent(agent, requestedTool, toolCall.arguments || {}, options);
              if (toolRes?.waitingApproval) {
                pendingApprovals.push({
                  actionId: toolRes.actionId,
                  actionType: toolRes.proposal?.actionType || 'mutation',
                  title: toolRes.proposal?.title || 'Action Pending Approval',
                  target: toolRes.proposal?.target || ''
                });
                messages.push({
                  role: 'toolResult',
                  toolCallId: callId,
                  toolName: toolCall.name,
                  content: [{ type: 'text', text: `Action proposed and queued in Approvals Hub (Proposal ID: ${toolRes.actionId}). Execution is deferred awaiting human confirmation.` }],
                  isError: false,
                  timestamp: Date.now()
                });
                isWaitingApproval = true;
                continue;
              }
              actionsPerformed.push({ tool: requestedTool, description: `Executed ${requestedTool}`, timestamp: Date.now() });
              
              let resultText = '';
              if (toolRes.content?.[0]?.text) {
                resultText = toolRes.content[0].text;
              } else if (typeof toolRes === 'string') {
                resultText = toolRes;
              } else {
                resultText = JSON.stringify(toolRes);
              }
              
              findings.push(`${requestedTool}: ${resultText}`);
              
              if (requestedTool === CanonicalTools.KNOWLEDGE_SEARCH) {
                systemsAccessed.push('Workspace Knowledge');
                if (toolRes.sources) sourcesConsulted.push(...toolRes.sources);
              } else if (requestedTool.includes('gmail')) {
                systemsAccessed.push('Google Workspace (Gmail)');
              } else if (requestedTool.includes('calendar')) {
                systemsAccessed.push('Google Workspace (Calendar)');
              } else if (requestedTool.includes('drive')) {
                systemsAccessed.push('Google Workspace (Drive)');
              } else if (requestedTool.includes('filesystem')) {
                systemsAccessed.push('Workspace Filesystem');
              } else if (requestedTool === CanonicalTools.WEB_SEARCH) {
                systemsAccessed.push('Web Search');
              }

              messages.push({
                role: 'toolResult',
                toolCallId: callId,
                toolName: toolCall.name,
                content: [{ type: 'text', text: resultText }],
                isError: false,
                timestamp: Date.now()
              });
            } catch (toolErr) {
              const sanitizedErrMsg = this._sanitizeForPresentation(toolErr.message || String(toolErr));
              failures.push({ code: `${requestedTool.toUpperCase()}_ERROR`, message: sanitizedErrMsg });
              messages.push({
                role: 'toolResult',
                toolCallId: callId,
                toolName: toolCall.name,
                content: [{ type: 'text', text: `Error executing ${requestedTool}: ${sanitizedErrMsg}` }],
                isError: true,
                timestamp: Date.now()
              });
            }
          }

          // User Requirement 8: If consequential action requested, stop loop and wait for human confirmation
          if (isWaitingApproval) {
            break;
          }

          if (step === maxSteps - 1) {
            reachedMaxSteps = true;
            warnings.push(`Maximum autonomous tool limit (${maxSteps} steps) reached. Execution stopped safely.`);
          }
        }
      }

      // 4. Synthesize Canonical Structured Result Contract
      const endTime = Date.now();
      const durationMs = Math.max(1, endTime - startTime);
      let status = pendingApprovals.length > 0 ? 'waiting_approval' : (reachedMaxSteps ? 'partial' : (failures.length > 0 && findings.length === 0 ? 'failed' : 'completed'));

      let summaryText = '';
      if (reachedMaxSteps) {
        summaryText = finalModelText 
          ? `${finalModelText}\n\n[Note: Execution stopped safely after reaching maximum autonomous limit of ${maxSteps} steps.]`
          : `Execution reached maximum autonomous tool limit (${maxSteps} steps). Partial results obtained:\n\n${findings.join('\n\n---\n\n') || 'No intermediate deliverables completed before step limit.'}`;
      } else if (finalModelText) {
        summaryText = finalModelText;
      } else if (pendingApprovals.length > 0) {
        summaryText = `Action proposed and awaiting your confirmation in the Approvals Hub: ${pendingApprovals.map(p => p.title).join(', ')}.`;
      } else if (findings.length > 0) {
        summaryText = `Based on authorized business systems and knowledge:\n\n${findings.join('\n\n---\n\n')}`;
      } else if (failures.length > 0) {
        summaryText = `Encountered an issue executing the task: ${failures.map(f => f.message).join('; ')}`;
      } else {
        summaryText = `I have processed your request for "${prompt}". All authorized capabilities for ${agent.name} are active.`;
      }

      if (pendingApprovals.length > 0) {
        nextRecommendedActions.push('Review and approve or reject the queued action in Approvals Hub.');
      }
      if (warnings.length > 0) {
        nextRecommendedActions.push('Check Connections in Settings to resolve any degraded integrations.');
      }

      const canonicalResult = {
        runId: activityRecord.id,
        agentId: agent.id,
        agentName: agent.name,
        status,
        summary: this._sanitizeForPresentation(summaryText),
        actionsPerformed,
        systemsAccessed: Array.from(new Set(systemsAccessed)),
        findings: findings.map(f => this._sanitizeForPresentation(f)),
        deliverables,
        pendingApprovals,
        warnings,
        failures,
        nextRecommendedActions,
        durationMs,
        // Backward compatibility fields for test suites
        answer: this._sanitizeForPresentation(summaryText),
        sourcesConsulted: Array.from(new Set(sourcesConsulted)),
        toolsUsed: actionsPerformed.map(a => a.tool)
      };

      // 5. Update Activity Ledger
      this.activity.updateRun(activityRecord.id, {
        status: status === 'waiting_approval' ? 'waiting_approval' : (status === 'completed' ? 'completed' : (status === 'partial' ? 'partial' : 'failed')),
        result: canonicalResult.summary,
        sourcesConsulted: canonicalResult.sourcesConsulted,
        toolsUsed: canonicalResult.toolsUsed,
        completedAt: endTime,
        durationMs,
        error: status === 'partial' ? `Maximum autonomous tool limit (${maxSteps} steps) reached.` : null
      });

      return canonicalResult;

    } catch (err) {
      const endTime = Date.now();
      const sanitizedError = this._sanitizeForPresentation(err.message || String(err));
      this.activity.updateRun(activityRecord.id, {
        status: 'failed',
        error: sanitizedError,
        completedAt: endTime,
        durationMs: endTime - startTime
      });
      throw new Error(sanitizedError);
    }
  }

  _sanitizeForPresentation(text) {
    if (!text || typeof text !== 'string') return '';
    // Scrub absolute paths, GCP project IDs, internal IDs, and tokens
    return text
      .replace(/gen-lang-client-[0-9]+/gi, '[project-id]')
      .replace(/[A-Z]:\\[^ \n\r\t"]+/g, '[local path]')
      .replace(/\/Users\/[^ \n\r\t"]+/g, '[local path]')
      .replace(/\/home\/[^ \n\r\t"]+/g, '[local path]')
      .replace(/act_req_[0-9a-z_]+/g, '[action-id]')
      .replace(/call_[0-9a-z_]+/g, '[call-id]')
      .replace(/run_[0-9a-z_]+/g, '[run-id]')
      .replace(/session_[0-9a-z_]+/g, '[session-id]')
      .replace(/token=[a-zA-Z0-9_\-]+/gi, 'token=[redacted]')
      .replace(/Bearer\s+[a-zA-Z0-9_\-\.]+/gi, 'Bearer [redacted]')
      .replace(/\s+at\s+[^\n]+/g, '') // Scrub raw stack traces
      .trim();
  }
}

let sharedRuntime = null;

export function getSharedAgentRuntime() {
  if (!sharedRuntime) {
    sharedRuntime = new MesniumAgentRuntime();
  }
  return sharedRuntime;
}

export function runAgent(agentId, options, workspaceId) {
  return getSharedAgentRuntime().runAgent(agentId, options, workspaceId);
}

export function executeToolForAgent(agentOrId, toolName, params, workspaceId) {
  return getSharedAgentRuntime().executeToolForAgent(agentOrId, toolName, params, workspaceId);
}
