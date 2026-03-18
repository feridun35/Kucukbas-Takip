/**
 * ShepherdAI — Depo & Silo Yönetimi
 */
import { inventoryData } from '../data/mock-data.js';
import { calculateSiloDepletion } from '../core/financeEngine.js';
import { showAlert, showPrompt } from '../core/modal.js';
import { getState, setState } from '../core/state.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter finance-page';
  _container.style.paddingBottom = '110px';
  
  const state = getState();
  const currentFeed = state.financeSummary.feedStock > 0 ? state.financeSummary.feedStock : inventoryData.siloCurrentAmount;
  const siloData = calculateSiloDepletion(currentFeed, inventoryData.dailyHerdConsumption);

  _container.innerHTML = `
    <div class="section-title"><span class="dot" style="background:#10b981"></span>Silo ve Yem Envanteri</div>
    ${_renderInventory(siloData)}
    
    <div style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto; display:flex; gap:12px;">
      <button class="huge-btn btn-secondary-deep" id="btn-feed-entry" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem;">
        <span class="btn-icon">🌾</span> Yem Girişi Ekle
      </button>
    </div>
  `;
  return _container;
}

export function init() {
  const btnFeed = _container.querySelector('#btn-feed-entry');
  if (btnFeed) {
    btnFeed.addEventListener('click', async () => {
      const kgStr = await showPrompt('Yem Stok Girişi', 'Siloya eklenecek yeni yem miktarını (kg) giriniz:', 'number', '🌾');
      if (kgStr && !isNaN(kgStr)) {
        const amount = parseInt(kgStr);
        const state = getState();
        const currentFeed = state.financeSummary.feedStock > 0 ? state.financeSummary.feedStock : inventoryData.siloCurrentAmount;
        
        setState({
          financeSummary: {
            ...state.financeSummary,
            feedStock: currentFeed + amount
          }
        });
        
        // Re-render
        const parent = _container.parentNode;
        const scrollPos = window.scrollY;
        parent.innerHTML = '';
        parent.appendChild(render());
        init();
        window.scrollTo(0, scrollPos);
        
        showAlert('Başarılı', `Siloya ${amount} kg yem eklendi.`, '✅');
      }
    });
  }
}

function _renderInventory(siloData) {
  const state = getState();
  const currentFeed = state.financeSummary.feedStock > 0 ? state.financeSummary.feedStock : inventoryData.siloCurrentAmount;
  const percent = Math.min((currentFeed / inventoryData.siloTotalCapacity) * 100, 100);
  const isLow = siloData.isLowStock;
  const barColor = isLow ? '#f59e0b' : '#3b82f6';
  const dateStr = siloData.depletionDate ? siloData.depletionDate.toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) : '-';

  return `
    <div class="glass-card silo-card">
      <div class="silo-header">
        <span class="s-title">Mevcut Yem <small>(${inventoryData.siloCurrentAmount.toLocaleString()} kg)</small></span>
        ${isLow ? '<span class="s-badge warning">Düşük Stok</span>' : ''}
      </div>
      <div class="silo-bar-container">
        <div class="silo-bar" style="width:${percent}%; background:${barColor}"></div>
      </div>
      <div class="silo-footer">
        <div>
          <div class="f-label">Günlük Tüketim</div>
          <div class="f-val">${inventoryData.dailyHerdConsumption} kg/gün</div>
        </div>
        <div style="text-align:right">
          <div class="f-label">Tahmini Bitiş</div>
          <div class="f-val ${isLow ? 'text-warning' : 'text-emerald'}">${siloData.daysLeft} Gün (${dateStr})</div>
        </div>
      </div>
    </div>
  `;
}
