export { TransportManager, type TransportConfig, type PeerInfo } from './transport.js';
export { WebRTCFallback } from './webrtc-fallback.js';
export { CrdtSync } from './crdt-sync.js';
export { FailoverManager } from './failover.js';
export { PeerDiscovery, type DiscoveryConfig } from './discovery.js';
export { RoleElection, type ElectionEvent, type ElectionCallback } from './election.js';
export {
  type NodeCapability, type VCapabilityVector, type NodeRole,
  computeScore, isL3Candidate, maxModelParamsB, deriveRole,
  serializeCapability, deserializeCapability,
  embedText, cosineSimilarity,
} from './capability.js';
export { InstinctEngine, type Instinct, type Observation } from './instinct.js';
export { ExperimentTracker, type EvolvableParams, type TelemetrySnapshot } from './autonomous.js';
export {
  PipelineManager, computePeerWeight,
  type PipelineConfig, type PipelineStage,
  type PeerCapability, type PipelineAssignment,
  type PipelineEvent, type PipelineEventType, type PipelineCallback,
} from './pipeline.js';
export { SegmentMeans, type SegmentMeansConfig, type CompressedSegment } from './segment-means.js';
export {
  ThermalManager, DynamicShifter,
  type ThermalReading, type ThermalConfig, type ThermalZone,
  type ThermalTrend, type ThermalEvent, type ThermalEventType,
  type SchedulerParams, type DeviceClass, type ThermalCallback,
} from './thermal.js';
export {
  CircadianScheduler, type CircadianPeer, type CircadianScore,
  type CircadianConfig,
} from './circadian-scheduler.js';
export {
  SpeculativeDecoder,
  type SpeculativeConfig,
  type SpeculativeStats,
  type SpeculativeRole,
  type DraftResult,
  type VerificationResult,
  type DecodingEvent,
  type DecodingEventType,
  type DecodingCallback,
} from './speculative-decoding.js';
export {
  SemanticRouter, HnswIndex,
  type AgentRegistration, type SubTask, type RouteMatch,
  type RouterEvent, type RouterCallback,
} from './semantic-router.js';
export {
  AgentMeshManager,
  type AgentHeartbeat, type AgentHealth,
  type MeshManagerEvent, type MeshManagerCallback,
} from './agent-mesh.js';
export {
  TaskPlanner, type SubTask as PlannerSubTask, type DecompositionPlan,
} from './planner.js';
export {
  TopologyRouter, type Topology, type TopologyDecision,
} from './topology-router.js';
export {
  FractionAggregator, computeSimpleChecksum,
  type AgentFraction, type AggregatedResult,
  type AggregatorEvent, type AggregatorCallback,
} from './fraction-aggregator.js';
