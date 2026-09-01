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
  features/<name>_feature.json          ← world generation
  features/<name>_block[_n].json
  features/<name>_mix.json              ← weighted block list
  features/<name>_patch.json            ← clumped scatter
  features/<name>_cell_<n>.json         ← one per block of a painted structure
  feature_rules/<name>_rule.json
  scripts/main.js                       ← only when a crop grows
resource_pack/
  manifest.json
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
| Recipe | `1.20.10` | recipe schema is conservative; supports `unlock` |
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

## JSON schema validation

The code editor binds the community schemas from
[Blockception/Minecraft-bedrock-json-schemas](https://github.com/Blockception/Minecraft-bedrock-json-schemas)
by file path, served from jsDelivr. Validation is assistance, not a gate: if the
CDN is unreachable the editor falls back to plain syntax checking, and the
generator remains the thing that guarantees a valid pack.
