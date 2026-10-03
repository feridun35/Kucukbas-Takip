/**
 * ShepherdAI — Sürü Yaşam Döngüsü Motoru (Herd Manager)
 * Hayvan ekleme, güncelleme, doğum ve ölüm kayıtları.
 *
 * ── Mimari Kuralı ──
 * UI modülleri (herd-list, animal-profile, health-mortality) yalnızca formu toplar ve
 * bu fonksiyonları çağırır. Kayıt oluşturma, sürüden çıkarma, çapraz modül yazımları burada yapılır.
 */

import { stripTags, isValidTag, TAG_RULE_MESSAGE } from './sanitize.js';
import { todayIso, toLocalIso, normalizeDateInput } from './dateUtils.js';
import { getState, setState } from './state.js';
import { applyBirthToRecords, closeDamInRecords, pruneBreedingTasks, normalizeParentId } from './breedingManager.js';
import { getOpenDamMap } from './breedingStatus.js';
import { MARKET_PRICES } from '../data/finance-assumptions.js';
import { GOAT_BREED_KEYWORDS, GOAT_TYPES, GROUP_TO_FOCUS, ANIMAL_LIMITS, TYPE_GENDER } from '../data/herd-constants.js';


function _generateRfid() {
  return 'RFID-' + Math.floor(Math.random() * 90000 + 10000);
}

function _isGoatBreed(breed) {
  return GOAT_BREED_KEYWORDS.some(b => (breed || '').includes(b));
}

/** Hayvanın keçi türünden olup olmadığını tür veya ırktan belirler */
export function isGoat(animal) {
  return GOAT_TYPES.includes(animal?.type) || _isGoatBreed(animal?.breed);
}

/** Küpe numarası sürüde kullanılıyor mu? */
export function isTagInUse(tagId, animals = getState().animals) {
  const clean = String(tagId || '').trim().toLocaleUpperCase('tr-TR');
  return (animals || []).some(a => String(a.id).toLocaleUpperCase('tr-TR') === clean);
}

// ═══════════════════════════════════════════
// Veri doğrulama (yaş / ağırlık / tür-cinsiyet)
// ═══════════════════════════════════════════

const YOUNG_TYPES = ['Kuzu', 'Oğlak'];
const _isBlank = (v) => v === undefined || v === null || String(v).trim() === '';

/** Türe göre izin verilen canlı ağırlık aralığı [min, max] */
export function getWeightRange(type) {
  return ANIMAL_LIMITS.weightKg[type] || ANIMAL_LIMITS.defaultWeightKg;
}

/** Kayıtlı ağırlık türüne göre makul mü? (eski/bozuk kayıtları işaretlemek için) */
export function isWeightPlausible(animal) {
  const w = parseFloat(animal?.weight);
  if (!(w > 0)) return true; // girilmemiş ağırlık hata değildir
  const [min, max] = getWeightRange(animal.type);
  return w >= min && w <= max;
}

/** Ağırlık doğrulaması — hata mesajı ya da null */
export function validateWeight(type, value, label = 'Ağırlık') {
  if (_isBlank(value)) return null;
  const w = Number(value);
  const [min, max] = getWeightRange(type);
  if (!Number.isFinite(w) || w < min || w > max) {
    return `${label} ${type ? type + ' için ' : ''}${min}–${max} kg arasında olmalıdır.`;
  }
  return null;
}

/** Yaş (ay) doğrulaması — hata mesajı ya da null */
export function validateAgeMonths(type, value) {
  if (_isBlank(value)) return null;
  const m = Number(value);
  if (!Number.isInteger(m) || m < 0 || m > ANIMAL_LIMITS.maxAgeMonths) {
    return `Yaş 0–${ANIMAL_LIMITS.maxAgeMonths} ay (en fazla ${ANIMAL_LIMITS.maxAgeMonths / 12} yıl) arasında tam sayı olmalıdır.`;
  }
  if (YOUNG_TYPES.includes(type) && m > ANIMAL_LIMITS.youngMaxAgeMonths) {
    return `${type} en fazla ${ANIMAL_LIMITS.youngMaxAgeMonths} aylık olabilir; daha büyük hayvan için yetişkin türünü seçin.`;
  }
  if (type && !YOUNG_TYPES.includes(type) && m < ANIMAL_LIMITS.adultMinAgeMonths) {
    return `${type} en az ${ANIMAL_LIMITS.adultMinAgeMonths} aylık olmalıdır; daha küçük hayvan için Kuzu/Oğlak seçin.`;
  }
  return null;
}

