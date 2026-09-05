/**
 * MESNIUM AGENT REGISTRY & MANAGER (PHASE 11)
 * 
 * Manages the creation, configuration, storage, and lifecycle of Mesnium business agents.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { AgentStatus, AgentRole, AgentCapability, CanonicalTools, CapabilityToolMapping, PermissionMode } from './types.js';

function getAgentsConfigPath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, 'mesnium_agents.json');
}

export class MesniumAgentRegistry {
  constructor(options = {}) {
    this.configPath = options.configPath || getAgentsConfigPath();
    this.agents = new Map(); // id -> Agent
    this.load();
  }

  load() {
    if (fs.existsSync(this.configPath)) {
      try {
        const raw = fs.readFileSync(this.configPath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.agents) && data.agents.length > 0) {
          this.agents.clear();
          for (const a of data.agents) {
            // Tag legacy aliases
            if (a.id === 'agent_research_assistant' || a.id === 'agent_sales_assistant') {
              a.isLegacy = true;
            }
            // Remove hardcoded provider defaults from persisted agents
            if (a.model?.provider === 'google' || a.model?.provider === 'google-vertex') {
              a.model = null;
            }
            this.agents.set(a.id, a);
          }
          // Ensure canonical specialized agents exist
          this._ensureSpecializedAgents();
          return;
        }
      } catch (_) {}
    }
    this.seedDefaultAgents();
  }

  _syncFromDisk() {
    this.load();
  }

  save() {
    try {
      const data = {
        version: '1.2.0',
        updatedAt: Date.now(),
        agents: Array.from(this.agents.values())
      };
      fs.writeFileSync(this.configPath, JSON.stringify(data, null, 2), 'utf8');
    } catch (_) {}
  }

  _ensureSpecializedAgents() {
    const defaultAgents = this._getDefaultAgentDefinitions();
    let updated = false;
    for (const def of defaultAgents) {
      if (!this.agents.has(def.id)) {
        this.agents.set(def.id, def);
        updated = true;
      }
    }
    if (updated) this.save();
  }

  _getDefaultAgentDefinitions() {
    return [
      // 1. AI Receptionist
      {
        id: 'agent_receptionist',
        name: 'AI Receptionist',
        role: AgentRole.RECEPTIONIST,
        description: 'Handles inbound business inquiries, answers questions using approved knowledge, captures leads, and books appointments.',
        purpose: 'Handle inbound business enquiries, answer questions with grounded knowledge, capture leads, and coordinate appointments.',
        instructions: 'You are the primary business receptionist. Respond professionally to customer inquiries using authorized company knowledge. Capture lead details accurately and check calendar availability for appointments. All appointment bookings and external emails require confirmation.',
        model: null, // Inherits configured model from OpenClaw
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.GMAIL_SEARCH,
          CanonicalTools.GMAIL_DRAFT,
          CanonicalTools.GMAIL_SEND,
          CanonicalTools.CALENDAR_AGENDA,
          CanonicalTools.CALENDAR_CREATE_EVENT
        ],
        requiredIntegrations: [],
        optionalIntegrations: ['google', 'whatsapp'],
        approvalPolicy: {
          [CanonicalTools.CALENDAR_CREATE_EVENT]: true,
          [CanonicalTools.GMAIL_SEND]: true
        },
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        memoryPolicy: 'shared_business',
        status: AgentStatus.ACTIVE,
        version: '1.2.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now()
      },

      // 2. Sales Agent
      {
        id: 'agent_sales',
        name: 'Sales Agent',
        role: AgentRole.SALES,
        description: 'Finds and qualifies leads, prepares targeted follow-ups, drafts sales communications, and checks meetings.',
        purpose: 'Qualify sales leads, research prospect context, prepare tailored email follow-ups, and coordinate prospect calls.',
        instructions: 'You are an autonomous sales development agent. Research prospects using company knowledge and web intelligence. Draft compelling, tailored follow-ups based on customer needs. Never send an email without operator approval.',
        model: null, // Inherits configured model from OpenClaw
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.WEB_SEARCH,
          CanonicalTools.GMAIL_SEARCH,
          CanonicalTools.GMAIL_DRAFT,
          CanonicalTools.GMAIL_SEND,
          CanonicalTools.CALENDAR_AGENDA,
          CanonicalTools.CALENDAR_CREATE_EVENT
        ],
        requiredIntegrations: [],
        optionalIntegrations: ['google', 'hubspot'],
        approvalPolicy: {
          [CanonicalTools.GMAIL_SEND]: true,
          [CanonicalTools.CALENDAR_CREATE_EVENT]: true
        },
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        memoryPolicy: 'sales_leads',
        status: AgentStatus.ACTIVE,
        version: '1.2.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now()
      },

      // 3. Marketing Agent
      {
        id: 'agent_marketing',
        name: 'Marketing Agent',
        role: AgentRole.MARKETING,
        description: 'Conducts market and competitor research, analyzes data, drafts campaign content, and creates marketing summaries.',
        purpose: 'Research markets, analyze marketing materials, draft campaign proposals, and produce marketing reports.',
        instructions: 'You are a strategic marketing agent. Conduct in-depth research on competitors and market trends. Analyze indexed materials and files to draft campaign content and synthesis reports.',
        model: null, // Inherits configured model from OpenClaw
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.WEB_SEARCH,
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.LOCAL_FILESYSTEM,
          CanonicalTools.GOOGLE_DRIVE_SEARCH,
          CanonicalTools.BRIEFING_GENERATE
        ],
        requiredIntegrations: [],
        optionalIntegrations: ['google'],
        approvalPolicy: {},
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        memoryPolicy: 'marketing_insights',
        status: AgentStatus.ACTIVE,
        version: '1.2.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now()
      },

      // 4. Operations Agent
      {
        id: 'agent_operations',
        name: 'Operations Agent',
        role: AgentRole.OPERATIONS,
        description: 'Coordinates recurring operational tasks, manages authorized business files, proposes cleanups, and monitors systems.',
        purpose: 'Coordinate business operations, inspect local files, propose safe file reorganizations, and monitor background workflows.',
        instructions: 'You are a meticulous operations manager. Organize authorized business documents safely. Always propose changes and request confirmation before moving or modifying any files.',
        model: null, // Inherits configured model from OpenClaw
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.LOCAL_FILESYSTEM,
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.GOOGLE_DRIVE_SEARCH,
          CanonicalTools.MONITORS_RUN,
          CanonicalTools.AUTOMATIONS_LIST,
          CanonicalTools.AUTOMATIONS_RUN
        ],
        requiredIntegrations: [],
        optionalIntegrations: ['google'],
        approvalPolicy: {
          'local_filesystem:execute_organization': true
        },
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        memoryPolicy: 'operations_audit',
        status: AgentStatus.ACTIVE,
        version: '1.2.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now()
      },

      // 5. Executive Assistant
      {
        id: 'agent_executive',
        name: 'Executive Assistant',
        role: AgentRole.EXECUTIVE,
        description: 'Synthesizes cross-system business intelligence, generates daily executive briefings, and tracks high-priority items.',
        purpose: 'Provide executive business intelligence, synthesize briefings across email and calendar, and track pending approvals.',
        instructions: 'You are the principal executive assistant. Synthesize actionable daily business intelligence across connected systems. Highlight pending approvals, unread customer communications, and upcoming schedule priorities.',
        model: null, // Inherits configured model from OpenClaw
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.GMAIL_SEARCH,
          CanonicalTools.CALENDAR_AGENDA,
          CanonicalTools.GOOGLE_DRIVE_SEARCH,
          CanonicalTools.BRIEFING_GENERATE,
          CanonicalTools.MONITORS_RUN
        ],
        requiredIntegrations: [],
        optionalIntegrations: ['google'],
        approvalPolicy: {},
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        memoryPolicy: 'executive_rhythm',
        status: AgentStatus.ACTIVE,
        version: '1.2.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 3,
        updatedAt: Date.now()
      },

      // Backward compatibility aliases for existing test suites (Hidden from V1.2 UI)
      {
        id: 'agent_research_assistant',
        name: 'Research Assistant',
        role: AgentRole.RESEARCH,
        description: 'Researches business documents, market notes, and knowledge sources to synthesize clear, cited briefings.',
        purpose: 'Researches business documents, market notes, and knowledge sources.',
        instructions: 'You are a meticulous business research assistant. Always base your answers strictly on grounded knowledge from authorized sources. Quote exact metrics and cite source documents accurately.',
        model: null,
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.GOOGLE_DRIVE_SEARCH
        ],
        capabilities: [
          AgentCapability.KNOWLEDGE_SEARCH,
          AgentCapability.GOOGLE_DRIVE_READ
        ],
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        status: AgentStatus.ACTIVE,
        isLegacy: true,
        version: '1.1.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now()
      },
      {
        id: 'agent_sales_assistant',
        name: 'Sales & Operations Assistant',
        role: AgentRole.SALES,
        description: 'Assists with customer proposals, meeting agendas, and inbound communications.',
        purpose: 'Assists with customer proposals and communications.',
        instructions: 'You are an operations and sales assistant. Help draft communications, review upcoming meetings, and check spreadsheet figures. Never take destructive actions without explicit user confirmation.',
        model: null,
        knowledgeScopes: ['all'],
        allowedTools: [
          CanonicalTools.KNOWLEDGE_SEARCH,
          CanonicalTools.GMAIL_SEARCH,
          CanonicalTools.CALENDAR_AGENDA
        ],
        capabilities: [
          AgentCapability.KNOWLEDGE_SEARCH,
          AgentCapability.GMAIL_READ,
          AgentCapability.CALENDAR_READ
        ],
        permissions: {
          [PermissionMode.READ]: true,
          [PermissionMode.PROPOSE]: true,
          [PermissionMode.EXECUTE]: false
        },
        status: AgentStatus.ACTIVE,
        isLegacy: true,
        version: '1.1.0',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 4,
        updatedAt: Date.now()
      }
    ];
  }

  seedDefaultAgents() {
    this.agents.clear();
    for (const def of this._getDefaultAgentDefinitions()) {
      this.agents.set(def.id, def);
    }
    this.save();
  }

  createAgent(data = {}) {
    if (!data.name || !data.name.trim()) throw new Error('Agent Name is required.');
    const id = data.id || `agent_${data.name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    
    const allowedTools = Array.isArray(data.allowedTools) 
      ? Array.from(new Set(data.allowedTools.map(t => CapabilityToolMapping[t] || t)))
      : [CanonicalTools.KNOWLEDGE_SEARCH];

    const agent = {
      id,
      name: data.name.trim(),
      role: data.role || AgentRole.GENERAL,
      description: (data.description || '').trim(),
      purpose: (data.purpose || data.description || '').trim(),
      instructions: (data.instructions || '').trim(),
      model: data.model || null,
      knowledgeScopes: Array.isArray(data.knowledgeScopes) ? data.knowledgeScopes : ['all'],
      allowedTools,
      capabilities: Array.isArray(data.capabilities) ? Array.from(new Set(data.capabilities)) : allowedTools,
      permissions: data.permissions || {
        [PermissionMode.READ]: true,
        [PermissionMode.PROPOSE]: false,
        [PermissionMode.EXECUTE]: false
      },
      requiredIntegrations: Array.isArray(data.requiredIntegrations) ? data.requiredIntegrations : [],
      optionalIntegrations: Array.isArray(data.optionalIntegrations) ? data.optionalIntegrations : [],
      approvalPolicy: data.approvalPolicy || {},
      memoryPolicy: data.memoryPolicy || 'standard',
      status: data.status || AgentStatus.ACTIVE,
      isLegacy: Boolean(data.isLegacy),
      version: data.version || '1.2.0',
      workspaceId: data.workspaceId || 'default',
      createdAt: data.createdAt || Date.now(),
      updatedAt: Date.now()
    };

    this.agents.set(id, agent);
    this.save();
    return agent;
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  isToolAllowedForAgent(agentId, toolName) {
    const agent = this.getAgent(agentId);
    if (!agent) return false;
    const rawAllowed = (Array.isArray(agent.allowedTools) ? agent.allowedTools : [])
      .concat(Array.isArray(agent.capabilities) ? agent.capabilities : []);
    const normalized = rawAllowed.map(t => CapabilityToolMapping[t] || t);
    const target = CapabilityToolMapping[toolName] || toolName;
    return normalized.includes(target);
  }

  updateAgent(id, updates = {}) {
    const existing = this.getAgent(id);
    if (!existing) throw new Error(`Agent not found: ${id}`);

    if (updates.name !== undefined) existing.name = updates.name.trim();
    if (updates.role !== undefined) existing.role = updates.role;
    if (updates.description !== undefined) existing.description = updates.description.trim();
    if (updates.purpose !== undefined) existing.purpose = updates.purpose.trim();
    if (updates.instructions !== undefined) existing.instructions = updates.instructions.trim();
    if (updates.model !== undefined) existing.model = updates.model;
    if (updates.knowledgeScopes !== undefined) existing.knowledgeScopes = Array.from(new Set(updates.knowledgeScopes));
    if (updates.allowedTools !== undefined) existing.allowedTools = Array.from(new Set(updates.allowedTools));
    if (updates.capabilities !== undefined) existing.capabilities = Array.from(new Set(updates.capabilities));
    if (updates.permissions !== undefined) existing.permissions = { ...existing.permissions, ...updates.permissions };
    if (updates.approvalPolicy !== undefined) existing.approvalPolicy = updates.approvalPolicy;
    if (updates.status !== undefined) existing.status = updates.status;
    if (updates.isLegacy !== undefined) existing.isLegacy = Boolean(updates.isLegacy);
    
    existing.updatedAt = Date.now();
    this.save();
    return existing;
  }

  pauseAgent(id) {
    return this.updateAgent(id, { status: AgentStatus.PAUSED });
  }

  resumeAgent(id) {
    return this.updateAgent(id, { status: AgentStatus.ACTIVE });
  }

  deleteAgent(id) {
    const deleted = this.agents.delete(id);
    if (deleted) this.save();
    return deleted;
  }

  listAgents(workspaceId = null, options = {}) {
    let list = Array.from(this.agents.values());
    if (workspaceId && workspaceId !== 'default') {
      list = list.filter(a => a.workspaceId === workspaceId || a.workspaceId === 'default');
    }
    // By default hide legacy agents from V1.2 UI
    if (options.includeLegacy !== true) {
      list = list.filter(a => !a.isLegacy);
    }
    return list;
  }
}

let sharedRegistry = null;

export function getSharedAgentRegistry() {
  if (!sharedRegistry) {
    sharedRegistry = new MesniumAgentRegistry();
  }
  return sharedRegistry;
}
