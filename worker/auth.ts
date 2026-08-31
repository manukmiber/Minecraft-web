/**
 * Single-user gate for the /api surface.
 *
 * The app is only ever used by its owner, so there is no account system: the
 * browser sends a passphrase that must match the Worker secret `API_PASSPHRASE`.
 * When that secret is unset the Worker runs open, which keeps `wrangler dev`
 * frictionless.
 */

export const AUTH_HEADER = 'x-app-key'

/** Constant-time string compare so the passphrase can't be probed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

export function isAuthorized(request: Request, passphrase: string | undefined): boolean {
  if (!passphrase) return true
  const provided = request.headers.get(AUTH_HEADER)
  return typeof provided === 'string' && safeEqual(provided, passphrase)
}
