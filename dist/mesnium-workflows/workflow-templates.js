/**
 * MESNIUM WORKFLOW ENGINE — REUSABLE WORKFLOW TEMPLATES (PHASE 4)
 * 
 * Defines the 5 canonical business workflow templates:
 * 1. New Lead Follow-Up (Receptionist -> Sales -> Calendar booking with Gatekeeper)
 * 2. Appointment Reminder (Calendar agenda -> Operations -> Email send)
 * 3. No-Show Recovery (Condition -> Operations -> Reschedule draft -> Sales alert)
 * 4. Lead Escalation (VIP threshold condition -> Executive briefing -> Priority alert)
 * 5. Daily Executive Briefing (Inbox & calendar scan -> Executive synthesis)
 * 
 * Rules:
 * - Pure configuration: Zero executable JavaScript strings.
 * - Invokes ONLY canonical Mesnium agents.
 * - Declares required capabilities advisory without granting tools.
 */

import { WorkflowStatus, WorkflowStepType, TriggerType } from './types.js';

export const BUILTIN_WORKFLOW_TEMPLATES = Object.freeze([
  {
    id: 'template_lead_followup',
    name: 'New Lead Follow-Up',
    description: 'Captures and qualifies inbound inquiries via AI Receptionist, prepares tailored follow-up via Sales, and requests calendar scheduling through Gatekeeper approval.',
    version: '1.0.0',
    category: 'sales',
    requiredCapabilities: ['crm', 'calendar', 'email'],
    trigger: {
      type: TriggerType.EVENT,
      event: 'lead.received'
    },
    steps: [
      {
        id: 'step_intake_qualify',
        name: 'Receptionist Intake & Qualification',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_receptionist',
        input: {
          task: 'Extract caller/visitor requirements, verify budget and timeline, and assess qualification status.'
        }
      },
      {
        id: 'step_check_qualified',
        name: 'Evaluate Lead Qualification',
        type: WorkflowStepType.CONDITION,
        conditions: [
          { field: 'lead.isQualified', operator: '==', value: true }
        ]
      },
      {
        id: 'step_sales_prep',
        name: 'Sales Strategy & Follow-Up Formulation',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_sales',
        input: {
          task: 'Formulate bespoke proposal, address prospective objections, and prepare personalized consultation schedule proposal.'
        }
      },
      {
        id: 'step_calendar_booking',
        name: 'Schedule Consultation Appointment',
        type: WorkflowStepType.ACTION,
        agentId: 'agent_sales',
        action: 'calendar_create_event',
        requiredCapabilities: ['calendar'],
        approvalRequired: true,
        input: {
          title: 'Consultation with Qualified Prospect',
          durationMinutes: 45
        }
      },
      {
        id: 'step_confirmation',
        name: 'Record Workflow Completion',
        type: WorkflowStepType.NOTIFICATION,
        input: {
          summary: 'Lead follow-up workflow successfully executed with consultation appointment queued.'
        }
      }
    ],
    metadata: {
      businessPackCompatible: ['pack_real_estate', 'pack_general'],
      author: 'Mesnium Core'
    }
  },
  {
    id: 'template_appointment_reminder',
    name: 'Appointment Reminder',
    description: 'Scans upcoming scheduled calendar appointments, generates personalized reminder notices via Operations Agent, and queues reminder dispatch.',
    version: '1.0.0',
    category: 'operations',
    requiredCapabilities: ['calendar', 'email'],
    trigger: {
      type: TriggerType.SCHEDULE,
      scheduleExpr: 'every 1h'
    },
    steps: [
      {
        id: 'step_fetch_calendar',
        name: 'Retrieve Upcoming Appointments',
        type: WorkflowStepType.ACTION,
        action: 'calendar_agenda',
        requiredCapabilities: ['calendar'],
        input: {
          rangeHours: 24
        }
      },
      {
        id: 'step_draft_reminder',
        name: 'Draft Personalized Appointment Reminder',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_operations',
        input: {
          task: 'Draft polite, clear appointment reminders confirming meeting times and location details.'
        }
      },
      {
        id: 'step_send_reminder',
        name: 'Dispatch Appointment Reminder',
        type: WorkflowStepType.ACTION,
        action: 'gmail_send',
        requiredCapabilities: ['email'],
        approvalRequired: true,
        input: {
          subject: 'Reminder: Upcoming Scheduled Consultation'
        }
      }
    ],
    metadata: {
      author: 'Mesnium Core'
    }
  },
  {
    id: 'template_no_show_recovery',
    name: 'No-Show Recovery',
    description: 'Triggers when a prospect misses a scheduled meeting, initiates empathetic rescheduling outreach via Operations, and alerts Sales.',
    version: '1.0.0',
    category: 'sales',
    requiredCapabilities: ['calendar', 'email'],
    trigger: {
      type: TriggerType.EVENT,
      event: 'appointment.no_show'
    },
    steps: [
      {
        id: 'step_check_noshow',
        name: 'Verify Missed Appointment Status',
        type: WorkflowStepType.CONDITION,
        conditions: [
          { field: 'appointment.status', operator: '==', value: 'no_show' }
        ]
      },
      {
        id: 'step_ops_reschedule',
        name: 'Formulate Empathetic Reschedule Outreach',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_operations',
        input: {
          task: 'Draft courteous rebooking invitation with alternative schedule slots.'
        }
      },
      {
        id: 'step_create_draft',
        name: 'Create Email Draft',
        type: WorkflowStepType.ACTION,
        action: 'gmail_draft',
        requiredCapabilities: ['email'],
        input: {
          subject: 'We missed you — let’s find another time that works'
        }
      },
      {
        id: 'step_sales_alert',
        name: 'Alert Account Representative',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_sales',
        input: {
          task: 'Flag account as rescheduled and review recent communication history.'
        }
      }
    ],
    metadata: {
      author: 'Mesnium Core'
    }
  },
  {
    id: 'template_lead_escalation',
    name: 'Lead Escalation',
    description: 'Evaluates prospective deal metrics, escalates high-value or VIP leads, and prepares executive briefings for senior leadership.',
    version: '1.0.0',
    category: 'executive',
    requiredCapabilities: ['email'],
    trigger: {
      type: TriggerType.EVENT,
      event: 'lead.evaluated'
    },
    steps: [
      {
        id: 'step_check_vip',
        name: 'Evaluate High-Value Deal Criteria',
        type: WorkflowStepType.CONDITION,
        conditions: [
          { field: 'lead.dealValue', operator: '>=', value: 50000 }
        ]
      },
      {
        id: 'step_exec_briefing',
        name: 'Executive Assistant Deal Briefing',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_executive',
        input: {
          task: 'Prepare comprehensive executive synthesis on high-value prospect, key decision makers, and strategic opportunity.'
        }
      },
      {
        id: 'step_exec_alert',
        name: 'Create Executive Alert Draft',
        type: WorkflowStepType.ACTION,
        action: 'gmail_draft',
        requiredCapabilities: ['email'],
        input: {
          subject: 'URGENT: High-Value Enterprise Opportunity Escalation'
        }
      }
    ],
    metadata: {
      author: 'Mesnium Core'
    }
  },
  {
    id: 'template_daily_briefing',
    name: 'Daily Executive Briefing',
    description: 'Orchestrates morning executive intelligence: reviews emails and agenda, and synthesizes executive briefings via Executive Assistant.',
    version: '1.0.0',
    category: 'executive',
    requiredCapabilities: ['calendar', 'email'],
    trigger: {
      type: TriggerType.SCHEDULE,
      scheduleExpr: '0 9 * * 1-5'
    },
    steps: [
      {
        id: 'step_scan_inbox',
        name: 'Scan Priority Communications',
        type: WorkflowStepType.ACTION,
        action: 'gmail_search',
        requiredCapabilities: ['email'],
        input: {
          query: 'is:unread newer_than:1d'
        }
      },
      {
        id: 'step_scan_calendar',
        name: 'Review Daily Schedule',
        type: WorkflowStepType.ACTION,
        action: 'calendar_agenda',
        requiredCapabilities: ['calendar'],
        input: {
          rangeHours: 12
        }
      },
      {
        id: 'step_exec_synthesis',
        name: 'Synthesize Daily Morning Briefing',
        type: WorkflowStepType.AGENT,
        agentId: 'agent_executive',
        input: {
          task: 'Synthesize high-level executive morning briefing across unread communications, scheduled meetings, and operational priorities.'
        }
      }
    ],
    metadata: {
      author: 'Mesnium Core'
    }
  }
]);
