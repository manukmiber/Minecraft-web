# Releases

Every export publishes a GitHub release. This document is what the channels
mean, what ends up where, and how to undo one.

---

## Why an export is a release

An export used to be one `.mcaddon` and a download. With two platforms and five
delivery routes it is up to six files that only make sense together, and a
downloads folder is a poor place for six related files with no record of which
build they came from.

A release fixes that: one page, one tag, every artifact attached, the changelog
entry that describes them, and a permanent link you can hand someone.

---

## Channels

The channel decides three things — the tag, whether GitHub marks it a
pre-release, and whether it becomes the repository's "latest".

| Channel | Tag | Pre-release | Latest | Use it when |
|---|---|---|---|---|
| **Alpha** | `v1.2.0-alpha.3` | Yes | No | Work in progress. Things break; worlds may need rebuilding. |
| **Beta** | `v1.2.0-beta.1` | Yes | No | Everything is in and being tested. Safe to play with, not promised stable. |
| **Release** | `v1.2.0` | No | **Yes** | Finished and supported. What the repo points people at. |

The tags are ordinary semver, deliberately. A tool that sorts tags — GitHub's
own release list included — puts `v1.2.0-alpha.3` *before* `v1.2.0` rather than
after it, which is the correct order and the one people expect. It also means
the tag can be parsed back, which is how the Releases panel knows what channel a
build went out on without keeping a second record.

### Build numbers

Alpha and beta carry a build number; a release does not. The number is read from
the tags already in the repository, never from a counter in the browser.

That matters more than it sounds. A counter in local storage is wrong the moment
you export from a second machine, or clear site data, or a collaborator
publishes between your builds. The tags are the only shared record, so they are
the record used.

A release channel build is always `v<version>` with no suffix, so publishing two
stable releases of the same version is impossible — the second one is refused
and you are told to bump the pack version, which is almost always the right
answer. A build that has been downloaded should not change under the same name.

---

## What a release contains

Up to six files, depending on what you ticked:

| File | What it is |
|---|---|
| `<name>-v1.0.0.mcaddon` | Bedrock add-on. Open it; the game imports both packs. |
| `<name>-v1.0.0-datapack.zip` | Java data pack. `<world>/datapacks/`. |
| `<name>-v1.0.0-resourcepack.zip` | Java resource pack. `resourcepacks/`. |
| `<name>-v1.0.0-fabric.zip` | Fabric mod **source project**. |
| `<name>-v1.0.0-quilt.zip` | Quilt mod source project. Also runs on Fabric. |
| `<name>-v1.0.0-forge.zip` / `-neoforge.zip` | Forge / NeoForge mod source projects. |

The release body is assembled rather than being the changelog alone, because a
release page has to answer "what do I download?" before it answers "what
changed?". It carries:

- a banner naming the channel, on pre-releases only;
- your changelog entry;
- **What to download** — every file with one line on what to do with it;
- **Known gaps in this build** — the warnings the export produced, so someone
  installing the mod knows the entities ship a stub renderer before they find
  out in game.

The same files are also committed to `exports/<tag>/` in the repository. Two
copies is deliberate: the release is what people download, the commit is what
survives if the release is ever deleted.

---

## The order things happen in

1. Every selected artifact is built, in the browser.
2. **All of them are downloaded.** Before anything touches GitHub.
3. The artifacts and a changelog entry are committed.
4. A release is cut from **that commit**.
5. Each file is uploaded as a release asset.

Step 2 is where it is because a GitHub outage, an expired token or a rate limit
should never cost you a build you already waited for. Step 4 tags the commit
rather than the branch head, so a push that lands in between does not end up
inside your release.

If an asset upload fails, the release is **deleted again** rather than left
half-populated. A release missing its files still owns its tag, and the tag is
what blocks the retry — so leaving it would turn one failure into a manual
cleanup.

---

## Permissions

A fine-grained token with **Contents: Read and write** on the project
repository is enough for everything: saving, committing exports, creating
releases and uploading assets. Releases are contents; there is no separate
release scope to grant.

The token is stored in this browser only and sent to `api.github.com` and
`uploads.github.com`, which is where release assets go — the JSON API host does
not accept them.

---

## Undoing a release

A release owns its tag, so deleting the release alone does not free the name:

```bash
gh release delete v1.2.0-alpha.3 --yes
git push --delete origin v1.2.0-alpha.3
```

The committed copy under `exports/v1.2.0-alpha.3/` survives either way, which is
usually what you want — if you are deleting a release because it was wrong, the
evidence of what was in it is worth keeping.

The builder will not overwrite an existing tag. Rather than silently replacing a
build someone may already have downloaded, it stops and tells you to bump the
version.

---

## Exporting without publishing

Untick **Publish these files as a GitHub release** and the export builds and
downloads only. Useful for a build you want to test before anyone sees it — and
it is the only mode available if the project repository is not configured.

Nothing is recorded when you do this, by design. An unpublished build has no
tag, no changelog entry and no commit; if it turns out to be worth keeping,
export it again with publishing on.
