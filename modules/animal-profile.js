/**
 * ShepherdAI — Hayvan Profili ve Genetik Pasaport Modülü (Tabbed Structure)
 */

import { animalData } from '../data/mock-data.js';
import { getState, getAnimalById, setState } from '../core/state.js';
import { showAlert, showPrompt, showConfirm, showSelect, showFormModal } from '../core/modal.js';
import { navigateTo } from '../core/router.js';
import { calculateCompatibility, calculateBirthDate, checkInbreedingRisk, recordBirth } from '../core/breedingManager.js';
import { parseDate } from '../core/herdMathEngine.js';
import { calculateAnimalROI } from '../core/financeEngine.js';
import { getTasksForUser, getTaskHistory, addTask, completeTask, TASK_TYPES } from '../core/workforceManager.js';
import { getAnimalWithdrawalStatus } from '../core/healthManager.js';
import { openTreatmentModal } from './treatment-modal.js';
import { openBreedingModal } from './breeding-modal.js';

let _container = null;
let _activeTab = 'info'; // 'info', 'passport', 'breeding', 'health', 'finance', 'tasks'
let _breedingViewMode = 'mating';

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter passport-page';
  _container.style.paddingBottom = '180px';
  
  const state = getState();
  const animals = state.animals || [];

  if (animals.length === 0) {
    _container.innerHTML = `
      <div class="animal-header" style="justify-content:center; text-align:center;">
        <h2 style="font-size:1.3rem; font-weight:700;">Hayvan Pasaportu</h2>
      </div>
      <div class="glass-card" style="text-align:center; padding:48px 24px; border-radius:24px; border:1px dashed rgba(255,255,255,0.18); background:rgba(255,255,255,0.02); margin:20px 0;">
        <div style="font-size:3.5rem; margin-bottom:14px;">🐑</div>
        <h3 style="font-size:1.15rem; font-weight:700; color:var(--text-primary); margin-bottom:8px;">
          Henüz kayıtlı hayvan bulunmuyor. İlk hayvanınızı ekleyin
        </h3>
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:24px; max-width:300px; margin-left:auto; margin-right:auto; line-height:1.5;">
          Bireysel sağlık, verim ve soyağacı pasaportunu görüntülemek için önce sürüye bir hayvan ekleyin.
        </p>
        <button id="btn-empty-goto-herd" class="btn-primary" style="padding:14px 28px; border-radius:18px; font-weight:700; font-size:1rem; box-shadow:0 4px 20px rgba(34,197,94,0.35); cursor:pointer;">
          📋 Sürü Listesine Git & Ekle
        </button>
      </div>
    `;
    return _container;
  }

  const activeId = state.activeAnimalId || (animals.length > 0 ? animals[0].id : null);
  const rawAnimal = getAnimalById(activeId) || animals[0] || {};
  
  const currentAnimal = {
    tagID: rawAnimal.id || animalData.tagID,
    nickname: rawAnimal.nickname || '',
    rfidCode: rawAnimal.rfid || animalData.rfidCode,
    breed: rawAnimal.breed ? `${rawAnimal.breed} ${rawAnimal.type ? `(${rawAnimal.type})` : ''}` : animalData.breed,
    type: rawAnimal.type || '',
    gender: rawAnimal.gender || animalData.gender,
    currentWeight: rawAnimal.weight || animalData.currentWeight,
    birthDate: rawAnimal.birthDate || animalData.birthDate,
    birthWeight: rawAnimal.birthWeight || animalData.birthWeight,
    bcsScore: rawAnimal.bcs || animalData.bcsScore,
    healthStatus: rawAnimal.status || animalData.healthStatus,
    geneticsScore: rawAnimal.yieldScore || animalData.geneticsScore,
    focus: rawAnimal.focus || 'meat',
    lineage: {
      mother: rawAnimal.mother !== undefined ? rawAnimal.mother : (rawAnimal.lineage?.mother || 'Bilinmiyor'),
      father: rawAnimal.father !== undefined ? rawAnimal.father : (rawAnimal.lineage?.father || 'Bilinmiyor')
    },
    genetics: rawAnimal.genetics || animalData.genetics || { meat: 80, milk: 50, fertility: 75, resistance: 90, growth: 85 },
    gender: rawAnimal.gender || animalData.gender || 'Dişi',
    group: rawAnimal.group || 'Besi',
    rawGender: rawAnimal.gender || animalData.gender || 'Dişi'
  };

  const nicknameBadge = currentAnimal.nickname
    ? `<span style="font-size:0.95rem; color:var(--accent-blue); font-weight:600; margin-left:6px;">("${currentAnimal.nickname}")</span>`
    : '';

  const headerHtml = `
    <div class="animal-header">
      <div class="animal-icon-wrapper">
        ${currentAnimal.breed.includes('Keçi') || currentAnimal.breed.includes('Oğlak') || currentAnimal.breed.includes('Teke') || currentAnimal.type === 'Keçi' || currentAnimal.type === 'Oğlak' || currentAnimal.type === 'Teke' ? '🐐' : '🐑'}
      </div>
      <div class="animal-info-main">
        <div class="animal-tag">
          ${currentAnimal.tagID}${nicknameBadge}
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
      <button class="tab-btn ${_activeTab === 'tasks' ? 'active' : ''}" data-tab="tasks" style="flex:none; padding:12px 16px; background:none; border:none; color:${_activeTab==='tasks'?'var(--accent-cyan)':'var(--text-secondary)'}; border-bottom:${_activeTab==='tasks'?'2px solid var(--accent-cyan)':'2px solid transparent'}; font-weight:600; cursor:pointer; white-space:nowrap; transition:0.2s;">
        Görev
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
  else if (_activeTab === 'tasks') tabContentHtml = _renderTasksTab(currentAnimal);

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

  const emptyGotoHerdBtn = _container.querySelector('#btn-empty-goto-herd');
  if (emptyGotoHerdBtn) {
    emptyGotoHerdBtn.addEventListener('click', () => {
      navigateTo('herd-list');
    });
  }

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
  if (_activeTab === 'tasks') _initTasksTab();
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
      ${animal.nickname ? `
      <div class="animal-data-card" style="grid-column: span 3; background:rgba(59,130,246,0.08); border:1px solid rgba(59,130,246,0.2);">
        <span class="animal-data-label">Lakap / İsim</span>
        <span class="animal-data-value" style="color:var(--accent-blue); font-weight:700;">${animal.nickname}</span>
      </div>
      ` : ''}
      <div class="animal-data-card">
        <span class="animal-data-label">Ağırlık</span>
        <span class="animal-data-value" id="disp-weight">${animal.currentWeight} kg</span>
      </div>
      <div class="animal-data-card">
        <span class="animal-data-label">Yaş</span>
        <span class="animal-data-value">${_calculateAge(animal.birthDate)}</span>
      </div>
      <div class="animal-data-card">
        <span class="animal-data-label">Cinsiyet / Tür</span>
        <span class="animal-data-value">${animal.gender} ${animal.type ? `(${animal.type})` : ''}</span>
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
  if (bcsInput && bcsDisplay) {
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

    bcsInput.addEventListener('change', (e) => {
      const state = getState();
      const animals = [...(state.animals || [])];
      const activeId = state.activeAnimalId || (animals.length > 0 ? animals[0].id : null);
      const idx = animals.findIndex(a => a.id === activeId);
      if (idx > -1) {
        animals[idx] = { ...animals[idx], bcs: parseFloat(e.target.value) };
        setState({ animals });
      }
    });
  }

  const btnWeight = _container.querySelector('#btn-update-weight');
  if (btnWeight) {
    btnWeight.addEventListener('click', async () => {
      const state = getState();
      const animals = [...(state.animals || [])];
      const activeId = state.activeAnimalId || (animals.length > 0 ? animals[0].id : null);
      const idx = animals.findIndex(a => a.id === activeId);
      if (idx === -1) return;

      const currentVal = animals[idx].weight || '';
      const newWeight = await showPrompt('Ağırlık Güncelle', `Mevcut Ağırlık: ${currentVal} kg\nYeni ağırlığı giriniz (kg):`, 'number', '⚖️');
      if (newWeight && !isNaN(parseFloat(newWeight))) {
        const parsedW = parseFloat(newWeight);
        animals[idx] = { ...animals[idx], weight: parsedW };
        setState({ animals });
        await showAlert('Başarılı', `${animals[idx].id} için yeni ağırlık (${parsedW} kg) sisteme kaydedildi.`, '✅');
        _rerender();
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
  const state = getState();
  const records = state.breedingRecords || [];
  const tagId = animal.tagID;

  // Bu hayvanla ilgili aktif kayıt var mı?
  const activeRecord = records.find(r =>
    (r.status === 'ACTIVE' || r.status === 'PREGNANT') && r.damIds.includes(tagId)
  );

  // Geçmiş kayıtlar
  const pastRecords = records.filter(r =>
    (r.status === 'COMPLETED' || r.status === 'FAILED') && r.damIds.includes(tagId)
  );

  if (!activeRecord) {
    // Aktif eşleşme yok — eşleşme başlatma ekranı
    return `
      <div class="glass-card" style="text-align:center; padding:32px 20px; border:1px dashed rgba(249,115,22,0.3); border-radius:20px;">
        <div style="font-size:3rem; margin-bottom:12px;">🐏</div>
        <h3 style="font-size:1rem; font-weight:700; color:var(--text-primary); margin-bottom:6px;">Aktif Eşleşme Kaydı Yok</h3>
        <p style="font-size:0.82rem; color:var(--text-secondary); margin-bottom:20px; line-height:1.5;">
          Bu hayvan için aktif koç katımı veya gebelik kaydı bulunmuyor.<br/>
          Yeni bir eşleşme kaydı oluşturmak için aşağıdaki butonu kullanın.
        </p>
        <button class="huge-btn btn-primary" id="btn-start-mating" style="width:100%; border-radius:20px; padding:14px; background:#f97316; box-shadow:0 4px 16px rgba(249,115,22,0.4); font-weight:700;">
          <span class="btn-icon">🔗</span> Yeni Eşleşme Kaydı
        </button>
      </div>
      ${pastRecords.length > 0 ? `
        <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:#10b981"></span>Geçmiş Eşleşmeler</div>
        ${_renderPastBreedingRecords(pastRecords)}
      ` : ''}
    `;
  }

  // Aktif gebelik / koç katımı durumu
  const pregInfo = calculateBirthDate(activeRecord.startDate);
  const ms = activeRecord.milestones;
  const sireLabel = activeRecord.sireIds.join(', ');

  // Milestone timeline
  const today = new Date();
  const milestones = [
    { label: 'Kızgınlık Kontrolü', date: ms.cycleCheckDate, icon: '🔴', day: 17 },
    { label: 'Ultrason Muayenesi', date: ms.ultrasoundDate, icon: '🩺', day: 45 },
    { label: 'İleri Gebelik Bakımı', date: ms.lateGestationDate, icon: '💉', day: 115 },
    { label: 'Tahmini Doğum', date: ms.expectedBirthDate, icon: '🐣', day: 148 }
  ];

  const milestoneHtml = milestones.map(m => {
    const msDate = new Date(m.date);
    const isPast = msDate <= today;
    const isToday = msDate.toDateString() === today.toDateString();
    const diffDays = Math.round((msDate - today) / 86400000);
    let statusClass = isPast ? 'done' : (diffDays <= 7 ? 'soon' : 'future');
    if (isToday) statusClass = 'today';
    return `
      <div class="breeding-milestone ${statusClass}">
        <div class="breeding-milestone-icon">${m.icon}</div>
        <div class="breeding-milestone-info">
          <div style="font-weight:600; font-size:0.82rem; color:var(--text-primary);">${m.label}</div>
          <div style="font-size:0.72rem; color:var(--text-muted);">+${m.day}. gün • ${new Date(m.date).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</div>
        </div>
        <div style="font-size:0.7rem; font-weight:600; color:${isPast ? 'var(--accent-green)' : isToday ? '#fbbf24' : 'var(--text-muted)'};">
          ${isPast ? '✅' : isToday ? '📍 BUGÜN' : `${diffDays} gün`}
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="pregnancy-header">
      <span class="preg-icon">🤰</span> Gebelik Durumu — Koç: ${sireLabel}
    </div>

    <div class="glass-card pregnancy-card ${pregInfo.isCritical ? 'critical-glow' : 'safe-glow'}">
      <div class="preg-title">Doğuma Kalan Tahmini Süre</div>
      <div class="preg-countdown">
        <span class="num">${pregInfo.daysLeft}</span>
        <span class="lbl">GÜN</span>
      </div>
      <div class="preg-date">Beklenen: <strong>${new Date(pregInfo.expectedDate).toLocaleDateString('tr-TR', {day:'numeric', month:'long'})}</strong></div>
      <div class="preg-progress-container" style="margin-top:16px;">
        <div class="preg-progress-bar" style="width: ${pregInfo.progressPercent}%;"></div>
      </div>
      <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted); margin-top:6px;">
        <span>Aşım: ${new Date(activeRecord.startDate).toLocaleDateString('tr-TR', {day:'numeric', month:'short'})}</span>
        <span>${pregInfo.daysElapsed}. gün / 148 gün</span>
      </div>
    </div>

    <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:var(--accent-purple)"></span>Gebelik Takvimi</div>
    <div class="glass-card" style="padding:var(--space-sm);">
      ${milestoneHtml}
    </div>

    ${activeRecord.inbreedingWarning ? `
      <div class="breeding-inbreeding-alert" style="background:rgba(239,68,68,0.1); border:1px solid rgba(239,68,68,0.3); border-radius:12px; padding:12px; margin-top:var(--space-md);">
        <div style="font-size:0.85rem; font-weight:700; color:#ef4444;">🚨 Akrabalık Uyarısı</div>
        <div style="font-size:0.8rem; color:var(--text-secondary); margin-top:4px;">${activeRecord.inbreedingWarning}</div>
      </div>
    ` : ''}

    ${pastRecords.length > 0 ? `
      <div class="section-title" style="margin-top:var(--space-lg);"><span class="dot" style="background:#10b981"></span>Geçmiş Eşleşmeler</div>
      ${_renderPastBreedingRecords(pastRecords)}
    ` : ''}
  `;
}

function _renderPastBreedingRecords(records) {
  return records.map(r => {
    const sireLabel = r.sireIds.join(', ');
    const birthInfo = r.birthRecord ? `${r.birthRecord.type} doğum • ${r.birthRecord.lambCount} yavru` : 'Doğum kaydı yok';
    return `
      <div class="glass-card" style="padding:12px; margin-bottom:8px; border-left:3px solid #10b981;">
        <div style="display:flex; justify-content:space-between; font-size:0.82rem;">
          <span style="font-weight:600; color:var(--text-primary);">🐏 Koç: ${sireLabel}</span>
          <span style="font-size:0.72rem; color:var(--text-muted);">${new Date(r.startDate).toLocaleDateString('tr-TR', {day:'numeric', month:'short', year:'numeric'})}</span>
        </div>
        <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px;">🐣 ${birthInfo}</div>
      </div>
    `;
  }).join('');
}

function _initBreedingTab() {
  // Yeni eşleşme kaydı oluştur
  const btnStartMating = _container.querySelector('#btn-start-mating');
  if (btnStartMating) {
    btnStartMating.addEventListener('click', async () => {
      const state = getState();
      const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
      const result = await openBreedingModal(activeId);
      if (result.saved) {
        await showAlert('Eşleşme Kaydedildi! 🐏', 'Koç katımı ve gebelik takvimi oluşturuldu.', '✅');
        _rerender();
      }
    });
  }
}

// ═══════════════════════════════════════
// Tab: HEALTH
// ═══════════════════════════════════════
function _renderHealthTab(animal) {
  // Tüm arınma hesaplaması core/healthManager.js üzerinden
  const ws = getAnimalWithdrawalStatus(animal.tagID);

  const withdrawalCardHtml = ws.hasActiveWithdrawal ? `
    <div class="glass-card withdrawal-card" style="margin-bottom:var(--space-lg); border:1px solid rgba(239,68,68,0.3);">
      <div class="withdrawal-header">
        <span class="warning-icon">⛔</span>
        <strong>SATIŞ / TÜKETİM YASAĞI (Aktif İlaç)</strong>
      </div>
      <div class="withdrawal-body">
        <p style="font-size:0.85rem; color:var(--text-secondary); margin-bottom:12px">Son uygulanan ilaç: <strong>${ws.activeMedName || 'Kayıtlı İlaç'}</strong></p>
        <div class="withdrawal-grid">
          <div class="w-item">
            <span class="w-label">🛑 Et Karantinası</span>
            <span class="w-value ${ws.meatDaysLeft > 0 ? 'red' : 'green'}">${ws.meatDaysLeft > 0 ? ws.meatDaysLeft + ' GÜN KALDI' : 'GÜVENLİ'}</span>
          </div>
          <div class="w-item">
            <span class="w-label">🥛 Süt Karantinası</span>
            <span class="w-value ${ws.milkDaysLeft > 0 ? 'red' : 'green'}">${ws.milkDaysLeft > 0 ? ws.milkDaysLeft + ' GÜN KALDI' : 'GÜVENLİ'}</span>
          </div>
        </div>
      </div>
    </div>
  ` : `
    <div class="glass-card withdrawal-card" style="margin-bottom:var(--space-lg); border:1px solid rgba(34,197,94,0.3); background:rgba(34,197,94,0.03);">
      <div class="withdrawal-header" style="color:var(--accent-green)">
        <span class="warning-icon">✅</span>
        <strong>SATIŞ VE TÜKETİM YASAĞI YOK</strong>
      </div>
      <div class="withdrawal-body">
        <p style="font-size:0.85rem; color:var(--text-secondary);">
          Bu hayvan için aktif ilaç arınma süresi veya satış yasağı bulunmamaktadır.
        </p>
      </div>
    </div>
  `;

  // Medikal geçmiş (treatmentRecords'tan)
  const medHistoryHtml = _renderMedicalHistory(animal.tagID);

  return `
    <div class="section-title"><span class="dot" style="background:var(--danger-red)"></span>Bireysel Arınma Durumu</div>
    ${withdrawalCardHtml}

    <div class="section-title"><span class="dot" style="background:#a855f7"></span>Medikal Geçmiş & Aşı / Tedavi Kayıtları</div>
    <div class="glass-card" style="margin-bottom:var(--space-lg); padding:var(--space-sm);">
      ${medHistoryHtml}
    </div>

    <div style="display:flex; flex-direction:column; gap:12px; position:relative !important; width:calc(100% - var(--space-lg)*2); margin:0 auto var(--space-xl) auto;">
      <button class="huge-btn btn-primary" id="btn-ind-med" style="width:100%; border-radius:24px; padding:16px; background:var(--accent-red); box-shadow:0 4px 16px rgba(239,68,68,0.4);">
        <span class="btn-icon">💉</span> Tedavi Uygula (Akıllı Motor)
      </button>
      <button class="huge-btn btn-secondary" id="btn-ind-disease" style="width:100%; border-radius:24px; padding:16px;">
        <span class="btn-icon">🤒</span> Hastalık / Belirti Kaydet
      </button>
      <button class="huge-btn btn-secondary" id="btn-ind-ai" style="width:100%; border-radius:24px; padding:16px; background:var(--glass-bg); border:1px dashed var(--accent-cyan);">
        <span class="btn-icon">🤖</span> AI Bireysel Teşhis
      </button>

      ${animal.rawGender === 'Dişi' ? `
      <div style="margin-top:var(--space-lg); padding-top:var(--space-md); border-top:1px solid rgba(168,85,247,0.2);">
        <button class="huge-btn" id="btn-report-birth" style="width:100%; border-radius:24px; padding:16px; background:rgba(168,85,247,0.15); color:var(--accent-purple); border:1px solid rgba(168,85,247,0.3); font-weight:700;">
          <span class="btn-icon">🐣</span> Doğum Bildir
        </button>
      </div>
      ` : ''}

      <div style="margin-top:${animal.rawGender === 'Dişi' ? 'var(--space-sm)' : 'var(--space-xl)'}; padding-top:var(--space-md); border-top:1px solid rgba(239,68,68,0.2);">
        <button class="huge-btn" id="btn-report-death" style="width:100%; border-radius:24px; padding:16px; background:rgba(239,68,68,0.1); color:var(--danger-red); border:1px solid rgba(239,68,68,0.3); font-weight:700;">
          <span class="btn-icon">☠️</span> Ölüm Bildir
        </button>
      </div>
    </div>
  `;
}

function _initHealthTab() {
  // Tedavi butonu — Akıllı Tedavi Motoru'nu çağırır
  const btnMed = _container.querySelector('#btn-ind-med');
  if (btnMed) {
    btnMed.addEventListener('click', async () => {
      const state = getState();
      const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
      const result = await openTreatmentModal(activeId);
      if (result.applied) _rerender();
    });
  }

  const btnDisease = _container.querySelector('#btn-ind-disease');
  if (btnDisease) btnDisease.addEventListener('click', () => showAlert('Hastalık Kaydı', '[SIM] Bu hayvanda görülen belirti veya koyulan teşhisi kaydet.', '🤒'));

  const btnAi = _container.querySelector('#btn-ind-ai');
  if (btnAi) btnAi.addEventListener('click', () => showAlert('Yapay Zeka Teşhisi', '[SIM] Yapay zeka ile bireysel semptom izleme paneli', '🤖'));

  // Doğum bildirimi (sadece dişilerde)
  const btnBirth = _container.querySelector('#btn-report-birth');
  if (btnBirth) {
    btnBirth.addEventListener('click', async () => {
      const state = getState();
      const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
      const rawAnimal = getAnimalById(activeId) || {};
      const motherTag = rawAnimal.tagID || rawAnimal.id || 'Bilinmiyor';

      // Doğan yavru bilgileri
      const babyId = await showPrompt('Yavru Küpe No', `${motherTag} doğurdu! Yavrunun küpe numarasını giriniz:`, 'text', '🐣');
      if (!babyId) return;

      const genderOpt = await showSelect('Yavru Cinsiyeti', [
        { value: 'Dişi', label: 'Dişi', color: '#ec4899' },
        { value: 'Erkek', label: 'Erkek', color: '#3b82f6' }
      ], '👶');
      if (!genderOpt) return;

      const weightStr = await showPrompt('Doğum Ağırlığı', 'Yavrunun doğum ağırlığı (kg):', 'number', '⚖️');
      const birthWeight = parseFloat(weightStr) || 3.5;

      const dateStr = await showPrompt('Doğum Tarihi', 'Doğum tarihini seçin:', 'date', '📅');
      const todayStr = new Date().toISOString().split('T')[0];
      const birthDateVal = dateStr ? dateStr : todayStr;

      const maleOpts = [
        { value: 'Bilinmiyor', label: 'Bilinmiyor', color: '#6b7280' },
        ...(state.animals || []).filter(a => a.gender === 'Erkek').map(a => ({
          value: a.id, label: `${a.id} (${a.breed})`, color: '#3b82f6'
        }))
      ];
      const fatherSel = await showSelect('Baba Küpe No', maleOpts, '🐑');
      if (!fatherSel) return;
      const fatherTag = fatherSel.value === 'Bilinmiyor' ? null : fatherSel.value;

      // Yavruyu sürüye ekle
      const motherBreed = rawAnimal.breed || 'Merinos';
      const babyType = motherBreed === 'Saanen' 
        ? (genderOpt.value === 'Dişi' ? 'Oğlak' : 'Oğlak') 
        : (genderOpt.value === 'Dişi' ? 'Kuzu' : 'Kuzu');
      const today = new Date().toISOString().split('T')[0];

      const newBaby = {
        id: babyId,
        rfid: 'RFID-' + Math.floor(Math.random() * 90000 + 10000),
        breed: motherBreed,
        gender: genderOpt.value,
        type: babyType,
        group: 'Besi',
        weight: birthWeight,
        birthWeight: birthWeight,
        bcs: 2.5,
        status: 'good',
        yieldScore: 70,
        lastVaccine: '-',
        focus: 'meat',
        birthDate: birthDateVal,
        mother: motherTag,
        father: fatherTag
      };

      const animals = [...(state.animals || [])];
      animals.unshift(newBaby);

      // Ananın grubunu Gebe'den Sağmal'a güncelle
      const motherIdx = animals.findIndex(a => a.id === activeId);
      if (motherIdx > -1 && animals[motherIdx].group === 'Gebe') {
        animals[motherIdx] = { ...animals[motherIdx], group: 'Sağmal' };
      }

      // Aktif breedingRecord varsa COMPLETED'a al
      let breedingRecords = [...(state.breedingRecords || [])];
      const activeBreeding = breedingRecords.find(r =>
        (r.status === 'ACTIVE' || r.status === 'PREGNANT') && r.damIds.includes(activeId)
      );
      if (activeBreeding) {
        breedingRecords = recordBirth(activeBreeding.id, {
          date: birthDateVal,
          type: 'Normal',
          lambCount: 1
        }, breedingRecords);
      }

      setState({ animals, breedingRecords });
      await showAlert('Doğum Kaydedildi! 🎉', 
        `${motherTag} → ${babyId} (${babyType}, ${genderOpt.value}, ${birthWeight} kg)\n` +
        `Ana: ${motherTag}\nBaba: ${fatherTag || 'Bilinmiyor'}\n\nYavru sürüye eklendi.`, '🐣');
      _rerender();
    });
  }

  // Ölüm bildirimi
  const btnDeath = _container.querySelector('#btn-report-death');
  if (btnDeath) {
    btnDeath.addEventListener('click', async () => {
      const state = getState();
      const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
      const rawAnimal = getAnimalById(activeId) || {};
      const tagToUse = rawAnimal.tagID || rawAnimal.id || 'Bilinmiyor';

      const confirmed = await showConfirm(
        '☠️ Ölüm Bildirimi',
        `${tagToUse} küpe numaralı hayvanı ölü olarak bildirmek istediğinize emin misiniz?\n\nBu işlem geri alınamaz. Hayvan sürüden çıkarılacak ve kayıt geçmişe düşecektir.`,
        '⚠️'
      );

      if (confirmed) {
        const form = await showFormModal(`Ölüm Bildirimi (${tagToUse})`, [
          { id: 'deathDate', label: 'Ölüm Tarihi', type: 'date', value: new Date().toISOString().split('T')[0] },
          { id: 'reason', label: 'Ölüm Sebebi / Teşhis', type: 'select', options: [
            'Enterotoksemi (Çelerme)',
            'Pnömoni (Zatürre / Solunum)',
            'Şap Hastalığı',
            'Mastitis (Meme İltihabı)',
            'Doğum Komplikasyonu',
            'Zehirlenme / Yem Şişmesi',
            'Kaza / Yaralanma / Kırık',
            'Yaşlılık / Ecel',
            'Diğer / Bilinmeyen'
          ]},
          { id: 'financialLoss', label: 'Tahmini Finansal Kayıp (₺)', type: 'number', value: (parseFloat(rawAnimal.weight || 45) * 190).toFixed(0) },
          { id: 'note', label: 'Açıklama / Not', type: 'text', placeholder: 'Kayıp notu' }
        ], '☠️');

        if (!form) return;

        const deathDate = form.deathDate || new Date().toISOString().split('T')[0];
        const reason = form.reason || 'Diğer / Bilinmeyen';
        const loss = parseFloat(form.financialLoss) || (parseFloat(rawAnimal.weight || 45) * 190);

        // Canlı sürüden çıkar
        const animals = [...(state.animals || [])];
        const idx = animals.findIndex(a => a.id === activeId);
        if (idx > -1) animals.splice(idx, 1);

        // Mortalite kayıtlarına ekle
        const mortalityRecords = [...(state.mortalityRecords || [])];
        mortalityRecords.unshift({
          id: 'MORT-' + Date.now(),
          animalId: tagToUse,
          rfid: rawAnimal.rfid || 'RFID-UNKNOWN',
          breed: rawAnimal.breed || 'Merinos',
          type: rawAnimal.type || 'Koyun',
          gender: rawAnimal.gender || 'Dişi',
          group: rawAnimal.group || 'Besi',
          lastWeight: rawAnimal.weight || 0,
          deathDate: deathDate,
          deathReason: reason,
          financialLoss: loss,
          note: form.note || ''
        });

        // Görev geçmişine ekle
        const taskHistory = [...(state.taskHistory || [])];
        taskHistory.unshift({
          id: 'DEATH-' + Date.now(),
          title: `Ölüm Kaydı: ${tagToUse}`,
          desc: `Sebep: ${reason}. Sürüden çıkarıldı ve Ölüm Raporlarına işlendi.`,
          type: 'other',
          prio: 'High',
          scope: 'individual',
          targetTag: tagToUse,
          status: 'completed',
          createdAt: deathDate,
          completedAt: deathDate
        });

        setState({ animals, mortalityRecords, taskHistory });
        await showAlert('Ölüm Kaydedildi', `${tagToUse} sürüden çıkarıldı, ölüm nedeni (${reason}) ve finansal kayıp (${loss} ₺) Ölüm Raporları'na işlendi.`, '😢');
        navigateTo('herd-list');
      }
    });
  }
}

