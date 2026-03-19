/**
 * ShepherdAI — Dashboard Modülü
 * Ana giriş ekranı: Verim Odak Seçici, Hızlı Durum Kartları,
 * Refah & Isıl Stres Paneli, Akıllı Asistan Bildirimleri
 */

import { getState, setState, subscribe } from '../core/state.js';
import {
  mockHerdData, mockHealthData, mockFinanceData,
  mockSensorData, mockAlerts, focusKPIs
} from '../data/mock-data.js';

let _container = null;

/**
 * Dashboard sayfasını render et
 */
export function render() {
  _container = document.createElement('div');
  _container.className = 'dashboard-page page-enter';

  // State'e sadece sensör/finans mock yükle (hayvan verisi state.animals'tan gelir)
  const currentState = getState();
  if (!currentState.sensors || !currentState.sensors.temperature) {
    setState({
      sensors: mockSensorData,
      alerts: currentState.alerts && currentState.alerts.length > 0 ? currentState.alerts : mockAlerts
    });
  }
  if (!currentState.financeSummary || currentState.financeSummary.dailyFeedCost === 0) {
    setState({ financeSummary: mockFinanceData });
  }

  const state = getState();
  const computed = _computeHerdStats(state);

  _container.innerHTML = `
    ${_renderHeader()}
    ${_renderAlerts(state.alerts)}
    ${_renderFocusSelector(state.focusMode)}
    ${_renderKPIRow(state.focusMode)}
    <div class="section-title"><span class="dot"></span>Hızlı Durum</div>
    ${_renderStatCards(state, computed)}
    <div class="section-title"><span class="dot"></span>Refah & Isıl Stres</div>
    ${_renderGaugePanel(state.sensors)}
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

    card.addEventListener('touchstart', (e) => {
      startX = e.touches[0].clientX;
      swiping = true;
      card.style.transition = 'none';
    });
    card.addEventListener('touchmove', (e) => {
      if (!swiping) return;
      currentX = e.touches[0].clientX - startX;
      if (currentX < 0) {
        const progress = Math.min(Math.abs(currentX) / 150, 1);
        card.style.transform = `translateX(${currentX}px) scale(${1 - progress * 0.05})`;
        card.style.opacity = 1 - progress * 0.5;
      }
    });
    card.addEventListener('touchend', () => {
      swiping = false;
      card.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s';
      if (currentX < -80) {
        card.style.transform = 'translateX(-120%) scale(0.8)';
        card.style.opacity = '0';
        setTimeout(() => {
          card.style.height = '0';
          card.style.margin = '0';
          card.style.padding = '0';
          card.style.border = 'none';
          card.style.overflow = 'hidden';
        }, 300);
      } else {
        card.style.transform = 'translateX(0) scale(1)';
        card.style.opacity = '1';
      }
      currentX = 0;
    });

    // Mouse swipe (desktop)
    card.addEventListener('mousedown', (e) => {
      startX = e.clientX;
      swiping = true;
      card.style.transition = 'none';
      card.style.cursor = 'grabbing';
    });
    const onMouseMove = (e) => {
      if (!swiping) return;
      currentX = e.clientX - startX;
      if (currentX < 0) {
        const progress = Math.min(Math.abs(currentX) / 150, 1);
        card.style.transform = `translateX(${currentX}px) scale(${1 - progress * 0.05})`;
        card.style.opacity = 1 - progress * 0.5;
      }
    };
    const onMouseUp = () => {
      if (!swiping) return;
      swiping = false;
      card.style.transition = 'transform 0.3s cubic-bezier(0.4, 0.0, 0.2, 1), opacity 0.3s';
      card.style.cursor = 'default';
      if (currentX < -80) {
        card.style.transform = 'translateX(-120%) scale(0.8)';
        card.style.opacity = '0';
        setTimeout(() => {
          card.style.height = '0';
          card.style.margin = '0';
          card.style.padding = '0';
          card.style.border = 'none';
          card.style.overflow = 'hidden';
        }, 300);
      } else {
        card.style.transform = 'translateX(0) scale(1)';
        card.style.opacity = '1';
      }
      currentX = 0;
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
  });
}

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderHeader() {
  return `
    <div class="dashboard-header">
      <div class="header-left">
        <span class="header-greeting">Hoş geldiniz 👋</span>
        <h1 class="header-title">
          <span class="logo-icon">🐑</span>
          ShepherdAI
        </h1>
      </div>
      <div class="header-right">
        <div class="header-badge" id="notif-badge" title="Bildirimler">
          🔔
          <span class="badge-dot"></span>
        </div>
      </div>
    </div>
  `;
}

function _renderAlerts(alerts) {
  if (!alerts || alerts.length === 0) return '';

  const typeClassMap = { danger: '', warning: 'warning', info: 'info' };

  const items = alerts.map((a, i) => `
    <div class="alert-card ${typeClassMap[a.type] || ''}" style="animation-delay: ${i * 0.1}s">
      <div class="alert-icon">${a.icon}</div>
      <div class="alert-content">
        <div class="alert-title">${a.title}</div>
        <div class="alert-desc">${a.desc}</div>
        <div class="alert-time">${a.time}</div>
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
    <div class="section-title"><span class="dot"></span>Verim Odağı</div>
    <div class="focus-selector">${btns}</div>
  `;
}

function _renderKPIRow(mode) {
  const data = focusKPIs[mode];
  if (!data) return '';

  const items = data.kpis.map(k => `
    <div class="kpi-item">
      <span class="kpi-value">${k.value}<small style="font-size:0.6em;opacity:0.6;margin-left:2px">${k.unit}</small></span>
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
  const avgWeight = total > 0 ? (animals.reduce((s, a) => s + (a.weight || 0), 0) / total).toFixed(0) : 0;
  const sick = animals.filter(a => a.status === 'danger').length;
  const quarantine = animals.filter(a => a.status === 'warning').length;
  const expectedBirths = animals.filter(a => a.group === 'Gebe').length;

  return { total, sheep, goat, avgWeight, sick, quarantine, expectedBirths };
}

