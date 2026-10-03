/**
 * ShepherdAI — Ölüm Raporları & Mortalite Analiz Modülü
 * Ölen hayvanların geçmiş kayıtlarını tutar, ölüm nedenlerini ve finansal kayıpları analiz eder.
 */

import { todayIso } from '../core/dateUtils.js';
import { getState } from '../core/state.js';
import { showAlert, showFormModal, showSelect } from '../core/modal.js';
import { recordDeath, estimateLossFromWeight } from '../core/herdManager.js';
import { DEATH_REASONS } from '../data/herd-constants.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';
  _container.style.paddingBottom = '140px';

  const state = getState();
  const records = state.mortalityRecords || [];
  const animals = state.animals || [];
  const totalAnimalsEver = animals.length + records.length;
  const mortalityRate = totalAnimalsEver > 0 ? ((records.length / totalAnimalsEver) * 100).toFixed(1) : '0.0';

  const totalLoss = records.reduce((sum, r) => sum + (parseFloat(r.financialLoss) || 0), 0);

  // En sık ölüm sebebini hesapla
  const reasonCounts = {};
  records.forEach(r => {
    const reason = r.deathReason || 'Bilinmiyor';
    reasonCounts[reason] = (reasonCounts[reason] || 0) + 1;
  });
  let topReason = 'Kayıt Yok';
  let maxCount = 0;
  Object.keys(reasonCounts).forEach(r => {
    if (reasonCounts[r] > maxCount) {
      maxCount = reasonCounts[r];
      topReason = r;
    }
  });

  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:var(--danger-red)"></span>Ölüm Raporları & Mortalite Analizi</div>
    
    <!-- KPI Kartları -->
    <div class="stats-grid" style="grid-template-columns:1fr 1fr; margin-bottom:var(--space-md);">
      <div class="glass-card stat-card red">
        <span class="stat-label">Toplam Ölüm</span>
        <span class="stat-value">${records.length} baş</span>
        <span class="stat-sub">Mortalite Oranı: %${mortalityRate}</span>
      </div>
      <div class="glass-card stat-card amber">
        <span class="stat-label">Finansal Kayıp</span>
        <span class="stat-value">${totalLoss.toLocaleString('tr-TR')} ₺</span>
        <span class="stat-sub">En Sık Sebeb: ${topReason}</span>
      </div>
    </div>

    <!-- Rapor Listesi -->
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:#6b7280"></span>Geçmiş Ölüm Kayıtları</div>
    ${_renderMortalityList(records)}

    <!-- Alt Buton -->
    <div class="tasks-fixed-bottom" style="z-index:30;">
      <button class="huge-btn btn-primary" id="btn-add-mortality" style="background:var(--accent-red); box-shadow:0 4px 16px rgba(239,68,68,0.4);">
        <span class="btn-icon">☠️</span> Yeni Ölüm Kaydı Ekle
      </button>
    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const btnAdd = _container.querySelector('#btn-add-mortality');
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const state = getState();
      const animals = state.animals || [];

      // Eğer canlı hayvan varsa seçim sundur
      const animalOpts = [
        { value: 'MANUAL', label: '➕ Küpe No Manuel Gir (Sürüde Kayıtlı Değilse)', color: '#3b82f6' },
        ...animals.map(a => ({ value: a.id, label: `${a.id} (${a.breed} - ${a.group} - ${a.weight || 0} kg)`, color: '#ef4444' }))
      ];

      const sel = await showSelect('Ölen Hayvanı Seçin', animalOpts, '🐑');
      if (!sel) return;

      let animalToDie = null;
      if (sel.value !== 'MANUAL') {
        animalToDie = animals.find(a => a.id === sel.value);
      }

      const defaultTag = animalToDie ? animalToDie.id : '';
      const defaultWeight = animalToDie ? (animalToDie.weight || '') : '';
      const defaultLoss = animalToDie ? estimateLossFromWeight(animalToDie.weight) : '';

      const form = await showFormModal('Ölüm Kaydı Oluştur', [
        { id: 'tagID', label: 'Hayvan Küpe No', type: 'text', value: defaultTag, placeholder: 'Örn: TR-109' },
        { id: 'deathDate', label: 'Ölüm Tarihi', type: 'date', value: todayIso() },
        { id: 'reason', label: 'Ölüm Sebebi / Teşhis', type: 'select', options: DEATH_REASONS },
        { id: 'lastWeight', label: 'Son Canlı Ağırlık (kg)', type: 'number', value: defaultWeight, placeholder: 'Örn: 55' },
        { id: 'financialLoss', label: 'Tahmini Finansal Kayıp (₺)', type: 'number', value: defaultLoss, placeholder: 'Boş bırakılırsa ağırlıktan hesaplanır' },
        { id: 'note', label: 'Açıklama / Not', type: 'text', placeholder: 'Olayla ilgili gözlemler...' }
      ], '☠️');

      if (!form || !form.tagID || form.tagID.trim() === '') return;

      const result = recordDeath({
        animalId: form.tagID,
        deathDate: form.deathDate,
        reason: form.reason,
        lastWeight: form.lastWeight,
        financialLoss: form.financialLoss,
        note: form.note
      });

      if (!result.success) {
        await showAlert('Kayıt Yapılamadı', result.message, '⚠️');
        return;
      }

      await showAlert('Ölüm Kaydı Alındı', result.message, '😢');
      _rerender();
    });
  }
}

function _renderMortalityList(records) {
  if (!records || records.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:40px 20px; border-radius:20px; color:var(--text-muted);">
        <span style="font-size:3rem; display:block; margin-bottom:8px;">🌿</span>
        <div style="font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:4px;">Henüz kayıtlı ölüm yok</div>
        <p style="font-size:0.8rem; color:var(--text-secondary);">Sürünüzde kayıp olmaması harika! Yeni bir ölüm gerçekleştiğinde buradan kaydını tutabilirsiniz.</p>
      </div>
    `;
  }

  const items = records.map(r => `
    <div class="glass-card" style="padding:14px 16px; margin-bottom:10px; border-left:4px solid var(--danger-red);">
      <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:6px;">
        <div>
          <div style="font-size:1rem; font-weight:700; color:var(--text-primary); display:flex; align-items:center; gap:8px;">
            <span>☠️ ${r.animalId}</span>
            <span style="font-size:0.65rem; padding:2px 8px; border-radius:10px; background:rgba(239,68,68,0.15); color:var(--danger-red); font-weight:600;">
              ${r.deathReason}
            </span>
          </div>
          <div style="font-size:0.75rem; color:var(--text-muted); margin-top:3px;">
            ${r.breed} &bull; ${r.type} (${r.gender}) &bull; Tarih: <strong>${r.deathDate}</strong>
          </div>
        </div>
        <div style="text-align:right;">
          <div style="font-size:0.95rem; font-weight:700; color:var(--danger-red);">${r.financialLoss ? r.financialLoss.toLocaleString('tr-TR') + ' ₺' : '-'}</div>
          <div style="font-size:0.65rem; color:var(--text-muted);">${r.lastWeight ? r.lastWeight + ' kg' : ''}</div>
        </div>
      </div>
      ${r.note ? `<div style="font-size:0.75rem; color:var(--text-secondary); background:rgba(0,0,0,0.2); padding:6px 10px; border-radius:8px; margin-top:6px;">📝 ${r.note}</div>` : ''}
    </div>
  `).join('');

  return `<div class="mortality-list">${items}</div>`;
}

function _rerender() {
  if (!_container || !_container.parentNode) return;
  const parent = _container.parentNode;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
}
