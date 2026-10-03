/**
 * ShepherdAI — Teşhis Asistanı (kural tabanlı ayırıcı tanı)
 * Bulguları toplar, core/diagnosisEngine.diagnose ile değerlendirir, sonucu belirti kaydına bağlar.
 */

import { readState, setState } from '../core/state.js';
import { navigateTo } from '../core/router.js';
import { showAlert, showConfirm } from '../core/modal.js';
import { escapeHtml } from '../core/sanitize.js';
import { diagnose, CONFIDENCE_TEXT } from '../core/diagnosisEngine.js';
import { buildDiagnosisContext, saveDiagnosis, getDiagnosisTarget, setDiagnosisTarget } from '../core/diagnosisManager.js';
import { FINDINGS, FINDING_GROUPS, URGENCY_LEVELS } from '../data/disease-library.js';
import { TEMPERATURE_LIMITS } from '../data/symptom-catalog.js';
import { setProfileTab } from './animal-profile.js';

let _container = null;
let _animalId = '';
let _observationId = null;
let _answers = {};          // kullanıcının cevapları: kod → true | false
let _temperature = '';
let _tempError = '';
let _openGroups = new Set(['general', 'respiratory', 'digestive']);
let _openResult = null;
let _ctx = null;
const _skipped = new Set(); // "Bilmiyorum" denen sorular tekrar önerilmez

const DEFAULT_OPEN = ['general', 'respiratory', 'digestive'];

function _loadAnimal(animalId, observationId = null) {
  _animalId = animalId || '';
  _observationId = observationId;
  _ctx = _animalId ? buildDiagnosisContext(_animalId) : buildDiagnosisContext(null);
  _answers = { ...(_ctx.prefill?.answers || {}) };
  _temperature = _ctx.prefill?.temperature ?? '';
  _tempError = '';
  _openResult = null;
  _skipped.clear();
  _openGroups = new Set(DEFAULT_OPEN);
  FINDINGS.forEach(f => { if (_answers[f.code] !== undefined || _ctx.context?.derived?.[f.code]) _openGroups.add(f.group); });
}

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';
  _container.style.paddingBottom = '140px';

  const target = getDiagnosisTarget();
  const animals = readState().animals || [];
  if (target.animalId) {
    _loadAnimal(target.animalId, target.observationId);
    setDiagnosisTarget(null, null);
  } else if (!_ctx || (_animalId && !animals.some(a => a.id === _animalId))) {
    _loadAnimal('');
  } else {
    _ctx = buildDiagnosisContext(_animalId || null);
  }

  _paint();
  return _container;
}

export function init() {
  if (!_container) return;
  _container.addEventListener('click', _onClick);
  _container.addEventListener('change', _onChange);
}

function _temperatureValue() {
  if (_temperature === '' || _temperature === null || _temperature === undefined) return null;
  const t = Number(String(_temperature).replace(',', '.'));
  return Number.isFinite(t) && t >= TEMPERATURE_LIMITS.min && t <= TEMPERATURE_LIMITS.max ? t : null;
}

function _result() {
  return diagnose({ answers: _answers, temperature: _temperatureValue(), context: _ctx?.context || {}, skip: [..._skipped] });
}

function _paint() {
  if (!_container) return;
  const result = _result();
  _container.innerHTML = `
    ${_renderHeader()}
    ${_renderAnimalPicker()}
    ${_renderFacts()}
    ${_renderTemperature()}
    ${_renderFindings(result)}
    ${_renderResults(result)}
    <p style="font-size:0.68rem; color:var(--text-muted); text-align:center; margin:18px 16px 0; line-height:1.5;">
      Bu bir ön değerlendirmedir; hastalık bilgi tabanı ve kayıtlarınızdaki verilerle kural tabanlı çalışır.
      Kesin tanı, ilaç ve doz için veteriner hekime danışın. İhbarı zorunlu hastalık şüphesinde İl/İlçe Tarım ve Orman Müdürlüğüne haber verin.
    </p>
  `;
}

