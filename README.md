# LawDesk – Görev Yönetim Sistemi

LawDesk, Hukuk ve Uyum Başkanlığı ekiplerinin kullanıcı, grup ve görev süreçlerini merkezi bir web uygulaması üzerinden yönetmesini sağlayan görev yönetim sistemidir.

Sistem; rol tabanlı erişim, grup bazlı görev görünürlüğü, görev atama, alt görevler, yorumlar, dosya ekleri, etiketler, bildirimler, denetim kayıtları, dashboard raporları ve genel arama gibi özellikleri tek bir platformda bir araya getirir.

## Özellikler

### 🔐 Kimlik Doğrulama ve Kullanıcı Yönetimi

* Argon2id ile güvenli parola hashleme
* JWT tabanlı oturum yönetimi
* HttpOnly ve production ortamında güvenli cookie kullanımı
* Kullanıcı kayıt talebi ve admin onay süreci
* E-posta üzerinden hesap aktivasyonu
* Tek kullanımlık ve süreli aktivasyon tokenları
* SMTP kesintilerinde kalıcı e-posta kuyruğu ve otomatik yeniden deneme
* Aktif / pasif kullanıcı yönetimi
* Kullanıcıların birden fazla gruba atanabilmesi
* Grup bazında farklı roller tanımlayabilme
* Kayıt işlemleri için rate limiting

### 👥 Roller ve Yetkilendirme

Sistemde üç temel sistem rolü bulunur:

* **Admin**
* **Yönetici**
* **Kullanıcı**

Bunlara ek olarak grup üyeliğine bağlı olarak:

* **Grup Yöneticisi**
* **Grup Üyesi**

rolleri uygulanır.

Yetkilendirme; kullanıcının sistem rolü, grup üyeliği ve grup içerisindeki rolüne göre belirlenir.

### 📋 Görev Yönetimi

* Görev oluşturma ve düzenleme
* Görev tipi ve sorumlu grup belirleme
* Kullanıcıya doğrudan görev atama
* Atama yapılmadığında görev tipi grubuna otomatik yönlendirme
* Görev önceliği belirleme
* Bitiş tarihi kontrolü
* Görev durumlarını yönetme
* Tamamlanan ve iptal edilen görevlerin otomatik arşivlenmesi
* İptal işlemlerinde zorunlu neden
* Arşivlenmiş görevleri geri yükleme
* Tek seviyeli alt görev oluşturma
* Alt görevlerde ana görevden atama ve görünürlük mirası
* Görevlerin rol ve grup kapsamına göre görüntülenmesi

### 💬 Yorumlar ve Dosyalar

* Görevlere yorum ekleme
* Yorum düzenleme
* Yorum geçmişini görüntüleme
* Yorumları arşivleme ve geri yükleme
* Görevlere dosya ekleme
* Dosya indirme
* Dosya kaldırma ve geri yükleme

### 🏷️ Etiket ve Görev Tipleri

* Etiket oluşturma
* Etiket düzenleme
* Etiket arşivleme ve geri yükleme
* Görevlere etiket atama
* Etikete göre görev filtreleme
* Görev tipi oluşturma
* Görev tipi sorumlu grubu belirleme
* Görev tipi düzenleme
* Görev tipi arşivleme ve geri yükleme
* Görev tipi kullanım sayılarını görüntüleme

### 🔔 Bildirimler

Uygulama içi bildirim sistemi ile:

* Görev atama bildirimleri
* Görev durum değişiklikleri
* Yorum bildirimleri
* Okunmamış bildirim sayısı
* Bildirimleri okundu olarak işaretleme
* Sayfalanmış bildirim listesi

desteklenmektedir.

### 🔎 Genel Arama

Ana sayfadaki genel arama özelliği ile kullanıcının yetkisi dahilindeki:

* Görevler
* Yorumlar
* Dosya adları
* Gruplar
* Kullanıcılar
* Etiketler
* Görev tipleri
* Denetim kayıtları

aranabilir.

Arama sonuçları kullanıcının rol ve görünürlük kapsamına göre sınırlandırılır.

### 📊 Dashboard ve Raporlama

Dashboard üzerinden:

* Geciken görevler
* Yaklaşan görevler
* Bitiş tarihi olmayan görevler
* Görev oluşturma istatistikleri
* Görev tamamlama oranları
* Ortalama tamamlanma süresi
* Öncelik dağılımları
* Görev tipi dağılımları
* Kullanıcıların görev yükleri

