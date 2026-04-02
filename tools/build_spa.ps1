param(
  [string]$NodeExe = ""
)

$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $root
$frontend = Join-Path $projectRoot "frontend"

function Find-NodeExe() {
  if ($NodeExe -and (Test-Path $NodeExe)) { return $NodeExe }

  $raw = @(
    (Join-Path $env:ProgramFiles "nodejs\\node.exe"),
    (Join-Path ${env:ProgramFiles(x86)} "nodejs\\node.exe"),
    (Join-Path $env:LOCALAPPDATA "Programs\\nodejs\\node.exe")
  )

  # Force array output even when exactly one candidate exists.
  $candidates = @($raw | Where-Object { $_ -and (Test-Path $_) } | ForEach-Object { [string]$_ })

  if ($candidates.Count -gt 0) { return $candidates[0] }
  return $null
}

$node = Find-NodeExe
if (-not $node) {
  Write-Host "Node.js not found. Install Node.js LTS or pass -NodeExe path\\to\\node.exe" -ForegroundColor Red
  exit 1
}

if (-not (Test-Path $frontend)) {
  Write-Host "Missing frontend folder: $frontend" -ForegroundColor Red
  exit 1
}

Push-Location $frontend
try {
  $vite = Join-Path $frontend "node_modules\\vite\\bin\\vite.js"
  if (-not (Test-Path $vite)) {
    Write-Host "Missing Vite dependency. Run npm install in frontend/ first." -ForegroundColor Red
    exit 1
  }

  Write-Host "Building SPA via: `"$node`" `"$vite`" build"
  & "$node" "$vite" build
} finally {
  Pop-Location
}
