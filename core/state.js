/**
 * ShepherdAI — Merkezi Data State
 * Reactive store pattern ile tüm uygulama verisini yönetir.
 * İleride ESP32 sensör verileri ve AI model çıktıları buradan akacak.
 */

const AppState = {
  // Aktif sayfa
  currentPage: 'dashboard',

  // Verim odağı: 'meat' | 'milk' | 'breed'
  focusMode: 'meat',

  // Sensör verileri (ESP32 placeholder)
  sensors: {
    temperature: 0,
    humidity: 0,
    nh3: 0,
    lastUpdate: null
  },

  // Sürü özet bilgileri
  herdSummary: {
    total: 0,
    sheep: 0,
    goat: 0,
    ram: 0,
    lamb: 0
  },

  // Sağlık durumu
  healthSummary: {
    sick: 0,
    quarantine: 0,
    expectedBirths: 0,
    vaccination: 0
  },

  // Finans özeti
  financeSummary: {
    dailyFeedCost: 0,
    feedStock: 0,
    roi: 0
  },

  // AI Asistan bildirimleri
  alerts: [],

  // Aşı ve sağlık ajandası
  vaccines: [
    { id: 1, name: 'Sürü Geneli Çelerme', date: '21 Mar 2026', status: 'upcoming', target: 'Tüm Sürü' },
    { id: 2, name: 'Sürü Geneli Şap Açısı', date: '05 Nis 2026', status: 'pending', target: 'Tüm Sürü' },
    { id: 3, name: 'Brucella', date: 'Ocak 2026', status: 'done', target: 'Gençler Sürüsü' },
    { id: 4, name: 'Bireysel Ektima M.', date: 'Aralık 2025', status: 'done', target: 'TR-102, TR-088' }
  ],

  // Görev yönetimi
  tasks: [
    { id: 'TSK-001', title: 'Şap Aşısı Uygulaması', desc: 'Belirtilen hayvanlara 2ml kas içi enjeksiyon.', type: 'vaccine', prio: 'High', scope: 'herd', targetTag: null, status: 'pending', createdAt: '2026-03-18' },
    { id: 'TSK-002', title: 'Sabah Yemlemesi', desc: 'Bölme 1 ve 2 için rasyon tazeleyin.', type: 'feed', prio: 'High', scope: 'herd', targetTag: null, status: 'pending', createdAt: '2026-03-18' }
  ],
  taskHistory: [
    { id: 'TSK-H01', title: 'Ağıl Dezenfeksiyonu', desc: 'Tüm bölmelerin ilaçlı yıkama işlemi.', type: 'cleaning', prio: 'Normal', scope: 'herd', targetTag: null, status: 'completed', createdAt: '2026-03-15', completedAt: '2026-03-15' }
  ],

  // Kullanıcı rolü
  userRole: 'owner',

  // Yem envanter
  feedInventory: [
    { id: 'yonca', name: 'Yonca', icon: '🌿', amount: 1200, unit: 'kg' },
    { id: 'fi', name: 'Fiğ', icon: '🌱', amount: 800, unit: 'kg' },
    { id: 'bugday', name: 'Buğday', icon: '🌾', amount: 600, unit: 'kg' },
    { id: 'arpa', name: 'Arpa', icon: '🌾', amount: 450, unit: 'kg' },
    { id: 'misir', name: 'Mısır Silajı', icon: '🌽', amount: 2000, unit: 'kg' },
    { id: 'saman', name: 'Saman', icon: '🪹', amount: 1500, unit: 'kg' },
    { id: 'hazir', name: 'Hazır Yem (Besi)', icon: '📦', amount: 300, unit: 'kg' },
    { id: 'kuzu', name: 'Kuzu Gelişim Yemi', icon: '🐣', amount: 150, unit: 'kg' },
    { id: 'mineral', name: 'Mineral/Vitamin', icon: '💊', amount: 25, unit: 'kg' },
    { id: 'yalama', name: 'Tuz Yalama Taşı', icon: '🪨', amount: 10, unit: 'adet' }
  ],
  feedHistory: [
    { id: 'FH-001', feedId: 'arpa', feedName: 'Arpa', amount: 200, type: 'entry', date: '15 Mar 2026', note: '2 çuval' },
    { id: 'FH-002', feedId: 'saman', feedName: 'Saman', amount: 500, type: 'entry', date: '10 Mar 2026', note: 'Bal topları' }
  ],

  // Sürüdeki tüm hayvanlar (V2 Multi-Animal)
  animals: []
};

// ── Aboneler ──
const _subscribers = new Set();

/**
 * State değişikliklerini dinle
 * @param {Function} callback - (newState) => void
 * @returns {Function} unsubscribe fonksiyonu
 */
export function subscribe(callback) {
  _subscribers.add(callback);
  return () => _subscribers.delete(callback);
}

/**
 * State'i güncelle ve aboneleri bilgilendir
 * @param {Object} partial - güncellenecek kısmi state
 */
export function setState(partial) {
  Object.keys(partial).forEach(key => {
    if (typeof partial[key] === 'object' && partial[key] !== null && !Array.isArray(partial[key])) {
      AppState[key] = { ...AppState[key], ...partial[key] };
    } else {
      AppState[key] = partial[key];
    }
  });
  _notifySubscribers();
}

/**
 * Mevcut state'in bir kopyasını döndür
 */
export function getState() {
  return { ...AppState };
}

/**
 * Belirli bir hayvan objesini ID'sine göre döndürür
 * @param {string} id - Hayvan Küpe Numarası (Örn: TR-102)
 */
export function getAnimalById(id) {
  return AppState.animals.find(a => a.id === id) || null;
}

function _notifySubscribers() {
  const snapshot = getState();
  _subscribers.forEach(cb => {
    try { cb(snapshot); } catch (e) { console.error('[State] Subscriber error:', e); }
  });
}

export default AppState;
