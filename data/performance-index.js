/**
 * ShepherdAI — Damızlık Skoru Kuralları (core/performanceIndex.js kullanır)
 *
 * Skor DNA testi DEĞİLDİR: hayvanın ve yavrularının KAYITLI performansından hesaplanan bir
 * damızlık / verim indeksidir (0–100). Her özellik için iki referans noktası tanımlıdır:
 *   poor → 20 puan, good → 80 puan (aradaki ve dışındaki değerler doğrusal, 0–100 ile sınırlı).
 * Referans değerler Türkiye yerli/kültür ırkları için tipik aralıklardır; işletmenize göre ayarlanabilir.
 */

export const TRAIT_LABELS = {
  growth: 'Büyüme hızı',
  fertility: 'Gebe kalma',
  prolificacy: 'Batında yavru',
  survival: 'Yavru yaşatma',
  progeny: 'Yavruların büyümesi',
  health: 'Hastalık direnci',
  pedigree: 'Ana-baba skoru'
};

/** Özellik değerinin puana çevrilmesi: { poor, good } (poor → 20, good → 80) */
export const TRAIT_ANCHORS = {
  // Doğumdan 12 aylığa kadar günlük canlı ağırlık artışı (kg/gün)
  growth: {
    sheep: { poor: 0.12, good: 0.28 },
    goat: { poor: 0.07, good: 0.17 }
  },
  // Sonucu belli katımlarda gebe kalıp doğurma oranı
  fertility: { poor: 0.60, good: 0.95 },
  // Doğum başına ortalama yavru (ikizlik)
  prolificacy: {
    sheep: { poor: 0.9, good: 1.5 },
    goat: { poor: 1.2, good: 2.0 }
  },
  // Yavruların ilk 90 günü sağ atlatma oranı
  survival: { poor: 0.70, good: 0.95 },
  // Yıllık hastalık olayı (Orta/Ağır belirti + belirti dışı tedavi); az olan iyidir
  health: { poor: 2.0, good: 0.25 }
};

/**
 * Az veriyle aşırı uç skor çıkmaması için her özellik puanı 50'ye doğru çekilir:
 *   skor = (n × puan + k × 50) / (n + k)   — n: kayıt sayısı, k: aşağıdaki değer
 */
export const TRAIT_SHRINK = {
  growth: 1,
  fertility: 2,
  prolificacy: 2,
  survival: 3,
  progeny: 1,
  health: 0.5,
  pedigree: 1
};

/** Verim odağına göre özellik ağırlıkları (eksik özelliklerin ağırlığı diğerlerine dağılır) */
export const FOCUS_WEIGHTS = {
  meat: { growth: 0.35, progeny: 0.15, prolificacy: 0.10, survival: 0.10, fertility: 0.10, health: 0.20, pedigree: 0.15 },
  // Süt verimi kaydı tutulmadığı için süt yönü dolaylı ölçülür: annenin yavru büyütmesi ve yaşatması sütünü yansıtır
  milk: { growth: 0.05, progeny: 0.20, prolificacy: 0.15, survival: 0.20, fertility: 0.20, health: 0.20, pedigree: 0.15 },
  breed: { growth: 0.10, progeny: 0.15, prolificacy: 0.20, survival: 0.15, fertility: 0.20, health: 0.20, pedigree: 0.15 }
};

export const INDEX_RULES = {
  growthMaxAgeDays: 365,      // büyüme yalnızca ilk 12 ayda ölçülür
  growthMinSpanDays: 30,      // iki tartım arası en az 30 gün
  survivalAgeDays: 90,        // yavru 90 günlüğü sağ atlattıysa "yaşadı" sayılır
  healthWindowDays: 365,      // sağlık son 12 ayda değerlendirilir
  healthMinExposureDays: 30,  // sürüde 30 günden az olan hayvanın sağlık puanı hesaplanmaz
  // Güven: sağlık dışı özelliklerdeki toplam kayıt sayısı
  confidence: { medium: 3, high: 8 },
  // Rutin / koruyucu uygulamalar hastalık olayı sayılmaz
  routineTreatmentCategories: ['asi', 'antiparaziter', 'vitamin']
};
