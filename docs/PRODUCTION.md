# Hikayat Kelip — Production Guide & Build Prompt

Oct 16, 2026 · @Izaf

## Read this first (for the AI)

This file is saved in the repo as `docs/PRODUCTION.md` next to `docs/GDD.md`; together they are everything needed to build Hikayat Kelip from an empty folder to a deployed game, and this section tells the AI how to read them.

**Who is who.** Izaf is the owner and the only human on the project. In every section below except the build prompt, "you" means Izaf. The AI is the developer: Claude Code running on Izaf's Windows gaming PC.

**What each part is for**

| Part | Audience | What the AI does with it |
| --- | --- | --- |
| `docs/GDD.md` | AI | The single source of truth for game design: story, characters, missions, mechanics, pacing, mobile design, priorities |
| Read this first | AI | Follows it to understand the order of work |
| Setup checklist | Izaf | Does every step it can on the PC (asks before installing), then lists the steps only Izaf can do |
| Final check | Both | Treats each row as a confirmed requirement; the build prompt already includes them |
| Characters and animation; Audio and music | AI | Asset and audio sourcing rules |
| Name check | Izaf | No action for the AI |
| How to hand the GDD to the AI | Izaf | No action; already done once these files are in `docs/` |
| The build prompt | AI | The main instruction for all engineering work, from Phase 0 to launch |
| Session workflow | Izaf | Explains how Izaf reports bugs (BUG and FEEL lines) and resumes sessions; the AI follows those formats |

**Confirmed decisions (do not ask again)**

| Topic | Decision |
| --- | --- |
| Protagonist | Bayu, 17, male, as in the GDD |
| Development machine | Izaf's Windows gaming PC; repo at `C:\dev\hikayat-kelip` |
| Claude plan and model | Max plan; Opus 5.5 by default; Izaf switches to Fable 5.1 only for the hardest problems |
| Test phone | iPhone 14 on iOS 26 (Safari); plus at least one mid-range Android profile |
| Hosting | Vercel Hobby (personal, non-commercial); GitHub repo `hikayat-kelip` connected to Vercel |
| Online backend | Supabase, only from the competitive phase; local fallback until then |
| Blender | 5.2.2 LTS, headless, default path `C:\Program Files\Blender Foundation\Blender 5.2\blender.exe` |
| Playtesters | Izaf playtests every phase on the iPhone 14; outside testers come after the game is finished |
| Monetization | None in v1 |

**Order of work, A to Z**

1. Read `docs/GDD.md` and this whole file.
2. Setup: complete the setup checklist where possible; give Izaf a short list of what only he can do (Claude login, GitHub and Vercel accounts, iPhone update, any secrets).
3. Run the build prompt from Phase 0 to Phase 8.
4. Stop once at the PLAYTEST GATE after Phase 3 and wait for Izaf's "GO".
5. After every phase: checkpoint commit, Vercel preview URL, entry in `docs/PROGRESS.md`.
6. If a session ends mid-work, Izaf will type "continue from PROGRESS.md"; resume exactly where the file says.
7. Finish with the production deployment and the final report.

**When documents disagree.** The GDD wins on design; the build prompt wins on engineering; anything else, or a change to either, goes to Izaf as a one-line question with a recommended answer.

## Setup checklist

The gaming PC starts empty. Izaf installs VS Code and Claude Code and does the sign-ins; the AI installs and verifies everything else from inside Claude Code. Nothing here costs money except the Claude plan.

**Izaf does (about 15 minutes)**

- [ ] Run Windows Update, then install the latest GPU driver (NVIDIA App or AMD Adrenalin); WebGPU and Blender depend on it
- [ ] Install VS Code from code.visualstudio.com
- [ ] Install Claude Code: open PowerShell (not as Administrator), run `irm https://claude.ai/install.ps1 | iex`, open a new PowerShell window and check `claude --version`
- [ ] Create the folder `C:\dev\hikayat-kelip\docs` and put `GDD.md` and `PRODUCTION.md` in it
- [ ] Open `C:\dev\hikayat-kelip` in VS Code, open the terminal, run `claude`, sign in with the Max account, pick Opus 5.5 and send the kickoff message (see Session workflow)
- [ ] Have a GitHub account and a Vercel account (sign up to Vercel with GitHub)
- [ ] Stay at the PC during setup: click Yes on Windows admin (UAC) pop-ups and finish the browser sign-ins the AI starts

