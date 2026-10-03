/**
 * ShepherdAI — Üreme & Gebelik İş Mantığı Motoru (Breeding Manager)
 *
 * Saf fonksiyonlar: UI'dan tamamen izole.
 * - calculateGestationMilestones: Biyolojik takvim hesaplaması
 * - checkInbreedingRisk: Akrabalık kontrolü (anne/baba/kardeş)
 * - createMatingRecord: Bireysel veya Grup eşleşme kaydı oluşturma
 * - syncBreedingTasks: Milestone'ları görev sistemine aktarma
 * - saveMatingRecord: Kaydı + takvim görevlerini tek seferde state'e yazma
 * - confirmPregnancy / markMatingFailed: Anaç bazında gebelik doğrulama / tutmadı
 * - applyBirthToRecords / closeDamInRecords: Doğum ve ölümün kayıtlara işlenmesi
 * - recordBirth: Gebelik kaydını sonlandırma
 * - calculateCompatibility: Beklenen yavru skoru (ebeveynlerin damızlık skorlarından)
 */

import { todayIso, addDaysIso, daysBetweenIso } from './dateUtils.js';
import { getState, readState, setState } from './state.js';
import { expectedOffspringScore } from './performanceIndex.js';
import { buildTask } from './workforceManager.js';
import { DAM_STATUS, getDamStatus, deriveRecordStatus, isOpenDamStatus, getOpenDamMap, normalizeParentId } from './breedingStatus.js';

export { normalizeParentId } from './breedingStatus.js';

// ── Sabitler ──
const GESTATION_DAYS = 148;
const CYCLE_RETURN_DAY = 17;
const ULTRASOUND_DAY = 45;
const LATE_GESTATION_DAY = 115;

// ── Yardımcı ──
const _addDays = addDaysIso;
const _daysBetween = daysBetweenIso;

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
  const today = todayIso();
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
  // Not: Ebeveyni bilinmeyen ('Bilinmiyor', boş, '-') hayvanlar ortak ebeveyne sahip SAYILMAZ.
  if (!damId || !sireId || !animals || animals.length === 0) {
    return { hasRisk: false, relation: null, details: null };
  }

  const dam  = animals.find(a => a.id === damId);
  const sire = animals.find(a => a.id === sireId);
  if (!dam || !sire) return { hasRisk: false, relation: null, details: null };

  const damMother  = normalizeParentId(dam.mother);
  const damFather  = normalizeParentId(dam.father);
  const sireMother = normalizeParentId(sire.mother);
  const sireFather = normalizeParentId(sire.father);

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
    damStatus: Object.fromEntries(damIds.map(id => [id, DAM_STATUS.ACTIVE])),
    damPrevGroup: {},
    births: [],
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
      dueDate: ms.cycleCheckDate,
      breedingRecordId: breedingRecord.id
    },
    {
      title: `Ultrason / Gebelik Muayenesi (${damLabel})`,
      desc: `${ms.ultrasoundDate} tarihinde ultrason ile gebelik doğrulaması yapılmalıdır. Koç: ${sireLabel}.`,
      type: 'checkup',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.ultrasoundDate,
      breedingRecordId: breedingRecord.id
    },
    {
      title: `İleri Gebelik Bakımı & Çelerme Aşısı (${damLabel})`,
      desc: `${ms.lateGestationDate} tarihinde ileri gebelik besleme programına geçiş ve Klostridyum (Çelerme) aşısı hatırlatması.`,
      type: 'vaccine',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.lateGestationDate,
      breedingRecordId: breedingRecord.id
    },
    {
      title: `Tahmini Doğum — Doğum Bölmesine Alma (${damLabel})`,
      desc: `${ms.expectedBirthDate} civarında doğum bekleniyor. Hayvanı doğum bölmesine alın, temiz altlık ve sıcak su hazırlayın.`,
      type: 'other',
      prio: 'High',
      scope: breedingRecord.damIds.length === 1 ? 'individual' : 'herd',
      targetTag: breedingRecord.damIds.length === 1 ? breedingRecord.damIds[0] : null,
      dueDate: ms.expectedBirthDate,
      breedingRecordId: breedingRecord.id
    }
  ];

  return tasks;
}

/**
 * Eşleşme kaydını oluşturur ve gebelik takvimi görevleriyle birlikte TEK bir setState ile kaydeder.
 * @param {'INDIVIDUAL'|'GROUP'} type
 * @param {Object} data — { sireIds, damIds, startDate, endDate? }
 * @returns {{ success: boolean, record: Object }}
 */
