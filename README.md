# LawDesk – Görev Yönetim Sistemi

LawDesk, Hukuk ve Uyum Başkanlığı ekiplerinin kullanıcı, grup ve görev süreçlerini tek bir web uygulamasından yönetebilmesi için geliştirilen bir görev yönetim sistemidir.

Uygulama şu anda çalışan bir **çekirdek MVP** durumundadır. Kimlik doğrulama, rol tabanlı erişim, grup üyelikleri, görev atama ve görünürlük kuralları, görev yaşam döngüsü, tek seviyeli alt görevler, yorumlar, dosya ekleri, etiketler, temel uygulama içi bildirimler, arşivleme, filtrelenebilir denetim izi ve görünürlük kapsamlı görev raporları uygulanmıştır. Kritik auth, görünürlük, transaction ve dashboard akışları gerçek PostgreSQL üzerinde de doğrulanmaktadır. Üretim ortamına geçiş için güvenlik sertleştirmesi, entegrasyon kapsamının genişletilmesi ve kurulum/operasyon çalışmaları hâlâ gereklidir.

## Mevcut özellikler

- Argon2id parola doğrulaması
- JWT tabanlı oturum ve HttpOnly çerez
- Aktif, pasif ve arşivlenmiş kullanıcı kontrolü
- Admin, yönetici, grup yöneticisi, grup üyesi ve kullanıcı yetki seviyeleri
- Kullanıcı oluşturma, aktif/pasif yapma, arşivleme ve geri yükleme
- Grup oluşturma; grup adı ve açıklaması düzenleme; grupları kalıcı silme işleminin kapalı tutulması
- Kullanıcının birden fazla gruba eklenmesi
- Kullanıcının grup üyeliklerini ve grup rollerini sonradan değiştirme
- Her kullanıcının görev oluşturabilmesi
- Görevi görev tipinin sorumlu grubundaki bir kullanıcıya doğrudan atama veya görev tipi grubuna otomatik yönlendirme
- Rol ve grup üyeliğine göre görev görünürlüğü
- Görev başlığı, açıklaması, tipi, önceliği ve bitiş tarihini düzenleme
- Geçmiş tarih ve saat için bitiş tarihi oluşturmayı engelleme
- Görev durumunu değiştirme; tamamlanan veya iptal edilen görevi atomik olarak otomatik arşivleme
- İptal sırasında zorunlu neden kaydı; arşivden geri yüklenen görevi `Devam Ediyor` durumunda yeniden açma
- Ana görev altında tek seviyeli alt görev oluşturma; atama ve görünürlüğü ana görevden devralma
- Ana görev ile alt görevler arasında bitiş tarihi, kapatma ve geri yükleme bütünlüğü
- Göreve yorum ekleme; yorumu düzenleme, geçmişini görüntüleme, arşivleme ve geri yükleme
- Doğrulanmış dosyaları göreve ekleme, indirme, kaldırma ve geri yükleme
- Etiket oluşturma, yeniden adlandırma, arşivleme ve geri yükleme
- Görevlere etiket atama ve görev listesini etikete göre filtreleme
- Görev tipini zorunlu sorumlu grupla oluşturma; adını, açıklamasını ve grubunu düzenleme; kullanım sayılarını görüntüleme, arşivleme ve geri yükleme
- Atamasız oluşturulan veya yeniden atanan görevi görev tipinin grubuna otomatik yönlendirme; doğrudan atamada yalnızca ilgili grup üyelerini kabul etme
- Ana görevin tipi değiştiğinde uyumsuz kullanıcı/grup atamasını aynı transaction içinde yeni sorumlu gruba taşıma
- Görev ataması, durum değişikliği ve yorum hareketleri için sayfalanmış uygulama içi bildirimler; okunmamış bildirim sayısı ve okundu işaretleme
- Kullanıcı, grup, görev ve yaşam döngüsü işlemleri için kullanıcı, görev, işlem türü ve tarih aralığıyla filtrelenebilen denetim kayıtları
- Filtrelenmiş denetim kayıtlarını Excel uyumlu UTF-8 CSV olarak dışa aktarma
- Dashboard üzerinde geciken, yaklaşan ve bitiş tarihi olmayan görev risklerini görüntüleme
- Seçilen döneme göre görev oluşturma, tamamlama oranı ve ortalama tamamlanma süresi raporu
- Öncelik, görev tipi ve atama yükü dağılımlarını rol ve görünürlük kapsamına göre görüntüleme
- Dashboard görev raporunu Excel uyumlu UTF-8 CSV olarak dışa aktarma
- Kritik API akışlarını ayrı bir PostgreSQL test veritabanında doğrulayan entegrasyon testleri
- GitHub Actions üzerinde PostgreSQL servisli birim, entegrasyon ve frontend build kontrolleri
- Görev, kullanıcı ve grup listelerinde sunucu taraflı sayfalama
- Ana sayfadan görev, yorum, ek dosya adı, grup, yetkili kullanıcı, etiket, görev tipi ve denetim kayıtlarında yetki kapsamlı genel arama
- Etiket ve görev tipi işlemleri için ayrı, rol korumalı Yönetim sayfası

