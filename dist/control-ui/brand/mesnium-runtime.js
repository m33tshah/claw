/**
 * MESNIUM STUDIO — RUNTIME & BRIDGE LAYER (PHASE 5)
 * 
 * Provides:
 * 1. Zero-Friction Local Gateway Authentication & Bootstrap
 * 2. Mesnium Bridge Layer & Connection State Machine
 * 3. Windows Standby / Sleep / Idle Instant Wake & Reconnection Recovery
 * 4. Master Brand Asset Injection & Layout Normalization
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
  }

  // --- 5. WINDOWS STANDBY / SLEEP / IDLE RECOVERY ENGINE ---
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
        // Trigger UI reconnection if disconnected or stale
        const appElement = document.querySelector('openclaw-app');
        if (appElement && typeof appElement.requestUpdate === 'function') {
          appElement.requestUpdate();
        }

        // Notify storage/window that gateway is online
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

  // --- 6. EXPOSE MESNIUM BRIDGE PUBLIC API ---
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

  // --- 7. INITIALIZATION ---
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

  console.log('[Mesnium Bridge] Zero-Friction Local Runtime & Bridge Initialized.');
})();
