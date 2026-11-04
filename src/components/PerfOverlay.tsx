import { displayHz, tierState } from '../utils/tier'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rendererInfo } from '../utils/rendererCheck'
import { carVisual, physStats } from './Car'
import { expansionStats } from './expansionDrive'
import { camState, camStats } from './FollowCamera'
import { isMobile } from '../utils/isMobile'

/**
 * ?debug 性能面板（右下角）：fps、1% low、平均/5s 最大帧时间、帧时间曲线、刷新率估计、
 * draw calls、三角面、programs、renderer。每 0.5s 写一次 textContent，零 setState、零每帧分配；
 * 面板固定尺寸 + contain:strict，避免触发页面布局。
 * gl.info.autoReset=false：每帧开始手动 reset，结束后读取（含后处理 pass）。
 */
const N = 1024, G = 240
const frameMs = new Float32Array(N), stamp = new Float64Array(N), sorted = new Float32Array(N)
const carSpd = new Float32Array(N), steps = new Uint8Array(N)
const _cp = new THREE.Vector3(), _lp = new THREE.Vector3()
let head = 0, filled = 0, acc = 0, hasLp = false
export const perfStats = { calls: 0, triangles: 0, programs: 0, fps: 0, low1: 0, max5s: 0, hz: 0, nonFinite: 0 }

/** 刷新率不再用"中位帧间隔"（慢帧会被误当成 24Hz）：显示器 Hz＝启动 rAF 快帧簇探测；渲染帧率单独列；判断受限/节流 */
function hzLine() {
  const disp = displayHz.probe, med = perfStats.hz
  let tag = ''
  if (disp > 0 && disp < 40 && Math.abs(disp - 30) < 4) tag = '  ⚠ 疑似省电/效率模式 30Hz 节流'
  else if (disp > 0 && med < disp * 0.8) tag = '  ⚠ 渲染跟不上刷新率（GPU/CPU 受限，非显示器）'
  return `显示器≈${disp ? disp.toFixed(0) : '?'}Hz(rAF探测) 渲染中位${med.toFixed(0)}fps${tag}\n`
}

export type R = { l: number; t: number; r: number; b: number }
/** 面板不许盖住的东西：所有按钮、小地图、摇杆、左上标题 */
export function obstacles(box: HTMLElement, withHud: boolean): R[] {
  const out: R[] = []
  document.querySelectorAll<HTMLElement>(withHud ? 'button, #minimap, .joystick-base, .hud, [role="button"]' : 'button, #minimap, .joystick-base, [role="button"]').forEach((el) => {
    if (box.contains(el)) return
    const q = el.getBoundingClientRect()
    if (q.width < 1 || q.height < 1) return
    out.push({ l: q.left, t: q.top, r: q.right, b: q.bottom })
  })
  return out
}
export const hit = (a: R, b: R) => a.l < b.r + 4 && a.r > b.l - 4 && a.t < b.b + 4 && a.b > b.t - 4

/**
 * 收起：一条「FPS xx」小钮，按候选位置挨个试，取第一个不碰任何按钮 / 小地图 / 摇杆 / 标题的。
 * 展开：从小钮位置往下长，高度截到下面第一个障碍物之上，超出滚动。
 */
