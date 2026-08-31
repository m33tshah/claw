/**
 * MESNIUM DAILY RHYTHM & EXECUTIVE BRIEFING ENGINE (V1 PRODUCTIZATION)
 * 
 * Aggregates real data across connected business systems (Google Workspace, Calendar,
 * Automations, Projects, Research Monitors, Gatekeeper Approvals) to generate a
 * structured, honest daily executive briefing.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getSharedIntegrationRegistry } from '../integrations/registry.js';
import { getSharedAutomationRegistry } from '../mesnium-automations/registry.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { getSharedProjectManager } from '../mesnium-projects/store.js';
import { getSharedMonitorManager } from '../mesnium-monitors/index.js';
import { GmailSearchTool, CalendarAgendaTool } from '../integrations/google/agent-tools.js';

const BRIEFING_CONFIG_PATH = path.join(os.homedir(), '.openclaw', 'mesnium_briefing.json');

export class MesniumBriefingManager {
  constructor(configPath = BRIEFING_CONFIG_PATH) {
    this.configPath = configPath;
    this._ensureConfig();
  }

  _ensureConfig() {
    try {
      const dir = path.dirname(this.configPath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(this.configPath)) {
        const defaultConfig = {
          enabled: true,
          scheduledTime: '08:30',
          timezone: 'Local',
          categories: ['email', 'calendar', 'automations', 'projects', 'research', 'approvals'],
          lastGenerated: null
        };
        fs.writeFileSync(this.configPath, JSON.stringify(defaultConfig, null, 2), 'utf8');
      }
    } catch (_) {}
  }

  getConfig() {
    try {
      if (fs.existsSync(this.configPath)) {
        return JSON.parse(fs.readFileSync(this.configPath, 'utf8'));
      }
    } catch (_) {}
    return { enabled: true, scheduledTime: '08:30', timezone: 'Local', categories: [] };
  }

  updateConfig(patch) {
    const cur = this.getConfig();
    const updated = { ...cur, ...patch };
    try {
      fs.writeFileSync(this.configPath, JSON.stringify(updated, null, 2), 'utf8');
    } catch (_) {}
    return updated;
  }

  async generateBriefing() {
    const config = this.getConfig();
    const dateStr = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    
    const sections = [];

    // 1. Google Workspace: Calendar & Agenda
    const intReg = getSharedIntegrationRegistry();
    const googleAccount = intReg.listAccounts().find(a => a.provider === 'google' && (a.status === 'connected' || a.status === 'CONNECTED'));

    if (googleAccount && config.categories.includes('calendar')) {
      try {
        const calRes = await CalendarAgendaTool.execute('briefing_cal', { maxResults: 5 });
        if (calRes && calRes.content && calRes.content[0]?.text) {
          sections.push({
            category: 'Calendar & Schedule',
            icon: '📅',
            content: calRes.content[0].text
          });
        }
      } catch (_) {}
    }

    // 2. Google Workspace: Gmail & Urgent Messages
    if (googleAccount && config.categories.includes('email')) {
      try {
        const mailRes = await GmailSearchTool.execute('briefing_mail', { query: 'is:unread newer_than:7d', maxResults: 5 });
        if (mailRes && mailRes.content && mailRes.content[0]?.text) {
          sections.push({
            category: 'Inbox & Unread Messages',
            icon: '✉️',
            content: mailRes.content[0].text
          });
        }
      } catch (_) {}
    }

    // 3. Action Gatekeeper: Pending Approvals
    if (config.categories.includes('approvals')) {
      const gatekeeper = getSharedActionGatekeeper();
      const pending = gatekeeper.listPendingApprovals('default');
      if (pending && pending.length > 0) {
        const lines = pending.map(p => `- **${p.actionType.toUpperCase()}**: ${p.description || 'Pending approval'}`);
        sections.push({
          category: 'Action Approvals Requiring Attention',
          icon: '🛡️',
          content: `${pending.length} action(s) awaiting your decision:\n${lines.join('\n')}`
        });
      }
    }

    // 4. Automations & Workflows
    if (config.categories.includes('automations')) {
      const autoReg = getSharedAutomationRegistry();
      const automations = autoReg.listAutomations('default');
      const activeCount = automations.filter(a => a.status === 'active').length;
      sections.push({
        category: 'Automated Operations',
        icon: '⚡',
        content: `${activeCount} automated workflow(s) active and operational across scheduled triggers.`
      });
    }

    // 5. Active Projects Workspace
    if (config.categories.includes('projects')) {
      const pm = getSharedProjectManager();
      const projects = pm.listProjects();
      if (projects.length > 0) {
        const topProjects = projects.slice(0, 3).map(p => `- **${p.name}**: ${(p.files || []).length} documents, ${(p.conversationIds || []).length} chat thread(s)`).join('\n');
        sections.push({
          category: 'Active Project Workspaces',
          icon: '📁',
          content: `${projects.length} project workspace(s) configured:\n${topProjects}`
        });
      }
    }

    // 6. Proactive Research & Monitors
    if (config.categories.includes('research')) {
      const mm = getSharedMonitorManager();
      const monitors = mm.listMonitors();
      if (monitors.length > 0) {
        const findingsTotal = monitors.reduce((sum, m) => sum + (m.findingsCount || 0), 0);
        sections.push({
          category: 'Proactive Research Monitors',
          icon: '🔭',
          content: `Tracking ${monitors.length} monitor(s) with ${findingsTotal} total intelligence update(s) recorded.`
        });
      }
    }

    const briefingText = `# Daily Executive Briefing — ${dateStr}\n\n` +
      sections.map(s => `### ${s.icon} ${s.category}\n${s.content}`).join('\n\n---\n\n');

    this.updateConfig({ lastGenerated: Date.now() });

    return {
      date: dateStr,
      generatedAt: Date.now(),
      sections,
      briefingText
    };
  }
}

let sharedBriefing = null;
export function getSharedBriefingManager() {
  if (!sharedBriefing) {
    sharedBriefing = new MesniumBriefingManager();
  }
  return sharedBriefing;
}
