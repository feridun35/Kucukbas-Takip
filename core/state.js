/**
 * ShepherdAI — Merkezi Data State & Multi-Tenant Veri Saklama
 * Reactive store pattern ile tüm uygulama verisini yönetir.
 * Her kiracının (tenant/hesap) verisi izole LocalStorage anahtarıyla saklanır.
 */

import {
  mockHerdData,
  mockHealthData,
  mockFinanceData,
  mockSensorData,
  mockAlerts,
  animalsArray,
  mockTasks
} from '../data/mock-data.js';
import { syncHerdMathState } from './herdMathEngine.js';
import { pushLocalStateToCloud, pullCloudStateToLocal } from './syncManager.js';

// Varsayılan boş state şablonu
const EMPTY_STATE_TEMPLATE = {
  currentPage: 'dashboard',
  focusMode: 'meat',
  userRole: 'owner',
  activeAnimalId: null,
  currentUser: null,
  currentTenantKey: null,
  sensors: {
    connected: false,
    isMock: false,
    temperature: null,
    humidity: null,
    nh3: null,
    lastUpdate: null,
    thresholds: {
      temperature: { normal: 28, warning: 32, danger: 36 },
      humidity:    { normal: 70, warning: 80, danger: 90 },
      nh3:         { normal: 15, warning: 25, danger: 35 }
    }
  },
  herdSummary: {
    total: 0,
    sheep: 0,
    goat: 0,
    ram: 0,
    billy: 0,
    ewe: 0,
    doe: 0,
    lamb: 0,
    kid: 0,
    avgWeight: 0,
    avgAge: 0
  },
  healthSummary: {
    sick: 0,
    quarantine: 0,
    expectedBirths: 0,
    nextVaccination: '-',
    vaccinationCount: 0,
    deworming: 0,
    bodyConditionAvg: 0,
    lamenessCount: 0
  },
  financeSummary: {
    dailyFeedCost: 0,
    dailyFeedKg: 0,
    feedStockDays: 0,
    monthlyRevenue: 0,
    monthlyCost: 0,
    roi: 0,
    feedPerHead: 0,
    costPerHead: 0
  },
  alerts: [],
  vaccines: [],
  tasks: [],
  taskHistory: [],
  feedInventory: [],
  feedHistory: [],
  mortalityRecords: [],
  animals: [],
  pharmacyStock: [],
  treatmentRecords: [],
  customMedications: [],
  breedingRecords: []
};

// Bellekteki aktif state nesnesi
const AppState = JSON.parse(JSON.stringify(EMPTY_STATE_TEMPLATE));

// ── Aboneler ──
const _subscribers = new Set();

/**
 * State değişikliklerini dinle
 * @param {Function} callback - (newState) => void
 * @returns {Function} unsubscribe fonksiyonu
 */
export function subscribe(callback) {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
}

/**
 * State'i güncelle, aboneleri bilgilendir ve aktif kiracının LocalStorage alanına yaz
 * @param {Object} partial - güncellenecek kısmi state
 */
export function setState(partial) {
  Object.keys(partial).forEach(key => {
    if (typeof partial[key] === 'object' && partial[key] !== null && !Array.isArray(partial[key])) {
      AppState[key] = { ...AppState[key], ...partial[key] };
    } else {
      AppState[key] = partial[key];
    }
  });

  // Otomatik Akıllı Sürü & Matematik Motoru senkronizasyonu
  syncHerdMathState(AppState);

  _persistTenantState();
  _notifySubscribers();
}

/**
 * Mevcut state'in derin kopyasını döndür
 */
export function getState() {
  return JSON.parse(JSON.stringify(AppState));
}

/**
 * Belirli bir hayvan objesini ID'sine göre döndürür
 * @param {string} id - Hayvan Küpe Numarası (Örn: TR-102)
 */
export function getAnimalById(id) {
  if (!id || !AppState.animals) return null;
  return AppState.animals.find(a => a.id === id) || null;
}

