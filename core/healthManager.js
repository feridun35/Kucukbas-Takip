/**
 * ShepherdAI — Bağımsız Sağlık Lojik Motoru (Health Manager)
 * AI Teşhis, Arınma Süresi Hesaplama, Sensör Anomali Kontrolü,
 * Dozaj Hesaplama, Stok Yönetimi, Kür Takvimi ve Gebelik Bariyeri.
 * 
 * ── Mimari Kuralı ──
 * Tüm iş mantığı bu dosyada toplanır.
 * UI modülleri yalnızca bu fonksiyonları çağırır — arayüzde matematik/arınma hesaplaması YAPILMAZ.
 */

import { getAnimalById, getState, setState } from './state.js';
import { getDefaultMedications } from '../data/med-library.js';

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

/** Yeni özel ilaç ekle */
export function addCustomMedication(med) {
  const state = getState();
  const customs = [...(state.customMedications || [])];
  customs.push({ ...med, id: med.id || `custom-${Date.now()}` });
  setState({ customMedications: customs });
  return customs;
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
    return { hasRisk: false, pregnantAnimals: [], warning: '' };
  }
  const pregnantAnimals = animalList.filter(a =>
    a.group === 'Gebe' || a.healthStatus === 'pregnant'
  );
  if (pregnantAnimals.length === 0) {
    return { hasRisk: false, pregnantAnimals: [], warning: '' };
  }
  return {
    hasRisk: true,
    pregnantAnimals,
    warning: med.contraindications.pregnancyWarning || 'Bu ilacın gebelikte kullanımı kontrendikedir.'
  };
}

// ═══════════════════════════════════════════
// 4. STOK YÖNETİMİ
// ═══════════════════════════════════════════

/**
 * Belirli bir ilacın toplam kullanılabilir stok miktarını döndürür.
 * Son kullanma tarihi geçmişleri hariç tutar.
 */
export function getAvailableStock(medId) {
  const state = getState();
  const now = new Date();
  const stocks = (state.pharmacyStock || []).filter(s =>
    s.medicationId === medId &&
    s.remainingQuantity > 0 &&
    new Date(s.expiryDate) > now
  );
  const total = stocks.reduce((sum, s) => sum + s.remainingQuantity, 0);
  return { total, unit: stocks[0]?.unit || 'ml', stocks };
}

/**
 * Stoktan ilaç düşer. FIFO mantığıyla en eski partiden başlar.
 * @returns {{ success: boolean, message: string, remaining: number }}
 */
export function deductFromStock(medId, amount) {
  const state = getState();
  const now = new Date();
  const allStock = [...(state.pharmacyStock || [])];

  // Geçerli stokları tarihe göre sırala (FIFO)
  const validIndices = [];
  allStock.forEach((s, i) => {
    if (s.medicationId === medId && s.remainingQuantity > 0 && new Date(s.expiryDate) > now) {
      validIndices.push(i);
    }
  });
  validIndices.sort((a, b) => new Date(allStock[a].expiryDate) - new Date(allStock[b].expiryDate));

  let remaining = amount;
  for (const idx of validIndices) {
    if (remaining <= 0) break;
    const available = allStock[idx].remainingQuantity;
    if (available >= remaining) {
      allStock[idx] = { ...allStock[idx], remainingQuantity: parseFloat((available - remaining).toFixed(2)) };
      remaining = 0;
    } else {
      remaining = parseFloat((remaining - available).toFixed(2));
      allStock[idx] = { ...allStock[idx], remainingQuantity: 0 };
    }
  }

  if (remaining > 0) {
    return { success: false, message: `Stok yetersiz! ${remaining} ${allStock[0]?.unit || 'ml'} eksik.`, remaining };
  }

  setState({ pharmacyStock: allStock });
  return { success: true, message: 'Stoktan başarıyla düşüldü.', remaining: 0 };
}

/** Stok ekleme (yeni parti veya mevcut güncelleme) */
export function addPharmacyStock(stockEntry) {
  const state = getState();
  const allStock = [...(state.pharmacyStock || [])];
  allStock.push({
    ...stockEntry,
    id: stockEntry.id || `PS-${Date.now()}`
  });
  setState({ pharmacyStock: allStock });
  return allStock;
}

/** Bir flakon/partiyi zayi olarak işaretle (Kalanı Zayi Et) */
export function markStockAsWaste(stockId, reason) {
  const state = getState();
  const allStock = [...(state.pharmacyStock || [])];
  const idx = allStock.findIndex(s => s.id === stockId);
  if (idx === -1) return { success: false, message: 'Stok bulunamadı.' };
  const wastedAmount = allStock[idx].remainingQuantity;
  allStock[idx] = { ...allStock[idx], remainingQuantity: 0, wastedReason: reason || 'Flakon Zayi', wastedDate: new Date().toISOString().split('T')[0] };
  setState({ pharmacyStock: allStock });
  return { success: true, message: `${wastedAmount} ${allStock[idx].unit} zayi olarak işaretlendi.`, wastedAmount };
}

