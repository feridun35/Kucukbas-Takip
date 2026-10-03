/**
 * ShepherdAI — Akıllı Asistan Bildirimleri (alertsEngine.js)
 *
 * Dashboard bildirimlerini kayıtlı veriden üretir (önceki sürüm demo hesabında sabit metinler gösteriyor,
 * gerçek hesaplarda ise sorun olsa bile her zaman "Her şey yolunda" diyordu).
 * Sıralama: danger → warning → info.
 */

import { readState } from './state.js';
import { getCriticalStocks, getMedicationById, isOpenVialExpired } from './healthManager.js';
import { isTaskOverdue } from './workforceManager.js';
import { getOpenDamMap, DAM_STATUS } from './breedingStatus.js';
import { computeQuarantinedAnimals } from './healthRecords.js';
import { todayIso, daysBetweenIso } from './dateUtils.js';
import { detectOutbreaks, detectNotifiablePatterns, findStaleOpenObservations, symptomLabel } from './observationRecords.js';
import { OBSERVATION_RULES } from '../data/symptom-catalog.js';

const ORDER = { danger: 0, warning: 1, info: 2 };
const FEED_WARNING_DAYS = 7;
const BIRTH_SOON_DAYS = 7;

const listIds = (ids, max = 3) => ids.slice(0, max).join(', ') + (ids.length > max ? ` +${ids.length - max}` : '');

/**
 * @returns {Array<{ id, type: 'danger'|'warning'|'info', icon, title, desc }>}
 */
