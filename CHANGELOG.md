# Changelog

Notable changes to the builder itself. (Your add-on's own history lives in the
project repo's `CHANGELOG.md`, written on every Save and Export.)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

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

## Earlier

This file starts here; everything before it — the project model and generation
pass, the content kinds, the wizard and code editors, the 3D preview, the
station-based recipe builder, the pixel editor, GitHub-backed saves and
`.mcaddon` export — is in the git log.
