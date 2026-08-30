# Architecture

## The one rule

`ProjectModel` is the only source of truth. A pure function rebuilds the entire
`behavior_pack/` + `resource_pack/` tree from it on every change:

```
ProjectModel ──emitProject()──▶ VirtualFs (path → file) ──┬─▶ file explorer
                                                          ├─▶ code editor
                                                          ├─▶ problems panel
                                                          └─▶ .mcaddon export
```

Because the tree is regenerated from scratch, a rename or a re-uploaded texture
can never leave a stale reference behind, and the behaviour pack and resource
pack cannot disagree about an identifier. That is the whole reason you never
type a texture path or match a name across two files.

## Layers

```
src/core/          pure TypeScript, no React — testable on its own
  model/           ProjectModel, node/asset shapes, migrations
  targets/         every format_version and min_engine_version, in one place
  registry/        ContentKind: fields, texture slots, emitter, preview
  kinds/           the built-in kinds (block, crop, item, entity, recipe)
  generators/      the emit pass, geometry and animation builders
  presets/         preset format, validation, apply
  schema/          JSON-schema bindings for the code editor
  vfs/             virtual file tree
  export/          .mcaddon packaging (JSZip)

src/integrations/  the outside world
  github/          Git Data API client + the project-repo layout
  r2/              client for the Worker's R2 proxy
  assets/          IndexedDB cache + R2, PNG validation

src/state/         zustand stores (project, settings, ui) and the service singletons
src/app/           shell: activity bar, tabs, palette, status bar, panels
src/features/      the panels and editors
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
| `preview` | what the 3D panel draws |

So adding a new type of content — a structure, a biome, a particle — is one
entry in `src/core/kinds/`, not a new screen. The farming batch is proof: it is
data (`src/presets/farming/`) laid over the generic kinds, with no special cases
anywhere in the engine.

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
