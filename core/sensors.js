/**
 * ShepherdAI — ESP32 Sensör Modülü
 * Gerçek ESP32 cihazından telemetri verilerini dinler ve yönetir.
 * Donanım bağlı olmadığında rastgele değer üretmez; 'Bağlantı Yok / Bilinmiyor' durumunu korur.
 */

import { getState, setState } from './state.js';

let _pollingInterval = null;

/**
 * Sensör verilerini kontrol et
 */
export function updateSensorData() {
  const state = getState();
  const isDemo = state.currentUser?.isDemo || state.currentUser?.id === 'demo';

  // Demo hesabında sadece temsili demo telemetrisi gösterilebilir
  if (isDemo) {
    setState({
      sensors: {
        connected: true,
        isMock: true,
        temperature: 29.4,
        humidity: 62,
        nh3: 14.8,
        lastUpdate: new Date().toISOString()
      }
    });
    return;
  }

  // Gerçek / Sıfır işletmelerde donanım bağlı değilse asla sahte veri üretilmez
  // ESP32 bağlantısı kurulana kadar durum 'connected: false' kalır.
  setState({
    sensors: {
      connected: false,
      isMock: false,
      temperature: null,
      humidity: null,
      nh3: null,
      lastUpdate: null,
      statusMessage: 'ESP32 Cihazı Aranıyor / Bağlantı Yok'
    }
  });
}

/**
 * ESP32 ile WebSocket bağlantısı kur
 * @param {string} wsUrl - ws://192.168.x.x/ws
 */
export function connectWebSocket(wsUrl) {
  console.log(`[Sensors] connectWebSocket(${wsUrl}) başlatılıyor...`);
  // İleride gerçek WebSocket bağlandığında:
  // ws.onmessage = (e) => { ... setState({ sensors: { connected: true, ... } }) }
}

/**
 * Sensör kontrol döngüsünü başlat
 */
export function startSensorPolling(intervalMs = 60000) {
  if (_pollingInterval) clearInterval(_pollingInterval);
  updateSensorData();
  _pollingInterval = setInterval(updateSensorData, intervalMs);
  return _pollingInterval;
}
