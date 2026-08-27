# LawDesk üretim dağıtım rehberi

Windows native kurulumun kurum bilgileri, kanıtları, GO/NO-GO kapıları ve
imzaları [`WINDOWS_NATIVE_HANDOFF_CHECKLIST.md`](WINDOWS_NATIVE_HANDOFF_CHECKLIST.md)
üzerinden kaydedilir.

Bu belge LawDesk deposunu kurum ortamına kuracak BT ekibi içindir. Hedef ortam
Windows 10/11 ve Docker/WSL2 kullanılamıyorsa `deploy/windows` altındaki native
IIS/PowerShell paketi kullanılır. Linux veya Docker kabul edilen ortamlarda
Compose ve systemd/Nginx seçenekleri korunur. **Sunucu bilgi formu** kurum
tarafından doldurulmadan canlı kullanıcı alınmamalıdır.

## 1. Teslimat kapsamı

Depo aşağıdaki üretim parçalarını birlikte taşır:

- React arayüzünü derleyip Nginx ile sunan frontend image'ı
- Node.js 24 LTS üzerinde çalışan, migration'ları açılışta uygulayan backend
- İsteğe bağlı PostgreSQL 16 servisi
- Kalıcı PostgreSQL ve dosya eki volume'ları
- Liveness, readiness ve SMTP doğrulama kontrolleri
- Kalıcı aktivasyon e-posta outbox'ı ve otomatik SMTP yeniden denemeleri
- Gerçek tarayıcı E2E testi ve 70 kullanıcılı k6 yük profili
- Reverse proxy örneği ve üretim ortam değişkeni şablonu
- Native Windows için IIS, başlangıç görevi, health, yedek ve restore PowerShell araçları

Örnek kullanıcı ve görev kayıtları üretimde çalıştırılmaz. `npm run
seed:development` yalnızca geliştirme içindir ve production ortamında kendini
engeller.

## 2. 50–70 kullanıcı için başlangıç kapasitesi

Başlangıç için aşağıdaki kaynaklar yeterli bir tabandır; gerçek dosya kullanımı
ve kurum izleme verileri görüldükten sonra büyütülmelidir:

| Kaynak | Başlangıç değeri |
| --- | --- |
| CPU | 2 vCPU |
| RAM | 4 GB |
| Uygulama + log diski | 20 GB |
| PostgreSQL + ek dosya diski | En az 40 GB, büyüyebilir disk |
| Backend instance | 1 |
| PostgreSQL bağlantı havuzu | 10 |

Dosya ekleri görev başına en fazla 10 adet ve dosya başına en fazla 25 MB'dir.
Bu nedenle disk kapasitesi kullanıcı sayısından çok gerçek ek dosyası kullanımına
göre izlenmelidir. PostgreSQL ve ek dosyalar aynı yedekleme zaman diliminde
korunmalıdır.

Windows 10/11 istemci sürümlerindeki IIS, Microsoft tarafından belgelenen 10
eşzamanlı işlenen istek sınırına tabidir; ek istekler kuyruğa alınabilir. Bu
nedenle toplam 50–70 hesaplı kullanımda dahi gerçek hedef bilgisayar üzerinde
`peak` yük testi canlı kabul engelidir. Eşikler geçmezse Windows Server veya
kurumca onaylı alternatif native reverse proxy gerekir.

Windows 10 standart desteği sona erdiğinden yalnızca kurumca doğrulanmış aktif
ESU veya desteklenen LTSC yaşam döngüsündeki kurulum kabul edilir. Geçerli
güvenlik güncellemesi kapsamı yoksa Windows 11 zorunlu canlı kabul ön koşuludur.

## 3. Sunucu bilgi formu

BT ekibi dağıtımdan önce aşağıdaki alanları kesinleştirir:

