use serde::Serialize;
use std::collections::HashMap;

#[derive(Debug, Serialize)]
pub struct GpuInfo {
    pub name: String,
    pub vendor: String,
    pub backend: String,
    pub vram_mb: u64,
    pub compute_capability: String,
    pub supports_fp16: bool,
    pub supports_int8: bool,
    pub supports_webgpu: bool,
    pub tflops_fp16: f64,
}

#[derive(Debug, Serialize)]
pub struct GpuCapabilities {
    pub gpus: Vec<GpuInfo>,
    pub best_backend: String,
    pub total_vram_mb: u64,
    pub total_tflops: f64,
    pub gpu_count: u32,
    pub has_cuda: bool,
    pub has_metal: bool,
    pub has_vulkan: bool,
    pub has_rocm: bool,
    pub is_datacenter: bool,
}

#[tauri::command]
pub fn detect_gpu() -> Vec<GpuInfo> {
    let mut gpus = Vec::new();

    gpus.push(GpuInfo {
        name: hostname(),
        vendor: detect_vendor(),
        backend: detect_best_backend(),
        vram_mb: detect_vram(),
        compute_capability: "7.0+".to_string(),
        supports_fp16: true,
        supports_int8: true,
        supports_webgpu: true,
        tflops_fp16: detect_tflops(),
    });

    gpus
}

#[tauri::command]
pub fn get_gpu_capabilities() -> GpuCapabilities {
    let gpus = detect_gpu();
    let total_vram: u64 = gpus.iter().map(|g| g.vram_mb).sum();
    let total_tflops: f64 = gpus.iter().map(|g| g.tflops_fp16).sum();
    let gpu_count = gpus.len() as u32;

    GpuCapabilities {
        total_vram_mb: total_vram,
        total_tflops,
        gpu_count,
        best_backend: detect_best_backend(),
        has_cuda: cfg!(target_os = "windows") || cfg!(target_os = "linux"),
        has_metal: cfg!(target_os = "macos"),
        has_vulkan: true,
        has_rocm: cfg!(target_os = "linux"),
        is_datacenter: gpu_count > 50 || total_tflops > 500.0,
        gpus,
    }
}

fn hostname() -> String {
    std::env::var("COMPUTERNAME")
        .or_else(|_| std::env::var("HOSTNAME"))
        .unwrap_or_else(|_| "unknown".to_string())
}

fn detect_vendor() -> String {
    if cfg!(target_os = "macos") {
        "Apple".to_string()
    } else {
        "NVIDIA/AMD".to_string()
    }
}

fn detect_best_backend() -> String {
    if cfg!(target_os = "macos") {
        "Metal".to_string()
    } else if cfg!(target_os = "windows") {
        "CUDA".to_string()
    } else {
        "Vulkan".to_string()
    }
}

fn detect_vram() -> u64 {
    if cfg!(target_os = "macos") {
        16384
    } else if cfg!(target_os = "windows") {
        detect_windows_vram()
    } else {
        12288
    }
}

#[cfg(target_os = "windows")]
fn detect_windows_vram() -> u64 {
    use std::process::Command;
    let output = Command::new("wmic")
        .args(["path", "win32_videocontroller", "get", "adapterram"])
        .output();
    if let Ok(out) = output {
        let stdout = String::from_utf8_lossy(&out.stdout);
        for line in stdout.lines().skip(1) {
            let trimmed = line.trim();
            if let Ok(bytes) = trimmed.parse::<u64>() {
                return bytes / 1_048_576;
            }
        }
    }
    12288
}

#[cfg(not(target_os = "windows"))]
fn detect_windows_vram() -> u64 {
    12288
}

fn detect_tflops() -> f64 {
    if cfg!(target_os = "macos") {
        match std::env::var("SKYNET_GPU_MODEL").as_deref() {
            Ok("m4_ultra") => 18.0,
            Ok("m4_max") => 11.0,
            Ok("m4_pro") => 4.5,
            Ok("m3_max") => 9.0,
            _ => 7.0,
        }
    } else if cfg!(target_os = "windows") {
        match std::env::var("SKYNET_GPU_MODEL").as_deref() {
            Ok("rtx_5090") => 120.0,
            Ok("rtx_4090") => 82.0,
            Ok("rtx_4080") => 48.0,
            Ok("rtx_4070") => 29.0,
            Ok("rtx_4060") => 15.0,
            Ok("a100") => 312.0,
            Ok("h100") => 989.0,
            Ok("h200") => 990.0,
            _ => 20.0,
        }
    } else {
        match std::env::var("SKYNET_GPU_MODEL").as_deref() {
            Ok("mi300x") => 653.0,
            Ok("mi250") => 362.0,
            _ => 15.0,
        }
    }
}
