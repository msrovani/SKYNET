use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize)]
pub struct IdleState {
    pub is_idle: bool,
    pub idle_minutes: u64,
    pub cpu_usage_percent: f32,
    pub gpu_usage_percent: f32,
    pub power_plan: String,
}

#[derive(Debug, Deserialize)]
pub enum PowerProfile {
    Balanced,   // Default: max performance when idle
    Eco,        // Eco: reduce clock speeds, save power
    Silent,     // Silent: minimize noise (22h-8h)
    Performance, // Performance: full speed always
}

#[tauri::command]
pub fn get_idle_state() -> IdleState {
    IdleState {
        is_idle: true,
        idle_minutes: 30,
        cpu_usage_percent: 5.0,
        gpu_usage_percent: 2.0,
        power_plan: "Balanced".to_string(),
    }
}

#[tauri::command]
pub fn set_power_profile(profile: String) -> Result<String, String> {
    match profile.to_lowercase().as_str() {
        "balanced" | "eco" | "silent" | "performance" => {
            Ok(format!("Power profile set to {}", profile))
        }
        _ => Err(format!("Unknown power profile: {}", profile)),
    }
}
