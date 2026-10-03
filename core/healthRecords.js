/**
 * ShepherdAI — Sağlık Kayıtları Saf Hesaplama Katmanı (healthRecords.js)
 *
 * state.js'e bağımlı OLMAYAN saf fonksiyonlar. Hem healthManager (UI'a hizmet eden motor)
 * hem de herdMathEngine (her setState'te özet hesaplayan motor) buradan beslenir.
 *
 * ── Tek Doğruluk Kaynağı ──
 * Tüm aşı / ilaç / tedavi geçmişi YALNIZCA state.treatmentRecords içinde tutulur.
 * Karantina (arınma) durumu her zaman bu kayıtlardan türetilir; hayvan objesine yazılmaz.
 * animal.status alanı yalnızca klinik sağlık durumunu ifade eder ('good' | 'warning' | 'danger').
 */

import { todayIso, addDaysIso, daysBetweenIso } from './dateUtils.js';

/** Kayıt türleri */
export const RECORD_TYPES = {
  TREATMENT: 'treatment',
  VACCINE: 'vaccine'
};

/**
 * İlaç Arınma Süresi Hesaplar.
 * KÜR DURUMUNDA: Arınma süresi SON DOZ tarihinden itibaren başlar.
 *
 * @param {number} meatDays - Et arınma süresi (gün)
 * @param {number} milkDays - Süt arınma süresi (gün)
 * @param {string|Date} lastDoseDate - Kürün SON dozunun uygulandığı tarih
 * @returns {{ meatSafeDate, milkSafeDate, meatDaysLeft, milkDaysLeft, isMeatSafe, isMilkSafe }}
 */
export function calculateWithdrawalFromLastDose(meatDays, milkDays, lastDoseDate) {
  const today = todayIso();
  const meatSafeDate = addDaysIso(lastDoseDate, meatDays || 0);
  const milkSafeDate = addDaysIso(lastDoseDate, milkDays || 0);

  // Güvenli tarih gününün kendisinde ürün kullanılabilir (kalan 0 gün)
  const meatDaysLeft = Math.max(0, daysBetweenIso(today, meatSafeDate) || 0);
  const milkDaysLeft = Math.max(0, daysBetweenIso(today, milkSafeDate) || 0);

  return {
    meatSafeDate,
    milkSafeDate,
    meatDaysLeft,
    milkDaysLeft,
    isMeatSafe: meatDaysLeft === 0,
    isMilkSafe: milkDaysLeft === 0
  };
}

/** Kayıt bir aşı kaydı mı? */
export function isVaccineRecord(record) {
  return record?.recordType === RECORD_TYPES.VACCINE || record?.category === 'asi';
}

/** Kayıt verilen hayvanı kapsıyor mu? (bireysel veya toplu) */
export function recordTargetsAnimal(record, animalId) {
  if (!record || !animalId) return false;
  return record.animalId === animalId ||
    (Array.isArray(record.batchTargets) && record.batchTargets.includes(animalId));
}

/**
 * Bir hayvanın tüm aktif arınma sürelerini kayıt listesinden hesaplar.
 * @param {Array} treatmentRecords
 * @param {string} animalId
 * @returns {{ hasActiveWithdrawal, meatDaysLeft, milkDaysLeft, activeMedName, records: [] }}
 */
export function computeWithdrawalStatus(treatmentRecords, animalId) {
  let maxMeatDaysLeft = 0;
  let maxMilkDaysLeft = 0;
  let activeMedName = null;
  const activeRecords = [];

  (treatmentRecords || []).forEach(r => {
    if (!r.withdrawals || !recordTargetsAnimal(r, animalId)) return;
    const w = calculateWithdrawalFromLastDose(
      r.withdrawals.meatWithdrawalDays,
      r.withdrawals.milkWithdrawalDays,
      r.withdrawals.lastDoseDate
    );
    if (w.meatDaysLeft > 0 || w.milkDaysLeft > 0) {
      activeRecords.push({ ...r, computed: w });
      if (w.meatDaysLeft > maxMeatDaysLeft) {
        maxMeatDaysLeft = w.meatDaysLeft;
        activeMedName = r.medicationName;
      }
      if (w.milkDaysLeft > maxMilkDaysLeft) {
        maxMilkDaysLeft = w.milkDaysLeft;
        if (!activeMedName) activeMedName = r.medicationName;
      }
    }
  });

  return {
    hasActiveWithdrawal: maxMeatDaysLeft > 0 || maxMilkDaysLeft > 0,
    meatDaysLeft: maxMeatDaysLeft,
    milkDaysLeft: maxMilkDaysLeft,
    activeMedName,
    records: activeRecords
  };
}

