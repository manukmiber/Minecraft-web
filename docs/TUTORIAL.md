# Tutorial: from nothing to a published release

An end-to-end walk through building a small add-on and shipping it to both
games. Follow it straight through and you will have made a crop, an item, a
custom crafting station with its own recipe, and a release with six files
attached to it.

Nothing here is theme-specific. The example is food and plants because that is
what the project repo is called; every step is the same for a magic mod or a
furniture pack.

**Contents**

1. [Setting up](#1-setting-up)
2. [Your first item](#2-your-first-item)
3. [Drawing a texture](#3-drawing-a-texture)
4. [A crop that grows](#4-a-crop-that-grows)
5. [A crafting station of your own](#5-a-crafting-station-of-your-own)
6. [Recipes](#6-recipes)
7. [Putting it in the world](#7-putting-it-in-the-world)
8. [Saving](#8-saving)
9. [Checking what will actually ship](#9-checking-what-will-actually-ship)
10. [Exporting and releasing](#10-exporting-and-releasing)
11. [Installing what you built](#11-installing-what-you-built)
12. [Where to go next](#12-where-to-go-next)

---

## 1. Setting up

Open the app. You get a workspace: an icon rail on the left, a panel beside it,
an editor in the middle, and a problems panel along the bottom. `Ctrl/Cmd + K`
opens a command palette that reaches everything.

You can build an entire add-on and export it without configuring anything. But
**Save** and **Release** both write to a GitHub repository, so do that first —
it takes two minutes and everything afterwards is easier.

### The project repository

There is no database behind this app. Your add-on's save slots, its preset
inbox, its changelog and every build you export live as files in a GitHub repo
you own. Version history comes free with git, and nothing is stored on anyone
else's server.

Open **Settings** (the gear at the bottom of the rail):

1. **GitHub token.** Create a fine-grained personal access token scoped to the
   one repository, with **Contents: Read and write**. That single permission
   covers saving *and* publishing releases — releases are contents, not a
   separate scope.
2. **Owner**, **Repository**, **Branch** — `manukmiber`, `plants-and-foods`,
   `main` by default. Point it at your own repo if you have one.
3. Press **Test connection**. You want "write access confirmed".

The token is stored in this browser only and sent only to `api.github.com`.

### The two version settings

Also in Settings, and worth understanding before you build anything:

- **Bedrock target** decides every `format_version` the Bedrock generators
  write. 1.26.40 unless you need to support old clients.
- **Minecraft version** under *Java target* decides the data-pack folder names,
  the shape of every recipe file, and the API the generated mod compiles
  against. 1.21.1 unless your players are on 1.20.1.

Both regenerate the whole tree when changed. Nothing is baked in.

### The namespace

Under **Project**, set a namespace. It prefixes every identifier the project
produces — `mmm:rice`, `mmm:cooking_pot` — and becomes the Java mod id. Pick
something short and yours: lowercase letters, digits and underscores. It cannot
be `minecraft`.

---

## 2. Your first item

Open **Content** (the top icon) and press **New**. Pick **Item**.

You get a form. Every control on it is generated from the item kind's own field
declaration, which is why the app has no hand-written screen per content type —
and why adding a new kind later grows the UI for free.

Make some flour:

| Field | Value |
|---|---|
| Name | `flour` |
| Display name | `Flour` |
| Creative tab | Items |
| Stack size | 64 |

Leave the rest. Press **Create**.

The item appears in the Content panel, and the **Files** panel now has
`behavior_pack/items/flour.json` in it. Open it — that is real, valid Bedrock
JSON, regenerated from your form every time anything changes. You will not need
to edit it, but seeing it is the fastest way to trust the tool.

### Something edible

Make a second item, `herb_stew`:

| Field | Value |
|---|---|
| Name | `herb_stew` |
| Display name | `Herb Stew` |
| Edible | on |
| Nutrition | 8 |
| Saturation modifier | 0.8 |
| Leaves behind | `minecraft:bowl` |

**Leaves behind** is the bowl you get back after eating. The builder writes it
as `using_converts_to` on Bedrock and as the food properties' remainder on Java
— the same intent, spelled differently, which is the sort of thing you no
longer have to know.

---

## 3. Drawing a texture

Both items are currently the missing-texture checker. Fix that.

In the item's form, find the **Icon** slot. You can drag a PNG onto it, or press
**Draw** to open the pixel editor.

The editor has what you would expect — pencil, eraser, fill, eyedropper, undo,
mirror modes, a palette with recent colours — on a 16, 32, 64 or 128 pixel
canvas at whatever zoom you like, with grid lines and no anti-aliasing anywhere.

Draw something. Press **Save & use**. It is assigned to the slot you opened it
from, cached in this browser, pushed to storage, and wired into
`item_texture.json` at the right path — all of which you can watch happen in the
**Files** panel.

A dropped PNG travels the identical route. A drawn texture and an uploaded one
are the same thing from the moment they exist.

> **On Java there is no atlas.** Bedrock needs every texture registered in
> `item_texture.json` or `terrain_texture.json` under a short key. Java resolves
> `mmm:item/flour` to `assets/mmm/textures/item/flour.png` by convention. The
> builder writes both, correctly, without you choosing.

---

## 4. A crop that grows

**New → Crop.** This is where the two platforms visibly diverge, so it is worth
doing carefully.

| Field | Value |
|---|---|
| Name | `sage` |
| Display name | `Sage` |
| Growth stages | 4 |
| Plants on | `minecraft:farmland` |
| Generate a seed item | on |
| Produce | `mmm:herb_stew`… no — leave it empty for now |

A four-stage crop asks for four textures — **Stage 0** through **Stage 3
(ripe)** — plus a **Seed icon**. Draw or drop all five. They are terrain
textures, so 16×16 is the sensible size.

### What just happened on each platform

**On Bedrock**, growth needs a script. The modern block parser dropped
data-driven block events, so there is no JSON way to say "this block advances
every so often". The builder registers a custom block component and assembles
`behavior_pack/scripts/main.js` for it, and adds a script module to the
manifest. Look in **Files** — it is there now, and it was not before.

That has a consequence worth knowing: a pack with a script module needs the Beta
APIs experiment enabled to run on a Realm.

**On Java**, none of that happens. The export generates `SageCropBlock extends
CropBlock`, which inherits random-tick growth, bonemeal, farmland trampling and
the ripeness check from vanilla. No script, no experiment, no manifest change.

This is the clearest example of the platforms not being equivalent in either
direction — and you did not have to choose which one you were building for.

---

## 5. A crafting station of your own

**New → Block.**

| Field | Value |
|---|---|
| Name | `cooking_pot` |
| Display name | `Cooking Pot` |
| Creative tab | Construction |
| Seconds to break | 2 |

Give it a texture. Then open the **Advanced** group:

| Field | Value |
|---|---|
| Works as a crafting station | on |
| Crafting tag | `cooking_pot` |
| Recipe rows | 2 |
| Recipe columns | 2 |

The crafting tag is what recipes carry to be craftable here. It has to be
lowercase letters, digits and underscores — the field will tell you if it is
not, and will warn you if you pick a vanilla tag like `crafting_table`, because
that silently makes your block a second workbench.

### Read this bit before you get attached to the idea

You just declared a 2×2 station. On **Java**, the export generates a menu and a
screen with exactly four slots.

On **Bedrock**, the screen will show nine. `minecraft:crafting_table` opens the
vanilla crafting table screen and there is no way to change it — no custom slot
count, no custom background, no progress bar, no fuel slot. The 2×2 you set
constrains the recipes *you* can author, which keeps a cooking pot feeling like
a cooking pot in the builder, but the player sees a crafting table with a
different name at the top.

That is not a gap this tool can close.
[`CRAFTING_STATIONS.md`](CRAFTING_STATIONS.md) has the complete list of what
Bedrock stations cannot do and why.

---

## 6. Recipes

**New → Recipe.** The form is mostly one big control: the station builder.

Along the top are tabs — Crafting Table, Furnace, Blast Furnace, Smoker,
Campfire, Soul Campfire, Stonecutter, and now **Cooking Pot**, which appeared
the moment you set that crafting tag. Nothing about your block is hardcoded
anywhere.

### A crafting-table recipe

Pick the **Crafting Table** tab. Drag `minecraft:wheat` from the item browser on
the right into any grid cell. Drag **Flour** into the output slot. Set the
result count to 2.

Set the recipe type to **shapeless** — one ingredient in any position.

That is it. The pattern, the key map and the tags are worked out for you, and
the flat mock beside the grid shows roughly what the player will see.

### A station recipe

New recipe. Pick the **Cooking Pot** tab. You get four slots, because that is
what you declared.

Put **Flour** in the top-left and `minecraft:bowl` beside it. Drop **Herb Stew**
in the output.

### The fuel slot, if you use a furnace tab

The furnace family shows a fuel slot because that is what the screen looks like.
But **neither Bedrock nor Java puts fuel in the recipe** — what burns is decided
by the fuel item's own properties. Dropping one of your items there checks
exactly that and warns if it cannot burn, rather than writing a field the game
would ignore.

### When the result does not exist yet

Press **New item…** inside the recipe builder. You get a compact form — a name,
an icon you can upload or draw, edible with its nutrition values, placeable —
and it routes through the same builders the wizards use. You never lose your
place in the recipe.

---

## 7. Putting it in the world

**New → Biome**, or **New → Scatter** if you only want plants in biomes that
already exist.

A **Scatter** places blocks through new chunks:

| Field | Value |
|---|---|
| Blocks | `mmm:sage`, weight 1 |
| Chance per chunk | 20% |
| Iterations | 2 |
| Placement pass | Surface |
| Biome tags | plains, forest |

A **Biome** owns its plants instead: assign crops to it, weight them against
each other, and the scatter features are written scoped to that biome so nothing
leaks into the biome next door. It also gets a flat preview showing its colours
as the game mixes them.

### How that translates

Bedrock splits this in two: a *feature* says what to build, a *feature rule*
says where. Java splits it the same way but calls them a *configured feature*
and a *placed feature*, and expresses "where" as an ordered list of placement
modifiers.

The translation the builder does that is easiest to get backwards by hand: your
20% chance becomes a `rarity_filter` of `5`, because Java's rarity filter is
"one chunk in N", not "N per cent of chunks".

Attaching a feature to a biome that already exists is the part where the
platforms genuinely differ, and the builder picks the right route per loader —
a data-driven biome modifier on Forge and NeoForge, generated
`BiomeModifications` code on Fabric and Quilt, and on a plain data pack it has
to overwrite the vanilla biome file, which conflicts with other packs. The
Compatibility panel says so.

---

## 8. Saving

Press **Save** in the title bar. You need a slot name (`main` is fine) and a
changelog entry.

The changelog is not optional and that is deliberate: the repo is the history,
and a note written now is worth more than one reconstructed next month.

One commit lands in your repo containing the model, every texture it references,
and the changelog entry — together, so a save is never half visible. A
half-written save would load looking fine and export a pack with missing
artwork, which nobody notices until someone else installs it.

Saving under a *new* slot name creates a parallel version you can switch between
in the **Versions** panel. Slots are not backups; they are alternative lines of
work.

---

## 9. Checking what will actually ship

Open **Compatibility** in the rail.

You get three verdicts — Bedrock add-on, Java data pack, Java mod — judged
against the content in *this* project, not the platform in general. Below them,
every feature you are using, with its support level on each route and a written
reason for anything less than full.

For the add-on you just built you should see roughly:

- **Bedrock add-on** — partial. The crop needs a script; the station cannot have
  its own screen.
- **Java data pack** — little survives. Your blocks, items and crop cannot be
  registered, so what ships is one crafting-table recipe.
- **Java mod** — full. Everything, including the 2×2 station screen.

That third column is why the mod export exists. That second column is why the
panel exists at all: exporting a block-heavy add-on as a data pack is allowed —
occasionally it is what you want — but it should never be a surprise.

---

## 10. Exporting and releasing

Press **Export**.

### Pick your targets

Each row carries its verdict against the live project, the same one the
Compatibility panel gave you, and a collapsed list of what it does not cover.
Tick as many as you like:

- **Bedrock add-on** — one `.mcaddon`.
- **Data pack + resource pack** — two zips, no loader, no build.
- **Fabric** / **Quilt** / **Forge** / **NeoForge** — one Gradle source project
  each.

Choose the Java Minecraft version from the dropdown above the Java rows. A
loader with no coordinates for that version is removed rather than left as a box
that quietly builds nothing.

### Write the changelog

Same rule as Save. One line is enough.

### Pick a channel

| Channel | Tag | What it means |
|---|---|---|
| **Alpha** | `v1.0.0-alpha.1` | Work in progress. Pre-release, never "latest". |
| **Beta** | `v1.0.0-beta.1` | Feature-complete, being tested. Pre-release. |
| **Release** | `v1.0.0` | Finished. Marked latest on the repository. |

The build number comes from the tags already in your repo, not from a counter in
this browser — so two people exporting at once cannot both claim `alpha.3`.
Start on alpha; promoting a build to a release should be a deliberate act.

Press **Build & release**.

### What happens, in order

1. Every selected artifact is built in this browser.
2. **All of them are downloaded**, before anything is published. A GitHub
   outage, an expired token or a rate limit never costs you the build you just
   waited for.
3. The artifacts are committed to `exports/<tag>/` along with a changelog entry.
4. A release is cut **from that commit**, so the release page and the repository
   agree about what shipped.
5. Each file is attached to the release.

If an upload fails partway, the release is deleted again rather than left
half-populated — a release missing its files still owns the tag, which would
block your retry with a confusing "already exists".

Open **Releases** in the rail. Your build is there, with its channel, its files
and a link to GitHub.

---

## 11. Installing what you built

### Bedrock

Double-click the `.mcaddon`. The game imports both packs. Enable them on a world
— behaviour pack first; the resource pack comes along automatically because the
manifests declare the dependency.

If your project uses crops, the pack has a script module, so **Beta APIs** has to
be on in the world's experiment settings.

### Java, data pack route

```
<world>/datapacks/plants-and-foods-v1.0.0-datapack.zip
resourcepacks/plants-and-foods-v1.0.0-resourcepack.zip
```

Both halves, or things will look wrong. `/reload` picks up data pack changes
without restarting.

### Java, mod route

The export is a **source project, not a jar**. Compiling Java needs a JDK, which
a browser tab does not have.

```bash
unzip plants-and-foods-v1.0.0-fabric.zip -d fabric
cd fabric
gradle wrapper          # first time only, creates ./gradlew
./gradlew build
```

The jar lands in `build/libs/`. Drop it in `mods/` with the loader installed —
and with **Fabric API** if you built the Fabric or Quilt target.

You need the Java version the profile names: 21 for 1.21.1, 17 for 1.20.1. The
generated `build.gradle` asks for it via a toolchain, so Gradle will fetch it if
your setup allows that and tell you clearly if it cannot.

Every export overwrites `src/main/` completely. To add behaviour the builder
does not cover, put it in a **new class** and call it from the entry point —
that file is regenerated too, but a one-line call is trivial to re-add whereas a
rewritten class is not.

---

## 12. Where to go next

**Presets.** The **Presets** panel has ready-made content to drop in. The
**Preset inbox** shows anything written into `preset/` in your project repo, so
another tool — Claude Code, a script, a collaborator's pull request — can
contribute content without driving the interface. Hand
[`AI_ASSIST.md`](AI_ASSIST.md) to whatever is generating one.

**Code view.** Any generated file can be opened in a full Monaco editor with
JSON schema validation. Generated files are read-only until you explicitly take
one over, which records a tracked, revertible override — so a hand-edit is never
silent and never lost to the next regeneration.

**New content kinds.** Adding a kind is one entry in `src/core/kinds/`
declaring its fields, texture slots, emitter and preview. The wizard, the drop
zones, the explorer grouping, validation and the 3D preview all follow from that
declaration. See [`ARCHITECTURE.md`](ARCHITECTURE.md).

**The rest of the documentation.**

| Document | What it covers |
|---|---|
| [`PLATFORMS.md`](PLATFORMS.md) | Bedrock vs Java, the full support matrix, and why the middle column is thin |
| [`CRAFTING_STATIONS.md`](CRAFTING_STATIONS.md) | Custom stations, Bedrock's ceiling in detail, and what Java gives you instead |
| [`RELEASES.md`](RELEASES.md) | Channels, tags, what goes in a release and how to undo one |
| [`LIMITATIONS.md`](LIMITATIONS.md) | Everything this builder does not do, in one place |
| [`SCHEMA.md`](SCHEMA.md) | `project.json`, the preset format, every emitted format version |
| [`ARCHITECTURE.md`](ARCHITECTURE.md) | How the pieces fit together and why |
