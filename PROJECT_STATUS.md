# ShepherdAI Proje Durumu ve Mimari Dokümantasyon (PROJECT_STATUS.md)

## 1. Proje Özeti & Vizyonu
ShepherdAI, küçükbaş sürü yönetimi, klinik tedavi planlaması, arınma süresi takibi ve genel çiftlik verimliliğini yönetmek amacıyla geliştirilmiş, "Offline-First" yaklaşımıyla çalışan ve Single Page Application (SPA) mimarisine sahip kapsamlı bir web uygulamasıdır. İnternet bağlantısı koptuğunda dahi LocalStorage üzerinde güvenli veri saklamayı sağlayan multi-tenant yapısı, her bir kullanıcı (veya demo hesap) için tamamen izole bir çalışma ortamı sunar.

## 2. Dosya ve Modül Haritası

Proje dizin yapısı, katmanlı mimari prensiplerine (Veri, Çekirdek İş Mantığı, UI Modülleri ve Stiller) sıkı sıkıya bağlı olarak tasarlanmıştır.

### `/` (Kök Dizin)
* **`index.html`**: Uygulamanın ana giriş noktası (DOM kabuğu).
* **`app.js`**: Yönlendirme (Router) ve başlangıç (Bootstrap) ayarlarını yükleyen ana kontrol dosyası.

### `/core/` (Çekirdek İş Mantığı Katmanı)
UI'dan bağımsız, hesaplamaların ve state yönetiminin yapıldığı katmandır.
* **`state.js`**: Global state yönetimi, pub/sub (subscribe) mekanizması ve LocalStorage CRUD işlemleri.
* **`auth.js`**: Oturum açma, kullanıcı doğrulama ve farklı hesap türlerinin geçişini yönetir.
* **`healthManager.js`**: Medikal tedavi, aşılama, gebelik kısıtlamaları, et/süt arınma günü hesaplamaları, karantina mantığı ve stok düşüşü hesaplamaları motoru.
* **`modal.js`**: Uygulama genelinde kullanılan pop-up/modal sisteminin yöneticisi (Örn: tedavi ekleme, yeni hayvan ekleme modalları).
* **`herdMathEngine.js`, `financeEngine.js`, `breedingManager.js`, `workforceManager.js`**: İlgili iş alanlarının (sürü istatistiği, finansal analiz, üreme takibi) hesaplama motorları.
* **`router.js`, `sensors.js`**: Sayfa yönlendirme ve cihaz sensörlerine erişim bağlantıları.

### `/data/` (Veri ve Mock Katmanı)
Statik veri sözlüklerinin ve şablonların tutulduğu katmandır.
* **`med-library.js`**: Varsayılan 11+ ilaç, prospektüs bilgileri, birimler, dozaj oranları ve arınma günlerini içeren statik veritabanı.
* **`mock-data.js`**: Demo kullanıcılar veya ilk kurulum için gerekli test/şablon verilerini barındırır.

### `/modules/` (UI ve Görünüm Katmanı)
Kullanıcı arayüzünü (DOM) oluşturan ve `core` katmanındaki fonksiyonları çağıran modüller.
* **`dashboard.js`**: Ana gösterge paneli; karantina, toplam hayvan sayısı vb. özet verileri sunar.
* **`animal-profile.js`**: Bireysel hayvan detay sayfası (Medikal geçmiş, soy ağacı, verimlilik vb.).
* **`herd-list.js`, `herd.js`**: Sürü listeleme, filtreleme ve toplu işlemler.
* **`health.js`, `health-meds.js`, `health-vaccines.js`, `health-mortality.js`, `health-ai.js`**: Sağlık sekmesinin alt modülleri; ecza deposu, hastalık kayıtları, mortalite vb.
* **`treatment-modal.js`**: Bireysel veya toplu tedavi uygulamasının UI formunu ve DOM elementlerini içerir.
* **`finance*.js` & `tasks.js`**: Finans modülü ve günlük iş/görev takibi bileşenleri.
* **`auth.js`, `profile.js`, `navigation.js`**: Kullanıcı giriş ekranı, profil paneli ve ana menü.
* **`breeding.js`**: Üreme modülü arayüz dosyası.

### `/styles/` (Tasarım Katmanı)
* **`main.css`**: Uygulamanın temel stil dosyası, animasyonlar, modallar, badge'ler, grid yapıları.
* **`variables.css`**: Renk paleti, tipografi ve boşluk gibi CSS tasarım token'ları (CSS variables).

## 3. State & Multi-Tenant Mimarisi

* **Hesap Türleri:**
  1. **Demo Hesap:** Hazır verilerle dolu, kullanıcıların sistemi test edebildiği ön tanımlı hesap.
  2. **Sıfır Çiftlik:** Temiz veri yapısıyla oluşturulmuş boş hesap.
  3. **Dinamik Kayıt (Yeni Kullanıcı):** Kullanıcının kendi bilgileriyle açtığı ve sadece kendine özel çalışan hesap.

* **LocalStorage İzolasyonu:**
  Uygulama, `shepherd_data_<kullanici_id>` formatındaki anahtarları kullanarak (örneğin `shepherd_data_demo_user` veya `shepherd_data_user_123`) verileri saklar. Böylece aynı tarayıcı üzerinden farklı hesaplara geçiş yapıldığında veriler asla birbirine karışmaz.

