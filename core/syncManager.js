/**
 * ShepherdAI — Supabase Bulut Senkronizasyon Servisi (syncManager.js)
 * Offline-First hibrit mimari: Yerel state güncellendiğinde arka planda debounced olarak Supabase'e push eder,
 * cihaz açılışında buluttan pull eder, internet kesintilerinde yerel kuyruğa alır.
 */

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
let _debounceTimer = null;
let _currentStatus = navigator.onLine ? SYNC_STATUS.SYNCED : SYNC_STATUS.OFFLINE;
const _statusSubscribers = new Set();
let _lastPendingState = null;
let _activeTenantKey = null;

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
    console.warn('[SyncManager] @supabase/supabase-js CDN henüz yüklenmedi veya bulunamadı.');
  }

  return _supabaseClient;
}

/**
 * Senkronizasyon durum değişikliği aboneliği
 * @param {Function} callback - (statusInfo) => void
 * @returns {Function} unsubscribe
 */
export function onSyncStatusChange(callback) {
  _statusSubscribers.add(callback);
  // Anlık durumu yeni aboneye hemen bildir
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
 * @param {string} tenantKey - Kiracı anahtarı (örn: shepherd_data_demo)
 * @param {Object} stateData - Tüm AppState JSON yükü
 * @param {number} delayMs - Debounce süresi (Varsayılan 1500 ms)
 */
export function pushLocalStateToCloud(tenantKey, stateData, delayMs = 1500) {
  if (!tenantKey || !stateData) return;

  _activeTenantKey = tenantKey;
  _lastPendingState = { tenantKey, stateData, timestamp: Date.now() };

  // İnternet yoksa sessizce yerel kuyruğa yaz ve çevrimdışı durumuna geç
  if (!navigator.onLine) {
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return;
  }

  setSyncStatus(SYNC_STATUS.SYNCING);

  if (_debounceTimer) {
    clearTimeout(_debounceTimer);
  }

  _debounceTimer = setTimeout(() => {
    _executeCloudPush(tenantKey, stateData);
  }, delayMs);
}

/**
 * Doğrudan Supabase REST/SDK upsert işlemi
 */
async function _executeCloudPush(tenantKey, stateData) {
  if (!navigator.onLine) {
    _savePendingToLocalStorage(tenantKey, stateData);
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return;
  }

  const client = getSupabaseClient();
  if (!client) {
    // CDN yüklenmediyse REST fallback dene
    await _executeCloudPushREST(tenantKey, stateData);
    return;
  }

  try {
    const payload = {
      tenant_key: tenantKey,
      farm_payload: stateData,
      updated_at: new Date().toISOString()
    };

    const { error } = await client
      .from('farms_data')
      .upsert(payload, { onConflict: 'tenant_key' });

    if (error) {
      console.error('[SyncManager] Supabase push hatası:', error.message || error);
      setSyncStatus(SYNC_STATUS.ERROR);
    } else {
      console.log(`[SyncManager] ☁️ Veriler Supabase'e başarıyla senkronize edildi (${tenantKey}).`);
      _clearPendingLocalStorage();
      setSyncStatus(SYNC_STATUS.SYNCED);
    }
  } catch (err) {
    console.error('[SyncManager] Push istisnası:', err);
    setSyncStatus(SYNC_STATUS.ERROR);
  }
}

/**
 * REST API üzerinden doğrudan push (SDK yüklenemediğinde fallback)
 */
async function _executeCloudPushREST(tenantKey, stateData) {
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
        updated_at: new Date().toISOString()
      })
    });

    if (response.ok) {
      console.log(`[SyncManager] ☁️ REST üzerinden veriler başarıyla eşitlendi (${tenantKey}).`);
      _clearPendingLocalStorage();
      setSyncStatus(SYNC_STATUS.SYNCED);
    } else {
      const errText = await response.text();
      console.error('[SyncManager] REST push hatası:', errText);
      setSyncStatus(SYNC_STATUS.ERROR);
    }
  } catch (err) {
    console.error('[SyncManager] REST push istisnası:', err);
    setSyncStatus(SYNC_STATUS.ERROR);
  }
}

/**
 * Kullanıcı giriş yaptığında veya sayfa açıldığında Supabase'deki veriyi çekip getirir
 * @param {string} tenantKey 
 * @returns {Promise<Object|null>} Buluttan çekilen AppState nesnesi
 */
export async function pullCloudStateToLocal(tenantKey) {
  if (!tenantKey) return null;
  _activeTenantKey = tenantKey;

  if (!navigator.onLine) {
    console.log('[SyncManager] Çevrimdışı olunduğu için yerel verilerle devam ediliyor.');
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
        console.log(`[SyncManager] ☁️ Buluttan son veriler başarıyla çekildi (Güncelleme: ${data.updated_at}).`);
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
          console.log(`[SyncManager] ☁️ REST ile bulut verisi başarıyla çekildi.`);
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
 * Yerel kuyruğa yazma (offline modda kaybolmaması için)
 */
function _savePendingToLocalStorage(tenantKey, stateData) {
  try {
    localStorage.setItem(PENDING_SYNC_KEY, JSON.stringify({
      tenantKey,
      stateData,
      timestamp: Date.now()
    }));
  } catch (e) {
    console.error('[SyncManager] Offline kuyruk kaydı hatası:', e);
  }
}

function _clearPendingLocalStorage() {
  try {
    localStorage.removeItem(PENDING_SYNC_KEY);
  } catch (e) {}
}

/**
 * Bağlantı tekrar geldiğinde yerel kuyruktaki veriyi buluta fırlatır
 */
export function flushPendingQueue() {
  if (!navigator.onLine) return;

  try {
    const pendingRaw = localStorage.getItem(PENDING_SYNC_KEY);
    if (pendingRaw) {
      const pending = JSON.parse(pendingRaw);
      if (pending.tenantKey && pending.stateData) {
        console.log('[SyncManager] 🚀 Bağlantı sağlandı, çevrimdışı kuyruktaki veriler buluta gönderiliyor...');
        pushLocalStateToCloud(pending.tenantKey, pending.stateData, 200);
      }
    } else if (_lastPendingState && _lastPendingState.tenantKey && _lastPendingState.stateData) {
      pushLocalStateToCloud(_lastPendingState.tenantKey, _lastPendingState.stateData, 200);
    } else {
      setSyncStatus(SYNC_STATUS.SYNCED);
    }
  } catch (e) {
    console.error('[SyncManager] Flush kuyruk hatası:', e);
  }
}

/**
 * Ağ durumu dinleyicilerini ve senkronizasyon servisini başlatır
 */
export function initSyncManager() {
  window.addEventListener('online', () => {
    console.log('[SyncManager] 🌐 İnternet bağlantısı sağlandı.');
    setSyncStatus(SYNC_STATUS.SYNCING);
    flushPendingQueue();
  });

  window.addEventListener('offline', () => {
    console.log('[SyncManager] 🚫 İnternet bağlantısı kesildi. Çevrimdışı moda geçiliyor.');
    setSyncStatus(SYNC_STATUS.OFFLINE);
  });

  // İlk istemci kontrolü
  getSupabaseClient();
  
  if (navigator.onLine) {
    flushPendingQueue();
  } else {
    setSyncStatus(SYNC_STATUS.OFFLINE);
  }
}
