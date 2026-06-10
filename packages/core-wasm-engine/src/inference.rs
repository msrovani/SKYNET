use serde::{Deserialize, Serialize};

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TransformerConfig {
    pub num_layers: usize,
    pub hidden_dim: usize,
    pub num_heads: usize,
    pub head_dim: usize,
    pub ffn_hidden_dim: usize,
    pub vocab_size: usize,
    pub max_seq_len: usize,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PipelineLayerAssignment {
    pub layer_idx: usize,
    pub host_id: String,
    pub shard_idx: usize,
    pub total_shards: usize,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct PipelinePlan {
    pub config: TransformerConfig,
    pub layer_assignments: Vec<PipelineLayerAssignment>,
    pub num_hosts: usize,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct KVCacheEntry {
    pub layer_idx: usize,
    pub keys: Vec<f32>,
    pub values: Vec<f32>,
    pub seq_len: usize,
    pub num_heads: usize,
    pub head_dim: usize,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct ActivationCheckpoint {
    pub layer_idx: usize,
    pub input_data: Vec<f32>,
    pub output_data: Vec<f32>,
    pub hidden_dim: usize,
    pub seq_pos: usize,
}

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct InferenceMemoryEstimate {
    pub kv_cache_bytes: usize,
    pub activation_bytes: usize,
    pub weight_bytes: usize,
    pub total_bytes: usize,
    pub fits_in_vram_gb: f64,
}

pub fn build_pipeline_plan(config: &TransformerConfig, host_ids: &[String]) -> PipelinePlan {
    let num_hosts = host_ids.len();
    if num_hosts == 0 {
        return PipelinePlan { config: config.clone(), layer_assignments: vec![], num_hosts: 0 };
    }
    let total_layers = config.num_layers;
    let mut layer_assignments = Vec::with_capacity(total_layers);

    for layer_idx in 0..total_layers {
        let host_idx = layer_idx % num_hosts;
        let assignment = PipelineLayerAssignment {
            layer_idx,
            host_id: host_ids[host_idx].clone(),
            shard_idx: 0,
            total_shards: 1,
        };
        layer_assignments.push(assignment);
    }

    PipelinePlan {
        config: config.clone(),
        layer_assignments,
        num_hosts,
    }
}

pub fn build_sharded_pipeline_plan(
    config: &TransformerConfig,
    host_ids: &[String],
    shards_per_layer: usize,
) -> PipelinePlan {
    let num_hosts = host_ids.len();
    let total_layers = config.num_layers;
    let mut layer_assignments = Vec::with_capacity(total_layers * shards_per_layer);

    if num_hosts == 0 || shards_per_layer == 0 {
        return PipelinePlan { config: config.clone(), layer_assignments, num_hosts };
    }

    for layer_idx in 0..total_layers {
        for s in 0..shards_per_layer {
            let host_idx = (layer_idx * shards_per_layer + s) % num_hosts;
            let assignment = PipelineLayerAssignment {
                layer_idx,
                host_id: host_ids[host_idx].clone(),
                shard_idx: s,
                total_shards: shards_per_layer,
            };
            layer_assignments.push(assignment);
        }
    }

    PipelinePlan {
        config: config.clone(),
        layer_assignments,
        num_hosts,
    }
}

pub fn estimate_inference_memory(config: &TransformerConfig) -> InferenceMemoryEstimate {
    let kv_bytes_per_layer = 2 * config.max_seq_len * config.num_heads * config.head_dim * 4;
    let kv_cache_total = kv_bytes_per_layer * config.num_layers;
    let activation_bytes = config.hidden_dim * 4 * 4;
    let weight_params = config.hidden_dim as f64
        * (4.0 * config.hidden_dim as f64
            + 2.0 * config.ffn_hidden_dim as f64
            + 2.0 * config.head_dim as f64 * config.num_heads as f64)
        * config.num_layers as f64;
    let weight_bytes = (weight_params * 4.0) as usize;
    let total = kv_cache_total + activation_bytes + weight_bytes;

    InferenceMemoryEstimate {
        kv_cache_bytes: kv_cache_total,
        activation_bytes,
        weight_bytes,
        total_bytes: total,
        fits_in_vram_gb: total as f64 / (1024.0 * 1024.0 * 1024.0),
    }
}

pub fn estimate_peer_memory(
    config: &TransformerConfig,
    plan: &PipelinePlan,
    host_id: &str,
) -> InferenceMemoryEstimate {
    let layers_on_host: usize = plan
        .layer_assignments
        .iter()
        .filter(|a| a.host_id == host_id)
        .map(|a| a.total_shards)
        .sum::<usize>()
        / plan.layer_assignments.first().map(|a| a.total_shards).unwrap_or(1)
        .max(1);

    let layers_host = layers_on_host.max(1);

    let kv_per_layer = 2 * config.max_seq_len * config.num_heads * config.head_dim * 4;
    let kv_cache_host = kv_per_layer * layers_host;

    let param_per_layer = (config.hidden_dim as f64
        * (4.0 * config.hidden_dim as f64
            + 2.0 * config.ffn_hidden_dim as f64
            + 2.0 * config.head_dim as f64 * config.num_heads as f64))
        as usize;
    let weight_host = param_per_layer * layers_host / plan.layer_assignments.first().map(|a| a.total_shards).unwrap_or(1);

    let activation = config.hidden_dim * 4 * 4;
    let total = kv_cache_host + activation + weight_host;

    InferenceMemoryEstimate {
        kv_cache_bytes: kv_cache_host,
        activation_bytes: activation,
        weight_bytes: weight_host,
        total_bytes: total,
        fits_in_vram_gb: total as f64 / (1024.0 * 1024.0 * 1024.0),
    }
}

pub fn create_kv_cache(config: &TransformerConfig) -> Vec<KVCacheEntry> {
    let mut cache = Vec::with_capacity(config.num_layers);
    for layer_idx in 0..config.num_layers {
        cache.push(KVCacheEntry {
            layer_idx,
            keys: vec![0.0f32; config.max_seq_len * config.num_heads * config.head_dim],
            values: vec![0.0f32; config.max_seq_len * config.num_heads * config.head_dim],
            seq_len: 0,
            num_heads: config.num_heads,
            head_dim: config.head_dim,
        });
    }
    cache
}

pub fn append_to_kv_cache(
    cache: &mut KVCacheEntry,
    position: usize,
    key: &[f32],
    value: &[f32],
) -> Result<(), String> {
    let kv_size = cache.num_heads * cache.head_dim;
    if kv_size == 0 {
        return Err("Zero kv_size".to_string());
    }
    if key.len() != kv_size || value.len() != kv_size {
        return Err("Key/value length mismatch".to_string());
    }
    if position >= cache.keys.len() / kv_size {
        return Err("Position exceeds max_seq_len".to_string());
    }
    let offset = position * kv_size;
    cache.keys[offset..offset + kv_size].copy_from_slice(key);
    cache.values[offset..offset + kv_size].copy_from_slice(value);
    cache.seq_len = cache.seq_len.max(position + 1);
    Ok(())
}

pub fn checkpoint_forward(
    input: &[f32],
    weights: &[f32],
    hidden_dim: usize,
    layer_idx: usize,
    pos: usize,
) -> ActivationCheckpoint {
    let mut output = vec![0.0f32; input.len()];
    for i in 0..input.len().min(weights.len()) {
        output[i] = input[i] * 0.5 + weights[i] * 0.5;
    }

    ActivationCheckpoint {
        layer_idx,
        input_data: input.to_vec(),
        output_data: output,
        hidden_dim,
        seq_pos: pos,
    }
}

pub fn compute_attention_shard(
    query: &[f32],
    key_cache: &[f32],
    value_cache: &[f32],
    seq_len: usize,
    num_heads: usize,
    head_dim: usize,
    shard_start: usize,
    shard_end: usize,
) -> Result<Vec<f32>, String> {
    if shard_start >= shard_end || shard_end > num_heads {
        return Err("Invalid shard range".to_string());
    }
    let num_shard_heads = shard_end - shard_start;
    if shard_end > num_heads {
        return Err("Shard exceeds num_heads".to_string());
    }

    let mut output = vec![0.0f32; num_shard_heads * head_dim];
    let kv_size = num_heads * head_dim;

    for h in shard_start..shard_end {
        let head_offset = (h - shard_start) * head_dim;
        let q_offset = h * head_dim;

        let mut scores = vec![0.0f32; seq_len];
        for pos in 0..seq_len {
            let mut score = 0.0f32;
            for d in 0..head_dim {
                let qv = query[q_offset + d];
                let kv = key_cache[pos * kv_size + h * head_dim + d];
                score += qv * kv;
            }
            scores[pos] = score / (head_dim as f32).sqrt();
        }

        let max_score = scores.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let mut exp_sum = 0.0f32;
        for s in scores.iter_mut() {
            *s = (*s - max_score).exp();
            exp_sum += *s;
        }
        if exp_sum > 0.0 {
            for s in scores.iter_mut() {
                *s /= exp_sum;
            }
        }

        for d in 0..head_dim {
            let mut weighted = 0.0f32;
            for pos in 0..seq_len {
                weighted += scores[pos] * value_cache[pos * kv_size + h * head_dim + d];
            }
            output[head_offset + d] = weighted;
        }
    }

    Ok(output)
}

pub fn compute_ffn_shard(
    input: &[f32],
    w1: &[f32],
    w2: &[f32],
    hidden_dim: usize,
    ffn_dim: usize,
    shard_start: usize,
    shard_end: usize,
) -> Result<Vec<f32>, String> {
    if shard_start >= shard_end {
        return Err("Empty shard range".to_string());
    }
    let shard_ffn = shard_end - shard_start;

    let mut hidden = vec![0.0f32; shard_ffn];
    for i in shard_start..shard_end {
        let idx = i - shard_start;
        let mut sum = 0.0f32;
        for j in 0..hidden_dim {
            sum += input[j] * w1[j * ffn_dim + i];
        }
        // ReLU
        hidden[idx] = if sum > 0.0 { sum } else { 0.0 };
    }

    let mut output = vec![0.0f32; hidden_dim];
    for i in 0..hidden_dim {
        let mut sum = 0.0f32;
        for j in shard_start..shard_end {
            sum += hidden[j - shard_start] * w2[shard_start * hidden_dim + (j - shard_start) * hidden_dim + i];
        }
        output[i] = sum;
    }

    Ok(output)
}
