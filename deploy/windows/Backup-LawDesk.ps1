[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Destination,

    [string]$EnvFile = "$env:ProgramData\LawDesk\config\lawdesk.env",
    [string]$TaskName = "LawDesk-Backend"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

Assert-LawDeskAdministrator
[void](Import-LawDeskEnv -Path $EnvFile)

$task = Get-ScheduledTask -TaskName $TaskName -ErrorAction Stop
$wasRunning = $task.State -eq "Running"
$timestamp = (Get-Date).ToUniversalTime().ToString("yyyyMMdd-HHmmss")
$backupDirectory = Join-Path $Destination "lawdesk-$timestamp-utc"
$attachmentBackup = Join-Path $backupDirectory "attachments"
$databaseDump = Join-Path $backupDirectory "database.dump"
$manifestPath = Join-Path $backupDirectory "manifest.json"

New-Item -ItemType Directory -Path $attachmentBackup -Force | Out-Null

if ($wasRunning) {
    Stop-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 3
}

try {
    $pgDump = Resolve-LawDeskPostgresTool -Name "pg_dump.exe"
    $connectionArguments = Get-LawDeskPostgresArguments
    Set-LawDeskPostgresProcessEnvironment

    try {
        $dumpArguments = $connectionArguments + @(
            "--format=custom",
            "--compress=6",
            "--file", $databaseDump
        )
        Invoke-LawDeskCommand `
            -FilePath $pgDump `
            -ArgumentList $dumpArguments `
            -FailureMessage "PostgreSQL backup failed"
    }
    finally {
        Clear-LawDeskPostgresProcessEnvironment
    }

    $attachmentSource = $env:ATTACHMENT_STORAGE_DIR
    if (-not (Test-Path -LiteralPath $attachmentSource -PathType Container)) {
        throw "Attachment directory is missing: $attachmentSource"
    }

    & robocopy.exe $attachmentSource $attachmentBackup `
        "/E" "/COPY:DAT" "/DCOPY:DAT" "/R:2" "/W:2" "/XJ" `
        "/NFL" "/NDL" "/NJH" "/NJS" "/NP" | Out-Null
    $robocopyExitCode = $LASTEXITCODE
    if ($robocopyExitCode -gt 7) {
        throw "Attachment backup failed (robocopy exit code $robocopyExitCode)"
    }

    $attachmentManifest = @(
        Get-ChildItem -LiteralPath $attachmentBackup -File -Recurse |
            Sort-Object FullName |
            ForEach-Object {
                [ordered]@{
                    path = $_.FullName.Substring($attachmentBackup.Length).TrimStart("\")
                    length = $_.Length
                    sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
                }
            }
    )

    $manifest = [ordered]@{
        formatVersion = 1
        createdAtUtc = (Get-Date).ToUniversalTime().ToString("o")
        databaseName = $env:DB_NAME
        databaseDump = "database.dump"
        databaseSha256 = (Get-FileHash -LiteralPath $databaseDump -Algorithm SHA256).Hash
        attachmentsDirectory = "attachments"
        attachments = $attachmentManifest
    }
    $json = $manifest | ConvertTo-Json -Depth 6
    [System.IO.File]::WriteAllText(
        $manifestPath,
        $json,
        [System.Text.UTF8Encoding]::new($false)
    )
}
finally {
    if ($wasRunning) {
        Start-ScheduledTask -TaskName $TaskName
    }
}

Write-Host "LawDesk backup completed: $backupDirectory"
Write-Host "Move/copy this backup to institution-managed off-machine storage."
