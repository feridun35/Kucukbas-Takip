/**
 * ShepherdAI — Üreme & Islah Yönetimi Paneli (UI Modülü)
 *
 * Gerçek state.breedingRecords ve state.animals verilerini kullanır.
 * Mock bağımlılığı YOKTUR.
 */

import { getState } from '../core/state.js';
import { calculateBirthDate } from '../core/breedingManager.js';
import { showAlert } from '../core/modal.js';
import { openBreedingModal } from './breeding-modal.js';

let _container = null;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter herd-page';
  _container.style.paddingBottom = '180px';

  const state = getState();
  const records = state.breedingRecords || [];
  const animals = state.animals || [];

  // ── Özet Metrikleri Hesapla ──
  const activeRecords = records.filter(r => r.status === 'ACTIVE' || r.status === 'PREGNANT');
  const pregnantRecords = records.filter(r => r.status === 'PREGNANT');
  const completedRecords = records.filter(r => r.status === 'COMPLETED');

  // Yaklaşan doğumlar (önümüzdeki 30 gün)
  const today = new Date();
  const upcomingBirths = pregnantRecords.filter(r => {
    const expected = new Date(r.milestones.expectedBirthDate);
    const diffDays = Math.round((expected - today) / 86400000);
    return diffDays >= 0 && diffDays <= 30;
  });

  // Toplam gebe dişi sayısı
  const totalPregnantDams = pregnantRecords.reduce((sum, r) => sum + r.damIds.length, 0);

  // Aktif grup katımları
  const activeGroupRecords = activeRecords.filter(r => r.type === 'GROUP');

  // ── Yaklaşan Milestone'lar (Zaman Çizelgesi) ──
  const milestoneEvents = _collectUpcomingMilestones(activeRecords, pregnantRecords);

  _container.innerHTML = `
    <div class="section-title"><span class="dot" style="background:var(--accent-orange)"></span>Üreme & Islah Yönetimi</div>

    <!-- Özet Kartları -->
    <div class="breeding-summary-cards">
      <div class="breeding-summary-card">
        <div class="breeding-card-icon">🤰</div>
        <div class="breeding-card-value">${totalPregnantDams}</div>
        <div class="breeding-card-label">Gebe Hayvan</div>
      </div>
      <div class="breeding-summary-card">
        <div class="breeding-card-icon">🐣</div>
        <div class="breeding-card-value">${upcomingBirths.length}</div>
        <div class="breeding-card-label">Yaklaşan Doğum</div>
      </div>
      <div class="breeding-summary-card">
        <div class="breeding-card-icon">🐏</div>
        <div class="breeding-card-value">${activeGroupRecords.length}</div>
        <div class="breeding-card-label">Aktif Grup Katımı</div>
      </div>
    </div>

    <!-- Biyolojik Zaman Çizelgesi -->
    <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:var(--accent-purple)"></span>Biyolojik Takvim</div>
    <div class="glass-card" style="padding:var(--space-sm);">
      ${milestoneEvents.length > 0 ? milestoneEvents.map(ev => `
        <div class="breeding-timeline-item">
          <div class="breeding-timeline-icon">${ev.icon}</div>
          <div class="breeding-timeline-content">
            <div class="breeding-timeline-title">${ev.title}</div>
            <div class="breeding-timeline-meta">${ev.damLabel} • ${ev.dateLabel}</div>
          </div>
          <div class="breeding-timeline-badge ${ev.urgency}">${ev.daysLabel}</div>
        </div>
      `).join('') : `
        <p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:16px;">
          Henüz aktif eşleşme/gebelik kaydı bulunmuyor.
        </p>
      `}
    </div>

    <!-- Aktif Eşleşmeler Listesi -->
    <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:#f97316"></span>Eşleşme Kayıtları</div>
    ${_renderRecordsList(records, animals)}

    <!-- Aksiyon Butonu -->
    <div style="position:relative !important; margin-top:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto;">
      <button class="huge-btn btn-primary" id="btn-new-breeding" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; background:#f97316; box-shadow:0 4px 16px rgba(249,115,22,0.4);">
        <span class="btn-icon" style="font-size:1.4rem">🐏</span> Yeni Koç Katımı
      </button>
    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const btnNew = _container.querySelector('#btn-new-breeding');
  if (btnNew) {
    btnNew.addEventListener('click', async () => {
      const result = await openBreedingModal();
      if (result.saved) {
        await showAlert('Eşleşme Kaydedildi! 🐏', 'Koç katımı kaydı ve otomatik görevler başarıyla oluşturuldu.', '✅');
        _rerender();
      }
    });
  }
}

// ═══════════════════════════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════════════════════════

function _collectUpcomingMilestones(activeRecords, pregnantRecords) {
  const allRecords = [...activeRecords, ...pregnantRecords];
  const today = new Date();
  const events = [];

  // Unique records (active'de hem active hem pregnant olabilir, dedupe)
  const seen = new Set();
  allRecords.forEach(rec => {
    if (seen.has(rec.id)) return;
    seen.add(rec.id);

    const ms = rec.milestones;
    const damLabel = rec.damIds.length > 1 ? `${rec.damIds.length} Anaç` : rec.damIds[0];

    const milestoneList = [
      { key: 'cycleCheckDate', title: 'Kızgınlık Geri Dönme Kontrolü', icon: '🔴' },
      { key: 'ultrasoundDate', title: 'Ultrason / Gebelik Muayenesi', icon: '🩺' },
      { key: 'lateGestationDate', title: 'İleri Gebelik Bakımı & Çelerme Aşısı', icon: '💉' },
      { key: 'expectedBirthDate', title: 'Tahmini Doğum', icon: '🐣' }
    ];

    milestoneList.forEach(m => {
      const dateStr = ms[m.key];
      if (!dateStr) return;
      const msDate = new Date(dateStr);
      const diffDays = Math.round((msDate - today) / 86400000);

      // Sadece gelecek 60 gün ve geçmiş 5 gün içindekiler
      if (diffDays >= -5 && diffDays <= 60) {
        let urgency = 'normal';
        let daysLabel = '';
        if (diffDays < 0) {
          urgency = 'overdue';
          daysLabel = `${Math.abs(diffDays)} gün geçti`;
        } else if (diffDays === 0) {
          urgency = 'today';
          daysLabel = 'BUGÜN';
        } else if (diffDays <= 7) {
          urgency = 'soon';
          daysLabel = `${diffDays} gün`;
        } else {
          daysLabel = `${diffDays} gün`;
        }

        events.push({
          icon: m.icon,
          title: m.title,
          damLabel,
          dateLabel: new Date(dateStr).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' }),
          daysLabel,
          urgency,
          sortDate: msDate
        });
      }
    });
  });

  // Tarihe göre sırala
  events.sort((a, b) => a.sortDate - b.sortDate);
  return events;
}

function _renderRecordsList(records, animals) {
  if (records.length === 0) {
    return `
      <div class="glass-card" style="padding:24px; text-align:center;">
        <div style="font-size:2.5rem; margin-bottom:8px;">🐑</div>
        <p style="font-size:0.9rem; color:var(--text-muted);">Henüz kayıtlı eşleşme bulunmuyor.</p>
        <p style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">İlk koç katımınızı kaydetmek için aşağıdaki butonu kullanın.</p>
      </div>
    `;
  }

  return records.map(rec => {
    const statusColors = {
      'ACTIVE': { bg: 'rgba(249,115,22,0.12)', border: 'rgba(249,115,22,0.3)', text: '#f97316', label: '🟠 Koç Katımında' },
      'PREGNANT': { bg: 'rgba(168,85,247,0.12)', border: 'rgba(168,85,247,0.3)', text: '#a855f7', label: '🟣 Gebe' },
      'COMPLETED': { bg: 'rgba(16,185,129,0.12)', border: 'rgba(16,185,129,0.3)', text: '#10b981', label: '🟢 Tamamlandı' },
      'FAILED': { bg: 'rgba(239,68,68,0.12)', border: 'rgba(239,68,68,0.3)', text: '#ef4444', label: '🔴 Başarısız' }
    };
    const st = statusColors[rec.status] || statusColors['ACTIVE'];

    const sireLabel = rec.sireIds.join(', ');
    const damLabel = rec.damIds.length > 2 ? `${rec.damIds.slice(0, 2).join(', ')} +${rec.damIds.length - 2}` : rec.damIds.join(', ');
    const typeLabel = rec.type === 'GROUP' ? '🐏 Grup Katımı' : '🐑 Bireysel';

    let progressHtml = '';
    if (rec.status === 'PREGNANT' || rec.status === 'ACTIVE') {
      const pregInfo = calculateBirthDate(rec.startDate);
      progressHtml = `
        <div style="margin-top:8px;">
          <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted); margin-bottom:4px;">
            <span>Gebelik İlerlemesi</span>
            <span>${pregInfo.daysElapsed}. gün / ${148} gün</span>
          </div>
          <div style="height:6px; background:rgba(255,255,255,0.08); border-radius:3px; overflow:hidden;">
            <div style="height:100%; width:${pregInfo.progressPercent}%; background:linear-gradient(90deg, #f97316, #a855f7); border-radius:3px; transition:width 0.5s;"></div>
          </div>
          ${pregInfo.daysLeft <= 30 ? `<div style="font-size:0.7rem; color:#fbbf24; margin-top:4px; font-weight:600;">🐣 Doğuma ${pregInfo.daysLeft} gün kaldı</div>` : ''}
        </div>
      `;
    }

    let birthInfo = '';
    if (rec.birthRecord) {
      birthInfo = `
        <div style="margin-top:8px; padding:8px; background:rgba(16,185,129,0.08); border-radius:8px; font-size:0.75rem; color:var(--text-secondary);">
          🐣 Doğum: ${rec.birthRecord.date} • ${rec.birthRecord.type} • ${rec.birthRecord.lambCount} yavru
        </div>
      `;
    }

    return `
      <div class="breeding-record-card" style="border-left:4px solid ${st.text}; background:${st.bg}; border:1px solid ${st.border}; border-radius:16px; padding:14px; margin-bottom:12px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
          <span style="font-size:0.75rem; font-weight:600; color:${st.text};">${st.label}</span>
          <span style="font-size:0.7rem; color:var(--text-muted);">${typeLabel}</span>
        </div>
        <div style="display:flex; gap:16px; font-size:0.85rem;">
          <div>
            <span style="font-size:0.7rem; color:var(--text-muted);">Koç</span>
            <div style="font-weight:600; color:var(--text-primary);">${sireLabel}</div>
          </div>
          <div>
            <span style="font-size:0.7rem; color:var(--text-muted);">Anaç(lar)</span>
            <div style="font-weight:600; color:var(--text-primary);">${damLabel}</div>
          </div>
          <div>
            <span style="font-size:0.7rem; color:var(--text-muted);">Tarih</span>
            <div style="font-weight:600; color:var(--text-primary);">${new Date(rec.startDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</div>
          </div>
        </div>
        ${rec.inbreedingWarning ? `<div style="font-size:0.7rem; color:#ef4444; margin-top:6px; font-weight:600;">🚨 ${rec.inbreedingWarning}</div>` : ''}
        ${progressHtml}
        ${birthInfo}
      </div>
    `;
  }).join('');
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
