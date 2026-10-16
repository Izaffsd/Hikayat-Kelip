# Progress

Resume rule: when Izaf says "continue from PROGRESS.md", start at **Resume point** below.

## Resume point
Setup, nearly done (2026-10-16). The project now lives at `D:\dev\hikayat-kelip` (see DECISIONS D-001).
Waiting on Izaf for: (1) the GitHub sign-in, then the first push to the private repo; (2) the single VS Code
restart into `D:\dev\hikayat-kelip` with Blender open. After the restart: verify every tool version in a fresh
process, confirm the `blender` and `chrome-devtools` MCP servers are connected, write the Playwright visual-test
harness, then start Phase 0 (TECHNICAL.md, ASSETS.md, CULTURE.md).

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
| S8 | gh auth login, git init, first commit, push to Izaffsd/Hikayat-Kelip (made private) | git init done; sign-in pending (Izaf) |
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

Pinned npm packages for the project are listed in `package.json` once Phase 1 starts.

## Setup notes
- Drive C: had 0.78 GB free after the installs; everything large lives on D: (`D:\dev`). Izaf should free space
  on C: for Windows itself.
- winget `Gyan.FFmpeg` is broken today (9.0.2 nested-installer path, 9.0.1 hash mismatch); see D-009.
- The Blender MCP venv is pinned to Python 3.13 (`.python-version` in the clone): Python 3.15 has no PyYAML wheel
  on Windows yet and would need the MSVC build tools.
