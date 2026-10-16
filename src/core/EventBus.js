/**
 * Publish/subscribe bus. `emit` delivers synchronously; `queue` defers delivery to `flush()`
 * (called by the Engine at the end of every fixed tick) to avoid re-entrancy during physics callbacks.
 *
 * Handler lists are copy-on-write: subscribing or unsubscribing during an emit never disturbs the
 * iteration in progress, and `emit` itself allocates nothing.
 */
export class EventBus {
  constructor() {
    /** @type {Map<string, Function[]>} */
    this._handlers = new Map();
    /** @type {Array<string|unknown>} pairs of type, payload */
    this._queue = [];
    /** @type {Array<string|unknown>} */
    this._draining = [];
    /** @type {(error: unknown, type: string) => void} */
    this.onHandlerError = (error, type) => console.error(`[EventBus] handler for "${type}" failed`, error);
  }

  /**
   * Subscribes to an event.
   * @param {string} type
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe function
   */
  on(type, handler) {
    const list = this._handlers.get(type);
    this._handlers.set(type, list ? [...list, handler] : [handler]);
    return () => this.off(type, handler);
  }

  /**
   * Subscribes for a single delivery.
   * @param {string} type
   * @param {(payload: any) => void} handler
   * @returns {() => void} unsubscribe function
   */
  once(type, handler) {
    const off = this.on(type, (payload) => {
      off();
      handler(payload);
    });
    return off;
  }

  /**
   * Removes a handler.
   * @param {string} type
   * @param {(payload: any) => void} handler
   */
  off(type, handler) {
    const list = this._handlers.get(type);
    if (!list) return;
    const index = list.indexOf(handler);
    if (index < 0) return;
    if (list.length === 1) {
      this._handlers.delete(type);
      return;
    }
    const next = list.slice();
    next.splice(index, 1);
    this._handlers.set(type, next);
  }

  /**
   * Delivers an event to all current handlers immediately. A failing handler is reported and
   * does not stop the others.
   * @param {string} type
   * @param {unknown} [payload]
   */
  emit(type, payload) {
    const list = this._handlers.get(type);
    if (!list) return;
    for (let i = 0; i < list.length; i++) {
      try {
        list[i](payload);
      } catch (error) {
        this.onHandlerError(error, type);
      }
    }
  }

  /**
   * Queues an event for delivery at the next `flush()`.
   * @param {string} type
   * @param {unknown} [payload]
   */
  queue(type, payload) {
    this._queue.push(type, payload);
  }

  /**
   * Delivers all queued events in order. Events queued while flushing are delivered in the next flush.
   */
  flush() {
    if (this._queue.length === 0) return;
    const draining = this._queue;
    this._queue = this._draining;
    this._draining = draining;
    for (let i = 0; i < draining.length; i += 2) {
      this.emit(/** @type {string} */ (draining[i]), draining[i + 1]);
    }
    draining.length = 0;
  }

  /**
   * Number of handlers for a type (used by tests and the debug overlay).
   * @param {string} type
   * @returns {number}
   */
  listenerCount(type) {
    return this._handlers.get(type)?.length ?? 0;
  }
}