/**
 * Demo hesabı için zengin başlangıç verisi üretir
 */
export function getInitialDemoState() {
  return {
    focusMode: 'meat',
    userRole: 'owner',
    activeAnimalId: 'TR-102',
    sensors: JSON.parse(JSON.stringify(mockSensorData)),
    herdSummary: JSON.parse(JSON.stringify(mockHerdData)),
    healthSummary: JSON.parse(JSON.stringify(mockHealthData)),
    financeSummary: JSON.parse(JSON.stringify(mockFinanceData)),
    alerts: JSON.parse(JSON.stringify(mockAlerts)),
    animals: JSON.parse(JSON.stringify(animalsArray)),
    tasks: JSON.parse(JSON.stringify(mockTasks)),
    taskHistory: [
      { id: 'TSK-H01', title: 'Ağıl Dezenfeksiyonu', desc: 'Tüm bölmelerin ilaçlı yıkama işlemi.', type: 'cleaning', prio: 'Normal', scope: 'herd', targetTag: null, status: 'completed', createdAt: '2026-03-15', completedAt: '2026-03-15' }
    ],
    vaccines: [
      { id: 1, name: 'Sürü Geneli Çelerme', date: '21 Mar 2026', status: 'upcoming', target: 'Tüm Sürü' },
      { id: 2, name: 'Sürü Geneli Şap Aşısı', date: '05 Nis 2026', status: 'pending', target: 'Tüm Sürü' },
      { id: 3, name: 'Brucella', date: 'Ocak 2026', status: 'done', target: 'Gençler Sürüsü' },
      { id: 4, name: 'Bireysel Ektima M.', date: 'Aralık 2025', status: 'done', target: 'TR-102, TR-088' }
    ],
    feedInventory: [
      { id: 'yonca', name: 'Yonca', icon: '🌿', amount: 1200, unit: 'kg', unitPrice: 9.5 },
      { id: 'fi', name: 'Fiğ', icon: '🌱', amount: 800, unit: 'kg', unitPrice: 8.0 },
      { id: 'bugday', name: 'Buğday', icon: '🌾', amount: 600, unit: 'kg', unitPrice: 7.8 },
      { id: 'arpa', name: 'Arpa', icon: '🌾', amount: 450, unit: 'kg', unitPrice: 7.5 },
      { id: 'misir', name: 'Mısır Silajı', icon: '🌽', amount: 2000, unit: 'kg', unitPrice: 3.2 },
      { id: 'saman', name: 'Saman', icon: '🪹', amount: 1500, unit: 'kg', unitPrice: 2.1 },
      { id: 'hazir', name: 'Hazır Yem (Besi)', icon: '📦', amount: 300, unit: 'kg', unitPrice: 11.0 },
      { id: 'kuzu', name: 'Kuzu Gelişim Yemi', icon: '🐣', amount: 150, unit: 'kg', unitPrice: 13.5 },
      { id: 'mineral', name: 'Mineral/Vitamin', icon: '💊', amount: 25, unit: 'kg', unitPrice: 45.0 },
      { id: 'yalama', name: 'Tuz Yalama Taşı', icon: '🪨', amount: 10, unit: 'adet', unitPrice: 65.0 }
    ],
    feedHistory: [
      { id: 'FH-001', feedId: 'arpa', feedName: 'Arpa', amount: 200, unitPrice: 7.5, type: 'entry', date: '15 Mar 2026', note: '2 çuval (7.5 TL/kg)' },
      { id: 'FH-002', feedId: 'saman', feedName: 'Saman', amount: 500, unitPrice: 2.1, type: 'entry', date: '10 Mar 2026', note: 'Bal topları (2.1 TL/kg)' }
    ],
    mortalityRecords: [
      {
        id: 'MORT-001',
        animalId: 'TR-019',
        rfid: 'RFID-99019X00',
        breed: 'Merinos',
        type: 'Kuzu',
        gender: 'Erkek',
        group: 'Besi',
        lastWeight: 14.2,
        deathDate: '2026-02-10',
        deathReason: 'Enterotoksemi (Çelerme)',
        financialLoss: 3500,
        note: 'Şiddetli ishal sonrası kayıp.'
      }
    ],
    pharmacyStock: [
      { id: 'PS-001', medicationId: 'primamycin-la', batchNo: 'LOT-2026A', totalQuantity: 100, remainingQuantity: 72, unit: 'ml', criticalThreshold: 20, expiryDate: '2027-06-15', openedDate: '2026-02-20' },
      { id: 'PS-002', medicationId: 'dectomax', batchNo: 'LOT-2026B', totalQuantity: 200, remainingQuantity: 145, unit: 'ml', criticalThreshold: 30, expiryDate: '2027-12-01', openedDate: null },
      { id: 'PS-003', medicationId: 'ketogezik', batchNo: 'LOT-2025X', totalQuantity: 50, remainingQuantity: 12, unit: 'ml', criticalThreshold: 15, expiryDate: '2026-11-30', openedDate: '2026-03-01' },
      { id: 'PS-004', medicationId: 'e-sevit', batchNo: 'LOT-2026C', totalQuantity: 100, remainingQuantity: 88, unit: 'ml', criticalThreshold: 20, expiryDate: '2027-09-20', openedDate: null },
      { id: 'PS-005', medicationId: 'amoxylin-la', batchNo: 'LOT-2026D', totalQuantity: 100, remainingQuantity: 65, unit: 'ml', criticalThreshold: 25, expiryDate: '2027-03-10', openedDate: '2026-01-15' }
    ],
    treatmentRecords: [
      {
        id: 'TR-REC-001',
        animalId: 'TR-088',
        medicationId: 'primamycin-la',
        medicationName: 'Primamycin LA',
        activeIngredient: 'Oksitetrasiklin (Uzun Etkili)',
        dosage: 5.5,
        dosageUnit: 'ml',
        applicationDate: '2026-03-10',
        applicationType: 'single',
        batchTargets: [],
        courseInfo: { currentDay: 1, totalDays: 1, nextDoseDate: null },
        withdrawals: {
          meatWithdrawalDays: 28,
          milkWithdrawalDays: 7,
          lastDoseDate: '2026-03-10',
          meatSafeDate: '2026-04-07',
          milkSafeDate: '2026-03-17'
        },
        pregnancyOverride: false,
        notes: 'Solunum enfeksiyonu tedavisi'
      }
    ],
    customMedications: [],
    breedingRecords: [
      {
        id: 'BR-DEMO-001',
        type: 'INDIVIDUAL',
        sireIds: ['TR-210'],
        damIds: ['TR-102'],
        startDate: new Date(Date.now() - 95 * 86400000).toISOString().split('T')[0],
        endDate: null,
        status: 'PREGNANT',
        milestones: {
          cycleCheckDate: new Date(Date.now() - 78 * 86400000).toISOString().split('T')[0],
          ultrasoundDate: new Date(Date.now() - 50 * 86400000).toISOString().split('T')[0],
          lateGestationDate: new Date(Date.now() + 20 * 86400000).toISOString().split('T')[0],
          expectedBirthDate: new Date(Date.now() + 53 * 86400000).toISOString().split('T')[0]
        },
        inbreedingWarning: null,
        birthRecord: null
      },
      {
        id: 'BR-DEMO-002',
        type: 'GROUP',
        sireIds: ['TR-210'],
        damIds: ['TR-045', 'TR-088'],
        startDate: new Date(Date.now() - 160 * 86400000).toISOString().split('T')[0],
        endDate: new Date(Date.now() - 145 * 86400000).toISOString().split('T')[0],
        status: 'COMPLETED',
        milestones: {
          cycleCheckDate: new Date(Date.now() - 143 * 86400000).toISOString().split('T')[0],
          ultrasoundDate: new Date(Date.now() - 115 * 86400000).toISOString().split('T')[0],
          lateGestationDate: new Date(Date.now() - 45 * 86400000).toISOString().split('T')[0],
          expectedBirthDate: new Date(Date.now() - 12 * 86400000).toISOString().split('T')[0]
        },
        inbreedingWarning: null,
        birthRecord: { date: new Date(Date.now() - 10 * 86400000).toISOString().split('T')[0], type: 'Normal', lambCount: 2 }
      }
    ]
  };
}

