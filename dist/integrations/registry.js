/**
 * MESNIUM INTEGRATION REGISTRY & PERMISSION MANAGER (PHASE 9)
 * 
 * Manages active connected accounts, provider adapters, and enforces read-only boundaries.
 */

import { IntegrationProvider, IntegrationStatus, PermissionLevel } from './types.js';

export class MesniumIntegrationRegistry {
  constructor() {
    this.accounts = new Map(); // key: provider:accountId -> IntegrationAccount
  }

  registerAccount({
    provider = IntegrationProvider.GOOGLE,
    accountId,
    email,
    displayName = null,
    status = IntegrationStatus.CONNECTED,
    services = ['drive', 'gmail', 'calendar'],
    permissions = {
      drive: PermissionLevel.READ,
      gmail: PermissionLevel.READ,
      calendar: PermissionLevel.READ
    }
  }) {
    if (!accountId) throw new Error('Account ID is required');
    const key = `${provider}:${accountId}`;
    const entry = {
      key,
      provider,
      accountId,
      email: email || accountId,
      displayName: displayName || email || accountId,
      status,
      services,
      permissions: Object.freeze({ ...permissions }), // Immutable permission set
      connectedAt: Date.now(),
      lastSyncedAt: Date.now()
    };

    this.accounts.set(key, entry);
    return entry;
  }

  getAccount(provider, accountId) {
    const key = `${provider}:${accountId}`;
    return this.accounts.get(key) || null;
  }

  listAccounts(provider = null) {
    const list = Array.from(this.accounts.values());
    if (provider) {
      return list.filter(a => a.provider === provider);
    }
    return list;
  }

  disconnectAccount(provider, accountId) {
    const key = `${provider}:${accountId}`;
    const existing = this.accounts.get(key);
    if (existing) {
      existing.status = IntegrationStatus.DISCONNECTED;
      return true;
    }
    return false;
  }

  /**
   * Enforces security policy: Rejects unauthorized write operations in Phase 9.
   */
  assertPermission(provider, accountId, service, requiredLevel = PermissionLevel.READ) {
    const account = this.getAccount(provider, accountId);
    if (!account || account.status !== IntegrationStatus.CONNECTED) {
      throw new Error(`Integration account [${provider}:${accountId}] is not connected.`);
    }

    const currentLevel = account.permissions[service] || PermissionLevel.NONE;

    if (requiredLevel === PermissionLevel.WRITE && currentLevel !== PermissionLevel.WRITE) {
      throw new Error(`Security Policy Violation: Write operations are disabled for [${service}]. Phase 9 operates in strict READ-ONLY mode.`);
    }

    if (requiredLevel === PermissionLevel.READ && currentLevel === PermissionLevel.NONE) {
      throw new Error(`Permission Denied: Read access is not granted for [${service}].`);
    }

    return true;
  }
}

let defaultRegistry = null;

export function getSharedIntegrationRegistry() {
  if (!defaultRegistry) {
    defaultRegistry = new MesniumIntegrationRegistry();
  }
  return defaultRegistry;
}
