# LawDesk native Windows kurulumu

Kurulum ekibi, teknik adımlarla birlikte imzalanabilir
[`Windows native teslim ve canlı kabul kontrol listesini`](../../docs/WINDOWS_NATIVE_HANDOFF_CHECKLIST.md)
doldurmalıdır. Checklist tamamlanmadan gerçek kullanıcı alınmamalıdır.

Bu paket Windows 10/11 Pro veya Enterprise üzerinde Docker ve WSL2 olmadan
kurulum içindir. IIS, frontend'i HTTPS üzerinden sunar ve `/api` isteklerini
yalnızca `127.0.0.1:3001` üzerinde dinleyen Node.js backend'e aktarır. Backend,
Windows Task Scheduler tarafından bilgisayar açılışında başlatılır ve hata
durumunda yeniden çalıştırılır.

## Kurumun sağlaması gerekenler

- 64 bit Windows 10/11 Pro veya Enterprise ve yerel yönetici erişimi
- Son kullanıcı iş istasyonu olarak kullanılmayan, LawDesk'e ayrılmış bilgisayar/VM
- Kurum DNS'inde LawDesk alan adı
- Alan adıyla eşleşen, özel anahtarı bulunan ve `Local Computer/Personal`
  sertifika deposuna yüklenmiş TLS sertifikası
- Güncel Node.js 24 LTS (`24.11.0` veya üstü)
- PostgreSQL 16 ve komut satırı araçları (`psql`, `pg_dump`, `pg_restore`)
- IIS Web Server, Static Content ve Management Console özellikleri
- IIS URL Rewrite 2 ve Application Request Routing (ARR)
- Kurumsal SMTP bilgileri
- Sunucu dışında kurum tarafından yönetilen yedekleme hedefi

Windows Home, IIS tabanlı bu production paketi için desteklenmez. Bilgisayarın
uykuya alınması, kullanıcı tarafından kapatılması ve denetimsiz otomatik yeniden
başlatılması kurum politikasıyla engellenmelidir.
Kurucu ARR proxy ayarını IIS sunucusu düzeyinde etkinleştirdiği için mevcut başka
IIS uygulamalarının bulunduğu paylaşımlı bir bilgisayarda değişiklik analizi
yapılmadan çalıştırılmamalıdır.

