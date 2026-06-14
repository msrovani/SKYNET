import { SemanticRouter, AgentRegistration, SubTask, type RouterEvent, type RouterCallback } from './semantic-router.js';
import { VCapabilityVector, embedText } from './capability.js';

export interface AgentHeartbeat {
  agentId: string;
  nodeId: string;
  timestamp: number;
  status: 'idle' | 'busy' | 'error' | 'offline';
  currentLoad: number;
  tasksCompleted: number;
  avgLatencyMs: number;
}

export interface AgentHealth {
  agentId: string;
  nodeId: string;
  lastHeartbeat: number;
  missedHeartbeats: number;
  status: 'healthy' | 'degraded' | 'offline';
  currentLoad: number;
  tasksCompleted: number;
}

export type MeshManagerEvent = 'agent_online' | 'agent_offline' | 'agent_degraded' | 'mesh_connected' | 'mesh_disconnected' | 'task_assigned';

export type MeshManagerCallback = (event: MeshManagerEvent, data: any) => void;

export class AgentMeshManager {
  private router: SemanticRouter;
  private agents: Map<string, AgentRegistration> = new Map();
  private heartbeats: Map<string, AgentHeartbeat> = new Map();
  private health: Map<string, AgentHealth> = new Map();
  private callbacks: Set<MeshManagerCallback> = new Set();
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  private meshConnected: boolean = false;
  private localNodeId: string;

  private readonly HEARTBEAT_TIMEOUT_MS = 15_000;
  private readonly HEARTBEAT_CHECK_MS = 5_000;
  private readonly MAX_MISSED_HEARTBEATS = 3;

  constructor(localNodeId: string, router: SemanticRouter) {
    this.localNodeId = localNodeId;
    this.router = router;
  }

  onEvent(cb: MeshManagerCallback): () => void {
    this.callbacks.add(cb);
    return () => this.callbacks.delete(cb);
  }

  private emit(event: MeshManagerEvent, data: any): void {
    for (const cb of this.callbacks) {
      try { cb(event, data); } catch {}
    }
  }

  registerLocalAgent(
    modelId: string,
    tools: string[],
    systemPrompt: string,
    domain: string,
    costPerTask: number = 0.001,
    maxConcurrent: number = 1,
    avgLatencyMs: number = 100,
  ): AgentRegistration {
    const agentId = `${this.localNodeId}/${domain}/${modelId}`;
    const embedding = embedText(`${systemPrompt} ${tools.join(' ')} ${domain}`, 64);

    const registration: AgentRegistration = {
      agentId,
      nodeId: this.localNodeId,
      modelId,
      tools,
      systemPrompt,
      capabilityEmbedding: embedding,
      costPerTask,
      maxConcurrent,
      avgLatencyMs,
      domain,
    };

    this.agents.set(agentId, registration);
    this.router.registerAgent(registration);
    this.health.set(agentId, {
      agentId,
      nodeId: this.localNodeId,
      lastHeartbeat: Date.now(),
      missedHeartbeats: 0,
      status: 'healthy',
      currentLoad: 0,
      tasksCompleted: 0,
    });

    return registration;
  }

  unregisterAgent(agentId: string): void {
    this.agents.delete(agentId);
    this.router.unregisterAgent(agentId);
    this.heartbeats.delete(agentId);
    this.health.delete(agentId);
    this.emit('agent_offline', { agentId });
  }

