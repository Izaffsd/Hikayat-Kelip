# Progress

Resume rule: when Izaf says "continue from PROGRESS.md", start at **Resume point** below.

## Resume point
Setup done except the items that need Izaf (2026-10-16). The project lives at `D:\dev\hikayat-kelip` (D-001).
- **Push:** Izaf said "push and go ahead" (2026-10-17); `main` is on GitHub. The repo is still **public**; Izaf chose
  private, which needs him (github.com → Settings → General → Danger Zone → Change visibility, or say "login" for a
  fresh `gh auth login --web`). **Vercel is connected:** production is https://hikayat-kelip.vercel.app (every push to
  `main` deploys; GitHub shows the Vercel status per commit).
- **Phase 4 in progress (GO received 2026-10-18, no findings reported).** Plan below (Phase 4 log). **Resume with
  M1 (Sawah Emas, the region).** Still open from Phase 3: Izaf's BM read, a real mid-range Android phone, dedicated
  langkah/tangkis clips (library clips stand in), the repo's visibility, fewer shader variants if the iPhone's Boot
  line asks for it. Any `BUG:`/`FEEL:` from Izaf comes first.
- **Visual tests:** run `npm run chrome:test` once, then `npx playwright test`: every test is a tab in that one window
  (D-035; Izaf asked for no window per run). Quick live checks go through the Chrome DevTools MCP.
- **Live tools working (2026-10-17).** `.mcp.json` starts both servers by absolute path (D-025); in the VS Code
  session `blender` and `chrome-devtools` are connected (the standalone `claude mcp list` still says "pending" because
  the CLI keeps its own approvals). Live previews use `tools/blender/live/hk_preview.py`: everything goes into an
  `HK_Preview` scene, every created datablock is recorded and `finish()` removes exactly those, so Izaf's own scene is
  never touched.
- **Phase 2 live review done (2026-10-17).** Every asset was previewed in Izaf's Blender, fixed in the bpy scripts and
  rebuilt headless: Kampung kit (`6b4192e`: thatch UVs follow the slope plus a new attap texture, twill weave, taller
  window, berembang crowns, grain along beams, stall roof, draped net, three kain colours), Tok Belang v4 (`1c3e298`,
  D-026), Kelip and the wisp (`e2e08ab`). Animation packs: poses checked on the rig; shipped vs raw clips differ by at most
  0.106° (gltfpack `-ar 14`), durations identical.
