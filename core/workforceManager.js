/**
 * ShepherdAI — İş Gücü ve Görev Lojik Motoru (Workforce Manager)
 * State-driven: tüm görevler state.tasks ve state.taskHistory üzerinden yönetilir.
 */

import { todayIso, addDaysIso, normalizeDateInput } from './dateUtils.js';
import { getState, setState } from './state.js';
import { buildRecordFromCompletedTask, markCourseDoseCompleted, computeStockDeduction } from './healthManager.js';

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
  const normalized = normalizeDateInput(task.dueDate);
  if (normalized) return normalized;
  const match = ((task.desc || '') + ' ' + (task.title || '')).match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];
  return todayIso();
}

/**
 * Görevin gecikmiş (overdue) olup olmadığını kontrol eder.
 */
export function isTaskOverdue(task) {
  if (task.status === 'completed') return false;
  const due = getTaskDueDate(task);
  return due < todayIso();
}

/**
 * Zaman aralığına göre görevleri filtreler ve sıralar (overdue üstte).
 * @param {Array} tasks 
 * @param {'week'|'month'|'all'} range 
 */
export function filterTasksByTimeRange(tasks, range = 'week') {
  const todayStr = todayIso();
  const weekEndStr = addDaysIso(todayStr, 7);
  const monthEndStr = addDaysIso(todayStr, 30);

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

let _taskSeq = 0;

/**
 * Görev objesi üretir (saf — state'e yazmaz). Aynı milisaniyede üretilen görevler
 * de benzersiz ID alır.
 * @param {Object} taskData - { title, desc, type, prio, scope, targetTag, dueDate }
 */
export function buildTask(taskData) {
  const todayStr = todayIso();
  _taskSeq = (_taskSeq + 1) % 100000;
  // Bağlantı alanları (breedingRecordId, treatmentRecordId, …) korunur
  const { title, desc, type, prio, scope, targetTag, dueDate, status, createdAt, id, ...links } = taskData;
  return {
    ...links,
    id: `TSK-${Date.now()}-${_taskSeq}`,
    title: taskData.title,
    desc: taskData.desc || '',
    type: taskData.type || 'other',
    prio: taskData.prio || 'Normal',
    scope: taskData.scope || 'herd',
    targetTag: taskData.targetTag || null,
    // Geçersiz/serbest biçimli tarih ('15.12.2026' vb.) ISO'ya çevrilir; çevrilemezse bugün
    dueDate: normalizeDateInput(taskData.dueDate) || todayStr,
    status: 'pending',
    createdAt: todayStr
  };
}

/**
 * Yeni görev ekle.
 * @param {Object} taskData - { title, desc, type, prio, scope, targetTag, dueDate }
 */
export function addTask(taskData) {
  const state = getState();
  const newTask = buildTask(taskData);
  setState({ tasks: [newTask, ...(state.tasks || [])] });
  return newTask;
}

/**
 * Görevi tamamla: tasks → taskHistory'ye taşı.
 * Sağlık etkisi (cross-module) — tek kaynak state.treatmentRecords:
 *  - Kür dozu görevi (treatmentRecordId) → ilgili tedavi kaydının kür ilerlemesi güncellenir.
 *  - Diğer aşı/ilaç görevleri → yeni bir tedavi/aşı kaydı oluşturulur.
 * @param {string} taskId
 * @returns {{ success: boolean, message: string }}
 */
export function completeTask(taskId) {
  const state = getState();
  const tasks = [...(state.tasks || [])];
  const idx = tasks.findIndex(t => t.id === taskId);

  if (idx === -1) return { success: false, message: 'Görev bulunamadı.' };

  const completedOn = todayIso();
  const task = { ...tasks[idx] };
  task.status = 'completed';
  task.completedAt = todayIso();

  // tasks dizisinden çıkar
  tasks.splice(idx, 1);

  // taskHistory'ye ekle
  const history = [task, ...(state.taskHistory || [])];

  const update = { tasks, taskHistory: history };

  if (task.treatmentRecordId) {
    // Kür dozu: aynı doz miktarı stoktan düşülür (stok yetmezse görev tamamlanmaz)
    const record = (state.treatmentRecords || []).find(r => r.id === task.treatmentRecordId);
    const doseQuantity = record ? (record.totalBatchQuantity ?? record.dosage) : null;
    if (record?.medicationId && doseQuantity > 0) {
      const deduction = computeStockDeduction(state.pharmacyStock, record.medicationId, doseQuantity);
      if (!deduction.success) {
        return { success: false, message: `${task.title}: ${deduction.message} Önce ecza deposuna stok ekleyin.` };
      }
      update.pharmacyStock = deduction.stock;
    }
    update.treatmentRecords = markCourseDoseCompleted(state.treatmentRecords, task.treatmentRecordId, task.doseNumber);
  } else if (task.type === 'vaccine' || task.type === 'medicine') {
    const record = buildRecordFromCompletedTask(task, state.animals, completedOn);
    update.treatmentRecords = [record, ...(state.treatmentRecords || [])];
  }

  setState(update);
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

