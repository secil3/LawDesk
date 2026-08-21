/*
  Terminal görev durumları artık otomatik arşivlenir.
  İptal edilen yeni görevlerde açıklama zorunludur. Eski iptal kayıtları,
  şema kısıtı eklenmeden önce açık bir geçmiş notuyla tamamlanır.
*/

ALTER TABLE gorevler
    ADD COLUMN IF NOT EXISTS iptalnedeni VARCHAR(1000);

UPDATE gorevler
SET iptalnedeni = 'Geçmiş kayıtta iptal nedeni belirtilmemiş.'
WHERE durum = 'Iptal Edildi'
  AND NULLIF(BTRIM(iptalnedeni), '') IS NULL;

UPDATE gorevler
SET iptalnedeni = NULL
WHERE durum <> 'Iptal Edildi'
  AND iptalnedeni IS NOT NULL;

UPDATE gorevler
SET arsivlendimi = TRUE,
    arsivlenmetarihi = COALESCE(
      arsivlenmetarihi,
      tamamlanmatarihi,
      guncellemetarihi,
      NOW()
    )
WHERE durum IN ('Tamamlandi', 'Iptal Edildi')
  AND arsivlendimi = FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'gorevler_iptal_nedeni_tutarliligi'
      AND conrelid = 'gorevler'::regclass
  ) THEN
    ALTER TABLE gorevler
      ADD CONSTRAINT gorevler_iptal_nedeni_tutarliligi
      CHECK (
        (durum = 'Iptal Edildi' AND NULLIF(BTRIM(iptalnedeni), '') IS NOT NULL)
        OR (durum <> 'Iptal Edildi' AND iptalnedeni IS NULL)
      );
  END IF;
END
$$;

CREATE INDEX IF NOT EXISTS idx_gorevler_arsiv_durum
    ON gorevler (arsivlendimi, durum, arsivlenmetarihi DESC, gorevid DESC);
