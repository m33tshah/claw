/**
 * MESNIUM BUSINESS ENTITLEMENTS & PACK ACTIVATION STORE (PHASE 3)
 * 
 * Manages tenant-specific pack entitlements and activation states:
 * ~/.openclaw/mesnium_business_entitlements.json
 * 
 * Conceptually:
 * workspace.entitlements:
 *   core: true
 *   packs:
 *     pack_real_estate: { enabled: true, activatedAt: ... }
 * 
 * Security:
 * - Strictly enforces non-empty workspaceId on all operations (no fallback).
 * - Isolated per tenant.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { assertValidWorkspaceId } from './validator.js';

function getEntitlementsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_business_entitlements.json');
}

export class MesniumEntitlementsStore {
  constructor(options = {}) {
    this.filePath = options.filePath || getEntitlementsFilePath();
    this.entitlements = new Map(); // workspaceId -> { core: true, packs: { [packId]: { enabled, activatedAt } } }
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (data && typeof data.workspaces === 'object') {
          this.entitlements.clear();
          for (const [wsId, ent] of Object.entries(data.workspaces)) {
            this.entitlements.set(wsId, ent);
          }
          return;
        }
      } catch (err) {
        console.warn('[MesniumEntitlements] Failed to read entitlements store:', err.message);
      }
    }
  }

  save() {
    try {
      const workspacesObj = {};
      for (const [wsId, ent] of this.entitlements.entries()) {
        workspacesObj[wsId] = ent;
      }
      const data = {
        version: '1.0.0',
        updatedAt: Date.now(),
        workspaces: workspacesObj
      };
      const tmpPath = `${this.filePath}.tmp.${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (err) {
      console.error('[MesniumEntitlements] Failed to save entitlements store:', err.message);
    }
  }

  /**
   * Retrieves entitlements for a given workspace.
   * Strictly requires valid workspaceId.
   */
  getEntitlements(workspaceId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'getEntitlements');
    let ent = this.entitlements.get(validWs);
    if (!ent) {
      ent = {
        workspaceId: validWs,
        core: true,
        packs: {}
      };
      this.entitlements.set(validWs, ent);
      this.save();
    }
    return JSON.parse(JSON.stringify(ent));
  }

  /**
   * Activates a pack for a given workspace.
   */
  activatePack(workspaceId, packId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'activatePack');
    if (!packId || typeof packId !== 'string') {
      throw new Error('Pack activation error: packId is required.');
    }
    const cleanPackId = packId.trim();

    const ent = this.getEntitlements(validWs);
    ent.packs[cleanPackId] = {
      enabled: true,
      activatedAt: Date.now(),
      updatedAt: Date.now()
    };

    this.entitlements.set(validWs, ent);
    this.save();

    return JSON.parse(JSON.stringify(ent));
  }

  /**
   * Deactivates a pack for a given workspace.
   */
  deactivatePack(workspaceId, packId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'deactivatePack');
    if (!packId || typeof packId !== 'string') {
      throw new Error('Pack deactivation error: packId is required.');
    }
    const cleanPackId = packId.trim();

    const ent = this.getEntitlements(validWs);
    if (ent.packs[cleanPackId]) {
      ent.packs[cleanPackId].enabled = false;
      ent.packs[cleanPackId].deactivatedAt = Date.now();
      ent.packs[cleanPackId].updatedAt = Date.now();
    }

    this.entitlements.set(validWs, ent);
    this.save();

    return JSON.parse(JSON.stringify(ent));
  }

  /**
   * Checks if a pack is active/enabled for a workspace.
   */
  isPackActive(workspaceId, packId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'isPackActive');
    const ent = this.getEntitlements(validWs);
    return Boolean(ent?.packs?.[packId]?.enabled);
  }

  /**
   * Returns list of active pack IDs for a workspace.
   */
  getActivePackIds(workspaceId) {
    const validWs = assertValidWorkspaceId(workspaceId, 'getActivePackIds');
    const ent = this.getEntitlements(validWs);
    if (!ent || !ent.packs) return [];
    return Object.keys(ent.packs).filter(packId => ent.packs[packId]?.enabled);
  }
}
