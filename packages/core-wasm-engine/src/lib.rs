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
mod inference;
mod agent_runtime;

#[wasm_bindgen]
pub fn get_thermal_headroom() -> f64 {
    thermal::get_headroom()
}

#[wasm_bindgen]
pub fn compute_optimal_params(headroom: f64) -> JsValue {
    let params = thermal::compute_inference_params(headroom);
    serde_wasm_bindgen::to_value(&params).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn compute_thermal_zone(headroom: f64, device_class: &str) -> JsValue {
    let dc = match device_class {
        "mobile" => thermal::DeviceClass::Mobile,
        "laptop" => thermal::DeviceClass::Laptop,
        "desktop" => thermal::DeviceClass::Desktop,
        _ => thermal::DeviceClass::Mobile,
    };
    let zone = thermal::compute_zone(headroom, &dc);
    serde_wasm_bindgen::to_value(&zone).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn compute_adaptive_params(headroom: f64, device_class: &str, trend: &str) -> JsValue {
    let dc = match device_class {
        "mobile" => thermal::DeviceClass::Mobile,
        "laptop" => thermal::DeviceClass::Laptop,
        "desktop" => thermal::DeviceClass::Desktop,
        _ => thermal::DeviceClass::Mobile,
    };
    let params = thermal::compute_adaptive_params(headroom, &dc, trend);
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

// -- Inference / Sharded Pipeline exports --

#[wasm_bindgen]
pub fn create_transformer_config(
    num_layers: usize,
    hidden_dim: usize,
    num_heads: usize,
    head_dim: usize,
    ffn_hidden_dim: usize,
    vocab_size: usize,
    max_seq_len: usize,
) -> JsValue {
    let config = inference::TransformerConfig {
        num_layers,
        hidden_dim,
        num_heads,
        head_dim,
        ffn_hidden_dim,
        vocab_size,
        max_seq_len,
    };
    serde_wasm_bindgen::to_value(&config).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn build_pipeline_plan(config: JsValue, host_ids: JsValue) -> JsValue {
    let cfg: inference::TransformerConfig =
        serde_wasm_bindgen::from_value(config).unwrap_or(inference::TransformerConfig {
            num_layers: 1,
            hidden_dim: 64,
            num_heads: 2,
            head_dim: 32,
            ffn_hidden_dim: 128,
            vocab_size: 1000,
            max_seq_len: 128,
        });
    let hosts: Vec<String> = serde_wasm_bindgen::from_value(host_ids).unwrap_or_default();
    let plan = inference::build_pipeline_plan(&cfg, &hosts);
    serde_wasm_bindgen::to_value(&plan).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn build_sharded_pipeline_plan(config: JsValue, host_ids: JsValue, shards_per_layer: usize) -> JsValue {
    let cfg: inference::TransformerConfig =
        serde_wasm_bindgen::from_value(config).unwrap_or(inference::TransformerConfig {
            num_layers: 1,
            hidden_dim: 64,
            num_heads: 2,
            head_dim: 32,
            ffn_hidden_dim: 128,
            vocab_size: 1000,
            max_seq_len: 128,
        });
    let hosts: Vec<String> = serde_wasm_bindgen::from_value(host_ids).unwrap_or_default();
    let plan = inference::build_sharded_pipeline_plan(&cfg, &hosts, shards_per_layer);
    serde_wasm_bindgen::to_value(&plan).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn estimate_inference_memory(config: JsValue) -> JsValue {
    let cfg: inference::TransformerConfig =
        serde_wasm_bindgen::from_value(config).unwrap_or(inference::TransformerConfig {
            num_layers: 32,
            hidden_dim: 4096,
            num_heads: 32,
            head_dim: 128,
            ffn_hidden_dim: 14336,
            vocab_size: 128256,
            max_seq_len: 4096,
        });
    let est = inference::estimate_inference_memory(&cfg);
    serde_wasm_bindgen::to_value(&est).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn estimate_peer_memory(config: JsValue, plan: JsValue, host_id: &str) -> JsValue {
    let cfg: inference::TransformerConfig =
        serde_wasm_bindgen::from_value(config).unwrap_or(inference::TransformerConfig {
            num_layers: 32,
            hidden_dim: 4096,
            num_heads: 32,
            head_dim: 128,
            ffn_hidden_dim: 14336,
            vocab_size: 128256,
            max_seq_len: 4096,
        });
    let plan: inference::PipelinePlan = serde_wasm_bindgen::from_value(plan).unwrap_or(
        inference::build_pipeline_plan(&cfg, &[]),
    );
    let est = inference::estimate_peer_memory(&cfg, &plan, host_id);
    serde_wasm_bindgen::to_value(&est).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn create_kv_cache(config: JsValue) -> JsValue {
    let cfg: inference::TransformerConfig =
        serde_wasm_bindgen::from_value(config).unwrap_or(inference::TransformerConfig {
            num_layers: 32,
            hidden_dim: 4096,
            num_heads: 32,
            head_dim: 128,
            ffn_hidden_dim: 14336,
            vocab_size: 128256,
            max_seq_len: 4096,
        });
    let cache = inference::create_kv_cache(&cfg);
    serde_wasm_bindgen::to_value(&cache).unwrap_or(JsValue::NULL)
}

// -- Agent Runtime exports --

#[wasm_bindgen]
pub fn agent_runtime_new(config: JsValue) -> JsValue {
    if let Ok(cfg) = serde_wasm_bindgen::from_value::<agent_runtime::AgentConfig>(config) {
        let rt = agent_runtime::AgentRuntime::new(cfg);
        return serde_wasm_bindgen::to_value(&rt).unwrap_or(JsValue::NULL);
    }
    JsValue::NULL
}

#[wasm_bindgen]
pub fn agent_runtime_load(rt: JsValue) -> JsValue {
    let mut rt: agent_runtime::AgentRuntime =
        serde_wasm_bindgen::from_value(rt).unwrap_or(
            agent_runtime::AgentRuntime::new(agent_runtime::AgentConfig {
                agent_id: "fallback".into(),
                model_id: "none".into(),
                system_prompt: "".into(),
                tools: vec![],
                max_tokens: 0,
                temperature: 0.0,
            }),
        );
    match rt.load() {
        Ok(()) => serde_wasm_bindgen::to_value(&rt).unwrap_or(JsValue::NULL),
        Err(e) => JsValue::from_str(&e),
    }
}

#[wasm_bindgen]
pub fn agent_runtime_execute(rt: JsValue, input: JsValue) -> JsValue {
    let mut rt: agent_runtime::AgentRuntime =
        serde_wasm_bindgen::from_value(rt).unwrap_or(
            agent_runtime::AgentRuntime::new(agent_runtime::AgentConfig {
                agent_id: "fallback".into(),
                model_id: "none".into(),
                system_prompt: "".into(),
                tools: vec![],
                max_tokens: 0,
                temperature: 0.0,
            }),
        );
    if let Ok(inp) = serde_wasm_bindgen::from_value::<agent_runtime::AgentInput>(input) {
        match rt.execute(&inp) {
            Ok(output) => return serde_wasm_bindgen::to_value(&output).unwrap_or(JsValue::NULL),
            Err(e) => return JsValue::from_str(&e),
        }
    }
    JsValue::NULL
}

#[wasm_bindgen]
pub fn agent_runtime_state(rt: JsValue) -> JsValue {
    if let Ok(rt) = serde_wasm_bindgen::from_value::<agent_runtime::AgentRuntime>(rt) {
        return serde_wasm_bindgen::to_value(rt.state()).unwrap_or(JsValue::NULL);
    }
    JsValue::NULL
}

#[wasm_bindgen]
pub fn agent_runtime_reset(rt: JsValue) -> JsValue {
    let mut rt: agent_runtime::AgentRuntime =
        serde_wasm_bindgen::from_value(rt).unwrap_or(
            agent_runtime::AgentRuntime::new(agent_runtime::AgentConfig {
                agent_id: "fallback".into(),
                model_id: "none".into(),
                system_prompt: "".into(),
                tools: vec![],
                max_tokens: 0,
                temperature: 0.0,
            }),
        );
    rt.reset();
    serde_wasm_bindgen::to_value(&rt).unwrap_or(JsValue::NULL)
}

#[wasm_bindgen]
pub fn inference_checkpoint_forward(
    input: JsValue,
    weights: JsValue,
    hidden_dim: usize,
    layer_idx: usize,
    pos: usize,
) -> JsValue {
    let inp: Vec<f32> = serde_wasm_bindgen::from_value(input).unwrap_or_default();
    let wgt: Vec<f32> = serde_wasm_bindgen::from_value(weights).unwrap_or_default();
    let cp = inference::checkpoint_forward(&inp, &wgt, hidden_dim, layer_idx, pos);
    serde_wasm_bindgen::to_value(&cp).unwrap_or(JsValue::NULL)
}
