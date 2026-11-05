/** 书法字体（Ma Shan Zheng 子集，OFL）：按需注册，供卡片 CSS 与灯箱 Canvas 共用。只含 exhibits.ts 片名用到的字。 */
let p: Promise<boolean> | null = null
export const BRUSH = 'FanrenBrush'
export function loadBrushFont(): Promise<boolean> {
  if (p) return p
  const f = new FontFace(BRUSH, `url(${import.meta.env.BASE_URL}fonts/fanren-brush.woff2) format('woff2')`, { display: 'swap' })
  p = f.load().then((ff) => { document.fonts.add(ff); return true }).catch(() => false)
  return p
}