function _renderIndividualVaccines(animal) {
  const state = getState();
  const indVaccines = (state.vaccines || []).filter(v => !v.target || v.target === 'Tüm Sürü' || v.target === 'Sürü Geneli' || v.target.includes(animal.tagID));
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
  if (btnSell) {
    btnSell.addEventListener('click', async () => {
      const state = getState();
      const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
      if (!activeId) return;

      // ── GÜVENLİK KİLİDİ: Arınma süresi kontrolü ──
      const ws = getAnimalWithdrawalStatus(activeId);
      if (ws.hasActiveWithdrawal && ws.meatDaysLeft > 0) {
        // 1. Aşama: Bilgilendirme uyarısı
        const firstConfirm = await showConfirm(
          '🚨 ARINMA SÜRESİ DOLMADI',
          `UYARI: ${activeId} küpe numaralı hayvanın et arınma süresi dolmamıştır!\n\n` +
          `🛑 Kalan Süre: ${ws.meatDaysLeft} gün\n` +
          `💊 İlaç: ${ws.activeMedName || 'Kayıtlı İlaç'}\n\n` +
          `Yasal olarak bu hayvanın kesimi veya et satışı yapılamaz.\nDevam etmek istediğinize emin misiniz?`,
          '🚨'
        );
        if (!firstConfirm) return;

        // 2. Aşama: İkinci onay — bilinçli risk kabul
        const secondConfirm = await showConfirm(
          '⚠️ SON UYARI — YASAL SORUMLULUK',
          `Bu işlem kayıt altına alınacaktır.\n\n` +
          `Arınma süresi dolmamış hayvanın satışı/kesimi gıda güvenliği mevzuatına aykırıdır.\n\n` +
          `Tüm yasal sorumluluğu kabul ederek devam etmek istiyor musunuz?`,
          '⚠️'
        );
        if (!secondConfirm) return;
      }

      await showAlert('Hızlı Satış', '[SIM] Bu hayvanı satıldığında ROI kaydı arşivlenir.', '💰');
    });
  }
}

