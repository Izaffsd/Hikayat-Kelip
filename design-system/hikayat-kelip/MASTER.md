# Design System — Hikayat Kelip (MASTER)

Global source of truth for every screen, HUD element and touch control. Page files in `pages/` override it.
Built with the ui-ux-pro-max workflow (2026-10-16). The generator's two `--design-system` runs did not fit (esports
neon / landing-page patterns), so this master is composed from the verified partial matches below plus the GDD's
art direction. Adopted and rejected recommendations are logged in `docs/DECISIONS.md` (D-018).

| Source | Used |
| --- | --- |
| `--domain color` "dark night warm gold" → *time amber + night indigo on dark* | Palette concept (lamp amber on night indigo) |
| `--domain typography` "elegant storybook fantasy serif" → *Luxury Serif (Cormorant + Montserrat)* | Cormorant Garamond for display; body swapped to Source Sans 3 for small-size legibility |
| `--stack threejs` | Single renderer per page, particle ceilings, unlit materials where lighting is not needed, colour management |
| `--domain ux` touch target size | 44 pt (iOS) / 48 dp (Android) minimum, ≥ 8 px gaps |
| `references/pro-rules.md` | Pre-delivery checklist (§9) for every screen |
| GDD "Art and audio direction" | Kampung palette (indigo water, warm lamp orange), fireflies, Kelam colour drain |

## 1. Concept

**Lamplight over a dark river; a hand-written hikayat.** Interfaces are calm, dark ink surfaces lit by warm lamp
amber, with firefly yellow-green reserved for guidance and Kelip. Type pairs a manuscript-like serif for titles with
a clear humanist sans for everything that must be read fast. The HUD stays out of the way; menus feel like opening
the book. Single dark theme by design; a **high-contrast mode** replaces a light theme for accessibility.

## 2. Colour tokens

| Token | Hex | Role |
| --- | --- | --- |
| `--hk-ink-950` | `#070A14` | Deepest night; scrims; text on amber |
| `--hk-ink-900` | `#0B1020` | App background |
| `--hk-ink-800` | `#121A30` | Panels |
| `--hk-ink-700` | `#1B2542` | Raised panels, hover/focus fill |
| `--hk-ink-600` | `#2A3557` | Strong borders, slider tracks |
| `--hk-river-500` | `#2E4A8A` | Indigo water: secondary surfaces, selected tab underlay |
| `--hk-lamp-500` | `#E8952F` | Primary (lamp amber): primary buttons, active states |
| `--hk-lamp-400` | `#F2B45A` | Primary hover/highlight |
| `--hk-lamp-300` | `#F8D08C` | Focus ring, fine lines |
| `--hk-kelip-400` | `#D8F06A` | Firefly accent: guidance, Kelip, success, Semangat |
| `--hk-kelip-300` | `#E9F7A6` | Firefly highlight |
| `--hk-parchment-50` | `#F6EEDF` | Primary text |
| `--hk-parchment-200` | `#D9CDB6` | Secondary text |
| `--hk-mist-400` | `#A3ADC4` | Muted text, hints |
| `--hk-kelam-700` | `#2A1F3D` | Kelam surfaces (danger zones, cursed UI tint) |
| `--hk-kelam-400` | `#8C7BD6` | Kelam edge, danger accents (non-text) |
| `--hk-danger-500` | `#E0533D` | Low health, destructive actions |

Semantic aliases (components use only these): `--color-bg`, `--color-surface`, `--color-surface-raised`,
`--color-border`, `--color-text`, `--color-text-secondary`, `--color-text-muted`, `--color-primary`,
`--color-on-primary`, `--color-accent`, `--color-danger`, `--color-focus`, `--color-scrim`.

Measured contrast (WCAG): parchment-50 on ink-900 ≈ 16:1; mist-400 on ink-800 ≈ 7.5:1; lamp-500 on ink-900 ≈ 7.8:1;
ink-950 text on lamp-500 ≈ 8.3:1; danger-500 on ink-900 ≈ 4.9:1; kelam-400 on ink-900 ≈ 5.3:1 (non-text / large only).
High-contrast mode: text `#FFFFFF`, surfaces `#000000` at 92 %, borders `#F8D08C`, guidance `#F5FF7A`.

## 3. Typography (OFL, self-hosted WOFF2, Latin subset with full Malay coverage)

| Role | Family | Weight | Size (landscape phone → desktop) |
| --- | --- | --- | --- |
| Title / chapter card | Cormorant Garamond | 600 | `clamp(40px, 11vh, 96px)` |
| Heading 1 / 2 / 3 | Cormorant Garamond | 600 | 32 / 26 / 22 px (`clamp` with vh) |
| UI label, button | Source Sans 3 | 600 | 16–18 px |
| Body | Source Sans 3 | 400 | 16 px, line-height 1.5 |
| Subtitles | Source Sans 3 | 500 | 18–22 px on a 70 % ink plate, max 2 lines, 42 ch |
| Caption (never for essential info) | Source Sans 3 | 400 | 13–14 px |

