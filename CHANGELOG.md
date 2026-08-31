# Changelog

Notable changes to the builder itself. (Your add-on's own history lives in the
project repo's `CHANGELOG.md`, written on every Save and Export.)

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## Unreleased

### Added

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

## 0.1.0

Initial build: the project model and generation pass, block / crop / item /
entity / recipe kinds, the wizard and code editors, the 3D preview, texture
drop zones with R2 storage, GitHub-backed save slots and preset inbox, and
`.mcaddon` export.
