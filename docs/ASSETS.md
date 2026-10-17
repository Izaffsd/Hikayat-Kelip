# Hikayat Kelip — Asset Plan

Every asset in the game: what it is, where it comes from, how it is made, its budget and its priority.
Rules (BUILD_PROMPT, CLAUDE.md): original stylized/painterly art made by bpy scripts in `tools/blender`; humans on the
Quaternius universal rig; no tiger downloads without Izaf's approval; CC0/royalty-free audio only, never CC BY-NC or
GPL; OFL fonts; every third-party file logged in `CREDITS.md` the moment it enters the repo; raw libraries and .blend
files stay out of git. `npm run assets` rebuilds everything headless.

Priority follows the GDD gates: **P0** vertical slice (prologue + Chapter 1 + one trial), **P1** Chapters 2–5 and
endings, **P2** competitive, **P3** depth (side stories, arena, cosmetics), **P4** polish.

---

## 1. Pipeline

```
tools/blender/*.py  --(blender --background --factory-startup --python)-->  build-cache/raw/*.glb
build-cache/raw/*.glb  --(gltf-transform: dedup, prune, weld, resample, meshopt, KTX2 ETC1S/UASTC)-->  public/assets/<region>/<name>.<hash>.glb
tools/audio/sounds.json + synth.mjs  --(ffmpeg decode; filter, trim, fade; peak -1 dBFS one-shots / RMS -20 dBFS loops; gain; join with gaps; mono OGG Vorbis, bit-exact)-->  public/assets/audio/<bank>.<hash>.ogg
tools/build-assets.mjs  -->  src/data/generated/assets.json  (url, bytes, type; audio: bus, loop, sound regions)
```

- `npm run assets -- --only audio` rebuilds only the sound banks; `--only <jobId>` selects Blender jobs. Raw
  third-party packs live in `D:\dev\raw` (or `HK_RAW_DIR`), outside git; the audio build refuses any source whose
  licence is not CC0 and rewrites the generated audio section of `CREDITS.md`. WAV previews of every bank land in
  `build-cache/audio/` for listening.

- Blender 5.2.2 LTS headless; scripts are deterministic (fixed seeds) so rebuilds are byte-stable when inputs are.
- Procedural textures and colour ramps are **baked** to images before export (glTF loses procedural nodes).
- Texture targets: ETC1S for colour/painted atlases, UASTC for normal maps (rare in this style); 256–1024 px.
- Every GLB carries glTF `extras` for colliders and traversal tags (see TECHNICAL §4.1).
- Live Blender (MCP) is only for previews and screenshots; nothing ships unless the headless scripts produce it.

### Budgets

| Asset type | Triangles (LOD0 / LOD1) | Textures | Notes |
| --- | --- | --- | --- |
| Hero character (Bayu, Wan) | ≤ 14 k / 5 k | one 1024 atlas | outline shell on Medium/High only |
| Named NPC / boss human | ≤ 10 k / 4 k | 512–1024 atlas | |
| Background villager | ≤ 5 k / 2 k | shared 512 atlas + palette variation | colour variants via vertex colour/palette |
| Tok Belang | ≤ 12 k / 4 k | 1024 atlas (baked stripes) | custom quadruped rig, procedural animation |
| Kit piece | 50–2 000 | shared kit atlas (1024) per region | merged/instanced at runtime |
| Foliage card cluster | ≤ 300 | shared 512 alpha atlas | instanced |
| Prologue total download | < 10 MB incl. engine + audio (< 2 MB) | | |

---

## 2. Characters (humans) — base: Quaternius Universal Base Characters (CC0), rig: Quaternius universal rig

Method (`tools/blender/characters/*.py`): import the base character of the right proportion (Teen or Regular,
male/female), keep the skeleton untouched so every library clip fits directly, reshape the body with shape keys
(build, posture), model original clothing, hair and face features as new meshes, transfer skin weights from the base
body (Data Transfer), paint/bake a painterly atlas, split LODs, export one GLB per character with only its clips.

