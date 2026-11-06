# 1106 护栏重叠 / 路面叠面修复（fix/1106-rail-overlap，基于 main 6f96e82）

## 根因
1. **路面叠面闪烁**：4 条匝道 + S2 的视觉桥面一直画到 deckOwn（汇入后沿环线再走 ~56m），整段压在环线桥面上；1104 只是把顶点压低 4cm + rampMat polygonOffset 硬顶，手机深度精度下仍 z-fighting。20°/340° 两条匝道镜像、在 θ=0 互相整片覆盖；急弯内侧边点挤成一团，相邻行细长三角自叠。
2. **S2 双护栏**：S2 近侧护栏只在离环线内护栏 <0.35m 才收住，汇入前一段与环线内护栏 0.64~1.6m 平行并排（θ≈118°，S2 窄巷门汇入口）。
3. **护栏伸进路面**：20° 匝道内侧护栏在 z>0 一侧斜穿 340° 匝道桥面 25.7m（340° 对称），且两条在 θ=0 重复 5m；环线内护栏 5 段（共 111m）立在匝道叠层桥面上。

## 改了什么（只动视觉桥面几何与护栏折线；Physics/PhysicsClock/Car/坡面碰撞 0 行差异）
- 新 `src/data/deckGeom.ts`：匝道/S2 桥面顶点落进环线带（-HW-3<lat<HW）就推到环线外沿，整片在环线上的三角不出；20°/340° 按 z=0 各留半边（半平面裁三角）；翻面三角不出；同网格自叠做凸多边形差只留一层。ElevatedRing.buildDeck 改用它，rampMat 去掉 polygonOffset。
- `railLines.ts`：S2 近侧护栏离环线内护栏 <1.6m 收住（只留环线主路护栏）；20°/340° 匝道护栏用同一 z=0 分界，两条在 (247.7, 0) 接上，不再伸进对方桥面。环线护栏折线逐点不变。
- 护栏墙碰撞与视觉护栏同源，所以上面删掉的护栏墙也一起删（共 -564 墙三角）。

## 扫描（scripts/scan-overlap-1106.mjs，before/after JSON 进仓）
| 项 | BEFORE | AFTER |
|---|---|---|
| 护栏重复段（<0.35m 且 >1m） | 2 处 10m（20°/340° θ=0） | 0 |
| 护栏伸进路面 | 7 处 161.9m | 0 |
| 近距并排护栏 0.35~1.6m（提示） | 2 处（含 S2 θ118° 5.5m） | 0 |
| 桥面共面叠面 | 4303 对三角 / 6270 m² | 0 |

## tris / draw（全图几何，视觉）
- 桥面三角 5252 → 5483（+231，裁切产生的扇形块）；护栏三角 20606 → 20042（-564）；合计 **-333**。draw call 不变（mesh 数不变）。

## drive-laps normal（BASE 5178 dev，SwiftShader）
| 段 | resets | falls | stuck | maxSpeed | maxFrameMs |
|---|---|---|---|---|---|
| ring-lap | 0 | 0 | 0 | 13.2 | 234 |
| ramp20-up | 0 | 0 | 0 | 12.2 | 107 |
| ramp20-down | 0 | 0 | 0 | 12.3 | 198 |
| ramp160-up | 0 | 0 | 0 | 12.2 | 142 |
| ramp160-down | 0 | 0 | 0 | 12.6 | 187 |
| ramp250-up | 0 | 0 | 0 | 12.2 | 146 |
| ramp250-down | 0 | 0 | 0 | 12.4 | 155 |
| ramp340-up | 0 | 0 | 0 | 12.2 | 103 |
| ramp340-down | 0 | 0 | 0 | 12.4 | 152 |
| J2-ccw | 0 | 0 | 0 | 13.4 | 114 |
| J2-cw | 0 | 0 | 0 | 13.5 | 126 |
| S1-spiral-up | 0 | 0 | 0 | 10.7 | 9283 |
| S2-down | 0 | 0 | 0 | 12.9 | 4445 |
| S2-up | 0 | 0 | 0 | 12.2 | 198 |
| S1-S2-chain | 0 | 0 | 0 | 8.5 | 226 |
| skybridge | 0 | 0 | 0 | 12 | 182 |

16/16 全 0。环境异常：本轮无 WebGL/DBus 崩溃；S1-spiral-up 9283ms、S2-down 4445ms 为 SwiftShader 单帧长帧，未导致复位。

## build
`npm run build` 通过（tsc -b + vite build；只有原有 >500kB chunk 警告）。

## 截图（/workspace/cyberpunk-art/send-shots/1106-rail-overlap/，scripts/shot-1106.mjs 同机位）
- s2-gate-before.png / s2-gate-after.png（844×390，S2 汇入前 frame 52）
- s2-gate-before-ring.png / s2-gate-after-ring.png（844×390，汇入后环线弯道中央 θ112°）
- s2-gate-before-desktop.png / s2-gate-after-desktop.png（1440×900）

## 待办
- Carroll 真机复验；未 push/PR/merge。
- 未做：max 模式 drive-laps；S2 近侧护栏收住后到真正并入之间约 4.7m 处 S2 桥边与环线护栏之间留 ~1m 空隙（drive-laps S2 上下/链路 0 复位，但值得真机看一眼）。
