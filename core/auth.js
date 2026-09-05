/**
 * ShepherdAI — Kimlik Doğrulama ve Kullanıcı Oturum Yönetimi (Authentication)
 * Multi-tenant oturumları, yerel kullanıcı kayıtlarını ve Demo / Sıfır Çiftlik hesaplarını yönetir.
 */

import { loadTenantState, clearTenantState, initNewTenantState } from './state.js';
import { navigateTo } from './router.js';

// Sabit Varsayılan Hesaplar
export const DEFAULT_ACCOUNTS = {
  DEMO: {
    id: 'demo',
    email: 'demo@shepherdai.com',
    password: 'demo',
    farmName: 'Bereket Yaylası Çiftliği',
    ownerName: 'Feridun Bey',
    role: 'owner',
    storageKey: 'shepherd_data_demo',
    isDemo: true,
    createdAt: '2026-01-01'
  },
  ZERO: {
    id: 'zero_farm',
    email: 'sifir@shepherdai.com',
    password: 'sifir',
    farmName: 'Doğal Vadi Çiftliği',
    ownerName: 'Yeni İşletmeci',
    role: 'owner',
    storageKey: 'shepherd_data_zero',
    isDemo: false,
    createdAt: '2026-03-01'
  }
};

const CURRENT_USER_KEY = 'shepherd_current_user';
const USERS_REGISTRY_KEY = 'shepherd_users_registry';

/**
 * Kayıtlı kullanıcıları getirir (varsayılan hesaplar otomatik eklenir)
 */
export function getRegisteredUsers() {
  try {
    const raw = localStorage.getItem(USERS_REGISTRY_KEY);
    if (!raw) {
      const initialUsers = [DEFAULT_ACCOUNTS.DEMO, DEFAULT_ACCOUNTS.ZERO];
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(initialUsers));
      return initialUsers;
    }
    const users = JSON.parse(raw);
    
    // Varsayılan hesapların registry'de olduğundan emin ol
    let updated = false;
    if (!users.some(u => u.id === DEFAULT_ACCOUNTS.DEMO.id)) {
      users.unshift(DEFAULT_ACCOUNTS.DEMO);
      updated = true;
    }
    if (!users.some(u => u.id === DEFAULT_ACCOUNTS.ZERO.id)) {
      users.splice(1, 0, DEFAULT_ACCOUNTS.ZERO);
      updated = true;
    }
    if (updated) {
      localStorage.setItem(USERS_REGISTRY_KEY, JSON.stringify(users));
    }
    return users;
  } catch (e) {
    console.error('[Auth] getRegisteredUsers error:', e);
    return [DEFAULT_ACCOUNTS.DEMO, DEFAULT_ACCOUNTS.ZERO];
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
 * Kullanıcı Girişi (Email ve Şifre ile)
 * @param {string} email 
 * @param {string} password 
 * @returns {{success: boolean, message?: string, user?: Object}}
 */
export function login(email, password) {
  if (!email || !password) {
    return { success: false, message: 'Lütfen e-posta ve şifrenizi giriniz.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanPassword = password.trim();

  const users = getRegisteredUsers();
  const foundUser = users.find(u => 
    u.email.toLowerCase() === cleanEmail && 
    (u.password === cleanPassword || (u.id === 'demo' && cleanPassword === 'demo123') || (u.id === 'zero_farm' && cleanPassword === 'sifir123'))
  );

  if (!foundUser) {
    return { success: false, message: 'E-posta veya şifre hatalı. Lütfen kontrol edip tekrar deneyin.' };
  }

  _setCurrentUser(foundUser);
  loadTenantState(foundUser);
  return { success: true, user: foundUser };
}

/**
 * Demo Hesabı ile Tek Tıkla Hızlı Giriş
 */
export function loginAsDemo() {
  const demoUser = DEFAULT_ACCOUNTS.DEMO;
  _setCurrentUser(demoUser);
  loadTenantState(demoUser);
  return { success: true, user: demoUser };
}

/**
 * Sıfır Çiftlik (Gerçek İşletme) Hesabı ile Tek Tıkla Hızlı Giriş
 */
export function loginAsZero() {
  const zeroUser = DEFAULT_ACCOUNTS.ZERO;
  _setCurrentUser(zeroUser);
  loadTenantState(zeroUser);
  return { success: true, user: zeroUser };
}

/**
 * Yeni Çiftlik / Kullanıcı Kaydı Oluşturma
 * @param {Object} formData - { farmName, ownerName, email, password, role }
 */
export function registerUser({ farmName, ownerName, email, password, role = 'owner' }) {
  if (!farmName || !farmName.trim()) {
    return { success: false, message: 'Lütfen çiftlik adını belirtiniz.' };
  }
  if (!ownerName || !ownerName.trim()) {
    return { success: false, message: 'Lütfen adınızı ve soyadınızı belirtiniz.' };
  }
  if (!email || !email.trim() || !email.includes('@')) {
    return { success: false, message: 'Lütfen geçerli bir e-posta adresi giriniz.' };
  }
  if (!password || password.trim().length < 4) {
    return { success: false, message: 'Şifreniz en az 4 karakter uzunluğunda olmalıdır.' };
  }

  const cleanEmail = email.trim().toLowerCase();
  const users = getRegisteredUsers();

  if (users.some(u => u.email.toLowerCase() === cleanEmail)) {
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
