use crate::evolution::{EvolvableParams, EvolutionEngine, FitnessReport};
use js_sys;
use serde::{Deserialize, Serialize};

const EVOLUTION_INTERVAL_SECS: u64 = 3600;
const METRICS_WINDOW: usize = 100;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TelemetrySnapshot {
    pub throughput_tok_s: f64,
    pub avg_latency_ms: f64,
    pub thermal_throttle_pct: f64,
    pub earnings_per_hour: f64,
    pub success_rate: f64,
    pub active_peers: u32,
    pub gpu_load_pct: f32,
    pub params_in_use: EvolvableParams,
}

impl From<&TelemetryBuffer> for FitnessReport {
    fn from(buf: &TelemetryBuffer) -> Self {
        let n = buf.len().max(1) as f64;
        FitnessReport {
            throughput_tok_s: buf.throughput.iter().sum::<f64>() / n,
            avg_latency_ms: buf.latency.iter().sum::<f64>() / n,
            thermal_throttle_pct: buf.thermal.iter().sum::<f64>() / n,
            earnings_per_hour: buf.earnings.iter().sum::<f64>() / n,
            success_rate: buf.success.iter().filter(|&&s| s).count() as f64 / n,
        }
    }
}

struct TelemetryBuffer {
    throughput: Vec<f64>,
    latency: Vec<f64>,
    thermal: Vec<f64>,
    earnings: Vec<f64>,
    success: Vec<bool>,
}

impl TelemetryBuffer {
    fn new() -> Self {
        TelemetryBuffer {
            throughput: Vec::with_capacity(METRICS_WINDOW),
            latency: Vec::with_capacity(METRICS_WINDOW),
            thermal: Vec::with_capacity(METRICS_WINDOW),
            earnings: Vec::with_capacity(METRICS_WINDOW),
            success: Vec::with_capacity(METRICS_WINDOW),
        }
    }

    fn push(&mut self, ss: &TelemetrySnapshot) {
        if self.throughput.len() >= METRICS_WINDOW {
            self.throughput.remove(0);
            self.latency.remove(0);
            self.thermal.remove(0);
            self.earnings.remove(0);
            self.success.remove(0);
        }
        self.throughput.push(ss.throughput_tok_s);
        self.latency.push(ss.avg_latency_ms);
        self.thermal.push(ss.thermal_throttle_pct);
        self.earnings.push(ss.earnings_per_hour);
        self.success.push(ss.success_rate > 0.5);
    }

    fn len(&self) -> usize {
        self.throughput.len()
    }
}

pub struct AutonomousOrchestrator {
    evolution: EvolutionEngine,
    telemetry: TelemetryBuffer,
    current_params: EvolvableParams,
    experiment_params: Option<EvolvableParams>,
    experiment_start: f64,
    last_evolution: f64,
    step_count: u64,
}

impl AutonomousOrchestrator {
    pub fn new() -> Self {
        AutonomousOrchestrator {
            evolution: EvolutionEngine::new(),
            telemetry: TelemetryBuffer::new(),
            current_params: EvolvableParams::default(),
            experiment_params: None,
            experiment_start: js_sys::Date::now(),
            last_evolution: js_sys::Date::now(),
            step_count: 0,
        }
    }

    pub fn current_params(&self) -> &EvolvableParams {
        self.experiment_params.as_ref().unwrap_or(&self.current_params)
    }

    pub fn step(&mut self, snapshot: TelemetrySnapshot) {
        self.step_count += 1;
        self.telemetry.push(&snapshot);

        if self.telemetry.len() >= 10 {
            self.evaluate_experiment(&snapshot);
        }

        let elapsed = ((js_sys::Date::now() - self.last_evolution) / 1000.0) as u64;
        if elapsed >= EVOLUTION_INTERVAL_SECS && self.telemetry.len() >= 30 {
            self.run_evolution();
            self.last_evolution = js_sys::Date::now();
        }
    }

    fn evaluate_experiment(&mut self, snapshot: &TelemetrySnapshot) {
        if self.experiment_params.is_none() {
            if self.telemetry.len() >= 20 && fastrand::f64() < 0.1 {
                self.start_experiment();
            }
            return;
        }

        let experiment_duration = ((js_sys::Date::now() - self.experiment_start) / 1000.0) as u64;
        if experiment_duration >= 600 {
            self.conclude_experiment(snapshot);
        }
    }

    fn start_experiment(&mut self) {
        let candidate = self.current_params.mutate();
        self.experiment_params = Some(candidate);
        self.experiment_start = js_sys::Date::now();
    }

    fn conclude_experiment(&mut self, _current: &TelemetrySnapshot) {
        let report = FitnessReport::from(&self.telemetry);
        let experiment = self.experiment_params.take().unwrap();
        self.evolution.report_fitness(&experiment, &report);

        let best = self.evolution.best();
        if best.model != self.current_params.model {
            self.current_params = best.clone();
        }
    }

    fn run_evolution(&mut self) {
        let report = FitnessReport::from(&self.telemetry);
        self.evolution.report_fitness(&self.current_params, &report);
        let new_pop = self.evolution.evolve();
        if let Some(best) = new_pop.first() {
            self.current_params = best.clone();
        }
    }

    pub fn generation(&self) -> u32 {
        self.evolution.generation()
    }

    pub fn best_ever_score(&self) -> f64 {
        self.evolution.best_ever.as_ref().map(|(_, s)| *s).unwrap_or(0.0)
    }

    pub fn is_experimenting(&self) -> bool {
        self.experiment_params.is_some()
    }
}
