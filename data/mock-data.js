/**
 * ShepherdAI — Demo Çiftliği Tohum Verisi
 * YALNIZCA demo hesabının ilk açılışında (core/state.js → getInitialDemoState) kullanılır.
 * Gerçek hesaplarda hiçbir modül bu dosyadan veri okumaz.
 */

// ── Sürü Verileri ──
export const mockHerdData = {
  total: 247,
  sheep: 182,
  goat: 65,
  ram: 14,        // Koç
  billy: 5,       // Teke
  ewe: 128,       // Koyun (dişi)
  doe: 42,        // Keçi (dişi)
  lamb: 40,       // Kuzu
  kid: 18,        // Oğlak
  avgWeight: 62,  // kg ortalama ağırlık
  avgAge: 3.2,    // yıl
};

// ── Sağlık Verileri ──
export const mockHealthData = {
  sick: 3,
  quarantine: 2,
  expectedBirths: 12,
  nextVaccination: '2026-04-05',
  vaccinationCount: 8,
  deworming: 5,               // İç parazit tedavisi bekleyen
  bodyConditionAvg: 3.2,       // VKS ortalaması (1-5 arası)
  lamenessCount: 1,            // Topallık
};

// ── Finans Verileri ──
export const mockFinanceData = {
  dailyFeedCost: 2850,         // TL
  dailyFeedKg: 620,            // kg
  feedStockDays: 8,            // Gün kalan yem
  monthlyRevenue: 45000,       // TL
  monthlyCost: 32000,          // TL
  roi: 40.6,                   // %
  feedPerHead: 2.51,           // kg/baş/gün
  costPerHead: 11.54,          // TL/baş/gün
};

// ── Sensör Verileri (ESP32 mock) ──
export const mockSensorData = {
  temperature: 29.4,   // °C
  humidity: 62,        // %
  nh3: 14.8,           // ppm
  lastUpdate: '2026-03-18T21:30:00+03:00',
  // Eşik değerleri
  thresholds: {
    temperature: { normal: 28, warning: 32, danger: 36 },
    humidity:    { normal: 70, warning: 80, danger: 90 },
    nh3:        { normal: 15, warning: 25, danger: 35 },
  }
};


// ── SÜRÜ DİZİSİ (MULTI-ANIMAL) ──
export const animalsArray = [
  { id: 'TR-102', nickname: 'Pamuk', rfid: 'RFID-98302X91', breed: 'Merinos', gender: 'Dişi', type: 'Koyun', group: 'Gebe', weight: 68.5, bcs: 3, status: 'good', lastVaccine: '2025-10-10', focus: 'breed' },
  { id: 'TR-088', nickname: 'Benekli', rfid: 'RFID-12300X88', breed: 'Kıvırcık', gender: 'Dişi', type: 'Koyun', group: 'Sağmal', weight: 55.2, bcs: 2.5, status: 'warning', lastVaccine: '2025-05-12', focus: 'milk' },
  { id: 'TR-210', nickname: 'Karabaş', rfid: 'RFID-99911X21', breed: 'Kıvırcık', gender: 'Erkek', type: 'Koç', group: 'Damızlık', weight: 110.4, bcs: 4, status: 'good', lastVaccine: '2025-11-20', focus: 'breed' },
  { id: 'TR-045', nickname: 'Gümüş', rfid: 'RFID-44422X45', breed: 'Merinos', gender: 'Dişi', type: 'Koyun', group: 'Boş', weight: 62.0, bcs: 3.5, status: 'good', lastVaccine: '2025-08-15', focus: 'meat' },
  { id: 'TR-099', nickname: 'Sarıgül', rfid: 'RFID-11133X99', breed: 'İvesi', gender: 'Dişi', type: 'Koyun', group: 'Sağmal', weight: 58.1, bcs: 1.5, status: 'danger', lastVaccine: '2024-12-01', focus: 'milk' },
  { id: 'TR-301', nickname: 'Kral', rfid: 'RFID-55544X30', breed: 'Karakaya', gender: 'Erkek', type: 'Teke', group: 'Damızlık', weight: 85.0, bcs: 3.5, status: 'good', lastVaccine: '2025-09-10', focus: 'breed' },
  { id: 'TR-112', nickname: 'Sütlü', rfid: 'RFID-66655X11', breed: 'Saanen', gender: 'Dişi', type: 'Keçi', group: 'Sağmal', weight: 48.5, bcs: 3, status: 'good', lastVaccine: '2026-01-05', focus: 'milk' },
  { id: 'TR-115', nickname: 'Kınalı', rfid: 'RFID-77766X15', breed: 'Saanen', gender: 'Dişi', type: 'Keçi', group: 'Gebe', weight: 52.0, bcs: 3.5, status: 'good', lastVaccine: '2026-01-05', focus: 'breed' },
  { id: 'TR-004', nickname: 'Boncuk', rfid: 'RFID-88877X04', breed: 'Merinos', gender: 'Dişi', type: 'Kuzu', group: 'Besi', weight: 28.5, bcs: 2.5, status: 'warning', lastVaccine: '2026-02-14', focus: 'meat' },
  { id: 'TR-005', nickname: 'Kartal', rfid: 'RFID-99988X05', breed: 'Merinos', gender: 'Erkek', type: 'Kuzu', group: 'Besi', weight: 32.0, bcs: 3, status: 'good', lastVaccine: '2026-02-14', focus: 'meat' }
];

// ── İş Gücü ve Görev (Workforce) Mock Verileri ──
export const mockTasks = [
  {
    id: 'TSK-001',
    title: 'Şap Aşısı Uygulaması',
    desc: 'Sağlık modülü otonom görevi. Belirtilen hayvana 2ml kas içi enjeksiyon.',
    prio: 'High',
    targetTag: 'TR-088',
    targetAnimalRFID: 'RFID-12345-088',
    status: 'pending' // 'pending' | 'completed'
  },
  {
    id: 'TSK-002',
    title: 'Gebelik Kontrolü & Ultrason',
    desc: 'Islah modülü otonom görevi. Aşım tarihi 120 günü geçen anacın kontrolü.',
    prio: 'Medium',
    targetTag: 'TR-102',
    targetAnimalRFID: 'RFID-12345-102',
    status: 'pending'
  },
  {
    id: 'TSK-003',
    title: 'Sabah Yemlemesi',
    desc: 'Bölme 1 ve Bölme 2 için rasyon tazeleyin.',
    prio: 'High',
    targetTag: null,
    targetAnimalRFID: null,
    status: 'completed'
  }
];



