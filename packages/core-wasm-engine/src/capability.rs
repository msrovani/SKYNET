use serde::{Deserialize, Serialize};
use wasm_bindgen::prelude::*;

#[wasm_bindgen]
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NodeCapability {
    pub gpu_tflops: f64,
    pub vram_gb: u32,
    pub bandwidth_gbps: f64,
    pub uptime_pct: f64,
    pub latency_ms: f64,
    pub gpu_count: u32,
    pub is_datacenter: bool,
}

#[wasm_bindgen]
impl NodeCapability {
    #[wasm_bindgen(constructor)]
    pub fn new(
        gpu_tflops: f64,
        vram_gb: u32,
        bandwidth_gbps: f64,
        uptime_pct: f64,
        latency_ms: f64,
        gpu_count: u32,
    ) -> NodeCapability {
        let total_tflops = gpu_tflops * gpu_count as f64;
        NodeCapability {
            gpu_tflops,
            vram_gb,
            bandwidth_gbps,
            uptime_pct,
            latency_ms,
            gpu_count,
            is_datacenter: gpu_count > 50 || total_tflops > 500.0,
        }
    }

    pub fn score(&self) -> f64 {
        self.gpu_tflops * self.vram_gb as f64 * self.uptime_pct / self.latency_ms.max(1.0)
    }

    pub fn is_l3_candidate(&self, next_best_score: f64) -> bool {
        self.score() > next_best_score * 10.0 && self.is_datacenter
    }

    pub fn max_model_params_b(&self) -> f64 {
        let vram_limit = self.vram_gb as f64 / 4.8;
        let tflops_limit = self.gpu_tflops * self.gpu_count as f64 / 60.0;
        vram_limit.min(tflops_limit).max(0.5)
    }

    pub fn tier(&self) -> String {
        if self.is_datacenter {
            "L3".to_string()
        } else if self.gpu_tflops > 50.0 {
            "L2".to_string()
        } else if self.gpu_tflops > 10.0 {
            "L1".to_string()
        } else {
            "L0".to_string()
        }
    }
}

#[wasm_bindgen]
pub fn compare_capabilities(local: &NodeCapability, peer_score: f64) -> String {
    if local.is_l3_candidate(peer_score) {
        "L3_candidate".to_string()
    } else if local.score() > peer_score {
        "superior".to_string()
    } else if (local.score() - peer_score).abs() < 0.01 {
        "equal".to_string()
    } else {
        "inferior".to_string()
    }
}
