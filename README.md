# LawDesk – Görev Yönetim Sistemi

LawDesk, Hukuk ve Uyum Başkanlığı ekiplerinin kullanıcı, grup ve görev süreçlerini tek bir web uygulamasından yönetebilmesi için geliştirilen bir görev yönetim sistemidir.

Uygulama şu anda çalışan bir **çekirdek MVP** durumundadır. Kimlik doğrulama, rol tabanlı erişim, grup üyelikleri, görev atama ve görünürlük kuralları, görev yaşam döngüsü, yorumlar, dosya ekleri, etiketler, arşivleme ve temel denetim izi uygulanmıştır. Üretim ortamına geçiş için güvenlik sertleştirmesi, gerçek PostgreSQL entegrasyon testleri ve kurulum/operasyon çalışmaları hâlâ gereklidir.

## Mevcut özellikler

- Argon2id parola doğrulaması
- JWT tabanlı oturum ve HttpOnly çerez
- Aktif, pasif ve arşivlenmiş kullanıcı kontrolü
- Admin, yönetici, grup yöneticisi, grup üyesi ve kullanıcı yetki seviyeleri
- Kullanıcı oluşturma, aktif/pasif yapma, arşivleme ve geri yükleme
- Grup oluşturma; grup adı ve açıklaması düzenleme
- Kullanıcının birden fazla gruba eklenmesi
- Kullanıcının grup üyeliklerini ve grup rollerini sonradan değiştirme
- Her kullanıcının görev oluşturabilmesi
- Görevi kullanıcıya veya gruba atama
- Rol ve grup üyeliğine göre görev görünürlüğü
- Görev başlığı, açıklaması, tipi, önceliği ve bitiş tarihini düzenleme
- Geçmiş tarih ve saat için bitiş tarihi oluşturmayı engelleme
- Görev durumunu değiştirme, kapatma ve yeniden açma
- Görevleri arşivleme ve geri yükleme
- Göreve yorum ekleme; yorumu düzenleme, geçmişini görüntüleme, arşivleme ve geri yükleme
- Doğrulanmış dosyaları göreve ekleme, indirme, kaldırma ve geri yükleme
- Etiket oluşturma, yeniden adlandırma, arşivleme ve geri yükleme
- Görevlere etiket atama ve görev listesini etikete göre filtreleme
- Kullanıcı, grup, görev ve yaşam döngüsü işlemleri için denetim kayıtları

## Roller ve temel yetkiler

Sistem rolleri `admin`, `yonetici` ve `kullanici` olarak saklanır. Grup yöneticisi ve grup üyesi yetkileri, kullanıcının grup üyeliği üzerinden belirlenir.

| Rol | Temel yetkiler |
| --- | --- |
| Admin | Kullanıcı ve grup yönetimi; tüm görevleri görüntüleme, atama, düzenleme, kapatma, arşivleme ve denetim izini görüntüleme |
| Yönetici | Tüm görevleri görüntüleme ve yönetme; görev atama, yaşam döngüsü işlemleri ve denetim izini görüntüleme |
| Grup yöneticisi | Yönettiği grupların görevlerini ve üyelerini kapsayan görev atama, durum, kapatma, arşivleme ve geri yükleme işlemleri |
| Grup üyesi | Kendi oluşturduğu, kendisine atanan veya grubuna görünür görevleri görüntüleme; kendi aktif görevlerini düzenleme |
| Kullanıcı | Görev oluşturma; kendi oluşturduğu veya doğrudan kendisine görünür görevleri görüntüleme ve kendi aktif görevlerini düzenleme |

Bir kullanıcı birden fazla grupta yer alabilir ve her grupta farklı bir role sahip olabilir. Tamamlanmış görevler normal kullanıcı listelerinden kaldırılır; gerekli yönetim yetkisine sahip kullanıcılar kendi yetki kapsamlarında bu görevleri görmeye devam eder.

## Kullanılan teknolojiler

- Frontend: React 18 ve Vite
- Backend: Node.js, Express 5 ve CommonJS
- Veritabanı: PostgreSQL (`pg` bağlantı havuzu)
- Kimlik doğrulama: Argon2id, JWT ve HttpOnly çerez
- Test: Node.js test runner ve Supertest

## Proje yapısı

