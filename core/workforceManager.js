/**
 * ShepherdAI — İş Gücü ve Görev Lojik Motoru (Workforce Manager)
 */

import { mockTasks } from '../data/mock-data.js';

/**
 * Kullanıcı rolüne göre filtrelenmiş görev listesini döndürür.
 * @param {string} role - 'owner' veya 'worker'
 * @returns {Array} Görevler listesi
 */
export function getTasksForUser(role) {
  if (role === 'owner') {
    // Owner tüm görevleri, performans izleme amacıyla görebilir.
    return mockTasks;
  }
  
  // Worker sadece kendisine atanan veya açık olan saha işlerini görür.
  return mockTasks.filter(t => t.status === 'pending');
}

/**
 * Görevin RFID okutularak tamamlanıp tamamlanmadığını doğrular.
 * @param {string} taskID
 * @param {string} scannedRFID - Okutulan donanımsal RFID/NFC
 * @returns {Object} { success: boolean, message: string }
 */
export function verifyTaskWithRFID(taskID, scannedRFID) {
  const task = mockTasks.find(t => t.id === taskID);
  
  if (!task) return { success: false, message: 'Görev bulunamadı.' };
  if (!task.targetAnimalRFID) return { success: true, message: 'Bu görev RFID doğrulaması gerektirmez.' };
  
  if (task.targetAnimalRFID === scannedRFID) {
    task.status = 'completed'; // Mock update
    return { success: true, message: 'Doğrulama Başarılı: Görev tamamlandı işaretlendi.' };
  } else {
    return { success: false, message: 'RFID Eşleşmiyor: Lütfen doğru hayvanın (Kulak Küpesi: ' + task.targetTag + ') yanına gidip okutun.' };
  }
}

/**
 * Sensörlerden gelen veriyi okuyup Kritik Acil Durum (Emergency) üretir.
 * @param {string} sensorType - 'ammonia', 'movement', vs.
 * @param {number} value - Sensör değeri
 * @returns {Object|null} Acil durum objesi veya null
 */
export function processSensorForEmergency(sensorType, value) {
  if (sensorType === 'ammonia' && value > 50) {
    return {
      type: 'HAZARD',
      title: 'Kritik Amonyak Seviyesi!',
      message: `Ağıl içi amonyak seviyesi ${value} ppm'i aştı. Havalandırmayı derhal açın. Hayati tehlike!`,
      level: 'CRITICAL'
    };
  }
  
  if (sensorType === 'movement' && value > 99) {
    return {
      type: 'ALERT',
      title: 'Anormal Hareketlilik (Panik/Hırsızlık)',
      message: 'Sürüde genel panik veya dış müdahale tespit edildi. Kameraları kontrol edin.',
      level: 'HIGH'
    };
  }
  
  return null;
}
