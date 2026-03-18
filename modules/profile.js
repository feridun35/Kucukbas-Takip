/**
 * ShepherdAI — Kullanıcı Profili ve Uygulama Ayarları Modülü
 */

import { showAlert, showConfirm, showPrompt } from '../core/modal.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter user-profile-page';
  _container.style.paddingBottom = '110px'; 
  
  _container.innerHTML = `
    <div class="profile-header-card glass-card" style="display:flex; flex-direction:column; align-items:center; padding:var(--space-xl); margin-bottom:var(--space-lg); text-align:center;">
      <div style="width:90px; height:90px; border-radius:50%; background:var(--accent-blue); display:flex; align-items:center; justify-content:center; font-size:40px; box-shadow:0 0 20px var(--accent-blue-glow); margin-bottom:var(--space-sm);">
        👨‍🌾
      </div>
      <h2 style="font-size:1.4rem; color:var(--text-primary); font-weight:700;">Feridun Bey</h2>
      <p style="color:var(--accent-green); font-size:0.9rem; font-weight:500;">Çiftlik Sahibi & Ana Yönetici</p>
      <p style="color:var(--text-muted); font-size:0.8rem; margin-top:4px;">UID: SHEP-4921-X</p>
    </div>

    <div class="section-title"><span class="dot"></span>Uygulama Ayarları</div>
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
            <p style="font-size:0.75rem; color:var(--text-muted);">Kayıtlı çiftlik ismini değiştir.</p>
          </div>
        </div>
        <span style="color:var(--text-muted);">❯</span>
      </div>

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
      <button id="btn-logout" class="btn-secondary" style="width:100%; border-radius:24px; padding:16px; font-size:1rem; color:var(--danger-red); border-color:rgba(239,68,68,0.3); background:rgba(239,68,68,0.05);">
        Sistemden Çıkış Yap
      </button>
    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

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
      if (newFarm) {
        showAlert('Başarılı', `Çiftlik adı "${newFarm}" olarak güncellendi.`, '✅');
      }
    });
  }

  const btnSensors = _container.querySelector('#btn-sensor-rate');
  if (btnSensors) {
    btnSensors.addEventListener('click', async () => {
      const isFast = await showConfirm('Sensör Ayarları', 'Tarama sıklığını 5 saniyeye (Yüksek Güç Tüketimi) düşürmek ister misiniz?', '⚡');
      if (isFast) {
        btnSensors.querySelector('span:last-child').innerText = '5 sn';
        showAlert('Güncellendi', 'Sensör tarama hızı 5 saniye olarak ayarlandı. Batarya tüketimi artacaktır.', '🔋');
      }
    });
  }

  const btnLogout = _container.querySelector('#btn-logout');
  if (btnLogout) {
    btnLogout.addEventListener('click', async () => {
      const answer = await showConfirm('Sistemden Çıkış', 'Hesabınızdan çıkmak istediğinize emin misiniz?', '🚪');
      if (answer) {
        showAlert('Oturum Kapatılıyor', 'Hesabınızdan güvenle çıkış yapıldı.', '👋');
        // İleride window.location.reload() veya yönlendirme yapılır.
      }
    });
  }
}