/** Tür–cinsiyet tutarlılığı (Koç dişi olamaz vb.) — hata mesajı ya da null */
export function validateTypeGender(type, gender) {
  const expected = TYPE_GENDER[type];
  if (expected && gender && gender !== expected) return `${type} ${expected.toLocaleLowerCase('tr-TR')} olmalıdır.`;
  return null;
}

/** Canlı ağırlıktan tahmini finansal kayıp (piyasa canlı kg fiyatı ile) */
export function estimateLossFromWeight(weightKg) {
  const w = parseFloat(weightKg) || 0;
  return Math.round(w * MARKET_PRICES.meatLivePerKg);
}

/**
 * Sürüye yeni hayvan ekler.
 * @param {Object} input - { id, nickname, type, breed, gender, group, weight, ageMonths, mother, father }
 * @returns {{ success: boolean, message: string, animal?: Object }}
 */
export function addAnimal(input) {
  const id = String(input?.id || '').trim();
  if (!id) return { success: false, message: 'Küpe numarası zorunludur.' };
  if (!isValidTag(id)) return { success: false, message: TAG_RULE_MESSAGE };

  const state = getState();
  if (isTagInUse(id, state.animals)) {
    return { success: false, message: `${id} küpe numarası sürüde zaten kayıtlı.` };
  }

  const gender = input.gender || 'Dişi';
  const breed = input.breed || 'Anadolu Merinosu';
  const defaultType = _isGoatBreed(breed)
    ? (gender === 'Dişi' ? 'Keçi' : 'Teke')
    : (gender === 'Dişi' ? 'Koyun' : 'Koç');
  const type = input.type || defaultType;
  const group = input.group || 'Besi';

  const error = validateTypeGender(type, gender)
    || validateWeight(type, input.weight)
    || validateAgeMonths(type, input.ageMonths);
  if (error) return { success: false, message: error };

  let birthDate = null; // Yaş girilmezse doğum tarihi bilinmiyor (uydurulmaz)
  if (!_isBlank(input.ageMonths)) {
    const d = new Date();
    d.setMonth(d.getMonth() - Number(input.ageMonths));
    birthDate = toLocalIso(d);
  }
  const weight = _isBlank(input.weight) ? null : Number(input.weight);

  const animal = {
    id,
    nickname: input.nickname ? stripTags(String(input.nickname)) : '',
    rfid: _generateRfid(),
    breed,
    gender,
    type,
    group,
    weight,
    bcs: 3,
    status: 'good',
    lastVaccine: '-',
    focus: GROUP_TO_FOCUS[group] || 'meat',
    birthDate,
    // Bilinmeyen ebeveyn null saklanır (akrabalık kontrolü 'Bilinmiyor' metnini ortak ebeveyn sanmasın)
    mother: normalizeParentId(input.mother),
    father: normalizeParentId(input.father),
    addedAt: todayIso(),
    // Tarihli tartımlar (damızlık skorundaki büyüme hızı bunlardan hesaplanır)
    weightHistory: weight ? [{ date: todayIso(), weight }] : []
  };
  const purchasePrice = parseFloat(input.purchasePrice);
  if (purchasePrice >= 0) animal.purchasePrice = purchasePrice;

  setState({ animals: [animal, ...(state.animals || [])], activeAnimalId: animal.id });
  return { success: true, message: `${animal.id} sürüye eklendi.`, animal };
}

