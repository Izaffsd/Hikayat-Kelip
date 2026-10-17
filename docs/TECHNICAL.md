# Hikayat Kelip — Technical Design

Status: Phase 0 plan, 2026-10-16. Owner: the AI developer. Design truth stays in `docs/GDD.md`; this document
says how the game is built. Versions are pinned in `package.json` (three 0.186.1, Rapier compat 0.21.0, Vite 8.3.4).

---

## 1. What the tech must deliver

| Requirement (source) | Technical consequence |
| --- | --- |
| URL → in control in < 10 s on an iPhone 14 (Pillar 1) | Instant 2D title (no engine needed to paint it); engine, physics and prologue load behind it; prologue payload < 10 MB; shaders compiled before the first tap completes the transition |
| Movement is fun with no goal (Pillar 2) | Custom kinematic controller on Rapier with coyote time, jump buffer, momentum carry, assists; camera that never fights the player |
| Read, step, parry, lock (Pillar 3) | Frame-exact timing windows on a fixed 60 Hz simulation; telegraphs in shape + colour + sound; input buffering |
| Both twists, both endings (Pillar 4) | Data-driven missions, story flags and cutscenes; full save/restore at checkpoints; no soft-lock paths |
| One more try (Pillar 5) | Restart < 1 s (no reload: reset state in place); ghosts recorded every run; server-validated leaderboards |
| 30+ FPS for 10 min on iPhone 14 and mid-range Android (Low) | Quality presets, dynamic resolution, 30 FPS cap, thermal-aware scaling, strict draw-call and memory budgets |
| WebGPU with WebGL2 fallback, both good | TSL-only custom shaders; every effect has a tested path on both backends; `?webgl=1` / overlay toggle |

**Units and axes.** 1 unit = 1 metre, Y up, right-handed (three.js default). Bayu is 1.65 m tall. Simulation tick:
1/60 s. All gameplay timings in data are expressed in seconds and converted to ticks once at load.

---

## 2. Runtime architecture

### 2.1 Module map (fixed folder layout)

```
core/        Engine, Loop, Time, Input, EventBus, AssetLoader, SaveManager, I18n, Settings, Telemetry, Log
physics/     PhysicsWorld (Rapier world, collision groups, queries), CharacterController (Rapier KCC wrapper)
player/      Bayu (entity assembly), Controller (input → intents), Traversal (movement state machine),
             Abilities (unlock gating), Animator (layered state machine + blend trees)
combat/      CombatSystem (hit resolution, attack tokens), Combos, Parry (tangkis/langkah windows), LockOn, Weapons
camera/      CameraSystem (brain + blending), VirtualCameras (follow, lock-on, wall-run, glide, rail), CutsceneCamera
world/       RegionManager (streaming), LevelBuilder (layout JSON → scene + colliders), DayNight, Weather, Water
guidance/    KelipGuide (firefly wave to objective), environmental guides (kingfisher, crabs, lanterns, pages)
ai/          BehaviorTree (data-driven), Perception, Steering, enemies/*, bosses/*
missions/    MissionSystem, Objectives, Checkpoints, Triggers
narrative/   Dialogue, Cutscenes (timeline player), StoryState (flags, journal pages)
competitive/ Timer, Medals, Ghosts (record/encode/play), Leaderboards (client), DailyChallenge, Arena, Ranked
progression/ SkillTree, Cosmetics, Achievements, Cahaya wallet
render/      Renderer (WebGPURenderer setup), PostFX (RenderPipeline chains), materials/ (TSL), Particles,
             QualityManager (presets, dynamic resolution), Sky
audio/       AudioManager (Web Audio graph, buses, iOS session), MusicSystem (layered stems), Ambience
ui/          design system (CSS tokens), Screens (title, pause, settings, results…), HUD, touch/ (controls),
             FocusNavigator (keyboard/gamepad/touch menus), Subtitles, DebugOverlay
data/        JSON: tuning, missions, dialogue (bm/en), enemies, combos, abilities, quality, regions, i18n
```

Rules: one responsibility per module; systems never import each other's internals. They communicate through the
**EventBus** and through a small set of shared, read-mostly services injected by the Engine (Time, Input,
PhysicsWorld, AssetLoader, Settings). No module reads `window` globals for game state. All tuning numbers live in
`src/data` and are loaded through `core/Data.js`; code never hard-codes them. JSDoc on every public class/method.

### 2.2 Engine and loop

- `Engine` owns the systems, their init order, and teardown. Systems implement any of
  `init()`, `fixedUpdate(dt)`, `update(dt, alpha)`, `lateUpdate(dt)`, `dispose()`.