| ID | Character | Base | Design notes | Clips | Priority |
| --- | --- | --- | --- | --- | --- |
| `bayu` | Bayu, 17 | Teen male | Everyday baju Melayu (rolled sleeves), short sampin with an original woven motif, loose seluar, bare feet; tongkat on the back; expressive brows | full locomotion, traversal, combat, silat set, emotes | P0 |
| `wan_young` | Young Wan (prologue, final boss) | Regular male (lean) | Storm-soaked baju, destar headcloth, tongkat; same model for 5.3 with Kelam aura material | full moveset (prologue), duel set | P0 |
| `tokwan` | Tok Wan (memories, Ending B scene) | Regular male, aged | Grey hair and beard, kain pelikat, warm worn baju; no religious headwear | idle, walk, sit, gestures, hum pose | P1 (P0 if a memory beat needs him) |
| `adi` | Adi, Bayu's rival | Teen male | T-shirt over shorts and a tied kain, cap worn backwards; cocky posture | locomotion, race, emotes | P0 |
| `adi_cursed` | Cursed Adi (boss 1.4) | `adi` + overlay | Ink veins, half-tiger stripes painted in ink, amber eyes; reads as cursed, never gory | boss set (2 phases), kuncian victim | P0 |
| `maksom` | Mak Som, Bayu's mother | Regular female | Baju kurung, kain batik with original pattern, everyday tudung (attire, never a cosmetic item) | idle, cook/serve at stall, talk, wave | P0 |
| `pakmail` / `pakmail_jadian` | Pak Mail, farmer / Ch2 boss | Regular male (heavy) | Farmer clothes, terendak hat; jadian form: bulkier, hunched, ink stripes and claws, stylized | farm idle; boss set (3 phases) | P1 |
| `pakleman` | Pak Leman, boatwright | Regular male, elderly | Work apron, rolled sleeves, carving tools | idle, carve, talk | P1 |
| `embun` | Embun, keeper of the Bunian | Regular female (tall) | Layered leaf-and-mist garments, pale shimmer shader, floats slightly; elegant, unsettling, never a deity | idle, gesture, judge | P1 |
| `villager_*` | Villagers (adults, elders, children) | Regular / Teen bases | 6 outfits × palette variants; children use the Teen base scaled 0.8 for background roles | locomotion, chores, crowd, flee/thank | P0 (Kampung set) |
| `cursed_*` | Cursed brawler / hunter / Kelam guard | villager bases + overlay | Ink overlay material, props: fishing net, blunted spear, ink shield | enemy sets | P0 (brawler), P1 (hunter, guard) |

**Built 2026-10-17** (`humans` job, D-027): `bayu` (13.5 k / 5 k), `wan_young` (13.5 k / 5 k, destar), `adi`
(10 k / 4 k, backwards cap, tied kain over shorts), `maksom` (10 k / 4 k, baju kurung, batik kain, everyday tudung),
`villager_man`, `villager_elder`, `villager_woman`, `villager_woman_b`, `villager_child` (5 k / 2 k, 512 atlases).
Method as planned, except: the free UBC tier has only the heroic adult bodies, so builds come from `lib/human.reshape`;
weights are inherited from the body shells rather than transferred; `cursed_*` and `adi_cursed` reuse these meshes
with the runtime overlay. Not built yet: `tokwan` (P1), `pakmail`, `pakleman`, `embun` (P1).

## 3. Non-human characters

| ID | What | Method | Priority |
| --- | --- | --- | --- |
| `kelip` | The last firefly spirit (wordless; colour and blink language) | Procedural VFX in code (light core, particle trail, point light); no mesh | P0 |
| `tokbelang` | Huge white-striped guardian tiger, scarred | Modelled in Blender by script (stylized proportions), custom quadruped rig, baked stripe atlas; **animated procedurally in code** (gait, IK feet, spine/tail springs) | P0 (prologue silhouette/chase), P1 (duel, ride) |
| `tiger_cub` | Tok Belang's cub (side story) | Variant of the tiger script with cub proportions | P3 |
| `wisp` | Shadow wisp | Ink blob mesh + tendril strips, procedural motion | P0 |
| `beast_*` | Possessed beast (buffalo/boar) | Base animal + Kelam overlay | P1 |
| `kelam_colossus` | Harbour colossus (boss 4.4) | Blender script: segmented ink body, lantern weak points, crane-climb attach points | P1 |
| `kerbau` | Water buffalo herd | Quaternius animal pack (CC0) bull/cow adapted into kerbau (back-curved horns, slate skin) | P1 |
| `kingfisher`, `crab`, `fish`, `tembakul` (mudskipper), `cat` | Guide and ambient animals | Small bpy models + procedural motion; Quaternius CC0 animals where a fitting one exists | P0 (kingfisher, crabs, fish), P1 others |

## 4. Animation

| Set | Source | How | Priority |
| --- | --- | --- | --- |
| Locomotion (idle → sprint, turns, starts/stops), jump/fall/land, climb/mantle/ledge, slide, swim, interact, emotes, hit reactions | Quaternius Universal Animation Library 1 & 2 (CC0) | Imported as-is on the universal rig; trimmed and renamed by script; per-character clip subsets | P0 |
| Parkour extras (vault, wall-run, pole swing) | UAL2 parkour clips; edited where missing | Key-pose edits in Blender scripts | P0 (wall-run), P1 (vault, pole) |
| Silat set: langkah steps (4 dirs + perfect), tangkis (high/mid/low + perfect deflect), kuncian (paired attacker/victim), standoff stance, bunga flourish (performance only, no ritual), tongkat and keris strings, the 8 buah | UAL2 melee clips as the base | Edited on the same rig: new key poses layered by script, timing tuned to the combat data | P0 (strike, langkah, tangkis, kuncian basics), P1 (buah) |
| Tok Belang gaits | Code | Procedural (TECHNICAL §5.4) | P0 |
| Mixamo extras (only if a needed motion is missing) | Mixamo (royalty-free in games; Izaf downloads with his Adobe ID on request) | Retargeted onto the universal rig in Blender; shipped only inside character GLBs, never as raw files | as needed |

