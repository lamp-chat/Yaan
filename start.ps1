param(
    [string]$ApiKey,
    [string]$FlaskSecret,
    [string]$AdminToken,
    [int]$FreeDailyLimit,
    [string]$UsageTz
)

$ErrorActionPreference = "Stop"

$projectRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $projectRoot

$envFile = Join-Path $projectRoot ".env"
function Load-DotEnv([string]$path) {
    if (-not (Test-Path $path)) { return }
    Get-Content $path | ForEach-Object {
        $line = ($_ -as [string]).Trim()
        if (-not $line) { return }
        if ($line.StartsWith("#")) { return }
        $idx = $line.IndexOf("=")
        if ($idx -lt 1) { return }
        $k = $line.Substring(0, $idx).Trim()
        $v = $line.Substring($idx + 1).Trim()
        if ($v.StartsWith('"') -and $v.EndsWith('"') -and $v.Length -ge 2) { $v = $v.Substring(1, $v.Length - 2) }
        if ($k) { Set-Item -Path ("Env:" + $k) -Value $v }
    }
}
Load-DotEnv $envFile

$pythonExe = Join-Path $projectRoot ".venv\Scripts\python.exe"
if (-not (Test-Path $pythonExe)) {
    Write-Host "Missing virtualenv python: $pythonExe" -ForegroundColor Red
    Write-Host "Create your venv first, then try again." -ForegroundColor Yellow
    exit 1
}

# Ensure Python deps are installed in this venv (common cause: firebase-admin missing).
$reqFile = Join-Path $projectRoot "requirements.txt"
if (Test-Path $reqFile) {
    $stampFile = Join-Path $projectRoot ".venv\.requirements.sha256"
    $reqHash = (Get-FileHash -Algorithm SHA256 -Path $reqFile).Hash
    $prevHash = ""
    if (Test-Path $stampFile) {
        try { $prevHash = (Get-Content $stampFile -Raw).Trim() } catch { $prevHash = "" }
    }

    if ($prevHash -ne $reqHash) {
        Write-Host "Installing/updating Python dependencies from requirements.txt..."
        & $pythonExe -m pip install -r $reqFile
        $reqHash | Set-Content -Encoding ASCII -NoNewline $stampFile
    }
}

if (-not $ApiKey) {
    $ApiKey = $env:OPENAI_API_KEY
}

if (-not $ApiKey) {
    $ApiKey = Read-Host "Enter your OpenAI API key (starts with sk-)"
}

if (-not $ApiKey -or -not $ApiKey.StartsWith("sk-")) {
    Write-Host "Invalid API key. It must start with 'sk-'." -ForegroundColor Red
    exit 1
}

if (-not $FlaskSecret) {
    $FlaskSecret = $env:FLASK_SECRET_KEY
}

if (-not $FlaskSecret) {
    $FlaskSecret = & $pythonExe -c "import secrets; print(secrets.token_urlsafe(32))"
}

$env:OPENAI_API_KEY = $ApiKey
$env:FLASK_SECRET_KEY = $FlaskSecret

# Dev default: make UI edits visible through ngrok/mobile browsers.
if (-not $env:FLASK_DEBUG) {
    $env:FLASK_DEBUG = "1"
}
# Cache-bust static assets even if FLASK_DEBUG is later turned off.
$env:STATIC_V = [string][int](Get-Date -UFormat %s)

if (-not $AdminToken) {
    $AdminToken = $env:ADMIN_TOKEN
}
if (-not $AdminToken) {
    $AdminToken = Read-Host "Enter ADMIN_TOKEN for /admin endpoints (optional, press Enter to disable)"
}
if ($AdminToken) {
    $env:ADMIN_TOKEN = $AdminToken
}

if ($FreeDailyLimit) {
    $env:FREE_DAILY_MESSAGE_LIMIT = $FreeDailyLimit
}
if ($UsageTz) {
    $env:USAGE_TZ = $UsageTz
}

Write-Host "OPENAI_API_KEY loaded: $($env:OPENAI_API_KEY.Substring(0, [Math]::Min(7, $env:OPENAI_API_KEY.Length)))..."
if (-not $env:HOST) { $env:HOST = "0.0.0.0" }
if (-not $env:PORT) { $env:PORT = "5000" }

function Get-LanIPv4 {
    try {
        $ips = Get-NetIPAddress -AddressFamily IPv4 -ErrorAction Stop |
            Where-Object {
                $_.IPAddress -and
                $_.IPAddress -ne "127.0.0.1" -and
                $_.IPAddress -notlike "169.254.*" -and
                $_.PrefixOrigin -ne "WellKnown"
            } |
            Select-Object -ExpandProperty IPAddress
        foreach ($ip in $ips) {
            if ($ip -match '^\d{1,3}(\.\d{1,3}){3}$') { return $ip }
        }
    } catch {}
    return ""
}

$port = $env:PORT
$lan = Get-LanIPv4
Write-Host "Starting Flask app:"
Write-Host "  Same PC:  http://127.0.0.1:$port"
if ($lan) {
    Write-Host "  Phone:    http://$lan`:$port  (same Wi-Fi)"
    Write-Host "If phone can't open it, allow Windows Firewall inbound for port $port."
} else {
    Write-Host "To test on your phone: open http://<YOUR_PC_LAN_IP>:$port on the same Wi-Fi."
}
if ($env:ADMIN_TOKEN) {
    Write-Host "Admin endpoints enabled: /admin/feedback?token=..."
} else {
    Write-Host "Admin endpoints disabled (ADMIN_TOKEN is empty)."
}

& $pythonExe ".\python app.py"
