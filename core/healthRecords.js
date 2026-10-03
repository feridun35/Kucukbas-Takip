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

const DAY_MS = 1000 * 60 * 60 * 24;

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
  const base = new Date(lastDoseDate);
  const now = new Date();

  const meatSafe = new Date(base);
  meatSafe.setDate(meatSafe.getDate() + (meatDays || 0));

  const milkSafe = new Date(base);
  milkSafe.setDate(milkSafe.getDate() + (milkDays || 0));

  const meatDaysLeft = Math.max(0, Math.ceil((meatSafe - now) / DAY_MS));
  const milkDaysLeft = Math.max(0, Math.ceil((milkSafe - now) / DAY_MS));

  return {
    meatSafeDate: meatSafe.toISOString().split('T')[0],
    milkSafeDate: milkSafe.toISOString().split('T')[0],
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
  const quarantined = [];
  (animals || []).forEach(a => {
    const ws = computeWithdrawalStatus(treatmentRecords, a.id);
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
  const todayStr = new Date().toISOString().split('T')[0];

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
  const d = new Date(firstDateStr);
  const intervalDays = (intervalHours || 24) / 24;
  d.setDate(d.getDate() + intervalDays * (doseNumber - 1));
  return d.toISOString().split('T')[0];
}