| Konu | Kurum değeri |
| --- | --- |
| İşletim sistemi ve sürümü | |
| Windows sürümü/edition veya Linux dağıtımı | |
| Docker/WSL2 izin durumu | |
| IIS, URL Rewrite ve ARR kurulum durumu | |
| Uygulama alan adı | |
| TLS sertifikası sorumlusu | |
| Reverse proxy / load balancer sayısı | |
| PostgreSQL: birlikte verilen / kurumsal | |
| PostgreSQL host, port ve TLS CA | |
| SMTP host, port, kullanıcı ve FROM izni | |
| SMTP çıkışının güvenlik duvarı izni | |
| Yedek hedefi, saklama süresi, şifreleme | |
| Log/health izleme sistemi ve sorumlusu | |
| Teknik ve uygulama sorumluları | |

## 4. Ağ ve güvenlik ön koşulları

- Kullanıcı trafiği yalnızca kurumun HTTPS reverse proxy'sinden gelir.
- Sunucuya dışarıdan 443/TCP açılır; 80/TCP yalnızca HTTPS yönlendirmesi için
  kullanılabilir.
- Compose varsayılan olarak LawDesk'i sadece `127.0.0.1:8080` üzerinde yayınlar.
  Backend ve PostgreSQL host portu yayınlamaz.
- Frontend'in `edge` ağı yalnızca yayınlanan arayüz portunun host reverse
  proxy'ye ulaşmasını sağlar. Frontend-backend trafiği ayrı `application`,
  backend-PostgreSQL trafiği ise ayrı `database` iç ağı üzerinden geçer.
- Backend'in kurumsal SMTP'ye ve DNS/NTP hizmetlerine çıkışı açık olmalıdır.
- Kurumsal PostgreSQL kullanılıyorsa yalnızca uygulama sunucusundan ilgili
  PostgreSQL host/portuna erişim verilir.
- `deploy/production.env` dosyası yalnızca servis yöneticisi tarafından
  okunabilir olmalı ve Git'e hiçbir zaman eklenmemelidir.
- Sunucunun saat eşitlemesi etkin olmalıdır; token süresi ve denetim kayıtları
  doğru saate bağlıdır.
- Native Windows kurulumunda Node backend yalnızca `127.0.0.1:3001` adresinde
  dinler. IIS dışındaki istemcilere `3001/TCP` açılmaz.
- Windows bilgisayar uykuya alınmamalı veya kullanıcı tarafından kapatılmamalıdır.
  Güç, güncelleme ve yeniden başlatma politikası BT tarafından yönetilmelidir.
- Native Windows hedefi son kullanıcı iş istasyonu veya analiz edilmemiş paylaşımlı
  IIS hostu olmamalı; LawDesk'e ayrılmış, kurumca yönetilen bilgisayar/VM olmalıdır.

Kurum Nginx'i için başlangıç örneği
`deploy/nginx/host-reverse-proxy.example.conf` dosyasındadır. Sertifika ve alan
adı değerleri kurum tarafından değiştirilir.

## 5. Sürüm seçimi ve dosyaların hazırlanması

Canlıya branch adıyla değil, testleri yeşil olan sabit bir release tag'iyle
çıkılması önerilir. Release henüz oluşturulmadıysa yalnızca kurumca onaylanmış
commit hash'i kullanılmalı ve hash teslim tutanağına yazılmalıdır.

```bash
git clone https://github.com/secil3/LawDesk.git
cd LawDesk
git checkout <ONAYLANMIS_RELEASE_TAGI>
cp deploy/production.env.example deploy/production.env
chmod 600 deploy/production.env
```

İki farklı güçlü değer üretin; aynı değeri veritabanı ve oturum anahtarı olarak
kullanmayın:

```bash
openssl rand -hex 32
openssl rand -hex 64
```

İlk çıktı `POSTGRES_PASSWORD`, ikinci çıktı `AUTH_TOKEN_SECRET` için
kullanılabilir. Parolaları komut satırında argüman olarak vermeyin; kurumun
secret manager'ı varsa değerleri oradan enjekte edin.

