/**
 * ShepherdAI — Dashboard Modülü
 * Ana giriş ekranı: Verim Odak Seçici, Hızlı Durum Kartları,
 * Refah & Isıl Stres Paneli, Akıllı Asistan Bildirimleri
 */

import { computeAlerts } from '../core/alertsEngine.js';
import { escapeHtml } from '../core/sanitize.js';
import { getState, setState } from '../core/state.js';
import { getCurrentUser } from '../core/auth.js';
import { getAllQuarantinedAnimals } from '../core/healthManager.js';
import { calculateAverageDailyGain } from '../core/herdMathEngine.js';
import { getPregnantAnimalIds } from '../core/breedingStatus.js';

let _container = null;

/**
 * Dashboard sayfasını render et
 */
export function render() {
  _container = document.createElement('div');
  _container.className = 'dashboard-page page-enter';

  const state = getState();
  const computed = _computeHerdStats(state);

  const alerts = computeAlerts();

  _container.innerHTML = `
    ${_renderHeader(alerts.length > 0)}
    ${_renderAlerts(alerts, state.animals?.length || 0)}
    <div class="section-title"><span class="dot"></span>Refah & Isıl Stres (Ağıl Sensörleri)</div>
    ${_renderGaugePanel(state.sensors)}
    <div class="section-title"><span class="dot"></span>Hızlı Durum</div>
    ${_renderStatCards(state, computed)}
    <div class="section-title"><span class="dot"></span>Verim Odağı</div>
    ${_renderFocusSelector(state.focusMode || 'meat')}
    ${_renderKPIRow(state.focusMode || 'meat', state)}
  `;

  return _container;
}

/**
 * Dashboard event listener'larını kur
 */
export function init() {
  if (!_container) return;

  // Verim Odak butonları
  _container.querySelectorAll('.focus-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const mode = btn.dataset.focus;
      setState({ focusMode: mode });

      _container.querySelectorAll('.focus-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');

      _updateKPIRow(mode);
      _updateStatCards();
    });
  });

  // Alert swipe-to-dismiss
  _container.querySelectorAll('.alert-card').forEach(card => {
    let startX = 0;
    let currentX = 0;
    let swiping = false;

    card.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault();
      card.setPointerCapture(e.pointerId);
      startX = e.clientX;
      swiping = true;
      card.style.transition = 'none';
      card.style.cursor = 'grabbing';
    });

    card.addEventListener('pointermove', (e) => {
      if (!swiping) return;
      currentX = e.clientX - startX;
      if (currentX < 0) {
        card.style.transform = `translateX(${currentX}px)`;
        card.style.opacity = '1';
      }
    });

    const endSwipe = (e) => {
      if (!swiping) return;
      swiping = false;
      try { card.releasePointerCapture(e.pointerId); } catch(ex){}
      
      card.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s';
      card.style.cursor = 'default';
      
      if (currentX < -80) {
        card.style.transform = 'translateX(-120%)';
        card.style.opacity = '0';
        setTimeout(() => {
          const h = card.offsetHeight;
          card.style.transition = 'height 0.3s ease, margin 0.3s ease, padding 0.3s ease, opacity 0.3s ease';
          card.style.height = h + 'px';
          card.style.overflow = 'hidden';
          card.offsetHeight;
          card.style.height = '0';
          card.style.marginTop = '0';
          card.style.marginBottom = '0';
          card.style.paddingTop = '0';
          card.style.paddingBottom = '0';
          card.style.border = 'none';
          setTimeout(() => {
            card.remove();
            const container = _container.querySelector('.alerts-container');
            if (container && container.children.length === 0) {
              container.innerHTML = `
                <div class="glass-card" style="text-align:center; padding:20px; color:var(--text-muted); font-style:italic; animation: pageIn 0.3s ease;">
                  Her şey yolunda, iyi günler.
                </div>
              `;
            }
          }, 300);
        }, 300);
      } else {
        card.style.transform = 'translateX(0)';
      }
      currentX = 0;
    };

    card.addEventListener('pointerup', endSwipe);
    card.addEventListener('pointercancel', endSwipe);
  });
}

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderHeader(hasAlerts = false) {
  const user = getCurrentUser();
  const farmName = user?.farmName || 'ShepherdAI';
  const ownerName = user?.ownerName || 'Çiftlik Yöneticisi';

  return `
    <div class="dashboard-header">
      <div class="header-left">
        <span class="header-greeting">Merhaba, ${escapeHtml(ownerName)} 👋</span>
        <h1 class="header-title">
          <span class="logo-icon">🐑</span>
          ${escapeHtml(farmName)}
        </h1>
      </div>
      <div class="header-right">
        <div class="header-badge" id="notif-badge" title="Bildirimler">
          🔔
          ${hasAlerts ? '<span class="badge-dot"></span>' : ''}
        </div>
      </div>
    </div>
  `;
}

