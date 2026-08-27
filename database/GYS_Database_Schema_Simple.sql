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
   - Tamamlanan/iptal edilen görevi arşivlemek; iptal nedenini doğrulamak
   - Durum "Tamamlandi" olduğunda TamamlanmaTarihi'ni set etmek
   - Görev güncellendiğinde GuncellemeTarihi'ni set etmek
   - Görev numarası gösterimi/üretimi
   - Görev görünürlük ve silme/iptal yetkileri
   - Hatırlatma maillerini zamanlanmış iş (cron) ile göndermek
   ============================================================ */

-- Önce ayrı olarak çalıştır, sonra "gys" veritabanına bağlanıp devam et:
-- CREATE DATABASE gys_lawdesk;

/* ============================================================
   0. ŞEMA MIGRATION KAYITLARI
   npm run migrate tarafından yönetilir.
   ============================================================ */
CREATE TABLE SchemaMigrations (
    MigrationAdi       VARCHAR(255) PRIMARY KEY,
    Checksum           CHAR(64)     NOT NULL,
    UygulanmaTarihi    TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

/* ============================================================
   1. KULLANICILAR
   Sistem rolü burada tutulur: admin / yonetici / kullanici.
   Grup içindeki rol GrupUyelikleri tablosunda tutulur.
   ============================================================ */
CREATE TABLE Kullanicilar (
    KullaniciID     SERIAL PRIMARY KEY,
    AdSoyad         VARCHAR(150)    NOT NULL,
    Email           VARCHAR(150)    NOT NULL UNIQUE,
    SifreHash       VARCHAR(255),
    Rol             VARCHAR(20)     NOT NULL DEFAULT 'kullanici'
                        CHECK (Rol IN ('admin','yonetici','kullanici')),
    AktifMi         BOOLEAN         NOT NULL DEFAULT TRUE,
    AktivasyonBekliyorMu BOOLEAN    NOT NULL DEFAULT FALSE,
    EmailDogrulamaTarihi TIMESTAMPTZ,
    SilindiMi       BOOLEAN         NOT NULL DEFAULT FALSE,
    SilinmeTarihi   TIMESTAMP,
    OlusturmaTarihi TIMESTAMP       NOT NULL DEFAULT NOW(),

    CONSTRAINT kullanicilar_aktivasyon_tutarliligi
        CHECK (
            (AktivasyonBekliyorMu = TRUE
             AND AktifMi = FALSE
             AND SifreHash IS NULL)
            OR
            (AktivasyonBekliyorMu = FALSE
             AND SifreHash IS NOT NULL)
        )
);

CREATE UNIQUE INDEX idx_kullanicilar_email_lower
    ON Kullanicilar (LOWER(Email));

/* ============================================================
   1A. KAYIT TALEPLERİ VE TEK KULLANIMLIK AKTİVASYON
   ============================================================ */
CREATE TABLE Kayit_Talepleri (
    KayitTalepID                    SERIAL PRIMARY KEY,
    AdSoyad                         VARCHAR(150) NOT NULL,
    Email                           VARCHAR(150) NOT NULL,
    Durum                           VARCHAR(20) NOT NULL DEFAULT 'Bekliyor'
                                        CHECK (Durum IN ('Bekliyor','Onaylandi','Reddedildi')),
    OlusturmaTarihi                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    InceleyenKullaniciID            INT REFERENCES Kullanicilar(KullaniciID),
    IncelemeTarihi                  TIMESTAMPTZ,
    RedNedeni                       VARCHAR(500),
    OnaylananRol                    VARCHAR(20)
                                        CHECK (OnaylananRol IN ('yonetici','kullanici')),
    OlusturulanKullaniciID          INT REFERENCES Kullanicilar(KullaniciID),
    AktivasyonEpostaGonderimTarihi  TIMESTAMPTZ,
    AktivasyonEpostaHatasi          VARCHAR(500)
);

CREATE UNIQUE INDEX idx_kayit_talepleri_bekleyen_email
    ON Kayit_Talepleri (LOWER(Email))
    WHERE Durum = 'Bekliyor';

CREATE INDEX idx_kayit_talepleri_durum_tarih
    ON Kayit_Talepleri (Durum, OlusturmaTarihi DESC, KayitTalepID DESC);

CREATE TABLE KullaniciAktivasyonTokenlari (
    TokenID                 SERIAL PRIMARY KEY,
    KullaniciID             INT NOT NULL REFERENCES Kullanicilar(KullaniciID),
    KayitTalepID            INT NOT NULL REFERENCES Kayit_Talepleri(KayitTalepID),
    TokenHash               CHAR(64) NOT NULL UNIQUE,
    SonKullanmaTarihi       TIMESTAMPTZ NOT NULL,
    KullanilmaTarihi        TIMESTAMPTZ,
    IptalTarihi             TIMESTAMPTZ,
    OlusturmaTarihi         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    OlusturanKullaniciID    INT NOT NULL REFERENCES Kullanicilar(KullaniciID)
);

CREATE UNIQUE INDEX idx_aktivasyontokenlari_aktif_kullanici
    ON KullaniciAktivasyonTokenlari (KullaniciID)
    WHERE KullanilmaTarihi IS NULL AND IptalTarihi IS NULL;

CREATE INDEX idx_aktivasyontokenlari_hash_gecerlilik
    ON KullaniciAktivasyonTokenlari
       (TokenHash, SonKullanmaTarihi)
    WHERE KullanilmaTarihi IS NULL AND IptalTarihi IS NULL;

CREATE TABLE EpostaOutbox (
    EpostaOutboxID          BIGSERIAL PRIMARY KEY,
    KayitTalepID            INT NOT NULL
                                REFERENCES Kayit_Talepleri(KayitTalepID),
    KullaniciID             INT NOT NULL
                                REFERENCES Kullanicilar(KullaniciID),
    AktivasyonTokenID       INT NOT NULL
                                REFERENCES KullaniciAktivasyonTokenlari(TokenID),
    Tur                     VARCHAR(30) NOT NULL DEFAULT 'Aktivasyon'
                                CHECK (Tur IN ('Aktivasyon')),
    AliciEmail              VARCHAR(150) NOT NULL,
    AliciAdi                VARCHAR(150) NOT NULL,
    SifreliIcerik           TEXT,
    Durum                   VARCHAR(20) NOT NULL DEFAULT 'Bekliyor'
                                CHECK (
                                    Durum IN (
                                        'Bekliyor',
                                        'Isleniyor',
                                        'Gonderildi',
                                        'Basarisiz',
                                        'Iptal'
                                    )
                                ),
    DenemeSayisi            INT NOT NULL DEFAULT 0
                                CHECK (DenemeSayisi >= 0),
    SonrakiDenemeTarihi     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    KilitlenmeTarihi        TIMESTAMPTZ,
    SonHata                 VARCHAR(500),
    GonderimTarihi          TIMESTAMPTZ,
    OlusturmaTarihi         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    GuncellemeTarihi        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT epostaoutbox_aktif_icerik_tutarliligi
        CHECK (
            (Durum IN ('Bekliyor', 'Isleniyor') AND SifreliIcerik IS NOT NULL)
            OR
            (Durum IN ('Gonderildi', 'Basarisiz', 'Iptal') AND SifreliIcerik IS NULL)
        )
);

CREATE UNIQUE INDEX idx_epostaoutbox_aktif_aktivasyon
    ON EpostaOutbox (KayitTalepID)
    WHERE Tur = 'Aktivasyon'
      AND Durum IN ('Bekliyor', 'Isleniyor');

CREATE INDEX idx_epostaoutbox_hazir
    ON EpostaOutbox (SonrakiDenemeTarihi, EpostaOutboxID)
    WHERE Durum = 'Bekliyor';

CREATE INDEX idx_epostaoutbox_kilit
    ON EpostaOutbox (KilitlenmeTarihi, EpostaOutboxID)
    WHERE Durum = 'Isleniyor';

/* ============================================================
   2. GRUPLAR  (en az 2 grup: Uyum, KVKK)
   ============================================================ */
CREATE TABLE Gruplar (
    GrupID          SERIAL PRIMARY KEY,
    GrupAdi         VARCHAR(100)    NOT NULL UNIQUE,
    Aciklama        VARCHAR(500)
);

CREATE UNIQUE INDEX idx_gruplar_adi_normalize
    ON Gruplar (LOWER(BTRIM(GrupAdi)));

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
    TipID                       SERIAL PRIMARY KEY,
    TipAdi                      VARCHAR(100) NOT NULL UNIQUE,
    Aciklama                    VARCHAR(300),
    GrupID                      INT NOT NULL REFERENCES Gruplar(GrupID),
    AktifMi                     BOOLEAN NOT NULL DEFAULT TRUE,
    OlusturanKullaniciID        INT REFERENCES Kullanicilar(KullaniciID),
    OlusturmaTarihi             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    GuncellemeTarihi            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ArsivlenmeTarihi            TIMESTAMPTZ,
    ArsivleyenKullaniciID       INT REFERENCES Kullanicilar(KullaniciID)
);

