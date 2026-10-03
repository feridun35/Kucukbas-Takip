/**
 * ShepherdAI — Üreme Durum Modeli (breedingStatus.js)
 *
 * Saf fonksiyonlar (state'e bağımlı değil): healthManager, herdMathEngine, breedingManager ve UI ortak kullanır.
 *
 * Bir eşleşme kaydındaki HER anacın durumu ayrı izlenir (`record.damStatus[damId]`). Böylece grup katımında
 * bir anacın doğurması, gebeliğinin tutmaması ya da ölmesi diğerlerinin takibini etkilemez.
 * Kaydın genel durumu (`record.status`) anaç durumlarından türetilir.
 *
 *   ACTIVE    — Koç katımı yapıldı, gebelik henüz doğrulanmadı (olası gebe)
 *   PREGNANT  — Gebelik doğrulandı (ultrason vb.)
 *   DELIVERED — Doğum yaptı
 *   FAILED    — Gebelik tutmadı
 *   LOST      — Anaç öldü / sürüden çıktı
 */

/** Ebeveyn alanını normalize eder: bilinmeyen değerler null olur */
export function normalizeParentId(value) {
  const v = typeof value === 'string' ? value.trim() : value;
  if (!v || ['bilinmiyor', '-', 'yok', 'null', 'undefined'].includes(String(v).toLocaleLowerCase('tr-TR'))) return null;
  return v;
}

export const DAM_STATUS = {
  ACTIVE: 'ACTIVE',
  PREGNANT: 'PREGNANT',
  DELIVERED: 'DELIVERED',
  FAILED: 'FAILED',
  LOST: 'LOST'
};

const OPEN = [DAM_STATUS.ACTIVE, DAM_STATUS.PREGNANT];

export function isOpenDamStatus(status) {
  return OPEN.includes(status);
}

/** Anacın kayıttaki durumu (damStatus alanı olmayan eski kayıtlar için kayıt durumundan türetilir) */
export function getDamStatus(record, damId) {
  const explicit = record?.damStatus?.[damId];
  if (explicit) return explicit;
  switch (record?.status) {
    case 'PREGNANT': return DAM_STATUS.PREGNANT;
    case 'COMPLETED': return DAM_STATUS.DELIVERED;
    case 'FAILED': return DAM_STATUS.FAILED;
    default: return DAM_STATUS.ACTIVE;
  }
}

/** Kayıt genel durumunu anaç durumlarından türetir: ACTIVE | PREGNANT | COMPLETED | FAILED */
export function deriveRecordStatus(record) {
  const statuses = (record.damIds || []).map(id => getDamStatus(record, id));
  if (statuses.length === 0) return record.status || 'ACTIVE';
  if (statuses.every(s => !isOpenDamStatus(s))) {
    return statuses.includes(DAM_STATUS.DELIVERED) ? 'COMPLETED' : 'FAILED';
  }
  return statuses.includes(DAM_STATUS.PREGNANT) ? 'PREGNANT' : 'ACTIVE';
}

/** Kayıt açık mı? (en az bir anaç hâlâ ACTIVE/PREGNANT) */
export function isRecordOpen(record) {
  return (record.damIds || []).some(id => isOpenDamStatus(getDamStatus(record, id)));
}

/**
 * Açık kayıtlardaki anaçların durum haritası.
 * @returns {Map<string, { status, record }>}
 */
export function getOpenDamMap(breedingRecords) {
  const map = new Map();
  (breedingRecords || []).forEach(record => {
    (record.damIds || []).forEach(damId => {
      const status = getDamStatus(record, damId);
      if (!isOpenDamStatus(status)) return;
      const prev = map.get(damId);
      // Aynı anaç birden fazla açık kayıtta ise doğrulanmış gebelik öncelikli
      if (!prev || (prev.status !== DAM_STATUS.PREGNANT && status === DAM_STATUS.PREGNANT)) {
        map.set(damId, { status, record });
      }
    });
  });
  return map;
}

/**
 * Gebe sayılan hayvanların kimlikleri: doğrulanmış gebelik (PREGNANT) + grubu 'Gebe' olarak işaretlenenler.
 */
export function getPregnantAnimalIds(animals, breedingRecords) {
  const ids = new Set();
  (animals || []).forEach(a => { if (a.group === 'Gebe') ids.add(a.id); });
  getOpenDamMap(breedingRecords).forEach((info, damId) => {
    if (info.status === DAM_STATUS.PREGNANT) ids.add(damId);
  });
  const alive = new Set((animals || []).map(a => a.id));
  return [...ids].filter(id => alive.has(id));
}
