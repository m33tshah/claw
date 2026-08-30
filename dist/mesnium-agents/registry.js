/**
 * MESNIUM AGENT REGISTRY & MANAGER (PHASE 11)
 * 
 * Manages the creation, configuration, storage, and lifecycle of Mesnium business agents.
 */

import { AgentStatus, AgentRole, AgentCapability, PermissionMode } from './types.js';

export class MesniumAgentRegistry {
  constructor() {
    this.agents = new Map(); // id -> Agent
    this.seedDefaultAgents();
  }

  seedDefaultAgents() {
    // 1. Research Assistant
    this.createAgent({
      id: 'agent_research_assistant',
      name: 'Research Assistant',
      role: AgentRole.RESEARCH,
      description: 'Researches business documents, market notes, and knowledge sources to synthesize clear, cited briefings.',
      instructions: 'You are a meticulous business research assistant. Always base your answers strictly on grounded knowledge from authorized sources. Quote exact metrics and cite source documents accurately.',
      model: { provider: 'google', modelId: 'gemini-2.5-pro' },
      knowledgeScopes: ['all'],
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
      workspaceId: 'default'
    });

    // 2. Sales & Operations Assistant
    this.createAgent({
      id: 'agent_sales_assistant',
      name: 'Sales & Operations Assistant',
      role: AgentRole.SALES,
      description: 'Assists with customer proposals, meeting agendas, and inbound communications.',
      instructions: 'You are an operations and sales assistant. Help draft communications, review upcoming meetings, and check spreadsheet figures. Never take destructive actions without explicit user confirmation.',
      model: { provider: 'google', modelId: 'gemini-2.5-flash' },
      knowledgeScopes: ['all'],
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
      workspaceId: 'default'
    });
  }

  createAgent({
    id = null,
    name,
    role = AgentRole.GENERAL,
    description = '',
    instructions = '',
    model = { provider: 'google', modelId: 'gemini-2.5-pro' },
    knowledgeScopes = ['all'],
    capabilities = [AgentCapability.KNOWLEDGE_SEARCH],
    permissions = {
      [PermissionMode.READ]: true,
      [PermissionMode.PROPOSE]: false,
      [PermissionMode.EXECUTE]: false
    },
    status = AgentStatus.ACTIVE,
    workspaceId = 'default'
  }) {
    if (!name || !name.trim()) throw new Error('Agent Name is required.');
    if (!instructions || !instructions.trim()) throw new Error('Operating instructions are required.');

    const cleanId = id || `agent_${name.toLowerCase().replace(/[^a-z0-9]/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    
    // Validate capabilities against allowed set
    const validCapabilities = Object.values(AgentCapability);
    const filteredCapabilities = capabilities.filter(c => validCapabilities.includes(c));

    const agent = {
      id: cleanId,
      name: name.trim(),
      role,
      description: description.trim(),
      instructions: instructions.trim(),
      model: { ...model },
      knowledgeScopes: Array.from(new Set(knowledgeScopes)),
      capabilities: Array.from(new Set(filteredCapabilities)),
      permissions: { ...permissions },
      status,
      workspaceId,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.agents.set(cleanId, agent);
    return agent;
  }

  getAgent(id) {
    return this.agents.get(id) || null;
  }

  updateAgent(id, updates = {}) {
    const existing = this.getAgent(id);
    if (!existing) throw new Error(`Agent not found: ${id}`);

    if (updates.name !== undefined) existing.name = updates.name.trim();
    if (updates.role !== undefined) existing.role = updates.role;
    if (updates.description !== undefined) existing.description = updates.description.trim();
    if (updates.instructions !== undefined) existing.instructions = updates.instructions.trim();
    if (updates.model !== undefined) existing.model = { ...existing.model, ...updates.model };
    if (updates.knowledgeScopes !== undefined) existing.knowledgeScopes = Array.from(new Set(updates.knowledgeScopes));
    if (updates.capabilities !== undefined) existing.capabilities = Array.from(new Set(updates.capabilities));
    if (updates.permissions !== undefined) existing.permissions = { ...existing.permissions, ...updates.permissions };
    if (updates.status !== undefined) existing.status = updates.status;
    
    existing.updatedAt = Date.now();
    return existing;
  }

  pauseAgent(id) {
    return this.updateAgent(id, { status: AgentStatus.PAUSED });
  }

  resumeAgent(id) {
    return this.updateAgent(id, { status: AgentStatus.ACTIVE });
  }

  deleteAgent(id) {
    return this.agents.delete(id);
  }

  listAgents(workspaceId = null) {
    const list = Array.from(this.agents.values());
    if (workspaceId) {
      return list.filter(a => a.workspaceId === workspaceId || a.workspaceId === 'default');
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
