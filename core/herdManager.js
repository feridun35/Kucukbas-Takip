/**
 * ShepherdAI — Sürü Yaşam Döngüsü Motoru (Herd Manager)
 * Hayvan ekleme, güncelleme, doğum ve ölüm kayıtları.
 *
 * ── Mimari Kuralı ──
 * UI modülleri (herd-list, animal-profile, health-mortality) yalnızca formu toplar ve
 * bu fonksiyonları çağırır. Kayıt oluşturma, sürüden çıkarma, çapraz modül yazımları burada yapılır.
 */

import { getState, setState } from './state.js';
import { recordBirth } from './breedingManager.js';
import { marketPrices } from '../data/mock-data.js';
import { GOAT_BREED_KEYWORDS, GOAT_TYPES, GROUP_TO_FOCUS } from '../data/herd-constants.js';

const todayIso = () => new Date().toISOString().split('T')[0];

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

/** Canlı ağırlıktan tahmini finansal kayıp (piyasa canlı kg fiyatı ile) */
export function estimateLossFromWeight(weightKg) {
  const w = parseFloat(weightKg) || 0;
  return Math.round(w * (marketPrices?.meatLive || 190));
}

/**
 * Sürüye yeni hayvan ekler.
 * @param {Object} input - { id, nickname, type, breed, gender, group, weight, ageMonths, mother, father }
 * @returns {{ success: boolean, message: string, animal?: Object }}
 */
export function addAnimal(input) {
  const id = String(input?.id || '').trim();
  if (!id) return { success: false, message: 'Küpe numarası zorunludur.' };

  const state = getState();
  if (isTagInUse(id, state.animals)) {
    return { success: false, message: `${id} küpe numarası sürüde zaten kayıtlı.` };
  }

  let birthDate = 'Bilinmiyor';
  if (input.ageMonths !== undefined && String(input.ageMonths).trim() !== '') {
    const ageMonths = parseInt(input.ageMonths, 10);
    if (!isNaN(ageMonths) && ageMonths >= 0) {
      const d = new Date();
      d.setMonth(d.getMonth() - ageMonths);
      birthDate = d.toISOString().split('T')[0];
    }
  }

  const gender = input.gender || 'Dişi';
  const breed = input.breed || 'Anadolu Merinosu';
  const defaultType = _isGoatBreed(breed)
    ? (gender === 'Dişi' ? 'Keçi' : 'Teke')
    : (gender === 'Dişi' ? 'Koyun' : 'Koç');
  const group = input.group || 'Besi';
  const weight = parseFloat(input.weight);

  const animal = {
    id,
    nickname: input.nickname ? String(input.nickname).trim() : '',
    rfid: _generateRfid(),
    breed,
    gender,
    type: input.type || defaultType,
    group,
    weight: isNaN(weight) ? 0 : weight,
    bcs: 3,
    status: 'good',
    yieldScore: 85,
    lastVaccine: '-',
    focus: GROUP_TO_FOCUS[group] || 'meat',
    birthDate,
    mother: input.mother || 'Bilinmiyor',
    father: input.father || 'Bilinmiyor'
  };

  setState({ animals: [animal, ...(state.animals || [])], activeAnimalId: animal.id });
  return { success: true, message: `${animal.id} sürüye eklendi.`, animal };
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
  animals[idx] = { ...animals[idx], ...safePatch };
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

  const deathDate = input.deathDate || todayIso();
  const reason = input.reason || 'Diğer / Bilinmeyen';
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
    note: input.note || ''
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

  const update = {
    animals,
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
  if (isTagInUse(babyId, animals)) {
    return { success: false, message: `${babyId} küpe numarası sürüde zaten kayıtlı.` };
  }

  const birthDate = input.birthDate || todayIso();
  const birthWeight = parseFloat(input.birthWeight) || 3.5;
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
    yieldScore: 70,
    lastVaccine: '-',
    focus: 'meat',
    birthDate,
    mother: mother.id,
    father: input.fatherId || null
  };

  animals.unshift(baby);

  // Ananın grubunu Gebe'den Sağmal'a güncelle
  const motherIdx = animals.findIndex(a => a.id === motherId);
  if (motherIdx > -1 && animals[motherIdx].group === 'Gebe') {
    animals[motherIdx] = { ...animals[motherIdx], group: 'Sağmal' };
  }

  // Aktif eşleşme kaydı varsa doğumla kapat
  let breedingRecords = [...(state.breedingRecords || [])];
  const activeBreeding = breedingRecords.find(r =>
    (r.status === 'ACTIVE' || r.status === 'PREGNANT') && r.damIds.includes(motherId)
  );
  if (activeBreeding) {
    breedingRecords = recordBirth(activeBreeding.id, { date: birthDate, type: 'Normal', lambCount: 1 }, breedingRecords);
  }

  setState({ animals, breedingRecords });
  return { success: true, message: `${baby.id} sürüye eklendi.`, baby };
}
