CREATE TABLE IF NOT EXISTS epostaoutbox (
    epostaoutboxid          BIGSERIAL PRIMARY KEY,
    kayittalepid            INT NOT NULL
                                REFERENCES kayit_talepleri(kayittalepid),
    kullaniciid             INT NOT NULL
                                REFERENCES kullanicilar(kullaniciid),
    aktivasyontokenid       INT NOT NULL
                                REFERENCES kullaniciaktivasyontokenlari(tokenid),
    tur                     VARCHAR(30) NOT NULL DEFAULT 'Aktivasyon'
                                CHECK (tur IN ('Aktivasyon')),
    aliciemail              VARCHAR(150) NOT NULL,
    aliciadi                VARCHAR(150) NOT NULL,
    sifreliicerik           TEXT,
    durum                   VARCHAR(20) NOT NULL DEFAULT 'Bekliyor'
                                CHECK (
                                    durum IN (
                                        'Bekliyor',
                                        'Isleniyor',
                                        'Gonderildi',
                                        'Basarisiz',
                                        'Iptal'
                                    )
                                ),
    denemesayisi            INT NOT NULL DEFAULT 0
                                CHECK (denemesayisi >= 0),
    sonrakidenemetarihi     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    kilitlenmetarihi        TIMESTAMPTZ,
    sonhata                 VARCHAR(500),
    gonderimtarihi          TIMESTAMPTZ,
    olusturmatarihi         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    guncellemetarihi        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CONSTRAINT epostaoutbox_aktif_icerik_tutarliligi
        CHECK (
            (durum IN ('Bekliyor', 'Isleniyor') AND sifreliicerik IS NOT NULL)
            OR
            (durum IN ('Gonderildi', 'Basarisiz', 'Iptal') AND sifreliicerik IS NULL)
        )
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_epostaoutbox_aktif_aktivasyon
    ON epostaoutbox (kayittalepid)
    WHERE tur = 'Aktivasyon'
      AND durum IN ('Bekliyor', 'Isleniyor');

CREATE INDEX IF NOT EXISTS idx_epostaoutbox_hazir
    ON epostaoutbox (sonrakidenemetarihi, epostaoutboxid)
    WHERE durum = 'Bekliyor';

CREATE INDEX IF NOT EXISTS idx_epostaoutbox_kilit
    ON epostaoutbox (kilitlenmetarihi, epostaoutboxid)
    WHERE durum = 'Isleniyor';