`deploy/production.env` içinde en az şu alanlar gerçek değerlerle değiştirilir:

- `APP_BASE_URL`
- `POSTGRES_PASSWORD` ve `AUTH_TOKEN_SECRET`
- PostgreSQL host/TLS alanları
- SMTP alanları
- İlk admin adı ve kurumsal e-postası
- `TRUST_PROXY_HOPS`

Şablondaki `DEGISTIRIN`, `example.gov.tr` ve benzeri örnek değerler bilerek
üretim kontrolünden geçmez. Bu hata güvenlik mekanizmasıdır; kontrolü kaldırmak
yerine ilgili değeri kurumun gerçek değeriyle değiştirin.

Önerilen topolojide kullanıcı → kurum reverse proxy → container Nginx → backend
olduğu için `TRUST_PROXY_HOPS=2` olur. Arada ayrıca yük dengeleyici varsa gerçek
proxy zinciri sayılır. Yanlış değer IP tabanlı hız limitini etkiler.

Dosyanın Git tarafından dışlandığını doğrulayın:

```bash
git check-ignore deploy/production.env
```

Komutun `deploy/production.env` yazması gerekir.

## 6A. Birlikte verilen PostgreSQL ile kurulum

Bu seçenek temiz sunucuda LawDesk'e özel PostgreSQL container'ı oluşturur.
`DB_HOST=postgres` ve `DB_SSL_MODE=disable` kalır; trafik yalnızca Compose'un
kapalı database ağındadır.

Önce yapılandırmayı doğrulayın ve image'ları üretin:

```bash
docker compose --profile bundled-db --env-file deploy/production.env -f compose.production.yml config --quiet
docker compose --profile bundled-db --env-file deploy/production.env -f compose.production.yml build --pull
docker compose --profile bundled-db --env-file deploy/production.env -f compose.production.yml run --rm --no-deps backend node scripts/checkProductionConfig.js
```

Sonra tüm servisleri başlatın:

```bash
docker compose --profile bundled-db --env-file deploy/production.env -f compose.production.yml up -d
```

Birlikte verilen veritabanını kullanan ekip, daha sonraki `docker compose`
komutlarında PostgreSQL servisini de görüntülemek veya yönetmek istediğinde
`--profile bundled-db` parametresini korur.

İlk ve yalnızca ilk boş volume oluşturulurken ana şema otomatik kurulur. Backend
her açılışta checksum kontrollü migration komutunu çalıştırır. Var olan PostgreSQL
volume'unda başlangıç SQL'i yeniden çalışmaz.

## 6B. Kurumsal PostgreSQL ile kurulum

DBA boş bir `gys_lawdesk` veritabanı ve yalnızca bu veritabanına yetkili bir
uygulama rolü oluşturur. Ana şema DBA kontrolünde bir kez uygulanır:

```bash
psql -v ON_ERROR_STOP=1 -h <DB_HOST> -p <DB_PORT> -U <DB_USER> -d <DB_NAME> -f database/GYS_Database_Schema_Simple.sql
```

Parola interaktif sorulmalı veya kurum secret mekanizmasından verilmelidir.
`deploy/production.env` içinde:

```env
DB_HOST=kurumsal-postgresql.example.gov.tr
DB_PORT=5432
POSTGRES_DB=gys_lawdesk
POSTGRES_USER=lawdesk_app
POSTGRES_PASSWORD=GERCEK_DEGER
DB_SSL_MODE=verify-full
DB_SSL_CA_PATH=/etc/lawdesk/certs/postgresql-ca.pem
```

Kurum CA sertifikası `deploy/certs/postgresql-ca.pem` konumuna salt okunur
olarak yerleştirilir. Sistem güven zinciri zaten sertifikayı doğruluyorsa
`DB_SSL_CA_PATH` boş bırakılabilir; `DB_SSL_MODE=verify-full` yine korunur.

PostgreSQL profile'ı olmadan doğrulayın ve başlatın:

