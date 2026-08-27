[CmdletBinding()]
param(
    [string]$AppRoot,
    [string]$EnvFile = "$env:ProgramData\LawDesk\config\lawdesk.env",
    [switch]$PackageOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

if ([string]::IsNullOrWhiteSpace($AppRoot)) {
    $AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
}

. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

$requiredFiles = @(
    "backend\package.json",
    "backend\package-lock.json",
    "backend\scripts\startProduction.js",
    "database\GYS_Database_Schema_Simple.sql",
    "frontend\package.json",
    "frontend\package-lock.json",
    "deploy\windows\web.config"
)

foreach ($relativePath in $requiredFiles) {
    $candidate = Join-Path $AppRoot $relativePath
    if (-not (Test-Path -LiteralPath $candidate -PathType Leaf)) {
        throw "Required application file is missing: $candidate"
    }
}

$unsafeRepositoryEnvironmentFiles = @(
    ".env",
    "backend\.env",
    "frontend\.env",
    "deploy\production.env",
    "deploy\windows\lawdesk.env"
)

foreach ($relativePath in $unsafeRepositoryEnvironmentFiles) {
    $candidate = Join-Path $AppRoot $relativePath
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
        throw "Move the real environment file outside the repository before installation: $candidate"
    }
}

$nodeCommand = Get-Command "node.exe" -ErrorAction SilentlyContinue
$npmCommand = Get-Command "npm.cmd" -ErrorAction SilentlyContinue

if (-not $nodeCommand -or -not $npmCommand) {
    throw "Node.js 24 LTS and npm must be installed and available in PATH"
}

$nodeVersionText = (& $nodeCommand.Source --version).Trim().TrimStart("v")
$nodeVersion = [version]$nodeVersionText
$minimumNodeVersion = [version]"24.11.0"
if ($nodeVersion.Major -ne 24 -or $nodeVersion -lt $minimumNodeVersion) {
    throw "Node.js 24 LTS version 24.11.0 or newer is required; detected $nodeVersionText"
}

$nodeArchitecture = (& $nodeCommand.Source -p "process.arch").Trim()
if (-not [Environment]::Is64BitOperatingSystem -or $nodeArchitecture -notin @("x64", "arm64")) {
    throw "A 64-bit Windows installation and 64-bit Node.js are required; detected $nodeArchitecture"
}

if ($PackageOnly) {
    Write-Host "Windows package prerequisites are valid (Node $nodeVersionText)."
    return
}

Assert-LawDeskAdministrator

if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    throw "Environment file is missing: $EnvFile"
}

[void](Import-LawDeskEnv -Path $EnvFile)

$operatingSystem = Get-CimInstance -ClassName Win32_OperatingSystem
if ($operatingSystem.Caption -match "Home") {
    throw "Windows Home is not supported for the native production package"
}

if ($operatingSystem.Caption -match "Windows 10") {
    if ($env:WINDOWS_10_SUPPORT_VERIFIED -ne "true") {
        throw "Windows 10 is out of standard support; institution IT must verify active ESU or a supported LTSC lifecycle and set WINDOWS_10_SUPPORT_VERIFIED=true, or use Windows 11"
    }
}
elseif ($operatingSystem.Caption -notmatch "Windows 11|Windows Server") {
    throw "Unsupported Windows edition: $($operatingSystem.Caption)"
}

if ($env:NODE_ENV -ne "production") {
    throw "NODE_ENV must be production"
}

if ($env:BACKEND_BIND_ADDRESS -ne "127.0.0.1") {
    throw "Native Windows requires BACKEND_BIND_ADDRESS=127.0.0.1"
}

if ($env:TRUST_PROXY_HOPS -ne "1") {
    throw "Native IIS deployment requires TRUST_PROXY_HOPS=1"
}

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

$iisFeature = Get-WindowsOptionalFeature -Online -FeatureName IIS-WebServerRole
if ($iisFeature.State -ne "Enabled") {
    throw "IIS Web Server is not enabled"
}

$staticContentFeature = Get-WindowsOptionalFeature -Online -FeatureName IIS-StaticContent
if ($staticContentFeature.State -ne "Enabled") {
    throw "IIS Static Content is not enabled"
}

$inetsrv = Join-Path $env:windir "System32\inetsrv"
$appCmd = Join-Path $inetsrv "appcmd.exe"
$rewriteDll = Join-Path $inetsrv "rewrite.dll"
$arrDll = Join-Path $inetsrv "requestRouter.dll"

foreach ($requiredIisFile in @($appCmd, $rewriteDll, $arrDll)) {
    if (-not (Test-Path -LiteralPath $requiredIisFile -PathType Leaf)) {
        throw "Required IIS URL Rewrite/ARR file is missing: $requiredIisFile"
    }
}

[void](Resolve-LawDeskPostgresTool -Name "psql.exe")
[void](Resolve-LawDeskPostgresTool -Name "pg_dump.exe")
[void](Resolve-LawDeskPostgresTool -Name "pg_restore.exe")

Write-Host "Native Windows prerequisites are valid (Node $nodeVersionText, IIS, ARR, PostgreSQL tools)."
