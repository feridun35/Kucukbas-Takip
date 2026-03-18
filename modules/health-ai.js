/**
 * ShepherdAI — Yapay Zeka Teşhis Modülü
 */
import { evaluateSymptoms } from '../core/healthManager.js';
import { getState } from '../core/state.js';
import { showAlert } from '../core/modal.js';

let _container = null;
let selectedSymptoms = new Set();
let isQuarantine = false;

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter health-page';
  _container.style.paddingBottom = '110px';
  selectedSymptoms.clear();

  _container.innerHTML = `
    ${_renderHeader()}
    ${_renderSymptomChecklist()}
    <div id="ai-result-container"></div>
    
    <div style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto;">
      <button class="huge-btn btn-secondary" id="btn-submit-symptom" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem;">
        <span class="btn-icon">🤖</span> Sürü Genel Risk Analizi Başlat
      </button>
    </div>
  `;
  return _container;
}

export function init() {
  if (!_container) return;

  _container.querySelectorAll('.symptom-checkbox').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const parentCard = e.target.closest('.symptom-item');
      if (e.target.checked) {
        selectedSymptoms.add(e.target.value);
        parentCard.classList.add('selected');
      } else {
        selectedSymptoms.delete(e.target.value);
        parentCard.classList.remove('selected');
      }
    });
  });

  const btnSymptom = _container.querySelector('#btn-submit-symptom');
  if (btnSymptom) {
    btnSymptom.addEventListener('click', () => {
      if (selectedSymptoms.size === 0) {
        showAlert('Eksik Bilgi', 'Lütfen en az bir semptom seçin.', '❌');
      } else {
        _updateAIRecommendation();
      }
    });
  }
}

function _renderHeader() {
  return `
    <div class="health-header ${isQuarantine ? 'quarantine-aura' : ''}" style="margin:var(--space-md)">
      <div class="header-base-info">
        <div class="med-icon">🩺</div>
        <div>
          <h1 style="font-size:var(--font-size-md); font-weight:700">Yapay Zeka Teşhis Modülü</h1>
          <p style="font-size:var(--font-size-xs); color:var(--text-secondary)">Lütfen belirtileri seçin.</p>
        </div>
      </div>
    </div>
  `;
}

function _renderSymptomChecklist() {
  const symptoms = [
    { id: 'lameness', label: 'Topallama', icon: '🦶' },
    { id: 'mouth_lesion', label: 'Ağızda Yara/Köpük', icon: '👄' },
    { id: 'cough', label: 'Öksürük', icon: '💨' },
    { id: 'nasal_discharge', label: 'Burun Akıntısı', icon: '💧' },
    { id: 'diarrhea', label: 'İshal', icon: '💩' },
    { id: 'lethargy', label: 'Aşırı Durgunluk', icon: '😴' },
    { id: 'udder_swelling', label: 'Memede Şişlik/Ateş', icon: '🥛' },
  ];

  const items = symptoms.map(s => `
    <label class="glass-card symptom-item">
      <input type="checkbox" class="symptom-checkbox visually-hidden" value="${s.id}">
      <div class="symptom-content">
        <span class="symptom-icon">${s.icon}</span>
        <span class="symptom-text">${s.label}</span>
      </div>
      <div class="symptom-check-circle"></div>
    </label>
  `).join('');

  return `
    <div class="section-title"><span class="dot" style="background:#06b6d4;"></span>Semptom Listesi</div>
    <div class="symptoms-grid">${items}</div>
  `;
}

function _updateAIRecommendation() {
  const container = document.getElementById('ai-result-container');
  if (!container || selectedSymptoms.size === 0) return;

  const testAnimalId = getState().animals?.[0]?.id || 'TR-102';
  const result = evaluateSymptoms(testAnimalId, Array.from(selectedSymptoms));
  let riskColor = 'var(--text-primary)', riskBg = 'var(--glass-bg)', riskBorder = 'var(--glass-border)';

  if (result.riskLevel === 'danger') {
    riskColor = '#ef4444'; riskBg = 'rgba(239,68,68,0.08)'; riskBorder = 'rgba(239,68,68,0.3)';
    _container.querySelector('.health-header').classList.add('quarantine-aura');
  } else if (result.riskLevel === 'warning') {
    riskColor = '#f59e0b'; riskBg = 'rgba(245,158,11,0.08)'; riskBorder = 'rgba(245,158,11,0.3)';
    _container.querySelector('.health-header').classList.remove('quarantine-aura');
  }

  container.innerHTML = `
    <div class="ai-diagnosis-card" style="background:${riskBg}; border:1px solid ${riskBorder}; margin:var(--space-md);">
      <div class="ai-d-header">
        <span class="ai-icon">🤖</span>
        <strong style="color:${riskColor}">AI Teşhis Sonucu</strong>
      </div>
      <div class="ai-d-body">
        <p class="ai-diseases"><strong>Olası Hastalık(lar):</strong> ${result.possibleDiseases.join(', ')}</p>
        <p class="ai-recommendation">${result.recommendation}</p>
      </div>
      <div class="ai-disclaimer">${result.disclaimer}</div>
    </div>
  `;
}
