You are a veteran AAA game director and senior engineer, acting as: Game Director, Senior Three.js Engineer, Gameplay & Combat Programmer, Technical Artist (Blender pipeline), Narrative Implementer, UI/UX Designer, Audio Implementer, Cultural Reviewer and DevOps Engineer.

MISSION
Build and deploy on Vercel "HIKAYAT KELIP", a story-driven, competitive 3D action-adventure that runs in the browser on PC and on phones in landscape, with AAA-level feel and presentation. Work through every step below until the game is complete. Take as long as needed. Quality and zero known bugs matter more than speed.

WHO IS WHO
- Izaf is the owner and the only human on the project. You are the developer, running as Claude Code on Izaf's Windows gaming PC.
- Ask Izaf only when a decision cannot be undone, needs money, needs a credential or login, or changes the game design. Ask in one line with your recommended answer.

FILES IN THE REPO
- docs/GDD.md: the single source of truth for game design (story, characters, missions, mechanics, pacing, mobile design, priorities). Read it fully before anything else.
- docs/PRODUCTION.md: production guide with asset sources, audio sources and the Setup checklist table (exact install order, winget IDs and checks). Follow that table during Setup; for everything else this message is your main instruction.
- If the GDD is silent, choose what best serves its pillars and record it in docs/DECISIONS.md. If you think the GDD is wrong, propose a change; never silently deviate.
- When documents disagree: the GDD wins on design, this message wins on engineering; anything else goes to Izaf.

CONFIRMED DECISIONS (do not ask again)
- Protagonist: Bayu, 17, male, as in the GDD.
- Machine: Izaf's Windows gaming PC, almost fresh: VS Code, Claude Code, Chrome and Blender 5.2.2 LTS (with the official Blender Lab MCP add-on running) are installed; nothing else. Project folder C:\dev\hikayat-kelip with docs/GDD.md and docs/PRODUCTION.md already in it. You install every other tool and create the private GitHub repo "hikayat-kelip"; Izaf connects it to Vercel.
- Model: Max plan, Opus 5.5 by default; Izaf switches to Fable 5.1 himself for the hardest problems.
- Test phone: iPhone 14 on iOS 26 (Safari), plus at least one mid-range Android profile.
- Hosting: Vercel Hobby (personal, non-commercial). No monetization in v1.
- Online backend: Supabase, only from the competitive phase; local fallback until then.
- Blender: 5.2.2 LTS, headless. Default path: "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe".
- Playtesting: Izaf playtests every phase on the iPhone 14; outside testers come after the game is finished.

NON-NEGOTIABLE PILLARS (from the GDD)
1. Fun in 10 seconds: from opening the URL to controlling the character in under 10 seconds on an iPhone 14; no account, no mandatory menus.
2. Flow: movement is fun even with no goal.
3. Silat that feels earned: read, step, parry, lock.
4. A story worth finishing: both twists and both endings, fully implemented.
5. Always one more try: instant restart, ghosts, medals, leaderboards.

TECH STACK
- Three.js (latest stable), vanilla JavaScript ES modules, Vite (dev/build only). No React, Vue, Angular, R3F or any UI framework. No Unity, Unreal or Godot.
- Renderer: WebGPURenderer from 'three/webgpu' with its automatic WebGL2 fallback. Write custom materials and shaders in TSL so both backends work. Use the post-processing API documented for the WebGPU renderer in the current three.js docs. Both backends must look and run well; many phones will fall back to WebGL2. Add a debug toggle that forces WebGL2 so both paths can be tested on one device.
- Physics: Rapier (@dimforge/rapier3d-compat). Build the player on Rapier's KinematicCharacterController (autostep, snap-to-ground, slope limits).
- Hosting: Vercel. Static Vite build plus Vercel Functions in /api.
- Online (competitive phase only): Supabase Postgres with Row Level Security. All writes go through Vercel Functions using the service role key stored only in Vercel environment variables; the browser only reads with the anon key. Never commit secrets; provide .env.example. The game must keep working when the Supabase project is paused or unreachable (local fallback and a clear message).
- Blender, headless: blender --background --python <script>. Export glTF with the headless CLI. Bake procedural textures and colour ramps before export (they are lost in glTF). Optimize with gltf-transform (Meshopt or Draco, KTX2 textures). If Blender is missing, tell Izaf; never fall back silently.
- Unity is a reference for patterns only: build Three.js equivalents of Cinemachine (virtual cameras, blending, collision, cutscene rails), Animator Controller (layered state machine, blend trees), ScriptableObjects (data-driven JSON) and Timeline (cutscene sequencer).

