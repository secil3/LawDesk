BEGIN;

ALTER TABLE gorevtipleri
    ADD COLUMN IF NOT EXISTS aciklama VARCHAR(300),
    ADD COLUMN IF NOT EXISTS olusturankullaniciid INT
        REFERENCES kullanicilar(kullaniciid),
    ADD COLUMN IF NOT EXISTS olusturmatarihi TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS guncellemetarihi TIMESTAMPTZ
        NOT NULL DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS arsivlenmetarihi TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS arsivleyenkullaniciid INT
        REFERENCES kullanicilar(kullaniciid);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = current_schema()
          AND column_info.table_name = 'aktiviteloglari'
          AND column_info.column_name = 'islemtarihi'
          AND column_info.data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE aktiviteloglari
            ALTER COLUMN islemtarihi TYPE TIMESTAMPTZ
            USING islemtarihi AT TIME ZONE 'UTC';
    END IF;
END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_gorevtipleri_adi_lower
    ON gorevtipleri (LOWER(tipadi));

CREATE INDEX IF NOT EXISTS idx_gorevtipleri_aktif_adi
    ON gorevtipleri (aktifmi, LOWER(tipadi), tipid);

COMMIT;