```text
LawDesk/
├── backend/
│   ├── config/          Veritabanı ve kimlik doğrulama ayarları
│   ├── controllers/     API iş kuralları
│   ├── middleware/      Oturum ve rol kontrolleri
│   ├── routes/          Auth, admin ve görev endpoint'leri
│   ├── scripts/         Admin ve migration komutları
│   └── tests/           Backend otomatik testleri
├── frontend/
│   └── src/             React arayüzü ve API yardımcıları
├── database/
│   ├── migrations/      Mevcut veritabanları için migration dosyaları
│   └── GYS_Database_Schema_Simple.sql
└── docs/
    └── GYS_ER_Diagram.pdf
```

[ER diyagramını görüntüle](docs/GYS_ER_Diagram.pdf)

## Gereksinimler

- Node.js 22.12 veya üzeri
- npm
- PostgreSQL
- Git
- İsteğe bağlı olarak Docker Desktop ve pgAdmin

PostgreSQL yerel olarak, Docker container içinde veya kurumun sağladığı uyumlu bir sunucuda çalışabilir.

## Kurulum

### 1. Projeyi indirme

```bash
git clone https://github.com/secil3/LawDesk.git
cd LawDesk
```

### 2. Veritabanını hazırlama

Yeni ve boş bir PostgreSQL veritabanı oluşturun. Veritabanı adı, daha sonra `DATABASE_URL` içinde kullandığınız adla aynı olmalıdır.

Temiz kurulumda aşağıdaki dosyayı pgAdmin Query Tool veya `psql` ile **bir kez** çalıştırın:

```text
database/GYS_Database_Schema_Simple.sql
```

Bu dosya tabloları, temel grupları, görev tiplerini ve geliştirme amaçlı örnek kayıtları oluşturur. Örnek kullanıcıların `HASH_PLACEHOLDER` parolalarıyla giriş yapılamaz; ilk admin hesabı aşağıdaki script ile hazırlanmalıdır.

Daha eski bir LawDesk veritabanını güncelliyorsanız migration komutlarını, bir sonraki adımda backend bağımlılıklarını kurduktan sonra çalıştırın. Güncel SQL şemasıyla oluşturulan temiz veritabanında migration gerekmez.

### 3. Backend ayarları

Backend klasöründe örnek ortam dosyasını kopyalayın:

```bash
cd backend
cp .env.example .env
npm install
```

Windows Komut İstemi kullanıyorsanız kopyalama için `copy .env.example .env` komutunu kullanabilirsiniz.

`.env` içindeki bütün örnek değerleri kendi ortamınıza göre değiştirin:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:PAROLANIZ@localhost:5432/gys_lawdesk
AUTH_TOKEN_SECRET=EN_AZ_64_KARAKTERLIK_RASTGELE_BIR_DEGER
AUTH_TOKEN_TTL_HOURS=8
AUTH_COOKIE_NAME=lawdesk_session
INITIAL_ADMIN_NAME=Admin Kullanici
INITIAL_ADMIN_EMAIL=admin@sirket.com
INITIAL_ADMIN_PASSWORD=EN_AZ_12_KARAKTERLIK_GUCLU_PAROLA
```

`AUTH_TOKEN_SECRET` en az 64 karakter olmalıdır. `AUTH_TOKEN_TTL_HOURS` değeri 1–24 saat aralığında bir tam sayı olmalıdır.

Mac veya Linux ortamında güvenli bir token anahtarı üretmek için aşağıdaki komutun çıktısını `AUTH_TOKEN_SECRET` değeri olarak kullanabilirsiniz:

```bash
openssl rand -hex 64
```

Gerçek `.env` dosyası, veritabanı parolası, token anahtarı ve kullanıcı parolaları GitHub'a gönderilmemelidir.

Mevcut eski bir veritabanını güncelliyorsanız, `npm install` tamamlandıktan sonra migration'ları sırasıyla çalıştırın:

```bash
npm run migrate:user-archive
npm run migrate:task-core
npm run migrate:task-lifecycle
npm run migrate:task-attachments
npm run migrate:task-comments
npm run migrate:task-tags
```

### 4. İlk admin hesabı

Veritabanı ve `.env` hazırlandıktan sonra:

```bash
npm run create-admin
```

Script, aynı e-postaya sahip `HASH_PLACEHOLDER` admin kaydını güvenli Argon2id hash'iyle günceller veya yeni bir admin oluşturur. İşlem tamamlandıktan sonra `INITIAL_ADMIN_PASSWORD` değerini `.env` dosyasından kaldırmanız önerilir.

Admin parolasını daha sonra sıfırlamak için `.env` dosyasına geçici olarak `RESET_ADMIN_EMAIL` ve `RESET_ADMIN_PASSWORD` değerlerini ekleyip şu komutu çalıştırabilirsiniz:

```bash
npm run reset-admin-password
```

### 5. Uygulamayı çalıştırma

Backend klasöründeki terminalde:

```bash
npm run dev
```

Backend adresi:

```text
http://localhost:3001
```

İkinci terminalde frontend'i çalıştırın:

```bash
cd frontend
npm install
npm run dev
```

Frontend adresi:

```text
http://localhost:5175
```

Vite geliştirme sunucusu `/api` isteklerini `http://localhost:3001` adresindeki backend'e yönlendirir. Geliştirme sırasında iki terminal de açık kalmalıdır.