```bash
docker compose --env-file deploy/production.env -f compose.production.yml config --quiet
docker compose --env-file deploy/production.env -f compose.production.yml build --pull
docker compose --env-file deploy/production.env -f compose.production.yml run --rm --no-deps backend node scripts/checkProductionConfig.js
docker compose --env-file deploy/production.env -f compose.production.yml up -d
```

Backend açılırken migration'ları uygular. Ana şema kurulmamışsa servis hazır
duruma geçmez; logda migration hatası görülür.

## 7. İlk açılış doğrulamaları

Servis durumunu ve logları kontrol edin:

```bash
docker compose --env-file deploy/production.env -f compose.production.yml ps
docker compose --env-file deploy/production.env -f compose.production.yml logs --tail=100 backend frontend
curl -fsS http://127.0.0.1:8080/healthz
curl -fsS http://127.0.0.1:8080/api/health
curl -fsS http://127.0.0.1:8080/api/ready
```

Beklenen yanıtlar sırasıyla `ok`, `{"status":"ok"}` ve
`{"status":"ready"}` değerleridir:

- `/healthz`: frontend Nginx çalışıyor.
- `/api/health`: backend process çalışıyor.
- `/api/ready`: backend PostgreSQL'e sorgu atabiliyor.

SMTP bağlantı ve kimlik doğrulamasını ayrıca sınayın:

```bash
docker compose --env-file deploy/production.env -f compose.production.yml exec backend node scripts/verifySmtp.js
```

`SMTP connection and authentication succeeded` görülmeden gerçek kayıt talebi
alınmaz. Bu kontrol posta teslimini garanti etmez; kurumun test posta kutusuyla
gerçek kayıt → admin onayı → aktivasyon bağlantısı → parola → giriş akışı da
tamamlanmalıdır.

Aktivasyon e-postaları önce PostgreSQL `epostaoutbox` tablosuna yazılır. Token
kopyası outbox'ta AES-256-GCM ile şifrelidir; anahtar `AUTH_TOKEN_SECRET` üzerinden
ayrı bağlamda türetilir ve başarılı SMTP tesliminde şifreli içerik silinir.
Geçici hata artan aralıklarla en fazla `EMAIL_OUTBOX_MAX_ATTEMPTS` kez yeniden
denenir. Bu nedenle `AUTH_TOKEN_SECRET` değiştirilmeden önce bekleyen outbox işi
olmadığı doğrulanmalıdır:

```sql
SELECT durum, COUNT(*)
FROM epostaoutbox
GROUP BY durum
ORDER BY durum;
```

### Linux'ta Docker kullanılamıyorsa

Kurum politikası Docker'a izin vermiyorsa Node.js 24 LTS, PostgreSQL 16 veya kurumun
desteklediği uyumlu sürüm ve Nginx sistem paketleriyle aynı mimari kurulabilir:

1. Release `/opt/lawdesk/current` altında salt okunur tutulur.
2. Backend için `npm ci --omit=dev`, frontend için `npm ci && npm run build`
   çalıştırılır.
3. Ortam değişkenleri repo dışında `/etc/lawdesk/lawdesk.env` içinde, `600`
   izniyle tutulur.
4. Ekler `/var/lib/lawdesk/attachments` altında tutulur ve
   `ATTACHMENT_STORAGE_DIR` bu yolu gösterir.
5. `deploy/systemd/lawdesk-backend.service.example` kurum kullanıcı/yollarına
   uyarlanıp systemd'ye kurulur.
6. `deploy/nginx/native.example.conf` alan adı ve sertifika yollarına uyarlanır.

Compose dışındaki backend, PostgreSQL bilgilerini `DATABASE_URL` ile veya
`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` alanlarıyla bekler.
`POSTGRES_DB`, `POSTGRES_USER` ve `POSTGRES_PASSWORD` adları yalnızca Compose'un
birlikte verilen PostgreSQL servisini yapılandırmak içindir; native env dosyasında
bunların yerine `DB_*` alanları yazılmalıdır.

