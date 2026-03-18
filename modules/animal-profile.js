/**
 * ShepherdAI — Hayvan Profili ve Genetik Pasaport Modülü (Tabbed Structure)
 */

import { animalData, breedingMockRam } from '../data/mock-data.js';
import { getState, getAnimalById, setState } from '../core/state.js';
import { showAlert, showPrompt } from '../core/modal.js';
import { navigateTo } from '../core/router.js';
import { checkInbreeding, calculateCompatibility, calculateBirthDate } from '../core/breedingManager.js';
import { calculateAnimalROI } from '../core/financeEngine.js';

let _container = null;
let _activeTab = 'info'; // 'info', 'passport', 'breeding', 'health', 'finance'
let _breedingViewMode = 'mating';

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter passport-page';
  _container.style.paddingBottom = '180px';
  
  const state = getState();
  const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
  const rawAnimal = getAnimalById(activeId) || {};
  
  const currentAnimal = {
    tagID: rawAnimal.id || animalData.tagID,
    rfidCode: rawAnimal.rfid || animalData.rfidCode,
    breed: rawAnimal.breed ? `${rawAnimal.breed} ${rawAnimal.type || ''}` : animalData.breed,
    gender: rawAnimal.gender || animalData.gender,
    currentWeight: rawAnimal.weight || animalData.currentWeight,
    birthDate: rawAnimal.birthDate || animalData.birthDate,
    birthWeight: rawAnimal.birthWeight || animalData.birthWeight,
    bcsScore: rawAnimal.bcs || animalData.bcsScore,
    healthStatus: rawAnimal.status || animalData.healthStatus,
    geneticsScore: rawAnimal.yieldScore || animalData.geneticsScore,
    focus: rawAnimal.focus || 'meat',
    lineage: rawAnimal.lineage || animalData.lineage,
    genetics: rawAnimal.genetics || animalData.genetics || { meat: 80, milk: 50, fertility: 75, resistance: 90, growth: 85 }
  };

  const headerHtml = `
    <div class="animal-header">
      <div class="animal-icon-wrapper">
        ${currentAnimal.breed.includes('Keçi') || currentAnimal.breed.includes('Oğlak') || currentAnimal.breed.includes('Teke') ? '🐐' : '🐑'}
      </div>
      <div class="animal-info-main">
        <div class="animal-tag">
          ${currentAnimal.tagID}
          <div class="animal-status-indicator ${currentAnimal.healthStatus}"></div>
        </div>
        <div class="animal-breed">${currentAnimal.breed} • ${currentAnimal.rfidCode}</div>
      </div>
    </div>
  `;

  const tabsHtml = `
    <div style="display:flex; justify-content:center; border-bottom:1px solid var(--glass-border); margin-top:var(--space-md); margin-bottom:var(--space-md); overflow-x:auto; scrollbar-width:none; padding-bottom:8px;">
      <button class="tab-btn ${_activeTab === 'info' ? 'active' : ''}" data-tab="info" style="flex:none; padding:12px 16px; background:none; border:none; color:${_activeTab==='info'?'var(--accent-blue)':'var(--text-secondary)'}; border-bottom:${_activeTab==='info'?'2px solid var(--accent-blue)':'2px solid transparent'}; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.2s;">
        Bilgiler
      </button>
      <button class="tab-btn ${_activeTab === 'health' ? 'active' : ''}" data-tab="health" style="flex:none; padding:12px 16px; background:none; border:none; color:${_activeTab==='health'?'var(--danger-red)':'var(--text-secondary)'}; border-bottom:${_activeTab==='health'?'2px solid var(--danger-red)':'2px solid transparent'}; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.2s;">
        Sağlık
      </button>
      <button class="tab-btn ${_activeTab === 'breeding' ? 'active' : ''}" data-tab="breeding" style="flex:none; padding:12px 16px; background:none; border:none; color:${_activeTab==='breeding'?'var(--warning-orange)':'var(--text-secondary)'}; border-bottom:${_activeTab==='breeding'?'2px solid var(--warning-orange)':'2px solid transparent'}; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.2s;">
        Eşleşme
      </button>
      <button class="tab-btn ${_activeTab === 'finance' ? 'active' : ''}" data-tab="finance" style="flex:none; padding:12px 16px; background:none; border:none; color:${_activeTab==='finance'?'var(--accent-amber)':'var(--text-secondary)'}; border-bottom:${_activeTab==='finance'?'2px solid var(--accent-amber)':'2px solid transparent'}; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.2s;">
        Finans
      </button>
      <button class="tab-btn ${_activeTab === 'passport' ? 'active' : ''}" data-tab="passport" style="flex:none; padding:12px 16px; background:none; border:none; color:${_activeTab==='passport'?'var(--accent-purple)':'var(--text-secondary)'}; border-bottom:${_activeTab==='passport'?'2px solid var(--accent-purple)':'2px solid transparent'}; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.2s;">
        Pasaport
      </button>
    </div>
  `;

  let tabContentHtml = '';
  if (_activeTab === 'info') tabContentHtml = _renderInfoTab(currentAnimal);
  else if (_activeTab === 'passport') tabContentHtml = _renderPassportTab(currentAnimal);
  else if (_activeTab === 'breeding') tabContentHtml = _renderBreedingTab(currentAnimal, state.focusMode);
  else if (_activeTab === 'health') tabContentHtml = _renderHealthTab(currentAnimal);
  else if (_activeTab === 'finance') tabContentHtml = _renderFinanceTab(currentAnimal);

  _container.innerHTML = `
    <div style="margin-bottom: var(--space-md);">
      <button class="btn-secondary" style="padding:4px 12px; border-radius:12px; font-size:var(--font-size-xs)" id="btn-back">
        ← Sürü Listesine Dön
      </button>
    </div>
    ${headerHtml}
    ${tabsHtml}
    <div class="tab-content-layer fade-in">
      ${tabContentHtml}
    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const backBtn = _container.querySelector('#btn-back');
  if (backBtn) {
    backBtn.addEventListener('click', () => {
      navigateTo('herd-list');
    });
  }

  _container.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      _activeTab = e.currentTarget.dataset.tab;
      const parent = _container.parentNode;
      const scrollPos = window.scrollY;
      parent.innerHTML = '';
      parent.appendChild(render());
      init();
      window.scrollTo(0, scrollPos);
    });
  });

  if (_activeTab === 'info') _initInfoTab();
  if (_activeTab === 'passport') _initPassportTab();
  if (_activeTab === 'breeding') _initBreedingTab();
  if (_activeTab === 'health') _initHealthTab();
  if (_activeTab === 'finance') _initFinanceTab();
}

// ═══════════════════════════════════════
// Tab: INFO
// ═══════════════════════════════════════
function _renderInfoTab(animal) {
  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-blue)"></span>Bireysel Verim Odağı</div>
    <div class="focus-selector" style="margin-bottom:var(--space-2xl);">
      <button class="focus-btn ${animal.focus === 'meat' ? 'active' : ''}" data-focus="meat" data-id="${animal.tagID}">
        <span class="focus-icon">🥩</span>Et
      </button>
      <button class="focus-btn ${animal.focus === 'milk' ? 'active' : ''}" data-focus="milk" data-id="${animal.tagID}">
        <span class="focus-icon">🥛</span>Süt
      </button>
      <button class="focus-btn ${animal.focus === 'breed' ? 'active' : ''}" data-focus="breed" data-id="${animal.tagID}">
        <span class="focus-icon">🧬</span>Döl
      </button>
    </div>

    <div class="animal-data-grid">
      <div class="animal-data-card">
        <span class="animal-data-label">Ağırlık</span>
        <span class="animal-data-value" id="disp-weight">${animal.currentWeight} kg</span>
      </div>
      <div class="animal-data-card">
        <span class="animal-data-label">Yaş</span>
        <span class="animal-data-value">${_calculateAge(animal.birthDate)}</span>
      </div>
      <div class="animal-data-card">
        <span class="animal-data-label">Cinsiyet</span>
        <span class="animal-data-value">${animal.gender}</span>
      </div>
      <div class="animal-data-card full-span" style="grid-column: span 3; flex-direction: row; justify-content: space-between;">
        <span class="animal-data-label">Doğum Ağırlığı: <strong style="color:var(--text-primary)">${animal.birthWeight} kg</strong></span>
        <span class="animal-data-label">Genetik Skor: <strong style="color:var(--accent-green)">${animal.geneticsScore}/100</strong></span>
      </div>
    </div>

    <!-- BCS Section -->
    <div class="section-title" style="margin-top:var(--space-xl)"><span class="dot" style="background:var(--accent-cyan)"></span>Vücut Kondisyonu (BCS)</div>
    <div class="glass-card bcs-container">
      <div class="bcs-header">
        <span style="font-size:var(--font-size-sm);color:var(--text-secondary)">Yağlılık Skoru</span>
        <span class="bcs-value" id="bcs-display">${animal.bcsScore}</span>
      </div>
      <div class="bcs-slider-wrapper">
        <input type="range" min="1" max="5" step="0.5" value="${animal.bcsScore}" class="bcs-slider" id="bcs-input" data-tag="${animal.tagID}">
        <div class="bcs-marks">
          <span>Zayıf (1)</span>
          <span>İdeal (3)</span>
          <span>Yağlı (5)</span>
        </div>
      </div>
    </div>

    <div class="bottom-action-container" style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2);">
      <div style="display:flex; flex-direction:column; gap:var(--space-sm);">
        <button class="huge-btn btn-secondary" style="border-radius:20px; padding:14px;" id="btn-update-weight">
          <span class="btn-icon">⚖️</span> Tartım Kaydı Gir
        </button>
      </div>
    </div>
  `;
}

