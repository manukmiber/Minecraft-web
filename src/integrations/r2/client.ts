/**
 * Client for the Worker's R2 proxy.
 *
 * The browser never sees an R2 credential — it talks to `/api/r2/*` and the
 * Worker uses its binding. The only secret held locally is the app passphrase,
 * and only when the deployment sets one.
 */

export interface R2Object {
  key: string
  size: number
  uploaded: string
  etag: string
}

export interface WorkerHealth {
  ok: boolean
  app: string
  authRequired: boolean
  bucketBound: boolean
}

export class R2Client {
  constructor(private passphrase: string) {}

  setPassphrase(passphrase: string): void {
    this.passphrase = passphrase
  }

  private headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.passphrase ? { ...extra, 'x-app-key': this.passphrase } : extra
  }

  async health(): Promise<WorkerHealth | null> {
    try {
      const response = await fetch('/api/health')
      if (!response.ok) return null
      return (await response.json()) as WorkerHealth
    } catch {
      // Running `vite dev` without the Worker is a normal state, not an error.
      return null
    }
  }

  async put(key: string, data: ArrayBuffer | Blob, contentType: string): Promise<string> {
    const response = await fetch(`/api/r2/object?key=${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: this.headers({ 'x-content-type': contentType }),
      body: data,
    })
    if (!response.ok) {
      throw new Error(await describeFailure(response, `Upload of ${key} failed`))
    }
    const result = (await response.json()) as { key: string }
    return result.key
  }

  async get(key: string): Promise<ArrayBuffer | null> {
    const response = await fetch(`/api/r2/object?key=${encodeURIComponent(key)}`, {
      headers: this.headers(),
    })
    if (response.status === 404) return null
    if (!response.ok) throw new Error(await describeFailure(response, `Download of ${key} failed`))
    return response.arrayBuffer()
  }

  async remove(key: string): Promise<void> {
    const response = await fetch(`/api/r2/object?key=${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: this.headers(),
    })
    if (!response.ok) throw new Error(await describeFailure(response, `Delete of ${key} failed`))
  }

  async list(prefix = ''): Promise<R2Object[]> {
    const query = prefix ? `?prefix=${encodeURIComponent(prefix)}` : ''
    const response = await fetch(`/api/r2/list${query}`, { headers: this.headers() })
    if (!response.ok) throw new Error(await describeFailure(response, 'Listing R2 failed'))
    const result = (await response.json()) as { objects: R2Object[] }
    return result.objects
  }
}

async function describeFailure(response: Response, prefix: string): Promise<string> {
  let detail = response.statusText
  try {
    const body = (await response.json()) as { error?: string }
    if (body.error === 'unauthorized') {
      return `${prefix}: the app passphrase in Settings does not match the Worker.`
    }
    if (body.error === 'r2_not_bound') {
      return `${prefix}: the Worker has no R2 bucket bound. Check wrangler.jsonc.`
    }
    if (body.error === 'too_large') {
      return `${prefix}: the file is over the 8 MB limit.`
    }
    if (body.error) detail = body.error
  } catch {
    // Non-JSON error body; the status text will have to do.
  }
  return `${prefix} (${response.status} ${detail})`
}
