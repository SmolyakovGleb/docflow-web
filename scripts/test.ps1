# Запускает тесты backend: поднимает db_test, ждёт Postgres, запускает pytest.
# Использование: .\scripts\test.ps1 [pytest-args]
# Примеры:
#   .\scripts\test.ps1
#   .\scripts\test.ps1 tests/test_auth.py -v
#   .\scripts\test.ps1 -x -k "test_login"
param([Parameter(ValueFromRemainingArguments)]$PytestArgs)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

$RepoRoot = Split-Path $PSScriptRoot -Parent

# Определяем Python из venv (Windows: Scripts\, Unix: bin/)
$PythonWin  = Join-Path $RepoRoot "backend\.venv\Scripts\python.exe"
$PythonUnix = Join-Path $RepoRoot "backend\.venv\bin\python"

if     (Test-Path $PythonWin)  { $Python = $PythonWin  }
elseif (Test-Path $PythonUnix) { $Python = $PythonUnix }
else {
    Write-Error "backend\.venv не найден. Запустите:`n  cd backend`n  python -m venv .venv`n  pip install -e '.[dev]'"
    exit 1
}

$ComposeArgs = @(
    "compose",
    "-f", "$RepoRoot\docker-compose.yml",
    "-f", "$RepoRoot\docker-compose.dev.yml"
)

# Поднимаем db_test (idempotent — не трогает уже запущенный контейнер)
Write-Host "==> Запуск db_test..."
& docker @ComposeArgs up db_test -d

# Ждём готовности Postgres (таймаут 30 секунд)
Write-Host -NoNewline "==> Ожидание Postgres"
$Timeout = 30
for ($i = 0; $i -lt $Timeout; $i++) {
    & docker @ComposeArgs exec -T db_test pg_isready -U docflow -q 2>$null
    if ($LASTEXITCODE -eq 0) { break }
    if ($i -eq $Timeout - 1) {
        Write-Host ""
        Write-Error "Postgres не поднялся за $Timeout секунд. Проверьте: docker compose logs db_test"
        exit 1
    }
    Write-Host -NoNewline "."
    Start-Sleep -Seconds 1
}
Write-Host " готов."

# Запускаем pytest из backend/ (чтобы pyproject.toml был в cwd)
Write-Host "==> pytest $PytestArgs"
Set-Location "$RepoRoot\backend"
$env:DATABASE_TEST_URL = "postgresql+asyncpg://docflow:docflow_secret@localhost:5433/docflow_test"
& $Python -m pytest @PytestArgs
Set-Location $RepoRoot