- `Loop` uses a fixed-step accumulator: physics and gameplay run at exactly 60 Hz (`dt = 1/60`), at most 5 steps per
  frame (spiral-of-death guard; excess time is dropped and logged in the overlay). Rendering runs once per
  `requestAnimationFrame` (via `renderer.setAnimationLoop`) and interpolates transforms with `alpha =
  accumulator / dt` from previous/current snapshots, so 30, 60, 90 and 120 Hz displays all look smooth.
- **Order per frame:** Input poll → (n × fixed: Controller intents → AI → Traversal/Combat → PhysicsWorld.step →
  post-step sync + triggers) → Animator → Camera → VFX/Particles → Audio listener → UI/HUD → render.
- `Time` provides `scale` (slow motion on perfect langkah, the "slower game speed" assist, hit-stop) separately for
  gameplay and for UI (UI never slows). Hit-stop freezes gameplay ticks for 2–5 ticks on heavy impacts.
- The 30 FPS cap skips every other rAF (on 60 Hz displays) while the simulation stays at 60 Hz.
- Zero allocations in hot paths: vectors/quaternions/matrices are module-level scratch objects; event payloads for
  per-frame events are pooled; arrays are reused. Verified with heap snapshots in Phase 7.

### 2.3 EventBus

`on(type, handler) → unsubscribe`, `once`, `emit(type, payload)` (synchronous) and `queue(type, payload)` (delivered
at the end of the current fixed tick, to avoid re-entrancy during physics callbacks). Event names are constants in
`core/events.js` (e.g. `PLAYER_LANDED`, `COMBAT_PERFECT_PARRY`, `MISSION_OBJECTIVE_DONE`, `CHECKPOINT_REACHED`,
`SETTINGS_CHANGED`). A dev-only tracer in the debug overlay lists the last 50 events.

### 2.4 Input

- **Actions, not keys.** Gameplay reads actions (`move` 2D, `look` 2D, `jump`, `strike`, `heavy`, `langkah`, `tangkis`,
  `context`, `kelip`, `lockon`, `pause`, `sprint`) and UI reads navigation actions (`up/down/left/right/confirm/back`).
- Devices: keyboard + mouse (pointer lock for look), Gamepad API (standard mapping, deadzones, rumble when
  available), touch (floating joystick, camera drag area, buttons — exactly the GDD layout; size, opacity and position
  adjustable and saved). Active device is detected from the last input; prompts switch icons automatically (GDD:
  a gamepad connected to a phone switches to controller prompts).
- Remapping for keyboard and gamepad in Settings, stored in the save's settings block; conflicts are swapped, not
  rejected. Defaults live in `data/input/bindings.json`.
- Buffers: every action records press/release ticks, so systems can ask "pressed within the last N ticks" (jump
  buffer, attack buffering, parry timing) deterministically.

### 2.5 Assets and loading

- `AssetLoader` loads from **manifests** (`public/assets/manifest.<region>.json`, generated by `npm run assets`)
  listing every file with its byte size and content hash, so progress is real bytes, not file counts. It streams with
  `fetch` + `ReadableStream` to count bytes, then hands buffers to the parsers.
- GLB via `GLTFLoader` with `MeshoptDecoder` and `KTX2Loader` (Basis transcoder served from `/assets/basis/`);
  `KTX2Loader.detectSupport(renderer)` after `await renderer.init()`. Audio via `decodeAudioData`.
- Characters share skeletons: `SkeletonUtils.clone` for instances; clips are shared `AnimationClip`s.
- Everything returned by the loader is reference-counted per region; unloading a region disposes geometries,
  materials and textures whose count reaches zero.
- Hashed file names + `Cache-Control: public, max-age=31536000, immutable` (vercel.json) so returning players
  download almost nothing.

### 2.6 Save, settings, i18n

- **SaveManager:** one JSON document `{ schema: N, createdAt, savedAt, story, checkpoint, missions, progression,
  competitive, stats }` stored as `{ crc, doc }` under key `hk.save` in `localStorage` (small: < 64 KB). Writes are
  atomic (write `hk.save.tmp`, read back to verify, then swap) with a CRC32 of the document to detect corruption; the
  previous good save is kept as `hk.save.bak`. Settings are stored separately (`hk.settings`, D-019).
  **Migrations:** an ordered list `migrations[n]: (doc) => doc` upgrades any older schema step by step; each migration
  has a unit test with a fixture of the old shape. Unknown future schemas are refused with a clear message (never
  overwritten).
- Saves happen at checkpoints, mission ends and settings changes — never mid-air or mid-combat.
- iOS Safari may evict script storage for sites not opened for 7 days unless added to the Home Screen; the
  "Add to Home Screen" invite mentions it, and Settings offers **Export / Import save code** (compressed, base64url)
  as a manual backup. (Phase 6 adds optional cloud backup only if it fits the privacy rules.)
- **Settings:** language, subtitles, audio buses, quality preset, 30 FPS cap, battery saver, dynamic resolution,
  camera sensitivity/invert, shake, reduced motion, high-contrast Kelip, colour-blind telegraph palette, touch layout,
  assists (per GDD), remapping, debug WebGL2 toggle.
