/**
 * ShepherdAI — İş Gücü ve Görev Yönetimi Modülü UI
 * State-driven: Görevler state.tasks / state.taskHistory üzerinden yönetilir.
 */

import { getState, setState } from '../core/state.js';
import { getTasksForUser, getTaskHistory, addTask, completeTask, TASK_TYPES, processSensorForEmergency } from '../core/workforceManager.js';
import { showConfirm, showAlert, showPrompt, showSelect } from '../core/modal.js';

let _container = null;
let _viewMode = 'active'; // 'active' | 'history'

export function render() {
  _container = document.createElement('div');
  _container.className = 'page-enter tasks-page';
  _container.style.paddingBottom = '180px'; 
  
  const state = getState();
  const role = state.userRole || 'owner';
  const tasks = getTasksForUser(role, 'all');
  const history = getTaskHistory('all');
  const pendingCount = tasks.filter(t => t.status === 'pending').length;

  _container.innerHTML = `
    ${_renderHeader(role, pendingCount, history.length)}
    ${_renderViewToggle()}
    ${_viewMode === 'active' 
      ? (role === 'owner' ? _renderOwnerDashboard(tasks) : _renderWorkerTodoList(tasks))
      : _renderHistoryList(history)
    }
    ${_renderHugeActionButtons(role)}
    
    <!-- Emergency Modal -->
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

  // Aktif / Geçmiş geçişi
  const btnActive = _container.querySelector('#btn-view-active');
  const btnHistory = _container.querySelector('#btn-view-history');
  if (btnActive) btnActive.addEventListener('click', () => { _viewMode = 'active'; _rerender(); });
  if (btnHistory) btnHistory.addEventListener('click', () => { _viewMode = 'history'; _rerender(); });

  // Görev Tamamlama butonları
  const completeBtns = _container.querySelectorAll('.btn-complete-task');
  completeBtns.forEach(btn => {
    btn.addEventListener('click', async (e) => {
      const taskId = e.target.closest('[data-task-id]').getAttribute('data-task-id');
      const confirmed = await showConfirm('Görevi Tamamla', 'Bu görevi tamamlandı olarak işaretlemek istiyor musunuz?', '✅');
      if (confirmed) {
        const result = completeTask(taskId);
        if (result.success) {
          showAlert('Başarılı', result.message, '✅');
          _rerender();
        } else {
          showAlert('Hata', result.message, '❌');
        }
      }
    });
  });

  // Görev Ekle butonu
  const btnAddTask = _container.querySelector('#btn-add-herd-task');
  if (btnAddTask) {
    btnAddTask.addEventListener('click', async () => {
      await _showAddTaskFlow('herd', null);
    });
  }

  // Acil Durum Test
  const btnEmergency = _container.querySelector('#btn-emergency-test');
  if (btnEmergency) {
    btnEmergency.addEventListener('click', () => {
      const emg = processSensorForEmergency('ammonia', 80);
      _triggerEmergencyUI(emg);
    });
  }

  // Emergency dismiss
  const btnDismiss = _container.querySelector('#btn-dismiss-emergency');
  if (btnDismiss) {
    btnDismiss.addEventListener('click', () => {
      const overlay = _container.querySelector('#emergency-overlay');
      if (overlay) overlay.style.display = 'none';
      _container.classList.remove('emergency-active');
    });
  }
}

// ═══════════════════════════════════════
// Görev Ekleme Akışı (Sürü & Bireysel)
// ═══════════════════════════════════════
async function _showAddTaskFlow(scope, animalTag) {
  // 1. Tür seçimi (tıklanabilir butonlar)
  const typeOptions = TASK_TYPES.map(t => ({ value: t.value, label: t.label, color: t.color }));
  const selectedType = await showSelect(
    `Görev Türü Seçin ${scope === 'herd' ? '(Sürü Görevi)' : '(Bireysel)'}`,
    typeOptions, '📋'
  );
  if (!selectedType) return;
  const matchedType = TASK_TYPES.find(t => t.value === selectedType.value) || TASK_TYPES[5];

  // 2. Görev başlığı
  const title = await showPrompt('Görev Başlığı', `${matchedType.label} görevi için başlık giriniz:`, 'text', matchedType.label.split(' ')[0]);
  if (!title) return;

  // 3. Açıklama
  const desc = await showPrompt('Açıklama', 'Kısa açıklama (opsiyonel):', 'text', '📝') || '';

  // 4. Öncelik (tıklanabilir)
  const prioOption = await showSelect('Öncelik Seçin', [
    { value: 'High', label: 'Yüksek Öncelik', color: '#ef4444', icon: '🔴' },
    { value: 'Normal', label: 'Normal Öncelik', color: '#3b82f6', icon: '🟢' }
  ], '⚡');
  const prio = prioOption ? prioOption.value : 'Normal';

  // Ekle
  const newTask = addTask({
    title,
    desc,
    type: matchedType.value,
    prio,
    scope,
    targetTag: animalTag
  });

  showAlert('Görev Eklendi', `"${newTask.title}" başarıyla ${scope === 'herd' ? '🐑 Sürü' : animalTag} görevi olarak eklendi.`, '✅');
  _viewMode = 'active';
  _rerender();
}

// Export for animal-profile to use
export { _showAddTaskFlow as showAddTaskFlow };

// ═══════════════════════════════════════
// Render Helpers
// ═══════════════════════════════════════

function _renderHeader(role, pendingCount, historyCount) {
  const isOwner = role === 'owner';
  return `
    <div class="tasks-header">
      <div class="tasks-h-left">
        <h2>Görev ve Lojistik Panosu</h2>
        <p>Aktif Rol: <strong style="color:${isOwner ? 'var(--accent-blue)' : 'var(--accent-green)'}">${isOwner ? '👨‍🌾 SAHİP' : '🧑‍🔧 ÇALIŞAN'}</strong></p>
      </div>
    </div>
    
    <div class="task-summary-banner">
      <div class="t-summary-item">
        <span class="t-num">${pendingCount}</span>
        <span class="t-lbl">Açık Görev</span>
      </div>
      <div class="t-summary-item">
        <span class="t-num text-emerald">${historyCount}</span>
        <span class="t-lbl">Tamamlanan</span>
      </div>
    </div>
  `;
}

function _renderViewToggle() {
  return `
    <div style="display:flex; gap:8px; margin:var(--space-md) 0;">
      <button id="btn-view-active" style="flex:1; padding:10px; border-radius:12px; border:none; font-weight:600; cursor:pointer; transition:0.2s; background:${_viewMode === 'active' ? 'var(--accent-blue)' : 'var(--glass-bg)'}; color:${_viewMode === 'active' ? '#fff' : 'var(--text-muted)'};">
        📋 Aktif Görevler
      </button>
      <button id="btn-view-history" style="flex:1; padding:10px; border-radius:12px; border:none; font-weight:600; cursor:pointer; transition:0.2s; background:${_viewMode === 'history' ? 'var(--accent-purple)' : 'var(--glass-bg)'}; color:${_viewMode === 'history' ? '#fff' : 'var(--text-muted)'};">
        📜 Geçmiş
      </button>
    </div>
  `;
}

function _renderOwnerDashboard(tasks) {
  if (tasks.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:var(--space-xl); color:var(--text-muted);">
        <p style="font-size:2rem; margin-bottom:8px;">🎉</p>
        <p>Tüm sürü görevleri tamamlandı!</p>
      </div>
    `;
  }

  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-blue)"></span>Sürü Görevleri</div>
    <div class="task-list">
      ${tasks.map(t => _renderTaskItem(t, 'owner')).join('')}
    </div>
  `;
}

function _renderWorkerTodoList(tasks) {
  if (tasks.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:var(--space-xl); color:var(--text-muted);">
        <p style="font-size:2rem; margin-bottom:8px;">✅</p>
        <p>Bekleyen görev yok. İyi iş!</p>
      </div>
    `;
  }

  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-green)"></span>Yapılacaklar</div>
    <div class="task-list worker-list">
      ${tasks.map(t => _renderTaskItem(t, 'worker')).join('')}
    </div>
  `;
}

function _renderHistoryList(history) {
  if (history.length === 0) {
    return `
      <div class="glass-card" style="text-align:center; padding:var(--space-xl); color:var(--text-muted);">
        <p style="font-size:2rem; margin-bottom:8px;">📭</p>
        <p>Henüz tamamlanan görev yok.</p>
      </div>
    `;
  }

  return `
    <div class="section-title"><span class="dot" style="background:var(--accent-purple)"></span>Tamamlanan Görevler</div>
    <div class="task-list">
      ${history.map(t => {
        const typeInfo = TASK_TYPES.find(tt => tt.value === t.type) || TASK_TYPES[5];
        return `
          <div class="task-card completed-task" style="border-left: 4px solid #10b981; opacity:0.8;">
            <div class="t-main">
              <div class="t-title" style="text-decoration:line-through; color:var(--text-muted);">
                <span style="font-size:0.8rem;">${typeInfo.label.split(' ')[0]}</span> ${t.title}
              </div>
              <div class="t-desc">${t.desc || ''}</div>
              <div style="font-size:0.7rem; color:var(--text-muted); margin-top:4px;">
                ${t.targetTag ? `Hedef: <strong>${t.targetTag}</strong> · ` : ''}Tamamlandı: ${t.completedAt || '-'}
              </div>
            </div>
            <div class="t-status" style="color:#10b981; font-weight:700; font-size:0.7rem;">✔ Bitti</div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function _renderTaskItem(task, role) {
  const typeInfo = TASK_TYPES.find(t => t.value === task.type) || TASK_TYPES[5];
  const isCompleted = task.status === 'completed';
  const statusColor = isCompleted ? '#10b981' : (task.prio === 'High' ? '#ef4444' : '#f97316');
  
  let actionArea = '';
  if (!isCompleted) {
    actionArea = `
      <div class="t-action" data-task-id="${task.id}">
        <button class="btn-complete-task" style="padding:8px 14px; border-radius:12px; border:none; background:var(--accent-green); color:#fff; font-weight:600; font-size:0.75rem; cursor:pointer; box-shadow:0 2px 8px rgba(34,197,94,0.3);">
          ✅ Tamamla
        </button>
      </div>
    `;
  } else {
    actionArea = `<div class="t-status" style="color:${statusColor}; font-weight:700; font-size:0.7rem;">Tamamlandı</div>`;
  }

  return `
    <div class="task-card ${isCompleted ? 'completed-task' : ''}" style="border-left: 4px solid ${typeInfo.color}">
      <div class="t-main">
        <div class="t-title">
          <span style="font-size:0.85rem;">${typeInfo.label.split(' ')[0]}</span> ${task.title}
          ${task.prio === 'High' ? '<span style="font-size:0.65rem; background:rgba(239,68,68,0.2); color:var(--danger-red); padding:2px 6px; border-radius:6px; margin-left:6px;">ACIL</span>' : ''}
        </div>
        <div class="t-desc">${task.desc}</div>
        ${task.targetTag ? `<div class="t-target">Hedef: <span class="badge" style="background:rgba(255,255,255,0.1)">${task.targetTag}</span></div>` : ''}
        <div style="font-size:0.65rem; color:var(--text-muted); margin-top:4px;">Oluşturulma: ${task.createdAt}</div>
      </div>
      ${actionArea}
    </div>
  `;
}

function _renderHugeActionButtons(role) {
  return `
    <div class="tasks-fixed-bottom">
      <button class="huge-btn btn-primary" id="btn-add-herd-task" style="background:var(--accent-blue); box-shadow:0 4px 16px rgba(59, 130, 246, 0.4);">
        <span class="btn-icon">➕</span> Sürü Görevi Ekle
      </button>
      <button class="huge-btn btn-secondary-deep" id="btn-emergency-test" style="background:rgba(239,68,68,0.1); color:var(--danger-red); border:1px solid rgba(239,68,68,0.3);">
        <span class="btn-icon">⚠️</span> Acil Durum Test
      </button>
    </div>
  `;
}

function _triggerEmergencyUI(emgData) {
  if (!emgData || !_container) return;
  const overlay = _container.querySelector('#emergency-overlay');
  if (overlay) {
    overlay.querySelector('#e-title').innerText = emgData.title;
    overlay.querySelector('#e-message').innerText = emgData.message;
    overlay.style.display = 'flex';
  }
  _container.classList.add('emergency-active');
}

function _rerender() {
  const parent = _container.parentNode;
  const scrollPos = window.scrollY;
  parent.innerHTML = '';
  parent.appendChild(render());
  init();
  window.scrollTo(0, scrollPos);
}
