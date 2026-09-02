# Architecture

## The one rule

`ProjectModel` is the only source of truth. Pure functions rebuild the entire
output tree from it on every change:

```
                ┌─emitProject()─▶ VirtualFs ──┬─▶ file explorer
                │  (Bedrock)                  ├─▶ code editor
ProjectModel ───┤                             ├─▶ problems panel
                │                             └─▶ .mcaddon
                └─emitJava()────▶ VirtualFs ──┬─▶ data pack + resource pack
                   (Java)                     └─▶ Gradle mod project
```

Because the tree is regenerated from scratch, a rename or a re-uploaded texture
can never leave a stale reference behind, and the behaviour pack and resource
pack cannot disagree about an identifier. That is the whole reason you never
type a texture path or match a name across two files.

The two emitters are separate rather than one parameterised pass, and that is
the load-bearing decision on the Java side. They do not produce the same shape
of thing: Bedrock's tree is two packs of JSON that the game reads directly,
while Java's is either a data pack (which cannot register content at all) or a
source project that has to be compiled. Forcing both through one emitter would
mean every generator carrying a branch for a platform it has no business
knowing about.

## Layers

```
src/core/          pure TypeScript, no React — testable on its own
  model/           ProjectModel, node/asset shapes, migrations
  targets/         platforms, loaders, every version number, the capability matrix
  registry/        ContentKind: fields, texture slots, emitter, preview
  kinds/           the built-in kinds (block, crop, item, entity, recipe, biome)
  generators/      the Bedrock emit pass, geometry and animation builders
    java/          the Java emitters: data pack, resource pack, mod sources
  presets/         preset format, validation, apply
  recipes/         crafting stations: slot layouts, tags, and the Bedrock limits
  data/            the vanilla identifier catalogue the item browser offers
  schema/          JSON-schema bindings for the code editor
  vfs/             virtual file tree
  export/          artifact bundling (JSZip) and release channels

src/integrations/  the outside world
  github/          Git Data API client + the project-repo layout
  r2/              client for the Worker's R2 proxy
  assets/          IndexedDB cache + R2, PNG validation

src/state/         zustand stores (project, settings, ui) and the service singletons
src/app/           shell: activity bar, tabs, palette, status bar, panels
src/features/      the panels and editors
  recipes/         the station builder, item browser and new-result form
  texture-maker/   the pixel editor, its PNG encoder and the texture panel
src/presets/       shipped preset data (the farming batch)
worker/            the Cloudflare Worker: R2 proxy and nothing else
```

## Why the registry exists

A `ContentKind` declares what it needs; the UI is derived from that declaration:

| Declaration | Drives |
|---|---|
| `fields` | the wizard form, the inspector, validation |
| `textureSlots` | the drag-and-drop zones |
| `emit` | the generated pack files |
| `preview` | what the preview panel draws |

So adding a new type of content — a structure, a particle, a biome — is one
entry in `src/core/kinds/`, not a new screen. The farming batch is proof: it is
data (`src/presets/farming/`) laid over the generic kinds, with no special cases
anywhere in the engine.

Two of those declarations can ask for something the generic wizard does not
have: a field type (`recipe-station`, `biome-scatter`) or a preview type
(`biome`) that maps to one component. That is the seam for a control that is
genuinely bespoke — a station builder, a plant checklist — and it stays a single
`case` in the wizard rather than a per-kind form.

## Two registries, same idea

`ContentKind` is not the only thing the UI is derived from. Crafting stations
are declared the same way, in `src/core/recipes/stations.ts`:

| Declaration | Drives |
|---|---|
| `label`, `icon`, `hint` | the tab in the recipe builder |
| `layout` | which slots are drawn, and how many |
| `tags` | the `tags` array in the generated recipe |

The built-ins mirror the vanilla stations. The rest are computed from the
project itself: any block with `isCraftingStation` and a `craftingTag` becomes a
station, so a mod's own cooking pot gets a tab the moment it is given a tag —
and loses it again if the tag is cleared. A recipe stores `node:<block id>`
rather than the tag, so renaming the block or changing its tag cannot orphan the
recipes made at it.

Ingredient cells live in a fixed 3x3 coordinate space whatever the station's
size, and a smaller station reads the top-left corner of it. That is why moving
a recipe from a 2x2 pot to the crafting table and back finds the ingredients
where you left them, and why cells outside the current station are ignored by
the generator rather than smuggled into the pattern.

## Drawing a texture is not a second pipeline

The pixel editor ends at `AssetStore.importFile` — the same call a dropped PNG
makes. From that point a drawn texture is indistinguishable from an uploaded
one: same IndexedDB cache, same R2 upload, same commit into the project repo,
same atlas registration by the emit pass. There is no "drawn texture" concept
anywhere below the editor, which is what keeps the two ways of getting a PNG
from drifting apart.

The one thing the editor does not delegate is writing the PNG. Encoding through
a `<canvas>` premultiplies alpha and shifts the colour of semi-transparent
pixels, so `features/texture-maker/png.ts` writes the file directly — stored
deflate blocks, exact bytes. Decoding, which has no such hazard, is left to the
browser.

## Biomes and their plants

A biome is one node that emits a chain, because Bedrock allows one feature per
file and scopes generation by biome tag:

```
biomes/<name>.biome.json               climate, surface, tags
features/<name>_<plant>_feature.json   where one plant may sit
features/<name>_choice.json            weighted pick, when there is more than one
features/<name>_scatter.json           spread over the chunk
feature_rules/<name>_scatter_rule.json run it — but only in this biome
```

