/**
 * PMX materials, translated into three.js.
 *
 * `MeshToonMaterial` is the right base — MMD is cel shading and so is this —
 * but it needs three amendments to look like the model its author saw:
 *
 * 1. three reads only the red channel of a gradient map, which throws away the
 *    warm shadow tint most toon ramps are made for. One string replacement in
 *    the shader reads all three channels instead.
 * 2. MMD's sphere maps (`.spa` additive, `.sph` multiplicative) have no
 *    equivalent in any stock three material, so they are injected after
 *    lighting.
 * 3. The black outline every MMD model has is an inverted hull, which needs a
 *    second material per group and a vertex shader that pushes along the
 *    normal by the per-vertex edge scale.
 *
 * Each amendment is written so that failing to apply is harmless: if a future
 * three.js renames a chunk, the replacement simply does not match and the
 * material renders without that one refinement rather than not at all.
 */

import * as THREE from 'three'

import { MATERIAL_FLAG, type PmxMaterial, type PmxModel } from '../../core/companion/pmx'
import { defaultToonGradient, toonGradientFrom, type DecodedTexture } from './textures'

/**
 * A multiplier over every material's own edge size, shared by all of them so
 * the whole outline can be thickened or turned off in one assignment.
 */
export interface OutlineScale {
  value: number
}

export interface BuiltMaterials {
  /** One per material group, in PMX order. */
  surface: THREE.Material[]
  /** Parallel to `surface`; groups with no outline get an invisible stand-in. */
  outline: THREE.Material[]
  dispose(): void
}

/**
 * Edge width as a fraction of half the viewport height, per unit of the
 * material's own `edgeSize`. MMD's outlines are a screen-space effect, so this
 * is deliberately not in world units: the line stays the same weight whether
 * the companion is docked at 160px or opened up to fill a panel.
 */
const EDGE_UNIT = 0.004

function patchGradientColour(shader: { fragmentShader: string }): void {
  shader.fragmentShader = shader.fragmentShader.replace(
    'return vec3( texture2D( gradientMap, coord ).r );',
    'return texture2D( gradientMap, coord ).rgb;',
  )
}

function patchSphereMap(
  shader: { fragmentShader: string; uniforms: Record<string, THREE.IUniform> },
  map: THREE.Texture,
  additive: boolean,
): void {
  shader.uniforms.sphereMap = { value: map }
  shader.fragmentShader = shader.fragmentShader
    .replace('void main() {', 'uniform sampler2D sphereMap;\nvoid main() {')
    .replace(
      '#include <dithering_fragment>',
      [
        // MMD projects the view-space normal straight onto the sphere image.
        'vec2 mmdSphereUv = normalize( vNormal ).xy * 0.5 + 0.5;',
        'vec4 mmdSphere = texture2D( sphereMap, vec2( mmdSphereUv.x, 1.0 - mmdSphereUv.y ) );',
        additive
          ? 'gl_FragColor.rgb += mmdSphere.rgb;'
          : 'gl_FragColor.rgb *= mmdSphere.rgb;',
        '#include <dithering_fragment>',
      ].join('\n'),
    )
}

function surfaceMaterial(
  material: PmxMaterial,
  diffuseMap: DecodedTexture | null,
  sphereMap: DecodedTexture | null,
  gradient: THREE.Texture,
): THREE.Material {
  const [r, g, b, opacity] = material.diffuse
  const alpha = diffuseMap?.alpha ?? 'none'

  const three = new THREE.MeshToonMaterial({
    name: material.name,
    color: new THREE.Color(r, g, b),
    map: diffuseMap?.texture ?? null,
    gradientMap: gradient,
    side: material.flags & MATERIAL_FLAG.noCull ? THREE.DoubleSide : THREE.FrontSide,
  })

  three.opacity = opacity
  // Cut-out and translucent are different problems. A cut-out texture wants a
  // hard alpha test and no sorting at all; a soft one has to be sorted, but
  // still writes depth, because an MMD model is mostly self-overlapping hair
  // and skirt and the alternative is worse than the sorting error.
  if (alpha === 'binary' && opacity >= 1) {
    three.alphaTest = 0.5
    three.transparent = false
  } else if (alpha !== 'none' || opacity < 1) {
    three.transparent = true
    three.depthWrite = true
    three.alphaTest = 0.02
  }

  // Materials the author left at zero opacity are overlays a morph switches
  // on; drawing them costs a pass and shows nothing.
  if (opacity <= 0) three.visible = false

  three.onBeforeCompile = (shader) => {
    patchGradientColour(shader)
    if (sphereMap && material.sphereMode !== 'none' && material.sphereMode !== 'sub-texture') {
      patchSphereMap(
        shader as unknown as { fragmentShader: string; uniforms: Record<string, THREE.IUniform> },
        sphereMap.texture,
        material.sphereMode === 'add',
      )
    }
  }
  // Two materials that compile to different shaders must not share a program.
  three.customProgramCacheKey = () => `mmd-toon:${material.sphereMode}:${sphereMap ? 1 : 0}`

  return three
}

