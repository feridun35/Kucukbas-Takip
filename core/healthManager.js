/**
 * ShepherdAI — Bağımsız Sağlık Lojik Motoru (Health Manager)
 * AI Teşhis, Arınma Süresi Hesaplama, Sensör Anomali Kontrolü,
 * Dozaj Hesaplama, Stok Yönetimi, Kür Takvimi ve Gebelik Bariyeri.
 * 
 * ── Mimari Kuralı ──
 * Tüm iş mantığı bu dosyada toplanır.
 * UI modülleri yalnızca bu fonksiyonları çağırır — arayüzde matematik/arınma hesaplaması YAPILMAZ.
 */

import { getPregnantAnimalIds, getOpenDamMap, DAM_STATUS } from './breedingStatus.js';
import { todayIso, addDaysIso, normalizeDateInput } from './dateUtils.js';
import { getAnimalById, getState, setState } from './state.js';
import { getDefaultMedications } from '../data/med-library.js';
import {
  RECORD_TYPES,
  calculateWithdrawalFromLastDose,
  computeWithdrawalStatus,
  computeQuarantinedAnimals,
  buildVaccineAgenda,
  getNthDoseDate
} from './healthRecords.js';

export { calculateWithdrawalFromLastDose } from './healthRecords.js';

// ═══════════════════════════════════════════
// 1. İLAÇ KÜTÜPHANE BİRLEŞTİRME
// ═══════════════════════════════════════════

/**
 * Varsayılan ilaç veritabanı + kullanıcı özel ilaçlarını birleştirir.
 * Aynı id'li kullanıcı ilacı varsayılanın üzerine yazar.
 */
export function getAllMedications() {
  const state = getState();
  const defaults = getDefaultMedications();
  const customs = state.customMedications || [];
  const merged = [...defaults];
  customs.forEach(cm => {
    const idx = merged.findIndex(m => m.id === cm.id);
    if (idx > -1) merged[idx] = cm;
    else merged.push(cm);
  });
  return merged;
}

/** ID ile tek ilaç getir */
export function getMedicationById(medId) {
  return getAllMedications().find(m => m.id === medId) || null;
}

/**
 * Yeni özel ilaç ekle. Arınma süreleri ve dozaj ZORUNLUDUR — boş alan sessizce 0 sayılmaz
 * (0 gün arınma, hayvanın karantinaya hiç girmemesi demektir).
 * @returns {{ success: boolean, message: string, medication?: Object }}
 */
export function addCustomMedication(med) {
  const name = String(med?.name || '').trim();
  if (!name) return { success: false, message: 'İlaç adı zorunludur.' };

  const num = (v) => (v === '' || v === null || v === undefined) ? NaN : Number(v);
  const dosagePerKg = num(med.dosagePerKg);
  const meatDays = num(med.meatWithdrawalDays);
  const milkDays = num(med.milkWithdrawalDays);
  const courseDays = num(med.treatmentCourse?.days ?? 1);

  if (!(dosagePerKg > 0)) return { success: false, message: 'Dozaj (ml/kg) sıfırdan büyük bir sayı olmalıdır.' };
  if (!Number.isInteger(meatDays) || meatDays < 0 || !Number.isInteger(milkDays) || milkDays < 0) {
    return { success: false, message: 'Et ve süt arınma sürelerini gün olarak giriniz (arınma yoksa 0 yazın).' };
  }
  if (!Number.isInteger(courseDays) || courseDays < 1) return { success: false, message: 'Kür süresi en az 1 gün olmalıdır.' };

  const medication = {
    ...med,
    id: med.id || `custom-${Date.now()}`,
    name,
    dosagePerKg,
    meatWithdrawalDays: meatDays,
    milkWithdrawalDays: milkDays,
    treatmentCourse: { repeatIntervalHours: 24, ...(med.treatmentCourse || {}), days: courseDays }
  };
  const customs = [...(getState().customMedications || []), medication];
  setState({ customMedications: customs });
  return { success: true, message: `${name} ilaç kütüphanesine eklendi.`, medication };
}

// ═══════════════════════════════════════════
// 2. DOZAJ HESAPLAMA
// ═══════════════════════════════════════════

/**
 * Tek hayvan için önerilen dozajı hesaplar.
 * @param {string} medId - İlaç ID
 * @param {number} weightKg - Hayvanın canlı ağırlığı (kg)
 * @returns {{ dosage: number, unit: string, formula: string }}
 */
