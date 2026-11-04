/**
 * 国漫展厅 v1 展品数据（可配置）：lightId = 作品街光点序号（LIGHTS[i]，共 8 个）。
 * 全部为【占位】文案，等 Carroll 提供真实作品后替换；不放任何海报/截图/图片（版权）。
 * link 为 '#' 表示占位，不跳转。
 */
export type Exhibit = {
  lightId: number
  title: string
  summary: string
  studioYear: string
  link: string
  placeholder: boolean
}

export const EXHIBITS: Exhibit[] = Array.from({ length: 8 }, (_, i) => ({
  lightId: i,
  title: `【占位】展品 ${i + 1} 片名待定`,
  summary: '【占位】一句话简介待 Carroll 提供。',
  studioYear: '【占位】出品方 / 年份待定',
  link: '#',
  placeholder: true,
}))

export const exhibitFor = (lightId: number) => EXHIBITS.find((e) => e.lightId === lightId) ?? null
