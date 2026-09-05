/**
 * ShepherdAI — Kimlik Doğrulama ve Giriş/Kayıt Ekranı (modules/auth.js)
 * Glassmorphism temalı, mobil ergonomik Giriş ve Kayıt paneli.
 */

import { login, registerUser } from '../core/auth.js';
import { navigateTo } from '../core/router.js';
import { showAlert } from '../core/modal.js';

let _container = null;
let _activeTab = 'login'; // 'login' | 'register'

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter auth-page';
  _container.style.padding = 'var(--space-md) 0 var(--space-xl)';

  _renderContent();

  return _container;
}

export function init() {
  if (!_container) return;
  _attachEvents();
}

function _renderContent() {
  _container.innerHTML = `
    <!-- Brand Header -->
    <div class="auth-brand" style="text-align:center; padding:var(--space-lg) var(--space-md) var(--space-md);">
      <div style="display:inline-flex; align-items:center; justify-content:center; width:76px; height:76px; border-radius:24px; background:linear-gradient(135deg, rgba(34, 197, 94, 0.2), rgba(59, 130, 246, 0.2)); border:1px solid rgba(255,255,255,0.15); box-shadow:0 8px 32px rgba(34, 197, 94, 0.15); font-size:40px; margin-bottom:var(--space-md);">
        🐑
      </div>
      <h1 style="font-size:1.8rem; font-weight:800; letter-spacing:-0.5px; background:linear-gradient(135deg, #ffffff 40%, var(--accent-green) 100%); -webkit-background-clip:text; -webkit-text-fill-color:transparent; margin-bottom:6px;">
        ShepherdAI
      </h1>
      <p style="font-size:0.85rem; color:var(--text-secondary); max-width:320px; margin:0 auto;">
        Küçükbaş Hayvancılıkta Akıllı Sürü & Finans Yönetim Sistemi
      </p>
    </div>

    <!-- Main Auth Card (Login & Register Tabs) -->
    <div style="padding:0 var(--space-md);">
      <div class="glass-card" style="padding:var(--space-lg); border-radius:24px; box-shadow:0 12px 40px rgba(0,0,0,0.4);">
        
        <!-- Tab Selector -->
        <div style="display:flex; background:rgba(0,0,0,0.3); padding:4px; border-radius:14px; margin-bottom:var(--space-lg);">
          <button id="tab-login" type="button" style="flex:1; padding:12px; border-radius:10px; font-weight:700; font-size:0.95rem; transition:all 0.25s; cursor:pointer; background:${_activeTab === 'login' ? 'var(--accent-green)' : 'transparent'}; color:${_activeTab === 'login' ? '#000' : 'var(--text-secondary)'};">
            Giriş Yap
          </button>
          <button id="tab-register" type="button" style="flex:1; padding:12px; border-radius:10px; font-weight:700; font-size:0.95rem; transition:all 0.25s; cursor:pointer; background:${_activeTab === 'register' ? 'var(--accent-green)' : 'transparent'}; color:${_activeTab === 'register' ? '#000' : 'var(--text-secondary)'};">
            Kayıt Ol
          </button>
        </div>

        <!-- Form Alanı -->
        ${_activeTab === 'login' ? _renderLoginForm() : _renderRegisterForm()}

      </div>
    </div>
  `;

  _attachEvents();
}

function _renderLoginForm() {
  return `
    <form id="form-login" onsubmit="return false;" style="display:flex; flex-direction:column; gap:16px;">
      <div>
        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          E-Posta Adresi veya Kullanıcı Adı
        </label>
        <div style="position:relative;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:1.1rem; opacity:0.6;">👤</span>
          <input type="text" id="login-email" placeholder="admin veya e-posta adresiniz"
                 style="width:100%; box-sizing:border-box; padding:14px 14px 14px 44px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); font-size:1rem; font-family:inherit; outline:none; transition:border-color 0.2s;">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Şifre
        </label>
        <div style="position:relative;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:1.1rem; opacity:0.6;">🔒</span>
          <input type="password" id="login-password" placeholder="••••••••"
                 style="width:100%; box-sizing:border-box; padding:14px 14px 14px 44px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); font-size:1rem; font-family:inherit; outline:none; transition:border-color 0.2s;">
        </div>
      </div>

      <div style="font-size:0.8rem; background:rgba(34, 197, 94, 0.08); border:1px solid rgba(34, 197, 94, 0.2); padding:10px 12px; border-radius:12px; color:var(--text-secondary); line-height:1.4;">
        👑 <b>Admin Hesabı:</b> <code>admin</code> / <code>admin</code> (10 Hayvanlı Örnek Çiftlik)
      </div>

      <button type="submit" id="btn-submit-login" class="btn-primary" style="width:100%; padding:16px; border-radius:16px; font-size:1.05rem; font-weight:700; margin-top:4px; box-shadow:0 4px 20px rgba(34,197,94,0.3);">
        Oturum Aç ➔
      </button>
    </form>
  `;
}

