import { SEED_ROWS } from './seed'
import type { EntryRow, PumpReviewItem } from './types'

// 本地持久化：业务记录放在 localStorage 里，刷新、关掉再打开都还在。
const STORAGE_KEY = 'district-heating:entries'
// 补水定压参数异常回写的「循环泵待核查清单」单独分区存放。
const REVIEW_STORAGE_KEY = 'district-heating:pump-reviews'
// 播种数据的结构版本：字段口径调整后，旧缓存整批发回示例数据，避免新老字段混读。
const SEED_VERSION = 2

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

function persist(key: string, value: unknown): void {
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(key, JSON.stringify(value))
  }
}

type StoredShape = { version: number; rows: Record<string, EntryRow[]> }

function readStorage(): Record<string, EntryRow[]> {
  const fallback = clone(SEED_ROWS)
  if (typeof window === 'undefined' || !window.localStorage) {
    return fallback
  }
  const raw = window.localStorage.getItem(STORAGE_KEY)
  if (!raw) {
    persist(STORAGE_KEY, { version: SEED_VERSION, rows: fallback })
    return fallback
  }
  try {
    const parsed = JSON.parse(raw) as StoredShape | Record<string, EntryRow[]>
    // 兼容 v1（直接就是模块数组的字典）：版本不符一律重新播种。
    const stored =
      parsed && typeof parsed === 'object' && Array.isArray(Object.values(parsed)[0])
        ? (parsed as Record<string, EntryRow[]>)
        : (parsed as StoredShape).rows
    const version =
      parsed && typeof parsed === 'object' && 'version' in parsed
        ? Number((parsed as StoredShape).version)
        : 1
    if (!stored || version !== SEED_VERSION) {
      persist(STORAGE_KEY, { version: SEED_VERSION, rows: fallback })
      return fallback
    }
    // 以播种结构为底合并：新增模块、补齐缺失字段都从这里出。
    return { ...fallback, ...stored }
  } catch {
    persist(STORAGE_KEY, { version: SEED_VERSION, rows: fallback })
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
  persist(STORAGE_KEY, { version: SEED_VERSION, rows: next })
}

export function resetRows(key: string): EntryRow[] {
  const rows = clone(SEED_ROWS[key] ?? [])
  saveRows(key, rows)
  return rows
}

export function storageKey(): string {
  return STORAGE_KEY
}

// ---- 循环泵待核查清单：补水定压参数异常的回写落点，刷新后同样保留 ----

let reviewCache: PumpReviewItem[] | null = null

function readReviews(): PumpReviewItem[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(REVIEW_STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as PumpReviewItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function listReviews(): PumpReviewItem[] {
  if (reviewCache === null) {
    reviewCache = readReviews()
  }
  return reviewCache
}

export function saveReviews(items: PumpReviewItem[]): void {
  reviewCache = items
  persist(REVIEW_STORAGE_KEY, items)
}
