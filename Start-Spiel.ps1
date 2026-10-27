$ErrorActionPreference = 'Stop'
$gameRoot = $PSScriptRoot
$gameUrl = 'http://127.0.0.1:8787'
$nodePath = Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe'
if (-not (Test-Path -LiteralPath $nodePath)) {
    $nodeCmd = Get-Command node -ErrorAction SilentlyContinue
    if (-not $nodeCmd) { throw 'Node.js wurde nicht gefunden. Bitte Node.js installieren.' }
    $nodePath = $nodeCmd.Source
}
$alreadyRunning = $false
try {
    $health = Invoke-RestMethod -Uri "$gameUrl/api/health" -TimeoutSec 2
    if ($health.app -eq 'deutsche-schicksalsprobe-local') { $alreadyRunning = $true }
} catch {}
if (-not $alreadyRunning) {
    $logDir = Join-Path $gameRoot 'runtime'
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    $serverFile = Join-Path $gameRoot 'server.cjs'
    Start-Process -FilePath $nodePath -ArgumentList ('"' + $serverFile + '"') -WorkingDirectory $gameRoot -WindowStyle Hidden -RedirectStandardOutput (Join-Path $logDir 'server.log') -RedirectStandardError (Join-Path $logDir 'server-error.log')
    $ready = $false
    for ($try = 0; $try -lt 40; $try++) {
        Start-Sleep -Milliseconds 250
        try {
            $health = Invoke-RestMethod -Uri "$gameUrl/api/health" -TimeoutSec 2
            if ($health.app -eq 'deutsche-schicksalsprobe-local') { $ready = $true; break }
        } catch {}
    }
    if (-not $ready) { throw 'Das Spiel konnte nicht starten. Details stehen im Ordner runtime.' }
}
$edgePath = Join-Path ([Environment]::GetFolderPath('ProgramFilesX86')) 'Microsoft\Edge\Application\msedge.exe'
if (-not (Test-Path -LiteralPath $edgePath)) {
    $edgePath = Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'
}
if (Test-Path -LiteralPath $edgePath) {
    Start-Process -FilePath $edgePath -ArgumentList "--app=$gameUrl"
} else {
    Start-Process $gameUrl
}
