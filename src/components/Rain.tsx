import { useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { colors } from '../theme/colors'
import { isMobile } from '../utils/isMobile'

/** 雨丝：冷白 30% 透明，斜 10°，手机端减半 */
export function Rain() {
  const count = isMobile ? 600 : 1200
  const ref = useRef<THREE.LineSegments>(null)
  const geo = useMemo(() => {
    const pos = new Float32Array(count * 6)
    for (let i = 0; i < count; i++) {
      const x = (Math.random() - 0.5) * 60, y = Math.random() * 20, z = (Math.random() - 0.5) * 100
      pos.set([x, y, z, x, y - 0.5, z], i * 6)
    }
    const g = new THREE.BufferGeometry()
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    return g
  }, [count])
  useFrame((_, dt) => {
    const a = geo.attributes.position as THREE.BufferAttribute
    const arr = a.array as Float32Array
    const d = Math.min(dt, 0.05) * 18
    for (let i = 0; i < arr.length; i += 6) {
      arr[i + 1] -= d; arr[i + 4] -= d
      if (arr[i + 4] < 0) { arr[i + 1] = 20; arr[i + 4] = 19.5 }
    }
    a.needsUpdate = true
  })
  return (
    <lineSegments ref={ref} geometry={geo} rotation={[0, 0, THREE.MathUtils.degToRad(10)]} frustumCulled={false}>
      <lineBasicMaterial color={colors.coldWhite} transparent opacity={0.3} depthWrite={false} fog />
    </lineSegments>
  )
}
