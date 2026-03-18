/**
 * ShepherdAI — İlaç & Karantina (Satış Yasağı) Modülü
 */
import { showAlert, showPrompt } from '../core/modal.js';
import { getState, setState } from '../core/state.js';

let _container = null;

const withdrawalData = {
  active: true,
  drug: 'Oksitetrasiklin %20',
  meatSafeIn: 28,
  milkSafeIn: 7
};

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';
  _container.style.paddingBottom = '110px';
  
  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:#ef4444;"></span>İlaç Uygulama & Arınma Takibi</div>
    ${_renderWithdrawalCard()}
    
    <div style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto;">
      <button class="huge-btn btn-primary" id="btn-give-meds" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; background:var(--accent-red); box-shadow:0 4px 16px rgba(239,68,68,0.4);">
        <span class="btn-icon">💉</span> Yeni İlaç Uygula
      </button>
    </div>
  `;
  return _container;
}

export function init() {
  const btnMeds = _container.querySelector('#btn-give-meds');
  if (btnMeds) {
    btnMeds.addEventListener('click', async () => {
      const vName = await showPrompt('Toplu İlaç Uygula', 'Tüm Sürü için uygulanacak ilaç/aşıyı yazın:', 'text', '💊');
      if (vName) {
        const state = getState();
        const newV = {
          id: Date.now(),
          name: vName,
          date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'done',
          target: 'Tüm Sürü'
        };
        setState({ vaccines: [newV, ...(state.vaccines || [])] });
        showAlert('Başarılı', `Tüm sürüye ${vName} uygulandı ve Aşı Ajandasına kaydedildi.`, '✅');
      }
    });
  }
}

function _renderWithdrawalCard() {
  return `
    <div class="glass-card withdrawal-card" style="margin:var(--space-md); border:1px solid rgba(239,68,68,0.3);">
      <div class="withdrawal-header">
        <span class="warning-icon">⛔</span>
        <strong>SÜRÜ GENELİ KARANTİNA (2 Hayvan)</strong>
      </div>
      <div class="withdrawal-body">
        <div style="margin-bottom:12px; font-size:0.85rem; padding:10px; background:rgba(239,68,68,0.1); border-radius:8px; border-left:3px solid var(--danger-red);">
          <strong>TR-088</strong> &nbsp;&bull;&nbsp; Oksitetrasiklin %20<br>
          <span class="text-red">Et Tüketimi İçin: 28 Gün | Süt: 7 Gün</span>
        </div>
        <div style="font-size:0.85rem; padding:10px; background:rgba(239,68,68,0.1); border-radius:8px; border-left:3px solid var(--warning-orange);">
          <strong>TR-099</strong> &nbsp;&bull;&nbsp; Penisilin G<br>
          <span class="text-orange">Et Tüketimi İçin: 14 Gün | Süt: 4 Gün</span>
        </div>
      </div>
    </div>
  `;
}
