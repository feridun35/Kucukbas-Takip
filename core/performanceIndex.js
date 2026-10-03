/**
 * ShepherdAI — Damızlık Skoru (performanceIndex.js)
 *
 * state.js'e bağımlı OLMAYAN saf hesaplama. Skor DNA testi değildir; hayvanın ve yavrularının
 * KAYITLI performansından üretilen 0–100 arası damızlık / verim indeksidir:
 *
 *   Büyüme hızı          — doğum ağırlığı + tartım geçmişi (ilk 12 ay, kg/gün)
 *   Gebe kalma           — katım kayıtlarının sonucu (anaç: kendi katımları, koç: tek koçlu katımları)
 *   Batında yavru        — doğum başına yavru sayısı (anaç)
 *   Yavru yaşatma        — yavruların ilk 90 günü sağ atlatma oranı (ölüm kayıtları)
 *   Yavruların büyümesi  — yavruların büyüme puanlarının ortalaması
 *   Hastalık direnci     — son 12 aydaki Orta/Ağır belirti ve belirti dışı tedavi sayısı
 *   Ana-baba skoru       — sürüdeki ana ve babanın kendi performans skorları
 *
 * Eksik özelliğin ağırlığı diğerlerine dağılır; hiç verim verisi yoksa skor üretilmez ("Yeterli veri yok").
 * Kurallar ve referans değerler: data/performance-index.js
 */

import { TRAIT_LABELS, TRAIT_ANCHORS, TRAIT_SHRINK, FOCUS_WEIGHTS, INDEX_RULES } from '../data/performance-index.js';
import { GOAT_TYPES, GOAT_BREED_KEYWORDS } from '../data/herd-constants.js';
import { getDamStatus, DAM_STATUS } from './breedingStatus.js';
import { effectiveSeverityRank } from './observationRecords.js';
import { isVaccineRecord } from './healthRecords.js';
import { todayIso, addDaysIso, daysBetweenIso, isValidIsoDate } from './dateUtils.js';

const YOUNG_TYPES = ['Kuzu', 'Oğlak'];
const clamp = (v, min, max) => Math.min(Math.max(v, min), max);
const pct = (v) => `%${Math.round(v * 100)}`;

function _species(animal) {
  return GOAT_TYPES.includes(animal?.type) || GOAT_BREED_KEYWORDS.some(k => (animal?.breed || '').includes(k)) ? 'goat' : 'sheep';
}

/** Değeri referans noktalarına göre puana çevirir: poor → 20, good → 80 */
function _anchorScore(value, { poor, good }) {
  return clamp(20 + (value - poor) * 60 / (good - poor), 0, 100);
}

/** Az kayıtta puanı 50'ye doğru çeker */
function _shrink(score, n, k) {
  return (n * score + k * 50) / (n + k);
}

function _trait(key, rawScore, n, rawText, basis) {
  return { key, label: TRAIT_LABELS[key], score: Math.round(_shrink(rawScore, n, TRAIT_SHRINK[key])), n, rawText, basis };
}

/** Tarihli tartımlar: doğum ağırlığı + tartım geçmişi (aynı gün tek kayıt) */
export function getWeighings(animal) {
  const points = new Map();
  if (isValidIsoDate(animal?.birthDate) && Number(animal.birthWeight) > 0) points.set(animal.birthDate, Number(animal.birthWeight));
  (animal?.weightHistory || []).forEach(w => {
    if (isValidIsoDate(w?.date) && Number(w.weight) > 0) points.set(w.date, Number(w.weight));
  });
  return [...points].map(([date, weight]) => ({ date, weight })).sort((a, b) => a.date.localeCompare(b.date));
}

function _growth(animal, today) {
  if (!isValidIsoDate(animal.birthDate)) return null;
  const pts = getWeighings(animal).filter(p => {
    const age = daysBetweenIso(animal.birthDate, p.date);
    return age >= 0 && age <= INDEX_RULES.growthMaxAgeDays && p.date <= today;
  });
  if (pts.length < 2) return null;
  const first = pts[0];
  const last = pts[pts.length - 1];
  const span = daysBetweenIso(first.date, last.date);
  if (span < INDEX_RULES.growthMinSpanDays) return null;
  const adg = (last.weight - first.weight) / span;
  const anchors = TRAIT_ANCHORS.growth[_species(animal)];
  return { adg, ..._trait('growth', _anchorScore(adg, anchors), pts.length - 1, `${Math.round(adg * 1000)} g/gün`, `${pts.length} tartım, ${span} gün`) };
}

