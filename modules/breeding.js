/**
 * ShepherdAI — Sürü ve Islah (Genetik Eşleşme) Modülü UI
 * Eskiden Profile altında olan genetik eşleşme buraya taşındı.
 */

import { getState } from '../core/state.js';
import { breedingMockEwe, breedingMockRam } from '../data/mock-data.js';
import { checkInbreeding, calculateCompatibility, calculateBirthDate } from '../core/breedingManager.js';
import { showAlert } from '../core/modal.js';

let _container = null;

// Eşleşme veya Gebelik modu. (Gerçekte hayvan datalarından alınır)
let _viewMode = 'mating'; // 'mating' (Eşleşme/Turuncu) veya 'pregnant' (Gebe/Lavanta)

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter herd-page';
  _container.style.paddingBottom = '180px'; 
  
  const state = getState();
  const focusMode = state.focusMode || 'meat';

  // Lojik Motor Hesaplamaları
  const inbreedingResult = checkInbreeding(breedingMockEwe.tagID, breedingMockRam.tagID);
  const compatibilityScore = calculateCompatibility(breedingMockEwe.tagID, breedingMockRam.tagID, focusMode);
  
  // Örnek gebelik durumu ('pregnant' modda iken gösterilecek)
  const matingDateMock = new Date();
  matingDateMock.setDate(matingDateMock.getDate() - 138); // 138 gün önce aşım olmuş (Örnek)
  const pregData = calculateBirthDate(matingDateMock);

  _container.innerHTML = `
    <div class="section-title"><span class="dot"></span>Sürü Islah Yönetimi</div>
    ${_renderModeToggle()}
    ${_viewMode === 'mating' ? _renderMatingMatrix(inbreedingResult, compatibilityScore) : _renderPregnancyTracker(pregData)}
    ${_renderHugeActionButtons()}
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const btnToggle = _container.querySelector('#btn-mode-toggle');
  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      _viewMode = _viewMode === 'mating' ? 'pregnant' : 'mating';
      
      // Sayfayı yeniden renderla (Amelece SPA mantığı)
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
    btnMate.addEventListener('click', () => {
      showAlert('Aşım Kaydı', `[SIM] ${breedingMockEwe.tagID} ve ${breedingMockRam.tagID} aşım kaydı başarıyla oluşturuldu!\nGebelik periyodu başlatılıyor.`, '🔗');
    });
  }

  const btnUltrasound = _container.querySelector('#btn-ultrasound');
  if (btnUltrasound) {
    btnUltrasound.addEventListener('click', () => {
      showAlert('Ultrason Onayı', '[SIM] Ultrason Onayı ekranı açılıyor...', '🩺');
    });
  }
}

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderModeToggle() {
  const isMating = _viewMode === 'mating';
  return `
    <div style="display:flex; justify-content:center; margin-bottom:var(--space-md);">
      <button id="btn-mode-toggle" class="btn-secondary" style="font-size:0.7rem; padding:4px 12px; border-radius:12px;">
        Görünüm Değiştir: ${isMating ? '🟠 Eşleşme (Mating)' : '🟣 Gebelik (Pregnancy)'} Modu
      </button>
    </div>
  `;
}

function _renderMatingMatrix(inbreedingResult, compScore) {
  return `
    <!-- Akrabalık Uyarı Zirvesi -->
    ${inbreedingResult.hasRisk ? `
      <div class="inbreeding-alert">
        <strong>⚠️ YÜKSEK AKRABALIK RİSKİ!</strong>
        <span>Ortak Ata Tespit Edildi: ${inbreedingResult.commonAncestors.join(', ')}</span>
      </div>
    ` : ''}

    <div class="section-title"><span class="dot" style="background:var(--accent-orange)"></span>Genetik Eşleşme Kartı</div>
    <div class="glass-card mating-card">
      <div class="animals-vs">
        <div class="mating-animal">
          <span class="m-icon">🐑</span>
          <span class="m-tag">${breedingMockEwe.tagID}</span>
          <span class="m-role">Anaç</span>
        </div>
        <div class="mating-score-circle ${inbreedingResult.hasRisk ? 'risk' : 'safe'}">
          <span class="s-val">%${compScore}</span>
          <span class="s-lbl">Uyum Skoru</span>
        </div>
        <div class="mating-animal">
          <span class="m-icon" style="filter: hue-rotate(45deg);">🐏</span>
          <span class="m-tag">${breedingMockRam.tagID}</span>
          <span class="m-role">Damızlık</span>
        </div>
      </div>
    </div>

    <div class="section-title" style="margin-top:var(--space-lg)"><span class="dot" style="background:var(--accent-orange)"></span>Genetik Radar</div>
    <div class="glass-card radar-container">
      ${_generateRadarChart(breedingMockEwe.genetics, breedingMockRam.genetics)}
      <div class="radar-legend">
        <div class="r-leg-item"><span class="r-color-box ewe-c"></span> ${breedingMockEwe.tagID}</div>
        <div class="r-leg-item"><span class="r-color-box ram-c"></span> ${breedingMockRam.tagID}</div>
      </div>
    </div>
  `;
}

function _renderPregnancyTracker(pregData) {
  const dateStr = pregData.expectedDate.toLocaleDateString('tr-TR', { day:'numeric', month:'long' });
  const criticalClass = pregData.isCritical ? 'critical-glow' : 'safe-glow';

  return `
    <div class="pregnancy-header">
      <span class="preg-icon">🤰</span> ${breedingMockEwe.tagID} Gebelik Durumu
    </div>

    <div class="glass-card pregnancy-card ${criticalClass}">
      <div class="preg-title">Doğuma Kalan Tahmini Süre</div>
      <div class="preg-countdown">
        <span class="num">${pregData.daysLeft}</span>
        <span class="lbl">GÜN</span>
      </div>
      <div class="preg-date">Beklenen Doğum: <strong>${dateStr}</strong></div>
      
      <div class="preg-progress-container" style="margin-top:16px;">
        <div class="preg-progress-bar" style="width: ${((150 - pregData.daysLeft) / 150) * 100}%;"></div>
      </div>
    </div>
    
    <div class="glass-card" style="margin-top:var(--space-lg); padding:var(--space-md); border-color: rgba(168, 85, 247, 0.3);">
      <h3 style="font-size:0.8rem; margin-bottom:8px; color:var(--text-primary);">Gebe Rasyon Önerisi (Son Dönem)</h3>
      <p style="font-size:0.75rem; color:var(--text-secondary); line-height:1.4;">
        Hayvan <strong>Kritik Yaklaşanlar</strong> listesinde. Kuzu gelişimini desteklemek için enerji ve protein değeri yüksek, aynı zamanda fötüse (yavru) yer açmak adına hacmi (kaba yem) azaltılmış kesif yem ağırlıklı rasyona geçiş yapın. 
      </p>
    </div>
  `;
}

function _renderHugeActionButtons() {
  const isMating = _viewMode === 'mating';

  return `
    <div style="position:relative !important; margin-top:var(--space-2xl); margin-bottom:var(--space-xl); width:calc(100% - var(--space-lg)*2); max-width:440px; margin-left:auto; margin-right:auto; display:flex; gap:12px;">
      ${isMating ? `
      <button class="huge-btn btn-primary" id="btn-record-mating" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; background:#f97316; box-shadow:0 4px 16px rgba(249,115,22,0.4);">
        <span class="btn-icon" style="font-size:1.4rem">🔗</span> Aşım Kaydet
      </button>
      ` : `
      <button class="huge-btn btn-primary" id="btn-ultrasound" style="width:100%; border-radius:24px; padding:16px; font-size:1.1rem; background:#a855f7; box-shadow:0 4px 16px rgba(168,85,247,0.4);">
        <span class="btn-icon" style="font-size:1.4rem">🩺</span> Ultrason Onayı
      </button>
      `}
    </div>
  `;
}

// ═══════════════════════════════════════
// SVG Radar Chart (Pentagon) 
// ═══════════════════════════════════════
function _generateRadarChart(dataA, dataB) {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = 80;
  
  const angles = [
    -Math.PI / 2, 
    -Math.PI / 2 + (2 * Math.PI) / 5,
    -Math.PI / 2 + (4 * Math.PI) / 5,
    -Math.PI / 2 + (6 * Math.PI) / 5,
    -Math.PI / 2 + (8 * Math.PI) / 5
  ];
  
  const labels = ['Et Kapasitesi', 'Süt Verimi', 'Döl/Fertilite', 'Direnç', 'Büyüme Hızı'];

  const levels = [0.2, 0.4, 0.6, 0.8, 1.0];
  let bgHtml = '';
  levels.forEach(l => {
    const pts = angles.map(a => `${cx + Math.cos(a)*(r*l)},${cy + Math.sin(a)*(r*l)}`).join(' ');
    bgHtml += `<polygon points="${pts}" fill="none" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>`;
  });

  let axisHtml = '';
  let labelHtml = '';
  angles.forEach((a, i) => {
    const px = cx + Math.cos(a)*r;
    const py = cy + Math.sin(a)*r;
    axisHtml += `<line x1="${cx}" y1="${cy}" x2="${px}" y2="${py}" stroke="rgba(255,255,255,0.2)" stroke-width="1"/>`;
    const lx = cx + Math.cos(a)*(r + 15);
    const ly = cy + Math.sin(a)*(r + 15);
    labelHtml += `<text x="${lx}" y="${ly}" fill="var(--text-muted)" font-size="8" text-anchor="middle" dominant-baseline="middle">${labels[i]}</text>`;
  });

  const ptsA = [dataA.meat, dataA.milk, dataA.fertility, dataA.resistance, dataA.growth].map((val, i) => {
    const l = val / 100;
    return `${cx + Math.cos(angles[i])*(r*l)},${cy + Math.sin(angles[i])*(r*l)}`;
  }).join(' ');
  const polyA = `<polygon points="${ptsA}" fill="var(--accent-green)" fill-opacity="0.3" stroke="var(--accent-green)" stroke-width="2"/>`;

  const ptsB = [dataB.meat, dataB.milk, dataB.fertility, dataB.resistance, dataB.growth].map((val, i) => {
    const l = val / 100;
    return `${cx + Math.cos(angles[i])*(r*l)},${cy + Math.sin(angles[i])*(r*l)}`;
  }).join(' ');
  const polyB = `<polygon points="${ptsB}" fill="#f97316" fill-opacity="0.3" stroke="#f97316" stroke-width="2"/>`;

  return `
    <div style="display:flex; justify-content:center;">
      <svg width="${size}" height="${size}">
        ${bgHtml}
        ${axisHtml}
        ${polyA}
        ${polyB}
        ${labelHtml}
      </svg>
    </div>
  `;
}