Native örnekte kullanıcı → Nginx → backend zinciri olduğundan
`TRUST_PROXY_HOPS=1` kullanılır. Servis örneği her açılışta üretim ayarını kontrol
eder, PostgreSQL hazır olana kadar yalnızca geçici bağlantı hatalarında migration'ı
kontrollü biçimde yeniden dener ve SIGTERM sırasında bağlantıları güvenli kapatır.

### Windows 10/11 native kurulum

Docker Desktop ve WSL2 kullanılamayan Windows 10/11 Pro veya Enterprise
bilgisayarlarda `deploy/windows` paketi kullanılır. Windows Home, IIS tabanlı
production kurulumu için desteklenmez. Hedef mimari şöyledir:

- IIS, derlenmiş React dosyalarını HTTPS üzerinden sunar.
- IIS URL Rewrite ve ARR, `/api` isteklerini `127.0.0.1:3001` adresindeki Node
  backend'e iletir.
- Backend, bilgisayar açılışında Windows Task Scheduler tarafından Local Service
  hesabıyla başlatılır ve hata halinde yeniden çalıştırılır.
- PostgreSQL 16 aynı bilgisayarda native servis olarak veya kurumun ayrı
  PostgreSQL sunucusunda çalışır.
- Sırlar repo dışında `C:\ProgramData\LawDesk\config\lawdesk.env`, ekler ise
  `C:\ProgramData\LawDesk\attachments` altında tutulur.

Kurulumdan önce Node.js 24 LTS, PostgreSQL client araçları, IIS, URL Rewrite ve
ARR kurulur; kurum TLS sertifikası `Local Computer / Personal` deposuna private
key ile yüklenir. Sonra yönetici PowerShell'inde:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\windows\Install-LawDesk.ps1 -CertificateThumbprint GERCEK_SERTIFIKA_THUMBPRINT
notepad C:\ProgramData\LawDesk\config\lawdesk.env
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\windows\Install-LawDesk.ps1 -CertificateThumbprint GERCEK_SERTIFIKA_THUMBPRINT
```

İlk komut ortam şablonunu repo dışında oluşturur ve örnek değerler değiştirilene
kadar bilerek durur. İkinci kurulum komutuna ilk admin oluşturulacaksa yalnızca
ilk başarılı kurulumda `-CreateInitialAdmin` eklenir.

Kurucu; ortam dosyası ACL'lerini sınırlar, bağımlılıkları kilit dosyalarından
kurar, frontend production build'ini alır, temiz şemayı ve migration'ları uygular,
ilk admini isteğe bağlı oluşturur, IIS'i yapılandırır, başlangıç görevini
kaydeder ve health/readiness kontrollerini çalıştırır. Native ortamda Compose'a
özgü `POSTGRES_*` alanları kullanılmaz; `DB_HOST`, `DB_PORT`, `DB_NAME`,
`DB_USER`, `DB_PASSWORD` ve gerekirse `DB_SSL_CA_PATH` doldurulur.
`BACKEND_BIND_ADDRESS=127.0.0.1` ve doğrudan IIS topolojisinde
`TRUST_PROXY_HOPS=1` değiştirilmez. Ayrıntılı ön koşul, kurulum ve hata ayıklama
adımları [`deploy/windows/README.md`](../deploy/windows/README.md) içindedir.

## 8. İlk admin hesabı

1. Kurum, `INITIAL_ADMIN_EMAIL` posta kutusunun ilgili kişiye ait olduğunu
   doğrular.
2. `INITIAL_ADMIN_EMAIL_VERIFIED=true` yapılır.
3. Aşağıdaki komut bir kez çalıştırılır:

```bash
docker compose --env-file deploy/production.env -f compose.production.yml run --rm --no-deps backend node scripts/createInitialAdmin.js
```

`run` komutu düzenlenen env dosyasını yeni ve geçici bir container'a yükler;
çalışmakta olan backend container'ının eski ortam değerlerini kullanmaz.

Başarılı çıktıdan sonra `INITIAL_ADMIN_PASSWORD` değeri
`deploy/production.env` dosyasından silinir ve backend yeni ortamla oluşturulur:

```bash
docker compose --env-file deploy/production.env -f compose.production.yml up -d --force-recreate backend
```

İkinci admin dahil diğer hesaplar kayıt talebi ve aktivasyon akışıyla açılır.

Native Windows kurucusu ilk çalıştırmada aynı işlemi yapabilir. Bunun için
`lawdesk.env` içinde doğrulanmış admin alanları doldurulur ve kurucuya
`-CreateInitialAdmin` verilir. Başarılı oluşturma sonrasında kurucu
`INITIAL_ADMIN_PASSWORD` satırını ortam dosyasından otomatik kaldırır.

## 9. Reverse proxy ve HTTPS kabulü

Docker/Linux topolojisinde kurum reverse proxy'si `127.0.0.1:8080` adresine
yönlendirilir. Native Windows topolojisinde IIS doğrudan 80/443 dinler ve yalnızca
`/api` trafiğini loopback backend'e iletir. Kabul sırasında:

- HTTP isteği HTTPS'e yönlenmeli.
- Sertifika alan adıyla eşleşmeli ve tarayıcı tarafından güvenilir olmalı.
- `APP_BASE_URL` tarayıcıdaki gerçek HTTPS adresiyle birebir eşleşmeli.
- Aktivasyon e-postasındaki bağlantı bu HTTPS adresini kullanmalı.
- 25 MB dosya yüklemesi proxy tarafından reddedilmemeli
  (`client_max_body_size 26m` veya kurumsal karşılığı).
- Backend ve PostgreSQL portları dış ağdan erişilememeli.

Native Windows kabul kontrolü yönetici PowerShell'inde şu komutla çalıştırılır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\windows\Test-LawDeskHealth.ps1 -PublicBaseUrl https://lawdesk.kurum.example
```

