/* ============================================================
   GYS - Görev Yönetim Sistemi
   Hukuk ve Uyum Başkanlığı - Ticket / Görev Yönetim Uygulaması
   Veritabanı: PostgreSQL (pgAdmin)

   Sürüm 2 rol modeli:
   - Sistem rolleri: admin, yonetici, kullanici
   - Grup rolleri: grup_yoneticisi, grup_uyesi

   Not: Trigger/function kullanılmıyor. Aşağıdaki işler backend
   kodunda (Node.js/Express) yönetilmeli:
   - Görev atandığında Bildirimler tablosuna kayıt eklemek
   - Atama değiştiğinde GorevAtamaGecmisi tablosuna kayıt eklemek
   - Durum "Tamamlandi" olduğunda TamamlanmaTarihi'ni set etmek
   - Görev güncellendiğinde GuncellemeTarihi'ni set etmek
   - Görev numarası gösterimi/üretimi
   - Görev görünürlük ve silme/iptal yetkileri
   - Hatırlatma maillerini zamanlanmış iş (cron) ile göndermek
   ============================================================ */

-- Önce ayrı olarak çalıştır, sonra "gys" veritabanına bağlanıp devam et:
-- CREATE DATABASE gys_lawdesk;

/* ============================================================
   1. KULLANICILAR
   Sistem rolü burada tutulur: admin / yonetici / kullanici.
   Grup içindeki rol GrupUyelikleri tablosunda tutulur.
   ============================================================ */
CREATE TABLE Kullanicilar (
    KullaniciID     SERIAL PRIMARY KEY,
    AdSoyad         VARCHAR(150)    NOT NULL,
    Email           VARCHAR(150)    NOT NULL UNIQUE,
    SifreHash       VARCHAR(255)    NOT NULL,
    Rol             VARCHAR(20)     NOT NULL DEFAULT 'kullanici'
                        CHECK (Rol IN ('admin','yonetici','kullanici')),
    AktifMi         BOOLEAN         NOT NULL DEFAULT TRUE,
    SilindiMi       BOOLEAN         NOT NULL DEFAULT FALSE,
    SilinmeTarihi   TIMESTAMP,
    OlusturmaTarihi TIMESTAMP       NOT NULL DEFAULT NOW()
);

/* ============================================================
   2. GRUPLAR  (en az 2 grup: Uyum, KVKK)
   ============================================================ */
CREATE TABLE Gruplar (
    GrupID          SERIAL PRIMARY KEY,
    GrupAdi         VARCHAR(100)    NOT NULL UNIQUE,
    Aciklama        VARCHAR(500)
);

CREATE TABLE GrupUyelikleri (
    GrupUyelikID    SERIAL PRIMARY KEY,
    GrupID          INT NOT NULL REFERENCES Gruplar(GrupID),
    KullaniciID     INT NOT NULL REFERENCES Kullanicilar(KullaniciID),
    GrupRolu        VARCHAR(30) NOT NULL DEFAULT 'grup_uyesi'
                        CHECK (GrupRolu IN ('grup_uyesi','grup_yoneticisi')),
    UNIQUE (GrupID, KullaniciID)
);

/* ============================================================
   3. AYARLAR  (dosya boyutu, hatırlatma günleri vb.)
   ============================================================ */
CREATE TABLE Ayarlar (
    AyarAnahtari    VARCHAR(100) PRIMARY KEY,
    AyarDegeri      VARCHAR(500) NOT NULL,
    Aciklama        VARCHAR(300)
);

/* ============================================================
   4. GOREV TİPLERİ  (Ayarlar ekranından yönetilebilir)
   ============================================================ */
CREATE TABLE GorevTipleri (
    TipID           SERIAL PRIMARY KEY,
    TipAdi          VARCHAR(100) NOT NULL UNIQUE,
    AktifMi         BOOLEAN NOT NULL DEFAULT TRUE
);

