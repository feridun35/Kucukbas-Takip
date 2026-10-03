/**
 * ShepherdAI — Supabase Bulut Senkronizasyon Servisi (syncManager.js)
 * Offline-First hibrit mimari:
 * 1. Değişiklik takibi: her yerel değişiklik kiracının senkron meta kaydını "kirli" (dirty) işaretler ve
 *    revizyon sayacını artırır. Kirli veri, buluta başarıyla yazılana kadar asla buluttan ezilmez;
 *    uygulama kapatılıp çevrimdışı/çevrimiçi yeniden açılsa bile.
 * 2. Ortak taban (base): bulutla en son eşitlenen yük saklanır. Yerel ve bulut ayrıştığında
 *    core/syncMerge.js ile kayıt bazında üç yönlü birleştirme yapılır (değişiklik kaybolmaz).
 * 3. İyimser eşzamanlılık: güncelleme yalnızca bulut satırı en son görülen sürümdeyse (updated_at) yazılır;
 *    arada başka cihaz yazdıysa önce birleştirilir, sonra tekrar denenir.
 * 4. İlk bulut okuması başarısız olursa push yapılmaz (bayat yerel veri bulutu ezemez); okuma
 *    çevrimiçi olunca / sekme odağında / periyodik kontrolde yeniden denenir.
 *
 * ── Güvenlik Modeli ──
 * Tüm istekler Supabase Auth oturumunun JWT'si ile yapılır. farms_data tablosundaki RLS politikaları
 * her kullanıcının yalnızca kendi satırını (owner_id = auth.uid()) okuyup yazmasına izin verir.
 * İstemcideki publishable key tek başına hiçbir veriye erişim sağlamaz.
 * Kiracı anahtarı her zaman `shepherd_data_<auth.uid()>` biçimindedir.
 */

import { migrateTenantData } from './migrations.js';
import { mergeFarmPayloads } from './syncMerge.js';

const SUPABASE_URL = 'https://wuugnytpkhmrazyrdrkb.supabase.co';
const SUPABASE_KEY = 'sb_publishable_8paErPGpe2zZ1N1wFOiOeg_aNLfom0o';
// Eski sürümün çevrimdışı kuyruğu (yalnızca göç için okunur)
const LEGACY_PENDING_SYNC_KEY = 'shepherd_pending_sync_queue';
const SYNC_META_PREFIX = 'shepherd_sync_meta_';
const SYNC_BASE_PREFIX = 'shepherd_sync_base_';
const MAX_PUSH_ATTEMPTS = 3;
const TENANT_KEY_PREFIX = 'shepherd_data_';

// ── State köprüsü ──
// syncManager state.js'i doğrudan import etmez (döngüsel bağımlılık olmasın diye);
// state.js yüklenirken kendi fonksiyonlarını connectStateBridge() ile buraya kaydeder.
const _state = {
  getState: () => ({}),
  applyCloudState: () => {},
  getCloudPayload: () => ({})
};

/** state.js tarafından bir kez çağrılır */
export function connectStateBridge(bridge) {
  Object.assign(_state, bridge);
}

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
const _pushInFlight = new Map();   // tenantKey → Promise
const _pushQueued = new Set();
const _loadInFlight = new Map();   // tenantKey → Promise
let _currentStatus = navigator.onLine ? SYNC_STATUS.SYNCED : SYNC_STATUS.OFFLINE;
const _statusSubscribers = new Set();
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

// ═══════════════════════════════════════════
// Senkron meta kaydı (localStorage — kiracı bazlı)
// ═══════════════════════════════════════════

/** { dirty: bool, rev: number, cloudUpdatedAt: string|null } */
export function getSyncMeta(tenantKey) {
  try {
    const raw = localStorage.getItem(SYNC_META_PREFIX + tenantKey);
    if (raw) return { dirty: false, rev: 0, cloudUpdatedAt: null, ...JSON.parse(raw) };
  } catch (e) {}
  return { dirty: false, rev: 0, cloudUpdatedAt: null };
}

function _saveMeta(tenantKey, meta) {
  try { localStorage.setItem(SYNC_META_PREFIX + tenantKey, JSON.stringify(meta)); } catch (e) {}
}

