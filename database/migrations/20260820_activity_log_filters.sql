BEGIN;

CREATE INDEX IF NOT EXISTS idx_aktiviteloglari_tarih_log
    ON aktiviteloglari (islemtarihi DESC, logid DESC);

CREATE INDEX IF NOT EXISTS idx_aktiviteloglari_kullanici_tarih
    ON aktiviteloglari (kullaniciid, islemtarihi DESC);

CREATE INDEX IF NOT EXISTS idx_aktiviteloglari_islem_tarih
    ON aktiviteloglari (islem, islemtarihi DESC);

COMMIT;