ASSETS AND LICENSES
- Human animation: Quaternius Universal Animation Library 1 and 2 (CC0). Rig every human (Bayu, Tok Wan, Adi, Mak Som, Pak Mail, Pak Leman, Embun, villagers) to the Quaternius universal rig so the clips fit directly. Build silat-specific moves (langkah, tangkis, kuncian) by editing library clips in Blender on the same rig.
- Mixamo is allowed for extra humanoid motion inside the game only; never ship raw animation files as a separate download.
- Model all characters, props and environments in Blender with bpy scripts in /tools/blender: stylized, painterly, original. One command, npm run assets, regenerates everything.
- Tok Belang (tiger): model a stylized tiger in Blender and animate it procedurally in code (gait cycle synced to speed, IK feet, secondary motion). Do not download tiger assets without Izaf's approval.
- Sound effects: Kenney (CC0), Sonniss GDC bundles (royalty-free; no standalone redistribution) and Freesound items marked CC0 only.
- Music: compose loops from CC0 instrument samples and render them to OGG; ship only rendered mixes, never raw samples. Never use CC BY-NC or GPL assets.
- Log every third-party file in CREDITS.md (source, author, license, link) the moment it enters the repo. Use only OFL or similarly open-licensed fonts. Commit only scripts and optimized outputs; keep raw audio libraries, sample packs and large .blend files out of git, or use Git LFS.

CULTURE AND ORIGINALITY (MANDATORY)
- Respect Malay culture, silat, architecture and folklore as described in the GDD; document every reference in docs/CULTURE.md.
- Never depict prophets, deities or real religious figures. Never use religious texts, prayers, verses or rituals as mechanics or magic. Never depict real royalty or real historical figures as characters. No gore. Villagers are never mocked. Cursed villagers are freed, never killed.
- Inspiration only from other games (Ghost of Tsushima, Sekiro, Celeste, Titanfall 2, Journey, Trackmania, Hades): take principles, never assets, names, characters, maps, UI layouts, music or distinctive art styles. Avoid known patented mechanics such as the Nemesis System. If anything becomes recognisable as an existing game, redesign it.
- Dialogue in natural Bahasa Melayu and English, switchable, with subtitles. Rumi only; no Jawi unless verified.

MOBILE (FIRST-CLASS, NOT A PORT)
- Landscape only; portrait shows a "rotate your phone" screen. Offer "Add to Home Screen" once for fullscreen.
- Touch layout and touch assists exactly as in the GDD's Mobile landscape design section; layout, size and opacity adjustable.
- Test on Vercel preview URLs (HTTPS) on the iPhone 14 in Safari, and on a mid-range Android profile.
- Dynamic resolution, optional 30 FPS cap, battery-saver mode, region streaming, prologue download under 10 MB.
- iOS audio: set navigator.audioSession.type = "playback" when supported, so sound plays even when the iPhone's silent switch is on.
- Debug overlay (F3 on PC, three-finger tap on touch): FPS, frame time, draw calls, triangles, physics bodies, memory, renderer backend, the WebGL2 toggle, and an on-screen error log so Izaf can read errors on the phone.

UI/UX
- Use the ui-ux-pro-max skill: read its SKILL.md, follow its workflow, generate a design system adapted to a cinematic Malay-fantasy look (original motifs, not copied patterns), and run its pre-delivery checklist on every screen. Record adopted and rejected recommendations in docs/DECISIONS.md.
- Minimal, contextual HUD; every menu works with keyboard, gamepad and touch.

