import { useFrame } from '@react-three/fiber'
import { useRapier } from '@react-three/rapier'

/** 长帧阈值：超过即视为卡顿帧（加载/GC/标签页切回），不再按墙钟补步 */
export const LONG_FRAME = 0.1
/** 卡顿帧最多补 4 个固定步（4/60s）；多余累积直接丢弃 */
export const MAX_CATCHUP = 4 / 60

/**
 * 替代 <Physics> 自带的帧循环（Physics 设 paused，step 仍可手动调用）。
 * 正常帧（≤100ms）原样传入 → 与原先逐帧行为完全一致；
 * 长帧原先会按 0.5s 上限一次补 30 步，期间驾驶输入停在旧值，车被甩出路线撞墙卡住；现在最多补 4 步。
 */
export function PhysicsClock({ priority = -50 }: { priority?: number }) {
  const { step } = useRapier()
  useFrame((_, dt) => step(dt > LONG_FRAME ? MAX_CATCHUP : dt), priority)
  return null
}
