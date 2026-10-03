/**
 * ShepherdAI — Supabase Bulut Senkronizasyon Servisi (syncManager.js)
 * Offline-First hibrit mimari:
 * 1. İlk bulut yüklemesi tamamlanana kadar bayat verilerin bulutu ezmesini önleyen kilit sistemi (isCloudLoadDone).
 * 2. Kiracı bazlı bağımsız debounce timers (Çakışma önleyici).
 * 3. Otomatik arka plan periyodik kontrolü & sekme odaklanma senkronizasyonu (PC & Mobil canlı eşitleme).
 *
 * ── Güvenlik Modeli ──
 * Tüm istekler Supabase Auth oturumunun JWT'si ile yapılır. farms_data tablosundaki RLS politikaları
 * her kullanıcının yalnızca kendi satırını (owner_id = auth.uid()) okuyup yazmasına izin verir.
 * İstemcideki publishable key tek başına hiçbir veriye erişim sağlamaz.
 * Kiracı anahtarı her zaman `shepherd_data_<auth.uid()>` biçimindedir.
 */

import { getState, applyCloudState } from './state.js';

const SUPABASE_URL = 'https://wuugnytpkhmrazyrdrkb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8paErPGpe2zZ1N1wFOiOeg_aNLfom0o';
const PENDING_SYNC_KEY = 'shepherd_pending_sync_queue';
const TENANT_KEY_PREFIX = 'shepherd_data_';

// Senkronizasyon Durumları
export const SYNC_STATUS = {
  SYNCED: 'synced',    // 🟢 Bulut Güncel
  SYNCING: 'syncing',  // 🟡 Senkronize Ediliyor...
  OFFLINE: 'offline',  // ⚪ Çevrimdışı (Yerel Kayıt)
  ERROR: 'error',      // 🔴 Senkronizasyon Hatası
  LOCAL: 'local'       // 💾 Yalnızca Yerel (Demo hesabı)
};

let _supabaseClient = null;
const _debounceTimers = new Map();
const _pendingPayloads = new Map();
let _currentStatus = navigator.onLine ? SYNC_STATUS.SYNCED : SYNC_STATUS.OFFLINE;
const _statusSubscribers = new Set();
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

/** Supabase kullanıcı kimliğinden kiracı anahtarı üretir */
export function tenantKeyForUserId(userId) {
  return `${TENANT_KEY_PREFIX}${userId}`;
}

/**
 * Supabase İstemcisini Başlatır (CDN yüklenmemişse — örn. çevrimdışı açılış — null döner)
 */
export function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;

  if (window.supabase && typeof window.supabase.createClient === 'function') {
    try {
      _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY, {
        auth: { persistSession: true, autoRefreshToken: true }
      });
      console.log('[SyncManager] ☁️ Supabase JS Client başarıyla başlatıldı.');
    } catch (err) {
      console.error('[SyncManager] Supabase client başlatılamadı:', err);
    }
  } else {
    console.warn('[SyncManager] @supabase/supabase-js CDN henüz yüklenmedi.');
  }

  return _supabaseClient;
}

/** Aktif Supabase oturumu (yoksa null) */
async function _getSession() {
  const client = getSupabaseClient();
  if (!client) return null;
  try {
    const { data } = await client.auth.getSession();
    return data?.session || null;
  } catch (e) {
    console.error('[SyncManager] Oturum okunamadı:', e);
    return null;
  }
}

/** Kiracı anahtarı oturumdaki kullanıcıya mı ait? (RLS ile aynı kural, istemci tarafı ön kontrol) */
function _isOwnTenant(session, tenantKey) {
  return Boolean(session?.user?.id) && tenantKey === tenantKeyForUserId(session.user.id);
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
    case SYNC_STATUS.LOCAL:
      return { status: SYNC_STATUS.LOCAL, icon: '💾', text: 'Yalnızca Bu Cihaz', color: 'var(--color-text-muted, #94a3b8)' };
    default:
      return { status: SYNC_STATUS.OFFLINE, icon: '⚪', text: 'Çevrimdışı', color: 'var(--color-text-muted, #94a3b8)' };
  }
}

export function setSyncStatus(status) {
  if (_currentStatus !== status) {
    _currentStatus = status;
    const info = getSyncStatusInfo();
    _statusSubscribers.forEach(cb => {
      try { cb(info); } catch (e) { console.error('[SyncManager] Callback error:', e); }
    });
  }
}

/** Kiracı için gönderilmeyi bekleyen yerel değişiklik var mı? */
function _hasPendingPush(tenantKey) {
  if (_debounceTimers.has(tenantKey)) return true;
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    return Boolean(raw && JSON.parse(raw).tenantKey === tenantKey);
  } catch (e) {
    return false;
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
  if (!_cloudLoadDoneSet.has(tenantKey)) {
    console.log(`[SyncManager] ⏳ '${tenantKey}' için ilk bulut eşitlemesi bekleniyor. Push ertelendi.`);
    return;
  }

  if (!navigator.onLine) {
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return;
  }

  setSyncStatus(SYNC_STATUS.SYNCING);

  if (_debounceTimers.has(tenantKey)) {
    clearTimeout(_debounceTimers.get(tenantKey));
  }
  _pendingPayloads.set(tenantKey, stateData);

  const timer = setTimeout(() => {
    _debounceTimers.delete(tenantKey);
    const payload = _pendingPayloads.get(tenantKey);
    _pendingPayloads.delete(tenantKey);
    _executeCloudPush(tenantKey, payload);
  }, delayMs);

  _debounceTimers.set(tenantKey, timer);
}