export function calculateDosage(medId, weightKg) {
  const med = getMedicationById(medId);
  if (!med || !weightKg || weightKg <= 0) return { dosage: 0, unit: 'ml', formula: 'Hesaplanamadı' };
  const dosage = parseFloat((weightKg * med.dosagePerKg).toFixed(2));
  return {
    dosage,
    unit: med.unit || 'ml',
    formula: `${weightKg} kg × ${med.dosagePerKg} ${med.unit}/kg = ${dosage} ${med.unit}`
  };
}

/**
 * Toplu sürü tedavisi için toplam dozaj hesaplar.
 * Grup ortalaması × hayvan adedi (her hayvan başına düşen standart doz).
 * @param {string} medId
 * @param {Array} animalList - Seçilen hayvanların listesi
 * @returns {{ totalDosage, perHeadDosage, avgWeight, headCount, unit, formula }}
 */
export function calculateBatchDosage(medId, animalList) {
  const med = getMedicationById(medId);
  if (!med || !animalList || animalList.length === 0) {
    return { totalDosage: 0, perHeadDosage: 0, avgWeight: 0, headCount: 0, unit: 'ml', formula: 'Hesaplanamadı' };
  }
  const weights = animalList.map(a => parseFloat(a.weight) || 0).filter(w => w > 0);
  const avgWeight = weights.length > 0 ? weights.reduce((s, w) => s + w, 0) / weights.length : 40;
  const perHeadDosage = parseFloat((avgWeight * med.dosagePerKg).toFixed(2));
  const totalDosage = parseFloat((perHeadDosage * animalList.length).toFixed(2));
  return {
    totalDosage,
    perHeadDosage,
    avgWeight: parseFloat(avgWeight.toFixed(1)),
    headCount: animalList.length,
    unit: med.unit || 'ml',
    formula: `Ort. ${avgWeight.toFixed(1)} kg × ${med.dosagePerKg} ${med.unit}/kg × ${animalList.length} baş = ${totalDosage} ${med.unit}`
  };
}

// ═══════════════════════════════════════════
// 3. GEBELİK RİSK KONTROLÜ
// ═══════════════════════════════════════════

/**
 * Seçilen hayvanlar arasında gebe olanları tespit eder ve ilaç riski kontrol eder.
 * @param {string} medId
 * @param {Array} animalList
 * @returns {{ hasRisk: boolean, pregnantAnimals: Array, warning: string }}
 */
export function checkPregnancyRisk(medId, animalList) {
  const med = getMedicationById(medId);
  if (!med || !med.contraindications?.pregnancyRisk) {
    return { hasRisk: false, pregnantAnimals: [], possiblyPregnantAnimals: [], warning: '' };
  }
  const state = getState();
  const pregnantIds = new Set(getPregnantAnimalIds(state.animals, state.breedingRecords));
  const openDams = getOpenDamMap(state.breedingRecords);

  // Doğrulanmış gebe + gebeliği henüz doğrulanmamış (koç katımı yapılmış) hayvanlar
  const pregnantAnimals = animalList.filter(a => pregnantIds.has(a.id) || a.group === 'Gebe');
  const possiblyPregnantAnimals = animalList.filter(a =>
    !pregnantAnimals.includes(a) && openDams.get(a.id)?.status === DAM_STATUS.ACTIVE
  );

  if (pregnantAnimals.length === 0 && possiblyPregnantAnimals.length === 0) {
    return { hasRisk: false, pregnantAnimals: [], possiblyPregnantAnimals: [], warning: '' };
  }
  return {
    hasRisk: true,
    pregnantAnimals,
    possiblyPregnantAnimals,
    warning: med.contraindications.pregnancyWarning || 'Bu ilacın gebelikte kullanımı kontrendikedir.'
  };
}

// ═══════════════════════════════════════════
// 4. STOK YÖNETİMİ
// ═══════════════════════════════════════════

/**
 * Parti kullanılabilir mi?
 * - Son kullanma tarihi (SKT) günü dahil kullanılabilir.
 * - Açılmış şişe, ilacın açık raf ömrü dolduysa kullanılamaz.
 */