/* ============================================================
   5. ETİKETLER  (örn: KVKK, sözleşme, uyum)
   ============================================================ */
CREATE TABLE Etiketler (
    EtiketID        SERIAL PRIMARY KEY,
    EtiketAdi       VARCHAR(50) NOT NULL UNIQUE
);

/* ============================================================
   6. GOREVLER  (ana görev + alt görev aynı tabloda, UstGorevID ile)
   ============================================================ */
CREATE TABLE Gorevler (
    GorevID                 SERIAL PRIMARY KEY,
    UstGorevID              INT REFERENCES Gorevler(GorevID),

    Baslik                  VARCHAR(200) NOT NULL,
    Aciklama                TEXT,
    TipID                   INT REFERENCES GorevTipleri(TipID),

    Oncelik                 VARCHAR(20) NOT NULL DEFAULT 'Orta'
                                CHECK (Oncelik IN ('Kritik','Yuksek','Orta','Dusuk')),

    Durum                   VARCHAR(30) NOT NULL DEFAULT 'Yeni Atandi'
                                CHECK (Durum IN ('Yeni Atandi','Devam Ediyor','Beklemede','Tamamlandi','Iptal Edildi')),

    BitisTarihi             TIMESTAMP,      -- deadline
    TahminiBitisTarihi      TIMESTAMP,      -- alt görevler için
    TamamlanmaTarihi        TIMESTAMP,

    SLASuresiSaat           INT,

    -- Atama: kişi veya grup
    AtananKullaniciID       INT REFERENCES Kullanicilar(KullaniciID),
    AtananGrupID            INT REFERENCES Gruplar(GrupID),

    -- Görünürlük: Grup / Kisi / Herkes. Yetki hesabı backend tarafından yapılır.
    GorunurlukTipi          VARCHAR(20) NOT NULL DEFAULT 'Grup'
                                CHECK (GorunurlukTipi IN ('Grup','Kisi','Herkes')),
    GorunurlukKullaniciID   INT REFERENCES Kullanicilar(KullaniciID),
    GorunurlukGrupID        INT REFERENCES Gruplar(GrupID),

    OlusturanKullaniciID    INT NOT NULL REFERENCES Kullanicilar(KullaniciID),
    OlusturmaTarihi         TIMESTAMP NOT NULL DEFAULT NOW(),
    GuncellemeTarihi        TIMESTAMP NOT NULL DEFAULT NOW(),

    -- Arşivleme fiziksel silme değildir; geçmiş ve ilişkiler korunur.
    ArsivlendiMi            BOOLEAN NOT NULL DEFAULT FALSE,
    ArsivlenmeTarihi        TIMESTAMP,
    ArsivleyenKullaniciID   INT REFERENCES Kullanicilar(KullaniciID),

    CHECK (NOT (
        AtananKullaniciID IS NOT NULL
        AND AtananGrupID IS NOT NULL
    ))
);

/* Görev - Etiket (many-to-many) */
CREATE TABLE GorevEtiketleri (
    GorevID     INT NOT NULL REFERENCES Gorevler(GorevID),
    EtiketID    INT NOT NULL REFERENCES Etiketler(EtiketID),
    PRIMARY KEY (GorevID, EtiketID)
);

/* ============================================================
   7. GOREV ATAMA GEÇMİŞİ  (backend, atama her değiştiğinde satır ekler)
   ============================================================ */
CREATE TABLE GorevAtamaGecmisi (
    LogID               SERIAL PRIMARY KEY,
    GorevID             INT NOT NULL REFERENCES Gorevler(GorevID),
    AtananKullaniciID   INT REFERENCES Kullanicilar(KullaniciID),
    AtananGrupID        INT REFERENCES Gruplar(GrupID),
    AtayanKullaniciID   INT REFERENCES Kullanicilar(KullaniciID),
    AtamaTarihi         TIMESTAMP NOT NULL DEFAULT NOW()
);

