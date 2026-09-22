# Downloads the LiveKit server binary for local dev (Windows amd64) into this
# folder, next to livekit.yaml. Re-run any time to fetch a fresh copy -- the
# binary itself is gitignored, this script is the source of truth for which
# version to use.
#
# Usage:  powershell -ExecutionPolicy Bypass -File .\setup.ps1

$ErrorActionPreference = "Stop"

$version = "1.13.7"
$zipName = "livekit-server_${version}_windows_amd64.zip"
$url = "https://github.com/livekit/livekit/releases/download/v$version/$zipName"

$dest = Join-Path $PSScriptRoot $zipName
Write-Host "Downloading $url ..."
Invoke-WebRequest -Uri $url -OutFile $dest

Write-Host "Extracting..."
Expand-Archive -Path $dest -DestinationPath $PSScriptRoot -Force
Remove-Item $dest

Write-Host "Done. Run with:  .\livekit-server.exe --config livekit.yaml"
