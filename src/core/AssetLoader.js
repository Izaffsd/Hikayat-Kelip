import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';

/**
 * @typedef {object} AssetEntry
 * @property {string} url
 * @property {number} bytes size from the asset manifest (used for progress before headers arrive)
 * @property {'glb'|'json'|'audio'|'binary'} type
 */

/**
 * Loads assets listed in manifests, reporting real byte progress, and keeps reference counts so a
 * region can release what only it used.
 */
export class AssetLoader {
  /**
   * @param {object} options
   * @param {import('three/webgpu').WebGPURenderer} options.renderer initialised renderer (for KTX2 support detection)
   * @param {string} options.basisPath folder with basis_transcoder.js/.wasm
   * @param {typeof fetch} [options.fetchImpl]
   * @param {number} [options.concurrency=4]
   */
  constructor({ renderer, basisPath, fetchImpl = globalThis.fetch.bind(globalThis), concurrency = 4 }) {
    this.fetchImpl = fetchImpl;
    this.concurrency = concurrency;
    this.ktx2 = new KTX2Loader().setTranscoderPath(basisPath);
    this.ktx2.detectSupport(renderer);
    this.gltf = new GLTFLoader();
    this.gltf.setKTX2Loader(this.ktx2);
    this.gltf.setMeshoptDecoder(MeshoptDecoder);
    /** @type {Map<string, { value: any, refs: number }>} */
    this._cache = new Map();
    /** @type {AudioContext|null} */
    this.audioContext = null;
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
        const buffer = await this.fetchBytes(entry.url, (bytes) => {
          loadedPer.set(entry.url, Math.min(bytes, entry.bytes));
          report();
        });
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
  async fetchBytes(url, onBytes = () => {}) {
    const response = await this.fetchImpl(url);
    if (!response.ok) throw new Error(`Failed to load ${url}: HTTP ${response.status}`);
    if (!response.body) {
      const buffer = await response.arrayBuffer();
      onBytes(buffer.byteLength);
      return buffer;
    }
    const reader = response.body.getReader();
    const chunks = [];
    let received = 0;
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.byteLength;
      onBytes(received);
    }
    const bytes = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return bytes.buffer;
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
        if (!this.audioContext) return buffer; // decoded later, once audio is unlocked
        return this.audioContext.decodeAudioData(buffer);
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