/* ============================================================
   8. YORUMLAR  (düzenleme geçmişi ile)
   ============================================================ */
CREATE TABLE Yorumlar (
    YorumID            SERIAL PRIMARY KEY,
    GorevID            INT NOT NULL REFERENCES Gorevler(GorevID),
    KullaniciID        INT NOT NULL REFERENCES Kullanicilar(KullaniciID),
    YorumMetni         TEXT NOT NULL,
    OlusturmaTarihi    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    GuncellemeTarihi   TIMESTAMPTZ,
    DuzenlendiMi       BOOLEAN NOT NULL DEFAULT FALSE,
    Versiyon           INT NOT NULL DEFAULT 1 CHECK (Versiyon > 0),
    SilindiMi          BOOLEAN NOT NULL DEFAULT FALSE,
    SilinmeTarihi      TIMESTAMPTZ,
    SilenKullaniciID   INT REFERENCES Kullanicilar(KullaniciID)
);

CREATE TABLE YorumGecmisi (
    GecmisID                 SERIAL PRIMARY KEY,
    YorumID                  INT NOT NULL REFERENCES Yorumlar(YorumID),
    OncekiMetin              TEXT NOT NULL,
    OncekiVersiyon           INT NOT NULL,
    DuzenleyenKullaniciID    INT REFERENCES Kullanicilar(KullaniciID),
    DegisiklikTarihi         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_yorumlar_gorev_aktif
    ON Yorumlar (GorevID, OlusturmaTarihi, YorumID)
    WHERE SilindiMi = FALSE;

CREATE INDEX idx_yorumlar_gorev_arsiv
    ON Yorumlar (GorevID, SilinmeTarihi DESC, YorumID DESC)
    WHERE SilindiMi = TRUE;

CREATE INDEX idx_yorumgecmisi_yorum
    ON YorumGecmisi (YorumID, OncekiVersiyon DESC, GecmisID DESC);

/* ============================================================
   9. EKLER  (dosya boyutu sınırı Ayarlar'dan, backend kontrol eder)
   ============================================================ */
CREATE TABLE Ekler (
    EkID                SERIAL PRIMARY KEY,
    GorevID             INT NOT NULL REFERENCES Gorevler(GorevID),
    DosyaAdi            VARCHAR(255) NOT NULL,
    DosyaYolu           VARCHAR(500),       -- dosya sisteminde şifreli saklanıyorsa
    DosyaVerisi         BYTEA,              -- DB'de saklanıyorsa
    DosyaBoyutuByte     BIGINT NOT NULL,
    MimeTuru            VARCHAR(150),
    SifrelemeYontemi    VARCHAR(50),
    YukleyenKullaniciID INT NOT NULL REFERENCES Kullanicilar(KullaniciID),
    YuklenmeTarihi      TIMESTAMP NOT NULL DEFAULT NOW(),
    SilindiMi           BOOLEAN NOT NULL DEFAULT FALSE,
    SilinmeTarihi       TIMESTAMP,
    SilenKullaniciID    INT REFERENCES Kullanicilar(KullaniciID),

    CHECK (DosyaYolu IS NOT NULL OR DosyaVerisi IS NOT NULL)
);

/* ============================================================
   10. BİLDİRİMLER  (backend üretir: Atama/Guncelleme/Kapanis/Hatirlatma)
   ============================================================ */
CREATE TABLE Bildirimler (
    BildirimID          SERIAL PRIMARY KEY,
    KullaniciID         INT NOT NULL REFERENCES Kullanicilar(KullaniciID),
    GorevID             INT REFERENCES Gorevler(GorevID),
    BildirimTipi        VARCHAR(30) NOT NULL
                            CHECK (BildirimTipi IN ('Atama','Guncelleme','Kapanis','HatirlatmaOrta','HatirlatmaSon')),
    Mesaj               VARCHAR(500) NOT NULL,
    OkunduMu            BOOLEAN NOT NULL DEFAULT FALSE,
    EPostaGonderildiMi  BOOLEAN NOT NULL DEFAULT FALSE,
    OlusturmaTarihi     TIMESTAMP NOT NULL DEFAULT NOW()
);

/* ============================================================
   11. AKTİVİTE LOGLARI  (sadece admin/yönetici görür - app katmanında filtrelenir)
   ============================================================ */
CREATE TABLE AktiviteLoglari (
    LogID           SERIAL PRIMARY KEY,
    KullaniciID     INT REFERENCES Kullanicilar(KullaniciID),
    GorevID         INT REFERENCES Gorevler(GorevID),
    Islem           VARCHAR(100) NOT NULL,
    Detay           TEXT,
    IslemTarihi     TIMESTAMP NOT NULL DEFAULT NOW()
);


/* ============================================================
   SEED DATA
   ============================================================ */

INSERT INTO Ayarlar (AyarAnahtari, AyarDegeri, Aciklama) VALUES
('MaxDosyaBoyutuMB', '25', 'Eklerde izin verilen maksimum dosya boyutu (MB)'),
('HatirlatmaOrtaGunOrani', '0.5', 'Görev süresinin yüzde kaçında ilk hatırlatma gönderilsin'),
('HatirlatmaSonGunSayisi', '1', 'Bitiş tarihinden kaç gün önce son hatırlatma gönderilsin');

INSERT INTO Gruplar (GrupAdi, Aciklama) VALUES
('Uyum', 'Uyum ekibi'),
('KVKK', 'KVKK ekibi');

INSERT INTO GorevTipleri (TipAdi) VALUES
('Personel'), ('Sözleşme'), ('Proje'), ('Danışmanlık'), ('Operasyonel');

INSERT INTO Etiketler (EtiketAdi) VALUES
('KVKK'), ('Sözleşme'), ('Uyum');

INSERT INTO Kullanicilar (AdSoyad, Email, SifreHash, Rol) VALUES
('Admin Kullanici', 'admin@sirket.com', 'HASH_PLACEHOLDER', 'admin'),
('Ayşe Yılmaz', 'ayse.yilmaz@sirket.com', 'HASH_PLACEHOLDER', 'yonetici'),
('Mehmet Demir', 'mehmet.demir@sirket.com', 'HASH_PLACEHOLDER', 'kullanici');

INSERT INTO GrupUyelikleri (GrupID, KullaniciID, GrupRolu) VALUES
(1, 2, 'grup_yoneticisi'),
(1, 3, 'grup_uyesi'),
(2, 3, 'grup_uyesi');

INSERT INTO Gorevler
    (Baslik, Aciklama, TipID, Oncelik, Durum, BitisTarihi, AtananGrupID, GorunurlukTipi, GorunurlukGrupID, OlusturanKullaniciID)
VALUES
    ('KVKK Uyum Denetimi', 'Yıllık KVKK uyum denetiminin yapılması', 5, 'Yuksek', 'Devam Ediyor',
     NOW() + INTERVAL '14 days', 2, 'Grup', 2, 1);

INSERT INTO Gorevler
    (UstGorevID, Baslik, Aciklama, TipID, Oncelik, Durum, TahminiBitisTarihi, AtananKullaniciID, GorunurlukTipi, OlusturanKullaniciID)
VALUES
    (1, 'Envanter Kontrolü', 'Kişisel veri envanterinin gözden geçirilmesi', 5, 'Orta', 'Yeni Atandi',
     NOW() + INTERVAL '7 days', 3, 'Kisi', 1);

INSERT INTO GorevEtiketleri (GorevID, EtiketID) VALUES (1, 1), (1, 3);

INSERT INTO Yorumlar (GorevID, KullaniciID, YorumMetni) VALUES
(1, 2, 'Denetim planı hazırlanıyor.');
