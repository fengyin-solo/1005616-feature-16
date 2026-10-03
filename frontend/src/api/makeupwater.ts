import { listRows, listReviews, saveReviews, saveRows } from '@/data/local-store'
import type {
  ActionResult,
  MakeupDraft,
  MakeupRecord,
  PageResult,
  PumpReviewItem,
} from '@/data/types'

const KEY = 'makeupwater'
const STATUSES = ['待记录', '已记录', '已核对', '参数异常'] as const

// 班次沿用既有判定：08:00-20:00 为白班，其余时段为夜班。
export const DAY_SHIFT = '白班 08:00-20:00'
export const NIGHT_SHIFT = '夜班 20:00-次日08:00'
export const SHIFT_DAY_START = 8
export const SHIFT_NIGHT_START = 20

// 二次网定压值允许范围（MPa）：现场录入与提交时超出范围一律挡回。
export const PRESSURE_MIN = 0.2
export const PRESSURE_MAX = 0.6
// 补水水质硬度参考上限（mmol/L）：仅作录入校验，不作为状态拦截。
const HARDNESS_MIN = 0
const HARDNESS_MAX = 10

function nowText(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** 既有班次判定：按补水时间的小时数归入白班/夜班。 */
export function shiftOf(waterTime: string): string {
  const hour = Number(String(waterTime).slice(11, 13))
  return Number.isNaN(hour) || (hour >= SHIFT_DAY_START && hour < SHIFT_NIGHT_START)
    ? DAY_SHIFT
    : NIGHT_SHIFT
}

/** 报送归属日：夜班跨零点，20:00 之后的报送都算到前一天的班次里。 */
function shiftDay(waterTime: string): string {
  const date = String(waterTime).slice(0, 10)
  const hour = Number(String(waterTime).slice(11, 13))
  if (!Number.isNaN(hour) && hour < SHIFT_DAY_START) {
    const d = new Date(`${date}T00:00:00`)
    d.setDate(d.getDate() - 1)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  }
  return date
}

export type ShiftBucket = {
  key: string
  label: string
  day: string
  shift: string
  items: MakeupRecord[]
}

/** 记录按班次分档：同一报送日同一班次归一档。 */
export function groupByShift(items: MakeupRecord[]): ShiftBucket[] {
  const buckets = new Map<string, ShiftBucket>()
  for (const item of items) {
    const day = shiftDay(item.补水时间)
    const shift = item.班次 || shiftOf(item.补水时间)
    const key = `${day}|${shift}`
    const bucket = buckets.get(key)
    if (bucket) {
      bucket.items.push(item)
    } else {
      buckets.set(key, {
        key,
        label: `${day} ${shift}`,
        day,
        shift,
        items: [item],
      })
    }
  }
  return [...buckets.values()].sort((a, b) => b.key.localeCompare(a.key))
}

function allRecords(): MakeupRecord[] {
  return listRows(KEY) as MakeupRecord[]
}

export function getRecord(id: number): MakeupRecord | undefined {
  return allRecords().find((row) => Number(row.id) === id)
}

export function listMakeupRecords(
  filters: Record<string, string> = {},
): PageResult & { items: MakeupRecord[] } {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  const matched = allRecords()
    .filter((row) =>
      pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
    )
    .sort((a, b) => String(b.补水时间).localeCompare(String(a.补水时间)))
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

/** 列表、核对与单据共用的读数口径：定压值统一保留两位小数（MPa）。 */
export function formatPressure(value: number | ''): string {
  return value === '' || Number.isNaN(Number(value)) ? '—' : `${Number(value).toFixed(2)} MPa`
}

function findSubmission(
  records: MakeupRecord[],
  station: string,
  waterTime: string,
  excludeId?: number,
): MakeupRecord | undefined {
  const day = shiftDay(waterTime)
  const shift = shiftOf(waterTime)
  return records.find(
    (row) =>
      Number(row.id) !== excludeId &&
      String(row.换热站) === station &&
      shiftDay(row.补水时间) === day &&
      (row.班次 || shiftOf(row.补水时间)) === shift &&
      String(row.status) !== '待记录',
  )
}

function validateDraft(draft: MakeupDraft): string {
  if (!draft.换热站.trim()) {
    return '请填写换热站'
  }
  if (!draft.补水时间) {
    return '请选择补水时间'
  }
  if (!draft.操作人.trim()) {
    return '请填写现场值班人'
  }
  if (draft.补水量 === '' || Number.isNaN(Number(draft.补水量)) || Number(draft.补水量) <= 0) {
    return '补水量必须为大于 0 的数（吨）'
  }
  if (draft.定压值 === '' || Number.isNaN(Number(draft.定压值))) {
    return '请录入现场定压值'
  }
  const pressure = Number(draft.定压值)
  if (pressure < PRESSURE_MIN || pressure > PRESSURE_MAX) {
    return `定压值 ${pressure} MPa 超出允许范围 ${PRESSURE_MIN}-${PRESSURE_MAX} MPa，已挡回，请核对现场读数后重录`
  }
  if (draft.水质硬度 === '' || Number.isNaN(Number(draft.水质硬度))) {
    return '请录入现场水质硬度'
  }
  const hardness = Number(draft.水质硬度)
  if (hardness <= HARDNESS_MIN || hardness > HARDNESS_MAX) {
    return `水质硬度需在 ${HARDNESS_MIN}-${HARDNESS_MAX} mmol/L 之间`
  }
  return ''
}

function persist(records: MakeupRecord[]): void {
  saveRows(KEY, records)
}

/**
 * 现场录入并提交班次报送（待记录 → 已记录）。
 * 一次提交原子落库：校验通过后才写入，列表/核对/单据随后都从这同一份数据取数。
 * 同一换热站同一班次只算一次报送：重复提交直接挡回。
 */
export function submitMakeupRecord(draft: MakeupDraft, id?: number): ActionResult {
  const message = validateDraft(draft)
  if (message) {
    return { ok: false, message }
  }
  const records = allRecords()
  const index = records.findIndex((row) => Number(row.id) === id)
  const duplicate = findSubmission(records, draft.换热站.trim(), draft.补水时间, id)
  if (duplicate) {
    return {
      ok: false,
      message: `换热站「${draft.换热站.trim()}」该班次已报送（${duplicate.记录编号}，状态「${duplicate.status}」），重复提交只算一次`,
    }
  }

  const payload: MakeupRecord = {
    id: index >= 0 ? records[index].id : records.reduce((max, r) => Math.max(max, Number(r.id)), 0) + 1,
    status: '已记录',
    pending: true,
    abnormal: false,
    记录编号:
      index >= 0 && records[index].记录编号
        ? records[index].记录编号
        : `MAKE-${shiftDay(draft.补水时间).split('-').join('')}-${String(
            records.filter((r) => shiftDay(r.补水时间) === shiftDay(draft.补水时间)).length + 1,
          ).padStart(2, '0')}`,
    换热站: draft.换热站.trim(),
    班次: shiftOf(draft.补水时间),
    补水时间: draft.补水时间,
    操作人: draft.操作人.trim(),
    补水量: Number(draft.补水量),
    定压值: Number(draft.定压值),
    水质硬度: Number(draft.水质硬度),
  }

  if (index >= 0) {
    const current = String(records[index].status)
    if (current !== '待记录') {
      return { ok: false, message: `记录已${current}，不能重复提交班次报送` }
    }
    records[index] = payload
  } else {
    records.push(payload)
  }
  persist(records)
  return { ok: true, message: `班次报送已提交：${payload.记录编号}，状态「已记录」` }
}

/**
 * 交接班核对补水量（已记录 → 已核对）。
 * 交接班必须核对补水量：补水量缺失或非正数时挡回，不允许推进。
 */
export function verifyMakeupRecord(id: number, checker: string): ActionResult {
  const records = allRecords()
  const index = records.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的补水定压记录` }
  }
  const current = String(records[index].status)
  if (current !== '已记录') {
    return {
      ok: false,
      message: `只有「已记录」的班次报送才能交接班核对，当前是「${current}」`,
    }
  }
  const volume = Number(records[index].补水量)
  if (records[index].补水量 === '' || Number.isNaN(volume) || volume <= 0) {
    return { ok: false, message: '交接班必须核对补水量：补水量缺失或不是正数，已挡回' }
  }
  if (!checker.trim()) {
    return { ok: false, message: '请填写交接班核对人' }
  }
  records[index] = {
    ...records[index],
    status: '已核对',
    pending: false,
    abnormal: false,
    核对人: checker.trim(),
    核对时间: nowText(),
  }
  persist(records)
  return { ok: true, message: `补水量 ${volume} 吨已核对：${records[index].记录编号}，状态「已核对」` }
}

/**
 * 标记参数异常（已核对 → 参数异常）：
 * 异常结果回写到循环泵那边的待核查清单，同一条记录只回写一次。
 */
export function markMakeupAbnormal(id: number, reason: string): ActionResult {
  const records = allRecords()
  const index = records.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的补水定压记录` }
  }
  const current = String(records[index].status)
  if (current !== '已核对') {
    return { ok: false, message: `只有「已核对」的记录才能标记异常，当前是「${current}」` }
  }
  const record = records[index]
  records[index] = {
    ...record,
    status: '参数异常',
    pending: true,
    abnormal: true,
  }
  persist(records)

  const reviews = listReviews()
  if (!reviews.some((item) => item.记录编号 === record.记录编号)) {
    const note =
      reason.trim() ||
      `定压值 ${record.定压值} MPa、水质硬度 ${record.水质硬度} mmol/L，需核查补水定压系统`
    const item: PumpReviewItem = {
      id: reviews.reduce((max, r) => Math.max(max, Number(r.id)), 0) + 1,
      来源: '补水定压',
      记录编号: String(record.记录编号),
      换热站: String(record.换热站),
      班次: String(record.班次),
      补水时间: String(record.补水时间),
      定压值: Number(record.定压值),
      水质硬度: Number(record.水质硬度),
      异常说明: note,
      回写时间: nowText(),
    }
    saveReviews([item, ...reviews])
  }
  return {
    ok: true,
    message: `记录已标记「参数异常」并回写循环泵待核查清单：${record.记录编号}`,
  }
}

export function pumpReviewItems(): PumpReviewItem[] {
  return listReviews()
}

export function makeupStatuses(): readonly string[] {
  return STATUSES
}