function _renderAlerts(alerts, animalCount = 0) {
  if (!alerts || alerts.length === 0) {
    if (animalCount === 0) {
      return `
        <div class="section-title"><span class="dot" style="background:var(--accent-blue);box-shadow:0 0 8px var(--accent-blue-glow)"></span>Akıllı Asistan</div>
        <div class="alerts-container">
          <div class="glass-card" style="padding:16px; border-left:4px solid var(--accent-blue); display:flex; align-items:center; gap:12px;">
            <span style="font-size:1.6rem;">💡</span>
            <div>
              <div style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">Yeni Başlangıç Rehberi</div>
              <div style="font-size:0.75rem; color:var(--text-secondary); margin-top:2px;">Sürünüzü yönetmek için 'Sürü' sekmesinden ilk hayvanınızı ekleyin.</div>
            </div>
          </div>
        </div>
      `;
    }

    return `
      <div class="section-title"><span class="dot" style="background:var(--danger-red);box-shadow:0 0 8px var(--danger-red-glow)"></span>Akıllı Asistan</div>
      <div class="alerts-container" style="touch-action: pan-y;">
        <div class="glass-card" style="text-align:center; padding:20px; color:var(--text-muted); font-style:italic;">
          Her şey yolunda, iyi günler.
        </div>
      </div>
    `;
  }

  const typeClassMap = { danger: '', warning: 'warning', info: 'info' };

  const items = alerts.map((a, i) => `
    <div class="alert-card ${typeClassMap[a.type] || ''}" style="animation-delay: ${i * 0.1}s">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${escapeHtml(a.title)}</div>
        <div class="alert-desc">${escapeHtml(a.desc)}</div>
      </div>
    </div>
  `).join('');

  return `
    <div class="section-title"><span class="dot" style="background:var(--danger-red);box-shadow:0 0 8px var(--danger-red-glow)"></span>Akıllı Asistan</div>
    <div class="alerts-container">${items}</div>
  `;
}

function _renderFocusSelector(activeMode) {
  const modes = [
    { key: 'meat',  icon: '🥩', label: 'Et Verimi' },
    { key: 'milk',  icon: '🥛', label: 'Süt Verimi' },
    { key: 'breed', icon: '🐑', label: 'Döl Verimi' },
  ];

  const btns = modes.map(m => `
    <button class="focus-btn ${m.key === activeMode ? 'active' : ''}" data-focus="${m.key}">
      <span class="focus-icon">${m.icon}</span>
      <span>${m.label}</span>
    </button>
  `).join('');

  return `
    <div class="focus-selector">${btns}</div>
  `;
}

/**
 * Verim odağına göre KPI'lar — yalnızca kayıtlı veriden hesaplanır.
 * Hesaplanamayan değer "Veri yok" gösterilir (sabit/uydurma değer kullanılmaz).
 */
