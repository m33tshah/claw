/**
 * MESNIUM BRAND RUNTIME & UI NORMALIZATION LAYER
 * 
 * Injects master brand assets into shell components, ensures standard business
 * status terminology, and applies runtime UI polish without interfering with
 * underlying WebSocket RPC or Lit component lifecycles.
 */

(function () {
  'use strict';

  const BRAND_ICON = './brand/icon.png';
  const BRAND_NAME = 'MESNIUM';

  function applyBrandAssets() {
    // 1. Sidebar Brand Logo
    document.querySelectorAll('.sidebar-brand__logo, .topbar-brand__logo, .login-gate__logo').forEach(img => {
      if (img.getAttribute('src') !== BRAND_ICON) {
        img.src = BRAND_ICON;
        img.alt = BRAND_NAME;
        img.style.objectFit = 'contain';
      }
    });

    // 2. Sidebar Title Formatting
    document.querySelectorAll('.sidebar-brand__title, .topbar-brand__title, .login-gate__title').forEach(el => {
      if (el.textContent.trim() !== BRAND_NAME) {
        el.textContent = BRAND_NAME;
      }
    });

    // 3. Document Title
    if (!document.title.includes('Mesnium')) {
      document.title = 'Mesnium Studio';
    }
  }

  // Initial execution
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', applyBrandAssets);
  } else {
    applyBrandAssets();
  }

  // MutationObserver to handle dynamic page navigation and element mounting
  const observer = new MutationObserver(mutations => {
    let shouldRun = false;
    for (const mutation of mutations) {
      if (mutation.addedNodes.length > 0) {
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
    attributes: false
  });

  console.log('[Mesnium] Visual Foundation & Brand Runtime Initialized.');
})();
