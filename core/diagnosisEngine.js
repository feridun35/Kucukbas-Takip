/**
 * ShepherdAI — Kural Tabanlı Teşhis Motoru (diagnosisEngine.js)
 *
 * state.js'e bağımlı OLMAYAN saf hesaplama. Veteriner hekimin ayırıcı tanı mantığını izler:
 *   1. Görülen bulgular hastalığın tipik bulgularıyla eşleştirilir (çok tipik 3, sık 2, olabilir 1 puan).
 *   2. "Yok" denen temel bulgular ve hastalığın açıklayamadığı bulgular puanı düşürür.
 *   3. Vücut ısısı, yaş, cinsiyet, gebelik/doğum durumu, mevsim, sürüdeki benzer vakalar,
 *      aşı ve parazit ilacı geçmişi olasılığı artırır ya da azaltır.
 *   4. Puanlar göreli olasılığa çevrilir; en çok ayırt ettirecek sorular önerilir.
 *
 * Sonuç bir ön değerlendirmedir; kesin tanı ve tedavi veteriner hekime aittir.
 * Bilgi tabanı: data/disease-library.js
 */

import { DISEASES, FINDINGS, URGENCY_LEVELS, DIAGNOSIS_RULES } from '../data/disease-library.js';

const FINDING_BY_CODE = new Map(FINDINGS.map(f => [f.code, f]));
const WEIGHT_LABELS = { 3: 'çok tipik', 2: 'sık görülür', 1: 'görülebilir' };
const FEVER_FIT = {
  high: { low: -2, normal: -1.5, fever: 1, high: 2 },
  mild: { low: -1, normal: 0, fever: 1, high: 0.5 },
  none: { low: 0, normal: 0.5, fever: -1.5, high: -2.5 },
  low: { low: 2, normal: 0.5, fever: -2, high: -3 },
  any: { low: 0, normal: 0, fever: 0, high: 0 }
};
const FEVER_TEXT = {
  high: 'bu hastalıkta genellikle yüksek ateş olur',
  mild: 'bu hastalıkta genellikle hafif-orta ateş olur',
  none: 'bu hastalıkta genellikle ateş olmaz',
  low: 'bu hastalıkta ısı normal ya da düşüktür'
};
const TEMP_CLASS_TEXT = { low: 'Düşük ısı', normal: 'Normal ısı', fever: 'Ateş', high: 'Yüksek ateş' };
const REPRO_TEXT = {
  latePregnancy: 'gebeliğin son 6 haftası',
  periparturient: 'doğum öncesi/sonrası 3 hafta',
  lactating: 'emzirme / sağım dönemi',
  pregnant: 'gebelik'
};

export function findingLabel(code) {
  return FINDING_BY_CODE.get(code)?.label || code;
}

export function getFinding(code) {
  return FINDING_BY_CODE.get(code) || null;
}

/** Vücut ısısı sınıfı: 'low' | 'normal' | 'fever' | 'high' | null */
export function temperatureClass(temperature, answers = {}, rules = DIAGNOSIS_RULES) {
  const t = Number(temperature);
  if (temperature !== null && temperature !== undefined && temperature !== '' && Number.isFinite(t)) {
    if (t < rules.hypothermiaBelow) return 'low';
    if (t < rules.feverAt) return 'normal';
    if (t < rules.highFeverAt) return 'fever';
    return 'high';
  }
  if (answers.fever === true) return 'fever';
  if (answers.fever === false) return 'normal';
  return null;
}

/** Kullanıcı cevapları önce gelir; yoksa kayıtlardan türetilen değer kullanılır */
function _mergeAnswers(answers, derived) {
  const merged = {};
  Object.entries(derived || {}).forEach(([code, d]) => { if (typeof d?.value === 'boolean') merged[code] = d.value; });
  Object.entries(answers || {}).forEach(([code, v]) => { if (typeof v === 'boolean') merged[code] = v; });
  return merged;
}

function _ageRange(ctx) {
  if (Number.isFinite(ctx?.ageDays)) return [ctx.ageDays, ctx.ageDays];
  if (Array.isArray(ctx?.ageBounds)) return ctx.ageBounds;
  return null;
}

function _formatDays(days) {
  if (days < 60) return `${days} gün`;
  if (days < 730) return `${Math.round(days / 30.4)} ay`;
  return `${Math.round(days / 365)} yaş`;
}