function _renderRegisterForm() {
  return `
    <form id="form-register" onsubmit="return false;" style="display:flex; flex-direction:column; gap:14px;">
      <div>
        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Çiftlik / İşletme Adı
        </label>
        <div style="position:relative;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:1.1rem; opacity:0.6;">🏠</span>
          <input type="text" id="reg-farm" placeholder="Örn: Toroslar Yayla Çiftliği"
                 style="width:100%; box-sizing:border-box; padding:14px 14px 14px 44px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); font-size:1rem; font-family:inherit; outline:none;">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          İşletme Sahibi / Yetkili Ad Soyad
        </label>
        <div style="position:relative;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:1.1rem; opacity:0.6;">👤</span>
          <input type="text" id="reg-owner" placeholder="Örn: Ahmet Yılmaz"
                 style="width:100%; box-sizing:border-box; padding:14px 14px 14px 44px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); font-size:1rem; font-family:inherit; outline:none;">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          E-Posta Adresi
        </label>
        <div style="position:relative;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:1.1rem; opacity:0.6;">✉️</span>
          <input type="email" id="reg-email" placeholder="ahmet@ciftlik.com"
                 style="width:100%; box-sizing:border-box; padding:14px 14px 14px 44px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); font-size:1rem; font-family:inherit; outline:none;">
        </div>
      </div>

      <div>
        <label style="display:block; font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-bottom:6px;">
          Şifre (En az 4 karakter)
        </label>
        <div style="position:relative;">
          <span style="position:absolute; left:14px; top:50%; transform:translateY(-50%); font-size:1.1rem; opacity:0.6;">🔒</span>
          <input type="password" id="reg-password" placeholder="••••••••"
                 style="width:100%; box-sizing:border-box; padding:14px 14px 14px 44px; border-radius:14px; background:rgba(255,255,255,0.06); border:1px solid var(--glass-border); color:var(--text-primary); font-size:1rem; font-family:inherit; outline:none;">
        </div>
      </div>

      <div style="font-size:0.75rem; color:var(--text-muted); line-height:1.4;">
        ☁️ Çiftlik verileriniz ve hesabınız tüm cihazlarınız (PC & Mobil) arasında Supabase bulut ile otomatik senkronize edilecektir.
      </div>

      <button type="submit" id="btn-submit-register" class="btn-primary" style="width:100%; padding:16px; border-radius:16px; font-size:1.05rem; font-weight:700; margin-top:8px; box-shadow:0 4px 20px rgba(34,197,94,0.3);">
        Çiftliğimi Oluştur & Başla ➔
      </button>
    </form>
  `;
}

function _attachEvents() {
  // Tab Switchers
  const tabLogin = _container.querySelector('#tab-login');
  const tabReg = _container.querySelector('#tab-register');

  if (tabLogin) {
    tabLogin.addEventListener('click', () => {
      _activeTab = 'login';
      _renderContent();
    });
  }

  if (tabReg) {
    tabReg.addEventListener('click', () => {
      _activeTab = 'register';
      _renderContent();
    });
  }

  // Form Submit Login
  const formLogin = _container.querySelector('#form-login');
  if (formLogin) {
    formLogin.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = _container.querySelector('#login-email')?.value || '';
      const password = _container.querySelector('#login-password')?.value || '';

      const submitBtn = _container.querySelector('#btn-submit-login');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Kontrol Ediliyor...';
      }

      const res = await login(email, password);
      if (res.success) {
        await showAlert('Giriş Başarılı', `Hoş geldiniz, ${res.user.ownerName} (${res.user.farmName})`, '✅');
        navigateTo('dashboard');
      } else {
        await showAlert('Giriş Yapılamadı', res.message, '⚠️');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Oturum Aç ➔';
        }
      }
    });
  }

  // Form Submit Register
  const formRegister = _container.querySelector('#form-register');
  if (formRegister) {
    formRegister.addEventListener('submit', async (e) => {
      e.preventDefault();
      const farmName = _container.querySelector('#reg-farm')?.value || '';
      const ownerName = _container.querySelector('#reg-owner')?.value || '';
      const email = _container.querySelector('#reg-email')?.value || '';
      const password = _container.querySelector('#reg-password')?.value || '';

      const submitBtn = _container.querySelector('#btn-submit-register');
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.innerText = 'Hesap Oluşturuluyor...';
      }

      const res = await registerUser({ farmName, ownerName, email, password });
      if (res.success) {
        await showAlert('Kayıt Tamamlandı', `Tebrikler! ${res.user.farmName} çiftliğiniz oluşturuldu ve bulut senkronizasyonu kuruldu.`, '🎉');
        navigateTo('dashboard');
      } else {
        await showAlert('Kayıt Başarısız', res.message, '⚠️');
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.innerText = 'Çiftliğimi Oluştur & Başla ➔';
        }
      }
    });
  }
}