**The AI does (Setup, before Phase 0)**

Run every command from Claude Code. Ask Izaf once before the install batch, then go. Confirm each winget ID with `winget show <id>` before installing, and pass `--accept-package-agreements --accept-source-agreements`.

| Order | What | How | Check |
| --- | --- | --- | --- |
| 1 | Let npm and npx scripts run in PowerShell | `Set-ExecutionPolicy -Scope CurrentUser RemoteSigned` | `Get-ExecutionPolicy -Scope CurrentUser` |
| 2 | Git for Windows (gives Claude Code its Bash tool) | `winget install --id Git.Git -e` | `git --version` |
| 3 | Node.js LTS | `winget install --id OpenJS.NodeJS.LTS -e` | `node -v` and `npm -v` |
| 4 | Google Chrome (Playwright drives it headed, with WebGPU) | `winget install --id Google.Chrome -e` | Chrome opens |
| 5 | GitHub CLI | `winget install --id GitHub.cli -e` | `gh --version` |
| 6 | Blender 5.2 LTS | `winget show BlenderFoundation.Blender --versions`, then install the newest 5.2.x with `--version`; if winget has no 5.2 build, download the 5.2 LTS Windows x64 installer from blender.org | `blender --version` shows 5.2 |
| 7 | FFmpeg (convert audio to OGG) | `winget install --id Gyan.FFmpeg -e` | `ffmpeg -version` |
| 8 | KTX-Software (KTX2 textures for gltf-transform) | `winget search KTX`, then install the Khronos package | `ktx --version` |
| 9 | Restart | Ask Izaf to close VS Code fully, reopen it and run `claude --continue`; new installs only appear on PATH in a fresh process | Steps 2 to 8 checks pass |
| 10 | Blender on PATH | Add the Blender 5.2 folder to the user PATH (no admin needed) and record the full path in CLAUDE.md | `blender --background --version` in a new terminal |
| 11 | Git identity and defaults | Ask Izaf for his GitHub name and email; set `user.name`, `user.email`, `init.defaultBranch main`, `core.longpaths true` | `git config --global --list` |
| 12 | GitHub repo | `gh auth login --web` (Izaf finishes it in the browser), `git init`, first commit with `docs/`, `gh repo create hikayat-kelip --private --source . --push` | Repo visible on GitHub |
| 13 | ui-ux-pro-max skill | `npx skills add https://github.com/nextlevelbuilder/ui-ux-pro-max-skill --skill ui-ux-pro-max` | Skill listed |
| 14 | Project packages (Phase 0) | Vite, three, @dimforge/rapier3d-compat, @gltf-transform/cli, @playwright/test, ESLint and Prettier as repo dependencies, never global; Playwright uses `channel: 'chrome'`, so never run `playwright install` | `npm run dev` opens the scene |
| 15 | Vercel | After the first push, ask Izaf to import the repo at vercel.com/new (framework preset Vite); each push to main then deploys, each branch gets a preview URL | Production URL loads |
| 16 | Report | Write installed versions to `docs/PROGRESS.md` and give Izaf the short list of what still needs him | None |

Not yet: Supabase, set up when the competitive phase starts. Mixamo: Izaf downloads animations with his Adobe account when the AI asks for them.

**Live tools (set up after the restart in step 9)**

Izaf's PC already runs Blender 5.2.2 LTS with the official Blender Lab MCP add-on (Edit > Preferences > Add-ons > MCP: host `localhost`, port `9876`, Auto Start on). Connect Claude Code to it as a real MCP server, not by sending raw data to the port.

| Order | What | How | Check |
| --- | --- | --- | --- |
| L1 | uv (runs the Blender MCP server) | `winget install --id astral-sh.uv -e` | `uv --version` |
| L2 | Blender MCP server source | Clone `https://projects.blender.org/lab/blender_mcp.git` to `C:\dev\tools\blender_mcp` (outside the game repo) and follow its wiki Setup page | Folder has the `mcp` server project |
| L3 | Register Blender in Claude Code | Project `.mcp.json`: server `blender`, type stdio, command `uv`, args `--directory C:\dev\tools\blender_mcp\mcp run blender-mcp` (absolute paths, `--directory` before `run`) | After a restart, `claude mcp list` shows blender connected while Blender is open |
| L4 | Chrome DevTools MCP (console, performance traces, memory, CPU throttling, device emulation) | `claude mcp add chrome-devtools --scope project -- npx chrome-devtools-mcp@latest` | `claude mcp list` shows chrome-devtools connected |

