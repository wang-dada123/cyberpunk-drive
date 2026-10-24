import { useEffect, useRef, useState } from 'react'
import { segs, rings, PLAZA_R, WORLD_HALF, eggs, BRIDGE, TUNNEL, TUNNEL_R1 } from '../data/mapLayout'
import { NAV, type NavId } from '../data/nav'
import { carPose } from './Car'
import { loadFonts } from './Nav'
import { isMobile } from '../utils/isMobile'

/**
 * 小地图（DOM，不进 WebGL / Bloom）：右下角圆形，底 #050A14 80%；电脑 160px / 手机 110px。
 * 静态底图（路网 #2A3A4E、主街主色 70%、街区名 10px #E8F4FF）只在尺寸变化/发现彩蛋时重画；每帧只移动车标 div。
 * M 键 / 手机 🗺 按钮切换放大（全屏半透明）。只显示已发现的彩蛋（#64FFDA 小点，车靠近 8m 记为发现）。
 */
export const discoveredEggs = new Set<string>()
const GUIDE: Record<string, NavId> = { portfolio: 'portfolio', aiStall: 'aiStall', hidden: 'hidden', alley: 'alley' }
const LABELS: Array<[NavId, number, number]> = [['portfolio', 0, -150], ['aiStall', 150, -14], ['hidden', -150, -14], ['alley', 0, 138], ['bridge', BRIDGE.c[0] + 22, BRIDGE.c[1]], ['tunnel', -(TUNNEL.R0 + 50) * Math.SQRT1_2 - 22, (TUNNEL.R0 + 50) * Math.SQRT1_2]]

function draw(cv: HTMLCanvasElement, px: number, big: boolean) {
  const dpr = Math.min(2, window.devicePixelRatio || 1)
  cv.width = cv.height = px * dpr
  const g = cv.getContext('2d')!
  g.setTransform(dpr, 0, 0, dpr, 0, 0)
  g.clearRect(0, 0, px, px)
  const s = (px / 2 - 4) / (WORLD_HALF - 8), c = px / 2
  g.save(); g.translate(c, c); g.scale(s, s)
  g.lineCap = 'round'
  const minW = 1.6 / s
  g.strokeStyle = '#2A3A4E'
  for (const r of rings) { g.lineWidth = Math.max(minW, r.w); g.beginPath(); g.arc(0, 0, r.r, 0, Math.PI * 2); g.stroke() }
  g.fillStyle = '#2A3A4E'; g.beginPath(); g.arc(0, 0, PLAZA_R, 0, Math.PI * 2); g.fill()
  const all = [...segs.filter((x) => !x.virtual || x.w === 10)]
  for (const sg of all) {
    const id = sg.guide && GUIDE[sg.guide]
    g.strokeStyle = id ? NAV[id].color + 'B3' : '#2A3A4E'
    g.lineWidth = Math.max(minW, sg.w * (id ? 0.9 : 0.7))
    g.beginPath(); g.moveTo(sg.a[0], sg.a[1]); g.lineTo(sg.b[0], sg.b[1]); g.stroke()
  }
  // 天桥 / 隧道段（主色 70%）
  const Q = Math.SQRT1_2, L = BRIDGE.FLAT / 2 + BRIDGE.RAMP
  g.lineWidth = Math.max(minW * 1.4, 9)
  g.strokeStyle = NAV.bridge.color + 'B3'; g.beginPath(); g.moveTo(BRIDGE.c[0] - Q * L, BRIDGE.c[1] - Q * L); g.lineTo(BRIDGE.c[0] + Q * L, BRIDGE.c[1] + Q * L); g.stroke()
  g.strokeStyle = NAV.tunnel.color + 'B3'; g.setLineDash([6, 5]); g.beginPath(); g.moveTo(-TUNNEL.R0 * Q, TUNNEL.R0 * Q); g.lineTo(-TUNNEL_R1 * Q, TUNNEL_R1 * Q); g.stroke(); g.setLineDash([])
  g.fillStyle = '#64FFDA'
  for (const e of eggs) if (discoveredEggs.has(e.id)) { g.beginPath(); g.arc(e.p[0], e.p[2], 2.2 / s, 0, Math.PI * 2); g.fill() }
  g.restore()
  g.fillStyle = '#E8F4FF'; g.font = `500 ${big ? 13 : 10}px "NavSC", "Noto Sans SC", "Noto Sans CJK SC", sans-serif`; g.textAlign = 'center'; g.textBaseline = 'middle'
  g.shadowColor = '#050A14'; g.shadowBlur = 3
  for (const [id, x, z] of LABELS) {
    if (!big && (id === 'bridge' || id === 'tunnel')) continue // 小图只标四大街区，放大后全部标
    g.fillText(NAV[id].name, c + x * s, c + z * s)
  }
}

