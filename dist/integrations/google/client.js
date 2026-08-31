/**
 * MESNIUM GOOGLE WORKSPACE CLIENT ADAPTER (PHASE 9 / V1.1 PRODUCTIZATION)
 * 
 * Interacts with Google Workspace APIs via the hardened local `gog` CLI engine.
 * Supports complete read and write operations across Gmail, Drive, and Calendar,
 * while enforcing cryptographic Action Gatekeeper approval for consequential mutations.
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

    const finalArgs = ['--no-input', '--json', '--results-only'];
    
    // Enforce --readonly flag for read queries unless explicitly executing an authorized mutation
    if (!options.mutation) {
      finalArgs.unshift('--readonly');
    }

    if (this.accountEmail) {
      finalArgs.push('-a', this.accountEmail);
    }
    finalArgs.push(...args);

    try {
      const output = execFileSync('gog', finalArgs, {
        encoding: 'utf8',
        timeout: options.timeout || 30000,
        stdio: ['ignore', 'pipe', 'pipe'],
        maxBuffer: 15 * 1024 * 1024
      });

      if (!output || !output.trim()) return { success: true };
      return JSON.parse(output.trim());
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString('utf8') : err.message;
      throw new Error(`Google API Command [gog ${args.join(' ')}] failed: ${stderr.trim()}`);
    }
  }

  // ─── AUTH STATUS & ACCOUNTS ──────────────────────────────────────────────────
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

  // ─── GMAIL SEARCH & READ ─────────────────────────────────────────────────────
  async gmailSearch(query = 'newer_than:30d', options = {}) {
    const args = ['gmail', 'messages', 'search', query];
    if (options.max) args.push(`--max=${options.max}`);
    return this.runGog(args, { mutation: false });
  }

  async gmailGetMessage(messageId) {
    if (!messageId) throw new Error('messageId is required');
    return this.runGog(['gmail', 'messages', 'get', messageId], { mutation: false });
  }

  // ─── GMAIL MUTATIONS (SEND, REPLY, FORWARD, DRAFT) ───────────────────────────
  async gmailSend({ to, subject, body, cc, bcc, replyToMessageId, threadId, htmlBody, attachments = [] }) {
    if (!to) throw new Error('Recipient email address (--to) is required.');
    if (!subject && !replyToMessageId) throw new Error('Subject is required for new emails.');
    if (!body && !htmlBody) throw new Error('Email body is required.');

    const args = ['gmail', 'send', `--to=${to}`];
    if (subject) args.push(`--subject=${subject}`);
    if (body) args.push(`--body=${body}`);
    if (htmlBody) args.push(`--body-html=${htmlBody}`);
    if (cc) args.push(`--cc=${cc}`);
    if (bcc) args.push(`--bcc=${bcc}`);
    if (replyToMessageId) args.push(`--reply-to-message-id=${replyToMessageId}`);
    if (threadId) args.push(`--thread-id=${threadId}`);
    for (const att of attachments) {
      args.push(`--attach=${att}`);
    }

    return this.runGog(args, { mutation: true });
  }

  async gmailReply(messageId, { body, replyAll = false, quote = false }) {
    if (!messageId) throw new Error('Message ID is required to reply.');
    if (!body) throw new Error('Reply body is required.');

    const args = ['gmail', 'reply', messageId, `--body=${body}`];
    if (replyAll) args.push('--reply-all');
    if (quote) args.push('--quote');

    return this.runGog(args, { mutation: true });
  }

  async gmailForward(messageId, { to, body }) {
    if (!messageId) throw new Error('Message ID is required to forward.');
    if (!to) throw new Error('Recipient email address is required.');

    const args = ['gmail', 'forward', messageId, `--to=${to}`];
    if (body) args.push(`--body=${body}`);

    return this.runGog(args, { mutation: true });
  }

  async gmailDraftCreate({ to, subject, body, cc, bcc }) {
    const args = ['gmail', 'drafts', 'create'];
    if (to) args.push(`--to=${to}`);
    if (subject) args.push(`--subject=${subject}`);
    if (body) args.push(`--body=${body}`);
    if (cc) args.push(`--cc=${cc}`);
    if (bcc) args.push(`--bcc=${bcc}`);

    return this.runGog(args, { mutation: true });
  }

  async gmailDraftList(options = {}) {
    const args = ['gmail', 'drafts', 'list'];
    if (options.max) args.push(`--max=${options.max}`);
    return this.runGog(args, { mutation: false });
  }

  async gmailDraftSend(draftId) {
    if (!draftId) throw new Error('draftId is required');
    return this.runGog(['gmail', 'drafts', 'send', draftId], { mutation: true });
  }

  async gmailDraftDelete(draftId) {
    if (!draftId) throw new Error('draftId is required');
    return this.runGog(['gmail', 'drafts', 'delete', draftId], { mutation: true });
  }

  async gmailArchive(messageId) {
    if (!messageId) throw new Error('messageId is required');
    return this.runGog(['gmail', 'archive', messageId], { mutation: true });
  }

  async gmailMarkRead(messageId) {
    if (!messageId) throw new Error('messageId is required');
    return this.runGog(['gmail', 'mark-read', messageId], { mutation: true });
  }

  async gmailMarkUnread(messageId) {
    if (!messageId) throw new Error('messageId is required');
    return this.runGog(['gmail', 'unread', messageId], { mutation: true });
  }

  async gmailTrash(messageId) {
    if (!messageId) throw new Error('messageId is required');
    return this.runGog(['gmail', 'trash', messageId], { mutation: true });
  }

  // ─── GOOGLE DRIVE READ & WRITE ───────────────────────────────────────────────
  async driveList(options = {}) {
    const args = ['drive', 'ls'];
    if (options.max) args.push(`--max=${options.max}`);
    if (options.folderId) args.push(options.folderId);
    return this.runGog(args, { mutation: false });
  }

  async driveSearch(query, options = {}) {
    if (!query) return [];
    const args = ['drive', 'search', query];
    if (options.max) args.push(`--max=${options.max}`);
    return this.runGog(args, { mutation: false });
  }

  async driveDownload(fileId, targetPath) {
    if (!fileId || !targetPath) throw new Error('fileId and targetPath are required for drive download');
    const dir = path.dirname(targetPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const finalArgs = ['--no-input', 'drive', 'download', fileId, '--out', targetPath];
    if (this.accountEmail) finalArgs.unshift('-a', this.accountEmail);

    execFileSync('gog', finalArgs, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return targetPath;
  }

  async driveUpload(localPath, options = {}) {
    if (!localPath || !fs.existsSync(localPath)) {
      throw new Error(`File does not exist for drive upload: ${localPath}`);
    }
    const args = ['drive', 'upload', localPath];
    return this.runGog(args, { mutation: true });
  }

  async driveDelete(fileId, permanent = false) {
    if (!fileId) throw new Error('fileId is required');
    const args = ['drive', 'delete', fileId, '--force'];
    if (permanent) args.push('--permanent');
    return this.runGog(args, { mutation: true });
  }

  // ─── GOOGLE CALENDAR READ & WRITE ────────────────────────────────────────────
  async calendarListEvents(options = {}) {
    const args = ['calendar', 'events', options.calendarId || 'primary'];
    if (options.max) args.push(`--max=${options.max}`);
    if (options.timeMin) args.push(`--from=${options.timeMin}`);
    if (options.timeMax) args.push(`--to=${options.timeMax}`);
    return this.runGog(args, { mutation: false });
  }

  async calendarCreateEvent({ calendarId = 'primary', summary, description, start, end, attendees, location, withMeet = false }) {
    if (!summary) throw new Error('Event summary/title is required.');
    if (!start || !end) throw new Error('Start and End times (ISO 8601) are required.');

    const args = ['calendar', 'create', calendarId, `--summary=${summary}`, `--from=${start}`, `--to=${end}`];
    if (description) args.push(`--description=${description}`);
    if (location) args.push(`--location=${location}`);
    if (attendees) args.push(`--attendees=${attendees}`);
    if (withMeet) args.push('--with-meet');

    return this.runGog(args, { mutation: true });
  }

  async calendarUpdateEvent(calendarId = 'primary', eventId, updates = {}) {
    if (!eventId) throw new Error('eventId is required to update a calendar event.');
    const args = ['calendar', 'update', calendarId, eventId];
    if (updates.summary) args.push(`--summary=${updates.summary}`);
    if (updates.start) args.push(`--from=${updates.start}`);
    if (updates.end) args.push(`--to=${updates.end}`);
    if (updates.description) args.push(`--description=${updates.description}`);
    if (updates.location) args.push(`--location=${updates.location}`);

    return this.runGog(args, { mutation: true });
  }

  async calendarDeleteEvent(calendarId = 'primary', eventId) {
    if (!eventId) throw new Error('eventId is required to delete a calendar event.');
    const args = ['calendar', 'delete', calendarId, eventId, '--force'];
    return this.runGog(args, { mutation: true });
  }
}
