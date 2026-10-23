import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { rendererInfo } from '../utils/rendererCheck'

/**
 * ?debug 性能面板（右下角）：fps、1% low、平均/5s 最大帧时间、帧时间曲线、刷新率估计、
 * draw calls、三角面、programs、renderer。每 0.5s 写一次 textContent，零 setState、零每帧分配；
 * 面板固定尺寸 + contain:strict，避免触发页面布局。
 * gl.info.autoReset=false：每帧开始手动 reset，结束后读取（含后处理 pass）。
 */
const N = 1024, G = 240
const frameMs = new Float32Array(N), stamp = new Float64Array(N), sorted = new Float32Array(N)
let head = 0, filled = 0, acc = 0
export const perfStats = { calls: 0, triangles: 0, programs: 0, fps: 0, low1: 0, max5s: 0, hz: 0 }

export function PerfOverlay() {
  const gl = useThree((s) => s.gl)
  const txt = useRef<HTMLDivElement | null>(null)
  const cv = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    gl.info.autoReset = false
    const box = document.createElement('div')
    Object.assign(box.style, { position: 'fixed', right: '8px', bottom: '8px', zIndex: '30', width: '260px', height: '150px',
      contain: 'strict', background: 'rgba(2,6,12,0.78)', color: '#9fe6ff', font: '11px/1.35 monospace',
      padding: '6px 8px', border: '1px solid #1f5f7a', pointerEvents: 'none', boxSizing: 'border-box', overflow: 'hidden' })
    const t = document.createElement('div'); t.style.whiteSpace = 'pre'
    const c = document.createElement('canvas'); c.width = G; c.height = 40
    box.append(t, c); document.body.appendChild(box)
    txt.current = t; cv.current = c
    return () => { box.remove(); gl.info.autoReset = true }
  }, [gl])
  useFrame(() => { gl.info.reset() }, -1000)
  useFrame((_, dt) => {
    perfStats.calls = gl.info.render.calls
    perfStats.triangles = gl.info.render.triangles
    const now = performance.now()
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
      `刷新率≈${perfStats.hz.toFixed(0)}Hz (中位帧)\n` +
      `calls ${perfStats.calls}  tris ${(perfStats.triangles / 1000).toFixed(1)}k  prog ${perfStats.programs}\n` +
      rendererInfo.name.slice(0, 40)
    const g = cv.current.getContext('2d')!
    g.clearRect(0, 0, G, 40)
    g.strokeStyle = '#2a6f8a'; g.beginPath(); g.moveTo(0, 40 - 16.7); g.lineTo(G, 40 - 16.7); g.stroke()
    g.strokeStyle = '#9fe6ff'; g.beginPath()
    const m = Math.min(G, filled)
    for (let k = 0; k < m; k++) {
      const y = 40 - Math.min(40, frameMs[(head - m + k + N) % N])
      if (k === 0) g.moveTo(k, y); else g.lineTo(k, y)
    }
    g.stroke()
  }, 1000)
  return null
}
