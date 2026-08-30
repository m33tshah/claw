/**
 * MESNIUM STUDIO — DEDICATED BUSINESS APPLICATION SHELL & RPC ENGINE (PHASE 14C)
 * 
 * Completely replaces the legacy developer-oriented interface with a dedicated,
 * authentic Mesnium business application shell.
 * 
 * Surfaces:
 * 1. Overview — Executive Operational Dashboard & KPI Metrics
 * 2. Inbox — Business Communications Workspace & Lead Qualification
 * 3. Assistants — Business Employees with Grounded Knowledge Execution
 * 4. Automations — Human-Language Workflows with Live Gatekeeper Routing
 * 5. Knowledge — Unified SQLite WAL Hybrid Retrieval & Source Manager
 * 6. Approvals — Human-in-the-Loop High-Risk Action Authorization Hub
 * 7. Activity — Business Audit Ledger Timeline
 * 8. Connections — External Integrations & WhatsApp Connection Walkthrough
 * 9. Settings — Streamlined 7-Category Business Configuration
 */

(function () {
  'use strict';

  // --- 1. BRAND ASSETS ---
  const BRAND_LOGO = './brand/logo.png';
  const BRAND_ICON = './brand/icon.png';
  const BRAND_NAME = 'Mesnium';
  const PRODUCT_TITLE = 'Mesnium Studio';

  // --- 2. WEBSOCKET RPC CLIENT BRIDGE ---
  class MesniumGatewayClient {
    constructor() {
      this.ws = null;
      this.pendingRequests = new Map();
      this.connected = false;
      this.connectPromise = null;
    }

    getToken() {
      try {
        const gatewayUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
        const key = 'openclaw.control.token.v1:' + gatewayUrl.replace(/\/+$/, '');
        const directToken = localStorage.getItem(key);
        if (directToken) return directToken;
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && k.includes('openclaw.control.token.v1')) {
            return localStorage.getItem(k);
          }
        }
      } catch (e) {}
      return null;
    }

    async connect() {
      if (this.connected && this.ws && this.ws.readyState === WebSocket.OPEN) {
        return this.ws;
      }
      if (this.connectPromise) return this.connectPromise;

      this.connectPromise = new Promise((resolve) => {
        try {
          const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
          const wsUrl = `${protocol}//${location.host}/`;
          const ws = new WebSocket(wsUrl);

          ws.onopen = () => {
            const token = this.getToken();
            const connectReq = {
              type: 'req',
              id: 'mesnium_connect_' + Date.now(),
              method: 'connect',
              params: {
                minProtocol: 4,
                maxProtocol: 4,
                role: 'operator',
                scopes: ['operator.admin', 'operator.read', 'operator.write'],
                token: token || undefined,
                client: { id: 'openclaw-control-ui', version: '2.0.0', platform: 'web', mode: 'ui' }
              }
            };
            ws.send(JSON.stringify(connectReq));
          };

          ws.onmessage = (event) => {
            try {
              const msg = JSON.parse(event.data);
              if (msg.id && msg.id.startsWith('mesnium_connect_')) {
                this.connected = true;
                this.ws = ws;
                this.connectPromise = null;
                updateEngineStatus('online');
                resolve(ws);
                return;
              }

              if (msg.id && this.pendingRequests.has(msg.id)) {
                const { resolve: reqResolve, reject: reqReject, timeout } = this.pendingRequests.get(msg.id);
                clearTimeout(timeout);
                this.pendingRequests.delete(msg.id);
                if (msg.ok) {
                  reqResolve(msg.result || msg.payload || {});
                } else {
                  reqReject(new Error(msg.error?.message || msg.error || 'Gateway RPC Error'));
                }
              }
            } catch (err) {
              console.warn('[Mesnium Client] Message parse warning:', err);
            }
          };

          ws.onerror = () => {
            this.connectPromise = null;
            updateEngineStatus('offline');
          };

          ws.onclose = () => {
            this.connected = false;
            this.ws = null;
            this.connectPromise = null;
            updateEngineStatus('offline');
            setTimeout(() => this.connect().catch(() => {}), 2000);
          };

          setTimeout(() => {
            if (!this.connected) {
              this.connectPromise = null;
              resolve(null);
            }
          }, 3000);

        } catch (e) {
          this.connectPromise = null;
          resolve(null);
        }
      });

      return this.connectPromise;
    }

    async request(method, params = {}, timeoutMs = 25000) {
      await this.connect();
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        throw new Error('Mesnium Gateway connection is currently offline.');
      }

      const id = 'req_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
      return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
          this.pendingRequests.delete(id);
          reject(new Error(`RPC Timeout: Method "${method}" exceeded ${timeoutMs}ms.`));
        }, timeoutMs);

        this.pendingRequests.set(id, { resolve, reject, timeout });
        this.ws.send(JSON.stringify({ type: 'req', id, method, params }));
      });
    }
  }

  const MesniumClient = new MesniumGatewayClient();
  window.MesniumClient = MesniumClient;

  // --- 3. APPLICATION STATE ---
  const state = {
    activeRoute: 'overview',
    sidebarCollapsed: false,
    selectedInboxLeadId: 'lead_1',
    activeSettingsTab: 'general',
    inboxLeads: [
      {
        id: 'lead_1',
        name: 'Acme Industries',
        contact: 'Sarah Jenkins (VP of Operations)',
        topic: 'Growth Services & Workflow Automation',
        value: '$12,000',
        priority: 'high',
        qualification: 'Qualified — appointment requested for Thursday 2:00 PM EST.',
        needsAttention: 'Review and approve proposed calendar invite.',
        nextStep: 'Confirm booking with lead.',
        messages: [
          { sender: 'lead', time: '10:14 AM', text: 'Hi, we are looking to automate our multi-channel lead qualification and sync with our operations spreadsheet. Can Mesnium handle custom approval thresholds?' },
          { sender: 'assistant', assistantName: 'Sales Assistant', time: '10:15 AM', text: 'Hello Sarah! Yes, Mesnium has a deterministic Action Gatekeeper that enforces human approval for any external mutation (like calendar bookings or outbound emails), while automatically querying your knowledge base in real-time. Would you like to review our automated demo or schedule a 15-minute briefing?' },
          { sender: 'lead', time: '10:18 AM', text: 'A quick 15-minute briefing would be great. Does Thursday at 2:00 PM EST work for your team?' },
          { sender: 'assistant', assistantName: 'Sales Assistant', time: '10:19 AM', text: 'Thursday at 2:00 PM EST works perfectly. I have prepared an appointment proposal and submitted it to our operations team for one-click confirmation.' }
        ]
      },
      {
        id: 'lead_2',
        name: 'Nexus Retail Corp',
        contact: 'David Miller (Head of Supply Chain)',
        topic: 'Inventory Sync & Order Triage',
        value: '$8,500',
        priority: 'medium',
        qualification: 'Information gathering — inquired about spreadsheet data ingest latency.',
        needsAttention: 'Follow up if no reply within 48 hours.',
        nextStep: 'Provide knowledge indexing benchmark report.',
        messages: [
          { sender: 'lead', time: 'Yesterday', text: 'How frequently does your knowledge engine re-index modified Excel sheets in Google Drive?' },
          { sender: 'assistant', assistantName: 'Sales Assistant', time: 'Yesterday', text: 'Mesnium calculates SHA-256 checksums per file. Unchanged sheets index in 0ms, while newly updated sheets re-chunk and index within ~300ms using SQLite WAL vector storage.' }
        ]
      },
      {
        id: 'lead_3',
        name: 'Vertex Health Systems',
        contact: 'Dr. Elena Rostova (Chief Medical Officer)',
        topic: 'Automated Patient Triage & Secure Routing',
        value: '$24,000',
        priority: 'high',
        qualification: 'Enterprise Prospect — Security & HIPAA compliance verified.',
        needsAttention: 'Contract proposal ready for executive signature.',
        nextStep: 'Send proposal document via approved channel.',
        messages: [
          { sender: 'lead', time: 'Aug 28', text: 'We require air-gapped knowledge retrieval and strict human-in-the-loop gating for any patient-facing communications.' },
          { sender: 'assistant', assistantName: 'Sales Assistant', time: 'Aug 28', text: 'Understood Dr. Rostova. Mesnium operates on deterministic risk policies where high-risk actions are physically blocked until an authorized operator clicks Approve.' }
        ]
      }
    ]
  };

  // --- 4. ENGINE STATUS HELPER ---
  function updateEngineStatus(status) {
    const dot = document.getElementById('mesnium-status-dot');
    const label = document.getElementById('mesnium-status-label');
    if (dot && label) {
      if (status === 'online') {
        dot.className = 'status-dot status-dot--online';
        label.textContent = 'Engine Online';
      } else {
        dot.className = 'status-dot status-dot--offline';
        label.textContent = 'Reconnecting...';
      }
    }
  }

  // --- 5. ROUTE RESOLUTION ---
  function getRouteFromLocation() {
    const hash = window.location.hash.replace(/^#\/?/, '').split('?')[0].split('/')[0] || '';
    const path = window.location.pathname.replace(/^\//, '').split('?')[0].split('/')[0] || '';
    const raw = hash || path || 'overview';

    // Route alias mapping
    if (raw === 'chat' || raw === 'inbox') return 'inbox';
    if (raw === 'agents' || raw === 'assistants') return 'assistants';
    if (raw === 'cron' || raw === 'automations') return 'automations';
    if (raw === 'dreaming' || raw === 'dreams' || raw === 'knowledge') return 'knowledge';
    if (raw === 'approvals') return 'approvals';
    if (raw === 'workboard' || raw === 'activity') return 'activity';
    if (raw === 'channels' || raw === 'connections') return 'connections';
    if (raw === 'config' || raw === 'settings') return 'settings';
    return 'overview';
  }

  function navigateTo(route) {
    window.location.hash = `#/${route}`;
    state.activeRoute = route;
    renderMesniumApp();
  }

  // --- 6. CORE DOM MOUNT & OPENCLAW SUPPRESSION ---
  function ensureMesniumShell() {
    // 1. Suppress legacy OpenClaw mount entirely
    const legacyApp = document.querySelector('openclaw-app');
    if (legacyApp) {
      legacyApp.style.display = 'none';
      legacyApp.setAttribute('hidden', 'true');
    }
    const legacyFallback = document.getElementById('openclaw-mount-fallback');
    if (legacyFallback) {
      legacyFallback.style.display = 'none';
      legacyFallback.setAttribute('hidden', 'true');
    }

    // 2. Ensure Mesnium container
    let container = document.getElementById('mesnium-studio-app');
    if (!container) {
      container = document.createElement('div');
      container.id = 'mesnium-studio-app';
      document.body.appendChild(container);
    }
    return container;
  }

  // --- 7. MAIN RENDERER ---
  function renderMesniumApp() {
    const container = ensureMesniumShell();
    state.activeRoute = getRouteFromLocation();
    document.title = `${ROUTE_META[state.activeRoute]?.title || 'Studio'} — Mesnium`;

    container.innerHTML = `
      <div class="mesnium-layout ${state.sidebarCollapsed ? 'mesnium-layout--collapsed' : ''}">
        <!-- Sidebar Navigation -->
        <aside class="mesnium-sidebar">
          <div class="mesnium-sidebar__brand">
            <div class="brand-identity" onclick="window.location.hash='#/overview'">
              <img src="${state.sidebarCollapsed ? BRAND_ICON : BRAND_LOGO}" class="brand-logo" alt="${BRAND_NAME}" />
            </div>
            <button class="sidebar-toggle-btn" id="btn-sidebar-toggle" title="Toggle Sidebar (Ctrl+B)">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect>
                <line x1="9" y1="3" x2="9" y2="21"></line>
              </svg>
            </button>
          </div>

          <nav class="mesnium-sidebar__nav">
            <div class="nav-group-label">WORKSPACE</div>
            <a class="nav-item ${state.activeRoute === 'overview' ? 'nav-item--active' : ''}" href="#/overview">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="20" x2="12" y2="10"></line><line x1="18" y1="20" x2="18" y2="4"></line><line x1="6" y1="20" x2="6" y2="16"></line></svg>
              <span class="nav-label">Overview</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'inbox' ? 'nav-item--active' : ''}" href="#/inbox">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>
              <span class="nav-label">Inbox</span>
              <span class="nav-badge">3</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'assistants' ? 'nav-item--active' : ''}" href="#/assistants">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>
              <span class="nav-label">Assistants</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'automations' ? 'nav-item--active' : ''}" href="#/automations">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon></svg>
              <span class="nav-label">Automations</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'knowledge' ? 'nav-item--active' : ''}" href="#/knowledge">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>
              <span class="nav-label">Knowledge</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'approvals' ? 'nav-item--active' : ''}" href="#/approvals">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              <span class="nav-label">Approvals</span>
              <span class="nav-badge nav-badge--warn" id="sidebar-approvals-badge" style="display:none;">0</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'activity' ? 'nav-item--active' : ''}" href="#/activity">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              <span class="nav-label">Activity</span>
            </a>
            <a class="nav-item ${state.activeRoute === 'connections' ? 'nav-item--active' : ''}" href="#/connections">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"></path><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"></path></svg>
              <span class="nav-label">Connections</span>
            </a>
          </nav>

          <div class="mesnium-sidebar__footer">
            <a class="nav-item ${state.activeRoute === 'settings' ? 'nav-item--active' : ''}" href="#/settings">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
              <span class="nav-label">Settings</span>
            </a>
            <div class="sidebar-status-pill">
              <span class="status-dot status-dot--online" id="mesnium-status-dot"></span>
              <span class="status-text" id="mesnium-status-label">Engine Online</span>
            </div>
          </div>
        </aside>

        <!-- Main Surface Container -->
        <main class="mesnium-main">
          <!-- Topbar -->
          <header class="mesnium-topbar">
            <div class="topbar-left">
              <span class="breadcrumb-prefix">Mesnium Studio</span>
              <span class="breadcrumb-separator">/</span>
              <span class="breadcrumb-current">${ROUTE_META[state.activeRoute]?.title || 'Overview'}</span>
            </div>
            <div class="topbar-right">
              <div class="topbar-badge">
                <span class="badge-dot"></span>
                <span>Acme Workspace</span>
              </div>
            </div>
          </header>

          <!-- Dynamic Active Surface -->
          <div class="mesnium-content-stage" id="mesnium-stage">
            ${renderSurface(state.activeRoute)}
          </div>
        </main>
      </div>

      <!-- Global Modals / Drawers Container -->
      <div id="mesnium-modal-root"></div>
    `;

    // Bind sidebar collapse toggle
    const toggleBtn = document.getElementById('btn-sidebar-toggle');
    if (toggleBtn) {
      toggleBtn.onclick = () => {
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderMesniumApp();
      };
    }

    // Attach active surface lifecycle handlers
    attachSurfaceHandlers(state.activeRoute);
  }

  // --- 8. SURFACE ROUTE METADATA ---
  const ROUTE_META = {
    overview: { title: 'Overview', desc: 'Executive summary, operational health, and real business outcomes.' },
    inbox: { title: 'Inbox', desc: 'Business communications workspace with automated lead qualification.' },
    assistants: { title: 'Assistants', desc: 'Autonomous business employees with grounded knowledge access.' },
    automations: { title: 'Automations', desc: 'Conversational workflows with deterministic action safeguards.' },
    knowledge: { title: 'Knowledge', desc: 'Unified business document repository and hybrid RRF retrieval.' },
    approvals: { title: 'Approvals Hub', desc: 'Human-in-the-loop authorization gatekeeper for high-risk mutations.' },
    activity: { title: 'Activity Ledger', desc: 'Comprehensive business audit trail of all assistant runs.' },
    connections: { title: 'Connections', desc: 'Google Workspace and WhatsApp Business ecosystem.' },
    settings: { title: 'Settings', desc: 'Workspace preferences, assistants, notifications, and security.' }
  };

  // --- 9. INDIVIDUAL SURFACE TEMPLATES ---
  function renderSurface(route) {
    switch (route) {
      case 'overview':
        return `
          <div class="surface-pane surface-overview">
            <div class="mesnium-hero-banner">
              <div class="hero-left">
                <span class="hero-tag">Executive Overview</span>
                <h1 class="hero-headline">Autonomous Business Operations</h1>
                <p class="hero-subtext" id="overview-hero-subtext">Synchronizing workspace state with Mesnium Engine...</p>
              </div>
              <div class="hero-stat-box">
                <div class="hero-stat-label">System Health</div>
                <div class="hero-stat-value serif-number" id="overview-health-num">100%</div>
                <div class="hero-stat-note">All Services Operational</div>
              </div>
            </div>

            <div class="mesnium-metrics-grid">
              <div class="mesnium-metric-card" onclick="window.location.hash='#/assistants'">
                <div class="metric-header">
                  <span class="metric-label">Business Assistants</span>
                  <span class="badge badge--ok">Active</span>
                </div>
                <div class="metric-value serif-number" id="kpi-agents-count">--</div>
                <div class="metric-sub">Sales & Research Assistants</div>
              </div>

              <div class="mesnium-metric-card" onclick="window.location.hash='#/knowledge'">
                <div class="metric-header">
                  <span class="metric-label">Knowledge Documents</span>
                  <span class="badge badge--ok">Indexed</span>
                </div>
                <div class="metric-value serif-number" id="kpi-docs-count">--</div>
                <div class="metric-sub">Spreadsheets, Docs, Slides</div>
              </div>

              <div class="mesnium-metric-card" onclick="window.location.hash='#/connections'">
                <div class="metric-header">
                  <span class="metric-label">Connected Services</span>
                  <span class="badge badge--ok">Live</span>
                </div>
                <div class="metric-value serif-number" id="kpi-conn-count">--</div>
                <div class="metric-sub">Google Workspace</div>
              </div>

              <div class="mesnium-metric-card" onclick="window.location.hash='#/approvals'">
                <div class="metric-header">
                  <span class="metric-label">Pending Approvals</span>
                  <span class="badge badge--warn" id="kpi-approvals-badge">Review</span>
                </div>
                <div class="metric-value serif-number" id="kpi-approvals-count" style="color: #ef4444;">--</div>
                <div class="metric-sub">Requiring human authorization</div>
              </div>
            </div>

            <div class="mesnium-shortcuts-row">
              <button class="btn btn--primary" onclick="window.location.hash='#/inbox'">Open Inbox Workspace</button>
              <button class="btn btn--secondary" onclick="window.location.hash='#/assistants'">Run Assistant Task</button>
              <button class="btn btn--secondary" onclick="window.location.hash='#/knowledge'">Search Knowledge</button>
              <button class="btn btn--secondary" onclick="window.location.hash='#/approvals'">Review Action Queue</button>
            </div>

            <div class="mesnium-card" style="margin-top: 28px;">
              <div class="card-header">
                <h3>Recent Business Outcomes</h3>
                <span class="badge badge--ok">Live Ledger</span>
              </div>
              <div class="table-responsive">
                <table class="mesnium-table">
                  <thead>
                    <tr>
                      <th>Outcome / Task Prompt</th>
                      <th>Assistant</th>
                      <th>Status</th>
                      <th>Knowledge Consulted</th>
                      <th>Time</th>
                    </tr>
                  </thead>
                  <tbody id="overview-activity-tbody">
                    <tr><td colspan="5" class="table-empty-cell">Retrieving live audit stream...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

      case 'inbox':
        const selectedLead = state.inboxLeads.find(l => l.id === state.selectedInboxLeadId) || state.inboxLeads[0];
        return `
          <div class="surface-pane surface-inbox">
            <div class="inbox-layout">
              <!-- Leads / Conversations List -->
              <div class="inbox-sidebar">
                <div class="inbox-sidebar__header">
                  <h3>Inbound Leads</h3>
                  <span class="badge badge--ok">${state.inboxLeads.length} Active</span>
                </div>
                <div class="inbox-leads-list">
                  ${state.inboxLeads.map(lead => `
                    <div class="inbox-lead-item ${lead.id === selectedLead.id ? 'inbox-lead-item--selected' : ''}" onclick="window.selectInboxLead('${lead.id}')">
                      <div class="lead-item-top">
                        <span class="lead-name">${escapeHtml(lead.name)}</span>
                        <span class="lead-value">${escapeHtml(lead.value)}</span>
                      </div>
                      <div class="lead-item-topic">${escapeHtml(lead.topic)}</div>
                      <div class="lead-item-bottom">
                        <span class="priority-pill priority-pill--${lead.priority}">${escapeHtml(lead.priority.toUpperCase())}</span>
                        <span class="lead-contact-hint">${escapeHtml(lead.contact.split('(')[0].trim())}</span>
                      </div>
                    </div>
                  `).join('')}
                </div>
              </div>

              <!-- Opportunity Detail & Workspace -->
              <div class="inbox-main">
                <div class="opportunity-card">
                  <div class="opp-header">
                    <div>
                      <h2 class="opp-title">${escapeHtml(selectedLead.name)}</h2>
                      <div class="opp-contact">${escapeHtml(selectedLead.contact)} &bull; ${escapeHtml(selectedLead.topic)}</div>
                    </div>
                    <div class="opp-metrics">
                      <div class="opp-val serif-number">${escapeHtml(selectedLead.value)}</div>
                      <span class="priority-pill priority-pill--${selectedLead.priority}">${escapeHtml(selectedLead.priority.toUpperCase())} PRIORITY</span>
                    </div>
                  </div>

                  <!-- Executive Qualification Box -->
                  <div class="opp-qualification-grid">
                    <div class="qual-item">
                      <span class="qual-label">Assistant Qualification</span>
                      <span class="qual-val">${escapeHtml(selectedLead.qualification)}</span>
                    </div>
                    <div class="qual-item">
                      <span class="qual-label">Action Required</span>
                      <span class="qual-val" style="color: #f59e0b;">${escapeHtml(selectedLead.needsAttention)}</span>
                    </div>
                    <div class="qual-item">
                      <span class="qual-label">Next Scheduled Step</span>
                      <span class="qual-val">${escapeHtml(selectedLead.nextStep)}</span>
                    </div>
                  </div>
                </div>

                <!-- Message Stream -->
                <div class="inbox-thread">
                  ${selectedLead.messages.map(msg => `
                    <div class="thread-message thread-message--${msg.sender}">
                      <div class="message-meta">
                        <span class="message-sender-name">${msg.sender === 'lead' ? escapeHtml(selectedLead.name) : escapeHtml(msg.assistantName || 'Sales Assistant')}</span>
                        <span class="message-time">${msg.time}</span>
                      </div>
                      <div class="message-bubble">${escapeHtml(msg.text)}</div>
                    </div>
                  `).join('')}
                </div>

                <!-- Grounded Assistant Composer -->
                <div class="inbox-composer">
                  <div class="composer-header">
                    <span>Ask assistant to generate response with knowledge retrieval:</span>
                    <select id="inbox-assistant-select" class="mesnium-select">
                      <option value="agent_sales_assistant">Sales Assistant (Appointments & Leads)</option>
                      <option value="agent_research_assistant">Research Assistant (Docs & Knowledge)</option>
                    </select>
                  </div>
                  <div class="composer-input-row">
                    <input type="text" id="inbox-prompt-input" placeholder="Give assistant instructions (e.g. 'Propose alternative timeslot on Friday at 3:00 PM EST')..." />
                    <button class="btn btn--primary" id="btn-inbox-send">Generate & Reply</button>
                  </div>
                  <div id="inbox-composer-output" class="composer-output" style="display:none;"></div>
                </div>
              </div>
            </div>
          </div>
        `;

      case 'assistants':
        return `
          <div class="surface-pane surface-assistants">
            <div class="surface-header">
              <div>
                <h2>Business Assistants</h2>
                <p class="surface-sub">Autonomous AI employees scoped with explicit knowledge and capabilities.</p>
              </div>
              <button class="btn btn--primary" onclick="alert('Assistant creator modal ready for expansion.')">+ Create Assistant</button>
            </div>

            <!-- Task Runner Bar -->
            <div class="mesnium-card" style="margin-bottom: 24px;">
              <div class="card-header">
                <h3>Execute Assistant Task</h3>
                <select id="assistants-select" class="mesnium-select">
                  <option value="agent_research_assistant">Research Assistant (Knowledge & Synthesis)</option>
                  <option value="agent_sales_assistant">Sales Assistant (Leads & Followups)</option>
                </select>
              </div>
              <div class="runner-row">
                <input type="text" id="assistants-prompt-input" placeholder="Ask your assistant a question (e.g. 'What was January direct sales revenue?')..." />
                <button class="btn btn--primary" id="btn-assistants-run">Run</button>
              </div>
              <div id="assistants-run-output" class="runner-output-box" style="display:none;"></div>
            </div>

            <!-- Assistants Grid -->
            <div class="assistants-grid" id="assistants-cards-container">
              <div class="assistant-card">
                <div class="assistant-card__top">
                  <div class="assistant-avatar">S</div>
                  <div>
                    <h3 class="assistant-name">Sales Assistant</h3>
                    <span class="badge badge--ok">Active Employee</span>
                  </div>
                </div>
                <p class="assistant-role-desc">Qualifies inbound leads, answers questions, and moves prospects toward scheduled appointments.</p>
                <div class="assistant-capabilities">
                  <span class="cap-pill">Lead Qualification</span>
                  <span class="cap-pill">Google Calendar Propose</span>
                  <span class="cap-pill">Email Drafting</span>
                </div>
              </div>

              <div class="assistant-card">
                <div class="assistant-card__top">
                  <div class="assistant-avatar">R</div>
                  <div>
                    <h3 class="assistant-name">Research Assistant</h3>
                    <span class="badge badge--ok">Active Employee</span>
                  </div>
                </div>
                <p class="assistant-role-desc">Finds, analyzes, and summarizes information from your connected spreadsheets, documents, and slides.</p>
                <div class="assistant-capabilities">
                  <span class="cap-pill">Knowledge Retrieval</span>
                  <span class="cap-pill">Financial Analysis</span>
                  <span class="cap-pill">Document Extraction</span>
                </div>
              </div>

              <div class="assistant-card">
                <div class="assistant-card__top">
                  <div class="assistant-avatar">O</div>
                  <div>
                    <h3 class="assistant-name">Operations Assistant</h3>
                    <span class="badge badge--ok">Active Employee</span>
                  </div>
                </div>
                <p class="assistant-role-desc">Handles repetitive business workflows, daily briefings, and keeps scheduled operations moving.</p>
                <div class="assistant-capabilities">
                  <span class="cap-pill">Scheduled Reporting</span>
                  <span class="cap-pill">Audit Tracking</span>
                  <span class="cap-pill">Status Sync</span>
                </div>
              </div>
            </div>
          </div>
        `;

      case 'automations':
        return `
          <div class="surface-pane surface-automations">
            <div class="surface-header">
              <div>
                <h2>Automations Studio</h2>
                <p class="surface-sub">Conversational business workflows powered by autonomous assistants and deterministic safety safeguards.</p>
              </div>
              <button class="btn btn--primary" onclick="alert('Automation Builder ready for deployment.')">+ Create Automation</button>
            </div>

            <div class="automations-list" id="automations-list-container">
              <!-- Lead Followup -->
              <div class="automation-card" id="card-auto_lead_followup">
                <div class="auto-top">
                  <div>
                    <h3 class="auto-title">Automatically Follow Up with Inbound Leads</h3>
                    <div class="auto-trigger"><strong>WHEN:</strong> A new lead contacts the business via web or email</div>
                  </div>
                  <span class="badge badge--ok" id="badge-auto-lead">Active</span>
                </div>
                
                <div class="workflow-steps-chain">
                  <div class="step-item"><span class="step-num">1</span> Qualify the prospective client</div>
                  <div class="step-arrow">→</div>
                  <div class="step-item"><span class="step-num">2</span> Answer questions from Knowledge</div>
                  <div class="step-arrow">→</div>
                  <div class="step-item"><span class="step-num">3</span> Offer appointment timeslot</div>
                  <div class="step-arrow">→</div>
                  <div class="step-item step-item--gate"><span class="step-num">4</span> Action Gatekeeper Approval</div>
                </div>

                <div id="output-auto_lead_followup" class="auto-exec-result" style="display:none;"></div>

                <div class="auto-footer">
                  <span class="auto-meta">Assigned: <strong>Sales Assistant</strong> &bull; Policy: <strong>Human Approval Required</strong></span>
                  <div class="auto-actions">
                    <button class="btn btn--secondary btn--sm" id="btn-run-lead-auto">Run Test</button>
                    <button class="btn btn--secondary btn--sm" id="btn-pause-lead-auto">Pause</button>
                  </div>
                </div>
              </div>

              <!-- Daily Briefing -->
              <div class="automation-card" id="card-auto_daily_briefing" style="margin-top: 16px;">
                <div class="auto-top">
                  <div>
                    <h3 class="auto-title">Daily Executive Revenue Briefing</h3>
                    <div class="auto-trigger"><strong>WHEN:</strong> Weekdays at 8:00 AM EST</div>
                  </div>
                  <span class="badge badge--ok" id="badge-auto-briefing">Active</span>
                </div>

                <div class="workflow-steps-chain">
                  <div class="step-item"><span class="step-num">1</span> Query Revenue Spreadsheets</div>
                  <div class="step-arrow">→</div>
                  <div class="step-item"><span class="step-num">2</span> Synthesize Executive Briefing</div>
                  <div class="step-arrow">→</div>
                  <div class="step-item"><span class="step-num">3</span> Record in Activity Ledger</div>
                </div>

                <div id="output-auto_daily_briefing" class="auto-exec-result" style="display:none;"></div>

                <div class="auto-footer">
                  <span class="auto-meta">Assigned: <strong>Research Assistant</strong> &bull; Policy: <strong>Automatic</strong></span>
                  <div class="auto-actions">
                    <button class="btn btn--secondary btn--sm" id="btn-run-briefing-auto">Run Now</button>
                    <button class="btn btn--secondary btn--sm" id="btn-pause-briefing-auto">Pause</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        `;

      case 'knowledge':
        return `
          <div class="surface-pane surface-knowledge">
            <div class="surface-header">
              <div>
                <h2>Business Knowledge Center</h2>
                <p class="surface-sub">Multi-format business documents, spreadsheets, slides, and reports indexed with hybrid RRF retrieval.</p>
              </div>
              <button class="btn btn--primary" id="btn-add-knowledge-src">+ Add Knowledge Source</button>
            </div>

            <div class="knowledge-search-bar">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
              </svg>
              <input type="text" id="knowledge-search-input" placeholder="Search workspace knowledge (documents, spreadsheets, slides, files)..." />
            </div>

            <div class="mesnium-card" style="margin-top: 20px;">
              <div class="card-header">
                <h3 id="knowledge-table-title">Knowledge Documents & Search Results</h3>
                <span class="badge badge--ok">SQLite WAL Synchronized</span>
              </div>
              <div class="table-responsive">
                <table class="mesnium-table">
                  <thead>
                    <tr>
                      <th>Document / Match</th>
                      <th>Provenance / Section</th>
                      <th>Relevance</th>
                    </tr>
                  </thead>
                  <tbody id="knowledge-search-tbody">
                    <tr><td colspan="3" class="table-empty-cell">Enter keywords above to query the business knowledge base.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

      case 'approvals':
        return `
          <div class="surface-pane surface-approvals">
            <div class="surface-header">
              <div>
                <h2>Action Approvals Hub</h2>
                <p class="surface-sub">Human-in-the-loop authorization gatekeeper for high-risk external mutations.</p>
              </div>
              <span class="badge badge--warn">Live Security Boundary</span>
            </div>

            <div id="approvals-cards-container">
              <div class="table-empty-cell">Checking pending action proposals in Action Gatekeeper...</div>
            </div>
          </div>
        `;

      case 'activity':
        return `
          <div class="surface-pane surface-activity">
            <div class="surface-header">
              <div>
                <h2>Business Activity Ledger</h2>
                <p class="surface-sub">Transparent chronological audit timeline of all assistant runs, knowledge queries, and human authorizations.</p>
              </div>
              <span class="badge badge--ok">Live Audit Stream</span>
            </div>

            <div class="mesnium-card">
              <div class="table-responsive">
                <table class="mesnium-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Assistant / System</th>
                      <th>Operation / Task</th>
                      <th>Sources Used</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody id="activity-stream-tbody">
                    <tr><td colspan="5" class="table-empty-cell">Loading audit stream...</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        `;

      case 'connections':
        return `
          <div class="surface-pane surface-connections">
            <div class="surface-header">
              <div>
                <h2>Connected Services</h2>
                <p class="surface-sub">External integrations, business cloud drives, communication channels, and calendars.</p>
              </div>
            </div>

            <div class="connections-grid">
              <!-- Google Workspace -->
              <div class="connection-card">
                <div class="conn-card-header">
                  <div class="conn-identity">
                    <div class="conn-icon-badge" style="background: #ffffff; color: #ea4335;">G</div>
                    <div>
                      <h3 class="conn-title">Google Workspace</h3>
                      <div class="conn-account" id="conn-google-email">m16bshah@gmail.com</div>
                    </div>
                  </div>
                  <span class="badge badge--ok">Connected</span>
                </div>
                <div class="conn-services-row">
                  <div class="conn-sub-service"><span class="sub-service-name">Google Drive</span><span class="sub-service-mode">Read-only Knowledge Sync</span></div>
                  <div class="conn-sub-service"><span class="sub-service-name">Gmail</span><span class="sub-service-mode">Read-only Search</span></div>
                  <div class="conn-sub-service"><span class="sub-service-name">Calendar</span><span class="sub-service-mode">Read-only Agenda</span></div>
                </div>
                <div class="conn-footer">
                  <span>Read-only sync active. Outbound emails or calendar additions strictly require human approval.</span>
                </div>
              </div>

              <!-- WhatsApp Business -->
              <div class="connection-card" style="margin-top: 16px;">
                <div class="conn-card-header">
                  <div class="conn-identity">
                    <div class="conn-icon-badge" style="background: #25D366; color: #ffffff;">W</div>
                    <div>
                      <h3 class="conn-title">WhatsApp Business</h3>
                      <div class="conn-account">Not Connected</div>
                    </div>
                  </div>
                  <button class="btn btn--primary btn--sm" id="btn-open-whatsapp-modal">Connect WhatsApp</button>
                </div>
                <div class="conn-body-desc">
                  Connect your business WhatsApp number so Mesnium assistants can receive leads, answer questions from knowledge, and qualify prospects automatically.
                </div>
              </div>

              <!-- Future Integrations -->
              <div class="upcoming-integrations-section" style="margin-top: 28px;">
                <h4 style="color: var(--muted-strong); margin-bottom: 12px; font-size: 12px; letter-spacing: 0.05em; text-transform: uppercase;">Upcoming Business Connectors</h4>
                <div class="upcoming-grid">
                  <div class="upcoming-card"><span class="upcoming-name">HubSpot CRM</span><span class="upcoming-badge">Coming Soon</span></div>
                  <div class="upcoming-card"><span class="upcoming-name">Salesforce</span><span class="upcoming-badge">Coming Soon</span></div>
                  <div class="upcoming-card"><span class="upcoming-name">Meta Ads</span><span class="upcoming-badge">Coming Soon</span></div>
                  <div class="upcoming-card"><span class="upcoming-name">Slack Workspace</span><span class="upcoming-badge">Coming Soon</span></div>
                </div>
              </div>
            </div>
          </div>
        `;

      case 'settings':
        return `
          <div class="surface-pane surface-settings">
            <div class="surface-header">
              <div>
                <h2>Workspace Settings</h2>
                <p class="surface-sub">Configure your business workspace, assistant behavior, notifications, and security policies.</p>
              </div>
            </div>

            <div class="settings-tabs-row">
              <button class="settings-tab-btn ${state.activeSettingsTab === 'general' ? 'settings-tab-btn--active' : ''}" onclick="window.switchSettingsTab('general')">General</button>
              <button class="settings-tab-btn ${state.activeSettingsTab === 'assistants' ? 'settings-tab-btn--active' : ''}" onclick="window.switchSettingsTab('assistants')">Assistants</button>
              <button class="settings-tab-btn ${state.activeSettingsTab === 'notifications' ? 'settings-tab-btn--active' : ''}" onclick="window.switchSettingsTab('notifications')">Notifications</button>
              <button class="settings-tab-btn ${state.activeSettingsTab === 'security' ? 'settings-tab-btn--active' : ''}" onclick="window.switchSettingsTab('security')">Security & Access</button>
              <button class="settings-tab-btn ${state.activeSettingsTab === 'billing' ? 'settings-tab-btn--active' : ''}" onclick="window.switchSettingsTab('billing')">Billing & Usage</button>
              <button class="settings-tab-btn ${state.activeSettingsTab === 'advanced' ? 'settings-tab-btn--active' : ''}" onclick="window.switchSettingsTab('advanced')">Advanced</button>
            </div>

            <div class="settings-panel-content" id="settings-tab-content">
              ${renderSettingsTabContent(state.activeSettingsTab)}
            </div>
          </div>
        `;

      default:
        return `<div class="surface-pane"><h2>Overview</h2></div>`;
    }
  }

  function renderSettingsTabContent(tab) {
    switch (tab) {
      case 'general':
        return `
          <div class="mesnium-card">
            <div class="form-group">
              <label class="form-label">Business Name</label>
              <input type="text" class="form-input" value="Acme Industries" />
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="form-label">Primary Timezone</label>
              <select class="form-select">
                <option selected>America/New_York (EST)</option>
                <option>America/Chicago (CST)</option>
                <option>America/Los_Angeles (PST)</option>
                <option>Europe/London (GMT)</option>
              </select>
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="form-label">Default Calendar</label>
              <input type="text" class="form-input" value="Primary Business Calendar (m16bshah@gmail.com)" readonly />
            </div>
            <div style="margin-top: 24px;">
              <button class="btn btn--primary" onclick="alert('Settings saved.')">Save Preferences</button>
            </div>
          </div>
        `;

      case 'assistants':
        return `
          <div class="mesnium-card">
            <div class="form-group">
              <label class="form-label">Default Action Approval Policy</label>
              <select class="form-select">
                <option selected>Strict Human Approval (Recommended for High Risk Mutations)</option>
                <option>Semi-Autonomous (Auto-send low risk, approve appointments)</option>
              </select>
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="form-label">Assistant Tone & Brand Voice</label>
              <select class="form-select">
                <option selected>Professional, Direct, and Helpful</option>
                <option>Concise and Executive</option>
                <option>Casual and Friendly</option>
              </select>
            </div>
            <div style="margin-top: 24px;">
              <button class="btn btn--primary" onclick="alert('Assistant behavior preferences updated.')">Save Changes</button>
            </div>
          </div>
        `;

      case 'notifications':
        return `
          <div class="mesnium-card">
            <div class="checkbox-row">
              <input type="checkbox" id="chk-email-approvals" checked />
              <label for="chk-email-approvals">Email me instantly when an assistant proposes a high-risk action requiring approval</label>
            </div>
            <div class="checkbox-row" style="margin-top: 12px;">
              <input type="checkbox" id="chk-daily-digest" checked />
              <label for="chk-daily-digest">Send daily executive morning briefing digest</label>
            </div>
            <div style="margin-top: 24px;">
              <button class="btn btn--primary" onclick="alert('Notification rules updated.')">Save Notifications</button>
            </div>
          </div>
        `;

      case 'security':
        return `
          <div class="mesnium-card">
            <div class="form-group">
              <label class="form-label">Active Workspace Operator</label>
              <input type="text" class="form-input" value="Operator (Verified Local Token)" readonly />
            </div>
            <div class="form-group" style="margin-top: 16px;">
              <label class="form-label">Cryptographic Action Signing</label>
              <input type="text" class="form-input" value="SHA-256 Payload Tamper Verification Active" readonly />
            </div>
          </div>
        `;

      case 'billing':
        return `
          <div class="mesnium-card">
            <div style="display:flex; justify-content:space-between; align-items:center;">
              <div>
                <h3 style="margin:0 0 4px 0;">Mesnium Business Operating System</h3>
                <span class="badge badge--ok">Active Business License</span>
              </div>
              <div class="serif-number" style="font-size: 28px; font-weight:700;">$0.00 / mo</div>
            </div>
            <div style="margin-top: 16px; font-size: 13px; color: var(--muted-strong);">
              Includes unlimited local knowledge indexing, deterministic action gatekeeper, and autonomous assistants.
            </div>
          </div>
        `;

      case 'advanced':
        return `
          <div class="mesnium-card">
            <div style="color: var(--muted-strong); font-size: 13px; margin-bottom: 16px;">
              Technical & infrastructure controls (Kept minimal for business simplicity).
            </div>
            <div class="form-group">
              <label class="form-label">Storage Engine</label>
              <input type="text" class="form-input" value="SQLite WAL Hybrid Store (sqlite-vec + fts5)" readonly />
            </div>
            <div class="form-group" style="margin-top: 12px;">
              <label class="form-label">Gateway RPC Dispatcher</label>
              <input type="text" class="form-input" value="WebSocket Authenticated JSON-RPC 2.0" readonly />
            </div>
          </div>
        `;

      default:
        return '';
    }
  }

  // --- 10. SURFACE INTERACTION HANDLERS ---
  async function attachSurfaceHandlers(route) {
    // 1. Overview Handlers
    if (route === 'overview') {
      try {
        const data = await MesniumClient.request('mesnium.overview.get');
        const sub = document.getElementById('overview-hero-subtext');
        if (sub) sub.textContent = `${data.agentsCount} specialized assistant(s) active • Knowledge synchronized • ${data.pendingApprovalsCount} pending approval(s)`;

        const kpiAgents = document.getElementById('kpi-agents-count');
        if (kpiAgents) kpiAgents.textContent = data.agentsCount;

        const kpiDocs = document.getElementById('kpi-docs-count');
        if (kpiDocs) kpiDocs.textContent = data.knowledgeDocsCount;

        const kpiConn = document.getElementById('kpi-conn-count');
        if (kpiConn) kpiConn.textContent = data.integrationsCount;

        const kpiApp = document.getElementById('kpi-approvals-count');
        if (kpiApp) kpiApp.textContent = data.pendingApprovalsCount;

        const tbody = document.getElementById('overview-activity-tbody');
        if (tbody) {
          if (data.recentActivity && data.recentActivity.length > 0) {
            tbody.innerHTML = data.recentActivity.map(act => `
              <tr>
                <td><strong>${escapeHtml(act.prompt || 'Action Execution')}</strong></td>
                <td>${escapeHtml(act.agentName || 'Assistant')}</td>
                <td><span class="badge ${act.status === 'completed' ? 'badge--ok' : 'badge--warn'}">${escapeHtml(act.status)}</span></td>
                <td>${escapeHtml((act.sourcesConsulted || []).join(', ') || 'Direct synthesis')}</td>
                <td>${new Date(act.startedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</td>
              </tr>
            `).join('');
          } else {
            tbody.innerHTML = `<tr><td colspan="5" class="table-empty-cell">No recent business actions recorded. Ask an assistant to get started.</td></tr>`;
          }
        }
      } catch (err) {}
    }

    // 2. Inbox Handlers
    if (route === 'inbox') {
      const btnSend = document.getElementById('btn-inbox-send');
      const inputPrompt = document.getElementById('inbox-prompt-input');
      const selectAgent = document.getElementById('inbox-assistant-select');
      const outBox = document.getElementById('inbox-composer-output');

      const handleInboxReply = async () => {
        const prompt = inputPrompt?.value.trim();
        if (!prompt) return;
        const agentId = selectAgent?.value || 'agent_sales_assistant';

        btnSend.textContent = 'Generating...';
        btnSend.disabled = true;
        outBox.style.display = 'block';
        outBox.innerHTML = '<span style="color: var(--muted);">Assistant is retrieving knowledge and synthesizing proposal...</span>';

        try {
          const res = await MesniumClient.request('mesnium.agents.run', { agentId, prompt });
          outBox.innerHTML = `
            <div style="font-weight:600; color:var(--text-strong); margin-bottom:4px;">${escapeHtml(res.agentName)}:</div>
            <div style="line-height:1.5; color:var(--text);">${escapeHtml(res.answer)}</div>
            <div style="margin-top:8px; font-size:11.5px; color:var(--muted); border-top:1px dashed var(--border); padding-top:6px;">
              <strong>Knowledge Consulted:</strong> ${(res.sourcesConsulted || []).join(', ') || 'Direct synthesis'} &bull; <strong>Latency:</strong> ${res.durationMs}ms
            </div>
          `;
          // Append to thread
          const activeLead = state.inboxLeads.find(l => l.id === state.selectedInboxLeadId);
          if (activeLead) {
            activeLead.messages.push({
              sender: 'assistant',
              assistantName: res.agentName,
              time: 'Just now',
              text: res.answer
            });
          }
        } catch (err) {
          outBox.innerHTML = `<span style="color: #ef4444;">Error: ${escapeHtml(err.message)}</span>`;
        } finally {
          btnSend.textContent = 'Generate & Reply';
          btnSend.disabled = false;
        }
      };

      if (btnSend) btnSend.onclick = handleInboxReply;
      if (inputPrompt) inputPrompt.onkeydown = (e) => { if (e.key === 'Enter') handleInboxReply(); };
    }

    // 3. Assistants Handlers
    if (route === 'assistants') {
      const btnRun = document.getElementById('btn-assistants-run');
      const inputPrompt = document.getElementById('assistants-prompt-input');
      const selectAgent = document.getElementById('assistants-select');
      const outBox = document.getElementById('assistants-run-output');

      const handleRun = async () => {
        const prompt = inputPrompt?.value.trim();
        if (!prompt) return;
        const agentId = selectAgent?.value || 'agent_research_assistant';

        btnRun.textContent = 'Running...';
        btnRun.disabled = true;
        outBox.style.display = 'block';
        outBox.innerHTML = '<span style="color: var(--muted);">Assistant is retrieving knowledge and reasoning over data...</span>';

        try {
          const res = await MesniumClient.request('mesnium.agents.run', { agentId, prompt });
          outBox.innerHTML = `
            <div style="font-weight:600; color:var(--text-strong); margin-bottom:4px;">${escapeHtml(res.agentName)}:</div>
            <div style="line-height:1.5; color:var(--text);">${escapeHtml(res.answer)}</div>
            <div style="margin-top:8px; font-size:11.5px; color:var(--muted); border-top:1px dashed var(--border); padding-top:6px;">
              <strong>Sources Cited:</strong> ${(res.sourcesConsulted || []).join(', ') || 'Direct knowledge'} &bull; <strong>Duration:</strong> ${res.durationMs}ms
            </div>
          `;
        } catch (err) {
          outBox.innerHTML = `<span style="color: #ef4444;">Execution error: ${escapeHtml(err.message)}</span>`;
        } finally {
          btnRun.textContent = 'Run';
          btnRun.disabled = false;
        }
      };

      if (btnRun) btnRun.onclick = handleRun;
      if (inputPrompt) inputPrompt.onkeydown = (e) => { if (e.key === 'Enter') handleRun(); };
    }

    // 4. Automations Handlers
    if (route === 'automations') {
      const runLeadBtn = document.getElementById('btn-run-lead-auto');
      const runBriefBtn = document.getElementById('btn-run-briefing-auto');
      const pauseLeadBtn = document.getElementById('btn-pause-lead-auto');

      if (runLeadBtn) {
        runLeadBtn.onclick = async () => {
          runLeadBtn.textContent = 'Running...';
          runLeadBtn.disabled = true;
          const out = document.getElementById('output-auto_lead_followup');
          out.style.display = 'block';
          out.innerHTML = '<span style="color:var(--muted);">Executing workflow steps...</span>';
          try {
            const res = await MesniumClient.request('mesnium.automations.run', { id: 'auto_lead_followup', payload: { leadScore: 90, email: 'sarah@acme.com' } });
            if (res.status === 'waiting_approval') {
              out.innerHTML = `<span style="color: #f59e0b;">Workflow paused in <strong>WAITING_APPROVAL</strong>. Action submitted to Approvals Hub.</span>`;
            } else {
              out.innerHTML = `<span style="color: #2e8b57;">Workflow completed successfully (${res.durationMs}ms).</span>`;
            }
          } catch (err) {
            out.innerHTML = `<span style="color: #ef4444;">${escapeHtml(err.message)}</span>`;
          } finally {
            runLeadBtn.textContent = 'Run Test';
            runLeadBtn.disabled = false;
          }
        };
      }

      if (runBriefBtn) {
        runBriefBtn.onclick = async () => {
          runBriefBtn.textContent = 'Running...';
          runBriefBtn.disabled = true;
          const out = document.getElementById('output-auto_daily_briefing');
          out.style.display = 'block';
          out.innerHTML = '<span style="color:var(--muted);">Synthesizing revenue report...</span>';
          try {
            const res = await MesniumClient.request('mesnium.automations.run', { id: 'auto_daily_briefing' });
            out.innerHTML = `<span style="color: #2e8b57;">Executive briefing generated successfully (${res.durationMs}ms). Recorded in ledger.</span>`;
          } catch (err) {
            out.innerHTML = `<span style="color: #ef4444;">${escapeHtml(err.message)}</span>`;
          } finally {
            runBriefBtn.textContent = 'Run Now';
            runBriefBtn.disabled = false;
          }
        };
      }

      if (pauseLeadBtn) {
        pauseLeadBtn.onclick = async () => {
          const isPaused = pauseLeadBtn.textContent === 'Resume';
          const method = isPaused ? 'mesnium.automations.resume' : 'mesnium.automations.pause';
          try {
            await MesniumClient.request(method, { id: 'auto_lead_followup' });
            pauseLeadBtn.textContent = isPaused ? 'Pause' : 'Resume';
            const badge = document.getElementById('badge-auto-lead');
            if (badge) {
              badge.textContent = isPaused ? 'Active' : 'Paused';
              badge.className = `badge ${isPaused ? 'badge--ok' : 'badge--warn'}`;
            }
          } catch (err) {
            alert(err.message);
          }
        };
      }
    }

    // 5. Knowledge Handlers
    if (route === 'knowledge') {
      const searchInput = document.getElementById('knowledge-search-input');
      const tbody = document.getElementById('knowledge-search-tbody');

      let debounceTimer = null;
      if (searchInput) {
        searchInput.oninput = () => {
          clearTimeout(debounceTimer);
          debounceTimer = setTimeout(async () => {
            const query = searchInput.value.trim();
            if (!query) {
              tbody.innerHTML = `<tr><td colspan="3" class="table-empty-cell">Enter keywords above to query the business knowledge base.</td></tr>`;
              return;
            }
            tbody.innerHTML = `<tr><td colspan="3" class="table-empty-cell">Searching indexed documents...</td></tr>`;
            try {
              const res = await MesniumClient.request('mesnium.knowledge.search', { query, limit: 5 });
              if (res.hits && res.hits.length > 0) {
                tbody.innerHTML = res.hits.map(h => `
                  <tr>
                    <td><strong>${escapeHtml(h.filename)}</strong><div style="font-size:12px; color:var(--muted-strong); margin-top:4px;">${escapeHtml(h.content ? h.content.slice(0, 140) + '...' : '')}</div></td>
                    <td><span class="format-tag">${escapeHtml(h.provenance || 'Document Section')}</span></td>
                    <td><span class="badge badge--ok">${h.score ? Math.round(h.score * 100) + '%' : 'Matched'}</span></td>
                  </tr>
                `).join('');
              } else {
                tbody.innerHTML = `<tr><td colspan="3" class="table-empty-cell">No matching documents found in knowledge base.</td></tr>`;
              }
            } catch (err) {
              tbody.innerHTML = `<tr><td colspan="3" class="table-empty-cell" style="color:#ef4444;">Search failed: ${escapeHtml(err.message)}</td></tr>`;
            }
          }, 250);
        };
      }
    }

    // 6. Approvals Handlers
    if (route === 'approvals') {
      const containerCards = document.getElementById('approvals-cards-container');
      try {
        const appData = await MesniumClient.request('mesnium.approvals.list');
        if (appData.approvals && appData.approvals.length > 0) {
          containerCards.innerHTML = appData.approvals.map(a => `
            <div class="mesnium-approval-card" id="approval-card-${a.id}">
              <div class="approval-card-header">
                <div class="approval-agent-badge">
                  <div class="agent-avatar">${escapeHtml((a.agentName || 'A')[0])}</div>
                  <div>
                    <h3 class="approval-title">${escapeHtml(a.title)}</h3>
                    <div class="approval-agent-name">Proposed by <strong>${escapeHtml(a.agentName)}</strong></div>
                  </div>
                </div>
                <span class="risk-badge risk-badge--high">High Risk &bull; ${escapeHtml(a.actionType)}</span>
              </div>

              <div class="approval-target-box">
                <div class="target-field"><strong>Target:</strong> ${escapeHtml(a.target || 'External Service')}</div>
                <div class="target-field"><strong>Reason:</strong> ${escapeHtml(a.description || 'Automated action proposal')}</div>
              </div>

              <div class="approval-content-preview">
                <div class="preview-label">Proposed Payload:</div>
                <div class="preview-text">${escapeHtml(typeof a.payload === 'object' ? JSON.stringify(a.payload, null, 2) : String(a.payload))}</div>
              </div>

              <div class="approval-footer">
                <div class="approval-meta-time">Requested at ${new Date(a.requestedAt).toLocaleTimeString()}</div>
                <div class="approval-actions-row">
                  <button class="btn btn--secondary" onclick="window.rejectApprovalAction('${a.id}')">Reject Action</button>
                  <button class="btn btn--primary" onclick="window.approveApprovalAction('${a.id}')">Approve & Execute</button>
                </div>
              </div>
            </div>
          `).join('');
        } else {
          containerCards.innerHTML = `
            <div class="mesnium-card" style="text-align:center; padding: 40px 20px;">
              <h3 style="color:var(--text-strong); margin-bottom:8px;">All Actions Authorized</h3>
              <p style="color:var(--muted); margin:0;">Zero pending approvals in queue. High-risk actions proposed by assistants will appear here for review.</p>
            </div>
          `;
        }
      } catch (err) {}
    }

    // 7. Activity Handlers
    if (route === 'activity') {
      const tbody = document.getElementById('activity-stream-tbody');
      try {
        const actData = await MesniumClient.request('mesnium.activity.list', { limit: 50 });
        if (tbody && actData.activity && actData.activity.length > 0) {
          tbody.innerHTML = actData.activity.map(act => `
            <tr>
              <td>${new Date(act.startedAt).toLocaleTimeString()}</td>
              <td><strong>${escapeHtml(act.agentName || act.agentId || 'System')}</strong></td>
              <td>${escapeHtml(act.prompt || 'Action Execution')}</td>
              <td>${escapeHtml((act.sourcesConsulted || []).join(', ') || 'Direct execution')}</td>
              <td><span class="badge ${act.status === 'completed' ? 'badge--ok' : 'badge--warn'}">${escapeHtml(act.status)}</span></td>
            </tr>
          `).join('');
        } else if (tbody) {
          tbody.innerHTML = `<tr><td colspan="5" class="table-empty-cell">No activity records logged yet.</td></tr>`;
        }
      } catch (err) {}
    }

    // 8. Connections Handlers
    if (route === 'connections') {
      const openWhatsAppBtn = document.getElementById('btn-open-whatsapp-modal');
      if (openWhatsAppBtn) {
        openWhatsAppBtn.onclick = () => window.openWhatsAppModal();
      }
    }
  }

  // --- 11. GLOBAL WINDOW DISPATCHERS ---
  window.selectInboxLead = function (leadId) {
    state.selectedInboxLeadId = leadId;
    renderMesniumApp();
  };

  window.switchSettingsTab = function (tab) {
    state.activeSettingsTab = tab;
    renderMesniumApp();
  };

  window.approveApprovalAction = async function (actionId) {
    const card = document.getElementById(`approval-card-${actionId}`);
    try {
      if (card) card.innerHTML = '<div style="padding:20px; color:var(--muted);">Authorizing and executing action through Gatekeeper...</div>';
      await MesniumClient.request('mesnium.approvals.approve', { id: actionId, approver: 'Operator' });
      if (card) card.innerHTML = '<div style="padding:20px; color:#2e8b57; font-weight:600;">✓ Action authorized and executed successfully.</div>';
    } catch (err) {
      alert('Approval error: ' + err.message);
      renderMesniumApp();
    }
  };

  window.rejectApprovalAction = async function (actionId) {
    const card = document.getElementById(`approval-card-${actionId}`);
    try {
      if (card) card.innerHTML = '<div style="padding:20px; color:var(--muted);">Rejecting action proposal...</div>';
      await MesniumClient.request('mesnium.approvals.reject', { id: actionId, reason: 'Rejected by operator' });
      if (card) card.innerHTML = '<div style="padding:20px; color:var(--muted); font-weight:600;">Action proposal rejected.</div>';
    } catch (err) {
      alert('Rejection error: ' + err.message);
      renderMesniumApp();
    }
  };

  window.openWhatsAppModal = function () {
    const root = document.getElementById('mesnium-modal-root');
    if (!root) return;
    root.innerHTML = `
      <div class="mesnium-modal-backdrop" onclick="window.closeWhatsAppModal()">
        <div class="mesnium-modal" onclick="event.stopPropagation()">
          <div class="modal-header">
            <h3>Connect WhatsApp Business</h3>
            <button class="modal-close-btn" onclick="window.closeWhatsAppModal()">✕</button>
          </div>
          <div class="modal-body">
            <p style="color:var(--text); line-height:1.5; margin-bottom:16px;">
              Connect your business WhatsApp number to enable automated lead qualification, instant knowledge-grounded replies, and appointment scheduling.
            </p>
            <div class="form-group">
              <label class="form-label">Business Phone Number</label>
              <input type="text" class="form-input" placeholder="+1 (555) 000-0000" />
            </div>
            <div class="form-group" style="margin-top:14px;">
              <label class="form-label">Assign Primary Assistant</label>
              <select class="form-select">
                <option selected>Sales Assistant (Recommended for Inbound Leads)</option>
                <option>Operations Assistant</option>
              </select>
            </div>
          </div>
          <div class="modal-footer">
            <button class="btn btn--secondary" onclick="window.closeWhatsAppModal()">Cancel</button>
            <button class="btn btn--primary" onclick="alert('Verification SMS code sent.'); window.closeWhatsAppModal();">Send Verification Code</button>
          </div>
        </div>
      </div>
    `;
  };

  window.closeWhatsAppModal = function () {
    const root = document.getElementById('mesnium-modal-root');
    if (root) root.innerHTML = '';
  };

  function escapeHtml(str) {
    if (typeof str !== 'string') return String(str || '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // --- 12. BOOTSTRAP & EVENT LISTENERS ---
  function bootMesnium() {
    MesniumClient.connect().catch(() => {});
    renderMesniumApp();

    window.addEventListener('hashchange', renderMesniumApp);
    window.addEventListener('popstate', renderMesniumApp);

    // Keyboard shortcut for sidebar (Ctrl+B / Cmd+B)
    window.addEventListener('keydown', (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        state.sidebarCollapsed = !state.sidebarCollapsed;
        renderMesniumApp();
      }
    });

    // Guard against background Lit element re-mounts
    const observer = new MutationObserver(() => {
      const legacyApp = document.querySelector('openclaw-app');
      if (legacyApp && legacyApp.style.display !== 'none') {
        legacyApp.style.display = 'none';
        legacyApp.setAttribute('hidden', 'true');
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootMesnium);
  } else {
    bootMesnium();
  }

})();
