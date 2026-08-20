BEGIN;

ALTER TABLE gorevler
    ADD COLUMN IF NOT EXISTS ustgorevid INT;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'gorevler'::regclass
           AND conname = 'gorevler_ustgorevid_fkey'
    ) THEN
        ALTER TABLE gorevler
            ADD CONSTRAINT gorevler_ustgorevid_fkey
            FOREIGN KEY (ustgorevid)
            REFERENCES gorevler(gorevid);
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'gorevler'::regclass
           AND conname = 'gorevler_ustgorev_farkli'
    ) THEN
        ALTER TABLE gorevler
            ADD CONSTRAINT gorevler_ustgorev_farkli
            CHECK (ustgorevid IS NULL OR ustgorevid <> gorevid);
    END IF;
END $$;

/*
  Önceden SQL şeması üzerinden eklenmiş alt görevleri yeni kuralla uyumlu
  hâle getirir. Alt görevlerin sahibi, ataması ve görünürlüğü ana görevden
  devralınır. Gerçek işlem yapan kullanıcı denetim kaydında korunur.
*/
UPDATE gorevler child_task
SET atanankullaniciid = parent_task.atanankullaniciid,
    atanangrupid = parent_task.atanangrupid,
    gorunurluktipi = parent_task.gorunurluktipi,
    gorunurlukkullaniciid = parent_task.gorunurlukkullaniciid,
    gorunurlukgrupid = parent_task.gorunurlukgrupid,
    olusturankullaniciid = parent_task.olusturankullaniciid,
    guncellemetarihi = NOW()
FROM gorevler parent_task
WHERE child_task.ustgorevid = parent_task.gorevid;

CREATE INDEX IF NOT EXISTS idx_gorevler_ustgorev
    ON gorevler (ustgorevid, arsivlendimi, durum, gorevid);

COMMIT;
