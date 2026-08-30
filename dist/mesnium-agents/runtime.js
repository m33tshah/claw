/**
 * MESNIUM AGENT RUNTIME & EXECUTION ENGINE (PHASE 11)
 * 
 * Coordinates agent execution, knowledge scoping, tool/capability filtering,
 * permission enforcement, and activity logging.
 */

import { AgentStatus, AgentCapability } from './types.js';
import { getSharedAgentRegistry } from './registry.js';
import { getSharedActivityLedger } from './activity.js';
import { getSharedKnowledgeManager } from '../knowledge/agent-tool.js';
import { GoogleDriveSearchTool, GmailSearchTool, CalendarAgendaTool } from '../integrations/google/agent-tools.js';

export class MesniumAgentRuntime {
  constructor() {
    this.registry = getSharedAgentRegistry();
    this.activity = getSharedActivityLedger();
  }

  /**
   * Run a prompt through a specific Mesnium Agent with scoped knowledge and capabilities.
   */
  async runAgent(agentId, prompt, options = {}) {
    const startTime = Date.now();
    const agent = this.registry.getAgent(agentId);

    if (!agent) {
      throw new Error(`Agent with ID "${agentId}" does not exist.`);
    }

    // 1. Status Guard
    if (agent.status === AgentStatus.PAUSED) {
      throw new Error(`Cannot run agent "${agent.name}": Agent is currently paused. Please resume the agent to execute tasks.`);
    }
    if (agent.status === AgentStatus.DRAFT) {
      throw new Error(`Cannot run agent "${agent.name}": Agent is in draft mode. Please activate the agent first.`);
    }

    // 2. Activity Ledger Initialization
    const activityRecord = this.activity.recordRun({
      agentId: agent.id,
      agentName: agent.name,
      prompt,
      status: 'running',
      startedAt: startTime
    });

    const sourcesConsulted = [];
    const toolsUsed = [];
    let answerText = '';

    try {
      // 3. Knowledge Scoping & Retrieval
      let knowledgeContext = '';
      if (agent.capabilities.includes(AgentCapability.KNOWLEDGE_SEARCH)) {
        toolsUsed.push(AgentCapability.KNOWLEDGE_SEARCH);
        const km = getSharedKnowledgeManager();
        
        if (km) {
          const hits = await km.search(prompt, {
            workspaceId: agent.workspaceId || 'default',
            limit: 4,
            minScore: 0.25
          });

          if (hits && hits.length > 0) {
            hits.forEach(h => {
              if (h.filename) sourcesConsulted.push(h.filename);
            });

            knowledgeContext = hits.map((h, i) => (
              `[Source ${i + 1}: ${h.filename} | ${h.provenance?.location || 'General'}]\n${h.content}`
            )).join('\n\n');
          }
        }
      }

      // 4. Integrations Scoping (Drive, Gmail, Calendar)
      let googleContext = '';
      if (agent.capabilities.includes(AgentCapability.GOOGLE_DRIVE_READ) && (prompt.toLowerCase().includes('drive') || prompt.toLowerCase().includes('file'))) {
        toolsUsed.push(AgentCapability.GOOGLE_DRIVE_READ);
        const driveRes = await GoogleDriveSearchTool.execute('call_drv', { query: prompt });
        if (driveRes && driveRes.content) {
          googleContext += `\n\n### Google Drive Files:\n${driveRes.content[0].text}`;
        }
      }

      if (agent.capabilities.includes(AgentCapability.GMAIL_READ) && (prompt.toLowerCase().includes('email') || prompt.toLowerCase().includes('mail') || prompt.toLowerCase().includes('inbox'))) {
        toolsUsed.push(AgentCapability.GMAIL_READ);
        const gmailRes = await GmailSearchTool.execute('call_gml', { query: 'newer_than:30d', maxResults: 3 });
        if (gmailRes && gmailRes.content) {
          googleContext += `\n\n### Recent Emails:\n${gmailRes.content[0].text}`;
        }
      }

      if (agent.capabilities.includes(AgentCapability.CALENDAR_READ) && (prompt.toLowerCase().includes('calendar') || prompt.toLowerCase().includes('meeting') || prompt.toLowerCase().includes('schedule') || prompt.toLowerCase().includes('agenda'))) {
        toolsUsed.push(AgentCapability.CALENDAR_READ);
        const calRes = await CalendarAgendaTool.execute('call_cal', { maxResults: 3 });
        if (calRes && calRes.content) {
          googleContext += `\n\n### Calendar Agenda:\n${calRes.content[0].text}`;
        }
      }

      // 5. Synthesis / Output Generation
      if (knowledgeContext || googleContext) {
        const sections = [];
        if (knowledgeContext) {
          sections.push(`Based on your authorized knowledge sources:\n\n${knowledgeContext}`);
        }
        if (googleContext) {
          sections.push(googleContext);
        }
        answerText = sections.join('\n\n---\n\n');
      } else {
        answerText = `I searched the authorized knowledge and capability sources for "${prompt}", but found no relevant records matching your request.`;
      }

      // 6. Complete Activity Ledger Record
      const endTime = Date.now();
      this.activity.updateRun(activityRecord.id, {
        status: 'completed',
        result: answerText,
        sourcesConsulted,
        toolsUsed,
        completedAt: endTime,
        durationMs: endTime - startTime
      });

      return {
        runId: activityRecord.id,
        agentId: agent.id,
        agentName: agent.name,
        answer: answerText,
        sourcesConsulted,
        toolsUsed,
        status: 'completed',
        durationMs: Date.now() - startTime
      };

    } catch (err) {
      const endTime = Date.now();
      this.activity.updateRun(activityRecord.id, {
        status: 'failed',
        error: err.message,
        completedAt: endTime,
        durationMs: endTime - startTime
      });
      throw err;
    }
  }
}

let sharedRuntime = null;

export function getSharedAgentRuntime() {
  if (!sharedRuntime) {
    sharedRuntime = new MesniumAgentRuntime();
  }
  return sharedRuntime;
}