On this PC (2026-10-17): the clone is at `D:\dev\tools\blender_mcp`, not `C:\dev\tools\blender_mcp`, because C: is nearly full (DECISIONS D-008), and L3 uses that path. L4 is registered as `cmd /c npx -y chrome-devtools-mcp@latest` plus `--userDataDir` on D:, `--chromeArg=--enable-unsafe-webgpu`, `--no-usage-statistics` and `--workspace=D:\dev\hikayat-kelip`, because native Windows needs the `cmd /c` wrapper for npx (D-006). Both servers pass an MCP handshake from the `.mcp.json` command, and the blender server reaches the running add-on on port 9876. `claude mcp list` shows them as pending approval until the folder is opened and trusted in Claude Code.

**Live tool rules**

- Live Blender is for previewing, inspecting and viewport screenshots. The source of truth stays the bpy scripts in `/tools/blender`: every asset that ships must rebuild headless with `npm run assets`. Never ship anything that exists only in a live scene.
- Working .blend files live in `/art` (git-ignored). Never run code through the Blender MCP that deletes files, touches folders outside the project, or uses the network; the add-on runs code without guards.
- Use Chrome DevTools MCP after each phase for console errors, a performance trace of one key scene, a memory check over 10 minutes, and a 4x CPU-throttled run as a rough mid-range phone stand-in. Real phone results on the iPhone 14 still decide.
- Three.js WebGPU and TSL APIs change between releases: pin the three version in package.json, check the installed version's docs and examples before using an API, and upgrade only between phases.

**Setup rules**

