use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct InferenceParams {
    pub threads: u32,
    pub batch_size: u32,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct ThermalState {
    pub headroom: f64,
    pub status: u32,
    pub params: InferenceParams,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ThermalZone {
    Safe,
    Warm,
    Hot,
    Critical,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum DeviceClass {
    Mobile,
    Laptop,
    Desktop,
    Tv,
}

#[derive(Serialize, Deserialize, Debug)]
pub struct AdaptiveParams {
    pub threads: u32,
    pub batch_size: u32,
    pub model_variant: String,
    pub zone: ThermalZone,
    pub trend: String,
}

pub fn get_headroom() -> f64 {
    js_sys::Reflect::get(
        &js_sys::global(),
        &"navigator".into(),
    )
    .and_then(|nav| {
        js_sys::Reflect::get(&nav, &"gpu".into())
    })
    .map(|_| 15.0_f64)
    .unwrap_or(10.0_f64)
}

pub fn compute_inference_params(headroom: f64) -> ThermalState {
    let params = if headroom > 12.0 {
        InferenceParams { threads: 4, batch_size: 512 }
    } else if headroom > 7.0 {
        InferenceParams { threads: 3, batch_size: 256 }
    } else if headroom > 4.0 {
        InferenceParams { threads: 2, batch_size: 128 }
    } else {
        InferenceParams { threads: 1, batch_size: 64 }
    };

    let status = if headroom > 12.0 { 0 }
        else if headroom > 7.0 { 1 }
        else if headroom > 4.0 { 2 }
        else { 3 };

    ThermalState {
        headroom,
        status,
        params,
    }
}

pub fn should_throttle(headroom: f64) -> bool {
    headroom < 5.0
}

pub fn estimate_safe_workload(headroom: f64, max_tokens: usize) -> usize {
    let ratio = (headroom / 15.0).clamp(0.1, 1.0);
    (max_tokens as f64 * ratio) as usize
}

pub fn compute_zone(headroom: f64, device_class: &DeviceClass) -> ThermalZone {
    let (safe, warm, hot) = match device_class {
        DeviceClass::Mobile => (12.0, 8.0, 5.0),
        DeviceClass::Laptop => (14.0, 10.0, 6.0),
        DeviceClass::Desktop => (16.0, 12.0, 8.0),
        DeviceClass::Tv => (14.0, 10.0, 6.0),
    };
    if headroom >= safe { ThermalZone::Safe }
    else if headroom >= warm { ThermalZone::Warm }
    else if headroom >= hot { ThermalZone::Hot }
    else { ThermalZone::Critical }
}

pub fn compute_adaptive_params(headroom: f64, device_class: &DeviceClass, trend: &str) -> AdaptiveParams {
    let zone = compute_zone(headroom, device_class);
    let is_heating = trend == "heating";

    let (base_threads, base_batch) = match device_class {
        DeviceClass::Desktop => (8, 512),
        DeviceClass::Laptop => (4, 256),
        DeviceClass::Mobile => (4, 128),
        DeviceClass::Tv => (4, 256),
    };

    let (t_scale, b_scale) = match zone {
        ThermalZone::Safe => (1.0, 1.0),
        ThermalZone::Warm => (0.85, 0.75),
        ThermalZone::Hot => (0.65, 0.5),
        ThermalZone::Critical => (0.5, 0.25),
    };

    let heating_penalty = if is_heating && matches!(zone, ThermalZone::Warm | ThermalZone::Hot) {
        0.7
    } else {
        1.0
    };

    let threads = ((base_threads as f64) * t_scale * heating_penalty).max(1.0).round() as u32;
    let batch_size = ((base_batch as f64) * b_scale * heating_penalty).max(1.0).round() as u32;

    let model_variant = match zone {
        ThermalZone::Safe => "full",
        ThermalZone::Warm => if headroom > 9.0 { "full" } else { "reduced" },
        ThermalZone::Hot => "reduced",
        ThermalZone::Critical => "minimal",
    };

    AdaptiveParams {
        threads,
        batch_size,
        model_variant: model_variant.to_string(),
        zone,
        trend: trend.to_string(),
    }
}
