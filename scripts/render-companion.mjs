/**
 * Renders the companion to PNG, for the README and the docs.
 *
 * The app already draws this model in the 3D preview; this puts the same
 * geometry and the same sheet through a headless Chromium so the pictures in the
 * documentation are generated from the source rather than screenshotted by hand
 * and then quietly going stale.
 *
 *     node scripts/render-companion.mjs
 *
 * Writes `docs/images/companion-*.png`. Needs the artwork to exist, so run
 * `node scripts/make-companion.mjs` first if you have just changed the painter.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

import esbuild from 'esbuild'
import { chromium } from 'playwright'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const OUT_DIR = path.join(ROOT, 'docs/images')
const TMP = path.join(ROOT, 'node_modules/.tmp')

fs.mkdirSync(OUT_DIR, { recursive: true })
fs.mkdirSync(TMP, { recursive: true })

async function bundle(name, contents) {
  const outfile = path.join(TMP, name)
  await esbuild.build({
    stdin: { contents, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: name.endsWith('.iife.js') ? 'iife' : 'esm',
    platform: 'browser',
    outfile,
    logLevel: 'warning',
    absWorkingDir: ROOT,
  })
  return fs.readFileSync(outfile, 'utf8')
}

// The model, straight out of the app's own source.
const specModule = await bundle(
  'companion-spec.mjs',
  `import { COMPANION, FACE_EXPRESSIONS } from './src/core/generators/bodies/companion'
   export { COMPANION, FACE_EXPRESSIONS }`,
)
const specOut = path.join(TMP, 'companion-spec.mjs')
fs.writeFileSync(specOut, specModule)
const { COMPANION, FACE_EXPRESSIONS } = await import(pathToFileURL(specOut).href)

const three = await bundle(
  'three.iife.js',
  `import * as THREE from 'three'; globalThis.THREE = THREE`,
)

const skin = fs
  .readFileSync(path.join(ROOT, 'public/textures/companion/kohane/kohane.png'))
  .toString('base64')

/** One rendered figure: a rotation about Y, and which face variant to wear. */
const SHOTS = [
  {
    file: 'companion-turntable.png',
    background: '#12151d',
    face: 'smile',
    width: 340,
    height: 560,
    views: [180, 145, 90, 0],
  },
  {
    file: 'companion-portrait.png',
    background: '#f2ece2',
    face: 'smile',
    width: 620,
    height: 880,
    views: [206],
  },
  {
    file: 'companion-expressions.png',
    background: '#12151d',
    face: null,
    width: 250,
    height: 250,
    // One head-on bust per expression.
    views: FACE_EXPRESSIONS.map(() => 180),
    bust: true,
  },
]

