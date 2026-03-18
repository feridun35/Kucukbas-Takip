/**
 * ShepherdAI — İş Gücü ve Görev Yönetimi Modülü UI
 */

import { getState } from '../core/state.js';
import { getTasksForUser, verifyTaskWithRFID, processSensorForEmergency } from '../core/workforceManager.js';
import { showConfirm, showAlert } from '../core/modal.js';

let _container = null;
let _currentRole = 'owner'; // 'owner' veya 'worker'

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter tasks-page';
  _container.style.paddingBottom = '180px'; 
  
  const tasks = getTasksForUser(_currentRole);
  const pendingCount = tasks.filter(t => t.status === 'pending').length;

  _container.innerHTML = `
    ${_renderHeader(pendingCount)}
    ${_currentRole === 'owner' ? _renderOwnerDashboard(tasks) : _renderWorkerTodoList(tasks)}
    ${_renderHugeActionButtons()}
    
    <!-- Emergency Modal (Gizli olarak DOM'a eklenir) -->
    <div id="emergency-overlay" class="emergency-overlay" style="display:none;">
      <div class="c-modal-box" style="border-color:var(--danger-red); box-shadow:0 10px 40px rgba(239,68,68,0.4); margin:var(--space-md);">
        <div class="c-modal-icon">⚠️</div>
        <h3 class="c-modal-title" id="e-title" style="color:var(--danger-red); font-size:1.5rem;">KRİTİK UYARI</h3>
        <p class="c-modal-message" id="e-message" style="color:#f8fafc; font-size:1rem; margin-bottom:var(--space-lg);">Acil durum detayı burada gösterilecek.</p>
        <div class="c-modal-actions">
          <button id="btn-dismiss-emergency" class="btn-primary" style="background:var(--danger-red); color:#fff; box-shadow: 0 4px 16px rgba(239,68,68,0.4);">ANLADIM & KAPAT</button>
        </div>
      </div>
    </div>
  `;

  return _container;
}

export function init() {
  if (!_container) return;

  const btnToggleRole = _container.querySelector('#btn-toggle-role');
  if (btnToggleRole) {
    btnToggleRole.addEventListener('click', () => {
      _currentRole = _currentRole === 'owner' ? 'worker' : 'owner';
      // Yeniden render
      const parent = _container.parentNode;
      const scrollPos = window.scrollY;
      parent.innerHTML = '';
      parent.appendChild(render());
      init();
      window.scrollTo(0, scrollPos);
    });
  }

  // Worker task buttons
  const rfidButtons = _container.querySelectorAll('.btn-simulate-rfid');
  rfidButtons.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskID = e.target.getAttribute('data-task-id');
      const targetRFID = e.target.getAttribute('data-rfid');
      
      // Simulate scanning the CORRECT rfid vs INCORRECT rfid
      const useCorrect = await showConfirm(
        'RFID Simülasyonu',
        "Doğru RFID'yi mi okutalım, yoksa yanlış bir hayvanı mı?",
        '📲'
      );
      
      const scanned = useCorrect ? targetRFID : "FAKE-RFID-999";
      const result = verifyTaskWithRFID(taskID, scanned);
      
      if (result.success) {
        showAlert('Başarılı', result.message, '✅');
        e.target.parentNode.parentNode.style.opacity = '0.5';
        e.target.innerText = 'Tamamlandı';
        e.target.disabled = true;
      } else {
        showAlert('Hata', result.message, '❌');
      }
    });
  });

  // Emergency Trigger Button (Test amaçlı)
  const btnTriggerGorev = _container.querySelector('#btn-start-task');
  if (btnTriggerGorev) {
    btnTriggerGorev.addEventListener('click', () => {
        // Amonyak 80 simülasyonu
        const emg = processSensorForEmergency('ammonia', 80);
        _triggerEmergencyUI(emg);
    });
  }

  const btnDismiss = _container.querySelector('#btn-dismiss-emergency');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      const overlay = _container.querySelector('#emergency-overlay');
      if (overlay) overlay.style.display = 'none';
      _container.classList.remove('emergency-active');
    });
  }
}

