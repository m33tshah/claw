/**
 * MESNIUM PUBLIC TENANT MANAGER (PHASE 1 INTEGRATION)
 * 
 * Maps public, non-secret business identifiers (e.g. pub_...) to internal workspace tenants.
 * This public identifier is safe to embed in external customer websites and paste in script tags.
 * 
 * Never exposes internal database UUIDs, filesystem paths, or admin credentials.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

function getPublicTenantsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_public_tenants.json');
}

export class MesniumPublicTenantManager {
  constructor(options = {}) {
    this.filePath = options.filePath || getPublicTenantsFilePath();
    this.tenants = new Map(); // publicId -> TenantConfig
    this.workspaceMap = new Map(); // workspaceId -> publicId
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.tenants)) {
          this.tenants.clear();
          this.workspaceMap.clear();
          for (const t of data.tenants) {
            this.tenants.set(t.publicId, t);
            this.workspaceMap.set(t.workspaceId, t.publicId);
          }
          return;
        }
      } catch (_) {}
    }
    this.seedDefault();
  }

  seedDefault() {
    // Seed default public ID for the default workspace
    const defaultPublicId = 'pub_mesnium_default';
    const defaultTenant = {
      publicId: defaultPublicId,
      workspaceId: 'default',
      businessName: 'Mesnium Business',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.tenants.set(defaultPublicId, defaultTenant);
    this.workspaceMap.set('default', defaultPublicId);
    this.save();
  }

  save() {
    try {
      const data = {
        version: '1.0.0',
        updatedAt: Date.now(),
        tenants: Array.from(this.tenants.values())
      };
      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (_) {}
  }

  getTenantByPublicId(publicId) {
    if (!publicId || typeof publicId !== 'string') return null;
    const tenant = this.tenants.get(publicId);
    if (!tenant) return null;
    return { ...tenant };
  }

  getPublicIdForWorkspace(workspaceId = 'default') {
    let publicId = this.workspaceMap.get(workspaceId);
    if (!publicId) {
      publicId = `pub_${crypto.randomBytes(12).toString('hex')}`;
      const tenant = {
        publicId,
        workspaceId,
        businessName: 'Mesnium Business',
        enabled: true,
        createdAt: Date.now(),
        updatedAt: Date.now()
      };
      this.tenants.set(publicId, tenant);
      this.workspaceMap.set(workspaceId, publicId);
      this.save();
    }
    return publicId;
  }

  setTenantConfig(workspaceId = 'default', updates = {}) {
    const publicId = this.getPublicIdForWorkspace(workspaceId);
    const existing = this.tenants.get(publicId);
    if (!existing) return null;

    if (typeof updates.enabled === 'boolean') {
      existing.enabled = updates.enabled;
    }
    if (typeof updates.businessName === 'string' && updates.businessName.trim()) {
      existing.businessName = updates.businessName.trim();
    }
    existing.updatedAt = Date.now();
    this.save();
    return { ...existing };
  }

  rotatePublicId(workspaceId = 'default') {
    const oldPublicId = this.workspaceMap.get(workspaceId);
    if (oldPublicId) {
      this.tenants.delete(oldPublicId);
    }
    const newPublicId = `pub_${crypto.randomBytes(12).toString('hex')}`;
    const newTenant = {
      publicId: newPublicId,
      workspaceId,
      businessName: 'Mesnium Business',
      enabled: true,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };
    this.tenants.set(newPublicId, newTenant);
    this.workspaceMap.set(workspaceId, newPublicId);
    this.save();
    return newPublicId;
  }
}

let sharedTenantManager = null;
export function getSharedPublicTenantManager() {
  if (!sharedTenantManager) {
    sharedTenantManager = new MesniumPublicTenantManager();
  }
  return sharedTenantManager;
}
