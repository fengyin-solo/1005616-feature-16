import { MODULE_BY_KEY } from '@/data/modules'
import { allRows, listRows, resetRows, saveRows } from '@/data/local-store'
import { shiftDate, shiftOf } from '@/data/shift'
import type { ActionResult, EntryRow, ModuleMeta, OverviewResult, PageResult } from '@/data/types'

// 会写进数据的「往回走」动作：命中就把这条记录标成异常态，看板上能一眼看出来。
const NEGATIVE_ACTIONS = ['撤销', '作废', '拒绝', '驳回', '停用', '忽略', '下线', '回滚']

export function moduleMeta(key: string): ModuleMeta {
  const meta = MODULE_BY_KEY.get(key)
  if (!meta) {
    throw new Error(`没有登记名为 ${key} 的业务模块`)
  }
  return meta
}

function isResolvedStatus(meta: ModuleMeta, status: string): boolean {
  const resolved = meta.resolvedStatuses ?? [meta.statuses[meta.statuses.length - 1]]
  return resolved.includes(status)
}

function isAbnormalStatus(status: string): boolean {
  return status.includes('异常') || status === '待核查'
}

function markAbnormal(action: string, target: string): boolean | null {
  if (action === '完成核查') {
    return false
  }
  if (NEGATIVE_ACTIONS.some((verb) => action.startsWith(verb))) {
    return true
  }
  return isAbnormalStatus(target) ? true : null
}

// 档位闸门：
// - 登记在 meta.flow 里的旁路动作（如循环泵「完成核查」）必须从指定前置状态发起；
// - 其余动作只能沿 statuses 逐级推进，跳级、回退一律挡回。
function assertAdvance(meta: ModuleMeta, action: string, target: string, current: string): string | null {
  const requiredRaw = meta.flow?.[action]
  if (requiredRaw) {
    const required = Array.isArray(requiredRaw) ? requiredRaw : [requiredRaw]
    if (!required.includes(current)) {
      const allowed = required.map((status) => `「${status}」`).join('或')
      return `当前状态「${current}」不能执行「${action}」，需要先处于${allowed}`
    }
    return null
  }
  const currentIndex = meta.statuses.indexOf(current)
  const targetIndex = meta.statuses.indexOf(target)
  if (currentIndex < 0) {
    return `记录处于未登记的状态「${current}」，不能执行「${action}」`
  }
  if (targetIndex !== currentIndex + 1) {
    const nextStatus = meta.statuses[currentIndex + 1]
    if (current === target) {
      return `${meta.entity}已经是「${target}」，不用重复操作`
    }
    return nextStatus
      ? `状态只能逐级推进，「${current}」的下一档是「${nextStatus}」，不能直接跳到「${target}」`
      : `「${current}」已是末档，不能再执行「${action}」`
  }
  return null
}

export function filterRows(rows: EntryRow[], filters: Record<string, string>): EntryRow[] {
  const pairs = Object.entries(filters).filter(([, value]) => value.trim() !== '')
  if (pairs.length === 0) {
    return rows
  }
  return rows.filter((row) =>
    pairs.every(([field, value]) => String(row[field] ?? '').includes(value.trim())),
  )
}

export function listEntries(key: string, filters: Record<string, string> = {}): PageResult {
  const matched = filterRows(listRows(key), filters)
  return { items: matched, total: matched.length, page: 1, size: matched.length }
}

export function getEntry(key: string, id: number): EntryRow | undefined {
  return listRows(key).find((row) => Number(row.id) === id)
}