export function computeAlerts() {
  const state = readState();
  const animals = state.animals || [];
  const alerts = [];
  const today = todayIso();

  // ── Sensör eşikleri (yalnızca bağlı ve gerçek/demo telemetri varken) ──
  const s = state.sensors || {};
  if (s.connected) {
    const checks = [
      { key: 'temperature', label: 'Ağıl sıcaklığı', unit: '°C', icon: '🌡️' },
      { key: 'humidity', label: 'Nem', unit: '%', icon: '💧' },
      { key: 'nh3', label: 'Amonyak (NH₃)', unit: ' ppm', icon: '☣️' }
    ];
    checks.forEach(c => {
      const v = Number(s[c.key]);
      const th = s.thresholds?.[c.key];
      if (!Number.isFinite(v) || !th) return;
      if (v >= th.danger) alerts.push({ id: `sensor-${c.key}`, type: 'danger', icon: c.icon, title: `${c.label} kritik: ${v}${c.unit}`, desc: 'Havalandırmayı açın, hayvanları kontrol edin.' });
      else if (v >= th.warning) alerts.push({ id: `sensor-${c.key}`, type: 'warning', icon: c.icon, title: `${c.label} yüksek: ${v}${c.unit}`, desc: 'Değeri takip edin.' });
    });
  }

  // ── Hasta hayvanlar ──
  const sick = animals.filter(a => a.status === 'danger').map(a => a.id);
  if (sick.length) {
    alerts.push({ id: 'sick', type: 'danger', icon: '🩺', title: `${sick.length} hayvan hasta olarak işaretli`, desc: listIds(sick) });
  }

  // ── İhbarı zorunlu hastalık şüphesi (tek hayvanda bile) ──
  const observations = state.healthObservations || [];
  detectNotifiablePatterns(observations, today).forEach(n => {
    alerts.push({ id: `notifiable-${n.pattern.id}`, type: 'danger', icon: '🚨', title: n.pattern.title, desc: `${listIds(n.animalIds)} — ${n.pattern.desc}` });
  });

  // ── Salgın şüphesi: aynı sistemde birden çok hayvanda belirti ──
  detectOutbreaks(observations, today).forEach(o => {
    alerts.push({
      id: `outbreak-${o.system}`,
      type: 'danger',
      icon: '⚠️',
      title: `Salgın şüphesi (${o.systemLabel}): son ${OBSERVATION_RULES.outbreakWindowDays} günde ${o.animalIds.length} hayvan`,
      desc: `${o.symptoms.map(symptomLabel).join(', ')} — hasta hayvanları ayırın, veteriner hekime danışın.`
    });
  });

  // ── Uzun süredir açık belirtiler ──
  const stale = findStaleOpenObservations(observations, animals.map(a => a.id), today);
  if (stale.length) {
    const ids = [...new Set(stale.map(o => o.animalId))];
    alerts.push({ id: 'stale-observations', type: 'warning', icon: '🤒', title: `${ids.length} hayvanda ${OBSERVATION_RULES.staleOpenDays} günden uzun süredir açık belirti var`, desc: `${listIds(ids)} — kontrol edin; iyileştiyse kaydı kapatın, iyileşmediyse veteriner hekime danışın.` });
  }

  // ── Gecikmiş görevler ──
  const overdue = (state.tasks || []).filter(t => t.status !== 'completed' && isTaskOverdue(t));
  if (overdue.length) {
    alerts.push({ id: 'overdue-tasks', type: 'danger', icon: '⏰', title: `${overdue.length} görevin süresi geçti`, desc: listIds(overdue.map(t => t.title), 2) });
  }

  // ── Doğumu gecikmiş gebelikler ──
  const openDams = [...getOpenDamMap(state.breedingRecords).entries()];
  const lateBirths = openDams
    .filter(([, info]) => info.status === DAM_STATUS.PREGNANT && daysBetweenIso(info.record.milestones.expectedBirthDate, today) > 0)
    .map(([id]) => id);
  if (lateBirths.length) {
    alerts.push({ id: 'late-births', type: 'warning', icon: '🐣', title: `${lateBirths.length} gebe hayvanın tahmini doğum tarihi geçti`, desc: `${listIds(lateBirths)} — doğum kaydını girin ya da durumu kontrol edin.` });
  }

  // ── İlaç stoğu ──
  const critical = getCriticalStocks();
  if (critical.length) {
    alerts.push({ id: 'critical-stock', type: 'warning', icon: '💊', title: `${critical.length} ilaç kritik stok seviyesinde`, desc: listIds(critical.map(c => `${c.medicationName} (${c.remaining} ${c.unit})`), 2) });
  }
  const unusable = (state.pharmacyStock || []).filter(b => b.remainingQuantity > 0 &&
    ((b.expiryDate && b.expiryDate < today) || isOpenVialExpired(b, getMedicationById(b.medicationId), today)));
  if (unusable.length) {
    alerts.push({ id: 'expired-stock', type: 'warning', icon: '🗑️', title: `${unusable.length} ilaç partisinin süresi doldu`, desc: 'Son kullanma tarihi ya da açık şişe raf ömrü geçmiş; Ecza Deposu\'ndan zayi edin.' });
  }

  // ── Yem stoğu ──
  if (animals.length > 0) {
    const days = state.financeSummary?.feedStockDays ?? 0;
    const hasFeed = (state.feedInventory || []).some(f => f.unit === 'kg' && f.amount > 0);
    if (!hasFeed) {
      alerts.push({ id: 'no-feed', type: 'warning', icon: '🌾', title: 'Depoda kayıtlı yem yok', desc: 'Yem girişi yapın; yem maliyeti ve yetme süresi hesaplanamıyor.' });
    } else if (days <= FEED_WARNING_DAYS) {
      alerts.push({ id: 'low-feed', type: 'warning', icon: '🌾', title: `Yem stoğu yaklaşık ${days} gün yetecek`, desc: 'Sipariş planlayın.' });
    }
  }

  // ── Yaklaşan doğumlar ──
  const soonBirths = openDams
    .filter(([, info]) => info.status === DAM_STATUS.PREGNANT)
    .filter(([, info]) => { const d = daysBetweenIso(today, info.record.milestones.expectedBirthDate); return d >= 0 && d <= BIRTH_SOON_DAYS; })
    .map(([id]) => id);
  if (soonBirths.length) {
    alerts.push({ id: 'soon-births', type: 'info', icon: '🐑', title: `${soonBirths.length} hayvanın doğumu ${BIRTH_SOON_DAYS} gün içinde`, desc: `${listIds(soonBirths)} — doğum bölmesini hazırlayın.` });
  }

  // ── Arınma süresindeki hayvanlar ──
  const quarantined = computeQuarantinedAnimals(animals, state.treatmentRecords);
  if (quarantined.length) {
    alerts.push({ id: 'quarantine', type: 'info', icon: '⛔', title: `${quarantined.length} hayvan arınma süresinde`, desc: 'Kesim ve süt satışı yapılamaz.' });
  }

  return alerts.sort((a, b) => ORDER[a.type] - ORDER[b.type]);
}
