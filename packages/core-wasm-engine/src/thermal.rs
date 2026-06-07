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