- Never run Claude Code or installers as Administrator; machine-wide installers show their own UAC pop-up for Izaf.
- If an install fails, show the exact error and try the next documented method once; never loop on the same command.
- Never commit secrets; Supabase and Vercel keys go only into Vercel environment variables.
- Check before installing: skip any tool that is already installed at the right version (Blender 5.2.2 LTS, Chrome and VS Code are already on Izaf's PC).

**iPhone 14 testing**

- [ ] Test on the Vercel preview URL, not your PC's local IP: Safari needs HTTPS for some modern web features, and preview URLs are HTTPS by default
- [ ] Turn on Safari's Web Inspector on the iPhone so console errors can be read from a Mac, or ask the AI to add an on-screen error log in the debug overlay

## Final check: what else you need

A last review found eight gaps; the biggest is cost, because Claude Fable 5.1 is not included in a Claude Pro plan.

| Gap | What the research found | What to do |
| --- | --- | --- |
| Claude plan and model | On Pro, Fable 5 and 5.1 run on pay-as-you-go usage credits, not plan limits; on Max, up to 50% of weekly limits can go to Fable at no extra cost ([Claude Help Center](https://support.claude.com/en/articles/15424964-claude-fable-models-on-your-plan)). Claude Code needs Pro or higher ([Claude Code docs](https://code.claude.com/docs/en/setup)) | Decided: Max plan, Opus 5.5 as the main model, Fable 5.1 only for the hardest problems (included up to half the weekly limit) |
| Claude Code on Windows | Runs natively on Windows 10 1809+; Git for Windows is recommended so it can use its Bash tool ([Claude Code docs](https://code.claude.com/docs/en/setup)) | Izaf installs Claude Code first (it uses PowerShell until Git exists); the AI then installs Git for Windows and asks for a VS Code restart so Git Bash is picked up; check with `claude --version` and `claude doctor` |
| iPhone 14 renderer | WebGPU ships in Safari on iOS 26; on Android, Chrome 121+ on Android 12+ with Qualcomm or ARM GPUs ([web.dev](https://web.dev/blog/webgpu-supported-major-browsers)); iOS 26 runs on iPhone 11 and later ([Gadget Hacks](https://ios.gadgethacks.com/news/why-the-four-new-safari-features-in-ios-26-will-change-how-you-browse/)) | Update the iPhone 14 to iOS 26; ask the AI for a debug toggle that forces WebGL2 so you can test both paths on one phone |
| Vercel Hobby limits | Non-commercial use only and 100 GB of Fast Data Transfer a month ([Vercel limits](https://vercel.com/docs/limits)); extra usage can't be bought on Hobby, so hitting a cap stops the allowance ([LiveMy](https://livemy.app/blog/vercel-pricing)) | Keep the prologue under 10 MB with long-term caching; if the game takes off, move large assets to separate storage or upgrade to Pro; Pro is required before any ads or payments |
| Supabase free tier | Free projects pause after one week of inactivity ([MakerKit](https://makerkit.dev/blog/saas/supabase-pricing)) | The game must keep working when the backend sleeps (the prompt already requires a local fallback); restore it from the dashboard; move to Pro once real players arrive |
| Repo size | Raw audio libraries, sample packs and .blend files are huge | Commit only scripts and optimized outputs; keep raw sources outside the repo or use Git LFS |
| Knowing where players quit | The first session decides retention (see the GDD's research) | Add anonymous, privacy-friendly event tracking: mission start, finish and the second a player quits; no personal data |
| Privacy and fonts | Leaderboard nicknames and friend codes are personal data under Malaysia's Personal Data Protection Act; UI fonts carry licenses too | Add a short privacy page and let players delete their scores; use open-licensed (OFL) fonts and log them in CREDITS.md |

A second review added four more requirements, also built into the prompt:

- **Instructions must survive long sessions.** Each Claude Code session starts with a fresh context; CLAUDE.md loads in every session and is re-read after compaction, while instructions given only in chat can be lost; keep it under 200 lines ([Claude Code docs](https://code.claude.com/docs/en/memory)). The AI writes a short CLAUDE.md and saves the full prompt as `docs/BUILD_PROMPT.md`.
- **Fewer permission prompts.** Allow and deny rules in `.claude/settings.json` let routine commands run without asking and block reading `.env` files ([Claude Code docs](https://code.claude.com/docs/en/settings)).
- **Sound on a silenced iPhone.** Web Audio is muted when the iPhone's silent switch is on; setting `navigator.audioSession.type = "playback"` (iOS 17+) fixes it ([WebKit Bugzilla](https://bugs.webkit.org/show_bug.cgi?id=251532)).
- **The AI checks its own visuals.** Headless Chrome hides WebGPU by default, and on Windows headless screenshots miss WebGPU canvases ([agent-browser](https://agent-browser.dev/webgpu)), so visual checks use Playwright driving the installed Chrome in headed mode on the gaming PC's real GPU.

The build prompt below already includes the changes these rows need.

## Characters and animation

Use Quaternius' two CC0 animation libraries as the motion base for every human, model Bayu and the villagers in Blender, and treat Tok Belang as the one asset that needs special handling.

| Need | Source | License | Notes |
| --- | --- | --- | --- |
| Core human motion (run, jump, climb, swim, sit, emotes) | [Quaternius Universal Animation Library](https://quaternius.com/packs/universalanimationlibrary.html) | CC0 | 120+ animations on one universal humanoid rig, ready to retarget; the free tier has 45 ([80 Level](https://80.lv/articles/get-your-hands-on-over-120-ready-to-use-game-animations)) |
| Parkour and melee combos | [Universal Animation Library 2](https://opengameart.org/content/universal-animation-library-2) | CC0 | 130+ more animations on the same rig, including melee combos and parkour movement |
| Extra martial-arts motion | [Mixamo](https://helpx.adobe.com/creative-cloud/faq/mixamo-faq.html) | Royalty free in video games | Humanoids only; Adobe ID needed; never ship the raw animation files as a separate download |
| Rigging Bayu and villagers | Mixamo auto-rigger, or rig to the Quaternius universal rig in Blender | As above | The AI models the mesh in Blender, then rigs it to the same rig the animations use |
| Small animals (fish, birds, buffalo) | [Quaternius animal packs](https://app.cinevva.com/game-assets/free-3d-animal-models) | CC0 | Animated with walk, run and idle |
| Tok Belang (tiger) | No CC0 animated tiger found | — | See below |

**Recommended pipeline for humans**

1. The AI models Bayu, Tok Wan, Adi, Mak Som, Pak Mail, Pak Leman and Embun in Blender: stylized proportions, original baju Melayu, sampin and headwear.
2. Each mesh is rigged to the Quaternius universal rig, so every library animation fits without retargeting work.
3. Silat-specific moves (langkah steps, tangkis, kuncian) are built by editing library combat clips in Blender: same rig, new key poses.
4. Everything exports as one GLB per character, with only the clips that character needs, to keep phone downloads small.

**Tok Belang options, in order of preference**

1. Model a stylized tiger in Blender and animate it procedurally in code (the same gait-cycle approach as the earlier robot-dog prompt). Fully original, no license risk, harder.
2. A free white-tiger model under CC BY ([Gumroad listing](https://downloadforfree.gumroad.com/l/free-white-tiger-animated-rigged-3d-model)); usable with credit in CREDITS.md, but check its license on the page before downloading, and reduce its 33k triangles for phones.
3. A paid animated tiger with an extended commercial license (RenderHub, CGTrader).

**Rule for every asset:** record source, author, license and link in CREDITS.md the moment it enters the repo. Avoid any CC BY-NC asset: non-commercial terms would block the game from ever making money.

## Audio and music

Sound effects are a solved problem with free, commercial-safe libraries; music is where the game's identity lives, so it deserves the most care.

**Sound effects** (all commercial-safe, from [Cinevva's 2026 guide](https://app.cinevva.com/guides/free-sound-effects-music))

| Source | License | Use it for | Rules |
| --- | --- | --- | --- |
| Kenney audio packs | CC0 | UI clicks, impacts, menu sounds | No credit needed |
| Sonniss GDC bundles (2015–2026) | Royalty-free | Studio-grade foley: water, wood, wind, footsteps, crowds | No standalone redistribution; no AI/ML training |
| Freesound, CC0 filter only | CC0 | Specific sounds: rain on attap, mangrove insects, sampan oars | Tick "Creative Commons 0" in the search filter every time |

**Music: four options**

| Option | Identity | Cost | Notes |
| --- | --- | --- | --- |
| A. Commission a Malaysian musician for the main theme on gambus and rebana, plus 5 region loops | Highest | Paid, quoted by the musician | Most authentic, and a great devlog story for your content |
| B. AI-composed loops built from instrument samples, rendered to OGG | Medium | Free with CC0 samples; or a paid royalty-free gamelan sample library ([Impact Soundworks Javanese Gamelan](https://impactsoundworks.com/product/javanese-gamelan-serum-2-sfz-wav/), USD 19) | Ship only rendered mixes, never the raw samples. Javanese gamelan is related to, but not the same as, gamelan Melayu |
| C. Licensed library music (Pixabay Music, no attribution) | Low | Free | Fast placeholder; generic, rarely sounds Malay |
| D. AI music models (Stable Audio, ACE-Step) | Medium | Free or paid | Check each model's output-rights terms before shipping |

**Recommendation:** start with B for the vertical slice so the AI isn't blocked, and plan A for the main theme once the prologue proves fun. Tok Wan's hummed melody is short enough for one musician session.

**Technical rules for the AI**

- OGG Vorbis for everything; Safari added support in version 18.4, so the iPhone 14 on a current iOS plays it.
- Music loops cut on a bar line and played through Web Audio for gapless looping, never MP3 loops.
- SFX in mono, music around 96–128 kbps, total audio for the prologue under 2 MB.
- Every file logged in CREDITS.md with source, license and link.

## Name check

No video game called "Hikayat Kelip" turned up in web searches on 16 October 2026, so the name looks free to use; nearby names exist but none collide.

| Found | What it is | Risk |
| --- | --- | --- |
| [Hikayat (Al-Kisah)](https://boardgamematcher.com/game/hikayat) | A two-player folklore card game with a Malay folklore deck | Low: different medium and full name, but same word and theme, so avoid "Hikayat" alone |
| [Kelipot](https://game.nite07.com/game/9639ccdf-ab3f-447e-b4a6-1626586b8816) | A Chinese roguelite action-platformer | Low: different word |
| [A Yogyakarta folk tale](https://www.goodnewsfromindonesia.id/2026/04/08/kisah-kunang-kunang-dan-angan-angan-tinggi-cerita-rakyat-dari-yogyakarta) | A firefly character named Kelip in an Indonesian folk story | None: a folk name, and a nice coincidence |

**Before going public, check these yourself** (a web search can't confirm them):

- [ ] Domain: hikayatkelip.com or .my, or simply the free `hikayat-kelip.vercel.app`
- [ ] Social handles for the devlog on TikTok, Instagram and YouTube
- [ ] A trademark search on MyIPO only if you ever plan to sell the game

## How to hand the GDD to the AI

The GDD becomes a file in the repo, `docs/GDD.md`, and the build prompt tells the AI that this file is the single source of truth for story, missions and design.

1. Open the [Hikayat Kelip GDD](https://claude.ai/code/artifact/77f611f8-f6b5-4cfa-8e38-5a71cecb79cd) and export it as Markdown.
2. Save it as `docs/GDD.md`, export this guide the same way as docs/PRODUCTION.md, and commit both before the first session.
3. The two pictures (the pacing chart and the touch layout) don't survive a Markdown export; the text and tables around them carry the same information, so nothing is lost for the AI.
4. When you change the design later, edit the GDD doc first, export again, overwrite `docs/GDD.md`, and tell the AI: "GDD updated, read the diff and adjust".

**Rule:** if the code and the GDD disagree, the GDD wins, unless the AI proposes a change and you approve it, in which case the AI updates `docs/GDD.md` in the same commit.

## The build prompt

The AI reads this box from docs/PRODUCTION.md after the kickoff message in Session workflow; it pauses once, after the vertical slice, for your playtest on the iPhone 14 (delete the PLAYTEST GATE lines if you want no pause at all).

```text
You are a veteran AAA game director and senior engineer, acting as: Game Director, Senior Three.js Engineer, Gameplay & Combat Programmer, Technical Artist (Blender pipeline), Narrative Implementer, UI/UX Designer, Audio Implementer, Cultural Reviewer and DevOps Engineer.

MISSION
Build and deploy on Vercel "HIKAYAT KELIP", a story-driven, competitive 3D action-adventure that runs in the browser on PC and on phones in landscape, with AAA-level feel and presentation. Work through every phase below until the game is complete. Take as long as needed. Quality and zero known bugs matter more than speed.

SOURCE OF TRUTH
- docs/GDD.md is the game design. Read it fully before anything else. Story, characters, missions, mechanics, pacing, competitive modes, mobile design and priorities all come from it.
- If the GDD is silent, make the choice that best serves its pillars and record it in docs/DECISIONS.md.
- If you believe the GDD is wrong, say why and propose a change; never silently deviate.

COMPANION FILE
- This prompt lives inside docs/PRODUCTION.md. Its "Read this first (for the AI)" section lists confirmed decisions and the order of work; treat them as settled.

SETUP (BEFORE PHASE 0)
- The PC starts empty except VS Code and Claude Code. Do the Setup checklist table in docs/PRODUCTION.md in order: install every tool with winget or npm (ask Izaf once before the batch), ask him to restart VS Code after the installs, verify every version, create the GitHub repo, and hand Izaf only the sign-ins and pop-ups that need him. Skip anything already installed (Blender 5.2.2 LTS, Chrome and VS Code are already there).
- Live tools: connect the running Blender (official Blender Lab MCP add-on, localhost:9876) and Chrome DevTools MCP to Claude Code exactly as in the Live tools table in docs/PRODUCTION.md, and follow its Live tool rules: live Blender only for preview and screenshots, every shipped asset rebuilds headless from /tools/blender scripts, and no file deletion or network calls through Blender.
- Then give Izaf one short list of what only he can do (logins, accounts, connecting the repo to Vercel, updating the iPhone, secrets), and continue with everything that doesn't depend on it.

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
- Online (Phase 6 only): Supabase Postgres with Row Level Security. All writes go through Vercel Functions using the service role key stored only in Vercel environment variables; the browser only reads with the anon key. Never commit secrets; provide .env.example. The game must keep working when the Supabase project is paused or unreachable (local fallback and a clear message).
- Blender 5.2.2 LTS, run headless: blender --background --python <script>. If 'blender' is not on PATH, use "C:\Program Files\Blender Foundation\Blender 5.2\blender.exe". Export glTF with the headless CLI. Bake procedural textures and colour ramps before export (they are lost in glTF). Optimize with gltf-transform (Meshopt or Draco, KTX2 textures). If Blender is missing, stop and tell me; do not fall back silently.
- Unity is a reference for patterns only: build Three.js equivalents of Cinemachine (virtual cameras, blending, collision, cutscene rails), Animator Controller (layered state machine, blend trees), ScriptableObjects (data-driven JSON) and Timeline (cutscene sequencer).

ASSETS AND LICENSES
- Human animation: Quaternius Universal Animation Library 1 and 2 (CC0). Rig every human (Bayu, Tok Wan, Adi, Mak Som, Pak Mail, Pak Leman, Embun, villagers) to the Quaternius universal rig so the clips fit directly. Build silat-specific moves (langkah, tangkis, kuncian) by editing library clips in Blender on the same rig.
- Mixamo is allowed for extra humanoid motion inside the game only; never ship raw animation files as a separate download.
- Model all characters, props and environments in Blender with bpy scripts in /tools/blender: stylized, painterly, original. One command, npm run assets, regenerates everything.
- Tok Belang (tiger): model a stylized tiger in Blender and animate it procedurally in code (gait cycle synced to speed, IK feet, secondary motion). Do not download tiger assets without my approval.
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
- Primary test device: iPhone 14 in Safari, via Vercel preview URLs (HTTPS). Also verify on a mid-range Android profile.
- Dynamic resolution, optional 30 FPS cap, battery-saver mode, region streaming, prologue download under 10 MB.
- Debug overlay (F3 on PC, three-finger tap on touch): FPS, frame time, draw calls, triangles, physics bodies, memory, renderer backend, and an on-screen error log so I can read errors on the phone.

UI/UX
- Use the installed ui-ux-pro-max skill: read its SKILL.md, follow its workflow, generate a design system adapted to a cinematic Malay-fantasy look (original motifs, not copied patterns), and run its pre-delivery checklist on every screen. Record adopted and rejected recommendations in docs/DECISIONS.md.
- Minimal, contextual HUD; every menu works with keyboard, gamepad and touch.

PERFORMANCE BUDGET
- 60 FPS on a mid-range laptop with integrated GPU at Medium; 30+ FPS on iPhone 14 and a mid-range Android at Low, held for a full 10-minute mission.
- Draw calls under 300 at High; InstancedMesh for repeated props and foliage; frustum culling; LODs.
- No per-frame allocations in hot loops; correct disposal; no memory growth over 30 minutes.
- Audio: OGG Vorbis, mono SFX, music 96-128 kbps, gapless loops through Web Audio.
- Transfer: prologue under 10 MB; hashed assets cached long-term so returning players download almost nothing (Vercel Hobby includes 100 GB of transfer a month).

PHASES
Work in order. End every phase with its checks, a git checkpoint commit, a Vercel preview deployment and a short entry in docs/PROGRESS.md.

PERSISTENCE, PERMISSIONS AND SELF-TESTING (part of Setup)
- Save this entire prompt verbatim as docs/BUILD_PROMPT.md.
- Create CLAUDE.md at the repo root, under 200 lines: the pillars, confirmed decisions, culture rules, stack, commands (dev, build, test, assets), folder layout, and pointers to docs/BUILD_PROMPT.md, docs/GDD.md and docs/PROGRESS.md. Keep it current; it is reloaded every session and after compaction, while chat instructions are not.
- Create .claude/settings.json with allow rules for routine commands (npm, npx, node, git, the Blender executable, vercel) and deny rules for reading .env and .env.* files.
- Visual self-testing: use Playwright with the installed Chrome (channel 'chrome'), headed, with --enable-unsafe-webgpu, so WebGPU uses the real GPU. After each phase, capture screenshots of key scenes in both WebGPU and forced-WebGL2 modes, inspect them yourself, and fix anything broken before reporting. Never trust a headless capture of a WebGPU canvas.
- iOS audio: set navigator.audioSession.type = "playback" when supported, so sound plays even when the iPhone's silent switch is on.

Phase 0 - Read and plan
- Read docs/GDD.md fully. Write docs/TECHNICAL.md (architecture, data formats, streaming, renderer strategy, controller, combat, camera, AI, competitive validation), docs/ASSETS.md (every asset, its source and how it is made) and docs/CULTURE.md.
- Confirm Blender runs headless and the ui-ux-pro-max skill is installed; report anything missing.

Phase 1 - Foundation
- Vite, ESLint, Prettier, folder structure, vercel.json (application/wasm for Rapier; immutable cache headers for hashed assets; correct types for .glb, .ktx2, .ogg), .env.example.
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

PLAYTEST GATE: After Phase 3, stop. Post the preview URL, a 10-minute playtest checklist for me to run on my iPhone 14, and known issues. Wait for my reply "GO" (or my feedback) before Phase 4.

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
- If Supabase credentials are missing, build everything behind a config flag with a working local-only fallback, tell me exactly which environment variables to set, and continue.

Phase 7 - Accessibility, performance and QA
- Subtitles, high-contrast Kelip guidance, colour-blind-safe telegraphs, reduced motion, shake toggle, remapping, difficulty assists.
- Automated tests for save and migrations, mission logic, combat timing windows, timers, ghost encoding and validation functions.
- A full playthrough checklist covering every mission, both endings, all trials, the arena and the daily challenge, run in BM and English.
- Zero console errors or warnings in Chrome, Firefox, Safari and Edge.

Phase 8 - Polish and launch (P4)
- Photo mode, trailer camera, OpenGraph image and a shareable results card.
- Production deployment on Vercel; Lighthouse performance 80+ on desktop.

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

QUALITY GATES (DEFINITION OF DONE)
- The full story plays start to finish, both endings, no soft-locks, in BM and English.
- Every feature in the GDD works in the deployed build on PC and on phones in landscape.
- The player never falls through geometry, gets stuck or jitters; the camera never clips through walls; no animation popping.
- Tampered or replayed leaderboard submissions are rejected.
- The performance budget holds on every preset and both renderer backends.
- Every UI screen passes the ui-ux-pro-max checklist.
- Culture and originality rules fully respected.
- Never mark a phase done if anything in it does not work.

DELIVERABLES
Source code; /tools/blender scripts and npm run assets; /api functions; /supabase migrations and RLS; docs (TECHNICAL, ASSETS, CULTURE, DECISIONS, PROGRESS); README (setup, commands, controls, asset build, Supabase setup, Vercel deployment, environment variables); CREDITS.md; the production URL; and a final report per phase (what was built, how it was verified, measured performance per preset and backend on PC and phones, known limitations, anything that needs my input).

WORKFLOW
- Start with Setup now, then Phase 0.
- Small checkpoint commits as you go. Do not push secrets.
- If you reach a context or output limit, stop at a clean file boundary, write exactly where you stopped in docs/PROGRESS.md, and continue from there when I say "continue from PROGRESS.md", with no gaps or duplicated code.
- Ask me only when a decision cannot be undone, needs money, needs a credential, or changes the GDD.
```

## Session workflow

Expect many sessions over several weeks, not one sitting: the AI will stop at context and usage limits, and your job between sessions is to play the latest preview and report what you find.

**Starting**

1. Do the "Izaf does" steps in the Setup checklist: GPU driver, VS Code, Claude Code, and the `docs` folder with `GDD.md` and `PRODUCTION.md`. The AI installs everything else and creates the repo.
2. Open `C:\dev\hikayat-kelip` in VS Code, run `claude` in the terminal, choose Opus 5.5 on your Max plan, and send the kickoff message below.

**Kickoff message** (the very first message, nothing else needed):

```text
Read docs/GDD.md and docs/PRODUCTION.md fully, starting with the section "Read this first (for the AI)". Follow its order of work: do the setup, then run the build prompt in docs/PRODUCTION.md from Phase 0. Start now.
```

**Every session after that**

1. Type: `continue from PROGRESS.md`.
2. When a phase ends, open its Vercel preview URL on the iPhone 14 and on the PC.
3. Report problems in this shape, one per line, so the AI can act on them without guessing:

```text
BUG: [where] [what happened] [what should happen] [device] [steps]
example: BUG: Ch1 jetty, Bayu falls through the plank after a wall-run, should land on the plank, iPhone 14, wall-run from the stall roof then jump
FEEL: [where] [what feels wrong]
example: FEEL: prologue glide, turning feels too slow on touch
```

4. At the playtest gate, play the first 10 minutes without reading anything; if you get bored or confused anywhere, that is the most important feedback, so write down the exact second.
5. Reply `GO` only when the slice is fun on the phone.

**Model use.** The build runs on Opus 5.5 on a Max plan. Max also includes Fable 5.1 for up to half of the weekly limit at no extra cost, so switch to Fable with /model when Opus gets stuck on a hard problem (a stubborn physics, camera or rendering bug), then switch back. Watch /usage once a week so the build doesn't stall near the weekly limit.

**Safety habits**

- Never paste Supabase keys into the chat; set them in Vercel's environment variables yourself.
- If a session goes badly, roll back to the last checkpoint commit instead of asking the AI to patch on top of a mess.
- Keep a short devlog of each phase for your content: the GDD, the playtest gate and the twist reveal are good episodes.
