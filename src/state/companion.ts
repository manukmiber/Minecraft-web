/**
 * The companion's own state.
 *
 * Split deliberately in two. The settings — whether she is here at all, where
 * she stands, how much she talks — are persisted to localStorage like the rest
 * of the workspace. The model itself is not: it lives in IndexedDB, because it
 * is megabytes of someone else's artwork rather than a preference, and it is
 * loaded back on start rather than shipped with the app.
 *
 * The built scene graph hangs off this store too. It is a stable object
 * reference that changes only on import, so components can hold it without
 * re-rendering every frame — the animation runs inside three.js, not React.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import {
  RESTING_MOOD,
  speak,
  type ChatterLevel,
  type CompanionEvent,
  type CompanionGestureName,
  type CompanionMoodName,
} from '../core/companion/dialogue'
import { chooseModel, type ModelBundle } from '../core/companion/bundle'
import { readModelArchive } from '../integrations/companion/archive'
import {
  clearCompanionModel,
  loadCompanionModel,
  saveCompanionModel,
  storedToBundle,
} from '../integrations/companion/modelStore'
import { buildCompanionModel, type CompanionAsset } from '../features/companion/buildModel'

export type CompanionCorner = 'bottom-right' | 'bottom-left'

export type CompanionStatus = 'absent' | 'loading' | 'ready' | 'error'

export interface CompanionBubble {
  id: number
  text: string
  mood: CompanionMoodName
  gesture?: CompanionGestureName
  /** Epoch milliseconds after which the bubble should clear itself. */
  until: number
}

export const COMPANION_MIN_SIZE = 160
export const COMPANION_MAX_SIZE = 520

interface CompanionState {
  // -- persisted -----------------------------------------------------------
  enabled: boolean
  corner: CompanionCorner
  /** Stage height in pixels; the width follows from it. */
  size: number
  /** Nudge away from the corner, so she can be moved out of the way. */
  offsetX: number
  offsetY: number
  chatter: ChatterLevel
  sway: boolean
  /** Remembers which model was loaded, so the label survives a reload. */
  modelLabel: string | null

  // -- runtime -------------------------------------------------------------
  status: CompanionStatus
  error: string | null
  warnings: string[]
  asset: CompanionAsset | null
  /** Normalised path of the model in use, and the others in the same archive. */
  modelPath: string | null
  alternates: Array<{ path: string; label: string }>
  bubble: CompanionBubble | null
  mood: CompanionMoodName
  /** Bumped to ask the stage to play a one-off gesture. */
  gesture: { name: CompanionGestureName; id: number } | null

  // -- actions -------------------------------------------------------------
  setEnabled(enabled: boolean): void
  setCorner(corner: CompanionCorner): void
  setSize(size: number): void
  nudge(dx: number, dy: number): void
  resetPlacement(): void
  setChatter(chatter: ChatterLevel): void
  setSway(sway: boolean): void

  /** Reads a dropped zip or folder, stores it, and builds the scene. */
  importModel(files: File[] | FileList): Promise<void>
  /** Brings back whatever was imported last time. */
  restore(): Promise<void>
  /** Swaps to another `.pmx` in the archive already imported. */
  switchModel(path: string): Promise<void>
  forget(): Promise<void>

  say(event: CompanionEvent, detail?: string): void
  clearBubble(id: number): void
  play(gesture: CompanionGestureName): void
}

let bubbleSequence = 0
let gestureSequence = 0

async function build(
  bundle: ModelBundle,
  label: string,
  set: (partial: Partial<CompanionState>) => void,
  previous: CompanionAsset | null,
  names: Map<string, string>,
) {
  const asset = await buildCompanionModel(bundle)
  set({
    asset,
    status: 'ready',
    error: null,
    warnings: asset.warnings,
    modelLabel: label,
    modelPath: bundle.modelPath,
    alternates: bundle.alternates.map((path) => ({ path, label: names.get(path) ?? path })),
  })

  // The replaced model is still in the scene graph until React has swapped the
  // primitive over, so freeing its buffers now would pull them out from under a
  // frame that is already in flight.
  if (previous) window.setTimeout(() => previous.dispose(), 1000)
}