/**
 * The inverted hull.
 *
 * Back faces only, pushed out along the skinned normal. Everything about it is
 * per-vertex except the thickness, which is shared so the whole outline can be
 * rescaled in one assignment when the camera moves.
 */
function outlineMaterial(material: PmxMaterial, scale: OutlineScale): THREE.Material {
  const hasEdge = (material.flags & MATERIAL_FLAG.hasEdge) !== 0
  const [r, g, b, alpha] = material.edgeColor

  const three = new THREE.MeshBasicMaterial({
    name: `${material.name} outline`,
    color: new THREE.Color(r, g, b),
    side: THREE.BackSide,
    transparent: alpha < 1,
    opacity: alpha,
  })
  three.visible = hasEdge && material.edgeSize > 0 && material.diffuse[3] > 0

  const thickness = { value: material.edgeSize * EDGE_UNIT }

  three.onBeforeCompile = (shader) => {
    shader.uniforms.outlineThickness = thickness
    shader.uniforms.outlineScale = scale as THREE.IUniform
    shader.vertexShader = shader.vertexShader
      .replace(
        'void main() {',
        [
          'attribute float edgeScale;',
          'uniform float outlineThickness;',
          'uniform float outlineScale;',
          'varying float vEdge;',
          'void main() {',
        ].join('\n'),
      )
      // Pushed out after projection rather than along the normal in world
      // space. A world-space hull has to be re-tuned for every model scale and
      // camera distance; a clip-space one is the same line weight always.
      // `objectNormal` is the skinned normal and is still in scope here;
      // `transformedNormal` is not usable because three flips it for a
      // back-facing material, which would pull the hull inwards.
      .replace(
        '#include <project_vertex>',
        [
          '#include <project_vertex>',
          'vEdge = edgeScale;',
          'vec4 mmdClipNormal = projectionMatrix * vec4( normalize( normalMatrix * objectNormal ), 0.0 );',
          'float mmdLength = max( length( mmdClipNormal.xy ), 1e-5 );',
          'gl_Position.xy += ( mmdClipNormal.xy / mmdLength ) * edgeScale * outlineThickness * outlineScale * gl_Position.w;',
        ].join('\n'),
      )
    // A vertex the author gave a zero edge scale should have no outline at
    // all, rather than a hairline sitting exactly on the silhouette.
    shader.fragmentShader = shader.fragmentShader
      .replace('void main() {', 'varying float vEdge;\nvoid main() {')
      .replace(
        '#include <clipping_planes_fragment>',
        '#include <clipping_planes_fragment>\nif ( vEdge < 0.001 ) discard;',
      )
  }
  three.customProgramCacheKey = () => 'mmd-outline'

  return three
}

/**
 * Builds every material in the model, sharing one decoded texture between the
 * materials that reference it.
 */
export function buildMaterials(
  model: PmxModel,
  textures: Map<number, DecodedTexture>,
  scale: OutlineScale,
): BuiltMaterials {
  const fallbackToon = defaultToonGradient()
  const gradients = new Map<number, THREE.Texture>()

  const gradientFor = (material: PmxMaterial): THREE.Texture => {
    // A shared toon is one of MMD's built-in ramps, which do not ship with the
    // model and so cannot be honoured; everything else comes from the file.
    if (material.toonShared || material.toonIndex < 0) return fallbackToon
    const cached = gradients.get(material.toonIndex)
    if (cached) return cached
    const source = textures.get(material.toonIndex)
    const gradient = source?.pixels ? toonGradientFrom(source.pixels) : fallbackToon
    gradients.set(material.toonIndex, gradient)
    return gradient
  }

  const surface: THREE.Material[] = []
  const outline: THREE.Material[] = []

  for (const material of model.materials) {
    surface.push(
      surfaceMaterial(
        material,
        textures.get(material.textureIndex) ?? null,
        textures.get(material.sphereTextureIndex) ?? null,
        gradientFor(material),
      ),
    )
    outline.push(outlineMaterial(material, scale))
  }

  return {
    surface,
    outline,
    dispose() {
      for (const material of [...surface, ...outline]) material.dispose()
      for (const gradient of gradients.values()) gradient.dispose()
      fallbackToon.dispose()
    },
  }
}
