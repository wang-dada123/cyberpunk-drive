import { useSyncExternalStore } from 'react'
import { LIGHT_N, STALL_N, bitCount } from '../data/gadgets'
import { getProgress, subscribeProgress } from '../utils/progressStore'

/** 收集计数。放在左上标题下面，不占 debug / 小地图 / 摇杆 / 相机按钮。 */
export function CollectHud() {
  const p = useSyncExternalStore(subscribeProgress, getProgress, getProgress)
  const n = bitCount(p.lights, LIGHT_N)
  const marks = [
    p.gate ? '窄巷门' : '',
    bitCount(p.stalls, STALL_N) === STALL_N ? '夜市' : '',
    p.e8 ? 'E8' : '',
    p.s2 ? 'S2' : '',
    p.port ? '港区' : '',
  ].filter(Boolean)
  return (
    <div className="collect" id="collect-hud">
      <b>光点 {n}/{LIGHT_N}</b>
      {n === LIGHT_N ? ' · 展示环已亮' : ''}
      {marks.length > 0 && <div className="collect-sub">{marks.join(' · ')}</div>}
    </div>
  )
}
