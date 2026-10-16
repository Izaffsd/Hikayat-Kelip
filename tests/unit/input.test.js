import { describe, expect, it } from 'vitest';
import { data } from '../../src/core/Data.js';
import { EventBus } from '../../src/core/EventBus.js';
import { EV } from '../../src/core/events.js';
import { Input, radialDeadzone } from '../../src/core/Input.js';

function makeInput() {
  const bus = new EventBus();
  return { bus, input: new Input({ bus, bindings: data('input/bindings') }) };
}

function key(code, extra = {}) {
  return { code, repeat: false, target: { tagName: 'CANVAS' }, preventDefault() {}, ...extra };
}

describe('Input', () => {
  it('stamps presses with the tick they are applied on', () => {
    const { input } = makeInput();
    input.setVirtualButton('jump', true);
    expect(input.held('jump')).toBe(false); // not applied until the next tick
    input.beginTick(10);
    expect(input.pressed('jump')).toBe(true);
    expect(input.held('jump')).toBe(true);
    input.beginTick(11);
    expect(input.pressed('jump')).toBe(false);
    expect(input.held('jump')).toBe(true);
  });

  it('sees a press and release that both happen between two ticks', () => {
    const { input } = makeInput();
    input.setVirtualButton('jump', true);
    input.setVirtualButton('jump', false);
    input.beginTick(5);
    expect(input.pressed('jump')).toBe(true);
    expect(input.released('jump')).toBe(true);
    expect(input.held('jump')).toBe(false);
  });

  it('buffers presses for N ticks until consumed', () => {
    const { input } = makeInput();
    input.setVirtualButton('jump', true);
    input.beginTick(100);
    input.setVirtualButton('jump', false);
    input.beginTick(105);
    expect(input.pressedWithin('jump', 9)).toBe(true);
    input.beginTick(110);
    expect(input.pressedWithin('jump', 9)).toBe(false);

    input.setVirtualButton('jump', true);
    input.beginTick(200);
    input.consume('jump');
    expect(input.pressedWithin('jump', 9)).toBe(false);
    expect(input.pressed('jump')).toBe(false);
  });

  it('keeps an action held while any source holds it', () => {
    const { input } = makeInput();
    input._onKey(key('Space'), true);
    input.setVirtualButton('jump', true);
    input.beginTick(1);
    input._onKey(key('Space'), false);
    input.beginTick(2);
    expect(input.held('jump')).toBe(true);
    input.setVirtualButton('jump', false);
    input.beginTick(3);
    expect(input.held('jump')).toBe(false);
    expect(input.released('jump')).toBe(true);
  });

  it('maps WASD to a normalised move vector and ignores key repeat', () => {
    const { input } = makeInput();
    input._onKey(key('KeyW'), true);
    input._onKey(key('KeyD'), true);
    input._onKey(key('KeyD', { repeat: true }), true);
    input.beginTick(1);
    const move = input.getMove({ x: 0, y: 0 });
    expect(move.x).toBeCloseTo(Math.SQRT1_2);
    expect(move.y).toBeCloseTo(Math.SQRT1_2);
  });

  it('uses the strongest move source (touch over a lighter keyboard state)', () => {
    const { input } = makeInput();
    input.setVirtualMove(0, 0.4);
    expect(input.getMove({ x: 0, y: 0 }).y).toBeCloseTo(0.4);
  });

  it('ignores keys typed into text fields', () => {
    const { input } = makeInput();
    input._onKey(key('Space', { target: { tagName: 'INPUT' } }), true);
    input.beginTick(1);
    expect(input.held('jump')).toBe(false);
  });

  it('applies remapped bindings', () => {
    const { input } = makeInput();
    input.setBindings({ keyboard: { jump: ['KeyJ'] } });
    input._onKey(key('KeyJ'), true);
    input.beginTick(1);
    expect(input.pressed('jump')).toBe(true);
    expect(input.bindingsFor('keyboard', 'jump')).toEqual(['KeyJ']);
  });

  it('releases everything on focus loss', () => {
    const { input } = makeInput();
    input._onKey(key('KeyW'), true);
    input.beginTick(1);
    input.releaseAll();
    input.beginTick(2);
    expect(input.held('moveForward')).toBe(false);
  });

  it('emits UI actions immediately and reports device changes', () => {
    const { input, bus } = makeInput();
    const ui = [];
    const devices = [];
    bus.on(EV.UI_ACTION, (e) => ui.push(e.action));
    bus.on(EV.INPUT_DEVICE_CHANGED, (e) => devices.push(e.device));
    input._onKey(key('ArrowDown'), true);
    input.setVirtualButton('jump', true);
    expect(ui).toContain('uiDown');
    expect(devices).toEqual(['touch']);
    input.setVirtualButton('jump', false); // releasing must not switch device
    expect(devices).toEqual(['touch']);
  });

  it('applies a radial deadzone with smooth rescaling', () => {
    expect(radialDeadzone(0.1, 0.05, 0.15).len).toBe(0);
    const r = radialDeadzone(1, 0, 0.15);
    expect(r.x).toBeCloseTo(1);
    expect(radialDeadzone(0.575, 0, 0.15).len).toBeCloseTo(0.5);
  });
});
