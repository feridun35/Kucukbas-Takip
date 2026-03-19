/**
 * ShepherdAI — Depo & Silo Yönetimi (Kapsamlı Yem Envanter)
 */
import { inventoryData } from '../data/mock-data.js';
import { calculateSiloDepletion } from '../core/financeEngine.js';
import { showAlert, showPrompt, showSelect } from '../core/modal.js';
import { getState, setState } from '../core/state.js';

let _container = null;
let _viewMode = 'inventory'; // 'inventory' | 'ration' | 'history'

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter finance-page';
  _container.style.paddingBottom = '180px';
  
  const state = getState();
  const feedInventory = state.feedInventory || [];
  const totalKg = feedInventory.filter(f => f.unit === 'kg').reduce((sum, f) => sum + f.amount, 0);
  const siloData = calculateSiloDepletion(totalKg, inventoryData.dailyHerdConsumption);

  _container.innerHTML = `
    <div class="section-title"><span class="dot" style="background:#10b981"></span>Yem Deposu & Envanter</div>
    
    <!-- Toplam özet -->
    <div class="glass-card" style="margin-bottom:var(--space-md);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted);">Toplam Yem Stoku</div>
          <div style="font-size:1.6rem; font-weight:800; color:var(--text-primary);">${totalKg.toLocaleString('tr-TR')} kg</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem; color:var(--text-muted);">Tahmini Yetme Süresi</div>
          <div style="font-size:1.2rem; font-weight:700; color:${siloData.isLowStock ? 'var(--danger-red)' : 'var(--accent-green)'};">${siloData.daysLeft} Gün</div>
        </div>
      </div>
      <div class="silo-bar-container" style="height:8px; border-radius:4px; background:rgba(255,255,255,0.05);">
        <div style="height:100%; border-radius:4px; width:${Math.min((totalKg / 10000) * 100, 100)}%; background:${siloData.isLowStock ? '#f59e0b' : '#10b981'}; transition:width 0.4s;"></div>
      </div>
      <div style="font-size:0.7rem; color:var(--text-muted); margin-top:6px;">Günlük tüketim: ${inventoryData.dailyHerdConsumption} kg/gün</div>
    </div>

    <!-- Sekme Geçişi -->
    ${_renderViewTabs()}

    <!-- İçerik -->
    ${_viewMode === 'inventory' ? _renderInventoryList(feedInventory) : ''}
    ${_viewMode === 'ration' ? _renderRationBuilder(feedInventory) : ''}
    ${_viewMode === 'history' ? _renderHistory() : ''}

    <!-- Butonlar -->
    <div class="tasks-fixed-bottom">
      <button class="huge-btn btn-primary" id="btn-feed-entry" style="background:var(--accent-green); box-shadow:0 4px 16px rgba(34,197,94,0.4);">
        <span class="btn-icon">➕</span> Yem Girişi Yap
      </button>
    </div>
  `;
  return _container;
}

