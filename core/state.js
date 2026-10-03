/**
 * ShepherdAI — Merkezi Data State & Multi-Tenant Veri Saklama
 * Reactive store pattern ile tüm uygulama verisini yönetir.
 * Her kiracının (tenant/hesap) verisi izole LocalStorage anahtarıyla saklanır.
 */

import { todayIso, addDaysIso } from './dateUtils.js';
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
import { migrateTenantData, CURRENT_SCHEMA_VERSION } from './migrations.js';
import { mergeFarmPayloads } from './syncMerge.js';
import { pushLocalStateToCloud, syncOnLoad, setCloudLoadDone, setSyncStatus, SYNC_STATUS, connectStateBridge } from './syncManager.js';

// ── Anahtar Sınıfları ──
// Hiçbir yere yazılmayan oturum anahtarları
const SESSION_KEYS = ['currentPage', 'currentUser', 'currentTenantKey'];
// Yalnızca bu cihazın localStorage'ında tutulan, buluta gönderilmeyen ve buluttan ezilmeyen anahtarlar
const DEVICE_LOCAL_KEYS = ['activeAnimalId', 'userRole', 'sensors'];
// Her setState'te yeniden hesaplanan türetilmiş özetler (buluta gönderilmez)
const DERIVED_KEYS = ['herdSummary', 'healthSummary', 'financeSummary'];

/** State değişikliğinin kaynağı — aboneler buna göre tepki verir */
export const STATE_SOURCES = {
  LOCAL: 'local',     // Bu cihazdaki kullanıcı/motor işlemi
  CLOUD: 'cloud',     // Başka cihazdan gelen bulut güncellemesi
  LOAD: 'load',       // Oturum açılışı / kiracı yükleme
  SENSORS: 'sensors', // Sensör telemetrisi
  RESET: 'reset'      // Oturum kapatma
};

// Varsayılan boş state şablonu
const EMPTY_STATE_TEMPLATE = {
  schemaVersion: CURRENT_SCHEMA_VERSION,
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
 * @param {Function} callback - (meta: { source, keys }) => void
 *   Güncel state gerekiyorsa callback içinde getState() çağrılır (her bildirimde derin kopya alınmaz).
 * @returns {Function} unsubscribe fonksiyonu
 */
export function subscribe(callback) {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
}

/**
 * State'i güncelle, aboneleri bilgilendir ve aktif kiracının LocalStorage alanına yaz.
 * Yalnızca oturum/cihaz-yerel anahtarları değişiyorsa buluta push yapılmaz.
 * @param {Object} partial - güncellenecek kısmi state
 */
export function setState(partial) {
  const keys = Object.keys(partial);
  if (keys.length === 0) return;

  keys.forEach(key => {
    if (typeof partial[key] === 'object' && partial[key] !== null && !Array.isArray(partial[key])) {
      AppState[key] = { ...AppState[key], ...partial[key] };
    } else {
      AppState[key] = partial[key];
    }
  });

  const isSessionOnly = keys.every(k => SESSION_KEYS.includes(k));
  const isLocalOnly = keys.every(k => SESSION_KEYS.includes(k) || DEVICE_LOCAL_KEYS.includes(k));

  // Oturum anahtarları (örn. currentPage) sürü verisini değiştirmez — yeniden hesaplama ve kayıt gereksiz
  if (!isSessionOnly) {
    // Otomatik Akıllı Sürü & Matematik Motoru senkronizasyonu
    syncHerdMathState(AppState);
    _persistTenantState({ skipCloudPush: isLocalOnly });
  }

  const source = keys.length === 1 && keys[0] === 'sensors' ? STATE_SOURCES.SENSORS : STATE_SOURCES.LOCAL;
  _notifySubscribers({ source, keys });
}

/**
 * State'e KOPYASIZ, salt-okunur erişim (performans için).
 * Yalnızca okuyan ve sonucu değiştirmeyen core fonksiyonları içindir; dönen nesneler asla
 * değiştirilmemelidir — değişiklik her zaman setState() ile yapılır.
 * UI ve yazma yapan kod getState() (derin kopya) kullanmaya devam eder.
 */
export function readState() {
  return AppState;
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
  // Demo tohumu eski (v1) formatta yazılmıştır; göç katmanından geçirilerek güncel şemaya yükseltilir.
  return migrateTenantData({
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
      { id: 'PS-001', medicationId: 'primamycin-la', batchNo: 'LOT-2026A', totalQuantity: 100, remainingQuantity: 72, unit: 'ml', criticalThreshold: 20, expiryDate: '2027-06-15', openedDate: addDaysIso(todayIso(), -10) },
      { id: 'PS-002', medicationId: 'dectomax', batchNo: 'LOT-2026B', totalQuantity: 200, remainingQuantity: 145, unit: 'ml', criticalThreshold: 30, expiryDate: '2027-12-01', openedDate: null },
      { id: 'PS-003', medicationId: 'ketogezik', batchNo: 'LOT-2025X', totalQuantity: 50, remainingQuantity: 12, unit: 'ml', criticalThreshold: 15, expiryDate: addDaysIso(todayIso(), 60), openedDate: addDaysIso(todayIso(), -6) },
      { id: 'PS-004', medicationId: 'e-sevit', batchNo: 'LOT-2026C', totalQuantity: 100, remainingQuantity: 88, unit: 'ml', criticalThreshold: 20, expiryDate: '2027-09-20', openedDate: null },
      { id: 'PS-005', medicationId: 'amoxylin-la', batchNo: 'LOT-2026D', totalQuantity: 100, remainingQuantity: 65, unit: 'ml', criticalThreshold: 25, expiryDate: '2027-03-10', openedDate: addDaysIso(todayIso(), -3) }
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
        startDate: addDaysIso(todayIso(), -95),
        endDate: null,
        status: 'PREGNANT',
        milestones: {
          cycleCheckDate: addDaysIso(todayIso(), -78),
          ultrasoundDate: addDaysIso(todayIso(), -50),
          lateGestationDate: addDaysIso(todayIso(), 20),
          expectedBirthDate: addDaysIso(todayIso(), 53)
        },
        inbreedingWarning: null,
        birthRecord: null
      },
      {
        id: 'BR-DEMO-002',
        type: 'GROUP',
        sireIds: ['TR-210'],
        damIds: ['TR-045', 'TR-088'],
        startDate: addDaysIso(todayIso(), -160),
        endDate: addDaysIso(todayIso(), -145),
        status: 'COMPLETED',
        milestones: {
          cycleCheckDate: addDaysIso(todayIso(), -143),
          ultrasoundDate: addDaysIso(todayIso(), -115),
          lateGestationDate: addDaysIso(todayIso(), -45),
          expectedBirthDate: addDaysIso(todayIso(), -12)
        },
        inbreedingWarning: null,
        birthRecord: { date: addDaysIso(todayIso(), -10), type: 'Normal', lambCount: 2 }
      }
    ]
  });
}