görüntülenebilir.

Raporlar ve denetim kayıtları **UTF-8 CSV** formatında dışa aktarılabilir.

### 📄 Denetim Kaydı

Kullanıcı, grup, görev ve görev yaşam döngüsü işlemleri denetim kayıtlarında tutulur.

Denetim kayıtları;

* Kullanıcı
* İşlem türü
* Tarih aralığı

gibi kriterlere göre filtrelenebilir ve dışa aktarılabilir.

### 📑 Sayfalama

Büyük veri listelerinin daha verimli görüntülenmesi için sunucu taraflı pagination uygulanmıştır.

Sayfalama aşağıdaki temel listelerde kullanılmaktadır:

* Kullanıcılar
* Gruplar
* Görevler
* Bildirimler
* Denetim kayıtları
* Kayıt talepleri

---

## 🛠️ Teknolojiler

| Katman         | Teknoloji                      |
| -------------- | ------------------------------ |
| Frontend       | React 18, Vite                 |
| Backend        | Node.js, Express 5             |
| Database       | PostgreSQL                     |
| Authentication | JWT, Argon2id, HttpOnly Cookie |
| Testing        | Node.js Test Runner, Supertest, Playwright, k6 |
| Email          | SMTP                           |
| Deployment     | Docker Compose, Nginx, systemd örneği |
| CI/CD          | GitHub Actions                 |

---

## 📁 Proje Yapısı

```text
LawDesk/
├── backend/
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── scripts/
│   ├── services/
│   ├── integration/
│   └── tests/
│
├── frontend/
│   ├── e2e/
│   └── src/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── GYS_Database_Schema_Simple.sql
│
├── deploy/
│   ├── nginx/
│   ├── systemd/
│   ├── windows/
│   └── production.env.example
│
├── compose.production.yml
├── load/
│
└── docs/
    ├── DEPLOYMENT.md
    ├── GYS_ER_Diagram.pdf
    ├── generate_er_diagram.py
    └── PRODUCTION_CUTOVER.md
```

---

## ⚙️ Gereksinimler

* Node.js 24.11+ LTS
* npm
* PostgreSQL
* Git
* İsteğe bağlı: Docker Engine + Compose veya Docker Desktop, pgAdmin

## Üretim dağıtımı

Windows 10/11 üzerinde Docker/WSL2 kullanılamayan kurum ortamı için native
`IIS + Node.js + PostgreSQL` paketi bulunur. PowerShell araçları production env,
şema/migration, frontend build, IIS reverse proxy, backend başlangıç görevi,
health kontrolü, yedek ve geri yükleme işlemlerini yönetir. Linux/Docker Compose
ve systemd/Nginx seçenekleri de depoda korunur.

Windows istemci IIS sürümleri 10 eşzamanlı işlenen istek sınırına tabi olduğundan
50–70 hesaplı kurulum, gerçek hedef bilgisayarda `peak` yük testi geçmeden canlı
kabul edilmez. Ayrıntı ve Windows Server/alternatif proxy karar eşiği Windows
kurulum rehberindedir.

Gerçek değerleri içeren hiçbir `.env` dosyasını Git'e eklemeyin. Sunucu bilgi
formu, ağ/TLS ayarları, ilk admin, SMTP testi, yedekleme ve geri dönüş adımları
için [Üretim Dağıtım Rehberi](docs/DEPLOYMENT.md) izlenmelidir. Native Windows
komutları ayrıca [Windows Kurulum Rehberi](deploy/windows/README.md) içindedir.
Kurumla yapılacak son teslim ve GO/NO-GO kararı
[Windows Native Teslim ve Canlı Kabul Kontrol Listesi](docs/WINDOWS_NATIVE_HANDOFF_CHECKLIST.md)
üzerinden kayıt altına alınır.

---

## 🚀 Kurulum

### 1. Repository'yi klonlayın

```bash
git clone https://github.com/secil3/LawDesk.git
cd LawDesk
```

### 2. PostgreSQL veritabanını oluşturun

Boş bir PostgreSQL veritabanı oluşturun ve:

```text
database/GYS_Database_Schema_Simple.sql
```

dosyasını çalıştırın.

### 3. Backend'i yapılandırın

```bash
cd backend
cp .env.example .env
npm ci
```

`.env` dosyasındaki veritabanı, authentication ve SMTP bilgilerini kendi ortamınıza göre düzenleyin.

