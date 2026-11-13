export function formatAwardTime(value: string | null) {
  if (!value) return '时间待公布'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}

export function formatNominationTime(nomination: {
  createdAt: string
  qqSync?: { nominatedAt: string }
  displayOverride?: { nominatedAt: string }
}) {
  const nominatedAt = nomination.displayOverride?.nominatedAt || nomination.qqSync?.nominatedAt
  if (!nominatedAt) return formatAwardTime(nomination.createdAt)
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(nominatedAt))
}

export function toAwardTimeInput(value: string | null) {
  if (!value) return ''
  const offsetDate = new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
  return offsetDate.toISOString().slice(0, 16)
}

export function fromAwardTimeInput(value: string) {
  return value ? new Date(`${value}:00+08:00`).toISOString() : null
}
