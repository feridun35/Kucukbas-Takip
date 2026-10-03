/**
 * ShepherdAI — Teşhis Asistanı Bilgi Tabanı (core/diagnosisEngine.js kullanır)
 *
 * Koyun ağırlıklı; Türkiye'de sık görülen hastalıklar. Kesin tanı ve tedavi veteriner hekime aittir:
 * buradaki bilgiler ayırıcı tanıyı daraltmak, aciliyeti belirlemek ve ilk adımları göstermek içindir.
 *
 * Bulgu ağırlıkları (findings): 3 = çok tipik, 2 = sık görülür, 1 = görülebilir.
 * key: hastalığın neredeyse her vakasında görülen bulgular — "yok" denirse olasılık belirgin düşer.
 * fever: 'high' (yüksek ateş beklenir) | 'mild' (hafif/orta ateş) | 'none' (ateş beklenmez) |
 *        'low' (normal ya da düşük ısı) | 'any' (ayırt ettirmez)
 * age: { min, max } gün — aralık dışı olasılığı düşürür; strict: true ise çok dışında elenir.
 * repro: 'latePregnancy' | 'periparturient' | 'lactating' | 'pregnant' — gereken üreme durumu.
 * herd: 'contagious' (sürüde yayılır) | 'individual' | 'either'
 * urgency: 'emergency' (hemen veteriner) | 'urgent' (aynı gün) | 'soon' (1–2 gün) | 'routine'
 */

/** Bulgu grupları (arayüzde bu sırayla gösterilir) */
export const FINDING_GROUPS = [
  { id: 'general', label: 'Genel durum', icon: '🌡️' },
  { id: 'respiratory', label: 'Solunum', icon: '🫁' },
  { id: 'digestive', label: 'Sindirim', icon: '🦠' },
  { id: 'neuro', label: 'Sinir sistemi', icon: '🧠' },
  { id: 'locomotor', label: 'Ayak ve hareket', icon: '🦶' },
  { id: 'head', label: 'Ağız, yüz ve göz', icon: '👄' },
  { id: 'skin', label: 'Deri, yün ve lenf', icon: '🐑' },
  { id: 'blood', label: 'Kansızlık ve kan', icon: '🩸' },
  { id: 'repro', label: 'Meme, doğum ve idrar', icon: '🍼' },
  { id: 'newborn', label: 'Yeni doğan', icon: '🐣' },
  { id: 'history', label: 'Yem, mera ve geçmiş', icon: '🌾' }
];

/**
 * Bulgular. Belirti kaydındaki kodlar (data/symptom-catalog.js) aynı anlamla kullanılır.
 * generic: birçok hastalıkta görülen, tek başına ayırt ettirmeyen bulgu.
 */
export const FINDINGS = [
  // Genel
  { code: 'fever', group: 'general', label: 'Ateş (≥ 40 °C)', question: 'Rektal ısı 40 °C veya üzerinde mi?', help: 'Termometreyi makattan 1 dakika tutun. Normal: 38.5–39.9 °C.' },
  { code: 'anorexia', group: 'general', label: 'İştahsızlık', question: 'Yem yemiyor ya da geviş getirmiyor mu?', generic: true },
  { code: 'lethargy', group: 'general', label: 'Halsizlik / durgunluk', question: 'Sürüden ayrı, başı önde, durgun mu?', generic: true },
  { code: 'recumbent', group: 'general', label: 'Yatıyor, kalkamıyor', question: 'Yatıyor ve kaldırınca ayakta duramıyor mu?' },
  { code: 'weight_loss', group: 'general', label: 'Zayıflama (haftalar içinde)', question: 'Son haftalarda belirgin zayıfladı mı (omurga, kaburga belirgin)?' },
  { code: 'teeth_grinding', group: 'general', label: 'Diş gıcırdatma', question: 'Dişlerini gıcırdatıyor mu (ağrı belirtisi)?' },
  { code: 'sweet_breath', group: 'general', label: 'Nefeste aseton / tatlı koku', question: 'Nefesinde çürük elma ya da aseton gibi tatlımsı koku var mı?' },
  { code: 'sudden_death', group: 'general', label: 'Sürüde ani ölüm', question: 'Son 2 haftada sürüde hasta görünmeden ölen hayvan oldu mu?' },
  { code: 'bloody_orifices', group: 'general', label: 'Ölüde ağız-burun-anüsten koyu kan', question: 'Ölen hayvanın ağız, burun ya da anüsünden pıhtılaşmayan koyu kan geldi mi, ölü çok çabuk şişti mi?' },

  // Solunum
  { code: 'nasal_discharge', group: 'respiratory', label: 'Burun akıntısı', question: 'Burnundan akıntı (sulu, sarı ya da yeşil) var mı?' },
  { code: 'cough', group: 'respiratory', label: 'Öksürük', question: 'Öksürüyor mu?' },
  { code: 'breathing', group: 'respiratory', label: 'Solunum güçlüğü', question: 'Hızlı, zorlu ya da ağızdan soluyor mu? Karın solunuma katılıyor mu?' },
  { code: 'head_shaking', group: 'respiratory', label: 'Baş sallama, hapşırma', question: 'Sık hapşırıyor, başını sallıyor ya da burnunu yere sürtüyor mu?' },

  // Sindirim
  { code: 'diarrhea', group: 'digestive', label: 'İshal', question: 'İshali var mı (sulu ya da yumuşak dışkı, kuyruk altı kirli)?' },
  { code: 'bloody_diarrhea', group: 'digestive', label: 'Kanlı / sümüksü ishal', question: 'Dışkıda kan ya da sümük var mı, ıkınıyor mu?' },
  { code: 'bloat', group: 'digestive', label: 'Karında şişlik (sol taraf)', question: 'Karnın sol üst tarafı davul gibi şiş mi?' },
  { code: 'abdominal_pain', group: 'digestive', label: 'Karın ağrısı', question: 'Karnına tekme atıyor, inliyor, kambur duruyor ya da sık yatıp kalkıyor mu?' },
  { code: 'salivation', group: 'digestive', label: 'Aşırı salya', question: 'Ağzından salya akıyor ya da köpük var mı?' },

  // Sinir sistemi
  { code: 'neuro_circling', group: 'neuro', label: 'Daire çizme / baş bir yana eğik', question: 'Hep aynı yöne dönüyor ya da başı bir tarafa eğik mi?' },
  { code: 'neuro_blind', group: 'neuro', label: 'Görmüyor gibi / başını dayıyor', question: 'Bir yerlere çarpıyor, başını duvara dayıyor ya da başı yukarıda "yıldızlara bakıyor" mu?' },
  { code: 'tremor', group: 'neuro', label: 'Titreme / kasılma / nöbet', question: 'Kaslarında titreme, kasılma ya da nöbet var mı?' },
  { code: 'facial_paralysis', group: 'neuro', label: 'Yüz felci (kulak/dudak sarkık)', question: 'Yüzün bir tarafında kulak, göz kapağı ya da dudak sarkık mı?' },
  { code: 'stiff_gait', group: 'neuro', label: 'Kaskatı yürüyüş', question: 'Bacakları kaskatı, kuyruğu dik, çenesi kilitli gibi mi; ya da kuzu sert adımlarla zor yürüyor mu?' },

  // Ayak ve hareket
  { code: 'lameness', group: 'locomotor', label: 'Topallık', question: 'Topallıyor mu?' },
  { code: 'foot_smell', group: 'locomotor', label: 'Tırnak arasında kokulu yara', question: 'Tırnak arasında kötü kokulu, ıslak yara ya da tırnak ayrılması var mı?' },
  { code: 'swollen_joints', group: 'locomotor', label: 'Eklemlerde şişlik', question: 'Diz, bilek ya da diğer eklemlerde sıcak şişlik var mı?' },

  // Ağız, yüz ve göz
  { code: 'mouth_lesion', group: 'head', label: 'Ağızda yara / kabarcık', question: 'Dilde, damakta ya da diş etinde yara, kabarcık ya da soyulma var mı?' },
  { code: 'lip_scabs', group: 'head', label: 'Dudakta kabuklu siğil benzeri yara', question: 'Dudak kenarında ya da burunda kabuklu, siğil gibi yaralar var mı?' },
  { code: 'face_swelling', group: 'head', label: 'Yüz, dudak ya da dil şişliği', question: 'Yüzü, dudakları, kulakları ya da dili şiş mi; dil morumsu mu?' },
  { code: 'eye_discharge', group: 'head', label: 'Göz akıntısı / sulanma', question: 'Gözlerinde akıntı ya da sulanma var mı?' },
  { code: 'eye_cloudy', group: 'head', label: 'Gözde bulanıklık / beyazlık', question: 'Göz yüzeyi bulanık, beyaz ya da kırmızı mı; gözünü kısıyor mu?' },

  // Deri, yün ve lenf
  { code: 'itching', group: 'skin', label: 'Kaşıntı', question: 'Kendini bir yerlere sürtüyor, yününü ısırıyor mu?' },
  { code: 'wool_loss', group: 'skin', label: 'Yün dökülmesi / kabuklanma', question: 'Yünü kümeler hâlinde dökülüyor, altında kabuk var mı?' },
  { code: 'skin_nodules', group: 'skin', label: 'Deride kabarcık / nodül', question: 'Yünsüz yerlerde (kuyruk altı, meme, yüz) kırmızı kabarcık ya da sert nodüller var mı?' },
  { code: 'abscess', group: 'skin', label: 'İrinli apse', question: 'Kulak altında, omuz önünde ya da kasıkta içi koyu irin dolu apse var mı?' },
  { code: 'swollen_lymph', group: 'skin', label: 'Lenf bezlerinde büyüme', question: 'Kulak altı, omuz önü ya da diz önü lenf bezleri büyümüş mü?' },
  { code: 'ticks', group: 'skin', label: 'Üzerinde kene var', question: 'Üzerinde (kulak, kasık, kuyruk altı) kene görüyor musunuz?' },

  // Kansızlık ve kan
  { code: 'pale_mucosa', group: 'blood', label: 'Göz kapağı içi soluk / beyaz', question: 'Alt göz kapağının içi soluk pembe ya da beyaz mı?', help: 'FAMACHA: Kırmızı-pembe normaldir; soluk pembe ve beyaz kansızlığı gösterir.' },
  { code: 'bottle_jaw', group: 'blood', label: 'Çene altında şişlik (su toplama)', question: 'Çene altında yumuşak, hamur gibi şişlik var mı?' },
  { code: 'jaundice', group: 'blood', label: 'Sarılık', question: 'Göz akı ya da ağız içi sarımsı mı?' },
  { code: 'red_urine', group: 'blood', label: 'Kırmızı / koyu idrar', question: 'İdrarı kırmızı ya da kahverengi mi?' },

  // Meme, doğum ve idrar
  { code: 'udder_swelling', group: 'repro', label: 'Memede şişlik, sertlik, sıcaklık', question: 'Memenin bir ya da iki tarafı şiş, sert ve sıcak mı?' },
  { code: 'milk_abnormal', group: 'repro', label: 'Sütte pıhtı, kan ya da sulanma', question: 'Sütte pıhtı, kan, irin var ya da süt sulanmış mı?' },
  { code: 'udder_cold_dark', group: 'repro', label: 'Meme soğuk, morumsu', question: 'Meme soğuk, mor-siyah renkte ya da süt yerine kanlı su mu geliyor?' },
  { code: 'abortion', group: 'repro', label: 'Yavru atma / ölü doğum', question: 'Yavru attı ya da ölü veya çok zayıf yavru doğurdu mu?' },
  { code: 'urinary_strain', group: 'repro', label: 'İdrar yaparken ıkınma', question: 'İdrar yapmak için ıkınıyor, idrar damla damla mı geliyor? (erkekte)' },

  // Yeni doğan
  { code: 'weak_newborn', group: 'newborn', label: 'Yeni doğan emmiyor / zayıf', question: 'Yavru emmiyor, ayağa kalkamıyor ya da ağzı soğuk mu?' },
  { code: 'navel_swelling', group: 'newborn', label: 'Göbekte şişlik / akıntı', question: 'Göbek kordonu şiş, ıslak ya da irinli mi?' },

  // Yem, mera ve geçmiş (açıklama gerektirmeyen ortam bilgileri)
  { code: 'recent_feed_change', group: 'history', label: 'Yem değişikliği / bol arpa', question: 'Son 1–2 haftada yemi değişti ya da fazla arpa, buğday, kesif yem yedi mi?' },
  { code: 'lush_pasture', group: 'history', label: 'Taze yonca / yeşil mera', question: 'Taze yonca, üçgül ya da çok yeşil meraya çıktı mı?' },
  { code: 'wet_pasture', group: 'history', label: 'Islak / bataklık mera', question: 'Islak, çamurlu ya da bataklık alanda otluyor mu?' },
  { code: 'silage_fed', group: 'history', label: 'Silaj yiyor', question: 'Silaj (özellikle bozuk, küflü) yiyor mu?' },
  { code: 'recent_wound', group: 'history', label: 'Yakın zamanda yara / kırkım / kastrasyon', question: 'Son 3 haftada kırkım, kastrasyon, kuyruk kesme ya da derin yara oldu mu?' },
  { code: 'new_animals', group: 'history', label: 'Sürüye yeni hayvan katıldı', question: 'Son 1 ayda sürüye dışarıdan hayvan katıldı ya da sürü pazara gitti mi?' },
  { code: 'dogs_on_farm', group: 'history', label: 'Köpeklere sakatat veriliyor', question: 'Çiftlikte köpekler var ve kesilen hayvanların baş/sakatatı köpeklere veriliyor mu?' }
];

