ALTER TABLE gorevtipleri
  ADD COLUMN IF NOT EXISTS grupid INT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gorevtipleri_grupid_fkey'
      AND conrelid = 'gorevtipleri'::regclass
  ) THEN
    ALTER TABLE gorevtipleri
      ADD CONSTRAINT gorevtipleri_grupid_fkey
      FOREIGN KEY (grupid)
      REFERENCES gruplar(grupid);
  END IF;
END
$$;

-- Mevcut tiplerde tek ve baskın bir grup kullanımı varsa güvenli şekilde
-- önerilen grup olarak taşınır. Hiç grup kullanımı olmayan tipler NULL kalır
-- ve Yönetim ekranından açıkça eşleştirilmeden yeni görevlerde kullanılamaz.
WITH inferred_groups AS (
  SELECT task_type.tipid,
         (
           SELECT task.atanangrupid
           FROM gorevler task
           WHERE task.tipid = task_type.tipid
             AND task.atanangrupid IS NOT NULL
           GROUP BY task.atanangrupid
           ORDER BY COUNT(*) DESC, task.atanangrupid ASC
           LIMIT 1
         ) AS grupid
  FROM gorevtipleri task_type
  WHERE task_type.grupid IS NULL
)
UPDATE gorevtipleri task_type
SET grupid = inferred_groups.grupid
FROM inferred_groups
WHERE task_type.tipid = inferred_groups.tipid
  AND inferred_groups.grupid IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gorevtipleri_grup_aktif
  ON gorevtipleri (grupid, aktifmi, tipid);
