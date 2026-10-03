/**
 * ShepherdAI — Kimlik Doğrulama ve Kullanıcı Oturum Yönetimi (Authentication)
 *
 * ── Güvenlik Modeli ──
 * - Kullanıcı hesapları ve şifreler YALNIZCA Supabase Auth'ta tutulur (bcrypt hash, sunucu tarafı).
 *   İstemcide veya veritabanı tablolarında şifre saklanmaz; kullanıcı listesi hiçbir yerde paylaşılmaz.
 * - Çiftlik verisi `farms_data` tablosunda, RLS ile yalnızca sahibine (owner_id = auth.uid()) açıktır.
 * - Demo hesabı tamamen yerel çalışır; buluta hiçbir veri göndermez, şifre gerektirmez.
 * - Offline-First: Oturum profili (şifresiz) `shepherd_current_user` anahtarında tutulur, böylece
 *   uygulama internetsiz açılabilir. Supabase oturum token'ı supabase-js tarafından yönetilir.
 *
 * ── Eski (v0.06 ve öncesi) Hesaplar ──
 * Eski sürüm şifreleri düz metin olarak saklıyordu. Bu hesaplar ilk girişte Supabase Auth'a taşınır:
 * - Bu cihazdaki eski kayıt eşleşirse hesap otomatik oluşturulur ve yerel veri yeni anahtara kopyalanır.
 * - Buluttaki eski çiftlik verisi `claim_legacy_farm` RPC'si ile (eski şifre doğrulanarak) devralınır.
 */

import { loadTenantState, clearTenantState, initNewTenantState, importFarmData } from './state.js';
import { navigateTo } from './router.js';
import { getSupabaseClient, tenantKeyForUserId, flushPendingPushes } from './syncManager.js';

// Demo Hesabı (10 Hayvanlı Örnek Çiftlik — yalnızca bu cihazda)
export const DEMO_ACCOUNT = {
  id: 'demo',
  email: 'demo@shepherdai.local',
  farmName: 'Bereket Yaylası Çiftliği (Demo)',
  ownerName: 'Demo Kullanıcı',
  role: 'owner',
  storageKey: 'shepherd_data_demo',
  isDemo: true,
  createdAt: '2026-01-01'
};

const CURRENT_USER_KEY = 'shepherd_current_user';
// Eski sürümün düz metin şifreli yerel kullanıcı listesi (yalnızca göç için okunur)
const LEGACY_USERS_REGISTRY_KEY = 'shepherd_users_registry';
const MIN_PASSWORD_LENGTH = 6;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Aktif oturumdaki kullanıcıyı döndürür
 * @returns {Object|null}
 */
export function getCurrentUser() {
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    console.error('[Auth] getCurrentUser error:', e);
    return null;
  }
}

/**
 * Oturum açık mı kontrolü
 * @returns {boolean}
 */
export function isAuthenticated() {
  const user = getCurrentUser();
  return user !== null && typeof user === 'object' && Boolean(user.storageKey);
}

/** Supabase kullanıcısından uygulama oturum profili üretir (şifre içermez) */
function _profileFromSupabaseUser(sbUser, overrides = {}) {
  const meta = sbUser.user_metadata || {};
  return {
    id: sbUser.id,
    email: sbUser.email,
    farmName: overrides.farmName || meta.farmName || 'Çiftliğim',
    ownerName: overrides.ownerName || meta.ownerName || sbUser.email,
    role: overrides.role || meta.role || 'owner',
    storageKey: tenantKeyForUserId(sbUser.id),
    isDemo: false,
    createdAt: (sbUser.created_at || new Date().toISOString()).split('T')[0]
  };
}

function _translateAuthError(error) {
  const msg = (error?.message || '').toLowerCase();
  if (msg.includes('invalid login credentials')) return 'E-posta veya şifre hatalı.';
  if (msg.includes('email not confirmed')) return 'E-posta adresiniz henüz doğrulanmamış. Gelen kutunuzdaki doğrulama bağlantısına tıklayın.';
  if (msg.includes('already registered') || msg.includes('already been registered')) return 'Bu e-posta adresiyle kayıtlı bir hesap zaten mevcut. Giriş yapmayı deneyin.';
  if (msg.includes('password')) return `Şifre en az ${MIN_PASSWORD_LENGTH} karakter olmalıdır.`;
  if (msg.includes('rate limit')) return 'Çok fazla deneme yapıldı. Lütfen biraz bekleyip tekrar deneyin.';
  if (msg.includes('fetch') || msg.includes('network')) return 'Sunucuya ulaşılamadı. İnternet bağlantınızı kontrol edin.';
  return error?.message || 'Beklenmeyen bir hata oluştu.';
}

