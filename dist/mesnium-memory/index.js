/**
 * MESNIUM PERSISTENT MEMORY & BOUNDED SELF-IMPROVEMENT ENGINE (V1 PRODUCTIZATION)
 * 
 * Manages long-term business preferences, working style, and non-security self-improvement insights.
 * 
 * Security Boundary:
 * - Read-only contextual grounding for the assistant.
 * - STRICTLY CANNOT alter system permissions, change security boundaries, or grant folder access.
 */

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const MEMORY_FILE_PATH = path.join(os.homedir(), '.openclaw', 'mesnium_memory.json');

export class MesniumMemoryManager {
  constructor(filePath = MEMORY_FILE_PATH) {
    this.filePath = filePath;
    this._ensureStore();
  }

  _ensureStore() {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      if (!fs.existsSync(this.filePath)) {
        const defaultData = {
          version: '1.0.0',
          memories: [
            {
              id: 'mem_pref_1',
              category: 'working_style',
              key: 'Executive Briefing Format',
              value: 'Prefers concise, high-level summaries with bullet points and clear next actions.',
              source: 'user_preference',
              createdAt: Date.now(),
              updatedAt: Date.now()
            },
            {
              id: 'mem_pref_2',
              category: 'tone',
              key: 'Tone of Voice',
              value: 'Professional, executive, confident, direct, and business-focused.',
              source: 'user_preference',
              createdAt: Date.now(),
              updatedAt: Date.now()
            }
          ],
          optimizations: []
        };
        fs.writeFileSync(this.filePath, JSON.stringify(defaultData, null, 2), 'utf8');
      }
    } catch (_) {}
  }

  _readData() {
    try {
      if (fs.existsSync(this.filePath)) {
        return JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
      }
    } catch (_) {}
    return { version: '1.0.0', memories: [], optimizations: [] };
  }

  _writeData(data) {
    try {
      fs.writeFileSync(this.filePath, JSON.stringify(data, null, 2), 'utf8');
      return true;
    } catch (e) {
      console.error('[MesniumMemory] Write error:', e);
      return false;
    }
  }

  listMemories(category = null) {
    const data = this._readData();
    let list = data.memories || [];
    if (category) {
      list = list.filter(m => m.category === category);
    }
    return list;
  }

  addMemory(item) {
    if (!item || !item.key || !item.value) {
      throw new Error('Memory requires both a key and value.');
    }

    // Safety boundary: prevent injection of fake permission grants into memory
    const forbiddenPatterns = [/grant.*permission/i, /authorize.*folder/i, /disable.*approval/i, /bypass.*security/i];
    if (forbiddenPatterns.some(p => p.test(item.key) || p.test(item.value))) {
      throw new Error('Memory cannot be used to modify security permissions or approval policies.');
    }

    const data = this._readData();
    const id = item.id || `mem_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
    const newMemory = {
      id,
      category: item.category || 'general',
      key: String(item.key).trim(),
      value: String(item.value).trim(),
      source: item.source || 'user',
      createdAt: Date.now(),
      updatedAt: Date.now()
    };

    data.memories = (data.memories || []).filter(m => m.id !== id && m.key !== newMemory.key);
    data.memories.unshift(newMemory);
    this._writeData(data);
    return newMemory;
  }

  deleteMemory(id) {
    const data = this._readData();
    const beforeCount = (data.memories || []).length;
    data.memories = (data.memories || []).filter(m => m.id !== id);
    this._writeData(data);
    return { ok: true, deleted: beforeCount > data.memories.length };
  }

  clearMemories() {
    const data = this._readData();
    data.memories = [];
    this._writeData(data);
    return { ok: true, cleared: true };
  }

  getMemoryContext() {
    const memories = this.listMemories();
    if (memories.length === 0) return '';
    const lines = memories.map(m => `- ${m.key}: ${m.value}`);
    return `[User Preferences & Working Style]\n${lines.join('\n')}`;
  }
}

let sharedMemory = null;
export function getSharedMemoryManager() {
  if (!sharedMemory) {
    sharedMemory = new MesniumMemoryManager();
  }
  return sharedMemory;
}
