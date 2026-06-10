use js_sys;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentConfig {
    pub agent_id: String,
    pub model_id: String,
    pub system_prompt: String,
    pub tools: Vec<String>,
    pub max_tokens: u32,
    pub temperature: f32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentInput {
    pub prompt: String,
    pub context: Vec<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentOutput {
    pub agent_id: String,
    pub content: String,
    pub tokens_generated: u32,
    pub latency_ms: f64,
    pub confidence: f32,
    pub tool_calls: Vec<ToolCall>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ToolCall {
    pub tool: String,
    pub input: String,
    pub output: String,
    pub success: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum AgentState {
    Idle,
    Loading,
    Ready,
    Executing,
    Completed,
    Failed(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AgentRuntime {
    config: AgentConfig,
    state: AgentState,
    started_at: f64,
}

impl AgentRuntime {
    pub fn new(config: AgentConfig) -> Self {
        AgentRuntime {
            config,
            state: AgentState::Idle,
            started_at: 0.0,
        }
    }

    pub fn load(&mut self) -> Result<(), String> {
        self.state = AgentState::Loading;
        self.state = AgentState::Ready;
        Ok(())
    }

    pub fn execute(&mut self, input: &AgentInput) -> Result<AgentOutput, String> {
        if !matches!(self.state, AgentState::Ready) {
            return Err("Agent not ready".to_string());
        }
        self.state = AgentState::Executing;

        let start = js_sys::Date::now();
        let content = self.generate(input);
        let latency = js_sys::Date::now() - start;

        let output = AgentOutput {
            agent_id: self.config.agent_id.clone(),
            content,
            tokens_generated: 10,
            latency_ms: latency,
            confidence: 0.85,
            tool_calls: Vec::new(),
        };

        self.state = AgentState::Completed;
        Ok(output)
    }

    fn generate(&self, input: &AgentInput) -> String {
        format!(
            "[{}] {} | Model: {} | Tools: {}",
            self.config.agent_id,
            input.prompt,
            self.config.model_id,
            self.config.tools.join(", ")
        )
    }

    pub fn reset(&mut self) {
        self.state = AgentState::Idle;
    }

    pub fn state(&self) -> &AgentState {
        &self.state
    }

    pub fn config(&self) -> &AgentConfig {
        &self.config
    }
}