function _calculateDynamicKPIs(mode, state) {
  const animals = state.animals || [];
  const NO_DATA = 'Veri yok';
  const young = ['Kuzu', 'Oğlak'];
  const fmtPct = (num, den) => den > 0 ? `%${Math.round((num / den) * 100)}` : NO_DATA;

  if (mode === 'meat') {
    const weights = animals.map(a => parseFloat(a.weight)).filter(w => w > 0);
    const avgW = weights.length ? `${(weights.reduce((s, w) => s + w, 0) / weights.length).toFixed(1)} kg` : NO_DATA;
    const gains = animals.map(calculateAverageDailyGain).filter(g => g !== null);
    const avgGain = gains.length ? `${Math.round(gains.reduce((s, g) => s + g, 0) / gains.length * 1000)} g/gün` : NO_DATA;
    const besi = animals.filter(a => a.group === 'Besi');
    const quarantined = new Set(getAllQuarantinedAnimals().filter(q => q.meatDaysLeft > 0).map(q => q.animalId));
    const saleReady = besi.filter(a => !quarantined.has(a.id)).length;
    return [
      { label: 'Ort. Canlı Ağırlık', value: avgW },
      { label: 'Ort. Günlük Artış', value: avgGain },
      { label: 'Besi Hayvanı', value: `${besi.length} baş` },
      { label: 'Kesime Uygun (Besi)', value: `${saleReady} baş` }
    ];
  }

  if (mode === 'milk') {
    const milking = animals.filter(a => a.group === 'Sağmal');
    const milkWithdrawal = new Set(getAllQuarantinedAnimals().filter(q => q.milkDaysLeft > 0).map(q => q.animalId));
    const inWithdrawal = milking.filter(a => milkWithdrawal.has(a.id)).length;
    const bcs = milking.map(a => parseFloat(a.bcs)).filter(b => b > 0);
    return [
      { label: 'Sağmal Hayvan', value: `${milking.length} baş` },
      { label: 'Sütü Satılabilir', value: `${milking.length - inWithdrawal} baş` },
      { label: 'Süt Arınmasında', value: `${inWithdrawal} baş` },
      { label: 'Ort. VKS (Sağmal)', value: bcs.length ? (bcs.reduce((s, b) => s + b, 0) / bcs.length).toFixed(1) : NO_DATA }
    ];
  }

  // Döl verimi
  const adultFemales = animals.filter(a => a.gender === 'Dişi' && !young.includes(a.type));
  const adultMales = animals.filter(a => a.gender === 'Erkek' && !young.includes(a.type));
  const pregnant = new Set(getPregnantAnimalIds(animals, state.breedingRecords));
  const pregnantAdults = adultFemales.filter(a => pregnant.has(a.id)).length;

  const births = [];
  (state.breedingRecords || []).forEach(r => {
    if (Array.isArray(r.births) && r.births.length) births.push(...r.births);
    else if (r.birthRecord) births.push({ lambCount: r.birthRecord.lambCount || 1, babyIds: [] });
  });
  const multiples = births.filter(b => (b.lambCount || 1) >= 2).length;
  const aliveIds = new Set(animals.map(a => a.id));
  const babyIds = births.flatMap(b => b.babyIds || []);
  const survived = babyIds.filter(id => aliveIds.has(id)).length;

  return [
    { label: 'Gebelik Oranı', value: fmtPct(pregnantAdults, adultFemales.length) },
    { label: 'Koç : Anaç', value: adultMales.length && adultFemales.length ? `1:${Math.round(adultFemales.length / adultMales.length)}` : NO_DATA },
    { label: 'İkizlik Oranı', value: fmtPct(multiples, births.length) },
    { label: 'Yavru Yaşama Oranı', value: fmtPct(survived, babyIds.length) }
  ];
}

function _renderKPIRow(mode, state) {
  const kpis = _calculateDynamicKPIs(mode, state);

  const items = kpis.map(k => `
    <div class="kpi-item">
      <span class="kpi-value">${k.value}</span>
      <span class="kpi-label">${k.label}</span>
    </div>
  `).join('');

  return `<div class="glass-card kpi-row" id="kpi-row">${items}</div>`;
}

