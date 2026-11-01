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

function layoutDebug(box: HTMLDivElement, open: boolean) {
  const w = window.innerWidth
  const h = window.innerHeight
  const phone = isMobile || w < 820
  const portrait = h > w
  // 竖屏展开时下移，躲开左上角标题和光点计数
  const top = !phone ? 12 : open && portrait ? 148 : 64
  const miniH = w < 820 || h < 520 ? 110 : 160
  // 手机小地图上方还有 🗺 按钮，展开面板停在它上面
  const miniTop = phone ? 20 + miniH + 8 + 44 : 16 + miniH
  const maxH = Math.max(108, h - top - miniTop - 8)
  box.dataset.open = open ? '1' : '0'
  Object.assign(box.style, {
    position: 'fixed', right: '12px', top: `${top}px`, bottom: 'auto', left: 'auto', zIndex: '34',
    width: open ? (w < 820 ? 'min(232px, 54vw)' : '300px') : 'auto',
    height: 'auto', maxHeight: open ? `${maxH}px` : 'none', overflow: open ? 'auto' : 'hidden',
    background: 'rgba(2,6,12,0.82)', color: '#9fe6ff',
    font: `${w < 820 ? 10 : 11}px/1.35 monospace`,
    padding: '0', border: '1px solid #1f5f7a', pointerEvents: 'none', boxSizing: 'border-box',
  })
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
    return () => { window.removeEventListener('resize', onResize); box.remove(); gl.info.autoReset = true }
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