/**
 * Sıfır Çiftlik / Yeni İşletme için tamamen boş başlangıç verisi üretir
 */
export function getInitialBlankState(user) {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
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
    feedInventory: [],
    feedHistory: [],
    mortalityRecords: [],
    pharmacyStock: [],
    treatmentRecords: [],
    customMedications: [],
    breedingRecords: []
  };
}

/** Kullanıcı demo hesabı mı? Demo verisi yalnızca bu cihazda yaşar, buluta hiç gitmez. */
function _isDemoUser(user) {
  return Boolean(user && (user.isDemo || user.id === 'demo'));
}

/**
 * Kiracının (Tenant) verisini LocalStorage'dan yükler ve Supabase ile eşitlemeyi tetikler
 * @param {Object} user - Aktif kullanıcı objesi
 */
export function loadTenantState(user) {
  if (!user || !user.storageKey) return;

  // İlk yükleme kilidini aç (Cloud sync bekletme modu)
  setCloudLoadDone(user.storageKey, false);

  // Önce bellekteki AppState'i tamamen sıfırla
  _resetMemoryState();

  AppState.currentUser = user;
  AppState.currentTenantKey = user.storageKey;
  AppState.userRole = user.role || 'owner';

  try {
    const rawData = localStorage.getItem(user.storageKey);
    if (rawData) {
      // Daha önce kaydedilmiş yerel veri varsa güncel şemaya yükseltip yükle
      const parsed = migrateTenantData(JSON.parse(rawData));
      Object.keys(parsed).forEach(k => {
        if (!SESSION_KEYS.includes(k)) AppState[k] = parsed[k];
      });
    } else {
      // Kaydedilmiş veri yoksa hesap türüne göre ilk veriyi ata
      const initialData = _isDemoUser(user) ? getInitialDemoState() : getInitialBlankState(user);
      Object.keys(initialData).forEach(k => {
        AppState[k] = initialData[k];
      });
    }
    syncHerdMathState(AppState);
    localStorage.setItem(user.storageKey, JSON.stringify(_localPayload()));
  } catch (e) {
    console.error('[State] Error loading tenant state:', e);
  }

  _notifySubscribers({ source: STATE_SOURCES.LOAD, keys: Object.keys(AppState) });

  // Demo hesabı tamamen yerel çalışır
  if (_isDemoUser(user)) {
    setCloudLoadDone(user.storageKey, true);
    setSyncStatus(SYNC_STATUS.LOCAL);
    return;
  }

  // Bulutla eşitle (arka planda). Gönderilmemiş yerel değişiklikler korunur; gerekirse birleştirilir.
  syncOnLoad(user.storageKey);
}

/**
 * Buluttan gelen state yükünü mevcut AppState'e uygular.
 * Cihaz-yerel anahtarlar (aktif hayvan, rol görünümü, sensörler) ezilmez.
 * Aboneler `source: 'cloud'` ile bilgilendirilir — router açık sayfayı yeniden çizer.
 */
