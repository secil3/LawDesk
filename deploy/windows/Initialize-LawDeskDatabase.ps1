[CmdletBinding()]
param(
    [string]$AppRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path,
    [string]$EnvFile = "$env:ProgramData\LawDesk\config\lawdesk.env"
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

[void](Import-LawDeskEnv -Path $EnvFile)
$psql = Resolve-LawDeskPostgresTool -Name "psql.exe"
$connectionArguments = Get-LawDeskPostgresArguments
$schemaPath = Join-Path $AppRoot "database\GYS_Database_Schema_Simple.sql"
$backendDirectory = Join-Path $AppRoot "backend"
$node = (Get-Command "node.exe" -ErrorAction Stop).Source

Set-LawDeskPostgresProcessEnvironment
try {
    $probeArguments = $connectionArguments + @(
        "--tuples-only",
        "--no-align",
        "--command",
        "SELECT CASE WHEN to_regclass('public.kullanicilar') IS NOT NULL THEN 'present' WHEN (SELECT COUNT(*) FROM pg_tables WHERE schemaname = 'public') = 0 THEN 'empty' ELSE 'occupied' END;"
    )
    $schemaState = ((& $psql @probeArguments) -join "").Trim()
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL schema probe failed"
    }

    if ($schemaState -eq "empty") {
        $schemaArguments = $connectionArguments + @(
            "--set", "ON_ERROR_STOP=1",
            "--file", $schemaPath
        )
        Invoke-LawDeskCommand `
            -FilePath $psql `
            -ArgumentList $schemaArguments `
            -FailureMessage "Initial database schema could not be applied"
        Write-Host "Initial database schema was applied."
    }
    elseif ($schemaState -ne "present") {
        if ($schemaState -eq "occupied") {
            throw "The target database contains non-LawDesk tables; use a separate empty database"
        }

        throw "Unexpected PostgreSQL schema probe response: $schemaState"
    }

    Push-Location $backendDirectory
    try {
        Invoke-LawDeskCommand `
            -FilePath $node `
            -ArgumentList @("scripts\migrate.js") `
            -FailureMessage "Database migrations failed"
    }
    finally {
        Pop-Location
    }
}
finally {
    Clear-LawDeskPostgresProcessEnvironment
}

Write-Host "Database schema and migrations are ready."
