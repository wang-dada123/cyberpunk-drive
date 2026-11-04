import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'

/** 长帧阈值：超过即视为卡顿帧（加载/GC/标签页切回）。不能取 0.1：软件渲染/慢机上正常帧就有 150–250ms，
 * 0.1 会让物理整体变慢（实测 1/3–1/10 实时，drive-laps 超时），与 main 行为不一致。 */
export const LONG_FRAME = 0.25
/** 卡顿帧最多补 15 个固定步（0.25s）；多余累积直接丢弃（rapier 自带上限是 0.5s=30 步） */
export const MAX_CATCHUP = 0.25

/**
 * 替代 <Physics> 自带的帧循环（Physics 设 paused，step 仍可手动调用）。
 * 正常帧（≤250ms）原样传入 → 与原先逐帧行为完全一致；
 * 长帧原先会按 0.5s 上限一次补最多 30 步（期间驾驶输入不变）；现在最多补 15 步，多余时间丢弃（物理短暂变慢，不会瞬移）。
 */
export function PhysicsClock({ priority = -50 }: { priority?: number }) {
  const { step } = useRapier()
  useFrame((_, dt) => step(dt > LONG_FRAME ? MAX_CATCHUP : dt), priority)
  return null
}
