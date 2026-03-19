/**
 * ShepherdAI — Aşı Ajandası Modülü
 */

import { getState } from '../core/state.js';

let _container = null;
let _scope = 'HERD';

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

function _renderVaccineAgenda() {
  const state = getState();
  const vaccines = [...(state.vaccines || [])];

  // Tarihsel öncelik sıralaması: upcoming → pending → done
  const statusOrder = { 'upcoming': 0, 'pending': 1, 'done': 2 };
  vaccines.sort((a, b) => (statusOrder[a.status] ?? 1) - (statusOrder[b.status] ?? 1));

  const items = vaccines.map(v => `
    <div class="agenda-item ${v.status}">
      <div class="agenda-indicator"></div>
      <div class="agenda-info" style="flex:1;">
        <span class="agenda-name">${v.name}</span>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:4px;">
          Uygulanan/Hedef: <strong style="color:var(--text-secondary)">${v.target}</strong>
        </div>
        <span class="agenda-date" style="margin-top:4px; display:block;">${v.status === 'done' ? v.date + ' (Tamamlandı)' : v.date}</span>
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