export function isStockBatchUsable(batch, med, today = todayIso()) {
  if (!batch || batch.medicationId !== med?.id || !(batch.remainingQuantity > 0)) return false;
  if (batch.expiryDate && batch.expiryDate < today) return false;
  if (batch.openedDate && med.openVialShelfLifeDays &&
      addDaysIso(batch.openedDate, med.openVialShelfLifeDays) < today) return false;
  return true;
}

/** Açık raf ömrü dolmuş (kullanılamayan) açılmış şişe mi? */
export function isOpenVialExpired(batch, med, today = todayIso()) {
  return Boolean(batch?.openedDate && med?.openVialShelfLifeDays &&
    addDaysIso(batch.openedDate, med.openVialShelfLifeDays) < today);
}

/**
 * Belirli bir ilacın toplam kullanılabilir stok miktarını döndürür.
 * Son kullanma tarihi geçmiş ve açık raf ömrü dolmuş partiler hariç.
 */
export function getAvailableStock(medId) {
  const state = getState();
  const med = getMedicationById(medId);
  const today = todayIso();
  const stocks = (state.pharmacyStock || []).filter(s => isStockBatchUsable(s, med, today));
  const total = parseFloat(stocks.reduce((sum, s) => sum + s.remainingQuantity, 0).toFixed(2));
  return { total, unit: stocks[0]?.unit || med?.unit || 'ml', stocks };
}

/**
 * Stoktan düşüş hesabı (saf — state'e yazmaz).
 * Sıra: önce açılmış şişeler (açık raf ömrü işliyor), sonra son kullanma tarihi en yakın olan (FEFO).
 * İlk kez kullanılan partinin açılış tarihi bugün olarak işlenir.
 * @returns {{ success: boolean, message: string, stock?: Array, remaining: number }}
 */
export function computeStockDeduction(allStockIn, medId, amount) {
  const med = getMedicationById(medId);
  const qty = parseFloat(amount);
  if (!med) return { success: false, message: 'İlaç bulunamadı.', remaining: qty };
  if (isNaN(qty) || qty <= 0) return { success: false, message: 'Geçerli bir doz giriniz.', remaining: qty };

  const today = todayIso();
  const allStock = [...(allStockIn || [])];
  const usable = allStock
    .map((s, i) => ({ s, i }))
    .filter(({ s }) => isStockBatchUsable(s, med, today))
    .sort((a, b) => {
      const ao = a.s.openedDate ? 0 : 1, bo = b.s.openedDate ? 0 : 1;
      if (ao !== bo) return ao - bo;
      return String(a.s.expiryDate || '9999').localeCompare(String(b.s.expiryDate || '9999'));
    });

  let remaining = qty;
  for (const { s, i } of usable) {
    if (remaining <= 0) break;
    const take = Math.min(s.remainingQuantity, remaining);
    allStock[i] = {
      ...s,
      remainingQuantity: parseFloat((s.remainingQuantity - take).toFixed(2)),
      openedDate: s.openedDate || today
    };
    remaining = parseFloat((remaining - take).toFixed(2));
  }

  if (remaining > 0) {
    return { success: false, message: `Stok yetersiz! ${remaining} ${med.unit || 'ml'} eksik.`, remaining };
  }
  return { success: true, message: 'Stoktan başarıyla düşüldü.', stock: allStock, remaining: 0 };
}

/**
 * Stoktan ilaç düşer ve state'e yazar.
 * @returns {{ success: boolean, message: string, remaining: number }}
 */
export function deductFromStock(medId, amount) {
  const result = computeStockDeduction(getState().pharmacyStock, medId, amount);
  if (!result.success) return result;
  setState({ pharmacyStock: result.stock });
  return { success: true, message: result.message, remaining: 0 };
}

/**
 * Stok ekleme (yeni parti). Miktar ve son kullanma tarihi zorunludur; birim ilacın doz birimiyle aynıdır
 * (dozaj hesabı bu birimle yapılır, farklı birimli parti stoktan yanlış düşülürdü).
 * @returns {{ success: boolean, message: string, stock?: Array }}
 */
