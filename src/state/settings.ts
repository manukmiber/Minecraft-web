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
import { DEFAULT_JAVA_TARGET_ID } from '../core/targets/javaProfiles'
import type { ModLoader } from '../core/targets/platforms'
import type { ReleaseChannel } from '../core/export/release'
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
  /** Minecraft version the Java exports target. */
  javaTargetProfileId: string
  author: string

  /**
   * What the last export built, remembered so the dialog opens on the same
   * targets rather than making you re-tick five boxes every time.
   */
  exportBedrock: boolean
  exportJavaLoaders: ModLoader[]
  /**
   * Whether an export publishes a release. On by default: the point of the
   * project repo is that every build is recoverable, and a build that only ever
   * existed in a downloads folder is not.
   */
  publishRelease: boolean
  /**
   * Channel a new export starts on. Alpha, because promoting a build to
   * release should be a deliberate act rather than the path of least
   * resistance.
   */
  releaseChannel: ReleaseChannel

  /** Purely visual: lets someone on a weak device calm the interface down. */
  reducedMotion: boolean

  set<K extends keyof SettingsState>(key: K, value: SettingsState[K]): void
  reset(): void
}

const DEFAULTS = {
  appRepo: 'manukmiber/Minecraft-web',
  githubToken: '',
  // The project repo the app was built around. Still only a default — anyone
  // can point this at their own repo, and the token decides what is reachable.
  githubOwner: 'manukmiber',
  githubRepo: 'plants-and-foods',
  githubBranch: 'main',
  workerPassphrase: '',
  defaultNamespace: DEFAULT_NAMESPACE,
  defaultTargetProfileId: DEFAULT_TARGET_ID,
  javaTargetProfileId: DEFAULT_JAVA_TARGET_ID,
  author: '',
  exportBedrock: true,
  exportJavaLoaders: [] as ModLoader[],
  publishRelease: true,
  releaseChannel: 'alpha' as ReleaseChannel,
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