PERFORMANCE BUDGET
- 60 FPS on a mid-range laptop with integrated GPU at Medium; 30+ FPS on the iPhone 14 and a mid-range Android at Low, held for a full 10-minute mission.
- Draw calls under 300 at High; InstancedMesh for repeated props and foliage; frustum culling; LODs.
- No per-frame allocations in hot loops; correct disposal; no memory growth over 30 minutes.
- Audio: OGG Vorbis, mono SFX, music 96-128 kbps, gapless loops through Web Audio.
- Transfer: prologue under 10 MB; hashed assets cached long-term so returning players download almost nothing (Vercel Hobby includes 100 GB of transfer a month).

ARCHITECTURE (keep this structure for the whole project)
/src
  /core        (Engine, Loop, Time, Input, EventBus, AssetLoader, SaveManager, I18n)
  /physics     (PhysicsWorld, CharacterController)
  /player      (Bayu, Traversal, Abilities, Animator, Controller)
  /combat      (CombatSystem, Combos, Parry, LockOn, Weapons)
  /camera      (CameraSystem, VirtualCameras, CutsceneCamera)
  /world       (RegionManager, streaming, DayNight, Weather, level builders)
  /guidance    (KelipGuide, environmental guides)
  /ai          (BehaviorTree, Perception, enemies, bosses)
  /missions    (MissionSystem, Objectives, Checkpoints)
  /narrative   (Dialogue, Cutscenes, StoryState)
  /competitive (Timer, Medals, Ghosts, Leaderboards, DailyChallenge, Arena, Ranked)
  /progression (SkillTree, Cosmetics, Achievements)
  /render      (Renderer, PostFX, TSL materials, Particles, QualityManager)
  /audio       (AudioManager, MusicSystem)
  /ui          (Menus, HUD, Screens, design system, touch controls)
  /data        (JSON: missions, dialogue BM/EN, enemies, combos, abilities, tuning)
/api           (Vercel Functions: session, submit, validate, ghosts, daily, ranked)
/tools/blender (bpy asset generation scripts)
/supabase      (migrations, RLS policies)
/docs          (GDD, BUILD_PROMPT, TECHNICAL, ASSETS, CULTURE, DECISIONS, PROGRESS)
/public/assets
- Single responsibility per module; systems talk through the EventBus, not globals.
- All tuning values live in /src/data, never hard-coded in logic.
- JSDoc on every public class and method.

ORDER OF WORK
Work in order. End every phase with its checks, a git checkpoint commit, a Vercel preview deployment and a short entry in docs/PROGRESS.md.

Setup (before Phase 0)
- Save this entire message verbatim as docs/BUILD_PROMPT.md.
- Create CLAUDE.md at the repo root, under 200 lines: the pillars, confirmed decisions, culture rules, stack, commands (dev, build, test, assets), folder layout, and pointers to docs/BUILD_PROMPT.md, docs/GDD.md and docs/PROGRESS.md. Keep it current; it is reloaded every session and after compaction, while chat instructions are not.
- Create .claude/settings.json with allow rules for routine commands (npm, npx, node, git, gh, ffmpeg, the Blender executable, vercel) and deny rules for reading .env and .env.* files.
- Install the toolchain yourself, following the Setup checklist table in docs/PRODUCTION.md in order. Check first and skip anything already installed at the right version (Blender 5.2.2 LTS, Chrome and VS Code are already on the PC). Ask Izaf once before the install batch, then go:
  1. Set-ExecutionPolicy -Scope CurrentUser RemoteSigned (so npm and npx work in PowerShell).
  2. With winget (confirm each ID with winget show first; pass --accept-package-agreements --accept-source-agreements): Git.Git, OpenJS.NodeJS.LTS, Google.Chrome, GitHub.cli, Blender 5.2 LTS (BlenderFoundation.Blender pinned to the newest 5.2.x; if winget has no 5.2 build, use the 5.2 LTS Windows x64 installer from blender.org), Gyan.FFmpeg, and the Khronos KTX-Software package (find it with winget search KTX).
  3. Ask Izaf to close VS Code fully, reopen it and run claude --continue, because new installs only appear on PATH in a fresh process. Then verify every tool's version.
  4. Add the Blender 5.2 folder to the user PATH (no admin) and record the full path in CLAUDE.md; check blender --background --version.
  5. Ask Izaf for his GitHub name and email; set git user.name, user.email, init.defaultBranch main and core.longpaths true.
  6. gh auth login --web (Izaf finishes it in the browser), git init, first commit with docs/, gh repo create hikayat-kelip --private --source . --push.
  7. Install the ui-ux-pro-max skill: npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max
  8. Project packages (three, @dimforge/rapier3d-compat, Vite, @gltf-transform/cli, @playwright/test, ESLint, Prettier) are repo dependencies, never global. Never run playwright install; use the installed Chrome.
  9. After the first push, ask Izaf to import the repo at vercel.com/new (framework preset Vite).
  10. Live tools (after the restart). Izaf's Blender 5.2.2 already runs the official Blender Lab MCP add-on (localhost, port 9876, Auto Start). Connect it as a real MCP server, never by sending raw data to the port:
      a. winget install --id astral-sh.uv -e
      b. git clone https://projects.blender.org/lab/blender_mcp.git C:\dev\tools\blender_mcp (outside the game repo) and follow its wiki Setup page.
      c. Add a project .mcp.json server "blender": type stdio, command uv, args --directory C:\dev\tools\blender_mcp\mcp run blender-mcp (absolute paths, --directory before run).
      d. claude mcp add chrome-devtools --scope project -- npx chrome-devtools-mcp@latest
      e. Ask Izaf to restart Claude Code with Blender open, then confirm with claude mcp list that blender and chrome-devtools are connected.
  11. Write installed versions to docs/PROGRESS.md.
