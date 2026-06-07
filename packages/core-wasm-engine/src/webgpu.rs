use serde::{Serialize, Deserialize};

#[derive(Serialize, Deserialize, Debug)]
pub struct WebGpuContext {
    pub adapter_name: String,
    pub backend: String,
    pub max_buffer_size: u64,
    pub max_compute_workgroups_per_dimension: u32,
}

impl WebGpuContext {
    pub fn new() -> Self {
        WebGpuContext {
            adapter_name: "stub".to_string(),
            backend: "cpu".to_string(),
            max_buffer_size: 256 * 1024 * 1024,
            max_compute_workgroups_per_dimension: 256,
        }
    }
}
