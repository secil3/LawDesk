# LawDesk üretim dağıtım rehberi

Bu belge LawDesk deposunu kurum sunucusuna kuracak BT ekibi içindir. Önerilen
yöntem Docker Compose'tur. Sunucu bilgileri henüz belli değilse **Sunucu bilgi
formu** bölümü kurum tarafından doldurulmadan canlı kullanıcı alınmamalıdır.

## 1. Teslimat kapsamı

Depo aşağıdaki üretim parçalarını birlikte taşır:

- React arayüzünü derleyip Nginx ile sunan frontend image'ı
- Node.js 22 üzerinde çalışan, migration'ları açılışta uygulayan backend image'ı
- İsteğe bağlı PostgreSQL 16 servisi
- Kalıcı PostgreSQL ve dosya eki volume'ları
- Liveness, readiness ve SMTP doğrulama kontrolleri
- Reverse proxy örneği ve üretim ortam değişkeni şablonu

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

## 3. Sunucu bilgi formu

BT ekibi dağıtımdan önce aşağıdaki alanları kesinleştirir:

| Konu | Kurum değeri |
| --- | --- |
| İşletim sistemi ve sürümü | |
| Docker Engine / Compose sürümü | |
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
- Backend'in kurumsal SMTP'ye ve DNS/NTP hizmetlerine çıkışı açık olmalıdır.
- Kurumsal PostgreSQL kullanılıyorsa yalnızca uygulama sunucusundan ilgili
  PostgreSQL host/portuna erişim verilir.
- `deploy/production.env` dosyası yalnızca servis yöneticisi tarafından
  okunabilir olmalı ve Git'e hiçbir zaman eklenmemelidir.
- Sunucunun saat eşitlemesi etkin olmalıdır; token süresi ve denetim kayıtları
  doğru saate bağlıdır.

Kurum Nginx'i için başlangıç örneği
`deploy/nginx/host-reverse-proxy.example.conf` dosyasındadır. Sertifika ve alan
adı değerleri kurum tarafından değiştirilir.

## 5. Sürüm seçimi ve dosyaların hazırlanması

Canlıya branch adıyla değil, testleri yeşil olan sabit bir release tag'iyle
çıkılması önerilir.

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

### Docker kullanılamıyorsa

Kurum politikası Docker'a izin vermiyorsa Node.js 22, PostgreSQL 16 veya kurumun
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
eder, migration'ları uygular ve SIGTERM sırasında bağlantıları güvenli kapatır.

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

## 9. Reverse proxy ve HTTPS kabulü

Kurum reverse proxy'si `127.0.0.1:8080` adresine yönlendirilir. Kabul sırasında:

- HTTP isteği HTTPS'e yönlenmeli.
- Sertifika alan adıyla eşleşmeli ve tarayıcı tarafından güvenilir olmalı.
- `APP_BASE_URL` tarayıcıdaki gerçek HTTPS adresiyle birebir eşleşmeli.
- Aktivasyon e-postasındaki bağlantı bu HTTPS adresini kullanmalı.
- 25 MB dosya yüklemesi proxy tarafından reddedilmemeli
  (`client_max_body_size 26m` veya kurumsal karşılığı).
- Backend ve PostgreSQL portları dış ağdan erişilememeli.

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

## 11. Güncelleme ve geri dönüş

Güncelleme sırası:

1. Veritabanı ve ek dosya yedeğini alın.
2. Onaylanmış release tag'ini çekin.
3. `docker compose ... config --quiet` çalıştırın.
4. `docker compose ... build --pull` çalıştırın.
5. `docker compose ... up -d` çalıştırın.
6. Health, SMTP ve temel kullanıcı akışlarını doğrulayın.

Migration sistemi yalnızca ileri yönlüdür. Yeni sürüm migration uygulamadıysa
önceki release tag'inin image'ları yeniden oluşturularak kod geri alınabilir.
Migration uygulandıysa yalnızca eski image'a dönmek güvenli kabul edilmez;
release öncesi veritabanı ve ek yedeği birlikte geri yüklenmelidir.

## 12. İzleme ve olay müdahalesi

İzleme sistemi en az şunları takip etmelidir:

- Dış HTTPS URL ve sertifika son kullanma tarihi
- `/healthz` ve `/api/ready` başarısı
- Container restart sayısı
- 5xx oranı ve backend hata logları
- PostgreSQL disk kullanımı ve bağlantı sayısı
- Ek dosya volume disk kullanımı
- SMTP hataları
- Yedekleme işinin son başarılı zamanı

Loglar parola, SMTP parolası, JWT veya aktivasyon tokenı içermemelidir. Destek
ekibine gönderilmeden önce e-posta ve kişisel veri alanları kurum politikasına
göre maskelenmelidir.

## 13. Canlı kabul listesi

- [ ] Onaylı release tag'i kullanıldı; Git çalışma alanı temiz.
- [ ] CI backend, gerçek PostgreSQL ve frontend build işleri yeşil.
- [ ] Production env Git tarafından yok sayılıyor ve dosya izni `600`.
- [ ] `/healthz`, `/api/health` ve `/api/ready` başarılı.
- [ ] HTTPS, alan adı ve proxy sayısı doğrulandı.
- [ ] Backend/PostgreSQL portları dışarı açık değil.
- [ ] SMTP verify başarılı.
- [ ] İlk admin oluşturuldu ve bootstrap parolası ortamdan silindi.
- [ ] Test posta kutusuyla kayıt ve tek kullanımlık aktivasyon tamamlandı.
- [ ] Rol/grup yetkileri örnek hesaplarla kontrol edildi.
- [ ] Dosya yükleme/indirme kontrol edildi.
- [ ] PostgreSQL ve ek dosya yedeği alındı.
- [ ] Geri yükleme sorumlusu ve bakım penceresi belirlendi.
- [ ] Log, disk, health ve yedek alarmları etkin.

Bu liste tamamlanmadan sistem canlı kabul edilmiş sayılmaz.
