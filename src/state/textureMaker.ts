/**
 * The pixel editor's opening mechanism.
 *
 * The editor is one component mounted once by the shell; anywhere that needs a
 * texture — a slot on the wizard, the new-item form inside the recipe builder,
 * the texture studio — calls `openTextureMaker` with what it wants back. That
 * is why drawing an icon never navigates away from what you were doing.
 */

import { create } from 'zustand'

import type { AssetRef } from '../core/model/types'
import type { UvRegion } from '../core/generators/geometry'

export interface TextureMakerRequest {
  /** Shown in the editor's header, e.g. "Frying Pan · Icon". */
  title: string
  /** Starting canvas size in pixels. */
  size: number
  /** Sheet the drawing has to fit, for entity skins with a fixed UV layout. */
  sheet?: { width: number; height: number } | null
  /** Named patches of the sheet, drawn as a template behind the grid. */
  uvTemplate?: UvRegion[] | null
  /** Existing texture to open for editing. */
  startFrom?: AssetRef | null
  /** File name suggestion for the saved PNG. */
  fileName?: string
  /** Called once the PNG has been imported through the normal asset pipeline. */
  onSave(asset: AssetRef): void
}

interface TextureMakerState {
  request: TextureMakerRequest | null
  open(request: TextureMakerRequest): void
  close(): void
}

export const useTextureMaker = create<TextureMakerState>((set) => ({
  request: null,
  open: (request) => set({ request }),
  close: () => set({ request: null }),
}))

export function openTextureMaker(request: TextureMakerRequest): void {
  useTextureMaker.getState().open(request)
}
