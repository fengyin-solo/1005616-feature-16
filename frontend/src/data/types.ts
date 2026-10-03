/** 纯前端数据层的公共类型：与全栈版后端返回的结构保持一致，换回后端时页面不用改。 */

export type EntryRow = {
  id: number
  status: string
  pending: boolean
  abnormal: boolean
  [field: string]: string | number | boolean
}

export type ModuleMeta = {
  key: string
  name: string
  entity: string
  desc: string
  fields: string[]
  statuses: string[]
  actions: string[]
  actionTargets: Record<string, string>
  metrics: string[]
  // 动作要求的前置（当前）状态：登记后该动作只能从指定状态发起，用于补水定压回写等旁路流转。
  // 未登记的动作一律按 statuses 的档位顺序逐级推进，不允许跳级或回退。
  flow?: Record<string, string | string[]>
  // 哪些状态算收口（不再计入待处理）；不提供时默认末态为收口态。
  resolvedStatuses?: string[]
}

export type PageResult = {
  items: EntryRow[]
  total: number
  page: number
  size: number
}

export type ActionResult = {
  ok: boolean
  message: string
}

export type OverviewResult = {
  cards: { label: string; value: number }[]
  modules: { name: string; created: number; pending: number; abnormal: number }[]
}
