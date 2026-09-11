/**
 * MESNIUM SELECTIVE AGENT CONTEXT PROJECTOR (PHASE 3)
 * 
 * Transforms the merged effective business configuration into a compact,
 * role-specific Markdown prompt section for the active specialist agent.
 * 
 * Principles:
 * - NO raw JSON dumps.
 * - Role-tailored: Only injects fields pertinent to the active agent role.
 * - Bounded size: Typically < 1.5 KB per agent.
 * - Zero secrets, zero internal filepaths, zero credential exposure.
 * - Distinct context layer in the agent runtime prompt pipeline.
 */

import { assertValidWorkspaceId } from './validator.js';

export function projectAgentBusinessContext(effectiveConfig, agentId, workspaceId) {
  assertValidWorkspaceId(workspaceId, 'projectAgentBusinessContext');

  if (!effectiveConfig || typeof effectiveConfig !== 'object') {
    return '';
  }

  const {
    identity = {},
    offerings = {},
    customers = {},
    brand = {},
    policies = {},
    operations = {},
    contacts = {},
    agentConfig = {}
  } = effectiveConfig;

  const agentRoleConf = agentConfig[agentId] || {};
  const sections = [];

  // 1. Universal Business Identity Header (Concise)
  const idHeader = [
    `[Mesnium Business Context: ${identity.businessName || 'Business'}]`,
    `Industry: ${identity.industry || 'General'}${identity.location ? ` | Location: ${identity.location}` : ''}${identity.timezone ? ` | Timezone: ${identity.timezone}` : ''}`,
    identity.operatingHours ? `Operating Hours: ${identity.operatingHours}` : null,
    identity.description ? `About: ${identity.description.length > 120 ? `${identity.description.slice(0, 117)}...` : identity.description}` : null
  ].filter(Boolean).join('\n');
  sections.push(idHeader);

  // 2. Role-Specific Selective Projections
  switch (agentId) {
    case 'agent_receptionist': {
      // Services & Offerings (first 2 items max)
      if (Array.isArray(offerings.services) && offerings.services.length > 0) {
        const lines = offerings.services.slice(0, 2).map(s => {
          const desc = s.description ? (s.description.length > 60 ? `${s.description.slice(0, 57)}...` : s.description) : '';
          return `- ${s.name}${desc ? `: ${desc}` : ''}${s.pricing ? ` (${s.pricing})` : ''}`;
        });
        sections.push(`[Approved Services]\n${lines.join('\n')}`);
      }

      // Customer Policies & Speech Guidelines
      const speechRules = [];
      if (Array.isArray(policies.thingsAgentsMaySay) && policies.thingsAgentsMaySay.length > 0) {
        speechRules.push(`- Guidance: ${policies.thingsAgentsMaySay[0]}`);
      }
      if (Array.isArray(policies.thingsAgentsMustNotSay) && policies.thingsAgentsMustNotSay.length > 0) {
        speechRules.push(`- Must NOT say: ${policies.thingsAgentsMustNotSay.slice(0, 2).join('; ')}`);
      }
      if (Array.isArray(policies.escalationRules) && policies.escalationRules.length > 0) {
        speechRules.push(`- Escalation: ${policies.escalationRules[0]}`);
      }
      if (speechRules.length > 0) {
        sections.push(`[Business Policies & Boundaries]\n${speechRules.join('\n')}`);
      }

      // Receptionist Specific Config
      const roleLines = [];
      if (agentRoleConf.communicationTone || brand.tone) {
        roleLines.push(`Tone: ${agentRoleConf.communicationTone || brand.tone}`);
      }
      if (Array.isArray(agentRoleConf.qualificationQuestions) && agentRoleConf.qualificationQuestions.length > 0) {
        roleLines.push(`Qualification Questions:\n${agentRoleConf.qualificationQuestions.slice(0, 2).map(q => `  • ${q}`).join('\n')}`);
      }
      if (Array.isArray(agentRoleConf.bookingRules) && agentRoleConf.bookingRules.length > 0) {
        roleLines.push(`Booking Rules:\n${agentRoleConf.bookingRules.slice(0, 2).map(r => `  • ${r}`).join('\n')}`);
      }
      if (Array.isArray(agentRoleConf.faqs) && agentRoleConf.faqs.length > 0) {
        const faqLines = agentRoleConf.faqs.slice(0, 2).map(f => {
          const ans = f.answer.length > 70 ? `${f.answer.slice(0, 67)}...` : f.answer;
          return `  • Q: ${f.question} -> A: ${ans}`;
        });
        roleLines.push(`Key FAQs:\n${faqLines.join('\n')}`);
      }
      if (roleLines.length > 0) {
        sections.push(`[Receptionist Guidance]\n${roleLines.join('\n')}`);
      }
      break;
    }

    case 'agent_sales': {
      // Offerings & Value Proposition (compacted to stay < 1.5 KB)
      if (Array.isArray(offerings.services) && offerings.services.length > 0) {
        const lines = offerings.services.slice(0, 2).map(s => {
          const desc = s.description ? (s.description.length > 50 ? `${s.description.slice(0, 47)}...` : s.description) : '';
          return `- ${s.name}${desc ? `: ${desc}` : ''}${s.pricing ? ` [${s.pricing}]` : ''}`;
        });
        sections.push(`[Core Offerings & Pricing]\n${lines.join('\n')}`);
      }

      // Target Customers & Qualification
      const custLines = [];
      if (customers.targetCustomerDescription) {
        const desc = customers.targetCustomerDescription.length > 80 ? `${customers.targetCustomerDescription.slice(0, 77)}...` : customers.targetCustomerDescription;
        custLines.push(`Target Profile: ${desc}`);
      }
      const qualCriteria = agentRoleConf.qualificationCriteria || customers.qualificationCriteria;
      if (Array.isArray(qualCriteria) && qualCriteria.length > 0) {
        custLines.push(`Qualification Criteria:\n${qualCriteria.slice(0, 3).map(c => `  • ${c.length > 70 ? `${c.slice(0, 67)}...` : c}`).join('\n')}`);
      }
      if (custLines.length > 0) {
        sections.push(`[Customer & Lead Qualification]\n${custLines.join('\n')}`);
      }

      // Sales Process & Objection Handling
      const salesLines = [];
      if (Array.isArray(agentRoleConf.salesProcess) && agentRoleConf.salesProcess.length > 0) {
        salesLines.push(`Sales Process: ${agentRoleConf.salesProcess.slice(0, 4).join(' -> ')}`);
      }
      if (Array.isArray(agentRoleConf.priorities) && agentRoleConf.priorities.length > 0) {
        salesLines.push(`Priorities: ${agentRoleConf.priorities.slice(0, 2).join(', ')}`);
      }
      if (Array.isArray(agentRoleConf.objectionHandlingGuidance) && agentRoleConf.objectionHandlingGuidance.length > 0) {
        salesLines.push(`Objection Guidance:\n${agentRoleConf.objectionHandlingGuidance.slice(0, 2).map(o => `  • ${o.length > 80 ? `${o.slice(0, 77)}...` : o}`).join('\n')}`);
      }
      if (Array.isArray(policies.thingsAgentsMustNotSay) && policies.thingsAgentsMustNotSay.length > 0) {
        salesLines.push(`Strict Prohibitions: ${policies.thingsAgentsMustNotSay.slice(0, 1).join('; ')}`);
      }
      if (salesLines.length > 0) {
        sections.push(`[Sales Execution & Standards]\n${salesLines.join('\n')}`);
      }
      break;
    }

    case 'agent_marketing': {
      // Brand Voice & Style
      const brandLines = [];
      if (brand.tone || agentRoleConf.brandVoice) {
        brandLines.push(`Brand Voice: ${agentRoleConf.brandVoice || brand.tone}`);
      }
      if (brand.communicationStyle) {
        brandLines.push(`Style: ${brand.communicationStyle}`);
      }
      if (Array.isArray(agentRoleConf.targetAudiences) && agentRoleConf.targetAudiences.length > 0) {
        brandLines.push(`Target Audiences: ${agentRoleConf.targetAudiences.slice(0, 3).join(', ')}`);
      }
      if (brandLines.length > 0) {
        sections.push(`[Brand & Audience Identity]\n${brandLines.join('\n')}`);
      }

      // Campaigns & Offers
      const mktLines = [];
      if (Array.isArray(agentRoleConf.campaignPriorities) && agentRoleConf.campaignPriorities.length > 0) {
        mktLines.push(`Campaign Priorities: ${agentRoleConf.campaignPriorities.slice(0, 3).join(', ')}`);
      }
      if (Array.isArray(agentRoleConf.offers) && agentRoleConf.offers.length > 0) {
        mktLines.push(`Active Offers: ${agentRoleConf.offers.slice(0, 3).join(', ')}`);
      }
      if (Array.isArray(agentRoleConf.messagingRules) && agentRoleConf.messagingRules.length > 0) {
        mktLines.push(`Messaging Rules:\n${agentRoleConf.messagingRules.slice(0, 3).map(r => `  • ${r}`).join('\n')}`);
      }
      if (mktLines.length > 0) {
        sections.push(`[Marketing Directives]\n${mktLines.join('\n')}`);
      }
      break;
    }

    case 'agent_operations': {
      // Procedures & Recurring Processes
      const opLines = [];
      const procedures = agentRoleConf.operatingProcedures || operations.operatingProcedures;
      if (Array.isArray(procedures) && procedures.length > 0) {
        opLines.push(`Operating Procedures:\n${procedures.slice(0, 4).map(p => `  • ${p}`).join('\n')}`);
      }
      if (Array.isArray(agentRoleConf.recurringProcesses) && agentRoleConf.recurringProcesses.length > 0) {
        opLines.push(`Recurring Tasks:\n${agentRoleConf.recurringProcesses.slice(0, 3).map(r => `  • ${r}`).join('\n')}`);
      }
      if (Array.isArray(agentRoleConf.businessPriorities || operations.priorities) && (agentRoleConf.businessPriorities || operations.priorities).length > 0) {
        opLines.push(`Priorities: ${(agentRoleConf.businessPriorities || operations.priorities).slice(0, 3).join(', ')}`);
      }
      if (opLines.length > 0) {
        sections.push(`[Operational Procedures & Workflows]\n${opLines.join('\n')}`);
      }

      // Escalations & Approvals
      const escLines = [];
      if (Array.isArray(policies.approvalRequirements) && policies.approvalRequirements.length > 0) {
        escLines.push(`Approval Rules: ${policies.approvalRequirements.slice(0, 2).join('; ')}`);
      }
      if (Array.isArray(policies.escalationRules) && policies.escalationRules.length > 0) {
        escLines.push(`Escalation Rules: ${policies.escalationRules.slice(0, 2).join('; ')}`);
      }
      if (escLines.length > 0) {
        sections.push(`[Operational Safety & Escalations]\n${escLines.join('\n')}`);
      }
      break;
    }

    case 'agent_executive': {
      // Executive Priorities & Metrics
      const execLines = [];
      if (agentRoleConf.executivePreferences) {
        execLines.push(`Executive Briefing Style: ${agentRoleConf.executivePreferences}`);
      }
      if (Array.isArray(agentRoleConf.reportingPriorities) && agentRoleConf.reportingPriorities.length > 0) {
        execLines.push(`Reporting Priorities:\n${agentRoleConf.reportingPriorities.slice(0, 3).map(p => `  • ${p}`).join('\n')}`);
      }
      if (Array.isArray(agentRoleConf.importantMetrics) && agentRoleConf.importantMetrics.length > 0) {
        execLines.push(`Critical Metrics: ${agentRoleConf.importantMetrics.slice(0, 4).join(', ')}`);
      }
      if (Array.isArray(agentRoleConf.briefingPriorities) && agentRoleConf.briefingPriorities.length > 0) {
        execLines.push(`Briefing Focus: ${agentRoleConf.briefingPriorities.slice(0, 2).join('; ')}`);
      }
      if (execLines.length > 0) {
        sections.push(`[Executive Intelligence & Priorities]\n${execLines.join('\n')}`);
      }

      // Key Governance & Approvals
      if (Array.isArray(policies.approvalRequirements) && policies.approvalRequirements.length > 0) {
        sections.push(`[Governance & Approvals]\n- ${policies.approvalRequirements.slice(0, 2).join('\n- ')}`);
      }
      break;
    }

    default: {
      // Fallback for custom or general agents
      if (brand.tone) sections.push(`Tone: ${brand.tone}`);
      if (Array.isArray(policies.businessRules) && policies.businessRules.length > 0) {
        sections.push(`Rules: ${policies.businessRules.slice(0, 3).join('; ')}`);
      }
      break;
    }
  }

  return sections.join('\n\n');
}