function _triggerEmergencyUI(emgData) {
  if (!emgData || !_container) return;
  
  const overlay = _container.querySelector('#emergency-overlay');
  if (overlay) {
    overlay.querySelector('#e-title').innerText = emgData.title;
    overlay.querySelector('#e-message').innerText = emgData.message;
    overlay.style.display = 'flex';
  }
  
  // Arka plana animasyon class'ı ekle
  _container.classList.add('emergency-active');
}

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderHeader(pendingCount) {
  return `
    <div class="tasks-header">
      <div class="tasks-h-left">
        <h2>Görev ve Lojistik Panosu</h2>
        <p>Mevcut Rol: <strong style="color:var(--accent-blue)">${_currentRole.toUpperCase()}</strong></p>
      </div>
      <div class="tasks-h-right">
        <button id="btn-toggle-role" class="btn-outline-blue">Görünüm Değiştir</button>
      </div>
    </div>
    
    <div class="task-summary-banner">
      <div class="t-summary-item">
        <span class="t-num">${pendingCount}</span>
        <span class="t-lbl">Açık Görev</span>
      </div>
      <div class="t-summary-item">
        <span class="t-num text-emerald">2</span>
        <span class="t-lbl">Tamamlanan</span>
      </div>
    </div>
  `;
}

function _renderOwnerDashboard(tasks) {
  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-orange)"></span>Komuta Paneli (Performans)</div>
    
    <div class="glass-card owner-stats-card">
      <div class="o-stat">
        <span class="o-val">Veli usta</span>
        <span class="o-lbl">Aktif Çoban</span>
      </div>
      <div class="o-stat">
        <span class="o-val">%85</span>
        <span class="o-lbl">Görev Verimi</span>
      </div>
      <div class="o-stat">
        <span class="o-val text-red">1</span>
        <span class="o-lbl">Geciken İş</span>
      </div>
    </div>

    <div class="section-title" style="margin-top:var(--space-lg)"><span class="dot" style="background:var(--accent-blue)"></span>Bugünün Görevleri</div>
    <div class="task-list">
      ${tasks.map(t => _renderTaskItem(t, 'owner')).join('')}
    </div>
  `;
}

function _renderWorkerTodoList(tasks) {
  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-blue)"></span>Ağıl İçi Yapılacaklar (To-Do)</div>
    <div class="task-list worker-list">
      <p style="font-size:0.75rem; color:var(--text-secondary); margin-bottom:12px;">Görevleri kapatmak için ilgili hayvanın RFID küpesini okutun.</p>
      ${tasks.map(t => _renderTaskItem(t, 'worker')).join('')}
    </div>
  `;
}

function _renderTaskItem(task, role) {
  const isCompleted = task.status === 'completed';
  const statusColor = isCompleted ? '#10b981' : (task.prio === 'High' ? '#ef4444' : '#f97316');
  
  // Eğer çoban modundaysak ve görev bitmediyse RFID butonu göster
  let actionArea = '';
  if (role === 'worker' && !isCompleted && task.targetAnimalRFID) {
    actionArea = `
      <div class="t-action">
        <button class="btn-simulate-rfid" data-task-id="${task.id}" data-rfid="${task.targetAnimalRFID}">
          📲 RFID Okut & Tamamla
        </button>
      </div>
    `;
  } else if (role === 'owner') {
     actionArea = `<div class="t-status" style="color:${statusColor}; font-weight:700; font-size:0.7rem;">${isCompleted ? 'Tamanlandı' : 'Bekliyor'}</div>`;
  }

  return `
    <div class="task-card ${isCompleted ? 'completed-task' : ''}" style="border-left: 4px solid ${statusColor}">
      <div class="t-main">
        <div class="t-title">${task.title}</div>
        <div class="t-desc">${task.desc}</div>
        ${task.targetTag ? `<div class="t-target">Hedef Hayvan: <span class="badge" style="background:rgba(255,255,255,0.1)">${task.targetTag}</span></div>` : ''}
      </div>
      ${actionArea}
    </div>
  `;
}

function _renderHugeActionButtons() {
  return `
    <div class="tasks-fixed-bottom">
      <button class="huge-btn btn-primary" id="btn-start-task" style="background:var(--accent-blue); box-shadow:0 4px 16px rgba(59, 130, 246, 0.4);">
        <span class="btn-icon">🚀</span> Acil Durum Test
      </button>
      <button class="huge-btn btn-secondary-deep" id="btn-photo" style="background:rgba(255,255,255,0.05); color:var(--text-primary); border:1px solid rgba(255,255,255,0.1);">
        <span class="btn-icon">📸</span> Fotoğraf
      </button>
    </div>
  `;
}
