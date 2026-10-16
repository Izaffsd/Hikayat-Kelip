# Hikayat Kelip — Game Design Document

Oct 16, 2026 · @Izaf

## Overview

Hikayat Kelip is a 3–4 hour story-driven action-adventure with silat combat, rooftop parkour and wau gliding, plus endless competitive trials, playable instantly in a browser on PC and on phones in landscape.

**Logline.** On the fantasy island of Pulau Seri, the kelip-kelip that guide travellers at night are dying, and the island is forgetting its own stories. Bayu, a young pendekar from a mangrove village, follows the last firefly spirit across five regions to rekindle the island's ancient lights before a creeping darkness called Kelam swallows its memory.

**Pillars**

1. **Fun in 10 seconds.** Open the link, move within 10 seconds, feel good moving within 30.
2. **Flow.** Running, leaping between stilt-house roofs, swinging and gliding on a wau is fun even with no goal.
3. **Silat that feels earned.** Rhythmic, counter-focused combat: read the attack, step, parry, lock.
4. **A story people talk about.** Warm, folklore-rich, with a twist that recolours everything before it.
5. **Always one more try.** Every trial has a clock, a ghost and a global leaderboard.

**Target player.** Players aged 15–35 in Malaysia and Southeast Asia first, then global. Mostly mid-range Android phones and laptops. Short sessions on the go, longer sessions at home.

**Shape of the game**

| Item | Target |
| --- | --- |
| Platform | Browser: PC (keyboard, mouse, gamepad) and phone in landscape (touch) |
| Main story length | 3–4 hours |
| Session length | Every mission completable in 5–12 minutes |
| Replay | Ujian Bunian trials, daily challenge, arena, medals, ghosts |
| Language | Bahasa Melayu and English, switchable |
| Price | Free to play, no account needed until submitting a score |

**Why it won't be boring.** Something new arrives every 5–10 minutes: a new move, a new enemy, a new place, a story beat or a set piece. No mission repeats the previous one's verb. Story is never longer than 30 seconds without the player back in control.

## What the research says

Short, tight games get finished, and the first minute decides whether anyone stays. Five findings shape every decision below.