/**
 * Debounce bekleyen tüm gönderimleri hemen yapar (örn. çıkış yapmadan önce).
 */
export async function flushPendingPushes() {
  const jobs = [];
  _debounceTimers.forEach((timer, tenantKey) => {
    clearTimeout(timer);
    const payload = _pendingPayloads.get(tenantKey);
    if (payload) jobs.push(_executeCloudPush(tenantKey, payload));
  });
  _debounceTimers.clear();
  _pendingPayloads.clear();
  await Promise.allSettled(jobs);
}

/**
 * Supabase upsert işlemi (oturum JWT'si ile; RLS sahiplik kontrolü sunucuda yapılır)
 */
async function _executeCloudPush(tenantKey, stateData) {
  if (!navigator.onLine) {
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return false;
  }

  const client = getSupabaseClient();
  const session = await _getSession();
  if (!client || !session) {
    // Oturum yok / istemci yüklenemedi — veri kaybolmasın diye kuyruğa al
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.ERROR);
    return false;
  }
  if (!_isOwnTenant(session, tenantKey)) {
    console.warn(`[SyncManager] '${tenantKey}' oturumdaki kullanıcıya ait değil; push atlandı.`);
    return false;
  }

  try {
    const { data, error } = await client
      .from('farms_data')
      .upsert({
        tenant_key: tenantKey,
        owner_id: session.user.id,
        farm_payload: stateData
      }, { onConflict: 'tenant_key' })
      .select('updated_at')
      .single();

    if (error) {
      console.error('[SyncManager] Supabase push hatası:', error.message || error);
      _savePendingToLocalStorage(tenantKey, stateData);
      setSyncStatus(SYNC_STATUS.ERROR);
      return false;
    }

    // Sunucunun yazdığı zaman damgasını sakla — kendi yazdığımızı "başka cihazdan güncelleme" sanmayalım
    _lastCloudUpdatedAt = data?.updated_at || _lastCloudUpdatedAt;
    console.log(`[SyncManager] ☁️ Veriler Supabase'e başarıyla eşitlendi (${tenantKey}).`);
    _clearPendingLocalStorage(tenantKey);
    setSyncStatus(SYNC_STATUS.SYNCED);
    return true;
  } catch (err) {
    console.error('[SyncManager] Push istisnası:', err);
    _savePendingToLocalStorage(tenantKey, stateData);
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

  const client = getSupabaseClient();
  const session = await _getSession();
  if (!client || !session || !_isOwnTenant(session, tenantKey)) {
    setSyncStatus(client ? SYNC_STATUS.ERROR : SYNC_STATUS.OFFLINE);
    return null;
  }

  setSyncStatus(SYNC_STATUS.SYNCING);

  try {
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

    setSyncStatus(SYNC_STATUS.SYNCED);
    if (data && data.farm_payload) {
      _lastCloudUpdatedAt = data.updated_at;
      console.log(`[SyncManager] ☁️ Buluttan veriler çekildi (Tarih: ${data.updated_at}).`);
      return data.farm_payload;
    }
    return null;
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
  if (!tenantKey || state.currentUser?.isDemo || !isCloudLoadDone(tenantKey)) return;

  // Gönderilmemiş yerel değişiklik varsa bulut verisi daha eskidir — ezme
  if (_hasPendingPush(tenantKey)) return;

  const client = getSupabaseClient();
  const session = await _getSession();
  if (!client || !_isOwnTenant(session, tenantKey)) return;

  try {
    const { data } = await client
      .from('farms_data')
      .select('farm_payload, updated_at')
      .eq('tenant_key', tenantKey)
      .maybeSingle();

    // Sorgu sürerken kullanıcı yerel değişiklik yapmış olabilir
    if (_hasPendingPush(tenantKey) || getState().currentTenantKey !== tenantKey) return;

    if (data && data.updated_at && data.updated_at !== _lastCloudUpdatedAt) {
      console.log('[SyncManager] 🔄 Diğer cihazdan yeni güncelleme algılandı! Ekran yenileniyor...');
      _lastCloudUpdatedAt = data.updated_at;
      if (data.farm_payload) {
        applyCloudState(data.farm_payload);
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

function _clearPendingLocalStorage(tenantKey) {
  try {
    const raw = localStorage.getItem(PENDING_SYNC_KEY);
    if (raw && JSON.parse(raw).tenantKey === tenantKey) {
      localStorage.removeItem(PENDING_SYNC_KEY);
    }
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
    } else if (getState().currentUser?.isDemo) {
      setSyncStatus(SYNC_STATUS.LOCAL);
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