/** Anacın doğumları: tarih → { count, babyIds } */
function _damBirthEvents(damId, breedingRecords, animals) {
  const events = new Map();
  const get = (date) => {
    if (!events.has(date)) events.set(date, { count: 0, babyIds: new Set() });
    return events.get(date);
  };
  breedingRecords.forEach(r => {
    const births = (r.births || []).filter(b => b.damId === damId && isValidIsoDate(b.date));
    births.forEach(b => {
      const e = get(b.date);
      (b.babyIds || []).forEach(id => e.babyIds.add(id));
      e.count = Math.max(e.count, Number(b.lambCount) || 0, e.babyIds.size);
    });
    // Eski format: tek anaçlı kayıt, yalnızca özet doğum bilgisi
    if (!(r.births || []).length && r.birthRecord && isValidIsoDate(r.birthRecord.date) &&
        (r.damIds || []).length === 1 && r.damIds[0] === damId) {
      const e = get(r.birthRecord.date);
      e.count = Math.max(e.count, Number(r.birthRecord.lambCount) || 0);
    }
  });
  animals.filter(a => a.mother === damId && isValidIsoDate(a.birthDate)).forEach(a => {
    const e = get(a.birthDate);
    e.babyIds.add(a.id);
    e.count = Math.max(e.count, e.babyIds.size);
  });
  return events;
}

/** Hayvanın yavruları: id → doğum tarihi */
function _offspring(animal, isFemale, breedingRecords, animals, birthEvents) {
  const result = new Map();
  if (isFemale) {
    birthEvents.forEach((e, date) => e.babyIds.forEach(id => result.set(id, date)));
  } else {
    animals.filter(a => a.father === animal.id && isValidIsoDate(a.birthDate)).forEach(a => result.set(a.id, a.birthDate));
    breedingRecords
      .filter(r => (r.sireIds || []).length === 1 && r.sireIds[0] === animal.id)
      .forEach(r => (r.births || []).forEach(b => (b.babyIds || []).forEach(id => {
        if (!result.has(id) && isValidIsoDate(b.date)) result.set(id, b.date);
      })));
  }
  return result;
}

function _fertility(animal, isFemale, breedingRecords) {
  let ok = 0;
  let fail = 0;
  const count = (rec, damId) => {
    const s = getDamStatus(rec, damId);
    if (s === DAM_STATUS.DELIVERED) ok++;
    else if (s === DAM_STATUS.FAILED) fail++;
  };
  breedingRecords.forEach(r => {
    if (isFemale) {
      if ((r.damIds || []).includes(animal.id)) count(r, animal.id);
    } else if ((r.sireIds || []).length === 1 && r.sireIds[0] === animal.id) {
      (r.damIds || []).forEach(d => count(r, d));
    }
  });
  const n = ok + fail;
  if (n === 0) return null;
  const rate = ok / n;
  return _trait('fertility', _anchorScore(rate, TRAIT_ANCHORS.fertility), n, `${pct(rate)} (${ok}/${n})`, `${n} sonuçlanmış katım`);
}

function _prolificacy(animal, birthEvents) {
  const counts = [...birthEvents.values()].map(e => e.count).filter(c => c > 0);
  if (counts.length === 0) return null;
  const mean = counts.reduce((s, c) => s + c, 0) / counts.length;
  const anchors = TRAIT_ANCHORS.prolificacy[_species(animal)];
  return _trait('prolificacy', _anchorScore(mean, anchors), counts.length, `${mean.toFixed(1)} yavru/doğum`, `${counts.length} doğum`);
}