function _requireCloud() {
  if (!navigator.onLine) {
    return { error: 'Giriş ve kayıt için internet bağlantısı gereklidir. Çevrimdışı denemek için "Demo Çiftliği İncele" seçeneğini kullanabilirsiniz.' };
  }
  const client = getSupabaseClient();
  if (!client) return { error: 'Bulut servisine bağlanılamadı. Sayfayı yenileyip tekrar deneyin.' };
  return { client };
}

// ═══════════════════════════════════════════
// Eski hesap göçü
// ═══════════════════════════════════════════

function _readLegacyUsers() {
  try {
    const raw = localStorage.getItem(LEGACY_USERS_REGISTRY_KEY);
    const users = raw ? JSON.parse(raw) : [];
    return Array.isArray(users) ? users : [];
  } catch (e) {
    return [];
  }
}

function _findLegacyUser(email, password) {
  return _readLegacyUsers().find(u =>
    !u.isDemo && u.email && u.email.toLowerCase() === email && u.password === password
  ) || null;
}

/** Göç tamamlanan eski kaydı (düz metin şifresiyle birlikte) bu cihazdan siler */
function _removeLegacyUser(email) {
  const rest = _readLegacyUsers().filter(u => !(u.email && u.email.toLowerCase() === email));
  try {
    if (rest.length === 0) localStorage.removeItem(LEGACY_USERS_REGISTRY_KEY);
    else localStorage.setItem(LEGACY_USERS_REGISTRY_KEY, JSON.stringify(rest));
  } catch (e) {}
}

/** Eski anahtardaki yerel çiftlik verisini yeni anahtara kopyalar (yeni anahtar boşsa) */
function _copyLegacyLocalData(legacyKey, newKey) {
  if (!legacyKey || legacyKey === newKey) return;
  try {
    const legacyData = localStorage.getItem(legacyKey);
    if (legacyData && !localStorage.getItem(newKey)) {
      localStorage.setItem(newKey, legacyData);
      console.log(`[Auth] Eski yerel veri taşındı: ${legacyKey} → ${newKey}`);
    }
  } catch (e) {
    console.error('[Auth] Yerel veri taşıma hatası:', e);
  }
}

/**
 * Buluttaki eski çiftlik verisini (eski şifre ile doğrulayarak) yeni hesaba bağlar.
 * Sunucu tarafı fonksiyon: data/schema.sql → claim_legacy_farm
 */
async function _claimLegacyCloudFarm(client, password) {
  try {
    const { data, error } = await client.rpc('claim_legacy_farm', { p_password: password });
    if (error) {
      // Fonksiyon kurulmamışsa (eski şema) sessizce geç
      console.warn('[Auth] claim_legacy_farm çağrılamadı:', error.message || error);
      return null;
    }
    return data && data.claimed ? data : null;
  } catch (e) {
    return null;
  }
}

/** Giriş/kayıt sonrası ortak adımlar: eski veri göçü + oturum + kiracı yükleme */
async function _completeSignIn(client, sbUser, password, legacyUser = null) {
  const claimed = await _claimLegacyCloudFarm(client, password);
  const legacyInfo = claimed || legacyUser;

  const profile = _profileFromSupabaseUser(sbUser, legacyInfo ? {
    farmName: legacyInfo.farmName,
    ownerName: legacyInfo.ownerName,
    role: legacyInfo.role
  } : {});

  if (legacyInfo) {
    _copyLegacyLocalData(legacyInfo.legacyStorageKey || legacyInfo.storageKey, profile.storageKey);
    _removeLegacyUser(profile.email.toLowerCase());
    // Profil bilgilerini Supabase kullanıcı metadata'sına yaz (diğer cihazlar için)
    client.auth.updateUser({ data: { farmName: profile.farmName, ownerName: profile.ownerName, role: profile.role } })
      .catch(() => {});
  }

  _setCurrentUser(profile);
  loadTenantState(profile);
  if (claimed?.legacyPayload) importFarmData(claimed.legacyPayload);
  return profile;
}

// ═══════════════════════════════════════════
// Giriş / Kayıt / Çıkış
// ═══════════════════════════════════════════

/**
 * Kullanıcı Girişi (E-Posta ve Şifre ile — Supabase Auth)
 * @param {string} email
 * @param {string} password
 * @returns {Promise<{success: boolean, message?: string, user?: Object}>}
 */