/** Tek hastalığın puanı ve gerekçeleri; uygun değilse null */
function _scoreDisease(d, ans, tClass, ctx, rules) {
  const species = ctx?.species || null;
  if (species && !d.species.includes(species)) return null;
  if (d.sex && ctx?.sex && d.sex !== ctx.sex) return null;

  let score = (d.prevalence - 2) * 0.5;
  const supporting = [];
  const against = [];
  const contextNotes = [];
  const missingKey = [];
  let positive = 0;
  let specificPositive = 0; // genel (iştahsızlık, halsizlik) ve ortam bilgisi dışındaki bulgular

  if (d.goatPreferred && species === 'sheep') score -= 0.5;

  // Bulgular
  Object.entries(ans).forEach(([code, present]) => {
    if (code === 'fever') return; // ısı ayrı değerlendirilir
    const f = FINDING_BY_CODE.get(code);
    if (!f) return;
    const w = d.findings[code] || 0;
    if (present) {
      if (w) {
        score += w;
        positive += w;
        if (f.group !== 'history' && !f.generic) specificPositive += w;
        supporting.push({ code, label: f.label, weight: w, weightLabel: WEIGHT_LABELS[w] });
      } else if (f.group !== 'history') {
        const pen = f.generic ? 0.3 : 0.9;
        score -= pen;
        if (!f.generic) against.push(`${f.label} — bu hastalıkla açıklanmaz`);
      }
    } else if (d.key.includes(code)) {
      score -= 2.5;
      missingKey.push(f.label);
      against.push(`${f.label} yok — bu hastalıkta neredeyse her zaman görülür`);
    } else if (w) {
      score -= 0.4 * w;
      if (w >= 3) against.push(`${f.label} yok — genellikle görülür`);
    }
  });

  const hasKey = d.key.some(k => ans[k] === true);
  // Listeye girmek için en az bir ayırt edici klinik bulgu gerekir
  if (specificPositive < 1 || (positive < 2 && !hasKey)) return null;

  // Vücut ısısı
  if (tClass && d.fever !== 'any') {
    const fit = FEVER_FIT[d.fever][tClass];
    score += fit;
    if (fit > 0) supporting.push({ code: 'fever', label: TEMP_CLASS_TEXT[tClass], weight: fit >= 2 ? 3 : 2, weightLabel: 'uyumlu' });
    else if (fit < 0) against.push(`${TEMP_CLASS_TEXT[tClass]} — ${FEVER_TEXT[d.fever]}`);
  }

  // Yaş
  const range = _ageRange(ctx);
  if (d.age && range) {
    const [lo, hi] = range;
    if (hi < d.age.min || lo > d.age.max) {
      if (d.age.strict && Number.isFinite(ctx?.ageDays) && (ctx.ageDays > d.age.max * 3 || ctx.ageDays < d.age.min / 3)) return null;
      score -= 3;
      against.push(`Yaş uygun değil — genellikle ${_formatDays(d.age.min)}–${d.age.max >= 100000 ? 'üzeri' : _formatDays(d.age.max)} arası`);
    } else if (Number.isFinite(ctx?.ageDays) && d.age.max - d.age.min <= 400) {
      score += 0.5;
      contextNotes.push(`Yaşı (${_formatDays(ctx.ageDays)}) bu hastalığın görüldüğü döneme uyuyor`);
    }
  }

  // Gebelik / doğum / laktasyon
  if (d.repro) {
    const status = ctx?.repro?.[d.repro];
    if (status === true) {
      score += 1.5;
      contextNotes.push(`Üreme durumu uyumlu: ${REPRO_TEXT[d.repro]}`);
    } else if (status === false) {
      if (!d.reproSoft) return null;
      score -= 1.5;
      against.push(`Genellikle ${REPRO_TEXT[d.repro]} döneminde görülür`);
    }
  }

  // Mevsim
  if (d.seasons && ctx?.month) {
    if (d.seasons.includes(ctx.month)) {
      score += 0.3;
      contextNotes.push('Mevsim uygun');
    } else {
      score -= 0.6;
      against.push('Bu mevsimde daha seyrek görülür');
    }
  }

  // Sürüde benzer vakalar
  if (d.herd === 'contagious' && Array.isArray(ctx?.herdCases)) {
    const similar = ctx.herdCases.filter(c => (c.codes || []).some(code => (d.findings[code] || 0) >= 2));
    if (similar.length > 0) {
      score += similar.length >= 2 ? 2 : 1;
      contextNotes.push(`Sürüde son ${rules.herdWindowDays} günde benzer belirtili ${similar.length} hayvan (${similar.slice(0, 3).map(c => c.animalId).join(', ')}) — bulaşıcı hastalığı destekler`);
    }
  }

  // Aşı
  if (d.vaccineKeywords && Array.isArray(ctx?.vaccines)) {
    const v = ctx.vaccines.find(x => x.daysAgo <= rules.vaccineValidDays &&
      d.vaccineKeywords.some(k => String(x.name || '').toLocaleLowerCase('tr-TR').includes(k)));
    if (v) {
      score -= 2.5;
      against.push(`Son 12 ayda aşılanmış: ${v.name} (${v.date}) — aşı tam koruma sağlamayabilir`);
    }
  }

  // Parazit ilacı
  if (d.dewormSensitive && Number.isFinite(ctx?.dewormDaysAgo) && ctx.dewormDaysAgo <= rules.dewormEffectDays) {
    score -= 1;
    against.push(`${ctx.dewormDaysAgo} gün önce parazit ilacı verilmiş — ilaç direnci ya da yeniden bulaşma yoksa olasılık düşer`);
  }

  return { score, supporting: supporting.sort((a, b) => b.weight - a.weight), against, contextNotes, missingKey };
}