## 5. Props

| ID | Prop | Notes | Priority |
| --- | --- | --- | --- |
| `tongkat` | Tok Wan's staff | Carved head, cloth wrap (cosmetic wraps later) | P0 |
| `keris` | Heirloom keris + sarung | Treated with respect; ceremonial details; no mystical powers attributed | P1 |
| `wau_*` | Kites | Wau bulan silhouette for the glider; festival kites with original motifs | P0 (glider), P1 (festival) |
| `hikayat` | Tok Wan's hand-written book + torn pages | Glowing page VFX for Kelip's rise | P0 |
| `pelita_*` | The five great lights (Air, Bumi, Rimba, Pelabuhan, Puncak) | One design language, regional materials; "lit" and "dark" states | P0 (Air), P1 others |
| `pondok_kelip` | Hidden Cahaya spots (the GDD's "shrines") | Small carved firefly lantern posts; deliberately non-religious (see CULTURE.md) | P0 |
| `lore_scroll`, `paper_scrap`, `chest` | Collectibles | Scroll tube, fluttering scraps, peti (chest) | P0 (few), P3 (all 40) |
| `sampan`, `perahu` | Boats | Ambient in Ch1; playable sampan in Ch4 | P0 (ambient), P1 (playable) |
| Village props | Pelita oil lamps, gas lamps, nets (jala), fish traps (bubu), washing lines with batik, water jars (tempayan), baskets, stall (gerai), radio, bicycles | Kit-level variety, instanced | P0 |
| Sawah props | Scarecrows (orang-orang sawah), huts (dangau), ropes/vines for swings, kite stands | | P1 |
| Kota Kayu props | Market stalls, carving tools, gambus, harbour cranes (wooden), lighthouse, festival lanterns and banners (no religious symbols) | | P1 |

P0 props built 2026-10-17 by `tools/blender/props/slice_props.py` → `props/props_slice`: `tongkat` (origin at the grip,
`hk_attach=hand`), `wau_bulan` (layered cut-paper skin, crescent tail, humming bow, `hk_grips`), `hikayat_closed`,
`hikayat_open` (one torn page), `page_torn` (collectible), `pelita_air` (teal water-glass lantern, `hk_pelita=air`,
light offset), `peti` (lid hinged on `hk_hinge=x`) and `lore_scroll`. 1,418 triangles, 320 KB.

## 6. Environment kits and regions

| Region | Kit contents | Landmarks | Priority |
| --- | --- | --- | --- |
| Prologue: flooded Kampung Berembang, 40 years ago | Kampung kit in storm/damaged states: broken planks, tilting houses, collapsing roofs (scripted breakables), floating debris; rain, rising water | The jetty standoff in the rain | P0 |
| Kampung Berembang (Ch1, epilogue) | Stilt houses (rumah ibu, serambi, dapur; posts, floors, woven walls, shuttered windows, stairs), nipah/attap roofs with simple gable boards, boardwalks and the long jetty, berembang mangroves (Sonneratia) with pneumatophores, nipah palms, mudflat heightfield, river | The tallest berembang (Pelita Air), the old jetty (boss arena) | P0 |
| Sawah Emas (Ch2) | Terraced paddies (bendang, batas, channels), instanced rice, huts, giant scarecrows, festival field, ropes and nets between poles | Kites overhead, terrace Pelita | P1 |
| Hutan Larangan (Ch3) | Giant trees with buttress roots, vines, ferns, mossy rocks, mist cards, bioluminescent fungi, Bunian arches (original woven-root design with glowing threads), Tok Belang's den, the memory grove | Bunian arches, Pelita Rimba | P1 |
| Kota Kayu (Ch4) | Carved timber town with rumah limas roofs (tunjuk langit finials, tebar layar gable boards, sisir angin panels), market streets, rooftop routes, poles, carving hall (heritage building, no royals), boatyard, harbour cranes | Lighthouse (Pelita Pelabuhan) | P1 |
| Puncak Seri (Ch5) | Mountain path, collapsing ledges, cloud sea, thermal columns (VFX), summit | The last Pelita | P1 |
| Trials (Ujian Bunian ×15), Gelanggang arena | Region kits + Bunian gates, rings, timing arches | | P0 (one trial), P2/P3 rest |

Textures for kits are generated in Blender (wood grain, attap thatch, woven panels, mud, cloth) and baked into one
atlas per region. Weave and cloth patterns are original, procedurally generated designs (functional weave geometry,
no copied batik or songket motifs).

## 7. VFX and shaders (code-first)

Fireflies (signature), Kelip, Kelam ink tendrils and colour drain, rain/splashes, water (TSL), sky and clouds, mist,
hit sparks (light, never blood), dust, glide trails, thermal updrafts, Pelita relight burst. Small sprite textures are
generated by script (`tools/textures/*.mjs`) and shipped as KTX2 or tiny PNGs.

## 8. UI

| Item | Source | Priority |
| --- | --- | --- |
| Design system (colour, type scale, spacing, motion tokens) | ui-ux-pro-max workflow, adapted to a cinematic Malay-fantasy look | P0 |
| Motifs (borders, dividers, frames) | Original SVG geometry inspired by the principles of carving and weaving (rhythm, symmetry, leaf scrolls), not copied patterns | P0 |
| Icons (actions, prompts for keyboard/gamepad/touch, HUD) | Original SVG set | P0 |
| Fonts | OFL families chosen in Phase 1 (display + text), Latin with full Malay coverage, subset and self-hosted (WOFF2) | P0 |
| Title painting (2D firefly river) | Canvas 2D code, instant first paint | P0 |
| OpenGraph image, results card, app icons | Rendered from the game (Phase 8) | P4 |

## 9. Audio

| Category | Source | Notes | Priority |
| --- | --- | --- | --- |
| UI clicks, confirms, menu | Kenney audio packs (CC0) | Re-processed (EQ, level) to fit the palette | P0 |
| Impacts, whooshes, footsteps (wood, mud, water), cloth | Kenney (CC0), Sonniss GDC bundles (royalty-free, no standalone redistribution), Freesound CC0 | Mono, short, normalized | P0 |
| Ambience: night insects, lapping water, rain on attap, wind, distant radio (no religious broadcasts), crowds, birds, buffalo bells | P0: original synthesis (`tools/audio/synth.mjs`: insects, water, rain, wind, glide wind, thunder); later layers from Sonniss GDC or Freesound CC0 where synthesis falls short | Seamless mono loops, widened at runtime (two offset copies panned apart) | P0 (Kampung, storm) done, P1 others |
| Signature cues: Kelip twinkle and call, pondok kelip, Pelita relight, attack tell, perfect tangkis, cursed villager freed, wisp dissolve, race countdown (gambang) | Original synthesis | Bells, mallets and swells in a pentatonic palette | P0 done |
| Music: Tok Wan's theme + regional layered loops (explore, danger, combat, story) | Composed for this game from CC0 instrument samples (gambus/oud-like lute, rebana-like frame drums, gamelan Melayu-style metallophones and gongs, bamboo flute, strings), rendered to OGG by `tools/audio` | Ship only rendered mixes; never the raw samples; bar-aligned loops | P0 (prologue, Kampung), P1 others |
| Tok Wan's hum (prologue) and "Atuk?" (child's voice) | Recorded by Izaf or a volunteer (to be asked), or a synthesized hum; until then subtitle + soft cue | Kept short; original melody | P0 (placeholder), P1 (final) |