// ═══════════════════════════════════════
// Bölümler
// ═══════════════════════════════════════

function _renderHeader() {
  return `
    <div class="health-header" style="margin:var(--space-md)">
      <div class="header-base-info">
        <div class="med-icon">🩺</div>
        <div>
          <h1 style="font-size:var(--font-size-md); font-weight:700">Teşhis Asistanı</h1>
          <p style="font-size:var(--font-size-xs); color:var(--text-secondary)">Bulguları işaretleyin; olası hastalıklar, aciliyet ve yapılacaklar anında hesaplanır.</p>
        </div>
      </div>
    </div>`;
}

function _renderAnimalPicker() {
  const animals = (readState().animals || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id), 'tr'));
  const options = animals.map(a => `<option value="${escapeHtml(a.id)}" ${a.id === _animalId ? 'selected' : ''}>${escapeHtml(a.id)}${a.nickname ? ` (${escapeHtml(a.nickname)})` : ''} — ${escapeHtml(a.type || '')}</option>`).join('');
  return `
    <div style="padding:0 var(--space-md); margin-bottom:12px;">
      <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Hayvan</label>
      <select id="dx-animal" class="c-modal-input" style="width:100%; border-radius:10px; padding:10px;">
        <option value="" ${!_animalId ? 'selected' : ''}>Hayvan seçmeden değerlendir (yaş, gebelik, aşı bilgisi kullanılmaz)</option>
        ${options}
      </select>
    </div>`;
}

function _renderFacts() {
  const facts = _ctx?.facts || [];
  if (!_animalId || !facts.length) return '';
  return `
    <div class="glass-card" style="margin:0 var(--space-md) 12px; padding:12px 14px;">
      <div style="font-size:0.75rem; font-weight:700; color:var(--text-secondary); margin-bottom:6px;">Kayıtlardan alınan bilgiler</div>
      ${facts.map(f => `<div style="font-size:0.76rem; color:var(--text-primary); padding:2px 0;">${f.icon} ${escapeHtml(f.text)}</div>`).join('')}
    </div>`;
}

function _renderTemperature() {
  return `
    <div style="padding:0 var(--space-md); margin-bottom:12px;">
      <label style="display:block; font-size:0.8rem; color:var(--text-secondary); margin-bottom:6px;">Rektal ısı °C (önerilir)</label>
      <input id="dx-temp" type="number" step="0.1" min="${TEMPERATURE_LIMITS.min}" max="${TEMPERATURE_LIMITS.max}" class="c-modal-input" value="${escapeHtml(String(_temperature ?? ''))}" placeholder="Örn: 40.6" style="width:100%; border-radius:10px; padding:10px;">
      <div style="font-size:0.68rem; color:${_tempError ? 'var(--danger-red)' : 'var(--text-muted)'}; margin-top:4px;">${_tempError ? `⚠️ ${escapeHtml(_tempError)}` : 'Normal: 38.5–39.9 °C · Ateş: ≥ 40 °C · Düşük: < 37.5 °C'}</div>
    </div>`;
}

function _chip(f, derived) {
  const v = _answers[f.code];
  const fromRecord = v === undefined && derived?.[f.code];
  const state = v === true || (fromRecord && derived[f.code].value === true) ? 'yes' : v === false ? 'no' : 'unknown';
  const styles = {
    yes: 'border:1px solid var(--accent-green); background:rgba(34,197,94,0.16); color:var(--text-primary); font-weight:700;',
    no: 'border:1px solid rgba(239,68,68,0.5); background:rgba(239,68,68,0.10); color:var(--text-muted); text-decoration:line-through;',
    unknown: 'border:1px solid var(--glass-border); background:rgba(255,255,255,0.03); color:var(--text-secondary);'
  };
  const mark = state === 'yes' ? '✓' : state === 'no' ? '✗' : '·';
  return `<button type="button" class="dx-chip" data-code="${f.code}" title="${escapeHtml(f.question)}${fromRecord ? ` — ${escapeHtml(derived[f.code].source)}` : ''}"
    style="display:flex; align-items:center; gap:6px; padding:8px 10px; border-radius:12px; font-size:0.76rem; cursor:pointer; text-align:left; ${styles[state]}">
    <span style="width:14px; text-align:center;">${mark}</span><span>${escapeHtml(f.label)}${fromRecord ? ' <span style="font-size:0.62rem; color:var(--accent-blue);">(kayıttan)</span>' : ''}</span>
  </button>`;
}

