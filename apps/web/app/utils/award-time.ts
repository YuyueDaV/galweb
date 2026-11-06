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

export function toAwardTimeInput(value: string | null) {
  if (!value) return ''
  const offsetDate = new Date(Date.parse(value) + 8 * 60 * 60 * 1000)
  return offsetDate.toISOString().slice(0, 16)
}

export function fromAwardTimeInput(value: string) {
  return value ? new Date(`${value}:00+08:00`).toISOString() : null
}
