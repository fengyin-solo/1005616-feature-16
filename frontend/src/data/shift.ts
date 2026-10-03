// 班次判定沿用会话（stores/session.ts）里的既有约定：
// 白班 08:00–20:00，其余时段（20:00–次日 08:00）为夜班。
export type ShiftLabel = '白班' | '夜班'

const SHIFT_DAY_START = 8
const SHIFT_NIGHT_START = 20

export function parseDateTime(value: string): { date: string; hour: number } | null {
  const matched = /^(\d{4}-\d{2}-\d{2})[T ](\d{2}):\d{2}/.exec(value.trim())
  if (!matched) {
    return null
  }
  return { date: matched[1], hour: Number(matched[2]) }
}

export function shiftOf(value: string): ShiftLabel {
  const parsed = parseDateTime(value)
  if (!parsed) {
    return '白班'
  }
  return parsed.hour >= SHIFT_DAY_START && parsed.hour < SHIFT_NIGHT_START ? '白班' : '夜班'
}

// 同一班次的判定键：日期取补水时间的日期部分，配合换热站做班次报送去重。
export function shiftDate(value: string): string {
  return parseDateTime(value)?.date ?? value.trim().slice(0, 10)
}
