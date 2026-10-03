/**
 * ShepherdAI — Metin Güvenliği (sanitize.js)
 *
 * Uygulama arayüzü innerHTML şablonlarıyla çizildiği için kullanıcı metni HTML olarak yorumlanabilir
 * (örn. lakap alanına yazılan `<img onerror=...>` çalışırdı). İki katmanlı koruma:
 *  1. Girişte: serbest metin alanlarından `<` ve `>` çıkarılır (stripTags), küpe numaraları güvenli
 *     karakter kümesiyle sınırlandırılır (isValidTag). Böylece veride HTML etiketi oluşamaz.
 *  2. Çıkışta: ortak modal bileşeni ve öznitelik (attribute) değerleri escapeHtml ile kaçışlanır;
 *     tırnak işareti öznitelikten taşamaz.
 */

const HTML_ESCAPES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

/** HTML metni/özniteliği için tam kaçış */
export function escapeHtml(value) {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, ch => HTML_ESCAPES[ch]);
}

/** Serbest metinden HTML etiketi oluşturabilecek `<` ve `>` karakterlerini çıkarır */
export function stripTags(value) {
  if (value === null || value === undefined) return value;
  if (typeof value !== 'string') return value;
  return value.replace(/[<>]/g, '').trim();
}

// Küpe no: harf (Türkçe dahil), rakam, boşluk ve - _ . / ; en fazla 30 karakter
const TAG_RE = /^[0-9A-Za-zÇĞİÖŞÜçğıöşü][0-9A-Za-zÇĞİÖŞÜçğıöşü _./-]{0,29}$/;

/** Küpe numarası güvenli karakterlerden mi oluşuyor? */
export function isValidTag(value) {
  return TAG_RE.test(String(value || '').trim());
}

export const TAG_RULE_MESSAGE = 'Küpe numarası harf/rakamla başlamalı; yalnızca harf, rakam, boşluk ve - _ . / içerebilir (en fazla 30 karakter).';

/**
 * Bir yükteki tüm metin alanlarından `<` `>` karakterlerini derinlemesine temizler (göç için).
 */
export function deepStripTags(value) {
  if (typeof value === 'string') return value.replace(/[<>]/g, '');
  if (Array.isArray(value)) return value.map(deepStripTags);
  if (value && typeof value === 'object') {
    const out = {};
    Object.keys(value).forEach(k => { out[k] = deepStripTags(value[k]); });
    return out;
  }
  return value;
}
