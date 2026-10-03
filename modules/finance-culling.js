/**
 * ShepherdAI — Sürü Ayıklama (Culling) Operasyonları
 */
import { generateCullingList } from '../core/financeEngine.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter finance-page';
  _container.style.paddingBottom = '50px';
  
  const cullingList = generateCullingList();

  _container.innerHTML = `
    <div class="section-title"><span class="dot" style="background:#ef4444"></span>Ayıklama Önerileri (Culling)</div>
    <p style="color:var(--text-muted); font-size:0.85rem; padding:0 var(--space-md) var(--space-md); margin-top:-10px;">
      Doğumdan bu yana günlük canlı ağırlık artışının değeri, günlük yem maliyetinin altında kalan besi hayvanları.
      Damızlık, gebe ve sağmal hayvanlar bu kritere göre değerlendirilmez.
    </p>
    ${_renderCullingList(cullingList)}
    ${cullingList.insufficientData > 0 ? `
      <p style="color:var(--text-muted); font-size:0.75rem; padding:0 var(--space-md);">
        ℹ️ ${cullingList.insufficientData} hayvan değerlendirilemedi: doğum tarihi, doğum ağırlığı veya güncel tartım kaydı eksik.
      </p>` : ''}
  `;
  return _container;
}

export function init() {}

function _renderCullingList(cullingList) {
  if (!cullingList || cullingList.length === 0) {
    return `
      <div class="glass-card" style="margin:var(--space-md); padding:var(--space-xl) var(--space-md); text-align:center;">
        <div style="font-size:3rem; margin-bottom:12px;">🏆</div>
        <h3 style="color:var(--accent-green); margin-bottom:8px;">Harika Haber!</h3>
        <p style="font-size:0.85rem; color:var(--text-secondary);">Değerlendirilebilen besi hayvanlarının hiçbiri yem maliyetinin altında büyümüyor.</p>
      </div>
    `;
  }

  const items = cullingList.map(c => {
    const lossText = c.dailyLoss > 0 ? `-${c.dailyLoss.toFixed(2)} ₺ / gün` : 'Sağlık riski';
    return `
      <div class="culling-item">
        <div class="c-info">
          <span class="c-tag">${c.id} <small>(${c.type})</small></span>
          <span class="c-reason">Artış: ${c.adgGrams} g/gün · Yem: ${c.feedCostPerDay.toFixed(2)} ₺/gün · Tedavi: ${c.treatmentCount}</span>
        </div>
        <div class="c-loss">${lossText}</div>
      </div>
    `;
  }).join('');

  return `
    <div class="glass-card culling-list" style="margin:var(--space-md);">
      <div class="culling-header-info">Günlük getiri - Tüketim maliyeti analizi:</div>
      ${items}
    </div>
  `;
}
