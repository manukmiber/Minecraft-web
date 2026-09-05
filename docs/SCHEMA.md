# Data shapes

Reference for `project.json`, the preset file, and every format version the
generators emit — Bedrock and Java. If you are writing a preset by hand,
`AI_ASSIST.md` is the friendlier document; this one is the specification.

## `saves/<slot>/project.json`

```jsonc
{
  "modelVersion": 1,
  "id": "proj_...",
  "name": "Sawah",                     // pack display name, used by both manifests
  "description": "…",
  "namespace": "mmm",                  // prefixes every identifier; ^[a-z][a-z0-9_]*$
  "targetProfileId": "bedrock-1.26.40",
  "version": [1, 0, 0],

  "uuids": {                           // stable across regenerations, never colliding
    "behaviorHeader": "…",
    "behaviorModule": "…",
    "resourceHeader": "…",
    "resourceModule": "…",
    "scriptModule": "…"                // only written when the pack needs scripts
  },

  "nodes": [
    {
      "id": "entity_...",              // internal; never appears in pack output
      "kind": "entity",
      "name": "crow",                  // identifier name part
      "displayName": "Crow",           // written to the .lang file
      "data": { /* field values for the kind */ },
      "textures": { "main": "asset_..." },   // slot key → asset id
      "presetId": "farming.pests",     // which preset created it, if any
      "notes": "…",
      "createdAt": "…",
      "updatedAt": "…"
    }
  ],

  "assets": [
    {
      "id": "asset_...",
      "fileName": "crow.png",
      "mime": "image/png",
      "size": 1024,
      "width": 64,
      "height": 64,
      "r2Key": "proj_…/asset_….png",   // null until uploaded
      "repoPath": null,
      "addedAt": "…"
    }
  ],

  "overrides": {                       // path → raw text; wins over the generator
    "behavior_pack/entities/crow.json": "{ … }"
  },

  "meta": { "createdAt": "…", "updatedAt": "…", "author": "…", "tagline": "" }
}
```

`modelVersion` gates migration: `migrateProject` in `src/core/model/project.ts`
brings older saves forward, filling in anything a newer build expects.

## Preset file

Full description in [AI_ASSIST.md](./AI_ASSIST.md). The shape:

```jsonc
{
  "presetFormat": 1,
  "id": "farming.rice",
  "label": "Rice paddy",
  "description": "…",
  "author": "…",
  "notes": ["…"],
  "nodes": [
    { "kind": "crop", "name": "rice_plant", "displayName": "Rice", "data": { … } }
  ],
  "assets": [                                                  // optional
    {
      "node": "entity:kohane",          // kind:name, of a node this preset creates
      "slot": "main",                   // texture slot on that node
      "fileName": "kohane.png",
      "url": "textures/characters/kohane/kohane.png",  // app-relative, under textures/
      "width": 512,
      "height": 512
    }
  ],
  "files": [ { "path": "behavior_pack/…", "content": "…" } ]   // optional
}
```

Cross-references use `#kind:name` and are resolved at apply time — to a node id
for `node-ref` fields, and to `<namespace>:<name>` for item, block, list and
grid fields.

### `assets`

A preset normally describes behaviour and leaves the PNGs to you. One whose
point *is* a character can carry its own: each entry binds one image to one
texture slot on one of the nodes the preset creates.

The bytes go through the same asset store a dropped file does — validated as a
PNG, cached locally, pushed to R2, listed on the project — so a preset texture
is indistinguishable from one you dragged in, and is editable in the pixel
editor from the moment it lands.

- Exactly one of `url` or `base64` per entry.
- `url` must be a path under `textures/`, served by the app. A preset from the
  inbox is untrusted input; one that could name any host would be fetching bytes
  off the internet the moment somebody pressed **Apply**. Use `base64` for
  anything self-contained.
- `node` must name a node the preset creates, or the file is rejected — a
  texture bound to nothing would silently do nothing.
