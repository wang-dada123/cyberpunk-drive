import { useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { Text } from '@react-three/drei'
import * as THREE from 'three'

/** SDF 招牌（materials-v2 §4）：troika Text + Orbitron，letterSpacing .15，全大写；竖排宽 0.6m；字 #E8F4FF ×1.6，背板 #0E1824 85%；每区 ≤6，>60m 隐藏 */
export type SignSpec = { p: [number, number, number]; ry: number; text: string }
const FONT = `${import.meta.env.BASE_URL}fonts/nav-orbitron.woff`
const backMat = new THREE.MeshBasicMaterial({ color: '#0E1824', transparent: true, opacity: 0.85 })
const textCol = new THREE.Color('#E8F4FF').multiplyScalar(1.6)
const _v = new THREE.Vector3()

function Sign({ s }: { s: SignSpec }) {
  const g = useRef<THREE.Group>(null)
  const chars = s.text.toUpperCase().split('')
  const H = chars.length * 0.62 + 0.4
  useFrame(({ camera }) => { const o = g.current; if (o) o.visible = camera.position.distanceTo(_v.set(s.p[0], s.p[1], s.p[2])) < 60 })
  return (
    <group ref={g} position={s.p} rotation={[0, s.ry, 0]} userData={{ dynamic: true }}>
      <mesh material={backMat} position={[0, 0, -0.02]}><planeGeometry args={[0.6, H]} /></mesh>
      <Text font={FONT} fontSize={0.42} letterSpacing={0.15} lineHeight={1.1} color={textCol} anchorX="center" anchorY="middle" textAlign="center" material-toneMapped={false}>
        {chars.join('\n')}
      </Text>
    </group>
  )
}

export function Signs({ list }: { list: SignSpec[] }) {
  return <group userData={{ dynamic: true }}>{list.map((s, i) => <Sign key={i} s={s} />)}</group>
}
