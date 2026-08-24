ALTER TABLE kullanicilar
    ALTER COLUMN sifrehash DROP NOT NULL,
    ADD COLUMN IF NOT EXISTS aktivasyonbekliyormu BOOLEAN,
    ADD COLUMN IF NOT EXISTS emaildogrulamatarihi TIMESTAMPTZ;

UPDATE kullanicilar
SET aktivasyonbekliyormu = FALSE
WHERE aktivasyonbekliyormu IS NULL;

ALTER TABLE kullanicilar
    ALTER COLUMN aktivasyonbekliyormu SET DEFAULT FALSE,
    ALTER COLUMN aktivasyonbekliyormu SET NOT NULL;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'kullanicilar'::regclass
          AND conname = 'kullanicilar_aktivasyon_tutarliligi'
    ) THEN
        ALTER TABLE kullanicilar
            ADD CONSTRAINT kullanicilar_aktivasyon_tutarliligi
            CHECK (
                (aktivasyonbekliyormu = TRUE
                 AND aktifmi = FALSE
                 AND sifrehash IS NULL)
                OR
                (aktivasyonbekliyormu = FALSE
                 AND sifrehash IS NOT NULL)
            );
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_kullanicilar_email_lower
    ON kullanicilar (LOWER(email));

CREATE TABLE IF NOT EXISTS kayit_talepleri (
    kayittalepid                    SERIAL PRIMARY KEY,
    adsoyad                         VARCHAR(150) NOT NULL,
    email                           VARCHAR(150) NOT NULL,
    durum                           VARCHAR(20) NOT NULL DEFAULT 'Bekliyor'
                                        CHECK (durum IN ('Bekliyor','Onaylandi','Reddedildi')),
    olusturmatarihi                 TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    inceleyenkullaniciid            INT REFERENCES kullanicilar(kullaniciid),
    incelemetarihi                  TIMESTAMPTZ,
    rednedeni                       VARCHAR(500),
    onaylananrol                    VARCHAR(20)
                                        CHECK (onaylananrol IN ('yonetici','kullanici')),
    olusturulankullaniciid          INT REFERENCES kullanicilar(kullaniciid),
    aktivasyonepostagonderimtarihi  TIMESTAMPTZ,
    aktivasyonepostahatasi          VARCHAR(500)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_kayit_talepleri_bekleyen_email
    ON kayit_talepleri (LOWER(email))
    WHERE durum = 'Bekliyor';

CREATE INDEX IF NOT EXISTS idx_kayit_talepleri_durum_tarih
    ON kayit_talepleri (durum, olusturmatarihi DESC, kayittalepid DESC);

CREATE TABLE IF NOT EXISTS kullaniciaktivasyontokenlari (
    tokenid                 SERIAL PRIMARY KEY,
    kullaniciid             INT NOT NULL REFERENCES kullanicilar(kullaniciid),
    kayittalepid            INT NOT NULL REFERENCES kayit_talepleri(kayittalepid),
    tokenhash               CHAR(64) NOT NULL UNIQUE,
    sonkullanmatarihi       TIMESTAMPTZ NOT NULL,
    kullanilmatarihi        TIMESTAMPTZ,
    iptaltarihi             TIMESTAMPTZ,
    olusturmatarihi         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    olusturankullaniciid    INT NOT NULL REFERENCES kullanicilar(kullaniciid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_aktivasyontokenlari_aktif_kullanici
    ON kullaniciaktivasyontokenlari (kullaniciid)
    WHERE kullanilmatarihi IS NULL AND iptaltarihi IS NULL;

CREATE INDEX IF NOT EXISTS idx_aktivasyontokenlari_hash_gecerlilik
    ON kullaniciaktivasyontokenlari (tokenhash, sonkullanmatarihi)
    WHERE kullanilmatarihi IS NULL AND iptaltarihi IS NULL;

ALTER TABLE bildirimler
    ADD COLUMN IF NOT EXISTS kayittalepid INT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conrelid = 'bildirimler'::regclass
          AND conname = 'bildirimler_kayittalepid_fkey'
    ) THEN
        ALTER TABLE bildirimler
            ADD CONSTRAINT bildirimler_kayittalepid_fkey
            FOREIGN KEY (kayittalepid)
            REFERENCES kayit_talepleri(kayittalepid);
    END IF;
END
$$;

DO $$
DECLARE
    notification_type_constraint TEXT;
BEGIN
    SELECT conname
      INTO notification_type_constraint
      FROM pg_constraint
     WHERE conrelid = 'bildirimler'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE '%bildirimtipi%'
     LIMIT 1;

    IF notification_type_constraint IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE bildirimler DROP CONSTRAINT %I',
            notification_type_constraint
        );
    END IF;

    ALTER TABLE bildirimler
        ADD CONSTRAINT bildirimler_bildirimtipi_check
        CHECK (
            bildirimtipi IN (
                'Atama',
                'Guncelleme',
                'Kapanis',
                'HatirlatmaOrta',
                'HatirlatmaSon',
                'KayitTalebi'
            )
        );
END
$$;

CREATE INDEX IF NOT EXISTS idx_bildirimler_kayittalebi
    ON bildirimler (kayittalepid, bildirimid)
    WHERE kayittalepid IS NOT NULL;