export function init() {
  if (!_container) return;

  // Sekme geçişleri
  _container.querySelector('#btn-tab-inventory')?.addEventListener('click', () => { _viewMode = 'inventory'; _rerender(); });
  _container.querySelector('#btn-tab-ration')?.addEventListener('click', () => { _viewMode = 'ration'; _rerender(); });
  _container.querySelector('#btn-tab-history')?.addEventListener('click', () => { _viewMode = 'history'; _rerender(); });

  // Yem Girişi
  const btnFeed = _container.querySelector('#btn-feed-entry');
  if (btnFeed) {
    btnFeed.addEventListener('click', async () => {
      const state = getState();
      const feedInventory = [...(state.feedInventory || [])];

      // 1. Hangi yem? (showSelect ile)
      const feedOptions = feedInventory.map(f => ({
        value: f.id, label: `${f.icon} ${f.name} (Mevcut: ${f.amount} ${f.unit})`, color: '#10b981'
      }));
      const selectedFeed = await showSelect('Yem Türü Seçin', feedOptions, '🌾');
      if (!selectedFeed) return;

      // 2. Miktar
      const feed = feedInventory.find(f => f.id === selectedFeed.value);
      const amountStr = await showPrompt('Miktar', `${feed.name} için eklenecek miktarı (${feed.unit}) giriniz:`, 'number', feed.icon);
      if (!amountStr || isNaN(amountStr)) return;
      const amount = parseInt(amountStr);

      // 3. Not
      const note = await showPrompt('Not', 'Ekleme notu (opsiyonel, örn: 3 çuval):', 'text', '📝') || '';

      // Güncelle
      const idx = feedInventory.findIndex(f => f.id === selectedFeed.value);
      if (idx > -1) {
        feedInventory[idx] = { ...feedInventory[idx], amount: feedInventory[idx].amount + amount };
      }

      // History kaydı
      const feedHistory = [...(state.feedHistory || [])];
      feedHistory.unshift({
        id: 'FH-' + Date.now(),
        feedId: feed.id,
        feedName: feed.name,
        amount,
        type: 'entry',
        date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
        note
      });

      setState({ feedInventory, feedHistory });
      showAlert('Başarılı', `${feed.name} stokuna ${amount} ${feed.unit} eklendi.`, '✅');
      _rerender();
    });
  }

  // Rasyon kaydet
  const btnRation = _container.querySelector('#btn-save-ration');
  if (btnRation) {
    btnRation.addEventListener('click', async () => {
      const inputs = _container.querySelectorAll('.ration-input');
      const state = getState();
      const feedInventory = [...(state.feedInventory || [])];
      const feedHistory = [...(state.feedHistory || [])];
      let totalUsed = 0;

      inputs.forEach(input => {
        const val = parseInt(input.value) || 0;
        if (val > 0) {
          const feedId = input.getAttribute('data-feed-id');
          const idx = feedInventory.findIndex(f => f.id === feedId);
          if (idx > -1) {
            const available = feedInventory[idx].amount;
            const use = Math.min(val, available);
            feedInventory[idx] = { ...feedInventory[idx], amount: available - use };
            totalUsed += use;

            feedHistory.unshift({
              id: 'FH-' + Date.now() + '-' + feedId,
              feedId,
              feedName: feedInventory[idx].name,
              amount: use,
              type: 'ration',
              date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
              note: 'Günlük rasyon'
            });
          }
        }
      });

      if (totalUsed === 0) {
        showAlert('Uyarı', 'Rasyon için en az bir yem miktarı giriniz.', '⚠️');
        return;
      }

      setState({ feedInventory, feedHistory });
      showAlert('Rasyon Kaydedildi', `Toplam ${totalUsed} kg/adet yem rasyon olarak kullanıldı ve stoktan düşüldü.`, '✅');
      _rerender();
    });
  }
}

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderViewTabs() {
  const tabs = [
    { id: 'inventory', label: '📦 Stok', active: _viewMode === 'inventory' },
    { id: 'ration', label: '🥣 Rasyon', active: _viewMode === 'ration' },
    { id: 'history', label: '📜 Geçmiş', active: _viewMode === 'history' }
  ];
  return `
    <div style="display:flex; gap:6px; margin-bottom:var(--space-md);">
      ${tabs.map(t => `
        <button id="btn-tab-${t.id}" style="flex:1; padding:10px; border-radius:12px; border:none; font-weight:600; cursor:pointer; transition:0.2s; font-size:0.85rem;
          background:${t.active ? 'var(--accent-blue)' : 'var(--glass-bg)'}; color:${t.active ? '#fff' : 'var(--text-muted)'};">
          ${t.label}
        </button>
      `).join('')}
    </div>
  `;
}

