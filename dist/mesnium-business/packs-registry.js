/**
 * MESNIUM BUSINESS PACKS REGISTRY (PHASE 3)
 * 
 * Manages available Business Packs.
 * 
 * Principles:
 * - A pack is structured configuration that tunes the canonical 5-agent workforce.
 * - NOT a new agent. NOT a new runtime. NOT a knowledge dump.
 * - Declares capability requirements (e.g. calendar, crm), but CANNOT grant tools.
 * - Zero executable JavaScript.
 */

import { validateAndSanitizeObject } from './validator.js';

export const BUILTIN_REAL_ESTATE_PACK = {
  id: 'pack_real_estate',
  name: 'Real Estate Business Pack',
  version: '1.0.0',
  category: 'real_estate',
  description: 'Tunes the Mesnium workforce for real estate brokerages, property teams, and residential advisory.',
  capabilityRequirements: ['calendar', 'crm'],
  workflowTemplates: [
    {
      templateId: 'template_lead_followup',
      name: 'Real Estate Lead Follow-Up & Showing Coordination',
      description: 'Receptionist captures buyer criteria (budget, location, timeline), Sales analyzes property fit, and schedules private property tour via Gatekeeper.',
      stepOverrides: {
        step_intake_qualify: {
          input: {
            task: 'Extract prospective buyer criteria: target price range, desired bedrooms/bathrooms, preferred neighborhoods, and target move-in timeline.'
          }
        },
        step_sales_prep: {
          input: {
            task: 'Compile matching property comps, draft tailored viewing itinerary, and formulate financing consultation notes.'
          }
        },
        step_calendar_booking: {
          input: {
            title: 'Private Property Tour & Buyer Consultation',
            durationMinutes: 60
          }
        }
      }
    }
  ],
  metadata: {
    author: 'Mesnium Architecture Team',
    tags: ['real_estate', 'brokerage', 'property', 'sales']
  },
  businessContextDefaults: {
    identity: {
      industry: 'Real Estate',
      description: 'Professional real estate advisory, residential property sales, and buyer representation.'
    },
    offerings: {
      services: [
        {
          name: 'Residential Property Sales',
          description: 'Full-service seller listing representation, marketing, and closing coordination.',
          pricing: 'Standard commission 2.5% - 3.0%'
        },
        {
          name: 'Buyer Advisory & Representation',
          description: 'Home search, property tour scheduling, neighborhood evaluation, and offer drafting.',
          pricing: 'Complimentary buyer consultation'
        },
        {
          name: 'Comparative Market Analysis (CMA)',
          description: 'Data-driven home valuation and neighborhood liquidity report.',
          pricing: 'Complimentary for prospective sellers'
        }
      ],
      categories: ['Residential Sales', 'Buyer Advisory', 'Property Valuation']
    },
    customers: {
      targetCustomerDescription: 'Prospective homebuyers, property sellers, investors, and relocation clients.',
      terminology: ['clients', 'buyers', 'sellers', 'homeowners'],
      qualificationCriteria: [
        'Verified target purchase or listing budget',
        'Specific preferred neighborhood or geographic area',
        'Desired property type (Single-Family, Condo, Multi-Family)',
        'Target purchase/move timeline (Immediate, 1-3 months, 3-6 months)'
      ]
    },
    brand: {
      tone: 'Trustworthy, consultative, approachable, and locally knowledgeable.',
      communicationStyle: 'Clear, reassuring, and responsive to high-value investment decisions.',
      preferences: [
        'Emphasize local market expertise and neighborhood data',
        'Always confirm tour times and property addresses accurately'
      ]
    },
    policies: {
      businessRules: [
        'Always verify buyer pre-approval or proof of funds before scheduling private showings for properties over $1M.',
        'Ensure all required property disclosures are acknowledged in writing before contract drafting.'
      ],
      thingsAgentsMaySay: [
        'We would love to arrange a private viewing for you.',
        'Our market analysis provides recent comparable sales in this immediate neighborhood.'
      ],
      thingsAgentsMustNotSay: [
        'Never guarantee future property appreciation, resale profit, or rental yields.',
        'Never provide binding legal, structural, or tax advice; recommend licensed specialists.'
      ],
      escalationRules: [
        'Escalate earnest money disputes, inspection failures, and closing timeline contingencies immediately to the Managing Broker.',
        'Escalate multi-offer bidding situations to the listing agent immediately.'
      ],
      approvalRequirements: [
        'All client representation agreements, counter-offers, and formal purchase contracts require human broker approval.'
      ]
    },
    operations: {
      operatingProcedures: [
        'Log all new property inquiries with contact details, budget range, and timeline.',
        'Notify listing agents within 15 minutes of new viewing requests.'
      ],
      priorities: [
        'Fast response to high-intent buyer inquiries',
        'Seamless viewing coordination'
      ]
    }
  },
  agentConfigs: {
    agent_receptionist: {
      responsibilities: 'First point of contact for property inquiries, answers office and listing FAQs, captures buyer/seller details, books private property viewings.',
      faqs: [
        {
          question: 'How do I schedule a home viewing?',
          answer: 'We can check our agent availability and schedule a private showing at a convenient time for you.'
        },
        {
          question: 'What documents do I need to begin house hunting?',
          answer: 'A mortgage pre-approval letter or proof of funds allows our team to begin scheduling private showings immediately.'
        }
      ],
      qualificationQuestions: [
        'Are you currently looking to buy, sell, or rent?',
        'What neighborhood or area are you most interested in?',
        'What is your target budget and timeline for moving?'
      ],
      bookingRules: [
        'Verify target property address and client phone number before confirming tour slots.',
        'Allow at least 2 hours notice for occupied residential showings.'
      ],
      escalationRules: [
        'Escalate callers inquiring about pending offers or active escrow to the lead listing agent.'
      ],
      communicationTone: 'Warm, hospitable, and attentive.'
    },
    agent_sales: {
      qualificationCriteria: [
        'Verified budget and financing status (cash or pre-approved lender letter)',
        'Clear property criteria: bedrooms, bathrooms, location, property type',
        'Purchase timeline within 90 days for priority active search'
      ],
      salesProcess: [
        '1. Intake & initial consultation call',
        '2. Financing verification & criteria alignment',
        '3. Curated property selection & private viewings',
        '4. Comparative market analysis & offer strategy',
        '5. Contract negotiation & escrow closing'
      ],
      priorities: [
        'High-value pre-approved buyers ($750k+)',
        'Motivated sellers requiring rapid listing'
      ],
      followUpRules: [
        'Send curated property recommendations within 12 hours of viewing feedback.',
        'Follow up weekly with active buyers regarding new neighborhood listings.'
      ],
      objectionHandlingGuidance: [
        'When buyers hesitate on interest rates: discuss 2-1 buydowns, adjustable options, and long-term equity growth.',
        'When sellers hesitate on pricing: present recent verified closed comps and average days on market.'
      ],
      escalationRules: [
        'Escalate offer negotiations and seller concessions over $10,000 to Principal Broker.'
      ]
    },
    agent_marketing: {
      brandVoice: 'Sophisticated, visual, and highlighting neighborhood lifestyle and architectural appeal.',
      targetAudiences: [
        'Move-up buyers, local families, luxury investors, first-time homebuyers'
      ],
      offers: [
        'Complimentary Home Equity & Market Valuation Report'
      ],
      messagingRules: [
        'Highlight property lifestyle features (natural light, school districts, transit access).',
        'Adhere strictly to Fair Housing guidelines in all promotional and listing descriptions.'
      ],
      campaignPriorities: [
        'Open house announcements',
        'Just Listed property showcases',
        'Quarterly neighborhood market reports'
      ]
    },
    agent_operations: {
      operatingProcedures: [
        'Check MLS status daily for all active brokerage listings.',
        'Maintain organized digital transaction folders for disclosures, inspection reports, and title documents.'
      ],
      recurringProcesses: [
        'Weekly audit of pending showing feedback',
        'Escrow checklist tracking from acceptance to closing'
      ],
      escalationRules: [
        'Flag closing timeline delays or title discrepancies immediately.'
      ],
      businessPriorities: [
        'Transaction timeline compliance and complete disclosure packages'
      ]
    },
    agent_executive: {
      executivePreferences: 'Executive briefings focused on total sales volume, active listings pipeline, pending escrow status, and broker commission forecasts.',
      reportingPriorities: [
        'Closed volume vs monthly target',
        'High-value transactions in escrow ($1M+)',
        'Pending approvals for marketing budgets and listing agreements'
      ],
      importantMetrics: [
        'Average Days on Market (DOM)',
        'List-to-Sale Price Ratio',
        'Active Buyer Pipeline Volume'
      ],
      briefingPriorities: [
        'Daily morning briefing on contracts pending signature and escrow milestone deadlines'
      ],
      escalationRules: [
        'Notify immediately on any threat of litigation or contract cancellation.'
      ]
    }
  }
};

