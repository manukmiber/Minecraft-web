# AI assist: generating presets for mmmmmmmmmmmmm

Hand this file to Claude Code (or Qwen Code, or anything else) when you want it
to build something the wizard does not cover yet. What it produces is a `.json`
file on your disk; drop that file into the app's **Preset Inbox** — drag it onto
the panel, or use the upload button — and it waits there until you apply it.

The contract is deliberately small: a preset is one JSON file describing content
in terms of the builder's own fields, and the builder turns that into a valid
behaviour + resource pack. A preset never contains raw pack JSON unless it has
to — see [Escape hatch](#escape-hatch-shipping-raw-files) at the end.

---

## Where files go

The app stores everything in the browser, so there is no folder for a tool to
write into and no live model on disk to read. The exchange is by file:

```
anywhere on disk
└── my-thing.preset.json   ← write this, then drop it on the Preset Inbox
```

To see what the project already contains — its `namespace`, its `nodes`, and
which names are taken — export a backup from **Versions → Backup**. The zip
holds `project.json` in exactly the shape described in `docs/SCHEMA.md`. Read
it; do not try to write it back. A preset is the supported way in, and it says
what to add rather than replacing the whole model.

Applying a preset only changes the open project. Nothing is on disk until the
user saves the slot, so end by telling them to press **Save**.

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
  "kind": "entity",              // one of: block, crop, item, entity, recipe
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

Presets do **not** carry textures. Slots stay empty and the user drops PNGs in
afterwards; the builder then writes the atlas entries and file paths. Do not try
to reference image paths.

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
| `isCraftingStation`, `craftingTag` | boolean, string | gives the block its own crafting screen |

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
| `tags` | string[] | |

Texture slot: `main`.

### `entity`

| Field | Type | Notes |
|---|---|---|
| `families` | string[] | other entities filter on these |
| `isSummonable`, `hasSpawnEgg` | boolean | |
| `eggBaseColor`, `eggOverlayColor` | `#rrggbb` | |
| `bodyPreset` | `biped` \| `bird` \| `post` \| `cube` | generates geometry and matching animations |
| `scale`, `health`, `movementSpeed` | number | |
| `collisionWidth`, `collisionHeight` | number, in blocks | |
| `temperament` | `passive` \| `skittish` \| `stationary` \| `hostile` | |
| `canFly` | boolean | swaps to flight navigation |
| `attackDamage` | number | hostile only |
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

Texture slot: `main` (must match the UV layout of the chosen body preset).

### `recipe`

| Field | Type | Notes |
|---|---|---|
| `recipeType` | `shaped` \| `shapeless` \| `furnace` | |
| `grid` | string[9] | row-major, `""` for an empty slot |
| `trimPattern` | boolean | on, the arrangement can sit anywhere in the grid |
| `input` | item identifier | furnace only |
| `result` | item identifier or `#item:...` | |
| `resultCount` | number | |
| `stations` | string[] | vanilla tags: `crafting_table`, `furnace`, `smoker`, … |
| `unlockItems` | string[] | reveals the recipe in the recipe book |
| `priority` | number | lower wins when several recipes match |

To make something "cooked", put a cookware **block** in one of the grid slots.
There is no custom crafting UI; the recipe is an ordinary shaped recipe that
happens to require the pan.

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

**Format versions are not yours to choose.** They live in one target profile
(`src/core/targets/profiles.ts`) and the generators read them from there. Do not
put `format_version` in a preset.

**A note on crop growth.** Bedrock's modern block parser removed data-driven
block events and deprecated `minecraft:random_ticking`, so a block that changes
over time needs a scripted custom component. The builder generates one shared
`onRandomTick` handler for every crop and adds the script module to the manifest
only when something actually uses it. Entity AI is still fully data-driven, so
mob behaviour — including the avoid-radius and block-eating above — needs no
script at all.

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
