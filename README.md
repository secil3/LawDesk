# LawDesk – Görev Yönetim Sistemi

LawDesk, Hukuk ve Uyum Başkanlığı için geliştirilen web tabanlı bir görev yönetim sistemidir.

Proje şu anda geliştirme aşamasındadır. Temel frontend, backend ve PostgreSQL bağlantısı kurulmuştur.

## Kullanılan Teknolojiler

- Frontend: React ve Vite
- Backend: Node.js ve Express
- Veritabanı: PostgreSQL
- Veritabanı yönetimi: pgAdmin
- Geliştirme ortamı: Docker PostgreSQL

## Proje Yapısı

```text
LawDesk/
├── backend/       Node.js ve Express API
├── frontend/      React kullanıcı arayüzü
├── database/      PostgreSQL şema ve örnek verileri
└── docs/          ER diyagramı ve proje belgeleri
```

## Gereksinimler

Projeyi çalıştırmak için aşağıdaki yazılımlar gereklidir:

- Node.js
- npm
- Docker Desktop
- PostgreSQL Docker container
- pgAdmin
- Git

## Veritabanı Kurulumu

1. Docker Desktop ve PostgreSQL container'ını çalıştırın.
2. pgAdmin üzerinden `gys_lawdesk` adında yeni bir veritabanı oluşturun.
3. `gys_lawdesk` veritabanının Query Tool ekranını açın.
4. Aşağıdaki SQL dosyasını çalıştırın:

```text
database/GYS_Database_Schema_Simple.sql
```

SQL dosyası tabloları ve geliştirme için kullanılan örnek verileri oluşturur. Temiz bir veritabanında bir kez çalıştırılmalıdır.

## Backend Kurulumu

Backend klasörüne geçin:

```powershell
cd backend
```

`.env.example` dosyasını `.env` adıyla kopyalayın ve kendi PostgreSQL şifrenizi girin:

```env
PORT=3001
NODE_ENV=development
DATABASE_URL=postgresql://postgres:SIFRENIZ@localhost:5432/gys_lawdesk
```

Gerçek `.env` dosyası ve veritabanı şifresi GitHub'a gönderilmemelidir.

Paketleri yükleyin ve backend'i başlatın:

```powershell
npm.cmd install
npm.cmd run dev
```

Backend aşağıdaki adreste çalışır:

```text
http://localhost:3001
```

## Frontend Kurulumu

İkinci bir terminal açın ve frontend klasörüne geçin:

```powershell
cd frontend
npm.cmd install
npm.cmd run dev
```

Frontend aşağıdaki adreste çalışır:

```text
http://localhost:5173
```

Geliştirme sırasında backend ve frontend terminalleri aynı anda açık kalmalıdır.

## Bağlantı Testleri

Backend testi:

```text
http://localhost:3001
```

Veritabanı bağlantı testi:

```text
http://localhost:3001/api/db-test
```

Frontend üzerinden bağlantı testi:

```text
http://localhost:5173
```

## Git Çalışma Düzeni

Yeni özellikler doğrudan `main` dalında geliştirilmemelidir. Her özellik için ayrı bir branch kullanılmalıdır.

Örnekler:

```text
feature/authentication
feature/users-groups
feature/tasks
feature/frontend-login
```

Tamamlanan özellikler Pull Request ile `main` dalına eklenmelidir.

## Güvenlik

Aşağıdaki dosya ve klasörler GitHub'a gönderilmemelidir:

- `.env`
- `node_modules`
- Gerçek kullanıcı şifreleri
- Veritabanı yedekleri
- Yüklenen özel dosyalar

Şifreler veritabanında hiçbir zaman düz metin olarak saklanmamalıdır.