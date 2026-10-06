/**
 * ShepherdAI — Excel Dışa Aktarma (exportManager.js)
 *
 * Çiftliğin TÜM kayıtlarını tek bir çok sayfalı Excel dosyasına dönüştürür.
 * - Her kayıt türü kendi sayfasında, Türkçe sütun adlarıyla; kodlar okunur etiketlere çevrilir.
 * - Hiçbir alan kaybolmaz: bir sayfanın tanımlı sütunlarında olmayan alanlar "Ek: <alan>" sütunlarına,
 *   tanınmayan kayıt türleri kendi adlarıyla ayrı sayfalara, tekil ayarlar Özet sayfasına yazılır.
 * - Hesaplanan bilgiler (yaş, damızlık skoru, arınma durumu, günlük artış) de eklenir.
 *
 * buildFarmExport saftır (state okumaz); exportFarmWorkbook mevcut çiftliği okuyup dosyayı üretir.
 */

import { readState, getCloudPayload } from './state.js';
import { buildXlsxCompressed } from './xlsxWriter.js';
import { computePerformanceIndexes, getWeighings, CONFIDENCE_LABELS } from './performanceIndex.js';
import { computeWithdrawalStatus, calculateWithdrawalFromLastDose, isVaccineRecord } from './healthRecords.js';
import { symptomLabel, severityLabel } from './observationRecords.js';
import { findingLabel } from './diagnosisEngine.js';
import { getDamStatus, DAM_STATUS } from './breedingStatus.js';
import { daysBetweenIso, isValidIsoDate, todayIso } from './dateUtils.js';
import { TASK_TYPES } from './workforceManager.js';
import { getDefaultMedications, MED_CATEGORIES, ADMIN_ROUTES } from '../data/med-library.js';
import { URGENCY_LEVELS } from '../data/disease-library.js';

const STATUS = { good: 'Sağlıklı', warning: 'Riskli', danger: 'Hasta' };
const FOCUS = { meat: 'Et', milk: 'Süt', breed: 'Döl' };
const PRIO = { High: 'Yüksek', Medium: 'Orta', Normal: 'Normal', Low: 'Düşük' };
const TASK_STATUS = { pending: 'Bekliyor', completed: 'Tamamlandı' };
const TASK_SCOPE = { herd: 'Sürü', individual: 'Bireysel' };
const OBS_STATUS = { open: 'Açık', resolved: 'İyileşti' };
const BREEDING_TYPE = { INDIVIDUAL: 'Bireysel', GROUP: 'Grup' };
const RECORD_STATUS = { ACTIVE: 'Katımda', PREGNANT: 'Gebe', COMPLETED: 'Tamamlandı', FAILED: 'Tutmadı' };
const DAM_LABEL = {
  [DAM_STATUS.ACTIVE]: 'Katımda (doğrulanmadı)',
  [DAM_STATUS.PREGNANT]: 'Gebe (doğrulandı)',
  [DAM_STATUS.DELIVERED]: 'Doğurdu',
  [DAM_STATUS.FAILED]: 'Tutmadı',
  [DAM_STATUS.LOST]: 'Kayıp'
};
const FEED_MOVE = { entry: 'Giriş', deduction: 'Tüketim / Çıkış', ration: 'Rasyon' };
const APPLICATION = { single: 'Tek hayvan', batch: 'Toplu' };
const CONFIDENCE_DX = { high: 'Güçlü', medium: 'Orta', low: 'Zayıf' };
const label = (map, v) => (v === null || v === undefined || v === '' ? '' : map[v] ?? v);
const list = (arr, fn = (x) => x) => (Array.isArray(arr) ? arr.map(fn).filter(x => x !== '' && x !== null && x !== undefined).join(', ') : '');
const pct = (p) => (Number.isFinite(p) ? Math.round(p * 100) : '');

/**
 * Kayıt listesinden sayfa üretir. Tanımlı sütunlar + kayıtlarda bulunan diğer tüm alanlar ("Ek: alan").
 * @param {string} name
 * @param {Array<Object>} records
 * @param {Array<{ header: string, key?: string, value?: Function }>} cols
 * @param {string[]} covered — sütunlarda dolaylı gösterilen alanlar (ek sütun açılmaz)
 * @param {Object<string, string[]>} nested — alt alanları sütunlara bölünmüş nesneler; listede olmayan alt
 *        alanlar "Ek: nesne.alan" sütununa yazılır (ileride eklenecek alanlar da kaybolmaz)
 */
