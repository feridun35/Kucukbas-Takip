/**
 * ShepherdAI — Sürü Yönetim Merkezi (Hub)
 * Alt sekmeler (Kutucuklar) üzerinden ilgili sayfalara yönlendirir.
 */

import { navigateTo } from '../core/router.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter herd-hub-page';
  _container.style.paddingBottom = '110px'; 
  
  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot"></span>Sürü Yönetim Merkezi</div>
    <p style="color:var(--text-muted); font-size:0.85rem; padding:0 var(--space-md) var(--space-md); margin-top:-10px;">
      İlgili modüle gitmek için aşağıdaki araçlardan birini seçin:
    </p>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md); padding:0 var(--space-md);">
      
      <!-- Box 1: Eşleşme Matrisi -->
      <div id="btn-goto-breeding" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(249, 115, 22, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">🧬</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Islah & Eşleşme</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Genetik simülasyon ve gebelik takibi</p>
      </div>

      <!-- Box 2: Pasaport -->
      <div id="btn-goto-passport" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(16, 185, 129, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">📘</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Hayvan Pasaportu</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Bireysel hayvan (TR-102) dijital profili</p>
      </div>

      <!-- Box 3: Sürü Listesi -->
      <div id="btn-goto-list" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(59, 130, 246, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">📋</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Sürü Listesi</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Sürünün tamamı, arama ve filtreleme</p>
      </div>

      <!-- Box 4: Toplu İşlem (Placeholder) -->
      <div class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); opacity:0.6; min-height:140px;">
        <span style="font-size:2.5rem; margin-bottom:12px;">💉</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Toplu İşlemler</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Toplu aşı / tartım kaydı (Yakında)</p>
      </div>

    </div>
  `;

  // Hover efektleri için style (SPA yapısında basitçe böyle çözebiliriz veya main.css'e eklenebilir)
  const style = document.createElement('style');
  style.textContent = `
    .hub-box:active, .hub-box:hover {
      transform: translateY(-4px);
      box-shadow: 0 8px 24px rgba(0,0,0,0.3);
      filter: brightness(1.2);
    }
  `;
  _container.appendChild(style);

  return _container;
}

export function init() {
  if (!_container) return;

  const btnBreeding = _container.querySelector('#btn-goto-breeding');
  if (btnBreeding) {
    btnBreeding.addEventListener('click', () => {
      navigateTo('breeding');
    });
  }

  const btnPassport = _container.querySelector('#btn-goto-passport');
  if (btnPassport) {
    btnPassport.addEventListener('click', () => {
      navigateTo('animal-profile');
    });
  }
  
  const btnList = _container.querySelector('#btn-goto-list');
  if (btnList) {
    btnList.addEventListener('click', () => {
      navigateTo('herd-list');
    });
  }
}
