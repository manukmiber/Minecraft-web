/**
 * Bedrock box UV mapping for three.js.
 *
 * A Bedrock cube unwraps into the familiar cross layout on the texture sheet:
 *
 *          [  up  ][ down ]
 *   [right ][front ][ left ][ back ]
 *
 * three.js `BoxGeometry` lays its faces out as +X, -X, +Y, -Y, +Z, -Z with four
 * vertices each, so the mapping below rewrites that attribute rather than
 * building geometry by hand.
 */

import * as THREE from 'three'

export interface BoxUvInput {
  /** Top-left of the cube's block on the sheet, in pixels. */
  u: number
  v: number
  /** Cube size in model units. */
  width: number
  height: number
  depth: number
  /** Sheet size in pixels. */
  textureWidth: number
  textureHeight: number
  mirror?: boolean
}

interface Rect {
  x: number
  y: number
  w: number
  h: number
}

/**
 * Rewrites a BoxGeometry's uv attribute so it samples the right region of a
 * Bedrock texture sheet.
 */
export function applyBoxUv(geometry: THREE.BoxGeometry, input: BoxUvInput): void {
  const { u, v, width: w, height: h, depth: d, textureWidth: tw, textureHeight: th } = input

  // Faces in three.js order: +X, -X, +Y, -Y, +Z, -Z.
  // Minecraft's -Z is the front of the model, and its +X is the model's left.
  const east: Rect = { x: u + d + w, y: v + d, w: d, h }
  const west: Rect = { x: u, y: v + d, w: d, h }
  const up: Rect = { x: u + d, y: v, w, h: d }
  const down: Rect = { x: u + d + w, y: v, w, h: d }
  const south: Rect = { x: u + d + w + d, y: v + d, w, h }
  const north: Rect = { x: u + d, y: v + d, w, h }

  const faces = input.mirror
    ? [west, east, up, down, south, north]
    : [east, west, up, down, south, north]

  const uv = geometry.attributes.uv as THREE.BufferAttribute

  faces.forEach((rect, faceIndex) => {
    const u0 = rect.x / tw
    const u1 = (rect.x + rect.w) / tw
    // Image space runs top-down; UV space runs bottom-up.
    const v0 = 1 - (rect.y + rect.h) / th
    const v1 = 1 - rect.y / th

    const base = faceIndex * 4
    // BoxGeometry vertex order per face: top-left, top-right, bottom-left,
    // bottom-right.
    uv.setXY(base + 0, u0, v1)
    uv.setXY(base + 1, u1, v1)
    uv.setXY(base + 2, u0, v0)
    uv.setXY(base + 3, u1, v0)
  })

  uv.needsUpdate = true
}