function _renderFindings(result) {
  const derived = _ctx?.context?.derived || {};
  const groups = FINDING_GROUPS.map(g => {
    const items = FINDINGS.filter(f => f.group === g.id && f.code !== 'fever');
    if (!items.length) return '';
    const marked = items.filter(f => _answers[f.code] !== undefined).length;
    const present = items.filter(f => result.answers[f.code] === true).length;
    const open = _openGroups.has(g.id);
    return `
      <div class="glass-card" style="margin:0 var(--space-md) 8px; padding:0; overflow:hidden;">
        <button type="button" class="dx-group" data-group="${g.id}" style="width:100%; display:flex; justify-content:space-between; align-items:center; padding:12px 14px; background:none; border:none; color:var(--text-primary); cursor:pointer; font-weight:700; font-size:0.85rem;">
          <span>${g.icon} ${g.label}</span>
          <span style="font-size:0.7rem; color:${present ? 'var(--accent-green)' : 'var(--text-muted)'}; font-weight:600;">${present ? `${present} var` : marked ? `${marked} işaretli` : ''} ${open ? '▾' : '▸'}</span>
        </button>
        ${open ? `<div style="display:grid; grid-template-columns:1fr 1fr; gap:6px; padding:0 12px 12px;">${items.map(f => _chip(f, derived)).join('')}</div>` : ''}
      </div>`;
  }).join('');

  return `
    <div class="section-title" style="margin-top:var(--space-md);"><span class="dot" style="background:var(--accent-cyan)"></span>Bulgular</div>
    <p style="font-size:0.7rem; color:var(--text-muted); margin:-4px var(--space-md) 8px;">Dokunun: ✓ var → ✗ yok → · bilinmiyor. "Yok" işaretlemek de ayırt etmeye yardım eder.</p>
    ${groups}`;
}