/** Kritik stok seviyesindeki ilaçları listeler */
export function getCriticalStocks() {
  const state = getState();
  const now = new Date();
  const meds = getAllMedications();
  const critical = [];
  const stockByMed = {};

  (state.pharmacyStock || []).forEach(s => {
    if (new Date(s.expiryDate) <= now || s.remainingQuantity <= 0) return;
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

  const meatDaysLeft = Math.max(0, Math.ceil((meatSafe - now) / (1000 * 60 * 60 * 24)));
  const milkDaysLeft = Math.max(0, Math.ceil((milkSafe - now) / (1000 * 60 * 60 * 24)));

  return {
    meatSafeDate: meatSafe.toISOString().split('T')[0],
    milkSafeDate: milkSafe.toISOString().split('T')[0],
    meatDaysLeft,
    milkDaysLeft,
    isMeatSafe: meatDaysLeft === 0,
    isMilkSafe: milkDaysLeft === 0
  };
}

/**
 * Tek bir hayvanın tüm aktif arınma sürelerini hesaplar.
 * treatmentRecords'tan o hayvana ait kayıtlara bakar.
 * @param {string} animalId
 * @returns {{ hasActiveWithdrawal, meatDaysLeft, milkDaysLeft, records: [] }}
 */
export function getAnimalWithdrawalStatus(animalId) {
  const state = getState();
  const records = (state.treatmentRecords || []).filter(r =>
    r.animalId === animalId || (r.batchTargets && r.batchTargets.includes(animalId))
  );

  let maxMeatDaysLeft = 0;
  let maxMilkDaysLeft = 0;
  let activeMedName = null;
  const activeRecords = [];

  records.forEach(r => {
    if (!r.withdrawals) return;
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
 * Sürüdeki tüm karantinadaki hayvanları listeler (Dashboard / Herd-list için).
 */
export function getAllQuarantinedAnimals() {
  const state = getState();
  const animals = state.animals || [];
  const quarantined = [];

  animals.forEach(a => {
    const ws = getAnimalWithdrawalStatus(a.id);
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
  if (!course || course.days <= 1) return new Date(firstDoseDate).toISOString().split('T')[0];
  const first = new Date(firstDoseDate);
  const intervalDays = (course.repeatIntervalHours || 24) / 24;
  const last = new Date(first);
  last.setDate(last.getDate() + intervalDays * (course.days - 1));
  return last.toISOString().split('T')[0];
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
  const today = new Date().toISOString().split('T')[0];

  // ── Stoktan düşüş (Toplam Sürü Sarfiyatı) ──
  const totalBatchQuantity = dosage;
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
        ? _getNextDoseDate(today, med.treatmentCourse.repeatIntervalHours)
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
  const treatmentRecords = [record, ...(state.treatmentRecords || [])];

  // Hayvanların status'unu güncelle
  const animals = [...(state.animals || [])];
  animalIds.forEach(aid => {
    const idx = animals.findIndex(a => a.id === aid);
    if (idx > -1 && (med.meatWithdrawalDays > 0 || med.milkWithdrawalDays > 0)) {
      animals[idx] = { ...animals[idx], status: 'warning', lastVaccine: today };
    }
  });

  // Eski vaccines listesine de uyumluluk kaydı ekle
  const vaccines = [...(state.vaccines || [])];
  vaccines.unshift({
    id: Date.now(),
    name: med.name,
    date: new Date().toLocaleDateString('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' }),
    status: 'done',
    target: applicationType === 'single' ? animalIds[0] : `Toplu (${animalIds.length} baş)`,
    meatDays: med.meatWithdrawalDays,
    milkDays: med.milkWithdrawalDays,
    dosage: appliedDosePerAnimal
  });

  // ── Kür görevleri oluştur ──
  const tasks = [...(state.tasks || [])];
  if (med.treatmentCourse && med.treatmentCourse.days > 1) {
    for (let day = 2; day <= med.treatmentCourse.days; day++) {
      const doseDate = _getNthDoseDate(today, med.treatmentCourse.repeatIntervalHours, day);
      const targetLabel = applicationType === 'single'
        ? animalIds[0]
        : `Toplu (${animalIds.length} baş)`;

      tasks.push({
        id: `TSK-MED-${Date.now()}-${day}`,
        title: `💉 ${med.name} — ${day}. Doz`,
        desc: `${targetLabel} için ${med.name} kür tedavisi ${day}/${med.treatmentCourse.days}. doz uygulaması. Hayvan başı doz: ${(appliedDosePerAnimal / (med.treatmentCourse.days || 1)).toFixed(1)} ${med.unit} (Toplam sürü sarfiyatı: ${(totalBatchQuantity / (med.treatmentCourse.days || 1)).toFixed(1)} ${med.unit}).`,
        type: 'health',
        prio: 'High',
        scope: applicationType === 'single' ? 'individual' : 'herd',
        targetTag: applicationType === 'single' ? animalIds[0] : null,
        status: 'pending',
        createdAt: today,
        dueDate: doseDate
      });
    }
  }

  setState({ treatmentRecords, animals, vaccines, tasks });

  return {
    success: true,
    message: `${med.name} başarıyla uygulandı. Toplam ${totalBatchQuantity} ${med.unit} stoktan düşüldü (Hayvan başı net doz: ${appliedDosePerAnimal} ${med.unit}).`,
    record,
    stockResult
  };
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

// ═══════════════════════════════════════════
// Yardımcı (Private)
// ═══════════════════════════════════════════

function _getNextDoseDate(fromDateStr, intervalHours) {
  const d = new Date(fromDateStr);
  d.setHours(d.getHours() + (intervalHours || 24));
  return d.toISOString().split('T')[0];
}

function _getNthDoseDate(firstDateStr, intervalHours, dayNumber) {
  const d = new Date(firstDateStr);
  const intervalDays = (intervalHours || 24) / 24;
  d.setDate(d.getDate() + intervalDays * (dayNumber - 1));
  return d.toISOString().split('T')[0];
}