The rule's `minecraft:biome_filter` matches the biome's own generated tag, which
is what keeps one biome's plants out of every other biome. A *nested* biome
skips its generation rules and points that filter at a vanilla tag instead, so
its plants scatter through a biome that already exists.

Crow density is the one number a biome cannot enforce itself: mob density lives
in the entity's `spawn_rules`, not in biome JSON. So the biome estimates it from
the planting density and offers to write it onto the crow — one direction, no
second copy of a spawn definition.

## Two-way editing, honestly

The wizard writes to the model. Code view is read-only until you press **Edit
this file**, which records an entry in `project.overrides` keyed by path. From
then on the generator's output for that path is replaced by your text, the file
is flagged in the explorer, and **Revert to generated** removes the override.

The alternative — parsing arbitrary hand-edits back into a model that cannot
represent them — silently loses work. This way the divergence is visible and
reversible.

## Persistence

There is no database. The project repo is the store:

```
saves/<slot>/project.json    a complete model — switching slots switches versions
saves/<slot>/assets/*.png
preset/*.json                the inbox; applied files move to preset/applied/
exports/*.mcaddon
CHANGELOG.md
```

A Save is a single commit built through the Git Data API (blobs → tree → commit
→ ref), carrying the model, its textures and the changelog entry together, so a
half-written save is not a state that can exist.

## Where work happens

| Task | Where | Why |
|---|---|---|
| Generating JSON | browser | pure functions, instant feedback |
| Zipping the `.mcaddon` | browser | a Worker would hit its CPU limit on a pack with textures |
| Storing textures | Worker → R2 binding | keeps the R2 credential off the page |
| Everything else | GitHub | history and versioning for free |

The Worker is intentionally thin — it proxies R2 and answers a health check.

## Bedrock specifics worth remembering

- `manifest.json` stays at `format_version: 2`; v3 is Preview-only.
- Under the modern block parser, tags live inside `minecraft:tags`, an item with
  an empty `components` object fails to register, and `ambient_occlusion` is a
  float rather than a boolean.
- Data-driven block events are gone and `minecraft:random_ticking` is
  deprecated, so crop growth uses a scripted custom component. The script module
  is added to the manifest only when a project actually needs it.
- Entity AI is still fully data-driven, which is why the scarecrow/crow
  behaviour needs no script.

`src/core/targets/profiles.ts` holds all of it. A new stable Bedrock release
should be a new profile, not a code change.


## Two platforms, three delivery routes

`src/core/targets/` holds the vocabulary. It is worth learning because the words
are used precisely everywhere else:

- **platform** — the game edition: `bedrock` or `java`.
- **loader** — how a Java build is delivered: `datapack` (no loader at all),
  `fabric`, `quilt`, `forge`, `neoforge`.
- **profile** — the version slice inside a platform, holding every schema number
  that version needs.

`capabilities.ts` declares, per feature, how well each of the three delivery
routes covers it, with a written reason on every cell that is not full support.
That file is data, not documentation: the export dialog and the Compatibility
panel both read it, so correcting the data corrects what the app tells people.

### Why the Java side needs a version descriptor and Bedrock does not

Bedrock's profile is a bag of `format_version` strings. Java's has to carry
three separate axes because all three changed between the supported versions,
and each fails differently:

| Axis | What changed | How it fails |
|---|---|---|
| `registryFolders` | 1.21 made every data-pack registry folder singular — `recipes/` → `recipe/` | Silently ignored |
| `recipeSyntax` | 1.21 dropped the ingredient wrapper object and renamed the result key | Recipe rejected at load |
| `api` | `ResourceLocation`'s constructor went private, `saturationMod` → `saturationModifier`, `Block#use` → `useWithoutItem` | Compile error |

Every one of those lives in `javaProfiles.ts` as a code fragment rather than a
boolean, so the generators read a value instead of branching on a version.

### Why Forge and NeoForge are not one family

The usual multi-loader split is "Fabric versus the Forge family", and it is
almost right. Forge stayed on `net.minecraftforge.*` and hands you a
`RegistryObject`; NeoForge moved to `net.neoforged.*` with a `DeferredHolder`.
And NeoForge 20.1 predates its own rename, so on 1.20.1 it is indistinguishable
from Forge at the source level.

`generators/java/loaderCode.ts` makes the dialect a function of *both* the
loader and the Minecraft version. Everything downstream reads its fragments
rather than testing which loader it is generating for.

### Custom stations bake their recipes

A recipe made at one of the project's own stations is not a data-pack file on
Java — it is a row in a generated static matcher (`StationRecipes.java`).

The reason is version drift again: Java's recipe API was rewritten between
1.20.1 and 1.21 (`Recipe<Container>` became `Recipe<RecipeInput>`, serializers
moved to codecs), so a generated custom recipe *type* would need two
incompatible implementations. Matching item identifiers in a static table needs
neither, and a station's recipe set is fixed at export time anyway.

`emitRecipes` returns the split — data-pack recipes and station recipes — so the
two routes cannot both claim the same recipe or both drop it.

## Export and release

`export/bundle.ts` builds every selected artifact independently, each carrying
its own problem list. One loader failing does not cost you the other four, and
the summary says which of the six came out.

`export/release.ts` owns the channel logic. The one thing worth knowing: build
numbers are derived from the tags already in the repository, never stored. A
counter in local storage is wrong the moment someone exports from a second
machine, and the tags are the only record every client shares.

`integrations/github/projectRepo.ts` commits the artifacts *before* cutting the
release, and tags the resulting commit rather than the branch head — so the
release page and the repository agree about what shipped, and a push that lands
in between does not end up inside the release.
