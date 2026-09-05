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
 * Görevin son tarihini döndürür (ISO 'YYYY-MM-DD').
 * Yoksa acil veya metin içinde geçen 'YYYY-MM-DD' tarihini yakalar, o da yoksa bugünün tarihini döner.
 */
export function getTaskDueDate(task) {
  if (task.dueDate) return task.dueDate;
  const match = ((task.desc || '') + ' ' + (task.title || '')).match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];
  return new Date().toISOString().split('T')[0];
}

/**
 * Görevin gecikmiş (overdue) olup olmadığını kontrol eder.
 */
export function isTaskOverdue(task) {
  if (task.status === 'completed') return false;
  const due = getTaskDueDate(task);
  const today = new Date().toISOString().split('T')[0];
  return due < today;
}

/**
 * Zaman aralığına göre görevleri filtreler ve sıralar (overdue üstte).
 * @param {Array} tasks 
 * @param {'week'|'month'|'all'} range 
 */
export function filterTasksByTimeRange(tasks, range = 'week') {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = today.toISOString().split('T')[0];

  const weekEnd = new Date(today.getTime() + 7 * 86400000);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  const monthEnd = new Date(today.getTime() + 30 * 86400000);
  const monthEndStr = monthEnd.toISOString().split('T')[0];

  let filtered = tasks.filter(t => {
    if (t.status === 'completed') return false;
    const due = getTaskDueDate(t);
    // Gecikmiş görevler tüm sekmelerde gösterilir
    if (due < todayStr) return true;

    if (range === 'week') {
      return due <= weekEndStr;
    } else if (range === 'month') {
      return due <= monthEndStr;
    }
    return true; // 'all'
  });

  // Sıralama: Gecikmişler en üstte, sonrasında yakından uzağa doğru vadesi gelenler
  filtered.sort((a, b) => {
    const dueA = getTaskDueDate(a);
    const dueB = getTaskDueDate(b);
    const overdueA = dueA < todayStr;
    const overdueB = dueB < todayStr;

    if (overdueA && !overdueB) return -1;
    if (!overdueA && overdueB) return 1;

    if (dueA !== dueB) {
      return dueA.localeCompare(dueB);
    }

    if (a.prio === 'High' && b.prio !== 'High') return -1;
    if (a.prio !== 'High' && b.prio === 'High') return 1;

    return 0;
  });

  return filtered;
}

/**
 * Her filtre grubu için aktif görev sayılarını hesaplar.
 */
export function getTaskCountsByTimeRange(tasks) {
  const pendingTasks = tasks.filter(t => t.status !== 'completed');
  return {
    weekCount: filterTasksByTimeRange(pendingTasks, 'week').length,
    monthCount: filterTasksByTimeRange(pendingTasks, 'month').length,
    allCount: filterTasksByTimeRange(pendingTasks, 'all').length
  };
}

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
 * @param {Object} taskData - { title, desc, type, prio, scope, targetTag, dueDate }
 */
export function addTask(taskData) {
  const state = getState();
  const todayStr = new Date().toISOString().split('T')[0];
  const newTask = {
    id: 'TSK-' + Date.now(),
    title: taskData.title,
    desc: taskData.desc || '',
    type: taskData.type || 'other',
    prio: taskData.prio || 'Normal',
    scope: taskData.scope || 'herd',
    targetTag: taskData.targetTag || null,
    dueDate: taskData.dueDate || todayStr,
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

