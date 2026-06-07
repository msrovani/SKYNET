#!/usr/bin/env pwsh
# SKYNET DePIN Node — Windows One-Liner Installer
# Usage: irm https://get.skynet.network | iex
# Or:    .\install.ps1 [-Portable] [-Service] [-Path "C:\SKYNET"]

param(
    [switch]$Portable,
    [switch]$Service,
    [string]$Path = "$env:LOCALAPPDATA\SKYNET"
)

$ErrorActionPreference = "Stop"
$Repo = "https://github.com/skynet-depin/desktop-node-agent/releases/latest/download"

function Write-Step($msg) { Write-Host "==> $msg" -ForegroundColor Cyan }
function Write-Ok($msg) { Write-Host "  OK $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  ! $msg" -ForegroundColor Yellow }

# Detect architecture
$arch = if ([Environment]::Is64BitOperatingSystem) { "x64" } else { "x86" }
$osVer = [Environment]::OSVersion.Version
if ($osVer.Major -lt 10) { throw "Windows 10+ required" }

Write-Step "SKYNET DePIN Node Installer v0.1.0"
Write-Step "Detecting hardware..."

# GPU detection
$hasNvidia = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -match "NVIDIA" }
$hasAMD = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -match "AMD|Radeon" }
$hasIntel = Get-WmiObject Win32_VideoController | Where-Object { $_.Name -match "Intel" }
$vram = (Get-WmiObject Win32_VideoController | Measure-Object -Property AdapterRAM -Sum).Sum / 1MB
$gpuCount = (Get-WmiObject Win32_VideoController).Count

Write-Host "  GPU(s): $gpuCount detected, $([math]::Round($vram))MB total VRAM"
if ($hasNvidia) { Write-Host "  Backend: CUDA" } else { Write-Host "  Backend: DirectML/Vulkan" }

# Install
if (-not $Portable) {
    Write-Step "Installing to $Path"
    $zip = "$env:TEMP\skynet-node.zip"
    $url = "$Repo/skynet-node-windows-$arch.zip"

    Write-Step "Downloading $url..."
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

    New-Item -ItemType Directory -Path $Path -Force | Out-Null
    Expand-Archive -Path $zip -DestinationPath $Path -Force
    Remove-Item $zip

    $exe = "$Path\skynet-node.exe"
    Write-Ok "Installed: $exe"
} else {
    Write-Step "Portable mode — extracting to current directory"
    $zip = "$env:TEMP\skynet-node-portable.zip"
    $url = "$Repo/skynet-node-windows-$arch-portable.zip"
    Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing
    Expand-Archive -Path $zip -DestinationPath .\SKYNET_PORTABLE -Force
    Remove-Item $zip
    $exe = ".\SKYNET_PORTABLE\skynet-node.exe"
    Write-Ok "Portable install at .\SKYNET_PORTABLE"
}

# Service mode
if ($Service -and -not $Portable) {
    Write-Step "Installing Windows service..."
    & $exe install-service 2>&1 | Out-Null
    Write-Ok "Service installed (SkynetNode)"
}

# Autorun
if (-not $Portable) {
    Write-Step "Adding to startup..."
    & $exe enable-autorun 2>&1 | Out-Null
    Write-Ok "Autorun enabled"
}

# Firewall
Write-Step "Configuring firewall..."
New-NetFirewallRule -DisplayName "SKYNET Node" -Direction Inbound -Program $exe -Action Allow -Profile Any -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "SKYNET Node (WebTransport)" -Direction Inbound -LocalPort 443 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue | Out-Null
New-NetFirewallRule -DisplayName "SKYNET Node (WebRTC)" -Direction Inbound -LocalPort 49152-65535 -Protocol UDP -Action Allow -ErrorAction SilentlyContinue | Out-Null
Write-Ok "Firewall rules created"

# Start
Write-Step "Starting SKYNET Node..."
Start-Process -FilePath $exe -WindowStyle Hidden
Write-Ok "Node started! Check tray icon."

Write-Host ""
Write-Host "SKYNET DePIN Node installed successfully!" -ForegroundColor Green
Write-Host "  Path:    $Path" -ForegroundColor Gray
Write-Host "  GPU:     $gpuCount GPU(s), $([math]::Round($vram))MB VRAM" -ForegroundColor Gray
Write-Host "  Service: $(if ($Service -and -not $Portable) { 'Yes' } else { 'No' })" -ForegroundColor Gray
Write-Host "  Autorun: $(if (-not $Portable) { 'Yes' } else { 'No (portable)' })" -ForegroundColor Gray
