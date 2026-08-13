/*
  Her kullanıcı görev oluşturabilir. Atama yetkisi olmayan kullanıcıların
  görevleri daha sonra grup yöneticisi, yönetici veya admin tarafından atanır.
  Bu migration mevcut veritabanındaki zorunlu atama CHECK kısıtını kaldırır.
*/

DO $$
DECLARE
    assignment_constraint_name TEXT;
BEGIN
    SELECT conname
      INTO assignment_constraint_name
      FROM pg_constraint
     WHERE conrelid = 'gorevler'::regclass
       AND contype = 'c'
       AND pg_get_constraintdef(oid) ILIKE
           '%atanankullaniciid IS NOT NULL%atanangrupid IS NOT NULL%'
       AND pg_get_constraintdef(oid) ILIKE '% OR %'
     LIMIT 1;

    IF assignment_constraint_name IS NOT NULL THEN
        EXECUTE format(
            'ALTER TABLE gorevler DROP CONSTRAINT %I',
            assignment_constraint_name
        );
    END IF;
END $$;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
          FROM pg_constraint
         WHERE conrelid = 'gorevler'::regclass
           AND conname = 'gorevler_tek_atama_hedefi'
    ) THEN
        ALTER TABLE gorevler
            ADD CONSTRAINT gorevler_tek_atama_hedefi
            CHECK (NOT (
                atanankullaniciid IS NOT NULL
                AND atanangrupid IS NOT NULL
            ));
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_gorevler_olusturan
    ON gorevler (olusturankullaniciid);

CREATE INDEX IF NOT EXISTS idx_gorevler_atanan_kullanici
    ON gorevler (atanankullaniciid);

CREATE INDEX IF NOT EXISTS idx_gorevler_atanan_grup
    ON gorevler (atanangrupid);
