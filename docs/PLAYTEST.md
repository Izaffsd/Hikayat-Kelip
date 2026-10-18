# Playtest — Phase 3 vertical slice (PLAYTEST GATE)

For Izaf on the iPhone 14 (iOS 26, Safari). About 10 minutes. Reply **GO** to start Phase 4, or send findings as
`BUG: [where] [what happened] [what should happen] [device] [steps]` or `FEEL: [where] [what feels wrong]`.

**URL:** https://hikayat-kelip.vercel.app (production; every push to `main` redeploys it).

## Before you start

- Open the link in a **Private** Safari tab, so the game starts from a new save.
- Hold the phone in **landscape**. Sound on; try it once with the silent switch on too.
- Keep a stopwatch ready for step 1.
- Three fingers tapping the screen open the debug overlay (FPS, preset). Tap again to close it.

## The run

| # | Time | Do this | It should |
| --- | --- | --- | --- |
| 1 | 0:00 | Tap the link, start the stopwatch; tap the title as soon as it says ready, stop the watch when Wan first moves | Under 10 s from link to moving (pillar 1). Note the time. |
| 2 | 0:00 | Listen as the game starts | Rain, wind and the storm music start with the tap, also with the silent switch on |
| 3 | 0:10 | Left thumb anywhere on the left half: move along the roofs. Tap **Jump** | The stick appears under your thumb; footsteps crunch on the thatch; jumps land cleanly |
| 4 | 0:40 | At the "Hold to glide" prompt: jump, then hold **Jump** in the air | The wau opens, wind rises with speed; it glides to the next roofs |
| 5 | 1:20 | Wisps on the open deck: **Strike**, watch for the bright glow + rising sound before they attack, then **Langkah** (step) or **Tangkis** (parry) on that cue | Hits land with weight; a perfect parry chimes and staggers; music turns to combat on the beat |
| 6 | 2:20 | Follow the tiger across the broken houses (there is a wall-run on the way) | Tok Belang runs ahead (paws, growl), lightning cracks with thunder after it, danger music |
| 7 | 3:00 | On the jetty: the standoff | The roar, Wan's stance, black screen, "Atuk?", then Bayu wakes (Chapter 1) |
| 8 | 3:20 | Leave the room; Mak Som calls; Adi dares you; race to her stall | "Ready… go!" holds you still, then the clock runs; Adi runs his line; a result line from Adi either way |
| 9 | 5:00 | Tap the hikayat (**Action**), then **Call Kelip** | Kelip rises from the book; the call sends a wave of fireflies toward the goal |
| 10 | 6:00 | The berembang display | Trees blaze in sync with a bright cue, go dark row by row, ink tendrils rise from the water |
| 11 | 7:00 | Fight on the jetty head, then watch Adi | Combat music; after it Adi is half-inked and runs; the chapter title; a journal toast and an achievement |
| 12 | 8:00 | **Pause** (top right): Journal, Map, Trials, Settings. Change touch button size and opacity, switch BM ↔ EN, change a volume. Resume | Everything reachable by touch; changes apply at once; the game is frozen and quiet while paused |
| 13 | 9:00 | Pause → Trials → the 1.1 race. Run it twice (the restart is instant) | 3-2-1, the clock, your ghost from the first run beside you with a live time difference, a medal |
| 14 | 9:40 | Open the debug overlay during the race and in a fight | Note FPS and the preset (target 30+ at Low; the phone picks its own preset) |
| 15 | 9:50 | Turn the phone to portrait, then back. Switch to another app and back | A "rotate" screen in portrait; coming back from another app opens pause, sound resumes |

## Please listen for (first pass, needs your ears)

All music and many sounds are synthesised for this game and were checked by measurement, not by ear:
Tok Wan's theme on the seruling and gambus, the rebana and gong rhythms, the tiger's roar, thatch footsteps, the
stingers at the display. Send a `FEEL:` line for anything that sounds wrong, cheap or too loud.

## Known issues

1. **BM dialogue** still needs your native-speaker read (CULTURE §4): flag any line that does not sound natural.
2. **Langkah and tangkis** use library animation clips as stand-ins; dedicated silat clips come later.
3. **Tok Wan's hum** in the prologue is played on the seruling until a voice is recorded; "Atuk?" is subtitle only.
4. **Mid-range Android** is not tested on a real phone yet (only a 4× CPU-throttled desktop run).
5. **Memory:** decoded audio takes about 40 MB; watch for Safari reloading the page on its own after long play.
6. **The repository is still public**; you chose private (GitHub → Settings → Danger Zone → Change visibility).
7. Leaderboards and anything online come in Phase 6; times, ghosts and medals are saved on the phone only.
