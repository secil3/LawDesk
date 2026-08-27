# LawDesk gerçek ortama geçiş sırası

Bu belge, mevcut veritabanında yalnızca deneme/örnek kayıtları bulunduğu varsayımıyla hazırlanmıştır. Örnek kullanıcıları gerçek kişilere yeniden adlandırmak veya örnek görevleri gerçek hesaplara bağlamak yerine temiz bir veritabanına geçilir. Böylece deneme geçmişi, bildirimler ve görev ilişkileri üretim verisine karışmaz.

Sunucu kurulumu, HTTPS/reverse proxy, health kontrolleri, yedekleme ve geri
dönüş işlemleri için bu veri geçiş sırasıyla birlikte
[`DEPLOYMENT.md`](DEPLOYMENT.md) belgesi izlenmelidir.
Docker/WSL2 kullanılamayan Windows 10/11 kurulumu için ayrıca
[`deploy/windows/README.md`](../deploy/windows/README.md) uygulanır.

## 1. Gerçek kullanıcı ve admin e-posta planı

- Mevcut demo veritabanı silinmez; gerektiğinde karşılaştırma ve geri dönüş için kapalı tutulur.
- Üretim için ayrı, boş bir PostgreSQL veritabanı oluşturulur.
- Gerçek e-postalar kaynak koda, seed dosyasına, migration'a veya GitHub'a yazılmaz.
- İlk adminin adı ve kurumsal e-postası yalnızca sunucudaki `.env` dosyasında `INITIAL_ADMIN_NAME` ve `INITIAL_ADMIN_EMAIL` olarak tanımlanır. Native Windows'ta bu dosya `C:\ProgramData\LawDesk\config\lawdesk.env` konumundadır.
- Kurum, ilk adminin ilgili posta kutusuna erişebildiğini bağımsız olarak doğrular. Bu doğrulamadan sonra `INITIAL_ADMIN_EMAIL_VERIFIED=true` ayarlanır.
- İlk admin `npm run create-admin` ile oluşturulur. Diğer admin, yönetici ve kullanıcı hesapları örnek kayıtların dönüştürülmesiyle değil, kayıt talebi ve aktivasyon akışıyla açılır.
- İlk admin parolası yalnızca bootstrap sırasında kullanılır ve işlemden sonra `.env` dosyasından kaldırılır.

Bu yaklaşımda toplu e-posta eşlemesi yapılmaz. Çünkü korunması gereken gerçek kullanıcı kimliği veya görev geçmişi yoktur; örnek kimlikleri gerçek kişilere devretmek hatalı denetim izi üretir.

## 2. Örnek verileri üretim şemasından ayırma

`database/GYS_Database_Schema_Simple.sql` yalnızca tablo, constraint, indeks ve temel sistem tanımlarını kurar. Örnek kullanıcı, üyelik, görev, alt görev ve yorumlar `database/seeds/development.sql` içindedir.

Production sunucusunda aşağıdaki komut çalıştırılmaz:

```bash
npm run seed:development
```

Seed scripti ayrıca `NODE_ENV=production` durumunda çalışmayı reddeder.

## 3. Tek komutlu ve kayıt tutan migration sistemi

Temiz ana şema bir kez kurulduktan sonra backend klasöründe:

```bash
npm ci
npm run migrate
```

Migration runner dosyaları ada göre sıralar, advisory lock kullanır, her migration'ı transaction içinde uygular ve checksum ile `schema_migrations` tablosuna kaydeder. Aynı komut tekrar çalıştırıldığında tamamlanan migration'lar atlanır.

Native Windows kurulumunda şema ve migration adımları elle ayrı ayrı
çalıştırılmak zorunda değildir. `deploy\windows\Install-LawDesk.ps1`, temiz
veritabanını algılayıp ana şemayı bir kez kurar ve ardından aynı checksum kontrollü
migration runner'ı çalıştırır. Dolu fakat LawDesk şeması olmayan veritabanında
işlem güvenlik amacıyla durur.

## 4. Kayıt talebi ve aktivasyon tabloları

Migration sonrasında aşağıdaki tabloların varlığı doğrulanır:

```sql
SELECT to_regclass('public.kayit_talepleri'),
       to_regclass('public.kullaniciaktivasyontokenlari'),
       to_regclass('public.epostaoutbox'),
       to_regclass('public.schema_migrations');
```

Dört alanın da tablo adıyla dönmesi gerekir. `NULL` görülürse sonraki adıma geçilmez.

## 5. Backend kayıt, onay ve aktivasyon akışı

Sırasıyla şu kontroller yapılır:

1. Geçerli, geçersiz ve tekrarlanan kayıt talepleri aynı genel `202` mesajını döndürür.
2. Geçerli talep `kayit_talepleri` tablosunda `Bekliyor` durumunda oluşur.
3. Admin onayı pasif ve aktivasyon bekleyen kullanıcı oluşturur.
4. Aktivasyon tablosunda yalnızca SHA-256 özeti tutulur. SMTP teslimi tamamlanana
   kadar gönderim kopyası outbox'ta AES-256-GCM ile şifreli tutulur ve başarılı
   gönderimde silinir.
5. Kullanıcı parolasını iki kez girdikten sonra Argon2id hash'i kaydedilir, e-posta doğrulanır ve hesap aktifleşir.
6. Aynı aktivasyon bağlantısı ikinci kez kullanılamaz.

## 6. Admin ekranı ve uygulama içi bildirim

