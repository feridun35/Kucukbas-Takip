/**
 * ShepherdAI — Kimlik Doğrulama ve Kullanıcı Oturum Yönetimi (Authentication)
 * Multi-tenant oturumları, Supabase bulut senkronizasyonlu kullanıcı kayıtlarını ve Admin Demo hesabını yönetir.
 */

import { loadTenantState, clearTenantState, initNewTenantState } from './state.js';
import { navigateTo } from './router.js';
import { pushLocalStateToCloud, pullCloudStateToLocal, pushStateToCloudImmediate } from './syncManager.js';

// Admin / Demo Varsayılan Hesabı (10 Hayvanlı Örnek Çiftlik)
export const DEFAULT_ACCOUNTS = {
  DEMO: {
    id: 'demo',
    email: 'admin@shepherdai.com',
    username: 'admin',
    password: 'admin',
    farmName: 'Bereket Yaylası Çiftliği (Admin Demo)',
    ownerName: 'Admin Yöneticisi',
    role: 'owner',
    storageKey: 'shepherd_data_demo',
    isDemo: true,
    createdAt: '2026-01-01'
  }
};

const CURRENT_USER_KEY = 'shepherd_current_user';
const USERS_REGISTRY_KEY = 'shepherd_users_registry';
const GLOBAL_USERS_SYNC_KEY = 'shepherd_global_users_registry';

/**
 * Supabase bulutundaki kullanıcı kaydını çekip yerel kullanıcı listesi ile birleştirir
 */
export async function syncUsersFromCloud() {
  try {
    const cloudUsers = await pullCloudStateToLocal(GLOBAL_USERS_SYNC_KEY);
    if (Array.isArray(cloudUsers) && cloudUsers.length > 0) {
      const localUsers = getRegisteredUsers();
      const mergedMap = new Map();

      // Önce yerel kullanıcıları ekle
      localUsers.forEach(u => {
        const key = u.id || u.email;
        if (key) mergedMap.set(key, u);
      });

      // Buluttan gelen kullanıcıları ekle/güncelle
      cloudUsers.forEach(u => {
        const key = u.id || u.email;
        if (key) mergedMap.set(key, u);
      });

      const mergedList = Array.from(mergedMap.values());
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(mergedList));
      return mergedList;
    }
  } catch (e) {
    console.error('[Auth] syncUsersFromCloud hatası:', e);
  }
  return getRegisteredUsers();
}

/**
 * Kullanıcı listesini Supabase bulutuna anında yedekler (Cihazlar arası hesap senkronizasyonu için)
 */
export async function pushUsersToCloud(usersList) {
  try {
    await pushStateToCloudImmediate(GLOBAL_USERS_SYNC_KEY, usersList);
  } catch (e) {
    console.error('[Auth] pushUsersToCloud hatası:', e);
  }
}

/**
 * Kayıtlı kullanıcıları getirir (Admin hesabı otomatik dahil edilir)
 */
export function getRegisteredUsers() {
  try {
    const raw = localStorage.getItem(USERS_REGISTRY_KEY);
    if (!raw) {
      const initialUsers = [DEFAULT_ACCOUNTS.DEMO];
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(initialUsers));
      return initialUsers;
    }
    const users = JSON.parse(raw);
    
    // Admin hesabının registry'de olduğundan emin ol
    let updated = false;
    if (!users.some(u => u.id === DEFAULT_ACCOUNTS.DEMO.id)) {
      users.unshift(DEFAULT_ACCOUNTS.DEMO);
      updated = true;
    }
    if (updated) {
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(users));
    }
    return users;
  } catch (e) {
    console.error('[Auth] getRegisteredUsers error:', e);
    return [DEFAULT_ACCOUNTS.DEMO];
  }
}

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

/**
 * Kullanıcı Girişi (E-Posta / Kullanıcı Adı ve Şifre ile)
 * @param {string} emailOrUsername 
 * @param {string} password 
 * @returns {Promise<{success: boolean, message?: string, user?: Object}>}
 */
