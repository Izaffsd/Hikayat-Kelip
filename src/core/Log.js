/**
 * Captures errors and warnings into a ring buffer so they can be read on a phone in the debug overlay.
 * Installs `error` / `unhandledrejection` listeners and wraps `console.warn` / `console.error`
 * (the originals still run, so DevTools sees everything too).
 */
export class Log {
  /**
   * @param {number} [capacity=60]
   */
  constructor(capacity = 60) {
    this.capacity = capacity;
    /** @type {Array<{ time: number, level: 'error'|'warn'|'info', message: string }>} */
    this.entries = [];
    this.errorCount = 0;
    this.warnCount = 0;
    /** @type {Set<(entry: { time: number, level: string, message: string }) => void>} */
    this._listeners = new Set();
    this._installed = false;
  }

  /**
   * Hooks global error sources. Safe to call once; later calls are ignored.
   * @param {Window} [target=window]
   */
  install(target = window) {
    if (this._installed) return;
    this._installed = true;
    target.addEventListener('error', (event) => {
      const where = event.filename ? ` (${shortUrl(event.filename)}:${event.lineno}:${event.colno})` : '';
      this.add('error', `${event.message || 'Error'}${where}`, event.error);
    });
    target.addEventListener('unhandledrejection', (event) => {
      const reason = event.reason;
      this.add('error', `Unhandled promise rejection: ${describe(reason)}`, reason);
    });
    const originalWarn = console.warn.bind(console);
    const originalError = console.error.bind(console);
    console.warn = (...args) => {
      originalWarn(...args);
      this.add('warn', args.map(describe).join(' '));
    };
    console.error = (...args) => {
      originalError(...args);
      this.add('error', args.map(describe).join(' '));
    };
  }

  /**
   * Adds an entry.
   * @param {'error'|'warn'|'info'} level
   * @param {string} message
   * @param {unknown} [error] optional error whose stack is appended (first frames only)
   */
  add(level, message, error) {
    let text = message;
    if (error instanceof Error && error.stack) {
      const frames = error.stack
        .split('\n')
        .slice(1, 4)
        .map((line) => line.trim());
      if (frames.length) text += `\n  ${frames.join('\n  ')}`;
    }
    const entry = { time: performance.now(), level, message: text };
    this.entries.push(entry);
    if (this.entries.length > this.capacity) this.entries.shift();
    if (level === 'error') this.errorCount++;
    else if (level === 'warn') this.warnCount++;
    for (const listener of this._listeners) listener(entry);
  }

  /**
   * Listens for new entries.
   * @param {(entry: { time: number, level: string, message: string }) => void} listener
   * @returns {() => void} unsubscribe
   */
  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  /**
   * All entries as plain text (for "copy log").
   * @returns {string}
   */
  toText() {
    return this.entries
      .map((e) => `[${(e.time / 1000).toFixed(1)}s] ${e.level.toUpperCase()} ${e.message}`)
      .join('\n');
  }
}

/**
 * Turns any thrown value or console argument into readable text.
 * @param {unknown} value
 * @returns {string}
 */
function describe(value) {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

/**
 * Keeps only the file part of a script URL.
 * @param {string} url
 * @returns {string}
 */
function shortUrl(url) {
  const slash = url.lastIndexOf('/');
  return slash >= 0 ? url.slice(slash + 1) : url;
}

/** The process-wide log instance. */
export const log = new Log();