## Doğrulama ve test

Backend otomatik testleri:

```bash
cd backend
npm test
```

Güncel test paketi 115 senaryodan oluşur ve auth, yetkilendirme, kullanıcı/grup yönetimi, görev görünürlüğü, atama, düzenleme, yaşam döngüsü, yorum, dosya eki ve etiket akışlarını kapsar.

Frontend production build kontrolü:

```bash
cd frontend
npm run build
```

Temel bağlantı kontrolleri:

| Kontrol | Adres |
| --- | --- |
| Backend | `http://localhost:3001` |
| Veritabanı bağlantısı | `http://localhost:3001/api/db-test` |
| Frontend | `http://localhost:5175` |

## API özeti

### Kimlik doğrulama

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| POST | `/api/auth/login` | Oturum açar ve HttpOnly çerez oluşturur |
| GET | `/api/auth/me` | Mevcut oturumu ve grup üyeliklerini döndürür |
| POST | `/api/auth/logout` | Oturumu kapatır |

### Admin işlemleri

Bu endpoint'lerin tamamı `admin` sistem rolü gerektirir.

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| GET | `/api/admin/users` | Arşivlenmemiş veya `?archived=true` ile arşivlenmiş kullanıcıları listeler |
| POST | `/api/admin/users` | Kullanıcı oluşturur |
| PATCH | `/api/admin/users/:id` | Kullanıcıyı aktif veya pasif yapar |
| DELETE | `/api/admin/users/:id` | Kullanıcıyı fiziksel silmeden arşivler |
| PATCH | `/api/admin/users/:id/restore` | Kullanıcıyı pasif olarak geri yükler |
| PUT | `/api/admin/users/:id/memberships` | Grup üyeliklerini ve grup rollerini atomik olarak günceller |
| GET | `/api/admin/groups` | Grupları ve üye sayılarını listeler |
| POST | `/api/admin/groups` | Grup oluşturur |
| PATCH | `/api/admin/groups/:id` | Grup adı ve açıklamasını günceller |

### Görev işlemleri

