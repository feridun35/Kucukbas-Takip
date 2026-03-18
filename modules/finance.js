/**
 * ShepherdAI — Finans Yönetim Merkezi (Hub)
 */

import { navigateTo } from '../core/router.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter finance-hub-page';
  _container.style.paddingBottom = '110px'; 

  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:#fbbf24"></span>Finans & Envanter Merkezi</div>
    <p style="color:var(--text-muted); font-size:0.85rem; padding:0 var(--space-md) var(--space-md); margin-top:-10px;">
      Ekonomik araçlara erişmek için aşağıdaki kutulardan birini seçin:
    </p>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md); padding:0 var(--space-md);">
      
      <!-- Box 1 -->
      <div id="btn-goto-roi" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(251, 191, 36, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">📊</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Ekonomik ROI</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Sürü karlılık ve grafikleri</p>
      </div>

      <!-- Box 2 -->
      <div id="btn-goto-silo" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(16, 185, 129, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">🌾</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Depo & Silo</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Yem tüketim gün tahminleri</p>
      </div>

      <!-- Box 3 -->
      <div id="btn-goto-culling" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(239, 68, 68, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">✂️</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Sürü Ayıklama</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Satılacak zararlı hayvanlar listesi</p>
      </div>

      <!-- Box 4 -->
      <div class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); opacity:0.6; min-height:140px;">
        <span style="font-size:2.5rem; margin-bottom:12px;">💰</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Gelir / Gider</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Fatura ve cari kayıtlar (Yakında)</p>
      </div>

    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const btnRoi = _container.querySelector('#btn-goto-roi');
  if (btnRoi) btnRoi.addEventListener('click', () => navigateTo('finance-roi'));

  const btnSilo = _container.querySelector('#btn-goto-silo');
  if (btnSilo) btnSilo.addEventListener('click', () => navigateTo('finance-silo'));

  const btnCulling = _container.querySelector('#btn-goto-culling');
  if (btnCulling) btnCulling.addEventListener('click', () => navigateTo('finance-culling'));
}
