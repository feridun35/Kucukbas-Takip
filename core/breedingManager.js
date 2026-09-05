/**
 * ShepherdAI — Üreme & Gebelik İş Mantığı Motoru (Breeding Manager)
 *
 * Saf fonksiyonlar: UI'dan tamamen izole.
 * - calculateGestationMilestones: Biyolojik takvim hesaplaması
 * - checkInbreedingRisk: Akrabalık kontrolü (anne/baba/kardeş)
 * - createMatingRecord: Bireysel veya Grup eşleşme kaydı oluşturma
 * - syncBreedingTasks: Milestone'ları görev sistemine aktarma
 * - recordBirth: Gebelik kaydını sonlandırma
 * - calculateCompatibility: Genetik uyum skoru
 */

import { getAnimalById } from './state.js';

// ── Sabitler ──
const GESTATION_DAYS = 148;
const CYCLE_RETURN_DAY = 17;
const ULTRASOUND_DAY = 45;
const LATE_GESTATION_DAY = 115;

// ── Yardımcı ──
function _addDays(dateStr, days) {
  const d = new Date(dateStr);
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

function _daysBetween(dateStrA, dateStrB) {
  const a = new Date(dateStrA);
  const b = new Date(dateStrB);
  return Math.round((b - a) / 86400000);
}

// ═══════════════════════════════════════════════════════════
// 1. Biyolojik Gebelik Takvimi
// ═══════════════════════════════════════════════════════════
/**
 * Aşım tarihinden itibaren 4 kritik eşiği hesaplar.
 * @param {string} matingDate — 'YYYY-MM-DD'
 * @returns {Object} milestones
 */
export function calculateGestationMilestones(matingDate) {
  return {
    cycleCheckDate:     _addDays(matingDate, CYCLE_RETURN_DAY),
    ultrasoundDate:     _addDays(matingDate, ULTRASOUND_DAY),
    lateGestationDate:  _addDays(matingDate, LATE_GESTATION_DAY),
    expectedBirthDate:  _addDays(matingDate, GESTATION_DAYS)
  };
}

/**
 * Beklenen doğum tarihi ve kalan gün hesabı
 * @param {string} matingDate — 'YYYY-MM-DD'
 * @returns {{ expectedDate: string, daysLeft: number, daysElapsed: number, progressPercent: number, isCritical: boolean }}
 */
export function calculateBirthDate(matingDate) {
  const expected = _addDays(matingDate, GESTATION_DAYS);
  const today = new Date().toISOString().split('T')[0];
  const daysLeft = Math.max(0, _daysBetween(today, expected));
  const daysElapsed = _daysBetween(matingDate, today);
  const progressPercent = Math.min(100, Math.round((daysElapsed / GESTATION_DAYS) * 100));

  return {
    expectedDate: expected,
    daysLeft,
    daysElapsed,
    progressPercent,
    isCritical: daysLeft <= 15
  };
}

// ═══════════════════════════════════════════════════════════
// 2. Akrabalık (Inbreeding) Kontrolü
// ═══════════════════════════════════════════════════════════
/**
 * Anne (dam) ve Koç (sire) arasında 1. derece akrabalık kontrolü yapar.
 * Kontrol edilen ilişkiler:
 *   - Baba-kız (sire, dam'ın babası mı?)
 *   - Anne-oğul (dam, sire'ın annesi mi?)
 *   - Öz kardeş (aynı anne+baba)
 *   - Üvey kardeş (aynı baba VEYA aynı anne)
 *
 * @param {string} damId   — Koyun (dişi) ID
 * @param {string} sireId  — Koç (erkek) ID
 * @param {Array}  animals — Sürü dizisi
 * @returns {{ hasRisk: boolean, relation: string|null, details: string|null }}
 */
export function checkInbreedingRisk(damId, sireId, animals) {
  if (!damId || !sireId || !animals || animals.length === 0) {
    return { hasRisk: false, relation: null, details: null };
  }

  const dam  = animals.find(a => a.id === damId);
  const sire = animals.find(a => a.id === sireId);
  if (!dam || !sire) return { hasRisk: false, relation: null, details: null };

  const damMother  = dam.mother  || null;
  const damFather  = dam.father  || null;
  const sireMother = sire.mother || null;
  const sireFather = sire.father || null;

  // Baba-kız: Koç bu koyunun babası mı?
  if (damFather && damFather === sireId) {
    return { hasRisk: true, relation: 'Baba-Kız', details: `${sireId} bu koyunun (${damId}) babasıdır!` };
  }

  // Anne-oğul: Koyun bu koçun annesi mi?
  if (sireMother && sireMother === damId) {
    return { hasRisk: true, relation: 'Anne-Oğul', details: `${damId} bu koçun (${sireId}) annesidir!` };
  }

  // Öz kardeş: Aynı anne VE aynı baba
  if (damMother && sireMother && damFather && sireFather &&
      damMother === sireMother && damFather === sireFather) {
    return { hasRisk: true, relation: 'Öz Kardeş', details: `${damId} ve ${sireId} aynı anne-babadan doğma öz kardeşlerdir.` };
  }

  // Üvey kardeş (anne tarafı)
  if (damMother && sireMother && damMother === sireMother) {
    return { hasRisk: true, relation: 'Üvey Kardeş (Anne)', details: `${damId} ve ${sireId} aynı anneden (${damMother}) doğmuşlardır.` };
  }

  // Üvey kardeş (baba tarafı)
  if (damFather && sireFather && damFather === sireFather) {
    return { hasRisk: true, relation: 'Üvey Kardeş (Baba)', details: `${damId} ve ${sireId} aynı babadan (${damFather}) doğmuşlardır.` };
  }

  return { hasRisk: false, relation: null, details: null };
}

// ═══════════════════════════════════════════════════════════
// 3. Eşleşme (Mating) Kaydı Oluşturma
// ═══════════════════════════════════════════════════════════
/**
 * Bireysel (INDIVIDUAL) veya Grup (GROUP) eşleşme kaydı oluşturur.
 * State'e YAZMAZ — sadece obje üretir.
 *
 * @param {'INDIVIDUAL'|'GROUP'} type
 * @param {Object} data — { sireIds, damIds, startDate, endDate? }
 * @param {Array}  animals — Sürü dizisi (inbreeding kontrolü için)
 * @returns {Object} breedingRecord
 */
export function createMatingRecord(type, data, animals) {
  const { sireIds, damIds, startDate, endDate } = data;

  const milestones = calculateGestationMilestones(startDate);

  // İlk koç-koyun çifti için inbreeding kontrolü (bireysel'de tek çift)
  let inbreedingWarning = null;
  if (type === 'INDIVIDUAL' && sireIds.length === 1 && damIds.length === 1) {
    const result = checkInbreedingRisk(damIds[0], sireIds[0], animals);
    if (result.hasRisk) {
      inbreedingWarning = `⚠️ ${result.relation}: ${result.details}`;
    }
  }

  return {
    id: 'BR-' + Date.now(),
    type,
    sireIds: [...sireIds],
    damIds: [...damIds],
    startDate,
    endDate: endDate || null,
    status: 'ACTIVE',
    milestones,
    inbreedingWarning,
    birthRecord: null
  };
}

// ═══════════════════════════════════════════════════════════
// 4. Breeding → Task Senkronizasyonu
// ═══════════════════════════════════════════════════════════
/**
 * Bir breeding kaydının milestone'larını tasks formatında görev dizisi olarak döndürür.
 * Dışarıda addTask() ile state'e eklenecek.
 *
 * @param {Object} breedingRecord
 * @returns {Array<Object>} tasks — addTask uyumlu obje dizisi
 */
export function syncBreedingTasks(breedingRecord) {
  const ms = breedingRecord.milestones;
  const damLabel = breedingRecord.damIds.length > 1
    ? `${breedingRecord.damIds.length} Anaç (Grup)`
    : breedingRecord.damIds[0];
  const sireLabel = breedingRecord.sireIds.join(', ');

  const tasks = [
    {
      title: `Kızgınlık Geri Dönme Kontrolü (${damLabel})`,
      desc: `Aşım tarihi: ${breedingRecord.startDate}. ${ms.cycleCheckDate} tarihinde koyunun östrus (kızgınlık) gösterip göstermediğini kontrol edin. Kızgınlık varsa koç tutmamış olabilir.`,
      type: 'checkup',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.cycleCheckDate
    },
    {
      title: `Ultrason / Gebelik Muayenesi (${damLabel})`,
      desc: `${ms.ultrasoundDate} tarihinde ultrason ile gebelik doğrulaması yapılmalıdır. Koç: ${sireLabel}.`,
      type: 'checkup',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.ultrasoundDate
    },
    {
      title: `İleri Gebelik Bakımı & Çelerme Aşısı (${damLabel})`,
      desc: `${ms.lateGestationDate} tarihinde ileri gebelik besleme programına geçiş ve Klostridyum (Çelerme) aşısı hatırlatması.`,
      type: 'vaccine',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.lateGestationDate
    },
    {
      title: `Tahmini Doğum — Doğum Bölmesine Alma (${damLabel})`,
      desc: `${ms.expectedBirthDate} civarında doğum bekleniyor. Hayvanı doğum bölmesine alın, temiz altlık ve sıcak su hazırlayın.`,
      type: 'other',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.expectedBirthDate
    }
  ];

  return tasks;
}

// ═══════════════════════════════════════════════════════════
// 5. Doğum Kaydı (Gebeliği Sonlandırma)
// ═══════════════════════════════════════════════════════════
/**
 * Aktif gebelik kaydını COMPLETED statüsüne alır ve doğum bilgisini arşivler.
 * Yavruyu sürüye EKLEMEZ — bunu animal-profile.js Doğum Bildir akışı yapar.
 *
 * @param {string} breedingRecordId
 * @param {Object} birthData — { date, type:'Normal'|'Güç', lambCount, notes? }
 * @param {Array}  breedingRecords — Mevcut breedingRecords dizisi
 * @returns {Array} Güncellenmiş breedingRecords dizisi
 */
export function recordBirth(breedingRecordId, birthData, breedingRecords) {
  return breedingRecords.map(rec => {
    if (rec.id === breedingRecordId) {
      return {
        ...rec,
        status: 'COMPLETED',
        birthRecord: {
          date: birthData.date || new Date().toISOString().split('T')[0],
          type: birthData.type || 'Normal',
          lambCount: birthData.lambCount || 1,
          notes: birthData.notes || ''
        }
      };
    }
    return rec;
  });
}

// ═══════════════════════════════════════════════════════════
// 6. Genetik Uyum Skoru
// ═══════════════════════════════════════════════════════════
/**
 * Verim odağına göre 0-100 arası genetik uyum skoru hesaplar.
 * @param {string} animalIdA — Koyun ID
 * @param {string} animalIdB — Koç ID
 * @param {string} focusMode — 'meat', 'milk', 'breed'
 * @returns {number} 0-100
 */
export function calculateCompatibility(animalIdA, animalIdB, focusMode) {
  const animalA = getAnimalById(animalIdA);
  const animalB = getAnimalById(animalIdB);

  if (!animalA || !animalB || !animalA.genetics || !animalB.genetics) return 50;

  const gA = animalA.genetics;
  const gB = animalB.genetics;

  let score = 0;

  if (focusMode === 'meat') {
    const meatAvg = (gA.meat + gB.meat) / 2;
    const growthAvg = (gA.growth + gB.growth) / 2;
    score = (meatAvg * 0.4) + (growthAvg * 0.4) + (((gA.resistance + gB.resistance) / 2) * 0.2);
  } else if (focusMode === 'milk') {
    score = (gA.milk * 0.6) + (gB.milk * 0.2) + (((gA.resistance + gB.resistance) / 2) * 0.2);
  } else {
    const fertAvg = (gA.fertility + gB.fertility) / 2;
    const resAvg = (gA.resistance + gB.resistance) / 2;
    score = (fertAvg * 0.6) + (resAvg * 0.4);
  }

  return Math.min(Math.max(Math.round(score), 0), 100);
}
