# ShepherdAI Kamera Yapay Zekası — Kurulum Rehberi

Çiftlikteki kameralardan koyunları bulur ve takip eder. Sizin çizdiğiniz bölgelerde (yemlik, suluk, ahır, avlu…) kaç koyunun ne kadar kaldığını kaydeder. Gece köpek, kurt veya insan görürse uyarı üretir. Sonuçları siteye gönderir.

```
Kameralar ──(RTSP, yerel ağ)──► Çiftlikteki bilgisayar ──(yalnızca sayılar/olaylar)──► Supabase ──► Site
                                 YOLO modeli + takip
                                 bölge süre hesabı
```

- **Video çiftlikten çıkmaz.** Siteye sadece "yemlikte 12 koyun", "#7 suluktaki 4 dk kaldı" gibi kayıtlar gider.
- **İnternet kesilirse kayıt kaybolmaz.** Kayıtlar bilgisayarda bekler, bağlantı gelince gönderilir.
- **Eğitim gerekmez.** Hazır model "koyun" sınıfını zaten tanır. Sonradan kendi görüntülerinizle iyileştirilebilir (bkz. 9. adım).

---

## 1. Gerekenler

**Bilgisayar** (7/24 açık kalacak, kameralarla aynı ağda olmalı: aynı modem, switch veya kayıt cihazı):

| Kamera sayısı | Öneri |
|---|---|
| 1–3 | Ekran kartı olmayan güncel bir masaüstü ya da mini PC (Intel i5 / Ryzen 5, 8 GB RAM). `yolo11n.pt` modeli ile kamera başına saniyede 1 kare rahat işlenir. |
| 4 ve üzeri, ya da daha isabetli model | NVIDIA ekran kartlı bilgisayar (RTX 3050/3060 sınıfı) veya NVIDIA Jetson Orin Nano. |

Koyunlar yavaş hareket ettiği için saniyede 1–2 kare incelemek yeterlidir. Bilgisayarı en çok yoran şey kamera sayısıdır.

**Kameralar:** RTSP yayını verebilen IP kamera ya da kayıt cihazı (NVR/DVR). Hikvision, Dahua ve benzeri markaların neredeyse hepsi verir. En iyi sonuç için kamera yüksekte olmalı ve hayvanlara yukarıdan, geniş açıyla bakmalı.

## 2. Kameranın RTSP adresini bulun

Bu adres, bilgisayarın kamera görüntüsünü okuyacağı adrestir. Yaygın biçimler (`KULLANICI`, `SIFRE` ve IP adresini kendi bilgilerinizle değiştirin):

| Marka | Adres (alt akış: düşük çözünürlüklü, bilgisayarı az yorar) |
|---|---|
| Hikvision (kamera veya NVR) | `rtsp://KULLANICI:SIFRE@IP:554/Streaming/Channels/102` → 1. kanal. 2. kanal için `202`, 3. kanal için `302`… (`101` ana akıştır) |
| Dahua (kamera veya NVR) | `rtsp://KULLANICI:SIFRE@IP:554/cam/realmonitor?channel=1&subtype=1` (`subtype=0` ana akıştır) |
| TP-Link Tapo | Uygulamada *Gelişmiş Ayarlar → Kamera Hesabı* oluşturun: `rtsp://HESAP:SIFRE@IP:554/stream2` |
| Diğer / bilinmiyor | Windows'ta **ONVIF Device Manager** programı ağdaki kameraları bulur ve RTSP adresini gösterir. |

- EZVIZ, Imou gibi bulut kameralarda RTSP çoğu zaman uygulamadan açılması gereken bir ayardır ve adres modele göre değişir. Modelinizi söylerseniz birlikte bulabiliriz.
- Şifrede `@` gibi özel karakter varsa adreste `%40` olarak yazın.
- Kameranın IP adresini kayıt cihazının ekranında, modemin "bağlı cihazlar" listesinde ya da ONVIF Device Manager'da bulabilirsiniz.

**Deneyin:** VLC programında *Medya → Ağ Akışı Aç* menüsüne adresi yapıştırın. Görüntü geliyorsa adres doğrudur.

