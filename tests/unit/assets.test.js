import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { MeshoptDecoder as NodeMeshoptDecoder } from 'meshoptimizer';
import { data } from '../../src/core/Data.js';

const manifest = data('generated/assets').assets;
const publicDir = path.resolve('public');
const file = (key) => readFileSync(path.join(publicDir, manifest[key].url));

/**
 * Parses a GLB with three's GLTFLoader (as the game does) and returns the result.
 * @param {Buffer} buffer
 */
function parse(buffer) {
  const loader = new GLTFLoader();
  loader.setMeshoptDecoder(MeshoptDecoder);
  const array = buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
  return loader.parseAsync(array, '');
}

/**
 * Walks an Ogg Vorbis file's pages: channel count and sample rate from the identification header, duration from the
 * last page's granule position (the exact sample count after end trimming).
 * @param {Buffer} buffer
 */
function oggInfo(buffer) {
  let offset = 0;
  let granule = 0n;
  let firstBody = -1;
  while (offset < buffer.byteLength) {
    expect(buffer.toString('latin1', offset, offset + 4)).toBe('OggS');
    const segments = buffer[offset + 26];
    let size = 27 + segments;
    for (let i = 0; i < segments; i++) size += buffer[offset + 27 + i];
    if (firstBody < 0) firstBody = offset + 27 + segments;
    granule = buffer.readBigInt64LE(offset + 6);
    offset += size;
  }
  expect(buffer.toString('latin1', firstBody + 1, firstBody + 7)).toBe('vorbis');
  const rate = buffer.readUInt32LE(firstBody + 12);
  return { channels: buffer[firstBody + 11], rate, duration: Number(granule) / rate };
}

