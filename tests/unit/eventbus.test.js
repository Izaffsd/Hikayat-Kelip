import { describe, expect, it, vi } from 'vitest';
import { EventBus } from '../../src/core/EventBus.js';

describe('EventBus', () => {
  it('delivers synchronously to every handler in order', () => {
    const bus = new EventBus();
    const calls = [];
    bus.on('a', (p) => calls.push(['first', p]));
    bus.on('a', (p) => calls.push(['second', p]));
    bus.emit('a', 1);
    expect(calls).toEqual([
      ['first', 1],
      ['second', 1],
    ]);
  });

  it('unsubscribes, including during an emit, without skipping the others', () => {
    const bus = new EventBus();
    const calls = [];
    const offB = bus.on('a', () => calls.push('b'));
    bus.on('a', () => {
      calls.push('a');
      offB();
    });
    // Re-register order: b first, then a (which removes b for the next emit).
    bus.emit('a');
    bus.emit('a');
    expect(calls).toEqual(['b', 'a', 'a']);
    expect(bus.listenerCount('a')).toBe(1);
  });

  it('once fires a single time', () => {
    const bus = new EventBus();
    const handler = vi.fn();
    bus.once('x', handler);
    bus.emit('x', 1);
    bus.emit('x', 2);
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(1);
  });

  it('queues events until flush, and events queued during flush wait for the next one', () => {
    const bus = new EventBus();
    const seen = [];
    bus.on('q', (p) => {
      seen.push(p);
      if (p === 1) bus.queue('q', 2);
    });
    bus.queue('q', 1);
    expect(seen).toEqual([]);
    bus.flush();
    expect(seen).toEqual([1]);
    bus.flush();
    expect(seen).toEqual([1, 2]);
  });

  it('isolates a failing handler', () => {
    const bus = new EventBus();
    const errors = [];
    bus.onHandlerError = (error, type) => errors.push(type);
    const after = vi.fn();
    bus.on('e', () => {
      throw new Error('boom');
    });
    bus.on('e', after);
    bus.emit('e');
    expect(after).toHaveBeenCalled();
    expect(errors).toEqual(['e']);
  });
});
