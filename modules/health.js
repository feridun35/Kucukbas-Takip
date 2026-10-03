/**
 * ShepherdAI — Sağlık Yönetim Merkezi (Hub)
 */

import { navigateTo } from '../core/router.js';
import { getOpenObservations } from '../core/observationManager.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-hub-page';
  _container.style.paddingBottom = '110px';
  const openCount = getOpenObservations().length;

  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:var(--accent-blue)"></span>Sağlık & Veteriner Merkezi</div>
    <p style="color:var(--text-muted); font-size:0.85rem; padding:0 var(--space-md) var(--space-md); margin-top:-10px;">
      İlgili modüle gitmek için aşağıdaki araçlardan birini seçin:
    </p>

    <div style="display:grid; grid-template-columns:1fr 1fr; gap:var(--space-md); padding:0 var(--space-md);">
      
      <!-- Box 1 -->
      <div id="btn-goto-ai" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(59, 130, 246, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">🩺</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Teşhis Asistanı</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">36 hastalıkta ayırıcı ön tanı</p>
      </div>

      <!-- Box 2 -->
      <div id="btn-goto-meds" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(239, 68, 68, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">💊</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">İlaç & Karantina</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Arınma süreleri ve karantina</p>
      </div>

      <!-- Box 3 -->
      <div id="btn-goto-vaccine" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(168, 85, 247, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">💉</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Aşı Ajandası</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Yaklaşan ve planlı aşılar</p>
      </div>

      <!-- Box 4 -->
      <div id="btn-goto-mortality" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(239, 68, 68, 0.3); transition:all 0.2s;">
        <span style="font-size:2.5rem; margin-bottom:12px;">📉</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Ölüm Raporları</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Mortalite & kayıp analizleri</p>
      </div>

      <!-- Box: Belirti Takibi -->
      <div id="btn-goto-observations" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(245, 158, 11, 0.35); transition:all 0.2s; grid-column: span 2;">
        <span style="font-size:2.5rem; margin-bottom:12px;">🤒</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Belirti Takibi${openCount ? ` <span style="font-size:0.75rem; background:rgba(245,158,11,0.2); color:#fbbf24; padding:2px 8px; border-radius:10px;">${openCount} açık</span>` : ''}</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">Hasta hayvanlar, açık belirtiler ve salgın uyarıları</p>
      </div>
      <!-- Box 5: Ecza Deposu -->
      <div id="btn-goto-pharmacy" class="glass-card hub-box" style="display:flex; flex-direction:column; align-items:center; justify-content:center; text-align:center; padding:var(--space-lg) var(--space-md); cursor:pointer; min-height:140px; border-color:rgba(6, 182, 212, 0.3); transition:all 0.2s; grid-column: span 2;">
        <span style="font-size:2.5rem; margin-bottom:12px;">🏥</span>
        <h4 style="font-size:0.95rem; color:var(--text-primary); margin-bottom:4px;">Ecza Deposu & Stok</h4>
        <p style="font-size:0.7rem; color:var(--text-muted);">İlaç stokları, tedavi geçmişi, karantina</p>
      </div>

    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const btnAi = _container.querySelector('#btn-goto-ai');
  if (btnAi) btnAi.addEventListener('click', () => navigateTo('health-ai'));

  const btnMeds = _container.querySelector('#btn-goto-meds');
  if (btnMeds) btnMeds.addEventListener('click', () => navigateTo('health-meds'));

  const btnVaccine = _container.querySelector('#btn-goto-vaccine');
  if (btnVaccine) btnVaccine.addEventListener('click', () => navigateTo('health-vaccines'));

  const btnMortality = _container.querySelector('#btn-goto-mortality');
  if (btnMortality) btnMortality.addEventListener('click', () => navigateTo('health-mortality'));

  const btnObs = _container.querySelector('#btn-goto-observations');
  if (btnObs) btnObs.addEventListener('click', () => navigateTo('health-observations'));
  const btnPharmacy = _container.querySelector('#btn-goto-pharmacy');
  if (btnPharmacy) btnPharmacy.addEventListener('click', () => navigateTo('health-meds'));
}
