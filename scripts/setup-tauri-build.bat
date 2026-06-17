:: SKYNET Tauri Build Setup — Windows SDK Installer Script
:: Run this script as Administrator to install required MSVC components.
:: Requires: Visual Studio Build Tools 2026 (already installed)
::
:: This script installs the Windows 11 SDK which is needed for
:: Tauri native builds (Rust MSVC linker needs kernel32.lib etc.)

@echo off
setlocal enabledelayedexpansion

echo ============================================================
echo  SKYNET Tauri Build — Windows SDK Setup
echo ============================================================
echo.

where link.exe >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] MSVC linker (link.exe) found in PATH
) else (
    echo [..] MSVC linker not in PATH — checking BuildTools...
    
    set "MSVC_BIN=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools\VC\Tools\MSVC"
    if exist "!MSVC_BIN!" (
        for /d %%d in ("!MSVC_BIN!\*") do (
            if exist "%%d\bin\Hostx64\x64\link.exe" (
                echo [OK] Found link.exe in %%d
                set "PATH=%%d\bin\Hostx64\x64;!PATH!"
            )
        )
    )
)

echo.
echo [..] Checking Windows SDK...
where /R "C:\Program Files (x86)\Windows Kits" kernel32.lib >nul 2>&1
if %ERRORLEVEL% equ 0 (
    echo [OK] Windows SDK found with kernel32.lib
    goto :check_rust
)

echo [!!] Windows SDK not found!
echo [..] Installing Windows 11 SDK via VS Build Tools Installer...
echo.

set "VS_INSTALLER=C:\Program Files (x86)\Microsoft Visual Studio\Installer\setup.exe"
set "VS_PATH=C:\Program Files (x86)\Microsoft Visual Studio\18\BuildTools"

if exist "!VS_INSTALLER!" (
    echo [..] Running: "!VS_INSTALLER!" modify ^
        --installPath "!VS_PATH!" ^
        --add Microsoft.VisualStudio.Component.Windows11SDK.26100 ^
        --quiet --norestart
    echo.
    echo This may take several minutes. Please wait...
    
    "!VS_INSTALLER!" modify ^
        --installPath "!VS_PATH!" ^
        --add Microsoft.VisualStudio.Component.Windows11SDK.26100 ^
        --quiet --norestart
    
    if !ERRORLEVEL! equ 0 (
        echo [OK] Windows SDK installed successfully
    ) else (
        echo [!!] Installer returned error code: !ERRORLEVEL!
        echo.
        echo Alternative: Download Windows SDK manually from:
        echo   https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/
        echo.
        echo Or switch to MinGW toolchain:
        echo   rustup target add x86_64-pc-windows-gnu
        echo   ^(then install MinGW-w64 from https://winlibs.com/^)
        exit /b !ERRORLEVEL!
    )
) else (
    echo [!!] Visual Studio installer not found at !VS_INSTALLER!
    echo.
    echo Please install Visual Studio Build Tools 2022+ with:
    echo   - MSVC v143 - VS 2022 C++ x64/x86 build tools
    echo   - Windows 10/11 SDK
    exit /b 1
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
    echo Check that MSVC environment variables (LIB, INCLUDE) are set correctly
    exit /b 1
)

echo.
echo ============================================================
echo  Setup complete! You can now build Tauri:
echo    cd packages\desktop-node-agent
echo    pnpm exec tauri build
echo ============================================================
