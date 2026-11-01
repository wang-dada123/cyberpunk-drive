/**
 * 机关 / 收集触发截图 + 帧率面板收起展开。开发服务器需已在 5173。
 * node scripts/shot-gadgets.mjs
 */
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'

const OUT = new URL('../screenshots/', import.meta.url).pathname
mkdirSync(OUT, { recursive: true })
const BASE = 'http://127.0.0.1:5173/cyberpunk-drive/'
const shotQ = (q) => (q.includes('?') ? `${q}&shot` : '?shot')
const fail = []

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'],
})

async function open(width, height, query, mobile) {
  const context = await browser.newContext({
    viewport: { width, height },
    userAgent: mobile
      ? 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
      : undefined,
    hasTouch: !!mobile,
    isMobile: !!mobile,
  })
  const page = await context.newPage()
  page.on('pageerror', (err) => fail.push(`pageerror ${err.message}`))
  await page.goto(BASE + shotQ(query), { waitUntil: 'domcontentloaded', timeout: 60000 })
  await page.waitForFunction(() => window.__car && window.__gadget, { timeout: 40000 })
  await page.waitForTimeout(1200)
  return { context, page }
}

async function place(page, x, y, z, yaw = 0) {
  const ok = await page.evaluate(({ x, y, z, yaw }) => window.__gadget.place(x, y, z, yaw), { x, y, z, yaw })
  if (!ok) throw new Error('place failed')
  await page.waitForTimeout(700)
}

async function snap(page, name) {
  await page.screenshot({ path: `${OUT}${name}.jpg`, type: 'jpeg', quality: 72 })
  console.log('shot', name)
}

function yawWest() { return Math.PI / 2 }
function yawSouth() { return Math.PI }
function yawEast() { return -Math.PI / 2 }

const { context, page } = await open(1280, 720, '?tier=high', false)
const A = await page.evaluate(() => window.__gadget.anchors)

async function reset(page) {
  await page.evaluate(() => { window.__drive.forward = 0; window.__drive.turn = 0; window.__gadget.reset() })
  await page.waitForTimeout(80)
}

async function expectBit(page, key, bit, label) {
  const ok = await page.waitForFunction(({ key, bit }) => {
    const p = window.__gadget.progress()
    return bit < 0 ? p[key] === 1 : (p[key] & (1 << bit)) !== 0
  }, { key, bit }, { timeout: 4000 }).then(() => true).catch(() => false)
  if (!ok) fail.push(`trigger timeout ${label}`)
  return ok
}

// 展示环：未集齐
await reset(page)
await place(page, 0, 1.3, A.showcase.z + 10, 0)
await snap(page, 'ring-before')

for (let i = 0; i < A.lights.length; i++) {
  const L = A.lights[i]
  await reset(page)
  await place(page, L.x, 1.25, L.z + 6, 0)
  const early = await page.evaluate((i) => (window.__gadget.progress().lights & (1 << i)) !== 0, i)
  if (early) fail.push(`light ${i} collected before overlap`)
  await snap(page, `light-${i}-before`)
  await place(page, L.x, 1.35, L.z, 0)
  await expectBit(page, 'lights', i, `light ${i}`)
  await snap(page, `light-${i}-after`)
}

await reset(page)
for (const L of A.lights) {
  await place(page, L.x, 1.35, L.z, 0)
}
await place(page, 0, 1.3, A.showcase.z + 8, 0)
const lit = await page.evaluate(() => window.__gadget.progress().lights === 255)
if (!lit) fail.push(`ring lights mask ${await page.evaluate(() => window.__gadget.progress().lights)}`)
await snap(page, 'ring-after')
await page.reload({ waitUntil: 'domcontentloaded' })
await page.waitForFunction(() => window.__gadget, { timeout: 40000 })
await page.waitForTimeout(800)
const kept = await page.evaluate(() => window.__gadget.progress().lights)
if (kept !== 255) fail.push(`localStorage reload lost lights ${kept}`)
await page.evaluate(() => window.__gadget.reset())

for (let i = 0; i < A.stalls.length; i++) {
  const S = A.stalls[i]
  await reset(page)
  await place(page, S.x, 1.2, S.z + 6, 0)
  await snap(page, `stall-${i}-before`)
  await page.evaluate((i) => window.__gadget.shoveStall(i), i)
  await expectBit(page, 'stalls', i, `stall ${i}`)
  await page.waitForTimeout(400)
  await snap(page, `stall-${i}-after`)
}

