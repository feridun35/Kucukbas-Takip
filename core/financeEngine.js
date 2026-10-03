/**
 * ShepherdAI — Lojik Finans Motoru (Finance Engine)
 * ROI Hesaplamaları, Silo Takibi ve Ayıklama (Culling) Karar Algoritmaları.
 *
 * ── Veri İlkesi ──
 * Hesaplar mümkün olduğunca kayıtlı veriden yapılır (ağırlık, doğum tarihi/ağırlığı, depodaki yem fiyatları,
 * tedavi kayıtları). Kaydı tutulmayan kalemler data/finance-assumptions.js'deki varsayımlardan gelir ve
 * sonuçta `assumptions` listesiyle açıkça bildirilir. Rastgele / uydurma değer üretilmez.
 */

import { getAnimalById, getState } from './state.js';
import { calculateAnimalDailyFeed, getAverageFeedPrice, calculateAverageDailyGain } from './herdMathEngine.js';
import { recordTargetsAnimal } from './healthRecords.js';
import { todayIso, daysBetweenIso, isValidIsoDate } from './dateUtils.js';
import { MARKET_PRICES, FINANCE_ASSUMPTIONS } from '../data/finance-assumptions.js';

const round = (n) => Math.round(n);

/**
 * Tek hayvanın tahmini maliyet / değer analizi (saf hesap).
 * @returns {{ netValue, totalCost, profitLoss, feedCost, vetCost, purchaseCost, daysInHerd, assumptions: string[] }}
 */
function _analyzeAnimal(animal, state, feedPrice) {
  const assumptions = [];
  const today = todayIso();
  const weight = parseFloat(animal.weight) || 0;

  // Değer: canlı ağırlık × piyasa fiyatı
  const netValue = weight * MARKET_PRICES.meatLivePerKg;

  // Alış maliyeti: girilmişse o, sürüde doğduysa 0, değilse varsayım
  let purchaseCost;
  if (animal.purchasePrice !== undefined && animal.purchasePrice !== null && animal.purchasePrice !== '') {
    purchaseCost = parseFloat(animal.purchasePrice) || 0;
  } else if (animal.mother) {
    purchaseCost = 0;
  } else {
    purchaseCost = FINANCE_ASSUMPTIONS.purchasePrice;
    assumptions.push(`alış fiyatı girilmemiş (${FINANCE_ASSUMPTIONS.purchasePrice} ₺ varsayıldı)`);
  }

  // Sürüde geçen gün: sürüde doğduysa doğumdan, değilse giriş tarihinden
  const sinceDate = animal.mother && isValidIsoDate(animal.birthDate) ? animal.birthDate : animal.addedAt;
  let daysInHerd = isValidIsoDate(sinceDate) ? Math.max(0, daysBetweenIso(sinceDate, today)) : null;
  if (daysInHerd === null) {
    daysInHerd = FINANCE_ASSUMPTIONS.defaultDaysInHerd;
    assumptions.push(`sürüye giriş tarihi bilinmiyor (${FINANCE_ASSUMPTIONS.defaultDaysInHerd} gün varsayıldı)`);
  }

  // Yem maliyeti: bugünkü ağırlığa göre günlük tüketim × gün × ortalama yem fiyatı
  const feedCost = calculateAnimalDailyFeed(animal).freshFeedKg * daysInHerd * feedPrice;

  // Veteriner maliyeti: kayıtlı tedavi sayısı × birim varsayım
  const treatmentCount = (state.treatmentRecords || []).filter(r => recordTargetsAnimal(r, animal.id)).length;
  const vetCost = treatmentCount * FINANCE_ASSUMPTIONS.vetCostPerTreatment;
  if (treatmentCount > 0) assumptions.push(`tedavi başına ${FINANCE_ASSUMPTIONS.vetCostPerTreatment} ₺`);

  const totalCost = purchaseCost + feedCost + vetCost;
  return {
    netValue,
    totalCost,
    profitLoss: netValue - totalCost,
    feedCost,
    vetCost,
    purchaseCost,
    daysInHerd,
    assumptions
  };
}

/** Değer eğrisi: doğum ağırlığından bugünkü ağırlığa doğrusal (rastgele değil) */
function _valueTrajectory(startValue, endValue, points = 7) {
  return Array.from({ length: points }, (_, i) => startValue + (endValue - startValue) * (i / (points - 1)));
}

/**
 * Tekil bir hayvanın (veya 'HERD' ile tüm sürünün) tahmini ROI'sini hesaplar.
 * @param {string} animalId - Hayvanın Küpe No (Örn: TR-102) veya 'HERD'
 * @returns {Object|null} { netValue, totalCost, profitLoss, roiPercentage, sparklineData, assumptions }
 */
