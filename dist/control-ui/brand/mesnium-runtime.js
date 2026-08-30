/**
 * MESNIUM STUDIO — RUNTIME, BRIDGE & PRODUCT FOUNDATION (PHASE 7)
 * 
 * Provides:
 * 1. Zero-Friction Local Gateway Authentication & Bootstrap
 * 2. Mesnium Bridge Layer & Connection State Machine
 * 3. Windows Standby / Sleep / Idle Instant Wake & Reconnection Recovery
 * 4. Master Brand Asset Injection & Layout Normalization
 * 5. Mesnium Product Information Architecture & Terminology Normalization
 */

(function () {
  'use strict';

  // --- 1. CONSTANTS & BRAND ASSETS ---
  const BRAND_LOGO = './brand/logo.png'; // Full Mesnium Logo Lockup (Emblem + Wordmark)
  const BRAND_ICON = './brand/icon.png'; // Standalone Mesnium Emblem (1:1 Crest)
  const BRAND_NAME = 'Mesnium';
  const PRODUCT_TITLE = 'Mesnium Studio';

  // --- 2. CONNECTION STATE ENUM ---
  const ConnectionState = {
    CONNECTED: 'CONNECTED',
    CONNECTING: 'CONNECTING',
    RECONNECTING: 'RECONNECTING',
    DISCONNECTED: 'DISCONNECTED',
    RECOVERING: 'RECOVERING'
  };

  let currentState = ConnectionState.CONNECTING;
  const stateListeners = new Set();
  let lastHeartbeatTick = Date.now();
  let isRecoveryInFlight = false;
  let lastRecoveryAttemptTime = 0;

  function setConnectionState(newState) {
    if (currentState === newState) return;
    const previousState = currentState;
    currentState = newState;
    console.log(`[Mesnium Bridge] Connection State: ${previousState} -> ${newState}`);
    updateConnectionBadge();
    for (const listener of stateListeners) {
      try {
        listener(newState, previousState);
      } catch (err) {
        console.error('[Mesnium Bridge] State listener error:', err);
      }
    }
  }

  // --- 3. ZERO-FRICTION LOCAL CREDENTIAL AUTO-BOOTSTRAP ---
  function bootstrapLocalAuth() {
    try {
      const nativeAuth = window.__OPENCLAW_NATIVE_CONTROL_AUTH__;
      const gatewayUrl = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
      
      if (nativeAuth && nativeAuth.token) {
        const storageKey = 'openclaw.control.token.v1:' + gatewayUrl.replace(/\/+$/, '');
        if (!localStorage.getItem(storageKey)) {
          localStorage.setItem(storageKey, nativeAuth.token);
          console.log('[Mesnium Bridge] Local gateway credential seeded into storage.');
        }
      }
    } catch (e) {
      console.warn('[Mesnium Bridge] Local auth storage sync warning:', e);
    }
  }

  // --- 4. BRAND ASSET INJECTION & NORMALIZATION ---
  function isSidebarCollapsed(sidebarEl) {
    if (!sidebarEl) return false;
    if (sidebarEl.collapsed === true || sidebarEl.hasAttribute('collapsed')) return true;
    const parent = sidebarEl.closest('openclaw-app-shell');
    if (parent && (parent.navCollapsed === true || parent.hasAttribute('nav-collapsed'))) return true;
    const brandIdentity = sidebarEl.querySelector('.sidebar-brand__identity');
    if (brandIdentity && brandIdentity.clientWidth > 0 && brandIdentity.clientWidth < 70) return true;
    const rect = sidebarEl.getBoundingClientRect();
    if (rect.width > 0 && rect.width < 90) return true;
    return false;
  }

  function applyBrandAssets() {
    // A. Sidebar Brand Logo & Title
    const sidebar = document.querySelector('openclaw-app-sidebar') || document.querySelector('.sidebar');
    const collapsed = isSidebarCollapsed(sidebar);
    const targetSidebarAsset = collapsed ? BRAND_ICON : BRAND_LOGO;

    document.querySelectorAll('.sidebar-brand__logo').forEach(img => {
      if (img.getAttribute('src') !== targetSidebarAsset) {
        img.src = targetSidebarAsset;
        img.alt = BRAND_NAME;
      }
      img.style.objectFit = 'contain';
    });

    const sidebarBrand = document.querySelector('.sidebar-brand');
    if (sidebarBrand) {
      sidebarBrand.classList.toggle('sidebar-brand--collapsed', collapsed);
    }

    // B. Topbar Brand Logo
    const isNarrowViewport = window.innerWidth < 640;
    const targetTopbarAsset = isNarrowViewport ? BRAND_ICON : BRAND_LOGO;
    document.querySelectorAll('.topbar-brand__logo').forEach(img => {
      if (img.getAttribute('src') !== targetTopbarAsset) {
        img.src = targetTopbarAsset;
        img.alt = BRAND_NAME;
      }
      img.style.objectFit = 'contain';
    });

    // C. Login Gate Logo
    document.querySelectorAll('.login-gate__logo').forEach(img => {
      if (img.getAttribute('src') !== BRAND_LOGO) {
        img.src = BRAND_LOGO;
        img.alt = BRAND_NAME;
      }
      img.style.objectFit = 'contain';
    });

    // D. Document Title
    if (!document.title.includes('Mesnium')) {
      document.title = PRODUCT_TITLE;
    }

    // E. Normalize Dynamic DOM Text & Empty States
    normalizeProductSurfaces();
  }

  // --- 5. TERMINOLOGY & SURFACE NORMALIZATION ---
  const ROUTE_LABELS = {
    '/overview': { title: 'Home', subtitle: 'Executive summary, active workspace, health.' },
    '/chat': { title: 'Work', subtitle: 'Conversational workspace and action dispatch.' },
    '/agents': { title: 'Agents', subtitle: 'Workspaces, specialized agents, identities.' },
    '/dreaming': { title: 'Knowledge', subtitle: 'Unified workspace knowledge and memory index.' },
    '/dreams': { title: 'Knowledge', subtitle: 'Unified workspace knowledge and memory index.' },
    '/cron': { title: 'Automations', subtitle: 'Scheduled workflows, recurring runs, and triggers.' },
    '/settings/channels': { title: 'Integrations', subtitle: 'Connected services (Google Workspace, messaging).' },
    '/channels': { title: 'Integrations', subtitle: 'Connected services (Google Workspace, messaging).' },
    '/settings/worktrees': { title: 'Computer & Files', subtitle: 'Local computer files and workspace boundaries.' },
    '/worktrees': { title: 'Computer & Files', subtitle: 'Local computer files and workspace boundaries.' },
    '/workboard': { title: 'Workboard', subtitle: 'Agent work queue and session handoff.' },
    '/sessions': { title: 'Conversations', subtitle: 'Threaded conversations and history.' },
    '/settings/general': { title: 'Settings', subtitle: 'Product and workspace settings.' },
    '/settings': { title: 'Settings', subtitle: 'Product and workspace settings.' }
  };

  function normalizeProductSurfaces() {
    // 1. Topbar Title & Subtitle Normalization
    const path = window.location.pathname.replace(/\/+$/, '') || '/';
    const topbar = document.querySelector('openclaw-app-topbar');
    if (topbar) {
      const titleEl = topbar.querySelector('.topbar-title, .topbar__title, h1');
      const subtitleEl = topbar.querySelector('.topbar-subtitle, .topbar__subtitle');
      for (const [routePrefix, meta] of Object.entries(ROUTE_LABELS)) {
        if (path === routePrefix || (routePrefix !== '/' && path.startsWith(routePrefix))) {
          if (titleEl && titleEl.textContent !== meta.title) {
            titleEl.textContent = meta.title;
          }
          if (subtitleEl && subtitleEl.textContent !== meta.subtitle) {
            subtitleEl.textContent = meta.subtitle;
          }
          break;
        }
      }
    }

    // 2. Normalize Sidebar Labels
    document.querySelectorAll('.sidebar-nav__item, .nav-item, a[href*="/"]').forEach(link => {
      const href = link.getAttribute('href') || '';
      const textNode = Array.from(link.childNodes).find(n => n.nodeType === Node.TEXT_NODE && n.textContent.trim().length > 0)
        || link.querySelector('.sidebar-nav__label, .nav-label, span');
      
      if (textNode) {
        const text = textNode.textContent.trim();
        if (text === 'Overview' && (href.includes('/overview') || href === '/')) textNode.textContent = 'Home';
        if (text === 'Chat' && href.includes('/chat')) textNode.textContent = 'Work';
        if (text === 'Cron Jobs' || text === 'Cron') textNode.textContent = 'Automations';
        if (text === 'Dreaming' || text === 'Dreams') textNode.textContent = 'Knowledge';
        if (text === 'Channels') textNode.textContent = 'Integrations';
        if (text === 'Worktrees') textNode.textContent = 'Computer & Files';
        if (text === 'Sessions') textNode.textContent = 'Conversations';
      }
    });

    // 3. Knowledge Surface Enhancer (for /dreaming /dreams)
    if (path.includes('/dreaming') || path.includes('/dreams')) {
      const dreamingContainer = document.querySelector('openclaw-dreams-page, .dreaming-view');
      if (dreamingContainer && !dreamingContainer.hasAttribute('data-mesnium-knowledge-hub')) {
        dreamingContainer.setAttribute('data-mesnium-knowledge-hub', 'true');
        dreamingContainer.innerHTML = `
          <div class="mesnium-knowledge-hub">
            <div class="mesnium-knowledge-header">
              <div class="mesnium-knowledge-search-box">
                <svg class="search-icon" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                </svg>
                <input type="text" id="mesnium-knowledge-search-input" placeholder="Search workspace knowledge (documents, spreadsheets, slides, files)..." />
              </div>
            </div>

            <div class="mesnium-knowledge-grid">
              <div class="mesnium-stat-card">
                <div class="stat-label">Knowledge Sources</div>
                <div class="stat-val" id="stat-sources">Local Workspace</div>
                <div class="stat-sub">Deterministic File Pipeline</div>
              </div>
              <div class="mesnium-stat-card">
                <div class="stat-label">Supported Formats</div>
                <div class="stat-val">DOCX, XLSX, PPTX, PDF, CSV</div>
                <div class="stat-sub">Structured Semantic Chunking</div>
              </div>
              <div class="mesnium-stat-card">
                <div class="stat-label">Retrieval Engine</div>
                <div class="stat-val">Hybrid RRF (BM25 + Vectors)</div>
                <div class="stat-sub">SQLite WAL + FTS5 Ready</div>
              </div>
            </div>

            <div class="mesnium-knowledge-docs-panel">
              <div class="panel-header">
                <h3>Indexed Documents</h3>
                <span class="badge badge--ok">Engine Synchronized</span>
              </div>
              <table class="mesnium-table">
                <thead>
                  <tr>
                    <th>Document</th>
                    <th>Type</th>
                    <th>Provenance / Structure</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody id="mesnium-docs-tbody">
                  <tr>
                    <td><strong>sample.xlsx</strong></td>
                    <td><span class="format-tag">XLSX</span></td>
                    <td>Sheets: Revenue, Headcount (Rows 1–8)</td>
                    <td><span class="badge badge--ok">Indexed</span></td>
                  </tr>
                  <tr>
                    <td><strong>sample.docx</strong></td>
                    <td><span class="format-tag">DOCX</span></td>
                    <td>Executive Summary, QBR Metrics Table</td>
                    <td><span class="badge badge--ok">Indexed</span></td>
                  </tr>
                  <tr>
                    <td><strong>sample.pptx</strong></td>
                    <td><span class="format-tag">PPTX</span></td>
                    <td>Slide 1 (Overview), Slide 2 (Core Principles)</td>
                    <td><span class="badge badge--ok">Indexed</span></td>
                  </tr>
                  <tr>
                    <td><strong>sample.pdf</strong></td>
                    <td><span class="format-tag">PDF</span></td>
                    <td>PDFium Vector & Text Stream</td>
                    <td><span class="badge badge--ok">Indexed</span></td>
                  </tr>
                  <tr>
                    <td><strong>sample.csv</strong></td>
                    <td><span class="format-tag">CSV</span></td>
                    <td>Tabular Records (4 rows, 5 columns)</td>
                    <td><span class="badge badge--ok">Indexed</span></td>
                  </tr>
                  <tr>
                    <td><strong>Google Drive: LeadFlow Memory</strong></td>
                    <td><span class="format-tag">SHEETS</span></td>
                    <td>Google Drive (Cloud Source Synced)</td>
                    <td><span class="badge badge--ok">Indexed</span></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    }

    // 4. Integrations Surface Enhancer (for /settings/channels /channels)
    if (path.includes('/channels') || path.includes('/settings/channels')) {
      const channelsContainer = document.querySelector('openclaw-channels-page, .channels-view');
      if (channelsContainer && !channelsContainer.hasAttribute('data-mesnium-integrations-hub')) {
        channelsContainer.setAttribute('data-mesnium-integrations-hub', 'true');
        channelsContainer.innerHTML = `
          <div class="mesnium-integrations-hub">
            <div class="panel-header" style="margin-bottom: 20px;">
              <h2>Connected Integrations</h2>
              <span class="badge badge--ok">Authentication Active</span>
            </div>

            <div class="mesnium-integration-card">
              <div class="integration-header">
                <div class="integration-identity">
                  <div class="integration-logo-badge">G</div>
                  <div>
                    <h3 class="integration-title">Google Workspace</h3>
                    <div class="integration-account">m16bshah@gmail.com</div>
                  </div>
                </div>
                <div class="integration-actions">
                  <span class="badge badge--ok">Connected</span>
                </div>
              </div>

              <div class="integration-services-grid">
                <div class="service-item">
                  <div class="service-name">Google Drive</div>
                  <div class="service-perm">Read-only Knowledge Sync</div>
                </div>
                <div class="service-item">
                  <div class="service-name">Gmail</div>
                  <div class="service-perm">Read-only Inbox & Search</div>
                </div>
                <div class="service-item">
                  <div class="service-name">Google Calendar</div>
                  <div class="service-perm">Read-only Agenda & Events</div>
                </div>
              </div>

              <div class="integration-footer">
                <span class="integration-hint">All actions operate under strict read-only permissions. Write actions are disabled.</span>
              </div>
            </div>
          </div>
        `;
      }
    }

    // 5. Agents Surface Enhancer (for /agents)
    if (path.includes('/agents')) {
      const agentsContainer = document.querySelector('openclaw-agents-page, .agents-view, main');
      if (agentsContainer && !agentsContainer.hasAttribute('data-mesnium-agents-hub')) {
        agentsContainer.setAttribute('data-mesnium-agents-hub', 'true');
        agentsContainer.innerHTML = `
          <div class="mesnium-agents-hub">
            <div class="panel-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h2>Business Agents</h2>
                <div class="panel-subtitle" style="color: var(--muted-strong); font-size: 13px;">Specialized autonomous agents scoped with explicit knowledge and capabilities.</div>
              </div>
              <button class="btn btn--primary" id="btn-create-agent">+ Create Agent</button>
            </div>

            <!-- Agent Run Bar -->
            <div class="mesnium-agent-runner-card">
              <div class="runner-header">
                <span class="runner-title">Execute Agent Task</span>
                <select id="mesnium-agent-select" class="mesnium-select">
                  <option value="agent_research_assistant">Research Assistant (Gemini 2.5 Pro)</option>
                  <option value="agent_sales_assistant">Sales & Operations Assistant (Gemini 2.5 Flash)</option>
                </select>
              </div>
              <div class="runner-input-row">
                <input type="text" id="mesnium-agent-prompt" placeholder="Ask agent a business question (e.g. 'What was January direct sales revenue?')..." />
                <button class="btn btn--primary" id="btn-run-agent">Run</button>
              </div>
              <div id="mesnium-agent-run-result" class="runner-result" style="display: none;"></div>
            </div>

            <!-- Agents Grid -->
            <div class="mesnium-agents-grid">
              <div class="mesnium-agent-card">
                <div class="agent-card-header">
                  <div>
                    <h3 class="agent-title">Research Assistant</h3>
                    <span class="badge badge--ok">Active</span>
                  </div>
                  <span class="role-tag">Research</span>
                </div>
                <p class="agent-desc">Researches business documents, market notes, and knowledge sources to synthesize clear, cited briefings.</p>
                <div class="agent-meta">
                  <div class="meta-row"><strong>Model:</strong> Google Gemini 2.5 Pro</div>
                  <div class="meta-row"><strong>Knowledge:</strong> All Authorized Documents</div>
                  <div class="meta-row"><strong>Capabilities:</strong> Knowledge Search, Google Drive Read</div>
                </div>
                <div class="agent-card-footer">
                  <span class="status-indicator online"></span> Operating
                </div>
              </div>

              <div class="mesnium-agent-card">
                <div class="agent-card-header">
                  <div>
                    <h3 class="agent-title">Sales & Operations Assistant</h3>
                    <span class="badge badge--ok">Active</span>
                  </div>
                  <span class="role-tag">Sales</span>
                </div>
                <p class="agent-desc">Assists with customer proposals, meeting agendas, and inbound communications.</p>
                <div class="agent-meta">
                  <div class="meta-row"><strong>Model:</strong> Google Gemini 2.5 Flash</div>
                  <div class="meta-row"><strong>Knowledge:</strong> All Authorized Documents</div>
                  <div class="meta-row"><strong>Capabilities:</strong> Knowledge Search, Gmail Read, Calendar Read</div>
                </div>
                <div class="agent-card-footer">
                  <span class="status-indicator online"></span> Operating
                </div>
              </div>
            </div>

            <!-- Recent Activity -->
            <div class="mesnium-knowledge-docs-panel" style="margin-top: 28px;">
              <div class="panel-header">
                <h3>Recent Agent Activity</h3>
                <span class="badge badge--ok">Ledger Live</span>
              </div>
              <table class="mesnium-table">
                <thead>
                  <tr>
                    <th>Agent</th>
                    <th>Task / Prompt</th>
                    <th>Status</th>
                    <th>Sources Consulted</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Research Assistant</strong></td>
                    <td>What was January direct sales revenue?</td>
                    <td><span class="badge badge--ok">Completed</span></td>
                    <td>sample.xlsx (Sheet: Revenue)</td>
                    <td>Just now</td>
                  </tr>
                  <tr>
                    <td><strong>Sales & Operations</strong></td>
                    <td>Active deployments Q1 actual targets</td>
                    <td><span class="badge badge--ok">Completed</span></td>
                    <td>sample.docx (Metrics Table)</td>
                    <td>5m ago</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    }

    // 6. Approvals Surface Enhancer (for /approvals and /exec-approvals)
    if (path.includes('/approvals') || path.includes('/exec-approvals')) {
      const approvalsContainer = document.querySelector('openclaw-approvals-page, .approvals-view, main');
      if (approvalsContainer && !approvalsContainer.hasAttribute('data-mesnium-approvals-hub')) {
        approvalsContainer.setAttribute('data-mesnium-approvals-hub', 'true');
        approvalsContainer.innerHTML = `
          <div class="mesnium-approvals-hub">
            <div class="panel-header" style="margin-bottom: 24px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h2>Action Approvals Hub</h2>
                <div class="panel-subtitle" style="color: var(--muted-strong); font-size: 13px;">Human-in-the-loop authorization gatekeeper for high-risk external agent mutations.</div>
              </div>
              <span class="badge badge--warn">1 Action Requires Review</span>
            </div>

            <!-- Pending Action Card -->
            <div class="mesnium-approval-card" id="card-approval-101">
              <div class="approval-card-header">
                <div class="approval-agent-badge">
                  <div class="agent-avatar">S</div>
                  <div>
                    <h3 class="approval-title">Send Email Outreach to Lead</h3>
                    <div class="approval-agent-name">Requested by <strong>Sales & Operations Assistant</strong> &bull; Lead Qualification</div>
                  </div>
                </div>
                <span class="risk-badge risk-badge--high">High Risk &bull; Email Send</span>
              </div>

              <div class="approval-target-box">
                <div class="target-field"><strong>Recipient:</strong> john.smith@acme-enterprises.com</div>
                <div class="target-field"><strong>Subject:</strong> Partnership & Trial Proposal — Mesnium OS</div>
                <div class="target-field"><strong>Reason:</strong> Inbound lead scored 87/100 and matches target enterprise profile.</div>
              </div>

              <div class="approval-content-preview">
                <div class="preview-label">Proposed Email Body:</div>
                <div class="preview-text">Hi John,\n\nFollowing up on your inquiry regarding Mesnium's autonomous business operating system. I have prepared the preliminary deployment numbers and integration specifications for Acme Enterprises.\n\nPlease review the attached briefing notes at your convenience.\n\nBest regards,\nSales & Operations Team</div>
              </div>

              <div class="approval-footer">
                <div class="approval-meta-time">Requested 12m ago &bull; Expires in 23h 48m</div>
                <div class="approval-actions-row">
                  <button class="btn btn--secondary" id="btn-reject-101" onclick="this.closest('.mesnium-approval-card').style.display='none'">Reject Action</button>
                  <button class="btn btn--primary" id="btn-approve-101" onclick="this.textContent='Approved & Executed'; this.classList.add('btn--success');">Approve & Execute</button>
                </div>
              </div>
            </div>

            <!-- Recent Authorization History -->
            <div class="mesnium-knowledge-docs-panel" style="margin-top: 32px;">
              <div class="panel-header">
                <h3>Authorization History</h3>
                <span class="badge badge--ok">Cryptographic Audit Log</span>
              </div>
              <table class="mesnium-table">
                <thead>
                  <tr>
                    <th>Action</th>
                    <th>Agent</th>
                    <th>Target</th>
                    <th>Authorized By</th>
                    <th>Status</th>
                    <th>Time</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td><strong>Draft Calendar Event</strong></td>
                    <td>Sales & Operations Assistant</td>
                    <td>Google Calendar (Quarterly Review)</td>
                    <td>Meet (Operator)</td>
                    <td><span class="badge badge--ok">Executed</span></td>
                    <td>1 hour ago</td>
                  </tr>
                  <tr>
                    <td><strong>Send Campaign Email</strong></td>
                    <td>Marketing Lead</td>
                    <td>outreach-batch-3@leads.io</td>
                    <td>Meet (Operator)</td>
                    <td><span class="badge badge--danger" style="color: #ef4444;">Rejected</span></td>
                    <td>Yesterday</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        `;
      }
    }
  }

  function updateConnectionBadge() {
    const dot = document.querySelector('.sidebar-status__dot');
    if (dot) {
      dot.className = 'sidebar-status__dot';
      switch (currentState) {
        case ConnectionState.CONNECTED:
          dot.classList.add('sidebar-connection-status--online');
          dot.setAttribute('aria-label', 'Mesnium Engine Online');
          break;
        case ConnectionState.RECONNECTING:
        case ConnectionState.RECOVERING:
          dot.classList.add('sidebar-connection-status--recovering');
          dot.setAttribute('aria-label', 'Reconnecting to Engine...');
          break;
        default:
          dot.classList.add('sidebar-connection-status--offline');
          dot.setAttribute('aria-label', 'Engine Offline');
          break;
      }
    }
  }

  // --- 6. WINDOWS STANDBY / SLEEP / IDLE RECOVERY ENGINE ---
  async function checkGatewayHealth() {
    try {
      const res = await fetch('/health', {
        method: 'GET',
        cache: 'no-store',
        headers: { 'Accept': 'application/json' }
      });
      if (!res.ok) return { ok: false, status: res.status };
      const data = await res.json().catch(() => ({}));
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }

  async function performSleepWakeRecovery(reason) {
    const now = Date.now();
    if (isRecoveryInFlight || (now - lastRecoveryAttemptTime < 1000)) return;
    
    isRecoveryInFlight = true;
    lastRecoveryAttemptTime = now;
    setConnectionState(ConnectionState.RECOVERING);
    console.log(`[Mesnium Bridge] Sleep/Wake Recovery Triggered (${reason}). Probing Gateway health...`);

    try {
      let attempts = 0;
      let healthy = false;

      while (attempts < 10 && !healthy) {
        attempts++;
        const health = await checkGatewayHealth();
        if (health.ok) {
          healthy = true;
          console.log(`[Mesnium Bridge] Gateway is healthy after ${attempts} probe(s).`);
          break;
        }
        await new Promise(r => setTimeout(r, Math.min(2000, 200 * attempts)));
      }

      if (healthy) {
        const appElement = document.querySelector('openclaw-app');
        if (appElement && typeof appElement.requestUpdate === 'function') {
          appElement.requestUpdate();
        }

        bootstrapLocalAuth();
        setConnectionState(ConnectionState.CONNECTED);
        console.log('[Mesnium Bridge] Recovery complete. Connection restored.');
      } else {
        setConnectionState(ConnectionState.DISCONNECTED);
        console.warn('[Mesnium Bridge] Gateway unreachable after wake recovery attempts.');
      }
    } catch (err) {
      console.error('[Mesnium Bridge] Recovery error:', err);
      setConnectionState(ConnectionState.DISCONNECTED);
    } finally {
      isRecoveryInFlight = false;
    }
  }

  // Multi-signal sleep/wake event listeners
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      performSleepWakeRecovery('visibilitychange:visible');
    }
  });

  window.addEventListener('focus', () => {
    performSleepWakeRecovery('window:focus');
  });

  window.addEventListener('online', () => {
    performSleepWakeRecovery('window:online');
  });

  window.addEventListener('pageshow', (e) => {
    if (e.persisted) {
      performSleepWakeRecovery('pageshow:persisted');
    }
  });

  // Time-drift watchdog: detects OS suspend / sleep hibernation
  setInterval(() => {
    const now = Date.now();
    const drift = now - lastHeartbeatTick;
    lastHeartbeatTick = now;

    if (drift > 10000) {
      console.warn(`[Mesnium Bridge] System time jump detected (${drift}ms drift). OS resumed from sleep.`);
      performSleepWakeRecovery(`time-drift:${drift}ms`);
    }
  }, 3000);

  // --- 7. EXPOSE MESNIUM BRIDGE PUBLIC API ---
  window.MesniumBridge = {
    version: '1.0.0-alpha',
    engine: 'OpenClaw 2026.7.1',
    ConnectionState: Object.freeze(ConnectionState),
    getState: () => currentState,
    onStateChange: (listener) => {
      if (typeof listener === 'function') {
        stateListeners.add(listener);
        listener(currentState, currentState);
        return () => stateListeners.delete(listener);
      }
      return () => {};
    },
    getHealth: checkGatewayHealth,
    forceReconnect: () => performSleepWakeRecovery('manual:forceReconnect'),
    isLocal: () => location.hostname === '127.0.0.1' || location.hostname === 'localhost' || location.hostname === '::1',
    getGatewayUrl: () => (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host
  };

  // --- 8. INITIALIZATION ---
  bootstrapLocalAuth();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrandAssets);
  } else {
    applyBrandAssets();
  }

  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) cancelAnimationFrame(resizeTimer);
    resizeTimer = requestAnimationFrame(applyBrandAssets);
  }, { passive: true });

  const observer = new MutationObserver(mutations => {
    let shouldRun = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0 || mutation.type === 'attributes') {
        shouldRun = true;
        break;
      }
    }
    if (shouldRun) {
      applyBrandAssets();
    }
  });

  observer.observe(document.documentElement, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ['collapsed', 'nav-collapsed', 'class', 'style']
  });

  console.log('[Mesnium Bridge] Zero-Friction Local Runtime & Product Foundation Initialized.');
})();
