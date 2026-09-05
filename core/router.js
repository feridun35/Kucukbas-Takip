/**
 * ShepherdAI — SPA Hash Router & Route Guard
 * Hash-based routing ile sayfa geçişlerini yönetir ve oturum koruması (Route Guard) sağlar.
 */

import { setState } from './state.js';
import { isAuthenticated } from './auth.js';

const _routes = {};

/**
 * Bir route kaydet
 * @param {string} name - route adı (ör: 'dashboard', 'auth')
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
  let hash = window.location.hash.slice(1) || 'dashboard';

  // ── Oturum Koruma Kontrolü (Route Guard) ──
  const authenticated = isAuthenticated();

  if (!authenticated) {
    if (hash !== 'auth') {
      console.log('[Router] Unauthenticated access to', hash, '-> Redirecting to #auth');
      navigateTo('auth');
      return;
    }
  } else {
    // Oturum açıkken auth sayfasına gitmeye çalışırsa dashboard'a yönlendir
    if (hash === 'auth') {
      navigateTo('dashboard');
      return;
    }
  }

  const route = _routes[hash];

  if (!route) {
    console.warn(`[Router] Unknown route: ${hash}, falling back to ${authenticated ? 'dashboard' : 'auth'}`);
    navigateTo(authenticated ? 'dashboard' : 'auth');
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

  // Nav görünürlüğü ve aktif buton güncelleme
  _handleNavBarVisibility(hash);
  _updateNavActive(hash);
}

function _handleNavBarVisibility(currentRoute) {
  const navBar = document.getElementById('nav-bar');
  if (!navBar) return;

  if (currentRoute === 'auth') {
    navBar.style.display = 'none';
  } else {
    navBar.style.display = 'flex';
  }
}

function _updateNavActive(currentRoute) {
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const route = btn.dataset.route;
    btn.classList.toggle('active', route === currentRoute);
  });
}
