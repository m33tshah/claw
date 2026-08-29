/**
 * MESNIUM GMAIL READ CONNECTOR (PHASE 9)
 * 
 * Provides normalized read-only email search, thread inspection, and retrieval.
 */

import { GoogleWorkspaceClient } from './client.js';

export class GmailReader {
  constructor(accountEmail = null) {
    this.client = new GoogleWorkspaceClient(accountEmail);
  }

  /**
   * Search emails and normalize message envelopes.
   */
  async searchEmails(query = 'newer_than:30d', options = {}) {
    const rawMessages = await this.client.gmailSearch(query, { max: options.max || 10 });
    if (!Array.isArray(rawMessages)) return [];

    return rawMessages.map(msg => ({
      id: msg.id,
      threadId: msg.threadId,
      from: msg.from || 'Unknown Sender',
      subject: msg.subject || '(No Subject)',
      date: msg.date || '',
      internalDateIso: msg.internalDateIso || '',
      labels: msg.labels || [],
      snippet: msg.snippet || ''
    }));
  }

  /**
   * Retrieve full details of an individual email.
   */
  async getEmail(messageId) {
    if (!messageId) throw new Error('messageId is required');
    const msg = await this.client.gmailGetMessage(messageId);
    return {
      id: msg.id,
      threadId: msg.threadId,
      from: msg.from || '',
      to: msg.to || '',
      subject: msg.subject || '',
      date: msg.date || '',
      body: msg.body || msg.snippet || '',
      labels: msg.labels || []
    };
  }
}