export const useCompanion = create<CompanionState>()(
  persist(
    (set, get) => ({
      enabled: true,
      corner: 'bottom-right',
      size: 260,
      offsetX: 0,
      offsetY: 0,
      chatter: 'normal',
      sway: true,
      modelLabel: null,

      status: 'absent',
      error: null,
      warnings: [],
      asset: null,
      modelPath: null,
      alternates: [],
      bubble: null,
      mood: RESTING_MOOD,
      gesture: null,

      setEnabled: (enabled) => set({ enabled }),
      setCorner: (corner) => set({ corner, offsetX: 0, offsetY: 0 }),
      setSize: (size) =>
        set({ size: Math.min(COMPANION_MAX_SIZE, Math.max(COMPANION_MIN_SIZE, Math.round(size))) }),
      nudge: (dx, dy) => set({ offsetX: get().offsetX + dx, offsetY: get().offsetY + dy }),
      resetPlacement: () => set({ offsetX: 0, offsetY: 0 }),
      setChatter: (chatter) => set({ chatter }),
      setSway: (sway) => set({ sway }),

      async importModel(files) {
        set({ status: 'loading', error: null, warnings: [] })
        try {
          const archive = await readModelArchive(files)
          const bundle = chooseModel(archive)
          const label = archive.displayNames.get(bundle.modelPath) ?? bundle.modelPath
          await saveCompanionModel(bundle, label)
          await build(bundle, label, set, get().asset, archive.displayNames)
          get().say('greeting')
        } catch (error) {
          set({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },

      async restore() {
        if (get().status === 'loading' || get().asset) return
        const stored = await loadCompanionModel()
        if (!stored) {
          set({ status: 'absent' })
          return
        }
        set({ status: 'loading', error: null })
        try {
          await build(storedToBundle(stored), stored.label, set, get().asset, stored.displayNames)
        } catch (error) {
          set({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },

      async switchModel(path) {
        const stored = await loadCompanionModel()
        if (!stored) return
        set({ status: 'loading', error: null, warnings: [] })
        try {
          // Re-chosen from the archive already on disk: a model that ships
          // three outfits should not have to be dropped in three times.
          const bundle = chooseModel(
            { files: stored.files, displayNames: stored.displayNames },
            path,
          )
          const label = stored.displayNames.get(bundle.modelPath) ?? bundle.modelPath
          await saveCompanionModel(bundle, label)
          await build(bundle, label, set, get().asset, stored.displayNames)
        } catch (error) {
          set({
            status: 'error',
            error: error instanceof Error ? error.message : String(error),
          })
        }
      },

      async forget() {
        get().asset?.dispose()
        await clearCompanionModel()
        set({
          asset: null,
          status: 'absent',
          modelLabel: null,
          modelPath: null,
          alternates: [],
          warnings: [],
          bubble: null,
        })
      },

      say(event, detail) {
        const { chatter, bubble, asset } = get()
        // Nothing to say through, and nothing to say it with.
        if (!asset) return
        const line = speak({ event, detail, level: chatter, previous: bubble?.text ?? null })
        if (!line) return

        bubbleSequence += 1
        set({
          bubble: {
            id: bubbleSequence,
            text: line.text,
            mood: line.mood,
            gesture: line.gesture,
            until: Date.now() + line.hold,
          },
          mood: line.mood,
        })
        if (line.gesture) get().play(line.gesture)
      },

      clearBubble(id) {
        if (get().bubble?.id !== id) return
        set({ bubble: null, mood: RESTING_MOOD })
      },

      play(name) {
        gestureSequence += 1
        set({ gesture: { name, id: gestureSequence } })
      },
    }),
    {
      name: 'mmmmmmmmmmmmm.companion',
      partialize: (state) => ({
        enabled: state.enabled,
        corner: state.corner,
        size: state.size,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
        chatter: state.chatter,
        sway: state.sway,
        modelLabel: state.modelLabel,
      }),
    },
  ),
)
