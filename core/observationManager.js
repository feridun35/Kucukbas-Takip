/**
 * ShepherdAI — Belirti Kaydı Motoru (observationManager.js)
 *
 * Hayvanda görülen belirtilerin (burun akıntısı, öksürük, ishal…) tarihli kaydı ve takibi.
 * - Kayıt açıldığında / kapandığında hayvanın klinik durumu (animal.status) belirtilerden yeniden türetilir:
 *   Ağır → Hasta, Orta → Riskli, Hafif → değişmez (Sağlıklı). Yüksek ateş şiddeti yükseltir.
 * - Her kayıt için birkaç gün sonrasına "kontrol" görevi açılır; kayıt kapanınca bekleyen görev kaldırılır.
 * - Kayıttan tedavi uygulanırsa tedavi kaydı belirtiye bağlanır.
 */

import { getState, readState, setState } from './state.js';
import { buildTask } from './workforceManager.js';
import { deriveStatusFromObservations, symptomLabel } from './observationRecords.js';
import { todayIso, addDaysIso, normalizeDateInput, isValidIsoDate } from './dateUtils.js';
import { stripTags } from './sanitize.js';
import { SYMPTOMS, SEVERITIES, TEMPERATURE_LIMITS, OBSERVATION_RULES } from '../data/symptom-catalog.js';

const VALID_CODES = new Set(SYMPTOMS.map(s => s.code));
const VALID_SEVERITIES = new Set(SEVERITIES.map(s => s.value));

/** Hayvan durumlarını belirti kayıtlarına göre günceller (yalnızca verilen hayvanlar) */
function _withDerivedStatus(animals, observations, animalIds) {
  const ids = new Set(animalIds);
  return animals.map(a => ids.has(a.id)
    ? { ...a, status: deriveStatusFromObservations(observations, a.id) }
    : a);
}

/**
 * Yeni belirti kaydı.
 * @param {{ animalId, date?, symptoms: string[], note?, temperature?, severity }} input
 * @returns {{ success: boolean, message: string, observation?: Object, status?: string }}
 */
export function recordObservation(input) {
  const state = getState();
  const animals = state.animals || [];
  const animal = animals.find(a => a.id === input?.animalId);
  if (!animal) return { success: false, message: 'Hayvan bulunamadı.' };

  const symptoms = [...new Set((input.symptoms || []).filter(c => VALID_CODES.has(c)))];
  const note = stripTags(input.note || '');
  if (symptoms.length === 0 && !note) {
    return { success: false, message: 'En az bir belirti seçin ya da not yazın.' };
  }

  const today = todayIso();
  const date = input.date ? normalizeDateInput(input.date) : today;
  if (!date) return { success: false, message: 'Geçerli bir tarih girin.' };
  if (date > today) return { success: false, message: 'Belirti tarihi ileri bir tarih olamaz.' };
  if (isValidIsoDate(animal.birthDate) && date < animal.birthDate) {
    return { success: false, message: 'Belirti tarihi hayvanın doğum tarihinden önce olamaz.' };
  }

  let temperature = null;
  if (input.temperature !== undefined && input.temperature !== null && String(input.temperature).trim() !== '') {
    temperature = Number(String(input.temperature).replace(',', '.'));
    if (!Number.isFinite(temperature) || temperature < TEMPERATURE_LIMITS.min || temperature > TEMPERATURE_LIMITS.max) {
      return { success: false, message: `Vücut ısısı ${TEMPERATURE_LIMITS.min}–${TEMPERATURE_LIMITS.max} °C arasında olmalıdır.` };
    }
    temperature = Math.round(temperature * 10) / 10;
  }

  const severity = VALID_SEVERITIES.has(input.severity) ? input.severity : 'mild';

  const observation = {
    id: `OBS-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    animalId: animal.id,
    date,
    symptoms,
    note,
    temperature,
    severity,
    status: 'open',
    resolvedDate: null,
    treatmentIds: [],
    createdAt: today
  };

  const observations = [observation, ...(state.healthObservations || [])];

  // Birkaç gün sonra kontrol görevi (kayıt kapanınca kaldırılır)
  const summary = symptoms.map(symptomLabel).join(', ') || note;
  const followUp = buildTask({
    title: `Kontrol: ${animal.id} belirtileri`,
    desc: `${date} tarihinde kaydedilen belirtiler: ${summary}. Hayvanı kontrol edin; iyileştiyse belirti kaydını "İyileşti" ile kapatın.`,
    type: 'checkup',
    prio: severity === 'severe' ? 'High' : 'Normal',
    scope: 'individual',
    targetTag: animal.id,
    dueDate: addDaysIso(today, OBSERVATION_RULES.followUpDays),
    observationId: observation.id
  });

  const updatedAnimals = _withDerivedStatus(animals, observations, [animal.id]);
  setState({
    healthObservations: observations,
    animals: updatedAnimals,
    tasks: [followUp, ...(state.tasks || [])]
  });

  const status = updatedAnimals.find(a => a.id === animal.id).status;
  return { success: true, message: 'Belirti kaydedildi.', observation, status };
}

/**
 * Belirti kaydını "İyileşti" olarak kapatır; hayvanın durumu yeniden türetilir,
 * bu kayda ait bekleyen kontrol görevi kaldırılır.
 */
export function resolveObservation(observationId, resolvedDate = null) {
  const state = getState();
  const observations = [...(state.healthObservations || [])];
  const idx = observations.findIndex(o => o.id === observationId);
  if (idx === -1) return { success: false, message: 'Belirti kaydı bulunamadı.' };
  if (observations[idx].status !== 'open') return { success: false, message: 'Bu kayıt zaten kapalı.' };

  const today = todayIso();
  const date = resolvedDate ? normalizeDateInput(resolvedDate) : today;
  if (!date || date > today || date < observations[idx].date) {
    return { success: false, message: 'İyileşme tarihi, belirti tarihi ile bugün arasında olmalıdır.' };
  }

  observations[idx] = { ...observations[idx], status: 'resolved', resolvedDate: date };
  const animalId = observations[idx].animalId;
  const updatedAnimals = _withDerivedStatus(state.animals || [], observations, [animalId]);
  const tasks = (state.tasks || []).filter(t => !(t.observationId === observationId && t.status !== 'completed'));

  setState({ healthObservations: observations, animals: updatedAnimals, tasks });
  const status = updatedAnimals.find(a => a.id === animalId)?.status;
  return { success: true, message: 'Belirti kaydı kapatıldı.', status };
}

/** Tedavi kaydını belirti kaydına bağlar */
export function linkTreatmentToObservation(observationId, treatmentRecordId) {
  const state = getState();
  const observations = (state.healthObservations || []).map(o => o.id === observationId
    ? { ...o, treatmentIds: [...new Set([...(o.treatmentIds || []), treatmentRecordId])] }
    : o);
  setState({ healthObservations: observations });
  return { success: true };
}

/** Hayvanın belirti kayıtları (yeniden eskiye) */
export function getObservationsForAnimal(animalId) {
  return (readState().healthObservations || [])
    .filter(o => o.animalId === animalId)
    .map(o => ({ ...o }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}

/** Sürüdeki açık belirti kayıtları (şiddetliden hafife, yeniden eskiye) */
export function getOpenObservations() {
  const alive = new Set((readState().animals || []).map(a => a.id));
  return (readState().healthObservations || [])
    .filter(o => o.status === 'open' && alive.has(o.animalId))
    .map(o => ({ ...o }))
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
}
