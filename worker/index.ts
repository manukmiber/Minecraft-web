/**
 * mmmmmmmmmmmmm — Worker API.
 *
 * Deliberately thin: it proxies the R2 bucket through a binding and nothing
 * else. All the expensive work (JSON generation, schema validation, zipping the
 * .mcaddon) happens in the browser, so the Worker never comes near its CPU
 * limit and no R2 credential is ever handed to the client.
 */

import { AUTH_HEADER, isAuthorized } from './auth'

interface Env {
  ASSET_BUCKET: R2Bucket
  ASSETS: Fetcher
  API_PASSPHRASE?: string
  APP_NAME?: string
}

/** Assets live under a single prefix so the bucket stays tidy and listable. */
const KEY_PREFIX = 'workspace/'

const JSON_HEADERS = { 'content-type': 'application/json; charset=utf-8' }

function json(body: unknown, status = 200, extra: HeadersInit = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...extra } })
}

/**
 * Keys come from the client, so they are scrubbed before touching R2: no
 * traversal, no absolute paths, no control characters.
 */
function normalizeKey(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().replace(/^\/+/, '')
  if (!trimmed || trimmed.length > 512) return null
  if (trimmed.includes('..')) return null
  // Allowlist doubles as the control-character and whitespace filter.
  if (!/^[A-Za-z0-9._\-/]+$/.test(trimmed)) return null
  return KEY_PREFIX + trimmed
}

/** Strip the internal prefix again before anything is reported to the client. */
function publicKey(key: string): string {
  return key.startsWith(KEY_PREFIX) ? key.slice(KEY_PREFIX.length) : key
}

const MAX_OBJECT_BYTES = 8 * 1024 * 1024

async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)
  const route = url.pathname.replace(/^\/api\/?/, '')

  if (route === 'health') {
    return json({
      ok: true,
      app: env.APP_NAME ?? 'mmmmmmmmmmmmm',
      // Lets Settings tell the user whether a passphrase is expected at all.
      authRequired: Boolean(env.API_PASSPHRASE),
      bucketBound: Boolean(env.ASSET_BUCKET),
    })
  }

  if (!isAuthorized(request, env.API_PASSPHRASE)) {
    return json({ ok: false, error: 'unauthorized' }, 401)
  }

  if (!env.ASSET_BUCKET) {
    return json({ ok: false, error: 'r2_not_bound' }, 503)
  }

  if (route === 'r2/list') {
    const rawPrefix = url.searchParams.get('prefix') ?? ''
    const prefix = rawPrefix ? normalizeKey(rawPrefix) : KEY_PREFIX
    if (!prefix) return json({ ok: false, error: 'bad_prefix' }, 400)
    const listing = await env.ASSET_BUCKET.list({ prefix, limit: 1000 })
    return json({
      ok: true,
      objects: listing.objects.map((o) => ({
        key: publicKey(o.key),
        size: o.size,
        uploaded: o.uploaded.toISOString(),
        etag: o.etag,
      })),
      truncated: listing.truncated,
    })
  }

  if (route === 'r2/object') {
    const key = normalizeKey(url.searchParams.get('key'))
    if (!key) return json({ ok: false, error: 'bad_key' }, 400)

    if (request.method === 'PUT' || request.method === 'POST') {
      const declared = Number(request.headers.get('content-length') ?? '0')
      if (declared > MAX_OBJECT_BYTES) {
        return json({ ok: false, error: 'too_large', limit: MAX_OBJECT_BYTES }, 413)
      }
      const body = await request.arrayBuffer()
      if (body.byteLength > MAX_OBJECT_BYTES) {
        return json({ ok: false, error: 'too_large', limit: MAX_OBJECT_BYTES }, 413)
      }
      const contentType = request.headers.get('x-content-type') ?? 'application/octet-stream'
      const put = await env.ASSET_BUCKET.put(key, body, {
        httpMetadata: { contentType },
      })
      return json({ ok: true, key: publicKey(key), size: body.byteLength, etag: put?.etag ?? null })
    }

    if (request.method === 'GET') {
      const object = await env.ASSET_BUCKET.get(key)
      if (!object) return json({ ok: false, error: 'not_found' }, 404)
      return new Response(object.body, {
        headers: {
          'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream',
          'cache-control': 'no-store',
          etag: object.httpEtag,
        },
      })
    }

    if (request.method === 'DELETE') {
      await env.ASSET_BUCKET.delete(key)
      return json({ ok: true, key: publicKey(key) })
    }

    return json({ ok: false, error: 'method_not_allowed' }, 405)
  }

  return json({ ok: false, error: 'not_found' }, 404)
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url)

    if (url.pathname.startsWith('/api/')) {
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          status: 204,
          headers: {
            'access-control-allow-methods': 'GET,PUT,POST,DELETE,OPTIONS',
            'access-control-allow-headers': `content-type,x-content-type,${AUTH_HEADER}`,
          },
        })
      }
      try {
        return await handleApi(request, env)
      } catch (error) {
        return json({ ok: false, error: 'internal', detail: String(error) }, 500)
      }
    }

    // Everything else is the static SPA.
    return env.ASSETS.fetch(request)
  },
} satisfies ExportedHandler<Env>
