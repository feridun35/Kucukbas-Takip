/**
 * ShepherdAI — Üç Yönlü Çiftlik Verisi Birleştirme (syncMerge.js)
 *
 * İki cihaz (veya çevrimdışı yerel kopya ile bulut) aynı ortak sürümden (base) ayrıldığında
 * değişiklikleri kaybetmeden birleştirir. Saf fonksiyondur.
 *
 *  base  : Bu cihazın bulutla en son eşitlendiği yük (son başarılı push veya bulut uygulaması)
 *  local : Bu cihazdaki güncel yük
 *  cloud : Buluttaki güncel yük
 *
 * Kurallar:
 *  - `id` alanı taşıyan obje dizileri (animals, tasks, treatmentRecords, …) KAYIT BAZINDA birleştirilir:
 *      yalnızca bir tarafta değişen kayıt o tarafın sürümünü alır; iki tarafta da değiştiyse yerel kazanır.
 *      Bir tarafta silinip diğer tarafta değişmeyen kayıt silinir; diğer tarafta düzenlendiyse korunur.
 *      Yeni kayıtların hepsi korunur.
 *  - Diğer alanlar (focusMode, nesneler) bütün olarak: yalnızca değişen taraf alınır, ikisi de değiştiyse yerel.
 */

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function _isIdArray(arr) {
  return Array.isArray(arr) && arr.every(x => x && typeof x === 'object' && x.id !== undefined && x.id !== null);
}

function _mergeById(base, local, cloud) {
  const keyOf = (x) => String(x.id);
  const bMap = new Map((base || []).map(x => [keyOf(x), x]));
  const lMap = new Map(local.map(x => [keyOf(x), x]));
  const cMap = new Map(cloud.map(x => [keyOf(x), x]));

  const resolve = (id) => {
    const inB = bMap.has(id), inL = lMap.has(id), inC = cMap.has(id);
    const b = bMap.get(id), l = lMap.get(id), c = cMap.get(id);

    if (inL && inC) {
      if (same(l, c)) return l;
      if (inB && same(l, b)) return c;   // yalnızca bulutta değişmiş
      return l;                          // yalnızca yerelde değişmiş ya da ikisinde de değişmiş → yerel
    }
    if (inL) {                           // bulutta yok
      if (inB && same(l, b)) return undefined; // bulutta silinmiş, yerelde dokunulmamış → sil
      return l;                          // yeni yerel kayıt ya da yerelde düzenlenmiş
    }
    if (inC) {                           // yerelde yok
      if (inB && same(c, b)) return undefined; // yerelde silinmiş, bulutta dokunulmamış → sil
      return c;                          // yeni bulut kaydı ya da bulutta düzenlenmiş
    }
    return undefined;
  };

  const result = [];
  const seen = new Set();
  // Bulutta yeni eklenen kayıtlar (listeler "yeni en üstte" düzeninde) önce
  cloud.forEach(c => {
    const id = keyOf(c);
    if (!lMap.has(id) && !bMap.has(id)) {
      const v = resolve(id);
      if (v !== undefined) { result.push(v); seen.add(id); }
    }
  });
  local.forEach(l => {
    const id = keyOf(l);
    if (seen.has(id)) return;
    const v = resolve(id);
    if (v !== undefined) result.push(v);
    seen.add(id);
  });
  // Yerelde silinmiş ama bulutta düzenlenmiş kayıtlar
  cloud.forEach(c => {
    const id = keyOf(c);
    if (seen.has(id)) return;
    const v = resolve(id);
    if (v !== undefined) result.push(v);
    seen.add(id);
  });
  return result;
}

/**
 * @param {Object|null} base
 * @param {Object} local
 * @param {Object} cloud
 * @returns {Object} birleştirilmiş yük
 */
export function mergeFarmPayloads(base, local, cloud) {
  const b = base || {};
  const keys = new Set([...Object.keys(local || {}), ...Object.keys(cloud || {})]);
  const merged = {};

  keys.forEach(k => {
    const l = local?.[k], c = cloud?.[k], bv = b[k];

    if (l === undefined) { merged[k] = c; return; }
    if (c === undefined) { merged[k] = l; return; }

    if (_isIdArray(l) && _isIdArray(c) && (bv === undefined || _isIdArray(bv))) {
      merged[k] = _mergeById(bv, l, c);
      return;
    }

    if (same(l, c)) merged[k] = l;
    else if (bv !== undefined && same(l, bv)) merged[k] = c; // yalnızca bulut değişmiş
    else merged[k] = l;                                        // yerel değişmiş (veya ikisi de)
  });

  return merged;
}
