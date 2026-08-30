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
- **Drag a PNG onto a slot.** It is validated, cached locally, pushed to R2, and
  wired into `item_texture.json` or `terrain_texture.json` at the right path.
- **Code view when you want it.** A full Monaco editor with JSON schema
  validation. Generated files are read-only until you explicitly take one over,
  which records a tracked, revertible override.
- **3D preview.** Blocks, items, crop growth stages and entities, built from the
  same geometry the pack ships.
- **Save and Export are separate.** Save commits a version to your project repo;
  Export builds a `.mcaddon` in the browser. Both require a changelog entry.
- **Preset inbox.** Anything another tool writes into `preset/` in the project
  repo appears in the app, ready to apply to the active save.

## Screens

| Panel | What it is for |
|---|---|
| Content | Everything in the add-on, grouped by kind |
| Files | The generated pack tree |
| Presets | Ready-made content to drop in |
| Preset inbox | Presets waiting in the project repo |
| Versions | Save slots — switch between whole versions |
| Settings | Namespace, target profile, GitHub and Worker credentials |

`Ctrl/Cmd + K` opens the command palette.

---

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
npx wrangler secret put API_PASSPHRASE      # optional; without it /api runs open
npm run cf:deploy
```

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
