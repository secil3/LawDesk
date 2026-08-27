# LawDesk Windows native teslim ve canlı kabul kontrol listesi

Bu belge, LawDesk'i Docker/WSL2 olmadan Windows 10/11 üzerinde kuracak kurum BT
ekibi ile uygulama sahibinin birlikte dolduracağı teslim ve kabul kaydıdır.
Kurulum komutları için [`deploy/windows/README.md`](../deploy/windows/README.md),
genel mimari ve alternatif dağıtımlar için [`DEPLOYMENT.md`](DEPLOYMENT.md)
esas alınır.

Bu belgedeki kutuların işaretlenmesi tek başına canlı kabul anlamına gelmez.
**Canlı kabul**, Bölüm 9'daki bütün zorunlu kapıların geçmesi ve Bölüm 10'daki
yetkililerin imzasıyla oluşur. Parola, token, özel anahtar veya tam bağlantı
dizesi bu belgeye yazılmaz.

## 1. Teslimat kimliği

| Alan | Kurum tarafından doldurulur |
| --- | --- |
| Repository | `https://github.com/secil3/LawDesk` |
| Onaylı release etiketi veya commit SHA | |
| GitHub Actions çalışma bağlantısı | |
| Teslim tarihi | |
| Kurulum tarihi/saat aralığı | |
| Uygulama sahibi | |
| Kurulumu yapan BT sorumlusu | |
| PostgreSQL/DBA sorumlusu | |
| Ağ/TLS sorumlusu | |
| SMTP sorumlusu | |
| Yedekleme/izleme sorumlusu | |
| Hedef bilgisayar adı | |
| Uygulama adresi | |

Onaylı kaynak doğrulaması:

- [ ] Kurulum branch adıyla değil, sabit release etiketi veya 40 karakterli
  commit SHA ile yapılacak.
- [ ] Hedef SHA için `backend-tests`, `frontend-build`, `browser-e2e`,
  `windows-native-package` ve `production-deployment` kontrolleri yeşil.
- [ ] Kurulum sırasında checkout edilen değer aşağıdaki komutla teslim
  kaydındaki SHA ile birebir karşılaştırıldı:

  ```powershell
  git rev-parse HEAD
  git status --short --branch
  ```

- [ ] Çalışma ağacında değiştirilmiş veya takip edilmeyen production dosyası
  yok; yerel değişiklik gerekiyorsa ayrıca kayıt altına alındı.

## 2. Canlıya geçişi durduran koşullar

Aşağıdakilerden biri varsa kurulum teknik olarak açılsa bile **canlı kullanıcı
alınmaz**:

- [ ] Windows Home kullanılmıyor.
- [ ] Hedef, son kullanıcı iş istasyonu değil; LawDesk'e ayrılmış kurum
  bilgisayarı veya VM.
- [ ] Windows 11 Pro/Enterprise güncel güvenlik yamalarıyla destekleniyor; veya
  Windows 10 için aktif ESU/desteklenen LTSC yaşam döngüsü BT tarafından yazılı
  doğrulandı.
- [ ] Node.js 24 LTS sürümü en az `24.11.0` ve 64 bit.
- [ ] PostgreSQL 16 ile `psql`, `pg_dump` ve `pg_restore` araçları mevcut.
- [ ] IIS Web Server, Static Content, URL Rewrite 2 ve ARR kurulu.
- [ ] Gerçek alan adı DNS'te hedefe çözümleniyor.
- [ ] TLS sertifikası alan adıyla eşleşiyor, süresi geçerli, güvenilir zincire
  sahip ve `Local Computer/Personal` deposunda özel anahtarıyla bulunuyor.
- [ ] Kurumsal SMTP hesabı ve sunucudan SMTP çıkış izni hazır.
- [ ] Sunucu dışı yedek hedefi ve bu hedefe yazabilen servis hesabı hazır.
- [ ] Kullanıcı ağından yalnızca HTTPS `443/TCP` açıldı; backend `3001/TCP` ve
  yerel PostgreSQL `5432/TCP` dış ağa açılmadı.
- [ ] Windows istemci IIS kapasite riski kabul edildi ve Bölüm 8'deki hedef
  ortam yük kapısı planlandı.