export function runAction(key: string, id: number, action: string): ActionResult {
  const meta = moduleMeta(key)
  const target = meta.actionTargets[action]
  if (!target) {
    return { ok: false, message: `${meta.entity}没有登记「${action}」这个动作` }
  }
  const rows = listRows(key)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的${meta.entity}` }
  }
  const current = String(rows[index].status)
  const blocked = assertAdvance(meta, action, target, current)
  if (blocked) {
    return { ok: false, message: blocked }
  }
  const abnormal = markAbnormal(action, target)
  const updated: EntryRow = {
    ...rows[index],
    status: target,
    pending: !isResolvedStatus(meta, target),
    abnormal: abnormal === null ? Boolean(rows[index].abnormal) : abnormal,
  }
  const next = [...rows]
  next[index] = updated
  saveRows(key, next)
  return { ok: true, message: `${meta.entity}已${action}，当前状态「${target}」` }
}

export function resetModule(key: string): PageResult {
  resetRows(key)
  return listEntries(key)
}

export function exportEntries(key: string): { filename: string; content: string } {
  const meta = moduleMeta(key)
  const header = ['编号', ...meta.fields, '当前状态']
  const lines = [header.join(',')]
  for (const row of listRows(key)) {
    lines.push([row.id, ...meta.fields.map((field) => row[field] ?? ''), row.status].join(','))
  }
  return { filename: `${meta.name}-清单.csv`, content: `﻿${lines.join('\n')}` }
}

export function downloadEntries(key: string): void {
  const { filename, content } = exportEntries(key)
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  URL.revokeObjectURL(url)
}

export function loadOverview(): OverviewResult {
  const rows = allRows()
  const modules = [...MODULE_BY_KEY.values()].map((meta) => {
    const entries = rows[meta.key] ?? []
    return {
      name: meta.name,
      created: entries.length,
      pending: entries.filter((row) => row.pending).length,
      abnormal: entries.filter((row) => row.abnormal).length,
    }
  })
  const cards = [
    { label: '业务模块', value: modules.length },
    { label: '登记总量', value: modules.reduce((sum, item) => sum + item.created, 0) },
    { label: '待处理', value: modules.reduce((sum, item) => sum + item.pending, 0) },
    { label: '异常量', value: modules.reduce((sum, item) => sum + item.abnormal, 0) },
  ]
  return { cards, modules }
}

// ---------------------------------------------------------------------------
// 补水定压：班次报送的现场录入、提交、交接班核对与参数异常回写。
// 列表、核对、单据都从 local-store 这同一份数据取数，这里是唯一的写入口。
// ---------------------------------------------------------------------------

export const MAKEUP_KEY = 'makeupwater'
export const CIRCPUMP_KEY = 'circpump'

// 定压值允许范围（MPa），现场录入超出一律挡回，页面提示与单据展示都用这两个常量。
export const PRESSURE_MIN = 0.2
export const PRESSURE_MAX = 0.6

export type MakeupInput = {
  station: string
  volume: string
  pressure: string
  hardness: string
  time: string
  operator: string
}

export type VerifyInput = {
  checker: string
  volumeConfirm: string
}

function required(input: MakeupInput): string | null {
  if (!input.station.trim()) return '请填写换热站'
  if (!input.time.trim()) return '请填写补水时间'
  if (!input.operator.trim()) return '请填写现场值班人'
  if (!input.volume.trim()) return '请现场录入补水量（t）'
  if (!input.pressure.trim()) return '请现场录入定压值（MPa）'
  if (!input.hardness.trim()) return '请现场录入水质硬度（mmol/L）'
  return null
}

function toNumber(value: string): number {
  return Number(value.trim())
}

function validateReading(input: MakeupInput): string | null {
  const missing = required(input)
  if (missing) return missing
  if (!Number.isFinite(toNumber(input.volume)) || toNumber(input.volume) < 0) {
    return '补水量需为不小于 0 的数字（t）'
  }
  const pressure = toNumber(input.pressure)
  if (!Number.isFinite(pressure)) {
    return '定压值需为数字（MPa）'
  }
  if (pressure < PRESSURE_MIN || pressure > PRESSURE_MAX) {
    return `定压值 ${pressure}MPa 超出允许范围 ${PRESSURE_MIN.toFixed(2)}-${PRESSURE_MAX.toFixed(2)}MPa，已挡回，请现场复核后重录`
  }
  const hardness = toNumber(input.hardness)
  if (!Number.isFinite(hardness) || hardness < 0) {
    return '水质硬度需为不小于 0 的数字（mmol/L）'
  }
  return null
}

function duplicateShiftReport(
  rows: EntryRow[],
  station: string,
  time: string,
  excludeId?: number,
): EntryRow | undefined {
  const date = shiftDate(time)
  const shift = shiftOf(time)
  return rows.find((row) => {
    if (excludeId !== undefined && Number(row.id) === excludeId) {
      return false
    }
    return (
      String(row['换热站'] ?? '').trim() === station.trim()
      && shiftDate(String(row['补水时间'] ?? '')) === date
      && String(row['班次'] ?? shiftOf(String(row['补水时间'] ?? ''))) === shift
    )
  })
}

function nextRecordNo(rows: EntryRow[]): string {
  let max = 0
  for (const row of rows) {
    const matched = /^MAKE-(\d+)$/.exec(String(row['记录编号'] ?? ''))
    if (matched) {
      max = Math.max(max, Number(matched[1]))
    }
  }
  return `MAKE-${String(max + 1).padStart(4, '0')}`
}

// 待记录档先落一条草稿：班次由补水时间判定，现场录入口随后可以继续补录或修改。
export function createMakeupRecord(input: MakeupInput): ActionResult & { id?: number } {
  const invalid = validateReading(input)
  if (invalid) {
    return { ok: false, message: invalid }
  }
  const rows = listRows(MAKEUP_KEY)
  if (duplicateShiftReport(rows, input.station, input.time)) {
    return {
      ok: false,
      message: `${input.station} ${shiftDate(input.time)} ${shiftOf(input.time)}的班次报送已存在，同一班次只算一次`,
    }
  }
  const id = rows.reduce((max, row) => Math.max(max, Number(row.id) || 0), 0) + 1
  const row: EntryRow = {
    id,
    status: '待记录',
    pending: true,
    abnormal: false,
    '记录编号': nextRecordNo(rows),
    '班次': shiftOf(input.time),
    '换热站': input.station.trim(),
    '补水量': input.volume.trim(),
    '定压值': String(toNumber(input.pressure)),
    '水质硬度': String(toNumber(input.hardness)),
    '补水时间': input.time,
    '操作人': input.operator.trim(),
    '核对人': '',
  }
  saveRows(MAKEUP_KEY, [...rows, row])
  return { ok: true, message: `班次报送已登记（${row['记录编号']}），提交前仍可修改`, id }
}

// 待记录档允许值班人在提交前修正现场读数。
export function updateMakeupRecord(id: number, input: MakeupInput): ActionResult {
  const rows = listRows(MAKEUP_KEY)
  const index = rows.findIndex((row) => Number(row.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的补水定压记录` }
  }
  if (String(rows[index].status) !== '待记录') {
    return { ok: false, message: '记录已提交，现场读数不能再修改' }
  }
  const invalid = validateReading(input)
  if (invalid) {
    return { ok: false, message: invalid }
  }
  if (duplicateShiftReport(rows, input.station, input.time, id)) {
    return {
      ok: false,
      message: `${input.station} ${shiftDate(input.time)} ${shiftOf(input.time)}的班次报送已存在，同一班次只算一次`,
    }
  }
  const current = rows[index]
  const updated: EntryRow = {
    ...current,
    '班次': shiftOf(input.time),
    '换热站': input.station.trim(),
    '补水量': input.volume.trim(),
    '定压值': String(toNumber(input.pressure)),
    '水质硬度': String(toNumber(input.hardness)),
    '补水时间': input.time,
    '操作人': input.operator.trim(),
  }
  const next = [...rows]
  next[index] = updated
  saveRows(MAKEUP_KEY, next)
  return { ok: true, message: '现场读数已更新到本班次记录' }
}

