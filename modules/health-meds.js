/**
 * ShepherdAI — İlaç, Ecza Deposu & Arınma Takip Modülü
 * 
 * Mevcut health-meds sayfası; ecza deposu stok yönetimi,
 * tedavi geçmişi ve arınma takibini tek ekranda birleştirir.
 * Tüm iş mantığı core/healthManager.js'den çağrılır.
 */
import { showAlert, showFormModal, showSelect, showConfirm } from '../core/modal.js';
import { getState, setState } from '../core/state.js';
import {
  getAllMedications,
  getAllQuarantinedAnimals,
  getAvailableStock,
  addPharmacyStock,
  markStockAsWaste,
  getCriticalStocks,
  addCustomMedication
} from '../core/healthManager.js';
import { MED_CATEGORIES, ADMIN_ROUTES } from '../data/med-library.js';
import { openTreatmentModal } from './treatment-modal.js';

let _container = null;
let _viewTab = 'stock'; // 'stock' | 'quarantine' | 'history' | 'library'

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';
  _container.style.paddingBottom = '140px';

  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);">
      <span class="dot" style="background:#ef4444;"></span>Ecza Deposu & Tedavi Takibi
    </div>

    <!-- Sekme Çubuğu -->
    <div class="med-tabs" style="display:flex; gap:6px; margin:0 var(--space-md) var(--space-md); overflow-x:auto; scrollbar-width:none; padding-bottom:4px;">
      ${_renderTabBtn('stock', '📦 Stok', '#3b82f6')}
      ${_renderTabBtn('quarantine', '🛑 Karantina', '#ef4444')}
      ${_renderTabBtn('history', '📋 Geçmiş', '#a855f7')}
      ${_renderTabBtn('library', '📖 Kütüphane', '#f59e0b')}
    </div>

    <!-- İçerik -->
    <div id="med-content" style="padding:0 var(--space-md);">
      ${_renderActiveTab()}
    </div>

    <!-- Sabit Alt Butonlar -->
    <div style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto;">
      <button class="huge-btn btn-primary" id="btn-new-treatment" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; background:var(--accent-red); box-shadow:0 4px 16px rgba(239,68,68,0.4); margin-bottom:12px;">
        <span class="btn-icon">💉</span> Yeni Tedavi Uygula
      </button>
      <button class="huge-btn btn-secondary" id="btn-add-stock" style="width:100%; border-radius:20px; padding:14px; font-size:0.95rem;">
        <span class="btn-icon">📦</span> Stok Ekle / Yeni İlaç Girişi
      </button>
    </div>
  `;
  return _container;
}

export function init() {
  if (!_container) return;

  // Sekme tıklamaları
  _container.querySelectorAll('.med-tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      _viewTab = btn.dataset.tab;
      _rerender();
    });
  });

  // Yeni Tedavi Uygula
  const btnTreat = _container.querySelector('#btn-new-treatment');
  if (btnTreat) {
    btnTreat.addEventListener('click', async () => {
      const result = await openTreatmentModal();
      if (result.applied) _rerender();
    });
  }

  // Stok Ekle
  const btnStock = _container.querySelector('#btn-add-stock');
  if (btnStock) {
    btnStock.addEventListener('click', async () => {
      await _showAddStockFlow();
      _rerender();
    });
  }

  // Zayi butonları
  _container.querySelectorAll('.btn-waste-stock').forEach(btn => {
    btn.addEventListener('click', async () => {
      const stockId = btn.dataset.stockId;
      const confirmed = await showConfirm(
        'Flakon Zayi Et',
        'Bu flakon/partinin kalan miktarını zayi olarak işaretlemek istiyor musunuz?\n\nAçılmış flakonlarda raf ömrü dolmuş olabilir.',
        '🗑️'
      );
      if (confirmed) {
        const result = markStockAsWaste(stockId, 'Flakon Zayi — Açık Raf Ömrü');
        await showAlert('Zayi Kaydedildi', result.message, '✅');
        _rerender();
      }
    });
  });

  // Kütüphane — Yeni İlaç Ekle
  const btnAddMed = _container.querySelector('#btn-add-custom-med');
  if (btnAddMed) {
    btnAddMed.addEventListener('click', async () => {
      await _showAddMedicationFlow();
      _rerender();
    });
  }
}

// ═══════════════════════════════════════
// Sekmeli İçerik
// ═══════════════════════════════════════

function _renderTabBtn(tab, label, color) {
  const isActive = _viewTab === tab;
  return `<button class="med-tab-btn" data-tab="${tab}" style="
    flex:none; padding:8px 16px; border-radius:16px; border:none; font-weight:600;
    font-size:0.8rem; cursor:pointer; transition:0.2s; white-space:nowrap;
    background:${isActive ? color : 'var(--glass-bg)'};
    color:${isActive ? '#fff' : 'var(--text-secondary)'};
    box-shadow:${isActive ? `0 2px 10px ${color}44` : 'none'};
  ">${label}</button>`;
}

