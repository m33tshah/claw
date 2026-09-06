/**
 * MESNIUM VISITOR CONVERSATION MANAGER (PHASE 1 INTEGRATION)
 * 
 * Manages visitor conversation threads, sessions, and message continuity.
 * Distinguishes external website visitor threads from internal owner conversations.
 * 
 * Sessions are keyed by an opaque, cryptographically random conversation token.
 * Prevents cross-visitor conversation access and conversation enumeration.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';

function getVisitorConversationsFilePath() {
  const base = process.env.OPENCLAW_HOME || path.join(os.homedir(), '.openclaw');
  if (!fs.existsSync(base)) {
    fs.mkdirSync(base, { recursive: true });
  }
  return path.join(base, 'mesnium_visitor_conversations.json');
}

export class MesniumVisitorConversationManager {
  constructor(options = {}) {
    this.filePath = options.filePath || getVisitorConversationsFilePath();
    this.conversations = new Map(); // conversationToken -> ConversationRecord
    this.load();
  }

  load() {
    if (fs.existsSync(this.filePath)) {
      try {
        const raw = fs.readFileSync(this.filePath, 'utf8');
        const data = JSON.parse(raw);
        if (Array.isArray(data.conversations)) {
          this.conversations.clear();
          for (const c of data.conversations) {
            this.conversations.set(c.conversationToken, c);
          }
          return;
        }
      } catch (_) {}
    }
  }

  save() {
    try {
      const data = {
        version: '1.0.0',
        updatedAt: Date.now(),
        conversations: Array.from(this.conversations.values())
      };
      const tmpPath = `${this.filePath}.tmp.${Date.now()}`;
      fs.writeFileSync(tmpPath, JSON.stringify(data, null, 2), 'utf8');
      fs.renameSync(tmpPath, this.filePath);
    } catch (_) {}
  }

  /**
   * Resolves or initializes a visitor conversation session.
   * If token exists and belongs to the given publicId, resumes conversation.
   * Otherwise generates a new cryptographic session token.
   */
  getOrCreateSession(publicId, workspaceId, existingToken = null) {
    if (existingToken && typeof existingToken === 'string') {
      const existing = this.conversations.get(existingToken);
      // Strictly verify tenant boundary: token MUST match the requested publicId
      if (existing && existing.publicId === publicId) {
        return { ...existing };
      }
    }

    const conversationToken = `ctok_${crypto.randomBytes(24).toString('hex')}`;
    const visitorId = `vis_${crypto.randomBytes(8).toString('hex')}`;
    const session = {
      id: `conv_pub_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`,
      conversationToken,
      publicId,
      workspaceId,
      visitorId,
      channel: 'website_widget',
      mode: 'agent', // Prepared for Phase 5 Human Takeover
      messages: [],
      turnCount: 0,
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    this.conversations.set(conversationToken, session);
    this.save();
    return { ...session };
  }

  getSession(conversationToken) {
    if (!conversationToken || typeof conversationToken !== 'string') return null;
    const session = this.conversations.get(conversationToken);
    if (!session) return null;
    return { ...session };
  }

  addTurn(conversationToken, userText, assistantText) {
    const session = this.conversations.get(conversationToken);
    if (!session) return null;

    const timestamp = Date.now();
    session.messages.push({
      role: 'user',
      content: userText,
      timestamp
    });

    if (assistantText) {
      session.messages.push({
        role: 'assistant',
        content: assistantText,
        timestamp: timestamp + 1
      });
    }

    session.turnCount = Math.floor(session.messages.length / 2);
    session.updatedAt = Date.now();
    this.save();
    return { ...session };
  }

  getRecentHistory(conversationToken, maxTurns = 6) {
    const session = this.conversations.get(conversationToken);
    if (!session || !Array.isArray(session.messages)) return [];
    return session.messages.slice(-maxTurns * 2);
  }

  listSessionsForTenant(publicId, limit = 50) {
    return Array.from(this.conversations.values())
      .filter(c => c.publicId === publicId)
      .sort((a, b) => b.updatedAt - a.updatedAt)
      .slice(0, limit);
  }
}

let sharedConversationManager = null;
export function getSharedVisitorConversationManager() {
  if (!sharedConversationManager) {
    sharedConversationManager = new MesniumVisitorConversationManager();
  }
  return sharedConversationManager;
}
