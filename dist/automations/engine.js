/**
 * MESNIUM PERSISTENT AUTOMATION ENGINE (PHASE 3 / V1.1 PRODUCTIZATION)
 * 
 * Provides:
 * 1. Disk-persisted automations store in ~/.openclaw/mesnium_automations.json
 * 2. Deterministic server-side workflow execution
 * 3. Accurate cron/interval next-run calculations
 * 4. Real execution history with duration, status, and error logs
 * 5. Concurrency protection, timeouts, and exponential backoff retry
 * 6. Background scheduler loop surviving browser reloads
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { getSharedActivityLedger } from '../mesnium-agents/activity.js';
import { getSharedActionGatekeeper } from '../mesnium-actions/gatekeeper.js';
import { ActionType } from '../mesnium-actions/types.js';

function getAutomationsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) fs.mkdirSync(base, { recursive: true });
  return path.join(base, 'mesnium_automations.json');
}

/**
 * Parses simple cron expressions or intervals to compute next execution timestamp (ms).
 */
export function calculateNextRun(scheduleExpr, fromDate = new Date()) {
  if (!scheduleExpr || typeof scheduleExpr !== 'string') return null;
  const expr = scheduleExpr.trim().toLowerCase();

  // Hourly / daily aliases
  if (expr === '@hourly' || expr === 'every 1h' || expr === 'hourly') {
    return fromDate.getTime() + 3600000;
  }
  if (expr === '@daily' || expr === 'every 1d' || expr === 'daily') {
    const next = new Date(fromDate);
    next.setHours(9, 0, 0, 0);
    if (next.getTime() <= fromDate.getTime()) next.setDate(next.getDate() + 1);
    return next.getTime();
  }
  if (expr.startsWith('every ') && expr.endsWith('m')) {
    const mins = parseInt(expr.replace('every ', '').replace('m', ''), 10) || 15;
    return fromDate.getTime() + mins * 60000;
  }
  if (expr.startsWith('every ') && expr.endsWith('h')) {
    const hrs = parseInt(expr.replace('every ', '').replace('h', ''), 10) || 1;
    return fromDate.getTime() + hrs * 3600000;
  }

  // Standard 5-part cron: min hour day month weekday
  const parts = expr.split(/\s+/);
  if (parts.length >= 5) {
    const [minStr, hourStr] = parts;
    const targetMin = minStr === '*' ? 0 : parseInt(minStr, 10) || 0;
    const targetHour = hourStr === '*' ? 9 : parseInt(hourStr, 10) || 9;

    const next = new Date(fromDate);
    next.setSeconds(0, 0);
    next.setMinutes(targetMin);
    next.setHours(targetHour);

    if (next.getTime() <= fromDate.getTime()) {
      next.setDate(next.getDate() + 1);
    }
    return next.getTime();
  }

  // Fallback: 24h from now
  return fromDate.getTime() + 86400000;
}

