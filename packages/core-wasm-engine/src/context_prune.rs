use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ContextItem {
    pub key: String,
    pub content: String,
    pub priority: f64,
    pub size_bytes: usize,
}

#[derive(Debug, Serialize)]
pub struct PruneResult {
    pub original_bytes: usize,
    pub pruned_bytes: usize,
    pub ratio: f64,
    pub items_kept: usize,
    pub items_removed: usize,
}

pub fn prune_context(items: &[ContextItem], target_ratio: f64) -> (Vec<ContextItem>, PruneResult) {
    let original_bytes: usize = items.iter().map(|i| i.size_bytes).sum();
    let target_bytes = (original_bytes as f64 * target_ratio) as usize;

    let mut scored: Vec<(&ContextItem, f64)> = items.iter()
        .map(|i| {
            let keyword_bonus = count_keywords(&i.content) as f64 * 0.1;
            let priority_score = i.priority;
            let size_penalty = (i.size_bytes as f64 / original_bytes.max(1) as f64).sqrt();
            let score = (priority_score + keyword_bonus) / size_penalty.max(0.01);
            (i, score)
        })
        .collect();

    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));

    let mut kept = Vec::new();
    let mut running = 0usize;
    for (item, _) in &scored {
        if running + item.size_bytes <= target_bytes || kept.is_empty() {
            kept.push((*item).clone());
            running += item.size_bytes;
        }
    }

    let pruned_bytes = original_bytes - running;
    let result = PruneResult {
        original_bytes,
        pruned_bytes,
        ratio: running as f64 / original_bytes.max(1) as f64,
        items_kept: kept.len(),
        items_removed: items.len() - kept.len(),
    };

    (kept, result)
}

pub fn prune_summarize(item: &ContextItem, max_chars: usize) -> String {
    if item.content.len() <= max_chars {
        return item.content.clone();
    }
    let sentences: Vec<&str> = item.content.split(|c| c == '.' || c == '!' || c == '?').collect();
    let mut result = String::new();
    for s in sentences {
        if result.len() + s.len() + 1 > max_chars {
            result.push_str("...");
            break;
        }
        result.push_str(s.trim());
        result.push('.');
    }
    result
}

fn count_keywords(content: &str) -> usize {
    let keywords = ["error", "fail", "thermal", "latency", "throughput",
                     "critical", "warning", "timeout", "throttle", "overheat",
                     "crash", "oom", "drop", "disconnect", "degraded"];
    let lower = content.to_lowercase();
    keywords.iter().filter(|k| lower.contains(*k)).count()
}
