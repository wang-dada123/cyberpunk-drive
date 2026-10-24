/**
 * 画质档位（单向降档，不回升）：
 * - ?tier=low / ?tier=high 强制；
 * - 否则 renderer 含 Intel / UHD / HD Graphics / Iris → low；
 * - 运行中实测：预热 4s 后连续 3s 平均帧时 > 24ms 且不是 30Hz 节流 → 降到 low（只降一次）。
 * low：DPR ≤ 1、Bloom 1/4 分辨率 + 少 mip、雨粒子减半。地面统一用预烘纹理（所有档一致）。
 * 开发 A/B：?ab=ground,bloom,landmark,signs,rain,minimap,ring,lights 逐项关闭以测成本（仅 DEV）。
 */
const q = typeof window !== 'undefined' ? new URLSearchParams(location.search) : new URLSearchParams()
export type Tier = 'high' | 'low'
const forced = q.get('tier')
export const tierState: { tier: Tier; reason: string; forced: boolean } = {
  tier: forced === 'low' ? 'low' : 'high', reason: forced ? `?tier=${forced}` : '默认', forced: forced === 'low' || forced === 'high',
}
export const AB = new Set(import.meta.env.DEV ? (q.get('ab') || '').split(',').filter(Boolean) : [])
const subs = new Set<(t: Tier) => void>()
export function onTier(f: (t: Tier) => void) { subs.add(f); return () => { subs.delete(f) } }
export function demote(reason: string) {
  if (tierState.tier === 'low' || tierState.forced) return
  tierState.tier = 'low'; tierState.reason = reason
  subs.forEach((f) => f('low'))
}
export const INTEL = /intel|uhd graphics|hd graphics|iris/i
export function tierFromRenderer(name: string) { if (INTEL.test(name)) demote('核显: ' + name.slice(0, 40)) }

/** 显示器刷新率探测：启动后 rAF 间隔的 20 百分位（快帧簇），不受慢帧影响；运行中也持续用 10 百分位更新 */
export const displayHz = { probe: 0, live: 0 }
if (typeof window !== 'undefined') {
  const d: number[] = []; let last = 0
  const f = (t: number) => { if (last) d.push(t - last); last = t
    if (d.length < 90) requestAnimationFrame(f)
    else { const s = d.slice(10).sort((a, b) => a - b); displayHz.probe = 1000 / s[Math.floor(s.length * 0.2)] } }
  requestAnimationFrame(f)
}
