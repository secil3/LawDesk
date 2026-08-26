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
| Testing        | Node.js Test Runner, Supertest |
| Email          | SMTP                           |
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
│   └── src/
│
├── database/
│   ├── migrations/
│   ├── seeds/
│   └── GYS_Database_Schema_Simple.sql
│
└── docs/
    ├── GYS_ER_Diagram.pdf
    ├── generate_er_diagram.py
    └── PRODUCTION_CUTOVER.md
```

---

## ⚙️ Gereksinimler

* Node.js 22.12+
* npm
* PostgreSQL
* Git
* İsteğe bağlı: Docker Desktop, pgAdmin

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
npm install
```

`.env` dosyasındaki veritabanı, authentication ve SMTP bilgilerini kendi ortamınıza göre düzenleyin.

Güvenli bir authentication secret oluşturmak için:

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
npm install
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

Backend test suite'i **192 senaryo** içermektedir.

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

Integration test suite'i gerçek PostgreSQL üzerinde **18 senaryoyu** doğrulamaktadır.

### Tüm Testler

```bash
npm run test:all
```

### Frontend Build

```bash
cd frontend
npm run build
```

### CI

GitHub Actions, `main` branch'ine yapılan push ve Pull Request işlemlerinde PostgreSQL servisli test ve frontend build kontrollerini otomatik olarak çalıştırır.

---

## 🔒 Güvenlik

LawDesk'te temel güvenlik gereksinimleri dikkate alınarak:

* Parolalar **Argon2id** ile hashlenir.
* JWT tabanlı authentication kullanılır.
* Session cookie `HttpOnly` olarak tutulur.
* Production ortamında `Secure` ve `SameSite=Strict` cookie özellikleri kullanılır.
* Aktivasyon tokenlarının yalnızca SHA-256 özeti veritabanında tutulur.
* Aktivasyon bağlantıları süreli ve tek kullanımlıdır.
* Kayıt endpoint'i rate limiting uygular.
* Pasif veya arşivlenmiş kullanıcıların oturum açmasına izin verilmez.
* Yetkisiz kullanıcıların görev ve grup verilerine erişimi engellenir.
* Görev ve dashboard sonuçları kullanıcının görünürlük kapsamına göre filtrelenir.
* Gerçek kullanıcı bilgileri seed veya migration dosyalarında tutulmaz.

> Production ortamına geçiş öncesinde CORS, güvenlik başlıkları, CSRF koruması, giriş denemesi limitleri, yedekleme ve monitoring politikalarının ayrıca yapılandırılması gerekir.

---

## 📌 Proje Durumu

LawDesk, görev ve ekip yönetimi için çalışan bir **MVP uygulamasıdır**.

Temel authentication, authorization, kullanıcı ve grup yönetimi, görev yaşam döngüsü, görev görünürlüğü, alt görevler, yorumlar, dosya ekleri, etiketler, bildirimler, dashboard, raporlama, audit log, pagination ve global search özellikleri uygulanmıştır.

Uygulama üzerinde gerçek PostgreSQL veritabanı ile kritik akışların entegrasyon testleri yapılmakta ve GitHub Actions üzerinden otomatik kontroller çalıştırılmaktadır.

Production kullanımı için kurum altyapısına yönelik deployment, yedekleme, monitoring ve ek güvenlik yapılandırmalarının tamamlanması gerekmektedir.

---

## 📚 Dokümantasyon

* [ER Diagram](docs/GYS_ER_Diagram.pdf)
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
