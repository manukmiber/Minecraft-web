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

src/integrations/  storage
  local/           the workspace store: save slots, changelog, preset inbox
  assets/          texture bytes in IndexedDB, PNG validation

src/state/         zustand stores (project, settings, ui) and the store singletons
src/app/           shell: activity bar, tabs, palette, status bar, panels
src/features/      the panels and editors
src/presets/       shipped preset data (the farming batch)
public/            Cloudflare Pages config (_redirects, _headers)
```

There is no `src/integrations/network`, because there is no network. The app is
static files; every byte it holds is held by the browser it runs in.

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

The browser is the database. Two IndexedDB stores, split by what they hold:

```
mmmmmmmmmmmmm / workspace          (src/integrations/local/workspace.ts)
  slot:<name>       one complete model — switching slots switches versions
  preset:<id>       the inbox; applied presets are marked, not deleted
  changelog         the entry list, newest first

default keyval store               (src/integrations/assets/store.ts)
  asset:<id>        texture bytes
```

Textures are keyed by asset id rather than by slot, so several slots referencing
the same image share one copy. That is also why sweeping unused bytes has to ask
the workspace for *every* slot's references, not just the open project's —
`LocalWorkspace.referencedAssetIds()` exists for exactly that.

A save is two writes (the slot, then the changelog entry) rather than one atomic
commit. The ordering is deliberate: the slot lands first, so the worst case is a
saved version with no log line, never a log line for a version that was not
written.

Nothing here survives clearing site data, which is what backups are for.
`src/features/save-export/backup.ts` writes a zip in the layout a save slot used
to occupy in a repo — `project.json`, `assets/<id>.png`, `CHANGELOG.md` — so a
backup is readable without this app and importable into any browser running it.

## Where work happens

| Task | Where | Why |
|---|---|---|
| Generating JSON | browser | pure functions, instant feedback |
| Zipping the `.mcaddon` | browser | the textures are already here; nothing to upload |
| Save slots, changelog, presets | IndexedDB | no account to create, no server to trust |
| Moving a project between machines | backup `.zip` | explicit, and the only thing that ever leaves |

Everything runs in the page, so the deployment is a static bundle on Cloudflare
Pages with no Worker, no bucket and no secrets behind it.

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