## Roller ve temel yetkiler

Sistem rolleri `admin`, `yonetici` ve `kullanici` olarak saklanır. Grup yöneticisi ve grup üyesi yetkileri, kullanıcının grup üyeliği üzerinden belirlenir.

| Rol | Temel yetkiler |
| --- | --- |
| Admin | Kullanıcı ve grup yönetimi; görev tipi ve etiket yönetimi; tüm görevleri görüntüleme, atama, düzenleme, kapatma, geri yükleme ve denetim izini görüntüleme |
| Yönetici | Görev tipi ve etiket yönetimi; tüm görevleri görüntüleme ve yönetme; görev atama, yaşam döngüsü işlemleri ve denetim izini görüntüleme |
| Grup yöneticisi | Yönettiği grupların görevlerini ve üyelerini kapsayan görev atama, durum, otomatik kapanış ve geri yükleme işlemleri |
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
│   ├── integration/     Gerçek PostgreSQL kullanan entegrasyon testleri
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

Windows PowerShell, `npm.ps1` çalıştırmayı güvenlik ilkesi nedeniyle engelliyorsa README'deki `npm` komutlarını `npm.cmd` olarak çalıştırabilirsiniz (örneğin `npm.cmd run dev`). Sistem genelindeki execution policy ayarını değiştirmek gerekmez.

`.env` içindeki bütün örnek değerleri kendi ortamınıza göre değiştirin:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:PAROLANIZ@localhost:5432/gys_lawdesk
INTEGRATION_DATABASE_URL=postgresql://postgres:PAROLANIZ@localhost:5432/gys_lawdesk_test
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
npm run migrate:task-subtasks
npm run migrate:task-type-management
npm run migrate:task-type-group-routing
npm run migrate:task-terminal-auto-archive
npm run migrate:activity-log-filters
npm run migrate:dashboard-reports
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

Güncel birim test paketi 179 senaryodan oluşur ve auth, yetkilendirme, kullanıcı/grup yönetimi ve sayfalama, görev görünürlüğü, görev tipi-grup yönlendirmesi, atama, düzenleme, yaşam döngüsü, alt görev, yorum, dosya eki, etiket, görev tipi yönetimi, genel arama, denetim izi dışa aktarma ve görünürlük kapsamlı dashboard raporu akışlarını kapsar.

### Gerçek PostgreSQL entegrasyon testleri

Entegrasyon testleri geliştirme veritabanını kullanmaz. pgAdmin veya `psql` ile bir kez, adı `_test` ile biten ayrı bir veritabanı oluşturun:

```sql
CREATE DATABASE gys_lawdesk_test;
```

`backend/.env` içindeki `INTEGRATION_DATABASE_URL` değerini bu veritabanına yönlendirdikten sonra:

```bash
cd backend
npm run test:integration
```

Komut, `gys_lawdesk_test` veritabanının `public` şemasını silip güncel SQL şemasından yeniden kurar ve 10 gerçek PostgreSQL senaryosu çalıştırır. Güvenlik kontrolü nedeniyle veritabanı adı `_test` ile bitmiyorsa işlem tablo değişikliği yapmadan durur. `INTEGRATION_DATABASE_URL` hiçbir zaman geliştirme veya üretim veritabanını göstermemelidir.

