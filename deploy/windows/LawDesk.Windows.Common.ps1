Set-StrictMode -Version Latest

function Read-LawDeskEnvFile {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path
    )

    $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    $values = [System.Collections.Generic.Dictionary[string, string]]::new(
        [System.StringComparer]::OrdinalIgnoreCase
    )
    $lineNumber = 0

    foreach ($rawLine in [System.IO.File]::ReadAllLines($resolvedPath)) {
        $lineNumber += 1
        $line = $rawLine.Trim()

        if ($line.Length -eq 0 -or $line.StartsWith("#")) {
            continue
        }

        $separator = $line.IndexOf("=")
        if ($separator -lt 1) {
            throw "Invalid environment entry at line $lineNumber in $resolvedPath"
        }

        $name = $line.Substring(0, $separator).Trim()
        $value = $line.Substring($separator + 1).Trim()

        if ($name -cnotmatch "^[A-Z][A-Z0-9_]*$") {
            throw "Invalid environment variable name at line $lineNumber in $resolvedPath"
        }

        if ($values.ContainsKey($name)) {
            throw "Duplicate environment variable $name in $resolvedPath"
        }

        $values.Add($name, $value)
    }

    return $values
}

function Import-LawDeskEnv {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$Path
    )

    $values = Read-LawDeskEnvFile -Path $Path

    foreach ($entry in $values.GetEnumerator()) {
        [Environment]::SetEnvironmentVariable(
            $entry.Key,
            $entry.Value,
            [EnvironmentVariableTarget]::Process
        )
    }

    return $values.Count
}

function Remove-LawDeskEnvEntry {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter(Mandatory = $true)]
        [ValidatePattern("^[A-Z][A-Z0-9_]*$")]
        [string]$Name
    )

    $resolvedPath = (Resolve-Path -LiteralPath $Path -ErrorAction Stop).Path
    $pattern = "^\s*" + [regex]::Escape($Name) + "="
    $lines = [System.IO.File]::ReadAllLines($resolvedPath)
    $filtered = @($lines | Where-Object { $_ -notmatch $pattern })
    $encoding = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllLines($resolvedPath, $filtered, $encoding)
    [Environment]::SetEnvironmentVariable(
        $Name,
        $null,
        [EnvironmentVariableTarget]::Process
    )
}

function Assert-LawDeskAdministrator {
    [CmdletBinding()]
    param()

    $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
    $principal = [Security.Principal.WindowsPrincipal]::new($identity)
    $administrator = [Security.Principal.WindowsBuiltInRole]::Administrator

    if (-not $principal.IsInRole($administrator)) {
        throw "This command must be run from an Administrator PowerShell window"
    }
}

function Invoke-LawDeskCommand {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FilePath,

        [string[]]$ArgumentList = @(),

        [Parameter(Mandatory = $true)]
        [ValidateNotNullOrEmpty()]
        [string]$FailureMessage
    )

    & $FilePath @ArgumentList
    $exitCode = $LASTEXITCODE

    if ($exitCode -ne 0) {
        throw "$FailureMessage (exit code $exitCode)"
    }
}

function Resolve-LawDeskPostgresTool {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("psql.exe", "pg_dump.exe", "pg_restore.exe")]
        [string]$Name
    )

    if ($env:POSTGRES_BIN) {
        $configured = Join-Path $env:POSTGRES_BIN $Name
        if (Test-Path -LiteralPath $configured -PathType Leaf) {
            return (Resolve-Path -LiteralPath $configured).Path
        }
    }

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($command) {
        return $command.Source
    }

    $programFilesRoots = @(
        $env:ProgramFiles,
        ${env:ProgramFiles(x86)}
    ) | Where-Object { $_ }

    foreach ($root in $programFilesRoots) {
        $postgresRoot = Join-Path $root "PostgreSQL"
        if (-not (Test-Path -LiteralPath $postgresRoot -PathType Container)) {
            continue
        }

        $versions = Get-ChildItem -LiteralPath $postgresRoot -Directory |
            Sort-Object Name -Descending

        foreach ($version in $versions) {
            $candidate = Join-Path $version.FullName "bin\$Name"
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                return $candidate
            }
        }
    }

    throw "$Name was not found. Set POSTGRES_BIN to the PostgreSQL bin directory"
}

function Get-LawDeskPostgresArguments {
    [CmdletBinding()]
    param()

    $required = @("DB_HOST", "DB_PORT", "DB_NAME", "DB_USER", "DB_PASSWORD")
    foreach ($name in $required) {
        $value = [Environment]::GetEnvironmentVariable($name, "Process")
        if ([string]::IsNullOrWhiteSpace($value)) {
            throw "$name is required for native Windows PostgreSQL commands"
        }
    }

    return @(
        "--no-password",
        "--host", $env:DB_HOST,
        "--port", $env:DB_PORT,
        "--username", $env:DB_USER,
        "--dbname", $env:DB_NAME
    )
}

function Set-LawDeskPostgresProcessEnvironment {
    [CmdletBinding()]
    param()

    $env:PGPASSWORD = $env:DB_PASSWORD
    $mode = [string]$env:DB_SSL_MODE

    switch ($mode.ToLowerInvariant()) {
        "disable" { $env:PGSSLMODE = "disable" }
        "require" { $env:PGSSLMODE = "require" }
        "verify-full" {
            $env:PGSSLMODE = "verify-full"
            if ($env:DB_SSL_CA_PATH) {
                $env:PGSSLROOTCERT = $env:DB_SSL_CA_PATH
            }
        }
        default { throw "DB_SSL_MODE must be disable, require or verify-full" }
    }
}

function Clear-LawDeskPostgresProcessEnvironment {
    [CmdletBinding()]
    param()

    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:PGSSLMODE -ErrorAction SilentlyContinue
    Remove-Item Env:PGSSLROOTCERT -ErrorAction SilentlyContinue
}
