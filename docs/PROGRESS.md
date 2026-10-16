# Progress

Resume rule: when Izaf says "continue from PROGRESS.md", start at **Resume point** below.

## Resume point
Setup done except the items that need Izaf (2026-10-16). The project lives at `D:\dev\hikayat-kelip` (D-001).
- Push: Izaf said "no need to push yet". Keep committing locally; ask before the first push (make the repo private
  first, then `gh auth login --web --git-protocol https --scopes workflow`). Vercel previews start after that push.
- VS Code restart: deferred until the MCP tools are first needed (end of Phase 1). Izaf then opens
  `D:\dev\hikayat-kelip` in VS Code with Blender running; verify tool versions and the `blender` and
  `chrome-devtools` MCP connections. Until then, shell commands refresh PATH from the registry.
- Phase 0 done (see log below). Next: Phase 1 — Foundation.

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
