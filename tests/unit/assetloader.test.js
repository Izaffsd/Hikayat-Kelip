import { describe, expect, it, vi } from 'vitest';
import { AssetLoader } from '../../src/core/AssetLoader.js';

/** A renderer stand-in with just what KTX2Loader.detectSupport needs. */
const fakeRenderer = { isWebGPURenderer: true, hasFeature: () => false };

/**
 * A fetch mock serving fixed files as streamed responses (in small chunks, like a network would).
 * @param {Record<string, Uint8Array>} files
 */
function mockFetch(files) {
  return vi.fn(async (url) => {
    const bytes = files[url];
    if (!bytes) return new Response(null, { status: 404 });
    const stream = new ReadableStream({
      start(controller) {
        for (let i = 0; i < bytes.length; i += 4) controller.enqueue(bytes.slice(i, i + 4));
        controller.close();
      },
    });
    return new Response(stream, { status: 200 });
  });
}

const encode = (text) => new TextEncoder().encode(text);

describe('AssetLoader', () => {
  it('reports real byte progress and parses by type', async () => {
    const json = encode('{"region":"prologue","cells":3}');
    const bin = new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const fetchImpl = mockFetch({ '/a.json': json, '/b.bin': bin });
    const loader = new AssetLoader({
      renderer: fakeRenderer,
      basisPath: '/basis/',
      fetchImpl,
      concurrency: 2,
    });
    const progress = [];
    const results = await loader.loadAll(
      [
        { url: '/a.json', bytes: json.length, type: 'json' },
        { url: '/b.bin', bytes: bin.length, type: 'binary' },
      ],
      (loaded, total) => progress.push([loaded, total]),
    );
    expect(results.get('/a.json')).toEqual({ region: 'prologue', cells: 3 });
    expect(new Uint8Array(results.get('/b.bin'))).toEqual(bin);
    const total = json.length + bin.length;
    expect(progress.at(-1)).toEqual([total, total]);
    // Progress only grows, and arrives in several steps (streamed chunks).
    for (let i = 1; i < progress.length; i++)
      expect(progress[i][0]).toBeGreaterThanOrEqual(progress[i - 1][0]);
    expect(progress.length).toBeGreaterThan(3);
    loader.dispose();
  });

  it('reuses cached assets with reference counts', async () => {
    const json = encode('{"x":1}');
    const fetchImpl = mockFetch({ '/c.json': json });
    const loader = new AssetLoader({ renderer: fakeRenderer, basisPath: '/basis/', fetchImpl });
    const entry = { url: '/c.json', bytes: json.length, type: 'json' };
    await loader.loadAll([entry]);
    await loader.loadAll([entry]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    loader.release('/c.json');
    expect(loader._cache.has('/c.json')).toBe(true);
    loader.release('/c.json');
    expect(loader._cache.has('/c.json')).toBe(false);
    loader.dispose();
  });

  it('fails clearly on HTTP errors', async () => {
    const loader = new AssetLoader({
      renderer: fakeRenderer,
      basisPath: '/basis/',
      fetchImpl: mockFetch({}),
    });
    await expect(loader.loadAll([{ url: '/missing.glb', bytes: 10, type: 'glb' }])).rejects.toThrow(
      /HTTP 404/,
    );
    loader.dispose();
  });
});