Sonniss and Freesound items are downloaded to `D:\dev\raw\audio` (outside git), processed, and only the rendered OGGs
enter the repo with a CREDITS.md line each.

## 10. Third-party sources

| Source | License | Used for | Status |
| --- | --- | --- | --- |
| [Quaternius Universal Animation Library](https://quaternius.itch.io/universal-animation-library) | CC0 | Core human animation (free standard tier) | To fetch in Phase 2 |
| [Quaternius Universal Animation Library 2](https://quaternius.itch.io/universal-animation-library-2) ([OpenGameArt mirror](https://opengameart.org/content/universal-animation-library-2)) | CC0 | Parkour and melee clips | To fetch in Phase 2 |
| [Quaternius Universal Base Characters](https://quaternius.itch.io/universal-base-characters) | CC0 | Rigged base bodies (Teen, Regular) for every human | To fetch in Phase 2 |
| Quaternius animal packs | CC0 | Buffalo base, fish, birds | As needed |
| Kenney audio packs | CC0 | UI and basic SFX | Phase 2 |
| Sonniss GDC Game Audio bundles | Royalty-free (no standalone redistribution, no AI/ML training) | Foley, ambience | Phase 2 |
| Freesound (CC0 filter only) | CC0 | Specific sounds and instrument samples | Phase 2 |
| Mixamo | Royalty-free in games (Adobe ID) | Only if a motion is missing | On request |

Paid "source" tiers of the Quaternius packs are not needed; if one ever is, Izaf decides (money).