CREATE UNIQUE INDEX idx_gorevtipleri_adi_lower
    ON GorevTipleri (LOWER(TipAdi));

CREATE INDEX idx_gorevtipleri_aktif_adi
    ON GorevTipleri (AktifMi, LOWER(TipAdi), TipID);

CREATE INDEX idx_gorevtipleri_grup_aktif
    ON GorevTipleri (GrupID, AktifMi, TipID);

/* ============================================================
   5. ETİKETLER  (örn: KVKK, sözleşme, uyum)
   ============================================================ */
CREATE TABLE Etiketler (
    EtiketID                   SERIAL PRIMARY KEY,
    EtiketAdi                  VARCHAR(50) NOT NULL UNIQUE,
    AktifMi                    BOOLEAN NOT NULL DEFAULT TRUE,
    OlusturanKullaniciID       INT REFERENCES Kullanicilar(KullaniciID),
    OlusturmaTarihi            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    GuncellemeTarihi           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    ArsivlenmeTarihi           TIMESTAMPTZ,
    ArsivleyenKullaniciID      INT REFERENCES Kullanicilar(KullaniciID)
);

CREATE UNIQUE INDEX idx_etiketler_adi_lower
    ON Etiketler (LOWER(EtiketAdi));

CREATE INDEX idx_etiketler_aktif_adi
    ON Etiketler (AktifMi, LOWER(EtiketAdi), EtiketID);

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
    IptalNedeni             VARCHAR(1000),

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

    CONSTRAINT gorevler_tek_atama_hedefi CHECK (NOT (
        AtananKullaniciID IS NOT NULL
        AND AtananGrupID IS NOT NULL
    )),
    CONSTRAINT gorevler_iptal_nedeni_tutarliligi
        CHECK (
            (Durum = 'Iptal Edildi' AND NULLIF(BTRIM(IptalNedeni), '') IS NOT NULL)
            OR (Durum <> 'Iptal Edildi' AND IptalNedeni IS NULL)
        ),
    CONSTRAINT gorevler_ustgorev_farkli
        CHECK (UstGorevID IS NULL OR UstGorevID <> GorevID)
);

