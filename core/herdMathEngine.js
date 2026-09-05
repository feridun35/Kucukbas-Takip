/**
 * ShepherdAI — Profesyonel Sürü & Matematik Motoru (Herd & Math Engine)
 * Tüm çiftlik verilerini, yem tüketimlerini, karantina/arınma sürelerini,
 * finansal maliyetleri ve verim KPI'larını tam matematiksel bilimsel formüllerle
 * ve ekli hayvanların verilerine bağlı olarak dinamik hesaplar.
 */

import { marketPrices } from '../data/mock-data.js';

/**
 * Tekil bir hayvanın günlük Kuru Madde İhtiyacını (DMI) ve Taze Yem Tüketimini hesaplar.
 * Formül: Küçükbaş rasyon bilimi (NRC / INRA standartları)
 * 
 * @param {Object} animal 
 * @returns {Object} { dmiKg, freshFeedKg }
 */
export function calculateAnimalDailyFeed(animal) {
  if (!animal) return { dmiKg: 0, freshFeedKg: 0 };

  const weight = parseFloat(animal.weight) || (
    animal.type === 'Kuzu' || animal.type === 'Oğlak' ? 25 :
    animal.type === 'Koç' || animal.type === 'Teke' ? 90 : 55
  );

  let dmiRatio = 0.026; // Varsayılan yaşama payı (BW %2.6)

  const isGoat = animal.type === 'Keçi' || animal.type === 'Oğlak' || animal.type === 'Teke';
  const group = animal.group || 'Besi';
  const type = animal.type || 'Koyun';

  if (type === 'Kuzu' || type === 'Oğlak') {
    dmiRatio = 0.038; // Hızlı büyüme (BW %3.8)
  } else if (type === 'Koç' || type === 'Teke') {
    dmiRatio = 0.022; // Damızlık koç (BW %2.2)
  } else if (group === 'Sağmal') {
    dmiRatio = isGoat ? 0.042 : 0.040; // Laktasyon dönemi (BW %4.0 - %4.2)
  } else if (group === 'Gebe') {
    dmiRatio = isGoat ? 0.034 : 0.032; // Gebelik son dönemi (BW %3.2 - %3.4)
  } else if (group === 'Besi') {
    dmiRatio = 0.035; // Besi dönemi (BW %3.5)
  }

  const dmiKg = weight * dmiRatio;
  // Taze yem (As-Fed) rasyon ortalama %88 kuru madde içerir
  const freshFeedKg = dmiKg / 0.88;

  return {
    dmiKg: parseFloat(dmiKg.toFixed(2)),
    freshFeedKg: parseFloat(freshFeedKg.toFixed(2))
  };
}

/**
 * Tüm sürü için toplam günlük yem tüketimi ve maliyet metriklerini hesaplar.
 * 
 * @param {Array} animals 
 * @param {Array} feedInventory 
 * @returns {Object} { dailyFeedKg, dailyFeedCost, feedPerHead, costPerHead, totalFeedKg, stockDaysLeft }
 */
export function calculateHerdFeedMetrics(animals = [], feedInventory = []) {
  if (!animals || animals.length === 0) {
    const totalFeedKg = (feedInventory || [])
      .filter(f => f.unit === 'kg')
      .reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);

    return {
      dailyFeedKg: 0,
      dailyFeedCost: 0,
      feedPerHead: 0,
      costPerHead: 0,
      totalFeedKg,
      stockDaysLeft: 0
    };
  }

  let totalFreshFeedKg = 0;
  animals.forEach(a => {
    const feed = calculateAnimalDailyFeed(a);
    totalFreshFeedKg += feed.freshFeedKg;
  });

  // Rasyon ortalama kg birim maliyeti (arpa/saman/yonca karma ortalaması ~7.50 TL/kg)
  const avgFeedPricePerKg = marketPrices?.feed?.barley || 7.50;
  const dailyFeedCost = totalFreshFeedKg * avgFeedPricePerKg;

  const totalFeedKg = (feedInventory || [])
    .filter(f => f.unit === 'kg')
    .reduce((sum, f) => sum + (parseFloat(f.amount) || 0), 0);

  const stockDaysLeft = totalFreshFeedKg > 0 ? Math.floor(totalFeedKg / totalFreshFeedKg) : 0;
  const feedPerHead = totalFreshFeedKg / animals.length;
  const costPerHead = dailyFeedCost / animals.length;

  return {
    dailyFeedKg: Math.round(totalFreshFeedKg),
    dailyFeedCost: Math.round(dailyFeedCost),
    feedPerHead: parseFloat(feedPerHead.toFixed(2)),
    costPerHead: parseFloat(costPerHead.toFixed(2)),
    totalFeedKg,
    stockDaysLeft
  };
}

