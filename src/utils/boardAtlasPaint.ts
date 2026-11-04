/**
 * 离线烘焙用：把 8 个凡人灯箱正面（缩略图/渐变/青玉框/云纹角/书法片名）画进一张 Canvas。
 * 运行时不再导入本文件 —— 产物是 public/exhibits/fanren-atlas.webp（node scripts/bake-atlas.mjs）。
 * 原因：Canvas 2D 书法字 + shadowBlur 在运行时绘制/上传会在行驶中产生 0.4–0.8s 长帧（实测）。
 */
import type { Exhibit } from '../data/exhibits'
import { BRUSH } from './brushFont'
import { ATL_S, CW, CH, COLS, ROWS } from './boardAtlas'
const JADE = '#8FE3C8', GLOW = '#3DF5C8'
export function drawFace(g: CanvasRenderingContext2D, ox: number, oy: number, p: Exhibit, img: HTMLImageElement | undefined, brush: boolean) {
  const S = ATL_S, W = CW, H = CH
  g.save(); g.translate(ox, oy)
  g.beginPath(); g.rect(0, 0, W, H); g.clip()
  const m = 0.07 * S // 外框留边
  if (img && img.naturalWidth) {
    const r = Math.max((W - 2 * m) / img.naturalWidth, (H - 2 * m) / img.naturalHeight)
    const iw = img.naturalWidth * r, ih = img.naturalHeight * r
    g.fillStyle = '#05151a'; g.fillRect(0, 0, W, H)
    g.drawImage(img, (W - iw) / 2, (H - ih) / 2, iw, ih) // 缩略图已按 focus 裁好
  } else {
    const bg = g.createLinearGradient(0, 0, W * 0.4, H)
    bg.addColorStop(0, '#1F7A68'); bg.addColorStop(0.55, '#0C3332'); bg.addColorStop(1, '#05151A')
    g.fillStyle = bg; g.fillRect(0, 0, W, H)
  }
  // 暗色渐变：上浅下深，保证片名可读
  const sh = g.createLinearGradient(0, 0, 0, H)
  const L = p.light ? 1 : 0 // 白底水墨压得更重
  sh.addColorStop(0, `rgba(3,12,14,${0.35 + L * 0.25})`); sh.addColorStop(0.45, `rgba(3,12,14,${0.05 + L * 0.2})`); sh.addColorStop(0.66, `rgba(4,14,18,${0.75 + L * 0.15})`); sh.addColorStop(1, 'rgba(4,14,18,0.97)')
  g.fillStyle = sh; g.fillRect(0, 0, W, H)
  // 青玉双框
  g.strokeStyle = JADE; g.shadowColor = GLOW; g.shadowBlur = 8
  g.lineWidth = 0.045 * S; g.strokeRect(m * 0.5, m * 0.5, W - m, H - m)
  g.shadowBlur = 0; g.lineWidth = 0.014 * S; g.globalAlpha = 0.7
  g.strokeRect(m * 1.6, m * 1.6, W - m * 3.2, H - m * 3.2); g.globalAlpha = 1
  // 云纹角
  const curl = (sx: number, sy: number) => {
    g.save(); g.translate(sx < 0 ? W : 0, sy < 0 ? H : 0); g.scale(sx, sy)
    const u = 0.42 * S / 40
    g.scale(u, u); g.lineWidth = 2.4; g.strokeStyle = JADE; g.lineCap = 'round'
    g.beginPath(); g.moveTo(6, 52); g.lineTo(6, 16); g.quadraticCurveTo(6, 6, 16, 6); g.lineTo(52, 6); g.stroke()
    g.beginPath(); g.arc(20, 20, 6, Math.PI * 0.5, Math.PI * 2.1); g.stroke()
    g.beginPath(); g.arc(22, 19, 2.6, 0, Math.PI * 1.4); g.stroke()
    g.restore()
  }
  curl(1, 1); curl(-1, 1); curl(1, -1); curl(-1, -1)
  // 片名（书法）+ 系列名
  const font = (px: number) => `${Math.round(px)}px ${brush ? `'${BRUSH}', ` : ''}'STKaiti', 'KaiTi', serif`
  g.textAlign = 'center'; g.textBaseline = 'middle'
  g.fillStyle = JADE; g.font = font(0.2 * S); g.shadowColor = GLOW; g.shadowBlur = 6
  g.fillText(`《${p.series}》`, W / 2, H - 1.28 * S)
  const n = [...p.title].length, size = Math.min(0.62, 2.5 / n) * S
  g.font = font(size); g.fillStyle = '#F2FFF9'; g.shadowBlur = 14
  g.fillText(p.title, W / 2, H - 0.72 * S)
  g.shadowBlur = 0
  // 底部细线
  const ln = g.createLinearGradient(m * 3, 0, W - m * 3, 0)
  ln.addColorStop(0, 'rgba(143,227,200,0)'); ln.addColorStop(0.5, 'rgba(143,227,200,0.8)'); ln.addColorStop(1, 'rgba(143,227,200,0)')
  g.fillStyle = ln; g.fillRect(m * 3, H - 0.32 * S, W - m * 6, 0.012 * S)
  g.restore()
}

export function paintAtlas(cv: HTMLCanvasElement, list: Exhibit[], imgs: Map<string, HTMLImageElement>, brush: boolean) {
  cv.width = CW * COLS; cv.height = CH * ROWS
  const g = cv.getContext('2d')!
  list.forEach((p, i) => drawFace(g, (i % COLS) * CW, Math.floor(i / COLS) * CH, p, imgs.get(p.thumb), brush))
}
