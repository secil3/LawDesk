[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$BackupDirectory,

    [Parameter(Mandatory = $true)]
    [string]$ExpectedDatabaseName,

    [Parameter(Mandatory = $true)]
    [switch]$ConfirmRestore,

    [string]$EnvFile = "$env:ProgramData\LawDesk\config\lawdesk.env",
    [string]$TaskName = "LawDesk-Backend"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

Assert-LawDeskAdministrator

if (-not $ConfirmRestore) {
    throw "ConfirmRestore is required because restore replaces the target database and attachments"
}

[void](Import-LawDeskEnv -Path $EnvFile)

if ($env:DB_NAME -ne $ExpectedDatabaseName) {
    throw "ExpectedDatabaseName does not match DB_NAME; refusing restore"
}

$resolvedBackup = (Resolve-Path -LiteralPath $BackupDirectory -ErrorAction Stop).Path
$manifestPath = Join-Path $resolvedBackup "manifest.json"
$manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json

if ($manifest.formatVersion -ne 1) {
    throw "Unsupported backup manifest version"
}

if ($manifest.databaseName -ne $ExpectedDatabaseName) {
    throw "Backup database name does not match the expected target"
}

$databaseDump = Join-Path $resolvedBackup $manifest.databaseDump
$databaseHash = (Get-FileHash -LiteralPath $databaseDump -Algorithm SHA256).Hash
if ($databaseHash -ne $manifest.databaseSha256) {
    throw "Database backup checksum does not match the manifest"
}

$attachmentBackup = Join-Path $resolvedBackup $manifest.attachmentsDirectory
$attachmentParent = Split-Path -Parent $env:ATTACHMENT_STORAGE_DIR
$stagingDirectory = Join-Path $attachmentParent ("attachments.restore-staging-" + [guid]::NewGuid().ToString("N"))
New-Item -ItemType Directory -Path $stagingDirectory -Force | Out-Null

& robocopy.exe $attachmentBackup $stagingDirectory `
    "/E" "/COPY:DAT" "/DCOPY:DAT" "/R:2" "/W:2" "/XJ" `
    "/NFL" "/NDL" "/NJH" "/NJS" "/NP" | Out-Null
$robocopyExitCode = $LASTEXITCODE
if ($robocopyExitCode -gt 7) {
    throw "Attachment restore staging failed (robocopy exit code $robocopyExitCode)"
}

foreach ($entry in @($manifest.attachments)) {
    $stagedFile = Join-Path $stagingDirectory $entry.path
    if (-not (Test-Path -LiteralPath $stagedFile -PathType Leaf)) {
        throw "Attachment listed in the manifest is missing: $($entry.path)"
    }

    $stagedHash = (Get-FileHash -LiteralPath $stagedFile -Algorithm SHA256).Hash
    if ($stagedHash -ne $entry.sha256) {
        throw "Attachment checksum mismatch: $($entry.path)"
    }
}

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$wasRunning = $task.State -eq "Running"
if ($wasRunning) {
    Stop-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 3
}

$rollbackDirectory = "$($env:ATTACHMENT_STORAGE_DIR).before-restore-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$restoreCompleted = $false

try {
    $pgRestore = Resolve-LawDeskPostgresTool -Name "pg_restore.exe"
    $connectionArguments = Get-LawDeskPostgresArguments
    Set-LawDeskPostgresProcessEnvironment

    try {
        $restoreArguments = $connectionArguments + @(
            "--clean",
            "--if-exists",
            "--no-owner",
            "--no-privileges",
            "--exit-on-error",
            "--single-transaction",
            $databaseDump
        )
        Invoke-LawDeskCommand `
            -FilePath $pgRestore `
            -ArgumentList $restoreArguments `
            -FailureMessage "PostgreSQL restore failed"
    }
    finally {
        Clear-LawDeskPostgresProcessEnvironment
    }

    if (Test-Path -LiteralPath $env:ATTACHMENT_STORAGE_DIR -PathType Container) {
        Move-Item -LiteralPath $env:ATTACHMENT_STORAGE_DIR -Destination $rollbackDirectory
    }
    Move-Item -LiteralPath $stagingDirectory -Destination $env:ATTACHMENT_STORAGE_DIR

    $administrators = "*S-1-5-32-544"
    $system = "*S-1-5-18"
    $localService = "*S-1-5-19"
    & icacls.exe $env:ATTACHMENT_STORAGE_DIR "/inheritance:r" "/grant:r" `
        "${administrators}:(OI)(CI)(F)" `
        "${system}:(OI)(CI)(F)" `
        "${localService}:(OI)(CI)(M)" "/T" "/C" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Restored attachment permissions could not be secured"
    }

    $restoreCompleted = $true
}
finally {
    if ($wasRunning) {
        Start-ScheduledTask -TaskName $TaskName
    }
}

if (-not $restoreCompleted) {
    throw "Restore did not complete; inspect the database and staging directory before retrying"
}

Write-Host "LawDesk restore completed."
if (Test-Path -LiteralPath $rollbackDirectory -PathType Container) {
    Write-Host "Previous attachments were preserved at: $rollbackDirectory"
}
Write-Host "Run Test-LawDeskHealth.ps1 and verify a sample attachment before removing the preserved directory."