* **AppState Şeması:**
  State yapısı hiyerarşik bir ağaç şeklinde tasarlanmıştır:
  * **`currentUser`**: Aktif kullanıcının id ve yetki bilgileri.
  * **`animals`**: Hayvanların profillerini içeren temel liste dizisi (id, küpe no, yaş, tür).
  * **`pharmacyStock`**: Ecza deposundaki ilaçların ID'ye göre stok miktarlarını barındırır (Örn: `{ "med_1": 1500, "med_2": 50 }`).
  * **`treatmentRecords`**: Sürü genelinde uygulanan bireysel ve toplu tedavi/aşı kayıtları logu.
  * **`tasks`**: Aşı tekrarları, karantina bitişi gibi sistemin (özellikle `healthManager`'ın) otomatik oluşturduğu görevler listesi.

## 4. Güncel Modül Durumları (Tamamlanan / Bekleyen)

### 🟢 Tamamlanan ve Aktif Modüller:
* **Core SPA ve Yönlendirme:** Sayfalar arası geçiş, menü yönetimi ve auth mekanizması stabil.
* **Multi-Tenant State:** Hesap bazlı veri izolasyonu ve state-subscribe mimarisi sorunsuz çalışıyor.
* **Medikal Tedavi & Ecza Deposu:** İlaç kütüphanesi (`med-library.js`) entegre edildi. Ağırlığa göre dozaj hesaplaması, açık flakon kontrolü ve gerçek zamanlı stok düşüşü devrede.
* **Hayvan Profili (Sağlık Geçmişi):** Tüm aşı ve tedavi kayıtları birleşik **"Medikal Geçmiş & Aşı / Tedavi Kayıtları"** (timeline) çatısı altında başarıyla listeleniyor. Eski ve karmaşa yaratan "Aşı Geçmişi" modülü kaldırılarak birleştirildi.
* **Toplu Tedavi & Doz Yönetimi:** Toplu uygulamalarda, uygulanan toplam ilacın (Örn: 20 ml) her bir hayvanın geçmişine sadece kendi bireysel dozu kadar (Örn: 2 ml) işlenmesi sağlandı.
* **Karantina Modülü:** `healthManager` üzerinden karantinadaki hayvanlar doğru hesaplanıp Dashboard'a widget olarak yansıtılıyor.
* **UI & Stiller:** Karantina badge'leri, gebelik uyarıları, timeline görünümleri ve ecza stok kartları tasarımları `.css` dosyalarında tamamlandı.

### 🟡 Geliştirmesi Devam Eden / Bekleyen Modüller:
* **Üreme / Gebelik Takvimi:** Eşleşme tarihinden tahmini doğum hesaplaması ve sürü içi soy ağacı takip mantığının detaylandırılması.
* **Finans ve Verim:** Finans ve süt verimi gibi analitik ekranların state ve engine ile tamamen bağlanması.
* **Gelişmiş Görev (Tasks) Sistemi:** Görev sekmesinin gelişmiş bildirimler, hatırlatıcılar ve alarm sistemleri ile güçlendirilmesi.

## 5. Gelecek Geliştirmeler İçin Mimari Kurallar (Spagetti Kod Önleme)

Gelecekte kod tabanında karmaşayı (spaghetti code) engellemek adına uygulanması zorunlu geliştirme standartları şunlardır:

1. **Katman İzolasyonu (Separation of Concerns):** 
   UI modülleri (`modules/*.js`) sadece DOM manipülasyonu, render işlemleri ve event listener bağlamaktan sorumludur. Matematiksel hesaplama, veri filtreleme, karantina mantığı, stok düşüşü vb. işlemler **ASLA** UI dosyalarında yapılmamalıdır. İlgili fonksiyon `core/` altındaki motorlarda (örn: `healthManager.js`) yazılıp UI modüllerinde çağrılmalıdır.

2. **State Mutabilitesi:** 
   Global `state` objesi hiçbir zaman doğrudan değiştirilmemelidir. Okuma işlemleri için her zaman `getState()`, yazma işlemleri için `setState()` metotları kullanılmalıdır. UI component'lerinin güncellenmesi, ilgili objelere `subscribe()` callback'leri üzerinden bağlanarak yapılmalıdır.

3. **Modal Standardı:** 
   Modal, pop-up veya dialog ihtiyaçlarında DOM içine statik HTML template eklemek yerine her zaman `core/modal.js` içindeki Modal API'si kullanılarak işlemler tetiklenmeli ve oluşturulmalıdır.

4. **Veri Tanımlamaları:** 
   Yeni bir ilaç, hastalık türü veya sabit bir dropdown seçenek listesi eklenecekse, bu veriler `core` veya `modules` içinde hardcode edilmemelidir. `data/` dizini altında statik yapılar (Dictionary/Enum/Array) olarak tanımlanıp ihtiyaç duyulan yerlere import edilmelidir.

5. **Modüler CSS:** 
   Stil tanımlamalarında genel/global (örn: `div`, `span`) scope yerine, modül ismini (Örn: `.pharmacy-card`, `.treatment-timeline`, `.withdrawal-badge`) baz alan, çakışmayan sınıf isimlendirme standartlarına dikkat edilmelidir. Inline-style kullanımından kaçınılmalıdır.