- A texture that fails to load is not fatal: the preset still applies, that slot
  stays empty, and the toast says which one is missing.

## Generated pack layout — Bedrock

```
behavior_pack/
  manifest.json
  blocks/<name>.json
  items/<name>.json
  entities/<name>.json
  spawn_rules/<name>.json
  recipes/<name>.json
  loot_tables/blocks/<name>_immature.json
  loot_tables/blocks/<name>_mature.json
  biomes/<name>.biome.json
  features/<biome>_<plant>_feature.json
  features/<biome>_choice.json          ← only when a biome scatters 2+ plants
  features/<biome>_scatter.json
  feature_rules/<biome>_scatter_rule.json
  features/<name>_feature.json          ← scatter, tree, structure
  features/<name>_block[_n].json
  features/<name>_mix.json              ← weighted block list
  features/<name>_patch.json            ← clumped scatter
  features/<name>_cell_<n>.json         ← one per block of a painted structure
  feature_rules/<name>_rule.json
  scripts/main.js                       ← only when a crop grows
resource_pack/
  manifest.json
  biomes/<name>.client_biome.json       ← biome colours; standalone biomes only
  fogs/<name>.fog.json
  entity/<name>.entity.json
  models/entity/<name>.geo.json
  render_controllers/<name>.render_controllers.json
  animations/<name>.animation.json
  animation_controllers/<name>.animation_controllers.json
  textures/item_texture.json                ← also carries a painted spawn egg
  textures/terrain_texture.json
  textures/blocks/<namespace>/<namespace>_<name>[_<slot>].png
  textures/items/<namespace>/…
  textures/entity/<namespace>/…
  texts/en_US.lang
  texts/languages.json
```

Naming is mechanical on purpose: the atlas key, the file path and the lang key
are all derived from `namespace` + `name` + slot, which is what makes the two
packs impossible to desynchronise.

Language keys written per node:

| Kind | Keys |
|---|---|
| Block, crop | `tile.<id>.name` |
| Item, seed | `item.<id>` and `item.<id>.name` |
| Entity | `entity.<id>.name`, plus `item.spawn_egg.entity.<id>.name` when it has a spawn egg |

Both item key shapes are written because Bedrock has used each of them for
custom items; the unused one is simply ignored.

## Generated layout — Java

One project produces one of two shapes, depending on the delivery route. Both
carry the same `data/` and `assets/` trees, because a mod's
`src/main/resources` *is* a data pack — generating them twice would be
generating them wrong.

### Data pack route (no mod loader)

Two archives, because Java splits them where Bedrock keeps them together:

```
datapack.zip
  pack.mcmeta                                    ← pack_format decides which game reads it
  data/<modid>/recipe/<name>.json                ← `recipes/` on 1.20.1
  data/<modid>/loot_table/blocks/<name>.json     ← `loot_tables/` on 1.20.1
  data/<modid>/worldgen/configured_feature/<name>.json
  data/<modid>/worldgen/placed_feature/<name>.json
  data/<modid>/worldgen/biome/<name>.json
  data/<modid>/tags/item/<modid>_content.json    ← `tags/items/` on 1.20.1
  data/minecraft/tags/block/mineable/pickaxe.json
  data/minecraft/tags/block/crops.json

resourcepack.zip
  pack.mcmeta
  assets/<modid>/lang/en_us.json
  assets/<modid>/models/item/<name>.json
  assets/<modid>/models/block/<name>.json
  assets/<modid>/blockstates/<name>.json
  assets/<modid>/textures/item/<name>.png
  assets/<modid>/textures/block/<name>.png
```

There is no atlas file. A model that says `<modid>:item/rice` resolves to
`assets/<modid>/textures/item/rice.png` by convention, which is why the Java
side needs none of the atlas plumbing the Bedrock emitter has.

### Mod route (Fabric, Quilt, Forge, NeoForge)