export async function login(email, password) {
  if (!email || !password) {
    return { success: false, message: 'Lütfen e-posta adresinizi ve şifrenizi giriniz.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  const { client, error: cloudError } = _requireCloud();
  if (cloudError) return { success: false, message: cloudError };

  const { data, error } = await client.auth.signInWithPassword({ email: cleanEmail, password: cleanPassword });

  if (!error && data?.user) {
    const user = await _completeSignIn(client, data.user, cleanPassword, _findLegacyUser(cleanEmail, cleanPassword));
    return { success: true, user };
  }

  // Supabase'de hesap yok ama bu cihazda eski (göç edilmemiş) hesap var → otomatik taşı
  const legacyUser = _findLegacyUser(cleanEmail, cleanPassword);
  if (legacyUser && (error?.message || '').toLowerCase().includes('invalid login credentials')) {
    if (cleanPassword.length < MIN_PASSWORD_LENGTH) {
      return { success: false, message: `Eski hesabınızın şifresi yeni güvenlik kuralına (en az ${MIN_PASSWORD_LENGTH} karakter) uymuyor. "Kayıt Ol" sekmesinden aynı e-posta, yeni bir şifre ve eski şifrenizle kayıt olun; verileriniz otomatik taşınır.` };
    }
    return _registerWithSupabase(client, {
      email: cleanEmail,
      password: cleanPassword,
      farmName: legacyUser.farmName,
      ownerName: legacyUser.ownerName,
      role: legacyUser.role || 'owner'
    }, legacyUser, cleanPassword);
  }

  return { success: false, message: _translateAuthError(error) };
}

/**
 * Demo Hesabı ile Hızlı Giriş (yalnızca yerel, buluta veri göndermez)
 */
export function loginAsDemo() {
  _setCurrentUser(DEMO_ACCOUNT);
  loadTenantState(DEMO_ACCOUNT);
  return { success: true, user: DEMO_ACCOUNT };
}

/**
 * Yeni Çiftlik / Kullanıcı Kaydı Oluşturma
 * @param {Object} formData - { farmName, ownerName, email, password, role, legacyPassword? }
 *   legacyPassword: Eski sürümdeki şifre (yeni şifreden farklıysa). Verilirse eski çiftlik verisi devralınır.
 */
export async function registerUser({ farmName, ownerName, email, password, role = 'owner', legacyPassword = '' }) {
  if (!farmName || !farmName.trim()) {
    return { success: false, message: 'Lütfen çiftlik adını belirtiniz.' };
  }
  if (!ownerName || !ownerName.trim()) {
    return { success: false, message: 'Lütfen adınızı ve soyadınızı belirtiniz.' };
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return { success: false, message: 'Lütfen geçerli bir e-posta adresi giriniz.' };
  }
  if (!password || password.trim().length < MIN_PASSWORD_LENGTH) {
    return { success: false, message: `Şifreniz en az ${MIN_PASSWORD_LENGTH} karakter uzunluğunda olmalıdır.` };
  }

  const { client, error: cloudError } = _requireCloud();
  if (cloudError) return { success: false, message: cloudError };

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();
  const claimPassword = (legacyPassword || '').trim() || cleanPassword;
  return _registerWithSupabase(client, {
    email: cleanEmail,
    password: cleanPassword,
    farmName: farmName.trim(),
    ownerName: ownerName.trim(),
    role: role || 'owner'
  }, _findLegacyUser(cleanEmail, claimPassword), claimPassword);
}

async function _registerWithSupabase(client, { email, password, farmName, ownerName, role }, legacyUser, claimPassword = password) {
  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { data: { farmName, ownerName, role } }
  });

  if (error) return { success: false, message: _translateAuthError(error) };

  // E-posta doğrulaması açıksa oturum hemen oluşmaz
  if (!data?.session || !data?.user) {
    return {
      success: false,
      needsConfirmation: true,
      message: 'Hesabınız oluşturuldu. Lütfen e-posta adresinize gelen doğrulama bağlantısına tıklayın, ardından giriş yapın.'
    };
  }

  const claimed = await _claimLegacyCloudFarm(client, claimPassword);
  if (!claimed && !legacyUser) {
    // Tamamen yeni hesap — boş çiftlik
    const profile = _profileFromSupabaseUser(data.user, { farmName, ownerName, role });
    _setCurrentUser(profile);
    initNewTenantState(profile);
    return { success: true, user: profile };
  }

  // Eski hesap taşındı (bulut veya yerel) — verisiyle birlikte yükle
  const legacyInfo = claimed || legacyUser;
  const profile = _profileFromSupabaseUser(data.user, {
    farmName: legacyInfo.farmName || farmName,
    ownerName: legacyInfo.ownerName || ownerName,
    role: legacyInfo.role || role
  });
  _copyLegacyLocalData(legacyInfo.legacyStorageKey || legacyInfo.storageKey, profile.storageKey);
  _removeLegacyUser(email);
  _setCurrentUser(profile);
  loadTenantState(profile);
  if (claimed?.legacyPayload) importFarmData(claimed.legacyPayload);
  return { success: true, user: profile, migrated: true };
}