- **I18n:** `data/i18n/{bm,en}.json` UI strings and `data/dialogue/{bm,en}/*.json` dialogue. Initial language follows
  `navigator.languages` (`ms*` → BM, otherwise English); switchable live. Missing keys fail the unit tests. Rumi only.

### 2.7 Telemetry (anonymous)

Events: `session_start` (renderer backend, quality preset, coarse device class, language), `mission_start`,
`mission_finish` (duration), `quit` (mission id + seconds into mission, sent with `navigator.sendBeacon` on
`pagehide`), `fps_summary` (average and 5th-percentile FPS per mission). Session id is a random UUID kept in memory
only (never stored, no user id, no IP stored, no fingerprinting). Sent in batches to `POST /api/event`. Until the
Phase 6 database exists, the function validates the payload and writes it to Vercel's runtime log; with Supabase
configured it inserts into an `events` table with a 90-day retention job. A setting turns telemetry off.

---

## 3. Rendering

### 3.1 Renderer setup

```js
import { WebGPURenderer } from 'three/webgpu';
const renderer = new WebGPURenderer({ canvas, antialias: false, forceWebGL: settings.forceWebGL });
await renderer.init();                       // must complete before KTX2 detection, compute, compile
const backend = renderer.backend.isWebGPUBackend ? 'webgpu' : 'webgl2';
```

- `forceWebGL` comes from `?webgl=1` or the debug overlay toggle (stored in settings; applying it reloads the page,
  keeping a single renderer per page lifetime — D-020). Before creating the renderer, `navigator.gpu.requestAdapter()`
  is probed and `forceWebGL` is passed explicitly when no adapter exists, so three's fallback warning never fires.
- Post-processing uses **`RenderPipeline`** (three r183+ name; `PostProcessing` is deprecated and warns — D-012).
- Output: sRGB, tone mapping per region (AgX on Medium/High for the painterly highlights, cheaper Neutral/ACES on Low
  if profiling shows a difference), exposure animated by DayNight.
- Before the title tap completes, the prologue scene is compiled with `renderer.compileAsync(scene, camera)` behind
  the title so the first gameplay frame does not hitch.

### 3.2 Look: stylized and painterly, cheap on phones

- **Materials (TSL, `render/materials/`)**
  - `PainterlyMaterial` (from `MeshStandardNodeMaterial` or a lighter `NodeMaterial` on Low): vertex colour + small
    palette textures, wrapped/ramped diffuse (soft 3-band), rim light, world-space brush-stroke noise that breaks up
    flat areas, baked AO in a vertex attribute or the texture alpha. One material per kit, many objects share it.
  - `CharacterMaterial`: same lighting model + face/eye decals + optional inverted-hull outline (High/Medium only).
  - `WaterMaterial`: depth-tinted (indigo shallows → deep), scrolling normal from noise, foam on intersections
    (scene depth), sky-gradient reflection; no planar reflection pass (too expensive on phones).
  - `KelamMaterial`: ink-like tendrils — vertex-displaced tubes and flowing ink noise, very dark violet-black with
    a faint edge sheen; never gore. A screen-space **colour-drain** pass desaturates the image inside a mask of Kelam
    influence (GDD: colour drains from whatever it touches).
  - `FireflyMaterial`: additive sprite with soft core; colour, blink phase and brightness per instance.
  - `SkyMaterial`: gradient dome, moon, stars, clouds (noise), driven by DayNight uniforms.
- **Lighting:** one directional (sun/moon) + hemisphere/ambient; at most 2 dynamic point lights on Low (Kelip and one
  hero lantern), 6 on High; all other lanterns are emissive geometry + bloom + baked vertex light.
- **Shadows:** High: `CSMShadowNode`, 3 cascades; Medium: one 2048 map fitted to the view; Low: blob shadow decals
  under characters, no shadow maps.

### 3.3 Post chain (`RenderPipeline`)

| Stage | Low | Medium | High |
| --- | --- | --- | --- |
| Scene pass | ✓ (render scale 0.6–0.85) | ✓ | ✓ |
| Bloom (fireflies, lanterns, Kelip) | half-res, 3 mips | ✓ | ✓ |
| Colour drain (Kelam mask) | ✓ (cheap) | ✓ | ✓ |
| Colour grading (`Lut3DNode`, one LUT per region/time) | ✓ | ✓ | ✓ |
| Light shafts (`GodraysNode`) | — | — | ✓ |
| Vignette + grain (subtle, off with reduced motion) | ✓ | ✓ | ✓ |
| Anti-aliasing | FXAA | SMAA | SMAA (or TRAA if stable) |
| Upscale | bilinear | `FSR1Node` when render scale < 1 | `FSR1Node` when render scale < 1 |