function _renderActiveTab() {
  switch (_viewTab) {
    case 'stock': return _renderStockTab();
    case 'quarantine': return _renderQuarantineTab();
    case 'history': return _renderHistoryTab();
    case 'library': return _renderLibraryTab();
    default: return _renderStockTab();
  }
}

// ── STOK SEKMESİ ──
function _renderStockTab() {
  const state = getState();
  const stocks = state.pharmacyStock || [];
  const meds = getAllMedications();
  const criticals = getCriticalStocks();
  const now = new Date();

  if (stocks.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:40px 20px;">
        <div style="font-size:3rem; margin-bottom:12px;">📦</div>
        <h3 style="font-size:1rem; color:var(--text-primary); margin-bottom:8px;">Ecza Deposu Boş</h3>
        <p style="font-size:0.85rem; color:var(--text-muted);">Aşağıdaki "Stok Ekle" butonuyla ilk ilaç stoğunuzu girin.</p>
      </div>
    `;
  }

  // Kritik uyarı banner
  let criticalBanner = '';
  if (criticals.length > 0) {
    const critList = criticals.map(c => `<strong>${c.medicationName}</strong>: ${c.remaining} ${c.unit}`).join(' · ');
    criticalBanner = `
      <div class="glass-card" style="border:1px solid rgba(239,68,68,0.4); background:rgba(239,68,68,0.06); padding:12px 16px; margin-bottom:var(--space-md); border-radius:16px;">
        <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
          <span style="font-size:1.2rem;">⚠️</span>
          <strong style="font-size:0.85rem; color:var(--danger-red);">Kritik Stok Uyarısı</strong>
        </div>
        <p style="font-size:0.75rem; color:var(--text-secondary); margin:0;">${critList}</p>
      </div>
    `;
  }

  // Stok kartları
  const validStocks = stocks.filter(s => s.remainingQuantity > 0);
  const cards = validStocks.map(s => {
    const med = meds.find(m => m.id === s.medicationId);
    const medName = med?.name || s.medicationId;
    const pct = s.totalQuantity > 0 ? Math.round((s.remainingQuantity / s.totalQuantity) * 100) : 0;
    const isCritical = s.remainingQuantity <= (s.criticalThreshold || 20);
    const isExpiringSoon = new Date(s.expiryDate) < new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);
    const expiredAlready = new Date(s.expiryDate) <= now;

    // Açık flakon raf ömrü kontrolü
    let shelfWarning = '';
    if (s.openedDate && med?.openVialShelfLifeDays) {
      const openDate = new Date(s.openedDate);
      const shelfEnd = new Date(openDate);
      shelfEnd.setDate(shelfEnd.getDate() + med.openVialShelfLifeDays);
      if (shelfEnd <= now) {
        shelfWarning = `<div style="font-size:0.65rem; color:var(--danger-red); margin-top:4px;">⏰ Açık flakon raf ömrü dolmuş!</div>`;
      }
    }

    const barColor = expiredAlready ? '#6b7280' : isCritical ? '#ef4444' : pct > 50 ? '#22c55e' : '#f59e0b';

    return `
      <div class="glass-card pharmacy-stock-card" style="padding:14px; margin-bottom:10px; border-left:4px solid ${barColor}; ${expiredAlready ? 'opacity:0.5;' : ''}">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:0.95rem; color:var(--text-primary); margin-bottom:2px;">${medName}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">Parti: ${s.batchNo} · SKT: ${s.expiryDate}</div>
            ${shelfWarning}
          </div>
          <div style="text-align:right; flex-shrink:0;">
            <div style="font-size:1.1rem; font-weight:800; color:${barColor};">${s.remainingQuantity}</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">/ ${s.totalQuantity} ${s.unit}</div>
          </div>
        </div>
        <!-- Progress bar -->
        <div style="margin-top:8px; height:4px; background:rgba(255,255,255,0.08); border-radius:4px; overflow:hidden;">
          <div style="height:100%; width:${pct}%; background:${barColor}; border-radius:4px; transition:width 0.3s;"></div>
        </div>
        <div style="display:flex; justify-content:space-between; align-items:center; margin-top:6px;">
          ${isCritical ? '<span style="font-size:0.65rem; background:rgba(239,68,68,0.15); color:var(--danger-red); padding:2px 8px; border-radius:8px; font-weight:600;">⚠️ Stok Azaldı</span>' : '<span></span>'}
          <button class="btn-waste-stock" data-stock-id="${s.id}" style="font-size:0.65rem; padding:4px 10px; border-radius:8px; border:1px dashed rgba(239,68,68,0.3); background:transparent; color:var(--danger-red); cursor:pointer;">🗑️ Zayi Et</button>
        </div>
      </div>
    `;
  }).join('');

  return criticalBanner + cards;
}

// ── KARANTİNA SEKMESİ ──
function _renderQuarantineTab() {
  const quarantined = getAllQuarantinedAnimals();

  if (quarantined.length === 0) {
    return `
      <div class="glass-card" style="border:1px solid rgba(34,197,94,0.3); background:rgba(34,197,94,0.03); text-align:center; padding:32px 20px;">
        <span style="font-size:2.5rem;">✅</span>
        <h3 style="font-size:1rem; color:var(--accent-green); margin:12px 0 6px;">Karantinadaki Hayvan Yok</h3>
        <p style="font-size:0.85rem; color:var(--text-secondary);">Tüm hayvanlar satış ve tüketim için güvenlidir.</p>
      </div>
    `;
  }

  const items = quarantined.map(q => `
    <div class="glass-card" style="padding:12px 14px; margin-bottom:10px; border-left:4px solid var(--danger-red);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:6px;">
        <span style="font-weight:700; font-size:0.95rem; color:var(--text-primary);">🎯 ${q.animalId}</span>
        <span style="font-size:0.7rem; color:var(--text-muted);">${q.breed} · ${q.type}</span>
      </div>
      <div style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:4px;">İlaç: <strong>${q.activeMedName || 'Kayıtlı İlaç'}</strong></div>
      <div style="display:flex; gap:12px; font-size:0.75rem;">
        ${q.meatDaysLeft > 0 ? `<span style="color:var(--danger-red);">🛑 Et Karantinası: <strong>${q.meatDaysLeft} gün</strong></span>` : '<span style="color:var(--accent-green);">✅ Et Güvenli</span>'}
        ${q.milkDaysLeft > 0 ? `<span style="color:var(--warning-orange);">🥛 Süt: <strong>${q.milkDaysLeft} gün</strong></span>` : '<span style="color:var(--accent-green);">✅ Süt Güvenli</span>'}
      </div>
    </div>
  `).join('');

  return `
    <div class="glass-card" style="border:1px solid rgba(239,68,68,0.3); padding:12px 16px; margin-bottom:var(--space-md); border-radius:16px;">
      <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
        <span style="font-size:1.2rem;">⛔</span>
        <strong style="font-size:0.85rem; color:var(--danger-red);">Karantinadaki Hayvanlar (${quarantined.length})</strong>
      </div>
      <p style="font-size:0.7rem; color:var(--text-muted); margin:0;">Arınma süresi dolmadan kesim veya süt satışı yapılamaz.</p>
    </div>
    ${items}
  `;
}

// ── GEÇMİŞ SEKMESİ ──
function _renderHistoryTab() {
  const state = getState();
  const records = state.treatmentRecords || [];

  if (records.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:32px 20px;">
        <span style="font-size:2.5rem;">📋</span>
        <h3 style="font-size:1rem; color:var(--text-secondary); margin:12px 0 6px;">Tedavi Geçmişi Boş</h3>
        <p style="font-size:0.85rem; color:var(--text-muted);">Henüz tedavi kaydı bulunmuyor.</p>
      </div>
    `;
  }

  const items = records.slice(0, 20).map(r => {
    const target = r.applicationType === 'single'
      ? r.animalId
      : `Toplu (${r.batchTargets?.length || '?'} baş)`;

    return `
      <div class="glass-card" style="padding:12px 14px; margin-bottom:8px; border-left:4px solid var(--accent-purple);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div>
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">💊 ${r.medicationName}</div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-top:2px;">
              ${r.activeIngredient || ''} · ${r.dosage} ${r.dosageUnit}
            </div>
            <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:4px;">
              Hedef: <strong>${target}</strong> · ${r.applicationDate}
            </div>
            ${r.courseInfo?.totalDays > 1 ? `<div style="font-size:0.65rem; color:var(--accent-cyan); margin-top:2px;">⏱️ ${r.courseInfo.totalDays} günlük kür</div>` : ''}
            ${r.pregnancyOverride ? '<div style="font-size:0.65rem; color:var(--danger-red); margin-top:2px;">⚠️ Gebelik uyarısı geçildi</div>' : ''}
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted); text-align:right; flex-shrink:0;">
            ${r.withdrawals?.meatWithdrawalDays > 0 ? `<div>🛑 Et: ${r.withdrawals.meatWithdrawalDays}g</div>` : ''}
            ${r.withdrawals?.milkWithdrawalDays > 0 ? `<div>🥛 Süt: ${r.withdrawals.milkWithdrawalDays}g</div>` : ''}
          </div>
        </div>
        ${r.notes ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:6px; padding-top:6px; border-top:1px solid var(--glass-border);">📝 ${r.notes}</div>` : ''}
      </div>
    `;
  }).join('');

  return items;
}

// ── KÜTÜPHANE SEKMESİ ──
function _renderLibraryTab() {
  const meds = getAllMedications();

  const items = meds.map(m => {
    const cat = MED_CATEGORIES.find(c => c.value === m.category);
    return `
      <div class="glass-card" style="padding:12px 14px; margin-bottom:8px; border-left:4px solid var(--accent-amber);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">${m.name}</div>
            <div style="font-size:0.7rem; color:var(--text-muted);">${m.activeIngredient} · ${cat?.label || m.category}</div>
            <div style="font-size:0.7rem; color:var(--text-secondary); margin-top:4px;">
              Doz: ${m.dosagePerKg} ${m.unit}/kg · Et: ${m.meatWithdrawalDays}g · Süt: ${m.milkWithdrawalDays}g
              ${m.contraindications?.pregnancyRisk ? ' · <span style="color:var(--danger-red);">🤰 Gebe Riski</span>' : ''}
            </div>
            ${m.treatmentCourse?.days > 1 ? `<div style="font-size:0.65rem; color:var(--accent-cyan); margin-top:2px;">⏱️ ${m.treatmentCourse.days} gün kür (her ${m.treatmentCourse.repeatIntervalHours} saatte)</div>` : ''}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    ${items}
    <div style="margin-top:var(--space-md);">
      <button class="huge-btn btn-secondary" id="btn-add-custom-med" style="width:100%; border-radius:20px; padding:14px; font-size:0.9rem; border:1px dashed var(--accent-amber);">
        <span class="btn-icon">➕</span> Özel İlaç Tanımla
      </button>
    </div>
  `;
}

// ═══════════════════════════════════════
// Form Akışları
// ═══════════════════════════════════════

async function _showAddStockFlow() {
  const meds = getAllMedications();
  const medOpts = meds.map(m => ({
    value: m.id,
    label: m.name,
    color: '#3b82f6',
    icon: '💊'
  }));

  const medSel = await showSelect('İlaç Seçin (Stok Eklenecek)', medOpts, '📦');
  if (!medSel) return;

  const form = await showFormModal(`Stok Girişi — ${medSel.label}`, [
    { id: 'batchNo', label: 'Parti / Lot Numarası', type: 'text', placeholder: 'Örn: LOT-2026E' },
    { id: 'quantity', label: 'Miktar', type: 'number', placeholder: 'Örn: 100' },
    { id: 'unit', label: 'Birim', type: 'select', options: ['ml', 'tablet', 'doz', 'adet'], value: 'ml' },
    { id: 'criticalThreshold', label: 'Kritik Eşik (uyarı)', type: 'number', value: '20' },
    { id: 'expiryDate', label: 'Son Kullanma Tarihi', type: 'date' }
  ], '📦');

  if (!form || !form.quantity) return;

  addPharmacyStock({
    medicationId: medSel.value,
    batchNo: form.batchNo || `LOT-${Date.now()}`,
    totalQuantity: parseFloat(form.quantity),
    remainingQuantity: parseFloat(form.quantity),
    unit: form.unit || 'ml',
    criticalThreshold: parseInt(form.criticalThreshold) || 20,
    expiryDate: form.expiryDate || '2027-12-31',
    openedDate: null
  });

  await showAlert('Stok Eklendi', `${medSel.label} — ${form.quantity} ${form.unit || 'ml'} stoğa eklendi.`, '✅');
}

async function _showAddMedicationFlow() {
  const catOpts = MED_CATEGORIES.map(c => ({ value: c.value, label: c.label }));
  const form = await showFormModal('Yeni İlaç Tanımla', [
    { id: 'name', label: 'İlaç Adı (Ticari)', type: 'text', placeholder: 'Örn: Terramycin LA' },
    { id: 'activeIngredient', label: 'Etken Madde', type: 'text', placeholder: 'Örn: Oksitetrasiklin' },
    { id: 'category', label: 'Kategori', type: 'select', options: catOpts },
    { id: 'dosagePerKg', label: 'Dozaj (ml/kg)', type: 'number', placeholder: '0.1' },
    { id: 'meatWithdrawalDays', label: 'Et Arınma (gün)', type: 'number', placeholder: '28' },
    { id: 'milkWithdrawalDays', label: 'Süt Arınma (gün)', type: 'number', placeholder: '7' },
    { id: 'courseDays', label: 'Kür Süresi (gün)', type: 'number', value: '1' }
  ], '📖');

  if (!form || !form.name) return;

  addCustomMedication({
    id: `custom-${Date.now()}`,
    name: form.name,
    activeIngredient: form.activeIngredient || '',
    category: form.category || 'diger',
    dosagePerKg: parseFloat(form.dosagePerKg) || 0.1,
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: parseInt(form.meatWithdrawalDays) || 0,
    milkWithdrawalDays: parseInt(form.milkWithdrawalDays) || 0,
    contraindications: { pregnancyRisk: false, pregnancyWarning: '', sideEffects: [] },
    treatmentCourse: { days: parseInt(form.courseDays) || 1, repeatIntervalHours: 24 },
    openVialShelfLifeDays: 28,
    notes: ''
  });

  await showAlert('İlaç Eklendi', `${form.name} ilaç kütüphanesine eklendi.`, '✅');
}

function _rerender() {
  if (!_container) return;
  const parent = _container.parentNode;
  const scrollPos = window.scrollY;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
  window.scrollTo(0, scrollPos);
}