/**
 * Sıfır Çiftlik / Yeni İşletme için tamamen boş başlangıç verisi üretir
 */
export function getInitialBlankState(user) {
  return {
    focusMode: 'meat',
    userRole: user?.role || 'owner',
    activeAnimalId: null,
    sensors: {
      connected: false,
      isMock: false,
      temperature: null,
      humidity: null,
      nh3: null,
      lastUpdate: null,
      thresholds: {
        temperature: { normal: 28, warning: 32, danger: 36 },
        humidity:    { normal: 70, warning: 80, danger: 90 },
        nh3:         { normal: 15, warning: 25, danger: 35 }
      }
    },
    herdSummary: { total: 0, sheep: 0, goat: 0, ram: 0, billy: 0, ewe: 0, doe: 0, lamb: 0, kid: 0, avgWeight: 0, avgAge: 0 },
    healthSummary: { sick: 0, quarantine: 0, expectedBirths: 0, nextVaccination: '-', vaccinationCount: 0, deworming: 0, bodyConditionAvg: 0, lamenessCount: 0 },
    financeSummary: { dailyFeedCost: 0, dailyFeedKg: 0, feedStockDays: 0, monthlyRevenue: 0, monthlyCost: 0, roi: 0, feedPerHead: 0, costPerHead: 0 },
    alerts: [],
    animals: [],
    tasks: [],
    taskHistory: [],
    vaccines: [],
    feedInventory: [],
    feedHistory: [],
    mortalityRecords: [],
    pharmacyStock: [],
    treatmentRecords: [],
    customMedications: [],
    breedingRecords: []
  };
}