Windows PowerShell, `npm.ps1` çalıştırmayı güvenlik ilkesi nedeniyle engelliyorsa README'deki `npm` komutlarını `npm.cmd` olarak çalıştırabilirsiniz (örneğin `npm.cmd run dev`). Sistem genelindeki execution policy ayarını değiştirmek gerekmez.

`.env` içindeki bütün örnek değerleri kendi ortamınıza göre değiştirin:

```env
PORT=3001
BACKEND_BIND_ADDRESS=127.0.0.1
NODE_ENV=development
DATABASE_URL=postgresql://postgres:PAROLANIZ@localhost:5432/gys_lawdesk
INTEGRATION_DATABASE_URL=postgresql://postgres:PAROLANIZ@localhost:5432/gys_lawdesk_test
DB_SSL_MODE=disable
DB_SSL_CA_PATH=
DB_POOL_MAX=10
DB_IDLE_TIMEOUT_MS=30000
DB_CONNECTION_TIMEOUT_MS=5000
AUTH_TOKEN_SECRET=EN_AZ_64_KARAKTERLIK_RASTGELE_BIR_DEGER
AUTH_TOKEN_TTL_HOURS=8
AUTH_COOKIE_NAME=lawdesk_session
APP_BASE_URL=http://localhost:5175
CORS_ALLOWED_ORIGINS=
TRUST_PROXY_HOPS=0
LOGIN_RATE_LIMIT_WINDOW_MINUTES=15
LOGIN_RATE_LIMIT_MAX=10
ACTIVATION_TOKEN_TTL_HOURS=24
REGISTRATION_RATE_LIMIT_WINDOW_MINUTES=15
REGISTRATION_RATE_LIMIT_MAX=5
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_REQUIRE_TLS=true
SMTP_CONNECTION_TIMEOUT_MS=10000
SMTP_GREETING_TIMEOUT_MS=10000
SMTP_SOCKET_TIMEOUT_MS=20000
SMTP_USER=lawdesk@example.com
SMTP_PASSWORD=SMTP_HESAP_PAROLASI
SMTP_FROM=LawDesk <lawdesk@example.com>
EMAIL_OUTBOX_POLL_INTERVAL_MS=30000
EMAIL_OUTBOX_RETRY_BASE_MS=60000
EMAIL_OUTBOX_MAX_ATTEMPTS=10
EMAIL_OUTBOX_LOCK_TIMEOUT_MS=300000
EMAIL_OUTBOX_BATCH_SIZE=10
INITIAL_ADMIN_NAME=Admin Kullanici
INITIAL_ADMIN_EMAIL=admin@example.com
INITIAL_ADMIN_EMAIL_VERIFIED=false
INITIAL_ADMIN_PASSWORD=EN_AZ_12_KARAKTERLIK_GUCLU_PAROLA
```

`AUTH_TOKEN_SECRET` en az 64 karakter olmalıdır. `AUTH_TOKEN_TTL_HOURS` değeri 1-24 saat aralığında bir tam sayı olmalıdır. `APP_BASE_URL`, aktivasyon bağlantısının açacağı ve CORS tarafından izin verilecek frontend adresidir; production ortamında HTTPS olmalıdır. Başka güvenilir frontend origin'leri gerekiyorsa `CORS_ALLOWED_ORIGINS` alanına virgülle ayrılarak eklenir. Yerel geliştirmede `BACKEND_BIND_ADDRESS=127.0.0.1` ve `TRUST_PROXY_HOPS=0` bırakılır; production değerleri gerçek reverse proxy zincirine göre belirlenir. Yanlış proxy sayısı IP tabanlı hız limitini etkileyebileceği için altyapı topolojisi doğrulanmadan değiştirilmemelidir. Production ortamında `DB_SSL_MODE` açıkça seçilmelidir: yalnızca kapalı özel ağ için `disable`, şifreli fakat sertifika doğrulamasız bağlantı için `require`, kurumsal uzak PostgreSQL için tercihen `verify-full`. Port 587 için `SMTP_SECURE=false` ve `SMTP_REQUIRE_TLS=true`; doğrudan TLS kullanan port 465 için genellikle `SMTP_SECURE=true` kullanılır. Kurum SMTP sunucusunun değerleri esas alınmalıdır.

Mac veya Linux ortamında güvenli bir token anahtarı üretmek için aşağıdaki komutun çıktısını `AUTH_TOKEN_SECRET` değeri olarak kullanabilirsiniz:

