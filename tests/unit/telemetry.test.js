import { describe, expect, it, vi } from 'vitest';
import { validateBatch } from '../../api/_lib/telemetry.js';
import { Telemetry, telemetryAllowed } from '../../src/core/Telemetry.js';

const session = '3f2a8c1e-0d3b-4c55-9a1e-7b2f0c9d4e11';

describe('telemetry validation (server)', () => {
  it('accepts a well-formed batch', () => {
    const result = validateBatch({
      session,
      build: 'abc1234',
      events: [
        { type: 'session_start', t: 120, backend: 'webgpu', preset: 'high', device: 'desktop', lang: 'bm' },
        { type: 'fps_summary', t: 60000, fpsAvg: 59.8, fpsP5: 51.2 },
        { type: 'quit', t: 61000, seconds: 61 },
      ],
    });
    expect(result.ok).toBe(true);
  });

  it('rejects unknown types, unknown fields and personal-looking data', () => {
    expect(validateBatch({ session, build: 'b', events: [{ type: 'keystroke', t: 1 }] }).ok).toBe(false);
    expect(validateBatch({ session, build: 'b', events: [{ type: 'quit', t: 1, email: 'a@b.c' }] }).ok).toBe(
      false,
    );
    expect(validateBatch({ session, build: 'b', events: [{ type: 'quit', t: -5 }] }).ok).toBe(false);
    expect(validateBatch({ session: 'x', build: 'b', events: [{ type: 'quit', t: 1 }] }).ok).toBe(false);
    expect(validateBatch({ session, build: 'b', events: [] }).ok).toBe(false);
    expect(
      validateBatch({ session, build: 'b', events: new Array(51).fill({ type: 'quit', t: 1 }) }).ok,
    ).toBe(false);
    expect(validateBatch(null).ok).toBe(false);
  });
});

describe('Telemetry (client)', () => {
  it('queues events and posts them in one batch', () => {
    const fetchImpl = vi.fn(() => Promise.resolve(new Response(null, { status: 204 })));
    const telemetry = new Telemetry({ enabled: true, fetchImpl, clock: () => 42, build: 'test' });
    telemetry.track('mission_start', { mission: '1.1' });
    telemetry.flush();
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.events).toEqual([{ type: 'mission_start', t: 42, mission: '1.1' }]);
    expect(validateBatch(body).ok).toBe(true);
    expect(telemetry.queue).toHaveLength(0);
  });

  it('does nothing when disabled and drops the queue when switched off', () => {
    const fetchImpl = vi.fn();
    const telemetry = new Telemetry({ enabled: false, fetchImpl });
    telemetry.track('quit');
    telemetry.flush();
    expect(fetchImpl).not.toHaveBeenCalled();
    telemetry.setEnabled(true);
    telemetry.track('quit');
    telemetry.setEnabled(false);
    expect(telemetry.queue).toHaveLength(0);
  });

  it('is off in development, when the player opts out, and under Global Privacy Control', () => {
    expect(telemetryAllowed({ settingEnabled: true, production: false, nav: {} })).toBe(false);
    expect(telemetryAllowed({ settingEnabled: false, production: true, nav: {} })).toBe(false);
    expect(
      telemetryAllowed({ settingEnabled: true, production: true, nav: { globalPrivacyControl: true } }),
    ).toBe(false);
    expect(telemetryAllowed({ settingEnabled: true, production: true, nav: {} })).toBe(true);
  });
});