function _survival(offspring, animalsById, deathById, today) {
  let lived = 0;
  let lost = 0;
  offspring.forEach((birthDate, id) => {
    const deathDate = deathById.get(id);
    if (deathDate) {
      if (daysBetweenIso(birthDate, deathDate) <= INDEX_RULES.survivalAgeDays) lost++;
      else lived++;
    } else if (animalsById.has(id) && daysBetweenIso(birthDate, today) >= INDEX_RULES.survivalAgeDays) {
      lived++;
    }
  });
  const n = lived + lost;
  if (n === 0) return null;
  const rate = lived / n;
  return _trait('survival', _anchorScore(rate, TRAIT_ANCHORS.survival), n, `${pct(rate)} (${lived}/${n})`, `${n} yavru, ilk ${INDEX_RULES.survivalAgeDays} gün`);
}

function _progeny(offspring, growthById) {
  const scored = [...offspring.keys()].map(id => growthById.get(id)).filter(Boolean);
  if (scored.length === 0) return null;
  const mean = scored.reduce((s, g) => s + g.score, 0) / scored.length;
  const adg = scored.reduce((s, g) => s + g.adg, 0) / scored.length;
  return _trait('progeny', mean, scored.length, `ort. ${Math.round(adg * 1000)} g/gün`, `${scored.length} yavru`);
}

function _health(animal, observations, treatments, today) {
  const windowStart = addDaysIso(today, -INDEX_RULES.healthWindowDays);
  const start = [windowStart, animal.addedAt, animal.birthDate].filter(isValidIsoDate).sort().pop();
  const exposure = daysBetweenIso(start, today);
  if (!(exposure >= INDEX_RULES.healthMinExposureDays)) return null;

  const own = observations.filter(o => o.animalId === animal.id);
  const linked = new Set(own.flatMap(o => o.treatmentIds || []));
  const sickObs = own.filter(o => o.date >= start && o.date <= today && effectiveSeverityRank(o) >= 2).length;
  const sickTreatments = treatments.filter(r =>
    r.animalId === animal.id && r.applicationType !== 'batch' && !isVaccineRecord(r) &&
    !INDEX_RULES.routineTreatmentCategories.includes(r.category) &&
    isValidIsoDate(r.applicationDate) && r.applicationDate >= start && r.applicationDate <= today &&
    !linked.has(r.id)).length;

  const events = sickObs + sickTreatments;
  const perYear = events * 365 / exposure;
  const months = Math.max(1, Math.round(exposure / 30.4));
  const text = events === 0 ? `${months} ayda hastalık yok` : `${months} ayda ${events} hastalık`;
  return _trait('health', _anchorScore(perYear, TRAIT_ANCHORS.health), exposure / 365, text, 'Orta/Ağır belirti ve tedaviler');
}

function _weightedScore(traits, focus) {
  const weights = FOCUS_WEIGHTS[focus] || FOCUS_WEIGHTS.meat;
  let sum = 0;
  let wsum = 0;
  traits.forEach(t => {
    const w = weights[t.key] || 0;
    sum += w * t.score;
    wsum += w;
  });
  return wsum > 0 ? Math.round(sum / wsum) : null;
}

const _hasPerformance = (traits) => traits.some(t => t.key !== 'health');

/**
 * Sürüdeki tüm hayvanların damızlık skorları.
 * @param {{ animals, breedingRecords, mortalityRecords, treatmentRecords, healthObservations }} data
 * @param {string} [today]
 * @param {string|null} [focusOverride] — verilirse tüm hayvanlar bu verim odağıyla puanlanır
 * @returns {Map<string, { score: number|null, confidence, focus, traits: Array, hints: string[] }>}
 */