export function addPharmacyStock(stockEntry) {
  const med = getMedicationById(stockEntry?.medicationId);
  if (!med) return { success: false, message: 'İlaç bulunamadı.' };

  const qty = parseFloat(stockEntry.totalQuantity ?? stockEntry.remainingQuantity);
  if (!(qty > 0)) return { success: false, message: 'Miktar sıfırdan büyük olmalıdır.' };

  const expiryDate = normalizeDateInput(stockEntry.expiryDate);
  if (!expiryDate) return { success: false, message: 'Son kullanma tarihi zorunludur.' };
  if (expiryDate < todayIso()) return { success: false, message: 'Son kullanma tarihi geçmiş parti stoğa eklenemez.' };

  const remaining = parseFloat(stockEntry.remainingQuantity ?? qty);
  const allStock = [...(getState().pharmacyStock || [])];
  allStock.push({
    ...stockEntry,
    id: stockEntry.id || `PS-${Date.now()}`,
    totalQuantity: qty,
    remainingQuantity: isNaN(remaining) ? qty : remaining,
    unit: med.unit || 'ml',
    expiryDate,
    openedDate: stockEntry.openedDate || null
  });
  setState({ pharmacyStock: allStock });
  return { success: true, message: `${med.name} — ${qty} ${med.unit || 'ml'} stoğa eklendi.`, stock: allStock };
}

/** Bir flakon/partiyi zayi olarak işaretle (Kalanı Zayi Et) */
export function markStockAsWaste(stockId, reason) {
  const state = getState();
  const allStock = [...(state.pharmacyStock || [])];
  const idx = allStock.findIndex(s => s.id === stockId);
  if (idx === -1) return { success: false, message: 'Stok bulunamadı.' };
  const wastedAmount = allStock[idx].remainingQuantity;
  allStock[idx] = { ...allStock[idx], remainingQuantity: 0, wastedReason: reason || 'Flakon Zayi', wastedDate: todayIso() };
  setState({ pharmacyStock: allStock });
  return { success: true, message: `${wastedAmount} ${allStock[idx].unit} zayi olarak işaretlendi.`, wastedAmount };
}

/** Kritik stok seviyesindeki ilaçları listeler */
export function getCriticalStocks() {
  const state = getState();
  const today = todayIso();
  const meds = getAllMedications();
  const critical = [];
  const stockByMed = {};

  (state.pharmacyStock || []).forEach(s => {
    if (!isStockBatchUsable(s, meds.find(m => m.id === s.medicationId), today)) return;
    if (!stockByMed[s.medicationId]) stockByMed[s.medicationId] = { total: 0, threshold: s.criticalThreshold || 20, unit: s.unit };
    stockByMed[s.medicationId].total += s.remainingQuantity;
    if (s.criticalThreshold > stockByMed[s.medicationId].threshold) {
      stockByMed[s.medicationId].threshold = s.criticalThreshold;
    }
  });

  Object.entries(stockByMed).forEach(([medId, info]) => {
    if (info.total <= info.threshold) {
      const med = meds.find(m => m.id === medId);
      critical.push({
        medicationId: medId,
        medicationName: med?.name || medId,
        remaining: info.total,
        threshold: info.threshold,
        unit: info.unit
      });
    }
  });

  return critical;
}

// ═══════════════════════════════════════════
// 5. ARINMA SÜRESİ HESAPLAMA
// ═══════════════════════════════════════════

// calculateWithdrawalFromLastDose → core/healthRecords.js (saf fonksiyon, yukarıda re-export edilir)

/**
 * Tek bir hayvanın tüm aktif arınma sürelerini hesaplar.
 * treatmentRecords'tan o hayvana ait kayıtlara bakar.
 * @param {string} animalId
 * @returns {{ hasActiveWithdrawal, meatDaysLeft, milkDaysLeft, records: [] }}
 */
export function getAnimalWithdrawalStatus(animalId) {
  return computeWithdrawalStatus(getState().treatmentRecords, animalId);
}

/**
 * Sürüdeki tüm karantinadaki hayvanları listeler (Dashboard / Herd-list için).
 */
export function getAllQuarantinedAnimals() {
  const state = getState();
  return computeQuarantinedAnimals(state.animals, state.treatmentRecords);
}

/**
 * Aşı ajandası: bekleyen aşı görevleri + yapılmış aşı kayıtları (treatmentRecords).
 * @param {string|null} animalId - Verilirse yalnızca o hayvanı kapsayan kalemler
 */
export function getVaccineAgenda(animalId = null) {
  const state = getState();
  return buildVaccineAgenda(state.tasks, state.treatmentRecords, animalId);
}

// ═══════════════════════════════════════════
// 6. TEDAVİ KAYIT & KÜR TAKVİMİ
// ═══════════════════════════════════════════

