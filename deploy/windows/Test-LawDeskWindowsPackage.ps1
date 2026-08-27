[CmdletBinding()]
param(
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

& (Join-Path $PSScriptRoot "Test-LawDeskPrerequisites.ps1") `
    -AppRoot $AppRoot `
    -PackageOnly

$requiredScripts = @(
    "Backup-LawDesk.ps1",
    "Configure-LawDeskIis.ps1",
    "Initialize-LawDeskDatabase.ps1",
    "Install-LawDesk.ps1",
    "LawDesk.Windows.Common.ps1",
    "Restore-LawDesk.ps1",
    "Start-LawDeskBackend.ps1",
    "Test-LawDeskHealth.ps1",
    "Test-LawDeskPrerequisites.ps1",
    "Test-LawDeskWindowsPackage.ps1"
)

foreach ($scriptName in $requiredScripts) {
    $scriptPath = Join-Path $PSScriptRoot $scriptName
    if (-not (Test-Path -LiteralPath $scriptPath -PathType Leaf)) {
        throw "Required Windows deployment script is missing: $scriptName"
    }

    $tokens = $null
    $parseErrors = $null
    [void][System.Management.Automation.Language.Parser]::ParseFile(
        $scriptPath,
        [ref]$tokens,
        [ref]$parseErrors
    )

    if ($parseErrors.Count -gt 0) {
        $messages = ($parseErrors | ForEach-Object { $_.Message }) -join "; "
        throw "PowerShell parse error in ${scriptName}: $messages"
    }
}

$webConfigPath = Join-Path $PSScriptRoot "web.config"
[xml]$webConfig = Get-Content -LiteralPath $webConfigPath -Raw
$rules = @($webConfig.configuration."system.webServer".rewrite.rules.rule)

foreach ($requiredRule in @(
    "Redirect HTTP to HTTPS",
    "LawDesk liveness proxy",
    "LawDesk API reverse proxy",
    "LawDesk single page application"
)) {
    if (-not ($rules | Where-Object { $_.name -eq $requiredRule })) {
        throw "Required IIS rewrite rule is missing: $requiredRule"
    }
}

$webConfigText = Get-Content -LiteralPath $webConfigPath -Raw
if ($webConfigText -notmatch "127\.0\.0\.1:3001/api/") {
    throw "IIS API reverse proxy must target loopback port 3001"
}

if ($webConfigText -notmatch 'maxAllowedContentLength="27262976"') {
    throw "IIS request limit must allow the documented 25 MB attachment limit"
}

$templatePath = Join-Path $PSScriptRoot "lawdesk.env.example"
$environment = Read-LawDeskEnvFile -Path $templatePath
$requiredEnvironmentNames = @(
    "NODE_ENV",
    "WINDOWS_10_SUPPORT_VERIFIED",
    "BACKEND_BIND_ADDRESS",
    "APP_BASE_URL",
    "TRUST_PROXY_HOPS",
    "DATABASE_URL",
    "DB_HOST",
    "DB_NAME",
    "DB_USER",
    "DB_PASSWORD",
    "DB_SSL_MODE",
    "ATTACHMENT_STORAGE_DIR",
    "AUTH_TOKEN_SECRET",
    "SMTP_HOST",
    "SMTP_PASSWORD"
)

foreach ($name in $requiredEnvironmentNames) {
    if (-not $environment.ContainsKey($name)) {
        throw "Windows environment template is missing $name"
    }
}

if ($environment["BACKEND_BIND_ADDRESS"] -ne "127.0.0.1") {
    throw "Windows backend must bind only to 127.0.0.1"
}

if ($environment["TRUST_PROXY_HOPS"] -ne "1") {
    throw "Windows IIS topology requires TRUST_PROXY_HOPS=1"
}

if ($environment["DATABASE_URL"] -ne "") {
    throw "Windows environment template must keep DATABASE_URL empty and use DB_* settings"
}

$overrides = @{
    APP_BASE_URL = "https://lawdesk.windows-ci.invalid"
    AUTH_TOKEN_SECRET = "windows-ci-auth-secret-windows-ci-auth-secret-windows-ci-auth-secret-1234"
    DB_HOST = "127.0.0.1"
    DB_NAME = "gys_lawdesk_windows_ci"
    DB_USER = "lawdesk_windows_ci"
    DB_PASSWORD = "windows-ci-database-password"
    SMTP_HOST = "smtp.windows-ci.invalid"
    SMTP_USER = "lawdesk@windows-ci.invalid"
    SMTP_PASSWORD = "windows-ci-smtp-password"
    SMTP_FROM = "LawDesk Windows CI <lawdesk@windows-ci.invalid>"
    INITIAL_ADMIN_NAME = "Windows CI Admin"
    INITIAL_ADMIN_EMAIL = "admin@windows-ci.invalid"
    INITIAL_ADMIN_EMAIL_VERIFIED = "true"
    INITIAL_ADMIN_PASSWORD = "WindowsCiAdminPassword123!"
}

foreach ($entry in $environment.GetEnumerator()) {
    $value = if ($overrides.ContainsKey($entry.Key)) {
        $overrides[$entry.Key]
    }
    else {
        $entry.Value
    }
    [Environment]::SetEnvironmentVariable($entry.Key, $value, "Process")
}

$node = (Get-Command "node.exe" -ErrorAction Stop).Source
$backendDirectory = Join-Path $AppRoot "backend"
Push-Location $backendDirectory
try {
    Invoke-LawDeskCommand `
        -FilePath $node `
        -ArgumentList @("scripts\checkProductionConfig.js") `
        -FailureMessage "Windows production configuration validation failed"
}
finally {
    Pop-Location
}

$git = (Get-Command "git.exe" -ErrorAction Stop).Source
& $git -C $AppRoot check-ignore --quiet "deploy/windows/lawdesk.env"
if ($LASTEXITCODE -ne 0) {
    throw "deploy/windows/lawdesk.env must be ignored by Git"
}

Write-Host "Native Windows deployment package validation passed."
