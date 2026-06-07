use serde::{Deserialize, Serialize};

const UPDATE_URL: &str = "https://releases.skynet.network/desktop-node-agent/";

#[derive(Debug, Serialize, Deserialize)]
pub struct ReleaseInfo {
    pub version: String,
    pub url: String,
    pub checksum_sha256: String,
    pub signature: String,
}

#[derive(Debug, Serialize)]
pub struct UpdateStatus {
    pub current_version: String,
    pub latest_version: Option<String>,
    pub update_available: bool,
    pub last_checked: String,
}

#[tauri::command]
pub async fn check_for_updates() -> Result<UpdateStatus, String> {
    let current = env!("CARGO_PKG_VERSION").to_string();
    let url = format!("{}{}/release.json", UPDATE_URL, std::env::consts::OS);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Ok(UpdateStatus {
            current_version: current,
            latest_version: None,
            update_available: false,
            last_checked: now_iso(),
        });
    }
    let release: ReleaseInfo = resp.json().await.map_err(|e| e.to_string())?;
    let update_available = semver_compare(&current, &release.version);
    Ok(UpdateStatus {
        current_version: current,
        latest_version: Some(release.version),
        update_available,
        last_checked: now_iso(),
    })
}

#[tauri::command]
pub async fn apply_update() -> Result<String, String> {
    let url = format!("{}{}/latest", UPDATE_URL, std::env::consts::OS);
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(300))
        .build()
        .map_err(|e| e.to_string())?;
    let bytes = client
        .get(&url)
        .send()
        .await
        .map_err(|e| e.to_string())?
        .bytes()
        .await
        .map_err(|e| e.to_string())?;
    let exe = std::env::current_exe().map_err(|e| e.to_string())?;
    let tmp = exe.with_extension("tmp");
    std::fs::write(&tmp, &bytes).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    set_executable(&tmp)?;
    std::fs::rename(&tmp, &exe).map_err(|e| e.to_string())?;
    Ok("Update applied — restart to activate".to_string())
}

#[cfg(unix)]
fn set_executable(path: &std::path::Path) -> Result<(), String> {
    use std::os::unix::fs::PermissionsExt;
    std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o755))
        .map_err(|e| e.to_string())
}

fn now_iso() -> String {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap_or_default();
    format!("{}", now.as_secs())
}

fn semver_compare(current: &str, latest: &str) -> bool {
    let c: Vec<u64> = current
        .split('.')
        .filter_map(|s| s.parse().ok())
        .collect();
    let l: Vec<u64> = latest.split('.').filter_map(|s| s.parse().ok()).collect();
    for i in 0..3 {
        let cv = c.get(i).copied().unwrap_or(0);
        let lv = l.get(i).copied().unwrap_or(0);
        if lv > cv {
            return true;
        }
        if lv < cv {
            return false;
        }
    }
    false
}