export const URGENCY_LEVELS = {
  emergency: { rank: 4, label: 'ACİL — hemen veteriner hekim çağırın', color: 'var(--danger-red)', icon: '🚨' },
  urgent: { rank: 3, label: 'Bugün veteriner hekime gösterin', color: 'var(--warning-orange)', icon: '⚠️' },
  soon: { rank: 2, label: '1–2 gün içinde veteriner hekime danışın', color: 'var(--accent-amber)', icon: '🩺' },
  routine: { rank: 1, label: 'Takip edin, ilk kontrolde veteriner hekime sorun', color: 'var(--accent-green)', icon: '📋' }
};

/** Teşhis kuralları (eşikler) */
export const DIAGNOSIS_RULES = {
  feverAt: 40.0,              // ≥ ateş
  highFeverAt: 41.0,          // ≥ yüksek ateş
  hypothermiaBelow: 37.5,     // < düşük ısı
  latePregnancyDays: 42,      // doğuma ≤ 6 hafta: gebeliğin son dönemi
  periparturientDays: 21,     // doğumdan sonraki 3 hafta
  lactationDays: 120,         // doğumdan sonra laktasyon kabulü
  vaccineValidDays: 365,      // aşı koruması (yaklaşık)
  dewormEffectDays: 30,       // parazit ilacından sonra kansızlık olasılığı düşer
  herdWindowDays: 7,          // sürüde benzer belirti penceresi
  herdDeathWindowDays: 14,    // sürüde ani ölüm penceresi
  newAnimalWindowDays: 30,
  softmaxScale: 1.5,          // puan → göreli olasılık
  otherCauseScore: 4,         // "bilgi tabanında olmayan başka bir neden" payı: zayıf eşleşmede aşırı kesinliği önler
  minProbability: 0.03,       // listede gösterim alt sınırı
  maxResults: 6
};

const D = (o) => o;

