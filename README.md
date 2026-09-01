# mmmmmmmmmmmmm

A visual builder for Minecraft Bedrock add-ons. Fill in a form, drop in a PNG,
get a valid `behavior_pack/` + `resource_pack/` — no hand-written JSON, no
matching identifiers across two packs, no folder structure to maintain.

Targets **Bedrock 1.26.40** (stable, released 2026-08-04).

---

## What it does

- **A form instead of JSON.** Blocks, crops, items, entities, recipes and
  biomes are created from wizards. Every control is generated from the content
  kind's own field declaration, so the tool stays generic rather than being
  built around one theme.
- **The two packs cannot desynchronise.** The whole pack tree is regenerated
  from one model on every change, so texture atlas entries, `.lang` keys,
  manifest dependencies and cross-pack identifiers are always consistent by
  construction.
- **Drag a PNG onto a slot — or draw one.** A dropped file is validated, cached
  locally, pushed to R2 and wired into `item_texture.json` or
  `terrain_texture.json` at the right path. The built-in pixel editor produces a
  PNG that travels the identical route, so a drawn texture and an uploaded one
  are the same thing from the moment they exist.
- **A visual recipe builder, one tab per crafting station.** Drag ingredients
  from a browser of everything the add-on makes (plus the vanilla shortcuts) onto
  a crafting table's 3x3 grid, a furnace's input and fuel slots, or a tab
  generated for your own cookware block. The pattern, the key map and the recipe
  type are worked out for you, with a flat mock of the in-game screen beside it.
- **Code view when you want it.** A full Monaco editor with JSON schema
  validation. Generated files are read-only until you explicitly take one over,
  which records a tracked, revertible override.
- **3D preview.** Blocks, items, crop growth stages, entities and painted
  structures, built from the same geometry the pack ships. A biome gets a flat
  preview instead: its colours as the game mixes them, the plants that will grow
  wild in it and how many crows that feeds.
- **Biomes own their plants.** Assign crops to a biome, weight them against each
  other, and the scatter features and feature rules are written scoped to that
  biome — nothing leaks into the biome next door.
- **World generation for everything else.** Scatter blocks through new chunks
  with a percentage and a height band, grow trees by picking a shape rather than
  a schema, and paint small structures layer by layer. Where a biome scatters the
  plants it owns, these place anything anywhere — filtered by biome tag, pass and
  height. Feature and rule are generated together either way, so a distribution
  can never point at a feature that does not exist.
- **Save and Export are separate.** Save commits a version to your project repo;
  Export builds a `.mcaddon` in the browser. Both require a changelog entry.
- **Preset inbox.** Anything another tool writes into `preset/` in the project
  repo appears in the app, ready to apply to the active save.

## Screens

| Panel | What it is for |
|---|---|
| Content | Everything in the add-on, grouped by kind |
| Files | The generated pack tree |
| Textures | Every texture in the project — draw a new one, edit one in place |
| Presets | Ready-made content to drop in |
| Preset inbox | Presets waiting in the project repo |
| Versions | Save slots — switch between whole versions |
| Settings | Namespace, target profile, GitHub and Worker credentials |

`Ctrl/Cmd + K` opens the command palette.

---

## The recipe builder

Recipes are authored against a **station**, and the station decides everything
else: how many ingredient slots there are, how they are arranged, and the `tags`
the generated recipe carries.

Stations come from two places. The vanilla ones —
crafting table, furnace, blast furnace, smoker, campfire, soul campfire,
stonecutter — live in `src/core/recipes/stations.ts`. The rest are yours: give a
block **Works as a crafting station** and a **Crafting tag** and it gets its own
tab immediately, sized by its `craftingGridRows` / `craftingGridCols`. That is
how a mod's own cooking pot ends up beside the furnace with nothing hardcoded.

The furnace family shows a fuel slot because that is what the screen looks like,
but Bedrock's furnace recipe carries no fuel — what burns is decided by the fuel
item's own `minecraft:fuel` component. Dropping one of your items there checks
exactly that and warns if it cannot burn, rather than writing a field the game
would ignore.

When the result does not exist yet, **New item…** creates it without leaving the
builder: a name, an icon (uploaded or drawn), edible with its nutrition values,
placeable — which routes through the same block builder the wizard uses. The
regeneration pass then wires the behaviour pack and the resource pack together
the way it does for anything else.

## The texture maker

A pixel editor with the tools you would expect — pencil, eraser, fill,
eyedropper, undo/redo, mirror modes, a palette with recent colours — on a 16, 32,
64 or 128px canvas at whatever zoom you like, with grid lines and no
anti-aliasing anywhere.

It opens as a modal from any texture slot in the builder, from the new-item form
inside the recipe builder, and from the **Textures** panel, so drawing an icon
never costs you your place. **Save & use** assigns the PNG to the slot that
opened it; **Export as PNG** just downloads it.

Entity skins get a template: the UV layout of the chosen body preset is drawn
over the canvas with each patch labelled, so you can see which rectangle is the
head and which is a wing instead of guessing at a blank 64x64 square.

PNGs are written by a small encoder in `src/features/texture-maker/png.ts`
rather than through a canvas `toBlob`, because a canvas round trip premultiplies
alpha and quietly shifts the colour of semi-transparent pixels.

