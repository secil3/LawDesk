/*
  Görevler fiziksel olarak silinmez. Bu alanlar görevi aktif listelerden
  kaldırırken yorum, atama geçmişi ve aktivite kayıtlarını korur.
*/

ALTER TABLE gorevler
    ADD COLUMN IF NOT EXISTS arsivlendimi BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS arsivlenmetarihi TIMESTAMP,
    ADD COLUMN IF NOT EXISTS arsivleyenkullaniciid INT
        REFERENCES kullanicilar(kullaniciid);

CREATE INDEX IF NOT EXISTS idx_gorevler_aktif_liste
    ON gorevler (olusturmatarihi DESC, gorevid DESC)
    WHERE arsivlendimi = FALSE;

CREATE INDEX IF NOT EXISTS idx_aktivite_loglari_gorev_tarih
    ON aktiviteloglari (gorevid, islemtarihi DESC);
