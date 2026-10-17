import { Vector3 } from 'three/webgpu';
import { EV } from '../core/events.js';

/**
 * Combat HUD (Phase 3 slice; full HUD in M8): Bayu's health and Semangat at the top left (beside the Kelip corner of
 * the touch layout), the boss's corruption bar at the top for Cursed Adi, and a lock-on marker above the target.
 * Bars animate with transforms only; everything fades away out of combat at full health. Decorative for assistive
 * tech (the game state is also told through sound and the scene).
 */
export class CombatHud {
  /**
   * @param {object} options
   * @param {HTMLElement} options.root
   * @param {import('../core/EventBus.js').EventBus} options.bus
   * @param {import('../core/I18n.js').I18n} options.i18n
   * @param {import('../ai/EnemyDirector.js').EnemyDirector} options.director
   */
  constructor({ root, bus, i18n, director }) {
    this.director = director;
    this.i18n = i18n;
    this.element = document.createElement('div');
    this.element.className = 'hk-hud';
    this.element.setAttribute('aria-hidden', 'true');
    this.element.innerHTML = `
      <div class="hk-hud__vitals is-hidden">
        <div class="hk-hud__bar hk-hud__bar--health"><span></span></div>
        <div class="hk-hud__bar hk-hud__bar--semangat"><span></span></div>
      </div>
      <div class="hk-hud__boss is-hidden">
        <p class="hk-hud__boss-name"></p>
        <div class="hk-hud__bar hk-hud__bar--boss"><span></span></div>
      </div>
      <div class="hk-hud__lock is-hidden"></div>`;
    root.appendChild(this.element);
    this._vitals = this.element.querySelector('.hk-hud__vitals');
    this._health = this.element.querySelector('.hk-hud__bar--health span');
    this._semangat = this.element.querySelector('.hk-hud__bar--semangat span');
    this._boss = this.element.querySelector('.hk-hud__boss');
    this._bossName = this.element.querySelector('.hk-hud__boss-name');
    this._bossBar = this.element.querySelector('.hk-hud__bar--boss span');
    this._lock = this.element.querySelector('.hk-hud__lock');
    this._health.style.transform = 'scaleX(1)';
    this._semangat.style.transform = 'scaleX(0)';
    this._healthValue = 1;
    this._calm = 0;
    this._bossId = null;
    this._lockId = null;
    this._point = new Vector3();
    this._off = [
      bus.on(EV.PLAYER_HEALTH, ({ health, max }) => this._setHealth(health / max)),
      bus.on(EV.SEMANGAT_CHANGED, ({ value, max }) => {
        this._semangat.style.transform = `scaleX(${value / max})`;
      }),
      bus.on(EV.ENEMY_SPAWNED, ({ id }) => this._spawned(id)),
      bus.on(EV.ENEMY_HIT, ({ id, vitality, max }) => {
        if (id === this._bossId) this._bossBar.style.transform = `scaleX(${vitality / max})`;
      }),
      bus.on(EV.ENEMY_REMOVED, ({ id }) => {
        if (id === this._bossId) this._setBoss(null);
      }),
      bus.on(EV.LOCK_CHANGED, ({ id }) => {
        this._lockId = id;
      }),
    ];
  }

  /**
   * Per frame: fades the vitals, places the lock marker.
   * @param {number} dt
   * @param {import('three').Camera} camera
   * @param {boolean} inCombat
   * @param {boolean} hardLock
   */
  update(dt, camera, inCombat, hardLock) {
    const calm = !inCombat && this._healthValue >= 1;
    this._calm = calm ? this._calm + dt : 0;
    this._vitals.classList.toggle('is-hidden', this._calm > 2.5);
    const target = this._lockId === null ? null : this.director.enemies.find((e) => e.id === this._lockId);
    if (!target || target.state === 'defeated' || !inCombat) {
      this._lock.classList.add('is-hidden');
      return;
    }
    this._point
      .set(target.position.x, target.position.y + target.height + 0.35, target.position.z)
      .project(camera);
    if (this._point.z > 1) {
      this._lock.classList.add('is-hidden');
      return;
    }
    const x = (this._point.x * 0.5 + 0.5) * window.innerWidth;
    const y = (-this._point.y * 0.5 + 0.5) * window.innerHeight;
    this._lock.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px) rotate(45deg)`;
    this._lock.classList.toggle('is-hard', hardLock);
    this._lock.classList.remove('is-hidden');
  }

  dispose() {
    for (const off of this._off) off();
    this.element.remove();
  }

  _setHealth(value) {
    this._healthValue = value;
    this._health.style.transform = `scaleX(${Math.max(0, value)})`;
    this._vitals.classList.toggle('is-low', value < 0.3);
  }

  _spawned(id) {
    const enemy = this.director.enemies.find((e) => e.id === id);
    if (enemy?.kind === 'boss') this._setBoss(enemy);
  }

  _setBoss(enemy) {
    this._bossId = enemy?.id ?? null;
    this._boss.classList.toggle('is-hidden', !enemy);
    if (!enemy) return;
    this._bossName.textContent = this.i18n.t(`enemy.${enemy.archetype}`);
    this._bossBar.style.transform = 'scaleX(1)';
  }
}
