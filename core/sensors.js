/**
 * ShepherdAI — ESP32 Sensör Placeholder Modülü
 * 
 * Bu modül ileride ESP32 mikrodenetleyiciden gelen
 * gerçek zamanlı sensör verilerini işleyecek.
 * Şu an placeholder fonksiyonlar içerir.
 */

import { setState } from './state.js';

/**
 * ESP32'den sensör verilerini çek ve state'i güncelle.
 * İleride HTTP/MQTT/WebSocket üzerinden gerçek veri alacak.
 * @placeholder
 */
export function updateSensorData() {
  // TODO: ESP32 endpoint'inden veri çek
  // Örnek: fetch('http://192.168.x.x/api/sensors')
  console.log('[Sensors] updateSensorData() — placeholder, ESP32 entegrasyonu bekleniyor');
  
  // Şimdilik mock veri ile state güncelle
  setState({
    sensors: {
      temperature: 28 + Math.random() * 4,
      humidity: 55 + Math.random() * 15,
      nh3: 8 + Math.random() * 12,
      lastUpdate: new Date().toISOString()
    }
  });
}

/**
 * ESP32 ile WebSocket bağlantısı kur.
 * Gerçek zamanlı veri akışı için kullanılacak.
 * @placeholder
 * @param {string} wsUrl - WebSocket URL (ör: ws://192.168.x.x/ws)
 */
export function connectWebSocket(wsUrl) {
  // TODO: WebSocket bağlantısı kur
  console.log(`[Sensors] connectWebSocket(${wsUrl}) — placeholder`);
}

/**
 * ESP32'den gelen ham sensör payload'ını parse et.
 * @placeholder
 * @param {ArrayBuffer|string} rawPayload - ham veri
 * @returns {Object} parsed sensör verisi
 */
export function parseSensorPayload(rawPayload) {
  // TODO: Gerçek payload format'ına göre parse et
  console.log('[Sensors] parseSensorPayload() — placeholder');
  return {
    temperature: 0,
    humidity: 0,
    nh3: 0,
    timestamp: Date.now()
  };
}

/**
 * Sensör verilerini periyodik olarak güncelle.
 * @param {number} intervalMs - güncelleme aralığı (ms)
 * @returns {number} interval ID (clearInterval için)
 */
export function startSensorPolling(intervalMs = 30000) {
  console.log(`[Sensors] Polling başlatıldı — ${intervalMs}ms aralıkla`);
  updateSensorData(); // ilk çağrı
  return setInterval(updateSensorData, intervalMs);
}