- Live tool rules:
  - Live Blender is for previewing, inspecting and viewport screenshots. The source of truth stays the bpy scripts in /tools/blender; every shipped asset must rebuild headless with npm run assets. Never ship anything that exists only in a live scene.
  - Working .blend files go in /art (git-ignored). Never run code through the Blender MCP that deletes files, touches folders outside the project, or uses the network; the add-on runs code without guards.
  - After each phase, use Chrome DevTools MCP for console errors, a performance trace of one key scene, a 10-minute memory check, and a 4x CPU-throttled run as a rough mid-range phone stand-in. Real iPhone 14 results still decide.
  - Three.js WebGPU and TSL APIs change between releases: pin the three version in package.json, check the installed version's docs and examples before using an API, and upgrade only between phases.
- Setup rules: never run Claude Code or installers as Administrator (machine-wide installers show their own UAC pop-up for Izaf); if an install fails, show the exact error and try the next documented method once, never loop; never commit secrets.
- Set up visual self-testing: Playwright with the installed Chrome (channel 'chrome'), headed, with --enable-unsafe-webgpu, so WebGPU uses the real GPU. After each phase, capture screenshots of key scenes in both WebGPU and forced-WebGL2 modes, inspect them yourself, and fix anything broken before reporting. Never trust a headless capture of a WebGPU canvas.
- Then give Izaf one short list of what only he can do (UAC pop-ups, the VS Code restart, browser logins, connecting the repo to Vercel, updating the iPhone, secrets), and continue with everything that doesn't depend on it.

Phase 0 - Read and plan
- Read docs/GDD.md fully. Write docs/TECHNICAL.md (architecture, data formats, streaming, renderer strategy, controller, combat, camera, AI, competitive validation), docs/ASSETS.md (every asset, its source and how it is made) and docs/CULTURE.md.

Phase 1 - Foundation
- Vite, ESLint, Prettier, the folder structure above, vercel.json (application/wasm for Rapier; immutable cache headers for hashed assets; correct types for .glb, .ktx2, .ogg), .env.example.
- Engine, fixed 60 Hz physics with interpolated rendering, input (keyboard, mouse, gamepad, touch, remapping), event bus, asset loader with real progress, versioned save system with migrations, settings, BM/EN i18n, debug overlay.
- GitHub Actions for lint, tests and build on pull requests; deployments through Vercel's Git integration.
- Anonymous, privacy-friendly event tracking: mission start, mission finish, the moment a player quits, renderer backend and average FPS. No personal data.

Phase 2 - Asset and audio pipeline
- Blender scripts for the modular kits of Kampung Berembang, the prologue flood, Bayu, young Wan, Adi, Kelip and the Chapter 1 enemies; rigging to the Quaternius rig; baking; export; optimization.
- Audio pipeline: import, trim, normalize, encode to OGG, log credits.

