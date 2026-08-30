/**
 * MESNIUM STUDIO — PHASE 16 PRODUCT EXPERIENCE
 *
 * Stage 1 — Application Shell
 *   ✓ Correct navigation IA
 *   ✓ Sidebar: Overview / Chat / Inbox / Work / Knowledge / Activity | Connections | Settings
 *   ✓ Engine connection status wired to real WebSocket
 *   ✓ Every surface renders an honest empty / loading / error state
 *   ✓ No fake data, no mock records, no broken buttons
 *   ✓ All buttons are either wired to a real handler or clearly disabled as "Coming Soon"
 *
 * Stage 2 — Real Chat (mesnium.agents.run)
 * Stage 3 — File Attachment + Processing
 * Stage 4 — Real Work View (automations + approvals)
 * Stage 5 — Real Inbox
 * Stage 6 — Knowledge upload + search
 * Stage 7 — Connections real status
 * Stage 8 — Settings persist
 * Stage 9 — Visual polish
 */

/* No external imports — self-contained raw WebSocket implementation below */

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
    inbox:       { title: 'Inbox',        icon: 'inbox' },
    work:        { title: 'Work',         icon: 'zap' },
    knowledge:   { title: 'Knowledge',    icon: 'book-open' },
    activity:    { title: 'Activity',     icon: 'activity' },
    connections: { title: 'Connections',  icon: 'link' },
    settings:    { title: 'Settings',     icon: 'settings' },
  };

  // ─── WEBSOCKET RPC CLIENT (self-contained, with real-time event streaming) ──
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
    settings: { businessName: 'My Business' },
    chat: {
      thread: [],          // [{ id, role: 'user'|'assistant', text, attachments: [], sources: [], _thinking, _error, ts }]
      pendingFiles: [],    // [{ id, name, size, type, base64 }]
      isSending: false,
      activeRunId: null,
      sessionKey: 'main',
      loaded: false
    },
    voice: {
      listening: false,
      speaking: false,
      recognition: null,
      status: 'idle'
    },
    work: {
      tab: 'all',          // 'all'|'running'|'scheduled'|'automated'|'completed'|'needs_approval'
    },
  };

  // Persist settings
  try {
    const saved = localStorage.getItem('mesnium.settings.v2');
    if (saved) Object.assign(state.settings, JSON.parse(saved));
  } catch (_) {}

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

  window.navigateTo = function (route) {
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
    };
    const paths = icons[name] || '';
    return `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  }

  // ─── CHAT UTILITIES & MARKDOWN FORMATTER ────────────────────────────────────
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

  function renderMarkdown(raw) {
    if (!raw) return '';
    let text = String(raw);

    // Escape HTML special characters
    const escapeHtml = (str) => str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // 1. Code blocks (```lang ... ```)
    const codeBlocks = [];
    text = text.replace(/```([a-zA-Z0-9_-]*)\n([\s\S]*?)```/g, (match, lang, code) => {
      const idx = codeBlocks.length;
      codeBlocks.push(`<pre class="code-block"><code class="language-${escapeHtml(lang)}">${escapeHtml(code.trim())}</code></pre>`);
      return `@@CODE_BLOCK_${idx}@@`;
    });

    // 2. Markdown tables
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

    // 3. Inline formatting
    text = text.replace(/`([^`]+)`/g, (match, code) => `<code class="inline-code">${escapeHtml(code)}</code>`);
    text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    text = text.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    text = text.replace(/\*([^*]+)\*/g, '<em>$1</em>');
    text = text.replace(/_([^_]+)_/g, '<em>$1</em>');

    // 4. Headings
    text = text.replace(/^### (.*$)/gim, '<h4 class="msg-heading">$1</h4>');
    text = text.replace(/^## (.*$)/gim, '<h3 class="msg-heading">$1</h3>');
    text = text.replace(/^# (.*$)/gim, '<h2 class="msg-heading">$1</h2>');

    // 5. Bullet & numbered lists
    text = text.replace(/^\s*[-*•]\s+(.*$)/gim, '<li class="msg-list-item">$1</li>');
    text = text.replace(/^\s*(\d+)\.\s+(.*$)/gim, '<li class="msg-list-item msg-list-item--num">$1. $2</li>');
    text = text.replace(/(<li[\s\S]*?<\/li>(\n|$))+/g, '<ul class="msg-list">$&</ul>');

    // 6. Paragraphs and line breaks
    const paragraphs = text.split(/\n{2,}/);
    text = paragraphs.map(p => {
      p = p.trim();
      if (!p) return '';
      if (p.startsWith('<h') || p.startsWith('<pre') || p.startsWith('<div class="msg-table-wrap"') || p.startsWith('<ul') || p.startsWith('@@CODE_BLOCK_')) {
        return p;
      }
      return `<p class="msg-p">${p.replace(/\n/g, '<br>')}</p>`;
    }).filter(Boolean).join('');

    // Re-inject code blocks
    text = text.replace(/@@CODE_BLOCK_(\d+)@@/g, (match, idx) => codeBlocks[parseInt(idx, 10)] || '');

    return text;
  }

  function formatAssistantMessage(raw) {
    if (!raw) return '';
    let text = String(raw).trim();

    // 1. If raw text happens to be an unparsed JSON string object from a tool/RPC payload, extract only user-facing text
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

    // 2. Strict Presentation Boundary — strip any accidental leakage of internal test filenames, variables, or database internals
    text = text
      .replace(/temp_chat_params\.json/gi, '')
      .replace(/capability_test_results\.json/gi, '')
      .replace(/agentId[:=]\s*["']?[\w-]+["']?/gi, '')
      .replace(/sessionKey[:=]\s*["']?[\w-:]+["']?/gi, '')
      .replace(/\b(BM25|FTS5|RRF)\b/g, 'indexed search')
      .replace(/SQLite\s*vector/gi, 'knowledge database');

    return renderMarkdown(text.trim());
  }

  // ─── SIDEBAR ───────────────────────────────────────────────────────────────
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
      <aside class="sidebar ${collapsed ? 'sidebar--collapsed' : ''}">
        <div class="sidebar-brand">
          <div class="brand-logo-wrap" onclick="window.navigateTo('overview')" style="cursor:pointer;">
            <img src="${collapsed ? BRAND_ICON : BRAND_LOGO}" alt="${BRAND_NAME}" class="brand-img" />
          </div>
          <button class="sidebar-toggle" id="btn-sidebar-toggle" title="Toggle sidebar (Ctrl+B)">
            <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/>
              <line x1="9" y1="3" x2="9" y2="21"/>
            </svg>
          </button>
        </div>

        <nav class="sidebar-nav">
          ${collapsed ? '' : '<div class="nav-section-label">WORKSPACE</div>'}
          ${navItem('overview',  'Overview',  'home')}
          ${navItem('chat',      'Chat',      'message-circle')}
          ${navItem('inbox',     'Inbox',     'inbox')}
          ${navItem('work',      'Work',      'zap')}
          ${navItem('knowledge', 'Knowledge', 'book-open')}
          ${navItem('activity',  'Activity',  'activity')}
          ${collapsed ? '<div style="height:12px;"></div>' : '<div class="nav-section-label" style="margin-top:12px;">BUSINESS</div>'}
          ${navItem('connections', 'Connections', 'link')}
        </nav>

        <div class="sidebar-footer">
          ${navItem('settings', 'Settings', 'settings')}
          <div class="engine-status-pill">
            <span class="engine-dot dot--amber" id="engine-status-dot"></span>
            ${collapsed ? '' : '<span class="engine-status-text" id="engine-status-label">Connecting…</span>'}
          </div>
        </div>
      </aside>`;
  }

  // ─── TOPBAR ────────────────────────────────────────────────────────────────
  function renderTopbar() {
    const routeTitle = ROUTES[state.route]?.title || 'Overview';
    return `
      <header class="topbar">
        <div class="topbar-left">
          <span class="topbar-breadcrumb">${h(state.settings.businessName)}</span>
          <span class="topbar-sep">/</span>
          <span class="topbar-page">${routeTitle}</span>
        </div>
        <div class="topbar-right">
          <div class="topbar-ws-badge">${h(state.settings.businessName)}</div>
        </div>
      </header>`;
  }

  // ─── SURFACE ROUTER ────────────────────────────────────────────────────────
  function renderSurface() {
    switch (state.route) {
      case 'overview':    return surfaceOverview();
      case 'chat':        return surfaceChat();
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
    return `
      <div class="surface surface-chat" id="surface-chat">
        <div class="chat-stream" id="chat-stream">
          ${thread.length === 0 ? `
            <div class="chat-welcome">
              <div class="chat-welcome-icon">✦</div>
              <h2 class="chat-welcome-title">Ask Mesnium anything</h2>
              <p class="chat-welcome-sub">Chat with your business data, run tasks, ask questions, or upload a document to analyse it.</p>
            </div>
          ` : thread.map(renderChatBubble).join('')}
        </div>

        <div class="chat-composer-wrap">
          <div class="chat-composer-inner">
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
                placeholder="Ask Mesnium anything…"
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
            <h1 class="surface-title">Knowledge</h1>
            <p class="surface-sub">Business documents, spreadsheets, and files Mesnium can reference and reason over.</p>
          </div>
          <button class="btn btn-primary" id="btn-add-knowledge">
            ${icon('plus', 16)} Add Knowledge
          </button>
        </div>

        <div class="knowledge-search-bar">
          ${icon('book-open', 18)}
          <input
            type="text"
            id="knowledge-search-input"
            class="knowledge-search-input"
            placeholder="Search business knowledge…"
            aria-label="Search knowledge" />
        </div>

        <div id="knowledge-results">
          <div class="knowledge-docs-list" id="knowledge-docs-list">
            <div class="empty-state">
              <div class="empty-icon">📚</div>
              <h3>No documents indexed yet</h3>
              <p>Add a folder or file to start building your business knowledge base.</p>
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
        <div class="settings-tabs">
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
            <p class="settings-note">Assistant behavior settings will be available here.</p>
          </div>`;
      case 'notifications':
        return `
          <div class="settings-card">
            <p class="settings-note">Notification preferences will be available here.</p>
          </div>`;
      case 'advanced':
        return `
          <div class="settings-card">
            <div class="form-field">
              <label class="form-label">Storage Engine</label>
              <input type="text" class="form-input" value="SQLite WAL + FTS5 + sqlite-vec" readonly />
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

  // ─── MAIN RENDER ───────────────────────────────────────────────────────────
  function renderApp() {
    console.log('[Mesnium] renderApp starting, route:', state.route);
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
      attachSurfaceHandlers();
      console.log('[Mesnium] renderApp completed successfully');
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

  // ─── SURFACE HANDLERS ──────────────────────────────────────────────────────
  function attachSurfaceHandlers() {
    const r = state.route;

    // Sidebar toggle
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = (e) => {
        e.preventDefault();
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderApp();
      };
    }

    if (r === 'overview') handlersOverview();
    if (r === 'chat')     handlersChat();
    if (r === 'inbox')    handlersInbox();
    if (r === 'work')     handlersWork();
    if (r === 'knowledge') handlersKnowledge();
    if (r === 'activity') handlersActivity();
    if (r === 'connections') handlersConnections();
    if (r === 'settings') handlersSettings();
  }

  // ─── OVERVIEW HANDLERS ─────────────────────────────────────────────────────
  function handlersOverview() {
    const btnChat = document.getElementById('btn-overview-open-chat');
    if (btnChat) btnChat.onclick = () => window.navigateTo('chat');

    const qChat = document.getElementById('btn-quick-chat');
    if (qChat) qChat.onclick = () => window.navigateTo('chat');
    const qWork = document.getElementById('btn-quick-work');
    if (qWork) qWork.onclick = () => window.navigateTo('work');
    const qKnowledge = document.getElementById('btn-quick-knowledge');
    if (qKnowledge) qKnowledge.onclick = () => window.navigateTo('knowledge');
    const qConn = document.getElementById('btn-quick-connections');
    if (qConn) qConn.onclick = () => window.navigateTo('connections');

    // Load real data from backend
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
        const subs = ['ov-inbox-sub', 'ov-work-sub', 'ov-knowledge-sub', 'ov-approvals-sub'];
        subs.forEach(id => {
          const el = document.getElementById(id);
          if (el) el.textContent = `Engine unavailable: ${err.message}`;
        });
      });
  }

  // ─── VOICE INPUT & SPEECH SYNTHESIS ───────────────────────────────────────
  function toggleVoiceInput() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Microphone voice input is not supported in this browser. You can continue using text chat.");
      return;
    }

    if (state.voice.listening) {
      if (state.voice.recognition) {
        state.voice.recognition.stop();
      }
      state.voice.listening = false;
      state.voice.status = 'idle';
      updateVoiceUI();
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        state.voice.listening = true;
        state.voice.status = 'listening';
        state.voice.recognition = recognition;
        updateVoiceUI();
      };

      recognition.onresult = (event) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }
        const textarea = document.getElementById('chat-input');
        if (textarea && transcript) {
          textarea.value = transcript;
          textarea.style.height = 'auto';
          textarea.style.height = Math.min(textarea.scrollHeight, 160) + 'px';
        }
      };

      recognition.onerror = (event) => {
        console.warn('[Mesnium Voice] Recognition error:', event.error);
        state.voice.listening = false;
        state.voice.status = 'idle';
        updateVoiceUI();
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          alert("Microphone access isn't available. You can continue using text chat.");
        }
      };

      recognition.onend = () => {
        state.voice.listening = false;
        state.voice.status = 'idle';
        updateVoiceUI();
      };

      recognition.start();
    } catch (err) {
      console.warn('[Mesnium Voice] Init error:', err);
      state.voice.listening = false;
      state.voice.status = 'idle';
      updateVoiceUI();
      alert("Microphone access isn't available. You can continue using text chat.");
    }
  }

  function updateVoiceUI() {
    const micBtn = document.getElementById('btn-composer-mic');
    if (micBtn) {
      if (state.voice.listening) {
        micBtn.classList.add('btn-mic--active');
        micBtn.setAttribute('title', 'Listening… (Click to stop)');
      } else {
        micBtn.classList.remove('btn-mic--active');
        micBtn.setAttribute('title', 'Voice Input / Dictation');
      }
    }
  }

  function speakAssistantMessage(text) {
    if (typeof window === 'undefined' || !window.speechSynthesis) {
      console.warn('[Mesnium Voice] Speech synthesis not supported in this browser.');
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

    // Load past conversation history on first chat visit
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
        e.preventDefault();
        e.stopPropagation();
        dragCounter++;
        chatSurface.classList.add('drag-active');
      };

      chatSurface.ondragover = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!chatSurface.classList.contains('drag-active')) {
          chatSurface.classList.add('drag-active');
        }
      };

      chatSurface.ondragleave = (e) => {
        e.preventDefault();
        e.stopPropagation();
        dragCounter--;
        if (dragCounter <= 0) {
          dragCounter = 0;
          chatSurface.classList.remove('drag-active');
        }
      };

      chatSurface.ondrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
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
        alert(`File "${file.name}" is too large (${formatFileSize(file.size)}). Maximum supported file size is 25 MB.`);
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
        if (readCount === totalToRead) {
          renderApp();
        }
      };

      reader.onerror = () => {
        console.error('[Mesnium] Failed to read file:', file.name);
        readCount++;
        if (readCount === totalToRead) {
          renderApp();
        }
      };

      reader.readAsDataURL(file);
    });
  }

  async function loadChatHistory() {
    try {
      const historyRes = await MesniumClient.request('chat.history', {
        sessionKey: state.chat.sessionKey || 'main',
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

          if (!text.trim()) return;

          // Strict Presentation Boundary: Filter out internal test commands, diagnostic probes, or leaking test filenames
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

  async function sendChatMessage() {
    const textarea = document.getElementById('chat-input');
    const text = textarea ? textarea.value.trim() : '';
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

    // Clear composer and staged files
    state.chat.pendingFiles = [];
    if (textarea) {
      textarea.value = '';
      textarea.style.height = 'auto';
    }

    // Push assistant message placeholder with thinking indicator
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

    // Prepare attachments for OpenClaw chat.send RPC
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

      // Update friendly tool activity status if tools are being used
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
      const defaultPrompt = pendingFiles.length > 0
        ? `Please analyse the attached ${pendingFiles.length === 1 ? 'file: ' + pendingFiles[0].name : pendingFiles.length + ' files'}.`
        : '';

      const sendRes = await MesniumClient.request('chat.send', {
        sessionKey: state.chat.sessionKey || 'main',
        message: userText || defaultPrompt,
        deliver: false,
        idempotencyKey: runId,
        ...(rpcAttachments.length > 0 ? { attachments: rpcAttachments } : {})
      });

      console.log('[Mesnium] chat.send dispatched successfully:', sendRes);

      // 60s timeout safety guard
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
        astMsg.text = `I ran into a problem completing that request. Please try again.`;
      }
      cleanup();
      renderChatStream();
    }
  }

  function renderChatStream() {
    const stream = document.getElementById('chat-stream');
    if (!stream) return;
    const thread = state.chat.thread;
    if (thread.length === 0) {
      stream.innerHTML = `
        <div class="chat-welcome">
          <div class="chat-welcome-icon">✦</div>
          <h2 class="chat-welcome-title">Ask Mesnium anything</h2>
          <p class="chat-welcome-sub">Chat with your business data, run tasks, ask questions, or upload a document to analyse it.</p>
        </div>`;
    } else {
      stream.innerHTML = thread.map(msg => renderChatBubble(msg)).join('');
    }
    stream.scrollTop = stream.scrollHeight;
  }

  // ─── INBOX HANDLERS ────────────────────────────────────────────────────────
  function handlersInbox() {
    const btnConnect = document.getElementById('btn-inbox-connect-channel');
    if (btnConnect) btnConnect.onclick = () => window.navigateTo('connections');
  }

  // ─── WORK HANDLERS ─────────────────────────────────────────────────────────
  function handlersWork() {
    // Tab switching
    document.querySelectorAll('[data-work-tab]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        state.work.tab = btn.getAttribute('data-work-tab');
        // Update tab active state without full re-render
        document.querySelectorAll('.work-tab').forEach(b => {
          b.classList.toggle('work-tab--active', b === btn);
          b.setAttribute('aria-selected', b === btn ? 'true' : 'false');
        });
        loadWorkContent();
      };
    });

    // Create automation button
    const btnCreate = document.getElementById('btn-create-automation');
    if (btnCreate) btnCreate.onclick = () => openCreateAutomationModal();

    // Load initial content
    loadWorkContent();
  }

  async function loadWorkContent() {
    const container = document.getElementById('work-content');
    if (!container) return;
    container.innerHTML = `<div class="work-loading">Loading…</div>`;

    try {
      const [autoData, approvalsData] = await Promise.all([
        MesniumClient.request('mesnium.automations.list'),
        MesniumClient.request('mesnium.approvals.list'),
      ]);

      const automations = autoData.automations || [];
      const approvals   = approvalsData.approvals || [];

      let items = [];
      const tab = state.work.tab;

      if (tab === 'needs_approval') {
        items = approvals;
        if (items.length === 0) {
          container.innerHTML = `<div class="empty-state empty-state--centered"><div class="empty-icon">✅</div><h3>All clear</h3><p>No actions are waiting for your approval.</p></div>`;
          return;
        }
        container.innerHTML = items.map(a => renderApprovalCard(a)).join('');
        // Bind approve/reject
        items.forEach(a => {
          const appBtn = document.getElementById(`btn-approve-${a.id}`);
          const rejBtn = document.getElementById(`btn-reject-${a.id}`);
          if (appBtn) appBtn.onclick = () => approveAction(a.id);
          if (rejBtn) rejBtn.onclick = () => rejectAction(a.id);
        });
        return;
      }

      if (tab === 'all' || tab === 'automated' || tab === 'scheduled') {
        items = automations;
      } else if (tab === 'running') {
        items = automations.filter(a => a.status === 'active');
      } else if (tab === 'completed') {
        items = []; // Will come from activity ledger in a later stage
      }

      if (items.length === 0) {
        container.innerHTML = `
          <div class="empty-state empty-state--centered">
            <div class="empty-icon">⚡</div>
            <h3>No ${tab === 'all' ? '' : tab} work found</h3>
            <p>Create an automation to start running tasks automatically.</p>
          </div>`;
        return;
      }

      container.innerHTML = items.map(auto => renderAutomationCard(auto)).join('');
      items.forEach(auto => {
        const runBtn   = document.getElementById(`btn-run-${auto.id}`);
        const pauseBtn = document.getElementById(`btn-pause-${auto.id}`);
        if (runBtn)   runBtn.onclick   = () => runAutomation(auto.id);
        if (pauseBtn) pauseBtn.onclick = () => toggleAutomationPause(auto.id);
      });
    } catch (err) {
      container.innerHTML = `<div class="error-state"><p>Could not load work: ${h(err.message)}</p></div>`;
    }
  }

  function renderAutomationCard(auto) {
    const isActive = auto.status === 'active';
    return `
      <div class="work-card" id="work-card-${auto.id}">
        <div class="work-card-header">
          <div class="work-card-title-group">
            <h3 class="work-card-title">${h(auto.name)}</h3>
            <span class="work-card-trigger">${h(auto.trigger?.schedule?.label || auto.trigger?.type || 'Manual')}</span>
          </div>
          <span class="badge badge--${isActive ? 'ok' : 'warn'}" id="badge-${auto.id}">${isActive ? 'Active' : 'Paused'}</span>
        </div>
        <div id="work-card-output-${auto.id}" class="work-card-output" style="display:none;"></div>
        <div class="work-card-footer">
          <button class="btn btn-secondary btn-sm" id="btn-run-${auto.id}">Run Now</button>
          <button class="btn btn-ghost btn-sm" id="btn-pause-${auto.id}">${isActive ? 'Pause' : 'Resume'}</button>
        </div>
      </div>`;
  }

  function renderApprovalCard(a) {
    return `
      <div class="approval-card" id="approval-card-${a.id}">
        <div class="approval-header">
          <div>
            <h3 class="approval-title">${h(a.title || a.actionType)}</h3>
            <p class="approval-sub">Proposed by <strong>${h(a.agentName || 'Assistant')}</strong> · ${h(a.actionType)}</p>
          </div>
          <span class="badge badge--warn">Needs Approval</span>
        </div>
        <div class="approval-payload">${h(typeof a.payload === 'object' ? JSON.stringify(a.payload, null, 2) : String(a.payload || ''))}</div>
        <div class="approval-footer">
          <button class="btn btn-secondary" id="btn-reject-${a.id}">Reject</button>
          <button class="btn btn-primary" id="btn-approve-${a.id}">Approve & Execute</button>
        </div>
      </div>`;
  }

  async function runAutomation(autoId) {
    const out = document.getElementById(`work-card-output-${autoId}`);
    if (out) { out.style.display = 'block'; out.textContent = 'Running…'; }
    try {
      const res = await MesniumClient.request('mesnium.automations.run', { id: autoId });
      if (out) {
        if (res.status === 'waiting_approval') {
          out.textContent = 'Paused — action waiting for your approval in the Needs Approval tab.';
        } else {
          out.textContent = `Completed in ${res.durationMs ?? 0}ms.`;
        }
      }
    } catch (err) {
      if (out) out.textContent = `Error: ${err.message}`;
    }
  }

  async function toggleAutomationPause(autoId) {
    const pauseBtn = document.getElementById(`btn-pause-${autoId}`);
    const badge    = document.getElementById(`badge-${autoId}`);
    const isPaused = pauseBtn?.textContent.trim() === 'Resume';
    try {
      if (isPaused) {
        await MesniumClient.request('mesnium.automations.resume', { id: autoId });
        if (pauseBtn) pauseBtn.textContent = 'Pause';
        if (badge) { badge.textContent = 'Active'; badge.className = 'badge badge--ok'; }
      } else {
        await MesniumClient.request('mesnium.automations.pause', { id: autoId });
        if (pauseBtn) pauseBtn.textContent = 'Resume';
        if (badge) { badge.textContent = 'Paused'; badge.className = 'badge badge--warn'; }
      }
    } catch (err) {
      showToast(`Error: ${err.message}`, 'error');
    }
  }

  async function approveAction(actionId) {
    const card = document.getElementById(`approval-card-${actionId}`);
    if (card) card.innerHTML = '<div class="card-processing">Authorizing…</div>';
    try {
      await MesniumClient.request('mesnium.approvals.approve', { id: actionId, approver: 'Operator' });
      if (card) card.innerHTML = '<div class="card-done">✓ Action approved and executed.</div>';
    } catch (err) {
      if (card) card.innerHTML = `<div class="card-error">Approval failed: ${h(err.message)}</div>`;
    }
  }

  async function rejectAction(actionId) {
    const card = document.getElementById(`approval-card-${actionId}`);
    if (card) card.innerHTML = '<div class="card-processing">Rejecting…</div>';
    try {
      await MesniumClient.request('mesnium.approvals.reject', { id: actionId, reason: 'Rejected by operator' });
      if (card) card.innerHTML = '<div class="card-done muted">Action rejected.</div>';
    } catch (err) {
      if (card) card.innerHTML = `<div class="card-error">Rejection failed: ${h(err.message)}</div>`;
    }
  }

  // ─── KNOWLEDGE HANDLERS ────────────────────────────────────────────────────
  function handlersKnowledge() {
    const btnAdd = document.getElementById('btn-add-knowledge');
    if (btnAdd) btnAdd.onclick = () => openAddKnowledgeModal();

    const searchInput = document.getElementById('knowledge-search-input');
    let debounceTimer = null;
    if (searchInput) {
      searchInput.oninput = () => {
        clearTimeout(debounceTimer);
        debounceTimer = setTimeout(() => {
          const q = searchInput.value.trim();
          if (q) {
            searchKnowledge(q);
          } else {
            loadKnowledgeDocs();
          }
        }, 300);
      };
    }

    loadKnowledgeDocs();
  }

  async function loadKnowledgeDocs() {
    const container = document.getElementById('knowledge-docs-list');
    if (!container) return;
    container.innerHTML = '<div class="knowledge-loading">Loading…</div>';
    try {
      const data = await MesniumClient.request('mesnium.knowledge.sources');
      const sources = data.sources || [];
      if (sources.length === 0) {
        container.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">📚</div>
            <h3>No documents indexed yet</h3>
            <p>Add a folder or file to start building your business knowledge base.</p>
          </div>`;
      } else {
        container.innerHTML = sources.map(s => `
          <div class="knowledge-source-row">
            <span class="knowledge-source-name">${h(s.name || s.path)}</span>
            <span class="knowledge-source-type badge badge--ok">${h(s.type || 'local')}</span>
          </div>`).join('');
      }
    } catch (err) {
      container.innerHTML = `<div class="error-state">Failed to load: ${h(err.message)}</div>`;
    }
  }

  async function searchKnowledge(query) {
    const container = document.getElementById('knowledge-docs-list');
    if (!container) return;
    container.innerHTML = '<div class="knowledge-loading">Searching…</div>';
    try {
      const data = await MesniumClient.request('mesnium.knowledge.search', { query, limit: 10 });
      const hits = data.hits || [];
      if (hits.length === 0) {
        container.innerHTML = `<div class="empty-state"><p>No results for "<strong>${h(query)}</strong>"</p></div>`;
      } else {
        container.innerHTML = hits.map(hit => {
          let prov = '';
          if (hit.provenance && typeof hit.provenance === 'object') {
            prov = hit.provenance.sheetName || hit.provenance.section || '';
          } else if (typeof hit.provenance === 'string') {
            prov = hit.provenance;
          }
          return `
            <div class="knowledge-hit-row">
              <div class="hit-filename">${h(hit.filename)}</div>
              ${prov ? `<div class="hit-prov">${h(prov)}</div>` : ''}
              <div class="hit-excerpt">${h((hit.content || '').slice(0, 160))}…</div>
            </div>`;
        }).join('');
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

      grid.innerHTML = `
        <div class="conn-card">
          <div class="conn-card-header">
            <div class="conn-brand">
              <div class="conn-icon conn-icon--google">G</div>
              <div>
                <div class="conn-name">Google Workspace</div>
                <div class="conn-detail">${data.google?.email ? h(data.google.email) : 'Not connected'}</div>
              </div>
            </div>
            <span class="badge badge--${googleStatus === 'connected' ? 'ok' : 'warn'}">${h(googleStatus)}</span>
          </div>
          <div class="conn-services">
            <span class="conn-service">Drive</span>
            <span class="conn-service">Gmail</span>
            <span class="conn-service">Calendar</span>
          </div>
          ${googleStatus !== 'connected' ? `<button class="btn btn-secondary btn-sm conn-action-btn" disabled>Connect Google (coming soon)</button>` : ''}
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
        </div>
      `;

      const btnWa = document.getElementById('btn-connect-whatsapp');
      if (btnWa && waStatus !== 'CONNECTED') {
        btnWa.onclick = () => openWhatsAppModal();
      }
    } catch (err) {
      grid.innerHTML = `<div class="error-state">Failed to load connections: ${h(err.message)}</div>`;
    }
  }

  // ─── SETTINGS HANDLERS ─────────────────────────────────────────────────────
  function handlersSettings() {
    // Settings tab switching
    document.querySelectorAll('[data-settings-tab]').forEach(btn => {
      btn.onclick = (e) => {
        e.preventDefault();
        state.settingsTab = btn.getAttribute('data-settings-tab');
        document.querySelectorAll('.settings-tab').forEach(b => b.classList.toggle('settings-tab--active', b === btn));
        const content = document.getElementById('settings-content');
        if (content) content.innerHTML = renderSettingsTab(state.settingsTab);
        handlersSettings(); // Re-bind after content change
      };
    });

    const btnSave = document.getElementById('btn-save-general');
    if (btnSave) {
      btnSave.onclick = () => {
        const input = document.getElementById('setting-biz-name');
        if (input) {
          state.settings.businessName = input.value.trim() || 'My Business';
          localStorage.setItem('mesnium.settings.v2', JSON.stringify(state.settings));
          showToast('Settings saved');
          // Update topbar
          const topbarBadge = document.querySelector('.topbar-ws-badge');
          if (topbarBadge) topbarBadge.textContent = state.settings.businessName;
        }
      };
    }
  }

  // ─── MODALS ────────────────────────────────────────────────────────────────
  function openModal(html) {
    const root = document.getElementById('mesnium-modal-root');
    if (!root) return;
    root.innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal-box" id="modal-box">
          ${html}
        </div>
      </div>`;
    document.getElementById('modal-backdrop').onclick = (e) => {
      if (e.target.id === 'modal-backdrop') closeModal();
    };
  }

  window.closeModal = function () {
    const root = document.getElementById('mesnium-modal-root');
    if (root) root.innerHTML = '';
  };

  function openCreateAutomationModal() {
    openModal(`
      <div class="modal-header">
        <h3>Create Automation</h3>
        <button class="modal-close" onclick="window.closeModal()">${icon('x', 18)}</button>
      </div>
      <div class="modal-body">
        <div class="form-field">
          <label class="form-label">Automation Name</label>
          <input type="text" id="modal-auto-name" class="form-input" placeholder="e.g. Weekly Sales Summary" />
        </div>
        <div class="form-field">
          <label class="form-label">What should it do?</label>
          <textarea id="modal-auto-prompt" class="form-input" rows="3" placeholder="e.g. Every Monday morning, summarise sales leads from last week"></textarea>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button class="btn btn-primary" id="btn-modal-save-auto">Save Automation</button>
      </div>
    `);
    document.getElementById('btn-modal-save-auto').onclick = submitCreateAutomation;
  }

  async function submitCreateAutomation() {
    const name   = document.getElementById('modal-auto-name')?.value.trim();
    const prompt = document.getElementById('modal-auto-prompt')?.value.trim();
    if (!name) { showToast('Please enter a name.', 'warn'); return; }
    const btn = document.getElementById('btn-modal-save-auto');
    if (btn) { btn.textContent = 'Saving…'; btn.disabled = true; }
    try {
      await MesniumClient.request('mesnium.automations.create', { name, prompt });
      closeModal();
      showToast(`Automation "${name}" created.`);
      loadWorkContent();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
      if (btn) { btn.textContent = 'Save Automation'; btn.disabled = false; }
    }
  }

  function openAddKnowledgeModal() {
    openModal(`
      <div class="modal-header">
        <h3>Add Knowledge Source</h3>
        <button class="modal-close" onclick="window.closeModal()">${icon('x', 18)}</button>
      </div>
      <div class="modal-body">
        <div class="form-field">
          <label class="form-label">Local file or folder path</label>
          <input type="text" id="modal-src-path" class="form-input" placeholder="e.g. C:/Users/.../Documents/reports" />
        </div>
        <p class="form-hint">Supports PDF, DOCX, XLSX, CSV, PPTX, TXT, MD</p>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button class="btn btn-primary" id="btn-modal-index-src">Index Source</button>
      </div>
    `);
    document.getElementById('btn-modal-index-src').onclick = submitAddKnowledge;
  }

  async function submitAddKnowledge() {
    const path = document.getElementById('modal-src-path')?.value.trim();
    if (!path) { showToast('Please enter a path.', 'warn'); return; }
    const btn = document.getElementById('btn-modal-index-src');
    if (btn) { btn.textContent = 'Indexing…'; btn.disabled = true; }
    try {
      await MesniumClient.request('mesnium.knowledge.addSource', { path });
      closeModal();
      showToast('Source added and indexed.');
      loadKnowledgeDocs();
    } catch (err) {
      showToast(`Indexing error: ${err.message}`, 'error');
      if (btn) { btn.textContent = 'Index Source'; btn.disabled = false; }
    }
  }

  function openWhatsAppModal() {
    openModal(`
      <div class="modal-header">
        <h3>Connect WhatsApp Business</h3>
        <button class="modal-close" onclick="window.closeModal()">${icon('x', 18)}</button>
      </div>
      <div class="modal-body">
        <p class="modal-description">
          Connect your WhatsApp Business number to receive and automatically respond to customer inquiries using your business knowledge.
        </p>
        <div class="form-field">
          <label class="form-label">Business Phone Number</label>
          <input type="tel" id="modal-wa-phone" class="form-input" placeholder="+1 (555) 000-0000" />
        </div>
        <div class="notice-box">
          ℹ️ Full WhatsApp Business API integration is coming soon. You'll receive setup instructions at your number.
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn btn-secondary" onclick="window.closeModal()">Cancel</button>
        <button class="btn btn-primary" disabled title="WhatsApp integration coming soon">Request Early Access</button>
      </div>
    `);
  }

  // ─── TOAST ─────────────────────────────────────────────────────────────────
  function showToast(msg, type = 'info') {
    let root = document.getElementById('mesnium-toast-root');
    if (!root) return;
    const id = 'toast-' + Date.now();
    const div = document.createElement('div');
    div.id = id;
    div.className = `toast toast--${type}`;
    div.textContent = msg;
    root.appendChild(div);
    setTimeout(() => {
      div.style.opacity = '0';
      setTimeout(() => div.remove(), 300);
    }, 2800);
  }

  window.showToast = showToast;

  // ─── UTILITIES ─────────────────────────────────────────────────────────────
  function h(str) {
    if (typeof str !== 'string') return String(str ?? '');
    return str.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // ─── GLOBAL CLICK DELEGATOR ────────────────────────────────────────────────
  // Catches any clicks that fall through onclick-based handlers — defensive safety net
  function bootGlobalDelegator() {
    document.addEventListener('click', (e) => {
      const target = e.target.closest('a[href^="#/"], [data-nav]');
      if (target && target.tagName === 'A') {
        // Hash links are handled by hashchange — no extra work needed
        return;
      }
    });
  }

  // ─── BOOTSTRAP ─────────────────────────────────────────────────────────────
  function boot() {
    console.log('[Mesnium] Booting Mesnium Studio UI...');
    try {
      // Suppress legacy OpenClaw UI immediately
      const legacy = document.querySelector('openclaw-app');
      if (legacy) { legacy.style.display = 'none'; legacy.setAttribute('hidden', ''); }

      // Observer to keep suppressing if it tries to re-mount
      if (document.body) {
        new MutationObserver(() => {
          const el = document.querySelector('openclaw-app');
          if (el && el.style.display !== 'none') { el.style.display = 'none'; el.setAttribute('hidden', ''); }
        }).observe(document.body, { childList: true, subtree: true });
      }

      // Start Gateway connection (non-blocking, UI renders immediately)
      MesniumClient.connect().catch(err => {
        console.warn('[Mesnium] Background WS connect failed (UI remains functional):', err.message);
      });

      renderApp();

      window.addEventListener('hashchange', () => {
        console.log('[Mesnium] Hash changed:', window.location.hash);
        renderApp();
      });
      window.addEventListener('popstate', () => {
        console.log('[Mesnium] Popstate changed');
        renderApp();
      });

      // Keyboard shortcut: Ctrl+B / Cmd+B = toggle sidebar
      window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
          e.preventDefault();
          state.sidebarCollapsed = !state.sidebarCollapsed;
          renderApp();
        }
      });

      // Reconnect on tab-focus if disconnected
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && MesniumClient.status !== 'connected') {
          MesniumClient.connect().catch(() => {});
        }
      });

      bootGlobalDelegator();
      console.log('[Mesnium] Boot completed');
    } catch (err) {
      console.error('[Mesnium] Boot Failure:', err);
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

})();