export const DISEASES = [
  D({
    id: 'enterotoxemia', name: 'Enterotoksemi (Çelerme)', agent: 'Clostridium perfringens tip D toksini',
    category: 'Bakteriyel – ani ölüm', species: ['sheep', 'goat'], prevalence: 3,
    findings: { sudden_death: 3, recumbent: 2, tremor: 2, neuro_blind: 1, diarrhea: 1, abdominal_pain: 1, anorexia: 1, lethargy: 1, recent_feed_change: 3, lush_pasture: 2 },
    key: [], fever: 'any', age: { min: 14, max: 730 }, herd: 'either', urgency: 'emergency',
    vaccineKeywords: ['enterotoks', 'çelerme', 'clostrid', 'klostrid', 'karma'],
    summary: 'Bağırsakta aşırı üreyen bakterinin toksini birkaç saat içinde öldürür. En çok iyi beslenen, hızlı büyüyen kuzularda ve kesif yeme ani geçişte görülür. Çoğu zaman tek belirti ani ölümdür.',
    actions: [
      'Hasta hayvanı hemen veteriner hekime gösterin; seyir çok hızlıdır.',
      'Sürüde kesif yemi (arpa, buğday) hemen azaltın, bol kaba yem (saman, kuru ot) verin.',
      'Aşısız sürüde veteriner hekimle hemen enterotoksemi aşısı planlayın.',
      'Yeni ölüm olursa nekropsi yaptırın; tanı genellikle böyle kesinleşir.'
    ],
    vetChecks: 'Nekropsi (yumuşak "pulpy" böbrek, kalp zarında sıvı), idrarda şeker, bağırsak içeriğinde toksin testi.',
    prevention: 'Yılda 2 kez aşı (kuzularda 3–4 hafta arayla 2 doz); yem geçişlerini 10–14 güne yayın.'
  }),
  D({
    id: 'pneumonia', name: 'Pastörelloz / Bakteriyel Zatürre', agent: 'Mannheimia haemolytica, Pasteurella multocida (çoğu zaman virüs + stres sonrası)',
    category: 'Solunum', species: ['sheep', 'goat'], prevalence: 3,
    findings: { breathing: 3, cough: 2, nasal_discharge: 2, eye_discharge: 1, anorexia: 1, lethargy: 1, sudden_death: 1, new_animals: 1 },
    key: [], fever: 'high', herd: 'contagious', seasons: [3, 4, 5, 9, 10, 11], urgency: 'urgent',
    vaccineKeywords: ['pastör', 'pasteur', 'pnömoni', 'zatürre', 'mannheim'],
    summary: 'Nakil, havalandırması kötü ağıl, ani hava değişimi gibi streslerden sonra akciğerlere yerleşen bakteriyel enfeksiyon. Kuzularda ani ölüme yol açabilir.',
    actions: [
      'Hasta hayvanı ayırın; ağılı havalandırın (amonyak kokusu olmamalı), cereyandan koruyun.',
      'Veteriner hekim uygun antibiyotiği (ör. oksitetrasiklin, florfenikol, tulatromisin) ve ateş düşürücüyü reçeteyle başlatır; erken tedavi önemlidir.',
      'Sürüdeki diğer hayvanların ısısını ölçün; ateşi olanları erken tedaviye alın.',
      'Bol temiz su ve kolay yenen yem verin.'
    ],
    vetChecks: 'Akciğer dinleme, tedaviye yanıt; ölüm olursa akciğer nekropsisi ve bakteri kültürü / antibiyogram.',
    prevention: 'Havalandırma, kalabalığı azaltma, nakil stresini azaltma; riskli dönem öncesi pastörella aşısı.'
  }),
  D({
    id: 'ppr', name: 'Küçük Ruminant Vebası (PPR)', agent: 'Morbillivirus (PPR virüsü)',
    category: 'Viral – ihbarı zorunlu', species: ['sheep', 'goat'], goatPreferred: true, prevalence: 2,
    findings: { mouth_lesion: 3, diarrhea: 3, nasal_discharge: 2, eye_discharge: 2, breathing: 2, cough: 1, salivation: 1, anorexia: 1, lethargy: 1, sudden_death: 1, new_animals: 2 },
    key: ['mouth_lesion', 'diarrhea'], fever: 'high', herd: 'contagious', urgency: 'emergency',
    notifiable: true, vaccineKeywords: ['ppr', 'veba'],
    summary: 'Çok bulaşıcı, ölümcül viral hastalık: yüksek ateş, göz-burun akıntısı, ağızda yaralar, ishal ve zatürre. Keçilerde daha ağır, koyunlarda da görülür.',
    actions: [
      'İhbarı zorunludur: hayvanları ayırın, sürü hareketini durdurun, İl/İlçe Tarım ve Orman Müdürlüğüne ve veteriner hekime hemen haber verin.',
      'Hayvan alım-satımı ve pazara çıkış yapmayın; ziyaretçileri kısıtlayın.',
      'Destek tedavisini (sıvı, ikincil enfeksiyona antibiyotik) veteriner hekim düzenler.'
    ],
    vetChecks: 'Resmî örnekleme: göz-burun svabı, kan; PCR ile doğrulama.',
    prevention: 'PPR aşısı (resmî programla), yeni hayvanları 3 hafta karantinada tutma.'
  }),
  D({
    id: 'sheep_pox', name: 'Koyun Çiçeği', agent: 'Capripoxvirus',
    category: 'Viral – ihbarı zorunlu', species: ['sheep'], prevalence: 2,
    findings: { skin_nodules: 3, nasal_discharge: 2, eye_discharge: 2, breathing: 1, salivation: 1, swollen_lymph: 1, anorexia: 1, lethargy: 1, new_animals: 1 },
    key: ['skin_nodules'], fever: 'high', herd: 'contagious', urgency: 'emergency',
    notifiable: true, vaccineKeywords: ['çiçek', 'pox'],
    summary: 'Yüksek ateşin ardından yünsüz bölgelerde (yüz, kuyruk altı, meme) kızarıklık, sonra sertleşen nodüller ve kabuklanma. Kuzularda ölüm oranı yüksektir.',
    actions: [
      'İhbarı zorunludur: hayvanları ayırın, İl/İlçe Tarım ve Orman Müdürlüğüne ve veteriner hekime hemen haber verin.',
      'Sürü hareketini, alım-satımı durdurun; ölü hayvanları gömmeden önce resmî ekibi bekleyin.',
      'İkincil enfeksiyonlar için tedaviyi veteriner hekim düzenler.'
    ],
    vetChecks: 'Nodülden biyopsi/kabuk örneği, PCR.',
    prevention: 'Yıllık çiçek aşısı (resmî program).'
  }),
  D({
    id: 'fmd', name: 'Şap', agent: 'Aphthovirus',
    category: 'Viral – ihbarı zorunlu', species: ['sheep', 'goat'], prevalence: 2,
    findings: { lameness: 3, mouth_lesion: 3, salivation: 2, anorexia: 1, lethargy: 1, sudden_death: 1, new_animals: 2 },
    key: [], fever: 'mild', herd: 'contagious', urgency: 'emergency',
    notifiable: true, vaccineKeywords: ['şap', 'fmd'],
    summary: 'Koyunlarda çoğu zaman hafif seyreder: ani topallık (tırnak arası ve taç bölgesinde kabarcık) ile ağızda küçük yaralar. Genç kuzularda kalp kası tutulumuyla ani ölüm olabilir. Sığırlara hızla bulaşır.',
    actions: [
      'İhbarı zorunludur: İl/İlçe Tarım ve Orman Müdürlüğüne ve veteriner hekime hemen haber verin.',
      'Hayvan, insan, araç girişini-çıkışını durdurun; sığırlarla teması kesin.',
      'Yumuşak yem ve temiz su verin; ayak yaralarını temiz ve kuru tutun.'
    ],
    vetChecks: 'Resmî örnekleme: kabarcık sıvısı/epiteli, kan; ELISA/PCR.',
    prevention: 'Şap aşısı (resmî program), hayvan hareketlerinde karantina.'
  }),
  D({
    id: 'bluetongue', name: 'Mavi Dil', agent: 'Orbivirus (sokucu sineklerle — Culicoides — bulaşır)',
    category: 'Viral – ihbarı zorunlu', species: ['sheep'], prevalence: 2,
    findings: { face_swelling: 3, salivation: 2, nasal_discharge: 2, mouth_lesion: 2, lameness: 2, breathing: 1, anorexia: 1, lethargy: 1, abortion: 1, wool_loss: 1 },
    key: [], fever: 'high', herd: 'either', seasons: [6, 7, 8, 9, 10, 11], urgency: 'emergency',
    notifiable: true, vaccineKeywords: ['mavi dil', 'bluetongue', 'btv'],
    summary: 'Yaz sonu-sonbaharda sokucu sineklerle bulaşır. Yüksek ateş, yüz-dudak-dil şişliği, salya, burun akıntısı, taç bandı iltihabına bağlı topallık. Dil morarabilir.',
    actions: [
      'İhbarı zorunludur: İl/İlçe Tarım ve Orman Müdürlüğüne ve veteriner hekime haber verin.',
      'Hayvanları gölgede, akşam-sabah sinekten korunaklı ağılda tutun; sinek kovucu uygulayın.',
      'Yumuşak yem ve su verin; ikincil enfeksiyon tedavisini veteriner hekim düzenler.'
    ],
    vetChecks: 'Kan örneği ile PCR / ELISA (resmî).',
    prevention: 'Bölgede salgın varsa mavi dil aşısı; sinek mücadelesi.'
  }),
  D({
    id: 'orf', name: 'Ektima (Orf – bulaşıcı dudak yarası)', agent: 'Parapoxvirus',
    category: 'Viral – insana bulaşabilir', species: ['sheep', 'goat'], prevalence: 3,
    findings: { lip_scabs: 3, mouth_lesion: 2, anorexia: 1, weight_loss: 1, udder_swelling: 1 },
    key: ['lip_scabs'], fever: 'any', age: { min: 0, max: 365 }, herd: 'contagious', urgency: 'soon',
    zoonotic: true, vaccineKeywords: ['ektima', 'orf'],
    summary: 'Dudak kenarında ve burunda kabuklu, siğil benzeri yaralar; kuzularda emmeyi zorlaştırır, annenin memesine bulaşabilir. 3–4 haftada kendiliğinden iyileşir.',
    actions: [
      'İnsana bulaşır: eldivensiz dokunmayın, ellerinizi yıkayın.',
      'Emmekte zorlanan kuzulara biberonla destek verin, annelerin memesini kontrol edin.',
      'Yaralara veteriner hekimin önerdiği antiseptik (ör. iyotlu gliserin) sürün; ikincil enfeksiyonda antibiyotik gerekebilir.',
      'Hasta hayvanları ayırın; yemlik ve emzikleri dezenfekte edin.'
    ],
    vetChecks: 'Klinik görünüm genellikle yeterli; şüphede kabuk örneği (PCR) — şap ve koyun çiçeğinden ayırt etmek için.',
    prevention: 'Sorunlu sürülerde canlı ektima aşısı (yalnızca hastalık olan sürüde, veteriner önerisiyle).'
  }),
  D({
    id: 'footrot', name: 'Ayak Çürüğü (İnterdigital nekrobasilloz)', agent: 'Dichelobacter nodosus + Fusobacterium necrophorum',
    category: 'Ayak', species: ['sheep', 'goat'], prevalence: 3,
    findings: { lameness: 3, foot_smell: 3, wet_pasture: 2, weight_loss: 1 },
    key: ['lameness', 'foot_smell'], fever: 'none', herd: 'contagious', urgency: 'soon',
    vaccineKeywords: ['ayak çürü', 'footrot', 'footvax'],
    summary: 'Islak, çamurlu ortamda tırnak arasında kötü kokulu iltihap ve tırnak duvarının ayrılması. Sürüde çok sayıda hayvanı topallatır, verim kaybettirir.',
    actions: [
      'Topal hayvanları ayırın, tırnakları temizleyip kesin (kesim artıkları yakılmalı).',
      'Ayak banyosu: %10 çinko sülfat, 5–10 dakika; sonra kuru zeminde bekletin.',
      'Ağır vakalarda veteriner hekim uzun etkili antibiyotik uygular.',
      'Islak, çamurlu alanları kurutun; tekrarlayan hayvanları ayıklamayı düşünün.'
    ],
    vetChecks: 'Klinik muayene; tırnak arası svabı ile etken tespiti.',
    prevention: 'Düzenli ayak banyosu ve tırnak bakımı, yeni hayvan karantinası, gerekirse aşı.'
  }),
  D({
    id: 'haemonchosis', name: 'Kan Emen Kıl Kurdu ve Mide-Bağırsak Kurtları', agent: 'Haemonchus contortus ve diğer nematodlar',
    category: 'Parazit', species: ['sheep', 'goat'], prevalence: 3,
    findings: { pale_mucosa: 3, bottle_jaw: 3, weight_loss: 2, lethargy: 1, diarrhea: 1, recumbent: 1, sudden_death: 1, wet_pasture: 1 },
    key: ['pale_mucosa'], fever: 'none', age: { min: 60, max: 100000 }, herd: 'either', seasons: [5, 6, 7, 8, 9, 10], urgency: 'urgent',
    dewormSensitive: true,
    summary: 'Abomasumda kan emen kurtlar ağır kansızlık yapar: göz kapağı içi beyazlaşır, çene altında su toplanır, hayvan halsizleşir ve ölebilir. Yaz-sonbaharda ve sulak merada artar.',
    actions: [
      'Tüm sürüde FAMACHA (göz kapağı içi rengi) kontrolü yapın; soluk/beyaz olanları ayırın.',
      'Veteriner hekime dışkı (gaita) muayenesi yaptırın; ilaç direnci için hangi ilacın işe yaradığını öğrenin.',
      'Kilosuna göre tam dozda ve yalnızca gereken hayvanlara parazit ilacı verin (az doz direnç yapar).',
      'Mümkünse temiz meraya alın; ağır kansızlıkta destek tedavisini veteriner hekim düzenler.'
    ],
    vetChecks: 'Gaita yumurta sayımı (EPG), kan (hematokrit), ilaç direnci testi.',
    prevention: 'Mera rotasyonu, FAMACHA ile seçici ilaçlama, ilaç sınıfı değişimi.'
  }),
  D({
    id: 'coccidiosis', name: 'Koksidiyoz', agent: 'Eimeria türleri (protozoon)',
    category: 'Parazit', species: ['sheep', 'goat'], prevalence: 3,
    findings: { diarrhea: 3, bloody_diarrhea: 3, weight_loss: 2, abdominal_pain: 1, anorexia: 1, lethargy: 1 },
    key: ['diarrhea'], fever: 'none', age: { min: 14, max: 150, strict: true }, herd: 'either', urgency: 'urgent',
    summary: '3 hafta ile 4 ay arası kuzularda, kalabalık ve nemli bölmelerde sümüksü/kanlı ishal, ıkınma ve gelişme geriliği.',
    actions: [
      'Veteriner hekime dışkı muayenesi yaptırın (ookist sayımı).',
      'Veteriner hekimin reçetesiyle toltrazuril ya da diklazuril; aynı bölmedeki tüm kuzular birlikte ele alınır.',
      'Ağızdan sıvı-elektrolit verin, yatakları kuru ve temiz tutun, yemlikleri yerden yükseltin.'
    ],
    vetChecks: 'Gaita ookist sayımı; ölümde bağırsak incelemesi.',
    prevention: 'Bölme hijyeni, kalabalığı azaltma, riskli dönemde koruyucu ilaçlama.'
  }),
  D({
    id: 'neonatal_diarrhea', name: 'Yeni Doğan İshali (Kolibasilloz, Rota, Kriptosporidium)', agent: 'E. coli, rotavirus, Cryptosporidium, Clostridium perfringens tip B',
    category: 'Yeni doğan', species: ['sheep', 'goat'], prevalence: 3,
    findings: { diarrhea: 3, weak_newborn: 2, lethargy: 2, recumbent: 1, salivation: 1, bloat: 1, bloody_diarrhea: 1 },
    key: ['diarrhea'], fever: 'any', age: { min: 0, max: 21, strict: true }, herd: 'either', urgency: 'emergency',
    zoonotic: true,
    summary: 'İlk 3 haftada sulu ishal, hızla su kaybı ve zayıflama. Yetersiz ağız sütü ve kirli doğum bölmesi en önemli nedenlerdir.',
    actions: [
      'Ağızdan sıvı-elektrolit verin (sütü kesmeden, öğünler arasında); kuzuyu sıcak tutun.',
      'Kuzunun ilk 6 saatte yeterli ağız sütü (kilogram başına ~50 ml) alıp almadığını kontrol edin.',
      'Veteriner hekim etkene göre tedavi (antibiyotik ya da kriptosporidiumda özel ilaç) düzenler.',
      'Doğum bölmesini temizleyin, kireçleyin; kriptosporidium insana bulaşabilir, eldiven kullanın.'
    ],
    vetChecks: 'Dışkıda hızlı test (E. coli K99, rota, kripto), dehidrasyon değerlendirmesi.',
    prevention: 'Doğum öncesi gebe aşılaması, ağız sütü yönetimi, doğum bölmesi hijyeni.'
  }),
  D({
    id: 'neonatal_hypothermia', name: 'Yeni Doğan Zayıflığı (Hipotermi / Açlık)', agent: 'Soğuk, açlık, yetersiz ağız sütü',
    category: 'Yeni doğan', species: ['sheep', 'goat'], prevalence: 3,
    findings: { weak_newborn: 3, recumbent: 2, lethargy: 2, anorexia: 1 },
    key: ['weak_newborn'], fever: 'low', age: { min: 0, max: 10, strict: true }, herd: 'individual', urgency: 'emergency',
    summary: 'İlk günlerde kuzu ölümlerinin en sık nedeni: soğuk ve aç kalan kuzu emme isteğini kaybeder, ağzı soğur.',
    actions: [
      'Isıyı ölçün: 37 °C altındaysa önce kademeli ısıtın (ılık ortam, ısıtıcı lamba), sonra besleyin.',
      'Emme refleksi yoksa sondayla ağız sütü verin (kilogram başına ~50 ml, günde 3–4 kez).',
      '5 saatten büyük ve çok düşük ısılı kuzuya veteriner hekim karın içi glukoz uygular.',
      'Annenin memesini ve sütünü kontrol edin; ikiz-üçüzlerde zayıf olanı destekleyin.'
    ],
    vetChecks: 'Rektal ısı, kan şekeri, ağız sütü alımı.',
    prevention: 'Kuru-cereyansız doğum yeri, ilk saatlerde emmenin kontrolü, gebelik sonu iyi besleme.'
  }),
  D({
    id: 'pregnancy_toxemia', name: 'Gebelik Toksemisi (Ketozis)', agent: 'Enerji yetersizliği (ikiz/üçüz gebelik, zayıf ya da aşırı yağlı koyun)',
    category: 'Metabolik', species: ['sheep', 'goat'], prevalence: 3,
    findings: { neuro_blind: 3, sweet_breath: 3, anorexia: 2, recumbent: 2, tremor: 2, lethargy: 2, teeth_grinding: 1 },
    key: [], fever: 'none', sex: 'female', repro: 'latePregnancy', herd: 'individual', urgency: 'emergency',
    summary: 'Gebeliğin son 6 haftasında, çoğunlukla ikiz taşıyan koyunlarda yetersiz enerji alımıyla: önce yemden kesilme ve sürüden ayrılma, sonra görme bozukluğu, titreme ve yatma.',
    actions: [
      'Hemen ağızdan propilen glikol verin (günde 2 kez ~60 ml) ve veteriner hekimi çağırın.',
      'Veteriner hekim damardan glukoz ve gerekirse doğumu başlatma / sezaryen kararı verir.',
      'Gebeliğin son dönemindeki diğer koyunların kondisyonunu ve rasyonunu hemen gözden geçirin (kesif yemi kademeli artırın).'
    ],
    vetChecks: 'Kanda ya da idrarda keton (BHB) ölçümü, kan şekeri.',
    prevention: 'Ultrasonla ikiz tespiti ve son 6 haftada artan enerji; koyunları aşırı yağlandırmayın.'
  }),
  D({
    id: 'hypocalcemia', name: 'Hipokalsemi (Süt Humması)', agent: 'Kan kalsiyumunun düşmesi',
    category: 'Metabolik', species: ['sheep', 'goat'], prevalence: 3,
    findings: { recumbent: 3, tremor: 2, lethargy: 2, stiff_gait: 1, bloat: 1, anorexia: 1 },
    key: [], fever: 'low', sex: 'female', repro: 'periparturient', herd: 'individual', urgency: 'emergency',
    summary: 'Doğum öncesi son haftalarda ya da doğumdan hemen sonra: titreme, sendeleme, yatma; ısı normal ya da düşüktür. Gebelik toksemisiyle birlikte olabilir.',
    actions: [
      'Veteriner hekimi hemen çağırın: kalsiyum çözeltisi damardan yavaşça ya da deri altına verilir; hızlı düzelme tanıyı destekler.',
      'Hayvanı göğüs üstü (sternal) pozisyonda tutun, yan yatmasına izin vermeyin (şişkinlik riski).',
      'Doğum yaklaşan koyunların rasyonundaki kalsiyum-fosfor dengesini veteriner hekimle gözden geçirin.'
    ],
    vetChecks: 'Kan kalsiyumu; kalsiyum tedavisine yanıt.',
    prevention: 'Gebelik sonu dengeli mineral, ani yem ve hava stresinden kaçınma.'
  }),
  D({
    id: 'hypomagnesemia', name: 'Çayır Tetanisi (Hipomagnezemi)', agent: 'Kan magnezyumunun düşmesi',
    category: 'Metabolik', species: ['sheep', 'goat'], prevalence: 2,
    findings: { tremor: 3, recumbent: 2, stiff_gait: 1, sudden_death: 1, lush_pasture: 3 },
    key: [], fever: 'none', repro: 'lactating', reproSoft: true, herd: 'either', seasons: [3, 4, 5, 10, 11], urgency: 'emergency',
    summary: 'Hızlı büyüyen taze çayıra çıkan, özellikle emziren koyunlarda: aşırı uyarılabilirlik, kasılmalar, nöbet ve ani ölüm.',
    actions: [
      'Veteriner hekimi hemen çağırın: magnezyum deri altına, kalsiyum damardan verilir.',
      'Hayvanı gürültüden uzak, sakin tutun; uyarı nöbeti tetikleyebilir.',
      'Sürüye magnezyumlu yalama taşı / mineral verin, taze meraya kademeli çıkarın.'
    ],
    vetChecks: 'Kan magnezyumu (ölümde göz sıvısında).',
    prevention: 'İlkbahar-sonbahar meralarında magnezyum takviyesi.'
  }),
  D({
    id: 'listeriosis', name: 'Listeriyoz (Beyin iltihabı)', agent: 'Listeria monocytogenes (çoğunlukla bozuk silajdan)',
    category: 'Sinir sistemi – insana bulaşabilir', species: ['sheep', 'goat'], prevalence: 2,
    findings: { facial_paralysis: 3, neuro_circling: 3, salivation: 2, silage_fed: 3, anorexia: 1, lethargy: 1, recumbent: 1, abortion: 1 },
    key: [], fever: 'mild', herd: 'either', seasons: [12, 1, 2, 3, 4, 5], urgency: 'urgent',
    zoonotic: true,
    summary: 'Kış-ilkbaharda silajla beslenen sürülerde: tek taraflı yüz felci (kulak, göz kapağı, dudak sarkık), salya, hep aynı yöne dönme. Gebe hayvanda yavru attırabilir.',
    actions: [
      'Veteriner hekime aynı gün gösterin: erken ve yüksek dozda antibiyotik (penisilin/oksitetrasiklin) şansı artırır.',
      'Bozuk, küflü ya da toprak karışmış silajı hemen kesin.',
      'Yiyemeyen hayvana sıvı ve yumuşak yem desteği verin.',
      'İnsana bulaşabilir: eldiven kullanın; gebe kadınlar hasta hayvan ve yavru atığına dokunmasın.'
    ],
    vetChecks: 'Klinik nörolojik muayene; ölümde beyin sapı incelemesi.',
    prevention: 'İyi fermente olmuş silaj (pH < 4.5), silajın taze tüketilmesi.'
  }),
  D({
    id: 'ccn', name: 'Serebrokortikal Nekroz (CCN – B1 vitamini eksikliği)', agent: 'Tiamin (B1) eksikliği, yüksek kesif / kükürt',
    category: 'Sinir sistemi', species: ['sheep', 'goat'], prevalence: 2,
    findings: { neuro_blind: 3, tremor: 2, recumbent: 2, neuro_circling: 1, recent_feed_change: 2 },
    key: ['neuro_blind'], fever: 'none', age: { min: 30, max: 730 }, herd: 'individual', urgency: 'emergency',
    summary: 'Genç ve besideki kuzularda, kesif ağırlıklı rasyonda: körlük, başın yukarı bükülmesi ("yıldızlara bakma"), kasılmalar.',
    actions: [
      'Veteriner hekim hemen B1 vitamini (tiamin) enjeksiyonu yapmalı; saatler içinde düzelme tanıyı destekler.',
      'Rasyonda kaba yemi artırın, kükürtlü katkıları gözden geçirin.'
    ],
    vetChecks: 'Tiamin tedavisine yanıt; ölümde beyin incelemesi (UV floresan).',
    prevention: 'Kesif yemde yeterli kaba yem, kükürt fazlasından kaçınma.'
  }),
  D({
    id: 'coenurosis', name: 'Koenurozis (Beyin kist kurdu – "dönek")', agent: 'Köpek şerit kurdunun (Taenia multiceps) beyindeki kisti',
    category: 'Sinir sistemi – parazit', species: ['sheep', 'goat'], prevalence: 2,
    findings: { neuro_circling: 3, neuro_blind: 2, weight_loss: 1, dogs_on_farm: 3 },
    key: ['neuro_circling'], fever: 'none', age: { min: 120, max: 1100 }, herd: 'individual', urgency: 'soon',
    summary: 'Haftalar içinde yavaş ilerleyen dönme, tek gözde körlük, başı eğme; ileride kafatasında yumuşama. Köpeklere çiğ beyin/sakatat verilen çiftliklerde görülür.',
    actions: [
      'Veteriner hekime muayene ettirin; kist yerine göre cerrahi çıkarma mümkün olabilir, çoğu zaman kesim önerilir.',
      'Çiftlikteki köpeklere düzenli (6–8 haftada bir) prazikuantel verin.',
      'Kesilen ya da ölen hayvanların baş ve iç organlarını köpeklere vermeyin, gömün ya da imha edin.'
    ],
    vetChecks: 'Nörolojik muayene, kafatası palpasyonu; ileri görüntüleme.',
    prevention: 'Köpeklerin şerit kurduna karşı düzenli ilaçlanması.'
  }),
  D({
    id: 'bloat', name: 'Şişkinlik (Rumen timpanisi)', agent: 'Köpüklü gaz (taze baklagil) ya da gaz çıkaramama',
    category: 'Sindirim', species: ['sheep', 'goat'], prevalence: 3,
    findings: { bloat: 3, abdominal_pain: 2, breathing: 2, recumbent: 1, sudden_death: 1, salivation: 1, lush_pasture: 3, recent_feed_change: 1 },
    key: ['bloat'], fever: 'none', herd: 'either', urgency: 'emergency',
    summary: 'Sol karın davul gibi şişer, nefes darlaşır; taze yonca-üçgül ya da çok kesif yemden sonra dakikalar-saatler içinde ölümcül olabilir.',
    actions: [
      'Hayvanı ayakta tutun ve yürütün; ön tarafı yüksekte olsun.',
      'Köpüklü şişkinlikte ağızdan 100–200 ml bitkisel yağ ya da köpük kesici verilebilir.',
      'Nefes darlığı ağırsa veteriner hekim sonda ya da trokar ile gazı boşaltır — beklemeyin.',
      'Sürüyü yonca/üçgül merasından hemen çıkarın.'
    ],
    vetChecks: 'Mide sondası ile köpüklü/serbest gaz ayrımı.',
    prevention: 'Baklagil meraya aç ve ıslakken çıkarmama, kademeli geçiş, köpük önleyici.'
  }),
  D({
    id: 'acidosis', name: 'Rumen Asidozu (Arpa / tahıl zehirlenmesi)', agent: 'Fazla kolay sindirilen karbonhidrat',
    category: 'Sindirim', species: ['sheep', 'goat'], prevalence: 3,
    findings: { recent_feed_change: 3, anorexia: 2, diarrhea: 2, abdominal_pain: 2, lethargy: 2, recumbent: 2, teeth_grinding: 1, neuro_blind: 1, bloat: 1, lameness: 1 },
    key: ['recent_feed_change'], fever: 'none', herd: 'either', urgency: 'emergency',
    summary: 'Bol arpa, buğday, ekmek ya da kesif yeme alışmamış hayvanlarda 12–36 saat içinde: yem yememe, sulu-ekşi kokulu ishal, sendeleme, yatma.',
    actions: [
      'Kesif yemi hemen kesin, yalnızca kuru ot ve su verin.',
      'Veteriner hekimi çağırın: ağızdan sodyum bikarbonat/magnezyum oksit, damardan sıvı, B1 vitamini; ağır vakada rumen boşaltma.',
      'Aynı yemi yiyen diğer hayvanları da izleyin.'
    ],
    vetChecks: 'Rumen sıvısı pH ölçümü, dehidrasyon.',
    prevention: 'Kesif yeme 10–14 günde kademeli geçiş, yem deposunu kapalı tutma.'
  }),
  D({
    id: 'mastitis', name: 'Mastitis (Meme iltihabı)', agent: 'Stafilokok, streptokok, Mannheimia vb.',
    category: 'Meme', species: ['sheep', 'goat'], prevalence: 3,
    findings: { udder_swelling: 3, milk_abnormal: 3, anorexia: 1, lethargy: 1, lameness: 1 },
    key: ['udder_swelling'], fever: 'any', sex: 'female', repro: 'lactating', reproSoft: true, herd: 'individual', urgency: 'urgent',
    summary: 'Memenin bir ya da iki yarısında şişlik, sertlik, sıcaklık; sütte pıhtı ya da kan. Ateş ve topallık (o taraftaki bacak) görülebilir.',
    actions: [
      'Etkilenen meme yarısını sık sık sağıp boşaltın; sütü yere değil kaba sağın ve imha edin.',
      'Veteriner hekim meme içi ve/veya kas içi antibiyotik ile ağrı kesici düzenler; mümkünse süt kültürü alınır.',
      'Kuzuları biberonla destekleyin; arınma süresince süt satışı yapmayın.'
    ],
    vetChecks: 'California Mastitis Testi (CMT), süt kültürü ve antibiyogram.',
    prevention: 'Sağım hijyeni, kuru dönem tedavisi, kronik vakaları ayıklama.'
  }),
  D({
    id: 'gangrenous_mastitis', name: 'Kangrenli Mastitis ("Mavi meme")', agent: 'Staphylococcus aureus, Mannheimia haemolytica',
    category: 'Meme', species: ['sheep', 'goat'], prevalence: 2,
    findings: { udder_cold_dark: 3, udder_swelling: 2, recumbent: 2, anorexia: 2, lethargy: 2, milk_abnormal: 1 },
    key: ['udder_cold_dark'], fever: 'any', sex: 'female', repro: 'lactating', reproSoft: true, herd: 'individual', urgency: 'emergency',
    summary: 'Meme önce sıcak ve şiş, sonra soğuk, mor-siyah olur; süt yerine kanlı su gelir. Hayvanın hayatı tehlikededir.',
    actions: [
      'Veteriner hekimi hemen çağırın: damardan antibiyotik, sıvı ve ağrı kesici; gerekirse meme yarısının alınması.',
      'Kuzuları ayırıp biberonla besleyin.'
    ],
    vetChecks: 'Klinik görünüm, süt/doku kültürü.',
    prevention: 'Sağım ve kuzu emzirme hijyeni, meme uç yaralarının tedavisi.'
  }),
  D({
    id: 'pinkeye', name: 'Bulaşıcı Göz İltihabı (Pembe göz)', agent: 'Mycoplasma conjunctivae, Chlamydia',
    category: 'Göz', species: ['sheep', 'goat'], prevalence: 3,
    findings: { eye_discharge: 3, eye_cloudy: 3 },
    key: ['eye_discharge'], fever: 'none', herd: 'contagious', seasons: [5, 6, 7, 8, 9, 10], urgency: 'soon',
    summary: 'Gözde sulanma, kızarıklık, ışıktan kaçma ve korneada bulanıklaşma; sürüde hızla yayılır, çoğu 2–3 haftada iyileşir.',
    actions: [
      'Hasta hayvanları ayırın, gölgede ve tozsuz yerde tutun; sinekle mücadele edin.',
      'Veteriner hekimin önerdiği göz merhemi (ör. oksitetrasiklin) ya da enjeksiyon uygulayın.',
      'Göremeyen hayvanların yem ve suya ulaşmasını sağlayın.'
    ],
    vetChecks: 'Göz muayenesi, gerekirse svab ile etken tespiti.',
    prevention: 'Sinek kontrolü, yeni hayvan karantinası.'
  }),
  D({
    id: 'scab', name: 'Koyun Uyuzu (Psoroptes)', agent: 'Psoroptes ovis (akar)',
    category: 'Deri – parazit', species: ['sheep'], prevalence: 3,
    findings: { itching: 3, wool_loss: 3, weight_loss: 1, new_animals: 1 },
    key: ['itching'], fever: 'none', herd: 'contagious', seasons: [10, 11, 12, 1, 2, 3, 4], urgency: 'soon',
    summary: 'Kış aylarında şiddetli kaşıntı, yün dökülmesi ve sarı kabuklar; sürüde hızla yayılır, kondisyon ve yapağı kaybettirir.',
    actions: [
      'Tüm sürü birlikte tedavi edilmeli: veteriner hekimin önerdiği enjeksiyonluk ilaç (ör. ivermektin/doramektin, genellikle 7–10 gün arayla 2 kez) ya da banyo.',
      'Ağıl, kaşınma direkleri ve ekipmanı ilaçlayın; tedavi edilmemiş hayvanla teması kesin.'
    ],
    vetChecks: 'Deri kazıntısında akar arama.',
    prevention: 'Yeni hayvanları karantinada tedavi etme, sonbaharda koruyucu uygulama.'
  }),
  D({
    id: 'tick_borne', name: 'Kene Kaynaklı Kan Parazitleri (Babesiyoz, Teileriyoz, Anaplazmoz)', agent: 'Babesia, Theileria, Anaplasma',
    category: 'Kan paraziti', species: ['sheep', 'goat'], prevalence: 3,
    findings: { ticks: 3, jaundice: 3, red_urine: 3, pale_mucosa: 2, swollen_lymph: 2, anorexia: 1, lethargy: 1, breathing: 1 },
    key: [], fever: 'high', herd: 'either', seasons: [4, 5, 6, 7, 8, 9, 10], urgency: 'urgent',
    summary: 'İlkbahar-yaz kene mevsiminde yüksek ateş, kansızlık, sarılık; babesiyozda kırmızı idrar, teileriyozda lenf bezi büyümesi. Hızlı tedavi edilmezse öldürür.',
    actions: [
      'Veteriner hekime aynı gün gösterin: kan frotisiyle etken belirlenir ve ona özel ilaç (imidokarb, buparvakon, oksitetrasiklin) uygulanır.',
      'Hayvanı stresten, sıcaktan koruyun; zorla yürütmeyin.',
      'Sürünün kenelerini temizleyin, kene ilacı uygulamasını planlayın.'
    ],
    vetChecks: 'Kan frotisi, hematokrit, gerekirse PCR.',
    prevention: 'Kene mücadelesi, kene mevsiminde düzenli kontrol.'
  }),
  D({
    id: 'cla', name: 'Kazeöz Lenfadenit (Apse hastalığı)', agent: 'Corynebacterium pseudotuberculosis',
    category: 'Kronik bakteriyel', species: ['sheep', 'goat'], prevalence: 3,
    findings: { abscess: 3, swollen_lymph: 3, weight_loss: 1 },
    key: [], fever: 'none', age: { min: 180, max: 100000 }, herd: 'contagious', urgency: 'routine',
    summary: 'Lenf bezlerinde yavaş büyüyen, içi koyu yeşil-sarı irin dolu apseler; iç organlarda olursa zayıflatır. Apse patlayınca sürüye bulaşır.',
    actions: [
      'Apseli hayvanı ayırın; apseyi sürüden uzakta veteriner hekim açıp temizlesin, irini yakın/gömün.',
      'Tekrarlayan ya da çok apseli hayvanları ayıklamayı düşünün.',
      'Kırkım makinesi ve yemlikleri dezenfekte edin.'
    ],
    vetChecks: 'İrinden kültür, serolojik test.',
    prevention: 'Apseli hayvanı en son kırkma, yara önleme, gerekirse aşı.'
  }),
  D({
    id: 'urolithiasis', name: 'İdrar Taşı (Ürolitiyazis)', agent: 'Yüksek fosforlu kesif yem, az su',
    category: 'İdrar yolu', species: ['sheep', 'goat'], prevalence: 2,
    findings: { urinary_strain: 3, abdominal_pain: 2, anorexia: 1, teeth_grinding: 1, lethargy: 1, recumbent: 1, recent_feed_change: 1 },
    key: ['urinary_strain'], fever: 'none', sex: 'male', herd: 'individual', urgency: 'emergency',
    summary: 'Besideki erkek kuzu ve koçlarda idrar yolunun taşla tıkanması: ıkınma, damla damla ya da hiç idrar, karın ağrısı. Mesane yırtılabilir.',
    actions: [
      'Hemen veteriner hekimi çağırın: tıkanıklığın açılması (penis ucunun kesilmesi) ya da cerrahi gerekir.',
      'Sürüde rasyonu gözden geçirin: Ca:P oranı en az 2:1, bol temiz su, gerekirse amonyum klorür ve tuz.'
    ],
    vetChecks: 'Karın ultrasonu, idrar yolu muayenesi.',
    prevention: 'Dengeli mineral, bol su, rasyona tuz.'
  }),
  D({
    id: 'tetanus', name: 'Tetanoz', agent: 'Clostridium tetani toksini',
    category: 'Bakteriyel – sinir', species: ['sheep', 'goat'], prevalence: 2,
    findings: { stiff_gait: 3, recent_wound: 3, tremor: 2, recumbent: 2, bloat: 1 },
    key: ['stiff_gait'], fever: 'any', herd: 'individual', urgency: 'emergency',
    vaccineKeywords: ['tetanoz', 'clostrid', 'klostrid', 'karma'],
    summary: 'Kırkım, kastrasyon, kuzu kuyruğu kesme ya da derin yaradan 1–3 hafta sonra: bacaklarda kaskatılık, dik kuyruk, kilitli çene, sese aşırı tepki.',
    actions: [
      'Veteriner hekimi hemen çağırın: tetanoz antitoksini, penisilin ve yara temizliği.',
      'Hayvanı karanlık, sessiz bir yerde tutun; su ve yumuşak yeme ulaşabilmeli.'
    ],
    vetChecks: 'Klinik muayene, yara kaynağının bulunması.',
    prevention: 'Klostridial karma aşı; kastrasyon ve kırkımda hijyen.'
  }),
  D({
    id: 'brucellosis', name: 'Bruselloz (Brucella melitensis)', agent: 'Brucella melitensis',
    category: 'Yavru atma – ihbarı zorunlu, insana bulaşır', species: ['sheep', 'goat'], prevalence: 3,
    findings: { abortion: 3, weak_newborn: 1, swollen_joints: 1, new_animals: 1 },
    key: ['abortion'], fever: 'any', sex: 'female', repro: 'pregnant', reproSoft: true, herd: 'contagious', urgency: 'urgent',
    notifiable: true, zoonotic: true, vaccineKeywords: ['brusel', 'brucell', 'rev'],
    summary: 'Gebeliğin son döneminde yavru atma ve zayıf doğum; insanlara çiğ süt, peynir ve atık yavru ile bulaşır (Malta humması). Türkiye\'de yaygındır.',
    actions: [
      'İhbarı zorunludur: veteriner hekime ve İl/İlçe Tarım ve Orman Müdürlüğüne haber verin.',
      'Atık yavru ve eşe çıplak elle dokunmayın; eldivenle toplayıp tahlil için saklayın ya da gömün, alanı kireçleyin.',
      'Yavru atan hayvanı ayırın; çiğ süt ve sütten yapılan ürünleri tüketmeyin.'
    ],
    vetChecks: 'Kan (Rose Bengal, ELISA), atık yavru ve eşten kültür (resmî).',
    prevention: 'Rev-1 aşısı (resmî program), sürüye test edilmiş hayvan alma.'
  }),
  D({
    id: 'abortion_other', name: 'Diğer Yavru Atma Nedenleri (Klamidya, Toksoplazma, Kampilobakter)', agent: 'Chlamydia abortus, Toxoplasma gondii, Campylobacter',
    category: 'Yavru atma – insana bulaşabilir', species: ['sheep', 'goat'], prevalence: 3,
    findings: { abortion: 3, weak_newborn: 2, new_animals: 1 },
    key: ['abortion'], fever: 'any', sex: 'female', repro: 'pregnant', reproSoft: true, herd: 'contagious', urgency: 'urgent',
    zoonotic: true,
    summary: 'Gebeliğin son ayında yavru atma, ölü ya da zayıf doğum; sürüde art arda vakalar. Toksoplazma kedi dışkısıyla bulaşır.',
    actions: [
      'Atık yavru ve eşi eldivenle toplayıp veteriner hekim aracılığıyla laboratuvara gönderin — tedavi etkene göre değişir.',
      'Yavru atanları ayırın; gebe kadınlar doğum ve atıklarla temas etmesin.',
      'Yem deposunu kedilerden koruyun; veteriner hekim klamidyada sürüye oksitetrasiklin önerebilir.'
    ],
    vetChecks: 'Fetus, eş ve kanda laboratuvar testleri (PCR, seroloji).',
    prevention: 'Etkene göre aşı (klamidya, toksoplazma), yem hijyeni.'
  }),
  D({
    id: 'oestrosis', name: 'Koyun Burun Kurdu (Oestrus ovis)', agent: 'Oestrus ovis larvaları',
    category: 'Parazit', species: ['sheep', 'goat'], prevalence: 3,
    findings: { head_shaking: 3, nasal_discharge: 2, breathing: 1 },
    key: ['head_shaking'], fever: 'none', herd: 'either', seasons: [5, 6, 7, 8, 9, 10], urgency: 'routine',
    summary: 'Yazın sinek burna larva bırakır: hapşırma, baş sallama, burnu yere sürtme ve koyu burun akıntısı.',
    actions: [
      'Veteriner hekimin önerdiği ilaçla (ivermektin, klosantel) özellikle sonbaharda tüm sürüyü ilaçlayın.',
      'Burun akıntısı ateşle birlikteyse zatürreyi de düşünün.'
    ],
    vetChecks: 'Klinik muayene.',
    prevention: 'Sonbahar ilaçlaması.'
  }),
  D({
    id: 'fasciolosis', name: 'Karaciğer Kelebeği (Fasciolosis)', agent: 'Fasciola hepatica (salyangoz ara konakçılı)',
    category: 'Parazit', species: ['sheep', 'goat'], prevalence: 3,
    findings: { weight_loss: 3, wet_pasture: 3, bottle_jaw: 2, pale_mucosa: 2, lethargy: 1, sudden_death: 1, jaundice: 1 },
    key: [], fever: 'none', age: { min: 120, max: 100000 }, herd: 'either', seasons: [9, 10, 11, 12, 1, 2], urgency: 'soon',
    dewormSensitive: true,
    summary: 'Sulak-bataklık meralarda: kronik zayıflama, kansızlık, çene altı ödemi; yoğun enfeksiyonda sonbaharda ani ölümler.',
    actions: [
      'Veteriner hekime dışkı (çöktürme) muayenesi yaptırın; kesimde karaciğere bakılabilir.',
      'Veteriner hekimin önerdiği kelebek ilacı (genç kelebeklerde triklabendazol) ile sürüyü ilaçlayın.',
      'Islak, salyangozlu alanları çitle kapatın.'
    ],
    vetChecks: 'Gaita çöktürme, kan karaciğer enzimleri.',
    prevention: 'Sulak alanlardan uzak otlatma, mevsimsel kelebek ilaçlaması.'
  }),
  D({
    id: 'joint_navel_ill', name: 'Göbek ve Eklem İltihabı (Yavru)', agent: 'Göbekten giren bakteriler (streptokok, E. coli)',
    category: 'Yeni doğan', species: ['sheep', 'goat'], prevalence: 2,
    findings: { swollen_joints: 3, navel_swelling: 3, lameness: 2, lethargy: 1, anorexia: 1 },
    key: [], fever: 'mild', age: { min: 0, max: 45, strict: true }, herd: 'individual', urgency: 'urgent',
    summary: 'İlk haftalarda göbekte şişlik-akıntı, ardından sıcak şiş eklemler ve topallık.',
    actions: [
      'Veteriner hekim erken ve uzun süreli antibiyotik tedavisi düzenlemeli.',
      'Doğumda göbek kordonunu %7 iyot ile batırın; yatakları temiz-kuru tutun.',
      'Kuzunun yeterli ağız sütü aldığından emin olun.'
    ],
    vetChecks: 'Eklem sıvısı, göbek muayenesi.',
    prevention: 'Doğum bölmesi hijyeni, göbek bakımı, ağız sütü.'
  }),
  D({
    id: 'white_muscle', name: 'Beyaz Kas Hastalığı (Selenyum / E vitamini eksikliği)', agent: 'Selenyum ve E vitamini eksikliği',
    category: 'Beslenme', species: ['sheep', 'goat'], prevalence: 3,
    findings: { stiff_gait: 3, weak_newborn: 2, recumbent: 2, breathing: 1, lameness: 1 },
    key: ['stiff_gait'], fever: 'none', age: { min: 0, max: 120, strict: true }, herd: 'either', urgency: 'urgent',
    summary: 'Hızlı büyüyen kuzularda sert ve ağrılı yürüyüş, kambur durma, emememe; kalp kası tutulursa ani ölüm ve solunum güçlüğü.',
    actions: [
      'Veteriner hekim selenyum + E vitamini enjeksiyonu yapar (doz aşımı zehirlidir, kendiniz uygulamayın).',
      'Aynı yaştaki kuzuları ve gebe koyunları da değerlendirin.'
    ],
    vetChecks: 'Kan selenyum / CK enzimi.',
    prevention: 'Gebelik sonunda ve kuzulara selenyumlu mineral / enjeksiyon (bölgeye göre).'
  }),
  D({
    id: 'paratuberculosis', name: 'Paratüberküloz (Johne hastalığı)', agent: 'Mycobacterium avium subsp. paratuberculosis',
    category: 'Kronik bakteriyel', species: ['sheep', 'goat'], prevalence: 2,
    findings: { weight_loss: 3, bottle_jaw: 1, wool_loss: 1 },
    key: ['weight_loss'], fever: 'none', age: { min: 365, max: 100000 }, herd: 'individual', urgency: 'routine',
    summary: 'Yetişkin koyunda iştahı yerinde olmasına rağmen aylar içinde ilerleyen zayıflama; koyunlarda ishal çoğu zaman yoktur.',
    actions: [
      'Önce daha sık nedenleri (parazit, diş sorunu, kelebek) veteriner hekimle eleyin.',
      'Tanı konan hayvanları ayıklayın; yavrularını sürüye katmayın.'
    ],
    vetChecks: 'Kan ELISA, dışkı PCR / kültür.',
    prevention: 'Doğum bölmesi hijyeni, pozitif hayvanların ayıklanması.'
  }),
  D({
    id: 'anthrax', name: 'Şarbon (Antraks)', agent: 'Bacillus anthracis',
    category: 'Bakteriyel – ihbarı zorunlu, insana bulaşır', species: ['sheep', 'goat'], prevalence: 1,
    findings: { sudden_death: 3, bloody_orifices: 3, breathing: 1, tremor: 1 },
    key: ['sudden_death'], fever: 'high', herd: 'either', seasons: [5, 6, 7, 8, 9], urgency: 'emergency',
    notifiable: true, zoonotic: true, vaccineKeywords: ['şarbon', 'antraks', 'anthrax'],
    summary: 'Ani ölüm; ölünün ağız, burun ve anüsünden pıhtılaşmayan koyu kan gelir, ölü çabuk şişer ve ölü sertliği gelişmez. İnsana ölümcül bulaşabilir.',
    actions: [
      'ÖLÜ HAYVANI KESİNLİKLE AÇMAYIN, derisini yüzmeyin, etini kullanmayın.',
      'İhbarı zorunludur: veteriner hekime ve İl/İlçe Tarım ve Orman Müdürlüğüne hemen haber verin.',
      'Ölünün etrafını kapatın, insan ve hayvanları uzak tutun; imha resmî ekiple yapılır.'
    ],
    vetChecks: 'Kulak ucundan kan frotisi (resmî), ölü açılmadan.',
    prevention: 'Riskli bölgelerde yıllık şarbon aşısı.'
  })
];
