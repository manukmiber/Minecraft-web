# Changelog

Notable changes to the builder itself. (Your add-on's own history lives in the
project repo's `CHANGELOG.md`, written on every Save and Export.)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

- **A workspace companion.** Drop an MMD model into the new **Companion** panel
  and a character stands in the corner of the workspace, reacting to what you
  build.
  - **A PMX reader written from scratch** (`src/core/companion/pmx.ts`), because
    three.js removed `MMDLoader` in r167 and there is no addon left to lean on.
    PMX 2.0 and 2.1, both text encodings, every index width, and every weight
    scheme (BDEF1/2/4, SDEF, QDEF) flattened onto four influences. Unit tested
    against files the tests build byte by byte, since a real model cannot be
    committed.
  - **Rendered the way MMD renders it.** The model's own toon ramps are rebuilt
    as three.js gradient maps in full colour rather than the red channel three
    reads by default; `.spa` and `.sph` sphere maps are injected after lighting;
    and the inverted-hull outline is expanded in clip space, so the line weight
    does not change with the size of the dock. Whether a material is opaque, cut
    out or translucent is decided by measuring its texture's alpha, not by
    guessing from the file name.
  - **Procedural motion, no motion files.** A standing pose measured from the
    model's own bind pose, breathing, weight shift, blinking, a head that
    follows the pointer, vowel morphs while she talks, expressions composed from
    whatever morphs the model has (matched in Japanese first), and hair and
    skirt on spring bones worked out from the model's physics bodies. Gestures
    fire from what the workspace just did.
  - **She comments on the app, not instead of it.** Every line is about
    something already reported by a toast or the Problems panel, so muting her
    loses nothing. Three chatter levels; **Reduced motion** stills her; hiding
    her unmounts the canvas and takes the GPU cost to zero.
  - **The model never leaves the browser.** It is kept in IndexedDB and is never
    pushed to R2, committed to the project repo or written into an export, and
    `.gitignore` now refuses `.pmx`, `.pmd`, `.vmd` and `.vpd`. MMD models are
    overwhelmingly distributed under terms that forbid redistribution, and a
    copy in a repo or a bucket would be exactly that. See
    [`docs/COMPANION.md`](docs/COMPANION.md).

- **Vanilla artwork, from Faithful 32x.** Every `minecraft:` identifier the app
  offers is drawn with its real texture instead of a monogram or a hashed
  colour — in the item browser, in recipe slots, on the structure painter's
  grid and brushes, and on the cubes in the 3D structure preview.
  - Faces are per-side where the block has them, so a log reads as a log and a
    crafting table shows its front; textures with holes in them (glass, leaves,
    a torch) are cut out rather than drawn black.
  - Biome-tinted masks — grass, leaves, vines, lily pads — have the plains
    colours baked in, since the item browser has no biome to tint against.
  - `node scripts/extract-faithful.mjs <pack.zip>` pulls only the identifiers
    the catalogue names out of the pack and regenerates
    `src/core/data/vanillaTextures.ts`. Re-run it when the catalogue grows.
  - Chests and shields keep the monogram tile: the game draws them from an
    entity atlas, so the pack has no square face to use.
  - Textures by the [Faithful Resource Pack](https://faithfulpack.net/) team,
    used under the Faithful License (`public/textures/vanilla/LICENSE.txt`).
    They are a preview only — nothing vanilla is written into an exported pack.

- **Biome builder.** A new `biome` content kind, so a themed patch of world is
  built from a form like everything else — left column the settings, right
  column a live preview of the ambience, the plants and the crow population.
  - **Colours and climate.** Grass, foliage, water and fog colours, plus
    temperature and downfall on the ranges Bedrock actually accepts. The preview
    mixes them the way the game does, so the panel is the check.
  - **Plants that grow wild.** Tick any crop in the project and give it a
    weight, a growth stage to generate at, the ground it accepts and an optional
    "needs water beside it" constraint. Ground defaults to whatever the crop is
    already plantable on, so the rule is inherited rather than restated.
  - **Scoped scattering.** Each biome emits its own feature chain — one
    `single_block_feature` per plant, a `weighted_random_feature` when there is
    more than one, a `scatter_feature`, and a `feature_rules` filtered by biome
    tag. Plants assigned to one biome cannot leak into another.
  - **Nested biomes.** A biome can instead scatter its plants through an
    existing vanilla biome (`plains`, `swamp`, …) without generating a new
    region of world.
  - **Crow link.** A biome can be tagged as farmland; the preview estimates
    crows per chunk from the planting density, takes a manual override, and
    copies the result onto the crow entity's own spawn rules on request. The
    scarecrow radius is referenced from the entity that defines it, never
    duplicated here.

- Biome tags from the project are now offered wherever a biome tag is asked
  for — entity spawn rules pick from a list instead of a free-text box.
- A **Rice paddy biome** preset in the farming batch, wiring the existing rice
  crop and crow to a warm, wet, water's-edge biome.

### Changed

- `format_version` entries for biomes, features, feature rules, client biomes
  and fog definitions are declared in the target profiles alongside every other
  version, so a future Bedrock release stays a profile change.
- Deleting a crop now also removes it from any biome that scattered it, the same
  way it already cleared single references.

### Accessibility and interface pass

A sweep of the whole workspace against a UI/UX review checklist. Nothing moved
that did not have a reason to.

- **Contrast.** Every text token now clears 4.5:1 on every surface in the scale;
  the old `ink-300` sat at 4.2:1 and `ink-400` — used for placeholders, metadata
  and the pack version — at 2.6:1. `ink-400` and `ink-500` are non-text tokens
  now, and a new `--color-edge` gives interactive control boundaries the 3:1 they
  need, separate from the hairline used for decorative panel edges.
- **Type scale.** 12px is the floor: the 9/10/11px labels are gone and the base
  size is 14px. Rows, toolbars and the status bar grew to match, and the empty
  state's title is no longer the same size as its own body copy.
- **Reduced motion.** `MotionConfig reducedMotion="user"` plus a CSS
  `prefers-reduced-motion` block, so every animation in the app follows the OS
  setting. Motion durations are tokens picked by distance travelled rather than
  one value copied everywhere.
- **Keyboard.** A skip link, a `<main>` landmark, and a focus indicator on
  everything by default. Both splitters are `role="separator"` and resize with
  the arrow keys, so dragging is no longer the only way. Both modals trap Tab,
  close on Escape, and hand focus back to whatever opened them.
- **Screen readers.** Toasts announce through a live region that is mounted up
  front, with errors as assertive; the busy indicator announces; icons beside
  text are hidden from the accessibility tree; icon-only controls carry names;
  and form errors are wired to their field with `aria-describedby` and
  `role="alert"`.
- **Colour is never the only signal.** The unsaved dot says "Unsaved", the
  status bar spells out "1 warning", the command palette's selected row gets an
  accent bar as well as a tint, and toast severity is spoken.
- **Hit areas.** Controls grow to at least 44px under a finger through a centred
  overlay that leaves the visual bounds — and so the layout — untouched. Presses
  change colour rather than scale, so nothing jitters.
- **Small screens.** Below 768px the sidebar floats over the editor beside the
  rail rather than crushing it, with a tap-anywhere scrim; below 1024px the
  preview does the same. The status bar sheds its secondary readouts instead of
  wrapping. Safe-area insets are respected and pinch zoom is not disabled.

### Fixed

- An editor tab's close button never appeared on hover: `group` was on the tab
  button while the close button was its sibling, so `group-hover` could not
  match. It now reveals on hover *and* on keyboard focus — previously it could
  be focused while invisible.
- Problems that lead nowhere rendered as disabled buttons, which look pressable
  and do nothing; they are plain text now.
- Both splitters listened for mouse events only, so neither worked under a
  finger.

## Earlier

This file starts here; everything before it — the project model and generation
pass, the content kinds, the wizard and code editors, the 3D preview, the
station-based recipe builder, the pixel editor, GitHub-backed saves and
`.mcaddon` export — is in the git log.
