BEGIN;

INSERT INTO kullanicilar
    (adsoyad, email, sifrehash, rol, aktifmi)
VALUES
    ('Admin Kullanici', 'admin@sirket.com', 'HASH_PLACEHOLDER', 'admin', TRUE),
    ('Ayşe Yılmaz', 'ayse.yilmaz@sirket.com', 'HASH_PLACEHOLDER', 'yonetici', TRUE),
    ('Mehmet Demir', 'mehmet.demir@sirket.com', 'HASH_PLACEHOLDER', 'kullanici', TRUE)
ON CONFLICT DO NOTHING;

INSERT INTO grupuyelikleri (grupid, kullaniciid, gruprolu)
SELECT selected_group.grupid,
       selected_user.kullaniciid,
       membership.gruprolu
FROM (
    VALUES
      ('Uyum', 'ayse.yilmaz@sirket.com', 'grup_yoneticisi'),
      ('Uyum', 'mehmet.demir@sirket.com', 'grup_uyesi'),
      ('KVKK', 'mehmet.demir@sirket.com', 'grup_uyesi')
) AS membership(grupadi, email, gruprolu)
JOIN gruplar selected_group
  ON selected_group.grupadi = membership.grupadi
JOIN kullanicilar selected_user
  ON LOWER(selected_user.email) = LOWER(membership.email)
ON CONFLICT (grupid, kullaniciid) DO NOTHING;

INSERT INTO gorevler
    (baslik, aciklama, tipid, oncelik, durum, bitistarihi,
     atanangrupid, gorunurluktipi, gorunurlukgrupid,
     olusturankullaniciid)
SELECT 'KVKK Uyum Denetimi',
       'Yıllık KVKK uyum denetiminin yapılması',
       task_type.tipid,
       'Yuksek',
       'Devam Ediyor',
       NOW() + INTERVAL '14 days',
       selected_group.grupid,
       'Grup',
       selected_group.grupid,
       admin_user.kullaniciid
FROM gorevtipleri task_type
JOIN gruplar selected_group
  ON selected_group.grupadi = 'KVKK'
JOIN kullanicilar admin_user
  ON LOWER(admin_user.email) = 'admin@sirket.com'
WHERE task_type.tipadi = 'Operasyonel'
  AND NOT EXISTS (
    SELECT 1
    FROM gorevler existing_task
    WHERE existing_task.baslik = 'KVKK Uyum Denetimi'
      AND existing_task.olusturankullaniciid = admin_user.kullaniciid
  );

INSERT INTO gorevler
    (ustgorevid, baslik, aciklama, tipid, oncelik, durum,
     bitistarihi, atanangrupid, gorunurluktipi,
     gorunurlukgrupid, olusturankullaniciid)
SELECT parent_task.gorevid,
       'Envanter Kontrolü',
       'Kişisel veri envanterinin gözden geçirilmesi',
       parent_task.tipid,
       'Orta',
       'Yeni Atandi',
       NOW() + INTERVAL '7 days',
       parent_task.atanangrupid,
       parent_task.gorunurluktipi,
       parent_task.gorunurlukgrupid,
       parent_task.olusturankullaniciid
FROM gorevler parent_task
WHERE parent_task.baslik = 'KVKK Uyum Denetimi'
  AND parent_task.ustgorevid IS NULL
  AND NOT EXISTS (
    SELECT 1
    FROM gorevler child_task
    WHERE child_task.ustgorevid = parent_task.gorevid
      AND child_task.baslik = 'Envanter Kontrolü'
  );

INSERT INTO gorevetiketleri (gorevid, etiketid)
SELECT task.gorevid, tag.etiketid
FROM gorevler task
JOIN etiketler tag
  ON tag.etiketadi IN ('KVKK', 'Uyum')
WHERE task.baslik = 'KVKK Uyum Denetimi'
ON CONFLICT (gorevid, etiketid) DO NOTHING;

INSERT INTO yorumlar (gorevid, kullaniciid, yorummetni)
SELECT task.gorevid,
       manager_user.kullaniciid,
       'Denetim planı hazırlanıyor.'
FROM gorevler task
JOIN kullanicilar manager_user
  ON LOWER(manager_user.email) = 'ayse.yilmaz@sirket.com'
WHERE task.baslik = 'KVKK Uyum Denetimi'
  AND NOT EXISTS (
    SELECT 1
    FROM yorumlar existing_comment
    WHERE existing_comment.gorevid = task.gorevid
      AND existing_comment.kullaniciid = manager_user.kullaniciid
      AND existing_comment.yorummetni = 'Denetim planı hazırlanıyor.'
  );

COMMIT;