Every stage is a separate toggle so profiling can switch one off at a time from the overlay.

### 3.4 Particles

- Fireflies are the signature effect: instanced quads whose state (position, phase, target, brightness) lives in
  storage buffers updated by a **TSL compute** kernel (`renderer.compute(...)`). three's WebGL2 backend runs compute
  through transform feedback, so the same kernel serves both backends; if a device shows problems, a fallback
  evaluates the motion analytically in the vertex shader from per-instance seeds (no simulation state needed).
- Budgets: High 12 000, Medium 6 000, Low 2 000 fireflies (density scales; the synchronized-wave guidance always uses a
  dedicated pool so it never disappears on Low).
- Rain, splashes, ink wisps, dust and hit sparks use the same instanced-particle system with smaller pools.

### 3.5 Quality presets and dynamic resolution

| Setting | Low | Medium | High |
| --- | --- | --- | --- |
| Target frame rate | 30 (cap on by default on phones) | 60 | 60+ |
| Max device pixel ratio | 1.5 × render scale | 1.5 | 2.0 |
| Shadows | blob | 1 map | CSM 3 cascades |
| Draw distance / LOD bias | short / aggressive | medium | long |
| Foliage density | 40 % | 75 % | 100 % |
| Fireflies | 2 000 | 6 000 | 12 000 |
| Post | see §3.3 | | |
| Animation LOD | far NPCs at 15 Hz | 30 Hz | 60 Hz |

- **Auto preset:** first run picks a preset from the backend, GPU info and a 3-second warm-up sample behind the title;
  the player can override it.
- **Dynamic resolution:** a controller watches the median frame time over 30 frames; above budget it lowers the
  render scale in 5 % steps (min 0.5), below 80 % of budget for 2 s it raises it again (hysteresis prevents
  oscillation). On phones this absorbs thermal throttling over a 10-minute mission.
- **Battery saver:** Low preset + 30 FPS cap + render scale ≤ 0.7 + reduced particles.
- **Budgets checked in the overlay:** < 300 draw calls at High (target < 150 on Low), triangles < 1.5 M High / 400 k
  Low, textures < 256 MB High / 96 MB Low, JS heap stable over 30 minutes.

### 3.6 Draw-call strategy

Static kit pieces in a streaming cell are merged by material at build time (or batched with `BatchedMesh`);
repeated props and foliage use `InstancedMesh`; distant cells swap to merged low-LOD proxies; frustum culling per cell
bounding box; characters use LOD meshes (High/Low) and animation LOD.

---

## 4. World, levels and streaming

### 4.1 Authoring model

- **Kits** (Blender, scripted): modular meshes per region (stilt-house posts, floors, walls, attap roofs, stairs,
  jetty planks, boats, berembang trees, nipah palms, props). Each kit piece carries glTF `extras`:
  `collider` (`box | hull | mesh | none`), `surface` (`wood | mud | water | roof | cloth`), traversal tags
  (`ledge`, `wallrun`, `rope`, `vault`, `noclimb`) and LOD hints.
- **Layouts** (`src/data/regions/<region>/layout.json`): placements of kit instances, terrain heightfield reference,
  water bodies, spline paths (chase routes, Kelip guide paths, glide routes), and gameplay markers (spawn,
  checkpoint, trigger volumes, kill/respawn volumes, ledges, NPC spots, encounter arenas). Layouts are produced by
  layout scripts (`tools/layout/*.mjs`) and fine-tuned with an in-game debug placement tool (dev builds only).
- **LevelBuilder** turns a layout into: merged/instanced meshes, Rapier colliders (heightfield for terrain, cuboids and
  convex hulls for kit pieces, trimesh only where unavoidable), trigger sensors, and marker objects for gameplay.

### 4.2 Regions and cells

- Regions: `prologue`, `kampung` (Ch1 + epilogue), `sawah` (Ch2), `hutan` (Ch3), `kotakayu` (Ch4), `puncak` (Ch5),
  plus `trials/*` and `arena`. A region is split into cells (authored zones, ~60–120 m).
- **RegionManager** keeps the current cell and its neighbours loaded, starts loading cells inside a prefetch radius,
  and unloads cells outside a larger radius (hysteresis). GPU uploads and KTX2 transcodes are spread over frames
  (≤ 2 ms per frame budget). Chapter N+1's core assets download in the background during Chapter N.
- **First play:** only the title (inline) + engine chunk + prologue manifest (< 10 MB total incl. audio < 2 MB); Kampung
  Berembang streams during the prologue.

### 4.3 Day/night and weather

`DayNight` drives sun/moon direction, sky, fog colour, exposure, LUT blend and firefly activity from a time-of-day
value that missions can animate (dusk → night in Chapter 1). `Weather` handles the prologue storm (rain particles,
wind on foliage via vertex shader, lightning flashes on the sky and directional light, screen droplets on High).

