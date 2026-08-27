[CmdletBinding()]
param(
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$EnvFile = "$env:ProgramData\LawDesk\config\lawdesk.env",
    [string]$SiteName = "LawDesk",

    [Parameter(Mandatory = $true)]
    [ValidatePattern("^[A-Fa-f0-9 ]{40,}$")]
    [string]$CertificateThumbprint
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

Assert-LawDeskAdministrator
[void](Import-LawDeskEnv -Path $EnvFile)

$appUri = [uri]$env:APP_BASE_URL
if ($appUri.Scheme -ne "https") {
    throw "APP_BASE_URL must use HTTPS"
}

if ($appUri.AbsolutePath -ne "/" -or $appUri.Query -or $appUri.Fragment) {
    throw "APP_BASE_URL must be an HTTPS origin without a path, query or fragment"
}

if (-not $appUri.IsDefaultPort) {
    throw "Native IIS deployment requires the standard HTTPS port 443"
}

$hostName = $appUri.DnsSafeHost
$thumbprint = $CertificateThumbprint.Replace(" ", "").ToUpperInvariant()
$certificatePath = "Cert:\LocalMachine\My\$thumbprint"

if (-not (Test-Path -LiteralPath $certificatePath -PathType Leaf)) {
    throw "TLS certificate was not found in LocalMachine\\My: $thumbprint"
}

$certificate = Get-Item -LiteralPath $certificatePath
if (-not $certificate.HasPrivateKey) {
    throw "TLS certificate does not contain a private key"
}

if ($certificate.NotAfter -le (Get-Date).AddDays(7)) {
    throw "TLS certificate is expired or expires within seven days"
}

$frontendDirectory = Join-Path $AppRoot "frontend\dist"
$webConfigSource = Join-Path $PSScriptRoot "web.config"
$webConfigTarget = Join-Path $frontendDirectory "web.config"

if (-not (Test-Path -LiteralPath $frontendDirectory -PathType Container)) {
    throw "Frontend build is missing: $frontendDirectory"
}

Copy-Item -LiteralPath $webConfigSource -Destination $webConfigTarget -Force

Import-Module WebAdministration -ErrorAction Stop
$appPoolPath = "IIS:\AppPools\$SiteName"
$sitePath = "IIS:\Sites\$SiteName"

if (-not (Test-Path $appPoolPath)) {
    New-WebAppPool -Name $SiteName | Out-Null
}

Set-ItemProperty $appPoolPath -Name managedRuntimeVersion -Value ""
Set-ItemProperty $appPoolPath -Name startMode -Value "AlwaysRunning"
Set-ItemProperty $appPoolPath -Name processModel.identityType -Value "ApplicationPoolIdentity"

if (-not (Test-Path $sitePath)) {
    New-Website `
        -Name $SiteName `
        -PhysicalPath $frontendDirectory `
        -ApplicationPool $SiteName `
        -Port 80 `
        -HostHeader $hostName | Out-Null
}
else {
    Set-ItemProperty $sitePath -Name physicalPath -Value $frontendDirectory
    Set-ItemProperty $sitePath -Name applicationPool -Value $SiteName
}

$httpBinding = Get-WebBinding -Name $SiteName -Protocol "http" |
    Where-Object { $_.bindingInformation -eq "*:80:$hostName" }
if (-not $httpBinding) {
    New-WebBinding `
        -Name $SiteName `
        -Protocol "http" `
        -Port 80 `
        -HostHeader $hostName | Out-Null
}

$httpsBinding = Get-WebBinding -Name $SiteName -Protocol "https" |
    Where-Object { $_.bindingInformation -eq "*:443:$hostName" }
if (-not $httpsBinding) {
    New-WebBinding `
        -Name $SiteName `
        -Protocol "https" `
        -Port 443 `
        -HostHeader $hostName `
        -SslFlags 1 | Out-Null
}

$httpsBinding = Get-WebBinding -Name $SiteName -Protocol "https" |
    Where-Object { $_.bindingInformation -eq "*:443:$hostName" }
$httpsBinding.AddSslCertificate($thumbprint, "My")

$inetsrv = Join-Path $env:windir "System32\inetsrv"
$appCmd = Join-Path $inetsrv "appcmd.exe"

Invoke-LawDeskCommand `
    -FilePath $appCmd `
    -ArgumentList @(
        "set", "config",
        "/section:system.webServer/proxy",
        "/enabled:True",
        "/preserveHostHeader:True",
        "/reverseRewriteHostInResponseHeaders:False",
        "/commit:apphost"
    ) `
    -FailureMessage "IIS ARR proxy could not be enabled"

$allowedVariables = (& $appCmd list config $SiteName "/section:system.webServer/rewrite/allowedServerVariables") -join "`n"
if ($LASTEXITCODE -ne 0) {
    throw "IIS allowed server variables could not be read"
}

foreach ($variableName in @("HTTP_X_FORWARDED_PROTO", "HTTP_X_FORWARDED_FOR")) {
    if ($allowedVariables -notmatch [regex]::Escape($variableName)) {
        Invoke-LawDeskCommand `
            -FilePath $appCmd `
            -ArgumentList @(
                "set", "config", $SiteName,
                "/section:system.webServer/rewrite/allowedServerVariables",
                "/+[name='$variableName']",
                "/commit:apphost"
            ) `
            -FailureMessage "IIS server variable $variableName could not be allowed"
    }
}

Set-WebConfigurationProperty `
    -PSPath "IIS:\" `
    -Location $SiteName `
    -Filter "system.webServer/security/authentication/anonymousAuthentication" `
    -Name "enabled" `
    -Value $true

$iisAppPoolAccount = "IIS AppPool\$SiteName"
& icacls.exe $frontendDirectory "/grant" "${iisAppPoolAccount}:(OI)(CI)(RX)" "/T" "/C" | Out-Null
if ($LASTEXITCODE -gt 1) {
    throw "IIS application pool read permission could not be granted"
}

Start-WebAppPool -Name $SiteName -ErrorAction SilentlyContinue
Start-Website -Name $SiteName -ErrorAction SilentlyContinue

Write-Host "IIS site $SiteName is configured for https://$hostName/."