/** Bulguların ayırt ettiriciliği: üst sıradaki hastalıklar arasındaki ağırlık farkı (olasılık ağırlıklı varyans) */
function _suggestQuestions(top, ans, tClass, skip = new Set(), limit = 5) {
  const candidates = new Set();
  top.forEach(r => {
    Object.keys(r.disease.findings).forEach(c => candidates.add(c));
    r.disease.key.forEach(c => candidates.add(c));
  });
  if (!tClass) candidates.add('fever');

  const total = top.reduce((s, r) => s + r.probability, 0) || 1;
  const scored = [];
  candidates.forEach(code => {
    if (ans[code] !== undefined || skip.has(code)) return;
    const f = FINDING_BY_CODE.get(code);
    if (!f) return;
    const values = top.map(r => {
      if (code === 'fever') return ['high', 'mild'].includes(r.disease.fever) ? 2 : r.disease.fever === 'any' ? 1 : 0;
      return (r.disease.findings[code] || 0) + (r.disease.key.includes(code) ? 1.5 : 0);
    });
    const mean = top.reduce((s, r, i) => s + (r.probability / total) * values[i], 0);
    const variance = top.reduce((s, r, i) => s + (r.probability / total) * (values[i] - mean) ** 2, 0);
    // Ayırt ettiricilik (varyans) + doğrulayıcılık (beklenen ağırlık): tek aday kaldığında da soru önerilir
    const info = (variance + 0.15 * mean) * (f.generic ? 0.3 : 1);
    if (info <= 0.05) return;
    scored.push({
      code,
      label: f.label,
      question: f.question,
      help: f.help || '',
      info,
      pointsTo: top.filter((r, i) => values[i] >= 2).map(r => r.name).slice(0, 3)
    });
  });
  return scored.sort((a, b) => b.info - a.info).slice(0, limit);
}

function _redFlags(ans, temperature, tClass) {
  const flags = [];
  const t = Number(temperature);
  if (ans.recumbent) flags.push({ level: 'emergency', text: 'Yatıyor ve kalkamıyor' });
  if (ans.breathing) flags.push({ level: 'emergency', text: 'Solunum güçlüğü' });
  if (ans.bloat && (ans.breathing || ans.recumbent)) flags.push({ level: 'emergency', text: 'Şişkinlik ile nefes darlığı / yatma — dakikalar önemli' });
  if (ans.udder_cold_dark) flags.push({ level: 'emergency', text: 'Soğuk, morarmış meme' });
  if (ans.bloody_orifices) flags.push({ level: 'emergency', text: 'Ölüde doğal deliklerden kan — şarbon şüphesi, ölüyü açmayın' });
  if (ans.urinary_strain) flags.push({ level: 'emergency', text: 'İdrar yapamama' });
  if (tClass === 'low') flags.push({ level: 'emergency', text: 'Vücut ısısı düşük' });
  if (Number.isFinite(t) && t >= 41.5) flags.push({ level: 'emergency', text: `Çok yüksek ateş (${t} °C)` });
  if (ans.sudden_death) flags.push({ level: 'urgent', text: 'Sürüde ani ölüm' });
  if (ans.abortion) flags.push({ level: 'urgent', text: 'Yavru atma — insana bulaşabilecek hastalıklar açısından dikkat' });
  return flags;
}

