/**
 * ShepherdAI — Veteriner İlaç Kütüphanesi (Statik Veri Katmanı)
 * 
 * Küçükbaş hayvancılıkta sık kullanılan ilaçların prospektüs değerlerini içerir.
 * Bu dosya YALNIZCA veri export eder — iş mantığı core/healthManager.js içindedir.
 * 
 * Kullanıcı eklediği özel ilaçlar state.customMedications'da tutulur
 * ve runtime'da bu liste ile merge edilir.
 */

// ── İlaç Kategorileri ──
export const MED_CATEGORIES = [
  { value: 'antibiyotik',       label: 'Antibiyotik' },
  { value: 'nsaid',             label: 'NSAID / Ağrı Kesici' },
  { value: 'vitamin',           label: 'Vitamin / Mineral' },
  { value: 'antiparaziter',     label: 'Antiparaziter' },
  { value: 'antidot',           label: 'Antidot / Antitoksik' },
  { value: 'hormon',            label: 'Hormon' },
  { value: 'antihistaminik',    label: 'Antihistaminik' },
  { value: 'norotrop',          label: 'Nörotrop / Destekleyici' },
  { value: 'diger',             label: 'Diğer' }
];

// ── Uygulama Yolları ──
export const ADMIN_ROUTES = [
  { value: 'im', label: 'İ.M. (Kas İçi)' },
  { value: 'sc', label: 'S.C. (Deri Altı)' },
  { value: 'iv', label: 'İ.V. (Damar İçi)' },
  { value: 'oral', label: 'Oral (Ağızdan)' },
  { value: 'topikal', label: 'Topikal (Haricen)' },
  { value: 'pour-on', label: 'Pour-on (Sırt Döküm)' }
];

