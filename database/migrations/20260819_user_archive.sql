BEGIN;

ALTER TABLE kullanicilar
  ADD COLUMN IF NOT EXISTS silindimi BOOLEAN;

UPDATE kullanicilar
SET silindimi = FALSE
WHERE silindimi IS NULL;

ALTER TABLE kullanicilar
  ALTER COLUMN silindimi SET DEFAULT FALSE,
  ALTER COLUMN silindimi SET NOT NULL;

ALTER TABLE kullanicilar
  ADD COLUMN IF NOT EXISTS silinmetarihi TIMESTAMP NULL;

CREATE INDEX IF NOT EXISTS idx_kullanicilar_silindimi
  ON kullanicilar (silindimi);

COMMIT;