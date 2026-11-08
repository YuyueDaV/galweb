export interface RequestOriginHeaders {
  origin?: string
  referer?: string
  fetchSite?: string
  client?: string
}

// Used only for writes that also require JSON (or the authenticated upload
// endpoint's multipart body). The client marker is deliberately NOT included
// in the API's CORS allow-headers: another site's browser cannot preflight it.
export function verifiedRequestOrigin(headers: RequestOriginHeaders, allowed: string): string | null {
  let expected: URL
  try {
    expected = new URL(allowed)
  } catch {
    return null
  }
  if (!['http:', 'https:'].includes(expected.protocol)) return null
  if (headers.fetchSite === 'cross-site') return null
  if (headers.origin !== undefined) {
    try {
      const url = new URL(headers.origin)
      return !url.username &&
        !url.password &&
        !url.search &&
        !url.hash &&
        url.pathname === '/' &&
        url.origin === expected.origin
        ? expected.origin
        : null
    } catch {
      return null
    }
  }
  if (headers.referer !== undefined) {
    try {
      const url = new URL(headers.referer)
      return !url.username && !url.password && url.origin === expected.origin ? expected.origin : null
    } catch {
      return null
    }
  }
  // Fetch Metadata is browser-controlled. Same-site is not sufficient because
  // it also includes sibling subdomains.
  if (headers.fetchSite === 'same-origin') return expected.origin
  if (headers.fetchSite === undefined && headers.client === 'web') return expected.origin
  return null
}