---

## 5. Physics and the player controller

### 5.1 PhysicsWorld

- Rapier (`@dimforge/rapier3d-compat`, WASM embedded) initialised once (`await RAPIER.init()`), gravity −9.81 scaled by
  per-state multipliers in the controller, fixed `timestep = 1/60`.
- Collision groups: `WORLD`, `PLAYER`, `ENEMY`, `NPC`, `TRIGGER`, `CAMERA` (camera probes hit WORLD only), `PROJECTILE`,
  `WATER`. Queries go through helper methods (`raycast`, `shapeCast`, `overlapSphere`) with reusable scratch objects.
- Event handling (`EventQueue`) for sensors → trigger enter/exit events on the bus.

### 5.2 CharacterController (Rapier KinematicCharacterController)

- Capsule: radius 0.3, half-height 0.5 (≈1.6 m with radius). `offset 0.02`, autostep (max 0.35 m, min width 0.2 m,
  not onto dynamic bodies), snap-to-ground 0.3 m, max slope climb 50°, min slope slide 60°, `setApplyImpulsesToDynamicBodies(true)`
  for light props. Values live in `data/tuning/player.json`.
- The controller produces a desired displacement each tick; `computeColliderMovement` corrects it; the corrected
  translation is applied to the kinematic body; grounded state and hit normals feed Traversal.

### 5.3 Traversal state machine (`player/Traversal`)

States: `Grounded` (idle/walk/run/sprint with acceleration curves and turn leaning), `Jump`, `Air` (fall, with apex
gravity reduction), `Mantle`, `LedgeHang`/`LedgeShimmy`, `WallRun`, `Slide`, `Swing` (rope, Ch2), `Glide` (wau, prologue
then Ch2), `RootRun` (Ch3), `BunianStep` (Ch3 portals), `Vault`/`PoleSwing` (Ch4), `Sampan` (Ch4 vehicle), `Ride`
(Tok Belang, Ch5), `ThermalGlide` (Ch5), `Respawn`, `Cutscene`, `Combat` (sub-machine in §6).

Feel rules implemented explicitly:

- **Coyote time** 0.12 s, **jump buffer** 0.15 s, **variable jump** (release cuts upward velocity by 50 %), apex hang
  (gravity × 0.6 near apex), fall gravity × 1.6, terminal velocity cap.
- **Momentum carry:** horizontal speed is preserved between wall-run → jump → glide; glide starts with the current
  velocity and trades height for speed (dive) or speed for height (pull up).
- **Mantle/ledge:** forward ray at chest height + downward ray from above the edge + capsule clearance cast; waist-high
  edges auto-mantle (no button), higher edges within reach grab.
- **Ledge magnet assist:** within the last 0.25 s before a missed landing, steer toward the nearest valid ledge point
  within a radius (0.4 m keyboard, 0.8 m touch default, adjustable/off).
- **Wall-run:** side rays find vertical surfaces tagged `wallrun` (or untagged vertical walls longer than 2 m); reduced
  gravity curve, max duration from tuning (skill tree extends it), jump-off launches away from the wall.
- **Respawn:** water and kill volumes trigger a 0.4 s fade, respawn at the last safe ground position (grounded > 0.3 s on
  a non-moving, non-hazard surface), fade in — under 2 s total, no death screen.
- Abilities gate states by chapter (`player/Abilities` reads story progress); the prologue grants the full moveset to
  young Wan via a "borrowed" ability set.

### 5.4 Animator (Animator Controller equivalent)

- Layered state machine defined in `data/animation/<character>.json`: **Base** layer (locomotion blend tree 1D on speed:
  idle → walk → jog → run → sprint; 2D strafe tree in lock-on), **Action** layer (attacks, parries, hits, interactions;
  full-body or upper-body mask), **Additive** layer (lean into turns, breathing, landing squash).
- Transitions: conditions on parameters (speed, grounded, state ids, triggers), cross-fade durations, exit times,
  interrupt rules — the controller sets parameters only, never plays clips directly.
- Root motion is extracted per clip where needed (attacks, kuncian) and fed back to the controller as displacement.
- Foot IK (two-bone) on slopes and stairs on Medium/High; procedural look-at for heads.
- **Tok Belang** is fully procedural: a gait cycle whose phase advances with speed (walk/trot/gallop), per-leg IK onto the
  ground via raycasts, spine/neck following the velocity curve, tail and ears as spring chains, breathing and head
  tracking. **Kelip** is procedural too (no skeleton): a light core, trailing particles, colour and blink language.

---

## 6. Silat combat

### 6.1 Structure

- Simulation at 60 Hz; every move in `data/combat/moves.json` has `startup`, `active`, `recovery` (ticks), hit shapes
  (sphere/capsule attached to bones or the weapon tip), damage, poise damage, knockback, hit-stop, cancel windows and
  the buffer window.
