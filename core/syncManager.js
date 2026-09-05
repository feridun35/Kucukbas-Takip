/**
 * ShepherdAI — Supabase Bulut Senkronizasyon Servisi (syncManager.js)
 * Offline-First hibrit mimari:
 * 1. İlk bulut yüklemesi tamamlanana kadar bayat verilerin bulutu ezmesini önleyen kilit sistemi (isCloudLoadDone).
 * 2. Kiracı bazlı bağımsız debounce timers (Çakışma önleyici).
 * 3. Anlık (Immediate) push desteği (Kullanıcı kayıtları için).
 * 4. Otomatik arka plan periyodik kontrolü & sekme odaklanma senkronizasyonu (PC & Mobil canlı eşitleme).
 */

import { getState, applyCloudState } from './state.js';

const SUPABASE_URL = 'https://wuugnytpkhmrazyrdrkb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8paErPGpe2zZ1N1wFOiOeg_aNLfom0o';
const PENDING_SYNC_KEY = 'shepherd_pending_sync_queue';

// Senkronizasyon Durumları
export const SYNC_STATUS = {
  SYNCED: 'synced',    // 🟢 Bulut Güncel
  SYNCING: 'syncing',  // 🟡 Senkronize Ediliyor...
  OFFLINE: 'offline',  // ⚪ Çevrimdışı (Yerel Kayıt)
  ERROR: 'error'       // 🔴 Senkronizasyon Hatası
};

let _supabaseClient = null;
const _debounceTimers = new Map();
let _currentStatus = navigator.onLine ? SYNC_STATUS.SYNCED : SYNC_STATUS.OFFLINE;
const _statusSubscribers = new Set();
let _lastPendingState = null;
let _lastCloudUpdatedAt = null;
let _autoPollInterval = null;

// Kiracı bulut yükleme tamamlandı kilit kümesi
const _cloudLoadDoneSet = new Set();

export function setCloudLoadDone(tenantKey, isDone) {
  if (isDone) {
    _cloudLoadDoneSet.add(tenantKey);
  } else {
    _cloudLoadDoneSet.delete(tenantKey);
  }
}

export function isCloudLoadDone(tenantKey) {
  return _cloudLoadDoneSet.has(tenantKey);
}

/**
 * Supabase İstemcisini Başlatır
 */
function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
      console.log('[SyncManager] ☁️ Supabase JS Client başarıyla başlatıldı.');
    } catch (err) {
      console.error('[SyncManager] Supabase client başlatılamadı:', err);
    }
  } else {
    console.warn('[SyncManager] @supabase/supabase-js CDN henüz yüklenmedi.');
  }

  return _supabaseClient;
}

/**
 * Senkronizasyon durum değişikliği aboneliği
 */
export function onSyncStatusChange(callback) {
  _statusSubscribers.add(callback);
  callback(getSyncStatusInfo());
  return () => _statusSubscribers.delete(callback);
}

/**
 * Aktif senkronizasyon durum nesnesini ve UI etiketlerini döndürür
 */
export function getSyncStatusInfo() {
  switch (_currentStatus) {
    case SYNC_STATUS.SYNCED:
      return { status: SYNC_STATUS.SYNCED, icon: '🟢', text: 'Bulut Güncel', color: 'var(--color-success, #10b981)' };
    case SYNC_STATUS.SYNCING:
      return { status: SYNC_STATUS.SYNCING, icon: '🟡', text: 'Eşitleniyor...', color: 'var(--color-warning, #f59e0b)' };
    case SYNC_STATUS.OFFLINE:
      return { status: SYNC_STATUS.OFFLINE, icon: '⚪', text: 'Çevrimdışı', color: 'var(--color-text-muted, #94a3b8)' };
    case SYNC_STATUS.ERROR:
      return { status: SYNC_STATUS.ERROR, icon: '🔴', text: 'Eşitleme Hatası', color: 'var(--color-danger, #ef4444)' };
    default:
      return { status: SYNC_STATUS.OFFLINE, icon: '⚪', text: 'Çevrimdışı', color: 'var(--color-text-muted, #94a3b8)' };
  }
}

function setSyncStatus(status) {
  if (_currentStatus !== status) {
    _currentStatus = status;
    const info = getSyncStatusInfo();
    _statusSubscribers.forEach(cb => {
      try { cb(info); } catch (e) { console.error('[SyncManager] Callback error:', e); }
    });
  }
}

/**
 * Yerel state verisini Supabase bulutuna gecikmeli (debounced) olarak yollar
 * @param {string} tenantKey - Kiracı anahtarı
 * @param {Object} stateData - state yükü
 * @param {number} delayMs - Debounce süresi
 */
