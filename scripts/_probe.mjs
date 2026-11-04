import { chromium } from 'playwright'
const b = await chromium.launch({ channel: 'chrome', headless: true, args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] })
const page = await (await b.newContext({ viewport: { width: 320, height: 240 } })).newPage()
await page.goto(process.env.BASE)
await page.waitForFunction(() => window.__car && window.__expansion && window.__rapier, { timeout: 60000 })
await page.waitForTimeout(4000)
const r = await page.evaluate(() => {
  const { world } = window.__rapier
  const out = []
  world.forEachCollider((c) => {
    const t = c.translation(), s = c.shape, p = c.parent()
    const he = s.halfExtents ? [s.halfExtents.x, s.halfExtents.y, s.halfExtents.z] : s.radius != null ? [s.radius, s.halfHeight ?? 0] : s.vertices ? [s.vertices.length, s.indices?.length ?? 0] : []
    out.push([s.type, p ? p.bodyType() : -1, c.isSensor() ? 1 : 0, ...[t.x, t.y, t.z].map((v) => +v.toFixed(2)), ...he.map((v) => +(+v).toFixed(2))].join(','))
  })
  return out.sort()
})
console.log(r.join('\n'))
await b.close()
