/**
 * ShepherdAI — Lojik Islah ve Genetik Motoru (Breeding Manager)
 * Eşleşme Uygunluğu, İnbreeding Kontrolü ve Doğum Takvimi Algoritmaları.
 */

import { getAnimalById } from './state.js';

/**
 * 4 Nesil geriye dönük ortak ata (Inbreeding) kontrolü yapar.
 * @param {string} animalIdA - Koyun ID
 * @param {string} animalIdB - Koç ID
 * @returns {Object} { hasRisk, commonAncestors }
 */
export function checkInbreeding(animalIdA, animalIdB) {
  const animalA = getAnimalById(animalIdA);
  const animalB = getAnimalById(animalIdB);

  if (!animalA || !animalB || !animalA.lineage || !animalB.lineage) {
    return { hasRisk: false, commonAncestors: [] };
  }

  // Basit küme (Set) kesişimi mantığı ile ortak ata bulma
  const eweAncestors = new Set(animalA.lineage);
  const common = animalB.lineage.filter(ancestor => eweAncestors.has(ancestor));
  
  return {
    hasRisk: common.length > 0,
    commonAncestors: common
  };
}

/**
 * Verim odağına göre 0-100 arası genetik uyum skoru hesaplar.
 * @param {string} animalIdA - Koyun ID
 * @param {string} animalIdB - Koç ID
 * @param {string} focusMode - 'meat', 'milk', 'breed'
 * @returns {number} 0-100 Arası skor
 */
export function calculateCompatibility(animalIdA, animalIdB, focusMode) {
  const animalA = getAnimalById(animalIdA);
  const animalB = getAnimalById(animalIdB);

  if (!animalA || !animalB || !animalA.genetics || !animalB.genetics) return 50; // default safe mock
  
  const gA = animalA.genetics;
  const gB = animalB.genetics;
  
  // Hedeflenen verime göre ağırlıklandırılmış ortalama (Basit Mock Algoritma)
  let score = 0;
  
  if (focusMode === 'meat') {
    // Et odaklı: Et kapasitesi ve büyüme hızını %70, diğerlerini %30 salla
    const meatAvg = (gA.meat + gB.meat) / 2;
    const growthAvg = (gA.growth + gB.growth) / 2;
    score = (meatAvg * 0.4) + (growthAvg * 0.4) + (((gA.resistance+gB.resistance)/2) * 0.2);
  } else if (focusMode === 'milk') {
    // Süt odaklı: Süt ortalamasını baz al, meme yapısı iyi koç seçildiği varsayımıyla koç süt puanı etkisini %30 yap
    score = (gA.milk * 0.6) + (gB.milk * 0.2) + (((gA.resistance+gB.resistance)/2) * 0.2);
  } else {
    // Döl (Breed) odaklı: Doğurganlık ve Yaşama Gücü (direnç)
    const fertAvg = (gA.fertility + gB.fertility) / 2;
    const resAvg = (gA.resistance + gB.resistance) / 2;
    score = (fertAvg * 0.6) + (resAvg * 0.4);
  }

  // Akrabalık puan kırımını burada uygulamıyoruz, "Inbreeding Check" tamamen ayrı uyaracak
  return Math.min(Math.max(Math.round(score), 0), 100);
}

/**
 * Aşım tarihi üzerinden küçükbaş gebelik süresi (yaklaşık 150 gün) tahmini doğum hesaplar.
 * @param {Date|string} matingDate 
 * @returns {Object} { expectedDate, daysLeft, isCritical }
 */
export function calculateBirthDate(matingDate) {
  const GESTATION_DAYS = 150;
  
  const mating = new Date(matingDate);
  const expectedDate = new Date(mating);
  expectedDate.setDate(expectedDate.getDate() + GESTATION_DAYS);
  
  const now = new Date();
  const diffTime = Math.abs(expectedDate - now);
  const daysLeft = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  
  return {
    expectedDate,
    daysLeft,
    isCritical: daysLeft <= 15 // Son 15 gün
  };
}

/**
 * Sensör verisi (aktivite) baz alınarak Kızgınlık durumunu (Heat Cycle) tespit eder.
 * (Sensör Hazırlığı)
 * @param {Array<number>} activityData - Son 24 saatin aktivite ölçümleri
 * @returns {boolean} Anormal hareketlilik artışı varsa true
 */
export function detectHeatCycle(activityData) {
  if (!activityData || activityData.length < 2) return false;
  
  // Önceki günlerin (ya da ilk verilerin) ortalaması
  const baseline = activityData.slice(0, Math.floor(activityData.length / 2)).reduce((a, b) => a + b, 0) / (activityData.length / 2);
  // Son saatlerin (son verilerin) ortalaması
  const recent = activityData.slice(Math.floor(activityData.length / 2)).reduce((a, b) => a + b, 0) / (activityData.length / 2);
  
  // Eğer son aktivite, taban aktivitesinden %150 daha fazlaysa kızgınlık şüphesi
  return recent > (baseline * 1.5);
}