Microsoft, Windows istemci işletim sistemindeki IIS'in en fazla 10 eşzamanlı
istek işlediğini; fazlasının kuyruğa alındığını belgeler. Bu nedenle toplam
50–70 hesabın bulunması tek başına kapasite kanıtı değildir. Hedef gecikme
eşiklerini geçemezse Windows Server veya kurumca onaylı, istemci-IIS sınırına
tabi olmayan native reverse proxy kullanılmalıdır.

Resmî kaynaklar:

- [IIS Windows istemci istek sınırı](https://learn.microsoft.com/en-us/iis/troubleshoot/request-restrictions)
- [Windows 10 release ve destek durumu](https://learn.microsoft.com/en-us/windows/release-health/release-information)
- [Windows 10 kurumsal ESU](https://learn.microsoft.com/en-us/windows/whats-new/extended-security-updates)
- [IIS URL Rewrite ve ARR reverse proxy](https://learn.microsoft.com/en-us/iis/extensions/url-rewrite-module/reverse-proxy-with-url-rewrite-v2-and-application-request-routing)

## 3. Hedef sistem bilgi formu

| Konu | Değer / kanıt |
| --- | --- |
| Windows sürümü, edition ve build | |
| Son Windows güncelleme tarihi | |
| CPU / RAM | |
| Uygulama diski ve boş alan | |
| PostgreSQL/ek diski ve boş alan | |
| Node.js sürümü ve mimarisi | |
| PostgreSQL sürümü | |
| IIS / URL Rewrite / ARR sürümü | |
| DNS adı | |
| TLS sertifika thumbprint'i | |
| TLS bitiş tarihi | |
| PostgreSQL yerel / kurumsal | |
| PostgreSQL TLS modu ve CA sorumlusu | |
| SMTP host/port/TLS modu | |
| Yedek UNC yolu veya ayrı disk | |
| Yedek saklama süresi | |
| Log/health izleme sistemi | |
| Bakım ve yeniden başlatma penceresi | |

Kapasite için önerilen başlangıç tabanı 2 vCPU, 4 GB RAM, uygulama/log için
20 GB ve büyüyebilir PostgreSQL/ek alanı için en az 40 GB'dir. Gerçek dosya
kullanımı ve ölçülen performans daha yüksek kaynak gerektirebilir.

## 4. Production yapılandırma kontrolü

Gerçek ayarlar yalnızca aşağıdaki dosyada tutulur:

```text
C:\ProgramData\LawDesk\config\lawdesk.env
```

- [ ] Gerçek env dosyası Git repository dışında.
- [ ] Dosyada `DEGISTIRIN`, `example.gov.tr` veya test adresi kalmadı.
- [ ] `NODE_ENV=production`.
- [ ] `BACKEND_BIND_ADDRESS=127.0.0.1`.
- [ ] `PORT=3001` ve `TRUST_PROXY_HOPS=1`.
- [ ] `APP_BASE_URL` gerçek `https://` origin'i; path, query veya fragment yok.
- [ ] `CORS_ALLOWED_ORIGINS` yalnızca gerçekten gereken ek güvenilir origin'leri
  içeriyor; gerekmiyorsa boş.
- [ ] `DB_*` alanları LawDesk'e özel, en az yetkili uygulama kullanıcısını
  gösteriyor; PostgreSQL yönetici hesabı kullanılmıyor.
- [ ] Yerel PostgreSQL'de `DB_SSL_MODE=disable`; uzak PostgreSQL'de kurum
  politikasına uygun olarak tercihen `verify-full` ve doğru CA yolu kullanılıyor.
- [ ] `ATTACHMENT_STORAGE_DIR` repo dışında kalıcı bir klasör.
- [ ] `AUTH_TOKEN_SECRET` benzersiz, güçlü ve başka parola olarak kullanılmıyor.
- [ ] SMTP TLS modu port ve kurum ayarıyla uyumlu.
- [ ] `SMTP_FROM` için ilgili SMTP hesabının gönderim yetkisi var.
- [ ] İlk adminin kurumsal posta kutusu sahipliği doğrulandıktan sonra
  `INITIAL_ADMIN_EMAIL_VERIFIED=true` yapıldı.
- [ ] Gerçek env dosyası, TLS özel anahtarı ve yedekler Git'e eklenmedi.

Env dosyasının ACL kanıtı:

```powershell
icacls.exe C:\ProgramData\LawDesk\config\lawdesk.env
```

Beklenti: yalnızca Administrators, SYSTEM ve uygulamanın çalıştığı Local Service
bağlamı gerekli erişime sahiptir. Çıktıya sır değerleri eklenmeden kurulum
kanıtına iliştirilebilir.

## 5. Kurulum öncesi doğrulama

Yönetici PowerShell penceresinde repository kökünde çalıştırılır:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Test-LawDeskWindowsPackage.ps1

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Test-LawDeskPrerequisites.ps1 `
  -EnvFile C:\ProgramData\LawDesk\config\lawdesk.env
```

- [ ] Windows paket kontrolü başarılı.
- [ ] Native Windows ön koşul kontrolü başarılı.
- [ ] `Get-ChildItem Cert:\LocalMachine\My` çıktısında seçilen sertifikanın
  `HasPrivateKey=True` olduğu doğrulandı.
- [ ] PostgreSQL hedefi boş `gys_lawdesk` veritabanı ve `lawdesk_app` sahibiyle
  hazır; demo/geliştirme veritabanı kullanılmıyor.
- [ ] `npm run seed:development` production ortamında çalıştırılmayacak.
- [ ] Kurulumdan hemen önce hedef sistem geri dönüş noktası/snapshot veya kurum
  değişiklik kaydı oluşturuldu.

## 6. Native Windows kurulum kaydı

Şablon env dosyası henüz yoksa installer ilk çalışmada dosyayı oluşturup örnek
değerler nedeniyle güvenli biçimde durur. Gerçek değerler girildikten sonra ilk
başarılı kurulum şu komutla yapılır:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Install-LawDesk.ps1 `
  -CertificateThumbprint "KURUM_SERTIFIKA_THUMBPRINT" `
  -CreateInitialAdmin
```

- [ ] Installer `LawDesk native Windows installation completed successfully.`
  mesajıyla tamamlandı.
- [ ] Production config kontrolü geçti.
- [ ] Backend production bağımlılıkları kilit dosyasından kuruldu.
- [ ] Frontend production build tamamlandı.
- [ ] Ana şema ve checksum kontrollü migration'lar uygulandı.
- [ ] İlk admin oluşturuldu.
- [ ] Installer başarılı admin oluşturma sonrasında
  `INITIAL_ADMIN_PASSWORD` satırını env dosyasından kaldırdı.
- [ ] IIS `LawDesk` sitesi HTTPS binding ile çalışıyor.
- [ ] Task Scheduler'da `LawDesk-Backend` görevi çalışıyor ve başlangıç trigger'ı
  mevcut.
- [ ] Backend yalnızca `127.0.0.1:3001` üzerinde dinliyor.
- [ ] Uygulama kodu, config, log ve ek klasörü ACL'leri kontrol edildi.

Kurulum çıktısı gerçek parola/token içermeden değişiklik kaydına eklenir.

## 7. Fonksiyonel ve operasyonel kabul

### 7.1 Otomatik sağlık kontrolü

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Test-LawDeskHealth.ps1 `
  -PublicBaseUrl https://lawdesk.kurum.example
```

- [ ] Backend liveness ve PostgreSQL readiness başarılı.
- [ ] Dış HTTPS `/healthz`, `/api/health` ve `/api/ready` yanıtları başarılı.
- [ ] CSP, HSTS, `X-Content-Type-Options` ve `X-Frame-Options` başlıkları mevcut.
- [ ] Tarayıcıda sertifika uyarısı yok.
- [ ] HTTP kullanılıyorsa HTTPS'e yönlendiriliyor.

### 7.2 SMTP ve gerçek kullanıcı akışı

SMTP kimlik doğrulama testi, aynı PowerShell oturumunda production env yüklenerek
çalıştırılır:

```powershell
. .\deploy\windows\LawDesk.Windows.Common.ps1
[void](Import-LawDeskEnv `
  -Path C:\ProgramData\LawDesk\config\lawdesk.env)
node.exe .\backend\scripts\verifySmtp.js
```

- [ ] `SMTP connection and authentication succeeded` görüldü.
- [ ] Kurum test posta kutusuyla kayıt talebi oluşturuldu.
- [ ] Admin uygulama içi bildirimi ve kayıt talebini gördü.
- [ ] Admin rol/grup seçip talebi onayladı.
- [ ] Aktivasyon e-postası doğru alıcıya ulaştı; link gerçek HTTPS domainini
  içeriyor, parola içermiyor ve tek kullanımlı.
- [ ] Kullanıcı parola belirleyip giriş yaptı.
- [ ] Kullanıcı yetkisi kapsamında görev oluşturdu ve görevi tekrar gördü.
- [ ] Yetkisiz ikinci kullanıcı aynı görevi/API yanıtını göremedi.

### 7.3 SMTP kesintisi ve outbox

Bu test gerçek kullanıcı alınmadan ve SMTP sorumlusuyla planlı yapılır:

- [ ] SMTP geçici olarak erişilemezken onay işlemi veri kaybetmedi.
- [ ] `epostaoutbox` kaydı bekleyen/yeniden denenecek durumda kaldı.
- [ ] SMTP açıldığında worker e-postayı müdahale olmadan teslim etti.
- [ ] Başarılı teslimden sonra outbox'taki şifreli gönderim içeriği temizlendi.

### 7.4 Yeniden başlatma ve port kontrolü

- [ ] Hedef Windows kontrollü yeniden başlatıldı.
- [ ] Kullanıcı oturumu açılmadan `LawDesk-Backend` görevi başladı.
- [ ] Yeniden başlatma sonrası sağlık testi tekrar geçti.
- [ ] Başka bir bilgisayardan `443/TCP` erişilebilir.
- [ ] Başka bir bilgisayardan `3001/TCP` erişilemiyor.
- [ ] Yerel PostgreSQL kullanılıyorsa başka bir bilgisayardan `5432/TCP`
  erişilemiyor.
- [ ] Bilgisayarın uyku/hibernation ve kullanıcı kapatma politikası production
  hizmetine uygun.
- [ ] Windows Update sonrası kontrollü yeniden başlatma ve sağlık kontrolü
  sorumlusu belirlendi.

## 8. Kapasite kabulü

CI'daki **LawDesk Load Test / peak** çalışması yazılım için tekrarlanabilir
baseline sağlar; fakat Windows istemci IIS sınırını ölçmez. Gerçek kabul testi,
production verisine yazmadan hedef bilgisayarda veya aynı donanım/ayarlarla
hazırlanmış kabul kopyasında yapılır.

**Üretim veritabanında `seed:load-test` çalıştırmak yasaktır.** Yük testi için
adı `_test` ile biten ayrı PostgreSQL veritabanı ve test hesapları kullanılır.
Testten sonra production env geri yüklenir ve sağlık kontrolü tekrarlanır.

- [ ] GitHub Actions `peak` profili geçti.
- [ ] Hedef/özdeş Windows kabul ortamına ağdaki başka bir bilgisayardan 70 sanal
  kullanıcılı `peak` profili uygulandı.
- [ ] `http_req_failed < %1`.
- [ ] Başarılı kontroller `> %99`.
- [ ] `p(95) < 1000 ms`.
- [ ] IIS kuyruğu, CPU, RAM, disk ve PostgreSQL bağlantıları test boyunca
  izlendi; kabul edilemez 403.9/5xx veya servis çökmesi görülmedi.
- [ ] Test bitiminde production env/DB hedefi yeniden doğrulandı ve health testi
  geçti.

Bu eşiklerden biri geçmezse **GO verilmez**. Kaynak artırımı tek başına istemci
IIS'in 10 eşzamanlı işlenen istek sınırını kaldırmaz; Windows Server veya
onaylanmış alternatif native proxy kararı gerekir.

## 9. Yedek, geri yükleme ve izleme kabulü

İlk production yedeği:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Backup-LawDesk.ps1 `
  -Destination "\\yedek-sunucusu\LawDesk"
```

- [ ] Yedek hedefi aynı bilgisayarın `C:` diski değil.
- [ ] PostgreSQL custom dump, ek klasörü ve SHA-256 manifest oluştu.
- [ ] Yedek şifreleme, erişim yetkisi ve saklama süresi kurum politikasına uygun.
- [ ] Günlük otomatik yedek görevi servis hesabıyla tanımlandı.
- [ ] Başarısız yedek için uyarı alıcısı belirlendi.
- [ ] Geri yükleme provası ağ ve depolama bakımından production'dan ayrılmış
  kabul VM'i/PostgreSQL cluster'ında başarıyla yapıldı; production verisi prova
  amacıyla üzerine yazılmadı.
- [ ] Restore sonrası health ve örnek görev/ek kontrolü geçti.
- [ ] Backend logları, IIS logları, disk doluluğu, PostgreSQL erişimi, SMTP/outbox
  hataları ve servis durumu izleniyor.
- [ ] Kritik alarm alıcısı ve müdahale süresi tanımlandı.

Geri yükleme komutu yalnızca ayrı prova VM'i/cluster'ında, production ile aynı
mantıksal veritabanı adı korunarak ve hedef açıkça doğrulanarak kullanılır:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Restore-LawDesk.ps1 `
  -BackupDirectory "\\yedek-sunucusu\LawDesk\lawdesk-YYYYMMDD-HHMMSS-utc" `
  -ExpectedDatabaseName "gys_lawdesk" `
  -ConfirmRestore
```

Restore scripti env dosyasındaki `DB_NAME` ile `ExpectedDatabaseName` eşleşmezse
ve yedek manifestindeki kaynak veritabanı adı farklıysa bilerek durur. Bu nedenle
prova, production hostuna/cluster'ına bağlanamayan ayrı bir env dosyası ve ayrı
bir kabul altyapısında yapılır; yalnızca veritabanının mantıksal adı aynı kalır.

## 10. GO / NO-GO kararı

Zorunlu kapılar:

| Kapı | Sonuç | Kanıt / açıklama |
| --- | --- | --- |
| Onaylı SHA ve 5 CI kontrolü | GO / NO-GO | |
| Desteklenen Windows ve ön koşullar | GO / NO-GO | |
| HTTPS, DNS ve kapalı iç portlar | GO / NO-GO | |
| Health/readiness ve güvenlik başlıkları | GO / NO-GO | |
| SMTP ve uçtan uca kullanıcı akışı | GO / NO-GO | |
| Hedef/özdeş ortam peak yük testi | GO / NO-GO | |
| Sunucu dışı yedek ve restore provası | GO / NO-GO | |
| Log/izleme ve operasyon sorumluları | GO / NO-GO | |

Karar:

- [ ] **GO:** Bütün zorunlu kapılar geçti; gerçek kullanıcı kabul edilebilir.
- [ ] **KOŞULLU PİLOT:** Yalnızca yazılı kapsam, kullanıcı sayısı, veri türü ve
  bitiş tarihiyle sınırlı pilot. NO-GO olan güvenlik/yedek kapısı varsa bu seçenek
  kullanılamaz.
- [ ] **NO-GO:** Eksikler kapatılmadan gerçek kullanıcı/veri alınmaz.

| Onay | Ad soyad | Tarih | İmza / kayıt no |
| --- | --- | --- | --- |
| Uygulama sahibi | | | |
| Kurum BT sorumlusu | | | |
| Bilgi güvenliği / ağ | | | |
| DBA / yedekleme | | | |

## 11. İlk hafta operasyon takibi

- [ ] İlk iş günü health, log, SMTP/outbox ve yedek sonucu kontrol edildi.
- [ ] İlk hafta her gün disk, DB bağlantısı, 4xx/5xx, e-posta hataları ve Windows
  Task Scheduler geçmişi kontrol edildi.
- [ ] Başarısız outbox işleri ve tekrar deneme sayıları takip edildi.
- [ ] Kullanıcı yetkileri ve ilk görev görünürlüğü örneklemle doğrulandı.
- [ ] İlk hafta sonunda kapasite ve olay özeti uygulama sahibiyle paylaşıldı.
- [ ] Güncelleme öncesi yedek, onaylı SHA, installer ve health kontrolünden oluşan
  standart bakım sırası kurumsal runbook'a işlendi.

Operasyon yolları:

| İçerik | Varsayılan yol/ad |
| --- | --- |
| Production env | `C:\ProgramData\LawDesk\config\lawdesk.env` |
| Ekler | `C:\ProgramData\LawDesk\attachments` |
| Backend logları | `C:\ProgramData\LawDesk\logs` |
| Backend görevi | Task Scheduler / `LawDesk-Backend` |
| IIS sitesi | IIS / `LawDesk` |
| IIS logları | Kurum IIS log politikasındaki klasör |
