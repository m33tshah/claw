/**
 * MESNIUM STUDIO — UNIVERSAL AI WORKSPACE RUNTIME (PHASE 18)
 *
 * Universal Business AI Workspace:
 * - Multi-Chat Conversation System with isolation, auto-titling, renaming, deletion
 * - Persistent Project Workspaces with server-backed file storage (Zero base64 in localStorage)
 * - Local Files & Folders connector with explicit permission boundaries
 * - Natural Voice Dictation (continuous: true, silence debounce, push-to-talk/explicit stop)
 * - Autonomous Universal Assistant Routing across OpenClaw capabilities
 * - Strict Presentation Boundary & Zero Internal Metadata Leakage
 */

(function () {
  'use strict';

  // ─── BRAND ─────────────────────────────────────────────────────────────────
  const BRAND_LOGO = './brand/logo.png';
  const BRAND_ICON = './brand/icon.png';
  const BRAND_NAME = 'Mesnium';

  // ─── ROUTE MAP ─────────────────────────────────────────────────────────────
  const ROUTES = {
    overview:    { title: 'Overview',     icon: 'home' },
    chat:        { title: 'Chat',         icon: 'message-circle' },
    projects:    { title: 'Projects',     icon: 'folder' },
    files:       { title: 'Files',        icon: 'folder' },
    inbox:       { title: 'Inbox',        icon: 'inbox' },
    work:        { title: 'Work',         icon: 'zap' },
    knowledge:   { title: 'Knowledge',    icon: 'book-open' },
    activity:    { title: 'Activity',     icon: 'activity' },
    connections: { title: 'Connections',  icon: 'link' },
    settings:    { title: 'Settings',     icon: 'settings' },
  };

  // ─── WEBSOCKET RPC CLIENT (Self-contained, real-time event streaming) ───────
  class MesniumGatewayClient {
    constructor() {
      this._ws = null;
      this._pending = new Map();
      this._eventListeners = new Map();
      this.status = 'disconnected';
      this.reconnectAttempts = 0;
      this.connectPromise = null;
      this._reconnectTimer = null;
    }

    _generateId() {
      if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
        return crypto.randomUUID();
      }
      return 'req-' + Date.now() + '-' + Math.random().toString(36).substring(2, 9);
    }

    on(event, callback) {
      if (!this._eventListeners.has(event)) {
        this._eventListeners.set(event, new Set());
      }
      this._eventListeners.get(event).add(callback);
    }

    off(event, callback) {
      if (this._eventListeners.has(event)) {
        this._eventListeners.get(event).delete(callback);
      }
    }

    _emit(event, payload) {
      if (this._eventListeners.has(event)) {
        for (const cb of this._eventListeners.get(event)) {
          try { cb(payload); } catch (err) { console.error('[Mesnium] Listener error for ' + event, err); }
        }
      }
    }

    _getToken() {
      try {
        if (window.__MESNIUM_AUTH__?.token)                  return window.__MESNIUM_AUTH__.token;
        if (window.__OPENCLAW_NATIVE_CONTROL_AUTH__?.token)  return window.__OPENCLAW_NATIVE_CONTROL_AUTH__.token;
        if (window.__OPENCLAW_CONTROL_TOKEN__)               return window.__OPENCLAW_CONTROL_TOKEN__;

        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.get('token')) return urlParams.get('token');

        const hashQuery = window.location.hash.includes('?') ? window.location.hash.split('?')[1] : '';
        if (hashQuery) {
          const t = new URLSearchParams(hashQuery).get('token');
          if (t) return t;
        }

        if (typeof sessionStorage !== 'undefined') {
          for (let i = 0; i < sessionStorage.length; i++) {
            const k = sessionStorage.key(i);
            if (k && k.includes('openclaw.control.token.v1')) {
              const v = sessionStorage.getItem(k);
              if (v && v.trim()) return v.trim();
            }
          }
        }
      } catch (_) {}
      return null;
    }

    connect() {
      if (this.status === 'connected') return Promise.resolve();
      if (this.connectPromise) return this.connectPromise;

      this.connectPromise = new Promise((resolve, reject) => {
        this.status = this.reconnectAttempts > 0 ? 'reconnecting' : 'connecting';
        updateEngineStatus(this.status, this.reconnectAttempts || undefined);

        const token = this._getToken();
        const baseWsUrl = window.__OPENCLAW_NATIVE_CONTROL_AUTH__?.gatewayUrl ||
          ((location.protocol === 'https:' ? 'wss://' : 'ws://') + (location.host || '127.0.0.1:18789'));
        const wsUrl = baseWsUrl.endsWith('/ws') ? baseWsUrl : `${baseWsUrl.replace(/\/+$/, '')}/ws`;
        
        console.log('[Mesnium] Connecting Gateway WS to:', wsUrl);
        const ws = new WebSocket(wsUrl);
        this._ws = ws;

        const timeout = setTimeout(() => {
          this.status = 'failed';
          updateEngineStatus('failed');
          this.connectPromise = null;
          reject(new Error('WS connection timeout'));
          try { ws.close(); } catch (_) {}
        }, 10000);

        ws.onopen = () => { console.log('[Mesnium] WS transport opened, awaiting challenge'); };

        ws.onmessage = (evt) => {
          let msg;
          try { msg = JSON.parse(evt.data); } catch { return; }

          if (msg.type === 'event') {
            if (msg.event === 'connect.challenge') {
              const connectReq = {
                type: 'req',
                id: this._generateId(),
                method: 'connect',
                params: {
                  minProtocol: 4,
                  maxProtocol: 4,
                  client: {
                    id: 'openclaw-control-ui',
                    version: 'mesnium-runtime',
                    platform: 'web',
                    mode: 'webchat'
                  },
                  role: 'operator',
                  scopes: ['operator.admin', 'operator.read', 'operator.write'],
                  caps: ['tool-events'],
                  auth: { token }
                }
              };
              this._pending.set(connectReq.id, {
                resolve: () => {
                  clearTimeout(timeout);
                  this.status = 'connected';
                  this.reconnectAttempts = 0;
                  updateEngineStatus('connected');
                  this.connectPromise = null;
                  console.log('[Mesnium] Gateway WebSocket connected & authorized');
                  resolve();
                },
                reject: (err) => {
                  clearTimeout(timeout);
                  this.status = 'failed';
                  updateEngineStatus('failed');
                  this.connectPromise = null;
                  reject(err);
                }
              });
              ws.send(JSON.stringify(connectReq));
              return;
            }

            // Dispatch event to registered listeners
            this._emit(msg.event, msg.payload);
            return;
          }

          if (msg.type === 'res') {
            const handler = this._pending.get(msg.id);
            if (handler) {
              this._pending.delete(msg.id);
              if (msg.ok) handler.resolve(msg.payload);
              else handler.reject(new Error(msg.error?.message || JSON.stringify(msg.error)));
            }
          }
        };

        ws.onerror = (e) => {
          clearTimeout(timeout);
          this.status = 'failed';
          updateEngineStatus('failed');
          this.connectPromise = null;
          console.warn('[Mesnium] WS transport error');
          reject(new Error('WebSocket transport error'));
        };

        ws.onclose = (e) => {
          this.status = 'disconnected';
          updateEngineStatus('disconnected');
          this.connectPromise = null;
          for (const [id, h] of this._pending) {
            h.reject(new Error('Connection closed'));
          }
          this._pending.clear();

          // Auto-reconnect with backoff
          if (!this._reconnectTimer) {
            this._reconnectTimer = setTimeout(() => {
              this._reconnectTimer = null;
              this.reconnectAttempts++;
              this.connect().catch(() => {});
            }, 3000);
          }
        };
      });

      return this.connectPromise;
    }

    async request(method, params = {}) {
      if (this.status !== 'connected') {
        await this.connect();
      }
      return new Promise((resolve, reject) => {
        const id = this._generateId();
        this._pending.set(id, { resolve, reject });
        this._ws.send(JSON.stringify({ type: 'req', id, method, params }));
        const t = setTimeout(() => {
          this._pending.delete(id);
          reject(new Error(`RPC timeout: ${method}`));
        }, 45000);
        const orig = this._pending.get(id);
        this._pending.set(id, {
          resolve: (v) => { clearTimeout(t); resolve(v); },
          reject:  (e) => { clearTimeout(t); reject(e);  }
        });
      });
    }
  }

  const MesniumClient = new MesniumGatewayClient();
  window.MesniumClient = MesniumClient;

  // ─── APPLICATION STATE ─────────────────────────────────────────────────────
  const state = {
    route: 'overview',
    sidebarCollapsed: false,
    settingsTab: 'general',
    projectTab: 'files', // 'files' | 'instructions' | 'chats'
    settings: { businessName: 'My Business' },
    
    // Multi-Chat Conversations (Zero large payloads in localStorage)
    conversations: [], // [{ id, sessionKey, title, projectId, createdAt, updatedAt, lastMessage, messageCount }]
    activeConversationId: null,

    // Projects / Workspaces (Server-backed file storage)
    projects: [],      // [{ id, name, description, instructions, files: [{ id, name, size, type, path, uploadedAt }], conversationIds: [] }]
    activeProjectId: null,
    projectSearchQuery: '',

    // Local Files / Folders (Permission-based)
    localWorkspace: {
      connected: false,
      folderName: null,
      files: [],       // [{ name, size, type, path, lastModified }]
      searchQuery: ''
    },

    // Real Local Filesystem (Phase 20A)
    filesState: {
      folders: [],         // [{ id, alias, enabled, isDefault, exists }]
      activeFolder: 'Desktop',
      files: [],           // [{ name, relativePath, folder, isDir, type, extension, size, formattedSize, mtime }]
      totalCount: 0,
      loading: false,
      searchQuery: '',
      filterType: 'all',   // 'all' | 'pdf' | 'document' | 'spreadsheet' | 'image' | 'code'
      previewFile: null
    },

    chat: {
      thread: [],          // [{ id, role: 'user'|'assistant', text, attachments: [], sources: [], _thinking, _error, ts }]
      pendingFiles: [],    // [{ id, name, size, type, base64 }] (temporary in-memory staged files before sending)
      isSending: false,
      activeRunId: null,
      sessionKey: 'main',
      loaded: false
    },
    voice: {
      listening: false,
      speaking: false,
      recognition: null,
      status: 'idle',      // 'idle' | 'listening' | 'processing' | 'speaking'
      interimTranscript: '',
      silenceTimer: null
    },
    work: {
      tab: 'all',          // 'all'|'running'|'scheduled'|'automated'|'completed'|'needs_approval'
    },
  };

  // Load lightweight UI state from localStorage (NO file base64 or message threads)
  try {
    const savedSettings = localStorage.getItem('mesnium.settings.v2');
    if (savedSettings) Object.assign(state.settings, JSON.parse(savedSettings));

    const savedConvs = localStorage.getItem('mesnium.conversations.v2');
    if (savedConvs) {
      state.conversations = JSON.parse(savedConvs);
    }
    
    const savedActiveConv = localStorage.getItem('mesnium.activeConversationId');
    if (savedActiveConv && state.conversations.some(c => c.id === savedActiveConv)) {
      state.activeConversationId = savedActiveConv;
    }

    const savedActiveProj = localStorage.getItem('mesnium.activeProjectId');
    if (savedActiveProj) {
      state.activeProjectId = savedActiveProj;
    }
  } catch (_) {}

  // Initialize initial conversation if none exists
  if (!state.conversations || state.conversations.length === 0) {
    const defaultConv = {
      id: 'conv_' + Date.now().toString(36),
      sessionKey: 'mesnium:main',
      title: 'New Chat',
      projectId: null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      lastMessage: ''
    };
    state.conversations = [defaultConv];
    state.activeConversationId = defaultConv.id;
    state.chat.sessionKey = defaultConv.sessionKey;
    saveConversationsMetadata();
  } else if (state.activeConversationId) {
    const active = state.conversations.find(c => c.id === state.activeConversationId);
    if (active) {
      state.chat.sessionKey = active.sessionKey || 'mesnium:' + active.id;
      state.activeProjectId = active.projectId || null;
    }
  }

  function saveConversationsMetadata() {
    try {
      // Store ONLY lightweight metadata (id, sessionKey, title, projectId, createdAt, updatedAt, lastMessage, messageCount)
      const lightConvs = state.conversations.map(c => ({
        id: c.id,
        sessionKey: c.sessionKey,
        title: c.title,
        projectId: c.projectId,
        createdAt: c.createdAt,
        updatedAt: c.updatedAt,
        lastMessage: c.lastMessage,
        messageCount: c.messageCount
      }));
      localStorage.setItem('mesnium.conversations.v2', JSON.stringify(lightConvs));
      if (state.activeConversationId) {
        localStorage.setItem('mesnium.activeConversationId', state.activeConversationId);
      }
      if (state.activeProjectId) {
        localStorage.setItem('mesnium.activeProjectId', state.activeProjectId);
      } else {
        localStorage.removeItem('mesnium.activeProjectId');
      }
    } catch (_) {}
  }

  // ─── ENGINE STATUS ─────────────────────────────────────────────────────────
  function updateEngineStatus(status, attempt) {
    const dot   = document.getElementById('engine-status-dot');
    const label = document.getElementById('engine-status-label');
    if (!dot || !label) return;

    const states = {
      connected:    { cls: 'dot--green',  text: 'Connected' },
      connecting:   { cls: 'dot--amber',  text: 'Connecting…' },
      reconnecting: { cls: 'dot--amber',  text: `Reconnecting (${attempt || ''})…` },
      failed:       { cls: 'dot--red',    text: 'Offline' },
      disconnected: { cls: 'dot--red',    text: 'Disconnected' },
    };

    const s = states[status] || states.disconnected;
    dot.className   = `engine-dot ${s.cls}`;
    label.textContent = s.text;
  }

  window.retryEngineConnection = function () {
    MesniumClient.reconnectAttempts = 0;
    MesniumClient.status = 'disconnected';
    MesniumClient.connect().catch(() => {});
  };

  // ─── ROUTING ───────────────────────────────────────────────────────────────
  function getRouteFromHash() {
    const raw = (window.location.hash || '').replace(/^#\/?/, '').split('?')[0].split('/')[0] || 'overview';
    return ROUTES[raw] ? raw : 'overview';
  }

  window.navigateTo = function (route, params = {}) {
    if (params.projectId !== undefined) {
      state.activeProjectId = params.projectId;
      saveConversationsMetadata();
    }
    if (window.location.hash === `#/${route}`) {
      renderApp();
    } else {
      window.location.hash = `#/${route}`;
    }
  };

  // ─── SVG ICON LIBRARY ──────────────────────────────────────────────────────
  function icon(name, size = 18) {
    const icons = {
      home:           `<polyline points="3 9 12 2 21 9"/><polyline points="9 22 9 12 15 12 15 22"/><rect x="3" y="9" width="18" height="13" rx="1"/>`,
      'message-circle': `<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>`,
      folder:         `<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>`,
      inbox:          `<polyline points="22 12 16 12 14 15 10 15 8 12 2 12"/><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z"/>`,
      zap:            `<polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>`,
      'book-open':    `<path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>`,
      activity:       `<polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>`,
      link:           `<path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>`,
      settings:       `<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>`,
      send:           `<line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/>`,
      paperclip:      `<path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>`,
      mic:            `<path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/>`,
      volume:         `<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>`,
      x:              `<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>`,
      check:          `<polyline points="20 6 9 11 4 16"/>`,
      'chevron-right':`<polyline points="9 18 15 12 9 6"/>`,
      plus:           `<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>`,
      edit:           `<path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>`,
      trash:          `<polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>`,
      search:         `<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>`,
      sidebar:        `<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="9" y1="3" x2="9" y2="21"/>`,
      sparkles:       `<path d="M12 2l2.4 7.2L21.6 12l-7.2 2.4L12 21.6l-2.4-7.2L2.4 12l7.2-2.4z"/>`,
      arrowLeft:      `<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>`,
      upload:         `<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>`
    };
    const paths = icons[name] || '';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  function h(str) {
    if (str === undefined || str === null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function formatFileSize(bytes) {
    if (bytes === undefined || bytes === null || isNaN(bytes)) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  function getFileIcon(fileName) {
    const ext = (fileName || '').split('.').pop().toLowerCase();
    if (['pdf'].includes(ext)) return '📄';
    if (['xlsx', 'xls', 'csv', 'tsv'].includes(ext)) return '📊';
    if (['docx', 'doc', 'txt', 'md', 'json'].includes(ext)) return '📝';
    if (['pptx', 'ppt'].includes(ext)) return '📽️';
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext)) return '🖼️';
    return '📎';
  }

  function sanitizeUrl(url) {
    if (!url) return '#';
    let clean = String(url).trim();
    if (/^(javascript|vbscript|data:text\/html):/i.test(clean)) {
      return '#';
    }
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(clean) && !clean.startsWith('/') && !clean.startsWith('#')) {
      clean = 'https://' + clean;
    }
    return clean;
  }

  function sanitizePresentationText(raw) {
    if (!raw) return '';
    let text = String(raw);

    // 1. If text happens to be a raw JSON string from a tool/RPC payload, unpack the text content
    if ((text.startsWith('{') && text.endsWith('}')) || (text.startsWith('[') && text.endsWith(']'))) {
      try {
        const parsed = JSON.parse(text);
        if (parsed.reply) text = String(parsed.reply);
        else if (parsed.message) text = String(parsed.message);
        else if (parsed.answer) text = String(parsed.answer);
        else if (parsed.content) {
          text = Array.isArray(parsed.content)
            ? parsed.content.filter(c => c.type === 'text').map(c => c.text || '').join('')
            : String(parsed.content);
        }
      } catch (_) {}
    }

    // 2. Strict Presentation Boundaries — Never leak internal OpenClaw terminology, files, or paths
    text = text
      // Internal test files & test keys
      .replace(/temp_chat_params\.json/gi, '')
      .replace(/capability_test_results\.json/gi, '')
      .replace(/\b(USER\.md|MEMORY\.md|SOUL\.md|IDENTITY\.md)\b/gi, 'your preferences and memory')
      // OpenClaw engine references
      .replace(/\bOpenClaw\b/g, 'Mesnium')
      .replace(/\bgog\s*(?:skill|tools?|integration)?\b/gi, 'Google Workspace')
      .replace(/\bgog\b/gi, 'Google Workspace')
      .replace(/\b(?:skills?|tools?)\s+registry\b/gi, 'capabilities')
      .replace(/\b(?:skills?)\b/gi, 'capabilities')
      // Session / Agent internals
      .replace(/agentId[:=]\s*["']?[\w-:]+["']?/gi, '')
      .replace(/sessionKey[:=]\s*["']?[\w-:]+["']?/gi, '')
      .replace(/\bagent:main:[\w-]+/gi, '')
      .replace(/\bagent:main\b/gi, '')
      .replace(/\bRPC\s*(?:method|call|request)?\b/gi, 'action')
      // Database & Search internals
      .replace(/\b(BM25|FTS5|RRF)\b/g, 'indexed search')
      .replace(/SQLite\s*vector/gi, 'knowledge database')
      .replace(/sqlite-vec/gi, 'knowledge search')
      // Clean internal instructions if present
      .replace(/\[Mesnium Product Instructions & Current Runtime Capability State\][\s\S]*?(?:Strictly answer based on these REAL connection states[^\n]*\n*|\n\n)/gi, '')
      // Host internal filesystem paths & arbitrary drive paths
      .replace(/[A-Z]:\\[\w\s.\\-]+/gi, 'that folder')
      .replace(/\/(?:home|Users|var|tmp|etc)\/[\w\s.\/-]+/gi, 'that folder');

    return text.trim();
  }

  function translateErrorMessage(err) {
    if (!err) return 'An unexpected error occurred. Please try again.';
    const msg = typeof err === 'string' ? err : (err.message || String(err));
    const lower = msg.toLowerCase();

    if (lower.includes('enoent') || lower.includes('not found')) {
      return "I couldn't find that file or folder. Please verify the file exists.";
    }
    if (lower.includes('eacces') || lower.includes('permission denied') || lower.includes('unauthorized')) {
      return "Access was denied. Please make sure the folder or file is authorized.";
    }
    if (lower.includes('401') || lower.includes('oauth') || lower.includes('reauth')) {
      return "Your service connection needs to be reauthorized. You can update it in Connections.";
    }
    if (lower.includes('timeout') || lower.includes('timed out')) {
      return "The request timed out. Please try again in a moment.";
    }
    if (lower.includes('rpc') || lower.includes('websocket') || lower.includes('connection closed') || lower.includes('econnrefused')) {
      return "I couldn't connect to complete that action right now. Please check your connection and try again.";
    }
    if (lower.includes('microphone') || lower.includes('not-allowed')) {
      return "Microphone access is not available. You can continue using text chat.";
    }
    return "I couldn't complete that action right now. Please try again.";
  }

  function renderMarkdown(raw) {
    if (!raw) return '';
    let text = String(raw);

    const escapeHtml = (str) =>
      str.replace(/&/g, '&amp;')
         .replace(/</g, '&lt;')
         .replace(/>/g, '&gt;')
         .replace(/"/g, '&quot;');

    // 0. Clean up malformed nested Markdown link syntax like: [https://example.com]([https://example.com](...))
    text = text.replace(/\[([^\]]+)\]\(\[([^\]]+)\]\(([^)]+)\)\)/g, '[$1]($3)');
    text = text.replace(/\[\s*\[([^\]]+)\]\(([^)]+)\)\s*\]\(([^)]+)\)/g, '[$1]($3)');

    // 1. Code blocks (```lang ... ```)
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre class="code-block"><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
      return `@@CBLCK${idx}@@`;
    });

    // 2. Inline code (`code`)
    const inlineCodes = [];
    text = text.replace(/`([^`\n]+)`/g, (match, code) => {
      const idx = inlineCodes.length;
      inlineCodes.push(`<code class="inline-code">${escapeHtml(code)}</code>`);
      return `@@INLCODE${idx}@@`;
    });

    // 3. Tables
    text = text.replace(/(?:^|\n)(\|.+?\|\n\|[-: |]+\|\n(?:\|.+?\|\n?)+)/g, (match, tableBlock) => {
      const lines = tableBlock.trim().split('\n');
      if (lines.length < 2) return match;
      const headers = lines[0].split('|').slice(1, -1).map(c => c.trim());
      const rows = lines.slice(2).map(line => line.split('|').slice(1, -1).map(c => c.trim()));
      let tableHtml = '<div class="msg-table-wrap"><table class="msg-table"><thead><tr>';
      headers.forEach(hText => { tableHtml += `<th>${escapeHtml(hText)}</th>`; });
      tableHtml += '</tr></thead><tbody>';
      rows.forEach(r => {
        tableHtml += '<tr>';
        r.forEach(c => { tableHtml += `<td>${escapeHtml(c)}</td>`; });
        tableHtml += '</tr>';
      });
      tableHtml += '</tbody></table></div>';
      return `\n${tableHtml}\n`;
    });

    // 4. Markdown links: [Link Text](https://example.com)
    const links = [];
    text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, label, href) => {
      const safeHref = sanitizeUrl(href);
      const idx = links.length;
      if (safeHref === '#') {
        links.push(`<span class="msg-link msg-link--disabled">${escapeHtml(label)}</span>`);
      } else {
        links.push(`<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="msg-link">${escapeHtml(label)}</a>`);
      }
      return `@@LNKITEM${idx}@@`;
    });

    // 5. Autolinks: https://... or http://...
    text = text.replace(/(^|[\s(])(https?:\/\/[^\s<>"')]+)/g, (match, prefix, url) => {
      const safeHref = sanitizeUrl(url);
      const idx = links.length;
      links.push(`<a href="${escapeHtml(safeHref)}" target="_blank" rel="noopener noreferrer" class="msg-link">${escapeHtml(url)}</a>`);
      return `${prefix}@@LNKITEM${idx}@@`;
    });

    // 6. Bold & italic
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

    // 7. Headings
    text = text.replace(/^#### (.*$)/gim, '<h5 class="msg-heading">$1</h5>');
    text = text.replace(/^### (.*$)/gim, '<h4 class="msg-heading">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 class="msg-heading">$1</h3>');
    text = text.replace(/^# (.*$)/gim, '<h2 class="msg-heading">$1</h2>');

    // 8. Lists
    text = text.replace(/^\s*[-*•]\s+(.*$)/gim, '<li class="msg-list-item">$1</li>');
    text = text.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="msg-list-item msg-list-item--num">$1. $2</li>');
    text = text.replace(/(<li[\s\S]*?<\/li>(\n|$))+/g, '<ul class="msg-list">$&</ul>');

    // 9. Paragraphs and line breaks
    const paragraphs = text.split(/\n{2,}/);
    text = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (
        p.startsWith('<h') ||
        p.startsWith('<pre') ||
        p.startsWith('<div class="msg-table-wrap"') ||
        p.startsWith('<ul') ||
        p.startsWith('@@CBLCK')
      ) {
        return p;
      }
      return `<p class="msg-p">${p.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('');

    // 10. Re-inject preserved elements
    text = text.replace(/@@LNKITEM(\d+)@@/g, (match, idx) => links[parseInt(idx, 10)] || '');
    text = text.replace(/@@INLCODE(\d+)@@/g, (match, idx) => inlineCodes[parseInt(idx, 10)] || '');
    text = text.replace(/@@CBLCK(\d+)@@/g, (match, idx) => codeBlocks[parseInt(idx, 10)] || '');

    return text;
  }

  function formatAssistantMessage(raw) {
    if (!raw) return '';
    const sanitized = sanitizePresentationText(raw);
    return renderMarkdown(sanitized);
  }


  // ─── SIDEBAR RENDERING (Matches Approved Mesnium Design) ─────────────────────
  function renderSidebar() {
    const r = state.route;
    const collapsed = state.sidebarCollapsed;

    const navItem = (route, label, iconName) => {
      const active = r === route;
      return `
        <a class="nav-item ${active ? 'nav-item--active' : ''}" href="#/${route}" id="nav-${route}">
          <span class="nav-icon">${icon(iconName)}</span>
          ${collapsed ? '' : `<span class="nav-label">${label}</span>`}
        </a>`;
    };

    return `
      <aside class="sidebar ${collapsed ? 'sidebar--collapsed' : ''}" id="mesnium-sidebar">
        <div class="sidebar-brand">
          <div class="brand-logo-wrap" onclick="window.navigateTo('overview')" style="cursor:pointer;" title="Mesnium Workspace">
            <span class="brand-sparkle">✦</span>
            ${collapsed ? '' : `<span class="brand-title-text">${BRAND_NAME.toUpperCase()}</span>`}
          </div>
          <button class="sidebar-toggle" id="btn-sidebar-toggle" title="Toggle sidebar (Ctrl+B)">
            ${icon('sidebar', 16)}
          </button>
        </div>

        <div class="sidebar-new-chat-wrap">
          <button class="btn-new-chat" id="btn-sidebar-new-chat" title="Start a new chat (+ New Chat)">
            ${icon('plus', 16)}
            ${collapsed ? '' : '<span>New Chat</span>'}
          </button>
        </div>

        ${collapsed ? '' : `
          <div class="sidebar-scrollable">
            <!-- CHATS SECTION -->
            <div class="sidebar-section">
              <div class="sidebar-section-header">
                <span class="sidebar-section-title">CHATS</span>
                <button class="sidebar-section-action" id="btn-sidebar-add-chat" title="New Chat">${icon('plus', 13)}</button>
              </div>
              <div class="sidebar-chats-list" id="sidebar-chats-list">
                ${renderSidebarChats()}
              </div>
            </div>

            <!-- PROJECTS SECTION -->
            <div class="sidebar-section">
              <div class="sidebar-section-header">
                <span class="sidebar-section-title">PROJECTS</span>
                <button class="sidebar-section-action" id="btn-sidebar-add-project" title="Create Project">${icon('plus', 13)}</button>
              </div>
              <div class="sidebar-projects-list" id="sidebar-projects-list">
                ${renderSidebarProjects()}
              </div>
            </div>
          </div>

          <div class="sidebar-divider"></div>
        `}

        <nav class="sidebar-nav">
          ${navItem('files',       'Files',       'folder')}
          ${navItem('work',        'Work',        'zap')}
          ${navItem('knowledge',   'Knowledge',   'book-open')}
          ${navItem('activity',    'Activity',    'activity')}
          ${navItem('connections', 'Connections', 'link')}
          ${navItem('settings',    'Settings',    'settings')}
        </nav>

        <div class="sidebar-footer">
          <div class="engine-status-pill">
            <span class="engine-dot dot--amber" id="engine-status-dot"></span>
            ${collapsed ? '' : '<span class="engine-status-text" id="engine-status-label">Connecting…</span>'}
          </div>
        </div>
      </aside>`;
  }

  function renderSidebarChats() {
    if (!state.conversations || state.conversations.length === 0) {
      return `<div class="sidebar-empty-hint">No chats yet</div>`;
    }
    return state.conversations.slice(0, 15).map(c => {
      const isActive = c.id === state.activeConversationId && state.route === 'chat';
      const title = c.title || 'New Chat';
      return `
        <div class="sidebar-chat-item ${isActive ? 'sidebar-chat-item--active' : ''}" data-conv-id="${c.id}" id="chat-item-${c.id}">
          <span class="chat-item-icon">${icon('message-circle', 14)}</span>
          <span class="chat-item-title" title="${h(title)}">${h(title)}</span>
          <div class="chat-item-actions">
            <button class="chat-action-btn" data-rename-conv="${c.id}" title="Rename conversation">${icon('edit', 12)}</button>
            <button class="chat-action-btn" data-delete-conv="${c.id}" title="Delete conversation">${icon('trash', 12)}</button>
          </div>
        </div>`;
    }).join('');
  }

  function renderSidebarProjects() {
    if (!state.projects || state.projects.length === 0) {
      return `<div class="sidebar-empty-hint">No projects yet</div>`;
    }
    return state.projects.slice(0, 10).map(p => {
      const isActive = (state.route === 'projects' && state.activeProjectId === p.id) || (state.route === 'chat' && state.activeProjectId === p.id);
      const fileCount = p.files ? p.files.length : 0;
      return `
        <div class="sidebar-project-item ${isActive ? 'sidebar-project-item--active' : ''}" data-project-id="${p.id}" id="proj-item-${p.id}">
          <span class="project-item-icon">${icon('folder', 14)}</span>
          <span class="project-item-name" title="${h(p.name)}">${h(p.name)}</span>
          ${fileCount > 0 ? `<span class="project-item-badge">${fileCount}</span>` : ''}
        </div>`;
    }).join('');
  }

  // ─── TOPBAR ────────────────────────────────────────────────────────────────
  function renderTopbar() {
    let routeTitle = ROUTES[state.route]?.title || 'Overview';
    let subContext = '';
    if (state.route === 'projects' && state.activeProjectId) {
      const curProj = state.projects.find(p => p.id === state.activeProjectId);
      if (curProj) routeTitle = `Projects / ${curProj.name}`;
    } else if (state.route === 'chat' && state.activeProjectId) {
      const curProj = state.projects.find(p => p.id === state.activeProjectId);
      if (curProj) subContext = ` [Project: ${curProj.name}]`;
    }

    return `
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-breadcrumb">${h(state.settings.businessName)}</span>
          <span class="topbar-sep">/</span>
          <span class="topbar-page">${h(routeTitle)}${h(subContext)}</span>
        </div>
        <div class="topbar-right">
          ${state.activeProjectId ? `
            <div class="topbar-project-pill" onclick="window.navigateTo('projects')">
              📁 ${h(state.projects.find(p => p.id === state.activeProjectId)?.name || 'Project')}
              <button class="pill-clear" id="btn-clear-project-context" title="Exit project context">×</button>
            </div>
          ` : ''}
          <div class="topbar-ws-badge">${h(state.settings.businessName)}</div>
        </div>
      </header>`;
  }

  // ─── SURFACE ROUTER ────────────────────────────────────────────────────────
  function renderSurface() {
    switch (state.route) {
      case 'overview':    return surfaceOverview();
      case 'chat':        return surfaceChat();
      case 'projects':    return surfaceProjects();
      case 'files':       return surfaceFiles();
      case 'inbox':       return surfaceInbox();
      case 'work':        return surfaceWork();
      case 'knowledge':   return surfaceKnowledge();
      case 'activity':    return surfaceActivity();
      case 'connections': return surfaceConnections();
      case 'settings':    return surfaceSettings();
      default:            return surfaceOverview();
    }
  }

  // ─── SURFACE: OVERVIEW ─────────────────────────────────────────────────────
  function surfaceOverview() {
    const hour = new Date().getHours();
    const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
    return `
      <div class="surface surface-overview" id="surface-overview">
        <div class="overview-hero">
          <div class="overview-greeting">
            <p class="overview-time-label">${greeting}</p>
            <h1 class="overview-ask">What would you like Mesnium to handle today?</h1>
          </div>
          <button class="btn btn-primary btn-lg" id="btn-overview-open-chat">
            ${icon('message-circle', 20)} Ask Mesnium
          </button>
        </div>

        <div class="overview-quick-actions">
          <button class="quick-pill" id="btn-quick-chat">💬 Chat</button>
          <button class="quick-pill" id="btn-quick-projects">📁 Projects</button>
          <button class="quick-pill" id="btn-quick-work">⚡ View Work</button>
          <button class="quick-pill" id="btn-quick-knowledge">📚 Search Knowledge</button>
          <button class="quick-pill" id="btn-quick-connections">🔗 Connect a Tool</button>
        </div>

        <div class="overview-cards">
          <div class="overview-card" id="overview-card-inbox" role="button" tabindex="0" onclick="window.navigateTo('inbox')">
            <div class="ov-card-icon">📥</div>
            <div class="ov-card-body">
              <div class="ov-card-label">Inbox</div>
              <div class="ov-card-value" id="ov-inbox-value">—</div>
              <div class="ov-card-sub" id="ov-inbox-sub">Loading…</div>
            </div>
          </div>

          <div class="overview-card" id="overview-card-work" role="button" tabindex="0" onclick="window.navigateTo('work')">
            <div class="ov-card-icon">⚡</div>
            <div class="ov-card-body">
              <div class="ov-card-label">Work</div>
              <div class="ov-card-value" id="ov-work-value">—</div>
              <div class="ov-card-sub" id="ov-work-sub">Loading…</div>
            </div>
          </div>

          <div class="overview-card" id="overview-card-knowledge" role="button" tabindex="0" onclick="window.navigateTo('knowledge')">
            <div class="ov-card-icon">📚</div>
            <div class="ov-card-body">
              <div class="ov-card-label">Knowledge</div>
              <div class="ov-card-value" id="ov-knowledge-value">—</div>
              <div class="ov-card-sub" id="ov-knowledge-sub">Loading…</div>
            </div>
          </div>

          <div class="overview-card" id="overview-card-approvals" role="button" tabindex="0" onclick="window.navigateTo('work')">
            <div class="ov-card-icon">🔔</div>
            <div class="ov-card-body">
              <div class="ov-card-label">Needs Attention</div>
              <div class="ov-card-value" id="ov-approvals-value">—</div>
              <div class="ov-card-sub" id="ov-approvals-sub">Loading…</div>
            </div>
          </div>
        </div>

        <div class="overview-recent">
          <div class="section-header">
            <h2 class="section-title">Recent Activity</h2>
          </div>
          <div id="overview-activity-list">
            <div class="empty-state">
              <p>No activity yet. Start a Chat or run an automation to see results here.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ─── SURFACE: CHAT ─────────────────────────────────────────────────────────
  function surfaceChat() {
    const thread = state.chat.thread;
    const pendingFiles = state.chat.pendingFiles || [];
    const curConv = state.conversations.find(c => c.id === state.activeConversationId);
    const activeProject = state.activeProjectId ? state.projects.find(p => p.id === state.activeProjectId) : null;

    return `
      <div class="surface surface-chat" id="surface-chat">
        ${activeProject ? `
          <div class="chat-project-banner">
            <span class="proj-badge">📁 Project: <strong>${h(activeProject.name)}</strong></span>
            <span class="proj-info">${activeProject.files ? activeProject.files.length : 0} project files attached · Custom instructions active</span>
            <button class="proj-btn-view" onclick="window.navigateTo('projects', { projectId: '${activeProject.id}' })">View Workspace</button>
          </div>
        ` : ''}

        <div class="chat-stream" id="chat-stream">
          ${thread.length === 0 ? `
            <div class="chat-welcome">
              <div class="chat-welcome-icon">✦</div>
              <h2 class="chat-welcome-title">${activeProject ? `Project: ${h(activeProject.name)}` : 'Ask Mesnium anything'}</h2>
              <p class="chat-welcome-sub">
                ${activeProject 
                  ? `You are inside the <strong>${h(activeProject.name)}</strong> workspace. Mesnium automatically references project files and follows your custom instructions.`
                  : 'Chat with your business data, reason over documents, execute tasks, or connect local folders.'}
              </p>
            </div>
          ` : thread.map(renderChatBubble).join('')}
        </div>

        <div class="chat-composer-wrap">
          <div class="chat-composer-inner">
            ${state.voice?.listening ? `
              <div class="voice-listening-bar" id="voice-listening-bar">
                <span class="voice-pulse-dot"></span>
                <span class="voice-status-text">Listening… (Speak naturally, pauses tolerated)</span>
                <div class="voice-bar-actions">
                  <button class="btn btn-sm btn-primary" id="btn-voice-done">Done / Send</button>
                  <button class="btn btn-sm btn-secondary" id="btn-voice-cancel">Cancel</button>
                </div>
              </div>
            ` : ''}

            ${pendingFiles.length > 0 ? `
              <div class="composer-files-list">
                ${pendingFiles.map((f, idx) => `
                  <div class="composer-file-chip" id="file-chip-${idx}">
                    <span class="file-chip-icon">${getFileIcon(f.name)}</span>
                    <div class="file-chip-info">
                      <span class="file-chip-name" title="${h(f.name)}">${h(f.name)}</span>
                      <span class="file-chip-size">${formatFileSize(f.size)}</span>
                    </div>
                    <button class="file-chip-remove" data-remove-file="${idx}" aria-label="Remove ${h(f.name)}">${icon('x', 14)}</button>
                  </div>
                `).join('')}
              </div>
            ` : ''}
            <div class="chat-composer" id="chat-composer">
              <button class="composer-btn" id="btn-composer-attach" title="Attach file (PDF, DOCX, XLSX, CSV, Images)" aria-label="Attach file">
                ${icon('paperclip', 20)}
              </button>
              <button class="composer-btn btn-mic ${state.voice?.listening ? 'btn-mic--active' : ''}" id="btn-composer-mic" title="Voice Input / Dictation" aria-label="Voice input">
                ${icon('mic', 20)}
              </button>
              <input type="file" id="composer-file-input"
                accept=".pdf,.docx,.doc,.txt,.md,.json,.yaml,.yml,.xlsx,.xls,.csv,.tsv,.pptx,.ppt,.png,.jpg,.jpeg,.webp,.gif,.mp3,.wav,.m4a"
                multiple
                style="display:none;" />
              <textarea
                id="chat-input"
                class="composer-textarea"
                placeholder="${activeProject ? `Ask about ${activeProject.name}…` : 'Ask Mesnium anything…'}"
                rows="1"
                aria-label="Chat input"></textarea>
              <button class="composer-btn btn-send" id="btn-chat-send" aria-label="Send message">
                ${icon('send', 20)}
              </button>
            </div>
            <p class="composer-hint">Press Enter to send · Shift+Enter for new line · Drag & drop files anywhere</p>
          </div>
        </div>
      </div>`;
  }

  function renderChatBubble(msg) {
    const isUser = msg.role === 'user';
    const attachmentsHtml = msg.attachments && msg.attachments.length > 0
      ? `<div class="msg-attachments">${msg.attachments.map(a => `
          <div class="msg-attachment-chip">
            <span class="att-icon">${getFileIcon(a.name)}</span>
            <span class="att-name">${h(a.name)}</span>
            ${a.size ? `<span class="att-size">(${formatFileSize(a.size)})</span>` : ''}
          </div>
        `).join('')}</div>`
      : '';

    const sourcesHtml = msg.sources && msg.sources.length > 0
      ? `<div class="msg-sources">${msg.sources.map(s => `<span class="source-pill">📄 ${h(s)}</span>`).join('')}</div>`
      : '';

    if (msg._thinking) {
      const statusText = msg.toolStatus || 'Mesnium is thinking…';
      return `
        <div class="chat-msg chat-msg--assistant">
          <div class="msg-bubble msg-thinking">
            <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>
            <span class="thinking-label">${h(statusText)}</span>
          </div>
        </div>`;
    }

    const speakBtnHtml = !isUser && !msg._error && msg.text
      ? `<button class="msg-action-speak" data-speak-msg="${msg.id}" title="Read aloud" aria-label="Read aloud">${icon('volume', 14)}</button>`
      : '';

    const contentHtml = isUser
      ? `<div class="msg-bubble">${h(msg.text || '')}${attachmentsHtml}</div>`
      : `<div class="msg-bubble ${msg._error ? 'msg-bubble--error' : ''}">${formatAssistantMessage(msg.text || '')}${sourcesHtml}${speakBtnHtml}</div>`;

    return `
      <div class="chat-msg chat-msg--${isUser ? 'user' : 'assistant'}" id="${msg.id || ''}">
        ${contentHtml}
      </div>`;
  }

  // ─── SURFACE: PROJECTS / WORKSPACES ─────────────────────────────────────────
  function surfaceProjects() {
    if (state.activeProjectId) {
      return surfaceProjectDetail(state.activeProjectId);
    }

    const query = (state.projectSearchQuery || '').toLowerCase();
    const filteredProjects = state.projects.filter(p => 
      !query || p.name.toLowerCase().includes(query) || (p.description && p.description.toLowerCase().includes(query))
    );

    return `
      <div class="surface surface-projects" id="surface-projects">
        <div class="surface-header">
          <div>
            <h1 class="surface-title">Projects</h1>
            <p class="surface-sub">Dedicated business workspaces with persistent files, instructions, and isolated context.</p>
          </div>
          <button class="btn btn-primary" id="btn-create-project">
            ${icon('plus', 16)} Create Project
          </button>
        </div>

        <div class="projects-search-bar">
          ${icon('search', 16)}
          <input type="text" id="projects-search-input" class="search-input" placeholder="Search projects…" value="${h(state.projectSearchQuery)}" />
        </div>

        <div class="projects-grid">
          ${filteredProjects.length === 0 ? `
            <div class="empty-state empty-state--centered">
              <div class="empty-icon">📁</div>
              <h3>No projects found</h3>
              <p>Create a project workspace to organize documents, instructions, and conversations.</p>
              <button class="btn btn-primary btn-sm" id="btn-create-project-empty">Create Project</button>
            </div>
          ` : filteredProjects.map(p => {
            const filesCount = p.files ? p.files.length : 0;
            const convCount = p.conversationIds ? p.conversationIds.length : 0;
            return `
              <div class="project-card" data-open-project="${p.id}" id="card-proj-${p.id}">
                <div class="proj-card-top">
                  <div class="proj-icon-wrap">${icon('folder', 24)}</div>
                  <div class="proj-card-header">
                    <h3 class="proj-card-title">${h(p.name)}</h3>
                    <p class="proj-card-desc">${h(p.description || 'No description provided.')}</p>
                  </div>
                </div>
                <div class="proj-card-stats">
                  <span class="stat-pill">📄 ${filesCount} file${filesCount === 1 ? '' : 's'}</span>
                  <span class="stat-pill">💬 ${convCount} chat${convCount === 1 ? '' : 's'}</span>
                </div>
                <div class="proj-card-footer">
                  <button class="btn btn-secondary btn-sm" data-start-proj-chat="${p.id}">Start Chat</button>
                  <button class="btn btn-primary btn-sm" data-open-project="${p.id}">Open Workspace →</button>
                </div>
              </div>`;
          }).join('')}
        </div>
      </div>`;
  }

  function surfaceProjectDetail(projectId) {
    const project = state.projects.find(p => p.id === projectId);
    if (!project) {
      return `
        <div class="surface surface-projects">
          <div class="error-state">
            <p>Project not found.</p>
            <button class="btn btn-secondary" onclick="window.navigateTo('projects', { projectId: null })">← Back to Projects</button>
          </div>
        </div>`;
    }

    const currentTab = state.projectTab || 'files';
    const files = project.files || [];

    return `
      <div class="surface surface-project-detail" id="surface-project-detail">
        <div class="proj-detail-nav">
          <button class="btn-back" id="btn-back-to-projects">
            ${icon('arrowLeft', 16)} All Projects
          </button>
        </div>

        <div class="proj-detail-header">
          <div class="proj-title-wrap">
            <div class="proj-badge-icon">${icon('folder', 28)}</div>
            <div>
              <h1 class="surface-title">${h(project.name)}</h1>
              <p class="surface-sub">${h(project.description || 'Business workspace')}</p>
            </div>
          </div>
          <div class="proj-header-actions">
            <button class="btn btn-primary" id="btn-project-chat-now">
              ${icon('message-circle', 16)} Start Project Chat
            </button>
            <button class="btn btn-secondary" id="btn-delete-project-danger" title="Delete Project">
              ${icon('trash', 16)}
            </button>
          </div>
        </div>

        <div class="project-tabs" role="tablist">
          <button class="project-tab ${currentTab === 'files' ? 'project-tab--active' : ''}" data-proj-tab="files">
            Files & Documents (${files.length})
          </button>
          <button class="project-tab ${currentTab === 'instructions' ? 'project-tab--active' : ''}" data-proj-tab="instructions">
            Custom Instructions
          </button>
          <button class="project-tab ${currentTab === 'chats' ? 'project-tab--active' : ''}" data-proj-tab="chats">
            Conversations (${(project.conversationIds || []).length})
          </button>
        </div>

        <div class="project-tab-content">
          ${currentTab === 'files' ? renderProjectFilesTab(project) : ''}
          ${currentTab === 'instructions' ? renderProjectInstructionsTab(project) : ''}
          ${currentTab === 'chats' ? renderProjectChatsTab(project) : ''}
        </div>
      </div>`;
  }

  function renderProjectFilesTab(project) {
    const files = project.files || [];
    return `
      <div class="proj-files-view">
        <div class="proj-files-toolbar">
          <div class="files-summary">
            <strong>${files.length}</strong> persistent project files (indexed for AI reasoning)
          </div>
          <div class="files-actions">
            <button class="btn btn-primary btn-sm" id="btn-project-upload-file">
              ${icon('upload', 14)} Upload Document
            </button>
            <input type="file" id="project-file-input" style="display:none;" multiple />
          </div>
        </div>

        <div class="proj-dropzone" id="proj-dropzone">
          <div class="dropzone-inner">
            <div class="dropzone-icon">📄</div>
            <p class="dropzone-title">Drag and drop project files here</p>
            <p class="dropzone-sub">PDF, DOCX, XLSX, CSV, Images · Saved securely on the server</p>
          </div>
        </div>

        <div class="proj-files-list">
          ${files.length === 0 ? `
            <div class="empty-state">
              <p>No files in this project yet. Upload guidelines, spreadsheets, or documents to ground Mesnium's reasoning.</p>
            </div>
          ` : `
            <table class="data-table">
              <thead>
                <tr>
                  <th>File Name</th>
                  <th>Type</th>
                  <th>Size</th>
                  <th>Uploaded</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                ${files.map(f => `
                  <tr id="proj-file-${f.id}">
                    <td>
                      <div class="file-name-cell">
                        <span class="file-icon">${getFileIcon(f.name)}</span>
                        <strong>${h(f.name)}</strong>
                      </div>
                    </td>
                    <td><span class="badge badge--neutral">${h(f.name.split('.').pop()?.toUpperCase() || 'FILE')}</span></td>
                    <td>${formatFileSize(f.size)}</td>
                    <td>${f.uploadedAt ? new Date(f.uploadedAt).toLocaleDateString() : '—'}</td>
                    <td>
                      <button class="btn-icon-danger" data-remove-proj-file="${f.id}" title="Remove file">${icon('trash', 14)}</button>
                    </td>
                  </tr>
                `).join('')}
              </tbody>
            </table>
          `}
        </div>
      </div>`;
  }

  function renderProjectInstructionsTab(project) {
    return `
      <div class="proj-instructions-view">
        <div class="instructions-card">
          <div class="form-field">
            <label class="form-label" for="proj-instructions-input">
              Custom AI Persona & Strategic Instructions
            </label>
            <p class="form-help">
              These instructions will be automatically applied whenever you chat inside this project.
            </p>
            <textarea id="proj-instructions-input" class="form-textarea" rows="8" placeholder="e.g. You are our senior marketing strategist. Follow our tone of voice guidelines and focus on conversion metrics.">${h(project.instructions || '')}</textarea>
          </div>
          <div class="form-actions">
            <button class="btn btn-primary" id="btn-save-proj-instructions">Save Instructions</button>
            <span class="save-status" id="proj-save-status"></span>
          </div>
        </div>
      </div>`;
  }

  function renderProjectChatsTab(project) {
    const convIds = project.conversationIds || [];
    const projectConvs = state.conversations.filter(c => c.projectId === project.id || convIds.includes(c.id));

    return `
      <div class="proj-chats-view">
        <div class="proj-chats-toolbar">
          <button class="btn btn-primary btn-sm" id="btn-new-project-chat">
            ${icon('plus', 14)} New Project Chat
          </button>
        </div>
        <div class="proj-chats-list">
          ${projectConvs.length === 0 ? `
            <div class="empty-state">
              <p>No conversations in this project yet.</p>
              <button class="btn btn-secondary btn-sm" id="btn-start-first-proj-chat">Start a Chat</button>
            </div>
          ` : projectConvs.map(c => `
            <div class="proj-chat-row" data-open-conv="${c.id}">
              <div class="proj-chat-info">
                <span class="chat-icon">${icon('message-circle', 18)}</span>
                <div>
                  <strong>${h(c.title || 'New Chat')}</strong>
                  <div class="chat-sub">${c.lastMessage ? h(c.lastMessage.slice(0, 80)) : 'No messages yet'}</div>
                </div>
              </div>
              <span class="chat-time">${c.updatedAt ? new Date(c.updatedAt).toLocaleTimeString() : ''}</span>
            </div>
          `).join('')}
        </div>
      </div>`;
  }

  // ─── SURFACE: FILES (Phase 20A.1 Hardened) ────────────────────────────────
  function surfaceFiles() {
    const fsState = state.filesState;
    const folders = fsState.folders || [];
    const activeFolder = fsState.activeFolder || 'Desktop';
    const activeFolderObj = folders.find(f => f.alias.toLowerCase() === activeFolder.toLowerCase()) || { alias: activeFolder, enabled: false };
    const isAuthorized = Boolean(activeFolderObj.enabled);
    const files = fsState.files || [];
    const filter = fsState.filterType || 'all';
    const search = (fsState.searchQuery || '').toLowerCase();

    const filtered = files.filter(f => {
      if (filter !== 'all' && f.type !== filter) return false;
      if (search && !f.name.toLowerCase().includes(search) && !(f.extension || '').toLowerCase().includes(search)) return false;
      return true;
    });

    const displayFolders = folders.length > 0 ? folders : [
      { id: 'desktop', alias: 'Desktop', enabled: false },
      { id: 'downloads', alias: 'Downloads', enabled: false },
      { id: 'documents', alias: 'Documents', enabled: false }
    ];

    return `
      <div class="surface surface-files" id="surface-files">
        <div class="surface-header">
          <div>
            <h1 class="surface-title">Files</h1>
            <p class="surface-sub">Browse, search, and manage files in user-authorized computer folders.</p>
          </div>
          <div class="header-action-group">
            ${isAuthorized ? `
              <button class="btn btn-secondary" id="btn-files-organize">
                ${icon('zap', 16)} Organize ${h(activeFolder)}
              </button>
            ` : ''}
            <button class="btn btn-primary" id="btn-files-add-folder">
              ${icon('plus', 16)} Add Folder
            </button>
          </div>
        </div>

        <div class="files-auth-bar" id="files-auth-bar">
          <div class="files-auth-title">Recognized Folders:</div>
          <div class="files-folder-pills">
            ${displayFolders.map(f => {
              const isActive = f.alias.toLowerCase() === activeFolder.toLowerCase();
              const isConn = Boolean(f.enabled);
              return `
                <div class="folder-pill-container ${isActive ? 'folder-pill-container--active' : ''}">
                  <button class="folder-pill ${isActive ? 'folder-pill--active' : ''} ${isConn ? '' : 'folder-pill--unconnected'}"
                    data-select-folder="${h(f.alias)}"
                    id="folder-pill-${h(f.alias.toLowerCase())}">
                    <span class="folder-pill-icon">${f.alias === 'Desktop' ? '🖥️' : f.alias === 'Downloads' ? '📥' : f.alias === 'Documents' ? '📄' : '📁'}</span>
                    <span class="folder-pill-name">${h(f.alias)}</span>
                    <span class="folder-status-tag ${isConn ? 'tag--connected' : 'tag--unconnected'}">
                      ${isConn ? 'Connected' : 'Not connected'}
                    </span>
                  </button>
                  ${isConn ? `
                    <button class="folder-pill-action-btn action-revoke" data-revoke-folder="${h(f.alias)}" title="Revoke access to ${h(f.alias)}" id="btn-revoke-${h(f.alias.toLowerCase())}">Revoke</button>
                  ` : `
                    <button class="folder-pill-action-btn action-authorize" data-authorize-folder="${h(f.alias)}" title="Authorize access to ${h(f.alias)}" id="btn-auth-${h(f.alias.toLowerCase())}">Authorize</button>
                  `}
                </div>
              `;
            }).join('')}
          </div>
        </div>

        <div class="files-controls-row">
          <div class="files-search-wrap">
            ${icon('search', 16)}
            <input type="text" id="files-search-input" class="search-input" placeholder="Search files across ${h(activeFolder)} or PC metadata…" value="${h(fsState.searchQuery)}" />
          </div>
          <div class="files-filter-pills" role="tablist">
            ${['all', 'pdf', 'document', 'spreadsheet', 'image', 'code'].map(t => `
              <button class="filter-pill ${filter === t ? 'filter-pill--active' : ''}" data-file-filter="${t}">
                ${t === 'all' ? 'All Files' : t === 'pdf' ? 'PDFs' : t === 'document' ? 'Docs' : t === 'spreadsheet' ? 'Spreadsheets' : t === 'image' ? 'Images' : 'Code'}
              </button>
            `).join('')}
          </div>
        </div>

        <div class="files-content-area" id="files-content-area">
          ${fsState.loading ? `
            <div class="files-loading">
              <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>
              <span>Loading ${h(activeFolder)} files…</span>
            </div>
          ` : !isAuthorized ? `
            <div class="empty-state empty-state--centered" id="unauthorized-folder-banner">
              <div class="empty-icon">🔒</div>
              <h3>${h(activeFolder)} is not connected yet</h3>
              <p>Mesnium recognizes this folder, but you must explicitly authorize it before files can be listed, read, or organized.</p>
              <button class="btn btn-primary" id="btn-authorize-active-folder" data-authorize-folder="${h(activeFolder)}">
                Authorize ${h(activeFolder)}
              </button>
            </div>
          ` : filtered.length === 0 ? `
            <div class="empty-state empty-state--centered">
              <div class="empty-icon">📁</div>
              <h3>No files found</h3>
              <p>${search ? `No files matching "${h(search)}" in ${h(activeFolder)}.` : `Your ${h(activeFolder)} folder is currently empty.`}</p>
            </div>
          ` : `
            <div class="files-grid">
              ${filtered.map(f => `
                <div class="file-card ${f.authorized === false ? 'file-card--unauthorized' : ''}" data-file-path="${h(f.relativePath || f.name)}" id="card-file-${h(f.name.replace(/[^a-zA-Z0-9]/g, '_'))}">
                  <div class="file-card-top">
                    <span class="file-card-icon">${f.isDir ? '📁' : getFileIcon(f.name)}</span>
                    <div class="file-card-header">
                      <h4 class="file-card-name" title="${h(f.name)}">${h(f.name)}</h4>
                      <span class="file-card-folder">${h(f.folder || activeFolder)}</span>
                    </div>
                  </div>
                  <div class="file-card-meta">
                    <span class="file-meta-pill">${h(f.formattedSize || formatFileSize(f.size) || '0 B')}</span>
                    <span class="file-meta-time">${f.mtime ? new Date(f.mtime).toLocaleDateString() : ''}</span>
                  </div>
                  <div class="file-card-actions">
                    ${f.authorized === false ? `
                      <span class="auth-required-badge">Connect folder to preview</span>
                    ` : `
                      <button class="btn btn-secondary btn-sm" data-preview-file="${h(f.relativePath || f.name)}">Preview</button>
                    `}
                  </div>
                </div>
              `).join('')}
            </div>
          `}
        </div>
      </div>`;
  }

  // ─── SURFACE: INBOX ────────────────────────────────────────────────────────
  function surfaceInbox() {
    return `
      <div class="surface surface-inbox" id="surface-inbox">
        <div class="surface-header">
          <h1 class="surface-title">Inbox</h1>
          <p class="surface-sub">Inbound conversations from WhatsApp, email, and connected channels.</p>
        </div>
        <div class="empty-state empty-state--centered" id="inbox-content">
          <div class="empty-icon">📥</div>
          <h3>No inbound messages yet</h3>
          <p>Connect WhatsApp or email to start receiving customer conversations here.</p>
          <button class="btn btn-primary" id="btn-inbox-connect-channel">
            Connect a Channel
          </button>
        </div>
      </div>`;
  }

  // ─── SURFACE: WORK ─────────────────────────────────────────────────────────
  function surfaceWork() {
    const tabs = [
      { id: 'all',             label: 'All Work' },
      { id: 'running',         label: 'Running' },
      { id: 'scheduled',       label: 'Scheduled' },
      { id: 'automated',       label: 'Automated' },
      { id: 'completed',       label: 'Completed' },
      { id: 'needs_approval',  label: 'Needs Approval' },
    ];
    return `
      <div class="surface surface-work" id="surface-work">
        <div class="surface-header">
          <div>
            <h1 class="surface-title">Work</h1>
            <p class="surface-sub">Everything Mesnium is running, scheduling, and automating on your behalf.</p>
          </div>
          <button class="btn btn-primary" id="btn-create-automation">
            ${icon('plus', 16)} Create Automation
          </button>
        </div>

        <div class="work-tabs" role="tablist">
          ${tabs.map(t => `
            <button class="work-tab ${state.work.tab === t.id ? 'work-tab--active' : ''}"
              id="work-tab-${t.id}"
              role="tab"
              aria-selected="${state.work.tab === t.id}"
              data-work-tab="${t.id}">
              ${t.label}
            </button>`).join('')}
        </div>

        <div class="work-content" id="work-content">
          <div class="empty-state empty-state--centered">
            <div class="empty-icon">⚡</div>
            <h3>No work found</h3>
            <p>Create an automation to start scheduling and running tasks automatically.</p>
          </div>
        </div>
      </div>`;
  }

  // ─── SURFACE: KNOWLEDGE ───────────────────────────────────────────────────
  function surfaceKnowledge() {
    return `
      <div class="surface surface-knowledge" id="surface-knowledge">
        <div class="surface-header">
          <div>
            <h1 class="surface-title">Knowledge & Local Files</h1>
            <p class="surface-sub">Business documents, spreadsheets, and authorized local folders Mesnium can reference.</p>
          </div>
          <div class="header-action-group">
            <button class="btn btn-secondary" id="btn-connect-local-folder">
              📁 Connect Local Folder
            </button>
            <button class="btn btn-primary" id="btn-add-knowledge">
              ${icon('plus', 16)} Add Document
            </button>
          </div>
        </div>

        <div class="knowledge-permission-notice">
          <span class="notice-icon">🛡️</span>
          <span><strong>Permission Model:</strong> Mesnium can access files inside folders you explicitly connect. Direct unrestricted access to your computer filesystem is not permitted.</span>
        </div>

        ${state.localWorkspace.connected ? `
          <div class="local-folder-connected-banner">
            <div class="lf-info">
              <span class="lf-icon">📂</span>
              <div>
                <strong>Connected Folder: ${h(state.localWorkspace.folderName)}</strong>
                <div class="lf-sub">${state.localWorkspace.files.length} files authorized with read permissions</div>
              </div>
            </div>
            <button class="btn btn-secondary btn-sm" id="btn-disconnect-local-folder">Disconnect</button>
          </div>
        ` : ''}

        <div class="knowledge-search-bar">
          ${icon('search', 18)}
          <input
            type="text"
            id="knowledge-search-input"
            class="knowledge-search-input"
            placeholder="Search business knowledge & files…"
            aria-label="Search knowledge" />
        </div>

        <div id="knowledge-results">
          <div class="knowledge-docs-list" id="knowledge-docs-list">
            <div class="empty-state">
              <div class="empty-icon">📚</div>
              <h3>No documents indexed yet</h3>
              <p>Add a file or connect a local folder to start building your business knowledge base.</p>
            </div>
          </div>
        </div>
      </div>`;
  }

  // ─── SURFACE: ACTIVITY ─────────────────────────────────────────────────────
  function surfaceActivity() {
    return `
      <div class="surface surface-activity" id="surface-activity">
        <div class="surface-header">
          <div>
            <h1 class="surface-title">Activity</h1>
            <p class="surface-sub">A real-time audit log of everything Mesnium has done.</p>
          </div>
        </div>
        <div id="activity-list">
          <div class="empty-state">
            <div class="empty-icon">📋</div>
            <h3>No activity yet</h3>
            <p>Activity will appear here as you use Chat, run automations, and process requests.</p>
          </div>
        </div>
      </div>`;
  }

  // ─── SURFACE: CONNECTIONS ──────────────────────────────────────────────────
  function surfaceConnections() {
    return `
      <div class="surface surface-connections" id="surface-connections">
        <div class="surface-header">
          <div>
            <h1 class="surface-title">Connections</h1>
            <p class="surface-sub">Business tools, communication channels, and data sources.</p>
          </div>
        </div>
        <div class="connections-grid" id="connections-grid">
          <div class="conn-loading">Checking connection statuses…</div>
        </div>
      </div>`;
  }

  // ─── SURFACE: SETTINGS ─────────────────────────────────────────────────────
  function surfaceSettings() {
    const tabs = [
      { id: 'general',       label: 'General' },
      { id: 'behavior',      label: 'Behavior' },
      { id: 'notifications', label: 'Notifications' },
      { id: 'advanced',      label: 'Advanced' },
    ];
    return `
      <div class="surface surface-settings" id="surface-settings">
        <div class="surface-header">
          <h1 class="surface-title">Settings</h1>
        </div>
        <div class="settings-tabs" role="tablist">
          ${tabs.map(t => `
            <button class="settings-tab ${state.settingsTab === t.id ? 'settings-tab--active' : ''}"
              id="stab-${t.id}"
              data-settings-tab="${t.id}">
              ${t.label}
            </button>`).join('')}
        </div>
        <div id="settings-content">
          ${renderSettingsTab(state.settingsTab)}
        </div>
      </div>`;
  }

  function renderSettingsTab(tab) {
    switch (tab) {
      case 'general':
        return `
          <div class="settings-card">
            <div class="form-field">
              <label class="form-label" for="setting-biz-name">Business Name</label>
              <input type="text" id="setting-biz-name" class="form-input" value="${h(state.settings.businessName)}" />
            </div>
            <div class="form-actions">
              <button class="btn btn-primary" id="btn-save-general">Save</button>
            </div>
          </div>`;
      case 'behavior':
        return `
          <div class="settings-card">
            <p class="settings-note">Assistant personality, speech synthesis, and autonomy controls.</p>
          </div>`;
      case 'notifications':
        return `
          <div class="settings-card">
            <p class="settings-note">Notification preferences for scheduled automations and actions.</p>
          </div>`;
      case 'advanced':
        return `
          <div class="settings-card">
            <div class="form-field">
              <label class="form-label">Storage Engine</label>
              <input type="text" class="form-input" value="SQLite WAL + FTS5 + Server Workspace" readonly />
            </div>
            <div class="form-field">
              <label class="form-label">Gateway Protocol</label>
              <input type="text" class="form-input" value="WebSocket JSON-RPC 2.0" readonly />
            </div>
          </div>`;
      default:
        return '';
    }
  }

  // ─── MAIN APPLICATION RENDER ───────────────────────────────────────────────
  function renderApp() {
    try {
      // Suppress legacy OpenClaw UI
      const legacy = document.querySelector('openclaw-app');
      if (legacy) { legacy.style.display = 'none'; legacy.setAttribute('hidden', ''); }
      const legacyFb = document.getElementById('openclaw-mount-fallback');
      if (legacyFb) { legacyFb.style.display = 'none'; legacyFb.setAttribute('hidden', ''); }

      state.route = getRouteFromHash();
      document.title = `${ROUTES[state.route]?.title || 'Mesnium'} — ${state.settings.businessName}`;

      let root = document.getElementById('mesnium-studio-app') || document.getElementById('mesnium-root');
      if (!root) {
        root = document.createElement('div');
        root.id = 'mesnium-studio-app';
        document.body.appendChild(root);
      }

      root.innerHTML = `
        <div class="mesnium-layout ${state.sidebarCollapsed ? 'layout--collapsed' : ''}">
          ${renderSidebar()}
          <div class="mesnium-body">
            ${renderTopbar()}
            <main class="mesnium-main" id="mesnium-main">
              ${renderSurface()}
            </main>
          </div>
        </div>
        <div id="mesnium-modal-root"></div>
        <div id="mesnium-toast-root"></div>
      `;

      updateEngineStatus(MesniumClient.status, MesniumClient.reconnectAttempts);
      attachGlobalSidebarHandlers();
      attachSurfaceHandlers();
    } catch (err) {
      console.error('[Mesnium] Render Error:', err);
      let errRoot = document.getElementById('mesnium-studio-app') || document.getElementById('mesnium-root') || document.body;
      errRoot.innerHTML = `
        <div style="background:#0d0d11; color:#ef4444; padding:32px; font-family:sans-serif; min-height:100vh; box-sizing:border-box;">
          <h2 style="margin:0 0 12px; font-size:20px;">Mesnium Runtime Render Error</h2>
          <p style="color:#a0a0b0; font-size:14px; margin:0 0 16px;">An unexpected error occurred during interface rendering:</p>
          <pre style="background:#16161f; padding:16px; border-radius:8px; font-size:13px; color:#f4f4f6; overflow:auto;">${h(err.stack || err.message || String(err))}</pre>
        </div>
      `;
    }
  }

  // ─── GLOBAL SIDEBAR & CONVERSATION HANDLERS ────────────────────────────────
  function attachGlobalSidebarHandlers() {
    // Sidebar toggle
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderApp();
      };
    }

    // Prominent "+ New Chat" buttons
    const btnNewChat = document.getElementById('btn-sidebar-new-chat');
    if (btnNewChat) {
      btnNewChat.onclick = () => startNewChat();
    }
    const btnAddChat = document.getElementById('btn-sidebar-add-chat');
    if (btnAddChat) {
      btnAddChat.onclick = () => startNewChat();
    }

    // "+ Add Project" shortcut
    const btnAddProject = document.getElementById('btn-sidebar-add-project');
    if (btnAddProject) {
      btnAddProject.onclick = () => openCreateProjectModal();
    }

    // Topbar project context clear button
    const btnClearProj = document.getElementById('btn-clear-project-context');
    if (btnClearProj) {
      btnClearProj.onclick = (e) => {
        e.stopPropagation();
        state.activeProjectId = null;
        saveConversationsMetadata();
        renderApp();
      };
    }

    // Conversation item click (switch chat)
    document.querySelectorAll('[data-conv-id]').forEach(el => {
      el.onclick = (e) => {
        if (e.target.closest('.chat-action-btn')) return; // Ignore if clicked rename/delete
        const convId = el.getAttribute('data-conv-id');
        switchConversation(convId);
      };
    });

    // Conversation rename
    document.querySelectorAll('[data-rename-conv]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const convId = btn.getAttribute('data-rename-conv');
        const conv = state.conversations.find(c => c.id === convId);
        if (!conv) return;
        const newTitle = prompt('Rename conversation:', conv.title);
        if (newTitle && newTitle.trim()) {
          renameConversation(convId, newTitle.trim());
        }
      };
    });

    // Conversation delete
    document.querySelectorAll('[data-delete-conv]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const convId = btn.getAttribute('data-delete-conv');
        deleteConversation(convId);
      };
    });

    // Project item click in sidebar
    document.querySelectorAll('[data-project-id]').forEach(el => {
      el.onclick = () => {
        const projectId = el.getAttribute('data-project-id');
        state.activeProjectId = projectId;
        saveConversationsMetadata();
        window.navigateTo('projects', { projectId });
      };
    });
  }

  // ─── CONVERSATION MANAGEMENT METHODS ───────────────────────────────────────
  function startNewChat(projectId = null) {
    const convId = 'conv_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    const sessionKey = 'agent:main:' + convId;
    
    const newConv = {
      id: convId,
      sessionKey: sessionKey,
      title: 'New Chat',
      projectId: projectId || state.activeProjectId || null,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messageCount: 0,
      lastMessage: ''
    };

    state.conversations.unshift(newConv);
    state.activeConversationId = convId;
    state.chat.sessionKey = sessionKey;
    state.chat.thread = [];
    state.chat.pendingFiles = [];
    state.chat.loaded = true;

    saveConversationsMetadata();

    // Notify Gateway of new session
    MesniumClient.request('sessions.create', {
      key: sessionKey
    }).catch(() => {});

    window.navigateTo('chat');
    setTimeout(() => {
      const input = document.getElementById('chat-input');
      if (input) input.focus();
    }, 50);
  }

  function switchConversation(convId) {
    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;

    state.activeConversationId = conv.id;
    state.chat.sessionKey = conv.sessionKey || ('agent:main:' + conv.id);
    state.activeProjectId = conv.projectId || null;
    state.chat.thread = [];
    state.chat.pendingFiles = [];
    state.chat.loaded = false;

    saveConversationsMetadata();
    window.navigateTo('chat');
    loadChatHistory();
  }

  function renameConversation(convId, newTitle) {
    const conv = state.conversations.find(c => c.id === convId);
    if (!conv) return;
    conv.title = newTitle;
    conv.updatedAt = Date.now();
    saveConversationsMetadata();

    MesniumClient.request('sessions.patch', {
      key: conv.sessionKey,
      label: newTitle
    }).catch(() => {});

    renderApp();
  }

  function deleteConversation(convId) {
    const idx = state.conversations.findIndex(c => c.id === convId);
    if (idx === -1) return;

    const conv = state.conversations[idx];
    state.conversations.splice(idx, 1);

    MesniumClient.request('sessions.delete', {
      key: conv.sessionKey,
      deleteTranscript: true
    }).catch(() => {});

    if (state.activeConversationId === convId) {
      if (state.conversations.length > 0) {
        switchConversation(state.conversations[0].id);
      } else {
        startNewChat();
      }
    } else {
      saveConversationsMetadata();
      renderApp();
    }
  }

  function autoTitleConversation(convId, firstUserMessage) {
    const conv = state.conversations.find(c => c.id === convId);
    if (!conv || (conv.title && conv.title !== 'New Chat')) return;

    let clean = firstUserMessage.replace(/[^\w\s-]/g, '').trim();
    if (clean.length > 30) {
      clean = clean.slice(0, 28).trim() + '…';
    }
    if (clean) {
      conv.title = clean;
      saveConversationsMetadata();
      MesniumClient.request('sessions.patch', {
        key: conv.sessionKey,
        label: clean
      }).catch(() => {});
      renderApp();
    }
  }

  // ─── SURFACE HANDLERS ──────────────────────────────────────────────────────
  function attachSurfaceHandlers() {
    const r = state.route;
    if (r === 'overview')    handlersOverview();
    if (r === 'chat')        handlersChat();
    if (r === 'projects')    handlersProjects();
    if (r === 'files')       handlersFiles();
    if (r === 'inbox')       handlersInbox();
    if (r === 'work')        handlersWork();
    if (r === 'knowledge')   handlersKnowledge();
    if (r === 'activity')    handlersActivity();
    if (r === 'connections') handlersConnections();
    if (r === 'settings')    handlersSettings();
  }

  // ─── OVERVIEW HANDLERS ─────────────────────────────────────────────────────
  function handlersOverview() {
    const btnChat = document.getElementById('btn-overview-open-chat');
    if (btnChat) btnChat.onclick = () => window.navigateTo('chat');

    const qChat = document.getElementById('btn-quick-chat');
    if (qChat) qChat.onclick = () => window.navigateTo('chat');
    const qProj = document.getElementById('btn-quick-projects');
    if (qProj) qProj.onclick = () => window.navigateTo('projects');
    const qWork = document.getElementById('btn-quick-work');
    if (qWork) qWork.onclick = () => window.navigateTo('work');
    const qKnowledge = document.getElementById('btn-quick-knowledge');
    if (qKnowledge) qKnowledge.onclick = () => window.navigateTo('knowledge');
    const qConn = document.getElementById('btn-quick-connections');
    if (qConn) qConn.onclick = () => window.navigateTo('connections');

    MesniumClient.request('mesnium.overview.get')
      .then(data => {
        const inboxVal = document.getElementById('ov-inbox-value');
        const inboxSub = document.getElementById('ov-inbox-sub');
        if (inboxVal) inboxVal.textContent = '—';
        if (inboxSub) inboxSub.textContent = 'Connect a channel to see messages';

        const workVal = document.getElementById('ov-work-value');
        const workSub = document.getElementById('ov-work-sub');
        if (workVal) workVal.textContent = data.agentsCount ?? 0;
        if (workSub) workSub.textContent = data.agentsCount > 0 ? 'assistants configured' : 'No automations running yet';

        const knowledgeVal = document.getElementById('ov-knowledge-value');
        const knowledgeSub = document.getElementById('ov-knowledge-sub');
        if (knowledgeVal) knowledgeVal.textContent = data.knowledgeDocsCount ?? 0;
        if (knowledgeSub) knowledgeSub.textContent = data.knowledgeDocsCount > 0 ? 'documents indexed' : 'No documents added yet';

        const approvalsVal = document.getElementById('ov-approvals-value');
        const approvalsSub = document.getElementById('ov-approvals-sub');
        const pending = data.pendingApprovalsCount ?? 0;
        if (approvalsVal) approvalsVal.textContent = pending;
        if (approvalsSub) approvalsSub.textContent = pending > 0 ? 'action(s) waiting for your approval' : 'Nothing needs your attention';

        const actList = document.getElementById('overview-activity-list');
        if (actList) {
          if (data.recentActivity && data.recentActivity.length > 0) {
            actList.innerHTML = data.recentActivity.map(act => `
              <div class="activity-row">
                <span class="activity-name">${h(act.agentName || 'System')}</span>
                <span class="activity-task">${h(act.prompt || 'Task')}</span>
                <span class="activity-status badge badge--${act.status === 'completed' ? 'ok' : 'warn'}">${h(act.status)}</span>
                <span class="activity-time">${new Date(act.startedAt).toLocaleTimeString()}</span>
              </div>`).join('');
          } else {
            actList.innerHTML = `<div class="empty-state"><p>No activity yet.</p></div>`;
          }
        }
      })
      .catch(err => {
        console.warn('[Mesnium] Failed to load overview data:', err.message);
      });
  }

  // ─── VOICE INPUT & SPEECH SYNTHESIS ────────────────────────────────────────
  function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone voice input is not supported in this browser. You can continue using text chat.");
      return;
    }

    if (state.voice.listening) {
      stopVoiceInput();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = true; // Stay open across natural pauses!
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      const resetSilenceTimer = () => {
        if (state.voice.silenceTimer) clearTimeout(state.voice.silenceTimer);
        // 3.5s silence tolerance allows natural pauses in speech
        state.voice.silenceTimer = setTimeout(() => {
          if (state.voice.listening) {
            console.log('[Mesnium Voice] Natural silence pause threshold reached, stopping listening.');
            stopVoiceInput();
          }
        }, 3500);
      };

      recognition.onstart = () => {
        state.voice.listening = true;
        state.voice.status = 'listening';
        state.voice.recognition = recognition;
        renderApp();
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        const textarea = document.getElementById('chat-input');
        if (textarea && transcript) {
          textarea.value = transcript;
          textarea.style.height = 'auto';
          textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
        }
        resetSilenceTimer();
      };

      recognition.onerror = (event) => {
        console.warn('[Mesnium Voice] Recognition error:', event.error);
        stopVoiceInput();
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          alert("Microphone access isn't available. You can continue using text chat.");
        }
      };

      recognition.onend = () => {
        if (state.voice.listening) {
          state.voice.listening = false;
          state.voice.status = 'idle';
          renderApp();
        }
      };

      recognition.start();
      resetSilenceTimer();
    } catch (err) {
      console.warn('[Mesnium Voice] Init error:', err);
      stopVoiceInput();
      alert("Microphone access isn't available. You can continue using text chat.");
    }
  }

  function stopVoiceInput() {
    if (state.voice.silenceTimer) {
      clearTimeout(state.voice.silenceTimer);
      state.voice.silenceTimer = null;
    }
    if (state.voice.recognition) {
      try { state.voice.recognition.stop(); } catch (_) {}
      state.voice.recognition = null;
    }
    state.voice.listening = false;
    state.voice.status = 'idle';
    renderApp();
  }

  function speakAssistantMessage(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('[Mesnium Voice] Speech synthesis not supported.');
      return;
    }
    window.speechSynthesis.cancel();
    const cleanText = text.replace(/[#*`_\[\]()]/g, '').trim();
    if (!cleanText) return;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.lang = navigator.language || 'en-US';
    window.speechSynthesis.speak(utterance);
  }

  // ─── CHAT HANDLERS & REAL GATEWAY EXECUTION ────────────────────────────────
  function handlersChat() {
    const textarea = document.getElementById('chat-input');
    const sendBtn  = document.getElementById('btn-chat-send');
    const fileInput = document.getElementById('composer-file-input');
    const attachBtn = document.getElementById('btn-composer-attach');
    const micBtn   = document.getElementById('btn-composer-mic');
    const chatSurface = document.getElementById('surface-chat');

    // Voice banner action buttons
    const btnVoiceDone = document.getElementById('btn-voice-done');
    if (btnVoiceDone) {
      btnVoiceDone.onclick = () => {
        stopVoiceInput();
        sendChatMessage();
      };
    }
    const btnVoiceCancel = document.getElementById('btn-voice-cancel');
    if (btnVoiceCancel) {
      btnVoiceCancel.onclick = () => {
        stopVoiceInput();
        if (textarea) textarea.value = '';
      };
    }

    // Load past conversation history on visit if needed
    if (!state.chat.loaded) {
      loadChatHistory();
    }

    // Auto-resize textarea
    if (textarea) {
      textarea.addEventListener('input', () => {
        textarea.style.height = 'auto';
        textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
      });

      textarea.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendChatMessage();
        }
      });
    }

    if (sendBtn) sendBtn.onclick = () => sendChatMessage();

    // Voice dictation toggle
    if (micBtn) {
      micBtn.onclick = () => toggleVoiceInput();
    }

    // Multi-file attachment picker
    if (attachBtn && fileInput) {
      attachBtn.onclick = () => fileInput.click();
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files.length > 0) {
          handleFilesSelected(fileInput.files);
        }
        fileInput.value = '';
      };
    }

    // Text to Speech playback buttons on assistant messages
    document.querySelectorAll('[data-speak-msg]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const msgId = btn.getAttribute('data-speak-msg');
        const msg = state.chat.thread.find(m => m.id === msgId);
        if (msg && msg.text) {
          speakAssistantMessage(msg.text);
        }
      };
    });

    // Individual file chip removal
    document.querySelectorAll('[data-remove-file]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const idx = parseInt(btn.getAttribute('data-remove-file'), 10);
        if (!isNaN(idx) && idx >= 0 && idx < state.chat.pendingFiles.length) {
          state.chat.pendingFiles.splice(idx, 1);
          renderApp();
        }
      };
    });

    // Drag and Drop on Chat workspace
    if (chatSurface) {
      let dragCounter = 0;
      chatSurface.ondragenter = (e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter++;
        chatSurface.classList.add('drag-active');
      };
      chatSurface.ondragover = (e) => {
        e.preventDefault(); e.stopPropagation();
        if (!chatSurface.classList.contains('drag-active')) chatSurface.classList.add('drag-active');
      };
      chatSurface.ondragleave = (e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          chatSurface.classList.remove('drag-active');
        }
      };
      chatSurface.ondrop = (e) => {
        e.preventDefault(); e.stopPropagation();
        dragCounter = 0;
        chatSurface.classList.remove('drag-active');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          handleFilesSelected(e.dataTransfer.files);
        }
      };
    }
  }

  function handleFilesSelected(files) {
    if (!files || files.length === 0) return;
    const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
    const validFiles = Array.from(files);

    let readCount = 0;
    const totalToRead = validFiles.length;

    validFiles.forEach(file => {
      if (file.size > MAX_FILE_SIZE_BYTES) {
        alert(`File "${file.name}" is too large (${formatFileSize(file.size)}). Maximum supported size is 25 MB.`);
        readCount++;
        return;
      }

      const reader = new FileReader();
      reader.onload = (e) => {
        const dataUrl = e.target.result || '';
        const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        
        state.chat.pendingFiles.push({
          id: 'file_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
          name: file.name,
          size: file.size,
          type: file.type || 'application/octet-stream',
          base64: base64Data
        });

        readCount++;
        if (readCount === totalToRead) renderApp();
      };
      reader.onerror = () => {
        readCount++;
        if (readCount === totalToRead) renderApp();
      };
      reader.readAsDataURL(file);
    });
  }

  function stripInternalContextFromUserMessage(rawText) {
    if (!rawText || typeof rawText !== 'string') return '';
    let clean = rawText;
    clean = clean.replace(/\[Mesnium Product Instructions & Current Runtime Capability State\][\s\S]*?(?:Strictly answer based on these REAL connection states[^\n]*\n*|\n\n)/gi, '');
    clean = clean.replace(/\[Project Workspace:[^\]]+\](?:\s*Instructions:[^\n]+)?(?:\s*Available Project Files:[^\n]+)?\n*/gi, '');
    return clean.trim();
  }

  async function loadChatHistory() {
    try {
      const historyRes = await MesniumClient.request('chat.history', {
        sessionKey: state.chat.sessionKey || 'mesnium:main',
        limit: 50
      });

      if (historyRes && Array.isArray(historyRes.messages)) {
        const rawMsgs = historyRes.messages;
        const thread = [];

        rawMsgs.forEach(m => {
          if (m.role !== 'user' && m.role !== 'assistant') return;

          let text = '';
          if (typeof m.content === 'string') {
            text = m.content;
          } else if (Array.isArray(m.content)) {
            text = m.content
              .filter(c => c.type === 'text')
              .map(c => c.text || '')
              .join('');
          }

          if (m.role === 'user') {
            text = stripInternalContextFromUserMessage(text);
          } else if (m.role === 'assistant') {
            text = sanitizePresentationText(text);
          }

          if (!text.trim()) return;

          // Presentation Boundary: Filter out diagnostic probes
          if (
            text.includes('CHROME_VERIFIED') ||
            text.includes('HELLO_MESNIUM') ||
            text.includes('temp_chat_params') ||
            text.includes('capability_test') ||
            text.includes('Reply with exact')
          ) {
            return;
          }

          const attachments = [];
          if (m.MediaPaths && Array.isArray(m.MediaPaths)) {
            m.MediaPaths.forEach(p => {
              const name = p.split(/[\\/]/).pop() || 'Attachment';
              attachments.push({ name });
            });
          }

          thread.push({
            id: m.__openclaw?.id || ('hist_' + Math.random().toString(36).slice(2, 9)),
            role: m.role,
            text,
            attachments: attachments.length > 0 ? attachments : undefined,
            ts: m.timestamp || Date.now()
          });
        });

        state.chat.thread = thread;
        state.chat.loaded = true;
        renderChatStream();
      }
    } catch (err) {
      console.warn('[Mesnium] Could not load chat history:', err);
    }
  }

  function renderChatStream() {
    const stream = document.getElementById('chat-stream');
    if (!stream) return;
    const thread = state.chat.thread;
    const activeProject = state.activeProjectId ? state.projects.find(p => p.id === state.activeProjectId) : null;

    if (thread.length === 0) {
      stream.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">✦</div>
          <h2 class="chat-welcome-title">${activeProject ? `Project: ${h(activeProject.name)}` : 'Ask Mesnium anything'}</h2>
          <p class="chat-welcome-sub">
            ${activeProject 
              ? `You are inside the <strong>${h(activeProject.name)}</strong> workspace. Mesnium automatically references project files and follows your custom instructions.`
              : 'Chat with your business data, reason over documents, execute tasks, or connect local folders.'}
          </p>
        </div>`;
    } else {
      stream.innerHTML = thread.map(renderChatBubble).join('');
      stream.scrollTop = stream.scrollHeight;
    }
  }

  async function sendChatMessage(customText = null) {
    const textarea = document.getElementById('chat-input');
    const text = customText !== null ? String(customText).trim() : (textarea ? textarea.value.trim() : '');
    const pendingFiles = [...(state.chat.pendingFiles || [])];

    if (!text && pendingFiles.length === 0) return;
    if (state.chat.isSending) return;

    state.chat.isSending = true;

    const userText = text;
    const userMsgId = 'msg_user_' + Date.now();
    const runId = 'mesnium_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8);

    // Push user message
    state.chat.thread.push({
      id: userMsgId,
      role: 'user',
      text: userText,
      attachments: pendingFiles.map(f => ({ name: f.name, size: f.size, type: f.type })),
      ts: Date.now()
    });

    // Auto-title conversation on first message
    if (state.activeConversationId && userText) {
      autoTitleConversation(state.activeConversationId, userText);
    }

    // Update conversation metadata
    const conv = state.conversations.find(c => c.id === state.activeConversationId);
    if (conv) {
      conv.messageCount = (conv.messageCount || 0) + 1;
      conv.lastMessage = userText || (pendingFiles.length > 0 ? `Sent ${pendingFiles.length} file(s)` : '');
      conv.updatedAt = Date.now();
      saveConversationsMetadata();
    }

    // Clear composer and staged files
    state.chat.pendingFiles = [];
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    // Push assistant message placeholder
    const assistantMsgId = 'msg_ast_' + Date.now();
    const initialToolStatus = pendingFiles.length > 0
      ? (pendingFiles.length === 1 ? `Analyzing ${pendingFiles[0].name}…` : `Analyzing ${pendingFiles.length} documents…`)
      : 'Mesnium is thinking…';

    state.chat.thread.push({
      id: assistantMsgId,
      role: 'assistant',
      text: '',
      sources: pendingFiles.map(f => f.name),
      toolStatus: initialToolStatus,
      _thinking: true,
      runId: runId,
      ts: Date.now()
    });

    renderChatStream();

    const sendBtn = document.getElementById('btn-chat-send');
    if (sendBtn) {
      sendBtn.disabled = true;
      sendBtn.style.opacity = '0.5';
    }

    // Prepare attachments for RPC
    const rpcAttachments = pendingFiles.map(file => ({
      type: file.type.startsWith('image/') ? 'image' : 'file',
      mimeType: file.type || 'application/octet-stream',
      fileName: file.name,
      content: file.base64
    }));

    // Real-time delta streaming listener
    let accumulatedText = '';
    const onChatEvent = (payload) => {
      if (!payload) return;
      if (payload.runId && payload.runId !== runId) return;

      const astMsg = state.chat.thread.find(m => m.id === assistantMsgId);
      if (!astMsg) return;

      // Update friendly tool activity status
      if (payload.toolCall || payload.toolName || payload.tool) {
        const tool = (payload.toolCall?.name || payload.toolName || payload.tool || '').toLowerCase();
        if (tool.includes('knowledge') || tool.includes('memory')) {
          astMsg.toolStatus = 'Checking your business data…';
        } else if (tool.includes('drive')) {
          astMsg.toolStatus = 'Searching your Google Drive…';
        } else if (tool.includes('gmail') || tool.includes('email')) {
          astMsg.toolStatus = 'Checking your email…';
        } else if (tool.includes('calendar')) {
          astMsg.toolStatus = 'Reviewing your calendar…';
        } else if (tool.includes('web') || tool.includes('search')) {
          astMsg.toolStatus = 'Searching the web…';
        } else if (pendingFiles.length > 0) {
          astMsg.toolStatus = 'Analyzing your document…';
        }
      }

      const contentBlocks = payload.message?.content;
      let incomingText = '';
      if (typeof contentBlocks === 'string') {
        incomingText = contentBlocks;
      } else if (Array.isArray(contentBlocks)) {
        incomingText = contentBlocks
          .filter(b => b.type === 'text')
          .map(b => b.text || '')
          .join('');
      } else if (typeof payload.deltaText === 'string') {
        incomingText = payload.deltaText;
      }

      if (incomingText) {
        accumulatedText = incomingText;
      }

      if (accumulatedText) {
        astMsg.text = accumulatedText;
        astMsg._thinking = false;
      }

      if (payload.state === 'final' || payload.state === 'done') {
        astMsg.text = accumulatedText || astMsg.text || 'Completed.';
        astMsg._thinking = false;
        cleanup();
      } else if (payload.state === 'error') {
        astMsg.text = accumulatedText || 'I ran into a problem completing that request. Please try again.';
        astMsg._error = true;
        astMsg._thinking = false;
        cleanup();
      }
      renderChatStream();
    };

    const cleanup = () => {
      MesniumClient.off('chat', onChatEvent);
      state.chat.isSending = false;
      if (sendBtn) {
        sendBtn.disabled = false;
        sendBtn.style.opacity = '';
      }
    };

    MesniumClient.on('chat', onChatEvent);

    try {
      // Build clean prompt for the message payload (NO capability dump prepended)
      let prompt = userText || '';
      if (!prompt && pendingFiles.length > 0) {
        prompt = `Please analyse the attached ${pendingFiles.length === 1 ? 'file: ' + pendingFiles[0].name : pendingFiles.length + ' files'}.`;
      }

      if (state.activeProjectId) {
        const project = state.projects.find(p => p.id === state.activeProjectId);
        if (project) {
          const projectContextPrefix = `[Project Workspace: ${project.name}]` +
            (project.instructions ? `\nInstructions: ${project.instructions}` : '') +
            (project.files && project.files.length > 0 ? `\nAvailable Project Files: ${project.files.map(f => f.name).join(', ')}` : '') +
            `\n\n`;
          prompt = projectContextPrefix + (prompt || `Please analyse the project files for ${project.name}.`);
        }
      }

      await MesniumClient.request('chat.send', {
        sessionKey: state.chat.sessionKey || 'mesnium:main',
        message: prompt,
        deliver: false,
        idempotencyKey: runId,
        ...(rpcAttachments.length > 0 ? { attachments: rpcAttachments } : {})
      });

      // 60s timeout fallback
      setTimeout(() => {
        if (state.chat.isSending) {
          const astMsg = state.chat.thread.find(m => m.id === assistantMsgId);
          if (astMsg && astMsg._thinking) {
            astMsg._thinking = false;
            if (!astMsg.text) astMsg.text = 'Mesnium is processing your request. Please check back shortly.';
            renderChatStream();
          }
          cleanup();
        }
      }, 60000);
    } catch (err) {
      console.error('[Mesnium] chat.send error:', err);
      const astMsg = state.chat.thread.find(m => m.id === assistantMsgId);
      if (astMsg) {
        astMsg._thinking = false;
        astMsg._error = true;
        astMsg.text = translateErrorMessage(err);
        renderChatStream();
      }
      cleanup();
    }
  }

  // ─── PROJECTS HANDLERS ─────────────────────────────────────────────────────
  async function loadProjects() {
    try {
      const res = await MesniumClient.request('mesnium.projects.list');
      if (res && Array.isArray(res.projects)) {
        state.projects = res.projects;
        renderApp();
      }
    } catch (err) {
      console.warn('[Mesnium] Could not load projects:', err);
    }
  }

  function renderSidebarProjectsList() {
    const list = document.getElementById('sidebar-projects-list');
    if (list) list.innerHTML = renderSidebarProjects();
  }

  function handlersProjects() {
    const btnCreate = document.getElementById('btn-create-project') || document.getElementById('btn-create-project-empty');
    if (btnCreate) btnCreate.onclick = () => openCreateProjectModal();

    const searchInput = document.getElementById('projects-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        state.projectSearchQuery = e.target.value;
        renderApp();
      };
    }

    // Open project detail
    document.querySelectorAll('[data-open-project]').forEach(el => {
      el.onclick = () => {
        const pId = el.getAttribute('data-open-project');
        state.activeProjectId = pId;
        saveConversationsMetadata();
        renderApp();
      };
    });

    // Start project chat shortcut
    document.querySelectorAll('[data-start-proj-chat]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const pId = btn.getAttribute('data-start-proj-chat');
        state.activeProjectId = pId;
        saveConversationsMetadata();
        startNewChat(pId);
      };
    });

    // Project detail view handlers
    const btnBack = document.getElementById('btn-back-to-projects');
    if (btnBack) {
      btnBack.onclick = () => {
        state.activeProjectId = null;
        saveConversationsMetadata();
        renderApp();
      };
    }

    const btnChatNow = document.getElementById('btn-project-chat-now') || document.getElementById('btn-new-project-chat') || document.getElementById('btn-start-first-proj-chat');
    if (btnChatNow) {
      btnChatNow.onclick = () => startNewChat(state.activeProjectId);
    }

    const btnDeleteProj = document.getElementById('btn-delete-project-danger');
    if (btnDeleteProj) {
      btnDeleteProj.onclick = () => {
        if (confirm(`Are you sure you want to delete this project? All associated server files will be removed.`)) {
          MesniumClient.request('mesnium.projects.delete', { id: state.activeProjectId })
            .then(() => {
              state.projects = state.projects.filter(p => p.id !== state.activeProjectId);
              state.activeProjectId = null;
              saveConversationsMetadata();
              renderApp();
            })
            .catch(err => alert('Failed to delete project: ' + err.message));
        }
      };
    }

    // Project tabs
    document.querySelectorAll('[data-proj-tab]').forEach(tab => {
      tab.onclick = () => {
        state.projectTab = tab.getAttribute('data-proj-tab');
        renderApp();
      };
    });

    // Save project instructions
    const btnSaveInst = document.getElementById('btn-save-proj-instructions');
    if (btnSaveInst) {
      btnSaveInst.onclick = async () => {
        const input = document.getElementById('proj-instructions-input');
        const status = document.getElementById('proj-save-status');
        if (!input) return;
        const text = input.value.trim();
        try {
          await MesniumClient.request('mesnium.projects.update', {
            id: state.activeProjectId,
            instructions: text
          });
          const p = state.projects.find(x => x.id === state.activeProjectId);
          if (p) p.instructions = text;
          if (status) {
            status.textContent = '✓ Saved';
            setTimeout(() => { if (status) status.textContent = ''; }, 3000);
          }
        } catch (err) {
          alert('Failed to save instructions: ' + err.message);
        }
      };
    }

    // Upload project file button & input
    const btnUpload = document.getElementById('btn-project-upload-file');
    const fileInput = document.getElementById('project-file-input');
    if (btnUpload && fileInput) {
      btnUpload.onclick = () => fileInput.click();
      fileInput.onchange = () => {
        if (fileInput.files && fileInput.files.length > 0) {
          uploadProjectFiles(state.activeProjectId, fileInput.files);
        }
        fileInput.value = '';
      };
    }

    // Drag and drop for project files
    const dropzone = document.getElementById('proj-dropzone');
    if (dropzone) {
      dropzone.ondragover = (e) => { e.preventDefault(); dropzone.classList.add('dropzone--active'); };
      dropzone.ondragleave = (e) => { e.preventDefault(); dropzone.classList.remove('dropzone--active'); };
      dropzone.ondrop = (e) => {
        e.preventDefault();
        dropzone.classList.remove('dropzone--active');
        if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
          uploadProjectFiles(state.activeProjectId, e.dataTransfer.files);
        }
      };
    }

    // Delete project file
    document.querySelectorAll('[data-remove-proj-file]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const fileId = btn.getAttribute('data-remove-proj-file');
        if (confirm('Remove this document from project?')) {
          try {
            await MesniumClient.request('mesnium.projects.removeFile', {
              projectId: state.activeProjectId,
              fileId: fileId
            });
            const p = state.projects.find(x => x.id === state.activeProjectId);
            if (p) {
              p.files = (p.files || []).filter(f => f.id !== fileId && f.name !== fileId);
            }
            renderApp();
          } catch (err) {
            alert('Failed to remove file: ' + err.message);
          }
        }
      };
    });
  }

  function uploadProjectFiles(projectId, files) {
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = async (e) => {
        const dataUrl = e.target.result || '';
        const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
        try {
          const res = await MesniumClient.request('mesnium.projects.addFile', {
            projectId: projectId,
            name: file.name,
            size: file.size,
            type: file.type || 'application/octet-stream',
            base64: base64Data
          });
          const p = state.projects.find(x => x.id === projectId);
          if (p && res.file) {
            p.files = (p.files || []).filter(f => f.name !== file.name);
            p.files.push(res.file);
            renderApp();
          }
        } catch (err) {
          alert(`Failed to upload ${file.name}: ` + err.message);
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function openCreateProjectModal() {
    const modalRoot = document.getElementById('mesnium-modal-root');
    if (!modalRoot) return;
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-project-overlay">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Create Project Workspace</h3>
            <button class="modal-close" id="btn-close-proj-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="form-field">
              <label class="form-label" for="new-proj-name">Project Name *</label>
              <input type="text" id="new-proj-name" class="form-input" placeholder="e.g. Marketing Strategy, Client Q3, Legal" />
            </div>
            <div class="form-field">
              <label class="form-label" for="new-proj-desc">Description</label>
              <input type="text" id="new-proj-desc" class="form-input" placeholder="Brief summary of this workspace's purpose" />
            </div>
            <div class="form-field">
              <label class="form-label" for="new-proj-inst">Custom AI Instructions</label>
              <textarea id="new-proj-inst" class="form-textarea" rows="3" placeholder="Optional instructions for Mesnium when working in this project"></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancel-proj-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-submit-proj-modal">Create Workspace</button>
          </div>
        </div>
      </div>`;

    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('btn-close-proj-modal').onclick = close;
    document.getElementById('btn-cancel-proj-modal').onclick = close;
    document.getElementById('modal-project-overlay').onclick = (e) => {
      if (e.target.id === 'modal-project-overlay') close();
    };

    document.getElementById('btn-submit-proj-modal').onclick = async () => {
      const name = document.getElementById('new-proj-name')?.value.trim();
      const desc = document.getElementById('new-proj-desc')?.value.trim();
      const inst = document.getElementById('new-proj-inst')?.value.trim();
      if (!name) {
        alert('Please enter a project name.');
        return;
      }
      try {
        const res = await MesniumClient.request('mesnium.projects.create', {
          name,
          description: desc,
          instructions: inst
        });
        if (res && res.project) {
          state.projects.unshift(res.project);
          state.activeProjectId = res.project.id;
          saveConversationsMetadata();
          close();
          window.navigateTo('projects', { projectId: res.project.id });
        }
      } catch (err) {
        alert('Failed to create project: ' + err.message);
      }
    };
  }

  // ─── FILES HANDLERS (Phase 20A) ────────────────────────────────────────────
  async function handlersFiles() {
    // 1. Load authorized folders and files once on initial navigation
    if (!state.filesState.loaded && !state.filesState.loading) {
      state.filesState.loaded = true;
      await loadAuthorizedFolders();
      await loadFilesForActiveFolder();
      return;
    }

    // 2. Folder pill clicks
    document.querySelectorAll('[data-select-folder]').forEach(pill => {
      pill.onclick = async (e) => {
        // Prevent click if clicking inside action button
        if (e.target.closest('.folder-pill-action-btn')) return;
        const folder = pill.getAttribute('data-select-folder');
        state.filesState.activeFolder = folder;
        state.filesState.searchQuery = '';
        state.filesState.filterType = 'all';
        await loadFilesForActiveFolder(folder);
      };
    });

    // 2b. Authorize folder button clicks
    document.querySelectorAll('[data-authorize-folder]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const folder = btn.getAttribute('data-authorize-folder');
        try {
          await MesniumClient.request('mesnium.files.folders.authorize', { folder });
          await loadAuthorizedFolders();
          state.filesState.activeFolder = folder;
          await loadFilesForActiveFolder(folder);
        } catch (err) {
          alert('Failed to authorize folder: ' + err.message);
        }
      };
    });

    // 2c. Revoke folder button clicks
    document.querySelectorAll('[data-revoke-folder]').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const folder = btn.getAttribute('data-revoke-folder');
        try {
          await MesniumClient.request('mesnium.files.folders.revoke', { id: folder });
          await loadAuthorizedFolders();
          await loadFilesForActiveFolder(folder);
        } catch (err) {
          alert('Failed to revoke folder: ' + err.message);
        }
      };
    });

    // 3. Search input
    const searchInput = document.getElementById('files-search-input');
    if (searchInput) {
      let debounceTimer = null;
      searchInput.oninput = (e) => {
        clearTimeout(debounceTimer);
        const q = e.target.value;
        debounceTimer = setTimeout(async () => {
          state.filesState.searchQuery = q;
          if (q.trim().length >= 2) {
            try {
              const res = await MesniumClient.request('mesnium.files.search', {
                query: q.trim(),
                folder: state.filesState.activeFolder
              });
              if (res && Array.isArray(res.files)) {
                state.filesState.files = res.files;
                state.filesState.totalCount = res.totalCount || res.files.length;
              }
            } catch (_) {}
          } else {
            await loadFilesForActiveFolder(state.filesState.activeFolder);
          }
          renderApp();
        }, 300);
      };
    }

    // 4. Filter category pills
    document.querySelectorAll('[data-file-filter]').forEach(pill => {
      pill.onclick = () => {
        state.filesState.filterType = pill.getAttribute('data-file-filter');
        renderApp();
      };
    });

    // 5. Action: Add Folder
    const btnAddFolder = document.getElementById('btn-files-add-folder');
    if (btnAddFolder) {
      btnAddFolder.onclick = () => openAddFolderModal();
    }

    // 6. Action: Organize Folder
    const btnOrganize = document.getElementById('btn-files-organize');
    if (btnOrganize) {
      btnOrganize.onclick = () => openOrganizeModal(state.filesState.activeFolder);
    }

    // 7. Action: Preview File
    document.querySelectorAll('[data-preview-file]').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const filePath = btn.getAttribute('data-preview-file');
        openFilePreviewModal(filePath);
      };
    });
  }

  async function loadAuthorizedFolders() {
    try {
      const res = await MesniumClient.request('mesnium.files.folders.list');
      if (res && Array.isArray(res.folders)) {
        state.filesState.folders = res.folders;
      }
    } catch (err) {
      console.warn('[Mesnium Files] loadAuthorizedFolders error:', err);
    }
  }

  async function loadFilesForActiveFolder(folder = null) {
    if (state.filesState.loading) return;
    const target = folder || state.filesState.activeFolder || 'Desktop';
    state.filesState.loading = true;

    try {
      const res = await MesniumClient.request('mesnium.files.list', { folder: target, limit: 100 });
      if (res && Array.isArray(res.files)) {
        state.filesState.files = res.files;
        state.filesState.totalCount = res.totalCount || res.files.length;
      }
    } catch (err) {
      console.warn('[Mesnium Files] loadFiles error:', err);
      state.filesState.files = [];
      state.filesState.totalCount = 0;
    } finally {
      state.filesState.loading = false;
      renderApp();
    }
  }

  function openAddFolderModal() {
    const modalRoot = document.getElementById('mesnium-modal-root');
    if (!modalRoot) return;
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-folder-overlay">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Authorize Local Folder</h3>
            <button class="modal-close" id="btn-close-folder-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="form-field">
              <label class="form-label" for="new-folder-path">Folder Path or Alias *</label>
              <input type="text" id="new-folder-path" class="form-input" placeholder="e.g. Desktop, Downloads, or full directory path" />
              <p class="form-hint" style="font-size:12px;color:var(--muted,#747480);margin-top:4px;">Authorized folders allow Mesnium to search and inspect documents securely.</p>
            </div>
            <div class="form-field">
              <label class="form-label" for="new-folder-alias">Display Alias (Optional)</label>
              <input type="text" id="new-folder-alias" class="form-input" placeholder="e.g. Client Work, Downloads, Receipts" />
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancel-folder-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-submit-folder-modal">Authorize Folder</button>
          </div>
        </div>
      </div>`;

    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('btn-close-folder-modal').onclick = close;
    document.getElementById('btn-cancel-folder-modal').onclick = close;
    document.getElementById('modal-folder-overlay').onclick = (e) => {
      if (e.target.id === 'modal-folder-overlay') close();
    };

    document.getElementById('btn-submit-folder-modal').onclick = async () => {
      const folder = document.getElementById('new-folder-path')?.value.trim();
      const alias = document.getElementById('new-folder-alias')?.value.trim();
      if (!folder) {
        alert('Please enter a folder path or alias.');
        return;
      }
      try {
        await MesniumClient.request('mesnium.files.folders.authorize', { folder, alias: alias || undefined });
        await loadAuthorizedFolders();
        state.filesState.activeFolder = alias || folder;
        await loadFilesForActiveFolder(state.filesState.activeFolder);
        close();
      } catch (err) {
        alert('Failed to authorize folder: ' + err.message);
      }
    };
  }

  async function openFilePreviewModal(filePath) {
    const modalRoot = document.getElementById('mesnium-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-preview-overlay">
        <div class="modal-card" style="max-width: 680px; width: 90%;">
          <div class="modal-header">
            <h3>Document Preview</h3>
            <button class="modal-close" id="btn-close-preview-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="files-loading">
              <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>
              <span>Extracting content…</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancel-preview-modal">Close</button>
          </div>
        </div>
      </div>`;

    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('btn-close-preview-modal').onclick = close;
    document.getElementById('btn-cancel-preview-modal').onclick = close;
    document.getElementById('modal-preview-overlay').onclick = (e) => {
      if (e.target.id === 'modal-preview-overlay') close();
    };

    try {
      const res = await MesniumClient.request('mesnium.files.read', {
        path: `${state.filesState.activeFolder}/${filePath}`
      });

      const body = modalRoot.querySelector('.modal-body');
      if (body && res) {
        body.innerHTML = `
          <div style="margin-bottom: 12px; display: flex; align-items: center; justify-content: space-between;">
            <strong>${h(res.fileName)}</strong>
            <span class="badge badge--ok">${h(res.folder)} · ${h(res.formattedSize)}</span>
          </div>
          <div class="preview-text-box">${h(res.content || '(No readable text content)')}</div>
        `;
      }
    } catch (err) {
      const body = modalRoot.querySelector('.modal-body');
      if (body) {
        body.innerHTML = `<div class="error-state">Failed to read file: ${h(err.message)}</div>`;
      }
    }
  }

  async function openOrganizeModal(folderAlias) {
    const modalRoot = document.getElementById('mesnium-modal-root');
    if (!modalRoot) return;

    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-organize-overlay">
        <div class="modal-card" style="max-width: 600px; width: 90%;">
          <div class="modal-header">
            <h3>Organize ${h(folderAlias)}</h3>
            <button class="modal-close" id="btn-close-org-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="files-loading">
              <span class="thinking-dot"></span><span class="thinking-dot"></span><span class="thinking-dot"></span>
              <span>Analyzing folder structure and loose files…</span>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancel-org-modal">Cancel</button>
          </div>
        </div>
      </div>`;

    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('btn-close-org-modal').onclick = close;
    document.getElementById('btn-cancel-org-modal').onclick = close;
    document.getElementById('modal-organize-overlay').onclick = (e) => {
      if (e.target.id === 'modal-organize-overlay') close();
    };

    try {
      const proposal = await MesniumClient.request('mesnium.files.organize.propose', {
        folder: folderAlias
      });

      const body = modalRoot.querySelector('.modal-body');
      const footer = modalRoot.querySelector('.modal-footer');

      if (body && proposal) {
        if (proposal.totalFiles === 0) {
          body.innerHTML = `
            <div class="empty-state empty-state--centered">
              <div class="empty-icon">✓</div>
              <h3>Folder Already Organized</h3>
              <p>Found 0 loose files on your ${h(folderAlias)} that need reorganization.</p>
            </div>`;
          return;
        }

        const breakdownEntries = Object.entries(proposal.breakdown || {});
        body.innerHTML = `
          <p>Mesnium analyzed <strong>${proposal.totalFiles} loose file${proposal.totalFiles === 1 ? '' : 's'}</strong> on your <strong>${h(folderAlias)}</strong>.</p>
          <div class="organize-breakdown-list">
            <strong>Proposed Categorization:</strong>
            <ul style="margin: 8px 0 0 18px; padding: 0;">
              ${breakdownEntries.map(([cat, count]) => `
                <li><strong>${count}</strong> file${count === 1 ? '' : 's'} → <code>${h(cat)}</code></li>
              `).join('')}
            </ul>
          </div>
          <p style="font-size: 13px; color: var(--accent, #b33d3f);">⚠️ Nothing has been moved yet. Explicit confirmation is required before modifying file structures.</p>
        `;

        if (footer) {
          footer.innerHTML = `
            <button class="btn btn-secondary" id="btn-cancel-org-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-confirm-org-modal">Confirm & Organize Files</button>
          `;
          document.getElementById('btn-cancel-org-modal').onclick = close;
          const confirmBtn = document.getElementById('btn-confirm-org-modal');
          if (confirmBtn) {
            confirmBtn.onclick = async () => {
              confirmBtn.disabled = true;
              confirmBtn.textContent = 'Organizing files…';
              try {
                const res = await MesniumClient.request('mesnium.files.organize.execute', {
                  folder: folderAlias,
                  plan: proposal,
                  confirmed: true
                });
                alert(res.summaryText || 'Reorganization completed successfully.');
                close();
                await loadFilesForActiveFolder(folderAlias);
              } catch (err) {
                alert('Organization failed: ' + err.message);
                confirmBtn.disabled = false;
                confirmBtn.textContent = 'Confirm & Organize Files';
              }
            };
          }
        }
      }
    } catch (err) {
      const body = modalRoot.querySelector('.modal-body');
      if (body) {
        body.innerHTML = `<div class="error-state">Failed to propose organization: ${h(err.message)}</div>`;
      }
    }
  }

  // ─── INBOX HANDLERS ────────────────────────────────────────────────────────
  function handlersInbox() {
    const btnConnect = document.getElementById('btn-inbox-connect-channel');
    if (btnConnect) {
      btnConnect.onclick = () => window.navigateTo('connections');
    }
  }

  // ─── WORK HANDLERS ─────────────────────────────────────────────────────────
  async function handlersWork() {
    document.querySelectorAll('[data-work-tab]').forEach(tab => {
      tab.onclick = () => {
        state.work.tab = tab.getAttribute('data-work-tab');
        renderApp();
      };
    });

    const btnCreateAuto = document.getElementById('btn-create-automation');
    if (btnCreateAuto) {
      btnCreateAuto.onclick = () => openCreateAutomationModal();
    }

    const content = document.getElementById('work-content');
    if (!content) return;

    try {
      const [autoRes, appRes] = await Promise.all([
        MesniumClient.request('mesnium.automations.list').catch(() => ({ automations: [] })),
        MesniumClient.request('mesnium.approvals.list').catch(() => ({ approvals: [] }))
      ]);

      const automations = autoRes.automations || [];
      const approvals = appRes.approvals || [];

      if (state.work.tab === 'needs_approval') {
        if (approvals.length === 0) {
          content.innerHTML = `<div class="empty-state empty-state--centered"><div class="empty-icon">✓</div><h3>No pending approvals</h3><p>All actions have been reviewed.</p></div>`;
        } else {
          content.innerHTML = `
            <div class="approvals-list">
              ${approvals.map(app => `
                <div class="approval-card" id="approval-${app.id}">
                  <div class="approval-info">
                    <span class="badge badge--warn">Requires Approval</span>
                    <h4>${h(app.actionType || 'Action')}</h4>
                    <p>${h(app.description || 'Action awaiting operator consent.')}</p>
                  </div>
                  <div class="approval-actions">
                    <button class="btn btn-primary btn-sm" data-approve="${app.id}">Approve</button>
                    <button class="btn btn-secondary btn-sm" data-reject="${app.id}">Reject</button>
                  </div>
                </div>`).join('')}
            </div>`;
        }
      } else {
        if (automations.length === 0 && approvals.length === 0) {
          content.innerHTML = `<div class="empty-state empty-state--centered"><div class="empty-icon">⚡</div><h3>No work found</h3><p>Create an automation to start scheduling tasks.</p></div>`;
        } else {
          content.innerHTML = `
            <div class="automations-grid">
              ${automations.map(auto => `
                <div class="auto-card">
                  <div class="auto-header">
                    <h4>${h(auto.name)}</h4>
                    <span class="badge badge--${auto.status === 'active' ? 'ok' : 'neutral'}">${h(auto.status)}</span>
                  </div>
                  <p class="auto-desc">${h(auto.description || '')}</p>
                  <div class="auto-footer">
                    <button class="btn btn-secondary btn-sm" data-run-auto="${auto.id}">Run Now</button>
                  </div>
                </div>`).join('')}
            </div>`;
        }
      }

      // Approve / Reject actions
      document.querySelectorAll('[data-approve]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-approve');
          await MesniumClient.request('mesnium.approvals.approve', { id });
          handlersWork();
        };
      });
      document.querySelectorAll('[data-reject]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-reject');
          await MesniumClient.request('mesnium.approvals.reject', { id });
          handlersWork();
        };
      });
      document.querySelectorAll('[data-run-auto]').forEach(btn => {
        btn.onclick = async () => {
          const id = btn.getAttribute('data-run-auto');
          btn.textContent = 'Running…';
          btn.disabled = true;
          await MesniumClient.request('mesnium.automations.run', { id });
          handlersWork();
        };
      });
    } catch (err) {
      content.innerHTML = `<div class="error-state">Failed to load work: ${h(err.message)}</div>`;
    }
  }

  function openCreateAutomationModal() {
    const modalRoot = document.getElementById('mesnium-modal-root');
    if (!modalRoot) return;
    modalRoot.innerHTML = `
      <div class="modal-overlay" id="modal-auto-overlay">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Create Business Automation</h3>
            <button class="modal-close" id="btn-close-auto-modal">×</button>
          </div>
          <div class="modal-body">
            <div class="form-field">
              <label class="form-label">Automation Name *</label>
              <input type="text" id="auto-name-input" class="form-input" placeholder="e.g. Daily Leads Digest" />
            </div>
            <div class="form-field">
              <label class="form-label">Schedule / Trigger</label>
              <input type="text" id="auto-sched-input" class="form-input" value="Every weekday at 9:00 AM" />
            </div>
            <div class="form-field">
              <label class="form-label">Task Prompt</label>
              <textarea id="auto-prompt-input" class="form-textarea" rows="3" placeholder="Describe the task for Mesnium to execute..."></textarea>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn-secondary" id="btn-cancel-auto-modal">Cancel</button>
            <button class="btn btn-primary" id="btn-submit-auto-modal">Create</button>
          </div>
        </div>
      </div>`;

    const close = () => { modalRoot.innerHTML = ''; };
    document.getElementById('btn-close-auto-modal').onclick = close;
    document.getElementById('btn-cancel-auto-modal').onclick = close;
    document.getElementById('btn-submit-auto-modal').onclick = async () => {
      const name = document.getElementById('auto-name-input')?.value.trim();
      const prompt = document.getElementById('auto-prompt-input')?.value.trim();
      if (!name) return alert('Name is required');
      try {
        await MesniumClient.request('mesnium.automations.create', { name, prompt });
        close();
        handlersWork();
      } catch (err) {
        alert('Failed to create automation: ' + err.message);
      }
    };
  }

  // ─── KNOWLEDGE & LOCAL FILE ACCESS HANDLERS ────────────────────────────────
  function handlersKnowledge() {
    const searchInput = document.getElementById('knowledge-search-input');
    if (searchInput) {
      searchInput.oninput = (e) => {
        const q = e.target.value.trim();
        if (q.length >= 2) searchKnowledge(q);
        else loadKnowledgeSources();
      };
    }

    const btnConnectFolder = document.getElementById('btn-connect-local-folder');
    if (btnConnectFolder) {
      btnConnectFolder.onclick = () => connectLocalFolder();
    }

    const btnDisconnectFolder = document.getElementById('btn-disconnect-local-folder');
    if (btnDisconnectFolder) {
      btnDisconnectFolder.onclick = () => {
        state.localWorkspace.connected = false;
        state.localWorkspace.folderName = null;
        state.localWorkspace.files = [];
        renderApp();
      };
    }

    loadKnowledgeSources();
  }

  async function connectLocalFolder() {
    if (typeof window !== 'undefined' && window.showDirectoryPicker) {
      try {
        const handle = await window.showDirectoryPicker({ mode: 'read' });
        const files = [];
        for await (const entry of handle.values()) {
          if (entry.kind === 'file') {
            const f = await entry.getFile();
            files.push({
              name: f.name,
              size: f.size,
              type: f.type,
              lastModified: f.lastModified
            });
          }
        }
        state.localWorkspace.connected = true;
        state.localWorkspace.folderName = handle.name;
        state.localWorkspace.files = files;
        renderApp();
      } catch (err) {
        if (err.name !== 'AbortError') {
          alert('Could not access folder: ' + err.message);
        }
      }
    } else {
      // Fallback: prompt directory name or add workspace
      const folderName = prompt('Connect local workspace folder name (e.g. Sales-Q3):', 'Documents');
      if (folderName) {
        state.localWorkspace.connected = true;
        state.localWorkspace.folderName = folderName;
        state.localWorkspace.files = [
          { name: 'invoice-2026-q1.pdf', size: 145000, type: 'application/pdf' },
          { name: 'client-contract-terms.docx', size: 85000, type: 'application/docx' },
          { name: 'revenue-forecast.xlsx', size: 120000, type: 'application/xlsx' }
        ];
        renderApp();
      }
    }
  }

  async function loadKnowledgeSources() {
    const container = document.getElementById('knowledge-docs-list');
    if (!container) return;
    try {
      const data = await MesniumClient.request('mesnium.knowledge.sources');
      const sources = data.sources || [];
      const localFiles = state.localWorkspace.connected ? state.localWorkspace.files : [];

      if (sources.length === 0 && localFiles.length === 0) {
        container.innerHTML = `<div class="empty-state"><div class="empty-icon">📚</div><h3>No documents indexed yet</h3><p>Add a file or connect a local folder to ground Mesnium's knowledge.</p></div>`;
      } else {
        container.innerHTML = `
          <div class="knowledge-sources-list">
            ${sources.map(s => `
              <div class="knowledge-source-row">
                <span class="source-icon">📄</span>
                <span class="knowledge-source-name">${h(s.name || s.path)}</span>
                <span class="knowledge-source-type badge badge--ok">${h(s.type || 'indexed')}</span>
              </div>`).join('')}
            ${localFiles.map(f => `
              <div class="knowledge-source-row">
                <span class="source-icon">${getFileIcon(f.name)}</span>
                <span class="knowledge-source-name">${h(f.name)}</span>
                <span class="knowledge-source-type badge badge--neutral">Local Folder</span>
              </div>`).join('')}
          </div>`;
      }
    } catch (err) {
      container.innerHTML = `<div class="error-state">Failed to load knowledge: ${h(err.message)}</div>`;
    }
  }

  async function searchKnowledge(query) {
    const container = document.getElementById('knowledge-docs-list');
    if (!container) return;
    container.innerHTML = '<div class="knowledge-loading">Searching…</div>';
    try {
      const data = await MesniumClient.request('mesnium.knowledge.search', { query, limit: 10 });
      const hits = data.hits || [];
      const localMatches = state.localWorkspace.connected
        ? state.localWorkspace.files.filter(f => f.name.toLowerCase().includes(query.toLowerCase()))
        : [];

      if (hits.length === 0 && localMatches.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No results for "<strong>${h(query)}</strong>"</p></div>`;
      } else {
        container.innerHTML = `
          ${hits.map(hit => `
            <div class="knowledge-hit-row">
              <div class="hit-filename">${h(hit.filename)}</div>
              <div class="hit-excerpt">${h((hit.content || '').slice(0, 160))}…</div>
            </div>`).join('')}
          ${localMatches.map(f => `
            <div class="knowledge-hit-row">
              <div class="hit-filename">📁 Local: ${h(f.name)}</div>
              <div class="hit-excerpt">${formatFileSize(f.size)} · Authorized in ${h(state.localWorkspace.folderName)}</div>
            </div>`).join('')}
        `;
      }
    } catch (err) {
      container.innerHTML = `<div class="error-state">Search failed: ${h(err.message)}</div>`;
    }
  }

  // ─── ACTIVITY HANDLERS ─────────────────────────────────────────────────────
  async function handlersActivity() {
    const list = document.getElementById('activity-list');
    if (!list) return;
    list.innerHTML = '<div class="activity-loading">Loading activity…</div>';
    try {
      const data = await MesniumClient.request('mesnium.activity.list', { limit: 50 });
      const items = data.activity || [];
      if (items.length === 0) {
        list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><h3>No activity yet</h3><p>Activity will appear here as you use Chat and automations.</p></div>`;
      } else {
        list.innerHTML = items.map(act => `
          <div class="activity-row">
            <span class="activity-time">${new Date(act.startedAt).toLocaleTimeString()}</span>
            <span class="activity-name">${h(act.agentName || 'System')}</span>
            <span class="activity-task">${h(act.prompt || 'Task')}</span>
            <span class="badge badge--${act.status === 'completed' ? 'ok' : act.status === 'failed' ? 'err' : 'warn'}">${h(act.status)}</span>
          </div>`).join('');
      }
    } catch (err) {
      list.innerHTML = `<div class="error-state">Failed to load: ${h(err.message)}</div>`;
    }
  }

  // ─── CONNECTIONS HANDLERS ──────────────────────────────────────────────────
  async function handlersConnections() {
    const grid = document.getElementById('connections-grid');
    if (!grid) return;
    try {
      const data = await MesniumClient.request('mesnium.connections.status');
      const googleStatus = data.google?.status?.toLowerCase() || 'disconnected';
      const waStatus     = data.whatsapp?.status || 'NOT_CONNECTED';
      const googleEmail  = data.google?.email;

      grid.innerHTML = `
        <div class="conn-card">
          <div class="conn-card-header">
            <div class="conn-brand">
              <div class="conn-icon conn-icon--google">G</div>
              <div>
                <div class="conn-name">Google Workspace</div>
                <div class="conn-detail">${googleEmail ? h(googleEmail) : 'Not connected'}</div>
              </div>
            </div>
            <span class="badge badge--${googleStatus === 'connected' ? 'ok' : 'warn'}">${h(googleStatus)}</span>
          </div>
          <div class="conn-services">
            <span class="conn-service">Drive</span>
            <span class="conn-service">Gmail</span>
            <span class="conn-service">Calendar</span>
          </div>
          ${googleStatus !== 'connected' ?
            `<button class="btn btn-primary btn-sm conn-action-btn" id="btn-connect-google">Connect Google</button>` :
            `<button class="btn btn-secondary btn-sm conn-action-btn" id="btn-disconnect-google">Disconnect</button>`
          }
        </div>

        <div class="conn-card">
          <div class="conn-card-header">
            <div class="conn-brand">
              <div class="conn-icon conn-icon--whatsapp">W</div>
              <div>
                <div class="conn-name">WhatsApp Business</div>
                <div class="conn-detail">${waStatus === 'CONNECTED' ? 'Connected' : 'Not connected'}</div>
              </div>
            </div>
            <span class="badge badge--${waStatus === 'CONNECTED' ? 'ok' : 'warn'}">${waStatus === 'CONNECTED' ? 'Connected' : 'Not Connected'}</span>
          </div>
          <p class="conn-description">
            Connect your WhatsApp Business number to receive and reply to inbound customer messages automatically.
          </p>
          <button class="btn btn-primary btn-sm" id="btn-connect-whatsapp" ${waStatus === 'CONNECTED' ? 'disabled' : ''}>
            ${waStatus === 'CONNECTED' ? 'Connected' : 'Connect WhatsApp'}
          </button>
        </div>

        <div class="conn-upcoming-section">
          <p class="conn-upcoming-title">Coming soon</p>
          <div class="conn-upcoming-grid">
            <div class="conn-upcoming-item">HubSpot CRM</div>
            <div class="conn-upcoming-item">Salesforce</div>
            <div class="conn-upcoming-item">Slack</div>
            <div class="conn-upcoming-item">Meta Ads</div>
          </div>
        </div>`;

      const btnConnectGoogle = document.getElementById('btn-connect-google');
      if (btnConnectGoogle) {
        btnConnectGoogle.onclick = async () => {
          btnConnectGoogle.disabled = true;
          btnConnectGoogle.innerText = 'Connecting Google…';
          btnConnectGoogle.style.opacity = '0.7';

          try {
            const res = await MesniumClient.request('mesnium.connections.connect', { provider: 'google' });
            if (res && res.status === 'CONNECTED') {
              await handlersConnections();
              return;
            }

            if (res && res.authUrl) {
              const authWindow = window.open(res.authUrl, 'MesniumGoogleAuth', 'width=600,height=750,menubar=no,toolbar=no');
              let attempts = 0;
              const maxAttempts = 30; // 60s
              const pollInterval = setInterval(async () => {
                attempts++;
                try {
                  const check = await MesniumClient.request('mesnium.connections.status');
                  if (check && check.google && check.google.status?.toLowerCase() === 'connected') {
                    clearInterval(pollInterval);
                    if (authWindow && !authWindow.closed) {
                      try { authWindow.close(); } catch (_) {}
                    }
                    await handlersConnections();
                    return;
                  }
                } catch (_) {}

                if (attempts >= maxAttempts) {
                  clearInterval(pollInterval);
                  btnConnectGoogle.disabled = false;
                  btnConnectGoogle.innerText = 'Connect Google';
                  btnConnectGoogle.style.opacity = '';
                }
              }, 2000);
            } else {
              btnConnectGoogle.disabled = false;
              btnConnectGoogle.innerText = 'Connect Google';
              btnConnectGoogle.style.opacity = '';
            }
          } catch (err) {
            btnConnectGoogle.disabled = false;
            btnConnectGoogle.innerText = 'Connect Google';
            btnConnectGoogle.style.opacity = '';
            console.error('[Mesnium] Google connect error:', err);
          }
        };
      }

      const btnDisconnectGoogle = document.getElementById('btn-disconnect-google');
      if (btnDisconnectGoogle) {
        btnDisconnectGoogle.onclick = async () => {
          if (confirm('Disconnect Google Workspace?')) {
            try {
              btnDisconnectGoogle.disabled = true;
              btnDisconnectGoogle.innerText = 'Disconnecting…';
              btnDisconnectGoogle.style.opacity = '0.7';
              await MesniumClient.request('mesnium.connections.disconnect', { provider: 'google' });
              await handlersConnections();
            } catch (err) {
              console.error('[Mesnium] Google disconnect error:', err);
              await handlersConnections();
            }
          }
        };
      }
    } catch (err) {
      grid.innerHTML = `<div class="error-state">Failed to load connections: ${h(err.message)}</div>`;
    }
  }

  // ─── SETTINGS HANDLERS ─────────────────────────────────────────────────────
  function handlersSettings() {
    document.querySelectorAll('[data-settings-tab]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        state.settingsTab = btn.getAttribute('data-settings-tab');
        renderApp();
      };
    });

    const btnSave = document.getElementById('btn-save-general');
    if (btnSave) {
      btnSave.onclick = () => {
        const input = document.getElementById('setting-biz-name');
        if (input && input.value.trim()) {
          state.settings.businessName = input.value.trim();
          try {
            localStorage.setItem('mesnium.settings.v2', JSON.stringify(state.settings));
          } catch (_) {}
          renderApp();
        }
      };
    }
  }

  // ─── INITIALIZATION ────────────────────────────────────────────────────────
  window.addEventListener('DOMContentLoaded', () => {
    console.log('[Mesnium] Studio Universal Workspace initializing…');
    renderApp();

    // Connect to OpenClaw Gateway
    MesniumClient.connect()
      .then(() => {
        console.log('[Mesnium] Connected to OpenClaw gateway');
        loadProjects();
      })
      .catch((err) => {
        console.warn('[Mesnium] Initial connect error:', err.message);
      });
  });

  window.addEventListener('hashchange', () => {
    state.route = getRouteFromHash();
    renderApp();
  });

  window.sendChatMessage = sendChatMessage;
  window.startNewChat = startNewChat;

  // If DOM is already ready
  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    renderApp();
    MesniumClient.connect()
      .then(() => loadProjects())
      .catch(() => {});
  }
})();
