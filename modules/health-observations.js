/**
 * ShepherdAI — Sürü Belirti Takibi
 * Açık belirti kayıtları, salgın / ihbar uyarıları ve son kapanan kayıtlar.
 * Hesaplar core/observationRecords.js'ten gelir.
 */

import { getState, setState } from '../core/state.js';
import { navigateTo } from '../core/router.js';
import { setProfileTab } from './animal-profile.js';
import { getOpenObservations } from '../core/observationManager.js';
import { symptomLabel, severityLabel, effectiveSeverityRank, detectOutbreaks, detectNotifiablePatterns } from '../core/observationRecords.js';
import { todayIso, daysBetweenIso } from '../core/dateUtils.js';
import { escapeHtml } from '../core/sanitize.js';
import { OBSERVATION_RULES } from '../data/symptom-catalog.js';

let _container = null;
const SEVERITY_COLOR = { 1: 'var(--accent-green)', 2: 'var(--warning-orange)', 3: 'var(--danger-red)' };

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';
  _container.style.paddingBottom = '120px';

  const state = getState();
  const today = todayIso();
  const all = state.healthObservations || [];
  const open = getOpenObservations().sort((a, b) => effectiveSeverityRank(b) - effectiveSeverityRank(a) || b.date.localeCompare(a.date));
  const outbreaks = detectOutbreaks(all, today);
  const notifiable = detectNotifiablePatterns(all, today);
  const recentResolved = all
    .filter(o => o.status === 'resolved' && o.resolvedDate && daysBetweenIso(o.resolvedDate, today) <= 30)
    .sort((a, b) => b.resolvedDate.localeCompare(a.resolvedDate));

  const warnings = [
    ...notifiable.map(n => `
      <div class="glass-card" style="padding:12px 14px; margin-bottom:10px; border-left:4px solid var(--danger-red); background:rgba(239,68,68,0.08);">
        <div style="font-weight:800; color:var(--danger-red);">🚨 ${escapeHtml(n.pattern.title)}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(n.animalIds.join(', '))} — ${escapeHtml(n.pattern.desc)}</div>
      </div>`),
    ...outbreaks.map(o => `
      <div class="glass-card" style="padding:12px 14px; margin-bottom:10px; border-left:4px solid var(--danger-red);">
        <div style="font-weight:800; color:var(--danger-red);">⚠️ Salgın şüphesi: ${escapeHtml(o.systemLabel)}</div>
        <div style="font-size:0.78rem; color:var(--text-secondary); margin-top:4px;">
          Son ${OBSERVATION_RULES.outbreakWindowDays} günde ${o.animalIds.length} hayvanda: ${escapeHtml(o.symptoms.map(symptomLabel).join(', '))}.
          Hasta hayvanları ayırın ve veteriner hekime danışın.
        </div>
        <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(o.animalIds.join(', '))}</div>
      </div>`)
  ].join('');

  _container.innerHTML = `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:var(--warning-orange)"></span>Belirti Takibi</div>
    <div style="padding:0 var(--space-md);">
      ${warnings}
      ${open.length === 0 ? `
        <div class="glass-card" style="text-align:center; padding:28px 16px; color:var(--text-muted);">
          <div style="font-size:2.2rem;">🌿</div>
          <div style="font-weight:700; color:var(--text-primary); margin-top:6px;">Açık belirti kaydı yok</div>
          <div style="font-size:0.78rem; margin-top:4px;">Belirtiler hayvan profilindeki Sağlık sekmesinden kaydedilir.</div>
        </div>` : open.map(o => _renderRow(o, today)).join('')}

      ${recentResolved.length > 0 ? `
        <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:var(--accent-green)"></span>Son 30 Günde İyileşenler</div>
        ${recentResolved.map(o => `
          <div class="glass-card animal-obs-row" data-animal-id="${escapeHtml(o.animalId)}" style="padding:10px 14px; margin-bottom:8px; cursor:pointer; opacity:0.8;">
            <div style="display:flex; justify-content:space-between; font-size:0.82rem;">
              <span style="font-weight:700; color:var(--text-primary);">${escapeHtml(o.animalId)}</span>
              <span style="color:var(--accent-green);">✅ ${escapeHtml(o.resolvedDate)}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">${escapeHtml((o.symptoms || []).map(symptomLabel).join(', ') || o.note || '')}</div>
          </div>`).join('')}
      ` : ''}
    </div>
  `;
  return _container;
}

function _renderRow(o, today) {
  const rank = effectiveSeverityRank(o);
  const days = daysBetweenIso(o.date, today);
  const stale = days > OBSERVATION_RULES.staleOpenDays;
  return `
    <div class="glass-card animal-obs-row" data-animal-id="${escapeHtml(o.animalId)}" style="padding:12px 14px; margin-bottom:10px; cursor:pointer; border-left:4px solid ${SEVERITY_COLOR[rank]};">
      <div style="display:flex; justify-content:space-between; gap:8px;">
        <span style="font-weight:800; color:var(--text-primary);">${escapeHtml(o.animalId)}</span>
        <span style="font-size:0.72rem; color:${stale ? 'var(--warning-orange)' : 'var(--text-muted)'}; font-weight:${stale ? '700' : '400'};">
          ${escapeHtml(o.date)} · ${days === 0 ? 'bugün' : days + ' gün'}${stale ? ' ⏰' : ''}
        </span>
      </div>
      <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml((o.symptoms || []).map(symptomLabel).join(', ') || 'Belirti notu')}</div>
      <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">
        <strong style="color:${SEVERITY_COLOR[rank]}">${severityLabel(o.severity)}</strong>${o.temperature ? ` · 🌡️ ${o.temperature} °C` : ''}${(o.treatmentIds || []).length ? ` · 💉 ${o.treatmentIds.length} tedavi` : ' · Tedavi yok'}
      </div>
      ${o.note ? `<div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px; font-style:italic;">📝 ${escapeHtml(o.note)}</div>` : ''}
    </div>
  `;
}

export function init() {
  if (!_container) return;
  _container.querySelectorAll('.animal-obs-row').forEach(row => {
    row.addEventListener('click', () => {
      setState({ activeAnimalId: row.dataset.animalId });
      setProfileTab('health');
      navigateTo('animal-profile');
    });
  });
}
