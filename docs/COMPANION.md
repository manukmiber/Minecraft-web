# The companion

A 3D character stands in the corner of the workspace, watches what you build,
and says something about it. She is called **Kohane**, and the model she wears
is one you supply.

None of it is load-bearing. Everything she comments on is already a toast or a
row in the Problems panel, so turning her off costs company and nothing else.

---

## Getting her on screen

1. Open the **Companion** panel from the activity rail.
2. Drop in an MMD model — the `.zip` exactly as you downloaded it, or the
   unpacked folder. A `.pmx` on its own works too, but arrives untextured.
3. That is the whole setup. She is remembered for next time.

The import reads the archive in the browser: it finds the `.pmx`, decodes the
entry names (usually Shift-JIS, which is why the folder names would otherwise
arrive as mojibake), resolves each texture the model asks for, and builds the
mesh. A 67k-vertex dressed character takes a couple of seconds.

### Where the model is kept, and why it matters

**In this browser's IndexedDB, and nowhere else.** It is not uploaded to R2,
not committed to the project repo, and never written into an export.

That is a licence decision, not a technical one. MMD models are overwhelmingly
distributed under terms that forbid redistribution — very often *"再配布禁止"*,
redistribution prohibited, modified or not — and putting a copy in a git repo
or an object bucket is redistribution however private it feels. Many of those
same terms also limit use to MMD and MMD-adjacent software, or restrict where
finished work may be posted.

So the app does the one thing it can do honestly: it reads the copy you already
have, keeps it on your machine, and never passes it on. **Read your model's own
readme before you use it here** — the terms differ per author and only you can
agree to them.

The cost of this is that importing again is part of setting up a new browser.
That is the right trade.

---

## What the loader supports

Written from scratch, because three.js removed `MMDLoader` in r167 and there is
no addon left to lean on.

| | |
|---|---|
| **Format** | PMX 2.0 and 2.1, either text encoding, any index width |
| **Geometry** | BDEF1, BDEF2, BDEF4, SDEF and QDEF weights, all flattened to four influences |
| **Materials** | diffuse, texture, per-material culling, and measured alpha — opaque, cut-out and translucent are told apart by looking at the pixels |
| **Toon** | the model's own toon ramp, rebuilt as a three.js gradient map in full colour |
| **Sphere maps** | `.spa` additive and `.sph` multiplicative, injected after lighting |
| **Outline** | the inverted hull every MMD model expects, expanded in clip space so the line weight does not change with the dock size |
| **Textures** | PNG, JPEG, BMP, GIF, WebP and TGA; `.spa`/`.sph` are BMP under another name |
| **Morphs** | vertex and group morphs, applied on the CPU against a sparse vertex list |
| **Physics data** | rigid bodies and joints are read, and used to work out which bones should swing |

Not supported, and deliberately: `.pmd` (the older format), VMD motion files,
a real physics solver, IK solving, material and UV morphs, and PMX 2.1 soft
bodies. A model that uses those still loads — it simply ignores them.

If a texture is missing from the archive the panel lists it and the model still
loads wearing the rest.

## What makes her move

There are no motion files. A `.vmd` is someone else's choreography with its own
licence attached, and a companion needs to react to what just happened rather
than replay a loop. So everything is procedural:

- **Standing.** The bind pose is measured and the arms are rotated down to a
  resting angle, so a T-posed model and an A-posed one end up standing the
  same way.
- **Breathing and weight shift** from slow sine waves through the spine.
- **Blinking** on a timer, roughly every two to seven seconds, with the
  occasional quick double.
- **Looking at the pointer**, distributed down the neck and spine so it does
  not read as a turret, with the eyes leading slightly.
- **Talking**, cycling the model's own vowel morphs while a line is up.
- **Expressions** composed from the morphs the model has — matched in Japanese
  first (`まばたき`, `にこり`, `困る`), with English fallbacks.
- **Hair and skirt** on spring bones, identified from bone names *and* from
  which bones the author gave a simulated rigid body. The swing away from rest
  is clamped, which is the difference between hair that moves and hair that
  turns inside out.
- **Gestures** — wave, nod, tilt, cheer, slump — fired by what the workspace
  just did.

Turning on **Reduced motion** in Settings stops all of it. She keeps the
standing pose and stops breathing, blinking and following the pointer.

---

## Checking what your model can do

Every model names its morphs differently, so what she is able to pull is
decided by what yours happens to have. The Companion panel has a row of mood
and gesture chips to try them against your own model, and a report underneath
listing which expression slots matched and what they matched *to*:

```
19 expressions matched, 145 bones will swing
  Blink            まばたき
  Smiling eyes     笑い
  Troubled brows   困る
  …
Not in this model: blush. She simply does not use those.
```

That is the first thing to open when an expression does not seem to land — it
is usually a naming difference rather than a fault.

Moods lean on the eyes and the mouth rather than the eyebrows, and that is not
an aesthetic preference: most character models have a fringe, and a fringe
hides eyebrows. A mood carried by the brows alone is a mood nobody can see.

## Framing

**Head to toe** or **head and shoulders**. A bust takes up far less of the
corner and is the better choice on a small screen; the camera moves rather than
the model, so nothing is cropped by the edge of the canvas.

## What she talks about

Every line is a comment on something the app already reported. The chatter
level decides how much gets through:

| Level | Says |
|---|---|
| **Quiet** | Problems appearing, exports, releases, failures |
| **Normal** | The above, plus content added, presets applied and saves |
| **Chatty** | Everything, including undo, textures, and the odd word when the workspace has been quiet |

The line bank lives in `src/core/companion/dialogue.ts` and is unit tested — a
line never repeats twice in a row, and a line with a slot in it is never chosen
when there is nothing to put in the slot.

---

## Keyboard and pointer

| | |
|---|---|
| Click her | She says something |
| Focus her, arrow keys | Move her around the corner (hold Shift for bigger steps) |
| Focus her, `+` / `-` | Resize |
| Hover | Grip to drag, resize, and hide |

Hiding her from the dock leaves the model imported and opens the Companion
panel, which is where she comes back from. Below 640px wide she does not appear
at all — a narrow workspace needs the pixels more than the company.

---

## Cost

She is a second WebGL canvas, so she is not free — but she is bounded:

- the morph pass touches only the vertices the active expressions actually
  move, a few hundred out of 67,000, rather than re-uploading the mesh;
- the pointer is tracked through a ref, so following the cursor causes no
  React render at all;
- **Show her in the workspace**, unticked, unmounts the canvas entirely — the
  model stays imported and the GPU cost goes to zero;
- **Hair and skirt move**, unticked, drops the spring pass.

---

## Where the code is

```
src/core/companion/
  pmx.ts          the PMX reader — pure, no three.js, unit tested
  bundle.ts       finding the model in a drop and resolving its texture paths
  dialogue.ts     the line bank and the rules for choosing one
src/features/companion/
  buildModel.ts   PMX → scene graph, including the coordinate-system change
  materials.ts    toon, sphere and outline materials
  textures.ts     image decoding, alpha classification, toon ramp extraction
  rig.ts          blinking, breathing, look-at, spring bones, gestures
  CompanionStage.tsx  the canvas
  CompanionDock.tsx   the floating figure, bubble and controls
  CompanionPanel.tsx  the panel: import, placement, behaviour
src/integrations/companion/
  archive.ts      zip and folder reading, Shift-JIS entry names
  modelStore.ts   IndexedDB, and the reason it stops there
```

The parser stays a faithful description of the file: PMX is left-handed and
three.js is right-handed, and the conversion happens once, in `buildModel.ts`,
rather than being smeared across both.
