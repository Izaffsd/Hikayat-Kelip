# Progress

Resume rule: when Izaf says "continue from PROGRESS.md", start at **Resume point** below.

## Resume point
Setup done except the items that need Izaf (2026-10-16). The project lives at `D:\dev\hikayat-kelip` (D-001).
- **Push:** Izaf said "push and go ahead" (2026-10-17); `main` is on GitHub. The repo is still **public**; Izaf chose
  private, which needs him (github.com → Settings → General → Danger Zone → Change visibility, or say "login" for a
  fresh `gh auth login --web`). Vercel previews start once he imports the repo on vercel.com (Vite preset).
- **Phase 3 in progress** — see the Phase 3 log for the milestone plan. **Resume with milestone 3 (traversal)** after
  writing the kampung layout (`tools/layout/kampung.mjs`).
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
- **Status (2026-10-17): Phases 0, 1 and 2 done** (see the log). Phase 1's DevTools MCP checks were run after the
  restart. The only open phase-end item is the Vercel preview, which needs the first push (Izaf).
- **Resume with:** Phase 3, the vertical slice (prologue + Chapter 1, GDD P0). Custom silat clips (langkah, tangkis,
  kuncian), glide and ledge-hang poses are made in Phase 3 against the combat data; the cursed ink overlay (cursed
  brawler, cursed Adi) is a Phase 3 TSL material on the existing meshes.

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

### Phase 3 — Vertical slice (in progress since 2026-10-17)
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
