# AI assist: generating presets for mmmmmmmmmmmmm

Hand this file to Claude Code (or Qwen Code, or anything else) when you want it
to build something the wizard does not cover yet. Everything it produces should
land in `preset/` in the **project repo**, and it will show up in the app's
Preset Inbox ready to apply.

The contract is deliberately small: a preset is one JSON file describing content
in terms of the builder's own fields, and the builder turns that into a valid
behaviour + resource pack. A preset never contains raw pack JSON unless it has
to — see [Escape hatch](#escape-hatch-shipping-raw-files) at the end.

---

## Where files go

```
<project repo>/
├── preset/                     ← write new presets HERE
│   ├── my-thing.preset.json
│   └── applied/                ← the app moves them here once applied
├── saves/<slot>/project.json   ← the live model; read it, do not edit it
├── saves/<slot>/assets/*.png
├── exports/
└── CHANGELOG.md
```

Read `saves/<slot>/project.json` to see what already exists — its `namespace`,
its `nodes`, and which names are taken. Do **not** edit that file directly: the
app owns it, and a hand-edit is lost the next time it saves.

---

## Preset file format

```jsonc
{
  "presetFormat": 1,
  "id": "farming.rice",            // stable, unique; re-applying replaces its nodes
  "label": "Rice paddy",           // shown in the inbox
  "description": "One sentence about what this adds.",
  "author": "claude-code",
  "notes": [
    "Anything the user should know before applying."
  ],
  "nodes": [ /* see below */ ],
  "files": [ /* optional escape hatch, see the end */ ]
}
```

### Nodes

```jsonc
{
  "kind": "entity",              // block, crop, item, entity, recipe or biome
  "name": "crow",                // identifier name part — ^[a-z][a-z0-9_]*$
  "displayName": "Crow",         // human name; goes into the .lang file
  "notes": "Optional note shown in the inspector",
  "data": { /* field values for that kind */ }
}
```

Rules that matter:

- **`name` must be lowercase** letters, digits and underscores, starting with a
  letter. Anything else is rejected at validation time.
- **Never write a namespace.** The project owns it, and the builder prefixes
  every identifier. `"name": "crow"` becomes `mmm:crow`, `sawah:crow`, or
  whatever the project uses.
- **Omit fields you do not care about.** Every key falls back to the kind's
  default, so a preset should state only what is interesting about it.
- A node whose `kind` + `name` already exist is **replaced**, not duplicated.
  That makes re-applying an updated preset safe.

### References between nodes

A preset cannot know the ids a project will hand out, so references are written
as `#kind:name` and resolved when the preset is applied:

```jsonc
"eatTarget": "#crop:rice_plant",           // resolves to that node's internal id
"result":    "#item:fried_egg",            // resolves to "<namespace>:fried_egg"
"grid":      ["", "", "", "", "minecraft:egg", "#item:cooking_oil", "", "#block:frying_pan", ""],
"spawnAboveBlocks": ["#crop:rice_plant"]
```

Vanilla identifiers are written out in full (`minecraft:egg`). Only references
to content in the same project use the `#` form. If a reference cannot be
resolved the app reports it instead of applying it silently.

### Textures

Leave textures alone unless you are shipping artwork that already exists. Slots
stay empty and the user drops PNGs in afterwards; the builder then writes the
atlas entries and file paths. **Do not invent image paths** — a `url` that does
not resolve is a texture that silently fails to load.

A preset *may* carry artwork, through an optional `assets` array:

```jsonc
"assets": [
  {
    "node": "entity:kohane",     // kind:name, of a node this preset creates
    "slot": "main",              // a texture slot that node declares
    "fileName": "kohane.png",
    "url": "textures/characters/kohane/kohane.png",
    "width": 512,
    "height": 512
  }
]
```

Use it only for images the app already ships under `public/textures/` — the
validator rejects anything that is not a path under `textures/` — or inline the
bytes as `base64` instead of `url` for something small and self-contained.

---

## The kinds and their fields

Field defaults are in `src/core/kinds/*.ts` in the app repo; this is the working
summary.

### `block`

| Field | Type | Notes |
|---|---|---|
| `category` | `construction` \| `nature` \| `equipment` \| `items` \| `none` | creative tab |
| `creativeGroup` | string | e.g. `minecraft:itemGroup.name.stone` |
| `renderMethod` | `opaque` \| `alpha_test` \| `blend` \| `double_sided` | use `alpha_test` for anything with transparent pixels |
| `ambientOcclusion` | number 0–10 | float on 1.26+, not a boolean |
| `faceDimming` | boolean | |
| `geometry` | `minecraft:geometry.full_block` \| `minecraft:geometry.cross` \| `custom` | |
| `customGeometry` | string | used when `geometry` is `custom` |
| `mapColor` | `#rrggbb` | |
| `destroyTime`, `explosionResistance`, `friction` | number | |
| `lightEmission`, `lightDampening` | number 0–15 | |
| `solid` | boolean | off removes collision and selection boxes |
| `flammable`, `lootSelf` | boolean | |
| `tags` | string[] | written into `minecraft:tags` |
| `isCraftingStation` | boolean | gives the block its own crafting screen |
| `craftingTag` | string | recipes carry this to reach the station. `^[a-z][a-z0-9_]*$`, max 64 chars |
| `craftingExtraTags` | string[] | extra tags the station answers to; 64 tags total |
| `craftingScreenTitle` | string | window title; defaults to the display name |
| `craftingGridRows`, `craftingGridCols` | 1–3 | see the note under `recipe` |

Texture slots: `main` (all faces), `up`, `down`.

### `crop`

| Field | Type | Notes |
|---|---|---|
| `stages` | number 2–8 | one texture slot per stage |
| `growthMode` | `script` \| `manual` | `script` adds a custom component; see [Growth](#a-note-on-crop-growth) |
| `growthChance` | number 0.05–1 | chance per random tick |
| `plantOn` | block identifier | defaults to `minecraft:farmland` |
| `generateSeed` | boolean | creates the seed item and wires it to plant this crop |
| `seedName`, `seedDisplayName` | string | |
| `produce` | `#item:...` | dropped when ripe |
| `produceMin`, `produceMax`, `seedDropMax` | number | |
| `tags` | string[] | `minecraft:crop` is always included |

Texture slots: `stage0` … `stageN-1`, plus `seed`.

### `item`

| Field | Type | Notes |
|---|---|---|
| `category`, `creativeGroup` | | as for blocks |
| `maxStackSize` | number 1–64 | |
| `isFood` | boolean | unlocks `nutrition`, `saturation`, `canAlwaysEat`, `useDuration`, `usingConvertsTo` |
| `isFuel`, `fuelDuration` | boolean, number | |
| `handEquipped`, `glint` | boolean | |
| `placesBlock` | `#block:...` \| `#crop:...` | how seeds work |
| `placeOn` | string[] | blocks the item may be used on. Empty means anywhere; a seed wants `minecraft:farmland` |
| `tags` | string[] | |

Texture slot: `main`.

### `entity`

| Field | Type | Notes |
|---|---|---|
| `families` | string[] | other entities filter on these |
| `isSummonable`, `hasSpawnEgg` | boolean | |
| `eggBaseColor`, `eggOverlayColor` | `#rrggbb` | |
| `bodyPreset` | `companion` \| `biped` \| `bird` \| `post` \| `cube` | generates geometry and matching animations |
| `scale`, `health`, `movementSpeed` | number | |
| `collisionWidth`, `collisionHeight` | number, in blocks | |
| `temperament` | `passive` \| `companion` \| `skittish` \| `stationary` \| `hostile` | |
| `canFly` | boolean | swaps to flight navigation |
| `attackDamage` | number | hostile, and a companion that defends its owner |
| `tameItems` | string[] | companion only. Items that tame it; it is also tempted by them |
| `followDistance` | number, in blocks | companion only. How far it may drift before returning |
| `canSit`, `defendsOwner`, `canBeLeashed` | boolean | companion only |
| `healItems`, `healAmount` | string[], number | companion only. Feeding one of these heals it |
| `expressive` | boolean | picks a face per frame on a body that declares several. Ignored otherwise |
| `tempted` | string[] | item identifiers the entity follows |
| `despawns` | boolean | |
| `avoidFamilies`, `avoidRadius` | string[], number | flees those families inside the radius |
| `eatsBlocks` | boolean | unlocks the block-eating fields |
| `eatTarget` | `#crop:...` \| `#block:...` | |
| `eatOnlyWhenRipe` | boolean | targets the ripe growth state only |
| `eatChance`, `eatTime` | number | |
| `spawnEnabled` | boolean | unlocks the spawn fields |
| `spawnWeight`, `spawnDensityLimit` | number | |
| `spawnAboveBlocks`, `spawnOnBlocks` | string[] | may contain `#kind:name` references |
| `spawnBiomeTag` | string | e.g. `overworld` |
| `spawnBrightnessMin`, `spawnBrightnessMax` | number 0–15 | |
| `spawnHerdMin`, `spawnHerdMax` | number | |

Texture slots: `main` (must match the UV layout of the chosen body preset, or a
whole multiple of it for a higher-resolution character) and, when `hasSpawnEgg`
is on, an optional `spawn_egg` icon. Without one the egg is tinted from
`eggBaseColor` / `eggOverlayColor`.

The `companion` body is a full character — layered hair, twin tails, a
four-panel skirt, boots — and declares eight face variants, which is what
`expressive` drives. See [CHARACTERS.md](./CHARACTERS.md).

### `biome`

| Field | Type | Notes |
|---|---|---|
| `placement` | `standalone` \| `nested` | `nested` scatters into an existing biome instead of generating a new one |
| `hostBiome` | biome tag | nested only, e.g. `plains`, `swamp` |
| `rarity` | number 1–20 | standalone only; weight against vanilla biomes in the same climate |
| `temperature` | number 0–2 | below 0.15 accumulates snow; above 1.0 no rain falls |
| `downfall` | number 0–1 | |
| `grassColor`, `foliageColor`, `waterColor`, `fogColor` | `#rrggbb` | written to the resource-pack client biome and fog definition |
| `topBlock`, `midBlock` | block identifier | surface materials |
| `heightNoise` | `default` \| `lowlands` \| `swamp` \| `river` \| `beach` \| `mountains` | terrain shape |
| `plants` | object[] | see below |
| `scatterAttempts` | number 1–48 | planting attempts per chunk |
| `scatterChance` | number 5–100 | percent chance each attempt succeeds |
| `farmlandBiome` | boolean | adds the shared `<namespace>_farmland` tag |
| `crowEntity`, `scarecrowEntity` | `#entity:...` | references only — their own fields still define them |
| `crowDensity` | number | 0 uses the estimate from the planting density |
| `tags` | string[] | added to the generated tags; keep `overworld` for a surface biome |

Each entry in `plants`:

```jsonc
{
  "plant": "#crop:rice_plant",   // node reference, resolved on apply
  "weight": 8,                   // 1–20, relative to the other plants here
  "placeOn": [],                 // empty inherits the crop's own plantOn
  "needsWater": true,            // requires an adjacent water block
  "maturity": "ripe"             // "ripe" | "half" | "sprout"
}
```

---

### `recipe`

A recipe is authored against a **station**, which decides its slot layout and
the `tags` it is written with.

| Field | Type | Notes |
|---|---|---|
| `station` | station id | `crafting_table`, `furnace`, `blast_furnace`, `smoker`, `campfire`, `soul_campfire`, `stonecutter`, or `node:<block node id>` for one of your own cookware blocks |
| `recipeType` | `shaped` \| `shapeless` | grid stations only; the stonecutter is always shapeless |
| `grid` | string[9] | row-major, `""` for an empty slot. Always nine entries: a station smaller than 3x3 reads the top-left corner of the same space, so widening it later finds the ingredients where you left them |
| `trimPattern` | boolean | on, the arrangement can sit anywhere in the grid |
| `input` | item identifier | cooking stations only |
| `fuel` | item identifier | cooking stations only, and **not** written into the recipe — Bedrock decides what burns from the fuel item's own `minecraft:fuel` component. The builder keeps it so it can warn when the item cannot burn |
| `result` | item identifier or `#item:...` | |
| `resultCount` | number | |
| `unlockItems` | string[] | reveals the recipe in the recipe book |
| `priority` | number | lower wins when several recipes match |

`stations: string[]` from older presets is still understood: the first tag that
matches a known station is used.

There are two ways to make something "cooked":

- put a cookware **block** in one of the grid slots — an ordinary crafting-table
  recipe that happens to require the pan, and needs nothing else; or
- give the block `isCraftingStation` and a `craftingTag`, which gives it its own
  crafting screen in-game and its own tab in the builder. `craftingGridRows` and
  `craftingGridCols` (1–3, default 3) narrow the shape a recipe may take.

  **On Bedrock the in-game screen is always 3x3** — the rows and columns
  constrain what you can author, not what the player sees, and there is no
  custom background, progress bar or fuel slot to be had. On Java the export
  generates a menu and screen at exactly the size you declared.
  `docs/CRAFTING_STATIONS.md` has the full comparison. Do not generate a preset
  that assumes a Bedrock station can cook over time or keep an inventory; it
  cannot.


### World placement — shared by `scatter`, `tree` and `structure`

All three world-generation kinds carry the same placement block, which becomes
the feature rule. Omit `worldPlace` (or set it to `false`) and no rule is
written at all — the feature is still generated, just never placed on its own.

| Field | Type | Notes |
|---|---|---|
| `worldPlace` | boolean | off writes the feature but no rule |
| `scatterPercent` | number 0–100 | chance a single attempt places anything |
| `iterations` | number 1–256 | attempts per chunk; density ≈ attempts × chance |
| `placementPass` | `surface_pass` \| `underground_pass` \| `final_pass` \| … | see `PLACEMENT_PASS_OPTIONS` |
| `yMode` | `surface` \| `uniform` \| `triangle` \| `fixed` | `surface` omits `y` so the game follows terrain height |
| `yAnchor` | `absolute` \| `above_bottom` \| `below_top` | how `yMin`/`yMax` are measured |
| `yMin`, `yMax` | number | the height band; `yMin` alone when `yMode` is `fixed` |
| `biomeMatch` | `any` \| `anyOf` \| `allOf` \| `noneOf` | `any` writes no biome filter |
| `biomeTags` | string[] | vanilla tags — `plains`, `jungle`, `nether`, … |
| `biomeTagsCustom` | string[] | any other tag; merged with `biomeTags` |

Biomes are matched on **tags**, not names — there is no biome-name test. Several
tags under `anyOf` are wrapped in a single `any_of`, because a flat list would
mean a biome carrying every tag at once.

### `scatter`

| Field | Type | Notes |
|---|---|---|
| `placeMode` | `blocks` \| `feature` | |
| `blocks` | `{ id, weight }[]` | weights are relative, not percentages: 3 and 1 is 75% / 25% |
| `featureRef` | feature identifier | used when `placeMode` is `feature` |
| `patchSize` | number 1–64 | above 1 the placements clump into a patch |
| `patchRadius` | number 1–8 | |
| `mayPlaceOn` | string[] | becomes `may_attach_to.top`; empty allows any surface |
| `mayReplace` | string[] | defaults to `["minecraft:air"]` |
| `enforceSurvivability`, `enforcePlacement`, `randomizeRotation` | boolean | |

One entry in `blocks` emits a `minecraft:single_block_feature`; several emit one
each plus a `minecraft:weighted_random_feature` over them.

### `tree`

| Field | Type | Notes |
|---|---|---|
| `shape` | `classic` \| `fancy` \| `acacia` \| `pine` \| `spruce` \| `mega_jungle` \| `mega_pine` \| `roofed` \| `fallen` | picks the trunk/canopy key pair |
| `heightMin`, `heightMax` | number | trunk height is rolled between them |
| `trunkWidth` | number 1–4 | mega shapes are forced to at least 2 |
| `canopyWidth`, `canopyHeight` | number | radius and depth of the leaves |
| `logLength`, `stumpHeight` | number | `fallen` only |
| `trunkBlock`, `leafBlock` | block identifier | |
| `leafVariation` | number 0–100 | `classic` only — chance an edge leaf is skipped |
| `fruitBlock`, `fruitChance`, `fruitSteps` | block identifier, number, number | `classic` only — becomes `canopy_decoration` |
| `trunkDecorationBlock`, `trunkDecorationChance` | block identifier, number | `classic`, `mega_*` and `fallen` — becomes `trunk_decoration` |
| `mayGrowOn`, `mayReplace`, `mayGrowThrough` | string[] | |
| `baseBlock` | string[] | placed under the trunk |
| `baseCluster`, `baseClusterRadius` | boolean, number | a patch of the ground block around the base |
| `canBeSubmerged` | boolean | |

Each shape maps onto a different pair of keys — `classic` writes `trunk` +
`canopy`, `acacia` writes `acacia_trunk` + `acacia_canopy`, `fallen` writes
`fallen_trunk` and no canopy at all. Only keys the generator is confident about
are emitted; anything more exotic is a Code View override on a valid file.

### `structure`

| Field | Type | Notes |
|---|---|---|
| `source` | `painted` \| `mcstructure` | |
| `grid` | `{ size: [x, y, z], cells: string[] }` | painted mode; cells are flat, `y` slowest and `x` fastest, `""` for empty |
| `anchor` | `center` \| `corner` | which part of the layout lands on the chosen position |
| `mayReplace` | string[] | painted mode |
| `structureName` | string | `.mcstructure` mode, e.g. `mystructure:hut` |
| `facing` | `random` \| `north` \| `south` \| `east` \| `west` | |
| `adjustmentRadius` | number 0–16 | how far the game may shuffle it looking for a fit |
| `grounded`, `unburied` | boolean | |
| `intersectAllowlist` | string[] | blocks the structure may overlap |

A painted structure emits one `minecraft:single_block_feature` per distinct
block, one offset `minecraft:scatter_feature` per filled cell, and a
`minecraft:aggregate_feature` over the lot — Bedrock has no "place this at an
offset" primitive, which is why painted builds are capped at 128 blocks. Past
that, export the build from a structure block and use `mcstructure` mode; the
builder does not write binary NBT, so copy the `.mcstructure` into
`behavior_pack/structures/` yourself.

---

## Worked example

A pest that raids a crop and is repelled by a totem, expressed with no raw pack
JSON at all:

```json
{
  "presetFormat": 1,
  "id": "example.pests",
  "label": "Rabbit pest",
  "description": "A rabbit that eats ripe crops unless a totem is nearby.",
  "notes": ["Apply the crop preset first — the rabbit references it."],
  "nodes": [
    {
      "kind": "entity",
      "name": "field_totem",
      "displayName": "Field Totem",
      "data": {
        "families": ["field_totem"],
        "bodyPreset": "post",
        "temperament": "stationary",
        "movementSpeed": 0
      }
    },
    {
      "kind": "entity",
      "name": "field_rabbit",
      "displayName": "Field Rabbit",
      "data": {
        "families": ["pest"],
        "bodyPreset": "cube",
        "health": 4,
        "temperament": "skittish",
        "avoidFamilies": ["field_totem"],
        "avoidRadius": 14,
        "eatsBlocks": true,
        "eatTarget": "#crop:rice_plant",
        "eatOnlyWhenRipe": true,
        "spawnEnabled": true,
        "spawnAboveBlocks": ["#crop:rice_plant"],
        "spawnDensityLimit": 1
      }
    }
  ]
}
```

---

## Things worth knowing before you generate

**Format versions are not yours to choose.** They live in the target profiles
(`src/core/targets/profiles.ts` for Bedrock, `javaProfiles.ts` for Java) and the
generators read them from there. Do not put `format_version` in a preset.

**A preset is platform-neutral, and that is the point.** You are writing field
values against the content kinds, not files for one game. The same preset
exports as a Bedrock add-on, as a Java data pack and as a mod for four loaders,
and the generators handle every difference between them. Do not write
Bedrock-shaped JSON into a preset in the hope it passes through.

**Use Bedrock identifiers for vanilla blocks.** `minecraft:grass`,
`minecraft:red_flower` and so on. The Java export rewrites the ones that are
spelled differently there — `minecraft:short_grass`, `minecraft:poppy` — so
writing the Bedrock name is correct for both. Writing the Java name is not: it
is not rewritten in the other direction.

**Some content simply cannot reach a Java data pack.** Blocks, items, crops and
entities need a mod loader, because a data pack cannot register them. That is
not something a preset can work around, and it is worth knowing before you
generate an add-on made entirely of custom blocks for someone who wanted a data
pack. `docs/PLATFORMS.md` has the matrix.

**A note on crop growth.** Bedrock's modern block parser removed data-driven
block events and deprecated `minecraft:random_ticking`, so a block that changes
over time needs a scripted custom component. The builder generates one shared
`onRandomTick` handler for every crop and adds the script module to the manifest
only when something actually uses it. Entity AI is still fully data-driven, so
mob behaviour — including the avoid-radius and block-eating above — needs no
script at all.

**A biome owns its plants, not the other way round.** Which crops grow wild
somewhere is a property of the biome, set in the biome node's `plants` list. A
crop node says nothing about where it scatters, so the same crop can appear in
two biomes at different densities without either preset knowing about the other.
The generated feature rule is filtered by the biome's tag, so nothing you assign
to one biome can turn up in another.

**`biome` and `scatter` are for different jobs.** A `biome` scatters the crops it
owns, inside itself. A `scatter` node places anything anywhere — vanilla blocks
included — and is filtered by whatever biome tags you give it, which may be a
custom biome's tag (`<namespace>_<biome name>`) or none at all. Reach for `biome`
when the question is "what grows here", and `scatter` when it is "where does this
block turn up".

**Scatter percentages and weights are different numbers.** `scatterPercent` is
how often the feature appears at all; the `weight` on each entry in a scatter's
`blocks` list is that block's share of the placements that do happen. Weights are
relative — the game normalises them — so 3 and 1 means 75% and 25%.

**Prefer fields over raw files.** A preset written in fields survives a target
profile bump, shows up in the wizard, and can be edited by hand afterwards. Raw
files do none of that.

---

## Escape hatch: shipping raw files

When a kind genuinely cannot express something, a preset may carry finished pack
files:

```json
"files": [
  {
    "path": "behavior_pack/entities/special.json",
    "content": "{ \"format_version\": \"1.26.40\", ... }"
  }
]
```

These become **overrides**: the app writes them verbatim, flags them in the file
explorer, and stops regenerating that path until the user reverts it. Paths must
start with `behavior_pack/` or `resource_pack/`, and `content` is the whole file
as a string.

Use this sparingly. If you find yourself reaching for it often, the better fix
is a new field — or a new kind — in the app repo.
