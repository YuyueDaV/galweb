// Generated from packages/domain by scripts/sync-award-rules.mjs. Do not edit.
export interface SiteBackground {
  mode: 'image' | 'solid'
  assetId: string | null
  color: string
  darkColor: string
}

export const DEFAULT_SITE_BACKGROUND: SiteBackground = {
  mode: 'image',
  assetId: null,
  color: '#f7f6f2',
  darkColor: '#1d201c',
}
export const DEFAULT_BACKGROUND_IMAGE = '/images/backgrounds/autumn-7f7e902145ab-1920.webp'
export const DEFAULT_BACKGROUND_MOBILE = '/images/backgrounds/autumn-0d4b7ef28605-960.webp'

export function normalizeSiteBackground(value: unknown): SiteBackground {
  const data = value && typeof value === 'object' ? (value as Partial<SiteBackground>) : {}
  const color = (input: unknown, fallback: string) =>
    typeof input === 'string' && /^#[0-9a-f]{6}$/i.test(input) ? input.toLowerCase() : fallback
  return {
    mode: data.mode === 'solid' ? 'solid' : 'image',
    assetId:
      typeof data.assetId === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(data.assetId)
        ? data.assetId.toLowerCase()
        : null,
    color: color(data.color, DEFAULT_SITE_BACKGROUND.color),
    darkColor: color(data.darkColor, DEFAULT_SITE_BACKGROUND.darkColor),
  }
}