/**
 * Sürüdeki karantinadaki (aktif arınma süresindeki) hayvanları listeler.
 * @param {Array} animals
 * @param {Array} treatmentRecords
 */
export function computeQuarantinedAnimals(animals, treatmentRecords) {
  // Kayıtlar bir kez taranır: yalnızca arınması süren kayıtlar hayvan bazında gruplanır (O(hayvan + kayıt))
  const activeByAnimal = new Map();
  (treatmentRecords || []).forEach(r => {
    if (!r.withdrawals) return;
    const targets = r.animalId ? [r.animalId, ...(r.batchTargets || [])] : (r.batchTargets || []);
    if (targets.length === 0) return;
    const w = calculateWithdrawalFromLastDose(
      r.withdrawals.meatWithdrawalDays, r.withdrawals.milkWithdrawalDays, r.withdrawals.lastDoseDate);
    if (w.meatDaysLeft === 0 && w.milkDaysLeft === 0) return;
    new Set(targets).forEach(id => {
      if (!activeByAnimal.has(id)) activeByAnimal.set(id, []);
      activeByAnimal.get(id).push(r);
    });
  });

  const quarantined = [];
  (animals || []).forEach(a => {
    const recs = activeByAnimal.get(a.id);
    if (!recs) return;
    const ws = computeWithdrawalStatus(recs, a.id);
    if (ws.hasActiveWithdrawal) {
      quarantined.push({
        animalId: a.id,
        breed: a.breed,
        type: a.type,
        group: a.group,
        meatDaysLeft: ws.meatDaysLeft,
        milkDaysLeft: ws.milkDaysLeft,
        activeMedName: ws.activeMedName
      });
    }
  });
  return quarantined;
}

/**
 * Bekleyen aşı görevleri ve yapılmış aşı kayıtlarından aşı ajandası üretir.
 * Sıralama: gecikmiş/yaklaşan (tarihe göre) → tamamlananlar (yeniden eskiye).
 *
 * @param {Array} tasks
 * @param {Array} treatmentRecords
 * @param {string|null} animalId - Verilirse yalnızca o hayvanı kapsayan kalemler döner
 * @returns {Array<{ id, name, date, status: 'overdue'|'upcoming'|'done', target, source }>}
 */
export function buildVaccineAgenda(tasks, treatmentRecords, animalId = null) {
  const todayStr = todayIso();

  const pending = (tasks || [])
    .filter(t => t.type === 'vaccine' && t.status !== 'completed')
    .filter(t => !animalId || t.scope === 'herd' || t.targetTag === animalId)
    .map(t => {
      const due = t.dueDate || todayStr;
      return {
        id: t.id,
        name: t.title,
        date: due,
        status: due < todayStr ? 'overdue' : 'upcoming',
        target: t.scope === 'individual' && t.targetTag ? t.targetTag : 'Tüm Sürü',
        source: 'task'
      };
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  const done = (treatmentRecords || [])
    .filter(isVaccineRecord)
    .filter(r => !animalId || recordTargetsAnimal(r, animalId))
    .map(r => ({
      id: r.id,
      name: r.medicationName,
      date: r.applicationDate,
      status: 'done',
      target: r.targetLabel || (r.applicationType === 'single' ? r.animalId : `Toplu (${(r.batchTargets || []).length} baş)`),
      source: 'record'
    }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));

  return [...pending, ...done];
}

/**
 * Bir kürün (çok dozlu tedavinin) N. doz tarihini hesaplar.
 */
export function getNthDoseDate(firstDateStr, intervalHours, doseNumber) {
  // 12 saatlik aralıkta 2. doz aynı gün düşer
  const offsetDays = Math.floor(((intervalHours || 24) * (doseNumber - 1)) / 24);
  return addDaysIso(firstDateStr, offsetDays);
}
