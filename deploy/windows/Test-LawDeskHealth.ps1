[CmdletBinding()]
param(
    [string]$EnvFile = "$env:ProgramData\LawDesk\config\lawdesk.env",
    [string]$PublicBaseUrl,
    [switch]$BackendOnly
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest
. (Join-Path $PSScriptRoot "LawDesk.Windows.Common.ps1")

[void](Import-LawDeskEnv -Path $EnvFile)

function Invoke-HealthRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Uri
    )

    $response = Invoke-WebRequest `
        -Uri $Uri `
        -Method Get `
        -TimeoutSec 15 `
        -UseBasicParsing

    if ($response.StatusCode -ne 200) {
        throw "Health request returned HTTP $($response.StatusCode): $Uri"
    }

    return $response
}

$backendBase = "http://127.0.0.1:$($env:PORT)"
[void](Invoke-HealthRequest -Uri "$backendBase/api/health")
[void](Invoke-HealthRequest -Uri "$backendBase/api/ready")
Write-Host "Backend liveness and readiness checks passed."

if (-not $BackendOnly) {
    $configuredPublicBase = if ([string]::IsNullOrWhiteSpace($PublicBaseUrl)) {
        $env:APP_BASE_URL
    }
    else {
        $PublicBaseUrl
    }
    $publicBase = $configuredPublicBase.TrimEnd("/")
    $publicHealth = Invoke-HealthRequest -Uri "$publicBase/healthz"
    [void](Invoke-HealthRequest -Uri "$publicBase/api/health")
    [void](Invoke-HealthRequest -Uri "$publicBase/api/ready")

    $requiredHeaders = @(
        "Content-Security-Policy",
        "Strict-Transport-Security",
        "X-Content-Type-Options",
        "X-Frame-Options"
    )

    foreach ($header in $requiredHeaders) {
        if ([string]::IsNullOrWhiteSpace([string]$publicHealth.Headers[$header])) {
            throw "Required IIS security header is missing: $header"
        }
    }

    Write-Host "Public HTTPS, reverse proxy and security header checks passed."
}