await reset(page)
await place(page, 165, 1.2, 16, 0)
await snap(page, 'carnival-before')
await page.evaluate(() => { for (let i = 0; i < 6; i++) window.__gadget.shoveStall(i) })
await page.waitForFunction(() => window.__gadget.progress().stalls === 63, null, { timeout: 4000 }).catch(() => fail.push('carnival mask'))
await page.waitForTimeout(500)
await snap(page, 'carnival-after')

await reset(page)
await place(page, 0, 1.2, A.gate.z - 16, yawSouth())
await snap(page, 'gate-before')
await place(page, 0, 1.2, A.gate.z, yawSouth())
await expectBit(page, 'gate', -1, 'gate')
await page.waitForTimeout(700)
await snap(page, 'gate-after')

await reset(page)
await place(page, A.jump.x0 + 8, 1.2, A.jump.z, yawWest())
await snap(page, 'e8-before')
await place(page, (Math.min(A.jump.deck.x0, A.jump.deck.x1) + Math.max(A.jump.deck.x0, A.jump.deck.x1)) / 2, A.jump.deck.y + 0.7, (A.jump.deck.z0 + A.jump.deck.z1) / 2, yawWest())
await expectBit(page, 'e8', -1, 'e8')
await snap(page, 'e8-after')

await reset(page)
await place(page, A.roof.x + 12, 1.4, A.roof.z + 12, yawWest())
await snap(page, 's2-before')
await place(page, A.roof.x, A.roof.y, A.roof.z, yawWest())
await expectBit(page, 's2', -1, 's2')
await snap(page, 's2-after')

const s1a = A.s1[0]
const s1b = A.s1[Math.floor(A.s1.length * 0.45)]
await reset(page)
await place(page, s1a[0], 1.2, s1a[1], 0)
await snap(page, 's1-before')
await place(page, s1b[0], 1.2, s1b[1], 0)
await snap(page, 's1-after')

const G = A.garage[0]
await reset(page)
await place(page, G.x, G.y + 1.4, G.z + 3, 0)
await snap(page, 'garage-before')
await page.evaluate(() => window.__gadget.shoveGarage(0))
await page.waitForTimeout(500)
await snap(page, 'garage-after')

await reset(page)
await place(page, A.portLight.x, 1.3, A.portLight.z, yawSouth())
await page.waitForTimeout(400)
const portBefore = await page.evaluate(() => ({ ...window.__gadget.progress(), pool: { ...window.__portPool } }))
await snap(page, 'port-before')
await page.evaluate(() => window.__gadget.shovePort())
await expectBit(page, 'port', -1, 'port')
await page.waitForTimeout(600)
const portAfter = await page.evaluate(() => ({ pool: { ...window.__portPool }, p: window.__gadget.progress() }))
await snap(page, 'port-after')

// 键盘 / 摇杆都能开到光点
await reset(page)
await place(page, A.lights[0].x, 1.2, A.lights[0].z + 7, 0)
await page.evaluate(() => { window.__drive.forward = 1 })
const joy = await page.waitForFunction(() => (window.__gadget.progress().lights & 1) !== 0, null, { timeout: 8000 }).then(() => true).catch(() => false)
await page.evaluate(() => { window.__drive.forward = 0 })
if (!joy) fail.push('joystick/drive input did not collect light 0')

await reset(page)
await place(page, A.lights[1].x, 1.2, A.lights[1].z + 7, 0)
await page.keyboard.down('w')
const key = await page.waitForFunction(() => (window.__gadget.progress().lights & 2) !== 0, null, { timeout: 8000 }).then(() => true).catch(() => false)
await page.keyboard.up('w')
if (!key) fail.push('keyboard did not collect light 1')

async function sample(page, tag) {
  await page.waitForTimeout(600)
  return page.evaluate((tag) => {
    const world = window.__rapier?.world
    let dynamic = 0, awake = 0, bodies = 0
    if (world?.bodies?.len) {
      const n = world.bodies.len()
      for (let i = 0; i < n; i++) {
        const b = world.bodies.get(i)
        if (!b) continue
        bodies++
        const type = b.bodyType()
        if (type === 0) {
          dynamic++
          if (b.isEnabled() && !b.isSleeping()) awake++
        }
      }
    }
    return {
      tag,
      calls: window.__perf?.calls ?? null,
      tris: window.__perf?.triangles ?? null,
      dynamic, awake, bodies,
      gadget: { ...window.__gadget.stats },
      tier: document.body.innerText.slice(0, 0),
    }
  }, tag)
}