function table(name, records, cols, covered = [], nested = {}) {
  const known = new Set([...cols.map(c => c.key).filter(Boolean), ...covered, ...Object.keys(nested)]);
  const extraKeys = [];
  const extraNested = [];
  (records || []).forEach(r => {
    if (!r || typeof r !== 'object') return;
    Object.keys(r).forEach(k => { if (!known.has(k) && !extraKeys.includes(k)) extraKeys.push(k); });
    Object.entries(nested).forEach(([obj, subKeys]) => {
      const v = r[obj];
      if (v && typeof v === 'object' && !Array.isArray(v)) {
        Object.keys(v).forEach(sk => {
          const path = `${obj}.${sk}`;
          if (!subKeys.includes(sk) && !extraNested.includes(path)) extraNested.push(path);
        });
      }
    });
  });
  const allCols = [
    ...cols,
    ...extraKeys.map(k => ({ header: `Ek: ${k}`, value: (r) => r?.[k] })),
    ...extraNested.map(path => { const [obj, sk] = path.split('.'); return { header: `Ek: ${path}`, value: (r) => r?.[obj]?.[sk] }; })
  ];
  return {
    name,
    columns: allCols.map(c => ({ header: c.header })),
    rows: (records || []).map(r => allCols.map(c => {
      const v = c.value ? c.value(r) : r?.[c.key];
      return v === undefined ? '' : v;
    }))
  };
}

function _ageMonths(birthDate, today) {
  if (!isValidIsoDate(birthDate)) return '';
  return Math.round((daysBetweenIso(birthDate, today) / 30.4) * 10) / 10;
}

function _medicationMap(customMedications) {
  const map = new Map(getDefaultMedications().map(m => [m.id, m]));
  (customMedications || []).forEach(m => map.set(m.id, m));
  return map;
}

/**
 * @param {Object} payload — çiftlik verisi (getCloudPayload biçiminde)
 * @param {{ user?: Object, sensors?: Object, summaries?: Object, today?: string, exportedAt?: string }} meta
 * @returns {{ sheets: Array, counts: Array<{ name, rows }> }}
 */
