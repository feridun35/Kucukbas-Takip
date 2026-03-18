/**
 * ShepherdAI — Bağımsız Sağlık Lojik Motoru (Health Manager)
 * AI Teşhis, Arınma Süresi Hesaplama ve Sensör Anomali Kontrolü.
 */

import { getAnimalById } from './state.js';

/**
 * Belirtilere göre basit bir risk analizi yapar. 
 * KURAL: Kesinlikle veteriner tavsiyesi olmadığı belirtilmelidir.
 * 
 * @param {string} animalId - Hangi hayvan analiz ediliyor
 * @param {string[]} symptoms - Seçilen belirti id'leri (ör: ['lameness', 'mouth_lesion'])
 * @returns {Object} Sonuç objesi { riskLevel, possibleDiseases, disclaimer, recommendation }
 */
export function evaluateSymptoms(animalId, symptoms) {
  const animal = getAnimalById(animalId);
  const disclaimer = "⚠️ BU BİR VETERİNER TAVSİYESİ DEĞİLDİR, SADECE RİSK ANALİZİDİR. Lütfen kesin teşhis için hekiminize danışın.";
  
  if (!symptoms || symptoms.length === 0) {
    return {
      riskLevel: 'low',
      possibleDiseases: ['Sağlıklı Görünüyor'],
      recommendation: 'Gözlemlemeye devam edin.',
      disclaimer
    };
  }

  // Basit Karar Ağacı
  if (symptoms.includes('lameness') && symptoms.includes('mouth_lesion')) {
    return {
      riskLevel: 'danger',
      possibleDiseases: ['Şap Hastalığı (FMD) Şüphesi'],
      recommendation: 'Hayvanı DERHAL karantinaya alın. Sürünün geri kalanından izole edin ve veteriner hekim çağırın.',
      disclaimer
    };
  }
  
  if (symptoms.includes('cough') && symptoms.includes('nasal_discharge')) {
    return {
      riskLevel: 'warning',
      possibleDiseases: ['Pnömoni (Zatürre) Şüphesi', 'Solunum Yolu Enfeksiyonu'],
      recommendation: 'Hayvanın ateşini ölçün. Havadar fakat hava akımı (cereyan) olmayan bir bölmeye alın.',
      disclaimer
    };
  }
  
  if (symptoms.includes('diarrhea') && symptoms.includes('lethargy')) {
    return {
      riskLevel: 'danger',
      possibleDiseases: ['Enterotoksemi (Çelerme)', 'Ağır Parazit Vakası'],
      recommendation: 'Acil sıvı takviyesi (elektrolit) gerekebilir. Veteriner müdahalesi şarttır.',
      disclaimer
    };
  }
  
  if (symptoms.includes('udder_swelling')) {
    return {
      riskLevel: 'warning',
      possibleDiseases: ['Mastitis (Meme İltihabı)'],
      recommendation: 'Etkilenen memeyi sık sık sağın ve soğuk masaj uygulayın. Sağım sırasını en sona bırakın.',
      disclaimer
    };
  }
  
  // Eşleşme yoksa genel uyarı
  return {
    riskLevel: 'warning',
    possibleDiseases: ['Belirlenemeyen Enfeksiyon/Hastalık'],
    recommendation: 'Belirtiler birden fazla hastalığa işaret edebilir. Yakından gözlemleyip ateş ölçümü yapın.',
    disclaimer
  };
}

/**
 * İlaç Arınma Süresi Hesaplar
 * 
 * @param {string} animalId - Hayvan ID
 * @param {number} meatDays - Et arınma süresi (gün)
 * @param {number} milkDays - Süt arınma süresi (gün)
 * @param {Date|string} applicationDate - İlacın uygulandığı tarih
 * @returns {Object} { meatClearDate, milkClearDate, isMeatSafe, isMilkSafe }
 */
export function calculateWithdrawal(animalId, meatDays, milkDays, applicationDate = new Date()) {
  const animal = getAnimalById(animalId);
  const appDate = new Date(applicationDate);
  
  const meatClearDate = new Date(appDate);
  meatClearDate.setDate(meatClearDate.getDate() + meatDays);
  
  const milkClearDate = new Date(appDate);
  milkClearDate.setDate(milkClearDate.getDate() + milkDays);
  
  const now = new Date();
  
  return {
    meatClearDate,
    milkClearDate,
    isMeatSafe: now >= meatClearDate,
    isMilkSafe: now >= milkClearDate,
    daysUntilMeatSafe: Math.ceil((meatClearDate - now) / (1000 * 60 * 60 * 24)),
    daysUntilMilkSafe: Math.ceil((milkClearDate - now) / (1000 * 60 * 60 * 24)),
  };
}

/**
 * Sensör verilerini dinler ve Anomali tespiti yapar (Placeholder).
 * İleride ESP32 veya giyilebilir sensör entegrasyonu için.
 * 
 * @param {number} temp - Vücut ısısı (°C)
 * @param {string} activity - Hareketlilik düzeyi ('low', 'normal', 'high')
 * @returns {Object|null} Eğer anomali varsa uyarı objesi döner.
 */
export function checkVitalAnomalies(temp, activity) {
  if (temp > 40.0) {
    return {
      type: 'EMERGENCY',
      title: 'Yüksek Ateş!',
      msg: `Vücut ısısı kritik seviyede: ${temp.toFixed(1)}°C. Acil müdahale gereklidir.`
    };
  }
  
  if (temp < 37.5) {
    return {
      type: 'WARNING',
      title: 'Hipotermi Riski',
      msg: `Vücut ısısı normalin altında: ${temp.toFixed(1)}°C. Hayvanı ısıtın.`
    };
  }
  
  if (activity === 'low') {
    return {
      type: 'WARNING',
      title: 'Düşük Hareketlilik',
      msg: 'Hayvanda anormal durgunluk tespit edildi, gözlem altına alın.'
    };
  }

  return null;
}