/**
 * Kürün son doz tarihini hesaplar.
 * @param {string|Date} firstDoseDate - İlk doz tarihi
 * @param {{ days, repeatIntervalHours }} course - Kür bilgisi
 * @returns {string} Son doz tarihi (ISO)
 */
export function calculateLastDoseDate(firstDoseDate, course) {
  if (!course || course.days <= 1) return firstDoseDate;
  return getNthDoseDate(firstDoseDate, course.repeatIntervalHours, course.days);
}

/**
 * Tedavi kaydını oluşturur ve state'e yazar.
 * - Prospektüs değerlerini kayda snapshot olarak dondurur (immutability).
 * - Stoktan düşüş yapar.
 * - Kür varsa tasks tablosuna otomatik görevler ekler.
 * 
 * @param {Object} params
 * @returns {{ success, message, record?, stockResult? }}
 */
export function applyTreatment({
  medId,
  animalIds,         // Tek hayvan = ['TR-102'], toplu = ['TR-102', 'TR-088', ...]
  applicationType,   // 'single' | 'batch'
  dosage,            // Kullanıcının onayladığı/revize ettiği toplam dozaj (topluda toplam sürü sarfiyatı)
  pregnancyOverride, // Gebelik uyarısı geçildi mi
  notes
}) {
  const med = getMedicationById(medId);
  if (!med) return { success: false, message: 'İlaç bulunamadı.' };

  const state = getState();
  const today = todayIso();

  const totalBatchQuantity = parseFloat(dosage);
  if (isNaN(totalBatchQuantity) || totalBatchQuantity <= 0) {
    return { success: false, message: 'Doz sıfırdan büyük olmalıdır.' };
  }
  if (!Array.isArray(animalIds) || animalIds.length === 0) {
    return { success: false, message: 'Tedavi için en az bir hayvan seçilmelidir.' };
  }
  dosage = totalBatchQuantity;

  // ── Stoktan düşüş (1. doz — Toplam Sürü Sarfiyatı) ──
  const stockResult = deductFromStock(medId, totalBatchQuantity);
  if (!stockResult.success) return { success: false, message: stockResult.message, stockResult };

  // ── Bireysel Net Doz Hesaplama ──
  const appliedDosePerAnimal = applicationType === 'single'
    ? dosage
    : parseFloat((dosage / Math.max(1, animalIds.length)).toFixed(2));

  // ── Son doz tarihi hesaplama (kür durumunda) ──
  const lastDoseDate = calculateLastDoseDate(today, med.treatmentCourse);

  // ── Arınma süreleri ──
  const withdrawalCalc = calculateWithdrawalFromLastDose(med.meatWithdrawalDays, med.milkWithdrawalDays, lastDoseDate);

  // ── Tedavi kaydı (denormalize — prospektüs snapshot) ──
  const record = {
    id: `TR-REC-${Date.now()}`,
    recordType: med.category === 'asi' ? RECORD_TYPES.VACCINE : RECORD_TYPES.TREATMENT,
    animalId: applicationType === 'single' ? animalIds[0] : null,
    medicationId: med.id,
    medicationName: med.name,
    activeIngredient: med.activeIngredient,
    category: med.category,
    dosage: appliedDosePerAnimal,                 // Hayvan profiline yansıyacak net bireysel dozaj (örn: 2 ml)
    appliedDosePerAnimal: appliedDosePerAnimal,  // Açık net bireysel doz alanı
    totalBatchQuantity: totalBatchQuantity,      // Toplam sürü stok sarfiyatı (örn: 20 ml)
    dosageUnit: med.unit,
    applicationDate: today,
    applicationType,
    batchTargets: applicationType === 'batch' ? animalIds : [],
    courseInfo: {
      currentDay: 1,
      totalDays: med.treatmentCourse?.days || 1,
      nextDoseDate: med.treatmentCourse?.days > 1
        ? getNthDoseDate(today, med.treatmentCourse.repeatIntervalHours, 2)
        : null
    },
    withdrawals: {
      meatWithdrawalDays: med.meatWithdrawalDays,
      milkWithdrawalDays: med.milkWithdrawalDays,
      lastDoseDate,
      meatSafeDate: withdrawalCalc.meatSafeDate,
      milkSafeDate: withdrawalCalc.milkSafeDate
    },
    pregnancyOverride: Boolean(pregnancyOverride),
    notes: notes || ''
  };

  // ── State güncelleme ──
  // Tek doğruluk kaynağı: treatmentRecords. Karantina durumu bu kayıtlardan türetilir;
  // hayvan objesinin klinik `status` alanına DOKUNULMAZ.
  const treatmentRecords = [record, ...(state.treatmentRecords || [])];

  const animals = [...(state.animals || [])];
  animalIds.forEach(aid => {
    const idx = animals.findIndex(a => a.id === aid);
    if (idx > -1) {
      animals[idx] = { ...animals[idx], lastVaccine: today };
    }
  });

  // ── Kür görevleri oluştur ──
  const tasks = [...(state.tasks || [])];
  if (med.treatmentCourse && med.treatmentCourse.days > 1) {
    for (let day = 2; day <= med.treatmentCourse.days; day++) {
      const doseDate = getNthDoseDate(today, med.treatmentCourse.repeatIntervalHours, day);
      const targetLabel = applicationType === 'single'
        ? animalIds[0]
        : `Toplu (${animalIds.length} baş)`;

      tasks.push({
        id: `TSK-MED-${Date.now()}-${day}`,
        title: `💉 ${med.name} — ${day}. Doz`,
        desc: `${targetLabel} için ${med.name} kür tedavisi ${day}/${med.treatmentCourse.days}. doz uygulaması. Hayvan başı doz: ${appliedDosePerAnimal} ${med.unit} (Bu dozun toplam sarfiyatı: ${totalBatchQuantity} ${med.unit}). Görev tamamlandığında stoktan düşülür.`,
        type: 'medicine',
        prio: 'High',
        scope: applicationType === 'single' ? 'individual' : 'herd',
        targetTag: applicationType === 'single' ? animalIds[0] : null,
        status: 'pending',
        createdAt: today,
        dueDate: doseDate,
        treatmentRecordId: record.id,
        doseNumber: day
      });
    }
  }

  setState({ treatmentRecords, animals, tasks });

  return {
    success: true,
    message: `${med.name} başarıyla uygulandı. Toplam ${totalBatchQuantity} ${med.unit} stoktan düşüldü (Hayvan başı net doz: ${appliedDosePerAnimal} ${med.unit}).`,
    record,
    stockResult
  };
}

