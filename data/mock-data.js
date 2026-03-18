/**
 * ShepherdAI — Mock Data
 * Tüm modüller için sahte veriler.
 * İleride gerçek API/veritabanı verisi ile değiştirilecek.
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

// ── AI Asistan Bildirimleri ──
export const mockAlerts = [
  {
    id: 1,
    type: 'danger',
    icon: '🌡️',
    title: '102 nolu koyunda ısıl stres tespiti',
    desc: 'Vücut sıcaklığı 40.8°C — acil soğutma ve gölgelendirme önerilir.',
    time: '12 dk önce'
  },
  {
    id: 2,
    type: 'warning',
    icon: '🌾',
    title: 'Yem stoku kritik seviyede',
    desc: 'Mevcut stoklarla tahmini 2 gün yem kapasitesi kaldı. Sipariş oluşturun.',
    time: '1 saat önce'
  },
  {
    id: 3,
    type: 'info',
    icon: '🐑',
    title: '45 nolu koyun doğuma yakın',
    desc: 'Tahmini doğum 2 gün içinde. Doğum bölmesini hazırlayın.',
    time: '3 saat önce'
  }
];

// ── Verim Odağına Göre KPI'lar ──
export const focusKPIs = {
  meat: {
    label: 'Et Verimi',
    kpis: [
      { label: 'Ort. Canlı Ağırlık', value: '62', unit: 'kg', color: 'green' },
      { label: 'Karkas Randımanı', value: '48.5', unit: '%', color: 'blue' },
      { label: 'Günlük Ağırlık Artışı', value: '245', unit: 'g/gün', color: 'cyan' },
      { label: 'Yemden Yararlanma', value: '5.8', unit: 'kg/kg', color: 'amber' },
    ]
  },
  milk: {
    label: 'Süt Verimi',
    kpis: [
      { label: 'Günlük Süt Üretimi', value: '186', unit: 'lt', color: 'blue' },
      { label: 'Ort. Süt/Baş', value: '1.45', unit: 'lt/gün', color: 'cyan' },
      { label: 'Laktasyon Süresi', value: '185', unit: 'gün', color: 'green' },
      { label: 'SHS (Somatik)', value: '285', unit: 'bin/ml', color: 'amber' },
    ]
  },
  breed: {
    label: 'Döl Verimi',
    kpis: [
      { label: 'Gebelik Oranı', value: '87', unit: '%', color: 'green' },
      { label: 'İkizlik Oranı', value: '34', unit: '%', color: 'purple' },
      { label: 'Kuzu Yaşama Gücü', value: '92', unit: '%', color: 'cyan' },
      { label: 'Koç Katım Oranı', value: '1:25', unit: '', color: 'amber' },
    ]
  }
};

// ── Hayvan Profili (Genetik Pasaport) Verisi ──
export const animalData = {
  tagID: 'TR-102',
  rfidCode: 'RFID-98302X91',
  breed: 'Merinos (Safkan)',
  gender: 'Dişi',
  birthDate: '2023-04-12',
  birthWeight: 4.8,    // kg
  currentWeight: 68.5, // kg
  bcsScore: 3,         // 1-5 arası Vücut Kondisyon Skoru
  healthStatus: 'good', // 'good' | 'warning' | 'danger'
  geneticsScore: 92,   // 100 üzerinden
  lineage: {
    mother: 'TR-045',
    father: 'TR-012 (Koç)'
  },
  // İleride eklenecek giyilebilir sensör verileri
  liveSensors: {
    heartRate: null,
    mobility: null,
    temperature: null
  }
};

// ── SÜRÜ DİZİSİ (MULTI-ANIMAL) ──
export const animalsArray = [
  { id: 'TR-102', rfid: 'RFID-98302X91', breed: 'Merinos', gender: 'Dişi', type: 'Koyun', group: 'Gebe', weight: 68.5, bcs: 3, status: 'good', yieldScore: 92, lastVaccine: '2025-10-10', focus: 'breed' },
  { id: 'TR-088', rfid: 'RFID-12300X88', breed: 'Kıvırcık', gender: 'Dişi', type: 'Koyun', group: 'Sağmal', weight: 55.2, bcs: 2.5, status: 'warning', yieldScore: 68, lastVaccine: '2025-05-12', focus: 'milk' },
  { id: 'TR-210', rfid: 'RFID-99911X21', breed: 'Kıvırcık', gender: 'Erkek', type: 'Koç', group: 'Damızlık', weight: 110.4, bcs: 4, status: 'good', yieldScore: 95, lastVaccine: '2025-11-20', focus: 'breed' },
  { id: 'TR-045', rfid: 'RFID-44422X45', breed: 'Merinos', gender: 'Dişi', type: 'Koyun', group: 'Boş', weight: 62.0, bcs: 3.5, status: 'good', yieldScore: 85, lastVaccine: '2025-08-15', focus: 'meat' },
  { id: 'TR-099', rfid: 'RFID-11133X99', breed: 'İvesi', gender: 'Dişi', type: 'Koyun', group: 'Sağmal', weight: 58.1, bcs: 1.5, status: 'danger', yieldScore: 45, lastVaccine: '2024-12-01', focus: 'milk' },
  { id: 'TR-301', rfid: 'RFID-55544X30', breed: 'Karakaya', gender: 'Erkek', type: 'Teke', group: 'Damızlık', weight: 85.0, bcs: 3.5, status: 'good', yieldScore: 88, lastVaccine: '2025-09-10', focus: 'breed' },
  { id: 'TR-112', rfid: 'RFID-66655X11', breed: 'Saanen', gender: 'Dişi', type: 'Keçi', group: 'Sağmal', weight: 48.5, bcs: 3, status: 'good', yieldScore: 94, lastVaccine: '2026-01-05', focus: 'milk' },
  { id: 'TR-115', rfid: 'RFID-77766X15', breed: 'Saanen', gender: 'Dişi', type: 'Keçi', group: 'Gebe', weight: 52.0, bcs: 3.5, status: 'good', yieldScore: 90, lastVaccine: '2026-01-05', focus: 'breed' },
  { id: 'TR-004', rfid: 'RFID-88877X04', breed: 'Merinos', gender: 'Dişi', type: 'Kuzu', group: 'Besi', weight: 28.5, bcs: 2.5, status: 'warning', yieldScore: 75, lastVaccine: '2026-02-14', focus: 'meat' },
  { id: 'TR-005', rfid: 'RFID-99988X05', breed: 'Merinos', gender: 'Erkek', type: 'Kuzu', group: 'Besi', weight: 32.0, bcs: 3, status: 'good', yieldScore: 82, lastVaccine: '2026-02-14', focus: 'meat' }
];

// ── Borsa ve Piyasa Verileri (Mock) ──
export const marketPrices = {
  meatCarcass: 380, // TL/kg (Karkas Et)
  meatLive: 190,    // TL/kg (Canlı Ağırlık)
  milk: 24,         // TL/Litre (Koyun Sütü)
  feed: {
    barley: 7.5,    // Arpa TL/kg
    corn: 8.2,      // Mısır TL/kg
    straw: 2.1      // Saman TL/kg
  }
};

// ── Envanter ve Silo Verileri ──
export const inventoryData = {
  siloTotalCapacity: 15000, // kg
  siloCurrentAmount: 4200,  // kg
  dailyHerdConsumption: 620 // kg/gün
};

// ── Ayıklama (Culling) Listesi İçin Sürü Örnek Verileri ──
export const herdFinancialData = [
  { id: 'TR-102', type: 'Koyun', avgDailyGain: 0.12, feedCostPerDay: 14.5, healthIssues: 1, milkYield: 0.8 },
  { id: 'TR-088', type: 'Koyun', avgDailyGain: 0.08, feedCostPerDay: 15.2, healthIssues: 3, milkYield: 0.4 },
  { id: 'TR-210', type: 'Koç',   avgDailyGain: 0.10, feedCostPerDay: 18.0, healthIssues: 2, milkYield: 0.0 },
  { id: 'TR-045', type: 'Koyun', avgDailyGain: 0.25, feedCostPerDay: 12.5, healthIssues: 0, milkYield: 1.8 }
];

// ── Islah ve Genetik (Breeding) Mock Verileri ──
export const breedingMockEwe = {
  tagID: 'TR-102',
  breed: 'Kıvırcık',
  genetics: { meat: 65, milk: 80, fertility: 90, resistance: 75, growth: 60 },
  lineage: ['TR-045', 'TR-012', 'TR-990', 'TR-881', 'TR-X01', 'TR-X02'] // 4 nesil ata listesi (basit)
};

export const breedingMockRam = {
  tagID: 'TR-210 (Alfa)',
  breed: 'Kıvırcık Koç',
  genetics: { meat: 90, milk: 40, fertility: 85, resistance: 80, growth: 95 },
  // TR-990 her ikisinde de ortak, dolayısıyla Inbreeding Check'te kırmızı uyarı tetikleyecek
  lineage: ['TR-300', 'TR-301', 'TR-990', 'TR-400', 'TR-Y01', 'TR-Y02'] 
};

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