/**
 * Kiracının (Tenant) verisini LocalStorage'dan yükler ve Supabase ile eşitlemeyi tetikler
 * @param {Object} user - Aktif kullanıcı objesi
 */
export function loadTenantState(user) {
  if (!user || !user.storageKey) return;

  // Önce bellekteki AppState'i tamamen sıfırla
  _resetMemoryState();

  AppState.currentUser = user;
  AppState.currentTenantKey = user.storageKey;
  AppState.userRole = user.role || 'owner';

  try {
    const rawData = localStorage.getItem(user.storageKey);
    if (rawData) {
      // Daha önce kaydedilmiş yerel veri varsa onu yükle
      const parsed = JSON.parse(rawData);
      Object.keys(parsed).forEach(k => {
        AppState[k] = parsed[k];
      });
      syncHerdMathState(AppState);
    } else {
      // Kaydedilmiş veri yoksa hesap türüne göre ilk veriyi ata
      const isDemo = user.id === 'demo' || user.isDemo;
      const initialData = isDemo ? getInitialDemoState() : getInitialBlankState(user);
      
      Object.keys(initialData).forEach(k => {
        AppState[k] = initialData[k];
      });
      syncHerdMathState(AppState);
      
      // İlk veriyi LocalStorage'a kaydet
      localStorage.setItem(user.storageKey, JSON.stringify(AppState));
    }
  } catch (e) {
    console.error('[State] Error loading tenant state:', e);
  }

  _notifySubscribers();

  // Bulut Verisini Çek ve Eşitle (Arka planda asenkron)
  pullCloudStateToLocal(user.storageKey).then(cloudPayload => {
    if (cloudPayload && typeof cloudPayload === 'object' && Object.keys(cloudPayload).length > 0) {
      console.log('[State] ☁️ Buluttan gelen veri yerel state ile eşitleniyor...');
      applyCloudState(cloudPayload);
    } else {
      // Bulutta kayıt yoksa mevcut yerel veriyi buluta gönder
      _persistTenantState();
    }
  }).catch(err => {
    console.error('[State] Cloud pull error:', err);
  });
}

