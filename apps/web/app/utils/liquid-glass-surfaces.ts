import { buildFilterSvg, generateDisplacementBlobUrl } from './liquid-glass'

// One registry applies the treatment to existing and asynchronously mounted UI.
// Reading prose, editor contents, inputs and primary action colours are excluded.
export const GLASS_SURFACES = [
  '[data-liquid-glass-custom]',
  '.site-header',
  '.top-nav',
  '.header-search',
  '.site-header .icon-button',
  '.site-header .notification-link',
  '.login-button',
  '.rail-card',
  '.category-card',
  '.work-card',
  '.experience-card',
  '.award-admin-card',
  '.profile-card:not(.deletion-zone)',
  '.profile-preview',
  '.tier-level',
  '.tier-editor-row',
  '.shelf-view-switch',
  '.modal',
  '.button.secondary',
  '.left-sidebar.mobile-open',
].join(',')
const REFRACTION_SURFACES =
  '[data-liquid-glass-custom],.site-header,.modal[open],.rail-card,.category-card,.shelf-view-switch'
const MAX_LENSES = 10
const MAX_MAP_PIXELS = 120_000

type Surface = {
  element: HTMLElement
  visible: boolean
  version: number
  signature: string
  failed?: boolean
  filter?: SVGElement
  blob?: string
  timer?: ReturnType<typeof setTimeout>
}

