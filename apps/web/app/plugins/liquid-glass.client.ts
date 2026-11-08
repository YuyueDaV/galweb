import { installLiquidGlass } from '~/utils/liquid-glass-surfaces'

export default defineNuxtPlugin((nuxtApp) => {
  let glass: ReturnType<typeof installLiquidGlass> | undefined
  nuxtApp.hook('app:mounted', () => {
    glass = installLiquidGlass()
  })
  nuxtApp.hook('page:finish', () => glass?.refresh())
  nuxtApp.vueApp.onUnmount(() => glass?.destroy())
  if (import.meta.hot) import.meta.hot.dispose(() => glass?.destroy())
})