```bash
openssl rand -hex 64
```

### 4. Migration'ları çalıştırın

```bash
npm run migrate
```

Geliştirme verileri gerekiyorsa:

```bash
npm run seed:development
```

### 5. İlk admin hesabını oluşturun

```bash
npm run create-admin
```

### 6. Backend'i başlatın

```bash
npm run dev
```

Backend:

```text
http://localhost:3001
```

### 7. Frontend'i başlatın

Yeni bir terminalde:

```bash
cd frontend
npm ci
npm run dev
```

Frontend:

```text
http://localhost:5175
```

---

## 🧪 Test

### Unit Tests

```bash
cd backend
npm test
```

Güncel birim test paketi 235 senaryodan oluşur ve kayıt talebinin genel yanıtı, aktif admin bildirimi, admin onayı/e-posta kuyruğu, outbox şifreleme ve SMTP yeniden deneme davranışı, güvenli backend dinleme adresi, migration checksum/tekrar çalıştırma davranışı, migration kilidi hatası, production şablon değerlerinin reddi, SMTP şifreleme/test taşıyıcısı/port/zaman aşımı zorunlulukları, üretim veritabanı/TLS ayarları, liveness-readiness kontrolleri, tek kullanımlık aktivasyon, Argon2id, auth, giriş hız limiti, CORS origin sınırı, yetkilendirme, kullanıcı/grup yönetimi ve sayfalama, görev görünürlüğü, grup bazlı kapalı görev kapsamı, görev tipi-grup yönlendirmesi, atama, düzenleme, yaşam döngüsü, alt görev, yorum, eşzamanlı ek sınırı, disk kaybında PostgreSQL dosya yedeğine dönüş, dosya eki, etiket, bildirim görünürlüğü, görev tipi yönetimi, genel arama, denetim izi dışa aktarma ve görünürlük kapsamlı dashboard raporu akışlarını kapsar.

Testler authentication, authorization, kullanıcı ve grup yönetimi, görev yönetimi, görev görünürlüğü, görev tipleri, atama, alt görevler, yorumlar, dosya ekleri, etiketler, bildirimler, genel arama, audit log ve dashboard raporları gibi temel akışları kapsamaktadır.

### PostgreSQL Integration Tests

Test ortamı için ayrı bir PostgreSQL veritabanı oluşturulmalıdır:

```sql
CREATE DATABASE gys_lawdesk_test;
```

Ardından:

```bash
cd backend
npm run test:integration
```

Komut, `gys_lawdesk_test` veritabanının `public` şemasını silip güncel SQL şemasından yeniden kurar ve 19 gerçek PostgreSQL senaryosu çalıştırır. Kapsam; migration takibi, normalize grup adı benzersizliği, kayıt talebi, admin onayı, tek kullanımlık aktivasyon ve girişin yanında yorum/sürüm geçmişi, dosya yükleme-indirme-arşivleme-geri yükleme, etiket atama/filtreleme, alt görev mirası, grup bazlı kapalı görev kapsamı ve bildirim sahipliği/okunmamış akışlarını içerir. Güvenlik kontrolü nedeniyle veritabanı adı `_test` ile bitmiyorsa işlem tablo değişikliği yapmadan durur. `INTEGRATION_DATABASE_URL` hiçbir zaman geliştirme veya üretim veritabanını göstermemelidir.

### Tüm Testler

```bash
npm run test:all
```

### Frontend Build

```bash
cd frontend
npm run build
```

### Tarayıcı E2E testi

Playwright testi; gerçek PostgreSQL ve MailHog ile kayıt talebi, admin onayı,
aktivasyon e-postası, parola belirleme, giriş ve görev oluşturma zincirini
doğrular. GitHub Actions bu ortamı otomatik kurar. Yerelde çalıştırmak için ayrı
bir `_test` veritabanı ve MailHog gerekir; ardından frontend klasöründe:

```bash
npx playwright install chromium
npm run test:e2e
```

### 50–70 kullanıcı yük testi

`.github/workflows/load-test.yml` içindeki **LawDesk Load Test** iş akışı elle
başlatılır. `smoke`, `standard` ve 70 sanal kullanıcılı `peak` profilleri
bulunur. Test yalnızca adı `_test` ile biten geçici veritabanını seed eder;
eşikler ve senaryo ayrıntıları `load/README.md` içindedir.

