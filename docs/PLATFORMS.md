# Bedrock and Java

This builder ships one project to two different games. They are not two skins
over the same thing, and pretending otherwise is how you end up with an export
that installs fine and does nothing.

This document is the honest version: what each platform can do, what it cannot,
and how to decide which to ship.

---

## The one difference everything else follows from

**Bedrock lets JSON register new content. Java does not.**

A Bedrock behaviour pack adds a block by putting a file in `blocks/`. The game
reads it, registers the block, and that is the entire mechanism — no compiler,
no code, nothing to build. That is why this builder exists in the shape it does:
a form can produce a complete Bedrock add-on because a Bedrock add-on is data.

Java has no equivalent door. A Java **data pack** is read by the vanilla game and
covers recipes, loot tables, tags, advancements, functions and world generation
— genuinely a lot — but it cannot create a registry entry. A new block, item,
entity, block entity or container screen has to be *registered by running code*
while the game starts, and the thing that lets third-party code run at startup
is a **mod loader**.

So there are three delivery routes, not two:

| Route | What it is | Needs a build step | Can add new blocks/items |
|---|---|---|---|
| **Bedrock add-on** | `.mcaddon`, pure JSON | No | **Yes** |
| **Java data pack** | two zips, vanilla game | No | **No** |
| **Java mod** | Fabric / Quilt / Forge / NeoForge | **Yes** (`./gradlew build`) | **Yes** |

The middle row is the one that surprises people. It is not a limitation of this
builder and no exporter can work around it.

---

## The support matrix

`full` — ships completely. `partial` — ships with a stated caveat. `none` — does
not ship at all.

| Feature | Bedrock | Java data pack | Java mod |
|---|---|---|---|
| Custom blocks | full | **none** | full |
| Custom items | full | **none** | full |
| Edible items | full | **none** | full |
| Items usable as fuel | full | **none** | full |
| Crops with growth stages | *partial* | **none** | **full** |
| Custom entities | full | **none** | *partial* |
| Natural spawning | full | **none** | full |
| Recipes at vanilla stations | full | **full** | full |
| **Custom crafting stations** | *partial* | **none** | **full** |
| Creative inventory placement | full | **none** | full |
| Block drops | full | *partial* | full |
| Custom biomes | full | *partial* | full |
| Scattering plants and blocks | full | *partial* | full |
| Trees | full | *partial* | full |
| Painted structures | full | **none** | full |
| Textures | full | *partial* | full |
| Custom block shapes | *partial* | **none** | *partial* |
| Display names | full | *partial* | full |
| Scripted behaviour | *partial* | **none** | full |
| Installable without compiling | **full** | **full** | **none** |

The same table lives in `src/core/targets/capabilities.ts` with a written reason
on every cell that is not `full`, and the app's **Compatibility** panel renders
it filtered to the content your project actually has. Read that rather than this
one when you want an answer about *your* add-on.

---

## Where Bedrock wins

**Nothing is ever compiled.** The `.mcaddon` opens straight into the game, on
console and mobile as well as PC. There is no toolchain, no Java version to
match, and no jar that stops working when the loader updates.

**Entities are entirely data-driven.** Behaviour, client entity, render
controller, animations, geometry and the spawn egg are six JSON files, and the
builder writes all six. The Java equivalent needs a renderer and a model class
written in Java, which the builder does not generate — it leaves a marked stub.

**Painted structures need no binary format.** A Bedrock structure is an
aggregate feature placing blocks. Java reads structures from `.nbt` files
written by the in-game structure block, so the mod export bakes the grid into a
generated class instead and the data-pack route cannot have them at all.

## Where Java wins

**Custom crafting stations are real.** This is the big one and it has its own
document — see [`CRAFTING_STATIONS.md`](CRAFTING_STATIONS.md). Bedrock has
exactly one mechanism and a hard ceiling; Java has a menu class and a screen
class and no ceiling at all.