## 10. Yedekleme ve geri yükleme

Yedek kapsamı iki parçadır:

1. PostgreSQL'in tutarlı `pg_dump --format=custom` yedeği
2. `lawdesk_attachments` volume'ının dosya yedeği/snapshot'ı

Örnek PostgreSQL yedeği:

```bash
install -d -m 700 /var/backups/lawdesk
umask 077
docker compose --profile bundled-db --env-file deploy/production.env -f compose.production.yml exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --format=custom' > /var/backups/lawdesk/lawdesk-db.dump
```

Ek dosyalar için kurumun volume/snapshot ürünü kullanılmalıdır. Basit dosya
yedeği gerekiyorsa servis kısa süreli bakım moduna alınmalı ve
`lawdesk_attachments` volume'ı tutarlı biçimde arşivlenmelidir.

Asgari politika:

- Günlük otomatik yedek
- Kurum politikasına uygun şifreli ve sunucu dışı kopya
- Başarı/başarısızlık alarmı
- En az üç ayda bir ayrı test ortamında geri yükleme tatbikatı
- Her release öncesinde ek yedek

Geri yükleme canlı veriyi değiştiren bir işlemdir. BT ekibi önce mevcut durumun
ayrı yedeğini alır, backend/frontend'i durdurur, veritabanı ve ekleri aynı yedek
zamanına döndürür, sonra `/api/ready` ve uçtan uca kabul akışını tekrar çalıştırır.

Native Windows paketinde veritabanı ve ekler birlikte, SHA-256 manifestiyle
yedeklenir. Hedef mutlaka sunucu dışı veya daha sonra sunucu dışına taşınacak
kurumsal bir konum olmalıdır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\windows\Backup-LawDesk.ps1 -Destination E:\LawDeskBackups
```

Geri yükleme mevcut production verisini değiştirir; önce ayrı yedek alınmalı ve
doğru veritabanı adı açıkça onaylanmalıdır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\windows\Restore-LawDesk.ps1 -BackupDirectory E:\LawDeskBackups\lawdesk-YYYYMMDD-HHMMSS-utc -ExpectedDatabaseName gys_lawdesk -ConfirmRestore
```