function _initInfoTab() {
  _container.querySelectorAll('.focus-btn[data-focus]').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const btnEl = e.currentTarget;
      const newFocus = btnEl.dataset.focus;
      const animalId = btnEl.dataset.id;

      // Update state for this specific animal
      const state = getState();
      const animals = [...state.animals];
      const idx = animals.findIndex(a => a.id === animalId);
      if (idx > -1) {
        animals[idx] = { ...animals[idx], focus: newFocus };
        setState({ animals });

        // Re-render
        const parent = _container.parentNode;
        const scrollPos = window.scrollY;
        parent.innerHTML = '';
        parent.appendChild(render());
        init();
        window.scrollTo(0, scrollPos);
      }
    });
  });

  const bcsInput = _container.querySelector('#bcs-input');
  const bcsDisplay = _container.querySelector('#bcs-display');
  if(bcsInput && bcsDisplay) {
    bcsInput.addEventListener('input', (e) => {
      bcsDisplay.textContent = e.target.value;
      const val = parseFloat(e.target.value);
      if (val < 2 || val > 4) {
        bcsDisplay.style.color = 'var(--warning-orange)';
        bcsDisplay.style.background = 'var(--warning-orange-glow)';
      } else {
        bcsDisplay.style.color = 'var(--accent-cyan)';
        bcsDisplay.style.background = 'var(--accent-cyan-glow)';
      }
    });
  }

  const btnWeight = _container.querySelector('#btn-update-weight');
  const dispWeight = _container.querySelector('#disp-weight');
  if (btnWeight) {
    btnWeight.addEventListener('click', async () => {
      const currentVal = dispWeight ? dispWeight.innerText : '';
      const newWeight = await showPrompt('Ağırlık Güncelle', `Mevcut Ağırlık: ${currentVal}\nYeni ağırlığı giriniz:`, 'number', '⚖️');
      if (newWeight && !isNaN(newWeight)) {
        if(dispWeight) dispWeight.innerText = newWeight + ' kg';
        showAlert('Başarılı', `Ağırlık kaydedildi.\nGünlük canlı ağırlık artışı (GCAA) hesaplandı.`, '✅');
      }
    });
  }
}

