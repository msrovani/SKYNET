use serde::{Deserialize, Serialize};

const POPULATION_SIZE: usize = 20;
const TOURNAMENT_SIZE: usize = 3;
const MUTATION_RATE: f64 = 0.15;
const ELITE_COUNT: usize = 2;
const CROSSOVER_RATE: f64 = 0.7;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolvableParams {
    pub model: String,
    pub batch_size: u32,
    pub thread_count: u32,
    pub thermal_threshold: f64,
    pub dsd_draft_len: u32,
    pub cache_ttl_secs: u32,
    pub election_interval_secs: u32,
    pub l3_heartbeat_secs: u32,
}

impl EvolvableParams {
    pub fn default() -> Self {
        EvolvableParams {
            model: "default".to_string(),
            batch_size: 256,
            thread_count: 2,
            thermal_threshold: 7.0,
            dsd_draft_len: 4,
            cache_ttl_secs: 60,
            election_interval_secs: 15,
            l3_heartbeat_secs: 5,
        }
    }

    pub fn crossover(&self, other: &EvolvableParams) -> EvolvableParams {
        EvolvableParams {
            model: self.model.clone(),
            batch_size: if fastrand::f64() < 0.5 { self.batch_size } else { other.batch_size },
            thread_count: if fastrand::f64() < 0.5 { self.thread_count } else { other.thread_count },
            thermal_threshold: if fastrand::f64() < 0.5 { self.thermal_threshold } else { other.thermal_threshold },
            dsd_draft_len: if fastrand::f64() < 0.5 { self.dsd_draft_len } else { other.dsd_draft_len },
            cache_ttl_secs: if fastrand::f64() < 0.5 { self.cache_ttl_secs } else { other.cache_ttl_secs },
            election_interval_secs: if fastrand::f64() < 0.5 { self.election_interval_secs } else { other.election_interval_secs },
            l3_heartbeat_secs: if fastrand::f64() < 0.5 { self.l3_heartbeat_secs } else { other.l3_heartbeat_secs },
        }
    }

    pub fn mutate(&self) -> EvolvableParams {
        let mut p = self.clone();
        if fastrand::f64() < MUTATION_RATE {
            p.batch_size = Self::clamp_mutate(p.batch_size, 32, 512, 32);
        }
        if fastrand::f64() < MUTATION_RATE {
            p.thread_count = Self::clamp_mutate(p.thread_count, 1, 4, 1);
        }
        if fastrand::f64() < MUTATION_RATE {
            p.thermal_threshold = (p.thermal_threshold + fastrand::f64() * 4.0 - 2.0).clamp(2.0, 15.0);
        }
        if fastrand::f64() < MUTATION_RATE {
            p.dsd_draft_len = Self::clamp_mutate(p.dsd_draft_len, 1, 16, 1);
        }
        if fastrand::f64() < MUTATION_RATE {
            p.cache_ttl_secs = Self::clamp_mutate(p.cache_ttl_secs, 1, 300, 10);
        }
        if fastrand::f64() < MUTATION_RATE {
            p.election_interval_secs = Self::clamp_mutate(p.election_interval_secs, 5, 60, 5);
        }
        if fastrand::f64() < MUTATION_RATE {
            p.l3_heartbeat_secs = Self::clamp_mutate(p.l3_heartbeat_secs, 1, 30, 1);
        }
        p
    }

    fn clamp_mutate(value: u32, min: u32, max: u32, step: u32) -> u32 {
        let delta: i32 = if fastrand::bool() { step as i32 } else { -(step as i32) };
        ((value as i32 + delta).clamp(min as i32, max as i32)) as u32
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FitnessReport {
    pub throughput_tok_s: f64,
    pub avg_latency_ms: f64,
    pub thermal_throttle_pct: f64,
    pub earnings_per_hour: f64,
    pub success_rate: f64,
}

impl FitnessReport {
    pub fn combined_score(&self) -> f64 {
        let throughput = (self.throughput_tok_s / 100.0).min(1.0);
        let latency = 1.0 - (self.avg_latency_ms / 500.0).min(1.0);
        let thermal = 1.0 - (self.thermal_throttle_pct / 100.0);
        let earnings = (self.earnings_per_hour / 10.0).min(1.0);
        let success = self.success_rate;
        0.30 * throughput + 0.25 * latency + 0.20 * thermal + 0.15 * earnings + 0.10 * success
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvolutionEngine {
    population: Vec<(EvolvableParams, f64)>,
    generation: u32,
    pub best_ever: Option<(EvolvableParams, f64)>,
}

impl EvolutionEngine {
    pub fn new() -> Self {
        let mut population = Vec::with_capacity(POPULATION_SIZE);
        population.push((EvolvableParams::default(), 0.0));
        for _ in 1..POPULATION_SIZE {
            population.push((EvolvableParams::default().mutate(), 0.0));
        }
        EvolutionEngine {
            population,
            generation: 0,
            best_ever: None,
        }
    }

    pub fn best(&self) -> &EvolvableParams {
        &self.population.iter()
            .max_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal))
            .map(|(p, _)| p)
            .unwrap_or(&self.population[0].0)
    }

    pub fn generation(&self) -> u32 {
        self.generation
    }

    pub fn report_fitness(&mut self, params: &EvolvableParams, report: &FitnessReport) {
        let score = report.combined_score();
        for (p, s) in self.population.iter_mut() {
            if p.model == params.model {
                *s = score;
                break;
            }
        }
    }

    pub fn evolve(&mut self) -> Vec<EvolvableParams> {
        self.generation += 1;
        self.population.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

        if let Some((_, best_score)) = self.population.first() {
            let update = self.best_ever.as_ref()
                .map(|(_, s)| *best_score > *s)
                .unwrap_or(true);
            if update {
                self.best_ever = Some((self.population[0].0.clone(), *best_score));
            }
        }

        let mut next_gen: Vec<(EvolvableParams, f64)> = Vec::with_capacity(POPULATION_SIZE);

        for i in 0..ELITE_COUNT.min(POPULATION_SIZE) {
            next_gen.push((self.population[i].0.clone(), 0.0));
        }

        while next_gen.len() < POPULATION_SIZE {
            let parent_a = self.tournament_select();
            let parent_b = self.tournament_select();
            let child = if fastrand::f64() < CROSSOVER_RATE {
                parent_a.crossover(parent_b)
            } else {
                parent_a.clone()
            };
            next_gen.push((child.mutate(), 0.0));
        }

        self.population = next_gen;
        self.population.iter().map(|(p, _)| p.clone()).collect()
    }

    fn tournament_select(&self) -> &EvolvableParams {
        let mut best_idx = fastrand::usize(..self.population.len());
        for _ in 1..TOURNAMENT_SIZE {
            let idx = fastrand::usize(..self.population.len());
            if self.population[idx].1 > self.population[best_idx].1 {
                best_idx = idx;
            }
        }
        &self.population[best_idx].0
    }
}
