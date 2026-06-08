import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AgentHost } from '../agent-host.js';
import type { AgentInput } from '../agent-host.js';

describe('AgentHost', () => {
  let host: AgentHost;

  beforeEach(() => {
    host = new AgentHost({ maxAgents: 10 });
  });

  afterEach(() => {
    host.stopAll();
  });

  it('spawns an agent from template', () => {
    const agent = host.spawnAgent('webdesign', 'web-1');
    expect(agent.id).toBe('web-1');
    expect(agent.templateName).toBe('webdesign');
    expect(agent.tasksCompleted).toBe(0);
    expect(agent.runtime.state).toBe('ready');
  });

  it('spawns agent with auto-generated id', () => {
    const agent = host.spawnAgent('content-writer');
    expect(agent.id).toContain('content-writer');
    expect(host.agentCount()).toBe(1);
  });

  it('executes an agent and returns output', () => {
    const agent = host.spawnAgent('webdesign', 'web-1');
    const output = host.executeAgent('web-1', { prompt: 'build a homepage', context: [] });
    expect(output).not.toBeNull();
    expect(output!.agentId).toBe('web-1');
    expect(output!.content).toContain('build a homepage');
  });

  it('returns null for unknown agent', () => {
    const output = host.executeAgent('nonexistent', { prompt: 'test', context: [] });
    expect(output).toBeNull();
  });

  it('stops an agent', () => {
    host.spawnAgent('webdesign', 'web-1');
    expect(host.agentCount()).toBe(1);
    const stopped = host.stopAgent('web-1');
    expect(stopped).toBe(true);
    expect(host.agentCount()).toBe(0);
  });

  it('stopAgent returns false for unknown agent', () => {
    expect(host.stopAgent('nonexistent')).toBe(false);
  });

  it('stops all agents', () => {
    host.spawnAgent('webdesign', 'w1');
    host.spawnAgent('content-writer', 'c1');
    host.spawnAgent('image-optimizer', 'i1');
    expect(host.agentCount()).toBe(3);
    host.stopAll();
    expect(host.agentCount()).toBe(0);
  });

  it('respects max agents limit', () => {
    const smallHost = new AgentHost({ maxAgents: 2 });
    smallHost.spawnAgent('webdesign', 'a1');
    smallHost.spawnAgent('webdesign', 'a2');
    expect(() => smallHost.spawnAgent('webdesign', 'a3')).toThrow('Max agents');
    smallHost.stopAll();
  });

  it('lists all agents', () => {
    host.spawnAgent('webdesign', 'w1');
    host.spawnAgent('content-writer', 'c1');
    const list = host.listAgents();
    expect(list.length).toBe(2);
    expect(list.map(a => a.id)).toEqual(['w1', 'c1']);
  });

  it('gets agent by id', () => {
    host.spawnAgent('webdesign', 'my-agent');
    const agent = host.getAgent('my-agent');
    expect(agent).toBeDefined();
    expect(agent!.id).toBe('my-agent');
  });

  it('returns undefined for unknown agent', () => {
    expect(host.getAgent('unknown')).toBeUndefined();
  });

  it('tracks tasks completed count', () => {
    host.spawnAgent('webdesign', 'w1');
    host.executeAgent('w1', { prompt: 'task 1', context: [] });
    host.executeAgent('w1', { prompt: 'task 2', context: [] });
    host.executeAgent('w1', { prompt: 'task 3', context: [] });
    const agent = host.getAgent('w1')!;
    expect(agent.tasksCompleted).toBe(3);
  });

  it('executes builtin tools', () => {
    host.spawnAgent('webdesign', 'w1');
    const result = host.executeTool('html-renderer', 'Hello');
    expect(result).toBe('<div>Hello</div>');
  });

  it('returns fallback for unknown tool', () => {
    const result = host.executeTool('unknown-tool', 'input');
    expect(result).toContain('not available');
  });

  it('returns available tool names', () => {
    const tools = host.getToolNames();
    expect(tools).toContain('html-renderer');
    expect(tools).toContain('css-generator');
    expect(tools).toContain('cdn-upload');
  });

  it('returns status info', () => {
    host.spawnAgent('webdesign', 'w1');
    const status = host.getStatus();
    expect(status.agentCount).toBe(1);
    expect(status.toolsAvailable).toBeGreaterThan(3);
    expect(status.templates).toContain('webdesign');
  });
});