Bütün görev endpoint'leri geçerli oturum gerektirir; sonuçlar ve işlemler kullanıcının rolüne ve grup kapsamına göre sınırlandırılır.

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| GET | `/api/tasks` | Görünür aktif görevleri veya `?archived=true` ile yetkili arşiv görünümünü döndürür |
| GET | `/api/tasks/:id` | Yetkili kullanıcının görev detayını döndürür |
| GET | `/api/tasks/options` | Görev tiplerini ve yetkiye uygun atama seçeneklerini döndürür |
| POST | `/api/tasks` | Görev oluşturur |
| PATCH | `/api/tasks/:id` | Başlık, açıklama, tip, öncelik ve bitiş tarihini günceller |
| PATCH | `/api/tasks/:id/assignment` | Görevin atamasını günceller |
| PATCH | `/api/tasks/:id/status` | Durumu değiştirir, kapatır veya yeniden açar |
| DELETE | `/api/tasks/:id` | Görevi fiziksel silmeden arşivler |
| PATCH | `/api/tasks/:id/restore` | Arşivlenmiş görevi geri yükler |
| GET | `/api/tasks/:id/comments` | Aktif veya `?archived=true` ile arşivlenmiş yorumları döndürür |
| POST | `/api/tasks/:id/comments` | Göreve yorum ekler |
| PATCH | `/api/tasks/:id/comments/:commentId` | Yorumu sürüm kontrolüyle düzenler |
| GET | `/api/tasks/:id/comments/:commentId/history` | Yorumun önceki sürümlerini döndürür |
| DELETE | `/api/tasks/:id/comments/:commentId` | Yorumu fiziksel silmeden arşivler |
| PATCH | `/api/tasks/:id/comments/:commentId/restore` | Arşivlenmiş yorumu geri yükler |
| GET | `/api/tasks/:id/attachments` | Aktif veya kaldırılmış görev eklerini döndürür |
| POST | `/api/tasks/:id/attachments` | Doğrulanmış bir dosyayı göreve ekler |
| GET | `/api/tasks/:id/attachments/:attachmentId/download` | Yetkili kullanıcının görev ekini indirmesini sağlar |
| DELETE | `/api/tasks/:id/attachments/:attachmentId` | Eki fiziksel silmeden kaldırır |
| PATCH | `/api/tasks/:id/attachments/:attachmentId/restore` | Kaldırılmış eki geri yükler |
| GET | `/api/tasks/tags` | Aktif etiketleri veya yetkili kullanıcı için `?archived=true` ile etiket arşivini döndürür |
| POST | `/api/tasks/tags` | Admin veya yönetici için yeni etiket oluşturur |
| PATCH | `/api/tasks/tags/:tagId` | Admin veya yönetici için etiket adını günceller |
| DELETE | `/api/tasks/tags/:tagId` | Admin veya yönetici için etiketi fiziksel silmeden arşivler |
| PATCH | `/api/tasks/tags/:tagId/restore` | Admin veya yönetici için etiketi geri yükler |
| GET | `/api/tasks/:id/tags` | Görevin etiketlerini ve kullanılabilir etiketleri döndürür |
| PUT | `/api/tasks/:id/tags` | Yetkili kullanıcının görev etiketlerini atomik olarak değiştirir |
| GET | `/api/tasks/activity` | Admin ve yöneticiler için son işlem kayıtlarını döndürür |

Kapalı veya iptal edilmiş görevlerin bilgileri değiştirilemez; önce görev yeniden açılmalıdır. Arşivlenmiş görevler düzenlenmeden önce geri yüklenmelidir.

## Güvenlik notları

- Parolalar Argon2id ile hash'lenir ve düz metin olarak saklanmaz.
- Oturum çerezi HttpOnly'dir; production modunda `Secure` ve `SameSite=Strict` kullanılır.
- JWT issuer, audience, algoritma ve süre kontrolleri yapılır.
- Olmayan kullanıcı ve yanlış parola aynı hata mesajını üretir.
- Pasif veya arşivlenmiş kullanıcıların oturumları kabul edilmez.
- `.env`, `node_modules`, build çıktıları ve veritabanı yedekleri Git'e eklenmemelidir.

Mevcut CORS ayarı geliştirme kolaylığı için dinamiktir. Üretime geçmeden önce izin verilen kurum origin'iyle sınırlandırılmalı; HTTPS, güvenlik başlıkları, giriş deneme limiti, CSRF değerlendirmesi, yedekleme ve izleme politikaları tamamlanmalıdır.

## Henüz tamamlanmayan ana alanlar

- Uygulama içi bildirimler ve e-posta hatırlatmaları
- Alt görevler ve gelişmiş raporlar
- Görev tipi ve sistem ayarları yönetimi
- Kullanıcının kendi parolasını değiştirmesi
- Gerçek PostgreSQL kullanan API entegrasyon testleri
- Kurum sunucusu kurulum, yedekleme ve operasyon dokümanı

Veritabanı şemasında bu alanların bir kısmına ait tablolar bulunsa da ilgili backend endpoint'leri ve frontend ekranları henüz tamamlanmamıştır.

## Git çalışma düzeni

Yeni özellikler doğrudan `main` branch'inde geliştirilmemelidir:

```bash
git switch main
git pull --ff-only
git switch -c feature/kisa-aciklama
```

Yalnızca ilgili dosyalar commit edilmeli; değişiklikler test ve build kontrollerinden sonra Pull Request ile `main` branch'ine eklenmelidir.