- Aktif admin yeni kayıt talebi bildirimi görmelidir.
- Bildirim ilgili kayıt talebi ekranını açmalıdır.
- Admin sistem rolünü ve gerekirse grup/grup rolünü seçebilmelidir.
- Aktivasyon bekleyen hesap normal kullanıcı yönetimi endpoint'iyle elle aktifleştirilememelidir.
- E-posta gönderimi başarısızsa hesap/talep korunmalı, iş outbox'ta kalmalı ve
  artan aralıklarla otomatik yeniden denenmelidir. Deneme sınırı dolarsa admin
  yeni aktivasyon bağlantısı gönderebilmelidir.

## 7. SMTP e-posta gönderimi

Production ortamında `APP_BASE_URL` HTTPS olmalıdır. Port 587 için `SMTP_SECURE=false` ve `SMTP_REQUIRE_TLS=true`; port 465 için genellikle `SMTP_SECURE=true` kullanılır. Production veritabanı bağlantısında `DB_SSL_MODE` açıkça tanımlanır; uzak kurumsal PostgreSQL için tercihen `verify-full` ve kurum CA sertifikası kullanılır.

`APP_BASE_URL` aynı zamanda izin verilen ana frontend origin'ini belirler. Ek origin gerekiyorsa yalnızca güvenilir adresler `CORS_ALLOWED_ORIGINS` içine virgülle ayrılarak yazılır. Uygulama doğrudan internete açıksa `TRUST_PROXY_HOPS=0` kalır; tam olarak bir güvenilir reverse proxy arkasındaysa `1` kullanılır. Proxy sayısı doğrulanmadan genel bir `trust proxy` ayarı verilmez; aksi halde giriş ve kayıt hız limitinin kullandığı istemci IP'si yanıltılabilir.

Native Windows paketinde IIS tek reverse proxy'dir; bu nedenle
`BACKEND_BIND_ADDRESS=127.0.0.1` ve `TRUST_PROXY_HOPS=1` kullanılır. Windows
Firewall'da backend'in `3001/TCP` portu ile PostgreSQL'in `5432/TCP` portu dış
ağa açılmaz. IIS URL Rewrite/ARR, gerçek istemci adresini yalnızca güvenilir IIS
katmanından backend'e aktarır.

İlk gerçek kullanıcı başvurusundan önce kurumun kontrolündeki bir test posta kutusuyla uçtan uca gönderim yapılır. Bağlantının doğru domaine gittiği, 24 saatlik olduğu, tek kullanımlı çalıştığı ve e-posta içeriğinde parola bulunmadığı doğrulanır.

SMTP kısa süreli kapatılarak bir deneme daha yapılır. Kayıt onayı korunmalı,
`epostaoutbox` kaydı `Bekliyor` durumuna dönmeli ve SMTP yeniden açıldığında
worker müdahale olmadan gönderimi tamamlamalıdır.

## 8. Birim ve gerçek PostgreSQL entegrasyon testleri

```bash
cd backend
npm test
npm run test:integration
```

Entegrasyon testleri yalnızca adı `_test` ile biten ayrı veritabanında çalıştırılır. Production `DATABASE_URL` değeri test komutuna verilmez. GitHub Actions sonuçlarında backend, gerçek PostgreSQL, frontend build, Playwright E2E, native Windows package ve production deployment işlerinin tamamı yeşil olmadan merge veya canlıya geçiş yapılmaz. Canlı kabul öncesinde ayrıca **LawDesk Load Test** iş akışının 70 kullanıcılı `peak` profili çalıştırılır.

Native Windows kurulumu tamamlandıktan sonra IIS, backend ve PostgreSQL birlikte
şu kabul komutuyla doğrulanır:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File deploy\windows\Test-LawDeskHealth.ps1 -PublicBaseUrl https://lawdesk.kurum.example
```

## 9. ER diyagramı ve README

Son şema `docs/GYS_ER_Diagram.pdf` içinde gösterilir. Diyagram; görev tipi-grup bağlantısını, alt görev ilişkisini, otomatik arşiv/iptal nedenini, kayıt taleplerini, aktivasyon tokenlarını, bildirimleri ve migration takibini içermelidir. Kurulum ve ortam değişkenleri README ile bu belgeye uygun tutulur.

## Canlıya geçiş kontrol listesi

1. Demo veritabanını kapalı tutun; üzerinde `DROP SCHEMA` çalıştırmayın.
2. Ayrı ve boş üretim veritabanını oluşturun.
3. Ana şemayı kurun ve `npm run migrate` çalıştırın; native Windows'ta bunları `Install-LawDesk.ps1` ile yapın.
4. Kurumsal admin e-postasını doğrulayın; ilk admini oluşturun. Native Windows'ta kurucuya `-CreateInitialAdmin` verin.
5. `INITIAL_ADMIN_PASSWORD` değerini sunucu ortamından kaldırın.
6. HTTPS frontend origin'ini ve reverse proxy sayısını doğrulayın; CORS ve hız limiti ayarlarını buna göre yapın.
7. SMTP testini kurumun test posta kutusuyla tamamlayın.
8. Birim, PostgreSQL entegrasyon, frontend build, Playwright E2E ve native Windows package kontrollerini çalıştırın.
9. İlk gerçek kullanıcıyı kayıt talebi üzerinden uçtan uca aktifleştirin.
10. 70 kullanıcılı `peak` yük testinin eşiklerden geçtiğini doğrulayın.
11. Veritabanı ve ek dosya yedeğini birlikte alın; manifesti doğrulayın, sunucu dışı kopya ile log/geri dönüş sorumlularını belirleyin.

Yeni üretim veritabanında sorun çıkarsa uygulamanın `DATABASE_URL` değeri değiştirilmeden önce servis durdurulur. Demo veritabanı değiştirilmediği için inceleme amacıyla korunur; gerçek kullanıcı verisi demo veritabanına geri yazılmaz.
