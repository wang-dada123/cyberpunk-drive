import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await b.newPage({ viewport: { width: 320, height: 240 } })
await page.goto(process.env.BASE)
await page.waitForFunction(() => window.__car && window.__expansion && window.__rapier, { timeout: 60000 })
await page.waitForTimeout(Number(process.env.WAIT || 4000))
const r = await page.evaluate(() => {
  const { world, rapier } = window.__rapier
  const E = window.__expansion
  const r0 = E.RAMPS.find((r) => r.deg === 20)
  const pts = r0.frames.slice(0, 8).map((f) => ({ x: f.x, y: f.y, z: f.z }))
  const car = window.__car
  const out = { pts: pts.map((p) => [p.x, p.y, p.z].map((v) => +v.toFixed(2))), hits: [], ncol: world.colliders.len?.() ?? world.colliders.getAll?.().length }
  for (const p of pts.slice(0, 4)) for (let dx = -3; dx <= 3; dx += 1.5) {
    const ray = new rapier.Ray({ x: p.x + dx, y: p.y + 20, z: p.z }, { x: 0, y: -1, z: 0 })
    const h = world.castRay(ray, 40, true, undefined, undefined, undefined, car)
    if (h) { const c = h.collider; const pb = c.parent(); out.hits.push([+(p.x + dx).toFixed(1), +p.z.toFixed(1), +(p.y + 20 - h.timeOfImpact).toFixed(2), c.shape.type, pb ? pb.bodyType() : -1, c.isSensor()]) }
  }
  return out
})
console.log(JSON.stringify(r))
await b.close()