/**
 * Buluttan gelen state yükünü mevcut AppState'e uygular
 */
export function applyCloudState(cloudPayload) {
  if (!cloudPayload || typeof cloudPayload !== 'object') return;

  Object.keys(cloudPayload).forEach(k => {
    if (k !== 'currentPage' && k !== 'currentUser' && k !== 'currentTenantKey') {
      AppState[k] = cloudPayload[k];
    }
  });

  syncHerdMathState(AppState);

  if (AppState.currentTenantKey) {
    try {
      const dataToSave = {};
      Object.keys(AppState).forEach(key => {
        if (key !== 'currentPage' && key !== 'currentUser' && key !== 'currentTenantKey') {
          dataToSave[key] = AppState[key];
        }
      });
      localStorage.setItem(AppState.currentTenantKey, JSON.stringify(dataToSave));
    } catch (e) {
      console.error('[State] Error saving applied cloud state to localStorage:', e);
    }
  }

  _notifySubscribers();
}

/**
 * Yeni kiracı oluşturulduğunda temiz state başlatır
 * @param {Object} user 
 */
export function initNewTenantState(user) {
  if (!user || !user.storageKey) return;

  _resetMemoryState();
  AppState.currentUser = user;
  AppState.currentTenantKey = user.storageKey;
  AppState.userRole = user.role || 'owner';

  const blankState = getInitialBlankState(user);
  Object.keys(blankState).forEach(k => {
    AppState[k] = blankState[k];
  });

  try {
    localStorage.setItem(user.storageKey, JSON.stringify(blankState));
  } catch (e) {
    console.error('[State] Error initializing new tenant state:', e);
  }

  _notifySubscribers();
  _persistTenantState();
}

/**
 * Oturum kapatıldığında bellekteki state'i tamamen temizler
 */
export function clearTenantState() {
  _resetMemoryState();
  _notifySubscribers();
}

/**
 * State'i aktif kiracının LocalStorage alanına zorla kaydet
 */
export function saveState() {
  _persistTenantState();
}

function _resetMemoryState() {
  const fresh = JSON.parse(JSON.stringify(EMPTY_STATE_TEMPLATE));
  Object.keys(AppState).forEach(key => {
    delete AppState[key];
  });
  Object.keys(fresh).forEach(key => {
    AppState[key] = fresh[key];
  });
}

function _persistTenantState() {
  let tenantKey = AppState.currentTenantKey;
  if (!tenantKey) {
    try {
      const userRaw = localStorage.getItem('shepherd_current_user');
      if (userRaw) {
        const u = JSON.parse(userRaw);
        tenantKey = u.storageKey;
        AppState.currentTenantKey = tenantKey;
        AppState.currentUser = u;
      }
    } catch(e) {}
  }
  if (!tenantKey) return;

  try {
    const dataToSave = {};
    Object.keys(AppState).forEach(key => {
      if (key !== 'currentPage' && key !== 'currentUser' && key !== 'currentTenantKey') {
        dataToSave[key] = AppState[key];
      }
    });

    localStorage.setItem(tenantKey, JSON.stringify(dataToSave));
    console.log(`[Storage] ✅ Durum '${tenantKey}' anahtarına başarıyla kaydedildi.`);

    // Supabase bulut senkronizasyonu tetikle (debounced)
    pushLocalStateToCloud(tenantKey, dataToSave);
  } catch (e) {
    console.error('[State] Error persisting tenant state:', e);
  }
}

function _notifySubscribers() {
  const snapshot = getState();
  _subscribers.forEach(cb => {
    try { cb(snapshot); } catch (e) { console.error('[State] Subscriber error:', e); }
  });
}

export default AppState;
