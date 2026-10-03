/**
 * ShepherdAI — SPA Hash Router & Route Guard
 * Hash-based routing ile sayfa geçişlerini yönetir ve oturum koruması (Route Guard) sağlar.
 */

import { setState, subscribe, STATE_SOURCES } from './state.js';

const _routes = {};
let _currentRoute = null;
// Oturum kontrolü app.js tarafından initRouter() ile verilir (router ⇄ auth döngüsel importu yok)
let _isAuthenticated = () => false;
let _pendingRefresh = false;
let _refreshRetryTimer = null;

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
/**
 * @param {{ isAuthenticated: () => boolean }} options - Route guard için oturum kontrolü
 */
export function initRouter({ isAuthenticated } = {}) {
  if (typeof isAuthenticated === 'function') _isAuthenticated = isAuthenticated;
  window.addEventListener('hashchange', _handleRouteChange);

  // Reaktiflik: başka cihazdan gelen bulut güncellemesi açık sayfayı yeniden çizer.
  // Yerel işlemler sayfaların kendi yeniden çizimiyle yönetildiği için burada tetiklenmez.
  subscribe((meta) => {
    if (meta?.source === STATE_SOURCES.CLOUD) refreshCurrentRoute();
  });

  // İlk yükleme
  _handleRouteChange();
}

/**
 * Açık sayfayı güncel state ile yeniden çizer (scroll konumu korunur).
 * Kullanıcı o an bir modal kullanıyor ya da bir alana yazıyorsa yeniden çizim ertelenir,
 * böylece yarım kalan giriş kaybolmaz.
 */
export function refreshCurrentRoute() {
  if (!_currentRoute || _currentRoute === 'auth') return;

  if (_isUserInteracting()) {
    _pendingRefresh = true;
    if (!_refreshRetryTimer) {
      _refreshRetryTimer = setInterval(() => {
        if (!_pendingRefresh) {
          clearInterval(_refreshRetryTimer);
          _refreshRetryTimer = null;
          return;
        }
        if (!_isUserInteracting()) refreshCurrentRoute();
      }, 1000);
    }
    return;
  }

  _pendingRefresh = false;
  const scrollPos = window.scrollY;
  _renderRoute(_currentRoute, { animate: false });
  window.scrollTo(0, scrollPos);
}

function _isUserInteracting() {
  // Ortak modal ve kendi kapsayıcısını kullanan eşleşme modalı
  const modalRoots = ['custom-modal-container', 'breeding-modal-root'];
  if (modalRoots.some(id => (document.getElementById(id)?.children.length || 0) > 0)) return true;

  const active = document.activeElement;
  const app = document.getElementById('app');
  return Boolean(active && app && app.contains(active) &&
    ['INPUT', 'TEXTAREA', 'SELECT'].includes(active.tagName));
}

function _renderRoute(hash, { animate = true } = {}) {
  const route = _routes[hash];
  const appContainer = document.getElementById('app');
  if (!route || !appContainer) return;

  appContainer.innerHTML = '';
  const pageEl = route.render();
  if (pageEl) {
    if (animate) pageEl.classList.add('page-enter');
    else pageEl.classList.remove('page-enter');
    appContainer.appendChild(pageEl);
  }
  if (route.init) route.init();
}

function _handleRouteChange() {
  let hash = window.location.hash.slice(1) || 'dashboard';

  // ── Oturum Koruma Kontrolü (Route Guard) ──
  const authenticated = _isAuthenticated();

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

  _currentRoute = hash;
  _pendingRefresh = false;
  _renderRoute(hash);

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
