param(
  [switch]$SkipBuild,
  [switch]$NoServer
)

$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

Write-Host "HumanonthePodium restart" -ForegroundColor Cyan
Write-Host "Repo: $repoRoot"

Write-Host "`nStopping anything listening on 127.0.0.1:3001..." -ForegroundColor Yellow
$connections = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue

if ($connections) {
  $processIds = $connections | Select-Object -ExpandProperty OwningProcess -Unique
  foreach ($processId in $processIds) {
    try {
      $process = Get-Process -Id $processId -ErrorAction Stop
      Write-Host "Stopping PID $processId ($($process.ProcessName))"
      Stop-Process -Id $processId -Force
    } catch {
      Write-Host "PID $processId was already stopped"
    }
  }
} else {
  Write-Host "No server is currently listening on 127.0.0.1:3001"
}

Start-Sleep -Milliseconds 500

$stillListening = Get-NetTCPConnection -LocalAddress 127.0.0.1 -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
if ($stillListening) {
  throw "Port 3001 is still busy. Close the process manually in Task Manager and rerun this script."
}

if (-not $SkipBuild) {
  Write-Host "`nBuilding workspace..." -ForegroundColor Yellow
  npm run build
}

Write-Host "`nChrome extension reload steps:" -ForegroundColor Cyan
Write-Host "1. Open chrome://extensions"
Write-Host "2. Remove the old HumanonthePodium extension if it is loaded"
Write-Host "3. Click 'Load unpacked'"
Write-Host "4. Select: $repoRoot\apps\extension\.output\chrome-mv3"

if ($NoServer) {
  Write-Host "`nSkipped server start because -NoServer was provided." -ForegroundColor Yellow
  exit 0
}

Write-Host "`nStarting HumanonthePodium server on 127.0.0.1:3001..." -ForegroundColor Green
Write-Host "Keep this terminal open while testing. Press Ctrl+C to stop the server."
npm run dev:server
