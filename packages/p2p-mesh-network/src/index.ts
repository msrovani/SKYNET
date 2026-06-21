export { TransportManager, type TransportConfig, type PeerInfo, type MessageHandler, type TransportState, type WebTransportOptions } from './transport.js';
export { WebRTCFallback } from './webrtc-fallback.js';
export { CrdtSync, type PeerState, type TaskState, type MeshState, type ModelPartition } from './crdt-sync.js';
export { FailoverManager } from './failover.js';
export { PeerDiscovery, type DiscoveryConfig, type DiscoveredPeer } from './discovery.js';
export { RoleElection, type ElectionEvent, type ElectionCallback } from './election.js';
export {
  type NodeCapability, type VCapabilityVector, type NodeRole,
  computeScore, isL3Candidate, maxModelParamsB, deriveRole,
  serializeCapability, deserializeCapability,
  embedText, cosineSimilarity,
} from './capability.js';
export { InstinctEngine, type Instinct, type Observation } from './instinct.js';
export { ExperimentTracker, defaultParams, mutateParams, type EvolvableParams, type TelemetrySnapshot, type EvolutionStrategy } from './autonomous.js';
export {
  PipelineManager, computePeerWeight, MoEParallelFolding, TAHQuantTransform,
  type PipelineConfig, type PipelineStage,
  type PeerCapability, type PipelineAssignment,
  type PipelineEvent, type PipelineEventType, type PipelineCallback,
  type ParallelFoldingConfig, type ParallelismType,
} from './pipeline.js';
export { SegmentMeans, type SegmentMeansConfig, type CompressedSegment } from './segment-means.js';
export {
  ThermalManager, DynamicShifter, CarbonScheduler, CarbonMonitor,
  FUSEGovernor, AGFTScheduler, TAPASScheduler,
  type ThermalReading, type ThermalConfig, type ThermalZone,
  type ThermalTrend, type ThermalEvent, type ThermalEventType,
  type SchedulerParams, type DeviceClass, type ThermalCallback,
  type CarbonIntensity, type CarbonAwareScore,
  type BanditAction, type VmPlacement, type FUSEConfig,
} from './thermal.js';
export {
  CircadianScheduler, type CircadianPeer, type CircadianScore,
  type CircadianConfig,
} from './circadian-scheduler.js';
export {
  SpeculativeDecoder, TreeSpecDecoder, LightweightVerifier,
  type SpeculativeConfig,
  type SpeculativeStats,
  type SpeculativeRole,
  type DraftResult,
  type VerificationResult,
  type DecodingEvent,
  type DecodingEventType,
  type DecodingCallback,
  type TreeNode, type TreeSpecConfig,
} from './speculative-decoding.js';
export {
  SemanticRouter, HnswIndex, LossyAwareRouter,
  type AgentRegistration, type SubTask, type RouteMatch,
  type RouterEvent, type RouterCallback,
  type NeuronGroup, type NodeHealth,
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

export {
  LoRaCrdtSync, estimateLoRaDuration,
  type LoRaWanConfig, type LoRaWanPacket,
  type LoRaSyncResult, type LoRaWanClass,
} from './lora-crdt-sync.js';

export {
  AcousticCrdtSync, estimateAcousticDuration,
  type AcousticConfig, type AcousticModulation, type AcousticBand,
  type AcousticPacket, type AcousticSyncResult,
} from './acoustic-crdt-sync.js';

export {
  OpportunisticRouter,
  type TransportType, type TransportLink, type SyncRoute,
  type RouterEvent as OpportunisticRouterEvent,
  type RouterCallback as OpportunisticRouterCallback,
} from './opportunistic-router.js';
