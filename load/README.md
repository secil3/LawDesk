# LawDesk yük testi

Bu dizindeki k6 senaryosu yalnızca ayrılmış bir test/staging veritabanında
çalıştırılmalıdır. `seed:load-test` komutu, adı `_test` ile bitmeyen bir
veritabanına yazmayı reddeder.

Profiller:

- `smoke`: 5 sanal kullanıcıyla yaklaşık 25 saniyelik hızlı doğrulama.
- `standard`: 25 sanal kullanıcıyla yaklaşık 3 dakikalık normal yoğunluk.
- `peak`: 70 sanal kullanıcıyla yaklaşık 3,5 dakikalık tepe testi.

Başarı eşikleri; başarısız HTTP isteğinin yüzde 1'in altında, kontrollerin
yüzde 99'un üzerinde ve yanıt süresinin 95. yüzdelikte 1 saniyenin altında
kalmasıdır. Tam test GitHub Actions içindeki **LawDesk Load Test** iş akışından
elle başlatılabilir.