describe('published assets', () => {
  it('lists only hashed files that exist and match their recorded size', () => {
    for (const [key, entry] of Object.entries(manifest)) {
      expect(entry.url, key).toMatch(
        entry.type === 'audio' ? /\.[0-9a-f]{10}\.ogg$/ : /\.[0-9a-f]{10}\.glb$/,
      );
      expect(file(key).byteLength, key).toBe(entry.bytes);
    }
  });

  it('sound banks are mono 44.1 kHz Vorbis and every sound region lies inside its file', () => {
    const banks = Object.entries(manifest).filter(([, entry]) => entry.type === 'audio');
    const keys = banks.map(([key]) => key);
    for (const key of [
      'audio/ui',
      'audio/sfx',
      'audio/storm',
      'audio/amb_night',
      'audio/amb_rain',
      'audio/glide_wind',
    ]) {
      expect(keys).toContain(key);
    }
    for (const [key, entry] of banks) {
      const info = oggInfo(file(key));
      expect(info.channels, key).toBe(1);
      expect(info.rate, key).toBe(44100);
      expect(['music', 'ambience', 'sfx', 'voice', 'ui'], key).toContain(entry.bus);
      for (const [id, regions] of Object.entries(entry.sounds)) {
        expect(regions.length, id).toBeGreaterThan(0);
        for (const [offset, duration] of regions) {
          expect(offset, id).toBeGreaterThanOrEqual(0);
          expect(duration, id).toBeGreaterThan(0);
          expect(offset + duration, id).toBeLessThanOrEqual(info.duration + 1e-3);
        }
      }
      if (entry.loop) {
        const regions = Object.values(entry.sounds);
        expect(regions, key).toHaveLength(1);
        expect(regions[0][0][0]).toBe(0);
        expect(Math.abs(regions[0][0][1] - info.duration), `${key} loop length`).toBeLessThan(1e-3);
      }
    }
    const sfx = manifest['audio/sfx'].sounds;
    for (const id of [
      'step_wood',
      'hit_light',
      'whoosh_light',
      'parry_perfect',
      'tell',
      'freed',
      'kelip_twinkle',
    ]) {
      expect(sfx[id]?.length, id).toBeGreaterThan(0);
    }
  });

  it('audio sources are CC0 only', () => {
    const config = JSON.parse(readFileSync(path.resolve('tools/audio/sounds.json'), 'utf8'));
    for (const [id, source] of Object.entries(config.sources)) expect(source.license, id).toBe('CC0-1.0');
  });

  it('animation packs load in three.js with the expected clips bound to universal-rig bones', async () => {
    const expected = {
      'anim/anim_core': [
        'idle',
        'walk',
        'jog',
        'sprint',
        'jump_start',
        'jump_loop',
        'jump_land',
        'climb_up_1m_rm',
        'block',
        'lay_to_idle',
      ],
      'anim/anim_villager': ['talk', 'sit_idle', 'lantern_idle', 'rail_idle', 'harvest'],
      'anim/anim_cursed': ['cursed_idle', 'cursed_walk', 'shield_idle'],
    };
    for (const [key, clips] of Object.entries(expected)) {
      const gltf = await parse(file(key));
      const names = gltf.animations.map((clip) => clip.name);
      for (const clip of clips) expect(names, key).toContain(clip);
      for (const clip of gltf.animations) {
        expect(clip.duration, `${key}:${clip.name}`).toBeGreaterThan(0);
        expect(clip.tracks.some((t) => t.name.startsWith('upperarm_l.'))).toBe(true);
      }
    }
  });

  it('Tok Belang loads as a skinned mesh with the procedural-animation skeleton', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': NodeMeshoptDecoder,
    });
    await NodeMeshoptDecoder.ready;
    const document = await io.readBinary(new Uint8Array(file('characters/tokbelang')));
    const root = document.getRoot();
    const skin = root.listSkins()[0];
    expect(skin).toBeDefined();
    const joints = skin.listJoints().map((joint) => joint.getName());
    for (const bone of [
      'hips',
      'chest',
      'head',
      'tail5',
      'upperarm_l',
      'paw_r',
      'thigh_l',
      'hindpaw_r',
      'ear_l',
    ]) {
      expect(joints).toContain(bone);
    }
    const triangles = root
      .listMeshes()
      .filter((mesh) => mesh.getName() === 'tokbelang')
      .flatMap((mesh) => mesh.listPrimitives())
      .reduce((sum, prim) => sum + prim.getIndices().getCount() / 3, 0);
    expect(triangles).toBeLessThanOrEqual(12000);
  });

  it('human characters share the universal rig, fit their budgets and ship one atlas without vertex colours', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': NodeMeshoptDecoder,
    });
    await NodeMeshoptDecoder.ready;
    const budgets = {
      bayu: 14000,
      wan_young: 14000,
      adi: 10000,
      maksom: 10000,
      villager_man: 5000,
      villager_elder: 5000,
      villager_woman: 5000,
      villager_woman_b: 5000,
      villager_child: 5000,
    };
    const clipBones = ['pelvis', 'spine_03', 'Head', 'upperarm_l', 'hand_r', 'thigh_l', 'foot_r', 'ball_l'];
    for (const [name, budget] of Object.entries(budgets)) {
      const document = await io.readBinary(new Uint8Array(file(`characters/${name}`)));
      const root = document.getRoot();
      const joints = root
        .listSkins()[0]
        .listJoints()
        .map((joint) => joint.getName());
      for (const bone of clipBones) expect(joints, `${name} ${bone}`).toContain(bone);
      const mesh = root.listMeshes().find((m) => m.getName() === name);
      const lod = root.listMeshes().find((m) => m.getName() === `${name}__lod1`);
      expect(mesh, name).toBeDefined();
      expect(lod, `${name} lod`).toBeDefined();
      const triangles = (m) => m.listPrimitives().reduce((sum, p) => sum + p.getIndices().getCount() / 3, 0);
      expect(triangles(mesh), name).toBeLessThanOrEqual(budget);
      expect(triangles(lod), name).toBeLessThan(triangles(mesh) / 2);
      for (const prim of mesh.listPrimitives()) {
        expect(prim.getAttribute('COLOR_0'), `${name} vertex colours`).toBeNull();
        expect(prim.getMaterial().getBaseColorTexture(), `${name} atlas`).not.toBeNull();
      }
      expect(root.listTextures()).toHaveLength(1);
    }
  });

  it('Kelip and the shadow wisp keep their _SWAY attribute for shader animation', async () => {
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': NodeMeshoptDecoder,
    });
    await NodeMeshoptDecoder.ready;
    for (const key of ['characters/kelip', 'characters/wisp']) {
      const document = await io.readBinary(new Uint8Array(file(key)));
      const semantics = document
        .getRoot()
        .listMeshes()
        .flatMap((mesh) => mesh.listPrimitives())
        .flatMap((prim) => prim.listSemantics());
      expect(semantics, key).toContain('_SWAY');
    }
  });

  it('slice props keep their runtime hooks (attach points, hinge, light, colliders)', async () => {
    await NodeMeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': NodeMeshoptDecoder,
    });
    const document = await io.readBinary(new Uint8Array(file('props/props_slice')));
    const nodes = document.getRoot().listNodes();
    const extras = (name) => nodes.find((n) => n.getName() === name)?.getExtras() ?? {};
    const props = nodes.map((n) => n.getExtras()?.hk_prop).filter(Boolean);
    for (const prop of [
      'tongkat',
      'wau_bulan',
      'hikayat',
      'page_torn',
      'pelita_air',
      'peti',
      'lore_scroll',
    ]) {
      expect(props, prop).toContain(prop);
    }
    expect(extras('tongkat').hk_attach).toBe('hand');
    expect(extras('wau_bulan').hk_grips.split(';')).toHaveLength(2);
    expect(extras('peti__lid').hk_hinge).toBe('x');
    expect(extras('pelita_air').hk_pelita).toBe('air');
    expect(nodes.filter((n) => n.getExtras()?.hk_collider === 'box').length).toBeGreaterThanOrEqual(3);
  });

  it('the Kampung kit keeps one node per piece plus collider empties', async () => {
    await NodeMeshoptDecoder.ready;
    const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({
      'meshopt.decoder': NodeMeshoptDecoder,
    });
    const document = await io.readBinary(new Uint8Array(file('kits/kampung_kit')));
    const nodes = document.getRoot().listNodes();
    const pieces = nodes.filter((n) => n.getExtras()?.hk_piece).map((n) => n.getExtras().hk_piece);
    for (const piece of [
      'post',
      'floor_3x3',
      'wall_planks',
      'roof_gable_3',
      'stairs',
      'jetty_3',
      'berembang_a',
      'pondok_kelip',
    ]) {
      expect(pieces).toContain(piece);
    }
    expect(nodes.filter((n) => n.getExtras()?.hk_collider === 'box').length).toBeGreaterThanOrEqual(25);
  });
});