// ═══════════════════════════════════════
// Tab: PASSPORT
// ═══════════════════════════════════════
function _renderPassportTab(animal) {
  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-purple)"></span>Soy Ağacı</div>
    <div class="glass-card lineage-tree">
      <div class="lineage-parents">
        <div class="lineage-node">
          <span class="label">Anne</span>
          <span>${animal.lineage?.mother || 'Bilinmiyor'}</span>
        </div>
        <div class="lineage-node">
          <span class="label">Baba</span>
          <span>${animal.lineage?.father || 'Bilinmiyor'}</span>
        </div>
      </div>
      <div class="lineage-connector"></div>
      <div class="lineage-node lineage-current">
        <span class="label">Mevcut</span>
        <span>${animal.tagID}</span>
      </div>
    </div>

    <div class="bottom-action-container" style="position:relative !important; margin-top:var(--space-2xl); width:calc(100% - var(--space-lg)*2);">
      <button class="huge-btn btn-secondary" id="btn-share" style="width:100%; border-radius:20px; padding:14px; border:1px solid rgba(168,85,247,0.4);">
        <span class="btn-icon">🔗</span> Dijital Pasaportu Paylaş
      </button>
    </div>
  `;
}

function _initPassportTab() {
  const btnShare = _container.querySelector('#btn-share');
  if (btnShare) {
    btnShare.addEventListener('click', () => showAlert('Genetik Pasaport', `[SIM] Bu hayvanın pasaportu WhatsApp vb. ile paylaşıldı.`, '🔗'));
  }
}

// ═══════════════════════════════════════
// Tab: BREEDING (Islah & Eşleşme)
// ═══════════════════════════════════════
function _renderBreedingTab(animal, focusMode) {
  const inbreedingResult = checkInbreeding(animal.tagID, breedingMockRam.tagID);
  const compatibilityScore = calculateCompatibility(animal.tagID, breedingMockRam.tagID, focusMode);
  
  const matingDateMock = new Date();
  matingDateMock.setDate(matingDateMock.getDate() - 138); 
  const pregData = calculateBirthDate(matingDateMock);

  const isMating = _breedingViewMode === 'mating';

  const modeHtml = `
    <div style="display:flex; justify-content:center; margin-bottom:var(--space-md);">
      <button id="btn-mode-toggle" class="btn-secondary" style="font-size:0.75rem; padding:6px 16px; border-radius:12px;">
        Gösterim: ${isMating ? '🟠 Potansiyel Eşleşme Matrisi' : '🟣 Gebelik Takvimi'}
      </button>
    </div>
  `;

  let innerHtml = '';
  if (isMating) {
    innerHtml = `
      ${inbreedingResult.hasRisk ? `
        <div class="inbreeding-alert">
          <strong>⚠️ YÜKSEK AKRABALIK RİSKİ!</strong>
          <span>Ortak Ata: ${inbreedingResult.commonAncestors.join(', ')}</span>
        </div>
      ` : ''}

      <div class="glass-card mating-card">
        <div class="animals-vs">
          <div class="mating-animal">
            <span class="m-icon">🐑</span>
            <span class="m-tag">${animal.tagID}</span>
            <span class="m-role">Anaç</span>
          </div>
          <div class="mating-score-circle ${inbreedingResult.hasRisk ? 'risk' : 'safe'}">
            <span class="s-val">%${compatibilityScore}</span>
            <span class="s-lbl">Uyum Skoru</span>
          </div>
          <div class="mating-animal">
            <span class="m-icon" style="filter: hue-rotate(45deg);">🐏</span>
            <span class="m-tag">${breedingMockRam.tagID}</span>
            <span class="m-role">Seçili Damızlık</span>
          </div>
        </div>
      </div>

      <div class="section-title" style="margin-top:var(--space-lg)"><span class="dot" style="background:var(--accent-orange)"></span>Genetik Radar</div>
      <div class="glass-card radar-container">
        ${_generateRadarChart(animal.genetics, breedingMockRam.genetics)}
        <div class="radar-legend">
          <div class="r-leg-item"><span class="r-color-box ewe-c"></span> ${animal.tagID}</div>
          <div class="r-leg-item"><span class="r-color-box ram-c"></span> ${breedingMockRam.tagID}</div>
        </div>
      </div>
      
      <button class="huge-btn btn-primary" id="btn-record-mating" style="width:100%; margin-top:20px; border-radius:24px; padding:16px; background:#f97316; box-shadow:0 4px 16px rgba(249,115,22,0.4);">
        <span class="btn-icon">🔗</span> Aşım Kaydet
      </button>
    `;
  } else {
    innerHtml = `
      <div class="pregnancy-header">
        <span class="preg-icon">🤰</span> Gebelik Durumu
      </div>
      <div class="glass-card pregnancy-card ${pregData.isCritical ? 'critical-glow' : 'safe-glow'}">
        <div class="preg-title">Doğuma Kalan Tahmini Süre</div>
        <div class="preg-countdown">
          <span class="num">${pregData.daysLeft}</span>
          <span class="lbl">GÜN</span>
        </div>
        <div class="preg-date">Beklenen: <strong>${pregData.expectedDate.toLocaleDateString('tr-TR', {day:'numeric', month:'long'})}</strong></div>
        <div class="preg-progress-container" style="margin-top:16px;">
          <div class="preg-progress-bar" style="width: ${((150 - pregData.daysLeft) / 150) * 100}%;"></div>
        </div>
      </div>
      <button class="huge-btn btn-primary" id="btn-ultrasound" style="width:100%; margin-top:20px; border-radius:24px; padding:16px; background:#a855f7; box-shadow:0 4px 16px rgba(168,85,247,0.4);">
        <span class="btn-icon">🩺</span> Ultrason Onayı
      </button>
    `;
  }

  return modeHtml + innerHtml;
}

function _initBreedingTab() {
  const btnToggle = _container.querySelector('#btn-mode-toggle');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      _breedingViewMode = _breedingViewMode === 'mating' ? 'pregnant' : 'mating';
      const parent = _container.parentNode;
      const scrollPos = window.scrollY;
      parent.innerHTML = '';
      parent.appendChild(render());
      init();
      window.scrollTo(0, scrollPos);
    });
  }

  const btnMate = _container.querySelector('#btn-record-mating');
  if (btnMate) {
    btnMate.addEventListener('click', async () => {
      const state = getState();
      const animals = [...state.animals];
      const activeId = state.activeAnimalId || (animals.length > 0 ? animals[0].id : null);
      const idx = animals.findIndex(a => a.id === activeId);
      
      if (idx > -1) {
        animals[idx] = { ...animals[idx], healthStatus: 'pregnant' };
        setState({ animals });
        _breedingViewMode = 'pregnant';
        
        // Re-render
        const parent = _container.parentNode;
        const scrollPos = window.scrollY;
        parent.innerHTML = '';
        parent.appendChild(render());
        init();
        window.scrollTo(0, scrollPos);
        
        showAlert('Başarılı', `Aşım kaydı alındı. ${animals[idx].tagID} artık Gebe (Pregnant) statüsünde takip edilecek.`, '✅');
      }
    });
  }

  const btnUltrasound = _container.querySelector('#btn-ultrasound');
  if (btnUltrasound) btnUltrasound.addEventListener('click', () => showAlert('Ultrason', '[SIM] Gebelik kesinleştirildi.', '🩺'));
}

// ═══════════════════════════════════════
// Tab: HEALTH
// ═══════════════════════════════════════
function _renderHealthTab(animal) {
  return `
    <div class="section-title"><span class="dot" style="background:var(--danger-red)"></span>Bireysel Arınma Durumu</div>
    <div class="glass-card withdrawal-card" style="margin-bottom:var(--space-2xl);">
      <div class="withdrawal-header">
        <span class="warning-icon">⛔</span>
        <strong>SATIŞ / TÜKETİM YASAĞI</strong>
      </div>
      <div class="withdrawal-body">
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px">Son ilaç: <strong>Oksitetrasiklin %20</strong></p>
        <div class="withdrawal-grid">
          <div class="w-item">
            <span class="w-label">Et Tüketimi İçin Kalan</span>
            <span class="w-value red">14 GÜN</span>
          </div>
          <div class="w-item">
            <span class="w-label">Süt Tüketimi İçin Kalan</span>
            <span class="w-value red">0 GÜN</span>
          </div>
        </div>
      </div>
    </div>

    <div class="section-title"><span class="dot" style="background:#a855f7"></span>Bireysel Aşı & Tedavi Geçmişi</div>
    <div class="glass-card agenda-list" style="margin-bottom:var(--space-xl);">
      ${_renderIndividualVaccines(animal)}
    </div>

    <div style="display:flex; flex-direction:column; gap:12px; position:relative !important; width:calc(100% - var(--space-lg)*2); margin:0 auto var(--space-xl) auto;">
      <button class="huge-btn btn-primary" id="btn-ind-med" style="width:100%; border-radius:24px; padding:16px; background:var(--accent-red); box-shadow:0 4px 16px rgba(239,68,68,0.4);">
        <span class="btn-icon">💉</span> Aşı / Tedavi Ekle
      </button>
      <button class="huge-btn btn-secondary" id="btn-ind-disease" style="width:100%; border-radius:24px; padding:16px;">
        <span class="btn-icon">🤒</span> Hastalık / Belirti Kaydet
      </button>
      <button class="huge-btn btn-secondary" id="btn-ind-ai" style="width:100%; border-radius:24px; padding:16px; background:var(--glass-bg); border:1px dashed var(--accent-cyan);">
        <span class="btn-icon">🤖</span> AI Bireysel Teşhis
      </button>
    </div>
  `;
}

function _initHealthTab() {
  const btnMed = _container.querySelector('#btn-ind-med');
  if (btnMed) {
    btnMed.addEventListener('click', async () => {
      const vName = await showPrompt('Aşı & Tedavi', `Bu hayvan (TR-...) için eklenecek ilacı/aşıyı giriniz:`, 'text', '💉');
      if (vName) {
        // global state e ekle
        const state = getState();
        const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
        const rawAnimal = getAnimalById(activeId) || {};
        const tagToUse = rawAnimal.tagID || 'TR-102';
        
        const newV = {
          id: Date.now(),
          name: vName,
          date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
          status: 'done',
          target: tagToUse
        };
        setState({ vaccines: [newV, ...(state.vaccines || [])] });

        // Re-render
        const parent = _container.parentNode;
        const scrollPos = window.scrollY;
        parent.innerHTML = '';
        parent.appendChild(render());
        init();
        window.scrollTo(0, scrollPos);
        showAlert('Başarılı', `${vName} aşısı ${tagToUse} için kaydedildi.`, '✅');
      }
    });
  }

  const btnDisease = _container.querySelector('#btn-ind-disease');
  if (btnDisease) btnDisease.addEventListener('click', () => showAlert('Hastalık Kaydı', '[SIM] Bu hayvanda görülen belirti veya koyulan teşhisi kaydet.', '🤒'));

  const btnAi = _container.querySelector('#btn-ind-ai');
  if (btnAi) btnAi.addEventListener('click', () => showAlert('Yapay Zeka Teşhisi', '[SIM] Yapay zeka ile bireysel semptom izleme paneli', '🤖'));
}

function _renderIndividualVaccines(animal) {
  const state = getState();
  const indVaccines = (state.vaccines || []).filter(v => v.target.includes(animal.tagID));
  if (indVaccines.length === 0) {
    return '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:10px;">Kayıtlı bireysel aşı/tedavi bulunmuyor.</p>';
  }
  return indVaccines.map(v => `
    <div class="agenda-item ${v.status}">
      <div class="agenda-indicator"></div>
      <div class="agenda-info" style="flex:1;">
        <span class="agenda-name">${v.name}</span>
        <span class="agenda-date" style="margin-top:4px; display:block;">${v.status === 'done' ? v.date + ' (Tamamlandı)' : v.date}</span>
      </div>
      ${v.status === 'done' ? '<span class="agenda-done-icon">✔️</span>' : ''}
    </div>
  `).join('');
}

// ═══════════════════════════════════════
// Tab: FINANCE
// ═══════════════════════════════════════
function _renderFinanceTab(animal) {
  const roiData = calculateAnimalROI(animal.tagID);
  if (!roiData) return '<p>ROI verisi bulunamadı.</p>';

  const width = 120, height = 40;
  const points = roiData.sparklineData;
  const min = Math.min(...points), max = Math.max(...points);
  const range = max - min || 1;
  const stepX = width / (points.length - 1);
  const d = points.map((p, i) => `${i===0?'M':'L'} ${i*stepX} ${height - ((p - min) / range) * height}`).join(' ');

  const isProfit = roiData.profitLoss > 0;
  const colorClass = isProfit ? 'emerald-glow' : 'red-glow';
  const colorHex = isProfit ? '#10b981' : '#ef4444';

  return `
    <div class="section-title"><span class="dot" style="background:#fbbf24"></span>Bireysel Kârlılık (ROI)</div>
    <div class="fintech-header" style="margin-bottom:var(--space-2xl);">
      <div class="fintech-header-top">
        <div>
          <h2 style="font-size:var(--font-size-md); font-weight:700; color:var(--text-primary)">Analiz (${animal.tagID})</h2>
          <p style="font-size:var(--font-size-sm); color:var(--text-muted)">Güncel Piyasa Değeri</p>
        </div>
        <div class="fintech-value ${colorClass}">
          ${(roiData.netValue || 0).toLocaleString('tr-TR')} ₺
        </div>
      </div>
      <div class="fintech-header-bottom">
        <div class="fintech-stats">
          <div class="stat-group">
            <span class="label">Net Kâr/Zarar</span>
            <span class="val ${isProfit?'text-emerald':'text-red'}">${isProfit?'+':''}${roiData.profitLoss.toLocaleString('tr-TR')} ₺</span>
          </div>
          <div class="stat-group">
            <span class="label">ROI</span>
            <span class="val ${isProfit?'text-emerald':'text-red'}">%${roiData.roiPercentage}</span>
          </div>
        </div>
        <div class="sparkline-container">
          <svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
            <path d="${d}" fill="none" stroke="${colorHex}" stroke-width="2" vector-effect="non-scaling-stroke" />
            <path d="${d} L ${width} ${height} L 0 ${height} Z" fill="url(#sparkGradientInd)" stroke="none" opacity="0.2"/>
            <defs>
              <linearGradient id="sparkGradientInd" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stop-color="${colorHex}" />
                <stop offset="100%" stop-color="transparent" />
              </linearGradient>
            </defs>
          </svg>
        </div>
      </div>
    </div>

    <div class="bottom-action-container" style="position:relative !important; width:calc(100% - var(--space-lg)*2);">
      <button class="huge-btn btn-secondary" id="btn-sell-ind" style="width:100%; border-radius:24px; padding:16px;">
        <span class="btn-icon">💰</span> Bireysel Satış & Kesim
      </button>
    </div>
  `;
}

function _initFinanceTab() {
  const btnSell = _container.querySelector('#btn-sell-ind');
  if (btnSell) btnSell.addEventListener('click', () => showAlert('Hızlı Satış', '[SIM] Bu hayvanı satıldığında ROI kaydı arşivlenir.', '💰'));
}

// ── Helpers ──
function _calculateAge(birthDateString) {
  if(!birthDateString) return '1.5 Yaşında';
  const birth = new Date(birthDateString);
  const now = new Date('2026-03-18'); 
  let months = (now.getFullYear() - birth.getFullYear()) * 12;
  months -= birth.getMonth();
  months += now.getMonth();
  if (months < 12) return `${months} Aylık`;
  const years = Math.floor(months / 12);
  const remainder = months % 12;
  return remainder > 0 ? `${years}Y ${remainder}A` : `${years} Yaşında`;
}

function _generateRadarChart(dataA, dataB) {
  const size = 180;
  const cx = size / 2, cy = size / 2, r = 70;
  const angles = [-Math.PI/2, -Math.PI/2+(2*Math.PI)/5, -Math.PI/2+(4*Math.PI)/5, -Math.PI/2+(6*Math.PI)/5, -Math.PI/2+(8*Math.PI)/5];
  const labels = ['Et', 'Süt', 'Döl', 'Direnç', 'Büyüme'];

  let bgHtml = '';
  [0.2, 0.4, 0.6, 0.8, 1.0].forEach(l => {
    const pts = angles.map(a => `${cx + Math.cos(a)*(r*l)},${cy + Math.sin(a)*(r*l)}`).join(' ');
    bgHtml += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  let axisHtml = '', labelHtml = '';
  angles.forEach((a, i) => {
    const px = cx + Math.cos(a)*r, py = cy + Math.sin(a)*r;
    axisHtml += `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
    const lx = cx + Math.cos(a)*(r + 15), ly = cy + Math.sin(a)*(r + 15);
    labelHtml += `<text x="${lx}" y="${ly}" fill="var(--text-muted)" font-size="8" text-anchor="middle" dominant-baseline="middle">${labels[i]}</text>`;
  });

  const getPts = (d) => [d.meat, d.milk, d.fertility, d.resistance, d.growth].map((val, i) => {
    const l = val / 100;
    return `${cx + Math.cos(angles[i])*(r*l)},${cy + Math.sin(angles[i])*(r*l)}`;
  }).join(' ');

  const oA = getPts(dataA), oB = getPts(dataB);
  return `
    <div style="display:flex; justify-content:center;">
      <svg width="${size}" height="${size}">
        ${bgHtml} ${axisHtml}
        <polygon points="${oA}" fill="var(--accent-green)" fill-opacity="0.3" stroke="var(--accent-green)" stroke-width="2"/>
        <polygon points="${oB}" fill="#f97316" fill-opacity="0.3" stroke="#f97316" stroke-width="2"/>
        ${labelHtml}
      </svg>
    </div>
  `;
}