### CI

GitHub Actions, `main` branch'ine yapılan push ve Pull Request işlemlerinde PostgreSQL servisli backend testlerini, frontend build'ini, yüksek/kritik bağımlılık taramasını, Playwright tarayıcı E2E akışını, native Windows PowerShell paketini ve production Docker paketinin gerçek PostgreSQL ile ayağa kalkma/health kontrollerini otomatik olarak çalıştırır. Tam yük testi ayrı ve manuel iş akışıdır.

---

## 🔒 Güvenlik

LawDesk'te temel güvenlik gereksinimleri dikkate alınarak:

* Parolalar **Argon2id** ile hashlenir.
* JWT tabanlı authentication kullanılır.
* Session cookie `HttpOnly` olarak tutulur.
* Production ortamında `Secure` ve `SameSite=Strict` cookie özellikleri kullanılır.
* Aktivasyon tokenının kalıcı doğrulama kaydı yalnızca SHA-256 özetidir. SMTP gönderimi tamamlanana kadar outbox kopyası AES-256-GCM ile şifreli tutulur ve başarılı gönderimde silinir.
* Aktivasyon bağlantıları süreli ve tek kullanımlıdır.
* Kayıt endpoint'i rate limiting uygular.
* Başarısız giriş denemeleri IP bazında sınırlandırılır; bilinmeyen veya pasif hesaplarda da Argon2id doğrulaması çalıştırılır.
* Pasif veya arşivlenmiş kullanıcıların oturum açmasına izin verilmez.
* Yetkisiz kullanıcıların görev ve grup verilerine erişimi engellenir.
* Görev ve dashboard sonuçları kullanıcının görünürlük kapsamına göre filtrelenir.
* CORS yalnızca açıkça izin verilen frontend origin'lerini kabul eder.
* API ve production Nginx güvenlik başlıkları uygular; teknoloji başlığı gizlenir.
* Production veritabanı TLS modu açıkça seçilir ve bağlantı havuzu sınırlandırılır.
* Native Windows backend'i yalnızca loopback adresinde dinler; dış erişim IIS HTTPS üzerinden yapılır.
* Grup yöneticisinin kapalı/arşivlenmiş görev erişimi yalnızca yönettiği gruplarla sınırlıdır.
* Grup adları boşluk ve büyük/küçük harf farkı yok sayılarak veritabanı seviyesinde benzersizdir.
* Gerçek kullanıcı bilgileri seed veya migration dosyalarında tutulmaz.

> Dağıtım paketi güvenli başlangıç değerlerini sağlar; kurumun TLS, güvenlik duvarı, secret yönetimi, yedekleme, izleme ve olay müdahalesi politikaları canlı kabul sırasında ayrıca uygulanmalıdır.

---

## 📌 Proje Durumu

LawDesk, görev ve ekip yönetimi için çalışan bir **MVP uygulamasıdır**.

Temel authentication, authorization, kullanıcı ve grup yönetimi, görev yaşam döngüsü, görev görünürlüğü, alt görevler, yorumlar, dosya ekleri, etiketler, bildirimler, dashboard, raporlama, audit log, pagination ve global search özellikleri uygulanmıştır.

Uygulama üzerinde gerçek PostgreSQL veritabanı ile kritik akışların entegrasyon testleri yapılmakta ve GitHub Actions üzerinden otomatik kontroller çalıştırılmaktadır.

Production deployment paketi depoda bulunmaktadır. Canlı kullanım; kurumun sunucu, alan adı/TLS, SMTP, yedekleme ve izleme bilgileriyle `docs/DEPLOYMENT.md` kabul listesinin tamamlanmasına bağlıdır.

---

## 📚 Dokümantasyon

* [ER Diagram](docs/GYS_ER_Diagram.pdf)
* [Production Deployment Guide](docs/DEPLOYMENT.md)
* [Native Windows Deployment Guide](deploy/windows/README.md)
* [Production Cutover Guide](docs/PRODUCTION_CUTOVER.md)

---

## 🌿 Git Workflow

Yeni özellikler doğrudan `main` branch'inde geliştirilmemelidir.

```bash
git switch main
git pull --ff-only
git switch -c feature/kisa-aciklama
```

Değişiklikler test ve build kontrollerinden geçirildikten sonra Pull Request ile `main` branch'ine eklenmelidir.

---

##  Developers

* **Secil Keser**

* **Umut Can Akgün**
