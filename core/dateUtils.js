/**
 * ShepherdAI — Takvim Tarihi Yardımcıları (dateUtils.js)
 *
 * Uygulamadaki tüm "gün" kavramları takvim tarihidir ('YYYY-MM-DD') ve CİHAZIN YEREL saat dilimine göredir.
 * `new Date().toISOString()` UTC döndürdüğü için Türkiye'de 00:00–03:00 arasında bir önceki günü verir;
 * bu yüzden bugün/ekleme/fark hesapları yalnızca buradaki fonksiyonlarla yapılır.
 *
 * Gün aritmetiği UTC gece yarısı üzerinden yapılır (saat dilimi ve yaz saati kaymalarından bağımsız).
 */

const DAY_MS = 86400000;
const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DOTTED_RE = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/;

const pad = (n) => String(n).padStart(2, '0');

/** Date objesinin YEREL takvim tarihi */
export function toLocalIso(date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Bugünün yerel takvim tarihi ('YYYY-MM-DD') */
export function todayIso() {
  return toLocalIso(new Date());
}

/** Geçerli bir 'YYYY-MM-DD' mi? (takvimde var olan bir gün) */
export function isValidIsoDate(value) {
  const m = ISO_RE.exec(String(value || ''));
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3];
}

/**
 * Kullanıcı girdisini takvim tarihine çevirir. Kabul edilen biçimler:
 * 'YYYY-MM-DD', 'GG.AA.YYYY', 'GG/AA/YYYY', 'GG-AA-YYYY'. Geçersizse null.
 */
export function normalizeDateInput(value) {
  const s = String(value || '').trim();
  if (isValidIsoDate(s)) return s;
  const m = DOTTED_RE.exec(s);
  if (m) {
    const iso = `${m[3]}-${pad(+m[2])}-${pad(+m[1])}`;
    return isValidIsoDate(iso) ? iso : null;
  }
  return null;
}

function _utcMs(iso) {
  const m = ISO_RE.exec(String(iso || ''));
  if (m) return Date.UTC(+m[1], +m[2] - 1, +m[3]);
  // ISO olmayan girdiler için (eski kayıtlar) yerel takvim tarihine indirgenir
  const d = new Date(iso);
  return isNaN(d.getTime()) ? NaN : Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Takvim tarihine gün ekler */
export function addDaysIso(iso, days) {
  const ms = _utcMs(iso);
  if (isNaN(ms)) return iso;
  const d = new Date(ms + Math.round(days) * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** İki takvim tarihi arasındaki gün farkı (b - a) */
export function daysBetweenIso(a, b) {
  const ma = _utcMs(a), mb = _utcMs(b);
  if (isNaN(ma) || isNaN(mb)) return NaN;
  return Math.round((mb - ma) / DAY_MS);
}
