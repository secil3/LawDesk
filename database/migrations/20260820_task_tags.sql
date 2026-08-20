BEGIN;

CREATE TABLE IF NOT EXISTS etiketler (
    etiketid                   SERIAL PRIMARY KEY,
    etiketadi                  VARCHAR(50) NOT NULL UNIQUE,
    aktifmi                    BOOLEAN NOT NULL DEFAULT TRUE,
    olusturankullaniciid       INT REFERENCES kullanicilar(kullaniciid),
    olusturmatarihi            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    guncellemetarihi           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    arsivlenmetarihi           TIMESTAMPTZ,
    arsivleyenkullaniciid      INT REFERENCES kullanicilar(kullaniciid)
);

ALTER TABLE etiketler
    ADD COLUMN IF NOT EXISTS aktifmi BOOLEAN,
    ADD COLUMN IF NOT EXISTS olusturankullaniciid INT
        REFERENCES kullanicilar(kullaniciid),
    ADD COLUMN IF NOT EXISTS olusturmatarihi TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS guncellemetarihi TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS arsivlenmetarihi TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS arsivleyenkullaniciid INT
        REFERENCES kullanicilar(kullaniciid);

UPDATE etiketler
SET aktifmi = TRUE
WHERE aktifmi IS NULL;

UPDATE etiketler
SET olusturmatarihi = NOW()
WHERE olusturmatarihi IS NULL;

UPDATE etiketler
SET guncellemetarihi = COALESCE(olusturmatarihi, NOW())
WHERE guncellemetarihi IS NULL;

ALTER TABLE etiketler
    ALTER COLUMN aktifmi SET DEFAULT TRUE,
    ALTER COLUMN aktifmi SET NOT NULL,
    ALTER COLUMN olusturmatarihi SET DEFAULT NOW(),
    ALTER COLUMN olusturmatarihi SET NOT NULL,
    ALTER COLUMN guncellemetarihi SET DEFAULT NOW(),
    ALTER COLUMN guncellemetarihi SET NOT NULL;

CREATE TABLE IF NOT EXISTS gorevetiketleri (
    gorevid     INT NOT NULL REFERENCES gorevler(gorevid),
    etiketid    INT NOT NULL REFERENCES etiketler(etiketid),
    PRIMARY KEY (gorevid, etiketid)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_etiketler_adi_lower
    ON etiketler (LOWER(etiketadi));

CREATE INDEX IF NOT EXISTS idx_etiketler_aktif_adi
    ON etiketler (aktifmi, LOWER(etiketadi), etiketid);

CREATE INDEX IF NOT EXISTS idx_gorevetiketleri_etiket_gorev
    ON gorevetiketleri (etiketid, gorevid);

COMMIT;
