/**
 * ShepherdAI — İş Gücü ve Görev Lojik Motoru (Workforce Manager)
 * State-driven: tüm görevler state.tasks ve state.taskHistory üzerinden yönetilir.
 */

import { getState, setState } from '../core/state.js';

/** Görev Türleri */
export const TASK_TYPES = [
  { value: 'vaccine', label: '💉 Aşı', color: '#a855f7' },
  { value: 'medicine', label: '💊 İlaç/Tedavi', color: '#ef4444' },
  { value: 'feed', label: '🌾 Yem/Besleme', color: '#f59e0b' },
  { value: 'cleaning', label: '🧹 Temizlik/Bakım', color: '#06b6d4' },
  { value: 'checkup', label: '🩺 Kontrol/Muayene', color: '#3b82f6' },
  { value: 'other', label: '📋 Diğer', color: '#64748b' }
];

/**
 * Rolüne ve kapsama göre filtrelenmiş görev listesini döndürür.
 * @param {'owner'|'worker'} role
 * @param {'herd'|'individual'|'all'} scope
 * @param {string|null} animalTag - Bireysel görevler için hayvan küpe no
 */
export function getTasksForUser(role, scope = 'all', animalTag = null) {
  const state = getState();
  let tasks = [...(state.tasks || [])];

  if (scope === 'herd') {
    tasks = tasks.filter(t => t.scope === 'herd');
  } else if (scope === 'individual' && animalTag) {
    tasks = tasks.filter(t => t.scope === 'individual' && t.targetTag === animalTag);
  }

  if (role === 'worker') {
    tasks = tasks.filter(t => t.status === 'pending');
  }

  return tasks;
}

/**
 * Tamamlanan görev geçmişini döndürür.
 * @param {'herd'|'individual'|'all'} scope
 * @param {string|null} animalTag
 */
export function getTaskHistory(scope = 'all', animalTag = null) {
  const state = getState();
  let history = [...(state.taskHistory || [])];

  if (scope === 'herd') {
    history = history.filter(t => t.scope === 'herd');
  } else if (scope === 'individual' && animalTag) {
    history = history.filter(t => t.scope === 'individual' && t.targetTag === animalTag);
  }

  return history;
}

/**
 * Yeni görev ekle.
 * @param {Object} taskData - { title, desc, type, prio, scope, targetTag }
 */
export function addTask(taskData) {
  const state = getState();
  const newTask = {
    id: 'TSK-' + Date.now(),
    title: taskData.title,
    desc: taskData.desc || '',
    type: taskData.type || 'other',
    prio: taskData.prio || 'Normal',
    scope: taskData.scope || 'herd',
    targetTag: taskData.targetTag || null,
    status: 'pending',
    createdAt: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' })
  };

  setState({ tasks: [newTask, ...(state.tasks || [])] });
  return newTask;
}

/**
 * Görevi tamamla: tasks → taskHistory'ye taşı.
 * Aşı/İlaç türündeyse cross-module olarak state.vaccines'a da kayıt düşer.
 * @param {string} taskId
 * @returns {{ success: boolean, message: string }}
 */
export function completeTask(taskId) {
  const state = getState();
  const tasks = [...(state.tasks || [])];
  const idx = tasks.findIndex(t => t.id === taskId);

  if (idx === -1) return { success: false, message: 'Görev bulunamadı.' };

  const task = { ...tasks[idx] };
  task.status = 'completed';
  task.completedAt = new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });

  // tasks dizisinden çıkar
  tasks.splice(idx, 1);

  // taskHistory'ye ekle
  const history = [task, ...(state.taskHistory || [])];

  // Cross-module: Aşı veya İlaç türündeyse vaccines'a kayıt düş
  let vaccines = [...(state.vaccines || [])];
  if (task.type === 'vaccine' || task.type === 'medicine') {
    const vaccineRecord = {
      id: Date.now(),
      name: task.title,
      date: task.completedAt,
      status: 'done',
      target: task.scope === 'individual' && task.targetTag ? task.targetTag : 'Tüm Sürü'
    };
    vaccines = [vaccineRecord, ...vaccines];
  }

  setState({ tasks, taskHistory: history, vaccines });
  return { success: true, message: `"${task.title}" görevi tamamlandı ve geçmişe kaydedildi.` };
}

/**
 * Sensörlerden gelen veriyi okuyup Kritik Acil Durum (Emergency) üretir.
 */
export function processSensorForEmergency(sensorType, value) {
  if (sensorType === 'ammonia' && value > 50) {
    return {
      type: 'HAZARD',
      title: 'Kritik Amonyak Seviyesi!',
      message: `Ağıl içi amonyak seviyesi ${value} ppm'i aştı. Havalandırmayı derhal açın. Hayati tehlike!`,
      level: 'CRITICAL'
    };
  }

  if (sensorType === 'movement' && value > 99) {
    return {
      type: 'ALERT',
      title: 'Anormal Hareketlilik (Panik/Hırsızlık)',
      message: 'Sürüde genel panik veya dış müdahale tespit edildi. Kameraları kontrol edin.',
      level: 'HIGH'
    };
  }

  return null;
}
