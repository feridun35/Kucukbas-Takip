/**
 * ShepherdAI — Aşı Ajandası Modülü
 * Kaynaklar (core/healthManager.getVaccineAgenda):
 *  - Bekleyen aşılar: tasks (type: 'vaccine')
 *  - Yapılmış aşılar: treatmentRecords (recordType: 'vaccine')
 */

import { getVaccineAgenda } from '../core/healthManager.js';

let _container = null;

// Ajanda durumu → mevcut CSS sınıfı
const STATUS_CLASS = { overdue: 'pending', upcoming: 'upcoming', done: 'done' };

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';

  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:#a855f7;"></span>Sürü Aşı Ajandası</div>
    ${_renderVaccineAgenda()}
  `;
  return _container;
}

export function init() {}

function _formatDate(iso) {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? iso : d.toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
}

function _dateLabel(item) {
  if (item.status === 'done') return `${_formatDate(item.date)} (Tamamlandı)`;
  if (item.status === 'overdue') return `${_formatDate(item.date)} (Gecikti)`;
  return _formatDate(item.date);
}

function _renderVaccineAgenda() {
  const agenda = getVaccineAgenda();

  if (agenda.length === 0) {
    return `
      <div class="glass-card" style="margin:var(--space-md); text-align:center; padding:32px 20px; color:var(--text-muted);">
        Henüz planlanmış veya uygulanmış aşı bulunmuyor.<br/>
        <span style="font-size:0.8rem;">Görevler sekmesinden "Aşı" türünde görev ekleyerek ajanda oluşturabilirsiniz.</span>
      </div>
    `;
  }

  const items = agenda.map(v => `
    <div class="agenda-item ${STATUS_CLASS[v.status] || 'upcoming'}">
      <div class="agenda-indicator"></div>
      <div class="agenda-info" style="flex:1;">
        <span class="agenda-name">${v.name}</span>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
          Uygulanan/Hedef: <strong style="color:var(--text-secondary)">${v.target}</strong>
        </div>
        <span class="agenda-date" style="margin-top:4px; display:block;">${_dateLabel(v)}</span>
      </div>
      ${v.status === 'done' ? '<span class="agenda-done-icon">✔️</span>' : ''}
    </div>
  `).join('');

  return `
    <div class="glass-card agenda-list" style="margin:var(--space-md);">
      ${items}
    </div>
  `;
}