// ═══════════════════════════════════════
// Tab: TASKS (Bireysel Görevler)
// ═══════════════════════════════════════
function _renderTasksTab(animal) {
  const activeTasks = getTasksForUser('owner', 'individual', animal.tagID);
  const history = getTaskHistory('individual', animal.tagID);

  const activeHtml = activeTasks.length === 0 
    ? '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:10px;">Bekleyen bireysel görev yok.</p>'
    : activeTasks.map(t => {
        const typeInfo = TASK_TYPES.find(tt => tt.value === t.type) || TASK_TYPES[5];
        return `
          <div class="task-card" style="border-left:4px solid ${typeInfo.color}; margin-bottom:8px;">
            <div class="t-main">
              <div class="t-title"><span style="font-size:0.85rem;">${typeInfo.label.split(' ')[0]}</span> ${t.title}
                ${t.prio === 'High' ? '<span style="font-size:0.65rem; background:rgba(239,68,68,0.2); color:var(--danger-red); padding:2px 6px; border-radius:6px; margin-left:6px;">ACİL</span>' : ''}
              </div>
              <div class="t-desc">${t.desc || ''}</div>
              <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px;">Oluşturulma: ${t.createdAt}</div>
            </div>
            <div class="t-action" data-task-id="${t.id}">
              <button class="btn-complete-ind-task" style="padding:8px 14px; border-radius:12px; border:none; background:var(--accent-green); color:#fff; font-weight:600; font-size:0.75rem; cursor:pointer; box-shadow:0 2px 8px rgba(34,197,94,0.3);">✅ Tamamla</button>
            </div>
          </div>
        `;
      }).join('');

  const historyHtml = history.length === 0
    ? '<p style="font-size:0.85rem; color:var(--text-muted); text-align:center; padding:10px;">Henüz tamamlanan bireysel görev yok.</p>'
    : history.map(t => {
        const typeInfo = TASK_TYPES.find(tt => tt.value === t.type) || TASK_TYPES[5];
        return `
          <div class="task-card completed-task" style="border-left:4px solid #10b981; opacity:0.7; margin-bottom:8px;">
            <div class="t-main">
              <div class="t-title" style="text-decoration:line-through; color:var(--text-muted);">
                <span style="font-size:0.8rem;">${typeInfo.label.split(' ')[0]}</span> ${t.title}
              </div>
              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px;">Tamamlandı: ${t.completedAt || '-'}</div>
            </div>
            <div class="t-status" style="color:#10b981; font-weight:700; font-size:0.7rem;">✔ Bitti</div>
          </div>
        `;
      }).join('');

  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-cyan)"></span>Aktif Bireysel Görevler</div>
    <div class="glass-card" style="margin-bottom:var(--space-lg); padding:var(--space-sm);">
      ${activeHtml}
    </div>

    <div class="section-title"><span class="dot" style="background:#10b981"></span>Tamamlanan Görevler</div>
    <div class="glass-card" style="margin-bottom:var(--space-xl); padding:var(--space-sm);">
      ${historyHtml}
    </div>

    <div style="display:flex; flex-direction:column; gap:12px; position:relative !important; width:calc(100% - var(--space-lg)*2); margin:0 auto var(--space-xl) auto;">
      <button class="huge-btn btn-primary" id="btn-add-ind-task" style="width:100%; border-radius:24px; padding:16px; background:var(--accent-cyan); box-shadow:0 4px 16px var(--accent-cyan-glow);">
        <span class="btn-icon">➕</span> Bireysel Görev Ekle
      </button>
    </div>
  `;
}

function _initTasksTab() {
  // Bireysel görev ekleme
  const btnAdd = _container.querySelector('#btn-add-ind-task');
  if (btnAdd) {
    btnAdd.addEventListener('click', async () => {
      const state = getState();
      const activeId = state.activeAnimalId || (state.animals && state.animals.length > 0 ? state.animals[0].id : null);
      const rawAnimal = getAnimalById(activeId) || {};
      const tagToUse = rawAnimal.tagID || 'TR-102';

      // Tür seçimi (tıklanabilir butonlar)
      const typeOptions = TASK_TYPES.map(t => ({ value: t.value, label: t.label, color: t.color }));
      const selectedType = await showSelect(`Görev Türü Seçin (${tagToUse})`, typeOptions, '📋');
      if (!selectedType) return;
      const matchedType = TASK_TYPES.find(t => t.value === selectedType.value) || TASK_TYPES[5];

      const title = await showPrompt('Görev Başlığı', `${matchedType.label} görevi için başlık giriniz:`, 'text', matchedType.label.split(' ')[0]);
      if (!title) return;

      const desc = await showPrompt('Açıklama', 'Kısa açıklama (opsiyonel):', 'text', '📝') || '';

      const prioOption = await showSelect('Öncelik Seçin', [
        { value: 'High', label: 'Yüksek Öncelik', color: '#ef4444', icon: '🔴' },
        { value: 'Normal', label: 'Normal Öncelik', color: '#3b82f6', icon: '🟢' }
      ], '⚡');
      const prio = prioOption ? prioOption.value : 'Normal';

      addTask({
        title,
        desc,
        type: matchedType.value,
        prio,
        scope: 'individual',
        targetTag: tagToUse
      });

      showAlert('Görev Eklendi', `"${title}" görevi ${tagToUse} için eklendi.`, '✅');
      _rerender();
    });
  }

  // Görev tamamlama butonları
  const completeBtns = _container.querySelectorAll('.btn-complete-ind-task');
  completeBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskId = e.target.closest('[data-task-id]').getAttribute('data-task-id');
      const confirmed = await showConfirm('Görevi Tamamla', 'Bu görevi tamamlandı olarak işaretlemek istiyor musunuz?', '✅');
      if (confirmed) {
        const result = completeTask(taskId);
        if (result.success) {
          showAlert('Başarılı', result.message, '✅');
          _rerender();
        }
      }
    });
  });
}

function _rerender() {
  const parent = _container.parentNode;
  const scrollPos = window.scrollY;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
  window.scrollTo(0, scrollPos);
}

// ── Helpers ──

function _getMedCategoryIcon(category, name) {
  const cat = (category || '').toLowerCase();
  const n = (name || '').toLowerCase();
  if (cat.includes('aşı') || n.includes('aşı') || n.includes('karma') || n.includes('vaccine')) {
    return '💉';
  }
  if (cat.includes('antibiyotik')) {
    return '🧪';
  }
  if (cat.includes('vitamin') || n.includes('sevit') || n.includes('ademin') || n.includes('nervit')) {
    return '💊';
  }
  if (cat.includes('antiparaziter') || n.includes('dectomax')) {
    return '🪱';
  }
  if (cat.includes('nsaid') || cat.includes('ağrı')) {
    return '💊';
  }
  return '💊';
}

function _renderMedicalHistory(animalId) {
  const state = getState();
  const animal = getAnimalById(animalId);
  const animalTag = animal ? (animal.tagID || animal.id) : animalId;

  // 1. Tedavi Kayıtları (treatmentRecords)
  const tRecords = (state.treatmentRecords || []).filter(r =>
    r.animalId === animalId || r.animalId === animalTag || (r.batchTargets && (r.batchTargets.includes(animalId) || r.batchTargets.includes(animalTag)))
  ).map(r => {
    // Net bireysel dozaj hesaplama
    const netDose = r.appliedDosePerAnimal || r.dosagePerAnimal || (
      r.applicationType === 'batch' && r.totalBatchQuantity && r.batchTargets?.length
        ? parseFloat((r.totalBatchQuantity / r.batchTargets.length).toFixed(2))
        : r.dosage
    );
    return {
      id: r.id,
      name: r.medicationName,
      activeIngredient: r.activeIngredient || '',
      category: r.category || 'Tedavi',
      dosageStr: `${netDose} ${r.dosageUnit || 'ml'}`,
      date: r.applicationDate,
      type: (r.category === 'Aşı' || (r.medicationName || '').toLowerCase().includes('aşı')) ? 'vaccine' : 'treatment',
      isActive: r.withdrawals && (
        new Date(r.withdrawals.meatSafeDate) > new Date() ||
        new Date(r.withdrawals.milkSafeDate) > new Date()
      ),
      courseInfo: r.courseInfo,
      pregnancyOverride: r.pregnancyOverride,
      notes: r.notes,
      source: 'treatmentRecord'
    };
  });

  // 2. Aşı Kayıtları (state.vaccines)
  const vRecords = (state.vaccines || []).filter(v => {
    const isTarget = v.target === animalId || v.target === animalTag || (v.batchTargets && (v.batchTargets.includes(animalId) || v.batchTargets.includes(animalTag)));
    const duplicateInTreatment = tRecords.some(tr => tr.name === v.name && tr.date === v.date);
    return isTarget && !duplicateInTreatment;
  }).map(v => ({
    id: v.id,
    name: v.name,
    activeIngredient: v.activeIngredient || 'Bağışıklık Aşısı',
    category: 'Aşı',
    dosageStr: v.dosage ? `${v.dosage} ml/doz` : '1 doz',
    date: v.date,
    type: 'vaccine',
    isActive: false,
    notes: v.notes || '',
    source: 'vaccine'
  }));

  // Zaman kronolojisine göre birleştir (en yeni üstte)
  const combined = [...tRecords, ...vRecords].sort((a, b) => new Date(b.date) - new Date(a.date));

  if (combined.length === 0) {
    return `
      <div style="text-align:center; padding:24px 12px;">
        <span style="font-size:2.2rem;">📋</span>
        <p style="font-size:0.85rem; font-weight:600; color:var(--text-secondary); margin-top:8px;">Henüz Aşı veya Tedavi Kaydı Bulunmuyor</p>
        <p style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Bu hayvana uygulanan tüm aşı, ilaç ve vitaminler burada görüntülenecektir.</p>
      </div>
    `;
  }

  return combined.slice(0, 15).map(r => {
    const icon = _getMedCategoryIcon(r.category, r.name);
    const borderColor = r.isActive ? 'var(--danger-red)' : (r.type === 'vaccine' ? 'var(--accent-cyan)' : 'var(--accent-green)');
    const categoryBadgeStyle = r.type === 'vaccine' ? 'background:rgba(6,182,212,0.15); color:#22d3ee;' : 'background:rgba(34,197,94,0.15); color:#4ade80;';

    return `
      <div class="med-history-item" style="padding:12px 14px; border-left:4px solid ${borderColor}; margin-bottom:10px; background:rgba(15,23,42,0.5); border-radius:0 12px 12px 0; border-top:1px solid rgba(255,255,255,0.05); border-right:1px solid rgba(255,255,255,0.05); border-bottom:1px solid rgba(255,255,255,0.05);">
        <div style="display:flex; justify-content:space-between; align-items:flex-start; gap:8px;">
          <div style="flex:1; min-width:0;">
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary); display:flex; align-items:center; gap:6px;">
              <span>${icon}</span>
              <span>${r.name}</span>
              <span style="font-size:0.65rem; padding:2px 8px; border-radius:10px; font-weight:600; ${categoryBadgeStyle}">${r.category || 'Tedavi'}</span>
            </div>
            <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:4px; font-weight:500;">
              ${r.activeIngredient ? `<strong>${r.activeIngredient}</strong> • ` : ''}<span style="color:var(--accent-cyan); font-weight:700;">${r.dosageStr}</span>
            </div>
          </div>
          <div style="font-size:0.7rem; color:var(--text-muted); text-align:right; flex-shrink:0;">
            <div style="font-weight:600;">${r.date}</div>
            ${r.isActive ? '<div style="color:var(--danger-red); font-weight:700; margin-top:3px; font-size:0.65rem;">🛑 Karantinada</div>' : '<div style="color:var(--accent-green); margin-top:3px; font-size:0.65rem; font-weight:600;">✅ Uygulandı</div>'}
          </div>
        </div>
        ${r.courseInfo?.totalDays > 1 ? `<div style="font-size:0.7rem; color:var(--accent-purple); margin-top:6px; font-weight:600;">⏱️ ${r.courseInfo.totalDays} günlük kür tedavisi</div>` : ''}
        ${r.pregnancyOverride ? '<div style="font-size:0.7rem; color:var(--danger-red); margin-top:4px; font-weight:600;">⚠️ Gebelik uyarısı onaylanarak uygulandı</div>' : ''}
        ${r.notes ? `<div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px; font-style:italic;">📝 Not: ${r.notes}</div>` : ''}
      </div>
    `;
  }).join('');
}

function _calculateAge(birthDateString) {
  if(!birthDateString) return '1.5 Yaşında';
  const birth = new Date(birthDateString);
  const now = new Date(); 
  let months = (now.getFullYear() - birth.getFullYear()) * 12;
  months -= birth.getMonth();
  months += now.getMonth();
  if (months < 0) months = 0;
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
