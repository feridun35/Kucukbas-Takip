/**
 * ShepherdAI — Yem Kataloğu (Statik Veri Katmanı)
 * Depoya girilebilecek yem türleri ve varsayılan birim fiyatları.
 */

export const FEED_CATALOG = [
  { id: 'yonca', name: 'Yonca', icon: '🌿', unit: 'kg', defaultPrice: 9.5 },
  { id: 'fi', name: 'Fiğ', icon: '🌱', unit: 'kg', defaultPrice: 8.0 },
  { id: 'bugday', name: 'Buğday', icon: '🌾', unit: 'kg', defaultPrice: 7.8 },
  { id: 'arpa', name: 'Arpa', icon: '🌾', unit: 'kg', defaultPrice: 7.5 },
  { id: 'misir', name: 'Mısır Silajı', icon: '🌽', unit: 'kg', defaultPrice: 3.2 },
  { id: 'saman', name: 'Saman', icon: '🪹', unit: 'kg', defaultPrice: 2.1 },
  { id: 'hazir', name: 'Hazır Yem (Besi)', icon: '📦', unit: 'kg', defaultPrice: 11.0 },
  { id: 'kuzu', name: 'Kuzu Gelişim Yemi', icon: '🐣', unit: 'kg', defaultPrice: 13.5 },
  { id: 'mineral', name: 'Mineral/Vitamin', icon: '💊', unit: 'kg', defaultPrice: 45.0 },
  { id: 'yalama', name: 'Tuz Yalama Taşı', icon: '🪨', unit: 'adet', defaultPrice: 65.0 }
];

/** Yem deposundan çıkış sebepleri */
export const FEED_DEDUCTION_REASONS = ['Sabah Yemlemesi', 'Akşam Yemlemesi', 'Fire / Bozulma', 'Satış / Devir'];