export function Minimap() {
  const [big, setBig] = useState(false)
  const [eggN, setEggN] = useState(0)
  const cv = useRef<HTMLCanvasElement>(null), car = useRef<HTMLDivElement>(null), wrap = useRef<HTMLDivElement>(null)
  const debug = new URLSearchParams(location.search).has('debug')
  const small = isMobile || window.innerHeight < 500 ? 110 : 160
  const [vw, setVw] = useState(() => Math.min(innerWidth, innerHeight))
  const px = big ? Math.round(vw * 0.86) : small
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.code === 'KeyM' && !e.repeat) setBig((b) => !b) }
    const r = () => setVw(Math.min(innerWidth, innerHeight))
    window.addEventListener('keydown', k); window.addEventListener('resize', r)
    return () => { window.removeEventListener('keydown', k); window.removeEventListener('resize', r) }
  }, [])
  const [fontOk, setFontOk] = useState(0)
  useEffect(() => { loadFonts().then(() => setFontOk(1)) }, [])
  useEffect(() => { if (cv.current) draw(cv.current, px, big) }, [px, big, eggN, fontOk])
  useEffect(() => {
    let raf = 0
    const s = (px / 2 - 4) / (WORLD_HALF - 8)
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const p = carPose.position, q = carPose.quaternion
      const yaw = 2 * Math.atan2(q.y, q.w)
      if (car.current) car.current.style.transform = `translate(${px / 2 + p.x * s}px,${px / 2 + p.z * s}px) rotate(${-yaw}rad)`
      for (const e of eggs) if (!discoveredEggs.has(e.id) && Math.hypot(e.p[0] - p.x, e.p[2] - p.z) < 8) { discoveredEggs.add(e.id); setEggN(discoveredEggs.size) }
    }
    tick()
    return () => cancelAnimationFrame(raf)
  }, [px])
  // 电脑：右下；开 debug 时面板占右下 230px → 上移。手机：右下（摇杆在左半屏；🎥 和 debug 面板在右上）
  const pos: React.CSSProperties = big
    ? { left: '50%', top: '50%', marginLeft: -px / 2, marginTop: -px / 2 }
    : (debug && window.innerHeight < 500 && window.innerWidth >= 600) ? { right: 250, bottom: 16 } : { right: isMobile ? 12 : 16, bottom: isMobile ? 20 : debug && window.innerWidth >= 600 ? 264 : 16 } // debug 面板（桌面右下 240px 高；横屏矮屏在右上 230px 宽）
  return (
    <>
      <div ref={wrap} onClick={() => setBig((b) => !b)} style={{ position: 'fixed', ...pos, width: px, height: px, borderRadius: '50%', overflow: 'hidden', zIndex: 25,
        background: big ? 'rgba(5,10,20,0.72)' : 'rgba(5,10,20,0.8)', border: '1px solid rgba(232,244,255,0.18)', cursor: 'pointer', touchAction: 'manipulation' }}>
        <canvas ref={cv} style={{ width: px, height: px, display: 'block' }} />
        <div ref={car} style={{ position: 'absolute', left: 0, top: 0, width: 0, height: 0 }}>
          <div style={{ position: 'absolute', left: -9, top: -9, width: 18, height: 18, borderRadius: '50%', border: '2px solid #4FC3F7', boxShadow: '0 0 6px #4FC3F7', boxSizing: 'border-box', opacity: 0.85 }} />
          <div style={{ position: 'absolute', left: -5, top: -7, width: 0, height: 0, borderLeft: '5px solid transparent', borderRight: '5px solid transparent', borderBottom: '12px solid #E8F4FF' }} />
        </div>
        {!big && !isMobile && <div style={{ position: 'absolute', left: 0, right: 0, bottom: 2, textAlign: 'center', fontSize: 9, color: 'rgba(232,244,255,0.5)' }}>M 放大</div>}
      </div>
      {isMobile && !big && (
        <button aria-label="放大地图" onPointerUp={(e) => { e.preventDefault(); setBig(true) }}
          style={{ position: 'fixed', right: 12, bottom: 20 + small + 8, zIndex: 25, width: 40, height: 40, borderRadius: 10, border: '1px solid #5fd4ff', background: 'rgba(8,16,28,0.7)', color: '#bfeaff', fontSize: 18 }}>🗺</button>
      )}
    </>
  )
}