function _renderInventoryList(feedInventory) {
  const items = feedInventory.map(f => {
    const maxRef = f.id === 'yalama' ? 20 : f.id === 'mineral' ? 50 : 2000;
    const pct = Math.min((f.amount / maxRef) * 100, 100);
    const isLow = pct < 20;
    const barColor = isLow ? '#ef4444' : pct < 40 ? '#f59e0b' : '#10b981';

    return `
      <div class="glass-card" style="padding:12px 16px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.3rem;">${f.icon}</span>
            <div>
              <div style="font-weight:600; font-size:0.9rem; color:var(--text-primary);">${f.name}</div>
              ${isLow ? '<span style="font-size:0.6rem; background:rgba(239,68,68,0.2); color:var(--danger-red); padding:1px 6px; border-radius:6px;">DÜŞÜK</span>' : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1.1rem; font-weight:700; color:var(--text-primary);">${f.amount.toLocaleString('tr-TR')}</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">${f.unit}</div>
          </div>
        </div>
        <div style="height:5px; border-radius:3px; background:rgba(255,255,255,0.05);">
          <div style="height:100%; border-radius:3px; width:${pct}%; background:${barColor}; transition:width 0.3s;"></div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="section-title" style="margin-top:0;"><span class="dot" style="background:var(--accent-blue)"></span>Yem Türleri Detayı</div>
    ${items}
  `;
}

function _renderRationBuilder(feedInventory) {
  const rows = feedInventory.filter(f => f.unit === 'kg').map(f => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding:10px 14px; background:var(--glass-bg); border-radius:12px; border:1px solid var(--glass-border);">
      <span style="font-size:1.2rem; width:28px;">${f.icon}</span>
      <div style="flex:1;">
        <div style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">${f.name}</div>
        <div style="font-size:0.65rem; color:var(--text-muted);">Mevcut: ${f.amount} kg</div>
      </div>
      <input type="number" class="ration-input c-modal-input" data-feed-id="${f.id}" placeholder="0" min="0" max="${f.amount}"
        style="width:80px; text-align:center; border-radius:8px; padding:8px; font-size:0.9rem; font-weight:600; border:1px solid var(--glass-border); background:rgba(0,0,0,0.2); color:var(--text-primary);" />
      <span style="font-size:0.75rem; color:var(--text-muted);">kg</span>
    </div>
  `).join('');

  return `
    <div class="section-title" style="margin-top:0;"><span class="dot" style="background:var(--accent-amber)"></span>Rasyon Oluştur</div>
    <div class="glass-card" style="padding:var(--space-md); margin-bottom:var(--space-md);">
      <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:12px;">Her yem için günlük rasyon miktarını girin. Kaydet butonuyla stoktan düşülecektir.</p>
      ${rows}
      <button class="btn-primary" id="btn-save-ration" style="width:100%; border-radius:16px; padding:14px; margin-top:8px; font-size:1rem; font-weight:700; box-shadow:0 4px 16px rgba(245,158,11,0.3); background:var(--accent-amber);">
        🥣 Rasyonu Kaydet & Stoktan Düş
      </button>
    </div>
  `;
}

function _renderHistory() {
  const state = getState();
  const history = state.feedHistory || [];

  if (history.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:var(--space-xl); color:var(--text-muted);">
        <p style="font-size:2rem; margin-bottom:8px;">📭</p>
        <p>Henüz yem hareketi kaydı yok.</p>
      </div>
    `;
  }

  const items = history.map(h => {
    const isEntry = h.type === 'entry';
    return `
      <div class="glass-card" style="padding:10px 14px; margin-bottom:6px; border-left:4px solid ${isEntry ? '#10b981' : '#f59e0b'};">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">
              ${isEntry ? '📥' : '📤'} ${h.feedName}
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
              ${h.date} ${h.note ? '· ' + h.note : ''} · ${isEntry ? 'Stok Girişi' : 'Rasyon Çıkışı'}
            </div>
          </div>
          <div style="font-size:1rem; font-weight:700; color:${isEntry ? 'var(--accent-green)' : 'var(--accent-amber)'};">
            ${isEntry ? '+' : '-'}${h.amount}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="section-title" style="margin-top:0;"><span class="dot" style="background:var(--accent-purple)"></span>Yem Hareket Geçmişi</div>
    ${items}
  `;
}

function _rerender() {
  const parent = _container.parentNode;
  const scrollPos = window.scrollY;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
  window.scrollTo(0, scrollPos);
}
