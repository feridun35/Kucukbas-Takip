/**
 * ShepherdAI — Depo & Silo Yönetimi (Kapsamlı Yem Envanter & Fiyat Takibi)
 */
import { calculateSiloDepletion } from '../core/financeEngine.js';
import { showAlert, showSelect, showFormModal } from '../core/modal.js';
import { getState } from '../core/state.js';
import {
  getFeedCatalog,
  getFeedInventorySummary,
  getCurrentFeedPrice,
  addFeedStock,
  deductDailyHerdFeed,
  deductFeed,
  applyRation
} from '../core/feedManager.js';
import { FEED_DEDUCTION_REASONS } from '../data/feed-catalog.js';

let _container = null;
let _viewMode = 'inventory'; // 'inventory' | 'ration' | 'history'

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter finance-page';
  _container.style.paddingBottom = '180px';
  
  const state = getState();
  const feedInventory = state.feedInventory || [];
  const { totalKg, totalValue: totalVal } = getFeedInventorySummary(feedInventory);
  
  const dailyConsumption = state.financeSummary?.dailyFeedKg || 0;
  const siloData = calculateSiloDepletion(totalKg, dailyConsumption);

  _container.innerHTML = `
    <div class="section-title"><span class="dot" style="background:#10b981"></span>Yem Deposu & Envanter</div>
    
    <!-- Toplam Özet Kartı -->
    <div class="glass-card" style="margin-bottom:var(--space-md);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted);">Toplam Yem Stoku</div>
          <div style="font-size:1.6rem; font-weight:800; color:var(--text-primary);">${totalKg.toLocaleString('tr-TR')} kg</div>
          <div style="font-size:0.8rem; font-weight:700; color:var(--accent-green); margin-top:2px;">Toplam Değer: ${totalVal.toLocaleString('tr-TR')} ₺</div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.75rem; color:var(--text-muted);">Tahmini Yetme Süresi</div>
          <div style="font-size:1.2rem; font-weight:700; color:${siloData.isLowStock ? 'var(--danger-red)' : 'var(--accent-green)'};">
            ${dailyConsumption > 0 ? siloData.daysLeft + ' Gün' : (totalKg > 0 ? 'Sürü Boş' : 'Stok Yok')}
          </div>
        </div>
      </div>
      <div class="silo-bar-container" style="height:8px; border-radius:4px; background:rgba(255,255,255,0.05);">
        <div style="height:100%; border-radius:4px; width:${Math.min((totalKg / 10000) * 100, 100)}%; background:${siloData.isLowStock ? '#f59e0b' : '#10b981'}; transition:width 0.4s;"></div>
      </div>
      <div style="font-size:0.7rem; color:var(--text-muted); margin-top:6px;">Sürü Günlük Tüketimi (Matematiksel): <strong>${dailyConsumption} kg/gün</strong></div>
    </div>

    <!-- Sekme Geçişi -->
    ${_renderViewTabs()}

    <!-- İçerik -->
    ${_viewMode === 'inventory' ? _renderInventoryList(feedInventory) : ''}
    ${_viewMode === 'ration' ? _renderRationBuilder(feedInventory) : ''}
    ${_viewMode === 'history' ? _renderHistory() : ''}

    <!-- Çift Alt Buton: Giriş ve Düşüş -->
    <div class="tasks-fixed-bottom" style="display:flex; gap:10px;">
      <button class="huge-btn btn-primary" id="btn-feed-entry" style="flex:1; background:var(--accent-green); box-shadow:0 4px 16px rgba(34,197,94,0.4);">
        <span class="btn-icon">📥</span> Yem Girişi (Fiyatlı)
      </button>
      <button class="huge-btn btn-secondary" id="btn-feed-deduct" style="flex:1; background:rgba(245,158,11,0.2); color:var(--warning-orange); border:1px solid rgba(245,158,11,0.4);">
        <span class="btn-icon">📤</span> Stoktan Yem Düş
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

  // 1) Yem Girişi Yap (Fiyatlı)
  const btnFeed = _container.querySelector('#btn-feed-entry');
  if (btnFeed) {
    btnFeed.addEventListener('click', async () => {
      const catalog = getFeedCatalog();
      const feedInventory = getState().feedInventory || [];

      const feedOptions = catalog.map(cat => {
        const existing = feedInventory.find(f => f.id === cat.id);
        return {
          value: cat.id,
          label: `${cat.icon} ${cat.name} (Stok: ${existing ? existing.amount : 0} ${cat.unit} · ${getCurrentFeedPrice(cat.id)} ₺/${cat.unit})`,
          color: existing ? '#10b981' : '#3b82f6'
        };
      });

      const selectedFeed = await showSelect('Yem Türü Seçin', feedOptions, '🌾');
      if (!selectedFeed) return;

      const catItem = catalog.find(c => c.id === selectedFeed.value);
      const form = await showFormModal(`${catItem.icon} Stoğa Yem Girişi (${catItem.name})`, [
        { id: 'amount', label: `Eklenecek Miktar (${catItem.unit})`, type: 'number', placeholder: 'Örn: 500' },
        { id: 'unitPrice', label: `Birim Fiyat (₺/${catItem.unit})`, type: 'number', value: getCurrentFeedPrice(catItem.id), placeholder: 'Örn: 7.5' },
        { id: 'note', label: 'Tedarikçi / Not (Opsiyonel)', type: 'text', placeholder: 'Örn: Toprak Mahsulleri / 10 çuval' }
      ], '📥');
      if (!form) return;

      const result = addFeedStock({ feedId: catItem.id, amount: form.amount, unitPrice: form.unitPrice, note: form.note });
      if (!result.success) {
        await showAlert('Giriş Yapılamadı', result.message, '⚠️');
        return;
      }
      await showAlert('Stok Girişi Başarılı', result.message, '✅');
      _rerender();
    });
  }

  // 2) Stoktan Yem Düş (Deduction)
  const btnDeduct = _container.querySelector('#btn-feed-deduct');
  if (btnDeduct) {
    btnDeduct.addEventListener('click', async () => {
      const state = getState();
      const feedInventory = state.feedInventory || [];
      const dailyConsumption = state.financeSummary?.dailyFeedKg || 0;

      if (feedInventory.length === 0) {
        showAlert('Stok Yok', 'Düşüş yapmak için depoda kayıtlı yem stoğu bulunmalıdır.', '⚠️');
        return;
      }

      const modeOpts = [
        { value: 'AUTO_DAILY', label: `⚡ Günlük Sürü Yemlemesini Düş (${dailyConsumption} kg)`, color: '#f59e0b' },
        { value: 'MANUAL', label: '📦 Özel Yem Çıkışı / Kullanım Kaydet', color: '#3b82f6' }
      ];

      const choice = await showSelect('Stoktan Düşme Yöntemi', modeOpts, '📤');
      if (!choice) return;

      if (choice.value === 'AUTO_DAILY') {
        const result = deductDailyHerdFeed();
        if (!result.success) {
          showAlert(result.reason === 'empty-herd' ? 'Sürü Boş' : 'Stok Yetersiz', result.message, '⚠️');
          return;
        }
        await showAlert('Yemle Düşüldü', result.message, '✅');
        _rerender();
        return;
      }

      // Manuel yem çıkışı
      const feedOpts = feedInventory.map(f => ({
        value: f.id,
        label: `${f.icon} ${f.name} (Stok: ${f.amount} ${f.unit})`,
        color: '#f59e0b'
      }));

      const selFeed = await showSelect('Çıkış Yapılacak Yem', feedOpts, '📦');
      if (!selFeed) return;

      const targetFeed = feedInventory.find(f => f.id === selFeed.value);
      const form = await showFormModal(`Stoktan Düş (${targetFeed.name})`, [
        { id: 'amount', label: `Düşülecek Miktar (${targetFeed.unit})`, type: 'number', placeholder: `Mevcut: ${targetFeed.amount}` },
        { id: 'reason', label: 'Çıkış Sebebi', type: 'select', options: FEED_DEDUCTION_REASONS },
        { id: 'note', label: 'Not (Opsiyonel)', type: 'text', placeholder: 'Örn: Bölme 1 yemliği' }
      ], '📤');
      if (!form) return;

      const result = deductFeed({ feedId: targetFeed.id, amount: form.amount, reason: form.reason, note: form.note });
      if (!result.success) {
        await showAlert('Düşüş Yapılamadı', result.message, '⚠️');
        return;
      }
      await showAlert('Stoktan Düşüldü', result.message, '✅');
      _rerender();
    });
  }

  // Rasyon kaydet & stoktan düş
  const btnRation = _container.querySelector('#btn-save-ration');
  if (btnRation) {
    btnRation.addEventListener('click', async () => {
      const amounts = {};
      _container.querySelectorAll('.ration-input').forEach(input => {
        amounts[input.getAttribute('data-feed-id')] = input.value;
      });

      const result = applyRation(amounts);
      if (!result.success) {
        showAlert('Uyarı', result.message, '⚠️');
        return;
      }
      showAlert('Rasyon Kaydedildi', result.message, '✅');
      _rerender();
    });
  }
}

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderViewTabs() {
  const tabs = [
    { id: 'inventory', label: '📦 Stok & Fiyatlar', active: _viewMode === 'inventory' },
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
  if (!feedInventory || feedInventory.length === 0) {
    return `
      <div class="section-title" style="margin-top:0;"><span class="dot" style="background:var(--accent-blue)"></span>Yem Türleri Detayı</div>
      <div class="glass-card" style="text-align:center; padding:32px 16px; color:var(--text-muted); border-radius:18px;">
        <span style="font-size:2.5rem; display:block; margin-bottom:8px;">🌾</span>
        <div style="font-weight:600; color:var(--text-primary); margin-bottom:4px;">Henüz kayıtlı yem stoku bulunmuyor</div>
        <p style="font-size:0.75rem; color:var(--text-secondary);">Aşağıdaki 'Yem Girişi' butonuna tıklayarak ilk yem stoğunuzu ekleyebilirsiniz.</p>
      </div>
    `;
  }

  const items = feedInventory.map(f => {
    const maxRef = f.id === 'yalama' ? 20 : f.id === 'mineral' ? 50 : 2000;
    const pct = Math.min((f.amount / maxRef) * 100, 100);
    const isLow = pct < 20;
    const barColor = isLow ? '#ef4444' : pct < 40 ? '#f59e0b' : '#10b981';

    const unitP = f.unitPrice || 0;
    const itemTotalVal = f.amount * unitP;

    return `
      <div class="glass-card" style="padding:12px 16px; margin-bottom:8px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.3rem;">${f.icon}</span>
            <div>
              <div style="font-weight:600; font-size:0.9rem; color:var(--text-primary);">${f.name}</div>
              <div style="font-size:0.7rem; color:var(--accent-green); font-weight:600;">
                ${unitP > 0 ? `${unitP} ₺/${f.unit} · Toplam: ${itemTotalVal.toLocaleString('tr-TR')} ₺` : 'Fiyat Girilmemiş'}
              </div>
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
    <div class="section-title" style="margin-top:0;"><span class="dot" style="background:var(--accent-blue)"></span>Yem Türleri Detayı & Fiyatlar</div>
    ${items}
  `;
}

function _renderRationBuilder(feedInventory) {
  const kgFeeds = (feedInventory || []).filter(f => f.unit === 'kg');
  if (kgFeeds.length === 0) {
    return `
      <div class="section-title" style="margin-top:0;"><span class="dot" style="background:var(--accent-amber)"></span>Rasyon Oluştur</div>
      <div class="glass-card" style="text-align:center; padding:32px 16px; color:var(--text-muted); border-radius:18px;">
        <span style="font-size:2rem; display:block; margin-bottom:8px;">🥣</span>
        <p style="font-size:0.85rem; color:var(--text-secondary);">Rasyon hazırlamak için önce depoya yem stoğu ekleyiniz.</p>
      </div>
    `;
  }

  const rows = kgFeeds.map(f => `
    <div style="display:flex; align-items:center; gap:8px; margin-bottom:10px; padding:10px 14px; background:var(--glass-bg); border-radius:12px; border:1px solid var(--glass-border);">
      <span style="font-size:1.2rem; width:28px;">${f.icon}</span>
      <div style="flex:1;">
        <div style="font-size:0.85rem; font-weight:600; color:var(--text-primary);">${f.name}</div>
        <div style="font-size:0.65rem; color:var(--text-muted);">Mevcut: ${f.amount} kg · ${f.unitPrice || 0} ₺/kg</div>
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
    const totalTL = h.totalPrice || (h.amount * (h.unitPrice || 0));

    return `
      <div class="glass-card" style="padding:10px 14px; margin-bottom:6px; border-left:4px solid ${isEntry ? '#10b981' : '#f59e0b'};">
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <div style="font-weight:600; font-size:0.85rem; color:var(--text-primary);">
              ${isEntry ? '📥 Giriş' : '📤 Çıkış (Düşüş)'}: ${h.feedName}
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
              ${h.date} ${h.note ? '· ' + h.note : ''}
            </div>
          </div>
          <div style="text-align:right;">
            <div style="font-size:1rem; font-weight:700; color:${isEntry ? 'var(--accent-green)' : 'var(--accent-amber)'};">
              ${isEntry ? '+' : '-'}${h.amount}
            </div>
            ${totalTL > 0 ? `<div style="font-size:0.65rem; color:var(--text-muted);">${totalTL.toLocaleString('tr-TR')} ₺</div>` : ''}
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
  if (!_container || !_container.parentNode) return;
  const parent = _container.parentNode;
  const scrollPos = window.scrollY;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
  window.scrollTo(0, scrollPos);
}