  receiveHeartbeat(heartbeat: AgentHeartbeat): void {
    this.heartbeats.set(heartbeat.agentId, heartbeat);

    const existing = this.health.get(heartbeat.agentId);
    if (existing) {
      existing.lastHeartbeat = heartbeat.timestamp;
      existing.missedHeartbeats = 0;
      existing.currentLoad = heartbeat.currentLoad;
      existing.tasksCompleted = heartbeat.tasksCompleted;
      existing.status = 'healthy';
    } else {
      this.health.set(heartbeat.agentId, {
        agentId: heartbeat.agentId,
        nodeId: heartbeat.nodeId,
        lastHeartbeat: heartbeat.timestamp,
        missedHeartbeats: 0,
        status: 'healthy',
        currentLoad: heartbeat.currentLoad,
        tasksCompleted: heartbeat.tasksCompleted,
      });
      if (!this.agents.has(heartbeat.agentId)) {
        const registration: AgentRegistration = {
          agentId: heartbeat.agentId,
          nodeId: heartbeat.nodeId,
          modelId: 'remote',
          tools: [],
          systemPrompt: '',
          capabilityEmbedding: embedText(`agent ${heartbeat.agentId}`, 64),
          costPerTask: 0.001,
          maxConcurrent: 1,
          avgLatencyMs: heartbeat.avgLatencyMs ?? 100,
          domain: 'remote',
        };
        this.agents.set(heartbeat.agentId, registration);
        this.router.registerAgent(registration);
      }
      this.emit('agent_online', { agentId: heartbeat.agentId, nodeId: heartbeat.nodeId });
    }
  }

  registerRemoteAgent(registration: AgentRegistration): void {
    this.router.registerAgent(registration);
    this.agents.set(registration.agentId, registration);
    this.emit('agent_online', { agentId: registration.agentId, nodeId: registration.nodeId });
  }

  routeSubtask(subtask: SubTask): { agentId: string; nodeId: string } | null {
    const match = this.router.routeSubtask(subtask);
    if (!match) return null;

    this.emit('task_assigned', {
      subtaskId: subtask.id,
      agentId: match.agent.agentId,
      nodeId: match.agent.nodeId,
    });

    return { agentId: match.agent.agentId, nodeId: match.agent.nodeId };
  }

  startMonitoring(): void {
    this.meshConnected = true;
    this.emit('mesh_connected', { nodeId: this.localNodeId });

    this.heartbeatInterval = setInterval(() => {
      const now = Date.now();
      for (const [agentId, health] of this.health) {
        const elapsed = now - health.lastHeartbeat;
        if (elapsed > this.HEARTBEAT_TIMEOUT_MS) {
          health.missedHeartbeats++;
          if (health.missedHeartbeats >= this.MAX_MISSED_HEARTBEATS) {
            health.status = 'offline';
            this.router.unregisterAgent(agentId);
            this.emit('agent_offline', { agentId, nodeId: health.nodeId, reason: 'missed_heartbeats' });
          } else {
            health.status = 'degraded';
            this.emit('agent_degraded', { agentId, nodeId: health.nodeId, missedHeartbeats: health.missedHeartbeats });
          }
        }
      }
    }, this.HEARTBEAT_CHECK_MS);
  }

  stopMonitoring(): void {
    this.meshConnected = false;
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
    this.emit('mesh_disconnected', { nodeId: this.localNodeId });
  }

  createHeartbeat(agentId: string): AgentHeartbeat | null {
    const health = this.health.get(agentId);
    if (!health) return null;

    return {
      agentId,
      nodeId: this.localNodeId,
      timestamp: Date.now(),
      status: health.currentLoad > 0.8 ? 'busy' : 'idle',
      currentLoad: health.currentLoad,
      tasksCompleted: health.tasksCompleted,
      avgLatencyMs: this.agents.get(agentId)?.avgLatencyMs || 100,
    };
  }

  getAgentHealth(agentId: string): AgentHealth | undefined {
    return this.health.get(agentId);
  }

  listAgents(): AgentRegistration[] {
    return Array.from(this.agents.values());
  }

  listHealthyAgents(): AgentRegistration[] {
    const healthyIds = new Set(
      Array.from(this.health.entries())
        .filter(([, h]) => h.status === 'healthy')
        .map(([id]) => id),
    );
    return Array.from(this.agents.values()).filter(a => healthyIds.has(a.agentId));
  }

  getRouter(): SemanticRouter {
    return this.router;
  }

  isConnected(): boolean {
    return this.meshConnected;
  }

  agentCount(): number {
    return this.agents.size;
  }

  clear(): void {
    this.stopMonitoring();
    this.agents.clear();
    this.heartbeats.clear();
    this.health.clear();
    this.router.clear();
  }
}
