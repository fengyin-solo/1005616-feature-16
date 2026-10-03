<template>
  <section class="page" data-module="circpump">
    <header class="page-head">
      <div>
        <h2>循环泵运维管理</h2>
        <p class="page-desc">维护循环泵，围绕泵编号、所属换热站、泵型号、运行电流做登记、筛选与状态流转。</p>
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

    <table class="data-table">
      <thead>
        <tr>
          <th v-for="column in columns" :key="column">{{ column }}</th>
          <th>当前状态</th>
          <th>可执行动作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in rows" :key="String(row.id)">
          <td v-for="column in columns" :key="column">{{ row[column] ?? '—' }}</td>
          <td>{{ row.status }}</td>
          <td class="row-actions">
            <button
              v-for="action in actions"
              :key="action"
              class="link"
              type="button"
              @click="runAction(action, row)"
            >
              {{ action }}
            </button>
          </td>
        </tr>
        <tr v-if="!rows.length">
          <td :colspan="columns.length + 2" class="empty-state">暂无循环泵运维数据，可先登记循环泵</td>
        </tr>
      </tbody>
    </table>

    <h3 class="section-title">补水定压待核查清单</h3>
    <p class="page-desc">补水定压侧标记「参数异常」的班次报送会回写到这里，循环泵值班人据此核查补水定压系统。</p>
    <table class="data-table">
      <thead>
        <tr>
          <th>回写时间</th>
          <th>补水记录编号</th>
          <th>换热站</th>
          <th>班次</th>
          <th>补水时间</th>
          <th>定压值</th>
          <th>水质硬度</th>
          <th>异常说明</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="item in reviews" :key="item.id">
          <td>{{ item.回写时间 }}</td>
          <td>{{ item.记录编号 }}</td>
          <td>{{ item.换热站 }}</td>
          <td>{{ item.班次 }}</td>
          <td>{{ item.补水时间 }}</td>
          <td>{{ item.定压值.toFixed(2) }} MPa</td>
          <td>{{ item.水质硬度 }} mmol/L</td>
          <td>{{ item.异常说明 }}</td>
        </tr>
        <tr v-if="!reviews.length">
          <td colspan="8" class="empty-state">暂无补水定压参数异常的待核查条目</td>
        </tr>
      </tbody>
    </table>

    <footer class="page-foot">
      <span>共 {{ total }} 条循环泵运维记录</span>
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
import { pumpReviewItems } from '@/api/makeupwater'
import type { EntryRow, PumpReviewItem } from '@/data/types'

const meta = moduleMeta('circpump')
const columns = ["泵编号", "所属换热站", "泵型号", "运行电流", "扬程", "保养周期", "上次保养日", "运行状态"]
const actions = ["登记运行", "完成保养", "停用设备"]
const statuses = ["待保养", "运行中", "已保养", "已停用"]
const stats = [{"label": "运行中循环泵", "value": 0}, {"label": "待保养循环泵", "value": 0}, {"label": "本月保养数", "value": 0}]

const rows = ref<EntryRow[]>([])
const reviews = ref<PumpReviewItem[]>([])
const total = ref(0)
const errorMessage = ref('')
const filters = ref<Record<string, string>>({})
const filterFields = columns.slice(0, 3)
const statusSummary = computed(() =>
  statuses.map((status: string) => ({
    status,
    count: rows.value.filter((row) => String(row.status) === status).length,
  })),
)

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
    reviews.value = pumpReviewItems()
  } catch (error) {
    errorMessage.value = error instanceof Error ? error.message : '循环泵运维列表读取失败'
  }
}

onMounted(reload)
</script>