export class MesniumPacksRegistry {
  constructor() {
    this.packs = new Map();
    // Register built-in packs
    this.registerPack(BUILTIN_REAL_ESTATE_PACK);
  }

  registerPack(packDefinition) {
    if (!packDefinition || typeof packDefinition !== 'object') {
      throw new Error('Pack registration error: invalid pack definition.');
    }
    if (!packDefinition.id || typeof packDefinition.id !== 'string') {
      throw new Error('Pack registration error: pack.id is required.');
    }
    if (!packDefinition.name || typeof packDefinition.name !== 'string') {
      throw new Error('Pack registration error: pack.name is required.');
    }

    // Sanitize against executable injection and prototype pollution
    const sanitized = validateAndSanitizeObject(packDefinition);
    this.packs.set(sanitized.id, sanitized);
  }

  getPack(packId) {
    if (!packId || typeof packId !== 'string') return null;
    const pack = this.packs.get(packId);
    if (!pack) return null;
    return JSON.parse(JSON.stringify(pack));
  }

  listPacks() {
    return Array.from(this.packs.values()).map(p => ({
      id: p.id,
      name: p.name,
      version: p.version || '1.0.0',
      category: p.category || 'general',
      description: p.description || '',
      capabilityRequirements: Array.isArray(p.capabilityRequirements) ? [...p.capabilityRequirements] : [],
      workflowTemplates: Array.isArray(p.workflowTemplates) ? [...p.workflowTemplates] : [],
      metadata: p.metadata ? { ...p.metadata } : {}
    }));
  }
}

let sharedRegistry = null;
export function getSharedPacksRegistry() {
  if (!sharedRegistry) {
    sharedRegistry = new MesniumPacksRegistry();
  }
  return sharedRegistry;
}