export function saveMatingRecord(type, data) {
  const state = getState();
  const animals = state.animals || [];
  const byId = new Map(animals.map(a => [a.id, a]));
  const sireIds = data.sireIds || [];
  const damIds = data.damIds || [];

  if (sireIds.length === 0 || damIds.length === 0) {
    return { success: false, message: 'En az bir koç/teke ve bir anaç seçmelisiniz.' };
  }
  const wrongSire = sireIds.find(id => byId.get(id)?.gender !== 'Erkek');
  if (wrongSire) return { success: false, message: `${wrongSire} erkek bir hayvan değil; koç/teke olarak seçilemez.` };
  const wrongDam = damIds.find(id => byId.get(id)?.gender !== 'Dişi');
  if (wrongDam) return { success: false, message: `${wrongDam} dişi bir hayvan değil; anaç olarak seçilemez.` };
  const openDams = getOpenDamMap(state.breedingRecords);
  const busyDam = damIds.find(id => openDams.has(id));
  if (busyDam) return { success: false, message: `${busyDam} için zaten açık bir katım/gebelik kaydı var.` };

  const record = createMatingRecord(type, data, animals);
  const newTasks = syncBreedingTasks(record).map(buildTask);

  setState({
    breedingRecords: [record, ...(state.breedingRecords || [])],
    tasks: [...newTasks, ...(state.tasks || [])]
  });
  return { success: true, record };
}

// ═══════════════════════════════════════════════════════════
// 5. Doğum Kaydı (Gebeliği Sonlandırma)
// ═══════════════════════════════════════════════════════════
/**
 * Bir anacın doğumunu ilgili açık kayda işler (saf). Grup kaydında yalnızca o anacın durumu kapanır.
 * Aynı anacın aynı gün ikinci yavrusu (ikiz/üçüz) aynı doğum kaydına eklenir.
 *
 * @param {Array}  breedingRecords
 * @param {string} damId
 * @param {Object} birthData — { date, babyId, type? }
 * @returns {{ breedingRecords: Array, recordId: string|null }}
 */
export function applyBirthToRecords(breedingRecords, damId, birthData) {
  const date = birthData.date || todayIso();
  // Önce açık kayıt; yoksa (ikizin ikinci yavrusu) aynı gün doğum yapılmış kayıt
  let target = (breedingRecords || []).find(r =>
    (r.damIds || []).includes(damId) && isOpenDamStatus(getDamStatus(r, damId)));
  if (!target) {
    target = (breedingRecords || []).find(r =>
      (r.births || []).some(b => b.damId === damId && b.date === date));
  }
  if (!target) return { breedingRecords, recordId: null };

  const updated = (breedingRecords || []).map(rec => {
    if (rec.id !== target.id) return rec;
    const births = [...(rec.births || [])];
    const idx = births.findIndex(b => b.damId === damId && b.date === date);
    if (idx > -1) {
      const babyIds = [...(births[idx].babyIds || []), birthData.babyId].filter(Boolean);
      births[idx] = { ...births[idx], babyIds, lambCount: babyIds.length };
    } else {
      births.push({ damId, date, type: birthData.type || 'Normal', babyIds: [birthData.babyId].filter(Boolean), lambCount: 1 });
    }
    const next = {
      ...rec,
      damStatus: { ...(rec.damStatus || {}), [damId]: DAM_STATUS.DELIVERED },
      births,
      // Geriye uyumlu özet: son doğum tarihi + toplam yavru
      birthRecord: {
        date,
        type: birthData.type || 'Normal',
        lambCount: births.reduce((s, b) => s + (b.lambCount || 0), 0),
        notes: ''
      }
    };
    return { ...next, status: deriveRecordStatus(next) };
  });

  return { breedingRecords: updated, recordId: target.id };
}

/**
 * Anacın açık kayıtlarını verilen durumla kapatır (örn. ölüm → LOST). Saf.
 */
export function closeDamInRecords(breedingRecords, damId, status = DAM_STATUS.LOST) {
  return (breedingRecords || []).map(rec => {
    if (!(rec.damIds || []).includes(damId) || !isOpenDamStatus(getDamStatus(rec, damId))) return rec;
    const next = { ...rec, damStatus: { ...(rec.damStatus || {}), [damId]: status } };
    return { ...next, status: deriveRecordStatus(next) };
  });
}