function _renderResults(result) {
  if (result.presentCount === 0) {
    return `
      <div class="glass-card" style="margin:16px var(--space-md); padding:20px; text-align:center; color:var(--text-muted);">
        <div style="font-size:2rem;">🔎</div>
        <div style="font-size:0.85rem; margin-top:6px;">Değerlendirme için en az bir bulguyu "var" olarak işaretleyin.</div>
      </div>`;
  }
  if (!result.results.length) {
    return `
      <div class="glass-card" style="margin:16px var(--space-md); padding:16px; color:var(--text-secondary); font-size:0.82rem;">
        Bu bulgularla bilgi tabanındaki hastalıklardan hiçbiri yeterince eşleşmedi. İştahsızlık ve halsizlik tek başına ayırt ettirmez; diğer gruplardan (solunum, sindirim, kansızlık…) görülen bulguları ekleyin ya da veteriner hekime danışın.
        ${_renderRedFlags(result)}
      </div>`;
  }

  const urgency = URGENCY_LEVELS[result.urgency] || URGENCY_LEVELS.routine;
  return `
    <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:${urgency.color}"></span>Ön Değerlendirme</div>
    <div class="glass-card" style="margin:0 var(--space-md) 10px; padding:12px 14px; border-left:4px solid ${urgency.color};">
      <div style="font-weight:800; color:${urgency.color}; font-size:0.92rem;">${urgency.icon} ${urgency.label}</div>
      <div style="font-size:0.72rem; color:var(--text-muted); margin-top:4px;">${escapeHtml(CONFIDENCE_TEXT[result.confidence] || '')} · ${result.presentCount} bulgu${result.temperatureClass ? ' + vücut ısısı' : ''}</div>
      ${_renderRedFlags(result)}
    </div>
    ${result.notifiable.length ? `
      <div class="glass-card" style="margin:0 var(--space-md) 10px; padding:12px 14px; border-left:4px solid var(--danger-red); background:rgba(239,68,68,0.08);">
        <div style="font-weight:800; color:var(--danger-red); font-size:0.85rem;">🚨 İhbarı zorunlu hastalık olasılığı</div>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">${escapeHtml(result.notifiable.join(', '))} — hayvanı ayırın, sürü hareketini durdurun; veteriner hekime ve İl/İlçe Tarım ve Orman Müdürlüğüne haber verin.</div>
      </div>` : ''}
    ${result.zoonotic.length ? `
      <div class="glass-card" style="margin:0 var(--space-md) 10px; padding:10px 14px; border-left:4px solid var(--warning-orange);">
        <div style="font-size:0.75rem; color:var(--text-secondary);">🧤 <strong>İnsana bulaşabilir:</strong> ${escapeHtml(result.zoonotic.join(', '))}. Eldiven kullanın; gebe kadınlar ve çocuklar temas etmesin.</div>
      </div>` : ''}
    ${result.results.map((r, i) => _renderResultCard(r, i)).join('')}
    ${result.otherProbability >= 0.05 ? `<div style="font-size:0.72rem; color:var(--text-muted); margin:0 var(--space-md) 8px; padding:0 4px;">❔ Listede olmayan başka bir neden: %${Math.round(result.otherProbability * 100)} — bulgular eklendikçe azalır.</div>` : ''}
    ${_renderQuestions(result)}
    ${_animalId ? `
      <div style="padding:0 var(--space-md); margin-top:16px; display:flex; gap:10px;">
        <button type="button" id="dx-reset" class="btn-secondary" style="flex:1; border-radius:16px; padding:14px;">Sıfırla</button>
        <button type="button" id="dx-save" class="btn-primary" style="flex:2; border-radius:16px; padding:14px; font-weight:700;">💾 Değerlendirmeyi Kaydet</button>
      </div>` : `
      <p style="font-size:0.72rem; color:var(--text-muted); text-align:center; margin:12px var(--space-md);">Kaydetmek için yukarıdan hayvan seçin.</p>`}
  `;
}

function _renderRedFlags(result) {
  if (!result.redFlags.length) return '';
  return `<div style="margin-top:8px;">${result.redFlags.map(f => `<div style="font-size:0.74rem; color:${f.level === 'emergency' ? 'var(--danger-red)' : 'var(--warning-orange)'}; padding:1px 0;">● ${escapeHtml(f.text)}</div>`).join('')}</div>`;
}