// 提交记录（待记录 → 已记录）：重复提交班次报送只算一次。
export function submitMakeupRecord(id: number): ActionResult {
  const rows = listRows(MAKEUP_KEY)
  const row = rows.find((item) => Number(item.id) === id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的补水定压记录` }
  }
  if (String(row.status) !== '待记录') {
    return {
      ok: false,
      message:
        String(row.status) === '已记录' || String(row.status) === '已核对'
          ? `本班次报送（${row['记录编号']}）已提交，重复提交只算一次`
          : `当前状态「${row.status}」不能提交，记录需先回到待记录档`,
    }
  }
  const dup = duplicateShiftReport(rows, String(row['换热站'] ?? ''), String(row['补水时间'] ?? ''), id)
  if (dup) {
    return { ok: false, message: `同一班次已有报送 ${dup['记录编号']}，重复提交只算一次` }
  }
  const invalid = validateReading({
    station: String(row['换热站'] ?? ''),
    volume: String(row['补水量'] ?? ''),
    pressure: String(row['定压值'] ?? ''),
    hardness: String(row['水质硬度'] ?? ''),
    time: String(row['补水时间'] ?? ''),
    operator: String(row['操作人'] ?? ''),
  })
  if (invalid) {
    return { ok: false, message: invalid }
  }
  return runAction(MAKEUP_KEY, id, '提交记录')
}

// 交接班核对（已记录 → 已核对）：必须复核对补水量一致，确认后记录核对人。
export function verifyMakeupRecord(id: number, input: VerifyInput): ActionResult {
  if (!input.checker.trim()) {
    return { ok: false, message: '请填写交接班核对人' }
  }
  const rows = listRows(MAKEUP_KEY)
  const index = rows.findIndex((item) => Number(item.id) === id)
  if (index < 0) {
    return { ok: false, message: `没有找到编号为 ${id} 的补水定压记录` }
  }
  const row = rows[index]
  if (String(row.status) !== '已记录') {
    return { ok: false, message: `只有「已记录」的班次报送能交接班核对，当前为「${row.status}」` }
  }
  if (!input.volumeConfirm.trim() || !Number.isFinite(toNumber(input.volumeConfirm))) {
    return { ok: false, message: '请复核对本班次补水量（t）' }
  }
  if (Math.abs(toNumber(input.volumeConfirm) - toNumber(String(row['补水量']))) > 1e-9) {
    return { ok: false, message: `交接班核对未通过：复核对补水量 ${input.volumeConfirm}t 与报送 ${row['补水量']}t 不一致` }
  }
  const advanced = runAction(MAKEUP_KEY, id, '确认核对')
  if (!advanced.ok) {
    return advanced
  }
  const nextRows = listRows(MAKEUP_KEY)
  const nextIndex = nextRows.findIndex((item) => Number(item.id) === id)
  nextRows[nextIndex] = { ...nextRows[nextIndex], '核对人': input.checker.trim() }
  saveRows(MAKEUP_KEY, nextRows)
  return { ok: true, message: '交接班核对通过，补水量一致，记录已收口为已核对' }
}

// 参数异常（已核对 → 参数异常）：结果回写到循环泵那边的待核查清单，同一条记录只回写一次。
export function markMakeupAbnormal(id: number): ActionResult {
  const rows = listRows(MAKEUP_KEY)
  const row = rows.find((item) => Number(item.id) === id)
  if (!row) {
    return { ok: false, message: `没有找到编号为 ${id} 的补水定压记录` }
  }
  if (String(row.status) !== '已核对') {
    return { ok: false, message: `只有「已核对」的记录能标记参数异常，当前为「${row.status}」` }
  }
  const recordNo = String(row['记录编号'] ?? id)
  const pumps = listRows(CIRCPUMP_KEY)
  const existing = pumps.find(
    (pump) => String(pump['来源记录'] ?? '') === recordNo && String(pump.status) === '待核查',
  )
  if (existing) {
    return { ok: false, message: `该记录的异常已在循环泵待核查清单（${existing['泵编号']}），无需重复回写` }
  }
  const advanced = runAction(MAKEUP_KEY, id, '标记异常')
  if (!advanced.ok) {
    return advanced
  }
  const pumpId = pumps.reduce((max, pump) => Math.max(max, Number(pump.id) || 0), 0) + 1
  const pumpRow: EntryRow = {
    id: pumpId,
    status: '待核查',
    pending: true,
    abnormal: true,
    '泵编号': `CIRC-CHK-${String(pumpId).padStart(4, '0')}`,
    '所属换热站': String(row['换热站'] ?? ''),
    '泵型号': '补水定压异常回写',
    '运行电流': '—',
    '扬程': '—',
    '保养周期': '—',
    '上次保养日': '—',
    '运行状态': '待核查',
    '待核查事项': `补水定压记录 ${recordNo} 参数异常：定压值 ${row['定压值']}MPa、水质硬度 ${row['水质硬度']}mmol/L、补水量 ${row['补水量']}t，请现场核查`,
    '来源记录': recordNo,
  }
  saveRows(CIRCPUMP_KEY, [...pumps, pumpRow])
  return { ok: true, message: `记录已标记参数异常，待核查事项已回写到循环泵（${pumpRow['泵编号']}）` }
}
