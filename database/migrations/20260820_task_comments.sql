BEGIN;

CREATE TABLE IF NOT EXISTS yorumlar (
    yorumid             SERIAL PRIMARY KEY,
    gorevid             INT NOT NULL REFERENCES gorevler(gorevid),
    kullaniciid         INT NOT NULL REFERENCES kullanicilar(kullaniciid),
    yorummetni          TEXT NOT NULL,
    olusturmatarihi     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    guncellemetarihi    TIMESTAMPTZ,
    duzenlendimi        BOOLEAN NOT NULL DEFAULT FALSE,
    versiyon            INT NOT NULL DEFAULT 1,
    silindimi           BOOLEAN NOT NULL DEFAULT FALSE,
    silinmetarihi       TIMESTAMPTZ,
    silenkullaniciid    INT REFERENCES kullanicilar(kullaniciid)
);

ALTER TABLE yorumlar
    ADD COLUMN IF NOT EXISTS guncellemetarihi TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS duzenlendimi BOOLEAN,
    ADD COLUMN IF NOT EXISTS versiyon INT,
    ADD COLUMN IF NOT EXISTS silindimi BOOLEAN,
    ADD COLUMN IF NOT EXISTS silinmetarihi TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS silenkullaniciid INT
        REFERENCES kullanicilar(kullaniciid);

UPDATE yorumlar
SET duzenlendimi = FALSE
WHERE duzenlendimi IS NULL;

UPDATE yorumlar
SET versiyon = 1
WHERE versiyon IS NULL OR versiyon < 1;

UPDATE yorumlar
SET silindimi = FALSE
WHERE silindimi IS NULL;

ALTER TABLE yorumlar
    ALTER COLUMN duzenlendimi SET DEFAULT FALSE,
    ALTER COLUMN duzenlendimi SET NOT NULL,
    ALTER COLUMN versiyon SET DEFAULT 1,
    ALTER COLUMN versiyon SET NOT NULL,
    ALTER COLUMN silindimi SET DEFAULT FALSE,
    ALTER COLUMN silindimi SET NOT NULL;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = current_schema()
          AND column_info.table_name = 'yorumlar'
          AND column_info.column_name = 'olusturmatarihi'
          AND column_info.data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE yorumlar
            ALTER COLUMN olusturmatarihi TYPE TIMESTAMPTZ
            USING olusturmatarihi AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = current_schema()
          AND column_info.table_name = 'yorumlar'
          AND column_info.column_name = 'guncellemetarihi'
          AND column_info.data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE yorumlar
            ALTER COLUMN guncellemetarihi TYPE TIMESTAMPTZ
            USING guncellemetarihi AT TIME ZONE 'UTC';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = current_schema()
          AND column_info.table_name = 'yorumlar'
          AND column_info.column_name = 'silinmetarihi'
          AND column_info.data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE yorumlar
            ALTER COLUMN silinmetarihi TYPE TIMESTAMPTZ
            USING silinmetarihi AT TIME ZONE 'UTC';
    END IF;
END
$$;

CREATE TABLE IF NOT EXISTS yorumgecmisi (
    gecmisid                 SERIAL PRIMARY KEY,
    yorumid                  INT NOT NULL REFERENCES yorumlar(yorumid),
    oncekimetin              TEXT NOT NULL,
    oncekiversiyon           INT NOT NULL DEFAULT 1,
    duzenleyenkullaniciid    INT REFERENCES kullanicilar(kullaniciid),
    degisikliktarihi         TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE yorumgecmisi
    ADD COLUMN IF NOT EXISTS oncekiversiyon INT,
    ADD COLUMN IF NOT EXISTS duzenleyenkullaniciid INT
        REFERENCES kullanicilar(kullaniciid);

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns column_info
        WHERE column_info.table_schema = current_schema()
          AND column_info.table_name = 'yorumgecmisi'
          AND column_info.column_name = 'degisikliktarihi'
          AND column_info.data_type = 'timestamp without time zone'
    ) THEN
        ALTER TABLE yorumgecmisi
            ALTER COLUMN degisikliktarihi TYPE TIMESTAMPTZ
            USING degisikliktarihi AT TIME ZONE 'UTC';
    END IF;
END
$$;

WITH ranked_history AS (
    SELECT gecmisid,
           ROW_NUMBER() OVER (
               PARTITION BY yorumid
               ORDER BY degisikliktarihi ASC, gecmisid ASC
           )::int AS calculated_version
    FROM yorumgecmisi
)
UPDATE yorumgecmisi history
SET oncekiversiyon = ranked_history.calculated_version
FROM ranked_history
WHERE history.gecmisid = ranked_history.gecmisid
  AND (history.oncekiversiyon IS NULL OR history.oncekiversiyon < 1);

ALTER TABLE yorumgecmisi
    ALTER COLUMN oncekiversiyon SET DEFAULT 1,
    ALTER COLUMN oncekiversiyon SET NOT NULL;

WITH latest_history AS (
    SELECT yorumid,
           MAX(oncekiversiyon) + 1 AS current_version,
           MAX(degisikliktarihi) AS last_change_at
    FROM yorumgecmisi
    GROUP BY yorumid
)
UPDATE yorumlar comment
SET versiyon = GREATEST(comment.versiyon, latest_history.current_version),
    duzenlendimi = TRUE,
    guncellemetarihi = COALESCE(
        comment.guncellemetarihi,
        latest_history.last_change_at
    )
FROM latest_history
WHERE comment.yorumid = latest_history.yorumid;

CREATE INDEX IF NOT EXISTS idx_yorumlar_gorev_aktif
    ON yorumlar (gorevid, olusturmatarihi, yorumid)
    WHERE silindimi = FALSE;

CREATE INDEX IF NOT EXISTS idx_yorumlar_gorev_arsiv
    ON yorumlar (gorevid, silinmetarihi DESC, yorumid DESC)
    WHERE silindimi = TRUE;

CREATE INDEX IF NOT EXISTS idx_yorumgecmisi_yorum
    ON yorumgecmisi (yorumid, oncekiversiyon DESC, gecmisid DESC);

COMMIT;
