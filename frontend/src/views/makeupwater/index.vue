<template>
  <section class="page" data-module="makeupwater">
    <header class="page-head">
      <div>
        <h2>补水定压管理</h2>
        <p class="page-desc">
          记录按班次分档，定压值与水质硬度由值班人现场录入；按待记录、已记录、已核对、参数异常逐级推进，不允许跳级。
          定压值允许范围 {{ pressureRange }} MPa。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记班次报送</button>
        <button class="btn" type="button" @click="exportRows">导出补水定压清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <div class="shift-tabs" role="tablist">
      <button
        v-for="item in shiftTabs"
        :key="item.key"
        type="button"
        class="chip"
        :class="{ active: activeShift === item.key }"
        @click="activeShift = item.key"
      >
        {{ item.label }}（{{ item.count }}）
      </button>
    </div>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <template v-for="group in groupedRows" :key="group.key">
          <tr class="group-row">
            <td :colspan="columns.length + 2">{{ group.label }} · {{ group.rows.length }} 条班次报送</td>
          </tr>
          <tr v-for="row in group.rows" :key="String(row.id)">
            <td v-for="column in columns" :key="column">{{ display(row, column) }}</td>
            <td>
              <span class="status-tag" :class="statusClass(row.status)">{{ row.status }}</span>
            </td>
            <td class="row-actions">
              <button
                v-for="action in availableActions(row.status)"
                :key="action.label"
                class="link"
                type="button"
                @click="action.run(row)"
              >
                {{ action.label }}
              </button>
            </td>
          </tr>
        </template>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无补水定压数据，可先登记本班次报送</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条补水定压记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 现场录入 / 待记录档修改 -->
    <div v-if="dialog === 'edit'" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3 class="modal-title">{{ form.id ? '修改现场读数（待记录）' : '登记补水定压班次报送' }}</h3>
        <div class="form-grid">
          <label class="form-item">
            <span>换热站 *</span>
            <input v-model="form.station" placeholder="如：新华站" />
          </label>
          <label class="form-item">
            <span>补水时间 *</span>
            <input v-model="form.time" type="datetime-local" />
          </label>
          <label class="form-item readonly">
            <span>班次（按时间自动判定）</span>
            <input :value="shiftOf(form.time)" readonly />
          </label>
          <label class="form-item">
            <span>现场值班人 *</span>
            <input v-model="form.operator" placeholder="现场录入人" />
          </label>
          <label class="form-item">
            <span>补水量（t）*</span>
            <input v-model="form.volume" type="number" min="0" step="0.1" placeholder="如：12.6" />
          </label>
          <label class="form-item">
            <span>定压值（MPa，{{ pressureRange }}）*</span>
            <input v-model="form.pressure" type="number" :min="PRESSURE_MIN" :max="PRESSURE_MAX" step="0.01" placeholder="如：0.42" />
          </label>
          <label class="form-item">
            <span>水质硬度（mmol/L）*</span>
            <input v-model="form.hardness" type="number" min="0" step="0.1" placeholder="如：3.8" />
          </label>
        </div>
        <p v-if="dialogError" class="error-text">{{ dialogError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitForm">{{ form.id ? '保存修改' : '登记为待记录' }}</button>
        </div>
      </div>
    </div>

    <!-- 交接班核对 -->
    <div v-if="dialog === 'verify' && verifyTarget" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <h3 class="modal-title">交接班核对 · {{ verifyTarget['记录编号'] }}</h3>
        <dl class="doc-list">
          <div><dt>班次 / 换热站</dt><dd>{{ verifyTarget['班次'] }} · {{ verifyTarget['换热站'] }}</dd></div>
          <div><dt>报送补水量</dt><dd>{{ verifyTarget['补水量'] }} t</dd></div>
          <div><dt>定压值</dt><dd>{{ verifyTarget['定压值'] }} MPa</dd></div>
          <div><dt>水质硬度</dt><dd>{{ verifyTarget['水质硬度'] }} mmol/L</dd></div>
          <div><dt>报送值班人</dt><dd>{{ verifyTarget['操作人'] }}</dd></div>
        </dl>
        <div class="form-grid">
          <label class="form-item">
            <span>交接班核对人 *</span>
            <input v-model="verifyForm.checker" placeholder="接班人签名" />
          </label>
          <label class="form-item">
            <span>复核对补水量（t）*</span>
            <input v-model="verifyForm.volumeConfirm" type="number" step="0.1" :placeholder="`应为 ${verifyTarget['补水量']}`" />
          </label>
        </div>
        <p v-if="dialogError" class="error-text">{{ dialogError }}</p>
        <div class="modal-actions">
          <button class="btn ghost" type="button" @click="closeDialog">取消</button>
          <button class="btn primary" type="button" @click="submitVerify">核对一致并确认</button>
        </div>
      </div>
    </div>

    <!-- 补水定压单据 -->
    <div v-if="dialog === 'doc' && docTarget" class="modal-mask" @click.self="closeDialog">
      <div class="modal">
        <div class="doc-sheet">
          <h3 class="doc-title">补水定压记录单</h3>
          <p class="doc-sub">记录编号：{{ docTarget['记录编号'] }}　来源：补水定压清单（同一数据源）</p>
          <table class="doc-table">
            <tbody>
              <tr v-for="field in docFields" :key="field">
                <th>{{ field }}</th>
                <td :class="{ 'warn-cell': field === '定压值' && outOfPressure(docTarget) }">
                  {{ display(docTarget, field) }}<span v-if="field === '定压值'"> MPa</span>
                </td>
              </tr>
              <tr>
                <th>当前状态</th>
                <td><span class="status-tag" :class="statusClass(docTarget.status)">{{ docTarget.status }}</span></td>
              </tr>
            </tbody>
          </table>
          <p class="doc-foot">本单据定压值、水质硬度、补水量与列表同源取数；定压值允许范围 {{ pressureRange }} MPa。</p>
        </div>
        <div class="modal-actions">
          <button class="btn primary" type="button" @click="closeDialog">关闭单据</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'

import {
  createMakeupRecord,
  downloadEntries,
  getEntry,
  listEntries,
  markMakeupAbnormal,
  moduleMeta,
  PRESSURE_MAX,
  PRESSURE_MIN,
  submitMakeupRecord,
  updateMakeupRecord,
  verifyMakeupRecord,
  type MakeupInput,
  type VerifyInput,
} from '@/api/local-service'
import { shiftOf } from '@/data/shift'
import { useSessionStore } from '@/stores/session'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('makeupwater')
const session = useSessionStore()

const columns = ["记录编号", "班次", "换热站", "补水量", "定压值", "水质硬度", "补水时间", "操作人", "核对人"]
const filterFields = ["记录编号", "换热站", "班次"]
const docFields = ["记录编号", "班次", "换热站", "补水量", "定压值", "水质硬度", "补水时间", "操作人", "核对人"]
const SHIFT_ORDER = ['白班', '夜班']
const SHIFT_LABEL: Record<string, string> = { 白班: '白班 08:00-20:00', 夜班: '夜班 20:00-次日08:00' }

const PRESSURE_MIN_VIEW = PRESSURE_MIN
const pressureRange = `${PRESSURE_MIN.toFixed(2)}-${PRESSURE_MAX.toFixed(2)}`

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const activeShift = ref<'全部' | '白班' | '夜班'>('全部')

type DialogKind = '' | 'edit' | 'verify' | 'doc'
const dialog = ref<DialogKind>('')
const dialogError = ref('')
const verifyTarget = ref<EntryRow | null>(null)
const docTarget = ref<EntryRow | null>(null)

function emptyForm(): MakeupInput & { id?: number } {
  return {
    id: undefined,
    station: '',
    volume: '',
    pressure: '',
    hardness: '',
    time: nowLocal(),
    operator: session.operator,
  }
}
const form = reactive<MakeupInput & { id?: number }>(emptyForm())
const verifyForm = reactive<VerifyInput>({ checker: '', volumeConfirm: '' })

function nowLocal(): string {
  const d = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

const visibleRows = computed(() =>
  activeShift.value === '全部'
    ? rows.value
    : rows.value.filter((row) => String(row['班次'] ?? '') === activeShift.value),
)

const groupedRows = computed(() =>
  SHIFT_ORDER.map((shift) => ({
    key: shift,
    label: SHIFT_LABEL[shift],
    rows: visibleRows.value.filter((row) => String(row['班次'] ?? shiftOf(String(row['补水时间'] ?? ''))) === shift),
  })).filter((group) => group.rows.length > 0),
)

const shiftTabs = computed(() => {
  const count = (shift: string) => rows.value.filter((row) => String(row['班次'] ?? '') === shift).length
  return [
    { key: '全部' as const, label: '全部班次', count: rows.value.length },
    { key: '白班' as const, label: SHIFT_LABEL['白班'], count: count('白班') },
    { key: '夜班' as const, label: SHIFT_LABEL['夜班'], count: count('夜班') },
  ]
})

const stats = computed(() => [
  { label: '待记录班次', value: rows.value.filter((row) => row.status === '待记录').length },
  { label: '已核对记录', value: rows.value.filter((row) => row.status === '已核对').length },
  { label: '参数异常次数', value: rows.value.filter((row) => row.status === '参数异常').length },
])

function display(row: EntryRow, field: string): string {
  const value = row[field]
  if (value === undefined || value === null || value === '') {
    return '—'
  }
  return String(value).replace('T', ' ')
}

function statusClass(status: string): string {
  if (status === '参数异常') return 'st-abnormal'
  if (status === '已核对') return 'st-done'
  if (status === '已记录') return 'st-active'
  return 'st-pending'
}

function outOfPressure(row: EntryRow): boolean {
  const value = Number(row['定压值'])
  return Number.isFinite(value) && (value < PRESSURE_MIN_VIEW || value > PRESSURE_MAX)
}

type RowAction = { label: string; run: (row: EntryRow) => void }

function availableActions(status: string): RowAction[] {
  if (status === '待记录') {
    return [
      { label: '录入/修改', run: openEdit },
      { label: '提交记录', run: submitRow },
      { label: '查看单据', run: openDoc },
    ]
  }
  if (status === '已记录') {
    return [
      { label: '交接班核对', run: openVerify },
      { label: '查看单据', run: openDoc },
    ]
  }
  if (status === '已核对') {
    return [
      { label: '标记异常', run: markAbnormal },
      { label: '查看单据', run: openDoc },
    ]
  }
  return [{ label: '查看单据', run: openDoc }]
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '补水定压列表读取失败'
  }
}

function resetFilters() {
  filters.value = {}
  activeShift.value = '全部'
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function closeDialog() {
  dialog.value = ''
  dialogError.value = ''
  verifyTarget.value = null
  docTarget.value = null
  Object.assign(form, emptyForm())
  verifyForm.checker = ''
  verifyForm.volumeConfirm = ''
}

function openCreate() {
  Object.assign(form, emptyForm())
  dialogError.value = ''
  dialog.value = 'edit'
}

function openEdit(row: EntryRow) {
  Object.assign(form, {
    id: Number(row.id),
    station: String(row['换热站'] ?? ''),
    volume: String(row['补水量'] ?? ''),
    pressure: String(row['定压值'] ?? ''),
    hardness: String(row['水质硬度'] ?? ''),
    time: String(row['补水时间'] ?? nowLocal()),
    operator: String(row['操作人'] ?? session.operator),
  })
  dialogError.value = ''
  dialog.value = 'edit'
}

function submitForm() {
  const payload: MakeupInput = {
    station: form.station,
    volume: form.volume,
    pressure: form.pressure,
    hardness: form.hardness,
    time: form.time,
    operator: form.operator,
  }
  const result = form.id
    ? updateMakeupRecord(form.id, payload)
    : createMakeupRecord(payload)
  if (!result.ok) {
    dialogError.value = result.message
    return
  }
  closeDialog()
  errorMessage.value = ''
  reload()
}

function submitRow(row: EntryRow) {
  const result = submitMakeupRecord(Number(row.id))
  applyResult(result)
}

function openVerify(row: EntryRow) {
  verifyTarget.value = getEntry(meta.key, Number(row.id)) ?? row
  verifyForm.checker = session.operator
  verifyForm.volumeConfirm = ''
  dialogError.value = ''
  dialog.value = 'verify'
}

function submitVerify() {
  if (!verifyTarget.value) return
  const result = verifyMakeupRecord(Number(verifyTarget.value.id), {
    checker: verifyForm.checker,
    volumeConfirm: verifyForm.volumeConfirm,
  })
  if (!result.ok) {
    dialogError.value = result.message
    return
  }
  closeDialog()
  reload()
}

function markAbnormal(row: EntryRow) {
  const result = markMakeupAbnormal(Number(row.id))
  applyResult(result)
}

function openDoc(row: EntryRow) {
  docTarget.value = getEntry(meta.key, Number(row.id)) ?? row
  dialog.value = 'doc'
}

function applyResult(result: { ok: boolean; message: string }) {
  if (!result.ok) {
    errorMessage.value = result.message
  }
  reload()
}

onMounted(reload)
</script>
