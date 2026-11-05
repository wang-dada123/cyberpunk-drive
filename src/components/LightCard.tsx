import { useEffect, useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { exhibitFor } from '../data/exhibits'
import { ExhibitView } from './ExhibitView'
import { LIGHT_N, bitCount } from '../data/gadgets'
import { closeCard, getCard, subscribeCard } from '../utils/lightCard'
import { getProgress, subscribeProgress } from '../utils/progressStore'
import { hit, obstacles, type R } from './PerfOverlay'

/**
 * 国漫展厅卡片 v2（凡人修仙传）：开到作品街光点弹出对应展品，配图开卡时才加载。不暂停、不拿焦点、不吃方向键/WASD；
 * Esc / E 关闭（仅卡片打开时，捕获阶段拦下，不触发作品街展示牌的 E）；手机点「关闭」。
 * 位置：在候选位里挑第一个不碰按钮 / 小地图 / 摇杆 / FPS 面板 / 标题的（复用 PerfOverlay 的避让矩形）。
 */
export function LightCard() {
  const i = useSyncExternalStore(subscribeCard, getCard, getCard)
  const p = useSyncExternalStore(subscribeProgress, getProgress, getProgress)
  const box = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (i === null) return
    const k = (e: KeyboardEvent) => {
      if (e.code !== 'Escape' && e.code !== 'KeyE') return
      e.stopImmediatePropagation()
      closeCard()
    }
    window.addEventListener('keydown', k, true)
    return () => window.removeEventListener('keydown', k, true)
  }, [i])

  useLayoutEffect(() => {
    const el = box.current
    if (!el || i === null) return
    const place = () => {
      const w = window.innerWidth, h = window.innerHeight
      const bw = Math.min(h < 500 ? 300 : 360, w - 24)
      el.style.width = `${bw}px`
      el.style.maxHeight = ''
      const bh = Math.min(el.scrollHeight, h - 24)
      const obs = obstacles(el, true).concat([...document.querySelectorAll<HTMLElement>('#debug-panel, .debug-panel, .stats-gl')].map((d) => {
        const q = d.getBoundingClientRect(); return { l: q.left, t: q.top, r: q.right, b: q.bottom }
      }).filter((q) => q.r - q.l > 1))
      const hud = document.querySelector('.hud')?.getBoundingClientRect()
      const cx = Math.round((w - bw) / 2)
      const tops = [hud ? hud.bottom + 10 : 12, Math.round((h - bh) / 2), 12, 70]
      const lefts = [cx, w - bw - 12, 12]
      let pick: [number, number, number] | null = null
      for (const t of tops) for (const l of lefts) {
        if (pick) break
        // 不够高就截短（内部滚动），但至少留 140px
        let hh = bh
        const rect = (H: number): R => ({ l, t, r: l + bw, b: t + H })
        while (hh >= 140 && (t + hh > h - 8 || obs.some((o) => hit(rect(hh), o)))) hh -= 10
        if (hh >= 140) pick = [t, l, hh]
      }
      const [t, l, hh] = pick ?? [12, cx, Math.min(bh, h - 24)]
      Object.assign(el.style, { top: `${t}px`, left: `${l}px`, maxHeight: `${hh}px` })
      el.dataset.overlap = pick ? '0' : '1'
    }
    place()
    window.addEventListener('resize', place)
    const id = window.setInterval(place, 1000)
    return () => { window.removeEventListener('resize', place); window.clearInterval(id) }
  }, [i])

  if (i === null) return null
  const it = exhibitFor(i)
  if (!it) return null
  return (
    <div ref={box} className="lc-card fx-card" id="light-card" role="dialog" aria-label="国漫展品卡片">
      <ExhibitView key={it.lightId} ex={it} onClose={closeCard} head={<>国漫展厅 · {i + 1}/{LIGHT_N} · 光点 {bitCount(p.lights, LIGHT_N)}/{LIGHT_N}</>}>
        <div className="fx-hint">Esc / E 关闭 · 继续驾驶不受影响</div>
      </ExhibitView>
    </div>
  )
}
