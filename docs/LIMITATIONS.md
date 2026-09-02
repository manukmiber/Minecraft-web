# Limitations

Everything this builder does not do, in one place, so you find out here rather
than three hours in.

Three kinds of limit are mixed together below and they are worth telling apart:

- **Platform** — the game does not support it. No tool can fix this.
- **Builder** — the app does not generate it yet. Could change.
- **By design** — deliberate, with a reason.

---

## Bedrock

### Custom crafting stations are severely limited — *platform*

The screen is always the vanilla 3×3 grid. No custom slot count, no custom
background, no progress bar, no fuel slot, no stored inventory, no recipe book
entry for custom tags, no craft event, and no way to cook over time.

There is one mechanism (`minecraft:crafting_table`) and that is all of it. Full
detail in [`CRAFTING_STATIONS.md`](CRAFTING_STATIONS.md).

### Growing crops need a script — *platform*

Bedrock's modern block parser dropped data-driven block events, so anything that
changes a block over time needs the Script API. The builder generates
`scripts/main.js` and adds a script module to the manifest automatically, but
the consequence is real: **a pack with a script module needs the Beta APIs
experiment enabled to run on a Realm.**

### Custom block shapes beyond full-block and cross — *builder*

The builder ships two geometries. A block can point at any geometry identifier,
but you supply the `.geo.json` yourself.

### JSON UI is not supported — *by design*

It is not a supported extension point and it breaks between game versions.
Packs built on it stop working on a Tuesday. Nothing here uses it and nothing
here will.

---

## Java

### A data pack cannot add blocks, items or entities — *platform*

The single biggest limit on the whole Java side. Vanilla Java only reads data
packs for recipes, loot, tags, advancements, functions and world generation.
Anything needing a registry entry needs a mod loader.

If your add-on is mostly recipes and world generation over vanilla blocks, the
data pack is genuinely the easiest thing to hand someone. If it adds content,
this route silently drops it — which is why the Compatibility panel and the
export dialog both say so before you build.

### The mod export is source, not a jar — *platform*

Compiling Java needs a JDK. A browser tab does not have one and cannot get one.
The export is a complete Gradle project and the last step is `./gradlew build`.

### Entities ship a placeholder renderer — *builder*

The export registers the entity type, its attributes and a spawn egg, but a Java
mob needs a renderer and a model class the generator does not write. The export
leaves a clearly marked stub that shows a placeholder model.

This is the one place Bedrock is meaningfully ahead: Bedrock entities are six
JSON files and the builder writes all six.

### Painted structures are not in the data-pack route — *platform*

Java reads structures from binary `.nbt` files written by the in-game structure
block. The builder writes JSON, not NBT. The mod export sidesteps this by baking
the painted grid into a generated `Feature` class; the data-pack route has
nothing to point at.

### Adding features to vanilla biomes conflicts, on a plain data pack — *platform*

Vanilla Java has no hook for "add this feature to every plains biome". A data
pack has to replace the whole biome file, which conflicts with any other pack
doing the same.

Forge and NeoForge each added a data-driven biome modifier, and Fabric does it
from `BiomeModifications` in code — the mod export uses whichever applies, so
nothing is overwritten. Only the loader-free route has the problem.

### Custom station recipes are baked in, not data-driven — *by design*

A custom station's recipes live in a generated Java class rather than as
data-pack files. Java's recipe API was rewritten between 1.20.1 and 1.21
(`Recipe<Container>` became `Recipe<RecipeInput>`, serializers moved to codecs),
so a generated custom recipe type would need two incompatible implementations.

The cost: **editing a station recipe means re-exporting**, not editing a JSON
file inside the jar. Recipes for vanilla stations are ordinary data-pack files
and can be edited in place.

### Only two Minecraft versions — *builder*

1.21.1 and 1.20.1. Adding one is a single entry in
`src/core/targets/javaProfiles.ts` — the folder names, the recipe syntax and the
API differences are all declared there rather than scattered through the
generators.

### Mojang mappings only — *by design*

Every loader is generated against official Mojang mappings, Fabric included,
where Yarn is more common. One set of templates then compiles on all four
loaders. If you are reading the generated source expecting Yarn names, they will
look unfamiliar — that is the mapping, not a different API.

---

## The builder itself

### One project at a time — *by design*

There is no project list. A save slot is a whole version of one add-on; to work
on a different add-on, point Settings at a different repository.

### No collaboration features — *by design*

No accounts, no presence, no locking. The repository is the collaboration
mechanism: two people work on different branches or different slots and merge
like anything else in git. Adding a real-time layer would mean adding a server,
and the absence of a server is what makes this thing free to run and impossible
to leak.

### Textures are not in presets — *by design*

A preset carries field values, not PNGs. Base64 images inside JSON make the diff
unreadable and the file enormous. Content arriving from a preset shows the
missing-texture checker until someone draws or drops artwork for it.

### The token lives in your browser — *by design*

There is no server-side copy, which means no server-side leak, and also means
clearing site data loses it. It is sent only to `api.github.com` and
`uploads.github.com`.

### Large projects are limited by the browser — *platform*

Zipping happens in the page. That is deliberate — a pack with textures blows
past the CPU budget of an edge request, and there is nothing a server needs to
see — but a very large project will be slow on a weak device, and everything is
held in memory while it builds.

### No automated testing of generated output in-game — *builder*

The generators are unit-tested against the schemas and the emitted JSON is
checked, but nothing here launches Minecraft to confirm a pack loads. Test your
exports.

---

## Reporting something missing

If something on this list is wrong — a platform limit that has since been
lifted, or a builder gap that turns out to be a platform one — that is worth
correcting. The capability data lives in
`src/core/targets/capabilities.ts` and `src/core/recipes/stationLimits.ts`, and
both are read directly by the UI, so fixing the data fixes what the app tells
people.