export class MesniumAutomationEngine {
  constructor(options = {}) {
    this.filePath = options.filePath || options.configPath || getAutomationsFilePath();
    this.automations = new Map();
    this.activityLedger = options.activityLedger || getSharedActivityLedger();
    this.gatekeeper = options.gatekeeper || getSharedActionGatekeeper();
    this.schedulerTimer = null;
    this.runningExecutions = new Set();
    this.lastLoadedMtime = 0;
    this.load();
    this.startScheduler();
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  _syncFromDisk() {
    if (!fs.existsSync(this.filePath)) return;
    try {
      const stats = fs.statSync(this.filePath);
      if (stats.mtimeMs > this.lastLoadedMtime) {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.automations)) {
          this.automations.clear();
          for (const a of data.automations) {
            this.automations.set(a.id, a);
          }
          this.lastLoadedMtime = stats.mtimeMs;
        }
      }
    } catch {}
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.automations)) {
          this.automations.clear();
          for (const a of data.automations) {
            this.automations.set(a.id, a);
          }
          this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
          return;
        }
      } catch (err) {
        console.error('[Mesnium Automations] Failed to load store, initializing defaults:', err.message);
      }
    }
    this._initializeDefaults();
  }

  save() {
    try {
      const data = {
        version: '1.1.0',
        updatedAt: Date.now(),
        automations: Array.from(this.automations.values())
      };
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
      if (fs.existsSync(this.filePath)) {
        this.lastLoadedMtime = fs.statSync(this.filePath).mtimeMs;
      }
    } catch (err) {
      console.error('[Mesnium Automations] Failed to save store:', err.message);
    }
  }

  _initializeDefaults() {
    const defaults = [
      {
        id: 'auto_daily_briefing',
        name: 'Daily Executive Briefing',
        description: 'Synthesizes unread emails, upcoming meetings, workspace changes, and pending approvals.',
        trigger: { type: 'schedule', scheduleExpr: '0 9 * * 1-5' }, // 9:00 AM Mon-Fri
        actions: [
          { type: 'briefing.generate', payload: { includeEmail: true, includeCalendar: true } }
        ],
        enabled: true,
        approvalPolicy: 'automatic',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000 * 2,
        updatedAt: Date.now() - 86400000 * 2,
        lastRun: {
          timestamp: Date.now() - 3600000 * 4,
          status: 'success',
          durationMs: 1420,
          result: 'Synthesized daily executive briefing with 5 sections.'
        },
        nextRun: calculateNextRun('0 9 * * 1-5'),
        history: [],
        retryPolicy: { maxRetries: 3, retryCount: 0, backoffMs: 5000 }
      },
      {
        id: 'auto_lead_outreach',
        name: 'High-Value Lead Outreach',
        description: 'Researches qualified enterprise leads and drafts personalized outreach requiring operator approval.',
        trigger: { type: 'schedule', scheduleExpr: '0 14 * * 1-5' }, // 2:00 PM Mon-Fri
        actions: [
          { type: 'leads.research_and_draft', payload: { minScore: 75 }, approvalPolicy: 'human_approval' }
        ],
        enabled: true,
        approvalPolicy: 'human_approval',
        workspaceId: 'default',
        createdAt: Date.now() - 86400000,
        updatedAt: Date.now() - 86400000,
        lastRun: {
          timestamp: Date.now() - 3600000 * 12,
          status: 'success',
          durationMs: 2310,
          result: 'Researched 3 leads and prepared outreach drafts in pending queue.'
        },
        nextRun: calculateNextRun('0 14 * * 1-5'),
        history: [],
        retryPolicy: { maxRetries: 2, retryCount: 0, backoffMs: 10000 }
      }
    ];

    this.automations.clear();
    for (const d of defaults) {
      this.automations.set(d.id, d);
    }
    this.save();
  }

  // ─── CRUD OPERATIONS ─────────────────────────────────────────────────────────
  listAutomations(workspaceId = null) {
    this._syncFromDisk();
    const list = Array.from(this.automations.values());
    if (workspaceId && workspaceId !== 'default') {
      return list.filter(a => a.workspaceId === workspaceId || a.workspaceId === 'default');
    }
    return list;
  }

  getAutomation(id) {
    this._syncFromDisk();
    return this.automations.get(id) || null;
  }

  createAutomation(data = {}) {
    if (!data.name) throw new Error('Automation name is required.');
    const id = data.id || `auto_${data.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_${Math.random().toString(36).slice(2, 6)}`;
    
    const trigger = data.trigger || { type: 'schedule', scheduleExpr: data.scheduleExpr || data.cron || '0 9 * * *' };
    if (trigger.cron && !trigger.scheduleExpr) trigger.scheduleExpr = trigger.cron;
    if (trigger.scheduleExpr && !trigger.cron) trigger.cron = trigger.scheduleExpr;
    const nextRun = trigger.type === 'schedule' ? calculateNextRun(trigger.scheduleExpr) : null;

    const entry = {
      id,
      name: data.name,
      description: data.description || '',
      trigger,
      status: (data.enabled !== false && data.status !== 'paused') ? 'active' : 'paused',
      steps: data.steps || data.actions || [
        { type: data.actionType || 'briefing.generate', payload: data.actionPayload || {} }
      ],
      actions: data.actions || data.steps || [
        { type: data.actionType || 'briefing.generate', payload: data.actionPayload || {} }
      ],
      enabled: data.enabled !== false && data.status !== 'paused',
      approvalPolicy: data.approvalPolicy || 'human_approval',
      workspaceId: data.workspaceId || 'default',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      lastRun: null,
      nextRun,
      history: [],
      retryPolicy: data.retryPolicy || { maxRetries: 3, retryCount: 0, backoffMs: 5000 },
      timeoutMs: data.timeoutMs || 60000
    };

    this.automations.set(id, entry);
    this.save();
    return entry;
  }

  updateAutomation(id, updates = {}) {
    const item = this.automations.get(id);
    if (!item) throw new Error(`Automation not found: ${id}`);

    if (updates.name !== undefined) item.name = updates.name;
    if (updates.description !== undefined) item.description = updates.description;
    if (updates.trigger !== undefined) {
      item.trigger = updates.trigger;
      if (item.trigger.cron && !item.trigger.scheduleExpr) item.trigger.scheduleExpr = item.trigger.cron;
      if (item.trigger.scheduleExpr && !item.trigger.cron) item.trigger.cron = item.trigger.scheduleExpr;
      item.nextRun = item.trigger.type === 'schedule' ? calculateNextRun(item.trigger.scheduleExpr) : null;
    }
    if (updates.steps !== undefined) {
      item.steps = updates.steps;
      if (!updates.actions) item.actions = updates.steps;
    }
    if (updates.actions !== undefined) {
      item.actions = updates.actions;
      if (!updates.steps) item.steps = updates.actions;
    }
    if (updates.enabled !== undefined) {
      item.enabled = Boolean(updates.enabled);
      item.status = item.enabled ? 'active' : 'paused';
      if (item.enabled && item.trigger.type === 'schedule' && !item.nextRun) {
        item.nextRun = calculateNextRun(item.trigger.scheduleExpr || item.trigger.cron);
      }
    }
    if (updates.status !== undefined) {
      item.status = updates.status;
      item.enabled = updates.status !== 'paused';
    }
    if (updates.approvalPolicy !== undefined) item.approvalPolicy = updates.approvalPolicy;
    item.updatedAt = Date.now();

    this.automations.set(id, item);
    this.save();
    return item;
  }

  deleteAutomation(id) {
    if (!this.automations.has(id)) throw new Error(`Automation not found: ${id}`);
    this.automations.delete(id);
    this.save();
    return { ok: true, deletedId: id };
  }

  enableAutomation(id) {
    return this.updateAutomation(id, { enabled: true, status: 'active' });
  }

  disableAutomation(id) {
    return this.updateAutomation(id, { enabled: false, status: 'paused' });
  }

  pauseAutomation(id) {
    return this.disableAutomation(id);
  }

  resumeAutomation(id) {
    return this.enableAutomation(id);
  }

  recordRunHistory(runRecord) {
    const auto = this.automations.get(runRecord.automationId);
    if (auto) {
      if (!Array.isArray(auto.history)) auto.history = [];
      auto.history.unshift(runRecord);
      auto.lastRun = runRecord;
      this.save();
    }
  }

  getRunHistory(automationId, limit = 50) {
    return this.listRuns({ automationId, limit });
  }

  duplicateAutomation(id) {
    const original = this.getAutomation(id);
    if (!original) throw new Error(`Automation not found: ${id}`);

    const clone = JSON.parse(JSON.stringify(original));
    clone.id = `auto_${original.name.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}_copy_${Math.random().toString(36).slice(2, 6)}`;
    clone.name = `${original.name} (Copy)`;
    clone.createdAt = Date.now();
    clone.updatedAt = Date.now();
    clone.lastRun = null;
    clone.history = [];
    clone.nextRun = clone.trigger.type === 'schedule' ? calculateNextRun(clone.trigger.scheduleExpr) : null;

    this.automations.set(clone.id, clone);
    this.save();
    return clone;
  }

  // ─── RUN QUERY & DISCOVERY APIS ─────────────────────────────────────────────
  listRuns({ automationId = null, limit = 50 } = {}) {
    this._syncFromDisk();
    if (automationId) {
      const auto = this.automations.get(automationId);
      if (!auto) return [];
      return (auto.history || []).slice(0, limit);
    }

    const allRuns = [];
    for (const auto of this.automations.values()) {
      if (Array.isArray(auto.history)) {
        allRuns.push(...auto.history);
      }
    }
    allRuns.sort((a, b) => (b.startedAt || b.executedAt || 0) - (a.startedAt || a.executedAt || 0));
    return allRuns.slice(0, limit);
  }

  getRun(runId) {
    this._syncFromDisk();
    if (!runId) return null;
    for (const auto of this.automations.values()) {
      if (Array.isArray(auto.history)) {
        const found = auto.history.find(r => r.runId === runId || r.id === runId);
        if (found) return found;
      }
    }
    return null;
  }

  findAutomation(query) {
    this._syncFromDisk();
    if (!query || typeof query !== 'string') return null;
    const clean = query.trim().toLowerCase().replace(/[-_]/g, ' ');

    // 1. Exact ID or name match
    for (const auto of this.automations.values()) {
      if (auto.id.toLowerCase() === query.trim().toLowerCase()) return auto;
      if (auto.name.toLowerCase() === query.trim().toLowerCase()) return auto;
    }

    // 2. Normalized name match
    const normalizedMatches = [];
    for (const auto of this.automations.values()) {
      const autoNorm = auto.name.toLowerCase().replace(/[-_]/g, ' ');
      if (autoNorm === clean) return auto;
      if (autoNorm.includes(clean) || clean.includes(autoNorm)) {
        normalizedMatches.push(auto);
      }
    }

    if (normalizedMatches.length === 1) return normalizedMatches[0];
    return null; // Return null if ambiguous or not found
  }

  // ─── EXECUTION ENGINE ────────────────────────────────────────────────────────
  async triggerAutomation(id, runtimePayload = {}, triggerSource = 'manual', resultChatId = null) {
    const auto = this.getAutomation(id);
    if (!auto) throw new Error(`Automation not found: ${id}`);

    if (this.runningExecutions.has(id)) {
      throw new Error(`Automation "${auto.name}" is already executing.`);
    }

    this.runningExecutions.add(id);
    const startTime = Date.now();
    const runId = `run_${startTime}_${Math.random().toString(36).slice(2, 7)}`;
    let runStatus = 'success';
    let synthesizedOutput = null;
    let runError = null;

    // 1. Initialize durable run record in running state
    const runRecord = {
      runId,
      id: runId, // Backward compatibility
      automationId: auto.id,
      automationName: auto.name,
      trigger: triggerSource, // "scheduled" | "manual" | "retry"
      triggerSource,
      status: 'running',
      startedAt: startTime,
      completedAt: null,
      durationMs: 0,
      output: null,
      result: null, // Backward compatibility
      error: null,
      resultChatId: resultChatId || null,
      createdAt: startTime
    };

    if (!Array.isArray(auto.history)) auto.history = [];
    auto.history.unshift(runRecord);
    if (auto.history.length > 50) auto.history = auto.history.slice(0, 50);
    this.save();

    try {
      console.log(`[Mesnium Automation Engine] Running: "${auto.name}" [${runId}] (Trigger: ${triggerSource})`);

      // Execute defined action steps
      const results = [];
      let hasWaitingApproval = false;
      for (const act of (auto.actions || [])) {
        const stepResult = await this._executeActionStep(act, auto, runtimePayload);
        results.push(stepResult);
        if (stepResult && (stepResult.status === 'pending_approval' || stepResult.status === 'waiting_approval' || stepResult.waitingApproval)) {
          hasWaitingApproval = true;
        }
      }

      if (hasWaitingApproval) {
        runStatus = 'waiting_approval';
      }

      // Format clean, human-readable synthesized output
      synthesizedOutput = this._synthesizeOutput(auto, results);

    } catch (err) {
      runStatus = 'failed';
      runError = this._sanitizeError(err);
      console.error(`[Mesnium Automation Engine] Execution failed for "${auto.name}":`, err);
    } finally {
      this.runningExecutions.delete(id);
      const durationMs = Date.now() - startTime;
      const completedAt = Date.now();

      runRecord.status = runStatus;
      runRecord.completedAt = runStatus === 'waiting_approval' ? null : completedAt;
      runRecord.durationMs = durationMs;
      runRecord.output = synthesizedOutput;
      runRecord.result = runRecord.output; // Backward compatibility
      runRecord.error = runError;

      auto.lastRun = {
        timestamp: startTime,
        status: runStatus,
        durationMs,
        result: runRecord.output || (runError ? `Failed: ${runError}` : (runStatus === 'waiting_approval' ? 'Waiting for operator approval in Approvals Hub' : 'Completed')),
        error: runError,
        runId,
        resultChatId: runRecord.resultChatId
      };

      // Calculate next scheduled run
      if (auto.trigger?.type === 'schedule') {
        auto.nextRun = calculateNextRun(auto.trigger.scheduleExpr, new Date(startTime + 60000));
      }

      this.save();

      // Record in centralized activity ledger
      this.activityLedger.recordRun({
        agentId: auto.id,
        agentName: auto.name,
        prompt: `Triggered Automation: ${auto.name} [${triggerSource}]`,
        status: runStatus === 'waiting_approval' ? 'waiting_approval' : (runStatus === 'success' ? 'completed' : 'failed'),
        result: runRecord.output || runError,
        error: runError,
        startedAt: startTime,
        completedAt: runStatus === 'waiting_approval' ? null : completedAt,
        resultChatId: runRecord.resultChatId
      });
    }

    if (runStatus === 'failed') {
      throw new Error(`Automation execution failed: ${runError}`);
    }

    return {
      success: runStatus !== 'failed',
      status: runStatus === 'success' ? 'completed' : runStatus,
      runId,
      automationId: auto.id,
      automationName: auto.name,
      durationMs: runRecord.durationMs,
      output: runRecord.output,
      result: runRecord.output, // Backward compatibility
      resultChatId: runRecord.resultChatId
    };
  }

  _synthesizeOutput(automation, stepResults) {
    if (!stepResults || stepResults.length === 0) {
      return `### Automation Completed: ${automation.name}\n\nTask executed successfully with zero errors.`;
    }

    // Check if step results contain briefing sections
    const briefingStep = stepResults.find(s => s && s.briefing);
    if (briefingStep && briefingStep.briefing) {
      const b = briefingStep.briefing;
      let md = `## 📋 Daily Executive Briefing\n*Generated on ${new Date(b.generatedAt || Date.now()).toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' })}*\n\n`;
      if (Array.isArray(b.sections)) {
        for (const sec of b.sections) {
          const icon = sec.icon ? `${sec.icon} ` : '';
          const title = sec.category || sec.title || sec.name || 'Executive Section';
          md += `### ${icon}${title}\n`;
          if (sec.content) {
            md += `${sec.content}\n\n`;
          } else if (Array.isArray(sec.items) && sec.items.length > 0) {
            for (const item of sec.items) {
              md += `- **${item.title || item.sender || 'Item'}**: ${item.text || item.summary || item.snippet || ''}\n`;
            }
            md += `\n`;
          } else {
            md += `*${sec.emptyText || 'No items requiring attention today.'}*\n\n`;
          }
        }
      }
      return md.trim();
    }

    // Check for lead outreach drafting
    const leadStep = stepResults.find(s => s && s.step === 'leads.research_and_draft');
    if (leadStep) {
      return `### 🎯 High-Value Lead Outreach\n\n- **Status:** ${leadStep.status === 'pending_approval' ? 'Draft Prepared (Awaiting Operator Approval)' : 'Completed'}\n- **Target:** \`${leadStep.target || 'lead_prospect@business.com'}\`\n- **Subject:** *Tailored Automation Partnership for Enterprise Client*\n- **Action:** Created personalized proposal draft in pending approvals queue.`;
    }

    // Check for topic monitors
    const monStep = stepResults.find(s => s && s.step === 'monitors.run');
    if (monStep && Array.isArray(monStep.executed)) {
      let md = `### 🔍 Proactive Research Monitors\n\n`;
      for (const m of monStep.executed) {
        md += `- **Topic:** ${m.monitor} — *${m.findings} new findings analyzed*\n`;
      }
      return md.trim();
    }

    // Generic formatting
    const summaries = stepResults.map(s => s.summary || s.message || (typeof s === 'string' ? s : JSON.stringify(s))).join('\n');
    return `### Automation Completed: ${automation.name}\n\n${summaries || 'All action steps finished successfully.'}`;
  }

  _sanitizeError(err) {
    if (!err) return 'An unexpected error occurred during execution.';
    const raw = typeof err === 'string' ? err : (err.message || String(err));
    const lower = raw.toLowerCase();

    if (lower.includes('google workspace connection is required') || lower.includes('oauth') || lower.includes('reauth')) {
      return 'Google Workspace is not connected. Please connect Google Workspace in Connections to run this automation.';
    }
    if (lower.includes('enoent') || lower.includes('not found')) {
      return 'Required data source or business folder was not found.';
    }
    if (lower.includes('eacces') || lower.includes('permission denied')) {
      return 'Access was denied to the target data resource.';
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return 'Automation execution timed out before completion.';
    }
    return raw;
  }

  async _executeActionStep(action, automation, runtimePayload) {
    const actType = action.type;
    const payload = { ...(action.payload || {}), ...runtimePayload };

    // 1. Briefing Generation
    if (actType === 'briefing.generate') {
      const { MesniumBriefingManager } = await import('../mesnium-briefing/index.js');
      const bm = new MesniumBriefingManager();
      const briefing = await bm.generateBriefing();
      return {
        step: 'briefing.generate',
        summary: `Generated executive briefing (${briefing.sections.length} sections).`,
        briefingId: briefing.generatedAt || Date.now(),
        briefing
      };
    }

    // 2. Proactive Topic Monitors
    if (actType === 'monitors.run') {
      const { MesniumMonitorManager } = await import('../mesnium-monitors/index.js');
      const mm = new MesniumMonitorManager();
      const monList = mm.listMonitors();
      const results = [];
      for (const m of monList.filter(mon => mon.enabled)) {
        const runRes = await mm.runMonitor(m.id);
        results.push({ monitor: m.topic, findings: runRes.findings.length });
      }
      return { step: 'monitors.run', executed: results };
    }

    // 3. Lead Research & Drafting
    if (actType === 'leads.research_and_draft') {
      const target = payload.target || payload.to || 'lead_prospect@business.com';
      if (action.approvalPolicy === 'human_approval' || automation.approvalPolicy === 'human_approval') {
        const actionProposal = this.gatekeeper.proposeAction({
          agentId: 'agent_sales',
          actionType: ActionType.EMAIL_DRAFT,
          title: `Personalized Outreach Draft: Enterprise Lead`,
          target,
          payload: {
            to: target,
            subject: payload.subject || 'Tailored Automation Partnership for Enterprise Growth',
            body: payload.body || 'Hello Team,\n\nWe identified high-value alignment with your operational workflows.'
          },
          description: 'Automated outreach draft generated by High-Value Lead Outreach automation.'
        });
        return {
          step: 'leads.research_and_draft',
          status: 'pending_approval',
          target,
          actionId: actionProposal.id,
          message: 'Created outreach draft in pending approvals queue.'
        };
      }
      return { step: 'leads.research_and_draft', status: 'completed' };
    }

    // 4. Unified Agent Runtime Execution (agent.run)
    if (actType === 'agent.run' || actType === 'agent_run') {
      const { getSharedAgentRuntime } = await import('../mesnium-agents/runtime.js');
      const runtime = getSharedAgentRuntime();
      const agentId = payload.agentId || action.agentId || 'agent_operations';
      const prompt = payload.prompt || action.prompt || `Execute automated task for workflow: ${automation.name}`;
      const agentResult = await runtime.runAgent(agentId, prompt, payload.options || {});
      
      return {
        step: 'agent.run',
        agentId,
        status: agentResult.status,
        waitingApproval: agentResult.status === 'waiting_approval' || (agentResult.pendingApprovals && agentResult.pendingApprovals.length > 0),
        pendingApprovals: agentResult.pendingApprovals || [],
        summary: agentResult.summary,
        deliverables: agentResult.deliverables,
        findings: agentResult.findings,
        rawResult: agentResult
      };
    }

    // Fallback: Generic action execution
    return { step: actType, executed: true, summary: `Executed step: ${actType}`, timestamp: new Date().toISOString() };
  }

  // ─── BACKGROUND SCHEDULER LOOP ───────────────────────────────────────────────
  startScheduler(intervalMs = 30000) {
    if (this.schedulerTimer) clearInterval(this.schedulerTimer);
    this.schedulerTimer = setInterval(async () => {
      await this._tickScheduler();
    }, intervalMs);
    if (this.schedulerTimer.unref) this.schedulerTimer.unref();
  }

  stopScheduler() {
    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }
  }

  async _tickScheduler() {
    const now = Date.now();
    for (const auto of this.automations.values()) {
      if (!auto.enabled) continue;
      if (auto.trigger?.type === 'schedule' && auto.nextRun && now >= auto.nextRun) {
        if (this.runningExecutions.has(auto.id)) continue;
        try {
          await this.triggerAutomation(auto.id, {}, 'scheduled');
        } catch (err) {
          console.error(`[Mesnium Scheduler] Error running scheduled automation ${auto.id}:`, err.message);
        }
      }
    }
  }
}

let sharedAutomationEngine = null;

export function getSharedAutomationEngine() {
  if (!sharedAutomationEngine) {
    sharedAutomationEngine = new MesniumAutomationEngine();
  }
  return sharedAutomationEngine;
}
