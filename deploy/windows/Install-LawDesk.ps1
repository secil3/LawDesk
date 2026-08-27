[CmdletBinding()]
param(
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$DataRoot = "$env:ProgramData\LawDesk",
    [string]$EnvFile,
    [string]$SiteName = "LawDesk",
    [string]$TaskName = "LawDesk-Backend",
    [string]$CertificateThumbprint,
    [switch]$CreateInitialAdmin,
    [switch]$SkipDatabaseInitialization,
    [switch]$SkipIis
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

Assert-LawDeskAdministrator
$AppRoot = (Resolve-Path -LiteralPath $AppRoot -ErrorAction Stop).Path

if ([string]::IsNullOrWhiteSpace($EnvFile)) {
    $EnvFile = Join-Path $DataRoot "config\lawdesk.env"
}

$configDirectory = Split-Path -Parent $EnvFile
$logDirectory = Join-Path $DataRoot "logs"
$defaultAttachmentDirectory = Join-Path $DataRoot "attachments"

foreach ($directory in @($DataRoot, $configDirectory, $logDirectory, $defaultAttachmentDirectory)) {
    New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$environmentTemplate = Join-Path $PSScriptRoot "lawdesk.env.example"
if (-not (Test-Path -LiteralPath $EnvFile -PathType Leaf)) {
    Copy-Item -LiteralPath $environmentTemplate -Destination $EnvFile
}

$administrators = "*S-1-5-32-544"
$system = "*S-1-5-18"
$localService = "*S-1-5-19"

& icacls.exe $DataRoot "/inheritance:r" "/grant:r" `
    "${administrators}:(OI)(CI)(F)" `
    "${system}:(OI)(CI)(F)" `
    "${localService}:(RX)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "LawDesk data root permissions could not be secured"
}

& icacls.exe $configDirectory "/grant:r" `
    "${administrators}:(OI)(CI)(F)" `
    "${system}:(OI)(CI)(F)" `
    "${localService}:(OI)(CI)(RX)" "/T" "/C" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "LawDesk configuration permissions could not be secured"
}

& icacls.exe $logDirectory "/grant:r" `
    "${administrators}:(OI)(CI)(F)" `
    "${system}:(OI)(CI)(F)" `
    "${localService}:(OI)(CI)(M)" "/T" "/C" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "LawDesk log permissions could not be secured"
}

$templateValues = Read-LawDeskEnvFile -Path $EnvFile
if (
    $templateValues.Values -match "DEGISTIRIN" -or
    $templateValues.Values -match "example\.gov\.tr"
) {
    throw "Edit $EnvFile, replace every example/DEGISTIRIN value, then run the installer again"
}

& (Join-Path $PSScriptRoot "Test-LawDeskPrerequisites.ps1") `
    -AppRoot $AppRoot `
    -EnvFile $EnvFile

[void](Import-LawDeskEnv -Path $EnvFile)

if ([string]::IsNullOrWhiteSpace($env:ATTACHMENT_STORAGE_DIR)) {
    throw "ATTACHMENT_STORAGE_DIR is required"
}

if (-not [string]::IsNullOrWhiteSpace($env:DB_SSL_CA_PATH)) {
    $databaseCaPath = (Resolve-Path -LiteralPath $env:DB_SSL_CA_PATH -ErrorAction Stop).Path
    & icacls.exe $databaseCaPath "/grant:r" "${localService}:(R)" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL CA certificate read permission could not be granted to Local Service"
    }
}

$attachmentDirectory = $env:ATTACHMENT_STORAGE_DIR
New-Item -ItemType Directory -Path $attachmentDirectory -Force | Out-Null
& icacls.exe $attachmentDirectory "/inheritance:r" "/grant:r" `
    "${administrators}:(OI)(CI)(F)" `
    "${system}:(OI)(CI)(F)" `
    "${localService}:(OI)(CI)(M)" "/T" "/C" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Attachment directory permissions could not be secured"
}

& icacls.exe $AppRoot "/grant" "${localService}:(OI)(CI)(RX)" "/T" "/C" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Backend read permission could not be granted to Local Service"
}

$existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
if ($existingTask) {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 3
}

$npm = (Get-Command "npm.cmd" -ErrorAction Stop).Source
$node = (Get-Command "node.exe" -ErrorAction Stop).Source
$backendDirectory = Join-Path $AppRoot "backend"
$frontendDirectory = Join-Path $AppRoot "frontend"