| Finding | Evidence | What we do |
| --- | --- | --- |
| Most players never see the ending | Median game finished by about 36% of Steam players; big RPGs and soulslikes by about 1 in 4 ([TAG, Jun 2026](https://www.twoaveragegamers.com/game-completion-rates/)) | Main story 3–4 hours, not 20 |
| Short and linear gets finished | An evening-length game hits 74%; a tight 8–10 hour horror game hits 58% ([TAG](https://www.twoaveragegamers.com/game-completion-rates/)) | Linear critical path, optional side content around it |
| The first session decides | Poor design makes up to 60–80% of players leave for good after a disappointing first session; the first 60 seconds must deliver fun and a reward ([deltaDNA via GamesBeat](https://gamesbeat.com/f2p-retention-could-do-better/)) | Show the best moves in the first minute (see The first 10 minutes) |
| One idea per short stretch | Nintendo teaches a mechanic, develops it, twists it and retires it in about five minutes ([MCV/DEVELOP](https://mcvuk.com/business-news/publishing/video-nintendos-level-design-secrets-in-four-steps/)) | Every mission follows teach, develop, twist, test |
| Keep eyes on the world | Ghost of Tsushima used wind, animals and landmarks to keep players looking at the world and eager to explore ([GDC Vault](https://www.gdcvault.com/play/1027399/Exploration-in-Ghost-of-Tsushima)) | Kelip fireflies replace waypoints |

Two more rules come from the same research. Show players what the best move feels like before asking them to earn it. And never let a story beat or a menu stand between the player and control for more than 30 seconds.

## The story

Hikayat Kelip is a story about a village that buried an ugly truth, and a grandson who must decide whether to dig it up. The monster is not a demon; it is a lie everyone agreed to forget.

**The world's rule.** On Pulau Seri, every true story that is told aloud becomes a kelip-kelip. The fireflies live on the berembang trees along the river, and five ancient Pelita (great lights) hold the island's memory. When people stop telling a story, its light goes out. When people bury a story on purpose, it does not die. It rots into Kelam.

**What really happened, 40 years ago (hidden until Chapter 4).** The town of Kota Kayu wanted a great harbour. The villagers cut down the old berembang grove to build it, though elders warned that the mangrove held back the sea. That monsoon, a storm surge flooded Kampung Berembang and people died. Tok Belang, the guardian tiger, had tried to warn the village that night by roaring at the river. Frightened and grieving, the villagers blamed him: "the tiger brought the flood." A young pendekar named Wan led the hunt that drove Tok Belang into the mountains. He knew the truth and stayed silent to protect the people who had cut the trees. The village rewrote the story, and the real one was buried.

**The present.** Wan grew up to be Tok Wan, Bayu's beloved grandfather and teacher. A week after he passes away, the fireflies start vanishing. Villagers grow strange and angry at night, and some turn into harimau jadian. The buried story has grown so large that Kelam is finally rising, and it turns people into the very monster they once blamed.

**Bayu's quest.** Tok Wan leaves Bayu his tongkat and his hand-written hikayat, a book of the island's stories with the last pages torn out. From the book rises Kelip, the last firefly spirit. Kelip leads Bayu to relight the five Pelita, one per region. Each relit Pelita returns one torn page, so the book is both the story's spine and its mystery.

**Twist 1, Chapter 4: the island's lie.** In Kota Kayu, an old boatwright confesses the harbour, the flood and the hunt. Bayu learns his grandfather led it, and that Tok Belang, the beast he has been fighting, has been protecting Kelip all along.

**Twist 2, Chapter 5: Kelip is Tok Wan's confession.** The final page shows Tok Wan wrote the true story the night before he died, but never read it aloud. That unspoken confession became Kelip. Kelam's final form is Wan himself, young, at the night of the hunt, fighting with the same silat Tok Wan taught Bayu.

**The final choice.** After defeating Kelam, Bayu stands at the last Pelita holding the final page.

|  | Ending A: Simpan (Keep it) | Ending B: Hikayat (Tell it) |
| --- | --- | --- |
| Bayu's act | Relights the Pelita and seals Kelam beneath Puncak Seri | Reads the true story aloud to the whole island at the night festival |
| What he keeps | His grandfather's name as a hero; Kelip stays at his side | Nothing hidden; Kelip dissolves into thousands of new fireflies |
| What the island gets | Peace today; the fireflies return | Shame, then repair: villagers replant the berembang grove, Tok Belang returns to guard it |
| Final image | Years later, a thin dark tendril stirs under the mountain | Years later, Bayu tells the full hikayat to children by the river as the grove glows |
| Feeling | Warm, with unease | Bittersweet, earned |

Both endings are complete and respectful. Ending A is not a "bad" ending; it is the choice many families make. Ending B is the one the game quietly argues for, and it unlocks a short epilogue mission.

## Characters

Every character either helps Bayu remember or wants him to forget, and each one has a gameplay job, not only a story job.

| Character | Who they are | What they want | Arc | Gameplay role |
| --- | --- | --- | --- | --- |
| **Bayu** (17) | Pendekar-in-training from Kampung Berembang; stubborn, funny, fiercely loyal to Tok Wan | To prove he is worthy of his grandfather's tongkat | From "my grandfather was perfect" to "I can love him and still tell the truth" | Player character |
| **Kelip** | The last firefly spirit, wordless, speaks through colour and blinking | To be spoken aloud | Grows brighter with each Pelita; dims after Twist 1; is revealed as Tok Wan's confession | Guide, light source, combo finisher, ability upgrades |
| **Tok Wan** | Bayu's late grandfather and silat teacher; seen only in memories, the prologue and the final duel | Peace he never allowed himself | Hero, then flawed man, then (in Ending B) forgiven | Prologue playable character; final boss as young Wan |
| **Tok Belang** | A huge white-striped guardian tiger (harimau keramat), silent and scarred | To protect the last firefly spirit | Feared monster, then wronged guardian, then ally | Mid-game boss duel; ally and mount set piece in Chapter 5 |
| **Embun** | Keeper of the Orang Bunian, elegant and unsettling | To test whether Bayu deserves the forest's memory | Neutral judge who becomes a respectful ally | Hosts Ujian Bunian trials; gives the wau glider upgrade |
| **Mak Som** | Bayu's mother, runs the jetty stall | To keep her son safe and the past quiet | Knew part of the truth; makes peace with it in Ending B | Hub character, side stories, safe home base |
| **Adi** | Bayu's best friend and sampan-racing rival | To beat Bayu at anything, once | Comic relief who becomes brave when cursed and freed | Rival ghost in trials; first person Bayu frees |
| **Pak Mail** | Gentle buffalo farmer in Sawah Emas | To protect his harvest | Becomes the Chapter 2 boss as a harimau jadian, then freed | Boss; afterwards runs the scarecrow trial |
| **Pak Leman** | Old boatwright in Kota Kayu, Tok Wan's friend from youth | To confess before it's too late | Delivers Twist 1 | Story beat; upgrades the sampan |
| **Kelam** | A darkness made of the buried story | To keep being forgotten, which is how it grows | Whispers the village's version of history; final form is young Wan | Enemy faction, environmental hazard, final boss |

Tone rule: nobody is a cartoon villain. The villagers were frightened and grieving, and the game never mocks them.

## Structure and pacing

The main story runs about 3 hours 40 minutes across a prologue, five chapters and an epilogue, and every chapter adds one new way to move and one new way to fight.

| Chapter | Region | Length | New movement | New combat | Set piece | Boss | Story beat |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Prologue: Malam Pemburuan | Flooded mangrove, 40 years ago | 10 min | Full moveset, borrowed | Full combos, borrowed | Storm chase across collapsing stilt houses | (Tok Belang, interrupted) | Young Wan hunts a tiger; cut to black |
| 1. Bunyi Pertama | Kampung Berembang | 35 min | Run, jump, mantle, wall-run | Strike, langkah, tangkis | Fireflies vanish mid-display; first attack on the jetty | Cursed Adi | Kelip rises from the hikayat; Pelita Air relit, page 1 |
| 2. Wau Bulan | Sawah Emas | 40 min | Rope swing, wau glide | Kuncian (locks), first buah | Kite festival race through the harvest | Pak Mail, harimau jadian | Tok Belang seen "attacking"; the official legend on page 2 |
| 3. Rimba Bunian | Hutan Larangan | 45 min | Root running, Bunian shortcuts | Standoff duels, stealth | The forest rearranges itself around Bayu | Tok Belang duel | Vision of the cut grove; the tiger shields Kelip; page 3 |
| 4. Pesta Cahaya | Kota Kayu | 45 min | Rooftop parkour, sampan chase | Keris moveset | Night festival swallowed by Kelam | Kelam colossus over the harbour | Twist 1: the harbour, the flood, the hunt; page 4 |
| 5. Puncak Seri | The mountain | 35 min | Tiger ride, thermal gliding | Every buah, Semangat finisher | Riding Tok Belang up the collapsing peak | Young Wan | Twist 2, final page, the choice |
| Epilogue (Ending B) | Kampung Berembang | 10 min | Free roam | None | Replanting the grove at dusk | None | Bayu tells the hikayat by the river |

**Pacing rules**

- Each chapter follows teach, develop, twist, test: the new move is taught safely, used in harder spaces, combined with something unexpected, then tested in the boss.
- A quiet beat (village, conversation, scenery) follows every big fight, so intensity rises in waves, not a flat line.
- Chapters 1–3 end on a question; Chapters 4–5 end on an answer.
- Every chapter is split into 3–4 missions of 5–12 minutes with an autosave between each, so a phone session always ends at a natural stop.

**Intensity curve (design targets, 1 = calm, 10 = peak). Rule: every boss peak is followed by a quiet beat.**

| Mission | Name | Intensity | Boss |
|---|---|---|---|
| P | Prologue | 8 |  |
| 1.1 | Race | 3 |  |
| 1.2 | Kelip | 5 |  |
| 1.3 | Tracking | 6 |  |
| 1.4 | Adi | 7 | Yes |
| 2.1 | Kites | 4 |  |
| 2.2 | Paddies | 6 |  |
| 2.3 | Tiger chase | 6 |  |
| 2.4 | Pak Mail | 8 | Yes |
| 3.1 | Trial | 4 |  |
| 3.2 | Forest | 6 |  |
| 3.3 | Memory | 2 |  |
| 3.4 | Tok Belang | 9 | Yes |
| 4.1 | Town | 4 |  |
| 4.2 | Confession | 6 |  |
| 4.3 | Festival | 8 |  |
| 4.4 | Colossus | 9 | Yes |
| 5.1 | Tiger ride | 7 |  |
| 5.2 | Final page | 5 |  |
| 5.3 | Young Wan | 10 | Yes |
| 5.4 | Choice | 3 |  |
| E | Epilogue | 2 |  |

The quiet beats (the memory of the grove, the choice, the epilogue) are as deliberate as the peaks; without them the bosses stop feeling big.

## The first 10 minutes

The player controls a fully powered pendekar within 10 seconds, loses that power at minute 3, and spends the rest of the game earning it back. That contrast is the hook.

1. **0:00 — Title.** The page loads straight to a living title screen: fireflies over a dark river. One tap or key starts the game (that tap also unlocks audio). Language follows the browser setting; no account, no menus.
2. **0:05 — In control.** A storm night 40 years ago. The player is young Wan, already sprinting across stilt-house roofs. A single prompt appears: jump.
3. **0:30 — The best move first.** Wan leaps off a roof and glides on a wau through the rain. Gliding is the game's most joyful verb, so the player feels it before anything else.
4. **1:00 — Feel powerful.** Shadow wisps (Kelam already haunting the memory) attack. Wan has every combo; prompts appear once and fade. Four enemies fall in under a minute.
5. **2:00 — Chase.** A huge tiger silhouette flees through collapsing houses and rising water: run, slide, wall-run, scripted near-misses.
6. **3:00 — Standoff.** On a jetty in the rain, Wan faces the tiger and raises his tongkat. Cut to black. A child's voice: "Atuk?"
7. **3:15 — Wake up.** Bayu, 40 years later, in his room. Control returns instantly. Mak Som calls from the jetty.
8. **3:30 — First race.** Adi dares Bayu to race him to the jetty. A visible timer and Adi as a rival runner quietly teach the competitive loop.
9. **5:00 — Wow moment 1.** Tok Wan's hikayat glows on its stand; Kelip rises out of it in a spiral of light.
10. **6:00 — Learn the guide.** The player calls Kelip; a synchronized wave of fireflies flows toward the river.
11. **7:00 — Wow moment 2, then dread.** At dusk the berembang trees blaze with synchronized fireflies. Mid-display, they go dark row by row. Kelam's tendrils rise from the water.
12. **8:00 — First real fight.** Bayu is weaker than Wan: strike, langkah and tangkis, taught by doing. The gap between him and his grandfather is the motivation.
13. **9:30 — The stakes.** Adi is caught by Kelam and runs into the mangrove, half-changed. Chapter title: Bunyi Pertama.
14. **10:00 — First reward.** Autosave, first Cahaya, first achievement, and the journal opens with one line from Tok Wan's hand.

**Rules for this stretch:** no cutscene longer than 20 seconds, no text box the player must read to proceed, no failure state before minute 8, and a cap of one new button per minute.

## Traversal

Movement is the game's first source of fun, so every move chains into the next without stopping, and the moveset grows one verb per chapter.

| Move | Unlocked | What it does | Why it's fun |
| --- | --- | --- | --- |
| Run and sprint | Ch1 | Smooth acceleration, lean into turns | Speed builds with no button mashing |
| Jump | Ch1 | Variable height, coyote time, jump buffer | Forgiving: late or early presses still land |
| Mantle and ledge grab | Ch1 | Auto-climb waist-high edges, grab ledges | Never stuck on small obstacles |
| Wall-run | Ch1 | Run along walls of stilt houses and boats | Turns a village into a playground |
| Slide | Ch1 | Under fences and through gaps, keeps momentum | Rewards keeping speed |
| Rope swing | Ch2 | Swing on washing lines, fishing nets, vines | Arcs feel great and set up glides |
| Wau glide | Ch2 | Deploy a kite mid-air; steer, dive, pull up | The signature verb, shown in the prologue |
| Root run | Ch3 | Sprint along giant buttress roots and branches | Fast vertical forest routes |
| Bunian shortcut | Ch3 | Step through shimmering arches to a linked spot | Puzzle routes and trial shortcuts |
| Rooftop flow | Ch4 | Vault, roll and pole-swing across carved roofs | The densest parkour space in the game |
| Sampan | Ch4 | Row and drift through the harbour | Chase sequences and races |
| Tiger ride | Ch5 | Ride Tok Belang up the mountain | A one-time set piece, pure spectacle |
| Thermal glide | Ch5 | Rising air carries the wau upward | The finale feels like flying |

**Feel rules**

- Momentum carries between moves: wall-run into jump into glide must keep speed.
- Assist, don't punish: small mistimed jumps get a soft magnet to the nearest ledge (adjustable, stronger on touch).
- Falling into water or off a ledge respawns within 2 seconds at the last safe ground, with no death screen.
- Every region has at least one high landmark the player can see from the start and reach by the end.

## Silat combat

Combat rewards reading and answering an attack, not mashing: a perfect langkah or tangkis opens a kuncian that frees a Cursed villager in one cinematic move.

**Core verbs.** Silat learning is built from bunga (basic movement) and buah (movements combined into real techniques), with langkah for footwork and kuncian for joint locks ([UTM](https://people.utm.my/shahabuddin/?p=6782), [Boulder Silat](https://bouldersilat.com/bahasa-indonesia-for-silat/)). The combat system follows the same order.

| Verb | Input idea | What it does |
| --- | --- | --- |
| Strike | Light / heavy | Chains into combos; heavy breaks guards |
| Langkah | Dodge + direction | Footwork evade; a perfect langkah slows time for a moment |
| Tangkis | Parry | Deflects; a perfect tangkis staggers the attacker |
| Kuncian | Prompt after a stagger | A cinematic lock that frees a Cursed villager instantly |
| Semangat | Meter fills with perfect moves | Spend for a Kelip-powered finisher that hits every nearby enemy |
| Standoff | Hold, release on the tell | One-on-one duel opener: the right timing wins the first exchange |

**Buah (combos).** Eight named combos, two learned per chapter from Chapter 2, each from a page of Tok Wan's hikayat: Buah Air (flowing chain), Buah Akar (low sweeps), Buah Angin (aerial strikes after a glide), Buah Bayang (strikes from a perfect langkah), Buah Bulan (spinning tongkat crowd control), Buah Harimau (heavy pounce), Buah Kelip (light-burst finisher), Buah Wan (the final technique, learned in the duel with young Wan).

**Weapons.** Bare hands (fast, best for kuncian), tongkat (reach, crowd control, Tok Wan's own) and keris from Chapter 4 (fast, precise, a ceremonial heirloom Pak Leman returns; treated with respect, never comic).

**Enemies**

| Enemy | Behaviour | Teaches |
| --- | --- | --- |
| Shadow wisp | Swarms, weak, flies at you | Basic strikes and crowd awareness |
| Cursed brawler | Heavy telegraphed swings | Tangkis timing |
| Cursed hunter | Throws nets and spears from range | Closing distance, langkah |
| Kelam guard | Shielded, only kuncian breaks it | Stagger then lock |
| Possessed beast | Charges in straight lines | Using the environment and glide escapes |

Cursed villagers are never killed. A finished fight shows them turning back into people and fleeing or thanking Bayu.

**Bosses**

| Boss | Chapter | Phases | Signature idea |
| --- | --- | --- | --- |
| Cursed Adi | 1 | 2 | A friend who fights like he races: fast, sloppy, readable |
| Pak Mail | 2 | 3 | Fight in a flooding paddy; the buffalo herd becomes a hazard and a shield |
| Tok Belang | 3 | 3 | Opens with a standoff; in phase 3 Kelip blocks Bayu and the fight ends with no winner |
| Kelam colossus | 4 | 3 | Climb the harbour's cranes and glide onto its arms to strike its lanterns |
| Young Wan | 5 | 3 | A mirror duel using the prologue's moves; Bayu wins only with Buah Wan, Tok Wan's last lesson |

**Difficulty.** Cerita (story), Normal and Pendekar, plus assists: wider parry windows, slower game speed, auto-combo and skip encounter.

## Kelip guidance and exploration

There is no minimap and no waypoint arrow: the island itself points the way, and every curious detour pays off within 60 seconds.

**How players are led**

| Guide | Leads to | How it reads |
| --- | --- | --- |
| Kelip's call | The current objective | Nearby fireflies flash in a synchronized wave that travels toward the goal |
| Kingfisher | Hidden shrines with Cahaya | A bright blue bird darts ahead and waits on a perch |
| Mangrove crabs | Secret paths and shortcuts | Crabs scatter into a gap the player hadn't noticed |
| A floating lantern | Side stories | A warm lantern hangs over the person who needs help |
| Torn-paper scraps | Hikayat lore pages | Pages flutter in the wind near the next one |
| Landmarks | Region goals | Each region's Pelita glows on its highest point, visible from the start |

**What exploration gives**

- Cahaya orbs (skill points) for shrines and freed villagers.
- 40 lore scrolls: short folk tales told in one screen, each adding a firefly to the island at night, so the world visibly brightens as you collect.
- Cosmetic chests: outfits, wau designs, Kelip colours.
- Trial gates: Bunian arches that open the Ujian Bunian time trials.

**Accessibility.** Ghost of Tsushima's wind guidance was criticized for losing contrast against the terrain ([Can I Play That](https://caniplaythat.com/2020/07/29/ghost-of-tsushima-accessibility-review/)), so Kelip has a high-contrast mode, adjustable brightness, an optional subtle compass and a "show path" assist.

## Main missions

The story has 22 missions; each chapter's four missions follow teach, develop, twist, test, and each ends on a save point.

| # | Mission | Goal | Role | Length |
| --- | --- | --- | --- | --- |
| P | Malam Pemburuan | Chase the tiger through the flood as young Wan | Hook | 10 min |
| 1.1 | Lumba ke Jeti | Race Adi to the jetty | Teach movement | 4 min |
| 1.2 | Cahaya dari Hikayat | Kelip awakens; follow the fireflies; they vanish; first fight | Develop | 8 min |
| 1.3 | Jejak Adi | Track cursed Adi across night rooftops as the tide floods the boardwalks | Twist | 10 min |
| 1.4 | Pelita Air | Free Adi on the old jetty; climb the tallest berembang; relight the first Pelita | Test (boss) | 10 min |
| 2.1 | Pesta Wau | Join the kite festival, learn the wau glide, win the race | Teach glide | 8 min |
| 2.2 | Bendang Berbisik | Cross the paddies at night by rope swing; learn kuncian on Cursed hunters | Develop | 10 min |
| 2.3 | Bayang Belang | Chase Tok Belang, who seems to attack the scarecrows (he is chasing Kelam wisps) | Twist | 10 min |
| 2.4 | Pelita Bumi | Free Pak Mail in the flooding paddy; relight the terrace Pelita | Test (boss) | 12 min |
| 3.1 | Pintu Bunian | Enter the forbidden forest; pass Embun's first trial | Teach trials | 10 min |
| 3.2 | Hutan Berubah | Root-run and sneak through a forest that rearranges itself | Develop | 12 min |
| 3.3 | Ingatan Rimba | Walk a playable memory of the berembang grove before it was cut | Quiet beat | 8 min |
| 3.4 | Pelita Rimba | Duel Tok Belang; Kelip intervenes; the tiger relights the Pelita with a roar | Test (boss) | 15 min |
| 4.1 | Kota Kayu | Arrive by sampan; rooftop parkour across the carved town; receive the keris | Teach keris | 10 min |
| 4.2 | Rahsia Pak Leman | Hear the confession (Twist 1); defend the boatyard from Kelam | Twist | 10 min |
| 4.3 | Malam Pesta | Escape the swallowed festival in a sampan chase through the flooded harbour | Develop | 12 min |
| 4.4 | Pelita Pelabuhan | Climb the cranes, glide onto the colossus, relight the lighthouse Pelita | Test (boss) | 13 min |
| 5.1 | Tunggangan Belang | Ride Tok Belang up the collapsing mountain | Spectacle | 8 min |
| 5.2 | Angin Puncak | Glide on thermals above the clouds; find the final page (Twist 2) | Twist | 10 min |
| 5.3 | Wan | Duel young Wan; learn Buah Wan mid-fight | Final test | 12 min |
| 5.4 | Pilihan | Choose: keep the secret, or tell the hikayat | Choice | 5 min |
| E | Hikayat Baru | Replant the grove and tell the story by the river (Ending B only) | Epilogue | 10 min |

## Side stories and activities

Fifteen side stories add about 90 minutes, each under 8 minutes, each tied to a villager and to the main theme of remembering.

| Region | Side story | Hook | Reward |
| --- | --- | --- | --- |
| Kampung Berembang | Sampan Nenek | Help an old woman find the boat her late husband carved | Sampan cosmetic |
| Kampung Berembang | Jala Hilang | Recover fishing nets from a Cursed-infested reef at low tide | Cahaya |
| Kampung Berembang | Surat Adi | Deliver Adi's embarrassing apology letter without reading it (you can read it) | Achievement, laugh |
| Sawah Emas | Kerbau Degil | Herd three runaway buffalo before the storm | Buah Akar page |
| Sawah Emas | Wau Ayah | Rebuild a child's broken wau from parts across the fields | Wau design |
| Sawah Emas | Orang-orang Sawah | Fix scarecrows the Cursed knocked down; each hides a lore scroll | Lore scrolls |
| Hutan Larangan | Lagu Bunian | Follow a Bunian melody through the trees by sound alone | Kelip colour |
| Hutan Larangan | Anak Harimau | Guide a lost tiger cub back to Tok Belang's den (after Ch3) | Cosmetic, story |
| Hutan Larangan | Cermin Embun | Answer three riddles from Embun about Bayu's own memories | Skill point |
| Kota Kayu | Tukang Ukir | Find carving tools so a woodcarver can finish a palace panel | Outfit |
| Kota Kayu | Gambus Terakhir | Collect strings for a street musician's gambus; he plays at the festival | Music track |
| Kota Kayu | Rekod Pelabuhan | Sneak into the harbour office for the 40-year-old construction records | Lore, foreshadows Twist 1 |
| Puncak Seri | Pendaki Hilang | Find a climber stranded in the clouds | Cahaya |
| Any (night) | Pesta Kelip | Release fireflies at shrines; the island brightens permanently | Achievement |
| Any | Hikayat Atuk | Find all 40 lore scrolls | Secret final scene with Tok Wan |

**Activities (repeatable, no story)**

- Sampan racing against Adi's ghost in three harbours.
- Wau gliding rings above Sawah Emas.
- Fishing with a simple rhythm mini-game at the jetty (a rest beat between fights).
- Photo mode spots: 10 marked viewpoints with a postcard achievement for each.

## Competitive modes

Competition is what keeps people playing after the credits: every mode is short (under 3 minutes a run), restarts instantly and always shows a ghost just ahead of you.

| Mode | Unlocks | Format | Why it hooks |
| --- | --- | --- | --- |
| Ujian Bunian | Chapter 3 (first race in Chapter 1) | 15 handcrafted time trials, 3 per region: parkour, glide, sampan, combat gauntlet | Medals: Gangsa, Perak, Emas, Bunian (the last beats the developer's own time) |
| Ujian Harian | After Chapter 1 | One seeded route or rule-twist a day; unlimited practice, one official run | Everyone plays the same course; a fixed loadout so new players compete fairly |
| Gelanggang | After Chapter 2 | Arena survival waves scored on style: perfect parries, combo variety, no damage | Skill expression for players who love the combat more than the running |
| Musim (seasons) | After Chapter 1 | Monthly ranking from daily and arena placements | Tiers: Anak Murid, Pesilat, Pendekar, Guru, Mahaguru; season cosmetics |

**The "one more try" loop**

1. Finish a run: see your time, medal and rank change in one screen.
2. A ghost appears: the player ranked just above you, not the world record, so the next target always feels reachable.
3. Restart in under 1 second with one button.
4. Share: a results card with the course, time and a QR code to the exact trial (good for TikTok and WhatsApp).

**Friends and rivals.** Add friends with a short code; a friends board shows only them. Adi's ghost appears in early trials as a friendly rival for players with no friends added yet.

**Fair play.** Browser leaderboards that trust the client get cheated: one player topped a board with a negative time by calling the submit function from the console ([itch.io](https://albertkemp.itch.io/ocean/comments)). So every run is validated on the server: a signed start token, checkpoint order and timings, speed limits, plausible ghost data and rate limits. Suspicious runs are hidden until reviewed.

## Progression and rewards

The player earns something visible every 5 minutes: Cahaya for skills, cosmetics for style, pages for story, and nothing is ever sold.

**Skill tree.** Three branches of five skills each, bought with Cahaya from shrines, freed villagers and side stories. Story abilities (glide, keris, ride) are never in the tree; the tree only makes them better.

| Branch | Skills, in order |
| --- | --- |
| Langkah (movement) | Longer wall-run · Air dash after a glide · Faster mantle · Sprint never tires · Double glide boost |
| Buah (combat) | Wider perfect-parry window · Kuncian heals a little · Heavy strike breaks shields · Semangat fills faster · Two finishers per meter |
| Kelip (light) | Kelip reveals secrets nearby · Fireflies stun shadow wisps · Brighter night vision · Kelip blocks one hit per fight · Kelip marks enemy tells earlier |

**Cosmetics.** Baju and sampin sets with original patterns, headscarves, wau designs, Kelip colours, glide trails and tongkat wraps. Sources: story milestones, side stories, trial medals and season tiers. Cosmetics never change stats, so competitive runs stay fair.

**Achievements.** 30 achievements in three kinds: story (finish each chapter, both endings), mastery (every Bunian medal, a no-damage boss) and wonder (find every viewpoint, release 100 fireflies, pet Tok Belang's cub).

**No monetization in v1.** Free, no ads, no purchases, so nothing pushes players away early.

## Mobile landscape design

On a phone the game plays with two thumbs and generous assists, and every system is tuned so a mid-range Android phone holds 30 FPS for a full 10-minute mission.

**Touch layout**

| Zone | Control | Notes |
| --- | --- | --- |
| Left half | Floating joystick | Appears wherever the thumb lands; pushing far = sprint |
| Right half, empty area | Drag to orbit camera | Camera also auto-follows behind Bayu when idle |
| Bottom right, largest | Jump / glide | Hold in the air to open the wau |
| Around jump | Strike, langkah, tangkis | Three buttons in an arc under the right thumb |
| Above jump | Context button | Changes icon: kuncian, interact, rope, Bunian arch |
| Top left | Kelip call | The firefly icon; also shows the Semangat meter |
| Top right | Pause | Opens map, journal and settings |

**Phone touch layout in landscape (default positions). Two thumbs: movement on the left, every action under the right thumb.**

| Screen area | Control | Behaviour |
|---|---|---|
| Top-left corner | Kelip call + Semangat meter | Tap to call the kelip guide; ring shows Semangat |
| Top-right corner | Pause | Opens pause menu |
| Left half (anywhere) | Floating joystick | Appears where the left thumb lands; movement |
| Right half, empty space | Camera | Drag to orbit the camera |
| Bottom-right, largest button | Jump | Tap to jump; hold to glide (wau) |
| Left of Jump, lower | Strike | Attack |
| Above Strike | Langkah | Step / dodge |
| Above Jump, left | Tangkis | Parry / block |
| Above Jump, right | Context | Interact / climb / talk (changes with situation) |

Jump sits under the resting right thumb because it is the most-used button; the combat buttons fan around it so the thumb never travels far.

Buttons are large, their size, opacity and position are adjustable, and a gamepad connected to the phone switches to controller prompts automatically.

**Touch assists (on by default, each switchable)**

- Auto lock-on to the nearest threat in combat.
- Wider perfect-parry and perfect-dodge windows.
- Stronger ledge magnet and automatic mantle.
- Optional auto-sprint and auto-camera.

**Orientation.** The game is landscape only. Some phone browsers, notably Safari on iPhone, don't let a page force landscape, so portrait shows a "rotate your phone" screen. Players are invited once to add the game to the home screen for true fullscreen.

**Performance on phones**

- Newer phones can run WebGPU (Safari on iOS 26, including the iPhone 14; Chrome on Android 12+ with Qualcomm or ARM GPUs), but Android support is still uneven as of mid-2026 ([BuildMVPFast](https://www.buildmvpfast.com/blog/threejs-webgl-to-webgpu-renderer-migration-2026)), so the Low preset must look good without it.
- Dynamic resolution keeps frame time steady as the phone heats up; an optional 30 FPS cap and a battery-saver mode.
- Regions stream in and out to stay within mobile browser memory limits.
- First play loads only the prologue (target under 10 MB), the rest downloads while playing.

**Real-device testing.** The primary test phone is an iPhone 14 in Safari. Most players will be on Android, so every phase is also checked on at least one mid-range Android phone (borrowed, or through a cloud device-testing service), never only in desktop emulation.

## Art and audio direction

The look is stylized and painterly rather than realistic, so it stays beautiful on a phone, and each region owns one colour story and one musical voice.

**Grounded in the real world.** Kuala Selangor's synchronized fireflies gather on berembang mangrove trees along the river ([Visit Selangor](https://www.visitselangor.com/kuala-selangor-fireflies/)), which is why the story ties the fireflies' fate to the cut grove. Village houses are built on stilts with a rumah ibu at the centre ([Wikipedia](https://en.wikipedia.org/wiki/Malay_house)); Kota Kayu's roofs use rumah limas details such as tunjuk langit, tebar layar and sisir angin windows ([The Malaysian Insight](https://www.themalaysianinsight.com/g/370170)).

| Region | Palette | Light | Landmarks | Music | Ambience |
| --- | --- | --- | --- | --- | --- |
| Kampung Berembang | Indigo water, warm lamp orange | Dusk into night | Stilt houses, long jetty, the tallest berembang | Solo gambus, soft rebana | Night insects, lapping water, distant radio |
| Sawah Emas | Gold, green, sky blue | Golden hour | Terraces, giant scarecrows, kites overhead | Light gamelan Melayu, flute | Wind through rice, buffalo bells, children |
| Hutan Larangan | Emerald, teal, bioluminescent cyan | Misty green daylight, glowing night | Giant buttress roots, Bunian arches | Sparse, airy, Bunian voices (wordless) | Birds, dripping leaves, sudden silence |
| Kota Kayu | Deep red, gold, lantern amber | Night festival | Carved palace, harbour cranes, lighthouse | Full ensemble, festival drums | Crowds, market calls, creaking boats |
| Puncak Seri | Silver, violet, starlight | Above the clouds at dawn | Cloud sea, the last Pelita | All themes return, then a single gambus | Wind, then near-silence |

**Kelam's look.** Ink-like tendrils with no gore or horror imagery; colour drains from whatever it touches, so it reads instantly even on a small screen.

**Music system.** Layered tracks crossfade between explore, danger, combat and story. The main theme is a simple melody Tok Wan hums in the prologue; it returns in every region in that region's instruments, and in full in Ending B.

## Scope, priorities and what to cut

Build a vertical slice first: the prologue and Chapter 1 must be fun on a real phone before anything else is built, because if those 45 minutes aren't fun, nothing after them matters.

| Priority | What | Gate to move on |
| --- | --- | --- |
| P0: Vertical slice | Prologue, Chapter 1, core movement and combat, Kelip guidance, one trial, touch controls, save system | Five people who have never seen it play the first 10 minutes on phones without help and want to continue |
| P1: Full story | Chapters 2–5, all bosses, both endings, epilogue | Full playthrough with no soft-locks, in Malay and English |
| P2: Competitive | Ujian Bunian, Ujian Harian, server-validated leaderboards, ghosts | Tampered and replayed submissions rejected in testing |
| P3: Depth | Side stories, Gelanggang, seasons, skill tree, cosmetics, achievements | Each addition passes the "still fun" playtest |
| P4: Polish | Photo mode, trailer camera, extra activities | Nothing in P0–P3 still has known bugs |

**Cut first, in this order, if time runs short:** extra activities, seasons, Gelanggang, half the side stories, the sampan chase (replace with a rooftop chase). Never cut: the prologue, the two twists, the final duel, both endings, the first 10 minutes.

**Non-negotiables.** No depiction of religious figures, texts, prayers or rituals as mechanics; no real royalty or historical figures as characters; no gore; villagers are never mocked. Malaysia's regulator has acted against a game it judged religiously insensitive under the Communications and Multimedia Act 1998 ([FMT](https://www.freemalaysiatoday.com/category/nation/2017/09/07/mcmc-wants-download-of-fights-of-gods-disabled)).

**Biggest risks**

- Character models and animation look amateur. Mitigation: start from licensed rigged bases and animation sets, customise in Blender.
- Touch combat feels clumsy. Mitigation: assists on by default, playtest on phones from the first week.
- Scope creep. Mitigation: the priority gates above; nothing in P3 starts before P1 passes.