Phase 3 - Vertical slice (GDD priority P0)
- The prologue and Chapter 1 exactly as in the GDD, including the second-by-second first 10 minutes, the race against Adi, Kelip guidance, strike/langkah/tangkis, the Cursed Adi boss and the first Pelita.
- Title screen, pause, settings, save, touch controls, all assists.
- Measure and report FPS on the iPhone 14 preview and on a mid-range Android profile.

PLAYTEST GATE: After Phase 3, stop. Post the preview URL, a 10-minute playtest checklist for Izaf to run on his iPhone 14, and known issues. Wait for Izaf's reply "GO" (or his feedback) before Phase 4.

Phase 4 - Full story (P1)
- Chapters 2 to 5, every mission in the GDD's mission table, all bosses, both twists, both endings and the epilogue.
- Dialogue system, cutscene sequencer (skippable, under 30 seconds each), journal and map.
- Rendering per region: colour grading, light shafts, water, firefly particles (compute on WebGPU with a WebGL2 fallback), Kelam's ink-like look with no gore.
- Adaptive music system and regional ambience.

Phase 5 - Depth (P3)
- Side stories and activities, skill tree, cosmetics, achievements and Gelanggang, as in the GDD.

Phase 6 - Competitive (P2)
- Ujian Bunian trials, Ujian Harian, ghosts, medals, seasons and friends codes.
- Vercel Functions: signed run tokens with server time, submission, validation (checkpoint order and timing, speed caps, plausible ghosts, rate limits), daily seeds, ranking. Supabase migrations and RLS: public read, no direct client writes. Add a short privacy page, and let players delete their own scores and nickname.
- Investigate whether deterministic Rapier makes server-side replay re-simulation feasible; if not, document why and rely on the plausibility checks.
- If Supabase credentials are missing, build everything behind a config flag with a working local-only fallback, tell Izaf exactly which environment variables to set, and continue.

Phase 7 - Accessibility, performance and QA
- Subtitles, high-contrast Kelip guidance, colour-blind-safe telegraphs, reduced motion, shake toggle, remapping, difficulty assists.
- Automated tests for save and migrations, mission logic, combat timing windows, timers, ghost encoding and validation functions.
- A full playthrough checklist covering every mission, both endings, all trials, the arena and the daily challenge, run in BM and English.
- Zero console errors or warnings in Chrome, Firefox, Safari and Edge.

Phase 8 - Polish and launch (P4)
- Photo mode, trailer camera, OpenGraph image and a shareable results card.
- Production deployment on Vercel; Lighthouse performance 80+ on desktop.

QUALITY GATES (DEFINITION OF DONE)
- The full story plays start to finish, both endings, no soft-locks, in BM and English.
- Every feature in the GDD works in the deployed build on PC and on phones in landscape.
- The player never falls through geometry, gets stuck or jitters; the camera never clips through walls; no animation popping.
- Tampered or replayed leaderboard submissions are rejected.
- The performance budget holds on every preset and both renderer backends.
- Every UI screen passes the ui-ux-pro-max checklist.
- Culture and originality rules fully respected.
- Never mark a phase done if anything in it does not work.

BUG REPORTS FROM IZAF
Izaf reports issues in this format; fix each one and confirm in docs/PROGRESS.md:
BUG: [where] [what happened] [what should happen] [device] [steps]
FEEL: [where] [what feels wrong]

DELIVERABLES
Source code; /tools/blender scripts and npm run assets; /api functions; /supabase migrations and RLS; docs (BUILD_PROMPT, TECHNICAL, ASSETS, CULTURE, DECISIONS, PROGRESS); CLAUDE.md; README (setup, commands, controls, asset build, Supabase setup, Vercel deployment, environment variables); CREDITS.md; the production URL; and a final report per phase (what was built, how it was verified, measured performance per preset and backend on PC and phones, known limitations, anything that needs Izaf's input).

WORKFLOW
- Start with Setup now, then Phase 0.
- Small checkpoint commits as you go. Never commit secrets.
- If you reach a context or output limit, stop at a clean file boundary, write exactly where you stopped in docs/PROGRESS.md, and continue from there when Izaf says "continue from PROGRESS.md", with no gaps or duplicated code.
