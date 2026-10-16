# Decisions log

Choices the GDD or the build prompt leave open, and every deviation from the docs, with the reason.
Newest entries at the bottom. IDs are stable; reference them from code comments and PROGRESS.md.

| ID | Date | Area | Decision | Why |
| --- | --- | --- | --- | --- |
| D-001 | 2026-10-16 | Setup | The repo lives at `D:\dev\hikayat-kelip`, not `C:\dev\hikayat-kelip`. Izaf started in `C:\Users\User\Desktop\game`; the project moved to D: before the first commit (Izaf approved). | Drive C: had 0.78 GB free after the toolchain installs; the project needs 10–40 GB over its life. D: is a 1 TB SSD with 191 GB free. |
| D-002 | 2026-10-16 | Setup | Use Izaf's existing GitHub repo `Izaffsd/Hikayat-Kelip` instead of `gh repo create hikayat-kelip`, switched from public to private before the first push (Izaf approved). | Izaf supplied it during setup; the build prompt asks for a private repo. |
| D-003 | 2026-10-16 | Setup | Git identity `Iskndar <146904084+Izaffsd@users.noreply.github.com>` (Izaf's GitHub display name and private noreply address). | Izaf chose "use my GitHub account". The noreply address is always linked to the account, which Vercel Hobby needs to deploy private-repo commits, and keeps the personal email out of history. |
| D-004 | 2026-10-16 | Setup | KTX-Software 4.4.2 is installed from the official Khronos GitHub release installer, not winget. | `winget search KTX` (and KTX-Software, Khronos, ktx2, basisu) finds no package; the Khronos release is the next official source. The installer's SHA-256 is checked against the release digest before running. |
| D-005 | 2026-10-16 | Setup | Claude Code runs as the VS Code extension. "Restart Claude Code" means: close VS Code fully, reopen the folder, resume this conversation in the Claude Code panel. `claude mcp list` uses the extension's bundled `claude.exe`. | No standalone `claude` CLI is installed on the PC; the extension bundles one. |
| D-006 | 2026-10-16 | Setup | The chrome-devtools MCP server is registered as `cmd /c npx chrome-devtools-mcp@latest`. | On native Windows, Claude Code needs the `cmd /c` wrapper for stdio MCP servers launched through npx. |
| D-007 | 2026-10-16 | Setup | One VS Code restart covers both the new PATH entries and the MCP servers (setup steps 3 and 10e combined). | Before the restart, commands refresh PATH from the registry so work can continue; one restart instead of two saves Izaf a round trip. |
| D-008 | 2026-10-16 | Setup | Tools and caches live on D:: `D:\dev\tools\blender_mcp` (instead of `C:\dev\tools\blender_mcp`), `D:\dev\tools\ffmpeg`, npm cache `D:\dev\.cache\npm`, uv cache and Pythons under `D:\dev\.cache`. Build scripts point Blender and Chrome temp/profile folders at D: too. | Same reason as D-001: C: is nearly full. |
| D-009 | 2026-10-16 | Setup | FFmpeg 9.0.2 (Gyan full build) is unpacked from the official `GyanD/codexffmpeg` GitHub release zip, SHA-256 checked against the release digest, and added to the user PATH (Izaf approved). | winget `Gyan.FFmpeg` 9.0.2 failed ("Nested installer file does not exist ... bin\ffprobe.exe") and the one retry, 9.0.1, failed ("Installer hash does not match"). |
