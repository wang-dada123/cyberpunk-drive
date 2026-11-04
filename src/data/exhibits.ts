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
}

export const SERIES = '凡人修仙传'
const BASE = import.meta.env.BASE_URL
const ex = (lightId: number, title: string, kind: string, summary: string): Exhibit => {
  const n = String(lightId + 1).padStart(2, '0')
  return { lightId, series: SERIES, title, kind, summary, img: `${BASE}exhibits/fanren-${n}.webp`, thumb: `${BASE}exhibits/fanren-${n}-thumb.webp` }
}

export const EXHIBITS: Exhibit[] = [
  ex(0, '韩立', '人物', '出身山村的少年修士，本作主角'),
  ex(1, '七玄门', '门派', '江湖门派，修仙之路的起点'),
  ex(2, '黄枫谷', '宗门', '越国修仙宗门之一'),
  ex(3, '血色禁地', '秘境', '宗门弟子的试炼之地'),
  ex(4, '乱星海', '地域', '星罗棋布的海外修仙群岛'),
  ex(5, '虚天殿', '秘境', '乱星海中的上古殿府'),
  ex(6, '落云宗', '宗门', '天南修仙宗门'),
  ex(7, '灵界', '界域', '人界之上的广阔天地'),
]

export const exhibitFor = (lightId: number) => EXHIBITS.find((e) => e.lightId === lightId) ?? null