function layoutDebug(box: HTMLDivElement, open: boolean) {
  const w = window.innerWidth
  const h = window.innerHeight
  const phone = isMobile || w < 820
  const width = open ? Math.min(w < 820 ? 232 : 300, Math.floor(w * 0.54)) : 0
  Object.assign(box.style, {
    position: 'fixed', bottom: 'auto', left: 'auto', zIndex: '34',
    width: open ? `${width}px` : 'auto', height: 'auto', overflow: open ? 'auto' : 'hidden',
    background: 'rgba(2,6,12,0.82)', color: '#9fe6ff',
    font: `${w < 820 ? 10 : 11}px/1.35 monospace`,
    padding: '0', border: '1px solid #1f5f7a', pointerEvents: 'none', boxSizing: 'border-box',
  })
  box.dataset.open = open ? '1' : '0'
  const obs = obstacles(box, !open)
  const hud = document.querySelector('.hud')?.getBoundingClientRect()
  // 候选锚点（右上角坐标）：相机钮左边 → 相机钮下面 → 顶部居中
  const cands: [number, number][] = phone
    ? [[12, 66], [64, 12], [12, Math.max(12, Math.round(w / 2 - 60))], [h - 44, Math.round(w / 2 - 40)]]
    : [[12, 12], [12, 66]]
  if (open && phone && hud) cands.unshift([Math.round(hud.bottom + 8), 12])
  const bw = open ? width : 84
  let pick = cands[0]
  let best = -1
  for (const c of cands) {
    const rect: R = { l: w - c[1] - bw, t: c[0], r: w - c[1], b: c[0] + (open ? 120 : 30) }
    if (!obs.some((o) => hit(rect, o))) { pick = c; best = 1; break }
  }
  if (best < 0) pick = cands[0]
  const [top, right] = pick
  let maxH = h - top - 8
  if (open) {
    const span: R = { l: w - right - width, t: top, r: w - right, b: h }
    for (const o of obs) if (o.b > top && hit(span, o)) maxH = Math.min(maxH, o.t - 8 - top)
    maxH = Math.max(60, maxH)
  }
  Object.assign(box.style, { top: `${top}px`, right: `${right}px`, maxHeight: open ? `${maxH}px` : 'none' })
}

