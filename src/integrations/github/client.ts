/**
 * GitHub is the database.
 *
 * There is no D1, no KV and no server-side state: a project's save slots, its
 * preset inbox and its changelog all live as files in a repo, and version
 * history comes free with it. Writes go through the Git Data API so a Save is a
 * single commit containing the model, its textures and the changelog entry
 * together — never a half-written state.
 */

export interface GitHubConfig {
  token: string
  owner: string
  repo: string
  branch: string
}

export interface RepoEntry {
  name: string
  path: string
  type: 'file' | 'dir'
  sha: string
  size: number
}

/** A file to include in the next commit. `content === null` deletes it. */
export interface PendingFile {
  path: string
  content: string | ArrayBuffer | null
}

export interface CommitResult {
  sha: string
  url: string
}

/** A release as this app cares about it. */
export interface ReleaseSummary {
  id: number
  tagName: string
  name: string
  prerelease: boolean
  draft: boolean
  htmlUrl: string
  createdAt: string
  assets: Array<{ name: string; size: number; downloadUrl: string }>
}

export interface CreateReleaseInput {
  tagName: string
  name: string
  body: string
  prerelease: boolean
  /** Marks this the repository's "latest release". Stable builds only. */
  makeLatest: boolean
  /** Branch or commit the tag is cut from. */
  targetCommitish: string
}

const API = 'https://api.github.com'
/** Release assets do not go through api.github.com; uploads have their own host. */
const UPLOADS = 'https://uploads.github.com'

function toBase64(bytes: ArrayBuffer): string {
  const view = new Uint8Array(bytes)
  let binary = ''
  // Chunked so a large texture does not blow the argument limit of fromCharCode.
  const CHUNK = 0x8000
  for (let i = 0; i < view.length; i += CHUNK) {
    binary += String.fromCharCode(...view.subarray(i, i + CHUNK))
  }
  return btoa(binary)
}

function fromBase64(value: string): ArrayBuffer {
  const binary = atob(value.replace(/\n/g, ''))
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return bytes.buffer
}

function utf8ToBase64(value: string): string {
  return toBase64(new TextEncoder().encode(value).buffer as ArrayBuffer)
}

export class GitHubError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message)
    this.name = 'GitHubError'
  }
}

export class GitHubClient {
  constructor(private config: GitHubConfig) {}

  setConfig(config: GitHubConfig): void {
    this.config = config
  }

  get configured(): boolean {
    return Boolean(this.config.token && this.config.owner && this.config.repo)
  }

