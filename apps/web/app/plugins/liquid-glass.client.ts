import { installLiquidGlass } from '~/utils/liquid-glass-surfaces'
import { installGlassSelect } from '~/utils/glass-select'

export default defineNuxtPlugin((nuxtApp) => {
  let glass: ReturnType<typeof installLiquidGlass> | undefined
  let selects: ReturnType<typeof installGlassSelect> | undefined
  nuxtApp.hook('app:mounted', () => {
    glass = installLiquidGlass()
    selects = installGlassSelect()
  })
  nuxtApp.hook('page:finish', () => {
    glass?.refresh()
    selects?.refresh()
  })
  const destroy = () => {
    selects?.destroy()
    glass?.destroy()
  }
  nuxtApp.vueApp.onUnmount(destroy)
  if (import.meta.hot) import.meta.hot.dispose(destroy)
})
