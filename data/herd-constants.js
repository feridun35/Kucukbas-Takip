/**
 * ShepherdAI — Sürü Sabit Veri Sözlükleri
 * Irk listeleri, tür grupları ve ölüm sebepleri. Yalnızca veri export eder.
 */

// ── Irk Seçenekleri (Hayvan Kayıt Formu) ──
export const BREED_OPTIONS = [
  'Anadolu Merinosu',
  'Karacabey Merinosu',
  'Kıvırcık',
  'İvesi (Awassi)',
  'Akkaraman (Kangal)',
  'Morkaraman',
  'Karayaka',
  'Sakız (Chios)',
  'Dağlıç',
  'Pırlak (Ramlıç)',
  'Hemşin',
  'Norduz',
  'Bafra',
  'Romanov',
  'Dorper',
  'Suffolk',
  'Texel',
  'Lacaune',
  'Assaf',
  'Saanen',
  'Kıl Keçisi (Kara Keçi)',
  'Ankara Keçisi (Tiftik)',
  'Halep / Damascus (Şam Keçisi)',
  'Honamlı',
  'Maltız (Maltese)',
  'Alpine',
  'Boer'
];

// ── Keçi ırklarını tanımak için anahtar kelimeler ──
export const GOAT_BREED_KEYWORDS = ['Saanen', 'Kıl Keçisi', 'Ankara Keçisi', 'Halep', 'Honamlı', 'Maltız', 'Alpine', 'Boer'];

// ── Tür Grupları ──
export const GOAT_TYPES = ['Keçi', 'Teke', 'Oğlak'];
export const ANIMAL_TYPES = ['Kuzu', 'Oğlak', 'Koyun', 'Koç', 'Keçi', 'Teke'];
export const ANIMAL_GROUPS = ['Besi', 'Sağmal', 'Gebe', 'Boş', 'Damızlık'];

// ── Grup → Varsayılan Verim Odağı ──
export const GROUP_TO_FOCUS = { 'Sağmal': 'milk', 'Gebe': 'breed', 'Damızlık': 'breed', 'Besi': 'meat', 'Boş': 'meat' };

// ── Ölüm Sebepleri ──
export const DEATH_REASONS = [
  'Enterotoksemi (Çelerme)',
  'Pnömoni (Zatürre / Solunum)',
  'Şap Hastalığı',
  'Mastitis (Meme İltihabı)',
  'Doğum Komplikasyonu',
  'Zehirlenme / Yem Şişmesi',
  'Kaza / Yaralanma / Kırık',
  'Yaşlılık / Ecel',
  'Diğer / Bilinmeyen'
];

// ── Fiziksel Sınırlar (veri girişi doğrulaması) ──
// Küçükbaş için makul alt/üst değerler; bu aralığın dışındaki girişler büyük olasılıkla yazım hatasıdır.
export const ANIMAL_LIMITS = {
  maxAgeMonths: 240,          // 20 yıl
  youngMaxAgeMonths: 24,      // Kuzu / Oğlak en fazla 24 aylık olabilir
  adultMinAgeMonths: 6,       // Koyun / Keçi / Koç / Teke en az 6 aylık olmalı
  weightKg: {                 // [en az, en çok] canlı ağırlık
    'Kuzu':  [1, 80],
    'Oğlak': [1, 70],
    'Koyun': [15, 150],
    'Keçi':  [10, 120],
    'Koç':   [20, 200],
    'Teke':  [15, 150]
  },
  defaultWeightKg: [1, 200],  // Tür bilinmiyorsa
  birthWeightKg: [0.5, 10],
  bcs: [1, 5]
};

// ── Tür → Cinsiyet ──
export const TYPE_GENDER = { 'Koyun': 'Dişi', 'Keçi': 'Dişi', 'Koç': 'Erkek', 'Teke': 'Erkek' };
