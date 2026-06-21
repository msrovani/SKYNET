# SKYNET Tauri Build Script
# Builds the Tauri desktop app from an ASCII-only path to avoid MinGW path encoding issues
param(
    [ValidateSet("check", "build", "release")]
    [string]$Mode = "check"
)

$ErrorActionPreference = "Stop"

# Paths — use Get-ChildItem with provider to handle accented paths
$srcRoot = "C:\Users\msrov\OneDrive\Área de Trabalho\SKYNET"
$srcTauri = "$srcRoot\packages\desktop-node-agent\src-tauri"
$buildDir = "C:\TauriBuild\src-tauri"
$publicDir = "C:\TauriBuild\public"
$iconsDir = "C:\TauriBuild\icons"
$minGwBin = "C:\tools\w64devkit\w64devkit\bin"

# Add MinGW to PATH
$env:PATH = "$minGwBin;$env:PATH"

# Ensure Rust GNU toolchain is default
$toolchain = rustup default 2>&1 | Out-String
if ($toolchain -notmatch "windows-gnu") {
    Write-Output "Setting GNU toolchain as default..."
    rustup default stable-x86_64-pc-windows-gnu
}

# Ensure Cargo config exists
$cargoConfigDir = "$buildDir\.cargo"
if (!(Test-Path $cargoConfigDir)) {
    New-Item -ItemType Directory -Path $cargoConfigDir -Force | Out-Null
}
$cargoConfig = @'
[build]
target = "x86_64-pc-windows-gnu"

[target.x86_64-pc-windows-gnu]
linker = "x86_64-w64-mingw32-gcc"
'@
$cargoConfig | Set-Content "$cargoConfigDir\config.toml" -Encoding ASCII

# Ensure public dir exists with minimal index.html
if (!(Test-Path $publicDir)) {
    New-Item -ItemType Directory -Path $publicDir -Force | Out-Null
    '<!DOCTYPE html><html><head><title>SKYNET Node</title></head><body><h1>SKYNET</h1></body></html>' |
        Set-Content "$publicDir\index.html" -Encoding ASCII
}

# Ensure icons exist
if (!(Test-Path $iconsDir)) {
    New-Item -ItemType Directory -Path $iconsDir -Force | Out-Null
}
# Create valid 32x32 and 128x128 PNGs if missing
if (!(Test-Path "$iconsDir\32x32.png")) {
    Add-Type -AssemblyName System.Drawing
    $bmp32 = New-Object System.Drawing.Bitmap(32, 32)
    $g32 = [System.Drawing.Graphics]::FromImage($bmp32)
    $g32.Clear([System.Drawing.Color]::FromArgb(0, 0, 120, 212))
    $g32.Dispose()
    $bmp32.Save("$iconsDir\32x32.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp32.Dispose()
}
if (!(Test-Path "$iconsDir\128x128.png")) {
    Add-Type -AssemblyName System.Drawing
    $bmp128 = New-Object System.Drawing.Bitmap(128, 128)
    $g128 = [System.Drawing.Graphics]::FromImage($bmp128)
    $g128.Clear([System.Drawing.Color]::FromArgb(0, 0, 120, 212))
    $g128.Dispose()
    $bmp128.Save("$iconsDir\128x128.png", [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp128.Dispose()
}
# Copy icons as needed
"128x128@2x.png", "icon.png", "icon.icns" | ForEach-Object {
    if (!(Test-Path "$iconsDir\$_")) {
        Copy-Item "$iconsDir\128x128.png" "$iconsDir\$_"
    }
}
# Create ICO if missing
if (!(Test-Path "$iconsDir\icon.ico")) {
    $pngBytes = [System.IO.File]::ReadAllBytes("$iconsDir\32x32.png")
    $icoStream = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter($icoStream)
    $writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]1)
    $writer.Write([Byte]32); $writer.Write([Byte]32); $writer.Write([Byte]0)
    $writer.Write([Byte]0); $writer.Write([UInt16]1); $writer.Write([UInt16]32)
    $writer.Write([UInt32]$pngBytes.Length); $writer.Write([UInt32]22)
    $writer.Write($pngBytes); $writer.Flush()
    [System.IO.File]::WriteAllBytes("$iconsDir\icon.ico", $icoStream.ToArray())
    $writer.Dispose(); $icoStream.Dispose()
}

# Sync src-tauri to build directory using robocopy (handles accented paths)
# robocopy exit codes: 0-7 = success, 8+ = error
if (!(Test-Path $buildDir)) {
    New-Item -ItemType Directory -Path $buildDir -Force | Out-Null
}
$rc = robocopy $srcTauri $buildDir /E /XD target /NP /NFL /NDL /NJH /NJS
if ($LASTEXITCODE -ge 8) { throw "robocopy failed with exit code $LASTEXITCODE" }

# Sync .cargo config
$cargoSrc = "$srcTauri\.cargo"
if (Test-Path $cargoSrc) {
    if (!(Test-Path $cargoConfigDir)) { New-Item -ItemType Directory -Path $cargoConfigDir -Force | Out-Null }
    $rc = robocopy $cargoSrc $cargoConfigDir /E /NP /NFL /NDL /NJH /NJS
    if ($LASTEXITCODE -ge 8) { throw "robocopy .cargo failed with exit code $LASTEXITCODE" }
}

# Fix tauri.conf.json BOM issue
$confPath = "$buildDir\tauri.conf.json"
$content = Get-Content $confPath -Raw
$null = [System.IO.File]::WriteAllText($confPath, $content, [System.Text.UTF8Encoding]::new($false))

# Build
Set-Location -LiteralPath $buildDir
switch ($Mode) {
    "check"  { cargo check }
    "build"  { cargo build }
    "release" { cargo build --release }
}

Write-Output ""
Write-Output "=== Tauri build complete (mode: $Mode) ==="