- **Hit detection:** during active ticks, overlap tests of attack shapes against hurt-capsules (Rapier
  `intersectionsWithShape` on the `ENEMY`/`PLAYER` groups); one hit per target per swing.
- **Combos** (`data/combat/combos.json`): light/heavy strings, the eight buah as named sequences with unlock gating;
  input during the buffer window queues the next move; auto-combo assist strings attacks from repeated presses.
- **Weapons:** bare hands (fast, best kuncian), tongkat (reach, crowd control), keris (Ch4+, fast and precise); each
  weapon swaps the move set and the hit shapes.

### 6.2 Read, step, parry, lock

| Verb | Rule (Normal difficulty; values in data) |
| --- | --- |
| Telegraph (read) | Every enemy attack has a wind-up ≥ 0.35 s with a tell: body pose + glow colour + shape cue + audio cue (colour-blind-safe palette option; "Kelip marks tells earlier" skill adds a pre-tell) |
| Tangkis (parry) | Press within the perfect window before impact → perfect parry: attacker staggers, Semangat +; later in a wider guard window → normal block (chip damage) |
| Langkah (dodge) | Directional step with i-frames; perfect when the dodge starts within the perfect window before impact → 0.5 s of slow motion (time scale 0.35) and Buah Bayang opening |
| Kuncian (lock) | Available on a staggered enemy (context prompt); plays a paired animation aligned by sync points; on cursed villagers it frees them instantly (they turn back into people, flee or thank Bayu) |
| Semangat | Fills on perfect moves and kuncian; spent on the Kelip finisher (hits every nearby enemy) |
| Standoff | Duel opener: hold, release on the opponent's tell; the right timing wins the first exchange |

Perfect windows by difficulty and assist: Cerita 0.25 s, Normal 0.15 s, Pendekar 0.10 s; the touch assist and the
"wider parry window" assist/skill add +0.05–0.10 s. The **slower game speed** assist scales gameplay time to 0.8 or 0.7.

### 6.3 Encounter fairness

- **Attack tokens:** only N enemies (1–3 by difficulty) may be in an attack wind-up at once; others circle, feint or
  reposition, so fights stay readable on a phone.
- **Lock-on:** soft lock picks the threat nearest the stick direction; hard lock toggles; touch defaults to auto
  lock-on to the nearest threat (GDD assist). Camera frames player + target (§7).
- Cursed villagers have a **corruption** bar, not health. Reaching zero leaves them staggered and ready for kuncian;
  they are never killed. Shadow wisps dissolve into dark motes that become fireflies — never blood, never bodies.
- Player health regenerates out of combat; defeat in combat restarts the encounter in < 2 s with the "skip
  encounter" assist offered after 3 tries.

---

## 7. Camera (Cinemachine equivalent)

- **CameraSystem ("brain")** owns the real camera and picks the highest-priority active **VirtualCamera**; on a change
  it blends position, rotation and FOV over a duration with an easing curve (per pair, from data).
- Virtual cameras: `FollowOrbit` (default third person: pivot above Bayu, yaw/pitch from look input, auto-recenters
  behind Bayu after idle — GDD touch rule), `LockOn` (frames player + target, keeps both on screen), `WallRun` (side
  offset, slight roll), `Glide` (pulled back, higher FOV, horizon-stable), `Ride`/`Sampan` (vehicle rigs), `Rail`
  (spline dolly + look-at target, for chases and cutscenes), `Fixed` (authored shots).
- **Collision:** each frame a sphere cast (radius 0.25) from the pivot to the desired position against `WORLD`; the
  camera moves in quickly (no clipping) and back out slowly; when the space is too small it raises pitch rather than
  entering geometry; thin occluders (posts, ropes) are tagged `noCameraBlock` and dithered instead.
- Feel: look acceleration curves per device, FOV kick on sprint/dive, trauma-based shake (off by the shake toggle),
  reduced-motion setting removes roll, shake and FOV kicks.

---

## 8. AI

- **Perception:** sight cone + range + line-of-sight ray, hearing radius for noise events (landing, combat), memory of
  last known position.
- **BehaviorTree** runtime (selector, sequence, parallel, decorators: cooldown, chance, condition; leaves are named
  actions/conditions registered by code). Trees are JSON in `data/ai/*.json`, one per archetype.
- **Steering + local avoidance** for movement (seek, arrive, orbit at preferred distance, strafe, separation) inside
  encounter arenas whose boundaries are authored; chase sequences follow authored splines. A navmesh is added only if
  a mission truly needs path-finding around complex obstacles.
- Archetypes (GDD): shadow wisp (swarm, weak, flies in), cursed brawler (heavy telegraphed swings → tangkis), cursed
  hunter (nets and spears at range → close distance with langkah), Kelam guard (shield; only kuncian breaks it),
  possessed beast (straight-line charges → environment and glide escapes).