Rules: base 16 px; no essential text under 14 px; letter-spacing +0.02em on uppercase labels only; numbers in timers
use `font-variant-numeric: tabular-nums`; respect the user's text-size setting (UI scale 90–130 %).

## 4. Space, shape, elevation

- Spacing scale (4/8 rhythm): 4, 8, 12, 16, 24, 32, 48, 64 px → `--space-1` … `--space-8`.
- Radii: 4 (chips), 8 (controls), 14 (panels), 999 (round buttons).
- Panels: `--color-surface` at 92 % opacity, 1 px border lamp-500 at 35 %, original motif corners (SVG). No
  backdrop blur during gameplay; pause menu may blur the frozen frame once.
- Gutters: `max(16px, env(safe-area-inset-left/right)) + 2vw`; landscape layouts use two columns (menu | detail).

## 5. Motion

| Token | Value | Use |
| --- | --- | --- |
| `--dur-press` | 90 ms | Press feedback (scale 0.94 + brighten; transform only, no layout shift) |
| `--dur-fast` | 150 ms | Hover, focus, toggles |
| `--dur-base` | 240 ms | Panels and list entries in |
| `--dur-scene` | 600 ms | Screen fades, chapter cards |
| `--ease-out` | `cubic-bezier(0.22, 1, 0.36, 1)` | Entering |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | Exiting (exit = 0.75 × enter duration) |

Reduced motion (OS setting or in-game): only opacity fades ≤ 120 ms; no parallax, shake, FOV kicks or bouncing.
No animation library; CSS transitions and the game loop are enough.

## 6. Iconography and motifs

- Original SVG icon set on a 24 px grid, 2 px stroke, round caps/joins, outline style for menus; touch action buttons
  use a filled circular plate with an outline glyph (one style per hierarchy level). Sizes: `--icon-sm` 16,
  `--icon-md` 24, `--icon-lg` 32. No emoji. No brand glyphs for controllers (position-based face-button diagrams).
- Motifs are original: firefly dot trails, a three-leaf vine scroll for panel corners, a fine double rule for
  dividers. They take the *principles* of Malay carving and weaving (rhythm, symmetry, flowing growth), never a copied
  pattern, and contain no calligraphy or religious symbols.

## 7. Components (inventory)

Button (primary amber, secondary outline, ghost), MenuList (rows ≥ 48 px), Toggle, Slider (48 px hit area, arrow
keys/D-pad step), Stepper/Select (left/right for gamepad), Tabs (pause: Peta/Map, Jurnal/Journal, Tetapan/Settings),
Panel, Dialog/confirm, Toast (achievements, Cahaya), Prompt chip (device-aware), Subtitle plate, Dialogue line,
Objective line, Timer/ghost delta (trials), Results card, Progress line (firefly dots), Rotate screen, Add-to-Home
invite, Touch controls, Debug overlay (developer tool, exempt from the visual rules but still legible).

## 8. Touch controls (GDD layout)

| Control | Size | Notes |
| --- | --- | --- |
| Jump / glide (bottom-right, largest) | 84 px | Hold in air opens the wau |
| Strike, Langkah, Tangkis (arc around Jump) | 64 px | ≥ 12 px gaps |
| Context (above Jump, right) | 60 px | Icon changes: kuncian, interact, rope, Bunian arch |
| Kelip call + Semangat ring (top-left) | 56 px | |
| Pause (top-right) | 48 px | |
| Joystick (left half, floating) | 120 px base, 52 px knob | Appears where the thumb lands; far push = sprint |

Default idle opacity 0.55, pressed 0.9; size 80–130 %, opacity 30–100 %, positions draggable in Settings; all inside
safe areas (landscape notch on the left or right).

## 9. Pre-delivery checklist (from `references/pro-rules.md`, adapted)

Run for every screen before it ships; record the result in the phase report.

- [ ] Touch targets ≥ 44 pt / 48 dp with ≥ 8 px gaps; nothing under safe areas (test 844×390 and 667×375 landscape).
- [ ] Pressed feedback within 80–150 ms using transform/opacity only (no layout shift).
- [ ] Every control reachable and operable with keyboard, gamepad and touch; visible focus ring; logical focus order.
- [ ] Text contrast ≥ 4.5:1 (normal) / 3:1 (large, non-text) in the default and high-contrast modes.
- [ ] Colour is never the only indicator (telegraphs also use shape and sound; states use icons/labels).
- [ ] Reduced motion honoured; UI scale 130 % does not break layouts.
- [ ] Icons from the one set, consistent stroke and size tokens; no emoji; decorative icons `aria-hidden`.
- [ ] Semantic tokens only (no raw hex in components).
- [ ] BM and EN strings both fit (BM runs ~20 % longer).
- [ ] Drag-only interactions (touch layout editor, camera) have button alternatives.