## Vanilla artwork

Every `minecraft:` identifier the app offers is drawn with its real texture,
from [Faithful 32x](https://faithfulpack.net/) — in the item browser, in recipe
slots, on the structure painter's grid and brushes, and on the cubes in the 3D
structure preview. Blocks with distinct faces get them, and textures with holes
in them (glass, leaves, a torch) are cut out rather than drawn black. Chests and
shields are the exception: the game builds those from an entity atlas, so there
is no square face to use and they keep the monogram tile.

Biome-tinted masks — grass, leaves, vines, lily pads — ship colourless in a
resource pack and are tinted per biome at render time. The item browser has no
biome to tint against, so the plains colours the editor already uses as defaults
are baked in during extraction.

Only the identifiers the catalogue names are extracted; the pack holds about
five thousand files and the app draws under two hundred. To refresh them, or
after adding identifiers to `src/core/data/vanillaItems.ts`:

```bash
node scripts/extract-faithful.mjs "Faithful 32x - 26.2.zip"
```

That writes `public/textures/vanilla/**` and regenerates
`src/core/data/vanillaTextures.ts`, both of which are committed so a checkout
builds without the pack.

Textures by the Faithful Resource Pack team, used under the Faithful License —
the full terms are in `public/textures/vanilla/LICENSE.txt`. They are a preview
inside the builder only: the generators emit your own textures and nothing else,
so no vanilla artwork is written into an exported `.mcaddon`.

## Two repositories

| | |
|---|---|
| **This repo** | the app itself |
| **Project repo** | your add-on's data — save slots, preset inbox, exports, changelog. Configured in Settings; nothing is hardcoded. |

There is no database. The project repo *is* the store, which means version
history comes free with git.

## Getting started

```bash
npm install
npm run dev          # the app on :5173
npm run cf:dev       # or with the Worker + R2 binding
npm test             # engine tests
npm run build
```

Then, in **Settings**:

1. A fine-grained GitHub token with **contents: write** on your project repo,
   plus the owner, repo name and branch. Press *Test connection*.
2. Your project namespace (`mmm` by default) — it prefixes every identifier and
   must not collide with `minecraft:`.
3. A Worker passphrase, if the deployment sets one.

Nothing is stored server-side: the token lives in your browser and is sent only
to `api.github.com`.

### Project repo layout

The app creates this as it goes:

```
saves/<slot>/project.json     one complete add-on
saves/<slot>/assets/*.png
preset/*.json                 the inbox — applied files move to preset/applied/
exports/*.mcaddon
CHANGELOG.md
```

## Deploying

Cloudflare Workers with static assets:

```bash
npx wrangler r2 bucket create mmmmmmmmmmmmm-assets
npx wrangler r2 bucket create mmmmmmmmmmmmm-assets-preview   # for `wrangler dev --remote`
npx wrangler secret put API_PASSPHRASE      # optional; without it /api runs open
npm run cf:deploy
```

`cf:deploy` builds first on purpose: `wrangler deploy` uploads `./dist` as the
Worker's asset store, so deploying without a build leaves the previous page —
or the starter placeholder — live at the workers.dev host.

The Worker name in `wrangler.jsonc` is the workers.dev hostname
(`minecraft-web` → `minecraft-web.<subdomain>.workers.dev`). Change it and you
publish a second Worker while the old host keeps serving stale content.

Pushes to `main` also deploy on their own: the repo is connected to Cloudflare
Workers Builds, which runs the build and `wrangler deploy` for the
`minecraft-web` Worker. When that build is red the live host keeps serving
whatever was deployed last, so a red Workers Builds check means the site is
stale, not just the branch.

Deploys are `main` only. *Builds for non-production branches* is off in
**Settings > Build > Branch control**, so pull requests get no build, no
preview deployment and no bot comment; `preview_urls: false` in
`wrangler.jsonc` backs that up on the Cloudflare side. Branches are verified
locally instead — `npm test`, `npm run build`, and
`npx wrangler deploy --dry-run` to check the config and bindings.

The Worker only proxies R2 through its binding — no R2 credential ever reaches
the browser, and the CPU-heavy work (generating JSON, zipping the `.mcaddon`)
stays in the page where there is no request budget to blow.

## Documentation

- [`docs/AI_ASSIST.md`](docs/AI_ASSIST.md) — hand this to Claude Code (or any
  other tool) when you want it to generate a preset the wizard cannot express.
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — how the pieces fit together
  and why.
- [`docs/SCHEMA.md`](docs/SCHEMA.md) — `project.json`, the preset format, and
  every Bedrock `format_version` the generators emit.

## Adding a new type of content

Add one entry to `src/core/kinds/` declaring its fields, texture slots, emitter
and preview, then register it in `src/core/kinds/index.ts`. The wizard, the
drop zones, the explorer grouping, validation and the 3D preview all follow from
that declaration — there is no UI to write.

The bundled farming batch (`src/presets/farming/`) is exactly this: field values
over the generic kinds, with no special cases in the engine.

A new **crafting station** works the same way: one entry in
`src/core/recipes/stations.ts` declaring its label, its tags and its slot layout,
and the builder grows a tab for it.