Birim ve entegrasyon testlerini birlikte çalıştırmak için:

```bash
npm run test:all
```

GitHub Actions, pull request ve `main` push işlemlerinde geçici PostgreSQL servisini otomatik oluşturur; ayrıca yerel veritabanı hazırlığı gerekmez.

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
| GET | `/api/admin/users` | Arşivlenmemiş veya `?archived=true` ile arşivlenmiş kullanıcıları; isteğe bağlı `page` ve `limit` ile sayfalanmış olarak listeler |
| POST | `/api/admin/users` | Kullanıcı oluşturur |
| PATCH | `/api/admin/users/:id` | Kullanıcıyı aktif veya pasif yapar |
| DELETE | `/api/admin/users/:id` | Kullanıcıyı fiziksel silmeden arşivler |
| PATCH | `/api/admin/users/:id/restore` | Kullanıcıyı pasif olarak geri yükler |
| PUT | `/api/admin/users/:id/memberships` | Grup üyeliklerini ve grup rollerini atomik olarak günceller |
| GET | `/api/admin/groups` | Grupları ve üye sayılarını; isteğe bağlı `page` ve `limit` ile sayfalanmış olarak listeler |
| POST | `/api/admin/groups` | Grup oluşturur |
| PATCH | `/api/admin/groups/:id` | Grup adı ve açıklamasını günceller |

### Görev işlemleri

Bütün görev endpoint'leri geçerli oturum gerektirir; sonuçlar ve işlemler kullanıcının rolüne ve grup kapsamına göre sınırlandırılır.

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| GET | `/api/tasks` | Görünür aktif görevleri veya `?archived=true` ile yetkili arşiv görünümünü; arama, filtre, sıralama ve sayfalama desteğiyle döndürür |
| GET | `/api/tasks/dashboard-summary` | Görünür görevlerden dashboard risk, performans ve dağılım özetini döndürür |
| GET | `/api/tasks/dashboard-report/export` | Seçilen dönem için görünürlük kapsamlı görev raporunu UTF-8 CSV olarak dışa aktarır |
| GET | `/api/tasks/:id` | Yetkili kullanıcının görev detayını döndürür |
| GET | `/api/tasks/options` | Görev tiplerini ve yetkiye uygun atama seçeneklerini döndürür |
| POST | `/api/tasks` | Görev oluşturur |
| GET | `/api/tasks/types` | Admin/yönetici için aktif veya `?archived=true` ile arşivlenmiş görev tiplerini ve kullanım sayılarını döndürür |
| POST | `/api/tasks/types` | Admin/yönetici için sorumlu grubu zorunlu görev tipi oluşturur |
| PATCH | `/api/tasks/types/:typeId` | Görev tipinin adını, açıklamasını ve sorumlu grubunu günceller |
| DELETE | `/api/tasks/types/:typeId` | Görev tipini mevcut görevlerden silmeden arşivler |
| PATCH | `/api/tasks/types/:typeId/restore` | Arşivlenmiş görev tipini geri yükler |
| PATCH | `/api/tasks/:id` | Başlık, açıklama, zorunlu tip, öncelik ve bitiş tarihini günceller; tip değişirse uyumsuz atamayı yeni sorumlu gruba taşır |
| PATCH | `/api/tasks/:id/assignment` | Görevi tip grubundaki kullanıcıya atar; hedef verilmezse görev tipi grubuna yönlendirir |
| PATCH | `/api/tasks/:id/status` | Durumu değiştirir; `Tamamlandi` veya neden zorunlu `Iptal Edildi` seçiminde görevi aynı transaction içinde arşivler |
| PATCH | `/api/tasks/:id/restore` | Arşivlenmiş görevi `Devam Ediyor` durumunda geri yükler |
| GET | `/api/tasks/:id/subtasks` | Aktif veya `?archived=true` ile arşivlenmiş alt görevleri döndürür |
| POST | `/api/tasks/:id/subtasks` | Ana görevin altında tek seviyeli bir alt görev oluşturur |
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
| GET | `/api/tasks/activity` | Admin ve yöneticiler için filtrelenmiş ve sayfalanmış işlem kayıtlarını döndürür |
| GET | `/api/tasks/activity/export` | Aynı filtrelerle en fazla 5000 işlem kaydını Excel uyumlu UTF-8 CSV olarak dışa aktarır |

