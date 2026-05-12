param(
    [int]$Port = 8000,
    [string]$TunnelName = "docflow-webhook"
)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent
$EnvLocalPath = Join-Path $RepoRoot ".env.local"
$FrontendEnvLocalPath = Join-Path $RepoRoot "frontend\.env.development.local"

function Get-EnvValueFromFile {
    param(
        [string]$Path,
        [string]$Name
    )

    if (-not (Test-Path $Path)) {
        return $null
    }

    foreach ($line in Get-Content $Path) {
        $trimmed = $line.Trim()
        if (-not $trimmed -or $trimmed.StartsWith("#")) {
            continue
        }

        $parts = $trimmed -split "=", 2
        if ($parts.Count -ne 2) {
            continue
        }

        if ($parts[0].Trim() -eq $Name) {
            return $parts[1].Trim()
        }
    }

    return $null
}

$Clo = Get-Command clo -ErrorAction SilentlyContinue
if (-not $Clo) {
    Write-Error "CloudPub CLI 'clo' not found. Install it first: winget install Cloudpub.Cloudpub"
    exit 1
}

$Token = $env:CLOUDPUB_TOKEN
if (-not $Token) {
    $Token = Get-EnvValueFromFile -Path $EnvLocalPath -Name "CLOUDPUB_TOKEN"
}

if (-not $Token) {
    Write-Error "CLOUDPUB_TOKEN not found. Put it into '$EnvLocalPath' or export it in the current shell."
    exit 1
}

try {
    $HealthResponse = Invoke-WebRequest -Uri "http://localhost:$Port/health" -UseBasicParsing -TimeoutSec 5
} catch {
    Write-Error "Backend is not reachable on http://localhost:$Port/health. Start backend before opening the tunnel."
    exit 1
}

if ($HealthResponse.StatusCode -ne 200) {
    Write-Error "Backend health check returned HTTP $($HealthResponse.StatusCode)."
    exit 1
}

Write-Host "==> Saving CloudPub token in CLI profile..."
& $Clo.Source set token $Token
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

Write-Host "==> Starting CloudPub tunnel..."
Write-Host "When CloudPub prints the public URL, update:"
Write-Host "  - $RepoRoot\.env -> APP_BASE_URL=https://<your-subdomain>.cloudpub.ru"
Write-Host "  - $FrontendEnvLocalPath -> VITE_TUNNEL_URL=https://<your-subdomain>.cloudpub.ru"
Write-Host "Then restart backend so project.webhook_url uses the public domain."
Write-Host ""

& $Clo.Source publish http $Port --name $TunnelName
