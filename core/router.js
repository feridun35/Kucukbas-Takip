/**
 * ShepherdAI — SPA Hash Router
 * Hash-based routing ile sayfa geçişlerini yönetir.
 */

import { setState } from './state.js';

const _routes = {};

/**
 * Bir route kaydet
 * @param {string} name - route adı (ör: 'dashboard')
 * @param {Object} module - { render(), init?() } fonksiyonları içeren modül
 */
export function registerRoute(name, module) {
  _routes[name] = module;
}

/**
 * Belirtilen sayfaya navigate et
 * @param {string} route - hedef sayfa adı
 */
export function navigateTo(route) {
  window.location.hash = `#${route}`;
}

/**
 * Router'ı başlat — hashchange event listener
 */
export function initRouter() {
  window.addEventListener('hashchange', _handleRouteChange);
  // İlk yükleme
  _handleRouteChange();
}

function _handleRouteChange() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const route = _routes[hash];

  if (!route) {
    console.warn(`[Router] Unknown route: ${hash}, falling back to dashboard`);
    navigateTo('dashboard');
    return;
  }

  setState({ currentPage: hash });

  const appContainer = document.getElementById('app');
  if (appContainer) {
    appContainer.innerHTML = '';
    const pageEl = route.render();
    if (pageEl) {
      pageEl.classList.add('page-enter');
      appContainer.appendChild(pageEl);
    }
    if (route.init) route.init();
  }

  // Nav güncelle
  _updateNavActive(hash);
}

function _updateNavActive(currentRoute) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const route = btn.dataset.route;
    btn.classList.toggle('active', route === currentRoute);
  });
}