- **Bosses** are phase machines (data: phases, health thresholds, pattern lists, arena events) with a BT for movement
  between patterns. Cursed Adi (2 phases, fast-sloppy-readable), Pak Mail (3, flooding paddy, buffalo hazard/shield),
  Tok Belang (3, standoff opener, Kelip intervenes in phase 3, no winner), Kelam colossus (3, climb cranes, glide to its
  arms, strike lanterns), young Wan (3, mirror duel with the prologue moveset, won only with Buah Wan).

---

## 9. Missions, narrative and guidance

- **MissionSystem:** missions are JSON graphs (`data/missions/<id>.json`): objectives (go-to, defeat encounter, interact,
  race, follow, survive, escort, chase), each with completion conditions on events, optional fail conditions, and the
  checkpoint created when it completes. Triggers are layout markers. Every mission ends on an autosave.
- **StoryState:** flags and counters (`flags.adi_freed`, `pages_returned`, `ending`), journal entries and hikayat pages.
  The ending choice in 5.4 sets `ending = 'simpan' | 'hikayat'`; Ending B unlocks the epilogue mission.
- **Dialogue:** lines keyed by id with speaker, BM and EN text, optional VO/hum cue and duration. Two modes: **barks**
  (subtitled while playing, never block control) and **conversations** (camera framing, advance on input or auto).
  Rule from the GDD: no text box must be read to proceed in the first 10 minutes.
- **Cutscenes (Timeline equivalent):** `data/cutscenes/<id>.json` with tracks — camera shots (virtual cameras/rails),
  character animation clips and transforms, dialogue/subtitle lines, audio cues, music state, fades, time-of-day, and
  events. The player is skippable at any time (hold to skip, 0.6 s), every cutscene < 30 s (< 20 s in the first ten
  minutes), and skipping applies all end-state events so nothing is missed.
- **KelipGuide:** when the player calls Kelip (or idles lost for 20 s), fireflies near the player flash in a synchronized
  wave that travels along the guide path (authored splines in the layout, chosen by the active objective) toward the
  goal. High-contrast mode switches colours/brightness; optional subtle compass; "show path" assist draws a persistent
  firefly trail. Environmental guides (kingfisher, crabs, lantern, paper scraps) are small scripted actors.

---

## 10. Audio

- Web Audio graph: `master` → buses `music`, `ambience`, `sfx`, `voice`, `ui`; sidechain-style ducking of music under
  voice; per-bus volume from settings. Spatial SFX with `PannerNode` (HRTF on High, equal-power on Low), distance
  culling and voice limits (max 24 concurrent SFX; priority stealing).
- **Unlock:** the first tap/key on the title resumes the `AudioContext`. On iOS, `navigator.audioSession.type =
  'playback'` is set when supported so audio plays with the silent switch on.
- **MusicSystem:** each region has layered stems (explore, danger, combat, story) authored to the same tempo and bar
  length; states crossfade on bar boundaries; loops are gapless (`AudioBufferSourceNode` with loop points, scheduled
  on the audio clock). Tok Wan's theme returns in each region's instruments and in full in Ending B.
- Formats: OGG Vorbis only (Safari 18.4+ plays it); SFX mono; music 96–128 kbps; prologue audio < 2 MB.
- As built (Phase 3 M9, D-043–D-045): `src/audio` (AudioManager, AudioDirector, Sfx, SoundBank, Foley, Ambience,
  MusicSystem), data in `src/data/audio`; the score is synthesised in `tools/audio` as mono stems (Vorbis q4, about
  64–80 kbps mono) at 80 BPM; combat enters on the next beat, other states on the next bar.

---

## 11. UI

- DOM/CSS UI over the canvas (crisp text, accessible, cheap): screens and HUD are plain ES-module components that
  build DOM nodes and subscribe to the bus. A design system of CSS custom properties (colours, type scale, spacing,
  radii, motion) comes from the ui-ux-pro-max workflow (Phase 1), with original Malay-fantasy motifs drawn as SVG.
- **FocusNavigator:** spatial navigation for keyboard and gamepad over focusable elements, consistent "confirm/back"
  semantics, visible focus rings; every screen works with keyboard, gamepad and touch.
- **HUD:** minimal and contextual — health/Semangat only in combat or when changing, prompts appear once and fade (GDD),
  objective text only after a Kelip call, timer and ghost delta in trials.
- **Touch controls (exact GDD layout):** floating joystick on the left half (far push = sprint); camera drag on the
  empty right half; Jump (largest, bottom-right; hold in air = wau); Strike, Langkah, Tangkis fanned around Jump;
  Context above Jump (icon changes: kuncian, interact, rope, Bunian arch); Kelip call + Semangat ring top-left; Pause
  top-right. Size, opacity and position adjustable; safe-area insets respected.