export function pushLocalStateToCloud(tenantKey, stateData, delayMs = 1200) {
  if (!tenantKey || !stateData) return;

  // İlk bulut verisi çekilmeden asla bayat yerel veriyi buluta yazma (Veri ezilmesini önler)
  if (!_cloudLoadDoneSet.has(tenantKey) && tenantKey !== 'shepherd_global_users_registry') {
    console.log(`[SyncManager] ⏳ '${tenantKey}' için ilk bulut eşitlemesi bekleniyor. Push ertelendi.`);
    return;
  }

  _lastPendingState = { tenantKey, stateData, timestamp: Date.now() };

  if (!navigator.onLine) {
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return;
  }

  setSyncStatus(SYNC_STATUS.SYNCING);

  if (_debounceTimers.has(tenantKey)) {
    clearTimeout(_debounceTimers.get(tenantKey));
  }

  const timer = setTimeout(() => {
    _debounceTimers.delete(tenantKey);
    _executeCloudPush(tenantKey, stateData);
  }, delayMs);

  _debounceTimers.set(tenantKey, timer);
}

/**
 * Beklemeden ANINDA buluta gönderir (Kullanıcı kayıtları için)
 */
export async function pushStateToCloudImmediate(tenantKey, stateData) {
  if (!tenantKey || !stateData) return false;

  if (_debounceTimers.has(tenantKey)) {
    clearTimeout(_debounceTimers.get(tenantKey));
    _debounceTimers.delete(tenantKey);
  }

  return await _executeCloudPush(tenantKey, stateData);
}

/**
 * Doğrudan Supabase REST/SDK upsert işlemi
 */
async function _executeCloudPush(tenantKey, stateData) {
  if (!navigator.onLine) {
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return false;
  }

  const client = getSupabaseClient();
  const nowIso = new Date().toISOString();

  if (!client) {
    return await _executeCloudPushREST(tenantKey, stateData, nowIso);
  }

  try {
    const payload = {
      tenant_key: tenantKey,
      farm_payload: stateData,
      updated_at: nowIso
    };

    const { error } = await client
      .from('farms_data')
      .upsert(payload, { onConflict: 'tenant_key' });

    if (error) {
      console.error('[SyncManager] Supabase push hatası:', error.message || error);
      setSyncStatus(SYNC_STATUS.ERROR);
      return false;
    } else {
      _lastCloudUpdatedAt = nowIso;
      console.log(`[SyncManager] ☁️ Veriler Supabase'e başarıyla eşitlendi (${tenantKey}).`);
      _clearPendingLocalStorage();
      setSyncStatus(SYNC_STATUS.SYNCED);
      return true;
    }
  } catch (err) {
    console.error('[SyncManager] Push istisnası:', err);
    setSyncStatus(SYNC_STATUS.ERROR);
    return false;
  }
}

/**
 * REST API üzerinden doğrudan push (SDK fallback)
 */