function _getBase(tenantKey) {
  try {
    const raw = localStorage.getItem(SYNC_BASE_PREFIX + tenantKey);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function _saveBase(tenantKey, payload) {
  try { localStorage.setItem(SYNC_BASE_PREFIX + tenantKey, JSON.stringify(payload)); } catch (e) {}
}

/** Yerel değişikliği kaydeder: kirli işaretle, revizyonu artır */
function _markLocalChange(tenantKey) {
  const meta = getSyncMeta(tenantKey);
  meta.dirty = true;
  meta.rev = (meta.rev || 0) + 1;
  _saveMeta(tenantKey, meta);
}

/** Eski sürümün çevrimdışı kuyruğu bu kiracıya aitse: veriyi kirli say, kuyruğu kaldır */
function _adoptLegacyPendingQueue(tenantKey) {
  try {
    const raw = localStorage.getItem(LEGACY_PENDING_SYNC_KEY);
    if (raw && JSON.parse(raw).tenantKey === tenantKey) {
      _markLocalChange(tenantKey);
      localStorage.removeItem(LEGACY_PENDING_SYNC_KEY);
    }
  } catch (e) {}
}

function _isCurrentTenant(tenantKey) {
  const state = _state.getState();
  return state.currentTenantKey === tenantKey && !state.currentUser?.isDemo;
}

/** Bulut kaydını, yerel ile birleştirip uygular; yeni ortak taban buluttaki yük olur */
function _reconcileWithCloud(tenantKey, remote) {
  const cloud = migrateTenantData(remote.farm_payload || {});
  const merged = mergeFarmPayloads(_getBase(tenantKey), _state.getCloudPayload(), cloud);
  _state.applyCloudState(merged);
  _saveBase(tenantKey, cloud);
  const meta = getSyncMeta(tenantKey);
  meta.cloudUpdatedAt = remote.updated_at;
  _saveMeta(tenantKey, meta);
}

/** Bulut kaydını olduğu gibi uygular (yerelde gönderilmemiş değişiklik yokken) */
function _adoptCloud(tenantKey, remote) {
  _state.applyCloudState(remote.farm_payload || {});
  _saveBase(tenantKey, _state.getCloudPayload());
  const meta = getSyncMeta(tenantKey);
  meta.cloudUpdatedAt = remote.updated_at;
  _saveMeta(tenantKey, meta);
}

async function _fetchRemote(client, tenantKey, columns = 'farm_payload, updated_at') {
  const { data, error } = await client
    .from('farms_data')
    .select(columns)
    .eq('tenant_key', tenantKey)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

/** Bulut senkronizasyonu için ön koşullar; sağlanmazsa null */
async function _readyClient(tenantKey) {
  if (!navigator.onLine) {
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return null;
  }
  const client = getSupabaseClient();
  if (!client) {
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return null;
  }
  const session = await _getSession();
  if (!_isOwnTenant(session, tenantKey)) {
    setSyncStatus(SYNC_STATUS.ERROR);
    return null;
  }
  return { client, session };
}

// ═══════════════════════════════════════════
// Açılış eşitlemesi
// ═══════════════════════════════════════════

/**
 * Kiracı yüklendiğinde bulutla eşitler. Başarılı olana kadar push yapılmaz.
 * - Bulutta kayıt yok → yerel veri buluta yazılır.
 * - Yerelde gönderilmemiş değişiklik yok → bulut verisi alınır.
 * - Yerelde gönderilmemiş değişiklik var, bulut değişmemiş → yerel buluta yazılır.
 * - İkisi de değişmiş → kayıt bazında birleştirilir, sonuç buluta yazılır.
 * @returns {Promise<boolean>} eşitleme tamamlandı mı
 */
export function syncOnLoad(tenantKey) {
  if (_loadInFlight.has(tenantKey)) return _loadInFlight.get(tenantKey);
  const job = _syncOnLoad(tenantKey).finally(() => _loadInFlight.delete(tenantKey));
  _loadInFlight.set(tenantKey, job);
  return job;
}

async function _syncOnLoad(tenantKey) {
  if (!tenantKey || !_isCurrentTenant(tenantKey)) return false;
  _adoptLegacyPendingQueue(tenantKey);

  const ready = await _readyClient(tenantKey);
  if (!ready) return false;

  setSyncStatus(SYNC_STATUS.SYNCING);
  let remote;
  try {
    remote = await _fetchRemote(ready.client, tenantKey);
  } catch (err) {
    console.error('[SyncManager] Bulut okuması başarısız — push yapılmayacak, daha sonra tekrar denenecek:', err.message || err);
    setSyncStatus(SYNC_STATUS.ERROR);
    return false;
  }

  // Bu arada kullanıcı değişmiş olabilir
  if (!_isCurrentTenant(tenantKey)) return false;

  const meta = getSyncMeta(tenantKey);

  if (!remote) {
    setCloudLoadDone(tenantKey, true);
    await _runPush(tenantKey);
    return true;
  }

  if (!meta.dirty) {
    _adoptCloud(tenantKey, remote);
  } else if (remote.updated_at !== meta.cloudUpdatedAt) {
    console.log('[SyncManager] 🔀 Yerel (gönderilmemiş) ve bulut değişiklikleri birleştiriliyor...');
    _reconcileWithCloud(tenantKey, remote);
  }

  setCloudLoadDone(tenantKey, true);
  if (getSyncMeta(tenantKey).dirty) {
    await _runPush(tenantKey);
  } else {
    setSyncStatus(SYNC_STATUS.SYNCED);
  }
  return true;
}

// ═══════════════════════════════════════════
// Push
// ═══════════════════════════════════════════

/**
 * Yerel değişikliği kaydeder ve buluta gecikmeli (debounced) gönderimi planlar.
 * Bulut eşitlemesi tamamlanmamışsa ya da çevrimdışıysa yalnızca "kirli" işaretlenir;
 * gönderim eşitleme / bağlantı geri geldiğinde yapılır.
 * @param {string} tenantKey
 * @param {number} delayMs
 */
export function pushLocalStateToCloud(tenantKey, delayMs = 1200) {
  if (!tenantKey) return;
  _markLocalChange(tenantKey);

  if (!_cloudLoadDoneSet.has(tenantKey)) {
    console.log(`[SyncManager] ⏳ '${tenantKey}' için bulut eşitlemesi bekleniyor. Değişiklik yerelde tutuluyor.`);
    return;
  }

  if (!navigator.onLine) {
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return;
  }

  setSyncStatus(SYNC_STATUS.SYNCING);
  _schedulePush(tenantKey, delayMs);
}

function _schedulePush(tenantKey, delayMs) {
  if (_debounceTimers.has(tenantKey)) clearTimeout(_debounceTimers.get(tenantKey));
  const timer = setTimeout(() => {
    _debounceTimers.delete(tenantKey);
    _runPush(tenantKey);
  }, delayMs);
  _debounceTimers.set(tenantKey, timer);
}

/** Aynı kiracı için push'ları sıraya koyar (eşzamanlı iki push olmaz) */
function _runPush(tenantKey) {
  if (_pushInFlight.has(tenantKey)) {
    _pushQueued.add(tenantKey);
    return _pushInFlight.get(tenantKey);
  }
  const job = _pushWithRetry(tenantKey).finally(() => {
    _pushInFlight.delete(tenantKey);
    if (_pushQueued.delete(tenantKey) && getSyncMeta(tenantKey).dirty) _runPush(tenantKey);
  });
  _pushInFlight.set(tenantKey, job);
  return job;
}

async function _pushWithRetry(tenantKey) {
  for (let attempt = 1; attempt <= MAX_PUSH_ATTEMPTS; attempt++) {
    const result = await _pushOnce(tenantKey);
    if (result !== 'conflict') return result === 'ok';
    console.log(`[SyncManager] ↻ Bulut başka cihazdan değişti, birleştirilip tekrar deneniyor (${attempt}/${MAX_PUSH_ATTEMPTS}).`);
  }
  setSyncStatus(SYNC_STATUS.ERROR);
  return false;
}

/**
 * Tek push denemesi. Dönüş: 'ok' | 'conflict' | 'skip' | 'error'
 */
async function _pushOnce(tenantKey) {
  if (!_isCurrentTenant(tenantKey) || !_cloudLoadDoneSet.has(tenantKey)) return 'skip';

  const ready = await _readyClient(tenantKey);
  if (!ready) return 'skip';
  const { client, session } = ready;

  setSyncStatus(SYNC_STATUS.SYNCING);
  const revAtStart = getSyncMeta(tenantKey).rev;

  try {
    const remote = await _fetchRemote(client, tenantKey, 'updated_at');
    const meta = getSyncMeta(tenantKey);

    if (remote && remote.updated_at !== meta.cloudUpdatedAt) {
      // Başka cihaz yazmış: önce birleştir
      const full = await _fetchRemote(client, tenantKey);
      if (!_isCurrentTenant(tenantKey)) return 'skip';
      if (full) _reconcileWithCloud(tenantKey, full);
      return 'conflict';
    }

    const payload = _state.getCloudPayload();
    let newUpdatedAt;

    if (remote) {
      // İyimser eşzamanlılık: yalnızca en son gördüğümüz sürümün üzerine yaz
      const { data, error } = await client
        .from('farms_data')
        .update({ farm_payload: payload })
        .eq('tenant_key', tenantKey)
        .eq('updated_at', remote.updated_at)
        .select('updated_at');
      if (error) throw error;
      if (!data || data.length === 0) return 'conflict';
      newUpdatedAt = data[0].updated_at;
    } else {
      const { data, error } = await client
        .from('farms_data')
        .insert({ tenant_key: tenantKey, owner_id: session.user.id, farm_payload: payload })
        .select('updated_at')
        .single();
      if (error) {
        if (error.code === '23505') return 'conflict'; // arada başka cihaz oluşturdu
        throw error;
      }
      newUpdatedAt = data.updated_at;
    }

    _saveBase(tenantKey, payload);
    const after = getSyncMeta(tenantKey);
    after.cloudUpdatedAt = newUpdatedAt;
    // Push sürerken yeni yerel değişiklik olduysa kirli kalır ve tekrar gönderilir
    after.dirty = after.rev !== revAtStart;
    _saveMeta(tenantKey, after);

    console.log(`[SyncManager] ☁️ Veriler Supabase'e başarıyla eşitlendi (${tenantKey}).`);
    setSyncStatus(after.dirty ? SYNC_STATUS.SYNCING : SYNC_STATUS.SYNCED);
    if (after.dirty) _pushQueued.add(tenantKey);
    return 'ok';
  } catch (err) {
    console.error('[SyncManager] Supabase push hatası:', err.message || err);
    setSyncStatus(SYNC_STATUS.ERROR);
    return 'error';
  }
}

/**
 * Bekleyen gönderimleri hemen yapar (örn. çıkış yapmadan önce).
 */
export async function flushPendingPushes() {
  const tenantKey = _state.getState().currentTenantKey;
  _debounceTimers.forEach(timer => clearTimeout(timer));
  _debounceTimers.clear();
  if (!tenantKey || !_cloudLoadDoneSet.has(tenantKey)) return;
  if (_pushInFlight.has(tenantKey)) await _pushInFlight.get(tenantKey);
  if (getSyncMeta(tenantKey).dirty) await _runPush(tenantKey);
}

// ═══════════════════════════════════════════
// Canlı güncelleme kontrolü
// ═══════════════════════════════════════════

function _hasUnsentLocalChanges(tenantKey) {
  return _debounceTimers.has(tenantKey) || _pushInFlight.has(tenantKey) || getSyncMeta(tenantKey).dirty;
}

/**
 * Diğer cihazlardan gelen canlı güncellemeleri kontrol eder.
 * Açılış eşitlemesi henüz başarılmadıysa onu yeniden dener.
 */
export async function checkForCloudUpdates() {
  if (!navigator.onLine) return;
  const tenantKey = _state.getState().currentTenantKey;
  if (!tenantKey || !_isCurrentTenant(tenantKey)) return;

  if (!_cloudLoadDoneSet.has(tenantKey)) {
    await syncOnLoad(tenantKey);
    return;
  }

  // Gönderilmemiş yerel değişiklik varsa push zaten birleştirerek yazacak
  if (_hasUnsentLocalChanges(tenantKey)) {
    if (!_pushInFlight.has(tenantKey) && !_debounceTimers.has(tenantKey)) _runPush(tenantKey);
    return;
  }

  const ready = await _readyClient(tenantKey);
  if (!ready) return;

  try {
    const head = await _fetchRemote(ready.client, tenantKey, 'updated_at');
    if (!head || head.updated_at === getSyncMeta(tenantKey).cloudUpdatedAt) {
      setSyncStatus(SYNC_STATUS.SYNCED);
      return;
    }
    const remote = await _fetchRemote(ready.client, tenantKey);
    // Sorgu sürerken yerel değişiklik olduysa ezme — push birleştirecek
    if (!remote || !_isCurrentTenant(tenantKey) || _hasUnsentLocalChanges(tenantKey)) return;

    console.log('[SyncManager] 🔄 Diğer cihazdan yeni güncelleme algılandı! Ekran yenileniyor...');
    _adoptCloud(tenantKey, remote);
    setSyncStatus(SYNC_STATUS.SYNCED);
  } catch (e) {
    console.error('[SyncManager] Cloud update check hatası:', e.message || e);
  }
}

/** Bağlantı geri geldiğinde: eşitleme yapılmadıysa yap, kirli veri varsa gönder */
export function flushPendingQueue() {
  const state = _state.getState();
  const tenantKey = state.currentTenantKey;
  if (!tenantKey) return;
  if (state.currentUser?.isDemo) {
    setSyncStatus(SYNC_STATUS.LOCAL);
    return;
  }
  if (!navigator.onLine) {
    setSyncStatus(SYNC_STATUS.OFFLINE);
    return;
  }
  if (!_cloudLoadDoneSet.has(tenantKey)) {
    syncOnLoad(tenantKey);
  } else if (getSyncMeta(tenantKey).dirty) {
    _runPush(tenantKey);
  } else {
    setSyncStatus(SYNC_STATUS.SYNCED);
  }
}

/**
 * Ağ durumu ve Canlı Otomatik Senkronizasyon Servisini Başlatır
 */
export function initSyncManager() {
  window.addEventListener('online', () => {
    console.log('[SyncManager] 🌐 İnternet bağlantısı sağlandı.');
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
  if (!navigator.onLine) setSyncStatus(SYNC_STATUS.OFFLINE);
}
