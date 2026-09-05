/**
 * ShepherdAI — Ana Uygulama Giriş Noktası
 * Tüm modülleri import eder, kimlik doğrulamasını başlatır, router'ı yönetir.
 */

import { registerRoute, initRouter, navigateTo } from './core/router.js';
import { setState, loadTenantState } from './core/state.js';
import { getCurrentUser, isAuthenticated } from './core/auth.js';
import { startSensorPolling } from './core/sensors.js';
import { initSyncManager } from './core/syncManager.js';
import { renderNavBar } from './modules/navigation.js';

// Modüller
import * as Auth from './modules/auth.js';
import * as Dashboard from './modules/dashboard.js';
import * as Herd from './modules/herd.js';
import * as HerdList from './modules/herd-list.js';
import * as Finance from './modules/finance.js';
import * as FinanceRoi from './modules/finance-roi.js';
import * as FinanceSilo from './modules/finance-silo.js';
import * as FinanceCulling from './modules/finance-culling.js';
import * as Health from './modules/health.js';
import * as HealthAi from './modules/health-ai.js';
import * as HealthMeds from './modules/health-meds.js';
import * as HealthVaccines from './modules/health-vaccines.js';
import * as HealthMortality from './modules/health-mortality.js';
import * as Profile from './modules/profile.js';
import * as AnimalProfile from './modules/animal-profile.js';
import * as Tasks from './modules/tasks.js';
import * as Breeding from './modules/breeding.js';

/**
 * Uygulamayı başlat
 */
function initApp() {
  console.log('🐑 ShepherdAI v1.1 başlatılıyor…');

  // Bulut senkronizasyon yöneticisini başlat
  initSyncManager();

  // Aktif oturum varsa ilgili kiracının (tenant) izole verisini yükle
  if (isAuthenticated()) {
    const user = getCurrentUser();
    console.log(`🔑 Aktif oturum: ${user.ownerName} (${user.farmName} - ${user.storageKey})`);
    loadTenantState(user);
  }

  // Route'ları kaydet
  registerRoute('auth', Auth);
  registerRoute('dashboard', Dashboard);
  registerRoute('herd', Herd);
  registerRoute('herd-list', HerdList);
  registerRoute('finance', Finance);
  registerRoute('finance-roi', FinanceRoi);
  registerRoute('finance-silo', FinanceSilo);
  registerRoute('finance-culling', FinanceCulling);
  registerRoute('health', Health);
  registerRoute('health-ai', HealthAi);
  registerRoute('health-meds', HealthMeds);
  registerRoute('health-vaccines', HealthVaccines);
  registerRoute('health-mortality', HealthMortality);
  registerRoute('profile', Profile);
  registerRoute('animal-profile', AnimalProfile);
  registerRoute('breeding', Breeding);
  registerRoute('tasks', Tasks);

  // Navigation bar'ı render et
  renderNavBar();

  // Router'ı başlat (ilk sayfa yüklemesi)
  if (!window.location.hash) {
    window.location.hash = isAuthenticated() ? '#dashboard' : '#auth';
  }
  initRouter();

  // Sensör polling başlat (mock — 60 saniyede bir)
  startSensorPolling(60000);

  console.log('✅ ShepherdAI hazır.');
}

// DOM hazır olunca başlat
document.addEventListener('DOMContentLoaded', initApp);