CREATE INDEX idx_gorevler_ustgorev
    ON Gorevler (UstGorevID, ArsivlendiMi, Durum, GorevID);

CREATE INDEX idx_gorevler_dashboard_risk
    ON Gorevler (BitisTarihi, GorevID)
    WHERE ArsivlendiMi = FALSE
      AND Durum NOT IN ('Tamamlandi', 'Iptal Edildi')
      AND BitisTarihi IS NOT NULL;

CREATE INDEX idx_gorevler_rapor_olusturma
    ON Gorevler (OlusturmaTarihi DESC, GorevID DESC);

CREATE INDEX idx_gorevler_rapor_tamamlanma
    ON Gorevler (TamamlanmaTarihi DESC, GorevID DESC)
    WHERE TamamlanmaTarihi IS NOT NULL;

/* Görev - Etiket (many-to-many) */
CREATE TABLE GorevEtiketleri (
    GorevID     INT NOT NULL REFERENCES Gorevler(GorevID),
    EtiketID    INT NOT NULL REFERENCES Etiketler(EtiketID),
    PRIMARY KEY (GorevID, EtiketID)
);

CREATE INDEX idx_gorevetiketleri_etiket_gorev
    ON GorevEtiketleri (EtiketID, GorevID);

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
    KayitTalepID        INT REFERENCES Kayit_Talepleri(KayitTalepID),
    BildirimTipi        VARCHAR(30) NOT NULL
                            CHECK (BildirimTipi IN ('Atama','Guncelleme','Kapanis','HatirlatmaOrta','HatirlatmaSon','KayitTalebi')),
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
    IslemTarihi     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_aktiviteloglari_tarih_log
    ON AktiviteLoglari (IslemTarihi DESC, LogID DESC);

CREATE INDEX idx_aktiviteloglari_kullanici_tarih
    ON AktiviteLoglari (KullaniciID, IslemTarihi DESC);

CREATE INDEX idx_aktiviteloglari_islem_tarih
    ON AktiviteLoglari (Islem, IslemTarihi DESC);


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

INSERT INTO GorevTipleri (TipAdi, Aciklama, GrupID) VALUES
('Personel', 'Personel ve insan kaynakları süreçleri',
 (SELECT GrupID FROM Gruplar WHERE GrupAdi = 'KVKK')),
('Sözleşme', 'Sözleşme hazırlama ve inceleme süreçleri',
 (SELECT GrupID FROM Gruplar WHERE GrupAdi = 'Uyum')),
('Proje', 'Proje bazlı hukuk ve uyum çalışmaları',
 (SELECT GrupID FROM Gruplar WHERE GrupAdi = 'Uyum')),
('Danışmanlık', 'Hukuki görüş ve danışmanlık talepleri',
 (SELECT GrupID FROM Gruplar WHERE GrupAdi = 'Uyum')),
('Operasyonel', 'Günlük operasyonel iş ve kontroller',
 (SELECT GrupID FROM Gruplar WHERE GrupAdi = 'KVKK'));

INSERT INTO Etiketler (EtiketAdi) VALUES
('KVKK'), ('Sözleşme'), ('Uyum');

-- Örnek kullanıcı, üyelik, görev ve yorum kayıtları ana şemada tutulmaz.
-- Yerel geliştirmede ayrıca şu komut çalıştırılabilir:
-- npm run seed:development
