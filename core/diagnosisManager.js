/**
 * ShepherdAI — Teşhis Asistanı Kayıt Katmanı (diagnosisManager.js)
 *
 * Teşhis motoruna (core/diagnosisEngine.js) hayvanın kayıtlarından bağlam hazırlar:
 * yaş, cinsiyet, gebelik / doğum / laktasyon, sürüde benzer belirtiler, aşı ve parazit ilacı geçmişi.
 * Sonucu hayvanın belirti kaydına bağlayarak saklar.
 */

import { readState, setState, getState } from './state.js';
import { getOpenDamMap, DAM_STATUS } from './breedingStatus.js';
import { isVaccineRecord, recordTargetsAnimal } from './healthRecords.js';
import { recordObservation } from './observationManager.js';
import { findingLabel } from './diagnosisEngine.js';
import { todayIso, daysBetweenIso, addDaysIso, isValidIsoDate } from './dateUtils.js';
import { GOAT_TYPES, GOAT_BREED_KEYWORDS } from '../data/herd-constants.js';
import { DIAGNOSIS_RULES } from '../data/disease-library.js';
import { SYMPTOMS } from '../data/symptom-catalog.js';

const SYMPTOM_CODES = new Set(SYMPTOMS.map(s => s.code));
const YOUNG_TYPES = ['Kuzu', 'Oğlak'];
const DEWORM_PATTERN = /parazit|kurt|ivermek|albendaz|doramek|dectomax|klosantel|closantel|levamiz|fenbendaz|moksidek|eprinomek/i;

// Teşhis sayfasının açılacağı hedef (profil / belirti kartından)
let _target = { animalId: null, observationId: null };

export function setDiagnosisTarget(animalId = null, observationId = null) {
  _target = { animalId, observationId };
}

export function getDiagnosisTarget() {
  return { ..._target };
}

function _species(animal) {
  return GOAT_TYPES.includes(animal?.type) || GOAT_BREED_KEYWORDS.some(k => (animal?.breed || '').includes(k)) ? 'goat' : 'sheep';
}

/** Anacın son doğum tarihi (katım kayıtları ya da yavruların doğum tarihi) */
function _lastLambingDate(animalId, state) {
  const dates = [];
  (state.breedingRecords || []).forEach(r => (r.births || []).forEach(b => { if (b.damId === animalId && isValidIsoDate(b.date)) dates.push(b.date); }));
  (state.animals || []).forEach(a => { if (a.mother === animalId && isValidIsoDate(a.birthDate)) dates.push(a.birthDate); });
  return dates.sort().pop() || null;
}

/** Gebelik / doğum / laktasyon durumu: true | false | null (bilinmiyor) */
function _reproStatus(animal, state, today, rules) {
  const female = animal.gender === 'Dişi';
  const ageDays = isValidIsoDate(animal.birthDate) ? daysBetweenIso(animal.birthDate, today) : null;
  const tooYoung = YOUNG_TYPES.includes(animal.type) || (Number.isFinite(ageDays) && ageDays < 180);
  if (!female || tooYoung) {
    return { pregnant: false, latePregnancy: false, periparturient: false, lactating: false, notes: [] };
  }

  const notes = [];
  const open = getOpenDamMap(state.breedingRecords).get(animal.id);
  let pregnant = null;
  let latePregnancy = null;
  if (open?.status === DAM_STATUS.PREGNANT) {
    pregnant = true;
    const expected = open.record?.milestones?.expectedBirthDate;
    if (isValidIsoDate(expected)) {
      const days = daysBetweenIso(today, expected);
      latePregnancy = days <= rules.latePregnancyDays && days >= -14;
      notes.push(days >= 0 ? `Gebe — tahmini doğuma ${days} gün` : `Gebe — tahmini doğum ${-days} gün geçti`);
    } else {
      notes.push('Gebe (doğrulanmış)');
    }
  } else if (open?.status === DAM_STATUS.ACTIVE) {
    notes.push('Koç katımında (gebelik doğrulanmadı)');
  } else if (animal.group === 'Gebe') {
    pregnant = true;
    notes.push('Gebe grubunda (doğum tarihi bilinmiyor)');
  }

  const lambed = _lastLambingDate(animal.id, state);
  const lambedDays = lambed ? daysBetweenIso(lambed, today) : null;
  if (Number.isFinite(lambedDays) && lambedDays >= 0 && lambedDays <= 365) notes.push(`${lambedDays} gün önce doğurdu`);

  const recentlyLambed = Number.isFinite(lambedDays) && lambedDays >= 0 && lambedDays <= rules.periparturientDays;
  const periparturient = latePregnancy === true || recentlyLambed ? true
    : (latePregnancy === false && !recentlyLambed ? false : null);
  const lactating = (Number.isFinite(lambedDays) && lambedDays >= 0 && lambedDays <= rules.lactationDays) || animal.group === 'Sağmal' ? true : null;

  return { pregnant, latePregnancy, periparturient, lactating, notes };
}

