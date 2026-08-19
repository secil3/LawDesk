BEGIN;

CREATE TABLE IF NOT EXISTS ekler (
    ekid                SERIAL PRIMARY KEY,
    gorevid             INT NOT NULL REFERENCES gorevler(gorevid),
    dosyaadi            VARCHAR(255) NOT NULL,
    dosyayolu           VARCHAR(500),
    dosyaverisi         BYTEA,
    dosyaboyutubyte     BIGINT NOT NULL,
    mimeturu            VARCHAR(150),
    sifrelemeyontemi    VARCHAR(50),
    yukleyenkullaniciid INT NOT NULL REFERENCES kullanicilar(kullaniciid),
    yuklenmetarihi      TIMESTAMP NOT NULL DEFAULT NOW(),
    silindimi           BOOLEAN NOT NULL DEFAULT FALSE,
    silinmetarihi       TIMESTAMP,
    silenkullaniciid    INT REFERENCES kullanicilar(kullaniciid),
    CHECK (dosyayolu IS NOT NULL OR dosyaverisi IS NOT NULL)
);

ALTER TABLE ekler
    ADD COLUMN IF NOT EXISTS mimeturu VARCHAR(150),
    ADD COLUMN IF NOT EXISTS silindimi BOOLEAN,
    ADD COLUMN IF NOT EXISTS silinmetarihi TIMESTAMP,
    ADD COLUMN IF NOT EXISTS silenkullaniciid INT
        REFERENCES kullanicilar(kullaniciid);

UPDATE ekler
SET silindimi = FALSE
WHERE silindimi IS NULL;

ALTER TABLE ekler
    ALTER COLUMN silindimi SET DEFAULT FALSE,
    ALTER COLUMN silindimi SET NOT NULL;

CREATE INDEX IF NOT EXISTS idx_ekler_gorev_aktif
    ON ekler (gorevid, yuklenmetarihi DESC, ekid DESC)
    WHERE silindimi = FALSE;

INSERT INTO ayarlar (ayaranahtari, ayardegeri, aciklama)
VALUES (
    'MaxDosyaBoyutuMB',
    '25',
    'Eklerde izin verilen maksimum dosya boyutu (MB)'
)
ON CONFLICT (ayaranahtari) DO NOTHING;

COMMIT;
