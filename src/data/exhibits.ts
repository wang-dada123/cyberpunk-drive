/**
 * 国漫展厅 v1 展品数据（可配置）：lightId = 作品街光点序号（LIGHTS[i]，共 8 个）。
 * 名单已定；简介只写泛泛题材/篇章，出品方/年份留空（UI 显示「待核实」）；不放任何海报/截图/图片（版权）。
 * link 为 '#' 表示「了解更多」占位，不跳转。
 */
export type Exhibit = {
  lightId: number
  title: string
  summary: string
  studioYear: string
  link: string
  placeholder: boolean
}

const FR = '凡人修仙传'
const ex = (lightId: number, title: string, summary: string): Exhibit =>
  ({ lightId, title, summary, studioYear: '', link: '#', placeholder: false })

/** 凡人 4 张篇章卡分散在作品街主路光点 0/2/4/6（间隔 32m），其余 4 部穿插在 1/3/5/7。光点位置未动。 */
export const EXHIBITS: Exhibit[] = [
  ex(0, `《${FR}》· 韩立 / 人物`, '国产修仙题材动画 · 篇章主题：韩立 / 人物'),
  ex(1, '《不良人》', '国产武侠题材动画'),
  ex(2, `《${FR}》· 七玄门`, '国产修仙题材动画 · 篇章主题：七玄门'),
  ex(3, '《灵笼》', '国产科幻题材动画'),
  ex(4, `《${FR}》· 乱星海`, '国产修仙题材动画 · 篇章主题：乱星海'),
  ex(5, '《仙逆》', '国产修仙题材动画'),
  ex(6, `《${FR}》· 灵界`, '国产修仙题材动画 · 篇章主题：灵界'),
  ex(7, '《斗破苍穹》', '国产玄幻题材动画'),
]

export const exhibitFor = (lightId: number) => EXHIBITS.find((e) => e.lightId === lightId) ?? null