/**
 * @param {{ answers?: Object<string, boolean>, temperature?: number|string|null, context?: Object }} input
 *   context: { species, sex, ageDays, ageBounds, repro: { pregnant, latePregnancy, periparturient, lactating },
 *              month, herdCases: [{ animalId, codes }], vaccines: [{ name, date, daysAgo }], dewormDaysAgo,
 *              derived: { code: { value, source } } }
 * @returns {{ results, urgency, redFlags, notifiable, zoonotic, confidence, questions, answers, temperatureClass, presentCount }}
 */
export function diagnose(input = {}, rules = DIAGNOSIS_RULES) {
  const ctx = input.context || {};
  const ans = _mergeAnswers(input.answers, ctx.derived);
  const tClass = temperatureClass(input.temperature, ans, rules);
  const presentCount = Object.entries(ans).filter(([c, v]) => v === true && FINDING_BY_CODE.get(c)?.group !== 'history' && c !== 'fever').length;

  const scored = [];
  DISEASES.forEach(d => {
    const s = _scoreDisease(d, ans, tClass, ctx, rules);
    if (s) scored.push({ disease: d, ...s });
  });

  // Göreli olasılık (softmax). "Başka bir neden" sabit puanla yarışır: bulgular zayıf eşleşiyorsa
  // hiçbir hastalık yüksek olasılık almaz.
  const max = scored.reduce((m, r) => Math.max(m, r.score), rules.otherCauseScore);
  const exps = scored.map(r => Math.exp((r.score - max) / rules.softmaxScale));
  const otherExp = Math.exp((rules.otherCauseScore - max) / rules.softmaxScale);
  const sum = exps.reduce((s, e) => s + e, 0) + otherExp;
  scored.forEach((r, i) => { r.probability = exps[i] / sum; });
  const otherProbability = scored.length ? otherExp / sum : 0;
  scored.sort((a, b) => b.probability - a.probability);

  const results = scored
    .filter((r, i) => i === 0 || r.probability >= rules.minProbability)
    .slice(0, rules.maxResults)
    .map(r => ({
      id: r.disease.id,
      name: r.disease.name,
      agent: r.disease.agent,
      category: r.disease.category,
      probability: r.probability,
      score: Math.round(r.score * 10) / 10,
      supporting: r.supporting,
      against: r.against,
      contextNotes: r.contextNotes,
      missingKey: r.missingKey,
      notifiable: !!r.disease.notifiable,
      zoonotic: !!r.disease.zoonotic,
      urgency: r.disease.urgency,
      summary: r.disease.summary,
      actions: r.disease.actions,
      vetChecks: r.disease.vetChecks,
      prevention: r.disease.prevention,
      disease: r.disease
    }));

  const redFlags = _redFlags(ans, input.temperature, tClass);
  const rankOf = (u) => URGENCY_LEVELS[u]?.rank || 0;
  let urgency = null;
  results.forEach((r, i) => {
    if ((i === 0 || r.probability >= 0.15) && rankOf(r.urgency) > rankOf(urgency)) urgency = r.urgency;
  });
  redFlags.forEach(f => { if (rankOf(f.level) > rankOf(urgency)) urgency = f.level; });

  const top = results[0];
  const answeredCount = Object.keys(ans).length + (tClass ? 1 : 0);
  const confidence = !top ? null
    : top.probability >= 0.55 && answeredCount >= 6 ? 'high'
    : top.probability >= 0.35 ? 'medium' : 'low';

  return {
    results: results.map(({ disease: _d, ...r }) => r),
    urgency,
    redFlags,
    notifiable: results.filter(r => r.notifiable && r.probability >= 0.08).map(r => r.name),
    zoonotic: results.filter(r => r.zoonotic && r.probability >= 0.15).map(r => r.name),
    confidence,
    questions: results.length ? _suggestQuestions(results.slice(0, 6), ans, tClass, new Set(input.skip || [])) : [],
    answers: ans,
    temperatureClass: tClass,
    presentCount,
    otherProbability
  };
}

export const CONFIDENCE_TEXT = {
  high: 'Güçlü ön değerlendirme',
  medium: 'Orta güvenli ön değerlendirme',
  low: 'Zayıf — daha fazla bulgu gerekli'
};
