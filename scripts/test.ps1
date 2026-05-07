# Run backend tests: starts db_test, waits for Postgres, runs pytest.
# Usage: .\scripts\test.ps1 [pytest-args]
# Examples:
#   .\scripts\test.ps1
#   .\scripts\test.ps1 tests/test_auth.py -v
#   .\scripts\test.ps1 -x -k "test_login"
param([Parameter(ValueFromRemainingArguments)]$PytestArgs)

$ErrorActionPreference = "Stop"

$RepoRoot = Split-Path $PSScriptRoot -Parent

$PythonWin  = Join-Path $RepoRoot "backend\.venv\Scripts\python.exe"
$PythonUnix = Join-Path $RepoRoot "backend\.venv\bin\python"

if     (Test-Path $PythonWin)  { $Python = $PythonWin  }
elseif (Test-Path $PythonUnix) { $Python = $PythonUnix }
else {
    Write-Error "backend\.venv not found. Run:`n  cd backend`n  python -m venv .venv`n  pip install -e '.[dev]'"
    exit 1
}

$ComposeArgs = @(
    "compose",
    "-f", "$RepoRoot\docker-compose.yml",
    "-f", "$RepoRoot\docker-compose.dev.yml"
)

Write-Host "==> Starting db_test..."
& docker @ComposeArgs up db_test -d

Write-Host -NoNewline "==> Waiting for Postgres"
$Timeout = 30
for ($i = 0; $i -lt $Timeout; $i++) {
    & docker @ComposeArgs exec -T db_test pg_isready -U docflow -q 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    if ($i -eq $Timeout - 1) {
        Write-Host ""
        Write-Error "Postgres not ready after $Timeout seconds. Check: docker compose logs db_test"
        exit 1
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host " ready."

Write-Host "==> pytest $PytestArgs"
Set-Location "$RepoRoot\backend"
$env:DATABASE_TEST_URL = "postgresql+asyncpg://docflow:docflow_secret@localhost:5433/docflow_test"
& $Python -m pytest @PytestArgs
Set-Location $RepoRoot