- **Orientation:** portrait shows a "rotate your phone" screen; the game pauses. A one-time "Add to Home Screen" invite
  (iOS instructions; Android `beforeinstallprompt`) for true fullscreen; `manifest.webmanifest` with landscape
  orientation and icons.
- **Debug overlay** (F3, three-finger tap): FPS, frame time (CPU/GPU when timestamps are available), draw calls
  (`renderer.info.render.drawCalls`), triangles, physics bodies, JS heap (`performance.memory` where supported),
  textures/geometries counts, backend, render scale, preset, WebGL2 toggle, event tracer and an on-screen error log
  (captures `error`, `unhandledrejection` and console warnings).

---

## 12. Competitive systems and validation (Phase 6 design)

- **Runs:** trials record a **ghost** (position at 20 Hz quantised to 1 cm, yaw to 1°, animation state ids and
  movement-state changes; delta-encoded + varint + deflate → ~3–8 KB per minute) and checkpoint split times in ticks.
- **Flow:** `POST /api/session` returns a run token: HMAC-SHA256(server secret, `{runId, trialId, seasonId, seed,
  issuedAt (server time), expiresAt}`). The client plays; on finish `POST /api/submit` with token, splits, total
  ticks, ghost blob, client build id.
- **Validation (server):** token signature and expiry; single use (runId stored, replay → reject); server elapsed
  time since issue ≥ claimed run time (minus a small tolerance); checkpoint order complete and correct; each split ≥
  the authored minimum for that segment; ghost continuity — sample-to-sample speed ≤ the movement-state speed caps,
  no teleports except at authored portals, positions inside the course bounds; ghost duration matches the claimed
  time; rate limits per hashed IP and per nickname. Failing hard checks → rejected; borderline → stored but hidden
  pending review.
- **Storage:** Supabase Postgres with RLS: public `select` on leaderboard views only; no client inserts/updates/deletes
  (all writes in Vercel Functions with the service role key from Vercel env vars). Players can delete their own
  scores and nickname with a deletion token stored locally at submission.
- **Daily (Ujian Harian):** seed = HMAC(server secret, date) → route/rule twist; one official run per day per player
  token; unlimited practice.
- **Deterministic replay investigation:** Rapier is deterministic for identical inputs on the same build and step
  order, but server re-simulation would require running the entire game logic (controller, animation-driven root
  motion, combat) headless in Node with identical floating-point behaviour; Phase 6 measures whether this is feasible
  for trials (movement-only courses are the best candidate). If not, plausibility checks above are the defence.
- **Offline/paused backend:** every competitive feature has a local-only mode (local ghosts, local medals); the UI shows
  "Leaderboard offline" and keeps the run to submit later.

---

## 13. Build, deploy and tests

- **Vite:** ES modules, `three` and `three/webgpu` in a vendor chunk, Rapier in its own chunk, the title screen inline in
  `index.html` (< 30 KB) so first paint does not wait for JS; assets under `public/assets` with hashed names from the
  asset pipeline.
- **vercel.json:** `Content-Type: application/wasm` for `.wasm`, `model/gltf-binary` for `.glb`, `image/ktx2` for
  `.ktx2`, `audio/ogg` for `.ogg`; `immutable` one-year cache for hashed assets and `/assets/*`; short cache for
  `index.html`; security headers (CSP allowing only self + Supabase in Phase 6).
- **GitHub Actions:** lint, unit tests and build on pull requests (Vercel deploys via its Git integration once pushing
  starts — see D-011).
- **Tests:** Vitest for pure logic (save/migrations, mission graphs, combat windows in ticks, timers, ghost codec,
  validation functions, i18n completeness, data-reference integrity). Playwright drives the installed Chrome headed
  (`channel: 'chrome'`, `--enable-unsafe-webgpu`) to capture key scenes in WebGPU and `?webgl=1` modes; a test hook
  (`window.__hk`) exposes read-only stats and scene jump commands in dev/test builds only.
- **Performance verification:** overlay stats + Chrome DevTools MCP traces, 10-minute memory checks, 4× CPU throttling;
  real iPhone 14 numbers decide.

---

## 14. Browser support

| Browser | Expected backend | Notes |
| --- | --- | --- |
| Chrome / Edge (Windows, macOS, Android 12+ on Qualcomm/ARM GPUs) | WebGPU | WebGL2 fallback on unsupported GPUs/drivers |
| Safari iOS 26 / macOS 26 | WebGPU | iPhone 14 primary test device; audio session API; Home Screen mode |
| Firefox | WebGPU where enabled, else WebGL2 | Must run clean (zero console warnings) |
| Older Android / Safari | WebGL2 | Low preset must look good |

No WebGL1. If neither WebGPU nor WebGL2 is available, a friendly message explains the requirement.
