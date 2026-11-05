/**
 * 国漫展厅 v2：只展《凡人修仙传》。lightId = 作品街光点序号（LIGHTS[i]，共 8 个），光点 i ↔ public/exhibits/fanren-0{i+1}.webp。
 * 只写名字和一句类型化简介；不引用台词、不写出品方/年份。图片版权归原作者（卡片底部标注）。
 * 壁纸替换：node scripts/prep-exhibits.mjs <8 张原图，按光点 0–7 顺序>
 */
export type Exhibit = {
  lightId: number
  series: string
  title: string
  kind: string
  summary: string
  /** 卡片大图（约 960px 宽，≤200KB），开卡时才加载 */
  img: string
  /** 灯箱缩略图（256×384，≤30KB），靠近作品街时低优先级加载 */
  thumb: string
  /** 卡片 object-fit: cover 的焦点（object-position），保证人物脸不被裁掉；prep-exhibits 裁灯箱缩略图也读这里 */
  focus: string
  /** 白底水墨图：加重暗色渐变压住文字区 */
  light?: boolean
}

export const SERIES = '凡人修仙传'
const BASE = import.meta.env.BASE_URL
const ex = (lightId: number, title: string, kind: string, summary: string, focus: string, light = false): Exhibit => {
  const n = String(lightId + 1).padStart(2, '0')
  return { lightId, series: SERIES, title, kind, summary, img: `${BASE}exhibits/fanren-${n}.webp`, thumb: `${BASE}exhibits/fanren-${n}-thumb.webp`, focus, light }
}

/** 原图：01/03/04/08 横图，02/06 近方图，05（竖）/07（竖）。标题按画面起名。 */
export const EXHIBITS: Exhibit[] = [
  ex(0, '韩立·青竹蜂云剑', '人物', '持剑而立，青金灵光环身', '40% 30%'),
  ex(1, '万剑归宗', '场景', '万剑悬空，青色灵光汇于一点', '50% 40%'),
  ex(2, '风雷翅', '人物', '身后展开风雷双翅，雷光流转', '38% 30%'),
  ex(3, '静座问道', '水墨', '栏前静坐，远山留白', '50% 55%', true),
  ex(4, '山间读经', '人物', '竹屋檐下执卷而读', '50% 12%'),
  ex(5, '御风而行', '水墨', '衣袂翻飞，凌空于群山之上', '52% 6%', true),
  ex(6, '寒夜持矛', '人物', '风雪夜色中持矛而立', '50% 22%'),
  ex(7, '一剑开天', '人物', '御剑出招，青锋破空', '56% 22%'),
]

export const exhibitFor = (lightId: number) => EXHIBITS.find((e) => e.lightId === lightId) ?? null