/**
 * Türkçe ve standart tarih stringlerini güvenle Date objesine dönüştürür
 */
export function parseDate(dateVal) {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal === 'number') return new Date(dateVal);

  let d = new Date(dateVal);
  if (!isNaN(d.getTime())) return d;

  const trMonths = {
    'Oca': 0, 'Ocak': 0, 'Şub': 1, 'Şubat': 1, 'Mar': 2, 'Mart': 2,
    'Nis': 3, 'Nisan': 3, 'May': 4, 'Mayıs': 4, 'Haz': 5, 'Haziran': 5,
    'Tem': 6, 'Temmuz': 6, 'Ağu': 7, 'Ağustos': 7, 'Eyl': 8, 'Eylül': 8,
    'Eki': 9, 'Ekim': 9, 'Kas': 10, 'Kasım': 10, 'Ara': 11, 'Aralık': 11
  };

  const parts = String(dateVal).trim().split(/[\s.\/-]+/);
  if (parts.length >= 3) {
    const day = parseInt(parts[0]);
    let month = -1;
    const year = parseInt(parts[2]);

    if (!isNaN(parseInt(parts[1]))) {
      month = parseInt(parts[1]) - 1;
    } else if (trMonths[parts[1]] !== undefined) {
      month = trMonths[parts[1]];
    }

    if (!isNaN(day) && month >= 0 && !isNaN(year)) {
      return new Date(year, month, day);
    }
  }

  return new Date();
}

/**
 * Dinamik olarak aktif karantina ve ilaç arınma sürelerini hesaplar.
 * 
 * @param {Array} vaccines 
 * @param {Array} animals 
 * @returns {Object} { activeWithdrawals, lastAppliedMedication, summaryText, hasActiveQuarantine }
 */
export function calculateHerdMedicationStatus(vaccines = [], animals = []) {
  const now = new Date();
  
  // Aşı ve ilaç listesinden aktif arınma sürelerini türet
  const activeWithdrawals = [];
  
  (vaccines || []).forEach(v => {
    if (!v.date) return;
    
    const meatDays = v.meatDays || 0;
    const milkDays = v.milkDays || 0;
    
    if (meatDays > 0 || milkDays > 0) {
      const appDate = parseDate(v.date);
      
      const meatClearDate = new Date(appDate);
      meatClearDate.setDate(meatClearDate.getDate() + meatDays);
      
      const milkClearDate = new Date(appDate);
      milkClearDate.setDate(milkClearDate.getDate() + milkDays);
      
      const meatDaysRemaining = Math.max(0, Math.ceil((meatClearDate - now) / (1000 * 60 * 60 * 24)));
      const milkDaysRemaining = Math.max(0, Math.ceil((milkClearDate - now) / (1000 * 60 * 60 * 24)));
      
      if (meatDaysRemaining > 0 || milkDaysRemaining > 0) {
        activeWithdrawals.push({
          id: v.id,
          drugName: v.name,
          target: v.target || 'Tüm Sürü',
          meatDaysLeft: meatDaysRemaining,
          milkDaysLeft: milkDaysRemaining,
          isMeatSafe: meatDaysRemaining === 0,
          isMilkSafe: milkDaysRemaining === 0
        });
      }
    }
  });

  const lastApplied = (vaccines || []).find(v => v.status === 'done') || null;

  const hasActiveQuarantine = activeWithdrawals.length > 0;
  let summaryText = 'Arınma Süresinde Aktif İlaç Bulunmuyor';

  if (hasActiveQuarantine) {
    summaryText = `${activeWithdrawals.length} İlaç/Tedavi İçin Karantina Devam Ediyor`;
  } else if (lastApplied) {
    summaryText = `Son İlaç/Aşı: ${lastApplied.name} (${lastApplied.date})`;
  }

  return {
    activeWithdrawals,
    lastAppliedMedication: lastApplied,
    summaryText,
    hasActiveQuarantine
  };
}

/**
 * Sürü yapısı ve genel sağlık/sayısal özetlerini hesaplar.
 * 
 * @param {Array} animals 
 * @returns {Object} herdSummary
 */
