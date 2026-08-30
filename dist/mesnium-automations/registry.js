/**
 * MESNIUM AUTOMATION REGISTRY & STORE (PHASE 13)
 * 
 * Manages the creation, configuration, scheduling, and lifecycle of Mesnium Automations.
 */

import {
  AutomationStatus,
  TriggerType,
  ScheduleKind,
  ActionStepType,
  AutomationApprovalPolicy
} from './types.js';

export class MesniumAutomationRegistry {
  constructor() {
    this.automations = new Map(); // id -> Automation
    this.seedDefaultAutomations();
  }

  seedDefaultAutomations() {
    // 1. Daily Executive Briefing (Safe / Scheduled)
    this.createAutomation({
      id: 'auto_daily_briefing',
      workspaceId: 'default',
      name: 'Daily Executive Briefing',
      description: 'Gathers quarterly metrics and deployment targets every weekday morning at 9:00 AM.',
      status: AutomationStatus.ACTIVE,
      trigger: {
        type: TriggerType.SCHEDULE,
        schedule: {
          kind: ScheduleKind.CRON,
          expr: '0 9 * * 1-5',
          tz: 'America/New_York',
          label: 'Every weekday at 9:00 AM'
        }
      },
      conditions: [],
      steps: [
        {
          id: 'step_search_docs',
          type: ActionStepType.SEARCH_KNOWLEDGE,
          payload: { query: 'revenue deployment metrics targets', limit: 3 }
        },
        {
          id: 'step_synthesize',
          type: ActionStepType.RUN_AGENT,
          agentId: 'agent_research_assistant',
          payload: { prompt: 'Synthesize the daily executive briefing based on January direct sales revenue and deployment figures.' }
        }
      ],
      agentId: 'agent_research_assistant',
      approvalPolicy: AutomationApprovalPolicy.NO_APPROVAL
    });

    // 2. Lead Outreach & Proposal (Agent-powered + Action Gatekeeper Gated)
    this.createAutomation({
      id: 'auto_lead_outreach',
      workspaceId: 'default',
      name: 'High-Value Lead Outreach',
      description: 'Researches enterprise leads with score > 75 and drafts personalized outreach requiring operator approval.',
      status: AutomationStatus.ACTIVE,
      trigger: {
        type: TriggerType.EVENT,
        eventName: 'lead.created',
        label: 'When a new lead is created'
      },
      conditions: [
        { field: 'lead.score', operator: 'greater_than', value: 75 }
      ],
      steps: [
        {
          id: 'step_draft_email',
          type: ActionStepType.SEND_EMAIL,
          payload: {
            to: '{{lead.email}}',
            subject: 'Mesnium Enterprise Proposal for {{lead.company}}',
            body: 'Hello {{lead.name}}, I reviewed your organization profile and prepared preliminary deployment specifications.'
          }
        }
      ],
      agentId: 'agent_sales_assistant',
      approvalPolicy: AutomationApprovalPolicy.ALWAYS_APPROVE
    });
  }

  createAutomation({
    id = null,
    workspaceId = 'default',
    name,
    description = '',
    status = AutomationStatus.ACTIVE,
    trigger = { type: TriggerType.MANUAL },
    conditions = [],
    steps = [],
    agentId = null,
    approvalPolicy = AutomationApprovalPolicy.INHERIT_AGENT_POLICY
  }) {
    if (!name || !name.trim()) throw new Error('Automation name is required.');
    if (!trigger || !trigger.type) throw new Error('Automation trigger is required.');

    const cleanId = id || `auto_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const now = Date.now();

    // Compute approximate next run for schedule triggers
    let nextRunAt = null;
    if (trigger.type === TriggerType.SCHEDULE) {
      nextRunAt = now + 3600 * 1000; // Next hour default window
    }

    const automation = {
      id: cleanId,
      workspaceId,
      name: name.trim(),
      description: description.trim(),
      status,
      trigger: { ...trigger },
      conditions: Array.isArray(conditions) ? [...conditions] : [],
      steps: Array.isArray(steps) ? [...steps] : [],
      agentId,
      approvalPolicy,
      createdAt: now,
      updatedAt: now,
      lastRunAt: null,
      nextRunAt
    };

    this.automations.set(cleanId, automation);
    return automation;
  }

  getAutomation(id) {
    return this.automations.get(id) || null;
  }

  updateAutomation(id, updates = {}) {
    const existing = this.getAutomation(id);
    if (!existing) throw new Error(`Automation not found: ${id}`);

    if (updates.name !== undefined) existing.name = updates.name.trim();
    if (updates.description !== undefined) existing.description = updates.description.trim();
    if (updates.status !== undefined) existing.status = updates.status;
    if (updates.trigger !== undefined) existing.trigger = { ...existing.trigger, ...updates.trigger };
    if (updates.conditions !== undefined) existing.conditions = [...updates.conditions];
    if (updates.steps !== undefined) existing.steps = [...updates.steps];
    if (updates.agentId !== undefined) existing.agentId = updates.agentId;
    if (updates.approvalPolicy !== undefined) existing.approvalPolicy = updates.approvalPolicy;
    if (updates.lastRunAt !== undefined) existing.lastRunAt = updates.lastRunAt;
    if (updates.nextRunAt !== undefined) existing.nextRunAt = updates.nextRunAt;

    existing.updatedAt = Date.now();
    return existing;
  }

  pauseAutomation(id) {
    return this.updateAutomation(id, { status: AutomationStatus.PAUSED });
  }

  resumeAutomation(id) {
    return this.updateAutomation(id, { status: AutomationStatus.ACTIVE });
  }

  deleteAutomation(id) {
    return this.automations.delete(id);
  }

  listAutomations(workspaceId = null) {
    const list = Array.from(this.automations.values());
    if (workspaceId) {
      return list.filter(a => a.workspaceId === workspaceId || a.workspaceId === 'default');
    }
    return list;
  }
}

let sharedRegistry = null;

export function getSharedAutomationRegistry() {
  if (!sharedRegistry) {
    sharedRegistry = new MesniumAutomationRegistry();
  }
  return sharedRegistry;
}