const page = `<!doctype html><html><head><meta charset="utf-8"><style>
  html,body{margin:0}#sheet{display:flex;flex-wrap:wrap;width:fit-content}
  canvas{display:block}
</style></head><body><div id="sheet"></div>
<script>${three}<\/script>
<script>
const SPEC = ${JSON.stringify(COMPANION)};
const FACES = ${JSON.stringify(FACE_EXPRESSIONS)};
const UNIT = 1 / 16;

function applyBoxUv(geometry, cube, spec) {
  const [w, h, d] = cube.size;
  const [u, v] = cube.uv;
  const tw = spec.textureWidth, th = spec.textureHeight;
  const east = { x: u + d + w, y: v + d, w: d, h }, west = { x: u, y: v + d, w: d, h };
  const up = { x: u + d, y: v, w, h: d }, down = { x: u + d + w, y: v, w, h: d };
  const south = { x: u + d + w + d, y: v + d, w, h }, north = { x: u + d, y: v + d, w, h };
  const faces = cube.mirror ? [west, east, up, down, south, north] : [east, west, up, down, south, north];
  const uv = geometry.attributes.uv;
  faces.forEach((r, i) => {
    const u0 = r.x / tw, u1 = (r.x + r.w) / tw;
    const v0 = 1 - (r.y + r.h) / th, v1 = 1 - r.y / th;
    const b = i * 4;
    uv.setXY(b, u0, v1); uv.setXY(b + 1, u1, v1); uv.setXY(b + 2, u0, v0); uv.setXY(b + 3, u1, v0);
  });
  uv.needsUpdate = true;
}

function build(spec, material, face) {
  const root = new THREE.Group();
  const bones = new Map();
  const attach = (bone) => {
    if (bones.has(bone.name)) return bones.get(bone.name);
    const group = new THREE.Group();
    group.position.set(bone.pivot[0] * UNIT, bone.pivot[1] * UNIT, bone.pivot[2] * UNIT);
    if (bone.rotation) group.rotation.set(...bone.rotation.map((d) => d * Math.PI / 180));
    const hidden = bone.variant && bone.variant.name !== face;
    if (!hidden) {
      for (const cube of bone.cubes) {
        const inf = cube.inflate ?? 0;
        const size = cube.size.map((v) => Math.max(v + inf * 2, 0.0001));
        const geo = new THREE.BoxGeometry(size[0] * UNIT, size[1] * UNIT, size[2] * UNIT);
        applyBoxUv(geo, cube, spec);
        const mesh = new THREE.Mesh(geo, material);
        const pivot = cube.rotation ? (cube.pivot ?? bone.pivot) : bone.pivot;
        mesh.position.set(
          (cube.origin[0] - inf + size[0] / 2 - pivot[0]) * UNIT,
          (cube.origin[1] - inf + size[1] / 2 - pivot[1]) * UNIT,
          (cube.origin[2] - inf + size[2] / 2 - pivot[2]) * UNIT,
        );
        if (cube.rotation) {
          const hinge = new THREE.Group();
          hinge.position.set(
            (pivot[0] - bone.pivot[0]) * UNIT,
            (pivot[1] - bone.pivot[1]) * UNIT,
            (pivot[2] - bone.pivot[2]) * UNIT,
          );
          hinge.rotation.set(...cube.rotation.map((d) => d * Math.PI / 180));
          hinge.add(mesh);
          group.add(hinge);
        } else group.add(mesh);
      }
    }
    bones.set(bone.name, group);
    const parent = bone.parent ? spec.bones.find((b) => b.name === bone.parent) : undefined;
    if (parent) {
      const pg = attach(parent);
      group.position.set(
        (bone.pivot[0] - parent.pivot[0]) * UNIT,
        (bone.pivot[1] - parent.pivot[1]) * UNIT,
        (bone.pivot[2] - parent.pivot[2]) * UNIT,
      );
      pg.add(group);
    } else root.add(group);
    return group;
  };
  for (const bone of spec.bones) attach(bone);
  return root;
}

window.renderShot = (shot, textureUrl) => new Promise((resolve) => {
  new THREE.TextureLoader().load(textureUrl, (tex) => {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
    tex.colorSpace = THREE.SRGBColorSpace;
    const material = new THREE.MeshLambertMaterial({
      map: tex, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide,
    });

    const sheet = document.getElementById('sheet');
    sheet.innerHTML = '';
    sheet.style.background = shot.background;
    sheet.style.width = shot.bust ? (shot.width * 4) + 'px' : 'fit-content';

    shot.views.forEach((angle, index) => {
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
      renderer.setSize(shot.width, shot.height);
      renderer.setPixelRatio(2);
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      sheet.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      scene.add(new THREE.AmbientLight(0xffffff, 1.45));
      const key = new THREE.DirectionalLight(0xfff4e6, 1.5); key.position.set(4, 7, 6); scene.add(key);
      const fill = new THREE.DirectionalLight(0xcfe0ff, 0.6); fill.position.set(-5, 2, -4); scene.add(fill);
      const rim = new THREE.DirectionalLight(0xffd9ea, 0.7); rim.position.set(0, 3, -7); scene.add(rim);

      const face = shot.face ?? FACES[index];
      const pivot = new THREE.Group();
      pivot.add(build(SPEC, material, face));
      pivot.rotation.y = angle * Math.PI / 180;
      scene.add(pivot);

      const camera = new THREE.PerspectiveCamera(28, shot.width / shot.height, 0.01, 100);
      const box = new THREE.Box3().setFromObject(pivot);
      const centre = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      if (shot.bust) {
        // Frame the head only: everything above the shoulders.
        const top = box.max.y;
        const height = 0.86;
        const dist = height / 2 / Math.tan(28 * Math.PI / 360) * 1.15;
        const eye = top - height * 0.5;
        camera.position.set(centre.x, eye, centre.z + dist);
        camera.lookAt(centre.x, eye, centre.z);
      } else {
        const fov = 28 * Math.PI / 360;
        const dist = Math.max(
          size.y / 2 / Math.tan(fov),
          Math.max(size.x, size.z) / 2 / Math.tan(fov) / (shot.width / shot.height),
        ) * 1.3;
        camera.position.set(centre.x, centre.y + size.y * 0.05, centre.z + dist);
        camera.lookAt(centre.x, centre.y, centre.z);
      }
      renderer.render(scene, camera);
    });

    resolve(true);
  });
});
<\/script></body></html>`

const pageFile = path.join(TMP, 'render-companion.html')
fs.writeFileSync(pageFile, page)

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? undefined,
})
const tab = await browser.newPage({ viewport: { width: 1400, height: 1000 } })
await tab.goto(pathToFileURL(pageFile).href)

for (const shot of SHOTS) {
  await tab.evaluate(
    ([config, url]) => window.renderShot(config, url),
    [shot, `data:image/png;base64,${skin}`],
  )
  await tab.waitForTimeout(200)
  const sheet = await tab.$('#sheet')
  await sheet.screenshot({ path: path.join(OUT_DIR, shot.file) })
  console.log(`${shot.file.padEnd(30)} ${shot.views.length} view(s)`)
}

await browser.close()
console.log(`\nWrote ${SHOTS.length} images to ${path.relative(ROOT, OUT_DIR)}.`)