function _computeHerdStats(state) {
  const animals = state.animals || [];
  const total = animals.length;
  const sheep = animals.filter(a => ['Koyun', 'Koç', 'Kuzu'].includes(a.type)).length;
  const goat = animals.filter(a => ['Keçi', 'Teke', 'Oğlak'].includes(a.type)).length;
  const weights = animals.map(a => parseFloat(a.weight)).filter(w => !isNaN(w) && w > 0);
  const avgWeight = weights.length > 0 ? (weights.reduce((s, w) => s + w, 0) / weights.length).toFixed(0) : 0;
  const sick = animals.filter(a => a.status === 'danger').length;
  const quarantinedList = getAllQuarantinedAnimals();
  const quarantine = quarantinedList.length;
  const expectedBirths = getPregnantAnimalIds(animals, state.breedingRecords).length;

  return { total, sheep, goat, avgWeight, sick, quarantine, quarantinedList, expectedBirths };
}

function _renderStatCards(state, computed) {
  const c = computed || _computeHerdStats(state);
  const fin = state.financeSummary || {};
  const feedInv = state.feedInventory || [];

  const dailyCost = fin.dailyFeedCost || 0;
  const dailyKg = fin.dailyFeedKg || 0;
  const stockDays = fin.feedStockDays || 0;

  const cards = [
    {
      label: 'Toplam Hayvan',
      value: c.total,
      sub: c.total > 0 ? `${c.sheep} koyun · ${c.goat} keçi` : 'Kayıt Yok',
      color: 'green'
    },
    {
      label: 'Beklenen Doğum',
      value: c.expectedBirths,
      sub: c.expectedBirths > 0 ? 'Gebe hayvan sayısı' : 'Kayıt Yok',
      color: 'purple'
    },
    {
      label: '🏥 Karantinadaki Hayvan',
      value: `${c.quarantine} Baş`,
      sub: c.quarantine > 0 ? `Aktif ilaç arınma süresinde` : 'Karantinada Hayvan Yok',
      color: c.quarantine > 0 ? 'amber' : 'green'
    },
    {
      label: 'Günlük Yem Maliyeti',
      value: c.total > 0 ? `${dailyCost.toLocaleString('tr-TR')}₺` : '0₺',
      sub: c.total > 0 ? `${dailyKg} kg/gün · ${stockDays} gün stok` : 'Sürü Boş',
      color: 'blue'
    }
  ];

  const items = cards.map(c => `
    <div class="glass-card stat-card ${c.color}">
      <span class="stat-label">${c.label}</span>
      <span class="stat-value">${c.value}</span>
      <span class="stat-sub">${c.sub}</span>
    </div>
  `).join('');

  return `<div class="stats-grid" id="stats-grid">${items}</div>`;
}

