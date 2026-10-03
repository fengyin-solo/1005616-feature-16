<template>
  <section class="page" data-module="circpump">
    <header class="page-head">
      <div>
        <h2>循环泵运维管理</h2>
        <p class="page-desc">
          维护循环泵，围绕泵编号、所属换热站、泵型号、运行电流做登记、筛选与状态流转。
          补水定压参数异常会回写到下方「待核查清单」，核查完成后设备回到运行中。
        </p>
      </div>
      <div class="page-actions">
        <button class="btn primary" type="button" @click="openCreate">登记循环泵</button>
        <button class="btn" type="button" @click="exportRows">导出循环泵运维清单</button>
      </div>
    </header>

    <div class="stat-row">
      <article v-for="item in stats" :key="item.label" class="stat-card">
        <span class="stat-label">{{ item.label }}</span>
        <strong class="stat-value">{{ item.value }}</strong>
      </article>
    </div>

    <h3 class="section-title">待核查清单（补水定压异常回写）</h3>
    <table class="data-table check-table">
      <thead>
        <tr>
          <th>核查编号</th>
          <th>所属换热站</th>
          <th>待核查事项</th>
          <th>来源记录</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in checkRows" :key="String(row.id)">
          <td>{{ row['泵编号'] }}</td>
          <td>{{ row['所属换热站'] }}</td>
          <td>{{ row['待核查事项'] }}</td>
          <td>{{ row['来源记录'] }}</td>
          <td><span class="status-tag st-abnormal">待核查</span></td>
          <td class="row-actions">
            <button class="link" type="button" @click="runAction('完成核查', row)">完成核查</button>
          </td>
        </tr>
        <tr v-if="!checkRows.length">
          <td colspan="6" class="empty-state">暂无待核查事项，补水定压标记参数异常后会回写到这里</td>
        </tr>
      </tbody>
    </table>

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

    <h3 class="section-title">循环泵台账</h3>
    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in mainRows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td><span class="status-tag" :class="statusClass(row.status)">{{ row.status }}</span></td>
          <td class="row-actions">
            <button
              v-for="action in availableActions(row.status)"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!mainRows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无循环泵运维数据，可先登记循环泵</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条循环泵运维记录（含待核查 {{ checkRows.length }} 条）</span>
      <span v-if="errorMessage" class="error-text">{{ errorMessage }}</span>
    </footer>
  </section>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'

import {
  downloadEntries,
  listEntries,
  moduleMeta,
  runAction as applyAction,
} from '@/api/local-service'
import type { EntryRow } from '@/data/types'

const meta = moduleMeta('circpump')
const columns = ["泵编号", "所属换热站", "泵型号", "运行电流", "扬程", "保养周期", "上次保养日", "运行状态"]
const linearActions: Record<string, string[]> = {
  "待保养": ["登记运行"],
  "运行中": ["完成保养", "停用设备"],
  "已保养": ["停用设备"],
  "已停用": [],
  "待核查": [],
}
const statuses = ["待保养", "运行中", "已保养", "已停用", "待核查"]

const rows = ref<EntryRow[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = ["泵编号", "所属换热站", "泵型号"]

const checkRows = computed(() => rows.value.filter((row) => String(row.status) === '待核查'))
const mainRows = computed(() => rows.value.filter((row) => String(row.status) !== '待核查'))

const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

const stats = computed(() => [
  { label: '运行中循环泵', value: rows.value.filter((row) => row.status === '运行中').length },
  { label: '待保养循环泵', value: rows.value.filter((row) => row.status === '待保养').length },
  { label: '待核查事项', value: checkRows.value.length },
])

function availableActions(status: string): string[] {
  return linearActions[status] ?? []
}

function statusClass(status: string): string {
  if (status === '待核查') return 'st-abnormal'
  if (status === '运行中') return 'st-active'
  if (status === '已保养') return 'st-done'
  if (status === '已停用') return 'st-muted'
  return 'st-pending'
}

function resetFilters() {
  filters.value = {}
  reload()
}

function exportRows() {
  downloadEntries(meta.key)
}

function openCreate() {
  errorMessage.value = '循环泵登记入口尚未接入审批流'
}

function runAction(action: string, row: EntryRow) {
  errorMessage.value = ''
  const result = applyAction(meta.key, Number(row.id), action)
  if (!result.ok) {
    errorMessage.value = result.message
    return
  }
  reload()
}

function reload() {
  errorMessage.value = ''
  try {
    const payload = listEntries(meta.key, filters.value)
    rows.value = payload.items
    total.value = payload.total
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '循环泵运维列表读取失败'
  }
}

onMounted(reload)
</script>
