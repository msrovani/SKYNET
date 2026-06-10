use serde::{Serialize, Deserialize};
use wasm_bindgen::prelude::*;

#[derive(Clone, Serialize, Deserialize, Debug)]
pub struct TensorDescriptor {
    pub rows: usize,
    pub cols: usize,
    pub data: Vec<f32>,
}

pub fn matmul_fallback(
    a: &[f32],
    b: &[f32],
    m: usize,
    n: usize,
    k: usize,
) -> Result<Vec<f32>, JsValue> {
    if a.len() != m * k {
        return Err(JsValue::from_str(&format!(
            "Matrix A dimensions mismatch: expected {}x{} = {}, got {}",
            m, k, m * k, a.len()
        )));
    }
    if b.len() != k * n {
        return Err(JsValue::from_str(&format!(
            "Matrix B dimensions mismatch: expected {}x{} = {}, got {}",
            k, n, k * n, b.len()
        )));
    }

    let mut c = vec![0.0_f32; m * n];

    for i in 0..m {
        for j in 0..n {
            let mut sum = 0.0_f32;
            for t in 0..k {
                sum += a[i * k + t] * b[t * n + j];
            }
            c[i * n + j] = sum;
        }
    }

    Ok(c)
}

pub fn quantize_int4(weights: &[f32]) -> (Vec<u8>, Vec<f32>) {
    let n = weights.len();
    let packed_size = (n + 1) / 2;
    let mut packed = vec![0u8; packed_size];
    let mut scales = Vec::with_capacity(n / 128 + 1);

    for chunk in weights.chunks(128) {
        let min = chunk.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = chunk.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let scale = if (max - min).abs() < 1e-10 { 1.0 } else { (max - min) / 15.0 };
        scales.push(min);
        scales.push(scale);

        for (i, &val) in chunk.iter().enumerate() {
            let q = ((val - min) / scale).round().clamp(0.0, 15.0) as u8;
            let byte_idx = i / 2;
            if i % 2 == 0 {
                packed[byte_idx] = (packed[byte_idx] & 0xF0) | (q & 0x0F);
            } else {
                packed[byte_idx] = (packed[byte_idx] & 0x0F) | ((q << 4) & 0xF0);
            }
        }
    }

    (packed, scales)
}

pub fn dequantize_int4(packed: &[u8], scales: &[f32], n: usize) -> Vec<f32> {
    let mut result = Vec::with_capacity(n);

    for (i, &byte) in packed.iter().enumerate() {
        let low = byte & 0x0F;
        let high = (byte >> 4) & 0x0F;

        let chunk_idx = i / 64;
        let min = scales[chunk_idx * 2];
        let scale = scales[chunk_idx * 2 + 1];

        let idx = i * 2;
        if idx < n {
            result.push(min + (low as f32) * scale);
        }
        if idx + 1 < n {
            result.push(min + (high as f32) * scale);
        }
    }

    result
}

/// ── Tensor Sharding ──

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct ShardMetadata {
    pub shard_id: String,
    pub tensor_id: String,
    pub row_start: usize,
    pub row_end: usize,
    pub col_start: usize,
    pub col_end: usize,
    pub rows: usize,
    pub cols: usize,
    pub data_len: usize,
    pub checksum: u32,
    pub shard_index: usize,
    pub total_shards: usize,
}

#[derive(Clone, Debug, Serialize, Deserialize)]
pub struct TensorShard {
    pub metadata: ShardMetadata,
    pub data: Vec<f32>,
}

pub fn shard_rowwise(tensor_id: &str, data: &[f32], rows: usize, cols: usize, num_shards: usize) -> Vec<TensorShard> {
    if data.len() != rows * cols || num_shards == 0 || num_shards > rows { return vec![]; }

    let rows_per_shard = (rows + num_shards - 1) / num_shards;
    let mut shards = Vec::with_capacity(num_shards);

    for i in 0..num_shards {
        let r_start = i * rows_per_shard;
        let r_end = std::cmp::min((i + 1) * rows_per_shard, rows);
        let shard_rows = r_end - r_start;

        let mut shard_data = Vec::with_capacity(shard_rows * cols);
        for r in r_start..r_end {
            let base = r * cols;
            shard_data.extend_from_slice(&data[base..base + cols]);
        }

        let checksum = shard_data.iter().fold(0u32, |acc, &v| acc.wrapping_add(v.to_bits()));

        let meta = ShardMetadata {
            shard_id: format!("{}/shard/{}", tensor_id, i),
            tensor_id: tensor_id.to_string(),
            row_start: r_start,
            row_end: r_end,
            col_start: 0,
            col_end: cols,
            rows: shard_rows,
            cols,
            data_len: shard_data.len(),
            checksum,
            shard_index: i,
            total_shards: num_shards,
        };

        shards.push(TensorShard { metadata: meta, data: shard_data });
    }

    shards
}

