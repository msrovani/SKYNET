use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum NodeType { ComputeNode, Task, ModelShard, Failure, Metric }

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
pub enum EdgeType { DependsOn, Improves, Causes, Optimizes, FailsWith, Mitigates }

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphNode {
    pub id: String,
    pub node_type: NodeType,
    pub weight: f64,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GraphEdge {
    pub from: String,
    pub to: String,
    pub edge_type: EdgeType,
    pub weight: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct KnowledgeGraph {
    nodes: HashMap<String, GraphNode>,
    edges: Vec<GraphEdge>,
    adjacency: HashMap<String, Vec<(String, EdgeType, f64)>>,
}

impl KnowledgeGraph {
    pub fn new() -> Self {
        KnowledgeGraph {
            nodes: HashMap::new(),
            edges: Vec::new(),
            adjacency: HashMap::new(),
        }
    }

    pub fn add_node(&mut self, id: &str, node_type: NodeType, weight: f64) {
        self.nodes.entry(id.to_string()).or_insert(GraphNode {
            id: id.to_string(),
            node_type,
            weight,
            metadata: HashMap::new(),
        });
    }

    pub fn add_edge(&mut self, from: &str, to: &str, edge_type: EdgeType, weight: f64) {
        self.edges.push(GraphEdge {
            from: from.to_string(), to: to.to_string(),
            edge_type, weight,
        });
        self.adjacency.entry(from.to_string())
            .or_default()
            .push((to.to_string(), edge_type, weight));
    }

    pub fn get_impact_chain(&self, start: &str) -> Vec<(String, EdgeType, f64, usize)> {
        let mut chain = Vec::new();
        let mut visited = std::collections::HashSet::new();
        let mut stack = vec![(start.to_string(), 0usize)];
        visited.insert(start.to_string());
        while let Some((current, depth)) = stack.pop() {
            if let Some(neighbors) = self.adjacency.get(&current) {
                for (next, etype, w) in neighbors {
                    chain.push((next.clone(), etype.clone(), *w, depth + 1));
                    if visited.insert(next.clone()) {
                        stack.push((next.clone(), depth + 1));
                    }
                }
            }
        }
        chain
    }

    pub fn get_thermal_cascade(&self, hot_node: &str) -> Vec<(String, f64)> {
        let mut cascade = Vec::new();
        let mut visited = std::collections::HashSet::new();
        let mut stack = vec![(hot_node.to_string(), 1.0f64)];
        visited.insert(hot_node.to_string());
        while let Some((current, decay)) = stack.pop() {
            if let Some(neighbors) = self.adjacency.get(&current) {
                for (next, etype, w) in neighbors {
                    if *etype == EdgeType::Optimizes || *etype == EdgeType::DependsOn {
                        let impact = decay * w;
                        cascade.push((next.clone(), impact));
                        if visited.insert(next.clone()) && impact > 0.05 {
                            stack.push((next.clone(), impact));
                        }
                    }
                }
            }
        }
        cascade.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        cascade
    }

    pub fn get_statistics(&self) -> GraphStats {
        let mut type_dist = HashMap::new();
        for n in self.nodes.values() {
            *type_dist.entry(format!("{:?}", n.node_type)).or_insert(0) += 1;
        }
        GraphStats {
            node_count: self.nodes.len(),
            edge_count: self.edges.len(),
            type_distribution: type_dist,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GraphStats {
    pub node_count: usize,
    pub edge_count: usize,
    pub type_distribution: HashMap<String, usize>,
}