```
gradle.properties                                ← every version number, in one file
settings.gradle                                  ← the loader's Maven, for the plugin
build.gradle
README.md                                        ← how to build it
.gitignore
src/main/resources/
  pack.mcmeta                                    ← without this the game ignores data/ and assets/
  fabric.mod.json | quilt.mod.json | META-INF/mods.toml | META-INF/neoforge.mods.toml
  data/…  assets/…                               ← exactly the trees above
  data/<modid>/forge|neoforge/biome_modifier/<name>.json   ← Forge family only
src/main/java/com/<namespace>/
  <Namespace>Mod.java                            ← entry point
  <Namespace>ModClient.java                      ← screens; client only, always
  ModRegistry.java                               ← the one class that knows the loader
  ModItems.java  ModBlocks.java  ModCreativeTabs.java
  <Name>CropBlock.java                           ← one per crop, extends CropBlock
  StationBlock.java  StationMenu.java  StationScreen.java
  StationRecipes.java  ModStations.java          ← custom crafting stations
  ModStructures.java                             ← painted structures, baked in
  ModWorldgen.java                               ← Fabric and Quilt only
```

Naming is mechanical here too, and needs four forms rather than Bedrock's one:

| Form | Example | Used for |
|---|---|---|
| Registry id | `mmm:rice` | Everything the game reads |
| Class name | `RiceCropBlock` | Generated source |
| Field name | `RICE` | Registry constants |
| Lang key | `block.mmm.rice` | Translations — dots, not a colon |

All four derive from `namespace` + `name` in `generators/java/ids.ts`. The Java
package is `com.<namespace>`, with a trailing underscore if the namespace is a
Java keyword.

## Target profile — Bedrock 1.26.40

Checked against the 1.26.x creator changelogs. Stable at the time of writing was
1.26.40 (released 2026-08-04).

| File | `format_version` | Why |
|---|---|---|
| `manifest.json` | `2` | v3 is Preview-only |
| Block | `1.26.40` | modern parser; tags inside `minecraft:tags`; `menu_category.category` mandatory once present; `light_emission`/`light_dampening` 0–15; `ambient_occlusion` a float 0.0–10.0 |
| Item | `1.26.40` | an empty `components` object fails to register (1.26.30+); `minecraft:icon` takes the string shorthand |
| Entity | `1.26.40` | stricter schema — numeric ranges in goals must be `{min,max}` objects |
| Spawn rules | `1.8.0` | still the current spawn-rules format |
| Biome, feature, feature rule | `1.13.0` | world generation still reads the 1.13.0 schema |
| Client biome | `1.21.40` | biome colours moved out of `biomes_client.json` into per-biome resource files |
| Fog | `1.16.100` | referenced by a client biome's `minecraft:fog_appearance` |
| Recipe | `1.20.10` | recipe schema is conservative; supports `unlock`. `minecraft:recipe_shaped`, `_shapeless` and `_furnace` are all emitted from this one version |
| Loot table | `1.20.10` | |
| Feature, feature rule | `1.13.0` | the world-generation schemas have not moved since |
| Client entity, render controller, animation, animation controller | `1.10.0` | |
| Geometry | `1.16.0` | |

`min_engine_version` is `[1, 26, 40]`. A legacy profile targeting 1.21.90 ships
alongside for packs that must run on older clients.

### Deprecations the generators work around

- **Data-driven block events are gone** and `minecraft:random_ticking` is
  deprecated. Crop growth is a scripted custom block component registered
  through `system.beforeEvents.startup`, attached inline in `components` as
  `"<namespace>:crop_growth": { state, max, chance }`. One registration serves
  every crop in the project, and the script module only appears in the manifest
  when a crop actually uses it.