export function buildFarmExport(payload, meta = {}) {
  const today = meta.today || todayIso();
  const p = payload || {};
  const animals = p.animals || [];
  const treatments = p.treatmentRecords || [];
  const observations = p.healthObservations || [];
  const meds = _medicationMap(p.customMedications);
  const perf = computePerformanceIndexes(p, today);
  const openObsCount = new Map();
  observations.forEach(o => { if (o.status === 'open') openObsCount.set(o.animalId, (openObsCount.get(o.animalId) || 0) + 1); });
  const taskTypeLabel = Object.fromEntries(TASK_TYPES.map(t => [t.value, t.label.replace(/^\S+\s/, '')]));
  const catLabel = Object.fromEntries(MED_CATEGORIES.map(c => [c.value, c.label]));
  const routeLabel = Object.fromEntries(ADMIN_ROUTES.map(r => [r.value, r.label]));

  const sheets = [];

  // ── Sürü ──
  sheets.push(table('Sürü', animals, [
    { header: 'Küpe No', key: 'id' },
    { header: 'Lakap', key: 'nickname' },
    { header: 'RFID', key: 'rfid' },
    { header: 'Irk', key: 'breed' },
    { header: 'Tür', key: 'type' },
    { header: 'Cinsiyet', key: 'gender' },
    { header: 'Grup', key: 'group' },
    { header: 'Doğum Tarihi', key: 'birthDate' },
    { header: 'Yaş (ay)', value: a => _ageMonths(a.birthDate, today) },
    { header: 'Doğum Ağırlığı (kg)', key: 'birthWeight' },
    { header: 'Güncel Ağırlık (kg)', key: 'weight' },
    { header: 'Tartım Sayısı', value: a => getWeighings(a).length },
    { header: 'Vücut Kondisyon Skoru', key: 'bcs' },
    { header: 'Klinik Durum', value: a => label(STATUS, a.status) },
    { header: 'Açık Belirti Kaydı', value: a => openObsCount.get(a.id) || 0 },
    { header: 'Verim Odağı', value: a => label(FOCUS, a.focus) },
    { header: 'Ana', key: 'mother' },
    { header: 'Baba', key: 'father' },
    { header: 'Sürüye Giriş', key: 'addedAt' },
    { header: 'Alış Fiyatı (₺)', key: 'purchasePrice' },
    { header: 'Son Aşı', key: 'lastVaccine' },
    { header: 'Damızlık Skoru', value: a => perf.get(a.id)?.score ?? '' },
    { header: 'Skor Güveni', value: a => label(CONFIDENCE_LABELS, perf.get(a.id)?.confidence) },
    { header: 'Et Arınması (kalan gün)', value: a => computeWithdrawalStatus(treatments, a.id).meatDaysLeft || '' },
    { header: 'Süt Arınması (kalan gün)', value: a => computeWithdrawalStatus(treatments, a.id).milkDaysLeft || '' }
  ], ['status', 'focus', 'weightHistory']));

  // ── Tartımlar ──
  const weighRows = [];
  animals.forEach(a => {
    const history = new Map((a.weightHistory || []).map(w => [w?.date, w]));
    let prev = null;
    getWeighings(a).forEach(w => {
      const source = w.date === a.birthDate && Number(a.birthWeight) === w.weight && !history.has(w.date) ? 'Doğum ağırlığı' : 'Tartım';
      const days = prev ? daysBetweenIso(prev.date, w.date) : null;
      weighRows.push({
        animalId: a.id, date: w.date, weight: w.weight, source,
        change: prev ? Math.round((w.weight - prev.weight) * 10) / 10 : '',
        days: days ?? '',
        gain: prev && days > 0 ? Math.round(((w.weight - prev.weight) / days) * 1000) : '',
        ...(history.get(w.date) || {})
      });
      prev = w;
    });
  });
  sheets.push(table('Tartımlar', weighRows, [
    { header: 'Küpe No', key: 'animalId' },
    { header: 'Tarih', key: 'date' },
    { header: 'Ağırlık (kg)', key: 'weight' },
    { header: 'Kaynak', key: 'source' },
    { header: 'Önceki Tartımdan Fark (kg)', key: 'change' },
    { header: 'Geçen Gün', key: 'days' },
    { header: 'Günlük Artış (g/gün)', key: 'gain' }
  ]));

  // ── Belirtiler ──
  sheets.push(table('Belirtiler', observations, [
    { header: 'Kayıt No', key: 'id' },
    { header: 'Küpe No', key: 'animalId' },
    { header: 'Tarih', key: 'date' },
    { header: 'Belirtiler', value: o => list(o.symptoms, symptomLabel) },
    { header: 'Şiddet', value: o => (o.severity ? severityLabel(o.severity) : '') },
    { header: 'Vücut Isısı (°C)', key: 'temperature' },
    { header: 'Not', key: 'note' },
    { header: 'Durum', value: o => label(OBS_STATUS, o.status) },
    { header: 'İyileşme Tarihi', key: 'resolvedDate' },
    { header: 'Bağlı Tedaviler', value: o => list(o.treatmentIds) },
    { header: 'Son Ön Teşhis', value: o => { const d = (o.diagnoses || []).at(-1); return d?.results?.[0] ? `${d.results[0].name} (%${pct(d.results[0].probability)})` : ''; } },
    { header: 'Ön Teşhis Sayısı', value: o => (o.diagnoses || []).length || '' },
    { header: 'Oluşturulma', key: 'createdAt' }
  ], ['symptoms', 'severity', 'status', 'treatmentIds', 'diagnoses']));

  // ── Ön Teşhisler ──
  const dxRows = [];
  observations.forEach(o => (o.diagnoses || []).forEach(d => dxRows.push({ ...d, observationId: o.id, animalId: o.animalId })));
  sheets.push(table('Ön Teşhisler', dxRows, [
    { header: 'Teşhis No', key: 'id' },
    { header: 'Belirti Kaydı', key: 'observationId' },
    { header: 'Küpe No', key: 'animalId' },
    { header: 'Tarih', key: 'date' },
    { header: 'Vücut Isısı (°C)', key: 'temperature' },
    { header: 'Var Olan Bulgular', value: d => list(d.present, findingLabel) },
    { header: 'Olmayan Bulgular', value: d => list(d.absent, findingLabel) },
    ...[0, 1, 2].flatMap(i => [
      { header: `${i + 1}. Olası Hastalık`, value: d => d.results?.[i]?.name || '' },
      { header: `${i + 1}. Olasılık (%)`, value: d => pct(d.results?.[i]?.probability) }
    ]),
    { header: 'Aciliyet', value: d => URGENCY_LEVELS[d.urgency]?.label || d.urgency || '' },
    { header: 'Güven', value: d => label(CONFIDENCE_DX, d.confidence) }
  ], ['present', 'absent', 'results', 'urgency', 'confidence']));

  // ── Tedavi ve Aşı ──
  sheets.push(table('Tedavi ve Aşı', treatments, [
    { header: 'Kayıt No', key: 'id' },
    { header: 'Tür', value: r => (isVaccineRecord(r) ? 'Aşı' : 'Tedavi') },
    { header: 'Uygulama Tarihi', key: 'applicationDate' },
    { header: 'Uygulama', value: r => label(APPLICATION, r.applicationType) },
    { header: 'Hedef', value: r => r.targetLabel || r.animalId || (r.batchTargets?.length ? `${r.batchTargets.length} hayvan` : '') },
    { header: 'Hedef Küpe No', value: r => r.animalId || list(r.batchTargets) },
    { header: 'İlaç / Aşı', key: 'medicationName' },
    { header: 'Etken Madde', key: 'activeIngredient' },
    { header: 'Kategori', value: r => label(catLabel, r.category || meds.get(r.medicationId)?.category) },
    { header: 'İlaç Kodu', key: 'medicationId' },
    { header: 'Doz (hayvan başı)', value: r => r.appliedDosePerAnimal ?? r.dosage ?? '' },
    { header: 'Birim', key: 'dosageUnit' },
    { header: 'Toplam Miktar', key: 'totalBatchQuantity' },
    { header: 'Kür (gün)', value: r => (r.courseInfo ? `${r.courseInfo.currentDay ?? ''}/${r.courseInfo.totalDays ?? ''}` : '') },
    { header: 'Sonraki Doz', value: r => r.courseInfo?.nextDoseDate || '' },
    { header: 'Et Arınma (gün)', value: r => r.withdrawals?.meatWithdrawalDays ?? '' },
    { header: 'Süt Arınma (gün)', value: r => r.withdrawals?.milkWithdrawalDays ?? '' },
    { header: 'Son Doz Tarihi', value: r => r.withdrawals?.lastDoseDate || '' },
    { header: 'Et Güvenli Tarih', value: r => r.withdrawals?.meatSafeDate || (r.withdrawals ? calculateWithdrawalFromLastDose(r.withdrawals.meatWithdrawalDays, r.withdrawals.milkWithdrawalDays, r.withdrawals.lastDoseDate || r.applicationDate).meatSafeDate : '') },
    { header: 'Süt Güvenli Tarih', value: r => r.withdrawals?.milkSafeDate || (r.withdrawals ? calculateWithdrawalFromLastDose(r.withdrawals.meatWithdrawalDays, r.withdrawals.milkWithdrawalDays, r.withdrawals.lastDoseDate || r.applicationDate).milkSafeDate : '') },
    { header: 'Gebelik Uyarısı Onaylandı', key: 'pregnancyOverride' },
    { header: 'Kaynak Görev', key: 'sourceTaskId' },
    { header: 'Not', key: 'notes' }
  ], ['recordType', 'category', 'applicationType', 'targetLabel', 'animalId', 'batchTargets', 'appliedDosePerAnimal', 'dosage'], {
    courseInfo: ['currentDay', 'totalDays', 'nextDoseDate'],
    withdrawals: ['meatWithdrawalDays', 'milkWithdrawalDays', 'lastDoseDate', 'meatSafeDate', 'milkSafeDate']
  }));

  // ── Katımlar (anaç başına bir satır) ──
  const breeding = p.breedingRecords || [];
  const matingRows = [];
  breeding.forEach(r => {
    const dams = r.damIds?.length ? r.damIds : [null];
    dams.forEach(damId => matingRows.push({ ...r, _damId: damId }));
  });
  sheets.push(table('Katımlar', matingRows, [
    { header: 'Kayıt No', key: 'id' },
    { header: 'Katım Türü', value: r => label(BREEDING_TYPE, r.type) },
    { header: 'Koç / Teke', value: r => list(r.sireIds) },
    { header: 'Anaç', value: r => r._damId || '' },
    { header: 'Anaç Durumu', value: r => (r._damId ? label(DAM_LABEL, getDamStatus(r, r._damId)) : '') },
    { header: 'Kayıt Durumu', value: r => label(RECORD_STATUS, r.status) },
    { header: 'Katım Başlangıcı', key: 'startDate' },
    { header: 'Katım Bitişi', key: 'endDate' },
    { header: 'Kızgınlık Kontrolü', value: r => r.milestones?.cycleCheckDate || '' },
    { header: 'Ultrason', value: r => r.milestones?.ultrasoundDate || '' },
    { header: 'Gebelik Son Dönem', value: r => r.milestones?.lateGestationDate || '' },
    { header: 'Tahmini Doğum', value: r => r.milestones?.expectedBirthDate || '' },
    { header: 'Doğumdan Önceki Grup', value: r => (r._damId ? r.damPrevGroup?.[r._damId] || '' : '') },
    { header: 'Akrabalık Uyarısı', key: 'inbreedingWarning' }
  ], ['_damId', 'type', 'sireIds', 'damIds', 'status', 'damStatus', 'damPrevGroup', 'births', 'birthRecord'], {
    milestones: ['cycleCheckDate', 'ultrasoundDate', 'lateGestationDate', 'expectedBirthDate']
  }));

  // ── Doğumlar ──
  const birthRows = [];
  breeding.forEach(r => {
    if ((r.births || []).length) {
      r.births.forEach(b => birthRows.push({ ...b, recordId: r.id, sires: list(r.sireIds) }));
    } else if (r.birthRecord) {
      birthRows.push({ ...r.birthRecord, recordId: r.id, sires: list(r.sireIds), damId: (r.damIds || []).join(', ') });
    }
  });
  sheets.push(table('Doğumlar', birthRows, [
    { header: 'Katım Kaydı', key: 'recordId' },
    { header: 'Anaç', key: 'damId' },
    { header: 'Doğum Tarihi', key: 'date' },
    { header: 'Doğum Tipi', key: 'type' },
    { header: 'Yavru Sayısı', key: 'lambCount' },
    { header: 'Yavru Küpe No', value: b => list(b.babyIds) },
    { header: 'Koç / Teke', key: 'sires' },
    { header: 'Not', key: 'notes' }
  ], ['babyIds']));

  // ── Ölümler ──
  sheets.push(table('Ölümler', p.mortalityRecords || [], [
    { header: 'Kayıt No', key: 'id' },
    { header: 'Küpe No', key: 'animalId' },
    { header: 'RFID', key: 'rfid' },
    { header: 'Ölüm Tarihi', key: 'deathDate' },
    { header: 'Sebep', key: 'deathReason' },
    { header: 'Irk', key: 'breed' },
    { header: 'Tür', key: 'type' },
    { header: 'Cinsiyet', key: 'gender' },
    { header: 'Grup', key: 'group' },
    { header: 'Son Ağırlık (kg)', key: 'lastWeight' },
    { header: 'Tahmini Kayıp (₺)', key: 'financialLoss' },
    { header: 'Not', key: 'note' }
  ]));

  // ── Yem ──
  sheets.push(table('Yem Deposu', p.feedInventory || [], [
    { header: 'Kod', key: 'id' },
    { header: 'Yem', key: 'name' },
    { header: 'Miktar', key: 'amount' },
    { header: 'Birim', key: 'unit' },
    { header: 'Birim Fiyat (₺)', key: 'unitPrice' },
    { header: 'Toplam Değer (₺)', value: f => (Number.isFinite(f.amount * f.unitPrice) ? Math.round(f.amount * f.unitPrice * 100) / 100 : '') },
    { header: 'Simge', key: 'icon' }
  ]));
  sheets.push(table('Yem Hareketleri', p.feedHistory || [], [
    { header: 'Kayıt No', key: 'id' },
    { header: 'Tarih', key: 'date' },
    { header: 'Hareket', value: h => label(FEED_MOVE, h.type) },
    { header: 'Yem', key: 'feedName' },
    { header: 'Yem Kodu', key: 'feedId' },
    { header: 'Miktar', key: 'amount' },
    { header: 'Birim Fiyat (₺)', key: 'unitPrice' },
    { header: 'Tutar (₺)', value: h => (Number.isFinite(h.amount * h.unitPrice) ? Math.round(h.amount * h.unitPrice * 100) / 100 : '') },
    { header: 'Not', key: 'note' }
  ], ['type']));

  // ── İlaç ──
  sheets.push(table('İlaç Deposu', p.pharmacyStock || [], [
    { header: 'Parti Kaydı', key: 'id' },
    { header: 'İlaç', value: b => meds.get(b.medicationId)?.name || b.medicationId },
    { header: 'İlaç Kodu', key: 'medicationId' },
    { header: 'Kategori', value: b => label(catLabel, meds.get(b.medicationId)?.category) },
    { header: 'Parti No', key: 'batchNo' },
    { header: 'Toplam Miktar', key: 'totalQuantity' },
    { header: 'Kalan Miktar', key: 'remainingQuantity' },
    { header: 'Birim', key: 'unit' },
    { header: 'Kritik Eşik', key: 'criticalThreshold' },
    { header: 'Son Kullanma', key: 'expiryDate' },
    { header: 'Açılış Tarihi', key: 'openedDate' }
  ]));
  sheets.push(table('Özel İlaçlar', p.customMedications || [], [
    { header: 'Kod', key: 'id' },
    { header: 'İlaç', key: 'name' },
    { header: 'Etken Madde', key: 'activeIngredient' },
    { header: 'Kategori', value: m => label(catLabel, m.category) },
    { header: 'Doz (birim/kg)', key: 'dosagePerKg' },
    { header: 'Birim', key: 'unit' },
    { header: 'Uygulama Yolu', value: m => label(routeLabel, m.adminRoute) },
    { header: 'Et Arınma (gün)', key: 'meatWithdrawalDays' },
    { header: 'Süt Arınma (gün)', key: 'milkWithdrawalDays' },
    { header: 'Not', key: 'notes' }
  ], ['category', 'adminRoute']));

  // ── Görevler ──
  const taskRows = [
    ...(p.tasks || []).map(t => ({ ...t, _list: 'Açık görev listesi' })),
    ...(p.taskHistory || []).map(t => ({ ...t, _list: 'Görev geçmişi' }))
  ];
  sheets.push(table('Görevler', taskRows, [
    { header: 'Görev No', key: 'id' },
    { header: 'Liste', key: '_list' },
    { header: 'Başlık', key: 'title' },
    { header: 'Açıklama', key: 'desc' },
    { header: 'Tür', value: t => label(taskTypeLabel, t.type) },
    { header: 'Öncelik', value: t => label(PRIO, t.prio) },
    { header: 'Kapsam', value: t => label(TASK_SCOPE, t.scope) },
    { header: 'Hedef Küpe No', key: 'targetTag' },
    { header: 'Durum', value: t => label(TASK_STATUS, t.status) },
    { header: 'Son Tarih', key: 'dueDate' },
    { header: 'Oluşturulma', key: 'createdAt' },
    { header: 'Tamamlanma', key: 'completedAt' }
  ], ['type', 'prio', 'scope', 'status']));

  // ── Tanınmayan kayıt türleri: kendi sayfalarında, tüm alanlarıyla ──
  const handled = new Set(['animals', 'healthObservations', 'treatmentRecords', 'breedingRecords', 'mortalityRecords',
    'feedInventory', 'feedHistory', 'pharmacyStock', 'customMedications', 'tasks', 'taskHistory']);
  const otherSettings = [];
  Object.entries(p).forEach(([key, value]) => {
    if (handled.has(key)) return;
    if (Array.isArray(value)) {
      if (!value.length) { otherSettings.push([`Kayıt listesi: ${key}`, '0 kayıt']); return; }
      const records = value.map(v => (v && typeof v === 'object' && !Array.isArray(v) ? v : { değer: v }));
      sheets.push(table(key, records, []));
    } else {
      otherSettings.push([key, value]);
    }
  });

  // ── Özet (ilk sayfa) ──
  const user = meta.user || {};
  const s = meta.summaries || {};
  const summaryRows = [
    ['Çiftlik', user.farmName || ''],
    ['Sahip', user.ownerName || ''],
    ['E-posta', user.email || ''],
    ['Hesap', user.isDemo ? 'Demo (yalnızca bu cihaz)' : 'Canlı işletme'],
    ['Dışa aktarma zamanı', meta.exportedAt || today],
    ['', ''],
    ['Toplam hayvan', s.herdSummary?.total ?? animals.length],
    ['Koyun / Koç / Kuzu', s.herdSummary ? `${s.herdSummary.ewe} / ${s.herdSummary.ram} / ${s.herdSummary.lamb}` : ''],
    ['Keçi / Teke / Oğlak', s.herdSummary ? `${s.herdSummary.doe} / ${s.herdSummary.billy} / ${s.herdSummary.kid}` : ''],
    ['Ortalama ağırlık (kg)', s.herdSummary?.avgWeight ?? ''],
    ['Hasta hayvan', s.healthSummary?.sick ?? ''],
    ['Arınma süresindeki hayvan', s.healthSummary?.quarantine ?? ''],
    ['Beklenen doğum', s.healthSummary?.expectedBirths ?? ''],
    ['Ortalama kondisyon skoru', s.healthSummary?.bodyConditionAvg ?? ''],
    ['Günlük yem tüketimi (kg)', s.financeSummary?.dailyFeedKg ?? ''],
    ['Günlük yem maliyeti (₺)', s.financeSummary?.dailyFeedCost ?? ''],
    ['Aylık yem maliyeti (₺)', s.financeSummary?.monthlyCost ?? ''],
    ['Yem stoğu (gün)', s.financeSummary?.feedStockDays ?? ''],
    ['', '']
  ];
  if (meta.sensors?.thresholds) {
    Object.entries(meta.sensors.thresholds).forEach(([k, t]) => {
      summaryRows.push([`Sensör eşiği: ${k}`, `normal ${t.normal} · uyarı ${t.warning} · tehlike ${t.danger}`]);
    });
    summaryRows.push(['', '']);
  }
  otherSettings.forEach(([k, v]) => summaryRows.push([k === 'focusMode' ? 'Sürü verim odağı' : k === 'schemaVersion' ? 'Veri şeması sürümü' : k, k === 'focusMode' ? label(FOCUS, v) : v]));
  summaryRows.push(['', '']);
  summaryRows.push(['SAYFALAR', 'KAYIT SAYISI']);
  sheets.forEach(sh => summaryRows.push([sh.name, sh.rows.length]));

  const summary = { name: 'Özet', columns: [{ header: 'Bilgi', width: 34 }, { header: 'Değer', width: 48 }], rows: summaryRows };
  const all = [summary, ...sheets];
  return { sheets: all, counts: sheets.map(sh => ({ name: sh.name, rows: sh.rows.length })) };
}

