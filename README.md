# UltraWide YouTube — 16:9 → 3440×1440

[![CI](https://github.com/nixoslinuxb/ultrawide-youtube/actions/workflows/ci.yml/badge.svg)](https://github.com/nixoslinuxb/ultrawide-youtube/actions/workflows/ci.yml)

YouTube'daki **16:9** videoları **3440×1440** (veya 21:9) ekrana oturtan bir Firefox eklentisi.
Videoların sağında/solunda oluşan siyah bantları kaldırır; görüntüden **kırpma yapmaz**.

## Özellikler

- **Yan bantları kaldır** (varsayılan): Yalnızca yan siyah bant varsa videoyu yatay
  esneterek boşluğu doldurur. Video zaten ekrana sığıyorsa **hiç dokunmaz**.
- **Tam ekranda otomatik**: Video, ekranın tamamını kaplar.
- **Üç görüntü modu**
  - **Yan bantları kaldır**: Kırpma yok; gerekirse yatay esnetme. (varsayılan)
  - **Kırp & doldur**: Oran korunur, taşan üst/alt kısımlar kırpılır.
  - **Uzat**: Görüntü her koşulda çerçeveye esnetilir; oran bozulabilir.
- **Hedef oran**: Ekran (otomatik), 21:9, **3440×1440 (2.39:1)**, 24:10, 32:9 veya 2.39:1.
  ("Yan bantları kaldır" modunda hedef = alan/ekran; oran seçimi yok sayılır.)
- **Sinema (theater) modu** desteği: Oynatıcı kutusu hedef orana kadar büyütülür.
- **Yatay genişletme**: Daraltılmış (pillarbox) oynatıcı, sinema modunda tüm alan genişliğine açılır.
- **Normal pencere** desteği (isteğe bağlı, varsayılan kapalı).
- **Klavye kısayolu**: `Alt + Shift + U` ile aç/kapat.
- Ayarlar anında uygulanır; sayfa yenilemeye gerek yoktur.
- Shorts sayfalarında devre dışı kalır.

## Kurulum (geçici / geliştirme)

1. Firefox'ta `about:debugging#/runtime/this-firefox` adresini açın.
2. **Geçici Eklenti Yükle…** düğmesine tıklayın.
3. Bu projedeki `manifest.json` dosyasını seçin.
4. YouTube'da bir video açıp tam ekrana geçin (`F`). Yan siyah bantlar kaybolur.

> Geçici eklentiler Firefox kapanınca kaldırılır. Kalıcı kullanım için aşağıdaki
> "Paketleme ve imzalama" adımına bakın.

## Kullanım

Araç çubuğundaki eklenti simgesine tıklayarak:

- Ultra geniş modu açıp kapatabilir,
- görüntü modunu (yan bantları kaldır / kırp / uzat) seçebilir,
- hedef oranı belirleyebilir,
- sinema modu ve normal pencere davranışını ayarlayabilirsiniz.

**Nerede uygulanır?**

| Ortam | Varsayılan |
| --- | --- |
| Tam ekran | Her zaman |
| Sinema (theater) modu | Açık (kapatılabilir) |
| Normal pencere | Kapalı (açılabilir) |

## Çevrimdışı çalışma

Eklentinin kendisi **tamamen çevrimdışıdır**: hiçbir ağ isteği yapmaz, harici sunucu,
analitik veya telemetri kullanmaz. Tüm işlemler tarayıcı içinde, YouTube sayfasının
DOM'u ve CSS'i üzerinde yapılır. Yani internet bağlantısı olmadan da eklenti mantığı
çalışır.

Ancak video **oynatmak** için YouTube'un kendisi internete ihtiyaç duyar; çevrimdışıyken
video akışı yüklenemez. Eklenti yalnızca görüntü kutusunun boyutunu değiştirdiği için
çevrimdışı kullanımda da hiçbir şeyi engellemez veya bozmaz.

## Paketleme ve imzalama

```sh
sh build.sh
```

`dist/ultrawide-youtube-1.4.0.xpi` üretilir.

## addons.mozilla.org (AMO) üzerinde yayınlama

Eklentinin AMO kimliği `ultrawide-youtube@nixoslinuxb.github.io`'dir.

### 1. API anahtarlarını al

[AMO Geliştirici API anahtarları](https://addons.mozilla.org/developers/addon/api/key/)
sayfasında **JWT issuer** (API key) ve **JWT secret** (API secret) üret.

### 2. GitHub deposuna ekle

Depo → **Settings → Secrets and variables → Actions** bölümünde iki sır tanımla:

| Ad | Değer |
| --- | --- |
| `AMO_JWT_ISSUER` | API key (JWT issuer) |
| `AMO_JWT_SECRET` | API secret (JWT secret) |

### 3. Gönder

GitHub → **Actions → Publish to AMO → Run workflow** seçip kanalı belirle:

- **listed** (varsayılan): Eklenti addons.mozilla.org'da **herkese açık** listelenir; Mozilla
  incelemesinden sonra yayınlanır. İnceleme beklemeden gönderilir (`--approval-timeout 0`).
- **unlisted**: Yalnızca kendinden dağıtım için imzalanır; AMO'da herkese açık listelenmez.

Her yeni sürümde önce `manifest.json` içindeki `version` değerini artır (AMO aynı sürümü
ikinci kez kabul etmez). Bir GitHub sürümü (`release: published`) yayınlandığında da iş
akışı otomatik çalışır.

Yerelde imzalamak için:

```sh
npm run sign
# veya
npx web-ext sign --config web-ext-config.cjs --channel unlisted \
  --api-key=... --api-secret=...
```

> Listeleme metni, ekran görüntüleri ve gizlilik politikası AMO geliştirici panelinden
> düzenlenir; API yalnızca sürümü gönderir.

Geliştirme sırasında canlı test:

```sh
npx web-ext run
```

## Nasıl çalışır?

YouTube oynatıcısı (`#movie_player`) video elementinin boyutunu sürekli kendi
hesaplar. Eklenti:

1. Hedef orana göre bir **çerçeve** hesaplar (tam ekranda ekran, sinema/normal
   modda oyuncu alanı, gerekirse oyuncuyu büyüterek).
2. Çerçeve boyutlarını CSS değişkenleri olarak `<style>` içine yazar.
3. Video elementini ve doğrudan kabını `data-uw-video` / `data-uw-container`
   ile etiketleyip `!important` kurallarla bu boyutları ve
   `object-fit: cover` (kırp), `fill` (esnet) uygular.
4. Sinema/normal modda genişletme için oynatıcıdan yukarı doğru yürüyerek
   sarmalayıcıları `data-uw-frame` ile etiketler; hem yükseklik (`--uw-player-h`)
   hem de genişlik (`--uw-player-w`) hedefe sabitlenir.

`object-fit: cover` sayesinde 16:9 görüntü hedef çerçeveyi **oranı bozulmadan**
doldurur; alt/üstten kırpılır. `fill` ise esnetir.

### "Yan bantları kaldır" nasıl karar verir?

Eklenti videonun gerçek oranını (`videoWidth / videoHeight`) oynatıcının kapladığı
alanın oranıyla karşılaştırır:

- Video **manzara** değilse (`< 1.5`) veya alan videodan **daha geniş değilse**
  (yan bant yok, video zaten oturuyor) → **hiçbir şey yapılmaz**.
- Alan videodan belirgin şekilde daha genişse (yan siyah bant oluşuyorsa) → çerçeve
  alanın tamamı yapılır ve görüntü `object-fit: fill` ile yatay esnetilir.

Bu modda kırpma **yoktur**; boşluğu doldurmanın matematiksel karşılığı yatay
esnetmedir (16:9 → ~2.39:1 için genişlik ~%34 artar). Oranı bozmak istemiyorsanız
"Kırp & doldur" modunu seçin.

### Yeni DOM uyumluluğu

YouTube oynatıcı DOM'u (sarmalayıcı isimleri, sınıflar, `padding-top` /
`aspect-ratio` hileleri) sık değişir. Eklenti bu yüzden **sabit seçicilere**
(`#player-container`, `ytd-player` vb.) güvenmez:

- Oynatıcıdan yukarı doğru **dinamik** yürüyüş yapılır; yalnızca tek çocuklu
  sarmalayıcılar hedef yüksekliğe sabitlenir (çok çocuklu, alt içerik barındıran
  kaplara dokunulmaz).
- Zincir büyüdüğü halde görüntü hâlâ kırpılıyorsa, alanı kısıtlayan bir üst ata
  **geri beslemeyle** eklenir; birkaç karede yakınsar.
- Etiketler her uygulamada tazelenir; YouTube bir sarmalayıcıyı değiştirirse
  otomatik yeniden etiketlenir.
- `ytd-watch-flexy` yanında `ytd-watch-grid` düzeni de tanınır; theater durumu
  öznitelik (`[theater]`) üzerinden okunur.
- Video elementi `html5-main-video` sınıfı yoksa bile genel `video` üzerinden
  bulunur.

## Testler

jsdom tabanlı birim/entegrasyon testleri vardır. Gerçek yerleşim motoru olmadığı
jçin `getBoundingClientRect` basit bir modelle taklit edilir; böylece etiketleme,
geri besleme ve temizleme mantığı sınanır.

```sh
npm install
npm test
```

Kapsam: ultra geniş sinema dolgusu, genişletme + geri besleme (kısıtlayan atanın
etiketlenmesi), daraltılmış oynatıcının yatay genişletilmesi, tam ekran (3440×1440
dahil), "yan bantları kaldır" (3440×1440'da 16:9 esnetme), video ekranla aynı orandayken
veya daha genişken hiç dokunmama, Shorts'ta devre dışı, ayar kapalıyken uygulanmama ve
sinema modundan çıkışta etiket temizliği.

## Dosya yapısı

```
manifest.json        Eklenti tanımı (Manifest V2, Firefox)
src/background.js    Kısayol + rozet yönetimi
src/content.js       Boyutlandırma mantığı (ana bileşen)
popup/               Araç çubuğu arayüzü
icons/icon.svg       Simge
tests/               jsdom testleri
build.sh             .xpi paketleyici
web-ext-config.cjs   web-ext (AMO) yapılandırması
.github/workflows/   CI, GitHub sürümü ve AMO gönderim otomasyonu
```

## Otomatik sürüm

`v1.4.0` gibi bir etiket push edildiğinde GitHub Actions testleri çalıştırır, `.xpi`
paketini üretir ve GitHub Releases'e yükler:

```sh
git tag v1.4.0
git push origin v1.4.0
```

Her `main` push'unda ve pull request'te CI testleri + paketleme çalışır.

## Lisans

[MIT](LICENSE) © 2026 nixoslinuxb

## 3440×1440 monitörler için

- **Tam ekranda** varsayılan "Yan bantları kaldır" modu, 16:9 videoyu 3440×1440 alanına
  **kırpmadan** oturtur: yan bantlar gider, görüntü yatay esner. Ek ayar gerekmez.
- Video zaten 3440×1440 (2.39:1) oranındaysa (sinematik içerik) hiçbir işlem yapılmaz.
- Oranı korumak istiyorsanız "Kırp & doldur" seçin: 16:9 içerik 2.39:1 çerçeveye
  kırpılarak oturur; üst/alttan ~%13'lük kısım görünmez.
- Kalite (1080p/1440p/2160p) YouTube tarafından seçilir; eklenti yalnızca görüntü
  kutusunu büyütür. Otomatik yükselmezse kalite menüsünden elle 1440p/2160p seç.
- Kalite (1080p/1440p/2160p) YouTube tarafından seçilir; eklenti yalnızca görüntü
  kutusunu büyütür. Otomatik yükselmezse kalite menüsünden elle 1440p/2160p seç.

## Notlar ve sınırlamalar

- Tüm boyutlandırma dinamik ata zinciriyle yapıldığı için YouTube arayüzü
  değişse bile genişletme çalışmaya devam eder. Yine de tam ekran modu en
  sağlam yoldur; sinema/normal modda oynatıcıyı büyütme deneyseldir ve sorun
  olursa popup'tan kapatılabilir.
- Altyazılar oyuncuya göre konumlandığı için tam ekran dışı letterbox durumunda
  kenarlarda kalabilir.
- "Yan bantları kaldır" modu oranı esnetir; 4:3 veya dikey videolarda devreye girmez
  (yalnızca manzara ve alandan dar videolarda çalışır).