/**
 * Teşhis motoru için hayvanın bağlamı.
 * @returns {{ context: Object, facts: Array<{ icon, text }>, prefill: { answers, temperature } } | null}
 */
export function buildDiagnosisContext(animalId, today = todayIso(), rules = DIAGNOSIS_RULES) {
  const state = readState();
  const animal = (state.animals || []).find(a => a.id === animalId);
  const month = Number(today.slice(5, 7));
  if (!animal) {
    return { context: { month }, facts: [], prefill: { answers: {}, temperature: null } };
  }

  const facts = [];
  const species = _species(animal);
  const ageDays = isValidIsoDate(animal.birthDate) ? daysBetweenIso(animal.birthDate, today) : null;
  const ageBounds = Number.isFinite(ageDays) ? null : (YOUNG_TYPES.includes(animal.type) ? [0, 365] : [240, 100000]);
  const sex = animal.gender === 'Dişi' ? 'female' : animal.gender === 'Erkek' ? 'male' : null;
  facts.push({ icon: species === 'goat' ? '🐐' : '🐑', text: `${animal.type || ''} ${animal.breed ? `(${animal.breed})` : ''} · ${animal.gender || 'cinsiyet bilinmiyor'} · ${Number.isFinite(ageDays) ? (ageDays < 60 ? `${ageDays} günlük` : ageDays < 730 ? `${Math.round(ageDays / 30.4)} aylık` : `${Math.floor(ageDays / 365)} yaşında`) : 'yaş bilinmiyor'}` });

  const repro = _reproStatus(animal, state, today, rules);
  repro.notes.forEach(n => facts.push({ icon: '🍼', text: n }));

  // Sürüde son günlerdeki benzer belirtiler (ölenler dahil)
  const since = addDaysIso(today, -rules.herdWindowDays);
  const byAnimal = new Map();
  (state.healthObservations || []).forEach(o => {
    if (o.animalId === animal.id || !isValidIsoDate(o.date) || o.date < since || o.date > today) return;
    if (!byAnimal.has(o.animalId)) byAnimal.set(o.animalId, new Set());
    (o.symptoms || []).forEach(c => byAnimal.get(o.animalId).add(c));
  });
  const herdCases = [...byAnimal].map(([id, codes]) => ({ animalId: id, codes: [...codes] })).filter(c => c.codes.length);
  if (herdCases.length) facts.push({ icon: '👥', text: `Sürüde son ${rules.herdWindowDays} günde belirti kaydı olan ${herdCases.length} hayvan daha var` });

  const deathSince = addDaysIso(today, -rules.herdDeathWindowDays);
  const deaths = (state.mortalityRecords || []).filter(m => isValidIsoDate(m.deathDate) && m.deathDate >= deathSince && m.deathDate <= today);
  if (deaths.length) facts.push({ icon: '⚫', text: `Son ${rules.herdDeathWindowDays} günde ${deaths.length} ölüm kaydı (${deaths.slice(0, 3).map(m => `${m.animalId}: ${m.deathReason}`).join('; ')})` });

  // Aşılar ve parazit ilacı
  const records = (state.treatmentRecords || []).filter(r => recordTargetsAnimal(r, animal.id) && isValidIsoDate(r.applicationDate) && r.applicationDate <= today);
  const vaccines = records.filter(isVaccineRecord)
    .map(r => ({ name: r.medicationName || 'Aşı', date: r.applicationDate, daysAgo: daysBetweenIso(r.applicationDate, today) }))
    .filter(v => v.daysAgo <= rules.vaccineValidDays)
    .sort((a, b) => a.daysAgo - b.daysAgo);
  facts.push({ icon: '💉', text: vaccines.length ? `Son 12 ayda aşılar: ${vaccines.slice(0, 4).map(v => `${v.name} (${v.date})`).join(', ')}` : 'Son 12 ayda kayıtlı aşı yok' });

  const deworms = records.filter(r => !isVaccineRecord(r) && (r.category === 'antiparaziter' || DEWORM_PATTERN.test(`${r.medicationName || ''} ${r.activeIngredient || ''}`)))
    .map(r => daysBetweenIso(r.applicationDate, today));
  const dewormDaysAgo = deworms.length ? Math.min(...deworms) : null;
  facts.push({ icon: '🪱', text: Number.isFinite(dewormDaysAgo) ? `Son parazit ilacı ${dewormDaysAgo} gün önce` : 'Kayıtlı parazit ilacı yok' });

  const recentTreatments = records.filter(r => !isVaccineRecord(r) && daysBetweenIso(r.applicationDate, today) <= 30);
  if (recentTreatments.length) facts.push({ icon: '💊', text: `Son 30 günde tedavi: ${recentTreatments.slice(0, 3).map(r => `${r.medicationName} (${r.applicationDate})`).join(', ')}` });

  // Kayıtlardan türetilen cevaplar (kullanıcı değiştirebilir)
  const derived = {};
  const newcomers = (state.animals || []).filter(a => a.id !== animal.id && isValidIsoDate(a.addedAt) && daysBetweenIso(a.addedAt, today) <= rules.newAnimalWindowDays);
  if (newcomers.length) derived.new_animals = { value: true, source: `Son ${rules.newAnimalWindowDays} günde sürüye ${newcomers.length} hayvan eklendi` };

  // Açık belirti kayıtlarından ön doldurma
  const openObs = (state.healthObservations || [])
    .filter(o => o.animalId === animal.id && o.status === 'open')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const answers = {};
  openObs.forEach(o => (o.symptoms || []).forEach(c => { answers[c] = true; }));
  const temperature = openObs.find(o => Number.isFinite(Number(o.temperature)) && o.temperature !== null)?.temperature ?? null;

  return {
    animal: { id: animal.id, type: animal.type, gender: animal.gender },
    context: {
      species, sex, ageDays, ageBounds, month,
      repro: { pregnant: repro.pregnant, latePregnancy: repro.latePregnancy, periparturient: repro.periparturient, lactating: repro.lactating },
      herdCases, vaccines, dewormDaysAgo, derived
    },
    facts,
    prefill: { answers, temperature },
    openObservations: openObs.map(o => o.id)
  };
}