/** Tartım geçmişine kayıt ekler (aynı güne ikinci tartım öncekinin yerine geçer). Saf. */
export function appendWeighing(history, date, weight) {
  return [...(history || []).filter(w => w?.date !== date), { date, weight }]
    .sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/**
 * Hayvanın alanlarını günceller (ağırlık, VKS, verim odağı vb.).
 * @returns {{ success: boolean, message: string, animal?: Object }}
 */
export function updateAnimal(animalId, patch) {
  const state = getState();
  const animals = [...(state.animals || [])];
  const idx = animals.findIndex(a => a.id === animalId);
  if (idx === -1) return { success: false, message: 'Hayvan bulunamadı.' };

  // Kimlik alanı bu fonksiyonla değiştirilemez
  const { id: _ignored, ...safePatch } = patch || {};
  const next = { ...animals[idx], ...safePatch };

  if ('weight' in safePatch) {
    const error = validateWeight(next.type, safePatch.weight);
    if (error) return { success: false, message: error };
    if (!_isBlank(safePatch.weight)) {
      next.weight = Number(safePatch.weight);
      next.weightHistory = appendWeighing(animals[idx].weightHistory, todayIso(), next.weight);
    }
  }
  if ('bcs' in safePatch) {
    const [min, max] = ANIMAL_LIMITS.bcs;
    const bcs = Number(safePatch.bcs);
    if (!Number.isFinite(bcs) || bcs < min || bcs > max) return { success: false, message: `Vücut kondisyon skoru ${min}–${max} arasında olmalıdır.` };
  }
  if ('type' in safePatch || 'gender' in safePatch) {
    const error = validateTypeGender(next.type, next.gender);
    if (error) return { success: false, message: error };
  }

  animals[idx] = next;
  setState({ animals });
  return { success: true, message: 'Hayvan güncellendi.', animal: animals[idx] };
}

/**
 * Ölüm kaydı oluşturur: hayvanı canlı sürüden çıkarır, mortalite raporuna ve görev geçmişine işler.
 * Sürüde kayıtlı olmayan (manuel girilen) küpe numaraları için de rapor kaydı açılır.
 *
 * @param {Object} input - { animalId, deathDate, reason, lastWeight?, financialLoss?, note? }
 * @returns {{ success: boolean, message: string, record?: Object, removedFromHerd?: boolean }}
 */
export function recordDeath(input) {
  const tag = String(input?.animalId || '').trim();
  if (!tag) return { success: false, message: 'Küpe numarası zorunludur.' };

  const state = getState();
  const animals = [...(state.animals || [])];
  const idx = animals.findIndex(a => a.id === tag);
  const animal = idx > -1 ? animals[idx] : null;
  // Sürüde olmayan (elle girilen) küpe numarası da güvenli karakterlerden oluşmalı
  if (!animal && !isValidTag(tag)) return { success: false, message: TAG_RULE_MESSAGE };

  const deathDate = input.deathDate || todayIso();
  const reason = input.reason || 'Diğer / Bilinmeyen';
  const weightError = validateWeight(animal?.type, input.lastWeight, 'Son canlı ağırlık');
  if (weightError) return { success: false, message: weightError };
  const lastWeight = parseFloat(input.lastWeight) || parseFloat(animal?.weight) || 0;
  const parsedLoss = parseFloat(input.financialLoss);
  const financialLoss = !isNaN(parsedLoss) && parsedLoss >= 0 ? parsedLoss : estimateLossFromWeight(lastWeight);

  const record = {
    id: 'MORT-' + Date.now(),
    animalId: tag,
    rfid: animal?.rfid || null,
    breed: animal?.breed || 'Bilinmiyor',
    type: animal?.type || 'Bilinmiyor',
    gender: animal?.gender || 'Bilinmiyor',
    group: animal?.group || 'Bilinmiyor',
    lastWeight,
    deathDate,
    deathReason: reason,
    financialLoss,
    note: stripTags(input.note || '')
  };

  if (idx > -1) animals.splice(idx, 1);

  const historyEntry = {
    id: 'DEATH-' + Date.now(),
    title: `Ölüm Kaydı: ${tag}`,
    desc: `Sebep: ${reason}. Tahmini kayıp: ${financialLoss}₺.${idx > -1 ? ' Sürüden çıkarıldı.' : ''}`,
    type: 'other',
    prio: 'High',
    scope: 'individual',
    targetTag: tag,
    status: 'completed',
    createdAt: deathDate,
    completedAt: deathDate
  };

  // Ölen hayvanın bekleyen bireysel görevleri artık uygulanamaz
  const cancelledTasks = (state.tasks || []).filter(t => t.scope === 'individual' && t.targetTag === tag);
  if (cancelledTasks.length > 0) historyEntry.desc += ` ${cancelledTasks.length} bekleyen bireysel görev iptal edildi.`;

  // Açık katım/gebelik kaydı varsa anaç LOST olarak kapanır
  const breedingRecords = closeDamInRecords(state.breedingRecords, tag);
  const tasks = pruneBreedingTasks(
    (state.tasks || []).filter(t => !cancelledTasks.includes(t)),
    breedingRecords
  );

  const update = {
    animals,
    tasks,
    breedingRecords,
    mortalityRecords: [record, ...(state.mortalityRecords || [])],
    taskHistory: [historyEntry, ...(state.taskHistory || [])]
  };
  if (state.activeAnimalId === tag) update.activeAnimalId = null;

  setState(update);
  return {
    success: true,
    message: `${tag} ölüm raporlarına eklendi.${idx > -1 ? ' Canlı sürü listesinden düşüldü.' : ''}`,
    record,
    removedFromHerd: idx > -1
  };
}

/**
 * Doğum kaydı: yavruyu sürüye ekler, anayı Sağmal grubuna alır ve aktif eşleşme kaydını kapatır.
 *
 * @param {string} motherId
 * @param {Object} input - { babyId, gender, birthWeight, birthDate, fatherId }
 * @returns {{ success: boolean, message: string, baby?: Object }}
 */
export function registerBirth(motherId, input) {
  const state = getState();
  const animals = [...(state.animals || [])];
  const mother = animals.find(a => a.id === motherId);
  if (!mother) return { success: false, message: 'Ana hayvan bulunamadı.' };

  const babyId = String(input?.babyId || '').trim();
  if (!babyId) return { success: false, message: 'Yavru küpe numarası zorunludur.' };
  if (!isValidTag(babyId)) return { success: false, message: TAG_RULE_MESSAGE };
  if (isTagInUse(babyId, animals)) {
    return { success: false, message: `${babyId} küpe numarası sürüde zaten kayıtlı.` };
  }

  const birthDate = normalizeDateInput(input.birthDate) || todayIso();
  if (birthDate > todayIso()) return { success: false, message: 'Doğum tarihi ileri bir tarih olamaz.' };
  // Doğum ağırlığı girilmezse boş bırakılır (uydurulmaz); girildiyse makul aralıkta olmalı
  let birthWeight = null;
  if (!_isBlank(input.birthWeight)) {
    const [min, max] = ANIMAL_LIMITS.birthWeightKg;
    birthWeight = Number(input.birthWeight);
    if (!Number.isFinite(birthWeight) || birthWeight < min || birthWeight > max) {
      return { success: false, message: `Doğum ağırlığı ${min}–${max} kg arasında olmalıdır.` };
    }
  }
  const babyType = isGoat(mother) ? 'Oğlak' : 'Kuzu';

  const baby = {
    id: babyId,
    rfid: _generateRfid(),
    breed: mother.breed || 'Bilinmiyor',
    gender: input.gender || 'Dişi',
    type: babyType,
    group: 'Besi',
    weight: birthWeight,
    birthWeight,
    bcs: 2.5,
    status: 'good',
    lastVaccine: '-',
    focus: 'meat',
    birthDate,
    mother: mother.id,
    father: normalizeParentId(input.fatherId)
  };

  animals.unshift(baby);

  // Doğum yapan ana sağmal gruba geçer (gebe işaretliyse ya da açık katım kaydı varsa)
  const hadOpenMating = getOpenDamMap(state.breedingRecords).has(motherId);
  const motherIdx = animals.findIndex(a => a.id === motherId);
  if (motherIdx > -1 && (animals[motherIdx].group === 'Gebe' || hadOpenMating)) {
    animals[motherIdx] = { ...animals[motherIdx], group: 'Sağmal' };
  }

  // Yalnızca bu ananın kaydı kapanır (grup katımında diğer anaçların takibi sürer); ikizler aynı doğuma eklenir
  const { breedingRecords } = applyBirthToRecords(state.breedingRecords, motherId, {
    date: birthDate,
    babyId: baby.id,
    type: input.birthType || 'Normal'
  });
  const tasks = pruneBreedingTasks(state.tasks, breedingRecords);

  setState({ animals, breedingRecords, tasks });
  return { success: true, message: `${baby.id} sürüye eklendi.`, baby };
}
