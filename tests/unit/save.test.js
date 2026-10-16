import { describe, expect, it } from 'vitest';
import { decodeCode, encodeCode, fromBase64Url, toBase64Url } from '../../src/core/codec.js';
import { crc32 } from '../../src/core/crc32.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { SaveManager } from '../../src/core/SaveManager.js';
import { CURRENT_SCHEMA, MIGRATIONS, createDefaultSave } from '../../src/core/saveSchema.js';
import { createMemoryStorage } from '../../src/core/storage.js';

const NOW = 1_760_000_000_000;

function makeManager(storage = createMemoryStorage(), options = {}) {
  const bus = new EventBus();
  return { storage, bus, saves: new SaveManager({ storage, bus, now: () => NOW, ...options }) };
}

describe('crc32', () => {
  it('matches the standard check value', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
  });
});

describe('codec', () => {
  it('round-trips base64url', () => {
    const bytes = new Uint8Array([0, 1, 2, 250, 251, 252, 253, 254, 255]);
    expect([...fromBase64Url(toBase64Url(bytes))]).toEqual([...bytes]);
    expect(toBase64Url(bytes)).not.toMatch(/[+/=]/);
  });

  it('round-trips a tagged code and rejects other tags', async () => {
    const value = { a: 1, text: 'Pulau Seri — kelip-kelip', nested: [1, 2, 3] };
    const code = await encodeCode('HK1', value);
    expect(code.startsWith('HK1.')).toBe(true);
    expect(await decodeCode('HK1', code)).toEqual(value);
    await expect(decodeCode('XX1', code)).rejects.toThrow();
  });
});

describe('SaveManager', () => {
  it('starts a new save when nothing is stored', () => {
    const { saves } = makeManager();
    const { doc, status } = saves.load();
    expect(status).toBe('new');
    expect(doc.schema).toBe(CURRENT_SCHEMA);
    expect(doc.story.chapter).toBe('prologue');
  });

  it('round-trips a save and emits SAVE_WRITTEN', () => {
    const { saves, bus } = makeManager();
    let written = 0;
    bus.on(EV.SAVE_WRITTEN, () => written++);
    const doc = createDefaultSave(NOW);
    doc.story.flags.adi_freed = true;
    doc.progression.cahaya = 7;
    expect(saves.save(doc)).toBe(true);
    const loaded = saves.load();
    expect(loaded.status).toBe('loaded');
    expect(loaded.doc.story.flags.adi_freed).toBe(true);
    expect(loaded.doc.progression.cahaya).toBe(7);
    expect(written).toBe(1);
  });

  it('keeps the previous good save as a backup and falls back to it on corruption', () => {
    const { saves, storage } = makeManager();
    const first = createDefaultSave(NOW);
    first.progression.cahaya = 1;
    saves.save(first);
    const second = createDefaultSave(NOW);
    second.progression.cahaya = 2;
    saves.save(second);
    // Damage the primary copy: change a value without updating the checksum.
    storage.set('hk.save', storage.get('hk.save').replace('"cahaya":2', '"cahaya":9'));
    const loaded = saves.load();
    expect(loaded.status).toBe('restored-backup');
    expect(loaded.doc.progression.cahaya).toBe(1);
  });

  it('resets (and keeps the damaged copy) when every copy is unreadable', () => {
    const { saves, storage } = makeManager();
    storage.set('hk.save', '{not json');
    const loaded = saves.load();
    expect(loaded.status).toBe('corrupt-reset');
    expect(storage.get('hk.save.corrupt')).toBe('{not json');
  });

  it('never overwrites a save from a newer version', () => {
    const { saves, storage, bus } = makeManager();
    const future = { ...createDefaultSave(NOW), schema: CURRENT_SCHEMA + 5 };
    const body = JSON.stringify(future);
    storage.set('hk.save', `{"crc":${crc32(body)},"doc":${body}}`);
    const loaded = saves.load();
    expect(loaded.status).toBe('future-schema');
    let failed = 0;
    bus.on(EV.SAVE_FAILED, () => failed++);
    expect(saves.save(loaded.doc)).toBe(false);
    expect(failed).toBe(1);
    expect(JSON.parse(storage.get('hk.save')).doc.schema).toBe(CURRENT_SCHEMA + 5);
  });

  it('migrates a schema-0 development save (fixture of the old shape)', () => {
    const { saves, storage } = makeManager();
    const legacy = {
      chapter: 'ch1',
      mission: '1.2',
      flags: { met_adi: true },
      cahaya: 3,
      savedAt: NOW - 1000,
    };
    const body = JSON.stringify(legacy);
    storage.set('hk.save', `{"crc":${crc32(body)},"doc":${body}}`);
    const loaded = saves.load();
    expect(loaded.status).toBe('migrated');
    expect(loaded.doc.schema).toBe(CURRENT_SCHEMA);
    expect(loaded.doc.story).toMatchObject({ chapter: 'ch1', mission: '1.2', flags: { met_adi: true } });
    expect(loaded.doc.progression.cahaya).toBe(3);
  });

  it('runs every migration step in order', () => {
    const steps = [];
    const migrations = [
      (doc) => {
        steps.push(0);
        return { ...doc, a: 1 };
      },
      (doc) => {
        steps.push(1);
        return { ...doc, b: doc.a + 1 };
      },
    ];
    const { saves } = makeManager(createMemoryStorage(), { schema: 2, migrations });
    const doc = saves.migrate({ schema: 0 });
    expect(steps).toEqual([0, 1]);
    expect(doc).toMatchObject({ schema: 2, a: 1, b: 2 });
  });

  it('refuses to construct without enough migrations', () => {
    expect(() => new SaveManager({ storage: createMemoryStorage(), schema: 3, migrations: [] })).toThrow();
  });

  it('exports and imports a save code', async () => {
    const { saves } = makeManager();
    const doc = createDefaultSave(NOW);
    doc.story.pages = [1, 2];
    const code = await saves.exportCode(doc);
    const imported = await saves.importCode(code);
    expect(imported.story.pages).toEqual([1, 2]);
    await expect(saves.importCode('HK1.!!!')).rejects.toThrow();
  });

  it('has a migration for every schema step', () => {
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(CURRENT_SCHEMA);
  });
});
