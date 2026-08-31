/**
 * MESNIUM GOOGLE WORKSPACE CLIENT ADAPTER (PHASE 9)
 * 
 * Interacts with Google Workspace APIs via the hardened local `gog` engine.
 * Enforces --readonly and --no-input security flags on all invocations.
 */

import { execFileSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';

export class GoogleWorkspaceClient {
  constructor(accountEmail = null) {
    this.accountEmail = accountEmail;
    this.isAvailable = this.checkCliAvailable();
  }

  checkCliAvailable() {
    try {
      execFileSync('gog', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'], encoding: 'utf8' });
      return true;
    } catch {
      return false;
    }
  }

  runGog(args = [], options = {}) {
    if (!this.isAvailable) {
      throw new Error('Google Workspace service is not available.');
    }

    if (globalThis.__mesniumDisconnectedProviders && globalThis.__mesniumDisconnectedProviders.has('google')) {
      throw new Error("Your Google Workspace isn't connected right now. You can connect Google Workspace from Connections.");
    }

    const finalArgs = ['--readonly', '--no-input', '--json', '--results-only'];
    if (this.accountEmail) {
      finalArgs.push('-a', this.accountEmail);
    }
    finalArgs.push(...args);

    try {
      const output = execFileSync('gog', finalArgs, {
        encoding: 'utf8',
        timeout: options.timeout || 25000,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 10 * 1024 * 1024
      });

      if (!output || !output.trim()) return [];
      return JSON.parse(output.trim());
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString('utf8') : err.message;
      throw new Error(`Google API Command [gog ${args.join(' ')}] failed: ${stderr}`);
    }
  }

  // --- AUTH STATUS & ACCOUNTS ---
  async getAuthStatus() {
    try {
      const raw = execFileSync('gog', ['auth', 'list', '--json'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
      const data = JSON.parse(raw.trim() || '{}');
      return {
        ok: true,
        accounts: data.accounts || []
      };
    } catch (err) {
      return {
        ok: false,
        error: err.message,
        accounts: []
      };
    }
  }

  // --- GOOGLE DRIVE ---
  async driveList(options = {}) {
    const args = ['drive', 'ls'];
    if (options.max) args.push(`--max=${options.max}`);
    if (options.folderId) args.push(options.folderId);
    return this.runGog(args);
  }

  async driveSearch(query, options = {}) {
    if (!query) return [];
    const args = ['drive', 'search', query];
    if (options.max) args.push(`--max=${options.max}`);
    return this.runGog(args);
  }

  async driveDownload(fileId, targetPath) {
    if (!fileId || !targetPath) throw new Error('fileId and targetPath are required for drive download');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const finalArgs = ['--readonly', '--no-input', 'drive', 'download', fileId, '--out', targetPath];
    if (this.accountEmail) finalArgs.unshift('-a', this.accountEmail);

    execFileSync('gog', finalArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return targetPath;
  }

  // --- GMAIL READ ---
  async gmailSearch(query = 'newer_than:30d', options = {}) {
    const args = ['gmail', 'messages', 'search', query];
    if (options.max) args.push(`--max=${options.max}`);
    return this.runGog(args);
  }

  async gmailGetMessage(messageId) {
    if (!messageId) throw new Error('messageId is required');
    return this.runGog(['gmail', 'messages', 'get', messageId]);
  }

  // --- GOOGLE CALENDAR READ ---
  async calendarListEvents(options = {}) {
    const args = ['calendar', 'events', options.calendarId || 'primary'];
    if (options.max) args.push(`--max=${options.max}`);
    if (options.timeMin) args.push(`--from=${options.timeMin}`);
    if (options.timeMax) args.push(`--to=${options.timeMax}`);
    return this.runGog(args);
  }
}
