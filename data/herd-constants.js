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