## 3. Programı kurun

Bilgisayara [Python 3.11](https://www.python.org/downloads/) kurun. Windows'ta kurulumda **"Add python.exe to PATH"** kutusunu işaretleyin. Ardından bu depoyu indirin (GitHub'da *Code → Download ZIP*, ya da `git clone`) ve `vision` klasöründe bir komut penceresi açın.

**Windows:**

```bat
py -3.11 -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
```

**Linux / Jetson:**

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

NVIDIA ekran kartınız varsa `requirements.txt` dosyasından **önce** [pytorch.org](https://pytorch.org/get-started/locally/) adresinin verdiği CUDA'lı `torch` kurulum komutunu çalıştırın. Model dosyası (`yolo11n.pt`) ilk çalıştırmada kendiliğinden iner.

## 4. Ayar dosyasını doldurun

`config.example.yaml` dosyasını `config.yaml` adıyla kopyalayın. Her kamera için bir `id` (örn. `avlu`, `ahir`, `yemlik`) ve 2. adımda bulduğunuz `source` adresini yazın. Bu dosya şifre içerdiği için git'e gönderilmez.

Kameradan görüntü geldiğini kontrol edin:

```bat
python -m shepherd_vision snapshot
```

Her kamera için `snapshots/` klasörüne bir fotoğraf kaydedilir.

## 5. Bölgeleri çizin

```bat
python -m shepherd_vision zones --camera avlu
```

Kameranın fotoğrafı açılır:

- **Sol tık:** köşe ekler
- **Sağ tık** veya **u:** son köşeyi siler
- **Enter:** bölgeyi bitirir. Ardından komut penceresinde bölgeye bir kimlik (`yemlik`) ve görünen ad (`Yemlik`) verirsiniz.

Bölgeler `zones.yaml` dosyasına kaydedilir. Bölgeyi hayvanın **ayaklarının bastığı zemine** göre çizin, çünkü hesap kutunun alt ortasındaki noktaya göre yapılır.

## 6. Önce deneyin

```bat
python -m shepherd_vision run --show
```

Bir pencere açılır. Her koyunun etrafında numaralı yeşil bir kutu, bölgelerde sarı çizgiler ve sayılar görürsünüz. Komut penceresinde de şu tür satırlar akar:

```
[avlu] #12 yemlik bölgesinde 245 sn kaldı.
```

- `q` tuşu kapatır.
- `--save` eklerseniz işlenmiş görüntü `output/` klasörüne video olarak kaydedilir.
- `supabase.enabled: false` iken bütün kayıtlar `output/events.jsonl` dosyasına yazılır, siteye bir şey gitmez.

Kayıtlı bir videoyla da deneyebilirsiniz: `config.yaml` içinde `source: ornek.mp4` yazmanız yeterli.

**Ayar ipuçları:**

- Koyunların bir kısmı bulunmuyorsa `confidence` değerini düşürün (0.25) veya `image_size: 960` deneyin.
- Yanlış kutular çıkıyorsa `confidence` değerini artırın.
- Kalabalıkta numaralar sık değişiyorsa `process_fps: 2` yapın.

## 7. Siteye bağlayın (Supabase)

1. Supabase panelinde **SQL Editor**'ı açın, depodaki `data/schema.sql` dosyasının tamamını yapıştırıp çalıştırın. Dosya tekrar çalıştırılabilir; mevcut verilere dokunmaz, sadece eksik tabloları ekler (`vision_zone_visits`, `vision_zone_counts`, `vision_alerts`, `vision_live`).
2. `config.yaml` içinde `supabase.enabled: true` yapın ve sitede giriş yaptığınız e-posta ile şifreyi yazın.
   - Şifreyi dosyada tutmak istemezseniz `SHEPHERD_EMAIL` ve `SHEPHERD_PASSWORD` ortam değişkenlerini kullanabilirsiniz.
   - Servis sadece sizin hesabınızın satırlarına yazabilir.

Gönderilen kayıtlar:

| Tablo | İçerik |
|---|---|
| `vision_zone_visits` | Her ziyaret: kamera, bölge, hayvan takip no, giriş, çıkış, süre (sn) |
| `vision_zone_counts` | 5 dakikada bir her bölgedeki hayvan sayısı. `tum_goruntu`: kameranın gördüğü toplam |
| `vision_alerts` | Uyarı saatlerinde görülen köpek, insan vb. |
| `vision_live` | Kamera başına tek satır, 3 sn'de bir güncellenen anlık konumlar (site canlı dinler) |

## 8. Sürekli çalıştırın

**Windows:** `baslat.bat` dosyası servisi başlatır ve kapanırsa 10 saniye sonra yeniden açar. Bilgisayar açılınca kendiliğinden başlaması için:

1. *Görev Zamanlayıcı* → *Temel Görev Oluştur*
2. Tetikleyici: *Bilgisayar başladığında*
3. Eylem: `baslat.bat` dosyasını seçin

**Linux:** `/etc/systemd/system/shepherd-vision.service`

```ini
[Unit]
Description=ShepherdAI kamera yapay zekasi
After=network-online.target

[Service]
WorkingDirectory=/home/KULLANICI/Kucukbas-Takip/vision
ExecStart=/home/KULLANICI/Kucukbas-Takip/vision/.venv/bin/python -m shepherd_vision run
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
```

Sonra şu komutu çalıştırın:

```bash
sudo systemctl enable --now shepherd-vision
```

## 9. Modeli kendi koyunlarınızla iyileştirme (isteğe bağlı)

Hazır model genel fotoğraflarla eğitilmiştir. Gece kızılötesi görüntüde, çok kalabalık ağılda veya uzaktaki küçük koyunlarda zorlanabilir. Bu durumda:

1. `snapshot` komutuyla farklı saat ve hava koşullarında 300–500 kare toplayın.
2. Label Studio veya CVAT gibi ücretsiz bir araçla her karedeki koyunları kutu içine alın.
3. Modeli eğitin: `yolo detect train data=koyun.yaml model=yolo11s.pt epochs=100 imgsz=640`
4. Çıkan `best.pt` dosyasını `config.yaml` içinde `model:` olarak verin.

## Bilinmesi gerekenler

- **Takip numarası kalıcı kimlik değildir.** `#12` kameranın o an verdiği numaradır. Koyun görüntüden çıkıp girince, başka kamerada ya da servis yeniden başlayınca yeni numara alır. Bu yüzden ilk aşamada güvenilir sonuç bölge ve sürü düzeyindedir: "yemlikte bugün toplam 38 koyun-saat", "suluk 14:00'te boş kaldı" gibi. Küpe numarasıyla eşleştirme için sırta boya numarası, renkli/numaralı tasma veya kapıda RFID okuyucu gerekir; bu bir sonraki aşamadır.
- **Kalabalık ve üst üste binme:** Sıkışık sürüde bazı koyunlar sayılmayabilir. Yukarıdan bakan kamera bu sorunu azaltır.
- **Gece:** Kızılötesi görüntüde isabet düşer. Kendi gece görüntülerinizle eğitilmiş model belirgin fark yaratır (9. adım).
- Hazır modelde "kurt" sınıfı yoktur; kurt genelde "dog" (köpek) olarak görülür.

## Geliştirici notları

```
shepherd_vision/
  zones.py      # saf: çokgen içi testi, bölge giriş-çıkış/süre (ZoneTracker)
  plan.py       # saf: görüntü → kuşbakışı plan (4 nokta perspektif dönüşümü)
  alerts.py     # saf: uyarı saat aralığı ve tekrar bekleme süresi
  camera.py     # RTSP okuyucu (en son kare, yeniden bağlanma)
  detector.py   # YOLO + ByteTrack sarmalayıcısı
  reporter.py   # Supabase REST + SQLite çevrimdışı kuyruk / JSONL
  main.py       # komutlar ve kamera başına işçi iş parçacığı
```

Testler (model ve kamera gerektirmez):

```bash
python -m unittest discover -s tests
```