function _renderResultCard(r, index) {
  const pct = Math.round(r.probability * 100);
  const open = _openResult === r.id;
  const color = pct >= 50 ? 'var(--danger-red)' : pct >= 25 ? 'var(--warning-orange)' : 'var(--accent-blue)';
  const list = (items, icon, color2) => items.map(t => `<div style="font-size:0.75rem; color:${color2}; padding:2px 0;">${icon} ${escapeHtml(t)}</div>`).join('');
  return `
    <div class="glass-card" style="margin:0 var(--space-md) 8px; padding:12px 14px;">
      <button type="button" class="dx-result" data-id="${r.id}" style="width:100%; background:none; border:none; padding:0; text-align:left; cursor:pointer; color:inherit;">
        <div style="display:flex; justify-content:space-between; gap:8px; align-items:flex-start;">
          <div style="font-weight:800; color:var(--text-primary); font-size:0.9rem;">${index + 1}. ${escapeHtml(r.name)}</div>
          <div style="font-weight:800; color:${color}; white-space:nowrap;">%${pct}</div>
        </div>
        <div style="height:6px; border-radius:4px; background:rgba(255,255,255,0.08); margin:6px 0; overflow:hidden;"><div style="height:100%; width:${Math.max(pct, 2)}%; background:${color};"></div></div>
        <div style="font-size:0.7rem; color:var(--text-muted);">
          ${escapeHtml(r.category)}${r.notifiable ? ' · <strong style="color:var(--danger-red)">ihbarı zorunlu</strong>' : ''}${r.zoonotic ? ' · <strong style="color:var(--warning-orange)">insana bulaşabilir</strong>' : ''}
          · ${URGENCY_LEVELS[r.urgency]?.icon || ''} ${open ? 'Ayrıntıyı gizle ▴' : 'Ayrıntı ▾'}
        </div>
        <div style="font-size:0.72rem; color:var(--accent-green); margin-top:4px;">${r.supporting.slice(0, 4).map(s => `✓ ${escapeHtml(s.label)}`).join(' · ')}</div>
      </button>
      ${open ? `
        <div style="margin-top:10px; border-top:1px solid var(--glass-border); padding-top:10px;">
          <div style="font-size:0.78rem; color:var(--text-secondary); line-height:1.5;">${escapeHtml(r.summary)}</div>
          <div style="font-size:0.68rem; color:var(--text-muted); margin-top:4px;">Etken: ${escapeHtml(r.agent)}</div>
          <div style="font-weight:700; font-size:0.78rem; margin-top:10px; color:var(--text-primary);">Destekleyen</div>
          ${r.supporting.map(s => `<div style="font-size:0.75rem; color:var(--accent-green); padding:2px 0;">✓ ${escapeHtml(s.label)} <span style="color:var(--text-muted);">(${escapeHtml(s.weightLabel)})</span></div>`).join('')}
          ${list(r.contextNotes, 'ⓘ', 'var(--accent-blue)')}
          ${r.against.length ? `<div style="font-weight:700; font-size:0.78rem; margin-top:8px; color:var(--text-primary);">Karşı / zayıflatan</div>${list(r.against, '✗', 'var(--warning-orange)')}` : ''}
          <div style="font-weight:700; font-size:0.78rem; margin-top:10px; color:var(--text-primary);">Ne yapmalı</div>
          ${r.actions.map((a, i) => `<div style="font-size:0.76rem; color:var(--text-secondary); padding:3px 0; line-height:1.45;">${i + 1}. ${escapeHtml(a)}</div>`).join('')}
          <div style="font-weight:700; font-size:0.78rem; margin-top:10px; color:var(--text-primary);">Veteriner hekim neye bakar</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(r.vetChecks)}</div>
          <div style="font-weight:700; font-size:0.78rem; margin-top:10px; color:var(--text-primary);">Korunma</div>
          <div style="font-size:0.75rem; color:var(--text-secondary);">${escapeHtml(r.prevention)}</div>
        </div>` : ''}
    </div>`;
}