- **World generation is data-driven and needs no script.** A feature says what
  to build, a feature rule says where and how often. The rule's `distribution`
  carries the scatter itself — `scatter_chance` as a percentage, `iterations`
  per chunk and the `y` band — so the common "spread this around" case needs no
  intermediate `minecraft:scatter_feature`. Omitting `y` entirely is what makes
  the game follow terrain height; an explicit full-world range is not the same
  thing and buries most attempts in stone.
- **Biomes are matched on tags, not names.** There is no biome-name test, and
  entries in `minecraft:biome_filter` are AND-ed, so "any of these biomes" has to
  be a single `any_of` wrapping the tag tests.
- **Bedrock has no "place this feature at an offset" primitive.** A painted
  structure is therefore an aggregate of one-iteration scatter features with
  constant coordinates — one file per block, which is why the painter is capped
  at 128 blocks. Larger builds go through a `.mcstructure` and
  `minecraft:structure_template_feature`; the builder does not write binary NBT.
- **Entity AI is unaffected** — `minecraft:behavior.*` goals are still
  data-driven, so avoidance, block-eating and spawn rules need no script.
- **World generation is unaffected too** — biomes, features and feature rules
  are plain data, which is why a biome full of scattered crops costs nothing at
  runtime.

## Biomes

A biome node emits a chain rather than a single file, because a feature file
holds exactly one feature and generation is scoped by biome tag:

| File | What it is |
|---|---|
| `biomes/<name>.biome.json` | climate, surface materials, generation rules and `minecraft:tags` |
| `features/<name>_<plant>_feature.json` | a `single_block_feature` — the block, the growth state it generates at, and `may_attach_to` |
| `features/<name>_choice.json` | a `weighted_random_feature`, only when more than one plant is assigned |
| `features/<name>_scatter.json` | the `scatter_feature`: iterations per chunk, `scatter_chance`, and `y: q.heightmap(...)` |
| `feature_rules/<name>_scatter_rule.json` | runs the scatter under `minecraft:biome_filter` |
| `biomes/<name>.client_biome.json` (RP) | grass, foliage and water colours, and the fog to use |
| `fogs/<name>.fog.json` (RP) | the fog colour above ground and under water |

Tags are generated, not typed: every biome carries `<namespace>_<name>`, plus
`<namespace>_farmland` when it is marked as farmland, plus whatever the user
added. The feature rule filters on `<namespace>_<name>` (or on the host biome's
tag for a nested biome), which is what stops one biome's plants appearing in
another. The same tags are what an entity's `spawnBiomeTag` picks from.

Placement constraints map onto `may_attach_to`: the ground blocks become `top`,
and "needs water beside it" becomes `sides: ["minecraft:water"]` with
`min_sides_must_attach: 1`. A crop with no ground override inherits its own
`plantOn` value, so the rule lives in one place.

Crow density is **not** written into any of these files — Bedrock keeps mob
density in the entity's `spawn_rules`. The biome estimates it
(`plants per chunk ÷ 12`, capped at 6) and the preview offers to copy it onto
the crow entity, which is the only place it belongs.

## JSON schema validation