pub fn shard_colwise(tensor_id: &str, data: &[f32], rows: usize, cols: usize, num_shards: usize) -> Vec<TensorShard> {
    if data.len() != rows * cols || num_shards == 0 || num_shards > cols { return vec![]; }

    let cols_per_shard = (cols + num_shards - 1) / num_shards;
    let mut shards = Vec::with_capacity(num_shards);

    for i in 0..num_shards {
        let c_start = i * cols_per_shard;
        let c_end = std::cmp::min((i + 1) * cols_per_shard, cols);
        let shard_cols = c_end - c_start;

        let mut shard_data = Vec::with_capacity(rows * shard_cols);
        for r in 0..rows {
            let base = r * cols;
            shard_data.extend_from_slice(&data[base + c_start..base + c_end]);
        }

        let checksum = shard_data.iter().fold(0u32, |acc, &v| acc.wrapping_add(v.to_bits()));

        let meta = ShardMetadata {
            shard_id: format!("{}/shard/{}", tensor_id, i),
            tensor_id: tensor_id.to_string(),
            row_start: 0,
            row_end: rows,
            col_start: c_start,
            col_end: c_end,
            rows,
            cols: shard_cols,
            data_len: shard_data.len(),
            checksum,
            shard_index: i,
            total_shards: num_shards,
        };

        shards.push(TensorShard { metadata: meta, data: shard_data });
    }

    shards
}

pub fn reconstruct_from_shards(shards: &[TensorShard], original_rows: usize, original_cols: usize) -> TensorDescriptor {
    if shards.is_empty() {
        return TensorDescriptor { rows: 0, cols: 0, data: vec![] };
    }

    let is_rowwise = shards[0].metadata.row_end - shards[0].metadata.row_start > 0
        && shards[0].metadata.col_end - shards[0].metadata.col_start == original_cols;

    let mut result = vec![0.0f32; original_rows * original_cols];

    if is_rowwise {
        for shard in shards {
            let r_start = shard.metadata.row_start;
            let r_end = shard.metadata.row_end;
            let shard_rows = r_end - r_start;
            let cols = shard.metadata.cols;
            for r in 0..shard_rows {
                let src_base = r * cols;
                let dst_base = (r_start + r) * original_cols;
                result[dst_base..dst_base + cols].copy_from_slice(&shard.data[src_base..src_base + cols]);
            }
        }
    } else {
        for shard in shards {
            let c_start = shard.metadata.col_start;
            let c_end = shard.metadata.col_end;
            let shard_cols = c_end - c_start;
            for r in 0..original_rows {
                let src_base = r * shard_cols;
                let dst_base = r * original_cols + c_start;
                result[dst_base..dst_base + shard_cols].copy_from_slice(&shard.data[src_base..src_base + shard_cols]);
            }
        }
    }

    TensorDescriptor { rows: original_rows, cols: original_cols, data: result }
}

pub fn verify_shard(shard: &TensorShard) -> bool {
    let checksum = shard.data.iter().fold(0u32, |acc, &v| acc.wrapping_add(v.to_bits()));
    checksum == shard.metadata.checksum
}

fn compute_local_density(data: &[f32], point_idx: usize, dim: usize, radius: f32) -> f32 {
    if data.len() < dim * 2 { return 1.0; }
    let point = &data[point_idx * dim..(point_idx + 1) * dim];
    let mut count = 0u32;
    let total = data.len() / dim;
    for i in 0..total {
        if i == point_idx { continue; }
        let other = &data[i * dim..(i + 1) * dim];
        let mut dist = 0.0f32;
        for j in 0..dim {
            let d = point[j] - other[j];
            dist += d * d;
        }
        if dist.sqrt() < radius { count += 1; }
    }
    count as f32 / (total - 1) as f32
}

pub fn density_aware_quantize_int4(weights: &[f32], dim: usize) -> (Vec<u8>, Vec<f32>) {
    let n = weights.len();
    let num_points = n / dim;
    let radius = (0.1f32).max(1.0 / (dim as f32).sqrt());
    let mut densities = Vec::with_capacity(num_points);
    for i in 0..num_points {
        densities.push(compute_local_density(weights, i, dim, radius));
    }
    let avg_density: f32 = densities.iter().sum::<f32>() / num_points as f32;
    let packed_size = (n + 1) / 2;
    let mut packed = vec![0u8; packed_size];
    let mut scales = Vec::with_capacity(n / 128 + 1);
    for (chunk_idx, chunk) in weights.chunks(128).enumerate() {
        let min = chunk.iter().cloned().fold(f32::INFINITY, f32::min);
        let max = chunk.iter().cloned().fold(f32::NEG_INFINITY, f32::max);
        let density_factor = if chunk_idx < densities.len() {
            (densities[chunk_idx] / avg_density.max(0.01)).clamp(0.5, 2.0)
        } else {
            1.0
        };
        let effective_bits = (16.0 * density_factor).round().clamp(4.0, 16.0) as u32;
        let scale = if (max - min).abs() < 1e-10 { 1.0 } else { (max - min) / ((1u32 << effective_bits) - 1) as f32 };
        scales.push(min);
        scales.push(scale);
        for (i, &val) in chunk.iter().enumerate() {
            let q = ((val - min) / scale).round().clamp(0.0, 15.0) as u8;
            let byte_idx = i / 2;
            if i % 2 == 0 {
                packed[byte_idx] = (packed[byte_idx] & 0xF0) | (q & 0x0F);
            } else {
                packed[byte_idx] = (packed[byte_idx] & 0x0F) | ((q << 4) & 0xF0);
            }
        }
    }
    (packed, scales)
}

pub fn matmul_with_density_quant(a: &[f32], b_quant: &[u8], b_scales: &[f32], m: usize, n: usize, k: usize) -> Result<Vec<f32>, JsValue> {
    let b = dequantize_int4(b_quant, b_scales, k * n);
    matmul_fallback(a, &b, m, n, k)
}