**Crops do not need a script.** Bedrock's modern block parser dropped
data-driven block events, so a growing crop needs a scripted custom component —
the builder emits `scripts/main.js`, the pack declares a script module, and a
script-enabled pack needs the Beta APIs experiment on a Realm. On Java,
extending `CropBlock` inherits random-tick growth, bonemeal, farmland trampling
and the ripeness check for free.

**A creative tab of your own.** Bedrock's `menu_category` picks one of four
fixed tabs. The Java export gives the add-on its own tab so everything it adds
sits together.

**Adding features to existing biomes does not overwrite them.** Bedrock names a
biome tag in the feature rule and the game does the rest. Vanilla Java has no
such hook, so a data pack has to replace the whole biome file — which conflicts
with any other pack doing the same. Forge and NeoForge each added a data-driven
biome modifier, and Fabric does it from code; the mod export uses whichever
applies, so nothing is overwritten.

**Anything the builder does not generate, you can write.** A mod is arbitrary
Java against the whole game.

---

## Which should I ship?

**Ship Bedrock if** you want it to work on console, phone or a Realm, or you
want people to install it without reading instructions.

**Ship a Java data pack if** the add-on is mostly recipes, loot and world
generation using vanilla blocks. It needs no loader and no build, which makes it
by far the easiest thing to hand someone. If it adds blocks or items, this route
throws them away — the Compatibility panel will say so before you export.

**Ship a Java mod if** the add-on adds blocks, items or a custom crafting
station and you want it on Java. Pick the loader your players already use:
NeoForge or Fabric on current versions, Forge if you are targeting 1.20.1 where
most existing packs still live. Quilt runs Fabric mods, so the Quilt export is a
Fabric-Loom project that also ships `quilt.mod.json` and loads natively on both.

**Ship several.** Nothing stops you exporting all of them in one go — that is
what the export dialog's checkboxes are for, and one release carries the lot.

---

## Versions

Bedrock profiles live in `src/core/targets/profiles.ts`, Java profiles in
`src/core/targets/javaProfiles.ts`. Adding a Minecraft version is an entry in
one of those files and nothing else.

| Platform | Profile | Notes |
|---|---|---|
| Bedrock | 1.26.40 (stable) | The default. Modern block parser rules apply. |
| Bedrock | 1.21.90 (legacy) | For packs that must run on older clients. |
| Java | 1.21.1 | The default. Singular data-pack folders, new recipe syntax, Java 21. |
| Java | 1.20.1 (legacy) | Plural folders, object-shaped ingredients, Java 17. Where most Forge packs still are. |

Three things change between the two Java versions and all three matter:

1. **Folder names.** 1.21 renamed every data-pack registry folder to the
   singular — `recipes/` became `recipe/`, `tags/items/` became `tags/item/`. A
   pack using the wrong spelling is not an error; it is silently ignored.
2. **Recipe syntax.** An ingredient went from `{"item": "minecraft:stick"}` to
   the bare string `"minecraft:stick"`, and a crafting result from
   `{"item": …, "count": n}` to `{"id": …, "count": n}`.
3. **The Java API.** `ResourceLocation`'s constructor went private,
   `FoodProperties.Builder#saturationMod` became `saturationModifier`, and
   `Block#use` split into `useWithoutItem`.

The builder handles all three from the profile, so changing the target version
regenerates everything correctly rather than leaving you to find the
differences.

## Identifiers the two games spell differently

A handful of vanilla blocks have different names on each platform, and getting
one wrong produces a pack that places nothing and reports nothing. The export
rewrites the ones it knows about — `minecraft:grass` is Java's
`minecraft:short_grass`, `minecraft:red_flower` is `minecraft:poppy`, and so on
— and warns you so the project can be corrected at the source. The full list is
`BEDROCK_TO_JAVA_ITEMS` in `src/core/generators/java/ids.ts`.

## Mappings, if you are going to open the generated Java

Every loader is generated against **official Mojang mappings**, including
Fabric, where Yarn is the more common choice. That is deliberate: one set of
templates then compiles on all four loaders instead of Fabric needing its own
dialect of every class name. If you are used to Yarn, the names will look
slightly unfamiliar — that is the mapping, not a different API.