/**
 * Tamamlanan bir aşı/ilaç görevinden tedavi kaydı üretir (saf — state'e yazmaz).
 * Çağıran taraf (workforceManager.completeTask) kaydı tek bir setState içinde ekler.
 *
 * @param {Object} task - Tamamlanan görev
 * @param {Array} animals - Mevcut sürü (sürü geneli görevlerde hedef listesi için)
 * @param {string} dateStr - Uygulama tarihi (ISO)
 */
export function buildRecordFromCompletedTask(task, animals, dateStr) {
  const isIndividual = task.scope === 'individual' && task.targetTag;
  const isVaccine = task.type === 'vaccine';
  return {
    id: `TR-REC-TSK-${Date.now()}`,
    recordType: isVaccine ? RECORD_TYPES.VACCINE : RECORD_TYPES.TREATMENT,
    animalId: isIndividual ? task.targetTag : null,
    medicationId: null,
    medicationName: task.title,
    activeIngredient: '',
    category: isVaccine ? 'asi' : 'diger',
    dosage: null,
    appliedDosePerAnimal: null,
    dosageUnit: '',
    applicationDate: dateStr,
    applicationType: isIndividual ? 'single' : 'batch',
    batchTargets: isIndividual ? [] : (animals || []).map(a => a.id),
    targetLabel: isIndividual ? task.targetTag : 'Tüm Sürü',
    courseInfo: { currentDay: 1, totalDays: 1, nextDoseDate: null },
    withdrawals: null,
    pregnancyOverride: false,
    notes: task.desc || '',
    sourceTaskId: task.id
  };
}

/**
 * Kür görevinin (N. doz) tamamlandığını ilgili tedavi kaydına işler (saf).
 * @returns {Array} güncellenmiş treatmentRecords
 */
