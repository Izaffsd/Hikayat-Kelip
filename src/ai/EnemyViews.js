import { BufferAttribute, Group } from 'three/webgpu';
import { uniform } from 'three/tsl';
import { EV } from '../core/events.js';
import { Avatar } from '../player/Avatar.js';
import { inkMaterial, wispMaterial } from '../render/inkMaterial.js';

/** Character model per human archetype. */
const MODELS = { brawler: 'villager_man', adi: 'adi' };

/**
 * Makes a one-component attribute float32 (once per shared geometry). Meshopt quantizes custom attributes such as
 * `_sway` to normalized 8/16-bit, and WebGPU has no one-component 8-bit vertex format.
 * @param {import('three').BufferGeometry} geometry
 * @param {string} name
 */
function floatAttribute(geometry, name) {
  const attribute = geometry.attributes[name];
  if (attribute.array instanceof Float32Array && !attribute.isInterleavedBufferAttribute) return;
  const values = new Float32Array(attribute.count);
  for (let i = 0; i < attribute.count; i++) values[i] = attribute.getX(i);
  geometry.setAttribute(name, new BufferAttribute(values, 1));
}

/**
 * What enemies look like (TECHNICAL §6, §8): shadow wisps hover, rise on their tell, jolt when hit and dissolve into
 * motes that become fireflies; cursed villagers and Cursed Adi are villager/Adi avatars under Kelam's ink, wind up
 * their swipe in time with the telegraph (with an amber flash), flinch, stagger, and when freed the ink drains away
 * before they nod their thanks and walk off. Driven by the director's events and enemy state; interpolated between
 * ticks like the player.
 */
export class EnemyViews {
  /**
   * @param {object} options
   * @param {import('three').Scene} options.scene
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('./EnemyDirector.js').EnemyDirector} options.director
   * @param {Record<string, { scene: import('three').Object3D }>} options.models wisp, villager_man, adi GLBs
   * @param {Map<string, import('three').AnimationClip>} options.clips
   * @param {object} options.profile data/animation/cursed.json
   * @param {import('../render/MoteBurst.js').MoteBurst} options.motes
   */
  constructor({ scene, bus, director, models, clips, profile, motes }) {
    Object.assign(this, { scene, bus, director, models, clips, profile, motes });
    /** @type {Map<number, any>} */
    this.views = new Map();
    /** Freed villagers walking away after their enemy is gone. */
    this.leaving = [];
    this._off = [
      bus.on(EV.ENEMY_SPAWNED, ({ id, archetype }) => this._create(id, archetype)),
      bus.on(EV.ENEMY_TELEGRAPH, ({ id, kind, seconds }) => this._telegraph(id, kind, seconds)),
      bus.on(EV.ENEMY_HIT, ({ id }) => this._hit(id)),
      bus.on(EV.ENEMY_STAGGERED, ({ id }) => this._stagger(id)),
      bus.on(EV.ENEMY_DEFEATED, ({ id }) => this._defeated(id)),
      bus.on(EV.ENEMY_REMOVED, ({ id }) => this._removed(id)),
    ];
  }

  /**
   * Per rendered frame.
   * @param {number} dt animation seconds (scaled with game time)
   * @param {number} alpha tick interpolation
   * @param {import('three').Camera} camera
   * @param {number} now real seconds (bob, pulses)
   */
  update(dt, alpha, camera, now) {
    for (const [id, view] of this.views) {
      const e = view.enemy;
      const x = e.prev.x + (e.position.x - e.prev.x) * alpha;
      const y = e.prev.y + (e.position.y - e.prev.y) * alpha;
      const z = e.prev.z + (e.position.z - e.prev.z) * alpha;
      const facing = e.interpolatedFacing(alpha);
      const telling = e.state === 'windup' || e.state === 'dashWindup';
      if (view.kind === 'wisp') {
        view.flash = Math.max(0, view.flash - dt * 6);
        const rise = telling ? Math.min(1, e.stateTime / 0.3) * 0.35 : 0;
        const bob = Math.sin(now * 3 + id) * 0.08;
        view.group.position.set(x, y + bob + rise, z);
        view.group.rotation.y = facing;
        const pulse = telling ? 1 + Math.sin(now * 18) * 0.06 + 0.1 : 1;
        const squash = 1 - view.flash * 0.3;
        const stretch = e.state === 'attack' ? 1.25 : 1;
        view.root.scale.set(pulse * squash, pulse * squash, pulse * stretch);
        if (e.state === 'defeated') view.fade.value = Math.max(0, 1 - e.stateTime / e.def.dissolveSeconds);
      } else {
        const avatar = view.avatar;
        avatar.root.position.set(x, y, z);
        avatar.root.rotation.y = facing;
        const speed = Math.hypot(e.position.x - e.prev.x, e.position.z - e.prev.z) * 60;
        avatar.animator.setSpeed(e.state === 'defeated' ? 0 : speed);
        view.tell.value = telling ? 0.55 + Math.sin(now * 16) * 0.45 : Math.max(0, view.tell.value - dt * 5);
        if (e.state !== 'stagger' && avatar.animator.state === 'stagger' && e.state !== 'defeated') {
          avatar.animator.setState('ground');
        }
        if (e.state === 'defeated') this._freeing(view, e);
        avatar.update(dt, camera, e.arena.y);
      }
    }
    for (let i = this.leaving.length - 1; i >= 0; i--) {
      const view = this.leaving[i];
      view.leave += dt;
      const avatar = view.avatar;
      avatar.root.position.x += Math.sin(avatar.root.rotation.y) * 1.3 * dt;
      avatar.root.position.z += Math.cos(avatar.root.rotation.y) * 1.3 * dt;
      avatar.update(dt, camera, avatar.root.position.y);
      if (view.leave > 3.5) {
        avatar.dispose();
        this.leaving.splice(i, 1);
      }
    }
  }

