import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await (await b.newContext({ viewport: { width: 320, height: 240 } })).newPage()
await page.goto(process.env.BASE)
await page.waitForFunction(() => window.__car && window.__expansion && window.__drive, { timeout: 60000 })
await page.waitForTimeout(1500)
const r = await page.evaluate(async () => {
  const E = window.__expansion, D = window.__drive, rb = window.__car
  const r0 = E.RAMPS.find((r) => r.deg === 20)
  const a = r0.frames[0], bb = r0.frames[3]
  const yaw = Math.atan2(-(bb.x - a.x), -(bb.z - a.z))
  rb.setTranslation({ x: a.x, y: a.y + 0.75, z: a.z }, true); rb.setLinvel({ x: 0, y: 0, z: 0 }, true); rb.setAngvel({ x: 0, y: 0, z: 0 }, true)
  rb.setRotation({ x: 0, y: Math.sin(yaw / 2), z: 0, w: Math.cos(yaw / 2) }, true)
  E.resetDrive?.()
  const out = []
  const t0 = performance.now()
  const st = { inp: [] }
  while (performance.now() - t0 < 3000) {
    D.forward = performance.now() - t0 > 500 ? 1 : 0; D.turn = 0
    await new Promise((r) => requestAnimationFrame(r))
    const t = rb.translation(), v = rb.linvel(), q = rb.rotation()
    out.push([Math.round(performance.now() - t0), +t.x.toFixed(2), +t.y.toFixed(2), +t.z.toFixed(2), +Math.hypot(v.x, v.z).toFixed(2), +v.y.toFixed(2), +(2 * Math.atan2(q.y, q.w)).toFixed(3), +rb.angvel().y.toFixed(3)])
  }
  D.forward = 0
  return out
})
for (const x of r.filter((_, i) => i % 3 === 0)) console.log(x.join(' '))
await b.close()
