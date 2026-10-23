import { useEffect, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'

/**
 * ?debug 性能面板：fps、帧时间曲线、1% low、draw calls、三角面。
 * 直接写 DOM（textContent + 2D canvas），每 0.5s 刷新文本，零 setState。
 * gl.info.autoReset=false：每帧开始手动 reset，结束后读取（含后处理 pass）。
 */
const N = 240
const frameMs = new Float32Array(N)
const sorted = new Float32Array(N)
let head = 0, filled = 0, acc = 0
export const perfStats = { calls: 0, triangles: 0, fps: 0, low1: 0 }

export function PerfOverlay() {
  const gl = useThree((s) => s.gl)
  const txt = useRef<HTMLDivElement | null>(null)
  const cv = useRef<HTMLCanvasElement | null>(null)
  useEffect(() => {
    gl.info.autoReset = false
    const box = document.createElement('div')
    Object.assign(box.style, { position: 'fixed', left: '8px', top: '8px', zIndex: '30', background: 'rgba(2,6,12,0.75)',
      color: '#9fe6ff', font: '11px/1.35 monospace', padding: '6px 8px', border: '1px solid #1f5f7a', pointerEvents: 'none' })
    const t = document.createElement('div'); t.style.whiteSpace = 'pre'
    const c = document.createElement('canvas'); c.width = N; c.height = 50
    box.append(t, c); document.body.appendChild(box)
    txt.current = t; cv.current = c
    return () => { box.remove(); gl.info.autoReset = true }
  }, [gl])
  useFrame(() => { gl.info.reset() }, -1000)
  useFrame((_, dt) => {
    perfStats.calls = gl.info.render.calls
    perfStats.triangles = gl.info.render.triangles
    frameMs[head] = dt * 1000; head = (head + 1) % N; filled = Math.min(N, filled + 1)
    acc += dt
    if (acc < 0.5 || !txt.current || !cv.current) return
    acc = 0
    let sum = 0
    for (let i = 0; i < filled; i++) { sum += frameMs[i]; sorted[i] = frameMs[i] }
    const view = sorted.subarray(0, filled); view.sort()
    const p99 = view[Math.min(filled - 1, Math.floor(filled * 0.99))]
    perfStats.fps = 1000 / (sum / filled); perfStats.low1 = 1000 / p99
    txt.current.textContent =
      `FPS ${perfStats.fps.toFixed(1)}  1%low ${perfStats.low1.toFixed(1)}\n` +
      `frame ${(sum / filled).toFixed(2)}ms  max ${view[filled - 1].toFixed(1)}ms\n` +
      `calls ${perfStats.calls}  tris ${(perfStats.triangles / 1000).toFixed(1)}k`
    const g = cv.current.getContext('2d')!
    g.clearRect(0, 0, N, 50)
    g.strokeStyle = '#2a6f8a'; g.beginPath(); g.moveTo(0, 50 - 16.7); g.lineTo(N, 50 - 16.7); g.stroke() // 60fps 线
    g.strokeStyle = '#9fe6ff'; g.beginPath()
    for (let i = 0; i < filled; i++) {
      const v = frameMs[(head - filled + i + N) % N]
      const y = 50 - Math.min(50, v)
      if (i === 0) g.moveTo(i, y); else g.lineTo(i, y)
    }
    g.stroke()
  }, 1000)
  return null
}
