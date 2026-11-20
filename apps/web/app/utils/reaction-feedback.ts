export function playReactionFeedback(button: EventTarget | null) {
  if (
    !(button instanceof HTMLElement) ||
    !button.isConnected ||
    button.getAttribute('aria-pressed') !== 'true' ||
    matchMedia('(prefers-reduced-motion: reduce)').matches
  )
    return

  button.querySelector('.app-icon')?.animate([{ scale: 1 }, { scale: 1.22, offset: 0.45 }, { scale: 1 }], {
    duration: 260,
    easing: 'ease-out',
  })
}
