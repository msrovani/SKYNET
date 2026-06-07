use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum FailureCategory {
    ThermalThrottle, NodeTimeout, ModelOom, TaskCrash, NetworkDegraded, ConfigCorrupt, Unknown
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FailureEvent {
    pub category: FailureCategory,
    pub message: String,
    pub node_id: String,
    pub timestamp: u64,
    pub task_id: Option<String>,
    pub context: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryPlan {
    pub plan_id: String,
    pub steps: Vec<RecoveryStep>,
    pub estimated_secs: u64,
    pub risk: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RecoveryStep {
    pub action: String,
    pub target: String,
    pub params: HashMap<String, String>,
    pub timeout_secs: u64,
    pub critical: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MossReport {
    pub failure_id: String,
    pub accepted: bool,
    pub plan: Option<RecoveryPlan>,
    pub circuit_open: bool,
    pub abort_reason: Option<String>,
}

const MAX_CONSECUTIVE_FAILURES: u32 = 5;
const CIRCUIT_COOLDOWN_SECS: u64 = 60;

pub struct MossOrchestrator {
    consecutive_failures: u32,
    circuit_open: bool,
    circuit_timer: u64,
    recovery_history: Vec<RecoveryPlan>,
}

impl MossOrchestrator {
    pub fn new() -> Self {
        MossOrchestrator {
            consecutive_failures: 0,
            circuit_open: false,
            circuit_timer: 0,
            recovery_history: Vec::new(),
        }
    }

    pub fn ingest_failure(&mut self, event: &FailureEvent) -> MossReport {
        if self.circuit_open {
            let elapsed = event.timestamp - self.circuit_timer;
            if elapsed >= CIRCUIT_COOLDOWN_SECS {
                self.circuit_open = false;
                self.consecutive_failures = 0;
            } else {
                return MossReport {
                    failure_id: format!("fail_{}", event.timestamp),
                    accepted: false,
                    plan: None,
                    circuit_open: true,
                    abort_reason: Some(format!("Circuit breaker open for {}s more", CIRCUIT_COOLDOWN_SECS - elapsed)),
                };
            }
        }

        self.consecutive_failures += 1;

        if self.consecutive_failures >= MAX_CONSECUTIVE_FAILURES {
            self.circuit_open = true;
            self.circuit_timer = event.timestamp;
            return MossReport {
                failure_id: format!("fail_{}", event.timestamp),
                accepted: false,
                plan: None,
                circuit_open: true,
                abort_reason: Some(format!("{} consecutive failures — circuit open for {}s", MAX_CONSECUTIVE_FAILURES, CIRCUIT_COOLDOWN_SECS)),
            };
        }

        let plan = self.generate_plan(event);
        self.recovery_history.push(plan.clone());
        MossReport {
            failure_id: format!("fail_{}", event.timestamp),
            accepted: true,
            plan: Some(plan),
            circuit_open: false,
            abort_reason: None,
        }
    }

    fn generate_plan(&self, event: &FailureEvent) -> RecoveryPlan {
        let steps = match event.category {
            FailureCategory::ThermalThrottle => vec![
                RecoveryStep {
                    action: "migrate_tasks".into(), target: event.node_id.clone(),
                    params: HashMap::from([("strategy".into(), "thermal_offload".into())]),
                    timeout_secs: 10, critical: true,
                },
                RecoveryStep {
                    action: "reduce_batch".into(), target: event.node_id.clone(),
                    params: HashMap::from([("reduction".into(), "50%".into())]),
                    timeout_secs: 5, critical: false,
                },
                RecoveryStep {
                    action: "notify_mesh".into(), target: "mesh_all".into(),
                    params: HashMap::from([("reason".into(), "throttle".into())]),
                    timeout_secs: 3, critical: false,
                },
            ],
            FailureCategory::NodeTimeout => vec![
                RecoveryStep {
                    action: "redistribute_tasks".into(), target: event.node_id.clone(),
                    params: HashMap::from([("scope".into(), "all".into())]),
                    timeout_secs: 15, critical: true,
                },
                RecoveryStep {
                    action: "health_check".into(), target: event.node_id.clone(),
                    params: HashMap::new(), timeout_secs: 10, critical: true,
                },
            ],
            FailureCategory::ModelOom => vec![
                RecoveryStep {
                    action: "reduce_batch".into(), target: event.node_id.clone(),
                    params: HashMap::from([("reduction".into(), "75%".into())]),
                    timeout_secs: 5, critical: true,
                },
                RecoveryStep {
                    action: "compact_cache".into(), target: event.node_id.clone(),
                    params: HashMap::new(), timeout_secs: 10, critical: false,
                },
            ],
            FailureCategory::TaskCrash => vec![
                RecoveryStep {
                    action: "restart_task".into(), target: event.task_id.clone().unwrap_or_default(),
                    params: HashMap::from([("fallback_node".into(), "auto".into())]),
                    timeout_secs: 10, critical: true,
                },
            ],
            FailureCategory::NetworkDegraded => vec![
                RecoveryStep {
                    action: "switch_transport".into(), target: event.node_id.clone(),
                    params: HashMap::from([("fallback".into(), "webrtc".into())]),
                    timeout_secs: 5, critical: true,
                },
                RecoveryStep {
                    action: "notify_mesh".into(), target: "mesh_all".into(),
                    params: HashMap::from([("reason".into(), "degraded".into())]),
                    timeout_secs: 3, critical: false,
                },
            ],
            FailureCategory::ConfigCorrupt => vec![
                RecoveryStep {
                    action: "rollback_config".into(), target: event.node_id.clone(),
                    params: HashMap::from([("snapshot".into(), "last_good".into())]),
                    timeout_secs: 10, critical: true,
                },
                RecoveryStep {
                    action: "restart_node".into(), target: event.node_id.clone(),
                    params: HashMap::new(), timeout_secs: 30, critical: true,
                },
            ],
            FailureCategory::Unknown => vec![
                RecoveryStep {
                    action: "diagnose".into(), target: event.node_id.clone(),
                    params: HashMap::new(), timeout_secs: 15, critical: true,
                },
                RecoveryStep {
                    action: "escalate".into(), target: "L3".into(),
                    params: HashMap::from([("reason".into(), "unknown_failure".into())]),
                    timeout_secs: 10, critical: false,
                },
            ],
        };

        let total_secs: u64 = steps.iter().map(|s| s.timeout_secs).sum();
        RecoveryPlan {
            plan_id: format!("plan_{}", event.timestamp),
            steps,
            estimated_secs: total_secs,
            risk: (self.consecutive_failures as f64 / MAX_CONSECUTIVE_FAILURES as f64).min(1.0),
        }
    }

    pub fn is_healthy(&self) -> bool {
        !self.circuit_open && self.consecutive_failures < 3
    }

    pub fn reset(&mut self) {
        self.consecutive_failures = 0;
        self.circuit_open = false;
    }
}

use std::sync::Mutex;
static MOSS_INSTANCE: once_cell::sync::Lazy<Mutex<MossOrchestrator>> =
    once_cell::sync::Lazy::new(|| Mutex::new(MossOrchestrator::new()));

#[tauri::command]
pub fn ingest_failure(category: String, message: String, node_id: String, timestamp: u64) -> String {
    let cat = match category.to_lowercase().as_str() {
        "thermal" => FailureCategory::ThermalThrottle,
        "timeout" => FailureCategory::NodeTimeout,
        "oom" => FailureCategory::ModelOom,
        "crash" => FailureCategory::TaskCrash,
        "network" => FailureCategory::NetworkDegraded,
        "config" => FailureCategory::ConfigCorrupt,
        _ => FailureCategory::Unknown,
    };
    let event = FailureEvent {
        category: cat, message, node_id, timestamp,
        task_id: None, context: HashMap::new(),
    };
    let report = MOSS_INSTANCE.lock().unwrap().ingest_failure(&event);
    serde_json::to_string(&report).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub fn get_moss_status() -> String {
    let m = MOSS_INSTANCE.lock().unwrap();
    serde_json::to_string(&serde_json::json!({
        "healthy": m.is_healthy(),
        "circuit_open": m.circuit_open,
        "consecutive_failures": m.consecutive_failures,
    })).unwrap_or_else(|_| "{}".to_string())
}

#[tauri::command]
pub fn reset_moss() -> String {
    MOSS_INSTANCE.lock().unwrap().reset();
    "MOSS reset OK".to_string()
}
