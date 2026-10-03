import { MODULE_BY_KEY } from './modules'
import { SEED_ROWS } from './seed'
import { shiftOf } from './shift'
import type { EntryRow } from './types'

// 本地持久化：数据放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'district-heating:entries'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function isResolved(key: string, status: string): boolean {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    return false
  }
  const resolved = meta.resolvedStatuses ?? [meta.statuses[meta.statuses.length - 1]]
  return resolved.includes(status)
}

// 读出来的每行都按模块当前定义归一化一遍：
// - 补水定压：班次由补水时间按既有判定补齐，缺的核对人补空串；
// - 全部模块：pending/abnormal 以状态为准重算，旧版本落库的标志位不再沿用。
function normalizeRow(key: string, row: EntryRow): EntryRow {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    return row
  }
  const next: EntryRow = { ...row }
  const status = String(next.status)
  if (key === 'makeupwater') {
    if (next['班次'] === undefined || next['班次'] === '') {
      next['班次'] = shiftOf(String(next['补水时间'] ?? ''))
    }
    if (next['核对人'] === undefined) {
      next['核对人'] = ''
    }
  }
  next.pending = !isResolved(key, status)
  if (key === 'circpump') {
    next.abnormal = status === '待核查'
  }
  return next
}

function normalize(store: Record<string, EntryRow[]>): Record<string, EntryRow[]> {
  const result: Record<string, EntryRow[]> = {}
  for (const [key, rows] of Object.entries(store)) {
    if (MODULE_BY_KEY.has(key)) {
      result[key] = rows.map((row) => normalizeRow(key, row))
    } else {
      result[key] = rows
    }
  }
  return result
}

function persist(store: Record<string, EntryRow[]>): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(store))
  }
}

function readStorage(): Record<string, EntryRow[]> {
  const fallback = normalize(clone(SEED_ROWS))
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    persist(fallback)
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as Record<string, EntryRow[]>
    // 以播种数据兜底缺失模块，浏览器里的用户改动优先；归一化后立刻回写，刷新后不再出现旧字段语义。
    const merged = { ...fallback, ...parsed }
    const normalized = normalize(merged)
    persist(normalized)
    return normalized
  } catch {
    persist(fallback)
    return fallback
  }
}

let cache: Record<string, EntryRow[]> | null = null

export function allRows(): Record<string, EntryRow[]> {
  if (cache === null) {
    cache = readStorage()
  }
  return cache
}

export function listRows(key: string): EntryRow[] {
  return allRows()[key] ?? []
}

export function saveRows(key: string, rows: EntryRow[]): void {
  const next = { ...allRows(), [key]: rows }
  cache = next
  persist(next)
}

export function resetRows(key: string): EntryRow[] {
  const rows = normalize({ [key]: clone(SEED_ROWS[key] ?? []) })[key] ?? []
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}
