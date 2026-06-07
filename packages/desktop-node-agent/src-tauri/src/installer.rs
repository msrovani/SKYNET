use serde::Serialize;
use std::path::PathBuf;

#[derive(Debug, Serialize)]
pub struct InstallState {
    pub service_installed: bool,
    pub autorun_enabled: bool,
    pub is_portable: bool,
    pub install_path: String,
    pub version: String,
}

#[tauri::command]
pub fn get_install_state() -> InstallState {
    let exe = std::env::current_exe().ok();
    let install_path = exe
        .as_ref()
        .and_then(|p| p.parent().map(|p| p.to_string_lossy().to_string()))
        .unwrap_or_else(|| "unknown".to_string());
    InstallState {
        service_installed: is_service_installed(),
        autorun_enabled: is_autorun_enabled(),
        is_portable: is_running_portable(),
        install_path,
        version: env!("CARGO_PKG_VERSION").to_string(),
    }
}

// ─── Install ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn install_service() -> Result<String, String> {
    if is_running_portable() {
        return Ok("Portable mode — no service needed".to_string());
    }
    #[cfg(target_os = "windows")]
    { install_windows_service()?; }
    #[cfg(target_os = "macos")]
    { install_macos_service()?; }
    #[cfg(target_os = "linux")]
    { install_linux_service()?; }
    enable_autorun_inner().ok();
    Ok("SKYNET node service installed".to_string())
}

#[tauri::command]
pub fn uninstall_service() -> Result<String, String> {
    #[cfg(target_os = "windows")]
    { uninstall_windows_service()?; }
    #[cfg(target_os = "macos")]
    { uninstall_macos_service()?; }
    #[cfg(target_os = "linux")]
    { uninstall_linux_service()?; }
    disable_autorun_inner().ok();
    Ok("SKYNET node service removed".to_string())
}

// ─── Autorun ──────────────────────────────────────────────────────────

#[tauri::command]
pub fn enable_autorun() -> Result<String, String> {
    enable_autorun_inner()?;
    Ok("Autorun enabled".to_string())
}

#[tauri::command]
pub fn disable_autorun() -> Result<String, String> {
    disable_autorun_inner()?;
    Ok("Autorun disabled".to_string())
}

fn enable_autorun_inner() -> Result<(), String> {
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    #[cfg(target_os = "windows")]
    { add_registry_run(&exe)?; }
    #[cfg(target_os = "macos")]
    { add_launchd_plist(&exe)?; }
    #[cfg(target_os = "linux")]
    { add_autostart_desktop(&exe)?; }
    Ok(())
}

fn disable_autorun_inner() -> Result<(), String> {
    #[cfg(target_os = "windows")]
    { remove_registry_run()?; }
    #[cfg(target_os = "macos")]
    { remove_launchd_plist()?; }
    #[cfg(target_os = "linux")]
    { remove_autostart_desktop()?; }
    Ok(())
}

// ─── Windows ──────────────────────────────────────────────────────────

#[cfg(target_os = "windows")]
fn install_windows_service() -> Result<(), String> {
    use std::process::Command;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let status = Command::new("sc")
        .args(["create", "SkynetNode", 
               &format!("binPath={}", exe.to_string_lossy()),
               "start=auto", "displayname=SKYNET DePIN Node"])
        .status().map_err(|e| e.to_string())?;
    if !status.success() {
        return Err("Failed to create Windows service".to_string());
    }
    Command::new("sc")
        .args(["description", "SkynetNode", "SKYNET Distributed AI Inference Node"])
        .status().ok();
    Command::new("sc")
        .args(["start", "SkynetNode"])
        .status().ok();
    Ok(())
}

#[cfg(target_os = "windows")]
fn uninstall_windows_service() -> Result<(), String> {
    use std::process::Command;
    Command::new("sc")
        .args(["stop", "SkynetNode"])
        .status().ok();
    Command::new("sc")
        .args(["delete", "SkynetNode"])
        .status().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn add_registry_run(exe: &PathBuf) -> Result<(), String> {
    use std::process::Command;
    Command::new("reg")
        .args(["add", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
               "/v", "SkynetNode", "/t", "REG_SZ",
               "/d", &exe.to_string_lossy(), "/f"])
        .status().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "windows")]
fn remove_registry_run() -> Result<(), String> {
    use std::process::Command;
    Command::new("reg")
        .args(["delete", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run",
               "/v", "SkynetNode", "/f"])
        .status().ok();
    Ok(())
}

// ─── macOS ────────────────────────────────────────────────────────────

#[cfg(target_os = "macos")]
fn install_macos_service() -> Result<(), String> {
    use std::process::Command;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let plist = format!(
        r#"<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>network.skynet.node</string>
    <key>ProgramArguments</key>
    <array><string>{}</string></array>
    <key>RunAtLoad</key><true/>
    <key>KeepAlive</key><true/>
    <key>ProcessType</key><string>Background</string>
    <key>Nice</key><integer>10</integer>
</dict>
</plist>"#, exe.to_string_lossy());
    let path = dirs_next::data_dir()
        .ok_or("Cannot find data dir")?
        .join("Library/LaunchAgents/network.skynet.node.plist");
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&path, plist).map_err(|e| e.to_string())?;
    Command::new("launchctl")
        .args(["load", &path.to_string_lossy()])
        .status().map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "macos")]
