<template>
  <section class="page" data-module="makeupwater">
    <header class="page-head">
      <div>
        <h2>补水定压管理</h2>
        <p class="page-desc">记录按班次分档，值班人现场录入补水量、定压值与水质硬度；按 待记录→已记录→已核对→参数异常 推进，列表、核对与单据取同一份数据。</p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">现场录入班次报送</button>
        <button class="btn" type="button" @click="exportRows">导出补水定压清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <p class="status-legend">
      <span v-for="item in statusSummary" :key="item.status" class="legend-item">
        {{ item.status }}：{{ item.count }}
      </span>
    </p>

    <form class="filter-bar" @submit.prevent="reload">
      <label v-for="field in filterFields" :key="field" class="filter-item">
        <span>{{ field }}</span>
        <input v-model="filters[field]" :placeholder="`按${field}检索`" />
      </label>
      <button class="btn" type="submit">查询</button>
      <button class="btn ghost" type="button" @click="resetFilters">重置条件</button>
    </form>

    <div v-for="bucket in buckets" :key="bucket.key" class="shift-block">
      <h3 class="shift-title">{{ bucket.label }}（{{ bucket.items.length }} 条）</h3>
      <table class="data-table">
        <thead>
          <tr>
            <th v-for="column in columns" :key="column">{{ column }}</th>
            <th>当前状态</th>
            <th>可执行动作</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in bucket.items" :key="String(row.id)" :class="{ 'row-abnormal': row.abnormal }">
            <td>{{ row.记录编号 }}</td>
            <td>{{ row.换热站 }}</td>
            <td>{{ row.补水量 === '' ? '—' : `${row.补水量} t` }}</td>
            <td>{{ formatPressure(row.定压值) }}</td>
            <td>{{ row.水质硬度 === '' ? '—' : `${row.水质硬度} mmol/L` }}</td>
            <td>{{ row.补水时间 }}</td>
            <td>{{ row.操作人 || '—' }}</td>
            <td class="row-actions">
              <button class="link" type="button" @click="openRecord(row.id)">查看单据</button>
              <button v-if="row.status === '待记录'" class="link" type="button" @click="openFill(row.id)">现场录入</button>
              <button v-if="row.status === '已记录'" class="link" type="button" @click="openVerify(row.id)">交接班核对</button>
              <button v-if="row.status === '已核对'" class="link" type="button" @click="openAbnormal(row.id)">标记异常</button>
            </td>
            <td>{{ row.status }}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <p v-if="!rows.length" class="empty-state data-table" style="padding: 16px;">暂无补水定压数据，可先现场录入班次报送</p>

    <footer class="page-foot">
      <span>共 {{ total }} 条补水定压记录</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>

    <!-- 现场录入（也是待记录草稿的补录入口）：一次提交原子落库 -->
    <div v-if="formOpen" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">{{ editingId === null ? '现场录入班次报送' : `补录 ${editingNo}` }}</h3>
        <div class="form-grid">
          <label class="form-item">
            <span>换热站 *</span>
            <input v-model="form.换热站" list="station-options" placeholder="填写或选择换热站" />
            <datalist id="station-options">
              <option v-for="name in stationNames" :key="name" :value="name" />
            </datalist>
          </label>
          <label class="form-item">
            <span>补水时间 *</span>
            <input v-model="form.补水时间" type="datetime-local" />
          </label>
          <label class="form-item">
            <span>班次（按补水时间判定）</span>
            <input :value="formShift" disabled />
          </label>
          <label class="form-item">
            <span>现场值班人 *</span>
            <input v-model="form.操作人" placeholder="现场录入人" />
          </label>
          <label class="form-item">
            <span>补水量（t）* · 交接班核对</span>
            <input v-model.number="form.补水量" type="number" min="0" step="0.1" placeholder="现场累计读数" />
          </label>
          <label class="form-item">
            <span>定压值（MPa）* · 允许 {{ PRESSURE_MIN }}-{{ PRESSURE_MAX }}</span>
            <input v-model.number="form.定压值" type="number" min="0" step="0.01" placeholder="现场定压读数" />
          </label>
          <label class="form-item">
            <span>水质硬度（mmol/L）*</span>
            <input v-model.number="form.水质硬度" type="number" min="0" step="0.1" placeholder="现场化验读数" />
          </label>
        </div>
        <p v-if="formError" class="error-text modal-error">{{ formError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="closeModal">取消</button>
          <button class="btn primary" type="button" @click="submitForm">提交记录</button>
        </div>
      </div>
    </div>

    <!-- 单据：与列表同一份数据，直接按 id 回读 -->
    <div v-if="recordOpen" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">补水定压记录单 {{ currentRecord?.记录编号 }}</h3>
        <dl v-if="currentRecord" class="doc-grid">
          <div><dt>记录编号</dt><dd>{{ currentRecord.记录编号 }}</dd></div>
          <div><dt>当前状态</dt><dd>{{ currentRecord.status }}</dd></div>
          <div><dt>换热站</dt><dd>{{ currentRecord.换热站 }}</dd></div>
          <div><dt>班次</dt><dd>{{ currentRecord.班次 }}</dd></div>
          <div><dt>补水时间</dt><dd>{{ currentRecord.补水时间 }}</dd></div>
          <div><dt>现场值班人</dt><dd>{{ currentRecord.操作人 || '—' }}</dd></div>
          <div><dt>补水量</dt><dd>{{ currentRecord.补水量 === '' ? '—' : `${currentRecord.补水量} t` }}</dd></div>
          <div><dt>定压值</dt><dd>{{ formatPressure(currentRecord.定压值) }}</dd></div>
          <div><dt>水质硬度</dt><dd>{{ currentRecord.水质硬度 === '' ? '—' : `${currentRecord.水质硬度} mmol/L` }}</dd></div>
          <div><dt>交接班核对人</dt><dd>{{ currentRecord.核对人 || '—' }}</dd></div>
          <div><dt>核对时间</dt><dd>{{ currentRecord.核对时间 || '—' }}</dd></div>
        </dl>
        <div class="modal-actions">
          <button class="btn" type="button" @click="closeModal">关闭</button>
          <button v-if="currentRecord && currentRecord.status === '待记录'" class="btn primary" type="button" @click="switchToFill">去现场录入</button>
          <button v-if="currentRecord && currentRecord.status === '已记录'" class="btn primary" type="button" @click="switchToVerify">去交接班核对</button>
        </div>
      </div>
    </div>

    <!-- 交接班核对补水量 -->
    <div v-if="verifyOpen" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">交接班核对 · {{ verifyRecord?.记录编号 }}</h3>
        <dl v-if="verifyRecord" class="doc-grid">
          <div><dt>换热站 / 班次</dt><dd>{{ verifyRecord.换热站 }} · {{ verifyRecord.班次 }}</dd></div>
          <div><dt>补水量（须核对一致）</dt><dd>{{ verifyRecord.补水量 === '' ? '缺失' : `${verifyRecord.补水量} t` }}</dd></div>
          <div><dt>定压值</dt><dd>{{ formatPressure(verifyRecord.定压值) }}</dd></div>
          <div><dt>水质硬度</dt><dd>{{ verifyRecord.水质硬度 === '' ? '—' : `${verifyRecord.水质硬度} mmol/L` }}</dd></div>
        </dl>
        <label class="form-item">
          <span>交接班核对人 *</span>
          <input v-model="verifyChecker" placeholder="接班值班人" />
        </label>
        <p v-if="verifyError" class="error-text modal-error">{{ verifyError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="closeModal">取消</button>
          <button class="btn primary" type="button" @click="submitVerify">确认核对</button>
        </div>
      </div>
    </div>

    <!-- 标记参数异常：结果回写循环泵待核查清单 -->
    <div v-if="abnormalOpen" class="modal-mask" @click.self="closeModal">
      <div class="modal">
        <h3 class="modal-title">标记参数异常 · {{ abnormalRecord?.记录编号 }}</h3>
        <label class="form-item">
          <span>异常说明</span>
          <textarea v-model="abnormalReason" rows="3" placeholder="如：定压值偏离允许范围，已通知循环泵侧核查"></textarea>
        </label>
        <p v-if="abnormalError" class="error-text modal-error">{{ abnormalError }}</p>
        <div class="modal-actions">
          <button class="btn" type="button" @click="closeModal">取消</button>
          <button class="btn primary" type="button" @click="submitAbnormal">确认标记并回写</button>
        </div>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  PRESSURE_MAX,
  PRESSURE_MIN,
  formatPressure,
  getRecord,
  groupByShift,
  listMakeupRecords,
  markMakeupAbnormal,
  shiftOf,
  submitMakeupRecord,
  verifyMakeupRecord,
} from '@/api/makeupwater'
import { downloadEntries } from '@/api/local-service'
import { useSessionStore } from '@/stores/session'
import type { MakeupDraft, MakeupRecord } from '@/data/types'

const session = useSessionStore()
const columns = ['记录编号', '换热站', '补水量', '定压值', '水质硬度', '补水时间', '操作人'] as const
const filterFields = ['记录编号', '换热站', '班次']

const rows = ref<MakeupRecord[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})

const statusSummary = computed(() =>
  ['待记录', '已记录', '已核对', '参数异常'].map((status) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)
const stats = computed(() => [
  { label: '待记录班次', value: rows.value.filter((r) => r.status === '待记录').length },
  { label: '已核对记录', value: rows.value.filter((r) => r.status === '已核对').length },
  { label: '参数异常次数', value: rows.value.filter((r) => r.status === '参数异常').length },
])
// 记录按班次分档（分档在服务层完成）。
const buckets = computed(() => groupByShift(rows.value))
const stationNames = computed(() => [...new Set(rows.value.map((r) => String(r.换热站)).filter(Boolean))])

// ---- 录入弹窗 ----
const formOpen = ref(false)
const editingId = ref<number | null>(null)
const editingNo = ref('')
const formError = ref('')
const emptyForm = (): MakeupDraft => ({
  换热站: '',
  补水时间: '',
  操作人: session.operator,
  补水量: '',
  定压值: '',
  水质硬度: '',
})
const form = ref<MakeupDraft>(emptyForm())
const formShift = computed(() => (form.value.补水时间 ? shiftOf(form.value.补水时间) : '选择补水时间后自动判定'))

function openCreate() {
  errorMessage.value = ''
  editingId.value = null
  editingNo.value = ''
  form.value = emptyForm()
  formError.value = ''
  formOpen.value = true
}

function openFill(id: number) {
  const record = getRecord(id)
  if (!record || String(record.status) !== '待记录') {
    return
  }
  recordOpen.value = false
  editingId.value = id
  editingNo.value = String(record.记录编号)
  form.value = {
    换热站: String(record.换热站 ?? ''),
    补水时间: String(record.补水时间 ?? ''),
    操作人: session.operator,
    补水量: (record.补水量 as number | '') ?? '',
    定压值: (record.定压值 as number | '') ?? '',
    水质硬度: (record.水质硬度 as number | '') ?? '',
  }
  formError.value = ''
  formOpen.value = true
}

function submitForm() {
  const result = submitMakeupRecord(form.value, editingId.value ?? undefined)
  if (!result.ok) {
    formError.value = result.message
    return
  }
  closeModal()
  reload()
  errorMessage.value = ''
}

// ---- 单据弹窗（每次打开都按 id 回读，保证与列表同一份数） ----
const recordOpen = ref(false)
const currentRecord = ref<MakeupRecord | null>(null)

function openRecord(id: number) {
  currentRecord.value = getRecord(id) ?? null
  recordOpen.value = true
}

function switchToFill() {
  if (currentRecord.value) {
    const id = Number(currentRecord.value.id)
    closeModal()
    openFill(id)
  }
}

function switchToVerify() {
  if (currentRecord.value) {
    const id = Number(currentRecord.value.id)
    closeModal()
    openVerify(id)
  }
}

// ---- 交接班核对 ----
const verifyOpen = ref(false)
const verifyRecord = ref<MakeupRecord | null>(null)
const verifyChecker = ref(session.operator)
const verifyError = ref('')

function openVerify(id: number) {
  const record = getRecord(id)
  if (!record || String(record.status) !== '已记录') {
    return
  }
  verifyRecord.value = record
  verifyChecker.value = session.operator
  verifyError.value = ''
  verifyOpen.value = true
}

function submitVerify() {
  if (!verifyRecord.value) {
    return
  }
  const result = verifyMakeupRecord(Number(verifyRecord.value.id), verifyChecker.value)
  if (!result.ok) {
    verifyError.value = result.message
    return
  }
  closeModal()
  reload()
}

// ---- 标记异常 ----
const abnormalOpen = ref(false)
const abnormalRecord = ref<MakeupRecord | null>(null)
const abnormalReason = ref('')
const abnormalError = ref('')

function openAbnormal(id: number) {
  const record = getRecord(id)
  if (!record || String(record.status) !== '已核对') {
    return
  }
  abnormalRecord.value = record
  abnormalReason.value = ''
  abnormalError.value = ''
  abnormalOpen.value = true
}

function submitAbnormal() {
  if (!abnormalRecord.value) {
    return
  }
  const result = markMakeupAbnormal(Number(abnormalRecord.value.id), abnormalReason.value)
  if (!result.ok) {
    abnormalError.value = result.message
    return
  }
  closeModal()
  reload()
}

function closeModal() {
  formOpen.value = false
  recordOpen.value = false
  verifyOpen.value = false
  abnormalOpen.value = false
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries('makeupwater')
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listMakeupRecords(filters.value)
    rows.value = payload.items
    total.value = payload.total
    // 单据若开着，跟着数据刷新，避免停留在改动前的旧数。
    if (recordOpen.value && currentRecord.value) {
      currentRecord.value = getRecord(Number(currentRecord.value.id)) ?? currentRecord.value
    }
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '补水定压列表读取失败'
  }
}

onMounted(reload)
</script>