export function PerfOverlay() {
  const gl = useThree((s) => s.gl)
  const txt = useRef<HTMLDivElement | null>(null)
  const cv = useRef<HTMLCanvasElement | null>(null)
  const btn = useRef<HTMLButtonElement | null>(null)
  const open = useRef(false)
  useEffect(() => {
    gl.info.autoReset = false
    const box = document.createElement('div')
    box.id = 'debug-panel'
    const b = document.createElement('button')
    b.id = 'debug-toggle'
    b.type = 'button'
    b.textContent = 'FPS --'
    b.setAttribute('aria-label', '展开帧率面板')
    b.setAttribute('aria-expanded', 'false')
    Object.assign(b.style, {
      pointerEvents: 'auto', cursor: 'pointer', display: 'block', width: '100%', textAlign: 'left',
      background: 'transparent', color: 'inherit', border: 'none', font: 'inherit',
      padding: '5px 8px', minWidth: '72px', minHeight: '28px',
    })
    const body = document.createElement('div')
    body.style.display = 'none'
    body.style.pointerEvents = 'none'
    body.style.padding = '0 8px 6px'
    const t = document.createElement('div'); t.style.whiteSpace = 'pre-wrap'; t.style.wordBreak = 'break-all'
    const c = document.createElement('canvas'); c.width = G; c.height = 72
    c.style.display = 'block'
    c.style.width = '100%'
    c.style.height = '72px'
    body.append(t, c)
    box.append(b, body)
    document.body.appendChild(box)
    layoutDebug(box, false)
    const later = [300, 1200, 3000].map((ms) => window.setTimeout(() => layoutDebug(box, open.current), ms))
    const onResize = () => layoutDebug(box, open.current)
    b.addEventListener('click', (e) => {
      e.stopPropagation()
      e.preventDefault()
      open.current = !open.current
      body.style.display = open.current ? 'block' : 'none'
      b.setAttribute('aria-expanded', open.current ? 'true' : 'false')
      b.setAttribute('aria-label', open.current ? '收起帧率面板' : '展开帧率面板')
      layoutDebug(box, open.current)
    })
    window.addEventListener('resize', onResize)
    txt.current = t; cv.current = c; btn.current = b
    if (import.meta.env.DEV) Object.assign(window, { __perf: perfStats })
    return () => { later.forEach(clearTimeout); window.removeEventListener('resize', onResize); box.remove(); gl.info.autoReset = true }
  }, [gl])
  // 整帧合计：每帧最早处先读上一帧（含后处理所有 pass）的累计值，再清零
  useFrame(() => {
    gl.info.autoReset = false
    // 非有限值（如未同步的 troika instanceCount=Infinity）记 0 并计数，面板可见
    const c = gl.info.render.calls, t = gl.info.render.triangles
    if (!Number.isFinite(c) || !Number.isFinite(t)) perfStats.nonFinite++
    perfStats.calls = Number.isFinite(c) ? c : 0
    perfStats.triangles = Number.isFinite(t) ? t : 0
    gl.info.reset()
  }, -1000)
  useFrame((_, dt) => {
    const now = performance.now()
    // 每帧车可视体位移 |Δpos|/dt（匀速应为平线）+ 本帧物理步数
    if (carVisual.current) {
      carVisual.current.getWorldPosition(_cp)
      carSpd[head] = hasLp && dt > 0 ? _cp.distanceTo(_lp) / dt : 0
      _lp.copy(_cp); hasLp = true
    }
    steps[head] = physStats.stepsThisFrame
    frameMs[head] = dt * 1000; stamp[head] = now; head = (head + 1) % N; filled = Math.min(N, filled + 1)
    acc += dt
    if (acc < 0.5 || !txt.current || !cv.current) return
    acc = 0
    let sum = 0, n = 0, mx = 0
    for (let k = 0; k < filled; k++) {
      const i = (head - 1 - k + N) % N
      if (now - stamp[i] > 5000) break
      const v = frameMs[i]; sum += v; sorted[n++] = v; if (v > mx) mx = v
    }
    if (!n) return
    const view = sorted.subarray(0, n); view.sort()
    const p99 = view[Math.min(n - 1, Math.floor(n * 0.99))], med = view[n >> 1]
    perfStats.fps = 1000 / (sum / n); perfStats.low1 = 1000 / p99; perfStats.max5s = mx
    perfStats.hz = 1000 / med; perfStats.programs = gl.info.programs?.length ?? 0
    if (btn.current) btn.current.textContent = open.current ? `收起  FPS ${perfStats.fps.toFixed(0)}` : `FPS ${perfStats.fps.toFixed(0)}`
    if (!open.current) return
    txt.current.textContent =
      `FPS ${perfStats.fps.toFixed(1)}  1%low ${perfStats.low1.toFixed(1)}\n` +
      `avg ${(sum / n).toFixed(2)}ms  max5s ${mx.toFixed(1)}ms\n` +
      hzLine() +
      `calls ${perfStats.calls}  tris ${(perfStats.triangles / 1000).toFixed(1)}k  prog ${perfStats.programs}  nonFinite ${perfStats.nonFinite}\n` +
      rendererInfo.name.replace(/^ANGLE \(/, "").slice(0, 90) + '\n' +
      `画质 ${tierState.tier} (${tierState.reason})\n` +
      `视角 ${camState.mode} 切档${camStats.switches}次 来源:${camStats.lastSource} NaN:${camStats.nan}\n` +
      `扩建 扇区${expansionStats.sectors} 飞台${expansionStats.jumps} 复位${expansionStats.resets}\n` +
      `车速曲线(绿,m/s) 物理步/帧(橙)`
    const g = cv.current.getContext('2d')!
    g.clearRect(0, 0, G, 100)
    g.strokeStyle = '#2a6f8a'; g.beginPath(); g.moveTo(0, 40 - 16.7); g.lineTo(G, 40 - 16.7); g.stroke()
    g.strokeStyle = '#9fe6ff'; g.beginPath()
    const m = Math.min(G, filled)
    for (let k = 0; k < m; k++) {
      const y = 40 - Math.min(40, frameMs[(head - m + k + N) % N])
      if (k === 0) g.moveTo(k, y); else g.lineTo(k, y)
    }
    g.stroke()
    let smax = 1
    for (let k = 0; k < m; k++) smax = Math.max(smax, carSpd[(head - m + k + N) % N])
    g.strokeStyle = '#6f6'; g.beginPath()
    for (let k = 0; k < m; k++) {
      const y = 85 - 40 * carSpd[(head - m + k + N) % N] / smax
      if (k === 0) g.moveTo(k, y); else g.lineTo(k, y)
    }
    g.stroke()
    g.fillStyle = '#fa4'
    for (let k = 0; k < m; k++) { const st = steps[(head - m + k + N) % N]; g.fillRect(k, 100 - st * 5, 1, st * 5) }
  }, 1000)
  return null
}
