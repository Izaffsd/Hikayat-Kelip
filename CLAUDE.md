# Hikayat Kelip — project memory for Claude Code

Story-driven 3D action-adventure (silat combat, stilt-roof parkour, wau gliding, competitive trials) for the
browser on PC and phones in landscape. Three.js WebGPU + Rapier + Vite, deployed on Vercel.

## Read these first
- `docs/PROGRESS.md` — where the work stands and exactly where to resume ("continue from PROGRESS.md").
- `docs/BUILD_PROMPT.md` — the full engineering instruction (phases, quality gates, deliverables). Main instruction.
- `docs/GDD.md` — single source of truth for design. GDD wins on design; BUILD_PROMPT wins on engineering.
- `docs/PRODUCTION.md` — setup checklist, asset and audio sourcing rules.
- `docs/DECISIONS.md` — every choice the GDD is silent on, and deviations from the docs (with reasons).
- `docs/TECHNICAL.md`, `docs/ASSETS.md`, `docs/CULTURE.md` — architecture, asset list, culture references.

## Who decides
- Izaf is the owner and only human. Ask only when a decision cannot be undone, needs money, needs a
  credential/login, or changes the game design. Ask in one line with a recommended answer.
- GDD silent → choose what serves the pillars, record it in `docs/DECISIONS.md`. GDD wrong → propose, never deviate silently.

## Confirmed decisions (do not re-ask)
- Protagonist Bayu, 17, male. Model: Opus 5.5 by default (Izaf switches to Fable 5.1 for the hardest problems).
- Repo lives at `D:\dev\hikayat-kelip` (C: is nearly full; see DECISIONS D-001, D-008). Tools go in `D:\dev\tools`,
  caches in `D:\dev\.cache`. Keep large files (downloads, bakes, caches, browser profiles) off drive C:.