// 性能：高档出生点、港区、高架；低档另开一页
const perfPage = await (async () => {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const p = await ctx.newPage()
  await p.goto(BASE + '?debug&tier=high&shot', { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => window.__perf && window.__car && window.__gadget, { timeout: 40000 })
  await p.waitForTimeout(1500)
  const spawn = await sample(p, 'high-spawn')
  const portAt = await p.evaluate(() => window.__gadget.anchors.portLight)
  await place(p, portAt.x, 1.3, portAt.z, yawSouth())
  await p.waitForTimeout(800)
  const portS = await sample(p, 'high-port')
  await place(p, 255, 6.8, 0, yawWest())
  await p.waitForTimeout(800)
  const elev = await sample(p, 'high-elev')
  const resets = await p.evaluate(() => window.__expansion?.stats?.resets ?? null)
  await ctx.close()
  return { spawn, portS, elev, resets }
})()

const lowCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const lowPage = await lowCtx.newPage()
await lowPage.goto(BASE + '?debug&tier=low&shot', { waitUntil: 'domcontentloaded' })
await lowPage.waitForFunction(() => window.__perf && window.__car, { timeout: 40000 })
await lowPage.waitForTimeout(1500)
const lowSpawn = await sample(lowPage, 'low-spawn')
const lowPortAt = await lowPage.evaluate(() => window.__gadget.anchors.portLight)
await place(lowPage, lowPortAt.x, 1.3, lowPortAt.z, yawSouth())
await lowPage.waitForTimeout(800)
const lowPort = await sample(lowPage, 'low-port')
await place(lowPage, 255, 6.8, 0, yawWest())
await lowPage.waitForTimeout(800)
const lowElev = await sample(lowPage, 'low-elev')
await lowCtx.close()

await context.close()

// 手机帧率面板
async function panelShots(width, height, prefix) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1',
    hasTouch: true,
    isMobile: true,
  })
  const p = await ctx.newPage()
  await p.goto(BASE + '?debug&tier=high&shot', { waitUntil: 'domcontentloaded' })
  await p.waitForFunction(() => document.getElementById('debug-toggle'), { timeout: 40000 })
  await p.waitForTimeout(1400)
  const collapsed = await p.evaluate(() => document.getElementById('debug-panel')?.dataset.open)
  if (collapsed !== '0') fail.push(`${prefix} panel not collapsed (${collapsed})`)
  await snap(p, `${prefix}-collapsed`)
  const overlapClosed = await overlaps(p)
  if (overlapClosed.length) fail.push(`${prefix} collapsed overlap ${overlapClosed.join(',')}`)
  await p.click('#debug-toggle')
  await p.waitForTimeout(300)
  const opened = await p.evaluate(() => document.getElementById('debug-panel')?.dataset.open)
  if (opened !== '1') fail.push(`${prefix} panel did not open`)
  await snap(p, `${prefix}-expanded`)
  const overlapOpen = await overlaps(p)
  if (overlapOpen.length) fail.push(`${prefix} expanded overlap ${overlapOpen.join(',')}`)
  await p.click('#debug-toggle')
  await p.waitForTimeout(200)
  const shut = await p.evaluate(() => document.getElementById('debug-panel')?.dataset.open)
  if (shut !== '0') fail.push(`${prefix} panel did not collapse again`)
  await ctx.close()
}

async function overlaps(p) {
  return p.evaluate(() => {
    const box = (el) => {
      if (!el) return null
      const r = el.getBoundingClientRect()
      if (r.width < 2 || r.height < 2) return null
      return { x: r.left, y: r.top, w: r.width, h: r.height, id: el.id || el.getAttribute('aria-label') || el.className }
    }
    const nodes = [
      box(document.getElementById('debug-panel')),
      box(document.getElementById('collect-hud')),
      box(document.getElementById('minimap')),
      box(document.querySelector('.joystick-base')),
      box(document.querySelector('[aria-label="切换视角"]')),
    ].filter(Boolean)
    const hit = (a, b) => a.x < b.x + b.w - 1 && a.x + a.w > b.x + 1 && a.y < b.y + b.h - 1 && a.y + a.h > b.y + 1
    const out = []
    for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
      if (hit(nodes[i], nodes[j])) out.push(`${nodes[i].id}|${nodes[j].id}`)
    }
    return out
  })
}

await panelShots(390, 844, 'phone-portrait')
await panelShots(844, 390, 'phone-landscape')

const report = {
  fail,
  joy, key,
  portBefore, portAfter,
  perf: { ...perfPage, lowSpawn, lowPort, lowElev },
}
writeFileSync(`${OUT}stats.json`, JSON.stringify(report, null, 2))
await browser.close()
if (fail.length) {
  console.error(fail.join('\n'))
  process.exit(1)
}
console.log('shots ok', JSON.stringify({ joy, key, perf: report.perf }, null, 2))