function _renderGaugePanel(sensors) {
  const isConnected = Boolean(sensors?.connected && sensors?.temperature !== null);

  if (!isConnected) {
    return `
      <div class="glass-card" style="padding:16px 20px; margin-bottom:var(--space-md); border-color:rgba(245,158,11,0.25); background:rgba(245,158,11,0.03);">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:10px;">
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:1.2rem;">📡</span>
            <span style="font-weight:700; font-size:0.9rem; color:var(--text-primary);">Ağıl Telemetri Durumu</span>
          </div>
          <span style="font-size:0.75rem; padding:3px 10px; border-radius:12px; background:rgba(245,158,11,0.15); color:var(--warning-orange); font-weight:600;">
            🔌 ESP32 Bağlantısı Bekleniyor
          </span>
        </div>
        <div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; text-align:center; margin-top:12px;">
          <div style="padding:10px 6px; background:rgba(0,0,0,0.2); border-radius:12px; border:1px solid var(--glass-border);">
            <div style="font-size:0.7rem; color:var(--text-muted);">Sıcaklık</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text-secondary); margin:2px 0;">Bilinmiyor</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">-- °C</div>
          </div>
          <div style="padding:10px 6px; background:rgba(0,0,0,0.2); border-radius:12px; border:1px solid var(--glass-border);">
            <div style="font-size:0.7rem; color:var(--text-muted);">Nem</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text-secondary); margin:2px 0;">Bilinmiyor</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">-- %</div>
          </div>
          <div style="padding:10px 6px; background:rgba(0,0,0,0.2); border-radius:12px; border:1px solid var(--glass-border);">
            <div style="font-size:0.7rem; color:var(--text-muted);">NH₃ (Amonyak)</div>
            <div style="font-size:1rem; font-weight:700; color:var(--text-secondary); margin:2px 0;">Bilinmiyor</div>
            <div style="font-size:0.65rem; color:var(--text-muted);">-- ppm</div>
          </div>
        </div>
      </div>
    `;
  }

  // Bağlı sensörler için gerçek veya demo gauge çizimi
  const t = sensors?.thresholds || {
    temperature: { normal: 28, warning: 32, danger: 36 },
    humidity:    { normal: 70, warning: 80, danger: 90 },
    nh3:         { normal: 15, warning: 25, danger: 35 }
  };

  const tempVal = sensors.temperature;
  const humVal = sensors.humidity;
  const nh3Val = sensors.nh3;

  const gauges = [
    {
      label: 'Sıcaklık',
      value: typeof tempVal === 'number' ? tempVal.toFixed(1) : tempVal,
      unit: '°C',
      max: 45,
      thresholds: t.temperature
    },
    {
      label: 'Nem',
      value: typeof humVal === 'number' ? humVal.toFixed(0) : humVal,
      unit: '%',
      max: 100,
      thresholds: t.humidity
    },
    {
      label: 'NH₃',
      value: typeof nh3Val === 'number' ? nh3Val.toFixed(1) : nh3Val,
      unit: 'ppm',
      max: 50,
      thresholds: t.nh3
    }
  ];

  const items = gauges.map(g => {
    const numVal = parseFloat(g.value) || 0;
    const status = numVal >= g.thresholds.danger ? 'danger'
                 : numVal >= g.thresholds.warning ? 'warning'
                 : 'normal';

    const statusText = status === 'danger' ? 'KRİTİK'
                     : status === 'warning' ? 'DİKKAT'
                     : 'NORMAL';

    const radius = 36;
    const circumference = 2 * Math.PI * radius;
    const percent = Math.min(numVal / g.max, 1);
    const dashOffset = circumference * (1 - percent);

    return `
      <div class="glass-card gauge-card">
        <svg class="gauge-svg" viewBox="0 0 90 90">
          <circle class="gauge-bg" cx="45" cy="45" r="${radius}"/>
          <circle class="gauge-fill ${status}"
                  cx="45" cy="45" r="${radius}"
                  stroke-dasharray="${circumference}"
                  stroke-dashoffset="${dashOffset}"/>
          <text class="gauge-value-text" x="45" y="42">${g.value}</text>
          <text class="gauge-unit-text" x="45" y="56">${g.unit}</text>
        </svg>
        <span class="gauge-label">${g.label}</span>
        <span class="gauge-status ${status}">${statusText}</span>
      </div>
    `;
  }).join('');

  return `<div class="gauge-panel" id="gauge-panel">${items}</div>`;
}

function _updateKPIRow(mode) {
  const row = document.getElementById('kpi-row');
  if (!row) return;

  const state = getState();
  const kpis = _calculateDynamicKPIs(mode, state);

  row.innerHTML = kpis.map(k => `
    <div class="kpi-item">
      <span class="kpi-value">${k.value}</span>
      <span class="kpi-label">${k.label}</span>
    </div>
  `).join('');

  row.style.animation = 'none';
  row.offsetHeight;
  row.style.animation = 'pageIn 0.3s ease forwards';
}

function _updateStatCards() {
  const state = getState();
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = _renderStatCards(state);
  const newGrid = tempDiv.querySelector('.stats-grid');
  if (newGrid) {
    grid.innerHTML = newGrid.innerHTML;
  }
}