export function installLiquidGlass() {
  const surfaces = new Map<HTMLElement, Surface>()
  const host = document.createElement('div')
  host.className = 'liquid-glass-definitions'
  host.setAttribute('aria-hidden', 'true')
  document.body.append(host)
  const transparency = matchMedia('(prefers-reduced-transparency: reduce)')
  const motion = matchMedia('(prefers-reduced-motion: reduce)')
  const desktop = matchMedia('(min-width: 900px) and (pointer: fine)')
  const urlSupported =
    /Chrome|Chromium|Edg|OPR/.test(navigator.userAgent) &&
    CSS.supports('backdrop-filter', 'url(#liquid-check)')
  let disposed = false,
    sequence = 0,
    scanTimer: ReturnType<typeof setTimeout> | undefined
  let running = false
  const pending = new Set<Surface>()
  const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))

  function release(surface: Surface) {
    surface.version++
    surface.signature = ''
    surface.element.style.removeProperty('--liquid-filter')
    surface.filter?.remove()
    surface.filter = undefined
    if (surface.blob) URL.revokeObjectURL(surface.blob)
    surface.blob = undefined
  }
  function mode(surface: Surface) {
    if (transparency.matches) return 'opaque'
    if (
      surface.failed ||
      !urlSupported ||
      motion.matches ||
      !desktop.matches ||
      !surface.element.matches(REFRACTION_SURFACES)
    )
      return 'frosted'
    return 'refracted'
  }
  function numeric(style: CSSStyleDeclaration, name: string, fallback: number, min: number, max: number) {
    const value = Number.parseFloat(style.getPropertyValue(name))
    return Math.min(max, Math.max(min, Number.isFinite(value) ? value : fallback))
  }
  async function render(surface: Surface) {
    const { element } = surface
    if (disposed || !element.isConnected || !surface.visible) return
    const selectedMode = mode(surface)
    if (selectedMode !== 'refracted') {
      release(surface)
      element.dataset.liquidGlass = selectedMode
      return
    }
    const active = [...surfaces.values()].filter((item) => item.blob).length
    if (!surface.blob && active >= MAX_LENSES) {
      element.dataset.liquidGlass = 'frosted'
      return
    }
    const box = element.getBoundingClientRect(),
      style = getComputedStyle(element)
    const width = Math.round(box.width),
      height = Math.round(box.height)
    if (width <= 1 || height <= 1) return
    const radius = Math.min(numeric(style, 'border-top-left-radius', 16, 0, 999), width / 2, height / 2)
    const bevelDepth = Math.min(numeric(style, '--liquid-depth', 12, 1, 64), width / 2, height / 2)
    const scale = numeric(style, '--liquid-scale', element.matches('.site-header') ? 24 : 18, 0, 64)
    const aberration = numeric(style, '--liquid-aberration', 1.2, 0, 16)
    const frost = numeric(style, '--liquid-frost', 0.6, 0, 12)
    const dpr = Math.min(devicePixelRatio || 1, 1.5, Math.sqrt(MAX_MAP_PIXELS / (width * height)))
    const signature = [width, height, radius, bevelDepth, scale, aberration, frost, dpr].join(':')
    if (surface.signature === signature) return
    const version = ++surface.version
    let blob: string | undefined
    try {
      blob = await generateDisplacementBlobUrl({ width, height, radius, bevelDepth, dpr })
      await new Promise<void>((resolve, reject) => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => reject(new Error('Glass map could not be decoded'))
        image.src = blob!
      })
      if (
        disposed ||
        surface.version !== version ||
        !element.isConnected ||
        !surface.visible ||
        mode(surface) !== 'refracted'
      ) {
        URL.revokeObjectURL(blob)
        return
      }
      const filterId = `czx-liquid-${++sequence}`
      const template = document.createElement('template')
      template.innerHTML = buildFilterSvg({
        id: filterId,
        mapUrl: blob,
        width,
        height,
        scale,
        aberration,
        frost,
      })
      const filter = template.content.firstElementChild as SVGElement
      host.append(filter)
      const previousFilter = surface.filter,
        previousBlob = surface.blob
      surface.filter = filter
      surface.blob = blob
      surface.signature = signature
      element.style.setProperty('--liquid-filter', `url("#${filterId}") blur(0.5px) saturate(1.45)`)
      element.dataset.liquidGlass = 'refracted'
      await frame()
      previousFilter?.remove()
      if (previousBlob) URL.revokeObjectURL(previousBlob)
    } catch {
      if (blob && blob !== surface.blob) URL.revokeObjectURL(blob)
      if (surface.version === version) {
        surface.failed = true
        release(surface)
        element.dataset.liquidGlass = 'frosted'
      }
    }
  }
  async function drain() {
    if (running || disposed) return
    running = true
    try {
      while (pending.size && !disposed) {
        const surface = pending.values().next().value!
        pending.delete(surface)
        await frame()
        await render(surface)
      }
    } finally {
      running = false
    }
  }
  function enqueue(surface: Surface) {
    clearTimeout(surface.timer)
    surface.timer = setTimeout(() => {
      pending.add(surface)
      void drain()
    }, 100)
  }
  const resize = new ResizeObserver((entries) => {
    for (const entry of entries) {
      const surface = surfaces.get(entry.target as HTMLElement)
      if (surface?.visible) enqueue(surface)
    }
  })
  const intersection = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const surface = surfaces.get(entry.target as HTMLElement)
        if (!surface) continue
        surface.visible = entry.isIntersecting
        surface.element.dataset.liquidVisible = String(entry.isIntersecting)
        if (surface.visible) enqueue(surface)
        else {
          pending.delete(surface)
          release(surface)
          surface.element.dataset.liquidGlass = transparency.matches ? 'opaque' : 'frosted'
        }
      }
    },
    { rootMargin: '80px' },
  )
  function remove(surface: Surface) {
    clearTimeout(surface.timer)
    pending.delete(surface)
    release(surface)
    resize.unobserve(surface.element)
    intersection.unobserve(surface.element)
    delete surface.element.dataset.liquidGlass
    delete surface.element.dataset.liquidVisible
    surfaces.delete(surface.element)
  }
  function scan() {
    if (disposed) return
    for (const surface of surfaces.values())
      if (!surface.element.isConnected || !surface.element.matches(GLASS_SURFACES)) remove(surface)
    for (const element of document.querySelectorAll<HTMLElement>(GLASS_SURFACES)) {
      if (surfaces.has(element)) continue
      const surface: Surface = { element, visible: false, version: 0, signature: '' }
      surfaces.set(element, surface)
      element.dataset.liquidGlass = transparency.matches ? 'opaque' : 'frosted'
      resize.observe(element)
      intersection.observe(element)
    }
    for (const surface of surfaces.values()) if (surface.visible) enqueue(surface)
  }
  function refresh() {
    clearTimeout(scanTimer)
    scanTimer = setTimeout(scan, 60)
  }
  function refreshSurface(event: Event) {
    const surface = surfaces.get(event.target as HTMLElement)
    if (surface) enqueue(surface)
    else refresh()
  }
  const mutations = new MutationObserver((entries) => {
    if (entries.some((entry) => !host.contains(entry.target))) refresh()
  })
  // Ignore style/data attributes written by the enhancer itself.
  mutations.observe(document.body, {
    subtree: true,
    childList: true,
    attributes: true,
    attributeFilter: ['class', 'open'],
  })
  for (const query of [transparency, motion, desktop]) query.addEventListener('change', refresh)
  document.addEventListener('liquid-glass:refresh', refreshSurface)
  scan()
  return {
    refresh,
    destroy() {
      disposed = true
      clearTimeout(scanTimer)
      mutations.disconnect()
      resize.disconnect()
      intersection.disconnect()
      for (const query of [transparency, motion, desktop]) query.removeEventListener('change', refresh)
      document.removeEventListener('liquid-glass:refresh', refreshSurface)
      for (const surface of [...surfaces.values()]) remove(surface)
      pending.clear()
      host.remove()
    },
  }
}
