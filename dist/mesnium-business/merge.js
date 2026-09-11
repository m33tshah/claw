/**
 * MESNIUM BUSINESS CONTEXT MERGE ENGINE & PROVENANCE TRACKER (PHASE 3)
 * 
 * Deterministic Hierarchical Merging:
 * 
 * 1. Mesnium Core Defaults (source: 'core')
 * 2. Activated Pack Defaults (source: 'pack')
 * 3. Customer Business Context (source: 'customer')
 * 4. Customer Agent-Specific Overrides (source: 'agent_override')
 * 
 * Principles:
 * - Customer overrides ALWAYS take precedence over pack defaults.
 * - Deterministic, predictable, pure object cloning.
 * - Prototype-pollution protected (null prototype or plain sanitized objects).
 * - Full provenance audit trail tracking the origin of every section and key.
 * - Zero executable code.
 */

import { ConfigSource, createDefaultBusinessContext } from './types.js';

export function mergeBusinessConfigurations({
  coreContext = null,
  activePacks = [],
  customerContext = null,
  targetAgentId = null,
  workspaceId = 'default'
}) {
  const provenance = {}; // key path -> { source, packId, timestamp }
  const effective = createDefaultBusinessContext(workspaceId);
  effective.updatedAt = customerContext?.updatedAt || 0;

  // 1. Tag all Core defaults
  _tagProvenance(effective, ConfigSource.CORE, provenance);

  // 2. Layer Activated Packs
  if (Array.isArray(activePacks)) {
    for (const pack of activePacks) {
      if (!pack) continue;
      const packDefaults = pack.businessContextDefaults || {};
      _mergeWithProvenance(effective, packDefaults, {
        source: ConfigSource.PACK,
        packId: pack.id,
        packName: pack.name
      }, provenance);

      // Pack agent configs
      if (pack.agentConfigs && typeof pack.agentConfigs === 'object') {
        if (!effective.agentConfig) effective.agentConfig = {};
        for (const [aId, aConf] of Object.entries(pack.agentConfigs)) {
          if (!effective.agentConfig[aId]) effective.agentConfig[aId] = {};
          _mergeWithProvenance(effective.agentConfig[aId], aConf, {
            source: ConfigSource.PACK,
            packId: pack.id,
            packName: pack.name
          }, provenance, `agentConfig.${aId}`);
        }
      }
    }
  }

  // 3. Layer Customer Business Context (Customer Overrides Win)
  if (customerContext && typeof customerContext === 'object') {
    // Identity, Offerings, Customers, Brand, Policies, Operations, Contacts
    const sections = ['identity', 'offerings', 'customers', 'brand', 'policies', 'operations', 'contacts'];
    for (const sec of sections) {
      if (customerContext[sec] && typeof customerContext[sec] === 'object') {
        _mergeWithProvenance(effective[sec], customerContext[sec], {
          source: ConfigSource.CUSTOMER
        }, provenance, sec);
      }
    }

    // Customer general agent configs
    if (customerContext.agentConfig && typeof customerContext.agentConfig === 'object') {
      if (!effective.agentConfig) effective.agentConfig = {};
      for (const [aId, aConf] of Object.entries(customerContext.agentConfig)) {
        if (!effective.agentConfig[aId]) effective.agentConfig[aId] = {};
        _mergeWithProvenance(effective.agentConfig[aId], aConf, {
          source: ConfigSource.AGENT_OVERRIDE
        }, provenance, `agentConfig.${aId}`);
      }
    }
  }

  // 4. Return deterministic snapshot with attached provenance
  return {
    workspaceId,
    targetAgentId,
    effective,
    provenance,
    activePacks: activePacks.map(p => ({
      id: p.id,
      name: p.name,
      version: p.version,
      capabilityRequirements: p.capabilityRequirements || []
    }))
  };
}

function _tagProvenance(obj, source, provenance, prefix = '') {
  if (!obj || typeof obj !== 'object') return;
  for (const key of Object.keys(obj)) {
    const fullPath = prefix ? `${prefix}.${key}` : key;
    provenance[fullPath] = { source };
    if (obj[key] && typeof obj[key] === 'object' && !Array.isArray(obj[key])) {
      _tagProvenance(obj[key], source, provenance, fullPath);
    }
  }
}

function _mergeWithProvenance(target, patch, sourceMeta, provenance, prefix = '') {
  if (!patch || typeof patch !== 'object') return;

  for (const key of Object.keys(patch)) {
    // Prototype pollution guard
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') continue;

    const fullPath = prefix ? `${prefix}.${key}` : key;
    const patchVal = patch[key];

    if (patchVal === null || patchVal === undefined) {
      continue;
    }

    if (Array.isArray(patchVal)) {
      // Arrays from higher precedence completely override lower precedence defaults
      target[key] = JSON.parse(JSON.stringify(patchVal));
      provenance[fullPath] = { ...sourceMeta };
    } else if (typeof patchVal === 'object') {
      if (!target[key] || typeof target[key] !== 'object' || Array.isArray(target[key])) {
        target[key] = {};
      }
      provenance[fullPath] = { ...sourceMeta };
      _mergeWithProvenance(target[key], patchVal, sourceMeta, provenance, fullPath);
    } else {
      // Primitive replacement
      target[key] = patchVal;
      provenance[fullPath] = { ...sourceMeta };
    }
  }
}