### Bildirimler

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| GET | `/api/notifications` | Oturum sahibinin bildirimlerini sayfalanmış olarak döndürür; `?unread=true` yalnızca okunmamışları getirir |
| GET | `/api/notifications/unread-count` | Oturum sahibinin okunmamış bildirim sayısını döndürür |
| PATCH | `/api/notifications/:id/read` | Yalnızca oturum sahibine ait bildirimi okundu olarak işaretler |

### Genel arama

| Method | Endpoint | Açıklama |
| --- | --- | --- |
| GET | `/api/search?q=...` | En az iki karakterle, yalnızca oturum sahibinin görmeye yetkili olduğu görev ve grupları; role göre kullanıcı, etiket, görev tipi ve denetim izi sonuçlarını döndürür |

Tamamlanan veya iptal edilen görevler otomatik arşivlenir; iptal işlemi açıklama olmadan kabul edilmez. Arşivde bitiş tarihinin yanında kapanış nedeni gösterilir. Görev geri yüklendiğinde durumu `Devam Ediyor` olur ve önceki iptal nedeni aktif kayıttan temizlenir; ayrıntılı geçmiş denetim izinde korunur. Alt görevler ana görevin atamasını ve görünürlüğünü devralır; bağımsız olarak yeniden atanamaz. Ana görev kapatılmadan önce açık alt görevler tamamlanmalı veya iptal edilmelidir.

Bir görev tipinin sorumlu grubu değiştirildiğinde mevcut görevler topluca taşınmaz. Yeni görevler güncel gruba yönlenir; mevcut görev ise tipi değiştirildiğinde veya yeniden atandığında güncel görev tipi–grup kuralına göre doğrulanır. Böylece yönetim ekranındaki tek bir değişiklik geçmiş görevlerin sahipliğini beklenmedik biçimde değiştirmez.

## Güvenlik notları

- Parolalar Argon2id ile hash'lenir ve düz metin olarak saklanmaz.
- Oturum çerezi HttpOnly'dir; production modunda `Secure` ve `SameSite=Strict` kullanılır.
- JWT issuer, audience, algoritma ve süre kontrolleri yapılır.
- Olmayan kullanıcı ve yanlış parola aynı hata mesajını üretir.
- Pasif veya arşivlenmiş kullanıcıların oturumları kabul edilmez.
- `.env`, `node_modules`, build çıktıları ve veritabanı yedekleri Git'e eklenmemelidir.

Mevcut CORS ayarı geliştirme kolaylığı için dinamiktir. Üretime geçmeden önce izin verilen kurum origin'iyle sınırlandırılmalı; HTTPS, güvenlik başlıkları, giriş deneme limiti, CSRF değerlendirmesi, yedekleme ve izleme politikaları tamamlanmalıdır.

## Henüz tamamlanmayan ana alanlar

- E-posta bildirimleri ve son tarih hatırlatmaları
- Uygulama içi bildirim tercihleri, toplu okundu işlemleri ve ayrıntılı bildirim kapsamının e-posta akışıyla birlikte geliştirilmesi
- Genel sistem ayarları yönetimi
- Kullanıcının kendi parolasını değiştirmesi
- PostgreSQL entegrasyon kapsamının yorum, ek, etiket ve alt görev akışlarına genişletilmesi
- Kurum sunucusu kurulum, yedekleme ve operasyon dokümanı

Bu alanlar üretim hazırlığı ve e-posta altyapısı planıyla birlikte kademeli olarak tamamlanacaktır.

## Git çalışma düzeni

Yeni özellikler doğrudan `main` branch'inde geliştirilmemelidir:

```bash
git switch main
git pull --ff-only
git switch -c feature/kisa-aciklama
```

Yalnızca ilgili dosyalar commit edilmeli; değişiklikler test ve build kontrollerinden sonra Pull Request ile `main` branch'ine eklenmelidir.
