# mmmmmmmmmmmmm

A visual builder for Minecraft Bedrock add-ons. Fill in a form, drop in a PNG,
get a valid `behavior_pack/` + `resource_pack/` — no hand-written JSON, no
matching identifiers across two packs, no folder structure to maintain.

Targets **Bedrock 1.26.40** (stable, released 2026-08-04).

---

## What it does

- **A form instead of JSON.** Blocks, crops, items, entities and recipes are
  created from wizards. Every control is generated from the content kind's own
  field declaration, so the tool stays generic rather than being built around
  one theme.
- **The two packs cannot desynchronise.** The whole pack tree is regenerated
  from one model on every change, so texture atlas entries, `.lang` keys,
  manifest dependencies and cross-pack identifiers are always consistent by
  construction.
- **Drag a PNG onto a slot.** It is validated, stored in your browser, and
  wired into `item_texture.json` or `terrain_texture.json` at the right path.
- **Code view when you want it.** A full Monaco editor with JSON schema
  validation. Generated files are read-only until you explicitly take one over,
  which records a tracked, revertible override.
- **3D preview.** Blocks, items, crop growth stages and entities, built from the
  same geometry the pack ships.
- **Save and Export are separate.** Save stores a version in this browser;
  Export builds a `.mcaddon` you can install. Both require a changelog entry.
- **Preset inbox.** Drop a `.json` preset another tool wrote and it waits there
  until you apply it — nothing is merged behind your back.
- **Nothing leaves your machine.** No account, no token, no server: saves,
  textures and history all live in your browser's storage, and a backup `.zip`
  is how a project moves to another machine.

## Screens

| Panel | What it is for |
|---|---|
| Content | Everything in the add-on, grouped by kind |
| Files | The generated pack tree |
| Presets | Ready-made content to drop in |
| Preset inbox | Presets you have dropped in, waiting to be applied |
| Versions | Save slots, backups and the changelog |
| Settings | Namespace, target profile, defaults, local storage |

`Ctrl/Cmd + K` opens the command palette.

---

## Where your work is kept

Everything is local. The app is static files; your browser is the database.

| Where | What |
|---|---|
| IndexedDB (`mmmmmmmmmmmmm` → `workspace`) | save slots, the preset inbox, the changelog |
| IndexedDB (default store) | texture bytes, keyed by asset id |
| localStorage | preferences and the slot to reopen on launch |

There is no server, no bucket and no account, so there is also nothing to
configure before you start — and nothing anyone else can read.

The flip side is that clearing site data for the origin deletes all of it.
**Versions → Backup** writes a `.zip` holding `project.json`, every texture the
project references and a copy of `CHANGELOG.md`; the same panel imports one
back, which is also how a project moves to another browser or machine.

## Getting started

```bash
npm install
npm run dev          # the app on :5173
npm test             # engine tests
npm run build        # static site into dist/
npm run preview      # serve the build
```

There is nothing to fill in before you can work. The one setting worth visiting
is your project namespace (`mmm` by default) — it prefixes every identifier and
must not collide with `minecraft:`.

## Deploying

Cloudflare Pages, serving the built directory:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Output directory | `dist` |

`public/_redirects` sends every path to `index.html` so a deep link resolves,
and `public/_headers` sets the long-lived cache for hashed assets. No Worker, no
bindings, no secrets — the deployment is the same static files whether it is on
Pages, a local `npm run preview`, or anything else that serves a directory.

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
