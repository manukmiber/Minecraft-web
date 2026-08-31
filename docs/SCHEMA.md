# Data shapes

Reference for `project.json`, the preset file, and the Bedrock format versions
the generators emit. If you are writing a preset by hand, `AI_ASSIST.md` is the
friendlier document; this one is the specification.

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
  "files": [ { "path": "behavior_pack/…", "content": "…" } ]   // optional
}
```

Cross-references use `#kind:name` and are resolved at apply time — to a node id
for `node-ref` fields, and to `<namespace>:<name>` for item, block, list and
grid fields.

## Generated pack layout

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
  textures/item_texture.json
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
