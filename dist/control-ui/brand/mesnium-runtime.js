/**
 * MESNIUM BRAND RUNTIME & UI NORMALIZATION LAYER
 * 
 * Injects master brand assets into shell components:
 * - Sidebar expanded: Full Mesnium logo lockup (emblem + wordmark)
 * - Sidebar collapsed: Standalone Mesnium emblem
 * - Topbar: Full Mesnium logo lockup (responsive emblem fallback on narrow viewports)
 * - Login screen: Full Mesnium logo lockup
 * - Browser favicon & touch icon: Standalone Mesnium emblem
 */

(function () {
  'use strict';

  const BRAND_LOGO = './brand/logo.png'; // Full Mesnium Logo Lockup (Emblem + Wordmark)
  const BRAND_ICON = './brand/icon.png'; // Standalone Mesnium Emblem (Glyph only)
  const BRAND_NAME = 'Mesnium';

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
    // 1. Sidebar Brand Logo & Title
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

    // 2. Topbar Brand Logo
    const isNarrowViewport = window.innerWidth < 640;
    const targetTopbarAsset = isNarrowViewport ? BRAND_ICON : BRAND_LOGO;
    document.querySelectorAll('.topbar-brand__logo').forEach(img => {
      if (img.getAttribute('src') !== targetTopbarAsset) {
        img.src = targetTopbarAsset;
        img.alt = BRAND_NAME;
      }
      img.style.objectFit = 'contain';
    });

    // 3. Login Gate Logo
    document.querySelectorAll('.login-gate__logo').forEach(img => {
      if (img.getAttribute('src') !== BRAND_LOGO) {
        img.src = BRAND_LOGO;
        img.alt = BRAND_NAME;
      }
      img.style.objectFit = 'contain';
    });

    // 4. Document Title
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

  // Handle window resize for responsive asset adjustments
  let resizeTimer = null;
  window.addEventListener('resize', () => {
    if (resizeTimer) cancelAnimationFrame(resizeTimer);
    resizeTimer = requestAnimationFrame(applyBrandAssets);
  }, { passive: true });

  // MutationObserver to handle dynamic Lit component mounting, navigation, and sidebar toggles
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

  console.log('[Mesnium] Visual Foundation & Brand Runtime Initialized.');
})();