## 11. Güncelleme ve geri dönüş

Güncelleme sırası:

1. Veritabanı ve ek dosya yedeğini alın.
2. Onaylanmış release tag'ini çekin.
3. `docker compose ... config --quiet` çalıştırın.
4. `docker compose ... build --pull` çalıştırın.
5. `docker compose ... up -d` çalıştırın.
6. Health, SMTP ve temel kullanıcı akışlarını doğrulayın.

Native Windows güncellemesinde onaylı commit/tag checkout edildikten ve yedek
alındıktan sonra aynı `Install-LawDesk.ps1` komutu yeniden çalıştırılır. Kurucu
başlangıç görevini durdurur, kilitli bağımlılıkları ve frontend build'ini
yeniler, migration'ları uygular, IIS yapılandırmasını korur ve health kontrolü
geçmeden başarılı sonuç vermez.

Migration sistemi yalnızca ileri yönlüdür. Yeni sürüm migration uygulamadıysa
önceki release tag'inin image'ları yeniden oluşturularak kod geri alınabilir.
Migration uygulandıysa yalnızca eski image'a dönmek güvenli kabul edilmez;
release öncesi veritabanı ve ek yedeği birlikte geri yüklenmelidir.

## 12. İzleme ve olay müdahalesi

İzleme sistemi en az şunları takip etmelidir:

- Dış HTTPS URL ve sertifika son kullanma tarihi
- `/healthz` ve `/api/ready` başarısı
- Container restart sayısı veya native Windows başlangıç görevinin durumu
- 5xx oranı ve backend hata logları
- PostgreSQL disk kullanımı ve bağlantı sayısı
- Ek dosya volume disk kullanımı
- SMTP hataları
- `epostaoutbox` içinde bekleyen, işlenen veya başarısız iş sayısı
- Yedekleme işinin son başarılı zamanı

Loglar parola, SMTP parolası, JWT veya aktivasyon tokenı içermemelidir. Destek
ekibine gönderilmeden önce e-posta ve kişisel veri alanları kurum politikasına
göre maskelenmelidir.

## 13. Canlı kabul listesi

- [ ] Onaylı release tag'i kullanıldı; Git çalışma alanı temiz.
- [ ] CI backend, gerçek PostgreSQL, frontend build, bağımlılık taraması, Playwright E2E, native Windows package ve production deployment işleri yeşil.
- [ ] Production env Git tarafından yok sayılıyor; Linux'ta `600`, Windows'ta yalnızca Administrators, SYSTEM ve Local Service okuyabiliyor.
- [ ] `/healthz`, `/api/health` ve `/api/ready` başarılı.
- [ ] HTTPS, alan adı ve proxy sayısı doğrulandı.
- [ ] Backend/PostgreSQL portları dışarı açık değil.
- [ ] SMTP verify başarılı.
- [ ] İlk admin oluşturuldu ve bootstrap parolası ortamdan silindi.
- [ ] Test posta kutusuyla kayıt ve tek kullanımlık aktivasyon tamamlandı.
- [ ] SMTP geçici kesinti ve otomatik outbox yeniden denemesi doğrulandı.
- [ ] 70 kullanıcılı `peak` k6 testi eşiklerden geçti.
- [ ] Rol/grup yetkileri örnek hesaplarla kontrol edildi.
- [ ] Dosya yükleme/indirme kontrol edildi.
- [ ] PostgreSQL ve ek dosya yedeği alındı.
- [ ] Geri yükleme sorumlusu ve bakım penceresi belirlendi.
- [ ] Log, disk, health ve yedek alarmları etkin.

Bu liste tamamlanmadan sistem canlı kabul edilmiş sayılmaz.
