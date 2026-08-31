/**
 * MESNIUM INTEGRATION REGISTRY & PERMISSION MANAGER (PHASE 9)
 * 
 * Manages active connected accounts, provider adapters, and enforces read-only boundaries.
 */

import { execFileSync } from 'node:child_process';
import { IntegrationProvider, IntegrationStatus, PermissionLevel } from './types.js';
import { GoogleWorkspaceClient } from './google/client.js';

export class MesniumIntegrationRegistry {
  constructor() {
    this.accounts = new Map(); // key: provider:accountId -> IntegrationAccount
    this.disconnectedProviders = new Set();
  }

  syncWithRuntime() {
    try {
      const client = new GoogleWorkspaceClient();
      if (!client.isAvailable || this.disconnectedProviders.has('google')) {
        for (const [key, acc] of this.accounts) {
          if (acc.provider === IntegrationProvider.GOOGLE) {
            this.accounts.delete(key);
          }
        }
        return;
      }
      const raw = execFileSync('gog', ['auth', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 5000 });
      const data = JSON.parse(raw.trim() || '{}');
      const accounts = data.accounts || [];
      // Remove stale google accounts
      for (const [key, acc] of this.accounts) {
        if (acc.provider === IntegrationProvider.GOOGLE) {
          this.accounts.delete(key);
        }
      }
      for (const ac of accounts) {
        this.registerAccount({
          provider: IntegrationProvider.GOOGLE,
          accountId: `google_${ac.email}`,
          email: ac.email,
          displayName: ac.email,
          status: IntegrationStatus.CONNECTED,
          services: ac.services || ['drive', 'gmail', 'calendar']
        });
      }
    } catch (_) {
      // Do not crash if CLI is temporarily unavailable
    }
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
    if (provider) this.disconnectedProviders.add(provider);
    globalThis.__mesniumDisconnectedProviders = this.disconnectedProviders;
    if (accountId) {
      const key = `${provider}:${accountId}`;
      const existing = this.accounts.get(key);
      if (existing) {
        existing.status = IntegrationStatus.DISCONNECTED;
        return true;
      }
    } else {
      for (const [key, acc] of this.accounts) {
        if (acc.provider === provider) {
          this.accounts.delete(key);
        }
      }
      return true;
    }
    return false;
  }

  reconnectProvider(provider) {
    if (provider) this.disconnectedProviders.delete(provider);
    globalThis.__mesniumDisconnectedProviders = this.disconnectedProviders;
    this.syncWithRuntime();
    const accounts = this.listAccounts(provider);
    return accounts.length > 0 ? accounts[0] : null;
  }

  unregisterAccount(accountId) {
    for (const [key, acc] of this.accounts) {
      if (acc.accountId === accountId || acc.key === accountId) {
        this.accounts.delete(key);
        return true;
      }
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
  defaultRegistry.syncWithRuntime();
  return defaultRegistry;
}