export function computePerformanceIndexes(data, today = todayIso(), focusOverride = null) {
  const animals = data?.animals || [];
  const breedingRecords = data?.breedingRecords || [];
  const observations = data?.healthObservations || [];
  const treatments = data?.treatmentRecords || [];
  const animalsById = new Map(animals.map(a => [a.id, a]));
  const deathById = new Map((data?.mortalityRecords || []).filter(m => isValidIsoDate(m.deathDate)).map(m => [m.animalId, m.deathDate]));

  // 1) Büyüme (yavruların büyümesi için önce herkesinki)
  const growthById = new Map();
  animals.forEach(a => {
    const g = _growth(a, today);
    if (g) growthById.set(a.id, g);
  });

  // 2) Hayvanın kendi performansı
  const own = new Map();
  animals.forEach(a => {
    const isFemale = a.gender === 'Dişi';
    const isMale = a.gender === 'Erkek';
    const birthEvents = isFemale ? _damBirthEvents(a.id, breedingRecords, animals) : new Map();
    const offspring = (isFemale || isMale) ? _offspring(a, isFemale, breedingRecords, animals, birthEvents) : new Map();
    const focus = focusOverride || a.focus || 'meat';

    const traits = [
      growthById.get(a.id),
      (isFemale || isMale) ? _fertility(a, isFemale, breedingRecords) : null,
      isFemale ? _prolificacy(a, birthEvents) : null,
      _survival(offspring, animalsById, deathById, today),
      _progeny(offspring, growthById),
      _health(a, observations, treatments, today)
    ].filter(Boolean).map(({ adg: _adg, ...t }) => t);

    own.set(a.id, { traits, focus, score: _hasPerformance(traits) ? _weightedScore(traits, focus) : null });
  });

  // 3) Ana-baba skoru ve toplam
  const result = new Map();
  animals.forEach(a => {
    const { traits: ownTraits, focus } = own.get(a.id);
    const parents = [['Ana', a.mother], ['Baba', a.father]]
      .map(([label, id]) => ({ label, id, score: id ? own.get(id)?.score : null }))
      .filter(p => p.score !== null && p.score !== undefined);
    const traits = [...ownTraits];
    if (parents.length) {
      const mean = parents.reduce((s, p) => s + p.score, 0) / parents.length;
      traits.push(_trait('pedigree', mean, parents.length, parents.map(p => `${p.label} ${p.score}`).join(' · '), parents.map(p => p.id).join(', ')));
    }

    const evidence = traits.filter(t => t.key !== 'health').reduce((s, t) => s + t.n, 0);
    const score = _hasPerformance(traits) ? _weightedScore(traits, focus) : null;
    const confidence = score === null ? null
      : evidence >= INDEX_RULES.confidence.high ? 'high'
      : evidence >= INDEX_RULES.confidence.medium ? 'medium' : 'low';

    result.set(a.id, { score, confidence, focus, traits, hints: _hints(a, traits, animalsById, today) });
  });
  return result;
}

/** Skoru güçlendirmek için girilebilecek eksik kayıtlar */
function _hints(animal, traits, animalsById, today) {
  const has = (k) => traits.some(t => t.key === k);
  const hints = [];
  if (!has('growth')) {
    if (!isValidIsoDate(animal.birthDate)) hints.push('Doğum tarihi kayıtlı değil; büyüme hızı ölçülemiyor.');
    else if (daysBetweenIso(animal.birthDate, today) <= INDEX_RULES.growthMaxAgeDays) {
      hints.push(`Büyüme için doğum ağırlığı ve en az ${INDEX_RULES.growthMinSpanDays} gün arayla tartım girin.`);
    }
  }
  const isYoung = YOUNG_TYPES.includes(animal.type);
  if (!isYoung && (animal.gender === 'Dişi' || animal.gender === 'Erkek') && !has('fertility')) hints.push('Sonucu belli (doğum / tutmadı) katım kaydı yok.');
  if (!isYoung && animal.gender === 'Dişi' && !has('prolificacy')) hints.push('Doğum kaydı yok.');
  if (!has('pedigree')) {
    const known = [animal.mother, animal.father].filter(id => id && animalsById.has(id));
    if (known.length === 0) hints.push('Ana ve baba sürüde kayıtlı değil.');
  }
  return hints;
}

/**
 * Katım için beklenen yavru skoru: iki ebeveynin skorlarının ortalaması.
 * @returns {{ score: number|null, dam: number|null, sire: number|null }}
 */
export function expectedOffspringScore(data, damId, sireId, focus, today = todayIso()) {
  const indexes = computePerformanceIndexes(data, today, focus);
  const dam = indexes.get(damId)?.score ?? null;
  const sire = indexes.get(sireId)?.score ?? null;
  return { score: dam !== null && sire !== null ? Math.round((dam + sire) / 2) : null, dam, sire };
}

export const CONFIDENCE_LABELS = { low: 'Düşük güven', medium: 'Orta güven', high: 'Yüksek güven' };
