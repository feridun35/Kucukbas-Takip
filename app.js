/**
 * ShepherdAI — Ana Uygulama Giriş Noktası
 * Tüm modülleri import eder, router'ı başlatır, SPA'yı yönetir.
 */

import { registerRoute, initRouter, navigateTo } from './core/router.js';
import { setState } from './core/state.js';
import { startSensorPolling } from './core/sensors.js';
import { renderNavBar } from './modules/navigation.js';
import { mockHerdData, mockHealthData, mockFinanceData, mockAlerts, animalsArray } from './data/mock-data.js';

// Modüller
import * as Dashboard from './modules/dashboard.js';
import * as Herd     from './modules/herd.js';
import * as HerdList from './modules/herd-list.js';
import * as Finance  from './modules/finance.js';
import * as FinanceRoi from './modules/finance-roi.js';
import * as FinanceSilo from './modules/finance-silo.js';
import * as FinanceCulling from './modules/finance-culling.js';
import * as Health   from './modules/health.js';
import * as HealthAi from './modules/health-ai.js';
import * as HealthMeds from './modules/health-meds.js';
import * as HealthVaccines from './modules/health-vaccines.js';
import * as Profile  from './modules/profile.js';
import * as AnimalProfile from './modules/animal-profile.js';
import * as Tasks from './modules/tasks.js';
import *as Breeding from './modules/breeding.js';

/**
 * Uygulamayı başlat
 */
function initApp() {
  console.log('🐑 ShepherdAI v1.0 başlatılıyor…');

  // Temel verileri State'e yükle (Multi-Animal Array dahil)
  setState({
    herdSummary: mockHerdData,
    healthSummary: mockHealthData,
    financeSummary: mockFinanceData,
    alerts: mockAlerts,
    animals: animalsArray
  });

  // Route'ları kaydet
  registerRoute('dashboard', Dashboard);
  registerRoute('herd',      Herd);
  registerRoute('herd-list', HerdList);
  registerRoute('finance',   Finance);
  registerRoute('finance-roi', FinanceRoi);
  registerRoute('finance-silo', FinanceSilo);
  registerRoute('finance-culling', FinanceCulling);
  registerRoute('health',    Health);
  registerRoute('health-ai', HealthAi);
  registerRoute('health-meds', HealthMeds);
  registerRoute('health-vaccines', HealthVaccines);
  registerRoute('profile',   Profile);
  registerRoute('animal-profile', AnimalProfile);
  registerRoute('breeding',  Breeding);
  registerRoute('tasks',     Tasks);

  // Navigation bar'ı render et
  renderNavBar();

  // Router'ı başlat (ilk sayfa yüklemesi)
  if (!window.location.hash) {
    window.location.hash = '#dashboard';
  }
  initRouter();

  // Sensör polling başlat (mock — 60 saniyede bir)
  startSensorPolling(60000);

  console.log('✅ ShepherdAI hazır.');
}

// DOM hazır olunca başlat
document.addEventListener('DOMContentLoaded', initApp);