export function markCourseDoseCompleted(treatmentRecords, recordId, doseNumber) {
  return (treatmentRecords || []).map(r => {
    if (r.id !== recordId) return r;
    const totalDays = r.courseInfo?.totalDays || 1;
    const currentDay = Math.max(r.courseInfo?.currentDay || 1, doseNumber || 1);
    return {
      ...r,
      courseInfo: {
        ...r.courseInfo,
        currentDay,
        totalDays,
        nextDoseDate: currentDay >= totalDays ? null : r.courseInfo?.nextDoseDate || null
      }
    };
  });
}

// ═══════════════════════════════════════════
// 7. MEVCUT FONKSIYONLAR (Orijinal — korunuyor)
// ═══════════════════════════════════════════

/**
 * Belirtilere göre basit bir risk analizi yapar. 
 * KURAL: Kesinlikle veteriner tavsiyesi olmadığı belirtilmelidir.
 */
export function evaluateSymptoms(animalId, symptoms) {
  const animal = getAnimalById(animalId);
  const disclaimer = "⚠️ BU BİR VETERİNER TAVSİYESİ DEĞİLDİR, SADECE RİSK ANALİZİDİR. Lütfen kesin teşhis için hekiminize danışın.";
  
  if (!symptoms || symptoms.length === 0) {
    return {
      riskLevel: 'low',
      possibleDiseases: ['Sağlıklı Görünüyor'],
      recommendation: 'Gözlemlemeye devam edin.',
      disclaimer
    };
  }

  if (symptoms.includes('lameness') && symptoms.includes('mouth_lesion')) {
    return {
      riskLevel: 'danger',
      possibleDiseases: ['Şap Hastalığı (FMD) Şüphesi'],
      recommendation: 'Hayvanı DERHAL karantinaya alın. Sürünün geri kalanından izole edin ve veteriner hekim çağırın.',
      disclaimer
    };
  }
  
  if (symptoms.includes('cough') && symptoms.includes('nasal_discharge')) {
    return {
      riskLevel: 'warning',
      possibleDiseases: ['Pnömoni (Zatürre) Şüphesi', 'Solunum Yolu Enfeksiyonu'],
      recommendation: 'Hayvanın ateşini ölçün. Havadar fakat hava akımı (cereyan) olmayan bir bölmeye alın.',
      disclaimer
    };
  }
  
  if (symptoms.includes('diarrhea') && symptoms.includes('lethargy')) {
    return {
      riskLevel: 'danger',
      possibleDiseases: ['Enterotoksemi (Çelerme)', 'Ağır Parazit Vakası'],
      recommendation: 'Acil sıvı takviyesi (elektrolit) gerekebilir. Veteriner müdahalesi şarttır.',
      disclaimer
    };
  }
  
  if (symptoms.includes('udder_swelling')) {
    return {
      riskLevel: 'warning',
      possibleDiseases: ['Mastitis (Meme İltihabı)'],
      recommendation: 'Etkilenen memeyi sık sık sağın ve soğuk masaj uygulayın. Sağım sırasını en sona bırakın.',
      disclaimer
    };
  }
  
  return {
    riskLevel: 'warning',
    possibleDiseases: ['Belirlenemeyen Enfeksiyon/Hastalık'],
    recommendation: 'Belirtiler birden fazla hastalığa işaret edebilir. Yakından gözlemleyip ateş ölçümü yapın.',
    disclaimer
  };
}

/**
 * Eski API uyumluluğu — (Deprecated: artık calculateWithdrawalFromLastDose kullanın)
 */
export function calculateWithdrawal(animalId, meatDays, milkDays, applicationDate = new Date()) {
  return calculateWithdrawalFromLastDose(meatDays, milkDays, applicationDate);
}

/**
 * Sensör verilerini dinler ve Anomali tespiti yapar.
 */
export function checkVitalAnomalies(temp, activity) {
  if (temp > 40.0) {
    return { type: 'EMERGENCY', title: 'Yüksek Ateş!', msg: `Vücut ısısı kritik seviyede: ${temp.toFixed(1)}°C. Acil müdahale gereklidir.` };
  }
  if (temp < 37.5) {
    return { type: 'WARNING', title: 'Hipotermi Riski', msg: `Vücut ısısı normalin altında: ${temp.toFixed(1)}°C. Hayvanı ısıtın.` };
  }
  if (activity === 'low') {
    return { type: 'WARNING', title: 'Düşük Hareketlilik', msg: 'Hayvanda anormal durgunluk tespit edildi, gözlem altına alın.' };
  }
  return null;
}