/**
 * Kapanan anaç/kayıtlara ait bekleyen gebelik takvimi görevlerini ayıklar. Saf.
 * Bireysel görev → anacı kapandıysa; sürü (grup) görevi → kaydın tüm anaçları kapandıysa.
 */
export function pruneBreedingTasks(tasks, breedingRecords) {
  const byId = new Map((breedingRecords || []).map(r => [r.id, r]));
  return (tasks || []).filter(t => {
    if (!t.breedingRecordId || t.status === 'completed') return true;
    const rec = byId.get(t.breedingRecordId);
    if (!rec) return true;
    if (t.targetTag) return isOpenDamStatus(getDamStatus(rec, t.targetTag));
    return (rec.damIds || []).some(id => isOpenDamStatus(getDamStatus(rec, id)));
  });
}

function _updateDam(recordId, damId, updater) {
  const state = getState();
  const records = state.breedingRecords || [];
  const rec = records.find(r => r.id === recordId);
  if (!rec || !(rec.damIds || []).includes(damId)) return { success: false, message: 'Eşleşme kaydı bulunamadı.' };
  return updater(state, rec);
}

/**
 * Gebeliği doğrular (ultrason vb.): anaç PREGNANT olur, grubu 'Gebe'ye alınır.
 */
export function confirmPregnancy(recordId, damId) {
  return _updateDam(recordId, damId, (state, rec) => {
    if (getDamStatus(rec, damId) !== DAM_STATUS.ACTIVE) {
      return { success: false, message: 'Bu anaç için doğrulanacak aktif bir katım yok.' };
    }
    const animals = [...(state.animals || [])];
    const idx = animals.findIndex(a => a.id === damId);
    const prevGroup = idx > -1 ? animals[idx].group : null;
    if (idx > -1) animals[idx] = { ...animals[idx], group: 'Gebe' };

    const breedingRecords = state.breedingRecords.map(r => {
      if (r.id !== recordId) return r;
      const next = {
        ...r,
        damStatus: { ...(r.damStatus || {}), [damId]: DAM_STATUS.PREGNANT },
        damPrevGroup: { ...(r.damPrevGroup || {}), [damId]: prevGroup }
      };
      return { ...next, status: deriveRecordStatus(next) };
    });

    setState({ animals, breedingRecords });
    return { success: true, message: `${damId} gebe olarak işaretlendi. Tahmini doğum: ${rec.milestones.expectedBirthDate}.` };
  });
}

/**
 * Gebeliğin tutmadığını işaretler: anaç FAILED olur, 'Gebe' grubuna alınmışsa eski grubuna döner,
 * bu anaca ait bekleyen gebelik takvimi görevleri kaldırılır.
 */
export function markMatingFailed(recordId, damId) {
  return _updateDam(recordId, damId, (state, rec) => {
    if (!isOpenDamStatus(getDamStatus(rec, damId))) {
      return { success: false, message: 'Bu anaç için açık bir katım yok.' };
    }
    const animals = [...(state.animals || [])];
    const idx = animals.findIndex(a => a.id === damId);
    if (idx > -1 && animals[idx].group === 'Gebe') {
      animals[idx] = { ...animals[idx], group: rec.damPrevGroup?.[damId] || 'Boş' };
    }

    const breedingRecords = state.breedingRecords.map(r => {
      if (r.id !== recordId) return r;
      const next = { ...r, damStatus: { ...(r.damStatus || {}), [damId]: DAM_STATUS.FAILED } };
      return { ...next, status: deriveRecordStatus(next) };
    });

    setState({ animals, breedingRecords, tasks: pruneBreedingTasks(state.tasks, breedingRecords) });
    return { success: true, message: `${damId} için katım "tutmadı" olarak kaydedildi.` };
  });
}

// ═══════════════════════════════════════════════════════════
// 6. Beklenen Yavru Skoru
// ═══════════════════════════════════════════════════════════
/**
 * Eşleşmeden beklenen yavru skoru: anacın ve koçun damızlık skorlarının (core/performanceIndex.js)
 * seçili verim odağına göre ortalaması. Ebeveynlerden birinin skoru hesaplanamıyorsa score null döner.
 * @returns {{ score: number|null, dam: number|null, sire: number|null }}
 */
export function calculateCompatibility(damId, sireId, focusMode) {
  return expectedOffspringScore(readState(), damId, sireId, focusMode || 'meat');
}
