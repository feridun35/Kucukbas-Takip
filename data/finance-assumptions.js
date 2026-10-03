/**
 * ShepherdAI — Finansal Varsayımlar ve Piyasa Fiyatları (Statik Veri Katmanı)
 *
 * Uygulamada henüz gerçek kaydı tutulmayan (alış fiyatı, ilaç birim maliyeti, piyasa fiyatı) değerler
 * YALNIZCA burada tanımlıdır. Bu değerlerle yapılan her hesap arayüzde "tahmini/varsayım" olarak etiketlenir.
 * Gerçek veri girildiğinde (örn. hayvana alış fiyatı, depoya yem fiyatı) her zaman gerçek veri kullanılır.
 */

// ── Piyasa Fiyatları (TL) ──
export const MARKET_PRICES = {
  meatLivePerKg: 190,   // Canlı ağırlık kg fiyatı
  feedPerKg: 7.5        // Depoda fiyatlı yem yoksa kullanılan rasyon kg fiyatı
};

// ── Kaydı tutulmayan maliyet kalemleri için varsayımlar ──
export const FINANCE_ASSUMPTIONS = {
  purchasePrice: 2800,        // Sürüde doğmamış ve alış fiyatı girilmemiş hayvanlar için
  vetCostPerTreatment: 150,   // Tedavi kaydı başına ilaç + işçilik
  defaultDaysInHerd: 180      // Doğum/giriş tarihi bilinmeyen hayvanlar için sürüde geçen gün
};