- **Status (2026-10-18): Phases 0, 1 and 2 done; Phase 3 built and checked, at the PLAYTEST GATE** (see the log).
  Vercel deploys every push to `main` (https://hikayat-kelip.vercel.app), which also covers the earlier phases'
  preview item.

## Phase log

### Phase 0 — Read and plan (done 2026-10-16)
- Built: `docs/TECHNICAL.md` (architecture, data formats, streaming, renderer, controller, combat, camera, AI,
  competitive validation), `docs/ASSETS.md` (every asset, source, method, budget, priority), `docs/CULTURE.md`
  (references, sensitivity rules, originality, review checklist); decisions D-013 … D-017.
- Verified: Blender 5.2.2 runs headless; ui-ux-pro-max skill installed; three r186 APIs used in the plan checked in
  `node_modules` (WebGPURenderer `forceWebGL`, `RenderPipeline`, TSL display nodes, compute on the WebGL2 backend via
  transform feedback, `renderer.info.render.drawCalls`).
- Open for Izaf: proposal C-1 (CULTURE.md §5): call Tok Belang *harimau penjaga* instead of *harimau keramat*.
- Not done: Vercel preview (no push yet, D-011).

### Phase 1 — Foundation (built 2026-10-16; DevTools MCP checks done 2026-10-17; Vercel preview pending)
- **Built:** Vite 8 + ESLint 10 flat config + Prettier; folder layout with READMEs for systems not built yet;
  `vercel.json` (wasm/glb/ktx2/ogg types, immutable caching for hashed assets, security headers); `.env.example`;
  GitHub Actions CI (lint, format check, unit tests, build on pull requests).
- **Core:** Engine (system wiring and frame order), fixed 60 Hz Loop with interpolation, time scale and hit-stop, 30 FPS
  cap; EventBus (copy-on-write, queued delivery per tick); Input (keyboard/mouse with pointer lock, gamepad standard
  mapping with radial deadzones, touch, tick-stamped presses and buffers, UI navigation with key repeat, remapping);
  AssetLoader (byte-accurate progress, glTF + Meshopt + KTX2, reference counting); SaveManager (CRC32, atomic write,
  backup, migrations, export/import codes); Settings (typed, 'auto' per device, own storage key); I18n (BM/EN, browser
  default, live switch); Log (on-screen error log); Telemetry (anonymous, GPC-aware) + `/api/event`.
- **Render/physics/player:** WebGPURenderer with probed fallback (no console warnings), quality presets and dynamic
  resolution, RenderPipeline post chain (bloom, SMAA/FXAA); Rapier world with groups, queries and interpolation;
  KinematicCharacterController capsule; first Traversal slice (run, sprint build-up, coyote time, jump buffer,
  variable jump, apex hang, respawn at last safe ground); FollowOrbit camera with sphere-cast collision and recentering.
- **UI:** design system (`design-system/hikayat-kelip/MASTER.md`, tokens, OFL fonts self-hosted), instant title with
  synchronized fireflies, rotate screen (pure CSS), boot error screen, debug overlay (F3 / three-finger tap / `?debug=1`,
  WebGL2 toggle, error badge), touch controls in the GDD layout, movement sandbox scene.
- **Verified:** `npm run lint` clean; `npm run format:check` clean; 62 unit tests pass (event bus, loop, saves and
  migrations, codec, settings, i18n parity, input buffering, telemetry validation, movement maths, data integrity,
  touch spacing, asset loader); `npm run build` OK; Playwright headed Chrome 155 on the gaming PC's GPU, WebGPU and
  forced-WebGL2 projects: title paints, boot, tap-to-start, sandbox renders, run ≥ 3.5 m/s·1 s, sprint > 6.5 m/s,
  held jump apex 1.1–1.45 m, clean landing — all pass with **zero console errors or warnings**. Screenshots inspected.
- **Measured (gaming PC, Chrome 155, 1280×720, both backends):** ~93 FPS (display-limited), 10.7 ms frames, 30–31 draw
  calls, 7.2 k triangles, GPU memory estimate 60 MB, JS heap ~25 MB. Build: entry 10.2 KB gz (+ 2.8 KB CSS), engine
  17.5 KB gz, three 282 KB gz, Rapier 1.67 MB gz (D-021). Phones not measured yet (needs a deployed URL).
- **ui-ux-pro-max checklist** (title, rotate, error screen, touch controls): touch targets 48–84 px with ≥ 15 px gaps
  (unit-tested); press feedback 90 ms via transform/opacity; keyboard, gamepad and touch start the title; contrast
  parchment/ink ≈ 16:1; reduced motion stops drift and loaders; icons one set, `aria-hidden`, labelled buttons in BM/EN;
  tokens only (touch.css fixed); safe areas respected. Debug overlay is a developer tool (exempt from styling rules).
- **DevTools MCP checks (2026-10-17, chrome-devtools-mcp 1.11.0, production build via `npm run preview`, WebGPU):**
  console: no errors or warnings (only the Console Ninja VS Code extension's own log); 4× CPU throttle while sprinting
  and jumping: 92.6 FPS avg, p95 11.0 ms, max 11.4 ms, no frame over 33 ms (display-limited); performance trace of 4.7 s
  of play: main thread 12 % busy, p99 task 0.9 ms, frame gap p95 10.4 ms, the only task over 50 ms is the profiler's
  own start-up (`CpuProfiler::StartProfiling`); trace in `test-results/phase2-sandbox-trace.json.gz`. 10-minute
  memory soak with scripted play (sprint, turns, jumps every 1.2 s): JS heap post-GC low 18.1 MB in the first two
  minutes and 14.6 MB in the last two (peaks 23.8 → 20.3 MB), geometry/texture counts constant (6 / 23), FPS ≥ 91.4,
  no logged errors — no leak.
- **Known limitations:** the sandbox stands in for the prologue until Phase 3; Low-preset anti-aliasing to be judged
  on the iPhone; no audio content yet (graph and unlock only).

### Phase 2 — Asset and audio pipeline (done 2026-10-17; Vercel preview pending the first push)
- **Pipeline:** `npm run assets` runs Blender jobs headless (`tools/assets.config.json`), optimises with gltf-transform
  (dedup, prune, weld, resample, KTX2 ETC1S/UASTC, Meshopt) or gltfpack (animation), content-hashes into
  `public/assets/<group>/`, writes `src/data/generated/assets.json`, and builds the sound banks (`tools/audio`). All jobs
  are byte-stable across rebuilds (verified twice per job after fixing a `hash()` seed). Shared kit code in
  `tools/blender/lib/kit.py`; live preview helpers in `tools/blender/live/hk_preview.py`.
- **Built:** Kampung kit (30 pieces incl. prologue flood pieces, 40 colliders, 6.4 k tris); Tok Belang v4 (10.5 k / 3.8 k
  LOD1, 26-bone quadruped rig, baked coat); Kelip and the shadow wisp (`_SWAY` attribute for TSL motion); 74 animation
  clips in three shared packs on the universal rig (max compression error 0.106°); slice props (tongkat, wau bulan,
  hikayat, torn page, Pelita Air, peti, lore scroll); 8 sound banks / 49 sounds / 876 KB (Kenney CC0 + original synthesis).
- **Reviewed live** in Izaf's Blender over the MCP and fixed (thatch orientation, weave, trees, grain, stall, net, Tok
  Belang anatomy and face, Kelip, wisp, wau triangulation).
- **Verified:** lint, format, 74 unit tests (manifest hashes and sizes, clip names and rig bones, tiger skeleton and
  budget, `_SWAY`, kit colliders, prop hooks, Ogg headers and loop lengths, CC0-only audio, synthesis determinism);
  Chrome decodes every sound bank with exact loop lengths.
- **Human characters** (D-027): Bayu, young Wan, Adi, Mak Som and five villagers from the CC0 Universal Base
  Characters (free tier, unzipped with Izaf's go-ahead), rest pose conformed to the clip rig, reshaped, dressed in
  original clothing, atlas-baked; previewed in Izaf's Blender in sprint, roll and climb poses (no clipping between
  layers); every model loads through the game's AssetLoader on WebGPU and WebGL2. Cursed variants reuse these meshes.
- **Not done:** Vercel preview (no push yet).

### Phase 3 — Vertical slice (done 2026-10-18; Izaf's GO the same day)
Milestones: M1 animated Bayu · M2 world rendering + prologue layout · M3 traversal (mantle, wall-run, slide, wau glide)
· M4 combat (strike, langkah, tangkis, kuncian, lock-on; wisp, cursed brawler, Cursed Adi) · M5 missions, story state,
dialogue, cutscenes, KelipGuide, autosave · M6 prologue content (young Wan, wisps, tiger chase, standoff) · M7 Chapter 1
missions 1.1–1.4 · M8 UI (pause, settings, HUD, assists, race trial with ghost and medals) · M9 music and runtime audio
· M10 phase checks, Vercel preview, playtest checklist → **PLAYTEST GATE**.
- **M1 done** (`6b80dde`, `635cb5f`): `Animator` (shared-phase locomotion blend idle/walk/jog/sprint, pooled action
  layer, states from `src/data/animation/human.json`, root motion stripped) and `Avatar` (TSL blob shadow, LOD by
  distance, bone attachments); Bayu runs, jumps and lands animated on both backends.
- **M2 done:** regions are data (`src/data/regions/<id>.json`, loaded lazily) written by `npm run layouts` from
  `tools/layout/*.mjs` (house, jetty, boardwalk, tree, marker, path and trigger helpers). `World` builds Sky (gradient,
  clouds, stars, moon, lightning flash), Water (unlit TSL: ripples, Fresnel sky tint, rain rings, a moon/sun glitter path
  that never blobs, colour drain), Terrain (noise islands, trimesh collider), the kit as one InstancedMesh per part with
  box colliders, DayNight (storm/dusk/night presets, blends, lightning, nearest-N lamp pool with pelita flicker), GPU
  fireflies (synchronized groups, Kelip's call wave, row-by-row darkening) and GPU rain. Deadly flood water respawns
  the player. Prologue: ridge route of six roofs, lamp-lit arena, chase route (wrecked house, slide gap, wall-run walls,
  debris), raised jetty, triggers and markers for the beats.
- **Measured (gaming PC, 1280×720):** prologue WebGPU 65 draw calls / 150 k tris / 92.9 FPS; WebGL2 69 / 137 k / 92.6
  FPS; 586 colliders; GPU memory estimate 62 MB; no console errors or warnings on either backend.
- **Notes for M6:** roofs read as near-black silhouettes in the storm; the ridge route needs a readable rim/key on the
  roofs before the first 30 seconds can be judged.
- **Kampung layout done** (`e6793c6`, D-028, D-032): home, race route, waterfront deck and stall, long jetty with Tok
  Wan's pondok, grove across the river, rooftop chain, old jetty and arena, the tallest berembang (≈ 32 m) with its
  climb. 1,572 placements: 83 draw calls, 375 k tris, 1,684 colliders, 92.9 FPS (WebGPU), no console errors.
  Fixed on the way: kit pieces without colliders (gable ends, nipah, roots, debris) were mis-scaled by Meshopt
  quantization (D-029) — the prologue had the same bug.
- **M3 core done** (`5788371`, D-030, D-031): step-up (≤ 0.42 m), automatic mantle (≤ 1.3 m), ledge grab and hang
  (≤ 2.4 m, climb or drop), wall-run (tagged walls, gravity curve, jump-off), slide (shrunk capsule, crawls until there
  is headroom), wau glide (hold jump; dive, pull up, steer); abilities per region (`data/abilities.json`). Found and
  fixed a real stutter: Rapier's controller stopped or deflected grounded moves at random on flat ground. Headless
  movement lab: 16 tests (`tests/unit/traversal.test.js`); browser test of every move on both backends.
- **M3 done:** a bot runs the 1.1 race line through the kampung (gap jump, mantle, drop, wall-run, deck) in 12.6 s
  with no respawns on both backends (`tests/visual/race-route.spec.js`); the boat shed became a tall two-storey shed
  so the wall-run wall has height; ledge magnet (samples the jump arc; 0.4/0.6/0.8 m by device, settings); glide,
  wall-run and slide cameras; authored `ledge_hang` and `glide_hold` poses (`tools/blender/anim/poses.py`, previewed
  live on Bayu, baked into `anim_core`); the wau bulan opens above Bayu's hands and he leans into the glide; respawn
  fade (fall → 0.22 s → back on safe ground, which must support the whole footprint). Lab: 18 tests.
- **Tuning notes for M7:** the race takes a bot 12.6 s at full sprint; the mission wants ~90 s with banter, so the
  route may grow (or Adi's pace and the dare/finish beats fill it).
- **M4 done** (`897dabb`, D-033, D-034): CombatSystem from `data/combat/moves.json` (buffered strike chains, heavy,
  counter after a perfect langkah, langkah with invulnerable ticks and slow motion when perfect, tangkis with a
  perfect-parry stagger and chip-damage block, hit stun, regeneration, Semangat and the finisher, soft and hard
  lock-on, hit-stop, camera shake); EnemyDirector with attack tokens, wisps that dissolve into motes, cursed villagers
  freed when corruption empties, Cursed Adi in two phases; TSL ink on cursed avatars with an amber tell; combat HUD;
  the tongkat in Bayu's hand. Headless combat lab (12 tests) and browser fights on both backends.
- **M5 done (2026-10-18)** (D-035 – D-037): MissionSystem (data missions: steps, objectives, guide points, conditions
  on triggers, encounters, events, interact, timers, flags, dialogue; setup/start/resume actions; save points),
  StoryState in the save (schema 2 with migration: step, journal), Dialogue (BM/EN lines, speakers, queued barks),
  Cutscenes (camera shots, lines and events on real time; hold 0.6 s to skip and every remaining event still runs;
  barks cleared first), KelipGuide (call button and the 20 s idle-lost call; fireflies' wave, a stream of guide motes
  from Bayu, Kelip darting ahead), Kelip at Bayu's shoulder as a moving lamp, StoryUi (subtitles, objective after a
  call, prompts in the device's own key names, chapter title card, letterbox, skip ring), story props, the fireflies'
  row-by-row darkening, screen fades, and region changes behind the fade (prologue → kampung keeps the shared kit
  loaded). Content: missions P and 1.1–1.4 (1.3 and 1.4 are route skeletons for M7), 32 lines BM/EN, cutscenes
  `p_standoff` (10 s, cut to black and "Atuk?"), `k_kelip_rise` (8 s), `k_display` (15 s). A new save starts P; the
  prologue hands over to Chapter 1 and a reload resumes at the last save point.
- **Fixed on the way:** the click that started the game also struck (D-037); story timers no longer count frame
  hitches; the combat HUD stays hidden at the start of play and during cutscenes.
- **Verified:** lint, format, 120 unit tests (missions: every step type, chaining, resume with setup/on.resume,
  region entry; cutscene timing and skip; dialogue; save migration 1→2; story data integrity: every trigger, marker,
  encounter, cutscene, line, event, prompt and i18n key a mission names exists, cutscene limits, both languages for
  every line; the starting click). Browser, both backends, as tabs in the test Chrome: all 25 visual tests pass,
  including the new story tests — a new save plays P (prompt, Kelip's call and objective, the wisp fight, the
  standoff, hold to skip, cut to black), wakes Bayu in his room in 1.1 with the save at 1.1/wake and resumes there
  after a reload; 1.2 runs Kelip's rise, the call, the display going dark, the jetty fight, the chapter card, the
  journal line and the first Cahaya, and saves at 1.3. No console errors or warnings.
- **M6 done (2026-10-18)** (D-038): young Wan plays the prologue (missions name the player model; the swap to Bayu
  happens in the cut to black); Tok Belang as a scripted actor animated in code (`ai/TokBelang.js`,
  `data/tuning/tiger.json`: walk to rotary gallop, spine flex, bob, lagging tail, crouch, roar; a `preview` mode for
  tuning) that flees along `paths.tiger` keeping 11–16 m ahead in the browser test, leaps between heights and waits
  crouched at the standoff; the standoff cutscene places it, it roars and Wan takes his stance; a close lightning
  strike and camera shake at the wall-run; P undefeatable (no failure before minute 8); a moonlight rim on the player
  so dark clothes read against dark roofs; the tiger loads in the background when P starts and is released when the
  kampung loads. Verified: 121 unit tests; 29 browser tests on both backends (new: the tiger's gaits from the side,
  the chase lead and the standoff, the model swap and pose in the story test); screenshots inspected.
- **Open, for later milestones:** (1) a 1.5–1.9 s stall on the first frames after the start tap on this PC, both
  backends, story or not; the engine's own calls stay under 75 ms, so it is browser/GPU side (M10 performance trace;
  judge on the iPhone). (2) ~~The jetty fight camera under the pondok roof~~ — fixed in M7 (D-040). (3) Izaf's
  native-speaker read of the BM lines before the playtest gate (CULTURE §4). (4) The three chunk is 338 KB gzipped
  (282 KB at Phase 1); check the prologue download budget in M10. **M10:** (1) closed on this PC (warm frame, D-046);
  (4) the prologue is 7.0 MB, under budget; (3) is in the playtest checklist.
- **M7 done (2026-10-18)** (D-039, D-040): villagers as scripted actors (`ai/NpcActor.js` with Kelam's ink that creeps
  and drains, `ai/PathMover.js` shared with Tok Belang, `narrative/StoryActors.js` owning the cast per region); 1.1 —
  Mak Som at her stall, Adi's dare, a held "Ready… go!", the race clock on game time (`competitive/RaceTimer.js`,
  `ui/RaceHud.js`), Adi on his line, the result, his matching line and the best time in the save; 1.2 — Adi beside
  Bayu at the display, Kelam's tendrils (`render/Tendrils.js`, one draw call) rising from the water, Adi half-inked
  and fleeing into the mangrove after the fight; 1.3 — Adi keeping ahead over the night roofs (6–10 m in the browser
  test) while the tide floods the boardwalks; respawns use only spots above the water; 1.4 — the boss, the freeing
  scene (ink drains, Adi's thanks, the tide goes out), the climb, the Pelita Air's teal light, the fireflies returning
  and page 1. The camera keeps its distance at the pondok and kit between it and Bayu turns see-through. Also: missions
  can wait for spoken lines (`waitFor`), garbled comments in `Traversal.js` repaired. Verified: 127 unit tests (path
  follower, race clock, tide-safe respawn, story data for every new action); browser tests for 1.1 (a real race won by
  a sprinting bot in 12.7 s against Adi's 15.7 s, then lost), 1.3 and 1.4 end to end; screenshots inspected.
- **M8 done (2026-10-18)** (D-041, D-042): pause menu (`ui/PauseMenu.js` + `ui/FocusNavigator.js`: rail and panel,
  keyboard/gamepad/touch, freezes the game; Esc, P, Start, the touch button, lost mouse lock and hidden app open it),
  panels for the journal (Tok Wan's lines, returned pages with page 1's text, Cahaya), the map (an original SVG of
  Pulau Seri from `data/ui/map.json`: regions, Pelita lit or dark, "you are here"), trials and settings
  (`data/ui/settingsMenu.json`: 30 stepper rows over every setting the game reads; language switches live); Restart
  from checkpoint (missions restart cleanly: a start generation stops stale action lists; cutscenes can be cancelled);
  time trials with countdown, ghost, live delta, medals, instant restart and results (`competitive/Trials.js`,
  `Ghost.js`, `GhostRunner.js`, `ui/TrialHud.js`); achievements and toasts (`progression/Achievements.js`,
  `Notices.js`, `ui/Toast.js`; the first one at 10:00); the Semangat ring on the touch Kelip button.
  ui-ux-pro-max checklist (MASTER §9) on every new screen: targets ≥ 44 px with ≥ 8 px gaps (checked at 844×390 and
  667×375), press feedback by transform, focus rings on every control, keyboard/gamepad/touch, tokens only, medals
  and deltas never colour-only, reduced motion (toasts fade only), BM and EN both fit. Verified: 133 unit tests (ghost
  recording and playback, trial timing/medals/records/restart, achievements, the settings data against the defaults
  and both languages); browser tests: the pause flow (opens on Esc, frozen game, keyboard walk, live language change,
  focus kept, layout at both phone sizes), restart from checkpoint, and a trial from the pause menu (a gold run in
  12.65 s, the toast, Retry against the ghost with a live delta, Exit back to the story).
- **M9 done (2026-10-18)** (D-043, D-044, D-045): runtime audio and the score. `audio/AudioDirector.js` maps bus
  events to sounds from `data/audio/sounds.json` (strikes, parries and perfect chimes, langkah, hits, enemy tells in
  the world, wisps dissolving, villagers freed, Kelip's call and twinkles, pages and journal, race and trial counts,
  achievements, pause, menu clicks via `UI_FEEDBACK`), `Foley.js` paces footsteps by distance on wood, thatch, mud or
  water from kit tags and lands by impact speed, `Sfx.js` plays one-shots and loops (24 voices, priority stealing,
  positional panners, HRTF on High), `Ambience.js` crossfades widened beds with the light (storm rain and wind; dusk
  water, night insects), `MusicSystem.js` runs each region's stems in sync on the audio clock and moves between
  states on the bar (combat on the beat), with stingers over ducked stems; `AudioManager.js` owns the graph, the
  limiter, pause levels and ducking, and decodes before the start tap. Banks load per region behind the title and never
  hold it up. Tok Belang roars, growls and his paws land with his gait; Kelam's tendrils rise with a swell; thunder
  follows lightning. The score (`tools/audio/instruments.mjs`, `music.mjs`): Tok Wan's theme and stems for the
  prologue (storm, combat, story) and the kampung (solo gambus explore, danger, combat, story, three stingers), all
  synthesised, 80 BPM, seamless; cues in every mission and cutscene (`music`, `sting`, `sound` actions, validated by
  the story-data test). Prologue audio 1.4 MB. Checked without ears: pitches measured exact, stems normalised, loop
  seams continuous, spectrograms show the melody lines; **Izaf judges the sound on the iPhone.** Verified: 150 unit
  tests (bank variants, voice stealing, beat/bar grid, state priority, ramps, footsteps and landings, every sound and
  stem the data names exists, prologue audio budget); browser tests on both backends: the prologue (context running
  after the start tap, beds and stems up, thatch footsteps, jump and landing, pause clicks and levels, danger on the
  bar in the chase, thunder, paws, growl and roar in the standoff) and the jetty fight (combat on the beat, hits,
  tells, dissolves, night beds, back to the mission's mix); no console warnings. Full browser suite green (45 passed,
  1 skipped by design), with the prologue → kampung bank swap.
- **M10 done (2026-10-18): phase checks** (D-046), on the production build (`vite preview`) in the DevTools Chrome:
  - Console: no errors or warnings (desktop, and the phone profile below).
  - Prologue download: 7.0 MB transferred (10.8 MB uncompressed; budget 10 MB). Live on Vercel the code is Brotli:
    Rapier 1.59 MB, three 341 KB, engine 78 KB; hashed files are `immutable`, wasm/glb/ogg have the right types.
  - Trace of the start tap into the prologue: the first frame spent ~400 ms building node materials for the post pass
    and shadows (not covered by `compileAsync`) and Rapier's first step 62 ms building its broad phase. A warm frame
    and a zero-length physics step at the end of boot (and behind a region fade) move both behind the title:
    interaction-to-next-paint 729 ms → 42 ms, no frame over 34 ms after the tap. Open item 1 is closed on this PC.
  - Frame rate at High (this PC, 100 Hz display, vsync-bound): prologue 93 FPS, p95 11.1 ms, 74 draw calls, 153 k
    triangles; kampung jetty fight 92 FPS, 84 draw calls, 401 k triangles, ~105 MB GPU estimate.
  - 4× CPU throttle: unchanged (p95 11.1 ms, worst 21.9 ms in the fight): the main thread has headroom.
  - Phone profile (915×412 at 2.6×, touch, Android UA, 4× CPU; the GPU is still this PC's): the game picks Low with
    the 30 FPS cap and 0.8 render scale, 76 draw calls, ~10 MB GPU estimate; frames 40.0 ms flat (the cap lands on
    25 FPS on a 100 Hz screen's 10 ms grid; 60/90/120 Hz phones land on 30).
  - 10-minute memory run (bot roaming the night roofs, jumping, calling Kelip; 1,100 steps, 325 respawns): JS heap
    trough 53 → 49 MB, GPU estimate flat at 104.8 MB, 78 geometries / 44 textures throughout, voices bounded.
    Decoded audio (~40 MB, outside the JS heap) is by design; decoding music at 32 kHz would cut it by a quarter if
    Safari ever runs short.
  - Playtest checklist and known issues: `docs/PLAYTEST.md`.
  - **Time to ready, cold first visit** (pillar 1; D-047). The live site measured 10.2 s on this PC's own connection
    and 10.4 s under Fast 4G emulation: every stage waited for the one before. Now the title script starts the
    common downloads (`data/boot.json`, `core/Prefetch.js`) the moment the engine's scripts have arrived and asks for
    the story's small data files at once (in parallel); the renderer and Rapier start before the story data is
    awaited; the loader takes the downloads over (one request each). Boot stages are timed (`bootTimes` in the test
    hook, a "Boot" line on the debug overlay). Fast 4G, cold: renderer and physics ready at 3.0 s (was 6.1 s with the
    first attempt), models in by 6.3 s, ready 10.0 s; unthrottled, cold: ready 4.2 s, of which shader compilation
    is 3.05 s and the warm frame 0.45 s (122 pipelines: 108 vertex and 27 fragment programs from 30 materials); a
    second visit uses the browser's shader cache (ready ~1.5 s). **Next lever if the iPhone needs it:** fewer shader
    variants. Izaf's stopwatch in the checklist and the overlay's Boot line decide.
  - Live after the change (b0f0ed6, cold, clean context): this PC's connection ready 6.1 s (scripts 1.8 s, models
    parsed 2.5 s, shaders 5.6 s, warm frame 6.1 s); Fast 4G ready 8.5 s (baseline 10.4 s; models parsed 4.7 s).

### Phase 4 — Full story (started 2026-10-18)

BUILD_PROMPT Phase 4: Chapters 2–5, every mission in the GDD table, all bosses, both twists, both endings and the
epilogue; per-region rendering (grading, light shafts, water, compute fireflies, Kelam's look), adaptive music and
ambience. Built chapter by chapter, each the same way the slice was: region kit (bpy) → layout → lighting, grading,
music and ambience → the chapter's new movement and combat → its missions, cutscenes and dialogue (BM/EN) → its boss →
the Pelita and its page → browser tests on both backends → commit and push (Vercel deploys `main`).

| M | Chapter | What |
| --- | --- | --- |
| 1 | 2 | Sawah Emas region: kit (terraced paddies, bunds, rice, pondok sawah, scarecrows, kites, rope posts, Pelita Bumi), layout, golden-hour light, per-region colour grading, music stems and ambience; the 1.4 → 2.1 hand-over |
| 2 | 2 | Rope swing; 2.1 Pesta Wau (the kite festival race) |
| 3 | 2 | Kuncian (lock after a stagger), the Cursed hunter; 2.2 Bendang Berbisik |
| 4 | 2 | Buah combos (data, learned from pages); 2.3 Bayang Belang (Tok Belang chasing wisps through the scarecrows) |
| 5 | 2 | 2.4 Pelita Bumi: Pak Mail (3 phases, flooding paddy, buffalo herd), page 2 |
| 6 | 3 | Hutan Larangan region: kit (buttress roots, Bunian arches), light, grading, music, ambience; Embun |
| 7 | 3 | Root run, Bunian shortcuts; 3.1 Pintu Bunian (Embun's first trial) |
| 8 | 3 | Stealth, the rearranging forest; 3.2 Hutan Berubah; 3.3 Ingatan Rimba (the grove before it was cut) |
| 9 | 3 | Standoff duels; 3.4 Pelita Rimba: Tok Belang (3 phases, Kelip intervenes), page 3 |
| 10 | 4 | Kota Kayu region: kit (carved limas roofs, harbour, cranes, lighthouse, festival), light, grading, music, ambience; Pak Leman |
| 11 | 4 | Rooftop flow (vault, roll, pole-swing), keris moveset; 4.1 Kota Kayu |
| 12 | 4 | Sampan; 4.2 Rahsia Pak Leman (Twist 1); 4.3 Malam Pesta (the sampan chase) |
| 13 | 4 | 4.4 Pelita Pelabuhan: the Kelam colossus (cranes, glide onto its arms, lanterns), page 4 |
| 14 | 5 | Puncak Seri region; tiger ride; 5.1 Tunggangan Belang |
| 15 | 5 | Thermal gliding; 5.2 Angin Puncak (Twist 2, the final page) |
| 16 | 5 | 5.3 Wan: the mirror duel, Buah Wan mid-fight |
| 17 | 5 | 5.4 Pilihan, both endings; E Hikayat Baru (Ending B's epilogue) |
| 18 | all | Compute fireflies (WebGPU, WebGL2 fallback), light shafts, Kelam's look, journal and map for every page, regional ambience pass |
| 19 | all | Full playthrough tests (both endings, BM and EN), phase checks, Vercel, report |

## Setup checklist status

| # | Step | Status |
| --- | --- | --- |
| S1 | docs/BUILD_PROMPT.md saved verbatim | Done |
| S2 | CLAUDE.md | Done (keep current) |
| S3 | .claude/settings.json (allow routine commands, deny .env reads) | Done |
| S4 | Execution policy CurrentUser RemoteSigned | Done |
| S5 | Git, Node.js LTS, GitHub CLI, uv (winget); FFmpeg (Gyan zip, D-009); KTX-Software (Khronos installer, D-004) | Done |
| S6 | Blender 5.2 and KTX on user PATH | Done (takes effect in new processes) |
| S7 | Git identity + defaults (init.defaultBranch main, core.longpaths true) | Done |
| S8 | gh auth login, git init, first commit, push to Izaffsd/Hikayat-Kelip (made private) | Local commits done; push deferred by Izaf |
| S9 | ui-ux-pro-max skill (project scope, `.claude/skills/ui-ux-pro-max`, MIT) | Done |
| S10 | Live tools: uv, blender_mcp clone + venv, `.mcp.json` (blender, chrome-devtools) | Done; both connected 2026-10-17 (absolute paths, D-025) |
| S11 | VS Code restart, verify versions and MCP connections | Done 2026-10-17 |
| S12 | Vercel import of the repo (framework preset Vite) | Pending (needs Izaf, after first push) |
| S13 | Installed versions recorded here | Done (below) |

## Installed versions (2026-10-16)

| Tool | Version | Source / location |
| --- | --- | --- |
| Blender | 5.2.2 LTS (d13f752e3b9c, 2026-09-15) | Preinstalled, `C:\Program Files\Blender Foundation\Blender 5.2` |
| Google Chrome | 155.0.8059.40 | Preinstalled |
| Claude Code | VS Code extension 2.1.301 | Preinstalled; bundled CLI in the extension folder |
| Git for Windows | 2.55.0.windows.5 | winget `Git.Git` |
| Node.js / npm | 24.20.0 / 11.19.0 | winget `OpenJS.NodeJS.LTS` |
| GitHub CLI | 2.102.0 | winget `GitHub.cli` |
| FFmpeg | 9.0.2 full build (gyan.dev), libvorbis + libopus | GitHub `GyanD/codexffmpeg` zip, SHA-256 checked, `D:\dev\tools\ffmpeg` |
| KTX-Software | 4.4.2 | Khronos GitHub installer, SHA-256 + Authenticode checked |
| uv | 0.13.1 | winget `astral-sh.uv` |
| Blender MCP server | blender-mcp 1.0.2 at commit dbbf836 (2026-09-29), Python 3.13.16 venv | `D:\dev\tools\blender_mcp` |
| chrome-devtools-mcp | 1.11.0 | `npm install --prefix D:\dev\tools\chrome-devtools-mcp` (D-025) |
| ui-ux-pro-max skill | skills CLI 1.7.2, lock hash 7ac62d93 | `.claude/skills/ui-ux-pro-max` |

Project npm packages (exact pins in `package.json`): three 0.186.1, @dimforge/rapier3d-compat 0.21.0, vite 8.3.4,
vitest 5.0.5, @gltf-transform/cli 4.5.1, @playwright/test 1.64.1, eslint 10.12.0, prettier 3.9.10.

## Setup notes
- Drive C: had 0.78 GB free after the installs; everything large lives on D: (`D:\dev`). Izaf should free space
  on C: for Windows itself.
- winget `Gyan.FFmpeg` is broken today (9.0.2 nested-installer path, 9.0.1 hash mismatch); see D-009.
- The Blender MCP venv is pinned to Python 3.13 (`.python-version` in the clone): Python 3.15 has no PyYAML wheel
  on Windows yet and would need the MSVC build tools.
