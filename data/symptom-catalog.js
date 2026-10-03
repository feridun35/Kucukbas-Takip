/**
 * ShepherdAI — Belirti Kataloğu (Statik Veri Katmanı)
 * Belirti kaydında seçilebilen belirtiler, sistem grupları ve sınırlar. Yalnızca veri export eder.
 *
 * `system`: Sürü düzeyinde salgın şüphesi aynı sistemdeki belirtilerin birden çok hayvanda
 * görülmesiyle tespit edilir (örn. öksürük + burun akıntısı → solunum).
 */

export const SYMPTOM_SYSTEMS = {
  respiratory: 'Solunum',
  digestive: 'Sindirim',
  locomotor: 'Hareket / Ayak',
  oral: 'Ağız',
  general: 'Genel Durum',
  udder: 'Meme',
  skin: 'Deri / Yapağı',
  eye: 'Göz'
};

export const SYMPTOMS = [
  { code: 'nasal_discharge', label: 'Burun akıntısı (sümük)', icon: '💧', system: 'respiratory' },
  { code: 'cough', label: 'Öksürük', icon: '💨', system: 'respiratory' },
  { code: 'breathing', label: 'Solunum güçlüğü', icon: '😮‍💨', system: 'respiratory' },
  { code: 'diarrhea', label: 'İshal', icon: '💩', system: 'digestive' },
  { code: 'bloat', label: 'Şişkinlik', icon: '🎈', system: 'digestive' },
  { code: 'anorexia', label: 'İştahsızlık', icon: '🚫', system: 'general' },
  { code: 'lethargy', label: 'Durgunluk', icon: '😴', system: 'general' },
  { code: 'lameness', label: 'Topallık', icon: '🦶', system: 'locomotor' },
  { code: 'mouth_lesion', label: 'Ağızda yara / köpük', icon: '👄', system: 'oral' },
  { code: 'eye_discharge', label: 'Göz akıntısı', icon: '👁️', system: 'eye' },
  { code: 'udder_swelling', label: 'Memede şişlik / sertlik', icon: '🥛', system: 'udder' },
  { code: 'itching', label: 'Kaşıntı / yapağı dökülmesi', icon: '🐑', system: 'skin' }
];

export const SEVERITIES = [
  { value: 'mild', label: 'Hafif', rank: 1 },
  { value: 'moderate', label: 'Orta', rank: 2 },
  { value: 'severe', label: 'Ağır', rank: 3 }
];

// Rektal vücut ısısı (°C). Koyun/keçide normal aralık yaklaşık 38.5–40.0.
export const TEMPERATURE_LIMITS = {
  min: 35,              // Bu aralığın dışı büyük olasılıkla ölçüm/yazım hatası
  max: 43,
  feverModerate: 40.0,  // ve üzeri: en az "Orta"
  feverSevere: 41.0,    // ve üzeri: "Ağır"
  hypothermia: 37.5     // altı: en az "Orta"
};

// Takip ve salgın kuralları
export const OBSERVATION_RULES = {
  followUpDays: 3,          // Kayıttan bu kadar gün sonra kontrol görevi
  staleOpenDays: 3,         // Bu kadar günden uzun açık kalan belirti uyarı verir
  outbreakWindowDays: 7,    // Salgın penceresi
  outbreakMinAnimals: 3     // Aynı sistemde belirti gösteren en az hayvan sayısı
};

// İhbarı zorunlu hastalık şüphesi doğuran belirti birlikteliği (aynı hayvanda, tek hayvanda bile uyarı verir).
// Şap (FMD) Türkiye'de ihbarı mecburi hastalıklardandır.
export const NOTIFIABLE_PATTERNS = [
  {
    id: 'fmd',
    codes: ['mouth_lesion', 'lameness'],
    title: 'Şap şüphesi (ihbarı zorunlu)',
    desc: 'Ağızda yara/köpük ile topallık birlikte görüldü. Hayvanı ayırın; veteriner hekime ve İl/İlçe Tarım Müdürlüğüne haber verin.'
  }
];
