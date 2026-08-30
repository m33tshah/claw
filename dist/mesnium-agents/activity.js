/**
 * MESNIUM AGENT ACTIVITY LEDGER (PHASE 11)
 * 
 * Provides a clean, business-friendly activity ledger recording agent executions,
 * consulted sources, duration, status, and outcomes without technical JSON clutter.
 */

export class MesniumActivityLedger {
  constructor() {
    this.records = []; // In-memory + persisted activity ledger
  }

  recordRun({
    agentId,
    agentName,
    prompt,
    status = 'running',
    result = null,
    sourcesConsulted = [],
    toolsUsed = [],
    startedAt = Date.now(),
    completedAt = null,
    durationMs = null,
    error = null
  }) {
    const id = `act_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const record = {
      id,
      agentId,
      agentName: agentName || agentId,
      prompt,
      status,
      result,
      sourcesConsulted: Array.from(new Set(sourcesConsulted)),
      toolsUsed: Array.from(new Set(toolsUsed)),
      startedAt,
      completedAt,
      durationMs: durationMs || (completedAt ? completedAt - startedAt : 0),
      error
    };

    this.records.unshift(record); // Prepend for latest-first ordering
    if (this.records.length > 500) {
      this.records.pop();
    }
    return record;
  }

  updateRun(id, updates = {}) {
    const record = this.records.find(r => r.id === id);
    if (record) {
      Object.assign(record, updates);
      if (updates.completedAt && record.startedAt) {
        record.durationMs = updates.completedAt - record.startedAt;
      }
      return record;
    }
    return null;
  }

  listActivity({ agentId = null, limit = 50 } = {}) {
    let list = this.records;
    if (agentId) {
      list = list.filter(r => r.agentId === agentId);
    }
    return list.slice(0, limit);
  }

  getRecentActivityForAgent(agentId, limit = 5) {
    return this.listActivity({ agentId, limit });
  }

  clear() {
    this.records = [];
  }
}

let sharedLedger = null;

export function getSharedActivityLedger() {
  if (!sharedLedger) {
    sharedLedger = new MesniumActivityLedger();
  }
  return sharedLedger;
}