- GitHub: `https://github.com/Izaffsd/Hikayat-Kelip`, private (Izaf's existing repo; used instead of creating `hikayat-kelip`).
- Git identity: `Iskndar <146904084+Izaffsd@users.noreply.github.com>` (GitHub noreply, so Vercel Hobby links commits).
- Hosting: Vercel Hobby, non-commercial, no monetization in v1. Izaf connects the repo to Vercel.
- Online backend: Supabase, Phase 6 only; local fallback before that and whenever it is paused/unreachable.
- Test phone: iPhone 14, iOS 26, Safari (via Vercel preview HTTPS URLs) + a mid-range Android profile.
- Izaf playtests every phase on the iPhone 14. PLAYTEST GATE after Phase 3: stop, wait for "GO".

## Pillars (non-negotiable)
1. Fun in 10 seconds: URL → controlling the character in < 10 s on an iPhone 14. No account, no mandatory menu.
2. Flow: movement is fun with no goal.
3. Silat that feels earned: read, step, parry, lock.
4. A story worth finishing: both twists, both endings, fully implemented.
5. Always one more try: instant restart, ghosts, medals, leaderboards.

## Culture and originality (mandatory)
- Respect Malay culture, silat, architecture, folklore; log every reference in `docs/CULTURE.md`.
- Never depict prophets, deities or real religious figures. Never use religious texts, prayers, verses or rituals
  as mechanics or magic. No real royalty or historical figures as characters. No gore.
- Villagers are never mocked. Cursed villagers are freed, never killed. Kelam is ink-like, colour-draining, no gore.
- Other games inspire principles only — never assets, names, characters, maps, UI layouts, music or distinctive
  art styles. No patented mechanics (e.g. Nemesis System). If something becomes recognisable, redesign it.
- Dialogue in natural Bahasa Melayu and English, switchable, subtitled. Rumi only; no Jawi unless verified.

## Stack
- Three.js (version pinned in package.json), vanilla JS ES modules, Vite for dev/build only. No UI frameworks.
- Renderer: `WebGPURenderer` from `three/webgpu`, automatic WebGL2 fallback; custom shaders in TSL only.
  Debug toggle forces WebGL2 (`?webgl=1` and in the debug overlay). Both backends must look and run well.
- WebGPU/TSL APIs change between releases: check the installed version's docs/examples before using an API;
  upgrade three only between phases.
- Physics: `@dimforge/rapier3d-compat`; player on Rapier `KinematicCharacterController`; fixed 60 Hz step with
  interpolated rendering.
- Vercel: static Vite build + Vercel Functions in `/api`. Supabase (Phase 6): RLS, public read, all writes via
  Vercel Functions with the service role key (Vercel env vars only). Browser uses only the anon key.
- Assets: bpy scripts in `/tools/blender`, headless Blender, baked textures, glTF export, gltf-transform
  (Meshopt/Draco + KTX2). Audio: OGG Vorbis, mono SFX, music 96–128 kbps, gapless Web Audio loops.

## Tool paths (Windows)
- Blender 5.2.2 LTS: `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` (also on user PATH as `blender`).
  Headless: `blender --background --factory-startup --python <script> -- <args>`. If Blender is missing, tell Izaf.
- KTX-Software 4.4.2 (`ktx`): official Khronos installer (not on winget), `C:\Program Files\KTX-Software\bin`.
- FFmpeg 9.0.2 (Gyan full build): `D:\dev\tools\ffmpeg\ffmpeg-9.0.2-full_build\bin` (user PATH). uv: winget, on PATH.
- npm cache `D:\dev\.cache\npm`; uv cache `D:\dev\.cache\uv` (UV_CACHE_DIR); uv Pythons `D:\dev\.cache\uv-python`.
- Chrome: `C:\Program Files\Google\Chrome\Application\chrome.exe` (Playwright `channel: 'chrome'`).
- Claude CLI (bundled with the VS Code extension):
  `%USERPROFILE%\.vscode\extensions\anthropic.claude-code-*\resources\native-binary\claude.exe`.
- Blender MCP server source: `D:\dev\tools\blender_mcp` (outside the repo). MCP config: `.mcp.json`.

## Commands
- `npm run dev` — Vite dev server. `npm run build` — production build. `npm run preview` — serve the build.
- `npm run lint` / `npm run format` — ESLint / Prettier.
- `npm test` — unit tests (save/migrations, missions, combat windows, timers, ghosts, validation).
- `npm run test:visual` — Playwright, headed Chrome, `--enable-unsafe-webgpu`; screenshots in WebGPU and
  forced-WebGL2 modes. Never run `playwright install`. Never trust a headless capture of a WebGPU canvas.
- `npm run assets` — regenerates every model, texture and audio file headless (Blender + gltf-transform + ffmpeg).

## Folder layout (keep it)
```
src/core        Engine, Loop, Time, Input, EventBus, AssetLoader, SaveManager, I18n
src/physics     PhysicsWorld, CharacterController
src/player      Bayu, Traversal, Abilities, Animator, Controller
src/combat      CombatSystem, Combos, Parry, LockOn, Weapons
src/camera      CameraSystem, VirtualCameras, CutsceneCamera
src/world       RegionManager, streaming, DayNight, Weather, level builders
src/guidance    KelipGuide, environmental guides
src/ai          BehaviorTree, Perception, enemies, bosses
src/missions    MissionSystem, Objectives, Checkpoints
src/narrative   Dialogue, Cutscenes, StoryState
src/competitive Timer, Medals, Ghosts, Leaderboards, DailyChallenge, Arena, Ranked
src/progression SkillTree, Cosmetics, Achievements
src/render      Renderer, PostFX, TSL materials, Particles, QualityManager
src/audio       AudioManager, MusicSystem
src/ui          Menus, HUD, Screens, design system, touch controls
src/data        JSON: missions, dialogue BM/EN, enemies, combos, abilities, tuning
api/            Vercel Functions: session, submit, validate, ghosts, daily, ranked
tools/blender/  bpy asset generation scripts
supabase/       migrations, RLS policies
docs/           GDD, BUILD_PROMPT, PRODUCTION, TECHNICAL, ASSETS, CULTURE, DECISIONS, PROGRESS
public/assets/  optimized, hashed-cacheable runtime assets
art/            git-ignored working .blend files
```

## Engineering rules
- Single responsibility per module; systems talk through the EventBus, never globals.
- All tuning values live in `src/data` JSON, never hard-coded in logic. JSDoc on every public class and method.
- No per-frame allocations in hot loops (reuse vectors/quaternions); dispose GPU resources; no memory growth.
- Budget: 60 FPS Medium on an integrated-GPU laptop; 30+ FPS Low on iPhone 14 and mid-range Android for
  10 minutes; < 300 draw calls at High; InstancedMesh, culling, LODs; prologue download < 10 MB.
- Mobile is first-class: landscape only (portrait → rotate screen), touch layout exactly as GDD, adjustable
  size/opacity/position, assists on by default, dynamic resolution, 30 FPS cap, battery saver.
- iOS audio: set `navigator.audioSession.type = "playback"` when supported.
- Debug overlay: F3 / three-finger tap — FPS, frame time, draw calls, tris, physics bodies, memory, backend,
  WebGL2 toggle, on-screen error log.
- Every UI screen runs the ui-ux-pro-max pre-delivery checklist; menus work with keyboard, gamepad and touch.

## Assets and licenses
- Humans rigged to the Quaternius universal rig (Universal Animation Library 1 & 2, CC0); silat moves are edited
  library clips. Mixamo only inside the game, never shipped as raw files. Tok Belang is modelled in Blender and
  animated procedurally in code; never download tiger assets without Izaf's approval.
- SFX: Kenney (CC0), Sonniss GDC (royalty-free, no standalone redistribution), Freesound CC0 only.
  Music: our own loops from CC0 samples, rendered to OGG. Never CC BY-NC or GPL. Fonts: OFL only.
- Log every third-party file in `CREDITS.md` the moment it enters the repo. Commit scripts and optimized outputs
  only; raw libraries, sample packs and .blend files stay out of git.

## Live tools
- Blender MCP (`blender`) and Chrome DevTools MCP (`chrome-devtools`) are in `.mcp.json`.
- Live Blender is for preview/inspection/screenshots only; every shipped asset must rebuild with `npm run assets`.
  Never run MCP code that deletes files, touches folders outside the project, or uses the network.
- After each phase: DevTools console check, a performance trace of one key scene, a 10-minute memory check,
  and a 4x CPU-throttled run. Real iPhone 14 results decide.

## Secrets and safety
- Never read `.env` / `.env.*` (denied in `.claude/settings.json`); never commit secrets; `.env.example` only.
- Never run installers or Claude Code as Administrator. A failed install: show the exact error, try the next
  documented method once, never loop.

## Phase workflow
- Work in order: Setup → Phase 0 … Phase 8 (see BUILD_PROMPT). Each phase ends with its checks, a checkpoint
  commit, a Vercel preview deployment and a short `docs/PROGRESS.md` entry. Never mark a phase done if anything
  in it does not work.
- Commits: small checkpoints; message trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- Near a context/output limit: stop at a clean file boundary and write the exact resume point in PROGRESS.md.
- Bug reports from Izaf: `BUG: [where] [what happened] [what should happen] [device] [steps]` and
  `FEEL: [where] [what feels wrong]`. Fix each and confirm it in PROGRESS.md.