Push-Location $backendDirectory
try {
    Invoke-LawDeskCommand `
        -FilePath $npm `
        -ArgumentList @("ci", "--omit=dev", "--ignore-scripts=false") `
        -FailureMessage "Backend dependencies could not be installed"

    Invoke-LawDeskCommand `
        -FilePath $node `
        -ArgumentList @("scripts\checkProductionConfig.js") `
        -FailureMessage "Production configuration is invalid"
}
finally {
    Pop-Location
}

Push-Location $frontendDirectory
try {
    Invoke-LawDeskCommand `
        -FilePath $npm `
        -ArgumentList @("ci") `
        -FailureMessage "Frontend dependencies could not be installed"
    Invoke-LawDeskCommand `
        -FilePath $npm `
        -ArgumentList @("run", "build") `
        -FailureMessage "Frontend production build failed"
}
finally {
    Pop-Location
}

if (-not $SkipDatabaseInitialization) {
    & (Join-Path $PSScriptRoot "Initialize-LawDeskDatabase.ps1") `
        -AppRoot $AppRoot `
        -EnvFile $EnvFile
}

if ($CreateInitialAdmin) {
    Push-Location $backendDirectory
    try {
        Invoke-LawDeskCommand `
            -FilePath $node `
            -ArgumentList @("scripts\createInitialAdmin.js") `
            -FailureMessage "Initial admin could not be created"
    }
    finally {
        Pop-Location
    }

    Remove-LawDeskEnvEntry -Path $EnvFile -Name "INITIAL_ADMIN_PASSWORD"
    Write-Host "INITIAL_ADMIN_PASSWORD was removed from the environment file."
}

if (-not $SkipIis) {
    if ([string]::IsNullOrWhiteSpace($CertificateThumbprint)) {
        throw "CertificateThumbprint is required unless SkipIis is used"
    }

    & (Join-Path $PSScriptRoot "Configure-LawDeskIis.ps1") `
        -AppRoot $AppRoot `
        -EnvFile $EnvFile `
        -SiteName $SiteName `
        -CertificateThumbprint $CertificateThumbprint
}

$startScript = Join-Path $PSScriptRoot "Start-LawDeskBackend.ps1"
$powershell = Join-Path $env:windir "System32\WindowsPowerShell\v1.0\powershell.exe"
$taskArguments = @(
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-ExecutionPolicy", "Bypass",
    "-File", ('"{0}"' -f $startScript),
    "-AppRoot", ('"{0}"' -f $AppRoot),
    "-EnvFile", ('"{0}"' -f $EnvFile),
    "-NodePath", ('"{0}"' -f $node),
    "-LogDirectory", ('"{0}"' -f $logDirectory)
) -join " "

$localServiceIdentity = [Security.Principal.SecurityIdentifier]::new("S-1-5-19").Translate(
    [Security.Principal.NTAccount]
).Value
$action = New-ScheduledTaskAction `
    -Execute $powershell `
    -Argument $taskArguments `
    -WorkingDirectory $backendDirectory
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal `
    -UserId $localServiceIdentity `
    -LogonType ServiceAccount `
    -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -RunOnlyIfNetworkAvailable `
    -RestartCount 999 `
    -RestartInterval (New-TimeSpan -Minutes 1) `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -MultipleInstances IgnoreNew `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries
$task = New-ScheduledTask `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "LawDesk Node.js backend; managed by deploy/windows/Install-LawDesk.ps1"

Register-ScheduledTask -TaskName $TaskName -InputObject $task -Force | Out-Null
Start-ScheduledTask -TaskName $TaskName

$healthScript = Join-Path $PSScriptRoot "Test-LawDeskHealth.ps1"
$deadline = (Get-Date).AddSeconds(120)
$lastHealthError = $null

do {
    Start-Sleep -Seconds 2
    try {
        & $healthScript -EnvFile $EnvFile -BackendOnly
        $lastHealthError = $null
        break
    }
    catch {
        $lastHealthError = $_
    }
} while ((Get-Date) -lt $deadline)

if ($lastHealthError) {
    throw "Backend did not become ready within 120 seconds: $($lastHealthError.Exception.Message)"
}

if (-not $SkipIis) {
    & $healthScript -EnvFile $EnvFile
}

Write-Host "LawDesk native Windows installation completed successfully."
