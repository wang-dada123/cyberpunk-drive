/**
 * 机关灰模数据自检（不进构建）。
 * npx esbuild scripts/gadget-check.ts --bundle --platform=node --format=esm --outfile=node_modules/.cache/gadget-check.mjs && node node_modules/.cache/gadget-check.mjs
 */
import { ELEV_W, RAMPS, frameAt } from '../src/data/expansionLayout'
import {
  DOOR, DYNAMIC_CAP, DYNAMIC_TOTAL, FEST_AT, FEST_PORT_FROM, GARAGE_N, GATE, GRAY_HEX,
  ICE, JUMP, LIGHTS, LIGHT_N, LIGHT_R, PORT_N, SHOWCASE, STALLS, STALL_N,
  hexSat, inGate, lightIndexNear, onE8, onS2, polyLen, roofPoint, s1Points,
} from '../src/data/gadgets'

const fail: string[] = []
const ok = (c: boolean, m: string) => { if (!c) fail.push(m) }

for (const hex of GRAY_HEX) ok(hexSat(hex) <= 0.5 + 1e-6, `${hex} sat ${hexSat(hex).toFixed(3)}`)
ok(hexSat(ICE) <= 0.5, 'ice')
ok(DYNAMIC_TOTAL <= DYNAMIC_CAP, `dynamic ${DYNAMIC_TOTAL} > ${DYNAMIC_CAP}`)
ok(LIGHT_N === 8 && STALL_N === 6 && GARAGE_N === 4, 'counts')
ok(PORT_N <= 40 && PORT_N === 28, `port props ${PORT_N}`)

for (const p of LIGHTS) {
  ok(p.z <= -70 && p.z >= -196, `light z ${p.z}`)
  ok(Math.hypot(p.x - SHOWCASE.x, p.z - SHOWCASE.z) > SHOWCASE.r + 0.4, `light inside ring z ${p.z}`)
}
ok(lightIndexNear(0, 1.2, LIGHTS[0].z) === 0, 'light hit 0')
ok(lightIndexNear(0, 1.2, LIGHTS[0].z + LIGHT_R + 0.4) === -1, 'light miss')
ok(inGate(0, 1, GATE.z), 'gate hit')
ok(!inGate(0, 1, GATE.z + 8), 'gate miss')
ok(onE8((JUMP.deck.x0 + JUMP.deck.x1) / 2, JUMP.deck.y + 0.5, (JUMP.deck.z0 + JUMP.deck.z1) / 2), 'e8 hit')
ok(!onE8(-110, 1, 0), 'e8 not on road center')
const roof = roofPoint()
ok(onS2(roof.x, roof.y, roof.z), `s2 roof ${roof.y.toFixed(2)}`)
ok(DOOR.z > GATE.z1 && DOOR.z < 150, 'door between gate and E9')

const s1 = s1Points()
const len = polyLen(s1)
ok(len > 140 && len < 260, `s1 len ${len.toFixed(1)}`)
let rampMin = Infinity
let ringMin = Infinity
let minR = Infinity
for (const [x, z] of s1) {
  minR = Math.min(minR, Math.hypot(x, z))
  for (const ramp of RAMPS) {
    for (let i = 0; i < ramp.frames.length; i += 2) {
      const f = ramp.frames[i]
      rampMin = Math.min(rampMin, Math.hypot(x - f.x, z - f.z))
    }
  }
  const f = frameAt(Math.atan2(-z, x))
  ringMin = Math.min(ringMin, Math.hypot(x - f.x, z - f.z))
}
ok(rampMin > 8, `s1 ramp clearance ${rampMin.toFixed(2)}`)
ok(ringMin > ELEV_W / 2 + 2, `s1 ring clearance ${ringMin.toFixed(2)}`)
ok(minR > 220, `s1 min r ${minR.toFixed(1)}`)
ok(FEST_AT.length === 13 && FEST_PORT_FROM === 8, 'fest split')
ok(STALLS.every((s) => s.x >= 105 && s.x <= 145), 'stall x range')

if (fail.length) {
  console.error(fail.join('\n'))
  process.exit(1)
}
console.log(`gadget-check ok  dynamic ${DYNAMIC_TOTAL}/${DYNAMIC_CAP}  s1 ${len.toFixed(0)}m  rampClear ${rampMin.toFixed(1)}  ringClear ${ringMin.toFixed(1)}`)