export function calculateHerdSummaryStats(animals = []) {
  const total = animals.length;
  if (total === 0) {
    return {
      total: 0, sheep: 0, goat: 0, ram: 0, billy: 0, ewe: 0, doe: 0, lamb: 0, kid: 0,
      avgWeight: 0, avgAge: 0
    };
  }

  const sheep = animals.filter(a => ['Koyun', 'Koç', 'Kuzu'].includes(a.type)).length;
  const goat = animals.filter(a => ['Keçi', 'Teke', 'Oğlak'].includes(a.type)).length;
  const ram = animals.filter(a => a.type === 'Koç' || (a.gender === 'Erkek' && a.group === 'Damızlık' && a.breed !== 'Saanen')).length;
  const billy = animals.filter(a => a.type === 'Teke' || (a.gender === 'Erkek' && a.group === 'Damızlık' && a.breed === 'Saanen')).length;
  const ewe = animals.filter(a => a.type === 'Koyun' && a.gender === 'Dişi').length;
  const doe = animals.filter(a => a.type === 'Keçi' && a.gender === 'Dişi').length;
  const lamb = animals.filter(a => a.type === 'Kuzu').length;
  const kid = animals.filter(a => a.type === 'Oğlak').length;

  const validWeights = animals.map(a => parseFloat(a.weight)).filter(w => !isNaN(w) && w > 0);
  const avgWeight = validWeights.length > 0
    ? parseFloat((validWeights.reduce((s, w) => s + w, 0) / validWeights.length).toFixed(1))
    : 0;

  // Ortalama yaş hesabı
  let totalAgeMonths = 0;
  let ageCount = 0;
  const now = new Date();

  animals.forEach(a => {
    if (a.birthDate && a.birthDate !== 'Bilinmiyor') {
      const bDate = new Date(a.birthDate);
      if (!isNaN(bDate.getTime())) {
        const diffMonths = (now.getFullYear() - bDate.getFullYear()) * 12 + (now.getMonth() - bDate.getMonth());
        totalAgeMonths += Math.max(1, diffMonths);
        ageCount++;
      }
    }
  });

  const avgAgeYears = ageCount > 0 ? parseFloat((totalAgeMonths / ageCount / 12).toFixed(1)) : 2.5;

  return {
    total, sheep, goat, ram, billy, ewe, doe, lamb, kid,
    avgWeight, avgAge: avgAgeYears
  };
}

/**
 * Sağlık durumu özetini ekli hayvanlar ve aşılardan hesaplar.
 * 
 * @param {Array} animals 
 * @param {Array} vaccines 
 * @returns {Object} healthSummary
 */
export function calculateHealthSummaryStats(animals = [], vaccines = []) {
  const sick = animals.filter(a => a.status === 'danger').length;
  const quarantine = animals.filter(a => a.status === 'warning').length;
  const expectedBirths = animals.filter(a => a.group === 'Gebe').length;

  const upcomingVaccine = (vaccines || []).find(v => v.status === 'upcoming' || v.status === 'pending');
  const nextVaccination = upcomingVaccine ? upcomingVaccine.date : '-';
  const vaccinationCount = (vaccines || []).filter(v => v.status === 'done').length;

  const validBcs = animals.map(a => parseFloat(a.bcs)).filter(b => !isNaN(b) && b > 0);
  const bodyConditionAvg = validBcs.length > 0
    ? parseFloat((validBcs.reduce((s, b) => s + b, 0) / validBcs.length).toFixed(1))
    : 3.0;

  return {
    sick,
    quarantine,
    expectedBirths,
    nextVaccination,
    vaccinationCount,
    deworming: Math.round(animals.length * 0.1), // %10 periyodik parazit takibi
    bodyConditionAvg,
    lamenessCount: animals.filter(a => a.status === 'warning' && a.group === 'Besi').length
  };
}

/**
 * Tüm state'i ShepherdAI matematik motoruyla senkronize eder ve günceller.
 * 
 * @param {Object} AppState 
 * @returns {Object} updated Summaries
 */
export function syncHerdMathState(AppState) {
  const animals = AppState.animals || [];
  const feedInventory = AppState.feedInventory || [];
  const vaccines = AppState.vaccines || [];

  const herdSummary = calculateHerdSummaryStats(animals);
  const healthSummary = calculateHealthSummaryStats(animals, vaccines);
  const financeMetrics = calculateHerdFeedMetrics(animals, feedInventory);

  const financeSummary = {
    dailyFeedCost: financeMetrics.dailyFeedCost,
    dailyFeedKg: financeMetrics.dailyFeedKg,
    feedStockDays: financeMetrics.stockDaysLeft,
    monthlyRevenue: Math.round(animals.length * 180), // Tahmini aylık verim
    monthlyCost: Math.round(financeMetrics.dailyFeedCost * 30),
    roi: financeMetrics.dailyFeedCost > 0 ? parseFloat(((animals.length * 180 / (financeMetrics.dailyFeedCost * 30)) * 100).toFixed(1)) : 0,
    feedPerHead: financeMetrics.feedPerHead,
    costPerHead: financeMetrics.costPerHead
  };

  AppState.herdSummary = herdSummary;
  AppState.healthSummary = healthSummary;
  AppState.financeSummary = financeSummary;

  return { herdSummary, healthSummary, financeSummary };
}