export async function login(emailOrUsername, password) {
  if (!emailOrUsername || !password) {
    return { success: false, message: 'Lütfen e-posta / kullanıcı adı ve şifrenizi giriniz.' };
  }

  const cleanInput = emailOrUsername.trim().toLowerCase();
  const cleanPassword = password.trim();

  // Admin (10 Hayvanlı Demo Hesabı) Özel Kontrolü
  if (
    (cleanInput === 'admin' || cleanInput === 'admin@shepherdai.com' || cleanInput === 'demo' || cleanInput === 'demo@shepherdai.com') &&
    (cleanPassword === 'admin' || cleanPassword === 'admin123' || cleanPassword === 'demo' || cleanPassword === 'demo123')
  ) {
    const adminUser = DEFAULT_ACCOUNTS.DEMO;
    _setCurrentUser(adminUser);
    loadTenantState(adminUser);
    return { success: true, user: adminUser };
  }

  let users = getRegisteredUsers();
  let foundUser = _findUser(users, cleanInput, cleanPassword);

  // Yerel veride bulunamadıysa Supabase bulutundan kullanıcı kaydını güncelleip tekrar dene (Çoklu Cihaz Desteği)
  if (!foundUser && navigator.onLine) {
    users = await syncUsersFromCloud();
    foundUser = _findUser(users, cleanInput, cleanPassword);
  }

  if (!foundUser) {
    return { success: false, message: 'Giriş bilgileri hatalı veya hesabınıza ulaşılamadı. Lütfen e-posta ve şifrenizi kontrol edin.' };
  }

  _setCurrentUser(foundUser);
  loadTenantState(foundUser);
  return { success: true, user: foundUser };
}

function _findUser(users, cleanInput, cleanPassword) {
  return users.find(u => 
    (
      (u.email && u.email.toLowerCase() === cleanInput) ||
      (u.username && u.username.toLowerCase() === cleanInput) ||
      (u.id === cleanInput)
    ) &&
    u.password === cleanPassword
  );
}

/**
 * Admin Hesabı ile Hızlı Giriş
 */
export function loginAsDemo() {
  const demoUser = DEFAULT_ACCOUNTS.DEMO;
  _setCurrentUser(demoUser);
  loadTenantState(demoUser);
  return { success: true, user: demoUser };
}

/**
 * Yeni Çiftlik / Kullanıcı Kaydı Oluşturma
 * @param {Object} formData - { farmName, ownerName, email, password, role }
 */
export async function registerUser({ farmName, ownerName, email, password, role = 'owner' }) {
  if (!farmName || !farmName.trim()) {
    return { success: false, message: 'Lütfen çiftlik adını belirtiniz.' };
  }
  if (!ownerName || !ownerName.trim()) {
    return { success: false, message: 'Lütfen adınızı ve soyadınızı belirtiniz.' };
  }
  if (!email || !email.trim() || (!email.includes('@') && email.trim().toLowerCase() !== 'admin')) {
    return { success: false, message: 'Lütfen geçerli bir e-posta adresi giriniz.' };
  }
  if (!password || password.trim().length < 4) {
    return { success: false, message: 'Şifreniz en az 4 karakter uzunluğunda olmalıdır.' };
  }

  const cleanEmail = email.trim().toLowerCase();

  // Önce buluttan güncel kullanıcı listesini çek ki e-posta çakışması doğru kontrol edilsin
  const users = await syncUsersFromCloud();

  if (users.some(u => u.email && u.email.toLowerCase() === cleanEmail)) {
    return { success: false, message: 'Bu e-posta adresiyle kayıtlı bir hesap zaten mevcut.' };
  }

  const newId = 'usr_' + Date.now();
  const newUser = {
    id: newId,
    email: cleanEmail,
    password: password.trim(),
    farmName: farmName.trim(),
    ownerName: ownerName.trim(),
    role: role || 'owner',
    storageKey: `shepherd_data_${newId}`,
    isDemo: false,
    createdAt: new Date().toISOString().split('T')[0]
  };

  users.push(newUser);
  try {
    localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(users));
  } catch (e) {
    console.error('[Auth] Error saving new user:', e);
  }

  // Kullanıcı listesini Supabase bulutuna gönder (PC ve Mobil senkronizasyonu için)
  await pushUsersToCloud(users);

  // Yeni kiracı için boş state oluştur ve aktif oturumu ayarla
  _setCurrentUser(newUser);
  initNewTenantState(newUser);

  return { success: true, user: newUser };
}

/**
 * Çıkış Yap (Oturumu Kapat)
 */
export function logout() {
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

  const updatedUser = { ...current, ...updatedFields };
  _setCurrentUser(updatedUser);

  // Registry'de de güncelle
  const users = getRegisteredUsers().map(u => u.id === updatedUser.id ? updatedUser : u);
  try {
    localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(users));
    pushUsersToCloud(users);
  } catch (e) {}

  return updatedUser;
}

function _setCurrentUser(user) {
  try {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  } catch (e) {
    console.error('[Auth] Error saving current user:', e);
  }
}
