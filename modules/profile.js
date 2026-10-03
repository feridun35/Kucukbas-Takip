/**
 * ShepherdAI — Kullanıcı Profili ve Uygulama Ayarları Modülü
 */

import { escapeHtml } from '../core/sanitize.js';
import { showAlert, showConfirm, showPrompt } from '../core/modal.js';
import { getCurrentUser, logout, updateCurrentUser, claimLegacyData } from '../core/auth.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter user-profile-page';
  _container.style.paddingBottom = '110px'; 
  
  const currentUser = getCurrentUser() || {
    ownerName: 'Misafir Kullanıcı',
    farmName: 'ShepherdAI Çiftliği',
    email: 'kullanici@shepherdai.com',
    id: 'usr_guest',
    isDemo: false
  };

  const isDemo = currentUser.isDemo || currentUser.id === 'demo';
  
  _container.innerHTML = `
    <div class="profile-header-card glass-card" style="display:flex; flex-direction:column; align-items:center; padding:var(--space-xl); margin-bottom:var(--space-lg); text-align:center;">
      <div style="width:90px; height:90px; border-radius:50%; background:var(--accent-blue); display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 0 20px var(--accent-blue-glow); margin-bottom:var(--space-sm);">
        👨‍🌾
      </div>
      <h2 style="font-size:1.4rem; color:var(--text-primary); font-weight:700;">${escapeHtml(currentUser.ownerName)}</h2>
      <p style="color:var(--accent-green); font-size:0.9rem; font-weight:500;">
        ${escapeHtml(currentUser.farmName)} • Çiftlik Sahibi
      </p>
      <div style="display:flex; gap:6px; margin-top:8px; align-items:center;">
        <span style="font-size:0.75rem; padding:3px 10px; border-radius:12px; background:rgba(255,255,255,0.08); color:var(--text-muted);">
          ${escapeHtml(currentUser.email)}
        </span>
        ${isDemo ? '<span style="font-size:0.75rem; padding:3px 10px; border-radius:12px; background:rgba(59,130,246,0.2); color:var(--accent-blue); font-weight:600;">Demo</span>' : '<span style="font-size:0.75rem; padding:3px 10px; border-radius:12px; background:rgba(34,197,94,0.2); color:var(--accent-green); font-weight:600;">Canlı İşletme</span>'}
      </div>
    </div>

    <div class="section-title"><span class="dot"></span>Uygulama & Çiftlik Ayarları</div>
    <div class="glass-card settings-list" style="padding:0; margin-bottom:var(--space-lg);">
      
      <!-- Setting Item -->
      <div class="setting-item" style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-md); border-bottom:1px solid var(--glass-border);">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:1.2rem;">🔔</span>
          <div>
            <h4 style="font-size:1rem; color:var(--text-primary);">Anlık Bildirimler</h4>
            <p style="font-size:0.75rem; color:var(--text-muted);">Hastalık ve stok uyarılarını al.</p>
          </div>
        </div>
        <div class="toggle-switch active" style="width:44px; height:24px; background:var(--accent-green); border-radius:12px; position:relative; cursor:pointer; box-shadow:0 0 10px var(--accent-green-glow);">
            <div style="width:20px; height:20px; background:#fff; border-radius:50%; position:absolute; top:2px; right:2px;"></div>
        </div>
      </div>

      <!-- Setting Item -->
      <div class="setting-item" id="btn-update-farm" style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-md); border-bottom:1px solid var(--glass-border); cursor:pointer; transition:background 0.2s;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:1.2rem;">🏠</span>
          <div>
            <h4 style="font-size:1rem; color:var(--text-primary);">Çiftlik Adı</h4>
            <p style="font-size:0.75rem; color:var(--text-muted);">${escapeHtml(currentUser.farmName)}</p>
          </div>
        </div>
        <span style="color:var(--text-muted);">❯</span>
      </div>

      ${!isDemo ? `
      <!-- Eski sürüm hesabının verisini aktar -->
      <div class="setting-item" id="btn-claim-legacy" style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-md); border-bottom:1px solid var(--glass-border); cursor:pointer; transition:background 0.2s;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:1.2rem;">📦</span>
          <div>
            <h4 style="font-size:1rem; color:var(--text-primary);">Eski Hesap Verisini Aktar</h4>
            <p style="font-size:0.75rem; color:var(--text-muted);">Eski sürümdeki çiftlik verinizi bu hesaba taşıyın</p>
          </div>
        </div>
        <span style="color:var(--text-muted);">❯</span>
      </div>` : ''}

      <!-- Setting Item -->
      <div class="setting-item" id="btn-sensor-rate" style="display:flex; align-items:center; justify-content:space-between; padding:var(--space-md); cursor:pointer; transition:background 0.2s;">
        <div style="display:flex; align-items:center; gap:12px;">
          <span style="font-size:1.2rem;">📡</span>
          <div>
            <h4 style="font-size:1rem; color:var(--text-primary);">Sensör Tarama Sıklığı</h4>
            <p style="font-size:0.75rem; color:var(--text-muted);">Pil ömrü optimizasyonu.</p>
          </div>
        </div>
        <span style="color:var(--accent-blue); font-weight:600; font-size:0.85rem;">60 sn</span>
      </div>

    </div>

    <div style="margin-top:var(--space-xl);">
      <button id="btn-logout" class="btn-secondary" style="width:100%; border-radius:24px; padding:16px; font-size:1rem; color:var(--danger-red); border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.05); font-weight:700; cursor:pointer;">
        🚪 Sistemden Çıkış Yap
      </button>
    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  // Toggle switches
  const toggles = _container.querySelectorAll('.toggle-switch');
  toggles.forEach(t => t.addEventListener('click', () => {
    t.classList.toggle('active');
    if (t.classList.contains('active')) {
      t.style.background = 'var(--accent-green)';
      t.style.boxShadow = '0 0 10px var(--accent-green-glow)';
      t.children[0].style.right = '2px';
      t.children[0].style.left = 'auto';
    } else {
      t.style.background = 'var(--glass-border)';
      t.style.boxShadow = 'none';
      t.children[0].style.left = '2px';
      t.children[0].style.right = 'auto';
    }
  }));

  const btnFarm = _container.querySelector('#btn-update-farm');
  if (btnFarm) {
    btnFarm.addEventListener('click', async () => {
      const newFarm = await showPrompt('Çiftlik Ayarları', 'Çiftliğiniz için yeni bir isim belirleyin:', 'text', '🏠');
      if (newFarm && newFarm.trim()) {
        updateCurrentUser({ farmName: newFarm.trim() });
        _rerender();
        showAlert('Başarılı', `Çiftlik adı "${newFarm.trim()}" olarak güncellendi.`, '✅');
      }
    });
  }

  const btnClaim = _container.querySelector('#btn-claim-legacy');
  if (btnClaim) {
    btnClaim.addEventListener('click', async () => {
      const oldPassword = await showPrompt('Eski Hesap Verisini Aktar', 'Aynı e-posta ile kullandığınız ESKİ sürüm şifrenizi giriniz. Mevcut kayıtlarınız silinmez, eski kayıtlar eklenir.', 'password', '📦');
      if (!oldPassword) return;
      const res = await claimLegacyData(oldPassword);
      await showAlert(res.success ? 'Aktarıldı' : 'Aktarılamadı', res.message, res.success ? '✅' : '⚠️');
    });
  }

  const btnSensors = _container.querySelector('#btn-sensor-rate');
  if (btnSensors) {
    btnSensors.addEventListener('click', async () => {
      // ESP32 entegrasyonu henüz yok: ayar yapılmış gibi göstermek yerine durumu açıkça bildir
      showAlert('Sensör Ayarları', 'ESP32 sensör bağlantısı henüz kurulmadı. Tarama sıklığı, cihaz bağlandığında bu ekrandan ayarlanabilecek.', '📡');
    });
  }

  const btnLogout = _container.querySelector('#btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const answer = await showConfirm('Sistemden Çıkış', 'Hesabınızdan çıkmak ve oturumu kapatmak istediğinize emin misiniz?', '🚪');
      if (answer) {
        await logout();
      }
    });
  }
}

function _rerender() {
  const parent = _container.parentNode;
  const scrollPos = window.scrollY;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
  window.scrollTo(0, scrollPos);
}
