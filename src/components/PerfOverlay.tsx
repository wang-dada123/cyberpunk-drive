import { displayHz, tierState } from '../utils/tier'
import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { rendererInfo } from '../utils/rendererCheck'
import { carVisual, physStats } from './Car'
import { expansionStats } from './expansionDrive'
import { camState, camStats } from './FollowCamera'

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

export function PerfOverlay() {
  const gl = useThree((s) => s.gl)
  const txt = useRef<HTMLDivElement | null>(null)
  const cv = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    gl.info.autoReset = false
    const box = document.createElement('div')
    // 手机竖屏：放右上（🎥 按钮下方），避开左下摇杆；桌面：右下
    const narrow = window.innerWidth < 600 || window.innerHeight < 500 // 竖屏手机或横屏矮屏：右上
    Object.assign(box.style, { position: 'fixed', right: '8px', zIndex: '30', width: narrow ? '230px' : '330px', height: narrow ? '250px' : '240px',
      ...(narrow ? { top: '64px' } : { bottom: '8px' }), fontSize: narrow ? '9.5px' : '11px',
      contain: 'strict', background: 'rgba(2,6,12,0.78)', color: '#9fe6ff', font: '11px/1.35 monospace',
      padding: '6px 8px', border: '1px solid #1f5f7a', pointerEvents: 'none', boxSizing: 'border-box', overflow: 'hidden' })
    box.style.height = narrow ? '268px' : '258px'
    const t = document.createElement('div'); t.style.whiteSpace = 'pre-wrap'; t.style.wordBreak = 'break-all'
    const c = document.createElement('canvas'); c.width = G; c.height = 100
    box.append(t, c); document.body.appendChild(box)
    txt.current = t; cv.current = c
    return () => { box.remove(); gl.info.autoReset = true }
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
