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

/** 补水定压现场录入的班次报送内容：定压值与水质硬度由值班人现场读数录入。 */
export type MakeupDraft = {
  换热站: string
  补水时间: string
  操作人: string
  补水量: number | ''
  定压值: number | ''
  水质硬度: number | ''
}

/**
 * 补水定压记录：列表、核对与单据共用这一份数据，任何页面都不再单独存一份。
 * 班次由补水时间按既有规则判定，不允许手工指定。
 */
export type MakeupRecord = EntryRow & {
  记录编号: string
  换热站: string
  班次: string
  补水时间: string
  操作人: string
  补水量: number | ''
  定压值: number | ''
  水质硬度: number | ''
  核对人?: string
  核对时间?: string
}

/** 补水定压参数异常回写到循环泵侧的待核查条目。 */
export type PumpReviewItem = {
  id: number
  来源: string
  记录编号: string
  换热站: string
  班次: string
  补水时间: string
  定压值: number
  水质硬度: number
  异常说明: string
  回写时间: string
}