function _renderStatCards(state, computed) {
  const c = computed || _computeHerdStats(state);
  const fin = state.financeSummary || mockFinanceData;

  // Yem stok gün hesabı
  const feedInv = state.feedInventory || [];
  const totalFeedKg = feedInv.filter(f => f.unit === 'kg').reduce((s, f) => s + f.amount, 0);
  const dailyConsumption = 245; // kg (sürü geneli)
  const feedDays = dailyConsumption > 0 ? Math.floor(totalFeedKg / dailyConsumption) : 0;

  const cards = [
    {
      label: 'Toplam Hayvan',
      value: c.total,
      sub: `${c.sheep} koyun · ${c.goat} keçi`,
      color: 'green'
    },
    {
      label: 'Beklenen Doğum',
      value: c.expectedBirths,
      sub: 'Gebe hayvan sayısı',
      color: 'purple'
    },
    {
      label: 'Hasta / Riskli',
      value: `${c.sick}/${c.quarantine}`,
      sub: 'Kritik / Takipte',
      color: 'red'
    },
    {
      label: 'Günlük Yem Maliyeti',
      value: `${fin.dailyFeedCost.toLocaleString('tr-TR')}₺`,
      sub: `${feedDays} gün stok · ${totalFeedKg.toLocaleString('tr-TR')} kg`,
      color: 'amber'
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
  const t = sensors.thresholds || mockSensorData.thresholds;

  const gauges = [
    {
      label: 'Sıcaklık',
      value: sensors.temperature?.toFixed?.(1) ?? mockSensorData.temperature,
      unit: '°C',
      max: 45,
      thresholds: t.temperature
    },
    {
      label: 'Nem',
      value: sensors.humidity?.toFixed?.(0) ?? mockSensorData.humidity,
      unit: '%',
      max: 100,
      thresholds: t.humidity
    },
    {
      label: 'NH₃',
      value: sensors.nh3?.toFixed?.(1) ?? mockSensorData.nh3,
      unit: 'ppm',
      max: 50,
      thresholds: t.nh3
    }
  ];

  const items = gauges.map(g => {
    const numVal = parseFloat(g.value);
    const status = numVal >= g.thresholds.danger ? 'danger'
                 : numVal >= g.thresholds.warning ? 'warning'
                 : 'normal';

    const statusText = status === 'danger' ? 'KRİTİK'
                     : status === 'warning' ? 'DİKKAT'
                     : 'NORMAL';

    // SVG gauge hesaplama
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

// ═══════════════════════════════════════
// Dinamik Güncelleme
// ═══════════════════════════════════════

function _updateKPIRow(mode) {
  const row = document.getElementById('kpi-row');
  if (!row) return;

  const data = focusKPIs[mode];
  if (!data) return;

  row.innerHTML = data.kpis.map(k => `
    <div class="kpi-item">
      <span class="kpi-value">${k.value}<small style="font-size:0.6em;opacity:0.6;margin-left:2px">${k.unit}</small></span>
      <span class="kpi-label">${k.label}</span>
    </div>
  `).join('');

  // Animasyon
  row.style.animation = 'none';
  row.offsetHeight; // reflow
  row.style.animation = 'pageIn 0.3s ease forwards';
}

function _updateStatCards() {
  const state = getState();
  const grid = document.getElementById('stats-grid');
  if (!grid) return;

  // Stat kartlarını yeniden render et
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = _renderStatCards(state);
  const newGrid = tempDiv.querySelector('.stats-grid');
  if (newGrid) {
    grid.innerHTML = newGrid.innerHTML;
  }
}
