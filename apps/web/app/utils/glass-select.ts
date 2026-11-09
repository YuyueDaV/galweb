/** Enhance single selects without replacing their form control or Vue option values.
 * With JavaScript unavailable, the original native picker remains usable.
 */
export function installGlassSelect() {
  const dialog = document.createElement('dialog')
  dialog.className = 'modal glass-select-menu'
  dialog.setAttribute('aria-label', '选择选项')
  const header = document.createElement('div')
  header.className = 'glass-select-heading'
  const title = document.createElement('strong')
  const closeButton = document.createElement('button')
  closeButton.type = 'button'
  closeButton.className = 'glass-select-close'
  closeButton.setAttribute('aria-label', '关闭选项')
  closeButton.textContent = '×'
  header.append(title, closeButton)
  const search = document.createElement('input')
  search.type = 'search'
  search.className = 'glass-select-search'
  search.placeholder = '搜索选项…'
  search.setAttribute('aria-label', '搜索选项')
  search.autocomplete = 'off'
  const list = document.createElement('div')
  list.className = 'glass-select-options'
  list.setAttribute('role', 'listbox')
  const empty = document.createElement('p')
  empty.className = 'glass-select-empty'
  empty.textContent = '没有匹配的选项'
  empty.setAttribute('role', 'status')
  dialog.append(header, search, list, empty)

  let source: HTMLSelectElement | undefined
  let expanded: string | null = null
  let active = -1
  let rows: HTMLButtonElement[] = []
  const observer = new MutationObserver(() => {
    if (!source?.isConnected || source.matches(':disabled')) dismiss(false)
    else render()
  })

  function dismiss(restore = true) {
    const previous = source
    source = undefined
    observer.disconnect()
    if (dialog.open) dialog.close()
    dialog.remove()
    if (previous) {
      if (expanded === null) previous.removeAttribute('aria-expanded')
      else previous.setAttribute('aria-expanded', expanded)
      if (restore && previous.isConnected) previous.focus({ preventScroll: true })
    }
  }

  function position() {
    if (!source || !dialog.open) return
    if (!source.isConnected || source.matches(':disabled')) {
      dismiss(false)
      return
    }
    if (window.matchMedia('(max-width: 699px)').matches) {
      dialog.style.removeProperty('left')
      dialog.style.removeProperty('top')
      dialog.style.removeProperty('width')
      return
    }
    const bounds = source.getBoundingClientRect()
    const width = Math.min(Math.max(bounds.width, 280), window.innerWidth - 24)
    dialog.style.width = `${width}px`
    const height = dialog.getBoundingClientRect().height
    dialog.style.left = `${Math.max(12, Math.min(bounds.left, window.innerWidth - width - 12))}px`
    dialog.style.top = `${Math.max(12, Math.min(bounds.bottom + 8, window.innerHeight - height - 12))}px`
  }

  function focusRow(index: number) {
    const enabled = rows.filter((row) => !row.disabled)
    const row = enabled[(index + enabled.length) % enabled.length]
    if (!row) return
    active = rows.indexOf(row)
    row.focus({ preventScroll: true })
    const bounds = row.getBoundingClientRect()
    const viewport = list.getBoundingClientRect()
    if (bounds.top < viewport.top) list.scrollTop -= viewport.top - bounds.top
    else if (bounds.bottom > viewport.bottom) list.scrollTop += bounds.bottom - viewport.bottom
  }

  function choose(index: number) {
    const select = source
    const option = select?.options[index]
    if (
      !select ||
      !option ||
      select.matches(':disabled') ||
      option.disabled ||
      option.parentElement?.matches('optgroup:disabled')
    )
      return
    // Set the index, not a serialized value: Vue also stores numbers/null on _value.
    select.selectedIndex = index
    dismiss()
    select.dispatchEvent(new Event('input', { bubbles: true }))
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }

  function render() {
    if (!source) return
    list.replaceChildren()
    rows = []
    active = -1
    const query = search.value.trim().toLocaleLowerCase()
    let lastGroup: Element | null = null
    Array.from(source.options).forEach((option, index) => {
      if (
        option.hidden ||
        option.parentElement?.hasAttribute('hidden') ||
        !option.label.toLocaleLowerCase().includes(query)
      )
        return
      const group = option.parentElement
      if (group instanceof HTMLOptGroupElement && group !== lastGroup) {
        const label = document.createElement('div')
        label.className = 'glass-select-group'
        label.textContent = group.label
        list.append(label)
      }
      lastGroup = group
      const row = document.createElement('button')
      row.type = 'button'
      row.tabIndex = -1
      row.className = 'glass-select-option'
      row.setAttribute('role', 'option')
      row.setAttribute('aria-selected', String(option.selected))
      row.disabled = option.disabled || (group instanceof HTMLOptGroupElement && group.disabled)
      const label = document.createElement('span')
      label.textContent = option.label
      const check = document.createElement('span')
      check.className = 'glass-select-check'
      check.setAttribute('aria-hidden', 'true')
      check.textContent = option.selected ? '✓' : ''
      row.append(label, check)
      row.addEventListener('click', () => choose(index))
      row.addEventListener('focus', () => {
        active = rows.indexOf(row)
      })
      rows.push(row)
      list.append(row)
    })
    empty.hidden = rows.length > 0
    position()
  }

  function labelFor(select: HTMLSelectElement) {
    const labelledBy = select
      .getAttribute('aria-labelledby')
      ?.split(/\s+/)
      .map((id) => document.getElementById(id)?.textContent || '')
      .join(' ')
    if (labelledBy?.trim()) return labelledBy.trim()
    if (select.getAttribute('aria-label')) return select.getAttribute('aria-label')!
    const label = select.labels?.[0]?.cloneNode(true) as HTMLElement | undefined
    label?.querySelectorAll('select, input, textarea, button').forEach((node) => node.remove())
    return label?.textContent?.trim() || '选择选项'
  }

  function open(select: HTMLSelectElement, query = '') {
    if (source === select && dialog.open) return
    dismiss(false)
    ;(document.querySelector('.site-wrap') || document.body).append(dialog)
    source = select
    expanded = select.getAttribute('aria-expanded')
    select.setAttribute('aria-expanded', 'true')
    const name = labelFor(select)
    title.textContent = name
    dialog.setAttribute('aria-label', name)
    list.setAttribute('aria-label', name)
    search.hidden = select.options.length <= 10
    search.value = query
    render()
    dialog.showModal()
    position()
    observer.observe(select, { childList: true, subtree: true, attributes: true, characterData: true })
    if (!search.hidden) search.focus({ preventScroll: true })
    else {
      const selected = rows.findIndex((row) => row.getAttribute('aria-selected') === 'true' && !row.disabled)
      const enabled = rows.filter((row) => !row.disabled)
      focusRow(selected < 0 ? 0 : enabled.indexOf(rows[selected]!))
    }
  }

  function eligible(target: EventTarget | null): target is HTMLSelectElement {
    return (
      target instanceof HTMLSelectElement &&
      !target.matches(':disabled') &&
      !target.multiple &&
      target.size <= 1 &&
      !target.hasAttribute('data-native-select')
    )
  }
  function pointer(event: Event) {
    if (!eligible(event.target)) return
    if (event instanceof PointerEvent && event.button !== 0) return
    event.preventDefault()
    if (event.type === 'pointerdown') {
      event.target.focus({ preventScroll: true })
      return
    }
    // Open after the completed gesture, so its synthesized touch click cannot
    // land on the newly opened dialog's backdrop and immediately dismiss it.
    open(event.target)
  }
  function keydown(event: KeyboardEvent) {
    if (
      eligible(event.target) &&
      ['Enter', ' ', 'ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key) &&
      !event.ctrlKey &&
      !event.metaKey
    ) {
      event.preventDefault()
      open(event.target)
      return
    }
    if (!dialog.open || !dialog.contains(event.target as Node)) return
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      if (event.target === search && ['Home', 'End'].includes(event.key)) return
      event.preventDefault()
      const enabled = rows.filter((row) => !row.disabled)
      const current = enabled.indexOf(rows[active]!)
      focusRow(
        event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? enabled.length - 1
            : current + (event.key === 'ArrowUp' ? -1 : 1),
      )
    }
    // Native dialog handles Escape and contains Tab focus (including its close button).
  }
  search.addEventListener('input', render)
  closeButton.addEventListener('click', () => dismiss())
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault()
    dismiss()
  })
  dialog.addEventListener('close', () => {
    if (source && !dialog.open) dismiss()
  })
  dialog.addEventListener('click', (event) => {
    if (event.target !== dialog) return
    const box = dialog.getBoundingClientRect()
    if (
      event.clientX < box.left ||
      event.clientX > box.right ||
      event.clientY < box.top ||
      event.clientY > box.bottom
    )
      dismiss()
  })
  // Capture before the browser launches its platform-owned select picker.
  document.addEventListener('pointerdown', pointer, true)
  document.addEventListener('click', pointer, true)
  document.addEventListener('keydown', keydown, true)
  window.addEventListener('resize', position)
  window.visualViewport?.addEventListener('resize', position)
  const scroll = (event: Event) => {
    if (source && event.target instanceof Node && !dialog.contains(event.target)) dismiss(false)
  }
  document.addEventListener('scroll', scroll, true)
  function refresh() {
    if (source) dismiss(false)
  }
  return {
    refresh,
    destroy() {
      dismiss(false)
      dialog.remove()
      document.removeEventListener('pointerdown', pointer, true)
      document.removeEventListener('click', pointer, true)
      document.removeEventListener('keydown', keydown, true)
      window.removeEventListener('resize', position)
      window.visualViewport?.removeEventListener('resize', position)
      document.removeEventListener('scroll', scroll, true)
    },
  }
}
