import { useEffect, useRef, type ReactNode } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'

/**
 * 静态合批：子树挂载稳定后（等 2 帧，troika/rapier 定位完成）一次性：
 *  - 普通 Mesh：按「材质 + 几何属性签名 + 街区块(CHUNK m)」分组 mergeGeometries，烘入世界矩阵
 *  - InstancedMesh：按街区块拆成多个 InstancedMesh（各自 boundingSphere → 视锥剔除生效）
 *  - 原物体 visible=false（碰撞体不受影响），新物体 matrixAutoUpdate=false
 *  - troika Text 不能合批：保留，超过 TEXT_FAR 米隐藏（每 0.25s 检查）
 *  - 完成后 gl.compile(scene, camera) 预编译着色器（三档相机共用同一套材质）
 * 标记 userData.dynamic 的物体及其子树跳过。
 */
export const CHUNK = 60      // 普通网格合批块
export const INST_CHUNK = 175 // 实例拆块（太细会增加 draw call）
export const INST_SPLIT_MIN = 48
export const TEXT_FAR = 85
export const batchStats = { meshesIn: 0, mergedOut: 0, instIn: 0, instOut: 0, texts: 0 }

const _v = new THREE.Vector3()
const _m = new THREE.Matrix4()
// 网格偏移半格：出生点/广场落在单一块中心，而非四块交界
const ck = (x: number, z: number, c = CHUNK, off = 0.5) => `${Math.floor(x / c + off)},${Math.floor(z / c + off)}`
const sig = (g: THREE.BufferGeometry) => Object.keys(g.attributes).sort().join('|') + (g.index ? '#i' : '#n')

function isText(o: THREE.Object3D) {
  return 'sdfGlyphSize' in o || (o as unknown as { isTroikaText?: boolean }).isTroikaText === true
}

export function StaticBatch({ children }: { children: ReactNode }) {
  const root = useRef<THREE.Group>(null)
  const { gl, scene, camera } = useThree()
  const frames = useRef(0)
  const done = useRef(false)
  const texts = useRef<{ o: THREE.Object3D; p: THREE.Vector3 }[]>([])
  const out = useRef<THREE.Group | null>(null)
  const tAcc = useRef(0)

  useEffect(() => () => { if (out.current) { out.current.removeFromParent(); out.current.traverse((o) => { if ((o as THREE.Mesh).isMesh) (o as THREE.Mesh).geometry.dispose() }) } }, [])

  useFrame((_, dt) => {
    if (!done.current) {
      if (++frames.current < 3 || !root.current) return
      done.current = true
      const r = root.current
      r.updateWorldMatrix(true, true)
      const groups = new Map<string, { mat: THREE.Material; geos: THREE.BufferGeometry[]; srcs: THREE.Mesh[] }>()
      const insts: THREE.InstancedMesh[] = []
      const skip = (o: THREE.Object3D) => { for (let p: THREE.Object3D | null = o; p && p !== r; p = p.parent) if (p.userData.dynamic || !p.visible) return true; return false }
      r.traverse((o) => {
        if (isText(o)) { o.updateWorldMatrix(true, false); texts.current.push({ o, p: new THREE.Vector3().setFromMatrixPosition(o.matrixWorld) }); return }
        const mesh = o as THREE.Mesh
        if (!mesh.isMesh || skip(o) || Array.isArray(mesh.material)) return
        if ((mesh as THREE.InstancedMesh).isInstancedMesh) { insts.push(mesh as THREE.InstancedMesh); return }
        if ((mesh as unknown as THREE.SkinnedMesh).isSkinnedMesh || mesh.morphTargetInfluences) return
        const g = mesh.geometry
        if (!g.boundingSphere) g.computeBoundingSphere()
        _v.copy(g.boundingSphere!.center).applyMatrix4(mesh.matrixWorld)
        const key = `${mesh.material.uuid}|${sig(g)}|${ck(_v.x, _v.z)}|${mesh.castShadow}${mesh.receiveShadow}`
        let e = groups.get(key)
        if (!e) groups.set(key, (e = { mat: mesh.material as THREE.Material, geos: [], srcs: [] }))
        e.geos.push(g.clone().applyMatrix4(mesh.matrixWorld)); e.srcs.push(mesh)
      })
      const holder = new THREE.Group(); holder.name = 'static-batch'
      batchStats.texts = texts.current.length
      groups.forEach((e) => {
        batchStats.meshesIn += e.srcs.length
        if (e.srcs.length < 2) { e.geos[0].dispose(); return }
        const merged = mergeGeometries(e.geos, false)
        e.geos.forEach((g) => g.dispose())
        if (!merged) return
        merged.computeBoundingSphere(); merged.computeBoundingBox()
        const m = new THREE.Mesh(merged, e.mat)
        m.castShadow = e.srcs[0].castShadow; m.receiveShadow = e.srcs[0].receiveShadow
        m.renderOrder = e.srcs[0].renderOrder
        m.matrixAutoUpdate = false; m.updateMatrix()
        holder.add(m); e.srcs.forEach((s) => (s.visible = false)); batchStats.mergedOut++
      })
      insts.forEach((im) => {
        if (im.count < INST_SPLIT_MIN) { im.matrixAutoUpdate = false; im.computeBoundingSphere(); return }
        batchStats.instIn++
        const cells = new Map<string, number[]>()
        for (let i = 0; i < im.count; i++) {
          im.getMatrixAt(i, _m); _m.premultiply(im.matrixWorld); _v.setFromMatrixPosition(_m)
          const k = ck(_v.x, _v.z, INST_CHUNK, 0) /* 实例按象限拆 */; let a = cells.get(k); if (!a) cells.set(k, (a = [])); a.push(i)
        }
        if (cells.size < 2) { im.computeBoundingSphere(); return }
        const c = new THREE.Color()
        cells.forEach((ids) => {
          const n = new THREE.InstancedMesh(im.geometry, im.material, ids.length)
          ids.forEach((src, j) => {
            im.getMatrixAt(src, _m); _m.premultiply(im.matrixWorld); n.setMatrixAt(j, _m)
            if (im.instanceColor) { im.getColorAt(src, c); n.setColorAt(j, c) }
          })
          n.instanceMatrix.needsUpdate = true
          if (n.instanceColor) n.instanceColor.needsUpdate = true
          n.castShadow = im.castShadow; n.receiveShadow = im.receiveShadow
          n.computeBoundingSphere(); n.matrixAutoUpdate = false; n.updateMatrix()
          holder.add(n); batchStats.instOut++
        })
        im.visible = false
      })
      scene.add(holder); out.current = holder
      gl.compile(scene, camera) // 预编译，避免首次切视角/进新街区卡顿
      if (import.meta.env.DEV) console.info('[StaticBatch]', JSON.stringify(batchStats))
      return
    }
    tAcc.current += dt
    if (tAcc.current < 0.25) return
    tAcc.current = 0
    const far2 = TEXT_FAR * TEXT_FAR, cp = camera.position
    for (const t of texts.current) t.o.visible = t.p.distanceToSquared(cp) < far2
  })
  return <group ref={root}>{children}</group>
}
