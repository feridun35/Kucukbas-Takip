/**
 * ShepherdAI — Belirti Kayıtları Saf Hesaplama Katmanı (observationRecords.js)
 *
 * state.js'e bağımlı OLMAYAN saf fonksiyonlar: hayvan durumunun belirtilerden türetilmesi,
 * sürü düzeyinde salgın şüphesi, ihbarı zorunlu belirti birlikteliği ve uzun süre açık kalan belirtiler.
 *
 * Belirti kaydı (state.healthObservations[]):
 *   { id, animalId, date, symptoms: [kod], note, temperature, severity: 'mild'|'moderate'|'severe',
 *     status: 'open'|'resolved', resolvedDate, treatmentIds: [], createdAt }
 */

import { SYMPTOMS, SEVERITIES, TEMPERATURE_LIMITS, OBSERVATION_RULES, NOTIFIABLE_PATTERNS, SYMPTOM_SYSTEMS } from '../data/symptom-catalog.js';
import { daysBetweenIso } from './dateUtils.js';

const RANK = Object.fromEntries(SEVERITIES.map(s => [s.value, s.rank]));
const SYMPTOM_BY_CODE = new Map(SYMPTOMS.map(s => [s.code, s]));

export function symptomLabel(code) {
  return SYMPTOM_BY_CODE.get(code)?.label || code;
}

export function severityLabel(value) {
  return SEVERITIES.find(s => s.value === value)?.label || value;
}

/**
 * Kaydın etkin şiddeti (1–3): seçilen şiddet, vücut ısısı yüksek/düşükse yükseltilir.
 */
export function effectiveSeverityRank(obs) {
  let rank = RANK[obs?.severity] || 1;
  const t = Number(obs?.temperature);
  if (Number.isFinite(t) && t > 0) {
    if (t >= TEMPERATURE_LIMITS.feverSevere) rank = Math.max(rank, 3);
    else if (t >= TEMPERATURE_LIMITS.feverModerate || t < TEMPERATURE_LIMITS.hypothermia) rank = Math.max(rank, 2);
  }
  return rank;
}

/**
 * Açık belirti kayıtlarından hayvanın klinik durumu:
 *   Ağır → 'danger' (Hasta), Orta → 'warning' (Riskli), Hafif / açık kayıt yok → 'good'.
 */
export function deriveStatusFromObservations(observations, animalId) {
  const open = (observations || []).filter(o => o.animalId === animalId && o.status === 'open');
  const rank = open.reduce((m, o) => Math.max(m, effectiveSeverityRank(o)), 0);
  if (rank >= 3) return 'danger';
  if (rank === 2) return 'warning';
  return 'good';
}

function _inWindow(obs, today, days) {
  const d = daysBetweenIso(obs.date, today);
  return Number.isFinite(d) && d >= 0 && d < days;
}

/**
 * Salgın şüphesi: son N gün içinde aynı sistemde (örn. solunum) belirti gösteren farklı hayvan sayısı eşiği aşarsa.
 * Ölen/çıkan hayvanların kayıtları da sayılır (salgın açısından en önemli veriler onlardır).
 * @returns {Array<{ system, systemLabel, animalIds: string[], symptoms: string[] }>}
 */
export function detectOutbreaks(observations, today, rules = OBSERVATION_RULES) {
  const bySystem = new Map();
  (observations || []).filter(o => _inWindow(o, today, rules.outbreakWindowDays)).forEach(o => {
    (o.symptoms || []).forEach(code => {
      const system = SYMPTOM_BY_CODE.get(code)?.system;
      if (!system) return;
      if (!bySystem.has(system)) bySystem.set(system, { animals: new Set(), symptoms: new Set() });
      const entry = bySystem.get(system);
      entry.animals.add(o.animalId);
      entry.symptoms.add(code);
    });
  });

  const result = [];
  bySystem.forEach((entry, system) => {
    if (entry.animals.size >= rules.outbreakMinAnimals) {
      result.push({
        system,
        systemLabel: SYMPTOM_SYSTEMS[system] || system,
        animalIds: [...entry.animals],
        symptoms: [...entry.symptoms]
      });
    }
  });
  return result.sort((a, b) => b.animalIds.length - a.animalIds.length);
}

/**
 * İhbarı zorunlu hastalık şüphesi: bir hayvanda son N gün içindeki kayıtlarında desen belirtilerinin hepsi var.
 * @returns {Array<{ pattern, animalIds: string[] }>}
 */
export function detectNotifiablePatterns(observations, today, rules = OBSERVATION_RULES) {
  const symptomsByAnimal = new Map();
  (observations || []).filter(o => _inWindow(o, today, rules.outbreakWindowDays)).forEach(o => {
    if (!symptomsByAnimal.has(o.animalId)) symptomsByAnimal.set(o.animalId, new Set());
    (o.symptoms || []).forEach(c => symptomsByAnimal.get(o.animalId).add(c));
  });

  return NOTIFIABLE_PATTERNS.map(pattern => ({
    pattern,
    animalIds: [...symptomsByAnimal.entries()]
      .filter(([, set]) => pattern.codes.every(c => set.has(c)))
      .map(([id]) => id)
  })).filter(x => x.animalIds.length > 0);
}

/**
 * Belirli günden uzun süredir açık kalan kayıtlar (yalnızca sürüdeki hayvanlar).
 */
export function findStaleOpenObservations(observations, aliveAnimalIds, today, rules = OBSERVATION_RULES) {
  const alive = new Set(aliveAnimalIds || []);
  return (observations || []).filter(o =>
    o.status === 'open' && alive.has(o.animalId) && daysBetweenIso(o.date, today) > rules.staleOpenDays);
}