// ── Varsayılan İlaç Veritabanı ──
export const DEFAULT_MEDICATIONS = [
  {
    id: 'primamycin-la',
    name: 'Primamycin LA',
    activeIngredient: 'Oksitetrasiklin (Uzun Etkili)',
    category: 'antibiyotik',
    dosagePerKg: 0.1,        // 10 kg başına 1 ml → 0.1 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 28,
    milkWithdrawalDays: 7,
    contraindications: {
      pregnancyRisk: true,
      pregnancyWarning: 'Oksitetrasiklin grubu kemik ve diş gelişimini olumsuz etkiler. Gebeliğin son döneminde kullanmayınız.',
      sideEffects: ['Enjeksiyon bölgesinde geçici şişlik ve ağrı', 'Nadiren alerjik reaksiyon']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 72 },
    openVialShelfLifeDays: 28,
    notes: 'Uzun etkili formülasyon; tek doz yeterlidir. 72 saat sonra 2. doz gerekiyorsa veteriner onayı alınız.'
  },
  {
    id: 'dectomax',
    name: 'Dectomax',
    activeIngredient: 'Doramektin',
    category: 'antiparaziter',
    dosagePerKg: 0.05,       // 50 kg başına 2.5 ml → 0.05 ml/kg (SC)
    unit: 'ml',
    adminRoute: 'sc',
    meatWithdrawalDays: 70,
    milkWithdrawalDays: 0,   // Süt hayvanlarında kullanılmaz
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: ['Enjeksiyon bölgesinde hafif şişlik']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 0 },
    openVialShelfLifeDays: 28,
    notes: 'İç ve dış parazitlere karşı geniş spektrumlu. Süt veren hayvanlarda kullanmayınız.'
  },
  {
    id: 'e-sevit',
    name: 'E-Sevit / Yeldif',
    activeIngredient: 'Vitamin E + Selenyum',
    category: 'vitamin',
    dosagePerKg: 0.04,       // 25 kg başına 1 ml → 0.04 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 0,
    milkWithdrawalDays: 0,
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: ['Aşırı dozda selenyum toksisitesi riski']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 0 },
    openVialShelfLifeDays: 30,
    notes: 'Beyaz kas hastalığı profilaksisi. Doğum öncesi 1 ay uygulanabilir.'
  },
  {
    id: 'ketogezik',
    name: 'Ketogezik',
    activeIngredient: 'Ketoprofen',
    category: 'nsaid',
    dosagePerKg: 0.06,       // ~3 ml / 50 kg → 0.06 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 4,
    milkWithdrawalDays: 0,
    contraindications: {
      pregnancyRisk: true,
      pregnancyWarning: 'NSAID grubu gebeliğin son döneminde doğumu geciktirebilir ve fötusa zarar verebilir.',
      sideEffects: ['Mide / işkembe tahrişi', 'Nadiren böbrek fonksiyon bozukluğu']
    },
    treatmentCourse: { days: 3, repeatIntervalHours: 24 },
    openVialShelfLifeDays: 28,
    notes: '3 gün üst üste uygulanır. Ateş, ağrı ve iltihap durumlarında etkili.'
  },
  {
    id: 'ademin',
    name: 'Ademin',
    activeIngredient: 'Vitamin A + D₃ + E',
    category: 'vitamin',
    dosagePerKg: 0.04,       // 25 kg başına 1 ml → 0.04 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 0,
    milkWithdrawalDays: 0,
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: ['Aşırı dozda hipervitaminoz A riski']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 0 },
    openVialShelfLifeDays: 30,
    notes: 'Genel sağlık desteği, bağışıklık güçlendirme. Mevsim geçişlerinde önerilir.'
  },
  {
    id: 'atropin',
    name: 'Atropin Sülfat',
    activeIngredient: 'Atropin Sülfat',
    category: 'antidot',
    dosagePerKg: 0.02,       // 50 kg başına 1 ml → 0.02 ml/kg
    unit: 'ml',
    adminRoute: 'sc',
    meatWithdrawalDays: 1,
    milkWithdrawalDays: 1,
    contraindications: {
      pregnancyRisk: true,
      pregnancyWarning: 'Atropin plasentayı geçer. Gebelikte sadece hayati tehlike durumunda kullanılmalıdır.',
      sideEffects: ['İşkembe hareketlerinde durma', 'Ağız kuruluğu', 'Göz bebeği genişlemesi', 'Taşikardi']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 0 },
    openVialShelfLifeDays: 14,
    notes: 'Organofosfat zehirlenmesi antidotu. Acil durumlarda kullanılır.'
  },
  {
    id: 'amoxylin-la',
    name: 'Amoxylin LA',
    activeIngredient: 'Amoksisilin (Uzun Etkili)',
    category: 'antibiyotik',
    dosagePerKg: 0.15,       // ~7.5 ml / 50 kg → 0.15 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 25,
    milkWithdrawalDays: 4,
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: ['Enjeksiyon bölgesinde geçici şişlik', 'Nadiren alerjik reaksiyon']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 48 },
    openVialShelfLifeDays: 28,
    notes: 'Geniş spektrumlu antibiyotik. Solunum yolu, ayak, göbek enfeksiyonları. 48 saat sonra tekrar gerekebilir.'
  },
  {
    id: 'spektroral',
    name: 'Spektroral',
    activeIngredient: 'Spektinomisin + Linkolimisin',
    category: 'antibiyotik',
    dosagePerKg: 0.1,        // 10 kg başına 1 ml → 0.1 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 14,
    milkWithdrawalDays: 3,
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: ['Enjeksiyon bölgesinde geçici sertlik']
    },
    treatmentCourse: { days: 3, repeatIntervalHours: 24 },
    openVialShelfLifeDays: 21,
    notes: 'Sindirim ve solunum enfeksiyonlarında. 3 gün üst üste uygulanır.'
  },
  {
    id: 'nervit',
    name: 'Nervit',
    activeIngredient: 'B₁ + B₆ + B₁₂ Kompleksi',
    category: 'vitamin',
    dosagePerKg: 0.04,       // 25 kg başına 1 ml → 0.04 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 0,
    milkWithdrawalDays: 0,
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: []
    },
    treatmentCourse: { days: 3, repeatIntervalHours: 24 },
    openVialShelfLifeDays: 30,
    notes: 'Sinirsel bozukluklar, iştahsızlık, stres durumlarında destek. 3 gün üst üste.'
  },
  {
    id: 'histasol',
    name: 'Histasol',
    activeIngredient: 'Klorfeniramin Maleat',
    category: 'antihistaminik',
    dosagePerKg: 0.02,       // 50 kg başına 1 ml → 0.02 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 5,
    milkWithdrawalDays: 2,
    contraindications: {
      pregnancyRisk: false,
      pregnancyWarning: '',
      sideEffects: ['Uyuşukluk', 'Hafif sedasyon']
    },
    treatmentCourse: { days: 1, repeatIntervalHours: 0 },
    openVialShelfLifeDays: 28,
    notes: 'Alerjik reaksiyonlar, ödem, böcek sokması tedavisinde kullanılır.'
  },
  {
    id: 'biotsin',
    name: 'Biotsin',
    activeIngredient: 'Oksitetrasiklin HCl',
    category: 'antibiyotik',
    dosagePerKg: 0.1,        // 10 kg başına 1 ml → 0.1 ml/kg
    unit: 'ml',
    adminRoute: 'im',
    meatWithdrawalDays: 18,
    milkWithdrawalDays: 5,
    contraindications: {
      pregnancyRisk: true,
      pregnancyWarning: 'Tetrasiklin grubu kemik ve diş gelişimini olumsuz etkiler. Gebelikte kullanmayınız.',
      sideEffects: ['Enjeksiyon bölgesinde ağrı', 'İshal']
    },
    treatmentCourse: { days: 3, repeatIntervalHours: 24 },
    openVialShelfLifeDays: 21,
    notes: 'Kısa etkili tetrasiklin. 3 gün üst üste uygulanır. Geniş spektrumlu.'
  }
];

/**
 * Tüm varsayılan ilaçları döndürür.
 * Runtime'da core/healthManager.js bu listeyi state.customMedications ile birleştirir.
 */
export function getDefaultMedications() {
  return DEFAULT_MEDICATIONS;
}