function _renderQuestions(result) {
  if (!result.questions.length) return '';
  return `
    <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:var(--accent-purple)"></span>Ayırt Edici Sorular</div>
    <p style="font-size:0.7rem; color:var(--text-muted); margin:-4px var(--space-md) 8px;">Veteriner hekimin soracağı sorular; cevapladıkça sıralama güncellenir.</p>
    ${result.questions.map(q => `
      <div class="glass-card" style="margin:0 var(--space-md) 8px; padding:12px 14px;">
        <div style="font-size:0.82rem; font-weight:700; color:var(--text-primary);">${escapeHtml(q.question)}</div>
        ${q.help ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:3px;">${escapeHtml(q.help)}</div>` : ''}
        ${q.pointsTo.length ? `<div style="font-size:0.68rem; color:var(--accent-blue); margin-top:3px;">"Evet" ise: ${escapeHtml(q.pointsTo.join(', '))}</div>` : ''}
        <div style="display:flex; gap:8px; margin-top:8px;">
          <button type="button" class="dx-answer" data-code="${q.code}" data-value="yes" style="flex:1; padding:8px; border-radius:10px; border:1px solid var(--accent-green); background:rgba(34,197,94,0.12); color:var(--accent-green); font-weight:700; cursor:pointer;">Evet</button>
          <button type="button" class="dx-answer" data-code="${q.code}" data-value="no" style="flex:1; padding:8px; border-radius:10px; border:1px solid rgba(239,68,68,0.5); background:rgba(239,68,68,0.08); color:var(--danger-red); font-weight:700; cursor:pointer;">Hayır</button>
          <button type="button" class="dx-answer" data-code="${q.code}" data-value="skip" style="flex:1; padding:8px; border-radius:10px; border:1px solid var(--glass-border); background:none; color:var(--text-muted); cursor:pointer;">Bilmiyorum</button>
        </div>
      </div>`).join('')}`;
}

// ═══════════════════════════════════════
// Olaylar
// ═══════════════════════════════════════

function _onChange(e) {
  if (e.target.id === 'dx-animal') {
    _skipped.clear();
    _loadAnimal(e.target.value);
    _paint();
  } else if (e.target.id === 'dx-temp') {
    _temperature = e.target.value;
    const t = Number(String(_temperature).replace(',', '.'));
    _tempError = _temperature !== '' && !(Number.isFinite(t) && t >= TEMPERATURE_LIMITS.min && t <= TEMPERATURE_LIMITS.max)
      ? `Isı ${TEMPERATURE_LIMITS.min}–${TEMPERATURE_LIMITS.max} °C arasında olmalı; değerlendirmede kullanılmadı.` : '';
    _paint();
  }
}

async function _onClick(e) {
  const chip = e.target.closest('.dx-chip');
  if (chip) {
    const code = chip.dataset.code;
    const derivedValue = _ctx?.context?.derived?.[code]?.value;
    const current = code in _answers ? _answers[code] : derivedValue;
    // var → yok → bilinmiyor (kayıttan türetilmiş bulgularda var ↔ yok)
    if (current === true) _answers[code] = false;
    else if (current === false && derivedValue === undefined) delete _answers[code];
    else _answers[code] = true;
    _skipped.delete(code);
    _paint();
    return;
  }
  const group = e.target.closest('.dx-group');
  if (group) {
    const id = group.dataset.group;
    if (_openGroups.has(id)) _openGroups.delete(id); else _openGroups.add(id);
    _paint();
    return;
  }
  const res = e.target.closest('.dx-result');
  if (res) {
    _openResult = _openResult === res.dataset.id ? null : res.dataset.id;
    _paint();
    return;
  }
  const ans = e.target.closest('.dx-answer');
  if (ans) {
    const code = ans.dataset.code;
    if (ans.dataset.value === 'skip') {
      delete _answers[code];
      _skipped.add(code);
    } else if (code === 'fever' && _temperatureValue() === null) {
      _answers.fever = ans.dataset.value === 'yes';
    } else {
      _answers[code] = ans.dataset.value === 'yes';
    }
    const f = FINDINGS.find(x => x.code === code);
    if (f) _openGroups.add(f.group);
    _paint();
    return;
  }
  if (e.target.closest('#dx-reset')) {
    _skipped.clear();
    _loadAnimal(_animalId, _observationId);
    _paint();
    return;
  }
  if (e.target.closest('#dx-save')) {
    await _save();
  }
}

async function _save() {
  const result = _result();
  if (_tempError) {
    await showAlert('Isı Geçersiz', _tempError, '⚠️');
    return;
  }
  const res = saveDiagnosis(_animalId, {
    answers: result.answers,
    temperature: _temperatureValue(),
    result,
    observationId: _observationId
  });
  if (!res.success) {
    await showAlert('Kaydedilemedi', res.message, '⚠️');
    return;
  }
  const top = result.results[0];
  const go = await showConfirm('Değerlendirme Kaydedildi',
    `${res.message}\n\nEn olası: ${top.name} (%${Math.round(top.probability * 100)}).\n${URGENCY_LEVELS[result.urgency]?.label || ''}\n\nHayvanın sağlık geçmişine gidilsin mi?`, '✅');
  if (go) {
    setState({ activeAnimalId: _animalId });
    setProfileTab('health');
    navigateTo('animal-profile');
  }
}
