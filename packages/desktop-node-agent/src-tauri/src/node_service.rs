use serde::Serialize;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};

static NODE_RUNNING: AtomicBool = AtomicBool::new(false);
static TASKS_COMPLETED: AtomicU64 = AtomicU64::new(0);
static TOKENS_PROCESSED: AtomicU64 = AtomicU64::new(0);
static WATCHDOG_RESTARTS: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Serialize)]
pub struct NodeStatus {
    pub running: bool,
    pub uptime_seconds: u64,
    pub tasks_completed: u64,
    pub tokens_processed: u64,
    pub watchdog_restarts: u64,
    pub earnings_usdc: f64,
    pub current_gpu_load: f32,
}

#[tauri::command]
pub async fn start_node() -> Result<String, String> {
    if NODE_RUNNING.load(Ordering::SeqCst) {
        return Ok("Node already running".to_string());
    }
    NODE_RUNNING.store(true, Ordering::SeqCst);
    spawn_watchdog();
    Ok("SKYNET node started".to_string())
}

#[tauri::command]
pub async fn stop_node() -> Result<String, String> {
    if !NODE_RUNNING.load(Ordering::SeqCst) {
        return Err("Node not running".to_string());
    }
    NODE_RUNNING.store(false, Ordering::SeqCst);
    Ok("SKYNET node stopped".to_string())
}

#[tauri::command]
pub fn get_node_status() -> NodeStatus {
    let uptime = if NODE_RUNNING.load(Ordering::SeqCst) {
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .unwrap_or_default()
            .as_secs()
    } else {
        0
    };
    NodeStatus {
        running: NODE_RUNNING.load(Ordering::SeqCst),
        uptime_seconds: uptime,
        tasks_completed: TASKS_COMPLETED.load(Ordering::Relaxed),
        tokens_processed: TOKENS_PROCESSED.load(Ordering::Relaxed),
        watchdog_restarts: WATCHDOG_RESTARTS.load(Ordering::Relaxed),
        earnings_usdc: 0.0,
        current_gpu_load: 0.0,
    }
}

// ─── Watchdog ─────────────────────────────────────────────────────────

fn spawn_watchdog() {
    tauri::async_runtime::spawn(async {
        let mut consecutive_failures = 0u32;
        loop {
            if !NODE_RUNNING.load(Ordering::SeqCst) {
                break;
            }
            match health_check().await {
                Ok(()) => {
                    consecutive_failures = 0;
                }
                Err(e) => {
                    consecutive_failures += 1;
                    eprintln!("[SKYNET] Watchdog error ({}): {}", consecutive_failures, e);
                    if consecutive_failures >= 3 {
                        eprintln!("[SKYNET] Watchdog restarting node...");
                        WATCHDOG_RESTARTS.fetch_add(1, Ordering::Relaxed);
                        restart_node().await;
                        consecutive_failures = 0;
                    }
                }
            }
            tokio::time::sleep(tokio::time::Duration::from_secs(10)).await;
        }
    });
}

async fn health_check() -> Result<(), String> {
    // Heartbeat via CRDT would go here
    if !NODE_RUNNING.load(Ordering::SeqCst) {
        return Err("Node stopped".to_string());
    }
    Ok(())
}

async fn restart_node() {
    NODE_RUNNING.store(false, Ordering::SeqCst);
    tokio::time::sleep(tokio::time::Duration::from_secs(2)).await;
    NODE_RUNNING.store(true, Ordering::SeqCst);
}

// ─── Stats ────────────────────────────────────────────────────────────

#[allow(dead_code)]
pub fn increment_tasks(n: u64) {
    TASKS_COMPLETED.fetch_add(n, Ordering::Relaxed);
}

#[allow(dead_code)]
pub fn increment_tokens(n: u64) {
    TOKENS_PROCESSED.fetch_add(n, Ordering::Relaxed);
}
