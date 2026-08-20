BEGIN;

CREATE INDEX IF NOT EXISTS idx_gorevler_dashboard_risk
    ON Gorevler (BitisTarihi, GorevID)
    WHERE ArsivlendiMi = FALSE
      AND Durum NOT IN ('Tamamlandi', 'Iptal Edildi')
      AND BitisTarihi IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_gorevler_rapor_olusturma
    ON Gorevler (OlusturmaTarihi DESC, GorevID DESC);

CREATE INDEX IF NOT EXISTS idx_gorevler_rapor_tamamlanma
    ON Gorevler (TamamlanmaTarihi DESC, GorevID DESC)
    WHERE TamamlanmaTarihi IS NOT NULL;

COMMIT;
