/**
 * MESNIUM BUSINESS CONTEXT & BUSINESS PACK TYPES (PHASE 3)
 * 
 * Defines the structured data model for:
 * - Business Identity, Offerings, Customers, Brand, Policies, Operations, Contacts
 * - Agent-Specific Business Configurations
 * - Business Packs (Structured configuration templates for canonical agents)
 * - Configuration Provenance (core | pack | customer | agent_override)
 * 
 * Security Principle:
 * - Configuration only. Never executable code, never raw prompt dumps.
 * - Clear boundary: Business Context defines operations, Knowledge stores documents, Memory stores activity learnings.
 */

export const ConfigSource = {
  CORE: 'core',
  PACK: 'pack',
  CUSTOMER: 'customer',
  AGENT_OVERRIDE: 'agent_override'
};

export const MAX_LIMITS = {
  MAX_STRING_LENGTH: 1000,
  MAX_NAME_LENGTH: 100,
  MAX_DESCRIPTION_LENGTH: 500,
  MAX_ARRAY_ITEMS: 50,
  MAX_OBJECT_DEPTH: 6,
  MAX_CONTEXT_BYTES: 100 * 1024 // 100 KB total context payload cap
};

/**
 * Empty customer context representing a fresh workspace with no overrides.
 */
export function createEmptyCustomerContext(workspaceId = 'default') {
  return {
    workspaceId,
    version: '1.0.0',
    updatedAt: Date.now(),
    identity: {},
    offerings: {},
    customers: {},
    brand: {},
    policies: {},
    operations: {},
    contacts: {},
    agentConfig: {}
  };
}

/**
 * Canonical default business context (Core baseline)
 */
export function createDefaultBusinessContext(workspaceId = 'default') {
  return {
    workspaceId,
    version: '1.0.0',
    updatedAt: Date.now(),
    identity: {
      businessName: 'Mesnium Business',
      industry: 'General Enterprise',
      description: 'AI-powered modern business operating on the Mesnium OS platform.',
      location: 'Global',
      operatingHours: 'Monday - Friday 09:00 - 17:00',
      timezone: 'UTC'
    },
    offerings: {
      services: [],
      products: [],
      categories: ['Services'],
      pricingNotes: 'Standard competitive enterprise pricing.'
    },
    customers: {
      targetCustomerDescription: 'Modern businesses, clients, and partners.',
      terminology: ['clients', 'customers'],
      qualificationCriteria: ['Budget fit', 'Clear need', 'Decision authority']
    },
    brand: {
      tone: 'Professional, consultative, confident, and direct.',
      communicationStyle: 'Clear, concise, executive-ready communication.',
      terminology: {},
      preferences: ['Be polite and helpful', 'Lead with the takeaway']
    },
    policies: {
      businessRules: [
        'Always verify customer details before confirming transactions or appointments.',
        'Never disclose internal operational workflows or private API details.'
      ],
      thingsAgentsMaySay: [
        'Our team will be delighted to assist you with our services.',
        'We look forward to partnering with your team.'
      ],
      thingsAgentsMustNotSay: [
        'Never make binding legal promises without human executive approval.',
        'Never guarantee speculative outcomes or specific financial returns.'
      ],
      escalationRules: [
        'Escalate billing disputes and contractual negotiations to human management immediately.',
        'Escalate distressed or angry customer communications to staff.'
      ],
      approvalRequirements: [
        'All external emails and bookings require operator confirmation.'
      ]
    },
    operations: {
      operatingProcedures: [
        'Log all new customer enquiries in the activity ledger.',
        'Prioritize high-urgency client requests during business hours.'
      ],
      processes: [],
      priorities: ['Customer satisfaction', 'Operational responsiveness']
    },
    contacts: {
      owners: [],
      staff: [],
      escalationContacts: [],
      departments: ['Support', 'Sales', 'Operations', 'Executive']
    },
    agentConfig: {
      agent_receptionist: {
        responsibilities: 'First friendly point of contact, answers FAQs, books consultations, qualifies inbound inquiries.',
        faqs: [],
        qualificationQuestions: [
          'How can we help your business today?',
          'What is your ideal timeline?'
        ],
        bookingRules: [
          'Only propose bookings during stated operating hours.',
          'Always gather attendee email, name, and discussion topic.'
        ],
        escalationRules: [
          'If a visitor is frustrated or has a sensitive dispute, hand off to human team.'
        ],
        communicationTone: 'Warm, clear, and welcoming.'
      },
      agent_sales: {
        qualificationCriteria: [
          'Identified business need',
          'Timeline under 6 months',
          'Appropriate investment budget'
        ],
        salesProcess: [
          '1. Inbound inquiry qualification',
          '2. Discovery call & needs assessment',
          '3. Proposal review',
          '4. Closing & agreement'
        ],
        priorities: [
          'High-value prospects',
          'Urgent timeline inquiries'
        ],
        followUpRules: [
          'Draft follow-ups within 24 hours of prospect meeting.',
          'Keep sales follow-ups concise and value-oriented.'
        ],
        objectionHandlingGuidance: [
          'Address pricing questions by emphasizing return on investment and business outcomes.'
        ],
        escalationRules: [
          'Escalate enterprise contract discounts above 15% to Executive.'
        ]
      },
      agent_marketing: {
        brandVoice: 'Authoritative, innovative, and focused on tangible business growth.',
        targetAudiences: [
          'Decision makers, founders, operations executives'
        ],
        offers: [],
        messagingRules: [
          'Focus on efficiency, quality, and measurable outcomes.',
          'Avoid hype or ungrounded claims.'
        ],
        campaignPriorities: [
          'Brand awareness and inbound lead generation'
        ]
      },
      agent_operations: {
        operatingProcedures: [
          'Review pending approval queue daily.',
          'Keep customer files and records organized.'
        ],
        recurringProcesses: [
          'Daily system health and activity audit'
        ],
        escalationRules: [
          'Escalate system anomalies or integration disconnects.'
        ],
        businessPriorities: [
          'Process reliability and data consistency'
        ]
      },
      agent_executive: {
        executivePreferences: 'Prefers high-level synthesized bullet briefings with clear action items.',
        reportingPriorities: [
          'Sales pipeline movement',
          'Pending Gatekeeper approvals',
          'Key operational blockers'
        ],
        importantMetrics: [
          'Lead conversion velocity',
          'Response time',
          'Pending approval count'
        ],
        briefingPriorities: [
          'Daily morning briefings covering critical decisions and calendar overview'
        ],
        escalationRules: [
          'Notify immediately on high-priority client churn risk.'
        ]
      }
    }
  };
}
