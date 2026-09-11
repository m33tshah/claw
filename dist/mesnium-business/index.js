/**
 * MESNIUM BUSINESS CONTEXT & PACKS SUBSYSTEM (PHASE 3)
 * 
 * Unified facade coordinating:
 * - Persistent Business Context Store (tenant-isolated)
 * - Persistent Entitlements Store (pack activations)
 * - Business Packs Registry (built-in Real Estate pack + extensions)
 * - Deterministic Merge Engine (with provenance tracking)
 * - Role-Tailored Agent Context Projector
 */

import { MesniumBusinessContextStore } from './context-store.js';
import { MesniumEntitlementsStore } from './entitlements-store.js';
import { getSharedPacksRegistry } from './packs-registry.js';
import { mergeBusinessConfigurations } from './merge.js';
import { projectAgentBusinessContext } from './projector.js';
import { assertValidWorkspaceId } from './validator.js';

export * from './types.js';
export * from './validator.js';
export { BUILTIN_REAL_ESTATE_PACK } from './packs-registry.js';

export class MesniumBusinessManager {
  constructor(options = {}) {
    this.contextStore = new MesniumBusinessContextStore(options);
    this.entitlementsStore = new MesniumEntitlementsStore(options);
    this.packsRegistry = getSharedPacksRegistry();
  }

  getContext(workspaceId) {
    assertValidWorkspaceId(workspaceId, 'getContext');
    return this.contextStore.getContext(workspaceId);
  }

  updateContext(workspaceId, patch) {
    assertValidWorkspaceId(workspaceId, 'updateContext');
    return this.contextStore.updateContext(workspaceId, patch);
  }

  resetContext(workspaceId) {
    assertValidWorkspaceId(workspaceId, 'resetContext');
    return this.contextStore.resetContext(workspaceId);
  }

  listPacks(workspaceId = null) {
    const packs = this.packsRegistry.listPacks();
    if (workspaceId) {
      assertValidWorkspaceId(workspaceId, 'listPacks');
      const entitlements = this.entitlementsStore.getEntitlements(workspaceId);
      return packs.map(p => ({
        ...p,
        active: Boolean(entitlements?.packs?.[p.id]?.enabled),
        activatedAt: entitlements?.packs?.[p.id]?.activatedAt || null
      }));
    }
    return packs;
  }

  getPack(packId) {
    return this.packsRegistry.getPack(packId);
  }

  activatePack(workspaceId, packId) {
    assertValidWorkspaceId(workspaceId, 'activatePack');
    const pack = this.packsRegistry.getPack(packId);
    if (!pack) {
      throw new Error(`Business Pack "${packId}" not found in registry.`);
    }
    return this.entitlementsStore.activatePack(workspaceId, packId);
  }

  deactivatePack(workspaceId, packId) {
    assertValidWorkspaceId(workspaceId, 'deactivatePack');
    return this.entitlementsStore.deactivatePack(workspaceId, packId);
  }

  getEntitlements(workspaceId) {
    assertValidWorkspaceId(workspaceId, 'getEntitlements');
    return this.entitlementsStore.getEntitlements(workspaceId);
  }

  /**
   * Computes deterministic merged effective configuration with full provenance.
   * Safe for inspection RPC (strips any potential internal references).
   */
  getEffectiveConfiguration(workspaceId, agentId = null) {
    assertValidWorkspaceId(workspaceId, 'getEffectiveConfiguration');

    const customerContext = this.contextStore.getContext(workspaceId);
    const activePackIds = this.entitlementsStore.getActivePackIds(workspaceId);
    const activePacks = activePackIds
      .map(id => this.packsRegistry.getPack(id))
      .filter(Boolean);

    const merged = mergeBusinessConfigurations({
      activePacks,
      customerContext,
      targetAgentId: agentId,
      workspaceId
    });

    return merged;
  }

  /**
   * Returns role-tailored Markdown business context string for model prompt injection.
   */
  getAgentBusinessContext(workspaceId, agentId) {
    assertValidWorkspaceId(workspaceId, 'getAgentBusinessContext');
    const merged = this.getEffectiveConfiguration(workspaceId, agentId);
    return projectAgentBusinessContext(merged.effective, agentId, workspaceId);
  }
}

let sharedManager = null;

export function getSharedBusinessContextManager(options = {}) {
  if (!sharedManager) {
    sharedManager = new MesniumBusinessManager(options);
  }
  return sharedManager;
}

export function resetSharedBusinessContextManager() {
  sharedManager = null;
}