/**
 * Oturum açıkken eski sürüm hesabının çiftlik verisini (eski şifreyle doğrulayarak) devralır.
 * Yeni hesapta veri varsa eski veri kayıt bazında birleştirilir; mevcut kayıtlar silinmez.
 */
export async function claimLegacyData(oldPassword) {
  const user = getCurrentUser();
  if (!user || user.isDemo) return { success: false, message: 'Bu işlem demo hesabında yapılamaz.' };
  if (!oldPassword) return { success: false, message: 'Eski şifrenizi giriniz.' };

  const { client, error: cloudError } = _requireCloud();
  if (cloudError) return { success: false, message: cloudError };

  const claimed = await _claimLegacyCloudFarm(client, oldPassword);
  if (!claimed) {
    return { success: false, message: 'Bu e-posta için eski hesap bulunamadı ya da eski şifre hatalı.' };
  }

  // Bu cihazda eski hesabın yerel verisi varsa o da birleştirilir
  try {
    const legacyLocal = claimed.legacyStorageKey && localStorage.getItem(claimed.legacyStorageKey);
    if (legacyLocal && claimed.legacyStorageKey !== user.storageKey) importFarmData(JSON.parse(legacyLocal));
  } catch (e) {}

  if (claimed.legacyPayload) {
    importFarmData(claimed.legacyPayload);
  } else {
    // Eski satır doğrudan bu hesaba devredildi — buluttan yeniden yükle
    loadTenantState(user);
  }
  return { success: true, message: 'Eski hesabınızın verileri bu hesaba aktarıldı.' };
}

/**
 * Uygulama açılışında Supabase oturumunu doğrular.
 * Çevrimiçiyken bulut oturumu yoksa (süresi dolmuş / başka cihazdan iptal edilmiş) yerel oturum kapatılır.
 * Çevrimdışıyken yerel oturum korunur (Offline-First).
 */
export async function verifySession() {
  const user = getCurrentUser();
  if (!user || user.isDemo) return;

  // Eski sürümden kalan (Supabase'e ait olmayan, örn. 'usr_123') oturumlar yeniden giriş gerektirir
  const isLegacySession = !UUID_PATTERN.test(user.id || '') || user.storageKey !== tenantKeyForUserId(user.id);

  if (!isLegacySession && !navigator.onLine) return;
  const client = getSupabaseClient();
  if (!client && !isLegacySession) return;

  let session = null;
  if (client) {
    try {
      const { data } = await client.auth.getSession();
      session = data?.session || null;
    } catch (e) {
      return; // Ağ hatası — oturumu korumaya devam et
    }
  }

  if (isLegacySession || !session || session.user.id !== user.id) {
    console.warn('[Auth] Geçerli bulut oturumu bulunamadı, yeniden giriş gerekiyor.');
    await logout();
  }
}

/**
 * Çıkış Yap (Oturumu Kapat)
 */
export async function logout() {
  const user = getCurrentUser();

  // Bekleyen değişiklikleri buluta gönder, sonra oturumu kapat
  if (user && !user.isDemo) {
    try { await flushPendingPushes(); } catch (e) {}
    const client = getSupabaseClient();
    if (client) {
      try { await client.auth.signOut(); } catch (e) {}
    }
  }

  try {
    localStorage.removeItem(CURRENT_USER_KEY);
  } catch (e) {
    console.error('[Auth] Error removing current user:', e);
  }
  clearTenantState();
  navigateTo('auth');
}

/**
 * Kullanıcı profil bilgilerini güncelleme (Örn. Çiftlik adı veya sahip adı değiştiğinde)
 */
export function updateCurrentUser(updatedFields) {
  const current = getCurrentUser();
  if (!current) return null;

  // Kimlik ve depolama alanları değiştirilemez
  const { id, email, storageKey, isDemo, ...safeFields } = updatedFields || {};
  const updatedUser = { ...current, ...safeFields };
  _setCurrentUser(updatedUser);

  if (!current.isDemo) {
    const client = getSupabaseClient();
    if (client && navigator.onLine) {
      const { farmName, ownerName, role } = updatedUser;
      client.auth.updateUser({ data: { farmName, ownerName, role } })
        .catch(e => console.error('[Auth] Profil buluta yazılamadı:', e));
    }
  }

  return updatedUser;
}

function _setCurrentUser(user) {
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('[Auth] Error saving current user:', e);
  }
}