export function applyCloudState(cloudPayload) {
  if (!cloudPayload || typeof cloudPayload !== 'object') return;

  const migrated = migrateTenantData(cloudPayload);
  const appliedKeys = [];

  Object.keys(migrated).forEach(k => {
    if (SESSION_KEYS.includes(k) || DEVICE_LOCAL_KEYS.includes(k) || DERIVED_KEYS.includes(k)) return;
    AppState[k] = migrated[k];
    appliedKeys.push(k);
  });

  // Aktif hayvan artık sürüde yoksa seçimi temizle
  if (AppState.activeAnimalId && !(AppState.animals || []).some(a => a.id === AppState.activeAnimalId)) {
    AppState.activeAnimalId = null;
  }

  syncHerdMathState(AppState);

  if (AppState.currentTenantKey) {
    try {
      localStorage.setItem(AppState.currentTenantKey, JSON.stringify(_localPayload()));
    } catch (e) {
      console.error('[State] Error saving applied cloud state to localStorage:', e);
    }
  }

  _notifySubscribers({ source: STATE_SOURCES.CLOUD, keys: appliedKeys });
}

/**
 * Dışarıdan gelen bir çiftlik yükünü (örn. eski hesabın verisi) mevcut çiftlikle KAYIT BAZINDA birleştirir.
 * Hiçbir mevcut kayıt silinmez; aynı kimlikli kayıtta mevcut veri korunur. Sonuç normal yerel değişiklik
 * gibi kaydedilir ve buluta gönderilir.
 */
export function importFarmData(payload) {
  if (!payload || typeof payload !== 'object') return;
  const merged = mergeFarmPayloads(null, getCloudPayload(), migrateTenantData(payload));
  const update = {};
  Object.keys(merged).forEach(k => {
    if (SESSION_KEYS.includes(k) || DEVICE_LOCAL_KEYS.includes(k) || DERIVED_KEYS.includes(k)) return;
    update[k] = merged[k];
  });
  setState(update);
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
  syncHerdMathState(AppState);

  try {
    localStorage.setItem(user.storageKey, JSON.stringify(_localPayload()));
  } catch (e) {
    console.error('[State] Error initializing new tenant state:', e);
  }

  _notifySubscribers({ source: STATE_SOURCES.LOAD, keys: Object.keys(AppState) });
  setCloudLoadDone(user.storageKey, false);
  // Bulutta kayıt yoksa bu boş çiftlik yazılır; varsa (örn. başka cihazdan) o alınır
  syncOnLoad(user.storageKey);
}

/**
 * Oturum kapatıldığında bellekteki state'i tamamen temizler
 */
export function clearTenantState() {
  _resetMemoryState();
  _notifySubscribers({ source: STATE_SOURCES.RESET, keys: [] });
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

/** localStorage'a yazılacak yük: oturum anahtarları hariç her şey */
function _localPayload() {
  const data = {};
  Object.keys(AppState).forEach(key => {
    if (!SESSION_KEYS.includes(key)) data[key] = AppState[key];
  });
  return data;
}

/** Buluta gönderilecek yük: yalnızca çiftlik verisi (cihaz-yerel ve türetilmiş alanlar hariç) */
export function getCloudPayload() {
  const data = {};
  Object.keys(AppState).forEach(key => {
    if (SESSION_KEYS.includes(key) || DEVICE_LOCAL_KEYS.includes(key) || DERIVED_KEYS.includes(key)) return;
    data[key] = AppState[key];
  });
  return data;
}

// Aynı işlem (aynı JS görevi) içindeki ardışık setState çağrıları tek bir localStorage yazımında birleştirilir.
// Yazım mikro-görevde yapılır: tarayıcı bir sonraki olaya / sayfa kapanışına geçmeden önce tamamlanır.
let _persistScheduled = false;
let _persistNeedsPush = false;

function _persistTenantState(options = {}) {
  if (!AppState.currentTenantKey) return;
  if (options.skipCloudPush !== true) _persistNeedsPush = true;
  if (_persistScheduled) return;
  _persistScheduled = true;
  queueMicrotask(_flushPersist);
}

function _flushPersist() {
  _persistScheduled = false;
  const needsPush = _persistNeedsPush;
  _persistNeedsPush = false;

  const tenantKey = AppState.currentTenantKey;
  if (!tenantKey) return;

  try {
    localStorage.setItem(tenantKey, JSON.stringify(_localPayload()));

    // Demo hesabı ve cihaz-yerel güncellemeler buluta gönderilmez. Diğer her değişiklik "kirli" işaretlenir;
    // syncManager bulut eşitlemesi tamamlanınca / bağlantı gelince gönderir (veri kaybolmaz).
    if (needsPush && !_isDemoUser(AppState.currentUser)) {
      pushLocalStateToCloud(tenantKey);
    }
  } catch (e) {
    console.error('[State] Error persisting tenant state:', e);
  }
}

function _notifySubscribers(meta = { source: STATE_SOURCES.LOCAL, keys: [] }) {
  _subscribers.forEach(cb => {
    try { cb(meta); } catch (e) { console.error('[State] Subscriber error:', e); }
  });
}

// syncManager state'e bu köprü üzerinden erişir (state ⇄ syncManager döngüsel importu yok).
// syncManager yalnızca okur (aktif kiracı/kullanıcı), bu yüzden kopyasız readState verilir.
connectStateBridge({ getState: readState, applyCloudState, getCloudPayload });

export default AppState;