  private get base(): string {
    return `${API}/repos/${this.config.owner}/${this.config.repo}`
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(path.startsWith('http') ? path : `${this.base}${path}`, {
      ...init,
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.config.token}`,
        'x-github-api-version': '2022-11-28',
        ...(init.body ? { 'content-type': 'application/json' } : {}),
        ...(init.headers ?? {}),
      },
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        const body = (await response.json()) as { message?: string }
        if (body.message) detail = body.message
      } catch {
        // Keep the status text.
      }
      if (response.status === 401) {
        detail = 'GitHub rejected the token. Check it in Settings.'
      } else if (response.status === 404) {
        detail = `Not found: ${path}. Check the repository name and branch in Settings.`
      }
      throw new GitHubError(detail, response.status)
    }

    if (response.status === 204) return undefined as T
    return (await response.json()) as T
  }

  /** Confirms the token and repo work before the user tries to save. */
  async verify(): Promise<{ fullName: string; defaultBranch: string; canPush: boolean }> {
    const repo = await this.request<{
      full_name: string
      default_branch: string
      permissions?: { push?: boolean }
    }>('')
    return {
      fullName: repo.full_name,
      defaultBranch: repo.default_branch,
      canPush: repo.permissions?.push !== false,
    }
  }

  async listDirectory(path: string): Promise<RepoEntry[]> {
    try {
      const entries = await this.request<RepoEntry[] | RepoEntry>(
        `/contents/${encodeURI(path)}?ref=${encodeURIComponent(this.config.branch)}`,
      )
      return Array.isArray(entries) ? entries : [entries]
    } catch (error) {
      // An empty project repo simply has no such folder yet.
      if (error instanceof GitHubError && error.status === 404) return []
      throw error
    }
  }

  async readText(path: string): Promise<string | null> {
    const bytes = await this.readBinary(path)
    return bytes === null ? null : new TextDecoder().decode(bytes)
  }

  async readBinary(path: string): Promise<ArrayBuffer | null> {
    try {
      const file = await this.request<{ content: string; encoding: string }>(
        `/contents/${encodeURI(path)}?ref=${encodeURIComponent(this.config.branch)}`,
      )
      if (file.encoding !== 'base64') return null
      return fromBase64(file.content)
    } catch (error) {
      if (error instanceof GitHubError && error.status === 404) return null
      throw error
    }
  }

  /**
   * Commits a set of files in one go. Everything the caller passes lands in a
   * single commit, so a save is never partially visible.
   */
  async commit(message: string, files: PendingFile[]): Promise<CommitResult> {
    if (files.length === 0) throw new Error('Nothing to commit.')

    const branch = this.config.branch
    const ref = await this.request<{ object: { sha: string } }>(
      `/git/ref/heads/${encodeURIComponent(branch)}`,
    )
    const headSha = ref.object.sha
    const headCommit = await this.request<{ tree: { sha: string } }>(`/git/commits/${headSha}`)

    const tree: Array<Record<string, unknown>> = []
    for (const file of files) {
      if (file.content === null) {
        tree.push({ path: file.path, mode: '100644', type: 'blob', sha: null })
        continue
      }
      const isText = typeof file.content === 'string'
      const blob = await this.request<{ sha: string }>('/git/blobs', {
        method: 'POST',
        body: JSON.stringify({
          content: isText
            ? utf8ToBase64(file.content as string)
            : toBase64(file.content as ArrayBuffer),
          encoding: 'base64',
        }),
      })
      tree.push({ path: file.path, mode: '100644', type: 'blob', sha: blob.sha })
    }

    const newTree = await this.request<{ sha: string }>('/git/trees', {
      method: 'POST',
      body: JSON.stringify({ base_tree: headCommit.tree.sha, tree }),
    })

    const commit = await this.request<{ sha: string; html_url: string }>('/git/commits', {
      method: 'POST',
      body: JSON.stringify({ message, tree: newTree.sha, parents: [headSha] }),
    })

    await this.request(`/git/refs/heads/${encodeURIComponent(branch)}`, {
      method: 'PATCH',
      body: JSON.stringify({ sha: commit.sha, force: false }),
    })

    return { sha: commit.sha, url: commit.html_url }
  }

  // -- releases --------------------------------------------------------------

  /**
   * Every release tag in the repo.
   *
   * Read before every publish so the next alpha build number comes from what is
   * actually there rather than from a counter in one browser's local storage —
   * two people exporting at once would otherwise both claim `alpha.3`.
   */
  async listReleaseTags(): Promise<string[]> {
    const tags: string[] = []
    // 100 is the API maximum; a project with more releases than that has older
    // ones that cannot affect the next build number anyway.
    const releases = await this.request<Array<{ tag_name: string }>>('/releases?per_page=100')
    for (const release of releases) tags.push(release.tag_name)
    return tags
  }

  async listReleases(limit = 30): Promise<ReleaseSummary[]> {
    const releases = await this.request<
      Array<{
        id: number
        tag_name: string
        name: string | null
        prerelease: boolean
        draft: boolean
        html_url: string
        created_at: string
        assets?: Array<{ name: string; size: number; browser_download_url: string }>
      }>
    >(`/releases?per_page=${Math.min(100, Math.max(1, limit))}`)

    return releases.map((release) => ({
      id: release.id,
      tagName: release.tag_name,
      name: release.name ?? release.tag_name,
      prerelease: release.prerelease,
      draft: release.draft,
      htmlUrl: release.html_url,
      createdAt: release.created_at,
      assets: (release.assets ?? []).map((asset) => ({
        name: asset.name,
        size: asset.size,
        downloadUrl: asset.browser_download_url,
      })),
    }))
  }

  async createRelease(input: CreateReleaseInput): Promise<{ id: number; htmlUrl: string; uploadUrl: string }> {
    const release = await this.request<{ id: number; html_url: string; upload_url: string }>(
      '/releases',
      {
        method: 'POST',
        body: JSON.stringify({
          tag_name: input.tagName,
          target_commitish: input.targetCommitish,
          name: input.name,
          body: input.body,
          draft: false,
          prerelease: input.prerelease,
          // GitHub only accepts the string form here, not a boolean.
          make_latest: input.makeLatest ? 'true' : 'false',
        }),
      },
    )
    return { id: release.id, htmlUrl: release.html_url, uploadUrl: release.upload_url }
  }

  /**
   * Attaches one file to a release.
   *
   * Assets go to uploads.github.com with the raw bytes as the body, not to the
   * JSON API — so this bypasses `request`, which would set a JSON content type
   * and corrupt the archive.
   */
  async uploadReleaseAsset(
    releaseId: number,
    fileName: string,
    bytes: ArrayBuffer,
    contentType = 'application/zip',
  ): Promise<{ name: string; downloadUrl: string }> {
    const url = `${UPLOADS}/repos/${this.config.owner}/${this.config.repo}/releases/${releaseId}/assets?name=${encodeURIComponent(fileName)}`

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        accept: 'application/vnd.github+json',
        authorization: `Bearer ${this.config.token}`,
        'x-github-api-version': '2022-11-28',
        'content-type': contentType,
        'content-length': String(bytes.byteLength),
      },
      body: bytes,
    })

    if (!response.ok) {
      let detail = response.statusText
      try {
        const body = (await response.json()) as { message?: string }
        if (body.message) detail = body.message
      } catch {
        // Keep the status text.
      }
      throw new GitHubError(`Uploading ${fileName} failed: ${detail}`, response.status)
    }

    const asset = (await response.json()) as { name: string; browser_download_url: string }
    return { name: asset.name, downloadUrl: asset.browser_download_url }
  }

  /**
   * Removes a release. Used only to clean up after a failed asset upload — a
   * release whose files are missing is worse than no release at all, because it
   * takes the tag with it and blocks the retry.
   */
  async deleteRelease(releaseId: number): Promise<void> {
    await this.request(`/releases/${releaseId}`, { method: 'DELETE' })
  }
}
