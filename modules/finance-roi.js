/**
 * ShepherdAI — Ekonomik ROI Paneli
 */
import { getState } from '../core/state.js';
import { calculateAnimalROI, calculateDailyFeedCostPerHead } from '../core/financeEngine.js';
import { getPregnantAnimalIds } from '../core/breedingStatus.js';
import { showAlert } from '../core/modal.js';

let _container = null;
let _scope = 'HERD'; // Default to Herd view

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter finance-page';
  _container.style.paddingBottom = '110px';
  
  const state = getState();
  const currentMode = state.focusMode || 'meat';

  const sampleROI = calculateAnimalROI('HERD');
  if (!sampleROI) return _container;

  _container.innerHTML = `
    <div class="section-title"><span class="dot" style="background:#fbbf24"></span>Sürü Genel ROI Analizi</div>
    ${_renderHeader(sampleROI, 'HERD')}
    ${sampleROI.assumptions?.length ? `
      <p style="font-size:0.72rem; color:var(--text-muted); padding:0 var(--space-md); margin-top:6px; line-height:1.4;">
        ℹ️ Tahmini hesap. Varsayımlar: ${sampleROI.assumptions.join('; ')}.
      </p>` : ''}
    ${_renderFocusMetric(currentMode, state)}
    
    <div style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto; display:flex; gap:12px;">
      <button class="huge-btn btn-primary" id="btn-quick-sell" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem;">
        <span class="btn-icon">💰</span> Hızlı Satış
      </button>
    </div>
  `;
  return _container;
}

export function init() {
  const btnSell = _container.querySelector('#btn-quick-sell');
  if (btnSell) {
    btnSell.addEventListener('click', () => {
      showAlert('Hızlı Satış', '[SIM] Satış Modalı: Sürü bazlı toplu satış veya karkas fiyat analizini açar.', '💰');
    });
  }
}

function _renderHeader(roiData, testAnimalId) {
  const width = 120;
  const height = 40;
  const points = roiData.sparklineData;
  const min = Math.min(...points);
  const max = Math.max(...points);
  const range = max - min || 1;
  
  const stepX = width / (points.length - 1);
  const d = points.map((p, i) => {
    const x = i * stepX;
    const y = height - ((p - min) / range) * height;
    return `${i===0?'M':'L'} ${x} ${y}`;
  }).join(' ');

  const isProfit = roiData.profitLoss > 0;
  const colorClass = isProfit ? 'emerald-glow' : 'red-glow';
  const colorHex = isProfit ? '#10b981' : '#ef4444';

  return `
    <div class="fintech-header">
      <div class="fintech-header-top">
        <div>
          <h2 style="font-size:var(--font-size-md); font-weight:700; color:var(--text-primary)">
            ${testAnimalId === 'HERD' ? 'Toplam Sürü Bütçesi' : `Bireysel Analiz (${testAnimalId})`}
          </h2>
          <p style="font-size:var(--font-size-sm); color:var(--text-muted)">Tahmini Piyasa Değeri</p>
        </div>
        <div class="fintech-value ${colorClass}">
          ${(roiData.netValue || 0).toLocaleString('tr-TR')} ₺
        </div>
      </div>
      <div class="fintech-header-bottom">
        <div class="fintech-stats">
          <div class="stat-group">
            <span class="label">Net Kâr/Zarar</span>
            <span class="val ${isProfit?'text-emerald':'text-red'}">${roiData.profitLoss > 0 ? '+' : ''}${roiData.profitLoss.toLocaleString('tr-TR')} ₺</span>
          </div>
          <div class="stat-group">
            <span class="label">ROI</span>
            <span class="val ${isProfit?'text-emerald':'text-red'}">%${roiData.roiPercentage}</span>
          </div>
        </div>
        <div class="sparkline-container">
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <path d="${d}" fill="none" stroke="${colorHex}" stroke-width="2" vector-effect="non-scaling-stroke" />
            <path d="${d} L ${width} ${height} L 0 ${height} Z" fill="url(#sparkGradient)" stroke="none" opacity="0.2"/>
            <defs>
              <linearGradient id="sparkGradient" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${colorHex}" />
                <stop offset="100%" stop-color="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>
  `;
}

function _renderFocusMetric(mode, state) {
  // Odak grubunun baş başına günlük yem maliyeti (depodaki yem fiyatlarından)
  let title = '', filter, icon = '';
  if (mode === 'meat') { title = 'Besi Hayvanı Günlük Yem Maliyeti'; filter = a => a.group === 'Besi'; icon = '🥩'; }
  else if (mode === 'milk') { title = 'Sağmal Hayvan Günlük Yem Maliyeti'; filter = a => a.group === 'Sağmal'; icon = '🥛'; }
  else {
    const pregnant = new Set(getPregnantAnimalIds(state.animals, state.breedingRecords));
    title = 'Gebe Hayvan Günlük Yem Maliyeti'; filter = a => pregnant.has(a.id); icon = '🐑';
  }
  const calc = calculateDailyFeedCostPerHead(filter);
  const val = calc ? `${calc.perHead.toFixed(2)} ₺` : 'Hayvan yok';
  const sub = calc ? `/ baş / gün (${calc.headCount} baş)` : '';

  return `
    <div class="fintech-focus-card">
      <div class="focus-icon">${icon}</div>
      <div class="focus-details">
        <div class="f-title">${title} <span class="badge gold">ODAK</span></div>
        <div class="f-val">${val} <span class="f-sub">${sub}</span></div>
      </div>
    </div>
  `;
}
