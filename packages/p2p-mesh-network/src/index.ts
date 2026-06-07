export { TransportManager, type TransportConfig, type PeerInfo } from './transport.js';
export { WebRTCFallback } from './webrtc-fallback.js';
export { CrdtSync } from './crdt-sync.js';
export { FailoverManager } from './failover.js';
export { PeerDiscovery, type DiscoveryConfig } from './discovery.js';
export { RoleElection, type ElectionEvent, type ElectionCallback } from './election.js';
export {
  type NodeCapability, type NodeRole,
  computeScore, isL3Candidate, maxModelParamsB, deriveRole,
  serializeCapability, deserializeCapability,
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
