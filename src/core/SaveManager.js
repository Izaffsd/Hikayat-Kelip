import { crc32 } from './crc32.js';
import { decodeCode, encodeCode } from './codec.js';
import { EV } from './events.js';
import { CURRENT_SCHEMA, MIGRATIONS, createDefaultSave } from './saveSchema.js';

/** Storage key of the save (data/boot.json names it too, to tell a new player before the engine loads). */
export const SAVE_KEY = 'hk.save';
const KEY = SAVE_KEY;
const TMP_KEY = 'hk.save.tmp';
const BACKUP_KEY = 'hk.save.bak';
const CORRUPT_KEY = 'hk.save.corrupt';
const CODE_TAG = 'HK1';

/**
 * @typedef {'new'|'loaded'|'migrated'|'restored-backup'|'corrupt-reset'|'future-schema'} LoadStatus
 */

/**
 * Versioned, checksummed save storage with migrations.
 *
 * Stored format: `{ crc, doc }` where `crc = crc32(JSON.stringify(doc))`. Writes go to a temporary
 * key first, are verified, then the previous good save becomes the backup and the new one replaces
 * it. A damaged save falls back to the backup; a save from a newer game version is never overwritten.
 */
export class SaveManager {
  /**
   * @param {object} options
   * @param {import('./storage.js').KeyValueStorage} options.storage
   * @param {import('./EventBus.js').EventBus} [options.bus]
   * @param {number} [options.schema] current schema version
   * @param {Array<(doc: any) => any>} [options.migrations]
   * @param {(now: number) => any} [options.createDefault]
   * @param {() => number} [options.now]
   */
  constructor({
    storage,
    bus,
    schema = CURRENT_SCHEMA,
    migrations = MIGRATIONS,
    createDefault = createDefaultSave,
    now = () => Date.now(),
  }) {
    if (migrations.length < schema)
      throw new Error(`Missing migrations: need ${schema}, have ${migrations.length}`);
    this.storage = storage;
    this.bus = bus;
    this.schema = schema;
    this.migrations = migrations;
    this.createDefault = createDefault;
    this.now = now;
    /** True when a save from a newer version was found; saving is then refused. */
    this.readOnly = false;
  }

  /**
   * Loads the save, migrating it to the current schema.
   * @returns {{ doc: any, status: LoadStatus }}
   */
  load() {
    const primary = this._read(KEY);
    if (primary.ok) return { doc: primary.doc, status: primary.migrated ? 'migrated' : 'loaded' };
    if (primary.reason === 'future') {
      this.readOnly = true;
      return { doc: this.createDefault(this.now()), status: 'future-schema' };
    }
    const backup = this._read(BACKUP_KEY);
    if (backup.ok) return { doc: backup.doc, status: 'restored-backup' };
    if (primary.reason === 'missing') return { doc: this.createDefault(this.now()), status: 'new' };
    const raw = this.storage.get(KEY);
    if (raw) {
      try {
        this.storage.set(CORRUPT_KEY, raw);
      } catch {
        // Keeping the damaged copy is best-effort only.
      }
    }
    return { doc: this.createDefault(this.now()), status: 'corrupt-reset' };
  }

  /**
   * Writes the save atomically. Returns false (and emits SAVE_FAILED) on failure.
   * @param {any} doc
   * @returns {boolean}
   */
  save(doc) {
    if (this.readOnly) {
      this.bus?.emit(EV.SAVE_FAILED, { error: 'A save from a newer version of the game exists.' });
      return false;
    }
    doc.schema = this.schema;
    doc.savedAt = this.now();
    try {
      const body = JSON.stringify(doc);
      const envelope = `{"crc":${crc32(body)},"doc":${body}}`;
      this.storage.set(TMP_KEY, envelope);
      if (this.storage.get(TMP_KEY) !== envelope) throw new Error('Verification of the written save failed');
      const previous = this.storage.get(KEY);
      if (previous && this._read(KEY).ok) this.storage.set(BACKUP_KEY, previous);
      this.storage.set(KEY, envelope);
      this.storage.remove(TMP_KEY);
      this.bus?.emit(EV.SAVE_WRITTEN, { schema: this.schema });
      return true;
    } catch (error) {
      this.bus?.emit(EV.SAVE_FAILED, { error: String(error) });
      return false;
    }
  }

  /**
   * Upgrades a document of any older schema to the current one.
   * @param {any} doc
   * @returns {any}
   */
  migrate(doc) {
    let current = doc;
    let version = Number.isInteger(current.schema) ? current.schema : 0;
    while (version < this.schema) {
      current = this.migrations[version](current);
      version++;
      current.schema = version;
    }
    return current;
  }

  /**
   * Exports a save as a text code for manual backup.
   * @param {any} doc
   * @returns {Promise<string>}
   */
  exportCode(doc) {
    return encodeCode(CODE_TAG, doc);
  }

  /**
   * Imports a save code: validates and migrates it. The caller decides whether to save it.
   * @param {string} code
   * @returns {Promise<any>}
   */
  async importCode(code) {
    const doc = await decodeCode(CODE_TAG, code);
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) throw new Error('Not a save');
    const version = Number.isInteger(doc.schema) ? doc.schema : 0;
    if (version > this.schema) throw new Error('This save comes from a newer version of the game');
    return this.migrate(doc);
  }

  /** Deletes the save, its backup and any temporary copy. */
  clear() {
    for (const key of [KEY, TMP_KEY, BACKUP_KEY, CORRUPT_KEY]) this.storage.remove(key);
    this.readOnly = false;
  }

  /**
   * Reads and validates one stored copy.
   * @param {string} key
   * @returns {{ ok: true, doc: any, migrated: boolean } | { ok: false, reason: 'missing'|'parse'|'invalid'|'crc'|'future'|'migration' }}
   */
  _read(key) {
    const raw = this.storage.get(key);
    if (!raw) return { ok: false, reason: 'missing' };
    let envelope;
    try {
      envelope = JSON.parse(raw);
    } catch {
      return { ok: false, reason: 'parse' };
    }
    if (!envelope || typeof envelope.crc !== 'number' || !envelope.doc || typeof envelope.doc !== 'object') {
      return { ok: false, reason: 'invalid' };
    }
    if (crc32(JSON.stringify(envelope.doc)) !== envelope.crc) return { ok: false, reason: 'crc' };
    const version = Number.isInteger(envelope.doc.schema) ? envelope.doc.schema : 0;
    if (version > this.schema) return { ok: false, reason: 'future' };
    try {
      return { ok: true, doc: this.migrate(envelope.doc), migrated: version < this.schema };
    } catch {
      return { ok: false, reason: 'migration' };
    }
  }
}
