import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { download, isDownloading, streamBytes, takeDownload } from './Prefetch.js';

/**
 * @typedef {object} AssetEntry
 * @property {string} url
 * @property {number} bytes size from the asset manifest (used for progress before headers arrive)
 * @property {'glb'|'json'|'audio'|'binary'} type
 */

/**
 * Loads assets listed in manifests, reporting real byte progress, and keeps reference counts so a
 * region can release what only it used. Downloads can start early (`prefetch` here, or core/Prefetch.js from the title
 * script before the engine has loaded); a load takes them over. Parsing waits for `setRenderer` (KTX2 support depends
 * on the GPU).
 */
export class AssetLoader {
  /**
   * @param {object} options
   * @param {import('three/webgpu').WebGPURenderer|null} [options.renderer] initialised renderer (KTX2 support); or
   *   later through setRenderer
   * @param {string} options.basisPath folder with basis_transcoder.js/.wasm
   * @param {typeof fetch} [options.fetchImpl]
   * @param {number} [options.concurrency=4]
   */
  constructor({
    renderer = null,
    basisPath,
    fetchImpl = globalThis.fetch.bind(globalThis),
    concurrency = 4,
  }) {
    this.fetchImpl = fetchImpl;
    this.concurrency = concurrency;
    this.ktx2 = new KTX2Loader().setTranscoderPath(basisPath);
    if (renderer) this.ktx2.detectSupport(renderer);
    this.gltf = new GLTFLoader();
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    /** @type {Map<string, { value: any, refs: number }>} */
    this._cache = new Map();
    /** @type {((bytes: ArrayBuffer) => Promise<AudioBuffer>)|null} decodes sound banks (set by the engine) */
    this.decodeAudio = null;
  }

  /**
   * Sets the renderer whose compressed-texture support KTX2 textures are transcoded for (before any GLB parses).
   * @param {import('three/webgpu').WebGPURenderer} renderer initialised renderer
   */
  setRenderer(renderer) {
    this.ktx2.detectSupport(renderer);
  }

  /** Starts downloading the Basis transcoder now (otherwise it waits for the first KTX2 texture). */
  prefetchTranscoder() {
    this.ktx2.init().catch(() => {}); // a failure resurfaces when a texture needs it
  }

  /**
   * Starts downloading entries now; a later `loadAll` of the same entries takes their bytes (and progress) over.
   * @param {AssetEntry[]} entries
   */
  prefetch(entries) {
    for (const entry of entries) {
      if (!this._cache.has(entry.url) && !isDownloading(entry.url)) download(entry.url, this.fetchImpl);
    }
  }

  /**
   * Loads entries in parallel (bounded), calling `onProgress(loadedBytes, totalBytes)`.
   * Already-cached entries count as loaded and gain a reference.
   * @param {AssetEntry[]} entries
   * @param {(loaded: number, total: number) => void} [onProgress]
   * @returns {Promise<Map<string, any>>} url → parsed asset
   */
  async loadAll(entries, onProgress = () => {}) {
    const total = entries.reduce((sum, entry) => sum + entry.bytes, 0);
    const loadedPer = new Map();
    const report = () => {
      let loaded = 0;
      for (const value of loadedPer.values()) loaded += value;
      onProgress(Math.min(loaded, total), total);
    };
    const results = new Map();
    let next = 0;
    const worker = async () => {
      while (next < entries.length) {
        const entry = entries[next++];
        const cached = this._cache.get(entry.url);
        if (cached) {
          cached.refs++;
          results.set(entry.url, cached.value);
          loadedPer.set(entry.url, entry.bytes);
          report();
          continue;
        }
        const onBytes = (bytes) => {
          loadedPer.set(entry.url, Math.min(bytes, entry.bytes));
          report();
        };
        const early = takeDownload(entry.url);
        let buffer;
        if (early) {
          early.listener = onBytes;
          onBytes(early.received);
          buffer = await early.bytes;
        } else {
          buffer = await this.fetchBytes(entry.url, onBytes);
        }
        const value = await this.parse(entry, buffer);
        this._cache.set(entry.url, { value, refs: 1 });
        results.set(entry.url, value);
        loadedPer.set(entry.url, entry.bytes);
        report();
      }
    };
    await Promise.all(Array.from({ length: Math.min(this.concurrency, entries.length) }, worker));
    return results;
  }

  /**
   * Fetches a file as bytes, streaming to report progress.
   * @param {string} url
   * @param {(receivedBytes: number) => void} [onBytes]
   * @returns {Promise<ArrayBuffer>}
   */
  fetchBytes(url, onBytes = () => {}) {
    return streamBytes(this.fetchImpl, url, onBytes);
  }

  /**
   * Parses fetched bytes by type.
   * @param {AssetEntry} entry
   * @param {ArrayBuffer} buffer
   * @returns {Promise<any>}
   */
  async parse(entry, buffer) {
    switch (entry.type) {
      case 'glb': {
        const base = entry.url.slice(0, entry.url.lastIndexOf('/') + 1);
        return this.gltf.parseAsync(buffer, base);
      }
      case 'json':
        return JSON.parse(new TextDecoder().decode(buffer));
      case 'audio':
        return this.decodeAudio ? this.decodeAudio(buffer) : buffer;
      default:
        return buffer;
    }
  }

  /**
   * Drops one reference; disposes GPU resources when nothing uses the asset any more.
   * @param {string} url
   */
  release(url) {
    const cached = this._cache.get(url);
    if (!cached) return;
    cached.refs--;
    if (cached.refs > 0) return;
    this._cache.delete(url);
    disposeAsset(cached.value);
  }

  /** Frees the KTX2 transcoder workers. */
  dispose() {
    for (const url of [...this._cache.keys()]) {
      const cached = this._cache.get(url);
      if (cached) {
        cached.refs = 0;
        this.release(url);
      }
    }
    this.ktx2.dispose();
  }
}

/**
 * Disposes geometries, materials and textures inside a loaded glTF.
 * @param {any} asset
 */
export function disposeAsset(asset) {
  const scene = asset?.scene;
  if (!scene) return;
  scene.traverse((object) => {
    if (object.geometry) object.geometry.dispose();
    const materials = Array.isArray(object.material)
      ? object.material
      : object.material
        ? [object.material]
        : [];
    for (const material of materials) {
      for (const value of Object.values(material)) {
        if (value && value.isTexture) value.dispose();
      }
      material.dispose();
    }
  });
}