  /** Removes every view (encounter restart, region change). */
  clear() {
    for (const id of [...this.views.keys()]) this._dispose(this.views.get(id));
    this.views.clear();
    for (const view of this.leaving) view.avatar.dispose();
    this.leaving.length = 0;
  }

  dispose() {
    this.clear();
    for (const off of this._off) off();
  }

  _enemy(id) {
    return this.director.enemies.find((enemy) => enemy.id === id);
  }

  _create(id, archetype) {
    const enemy = this._enemy(id);
    if (!enemy) return;
    if (enemy.kind === 'wisp') {
      const root = this.models.wisp.scene.clone(true);
      const fade = uniform(1);
      root.traverse((object) => {
        if (!object.isMesh) return;
        const sway = Object.keys(object.geometry.attributes).find((key) =>
          key.toLowerCase().includes('sway'),
        );
        if (sway) floatAttribute(object.geometry, sway);
        object.material = sway ? wispMaterial(object.material, fade, sway) : object.material;
        object.frustumCulled = false;
      });
      const group = new Group();
      group.name = `wisp:${id}`;
      group.add(root);
      this.scene.add(group);
      this.views.set(id, { kind: 'wisp', enemy, group, root, fade, flash: 0 });
      return;
    }
    const model = this.models[MODELS[archetype] ?? 'villager_man'];
    const avatar = new Avatar({ gltf: model, clips: this.clips, profile: this.profile, name: `enemy:${id}` });
    const ink = uniform(1);
    const tell = uniform(0);
    for (const mesh of [...avatar.mainMeshes, ...avatar.lodMeshes])
      mesh.material = inkMaterial(mesh.material, ink, tell);
    avatar.addTo(this.scene);
    this.views.set(id, { kind: 'human', enemy, avatar, ink, tell, freedStage: 0 });
  }

  _telegraph(id, kind, seconds) {
    const view = this.views.get(id);
    if (!view || view.kind !== 'human') return;
    const enemy = view.enemy;
    if (kind === 'dash') {
      const dash = enemy._phase().dash;
      const total = seconds + dash.distance / dash.speed;
      const clip = this.clips.get('shield_dash_rm');
      if (clip)
        view.avatar.animator.playAction('shield_dash_rm', {
          duration: total,
          timeScale: clip.duration / total,
        });
      return;
    }
    const clip = this.clips.get('cursed_swipe');
    if (!clip) return;
    // The swipe's strike sits about halfway through the clip: stretch its first half over the wind-up.
    view.avatar.animator.playAction('cursed_swipe', {
      duration: seconds + enemy.attackDef.active + 0.3,
      timeScale: (clip.duration * 0.5) / seconds,
      fadeIn: 0.12,
    });
  }

  _hit(id) {
    const view = this.views.get(id);
    if (!view) return;
    if (view.kind === 'wisp') {
      view.flash = 1;
      return;
    }
    if (view.enemy.state === 'hit') {
      view.avatar.animator.playAction('hit_chest', {
        duration: view.enemy.def.hitStunSeconds + 0.1,
        fadeIn: 0.04,
      });
    }
  }

  _stagger(id) {
    const view = this.views.get(id);
    if (!view || view.kind !== 'human') return;
    view.avatar.animator.stopAction(0.08);
    view.avatar.animator.setState('stagger', true);
  }

  _defeated(id) {
    const view = this.views.get(id);
    if (!view) return;
    if (view.kind === 'wisp') {
      const p = view.group.position;
      this.motes.burst(p.x, p.y + 0.2, p.z);
      return;
    }
    view.avatar.animator.stopAction(0.1);
    view.avatar.animator.setState('stagger', true);
    view.freedStage = 1;
  }

  /** The freed beat: the ink drains while he stands dazed, then a nod of thanks. */
  _freeing(view, enemy) {
    const t = enemy.stateTime;
    view.ink.value = Math.max(0, 1 - t / 1.4);
    if (view.freedStage === 1 && t > 0.6) {
      view.avatar.animator.setState('freed');
      view.freedStage = 2;
    } else if (view.freedStage === 2 && t > 1.6) {
      view.avatar.animator.setState('thanks');
      view.freedStage = 3;
    }
  }

  _removed(id) {
    const view = this.views.get(id);
    if (!view) return;
    this.views.delete(id);
    if (view.kind === 'human' && view.freedStage > 0) {
      // Walks away from the fight (GDD: freed villagers flee or thank Bayu).
      view.avatar.animator.setState('flee');
      view.leave = 0;
      this.leaving.push(view);
      return;
    }
    this._dispose(view);
  }

  _dispose(view) {
    if (view.kind === 'wisp') {
      view.group.removeFromParent();
      view.root.traverse((object) => object.isMesh && object.material.dispose());
    } else {
      view.avatar.dispose();
    }
  }
}
