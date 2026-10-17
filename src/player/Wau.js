/**
 * The wau bulan glider (GDD: "Deploy a kite mid-air"): the slice prop held above the head while gliding, opening
 * with a quick scale-in and folding away on landing. It rides on the avatar root, so it tilts with the glide.
 */
export class Wau {
  /**
   * @param {object} options
   * @param {{ scene: import('three').Object3D }} options.gltf props/props_slice
   * @param {import('./Avatar.js').Avatar} options.avatar
   * @param {{ position: number[], pitchDeg: number, openTime: number }} options.config animation profile `wau`
   */
  constructor({ gltf, avatar, config }) {
    const source = gltf.scene.children.find((node) => node.userData.hk_prop === 'wau_bulan');
    if (!source) throw new Error('Wau: props_slice has no wau_bulan');
    this.object = source.clone(true);
    this.object.name = 'Wau';
    this.object.position.fromArray(config.position);
    this.object.rotation.x = (config.pitchDeg * Math.PI) / 180;
    this.object.scale.setScalar(0.001);
    this.object.visible = false;
    this.object.traverse((node) => {
      if (node.isMesh) node.frustumCulled = false;
    });
    avatar.root.add(this.object);
    this.config = config;
    this.open = false;
    this._amount = 0;
  }

  /**
   * @param {boolean} open
   */
  setOpen(open) {
    this.open = open;
    if (open) this.object.visible = true;
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    const step = dt / Math.max(0.01, this.config.openTime);
    this._amount = Math.min(1, Math.max(0, this._amount + (this.open ? step : -step)));
    const eased = 1 - (1 - this._amount) ** 3;
    this.object.scale.setScalar(Math.max(0.001, eased));
    if (!this.open && this._amount === 0) this.object.visible = false;
  }

  dispose() {
    this.object.removeFromParent();
  }
}
