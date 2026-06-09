import { describe, it, expect } from 'vitest';
import { CcaAttestation, isCcaAvailable } from '../cca-attestation.js';

describe('isCcaAvailable', () => {
  it('returns boolean', () => {
    const result = isCcaAvailable();
    expect(typeof result).toBe('boolean');
  });
});

describe('CcaAttestation', () => {
  it('initializes realm with config', async () => {
    const cca = new CcaAttestation({ simulate: true });
    const realm = await cca.initialize();
    expect(realm.state).toBe('active');
    expect(realm.realmId).toHaveLength(32);
    expect(realm.flags).toContain('confidential_compute');
  });

  it('generates attestation report', async () => {
    const cca = new CcaAttestation({ simulate: true });
    const data = new TextEncoder().encode('skynet-cca-payload');
    const report = await cca.attest(data);
    expect(report.provider).toBe('cca');
    expect(report.measurementHash).toHaveLength(64);
    expect(report.nonce).toHaveLength(64);
    expect(report.simulated).toBe(true);
  });

  it('includes user data hash', async () => {
    const cca = new CcaAttestation({ simulate: true });
    const data = new TextEncoder().encode('model-weights');
    const userData = new TextEncoder().encode('realm-42');
    const report = await cca.attest(data, userData);
    expect(report.userDataHash).toHaveLength(64);
    expect(report.platformEvidence.realmFlags).toContain('attestable');
  });

  it('verifies simulated report', async () => {
    const cca = new CcaAttestation({ simulate: true });
    const data = new TextEncoder().encode('verify-me');
    const report = await cca.attest(data);
    const result = await cca.verifyReport(report);
    expect(result.verified).toBe(true);
    expect(result.trusted).toBe(true);
    expect(result.reportHash).toHaveLength(64);
  });

  it('fails verification for tampered measurement', async () => {
    const cca = new CcaAttestation({ simulate: true });
    const data = new TextEncoder().encode('data');
    const report = await cca.attest(data);
    report.measurementHash = '00';
    const result = await cca.verifyReport(report);
    expect(result.verified).toBe(false);
  });

  it('getRealmInfo returns null before init', async () => {
    const cca = new CcaAttestation({ simulate: true });
    expect(await cca.getRealmInfo()).toBeNull();
  });

  it('getRealmInfo returns realm after init', async () => {
    const cca = new CcaAttestation({ simulate: true });
    await cca.initialize();
    const info = await cca.getRealmInfo();
    expect(info).not.toBeNull();
    expect(info!.state).toBe('active');
  });

  it('destroyRealm clears state', async () => {
    const cca = new CcaAttestation({ simulate: true });
    await cca.initialize();
    await cca.destroyRealm();
    expect(await cca.getRealmInfo()).toBeNull();
  });

  it('destroyRealm sets state to destroyed before clear', async () => {
    const cca = new CcaAttestation({ simulate: true, realmId: 'test-realm' });
    await cca.initialize();
    const realm = await cca.getRealmInfo();
    await cca.destroyRealm();
    expect(realm!.realmId).toBeTruthy();
    expect(await cca.getRealmInfo()).toBeNull();
  });

  it('transitionRealm changes state', async () => {
    const cca = new CcaAttestation({ simulate: true });
    await cca.initialize();
    const updated = await cca.transitionRealm('transitioning');
    expect(updated.state).toBe('transitioning');
  });

  it('transitionRealm throws if not initialized', async () => {
    const cca = new CcaAttestation({ simulate: true });
    await expect(cca.transitionRealm('destroyed')).rejects.toThrow('Realm not initialized');
  });

  it('generates unique nonces across attestations', async () => {
    const cca = new CcaAttestation({ simulate: true });
    const data = new TextEncoder().encode('test');
    const r1 = await cca.attest(data);
    const r2 = await cca.attest(data);
    expect(r1.nonce).not.toBe(r2.nonce);
  });
});
