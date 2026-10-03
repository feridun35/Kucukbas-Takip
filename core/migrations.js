/**
 * ShepherdAI — Kiracı Verisi Şema Göçleri (migrations.js)
 *
 * localStorage'dan veya buluttan gelen eski formatlı çiftlik verisini güncel şemaya yükseltir.
 * Saf fonksiyondur: girdi objesini değiştirmez, yeni obje döndürür.
 *
 * Şema sürümleri:
 *  v1 (sürüm alanı yok) — sağlık geçmişi hem `vaccines` hem `treatmentRecords` içinde.
 *  v2 — `vaccines` kaldırıldı; tek kaynak `treatmentRecords`, bekleyen aşılar `tasks` (type: 'vaccine').
 */

import { parseDate } from './herdMathEngine.js';
import { RECORD_TYPES } from './healthRecords.js';

export const CURRENT_SCHEMA_VERSION = 2;

const HERD_WIDE_TARGETS = ['tüm sürü', 'sürü geneli'];

/**
 * @param {Object} data - Kiracı state yükü (kısmi olabilir)
 * @returns {Object} güncel şemadaki yük
 */
export function migrateTenantData(data) {
  if (!data || typeof data !== 'object') return data;
  let migrated = { ...data };

  // `vaccines` anahtarı taşıyan her yük (eski sürümlü bir cihazdan gelmiş olabilir) yeniden işlenir;
  // göç idempotenttir — deterministik ID'ler sayesinde aynı kayıt iki kez eklenmez.
  if (!migrated.schemaVersion || migrated.schemaVersion < 2 || Array.isArray(migrated.vaccines)) {
    migrated = _migrateV1ToV2(migrated);
  }

  migrated.schemaVersion = CURRENT_SCHEMA_VERSION;
  return migrated;
}

function _toIso(dateVal) {
  return parseDate(dateVal).toISOString().split('T')[0];
}

function _resolveTargets(target, animals) {
  const animalIds = (animals || []).map(a => a.id);
  const label = String(target || 'Tüm Sürü').trim();

  if (HERD_WIDE_TARGETS.includes(label.toLocaleLowerCase('tr-TR'))) {
    return { scope: 'herd', animalId: null, batchTargets: animalIds, label };
  }

  const matched = label.split(/[,;]+/).map(t => t.trim()).filter(t => animalIds.includes(t));
  if (matched.length === 1) {
    return { scope: 'individual', animalId: matched[0], batchTargets: [], label };
  }
  if (matched.length > 1) {
    return { scope: 'herd', animalId: null, batchTargets: matched, label };
  }
  // Tanınmayan grup etiketi (örn. "Gençler Sürüsü") — sürü geneli kabul edilir
  return { scope: 'herd', animalId: null, batchTargets: animalIds, label };
}

function _migrateV1ToV2(data) {
  const vaccines = Array.isArray(data.vaccines) ? data.vaccines : [];
  const animals = Array.isArray(data.animals) ? data.animals : [];
  const treatmentRecords = [...(data.treatmentRecords || [])];
  const tasks = [...(data.tasks || [])].map(t =>
    // Eski kür görevleri TASK_TYPES'ta olmayan 'health' tipiyle oluşturuluyordu
    t.type === 'health' ? { ...t, type: 'medicine' } : t
  );

  const existingIds = new Set([
    ...treatmentRecords.map(r => r.id),
    ...tasks.map(t => t.id),
    ...(data.taskHistory || []).map(t => t.id)
  ]);

  vaccines.forEach((v, i) => {
    const target = _resolveTargets(v.target, animals);
    const recordId = `TR-REC-MIG-${v.id ?? i}`;
    const taskId = `TSK-MIG-${v.id ?? i}`;
    if (existingIds.has(recordId) || existingIds.has(taskId)) return;

    if (v.status === 'done') {
      // applyTreatment'ın ürettiği uyumluluk kopyaları (meatDays/dosage alanlı) zaten
      // treatmentRecords'ta mevcut — tekrar eklenmez.
      const isCompatCopy = v.meatDays !== undefined || v.milkDays !== undefined || v.dosage !== undefined;
      if (isCompatCopy) return;

      treatmentRecords.push({
        id: recordId,
        recordType: RECORD_TYPES.VACCINE,
        animalId: target.animalId,
        medicationId: null,
        medicationName: v.name,
        activeIngredient: '',
        category: 'asi',
        dosage: null,
        appliedDosePerAnimal: null,
        dosageUnit: '',
        applicationDate: _toIso(v.date),
        applicationType: target.scope === 'individual' ? 'single' : 'batch',
        batchTargets: target.batchTargets,
        targetLabel: target.label,
        courseInfo: { currentDay: 1, totalDays: 1, nextDoseDate: null },
        withdrawals: null,
        pregnancyOverride: false,
        notes: 'Eski aşı ajandasından taşındı.'
      });
    } else {
      tasks.push({
        id: taskId,
        title: v.name,
        desc: `Hedef: ${target.label}`,
        type: 'vaccine',
        prio: 'Normal',
        scope: target.scope,
        targetTag: target.animalId,
        dueDate: _toIso(v.date),
        status: 'pending',
        createdAt: new Date().toISOString().split('T')[0]
      });
    }
  });

  const { vaccines: _removed, ...rest } = data;
  return { ...rest, treatmentRecords, tasks };
}
