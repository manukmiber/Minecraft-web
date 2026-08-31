/**
 * Reading an existing PNG back into an editable pixel buffer.
 *
 * This is the one part of the editor that needs the browser: decoding is left
 * to the image pipeline rather than reimplemented. Writing goes the other way
 * through `png.ts`, so a texture that is opened, edited and saved keeps its
 * exact colours.
 */

import { createCanvas, type PixelCanvas } from './engine'

export async function canvasFromBlob(blob: Blob, fallbackSize: number): Promise<PixelCanvas> {
  const url = URL.createObjectURL(blob)
  try {
    const image = await loadImage(url)
    const width = image.naturalWidth || fallbackSize
    const height = image.naturalHeight || fallbackSize

    const surface = document.createElement('canvas')
    surface.width = width
    surface.height = height
    const context = surface.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('This browser did not give us a 2D canvas to read the PNG with.')
    context.imageSmoothingEnabled = false
    context.drawImage(image, 0, 0)

    const data = context.getImageData(0, 0, width, height)
    const canvas = createCanvas(width, height)
    canvas.pixels.set(data.data)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('That file could not be decoded as an image.'))
    image.src = url
  })
}