Windows 10'un standart desteği 14 Ekim 2025'te sona ermiştir. Windows 10 hedefi
yalnızca kurumun aktif Extended Security Updates (ESU) kapsamını veya hâlâ
desteklenen ilgili LTSC yaşam döngüsünü doğrulaması halinde kabul edilir;
doğrulamadan sonra `WINDOWS_10_SUPPORT_VERIFIED=true` yazılır. Geçerli güvenlik
güncellemesi kapsamı yoksa Windows 11 kullanılmalıdır.
Kaynaklar: [Windows 10 destek sonu](https://support.microsoft.com/en-us/windows/deployment/updates-lifecycle/windows-10-support-has-ended-on-october-14-2025)
ve [kurumsal ESU ön koşulları](https://learn.microsoft.com/en-us/windows/whats-new/enable-extended-security-updates).

> **Kapasite sınırı:** Microsoft, Windows 10/11 Pro ve Enterprise üzerindeki
> IIS için en fazla 10 eşzamanlı işlenen istek sınırı belgeler; fazlası kuyruğa
> alınır ve yanıt süresi uzayabilir. Bu, toplam 50–70 hesabı engellemez ancak
> aynı anda yoğun kullanım için gerçek hedef bilgisayarda `load/lawdesk.k6.js`
> ile `peak` kabul testi zorunludur. Eşikler geçmezse Windows Server kullanılması
> veya kurumca onaylı, bu istemci-IIS sınırına tabi olmayan native reverse proxy
> seçilmesi gerekir.
>
> Microsoft kaynağı:
> <https://learn.microsoft.com/en-us/iis/troubleshoot/request-restrictions>

## Mimari

```text
Kullanıcı -> HTTPS 443 / IIS
                    |- frontend/dist
                    `- /api -> 127.0.0.1:3001 / Node.js
                                            |- PostgreSQL 16
                                            `- Kurumsal SMTP
```

Backend portu dış ağa açılmaz. PostgreSQL aynı bilgisayardaysa `5432` yalnızca
loopback/özel ağ erişimiyle sınırlandırılır.

## İlk kurulum

1. Repository'yi kalıcı bir konuma alın; örnek: `C:\LawDesk`.
2. Node.js 24 LTS ve PostgreSQL 16 x64 paketlerini kurum yazılım dağıtım
   yöntemiyle kurun. Resmî indirme sayfaları:
   [Node.js](https://nodejs.org/en/download) ve
   [PostgreSQL Windows](https://www.postgresql.org/download/windows/).
3. Yönetici PowerShell'inde gereken IIS özelliklerini etkinleştirin:

   ```powershell
   $iisFeatures = @(
     "IIS-WebServerRole", "IIS-WebServer", "IIS-CommonHttpFeatures",
     "IIS-StaticContent", "IIS-DefaultDocument", "IIS-HttpErrors",
     "IIS-HttpLogging", "IIS-RequestFiltering", "IIS-ManagementConsole"
   )
   Enable-WindowsOptionalFeature -Online -All -FeatureName $iisFeatures
   ```

   Ardından Microsoft [URL Rewrite 2](https://www.iis.net/downloads/microsoft/url-rewrite)
   ve [Application Request Routing](https://www.iis.net/downloads/microsoft/application-request-routing)
   x64 paketlerini kurun. Kurulum dosyaları kaynağa eklenmez; kurum bunları
   kendi yazılım tedarik/zararlı yazılım kontrol sürecinden geçirmelidir.
4. PostgreSQL'de boş `gys_lawdesk` veritabanını ve yalnızca bu veritabanının
   sahibi olan `lawdesk_app` kullanıcısını oluşturun. PostgreSQL yönetici
   parolasını LawDesk env dosyasına yazmayın. Yerel PostgreSQL için komut satırı
   araçları güvenli parola istemiyle kullanılabilir:

   ```powershell
   & "C:\Program Files\PostgreSQL\16\bin\createuser.exe" -U postgres --login --pwprompt lawdesk_app
   & "C:\Program Files\PostgreSQL\16\bin\createdb.exe" -U postgres --owner lawdesk_app --encoding UTF8 gys_lawdesk
   ```

5. Alan adı sertifikasını `Local Computer > Personal` deposuna yükleyin ve
   PowerShell ile thumbprint değerini alın:

   ```powershell
   Get-ChildItem Cert:\LocalMachine\My |
     Select-Object Subject, Thumbprint, NotAfter, HasPrivateKey
   ```

6. Yönetici PowerShell penceresinde installer'ı ilk kez çalıştırın. İlk çalışma
   `C:\ProgramData\LawDesk\config\lawdesk.env` şablonunu oluşturur ve gerçek
   değerler girilene kadar güvenli biçimde durur:

   ```powershell
   powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy\windows\Install-LawDesk.ps1 `
     -CertificateThumbprint "KURUM_SERTIFIKA_THUMBPRINT"
   ```

7. Oluşan `lawdesk.env` dosyasındaki bütün `DEGISTIRIN` ve `example` alanlarını
   gerçek DB, domain, SMTP ve ilk admin bilgileriyle değiştirin.
   `INITIAL_ADMIN_EMAIL_VERIFIED=true` yalnızca posta kutusu sahipliği kurum
   tarafından doğrulandıktan sonra yazılır. Hedef Windows 10 ise
   `WINDOWS_10_SUPPORT_VERIFIED=true` yalnızca BT aktif ESU veya desteklenen
   LTSC yaşam döngüsünü doğruladıktan sonra ayarlanır; Windows 11'de `false`
   kalabilir.
8. Windows Firewall/kurum güvenlik duvarında kullanıcı ağından yalnızca
   `443/TCP` erişimine izin verin. `3001/TCP` ve yerel PostgreSQL için
   `5432/TCP` dış ağa açılmamalıdır.
9. Aynı installer'ı ilk admin seçeneğiyle yeniden çalıştırın:

   ```powershell
   powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
     -File .\deploy\windows\Install-LawDesk.ps1 `
     -CertificateThumbprint "KURUM_SERTIFIKA_THUMBPRINT" `
     -CreateInitialAdmin
   ```

Başarılı kurulum; production config kontrolü, dependency kurulumu, frontend
build, temiz şema/migration, IIS, backend scheduled task ve health kontrollerini
tamamlar. İlk admin oluşturulunca `INITIAL_ADMIN_PASSWORD` env dosyasından
otomatik kaldırılır.

## Kabul kontrolü

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Test-LawDeskHealth.ps1
```

Kontrol; backend liveness/readiness, dış HTTPS adresi, IIS reverse proxy ve
zorunlu güvenlik başlıklarını doğrular. Ayrıca test posta kutusuyla gerçek
kayıt-onay-aktivasyon-giriş akışı elle tamamlanmalı ve aynı hedef bilgisayara
başka bir bilgisayardan 70 kullanıcılı `peak` k6 profili uygulanmalıdır.

## Yedek

Yedek hedefi aynı bilgisayardaki `C:` diski olmamalıdır. Kurum paylaşımı veya
ayrı yedek diski kullanın:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Backup-LawDesk.ps1 `
  -Destination "\\yedek-sunucusu\LawDesk"
```

Script kısa süreliğine backend'i durdurur, PostgreSQL custom dump alır, ekleri
kopyalar ve veritabanı/ekler için SHA-256 manifest üretir. Uzak paylaşım için
Task Scheduler görevi oluşturulacaksa görev, hedefe yazma yetkili kurumsal servis
hesabıyla çalıştırılmalıdır.

## Geri yükleme

Önce mevcut sistem için ayrıca güvenlik yedeği alın. Ardından veritabanı adını
açıkça doğrulayarak restore çalıştırılır:

```powershell
powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass `
  -File .\deploy\windows\Restore-LawDesk.ps1 `
  -BackupDirectory "\\yedek-sunucusu\LawDesk\lawdesk-YYYYMMDD-HHMMSS-utc" `
  -ExpectedDatabaseName "gys_lawdesk" `
  -ConfirmRestore
```

Eski ek klasörü otomatik silinmez; doğrulama tamamlanana kadar
`attachments.before-restore-*` adıyla korunur.

## Güncelleme

1. Yedek alın.
2. `git pull --ff-only` ile onaylı sürümü alın.
3. Aynı `Install-LawDesk.ps1` komutunu `-CreateInitialAdmin` olmadan çalıştırın.
4. Health kontrolü ve temel kullanıcı kabulünü tekrarlayın.

Migration dosyaları ileri yönlüdür. Veritabanı migration'ı uygulandıktan sonra
yalnızca eski kaynak koda dönmek güvenli rollback sayılmaz; uygulama ve
veritabanı yedeği birlikte geri yüklenmelidir.

## Operasyon yolları

- Ortam ayarları: `C:\ProgramData\LawDesk\config\lawdesk.env`
- Ekler: `C:\ProgramData\LawDesk\attachments` (env ile değiştirilebilir)
- Backend logları: `C:\ProgramData\LawDesk\logs`
- Backend görevi: Task Scheduler içindeki `LawDesk-Backend`
- IIS logları: kurumun IIS log ayarında belirtilen klasör

Gerçek env dosyasını, TLS özel anahtarını veya alınan yedekleri Git'e eklemeyin.
