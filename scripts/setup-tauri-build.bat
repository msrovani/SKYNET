@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  SKYNET Tauri Build - Windows SDK Setup
echo ============================================================
echo.

where link.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] MSVC linker (link.exe) found in PATH
) else (
    echo [..] Checking for MSVC in BuildTools...
    set "MSVC_DIR=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC"
    if exist "!MSVC_DIR!" (
        for /d %%A in ("!MSVC_DIR!\*") do (
            if exist "%%A\bin\Hostx64\x64\link.exe" (
                echo [OK] Found link.exe in %%A
                set "PATH=%%A\bin\Hostx64\x64;!PATH!"
            )
        )
    )
)

echo.
echo [..] Checking Windows SDK...
if exist "C:\Program Files (x86)\Windows Kits" (
    dir /s /b "C:\Program Files (x86)\Windows Kits\kernel32.lib" >nul 2>&1
    if !ERRORLEVEL! equ 0 (
        echo [OK] Windows SDK found with kernel32.lib
        goto :check_rust
    )
)

echo [!!] Windows SDK not found!
echo [..] Installing Windows 11 SDK via VS Build Tools installer...
echo.

set "VS_INSTALLER=C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe"
set "VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools"

if exist "!VS_INSTALLER!" (
    echo [..] Trying SDK component: Windows11SDK.26100
    "!VS_INSTALLER!" modify --installPath "!VS_PATH!" --add Microsoft.VisualStudio.Component.Windows11SDK.26100 --quiet --norestart
    if !ERRORLEVEL! equ 0 (
        echo [OK] Windows SDK installed
        goto :check_rust
    )
    echo [..] Trying generic Windows11SDK
    "!VS_INSTALLER!" modify --installPath "!VS_PATH!" --add Microsoft.VisualStudio.Component.Windows11SDK --quiet --norestart
    if !ERRORLEVEL! equ 0 (
        echo [OK] Windows SDK installed
        goto :check_rust
    )
    echo [!!] VS installer failed. Trying standalone SDK download...
    echo.
    powershell -Command "Invoke-WebRequest -Uri 'https://go.microsoft.com/fwlink/p/?linkid=2120843' -OutFile '%TEMP%\winsdksetup.exe' -UseBasicParsing"
    if exist "%TEMP%\winsdksetup.exe" (
        echo [..] Running SDK standalone installer...
        start /wait "" "%TEMP%\winsdksetup.exe" /quiet /norestart
        echo [..] Exit code: !ERRORLEVEL!
    ) else (
        echo [!!] Failed to download SDK installer
    )
) else (
    echo [!!] VS installer not found.
    echo.
    echo Download SDK from: https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
)

:check_rust
echo.
echo [..] Checking Rust MSVC target...
rustup target list --installed | findstr "x86_64-pc-windows-msvc" >nul
if %ERRORLEVEL% equ 0 (
    echo [OK] Rust MSVC target installed
) else (
    echo [..] Installing Rust MSVC target...
    rustup target add x86_64-pc-windows-msvc
)

echo.
echo [..] Testing Rust compilation...
echo fn main() { println!("SKYNET Tauri build OK"); } > "%TEMP%\test_build.rs"
rustc "%TEMP%\test_build.rs" -o "%TEMP%\test_build.exe" 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Rust compilation test passed!
    del "%TEMP%\test_build.rs" "%TEMP%\test_build.exe"
) else (
    echo [!!] Rust compilation test failed
    echo Check LIB and INCLUDE env vars
    exit /b 1
)

echo.
echo ============================================================
echo  Setup complete!
echo  Next: cd packages\desktop-node-agent ^&^& pnpm exec tauri build
echo ============================================================
