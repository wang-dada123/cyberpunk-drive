/**
 * 书法字体子集化：只打包 exhibits.ts 中 title / SERIES 用到的字 → public/fonts/fanren-brush.woff2
 * 字体：Ma Shan Zheng（马善政毛笔楷书，SIL OFL 1.1，可免费商用），许可见 public/fonts/OFL-MaShanZheng.txt
 * 用法：FONT_SRC=/path/MaShanZheng-Regular.ttf node scripts/subset-font.mjs  （需要 pip 的 fonttools + brotli）
 * 改了片名后要重跑。
 */
import { readFileSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
const src = readFileSync(new URL('../src/data/exhibits.ts', import.meta.url), 'utf8')
const strs = [...src.matchAll(/ex\(\d+, '([^']+)'/g)].map((m) => m[1])
strs.push(src.match(/SERIES = '([^']+)'/)[1], '《》·')
const chars = [...new Set(strs.join(''))].join('')
const FONT = process.env.FONT_SRC || '/workspace/fonts/MaShanZheng-Regular.ttf'
const out = new URL('../public/fonts/fanren-brush.woff2', import.meta.url).pathname
execFileSync('pyftsubset', [FONT, `--text=${chars}`, '--flavor=woff2', `--output-file=${out}`, '--layout-features=*', '--no-hinting', '--desubroutinize'], { stdio: 'inherit' })
console.log(`subset ${chars.length} 字：${chars} → ${out}`)
