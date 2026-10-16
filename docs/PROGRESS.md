# Progress

Resume rule: when Izaf says "continue from PROGRESS.md", start at **Resume point** below.

## Resume point
Setup done except the items that need Izaf (2026-10-16). The project lives at `D:\dev\hikayat-kelip` (D-001).
- Push: Izaf said "no need to push yet". Keep committing locally; ask before the first push (make the repo private
  first, then `gh auth login --web --git-protocol https --scopes workflow`). Vercel previews start after that push.
- VS Code restart: deferred until the MCP tools are first needed (end of Phase 1). Izaf then opens
  `D:\dev\hikayat-kelip` in VS Code with Blender running; verify tool versions and the `blender` and
  `chrome-devtools` MCP connections. Until then, shell commands refresh PATH from the registry.
- Phase 0 done. Phase 1 built and verified locally (see log below); two phase-end checks wait on Izaf:
  the Chrome DevTools MCP checks need the VS Code restart, and the Vercel preview needs the first push.
- **Phase 2 in progress (2026-10-17).** Done and committed: GLB pipeline (`tools/optimize-glb.mjs`,
  `tools/build-assets.mjs`, hashed publishing, `src/data/generated/assets.json`), Kampung kit with prologue flood
  pieces, 74-clip animation packs (D-022), Tok Belang, Kelip and the shadow wisp, and the audio pipeline
  (`tools/audio`: 8 banks, 49 sounds, 876 KB, bit-exact rebuilds, Chrome decode test; D-024).
  **Resume with:** (1) human characters once Izaf saves `Universal Base Characters[Standard].zip` in
  `D:\dev\raw\quaternius\ubc\` (Bayu, young Wan, Adi, Mak Som, villagers, cursed brawler); (2) kit polish: smaller,
  denser berembang leaves, less shingle-like thatch, check the stall roof; (3) props for the slice (tongkat, wau, hikayat
  book, Pelita Air); (4) Phase 2 log entry and checks, then Phase 3. Custom silat clips (langkah, tangkis, kuncian),
  glide and ledge-hang poses are made in Phase 3 against the combat data.
- **Phase 1 perf checks (Playwright CDP, both backends, all 6 passed in 21.7 min):** 4× CPU throttle ~100 FPS avg /
  99 FPS p5 (display-limited); trace: 1 long task (~138 ms, at start-up) during 5 s of play; 10-minute soak: JS heap
  after GC flat at 11.1 MB, geometry/texture counts unchanged (no leaks). MCP-based checks still to repeat after restart.
- **After the restart (when Izaf does it):** (VS Code open on `D:\dev\hikayat-kelip`, Blender running), confirm
  the `blender` and `chrome-devtools` MCP servers are connected and verify tool versions in the fresh process; run the
  Phase 1 DevTools checks (console, performance trace of the sandbox, 10-minute memory check, 4× CPU throttle) on
  `npm run preview`; record results here; then start Phase 2 (asset and audio pipeline).

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

### Phase 1 — Foundation (built 2026-10-16; DevTools MCP checks and Vercel preview pending)
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
- **Known limitations:** the sandbox stands in for the prologue until Phase 3; Low-preset anti-aliasing to be judged
  on the iPhone; no audio content yet (graph and unlock only).

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
| S10 | Live tools: uv, blender_mcp clone + venv, `.mcp.json` (blender, chrome-devtools) | Done; connection check after restart |
| S11 | VS Code restart, verify versions and MCP connections | Pending (needs Izaf) |
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
| chrome-devtools-mcp | latest via npx (1.11.0 today) | `.mcp.json` |
| ui-ux-pro-max skill | skills CLI 1.7.2, lock hash 7ac62d93 | `.claude/skills/ui-ux-pro-max` |

Project npm packages (exact pins in `package.json`): three 0.186.1, @dimforge/rapier3d-compat 0.21.0, vite 8.3.4,
vitest 5.0.5, @gltf-transform/cli 4.5.1, @playwright/test 1.64.1, eslint 10.12.0, prettier 3.9.10.

## Setup notes
- Drive C: had 0.78 GB free after the installs; everything large lives on D: (`D:\dev`). Izaf should free space
  on C: for Windows itself.
- winget `Gyan.FFmpeg` is broken today (9.0.2 nested-installer path, 9.0.1 hash mismatch); see D-009.
- The Blender MCP venv is pinned to Python 3.13 (`.python-version` in the clone): Python 3.15 has no PyYAML wheel
  on Windows yet and would need the MSVC build tools.
