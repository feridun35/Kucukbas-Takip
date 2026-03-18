/**
 * ShepherdAI — Lojik Finans Motoru (Finance Engine)
 * ROI Hesaplamaları, Silo Takibi ve Ayıklama (Culling) Karar Algoritmaları.
 */

import { getAnimalById, getState } from './state.js';
import { marketPrices } from '../data/mock-data.js';

/**
 * Tekil bir hayvanın güncel ROI'sini (Yatırım Getirisi) hesaplar.
 * @param {string} animalId - Hayvanın Küpe No (Örn: TR-102)
 * @returns {Object} { netValue, totalCost, profitLoss, roiPercentage, sparklineData }
 */
export function calculateAnimalROI(animalId) {
  if (animalId === 'HERD') {
    const animals = getState().animals || [];
    if (animals.length === 0) return null;

    let totalRevenue = 0;
    let totalCost = 0;
    
    animals.forEach(animal => {
      const totalFeedKg = animal.weight * 6; 
      const purchasePrice = 2800;
      const totalVetCost = 450;
      const feedCost = totalFeedKg * marketPrices.feed.barley;
      
      totalCost += (purchasePrice + feedCost + totalVetCost);
      
      let revenue = animal.weight * marketPrices.meatLive; 
      if (animal.group === 'Sağmal' || animal.group === 'Gebe') {
        revenue += (animal.yieldScore * 2) * marketPrices.milk;
      }
      totalRevenue += revenue;
    });

    const profitLoss = totalRevenue - totalCost;
    const roiPercentage = ((profitLoss / totalCost) * 100).toFixed(2);
    
    const sparklineData = Array.from({length: 7}, (_, i) => {
      return (totalCost * 0.8) + (totalRevenue - (totalCost * 0.8)) * (i / 6) + (Math.random() * 5000 - 2500);
    });

    return {
      netValue: totalRevenue,
      totalCost,
      profitLoss,
      roiPercentage,
      sparklineData
    };
  }

  const animal = getAnimalById(animalId);
  if (!animal) return null;

  // Mock finansal değerler (Gerçekte DB'den gelecek: totalFeedKg, vetCost, vs.)
  const totalFeedKg = animal.weight * 6; // Örnek hesapedilen yem tüketimi
  const purchasePrice = 2800;
  const totalVetCost = 450;
  
  // Maliyet Kalemleri
  const totalFeedCost = totalFeedKg * marketPrices.feed.barley;
  const totalCost = purchasePrice + totalFeedCost + totalVetCost;
  
  // Gelir Kalemleri
  let totalRevenue = animal.weight * marketPrices.meatLive; 

  
  if (animal.group === 'Sağmal' || animal.group === 'Gebe') {
    totalRevenue += (animal.yieldScore * 2) * marketPrices.milk; // Sütten elde edilen mock gelir
  }
  
  const profitLoss = totalRevenue - totalCost;
  const roiPercentage = ((profitLoss / totalCost) * 100).toFixed(2);
  
  // Örnek Sparkline Data (Son 7 aylık değer değişimi simulasyonu)
  const sparklineData = Array.from({length: 7}, (_, i) => {
    return purchasePrice + (totalRevenue - purchasePrice) * (i / 6) + (Math.random() * 500 - 250);
  });

  return {
    netValue: totalRevenue,
    totalCost,
    profitLoss,
    roiPercentage,
    sparklineData
  };
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
 * Verimsiz hayvanları tespit edip Culling (Ayıklama) Listesi oluşturur.
 * Kriter: Yem tüketim maliyeti yüksek ama canlı ağırlık/süt artışı karlı seviyede olmayanlar.
 * @returns {Array} Ayıklama önerilen hayvanların listesi (Risk skoruna göre sıralı)
 */
export function generateCullingList() {
  const herdData = getState().animals;
  if (!herdData || herdData.length === 0) return [];
  
  const analyzedHerd = herdData.map(animal => {
    const dailyGrowthValue = (animal.yieldScore * 0.002) * 190; // mock kazanç
    const dailyMilkValue = animal.group === 'Sağmal' ? (animal.yieldScore * 0.05) * 24 : 0; 
    
    const dailyRevenue = dailyGrowthValue + dailyMilkValue;
    const feedCostPerDay = animal.weight * 0.25; // mock yem tüketim maliyeti
    const dailyLoss = feedCostPerDay - dailyRevenue;
    
    // Sağlık durumu warning/danger ise skoru daha da kötüleştir
    let healthPenalty = animal.status === 'danger' ? 20 : (animal.status === 'warning' ? 10 : 0);
    let cullingScore = dailyLoss + healthPenalty;
    
    return {
      ...animal,
      dailyRevenue,
      dailyLoss,
      cullingScore
    };
  });
  
  // Sadece zarar ettirenleri (cullingScore > 0) filtrele ve en çok zarar ettireni en üste al
  return analyzedHerd
    .filter(a => a.cullingScore > 0)
    .sort((a, b) => b.cullingScore - a.cullingScore);
}