export function calculateAnimalROI(animalId) {
  const state = getState();
  const feedPrice = getAverageFeedPrice(state.feedInventory);
  const feedAssumption = state.financeSummary?.feedPriceIsAssumed !== false
    ? [`depoda fiyatlı yem yok (${MARKET_PRICES.feedPerKg} ₺/kg varsayıldı)`] : [];

  const animals = animalId === 'HERD'
    ? (state.animals || [])
    : [getAnimalById(animalId)].filter(Boolean);
  if (animalId !== 'HERD' && animals.length === 0) return null;

  if (animals.length === 0) {
    return { netValue: 0, totalCost: 0, profitLoss: 0, roiPercentage: '0.00', sparklineData: [0, 0, 0, 0, 0, 0, 0], assumptions: [] };
  }

  let netValue = 0, totalCost = 0, startValue = 0;
  const assumptionSet = new Set(feedAssumption);
  animals.forEach(a => {
    const r = _analyzeAnimal(a, state, feedPrice);
    netValue += r.netValue;
    totalCost += r.totalCost;
    startValue += (parseFloat(a.birthWeight) || 0) * MARKET_PRICES.meatLivePerKg;
    r.assumptions.forEach(x => assumptionSet.add(animalId === 'HERD' ? x.replace(/\s*\(.*\)$/, '') : x));
  });

  const profitLoss = netValue - totalCost;
  return {
    netValue: round(netValue),
    totalCost: round(totalCost),
    profitLoss: round(profitLoss),
    roiPercentage: totalCost > 0 ? ((profitLoss / totalCost) * 100).toFixed(2) : '0.00',
    sparklineData: _valueTrajectory(startValue || netValue * 0.1, netValue),
    assumptions: [...assumptionSet, `değer: canlı ağırlık × ${MARKET_PRICES.meatLivePerKg} ₺/kg`]
  };
}

/**
 * Bir hayvan grubunun baş başına günlük yem maliyeti (ODAK kartı için).
 * @param {(animal) => boolean} filterFn
 */
export function calculateDailyFeedCostPerHead(filterFn = () => true) {
  const state = getState();
  const group = (state.animals || []).filter(filterFn);
  if (group.length === 0) return null;
  const price = getAverageFeedPrice(state.feedInventory);
  const totalKg = group.reduce((s, a) => s + calculateAnimalDailyFeed(a).freshFeedKg, 0);
  return { perHead: (totalKg * price) / group.length, headCount: group.length };
}

/**
 * Silodaki yemin kaç gün yeteceğini ve bitiş tarihini hesaplar.
 * @param {number} totalSiloKg - Silodaki mevcut toplam yem (kg)
 * @param {number} dailyConsumptionKg - Sürünün günlük toplam yem tüketimi (kg)
 * @returns {Object} { daysLeft, depletionDate, isLowStock }
 */
export function calculateSiloDepletion(totalSiloKg, dailyConsumptionKg) {
  if (dailyConsumptionKg <= 0) return { daysLeft: 999, depletionDate: null, isLowStock: false };

  const daysLeft = Math.floor(totalSiloKg / dailyConsumptionKg);
  const depletionDate = new Date();
  depletionDate.setDate(depletionDate.getDate() + daysLeft);

  const isLowStock = daysLeft <= 7; // 7 günden azsa uyarı ver

  return {
    daysLeft,
    depletionDate,
    isLowStock
  };
}

/**
 * Besi verimi düşük hayvanları tespit eder: günlük canlı ağırlık artışının değeri < günlük yem maliyeti.
 * Yalnızca doğum tarihi + doğum ağırlığı + güncel ağırlığı kayıtlı hayvanlar değerlendirilebilir.
 * Damızlık, gebe ve sağmal hayvanlar besi kriterine göre ayıklanmaz.
 *
 * @returns {Array} Ayıklama önerilenler (zarar büyükten küçüğe). Dizi üzerinde `insufficientData` sayısı da bulunur.
 */
export function generateCullingList() {
  const state = getState();
  const animals = state.animals || [];
  const feedPrice = getAverageFeedPrice(state.feedInventory);
  const excludedGroups = ['Damızlık', 'Gebe', 'Sağmal'];

  let insufficientData = 0;
  const analyzed = [];

  animals.filter(a => !excludedGroups.includes(a.group)).forEach(animal => {
    const adg = calculateAverageDailyGain(animal);
    if (adg === null) { insufficientData++; return; }

    const dailyRevenue = adg * MARKET_PRICES.meatLivePerKg;
    const feedCostPerDay = calculateAnimalDailyFeed(animal).freshFeedKg * feedPrice;
    const dailyLoss = feedCostPerDay - dailyRevenue;
    const healthPenalty = animal.status === 'danger' ? 20 : (animal.status === 'warning' ? 10 : 0);
    const treatmentCount = (state.treatmentRecords || []).filter(r => recordTargetsAnimal(r, animal.id)).length;

    analyzed.push({
      ...animal,
      adgGrams: Math.round(adg * 1000),
      dailyRevenue,
      feedCostPerDay,
      dailyLoss,
      treatmentCount,
      cullingScore: dailyLoss + healthPenalty
    });
  });

  const list = analyzed
    .filter(a => a.cullingScore > 0)
    .sort((a, b) => b.cullingScore - a.cullingScore);
  list.insufficientData = insufficientData;
  return list;
}
