/**
 * Settings.
 *
 * Local by design: there is no account, no token and no server to talk to. The
 * few preferences here live in this browser's localStorage next to the save
 * slots in IndexedDB, and the deployed app is nothing but static files.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_TARGET_ID } from '../core/targets/profiles'
import { DEFAULT_NAMESPACE } from '../core/model/project'

export interface SettingsState {
  /** Repo holding this app's own source. Informational only. */
  appRepo: string

  defaultNamespace: string
  defaultTargetProfileId: string
  author: string

  /** Purely visual: lets someone on a weak device calm the interface down. */
  reducedMotion: boolean

  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void
  reset(): void
}

const DEFAULTS = {
  appRepo: 'manukmiber/Minecraft-web',
  defaultNamespace: DEFAULT_NAMESPACE,
  defaultTargetProfileId: DEFAULT_TARGET_ID,
  author: '',
  reducedMotion: false,
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      ...DEFAULTS,
      set: (key, value) => set({ [key]: value } as Partial<SettingsState>),
      reset: () => set({ ...DEFAULTS }),
    }),
    {
      name: 'mmmmmmmmmmmmm.settings',
      version: 2,
      // Version 1 stored a GitHub token and a Worker passphrase. Rebuilding the
      // state from the known keys drops them from localStorage on first load
      // instead of leaving credentials behind for storage this build no longer
      // has any use for.
      migrate: (persisted) => {
        const previous = (persisted ?? {}) as Partial<SettingsState>
        const next = { ...DEFAULTS }
        for (const key of Object.keys(DEFAULTS) as (keyof typeof DEFAULTS)[]) {
          const value = previous[key]
          if (typeof value === typeof DEFAULTS[key]) (next[key] as unknown) = value
        }
        return next as SettingsState
      },
      partialize: ({ set: _set, reset: _reset, ...rest }) => rest as SettingsState,
    },
  ),
)