The code editor binds the community schemas from
[Blockception/Minecraft-bedrock-json-schemas](https://github.com/Blockception/Minecraft-bedrock-json-schemas)
by file path, served from jsDelivr. Validation is assistance, not a gate: if the
CDN is unreachable the editor falls back to plain syntax checking, and the
generator remains the thing that guarantees a valid pack.


## Target profiles — Java

Three axes change between the supported Java versions, and each fails
differently. All three live in `src/core/targets/javaProfiles.ts`.

| | Java 1.21.1 | Java 1.20.1 |
|---|---|---|
| `dataPackFormat` | 48 | 15 |
| `resourcePackFormat` | 34 | 15 |
| `javaVersion` | 21 | 17 |
| Registry folders | singular — `recipe/`, `loot_table/`, `tags/block/` | plural — `recipes/`, `loot_tables/`, `tags/blocks/` |
| Recipe ingredient | `"minecraft:stick"` | `{"item": "minecraft:stick"}` |
| Crafting result | `{"id": …, "count": n}` | `{"item": …, "count": n}` |
| Smelting result | `{"id": …}` | `"minecraft:x"` |
| Biome `carvers` | a list | `{"air": [], "liquid": []}` |
| `ResourceLocation` | `ResourceLocation.fromNamespaceAndPath(…)` | `new ResourceLocation(…)` |
| Food saturation | `.saturationModifier(f)` | `.saturationMod(f)` |
| Block right-click | `useWithoutItem(…)` | `use(…)` |
| `Screen#renderBackground` | takes mouse and partial tick | takes only the graphics |

A pack using the wrong folder name is **silently ignored** — no error, nothing
in the log — which is why the folder names are profile data rather than
constants.

### Loader coordinates

| Loader | 1.21.1 | 1.20.1 | Metadata file |
|---|---|---|---|
| Fabric | loader 0.16.9, API 0.102.1 | loader 0.15.11, API 0.92.2 | `fabric.mod.json` |
| Quilt | Fabric Loom build, ships both files | same | `quilt.mod.json` + `fabric.mod.json` |
| Forge | 52.0.40 | 47.3.0 | `META-INF/mods.toml` |
| NeoForge | 21.1.72 | 20.1.234 | `neoforge.mods.toml` / `mods.toml` |

NeoForge 20.1 predates its own package rename, so on 1.20.1 it reads the Forge
metadata file name *and* compiles against `net.minecraftforge.*`. That is why
`loaderCode.ts` treats the dialect as a function of loader **and** version.

## Crafting station fields

A block becomes a crafting station through four fields, and the Bedrock limits
on them are enforced while you type rather than by the game at load.

| Field | Type | Bedrock limit |
|---|---|---|
| `isCraftingStation` | boolean | — |
| `craftingTag` | string | 64 chars, `^[a-z][a-z0-9_]*$`. A vanilla tag warns. |
| `craftingExtraTags` | string[] | 64 tags total across both fields |
| `craftingScreenTitle` | string | 64 chars; `table_name` |
| `craftingGridRows` / `craftingGridCols` | 1–3 | Constrains authoring only — the Bedrock screen is always 3×3 |

Emitted as `minecraft:crafting_table` on Bedrock. On Java the grid size is
honoured exactly by a generated menu and screen, and the station's recipes are
baked into `StationRecipes.java` rather than written as data-pack files — see
[`CRAFTING_STATIONS.md`](CRAFTING_STATIONS.md) for why.

## Identifiers the platforms spell differently

Some vanilla blocks have different names on each edition, and using the wrong
one places nothing and reports nothing. The Java export rewrites the ones it
knows and warns so the project can be fixed at source. The list is
`BEDROCK_TO_JAVA_ITEMS` in `src/core/generators/java/ids.ts`; the ones that come
up most:

| Bedrock | Java |
|---|---|
| `minecraft:grass`, `minecraft:tallgrass` | `minecraft:short_grass` |
| `minecraft:red_flower` | `minecraft:poppy` |
| `minecraft:yellow_flower` | `minecraft:dandelion` |
| `minecraft:log` / `leaves` / `planks` | `minecraft:oak_log` / `oak_leaves` / `oak_planks` |
| `minecraft:waterlily` | `minecraft:lily_pad` |
| `minecraft:snow_layer` | `minecraft:snow` |

## Release tags

Written by `src/core/export/release.ts` and parseable back, which is how the
Releases panel recovers a build's channel without keeping a second record.

```
v<major>.<minor>.<patch>                 a stable release; marked latest
v<major>.<minor>.<patch>-alpha.<build>   a pre-release
v<major>.<minor>.<patch>-beta.<build>    a pre-release
```

Ordinary semver on purpose: anything that sorts tags puts the pre-releases
before the stable version they lead up to. Build numbers are derived from the
tags already in the repository, never stored anywhere.
