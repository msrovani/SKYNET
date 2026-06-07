#![allow(dead_code)]

use wasm_bindgen::prelude::*;

mod tensor;
mod webgpu;
mod thermal;
mod capability;
mod evolution;
mod autonomous;
mod knowledge_graph;
mod context_prune;

#[wasm_bindgen]
pub fn get_thermal_headroom() -> f64 {
    thermal::get_headroom()
}

#[wasm_bindgen]
pub fn compute_optimal_params(headroom: f64) -> JsValue {
    let params = thermal::compute_inference_params(headroom);
    serde_wasm_bindgen::to_value(&params).unwrap_or(JsValue::NULL)
}

// -- Capability exports --

#[wasm_bindgen]
pub fn compute_capability_score(cap: &capability::NodeCapability) -> f64 {
    cap.score()
}

// -- Evolution exports --

#[wasm_bindgen]
pub fn create_evolution_engine() -> JsValue {
    let engine = evolution::EvolutionEngine::new();
    serde_wasm_bindgen::to_value(&engine).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn evolve_population(engine: JsValue) -> JsValue {
    let mut engine: evolution::EvolutionEngine =
        serde_wasm_bindgen::from_value(engine).unwrap_or(evolution::EvolutionEngine::new());
    let pop = engine.evolve();
    serde_wasm_bindgen::to_value(&pop).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn report_fitness(engine: JsValue, params: JsValue, report: JsValue) -> JsValue {
    let mut engine: evolution::EvolutionEngine =
        serde_wasm_bindgen::from_value(engine).unwrap_or(evolution::EvolutionEngine::new());
    if let Ok(p) = serde_wasm_bindgen::from_value::<evolution::EvolvableParams>(params) {
        if let Ok(r) = serde_wasm_bindgen::from_value::<evolution::FitnessReport>(report) {
            engine.report_fitness(&p, &r);
        }
    }
    serde_wasm_bindgen::to_value(&engine).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn get_best_params(engine: JsValue) -> JsValue {
    let engine: evolution::EvolutionEngine =
        serde_wasm_bindgen::from_value(engine).unwrap_or(evolution::EvolutionEngine::new());
    serde_wasm_bindgen::to_value(engine.best()).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn create_fitness_report(
    throughput: f64, latency: f64, thermal: f64, earnings: f64, success: f64,
) -> JsValue {
    let report = evolution::FitnessReport {
        throughput_tok_s: throughput,
        avg_latency_ms: latency,
        thermal_throttle_pct: thermal,
        earnings_per_hour: earnings,
        success_rate: success,
    };
    serde_wasm_bindgen::to_value(&report).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn compute_fitness_score(report: JsValue) -> f64 {
    if let Ok(r) = serde_wasm_bindgen::from_value::<evolution::FitnessReport>(report) {
        r.combined_score()
    } else {
        0.0
    }
}

// -- Knowledge Graph exports --

#[wasm_bindgen]
pub fn create_knowledge_graph() -> JsValue {
    let kg = knowledge_graph::KnowledgeGraph::new();
    serde_wasm_bindgen::to_value(&kg).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn kg_add_node(kg: JsValue, id: &str, node_type: &str, weight: f64) -> JsValue {
    let mut kg: knowledge_graph::KnowledgeGraph =
        serde_wasm_bindgen::from_value(kg).unwrap_or(knowledge_graph::KnowledgeGraph::new());
    let nt = match node_type {
        "compute" => knowledge_graph::NodeType::ComputeNode,
        "task" => knowledge_graph::NodeType::Task,
        "shard" => knowledge_graph::NodeType::ModelShard,
        "failure" => knowledge_graph::NodeType::Failure,
        _ => knowledge_graph::NodeType::Metric,
    };
    kg.add_node(id, nt, weight);
    serde_wasm_bindgen::to_value(&kg).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn kg_add_edge(kg: JsValue, from: &str, to: &str, edge_type: &str, weight: f64) -> JsValue {
    let mut kg: knowledge_graph::KnowledgeGraph =
        serde_wasm_bindgen::from_value(kg).unwrap_or(knowledge_graph::KnowledgeGraph::new());
    let et = match edge_type {
        "depends" => knowledge_graph::EdgeType::DependsOn,
        "improves" => knowledge_graph::EdgeType::Improves,
        "causes" => knowledge_graph::EdgeType::Causes,
        "optimizes" => knowledge_graph::EdgeType::Optimizes,
        "fails_with" => knowledge_graph::EdgeType::FailsWith,
        _ => knowledge_graph::EdgeType::Mitigates,
    };
    kg.add_edge(from, to, et, weight);
    serde_wasm_bindgen::to_value(&kg).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn kg_thermal_cascade(kg: JsValue, node: &str) -> JsValue {
    if let Ok(kg) = serde_wasm_bindgen::from_value::<knowledge_graph::KnowledgeGraph>(kg) {
        let cascade = kg.get_thermal_cascade(node);
        return serde_wasm_bindgen::to_value(&cascade).unwrap_or(JsValue::NULL);
    }
    JsValue::NULL
}

// -- Context Prune exports --

#[wasm_bindgen]
pub fn prune_context_wasm(items: JsValue, target_ratio: f64) -> JsValue {
    if let Ok(items) = serde_wasm_bindgen::from_value::<Vec<context_prune::ContextItem>>(items) {
        let (kept, _) = context_prune::prune_context(&items, target_ratio);
        return serde_wasm_bindgen::to_value(&kept).unwrap_or(JsValue::NULL);
    }
    JsValue::NULL
}

// -- Tensor Sharding exports --

#[wasm_bindgen]
pub fn shard_tensor_rowwise(tensor_id: &str, data: &[f32], rows: usize, cols: usize, num_shards: usize) -> JsValue {
    let shards = tensor::shard_rowwise(tensor_id, data, rows, cols, num_shards);
    serde_wasm_bindgen::to_value(&shards).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn shard_tensor_colwise(tensor_id: &str, data: &[f32], rows: usize, cols: usize, num_shards: usize) -> JsValue {
    let shards = tensor::shard_colwise(tensor_id, data, rows, cols, num_shards);
    serde_wasm_bindgen::to_value(&shards).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn reconstruct_tensor(shards: JsValue, rows: usize, cols: usize) -> JsValue {
    if let Ok(shards) = serde_wasm_bindgen::from_value::<Vec<tensor::TensorShard>>(shards) {
        let desc = tensor::reconstruct_from_shards(&shards, rows, cols);
        return serde_wasm_bindgen::to_value(&desc).unwrap_or(JsValue::NULL);
    }
    JsValue::NULL
}

#[wasm_bindgen]
pub fn verify_tensor_shard(shard: JsValue) -> bool {
    if let Ok(shard) = serde_wasm_bindgen::from_value::<tensor::TensorShard>(shard) {
        tensor::verify_shard(&shard)
    } else {
        false
    }
}