fn uninstall_macos_service() -> Result<(), String> {
    use std::process::Command;
    let path = dirs_next::data_dir()
        .ok_or("Cannot find data dir")?
        .join("Library/LaunchAgents/network.skynet.node.plist");
    Command::new("launchctl")
        .args(["unload", &path.to_string_lossy()])
        .status().ok();
    std::fs::remove_file(&path).ok();
    Ok(())
}

#[cfg(target_os = "macos")]
fn add_launchd_plist(exe: &PathBuf) -> Result<(), String> {
    install_macos_service()
}

#[cfg(target_os = "macos")]
fn remove_launchd_plist() -> Result<(), String> {
    uninstall_macos_service()
}

// ─── Linux ────────────────────────────────────────────────────────────

#[cfg(target_os = "linux")]
fn install_linux_service() -> Result<(), String> {
    use std::process::Command;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let service = format!(
        "[Unit]\nDescription=SKYNET DePIN Node\nAfter=network.target\n\n\
         [Service]\nExecStart={}\nRestart=always\nRestartSec=10\nNice=10\n\n\
         [Install]\nWantedBy=multi-user.target\n",
        exe.to_string_lossy()
    );
    let path = PathBuf::from("/etc/systemd/system/skynet-node.service");
    if !path.parent().map_or(false, |p| p.exists()) {
        return Err("systemd not found — try init.d fallback".to_string());
    }
    std::fs::write(&path, service).map_err(|e| e.to_string())?;
    Command::new("systemctl")
        .args(["daemon-reload"])
        .status().map_err(|e| e.to_string())?;
    Command::new("systemctl")
        .args(["enable", "skynet-node"])
        .status().map_err(|e| e.to_string())?;
    Command::new("systemctl")
        .args(["start", "skynet-node"])
        .status().ok();
    Ok(())
}

#[cfg(target_os = "linux")]
fn uninstall_linux_service() -> Result<(), String> {
    use std::process::Command;
    Command::new("systemctl")
        .args(["stop", "skynet-node"])
        .status().ok();
    Command::new("systemctl")
        .args(["disable", "skynet-node"])
        .status().ok();
    std::fs::remove_file("/etc/systemd/system/skynet-node.service").ok();
    Command::new("systemctl").args(["daemon-reload"]).status().ok();
    Ok(())
}

#[cfg(target_os = "linux")]
fn add_autostart_desktop(exe: &PathBuf) -> Result<(), String> {
    let desktop = format!(
        "[Desktop Entry]\nType=Application\nName=SKYNET Node\nExec={}\nHidden=false\nNoDisplay=true\nX-GNOME-Autostart-enabled=true\n",
        exe.to_string_lossy()
    );
    let path = dirs_next::config_dir()
        .ok_or("Cannot find config dir")?
        .join("autostart/skynet-node.desktop");
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    std::fs::write(&path, desktop).map_err(|e| e.to_string())?;
    Ok(())
}

#[cfg(target_os = "linux")]
fn remove_autostart_desktop() -> Result<(), String> {
    let path = dirs_next::config_dir()
        .ok_or("Cannot find config dir")?
        .join("autostart/skynet-node.desktop");
    std::fs::remove_file(&path).ok();
    Ok(())
}

// ─── Detect ───────────────────────────────────────────────────────────

fn is_service_installed() -> bool {
    #[cfg(target_os = "windows")]
    { return std::path::Path::new(r"\\.\pipe\SkynetNode").exists(); }
    #[cfg(target_os = "macos")]
    { return std::path::Path::new("/Library/LaunchAgents/network.skynet.node.plist").exists(); }
    #[cfg(target_os = "linux")]
    { return std::path::Path::new("/etc/systemd/system/skynet-node.service").exists(); }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { false }
}

fn is_autorun_enabled() -> bool {
    #[cfg(target_os = "windows")]
    {
        use std::process::Command;
        let out = Command::new("reg")
            .args(["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Run", "/v", "SkynetNode"])
            .output();
        return out.map(|o| o.status.success()).unwrap_or(false);
    }
    #[cfg(target_os = "macos")]
    {
        return std::path::Path::new("/Library/LaunchAgents/network.skynet.node.plist").exists();
    }
    #[cfg(target_os = "linux")]
    {
        let path = dirs_next::config_dir()
            .map(|p| p.join("autostart/skynet-node.desktop"));
        return path.map_or(false, |p| p.exists());
    }
    #[cfg(not(any(target_os = "windows", target_os = "macos", target_os = "linux")))]
    { false }
}

fn is_running_portable() -> bool {
    let exe = match std::env::current_exe() {
        Ok(p) => p,
        Err(_) => return false,
    };
    let path = exe.to_string_lossy().to_lowercase();
    path.contains("usb")
        || path.contains("pendrive")
        || path.contains("portable")
        || path.contains("d:")
        || path.contains("e:")
        || path.contains("f:")
        || path.contains("g:")
        || path.contains("h:")
        || path.contains("volumes")
        || path.contains("/mnt/")
        || path.contains("/media/")
}
