/**
 * Settings.
 *
 * Single-user by design: the GitHub token and the Worker passphrase live in
 * this browser's localStorage and are never sent anywhere except GitHub and
 * this app's own Worker. There is no account system to build and no server-side
 * copy to leak.
 */

import { create } from 'zustand'
import { persist } from 'zustand/middleware'

import { DEFAULT_TARGET_ID } from '../core/targets/profiles'
import { DEFAULT_NAMESPACE } from '../core/model/project'

export interface SettingsState {
  /** Repo holding this app's own source. Informational only. */
  appRepo: string

  /** The project repo — the actual database. */
  githubToken: string
  githubOwner: string
  githubRepo: string
  githubBranch: string

  /** Passphrase for this deployment's Worker, when it sets one. */
  workerPassphrase: string

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
  githubToken: '',
  githubOwner: '',
  githubRepo: '',
  githubBranch: 'main',
  workerPassphrase: '',
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
    { name: 'mmmmmmmmmmmmm.settings' },
  ),
)

/** True once the project repo is configured well enough to save. */
export function repoConfigured(state: SettingsState): boolean {
  return Boolean(state.githubToken && state.githubOwner && state.githubRepo && state.githubBranch)
}