/**
 * Teşhis sonucunu hayvanın belirti kaydına bağlar. Açık belirti kaydı yoksa bulgulardan yeni kayıt açılır
 * (hayvanın durumu belirtilere göre yeniden hesaplanır).
 * @param {string} animalId
 * @param {{ answers: Object, temperature, result: Object, observationId?: string }} payload
 */
export function saveDiagnosis(animalId, payload) {
  const state = getState();
  if (!(state.animals || []).some(a => a.id === animalId)) return { success: false, message: 'Hayvan bulunamadı.' };
  const result = payload?.result;
  if (!result?.results?.length) return { success: false, message: 'Kaydedilecek bir değerlendirme yok.' };

  const answers = payload.answers || {};
  const present = Object.keys(answers).filter(c => answers[c] === true);
  const absent = Object.keys(answers).filter(c => answers[c] === false);
  const temperature = payload.temperature === '' || payload.temperature === undefined ? null : payload.temperature;
  const today = todayIso();

  const record = {
    id: `DX-${Date.now()}`,
    date: today,
    temperature: temperature === null ? null : Number(String(temperature).replace(',', '.')),
    present,
    absent,
    results: result.results.slice(0, 3).map(r => ({ id: r.id, name: r.name, probability: Math.round(r.probability * 100) / 100 })),
    urgency: result.urgency,
    confidence: result.confidence
  };

  const open = (state.healthObservations || [])
    .filter(o => o.animalId === animalId && o.status === 'open')
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  let observationId = payload.observationId && open.some(o => o.id === payload.observationId) ? payload.observationId : open[0]?.id;
  let created = false;

  if (!observationId) {
    const severity = result.urgency === 'emergency' ? 'severe' : result.urgency === 'urgent' ? 'moderate' : 'mild';
    const res = recordObservation({
      animalId,
      date: today,
      symptoms: present.filter(c => SYMPTOM_CODES.has(c)),
      note: `Teşhis asistanı bulguları: ${present.map(findingLabel).join(', ') || '—'}`,
      temperature,
      severity
    });
    if (!res.success) return res;
    observationId = res.observation.id;
    created = true;
  }

  const observations = (getState().healthObservations || []).map(o => o.id === observationId
    ? { ...o, diagnoses: [...(o.diagnoses || []), record] }
    : o);
  setState({ healthObservations: observations });
  return {
    success: true,
    created,
    observationId,
    record,
    message: created ? 'Değerlendirme yeni belirti kaydıyla birlikte kaydedildi.' : 'Değerlendirme açık belirti kaydına eklendi.'
  };
}

/** Belirti kaydının son teşhisi (yoksa null) */
export function latestDiagnosis(observation) {
  const list = observation?.diagnoses || [];
  return list.length ? list[list.length - 1] : null;
}
