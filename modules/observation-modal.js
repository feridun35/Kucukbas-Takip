/**
 * ShepherdAI — Belirti Kayıt Modalı
 * İnce UI katmanı: form toplar, kaydı core/observationManager.recordObservation yapar.
 */

import { recordObservation } from '../core/observationManager.js';
import { SYMPTOMS, SEVERITIES, TEMPERATURE_LIMITS } from '../data/symptom-catalog.js';
import { todayIso } from '../core/dateUtils.js';
import { escapeHtml } from '../core/sanitize.js';

const SEVERITY_COLORS = { mild: '#22c55e', moderate: '#f59e0b', severe: '#ef4444' };
const SEVERITY_HINTS = {
  mild: 'Durum değişmez',
  moderate: 'Hayvan "Riskli" olur',
  severe: 'Hayvan "Hasta" olur'
};

/**
 * @param {string} animalId
 * @returns {Promise<{ saved: boolean, observation?: Object, status?: string }>}
 */
export function openObservationModal(animalId) {
  return new Promise((resolve) => {
    let root = document.getElementById('observation-modal-root');
    if (!root) {
      root = document.createElement('div');
      root.id = 'observation-modal-root';
      document.body.appendChild(root);
    }

    const form = { symptoms: new Set(), severity: 'mild', date: todayIso(), temperature: '', note: '' };
    let error = '';

    const close = (result) => {
      root.innerHTML = '';
      resolve(result);
    };

    const render = () => {
      const chips = SYMPTOMS.map(s => {
        const on = form.symptoms.has(s.code);
        return `<button type="button" class="obs-chip" data-code="${s.code}" style="
          display:flex; align-items:center; gap:6px; padding:8px 10px; border-radius:12px; font-size:0.78rem; cursor:pointer; text-align:left;
          border:1px solid ${on ? 'var(--accent-blue)' : 'var(--glass-border)'};
          background:${on ? 'rgba(59,130,246,0.18)' : 'rgba(255,255,255,0.04)'};
          color:${on ? 'var(--text-primary)' : 'var(--text-secondary)'}; font-weight:${on ? '700' : '500'};">
          <span>${s.icon}</span><span>${escapeHtml(s.label)}</span>
        </button>`;
      }).join('');

      const severities = SEVERITIES.map(s => {
        const on = form.severity === s.value;
        return `<button type="button" class="obs-sev" data-sev="${s.value}" style="
          flex:1; padding:10px 6px; border-radius:12px; cursor:pointer; font-weight:700; font-size:0.85rem;
          border:1px solid ${on ? SEVERITY_COLORS[s.value] : 'var(--glass-border)'};
          background:${on ? SEVERITY_COLORS[s.value] + '33' : 'rgba(255,255,255,0.04)'}; color:${on ? SEVERITY_COLORS[s.value] : 'var(--text-secondary)'};">
          ${s.label}
        </button>`;
      }).join('');

      root.innerHTML = `
        <div class="c-modal-overlay active">
          <div class="c-modal-box" style="max-height:90vh; overflow-y:auto; max-width:480px; width:94%; text-align:left;">
            <div class="c-modal-icon">🤒</div>
            <h3 class="c-modal-title" style="margin-bottom:4px;">Belirti Kaydı — ${escapeHtml(animalId)}</h3>
            <p style="font-size:0.75rem; color:var(--text-muted); text-align:center; margin-bottom:14px;">Gördüğünüz belirtileri seçin; birden fazla seçebilirsiniz.</p>

            <div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; margin-bottom:14px;">${chips}</div>

            <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Şiddet</label>
            <div style="display:flex; gap:8px; margin-bottom:4px;">${severities}</div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin-bottom:14px;">${SEVERITY_HINTS[form.severity]}</div>

            <div style="display:flex; gap:10px; margin-bottom:14px;">
              <div style="flex:1;">
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Tarih</label>
                <input type="date" id="obs-date" class="c-modal-input" value="${escapeHtml(form.date)}" max="${todayIso()}" style="width:100%; border-radius:8px; padding:10px;">
              </div>
              <div style="flex:1;">
                <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Ateş °C (ops.)</label>
                <input type="number" id="obs-temp" class="c-modal-input" value="${escapeHtml(form.temperature)}" min="${TEMPERATURE_LIMITS.min}" max="${TEMPERATURE_LIMITS.max}" step="0.1" placeholder="Örn: 39.5" style="width:100%; border-radius:8px; padding:10px;">
              </div>
            </div>
            <div style="font-size:0.7rem; color:var(--text-muted); margin:-8px 0 14px;">Normal rektal ısı yaklaşık 38.5–40.0 °C. ${TEMPERATURE_LIMITS.feverModerate} °C ve üzeri en az "Orta", ${TEMPERATURE_LIMITS.feverSevere} °C ve üzeri "Ağır" sayılır.</div>

            <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Not</label>
            <textarea id="obs-note" class="c-modal-input" rows="3" placeholder="Örn: Sağ burun deliğinden sarı akıntı" style="width:100%; min-height:84px; height:auto; border-radius:8px; padding:10px; resize:vertical; font-family:inherit;">${escapeHtml(form.note)}</textarea>

            ${error ? `<div style="font-size:0.8rem; color:var(--danger-red); background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:10px; padding:8px 10px; margin-top:12px;">⚠️ ${escapeHtml(error)}</div>` : ''}

            <div class="c-modal-actions" style="display:flex; gap:12px; margin-top:16px;">
              <button class="btn-secondary" id="obs-cancel" style="flex:1;">İptal</button>
              <button class="btn-primary" id="obs-save" style="flex:1; font-weight:700;">Kaydet</button>
            </div>
          </div>
        </div>
      `;
      attach();
    };

    const readInputs = () => {
      form.date = root.querySelector('#obs-date')?.value || form.date;
      form.temperature = root.querySelector('#obs-temp')?.value ?? '';
      form.note = root.querySelector('#obs-note')?.value ?? '';
    };

    const attach = () => {
      root.querySelectorAll('.obs-chip').forEach(btn => btn.addEventListener('click', () => {
        readInputs();
        const code = btn.dataset.code;
        if (form.symptoms.has(code)) form.symptoms.delete(code); else form.symptoms.add(code);
        render();
      }));
      root.querySelectorAll('.obs-sev').forEach(btn => btn.addEventListener('click', () => {
        readInputs();
        form.severity = btn.dataset.sev;
        render();
      }));
      root.querySelector('#obs-cancel').addEventListener('click', () => close({ saved: false }));
      root.querySelector('#obs-save').addEventListener('click', () => {
        readInputs();
        const res = recordObservation({
          animalId,
          date: form.date,
          symptoms: [...form.symptoms],
          note: form.note,
          temperature: form.temperature,
          severity: form.severity
        });
        if (!res.success) {
          error = res.message;
          render();
          return;
        }
        close({ saved: true, observation: res.observation, status: res.status });
      });
    };

    render();
  });
}
