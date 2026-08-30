/**
 * The long-lived clients, wired from settings.
 *
 * Kept outside React so a settings change re-points the existing instances
 * instead of tearing down in-flight work.
 */

import { AssetStore } from '../integrations/assets/store'
import { GitHubClient } from '../integrations/github/client'
import { ProjectRepo } from '../integrations/github/projectRepo'
import { R2Client } from '../integrations/r2/client'
import { useSettings } from './settings'

const initial = useSettings.getState()

export const r2 = new R2Client(initial.workerPassphrase)
export const assets = new AssetStore(r2)
export const github = new GitHubClient({
  token: initial.githubToken,
  owner: initial.githubOwner,
  repo: initial.githubRepo,
  branch: initial.githubBranch,
})
export const projectRepo = new ProjectRepo(github)

useSettings.subscribe((state) => {
  r2.setPassphrase(state.workerPassphrase)
  github.setConfig({
    token: state.githubToken,
    owner: state.githubOwner,
    repo: state.githubRepo,
    branch: state.githubBranch,
  })
})