async function _executeCloudPushREST(tenantKey, stateData, nowIso) {
  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/farms_data`, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates'
      },
      body: JSON.stringify({
        tenant_key: tenantKey,
        farm_payload: stateData,
        updated_at: nowIso
      })
    });

    if (response.ok) {
      _lastCloudUpdatedAt = nowIso;
      console.log(`[SyncManager] ☁️ REST üzerinden veriler başarıyla eşitlendi (${tenantKey}).`);
      _clearPendingLocalStorage();
      setSyncStatus(SYNC_STATUS.SYNCED);
      return true;
    } else {
      const errText = await response.text();
      console.error('[SyncManager] REST push hatası:', errText);
      setSyncStatus(SYNC_STATUS.ERROR);
      return false;
    }
  } catch (err) {
    console.error('[SyncManager] REST push istisnası:', err);
    setSyncStatus(SYNC_STATUS.ERROR);
    return false;
  }
}

/**
 * Supabase'den aktif kiracının en son verisini çeker
 */
export async function pullCloudStateToLocal(tenantKey) {
  if (!tenantKey) return null;

  if (!navigator.onLine) {
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return null;
  }

  setSyncStatus(SYNC_STATUS.SYNCING);

  const client = getSupabaseClient();
  let cloudPayload = null;

  try {
    if (client) {
      const { data, error } = await client
        .from('farms_data')
        .select('farm_payload, updated_at')
        .eq('tenant_key', tenantKey)
        .maybeSingle();

      if (error) {
        console.error('[SyncManager] Supabase pull hatası:', error.message || error);
        setSyncStatus(SYNC_STATUS.ERROR);
        return null;
      }

      if (data && data.farm_payload) {
        cloudPayload = data.farm_payload;
        _lastCloudUpdatedAt = data.updated_at;
        console.log(`[SyncManager] ☁️ Buluttan veriler çekildi (Tarih: ${data.updated_at}).`);
      }
    } else {
      // REST Fallback
      const response = await fetch(`${SUPABASE_URL}/rest/v1/farms_data?tenant_key=eq.${encodeURIComponent(tenantKey)}&select=farm_payload,updated_at`, {
        method: 'GET',
        headers: {
          'apikey': SUPABASE_KEY,
          'Authorization': `Bearer ${SUPABASE_KEY}`,
          'Accept': 'application/json'
        }
      });

      if (response.ok) {
        const rows = await response.json();
        if (Array.isArray(rows) && rows.length > 0 && rows[0].farm_payload) {
          cloudPayload = rows[0].farm_payload;
          _lastCloudUpdatedAt = rows[0].updated_at;
        }
      }
    }

    setSyncStatus(SYNC_STATUS.SYNCED);
    return cloudPayload;
  } catch (err) {
    console.error('[SyncManager] Pull esnasında hata oluştu:', err);
    setSyncStatus(SYNC_STATUS.ERROR);
    return null;
  }
}

/**
 * Diğer cihazlardan gelen canlı güncellemeleri kontrol eder
 */
export async function checkForCloudUpdates() {
  if (!navigator.onLine) return;
  const state = getState();
  const tenantKey = state.currentTenantKey;
  if (!tenantKey || tenantKey === 'shepherd_global_users_registry' || !isCloudLoadDone(tenantKey)) return;

  const client = getSupabaseClient();
  try {
    if (client) {
      const { data } = await client
        .from('farms_data')
        .select('farm_payload, updated_at')
        .eq('tenant_key', tenantKey)
        .maybeSingle();

      if (data && data.updated_at && data.updated_at !== _lastCloudUpdatedAt) {
        console.log('[SyncManager] 🔄 Diğer cihazdan yeni güncelleme algılandı! Ekran yenileniyor...');
        _lastCloudUpdatedAt = data.updated_at;
        if (data.farm_payload) {
          applyCloudState(data.farm_payload);
        }
      }
    }
  } catch (e) {
    console.error('[SyncManager] Cloud update check hatası:', e);
  }
}

function _savePendingToLocalStorage(tenantKey, stateData) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({
      tenantKey,
      stateData,
      timestamp: Date.now()
    }));
  } catch (e) {}
}

function _clearPendingLocalStorage() {
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch (e) {}
}

export function flushPendingQueue() {
  if (!navigator.onLine) return;

  try {
    const pendingRaw = localStorage.getItem(PENDING_SYNC_KEY);
    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      if (pending.tenantKey && pending.stateData && isCloudLoadDone(pending.tenantKey)) {
        console.log('[SyncManager] 🚀 Çevrimdışı kuyruktaki veriler buluta gönderiliyor...');
        pushLocalStateToCloud(pending.tenantKey, pending.stateData, 200);
      }
    } else if (_lastPendingState && _lastPendingState.tenantKey && _lastPendingState.stateData && isCloudLoadDone(_lastPendingState.tenantKey)) {
      pushLocalStateToCloud(_lastPendingState.tenantKey, _lastPendingState.stateData, 200);
    } else {
      setSyncStatus(SYNC_STATUS.SYNCED);
    }
  } catch (e) {
    console.error('[SyncManager] Flush kuyruk hatası:', e);
  }
}

/**
 * Ağ durumu ve Canlı Otomatik Senkronizasyon Servisini Başlatır
 */
export function initSyncManager() {
  window.addEventListener('online', () => {
    console.log('[SyncManager] 🌐 İnternet bağlantısı sağlandı.');
    setSyncStatus(SYNC_STATUS.SYNCING);
    flushPendingQueue();
  });

  window.addEventListener('offline', () => {
    console.log('[SyncManager] 🚫 İnternet kesildi.');
    setSyncStatus(SYNC_STATUS.OFFLINE);
  });

  // Sekmeye geri dönüldüğünde (focus/visibility) bulut güncellemelerini anında kontrol et
  window.addEventListener('focus', () => {
    checkForCloudUpdates();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkForCloudUpdates();
    }
  });

  // Her 6 saniyede bir arka planda diğer cihaz güncellemelerini denetle
  if (!_autoPollInterval) {
    _autoPollInterval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        checkForCloudUpdates();
      }
    }, 6000);
  }

  getSupabaseClient();
  
  if (navigator.onLine) {
    flushPendingQueue();
  } else {
    setSyncStatus(SYNC_STATUS.OFFLINE);
  }
}
