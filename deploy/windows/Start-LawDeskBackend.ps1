[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$AppRoot,

    [Parameter(Mandatory = $true)]
    [string]$EnvFile,

    [Parameter(Mandatory = $true)]
    [string]$NodePath,

    [string]$LogDirectory = "$env:ProgramData\LawDesk\logs"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

[void](Import-LawDeskEnv -Path $EnvFile)

$backendDirectory = Join-Path $AppRoot "backend"
$startupScript = Join-Path $backendDirectory "scripts\startProduction.js"

if (-not (Test-Path -LiteralPath $NodePath -PathType Leaf)) {
    throw "Node executable is missing: $NodePath"
}

if (-not (Test-Path -LiteralPath $startupScript -PathType Leaf)) {
    throw "Backend startup script is missing: $startupScript"
}

New-Item -ItemType Directory -Path $LogDirectory -Force | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$logPath = Join-Path $LogDirectory "lawdesk-backend-$timestamp.log"

Push-Location $backendDirectory
try {
    & $NodePath $startupScript 2>&1 |
        Tee-Object -FilePath $logPath -Append
    $exitCode = $LASTEXITCODE
}
finally {
    Pop-Location
}

exit $exitCode