function _slug(text) {
  const map = { ç: 'c', Ç: 'C', ğ: 'g', Ğ: 'G', ı: 'i', İ: 'I', ö: 'o', Ö: 'O', ş: 's', Ş: 'S', ü: 'u', Ü: 'U' };
  return String(text || '').replace(/[çÇğĞıİöÖşŞüÜ]/g, ch => map[ch]).replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40) || 'Ciftlik';
}

/**
 * Mevcut çiftliğin tüm kayıtlarını Excel dosyasına dönüştürür.
 * @param {Object} user — oturumdaki kullanıcı (çiftlik adı, sahip, e-posta)
 * @returns {Promise<{ bytes: Uint8Array, fileName: string, counts: Array<{ name, rows }> }>}
 */
export async function exportFarmWorkbook(user) {
  const state = readState();
  const now = new Date();
  const today = todayIso();
  const { sheets, counts } = buildFarmExport(getCloudPayload(), {
    user,
    sensors: state.sensors,
    summaries: { herdSummary: state.herdSummary, healthSummary: state.healthSummary, financeSummary: state.financeSummary },
    today,
    exportedAt: `${today} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  });
  return { bytes: await buildXlsxCompressed(sheets), fileName: `ShepherdAI_${_slug(user?.farmName)}_${today}.xlsx`, counts };
}
