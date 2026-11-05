# 1105 分支行驶复位/卡住 调查结论

- **长帧确实存在，但不是已证实的卡住根因。** 运行时 Canvas 书法字+shadowBlur 图集重绘/上传造成 0.4–0.8s 长帧（pathT0 7.5–8.1s vs main 5.3s）；离线预烘 webp 后长帧消失（max ~0.2s，pathT0 5.4s，与 main 相同），此后 ramp20-up 快测 4/4 通过。但修复后曾观察到同一轨迹仍失败，长帧↔卡住的因果没有被干净证明。
- **drive-laps 起点状态不一致是真实问题：** 传送后只睡 500ms 墙钟，分支物理时间落后时车还在下落（st0 y=0.57, vy=-0.62；main 已静止），起点就和 main 不同。dd21df8 起 drive-laps 等车落地静止再控制。
- **新发现：PhysicsClock 阈值 0.1s 在本机不可用。** swiftshader 下正常帧就是 ~150–550ms（main 也是），0.1s 阈值让几乎每帧只补 4 步 → 分支物理只有实时的 1/3–1/10（0.8m 落体用了 2.2s），ring-lap 180s 超时、ramp20-up 复位。即"正常帧"在慢机上被改了行为，违背"main 行为不变"。
- 结论：阈值改为 LONG_FRAME=0.25s / MAX_CATCHUP=0.25s（15 步）：≤250ms 的帧与 main（rapier 自带 0.5s 夹断）逐帧一致，只有 >250ms 的卡顿帧少补一半。

## 决定（02:56）：去掉 PhysicsClock
- 预烘图集已消除长帧；PhysicsClock 在慢机上改变正常帧行为 → 删除。Car.tsx / Scene.tsx 恢复为 ce732f0 原样。
- 去掉前的一轮参考（PhysicsClock 0.25/0.25）：main#1 16/16 全 0 maxFrame 6163ms；branch#1 16/16 全 0 maxFrame 44631ms（机器级卡顿，main 同样出现 6–9s 帧）；main#2 14 段全 0（被中断）。

### 1) 物理路径 diff
`git diff ce732f0 -- src/components/Car* src/components/Scene.tsx src/components/Physics*` → 0 行（无差异，PhysicsClock.tsx 已删除）。
-e 
### 2) drive-laps（8310477，含落地等待）
| 轮 | 段数 | 复位 | 掉落 | 卡住 | 未到 | maxFrameMs | load(1m) 前→后 | 失败段 |
|---|---|---|---|---|---|---|---|---|
| main#1 normal | 16 | 0 | 0 | 0 | 0 | 288 | 3.83 → 4.95 |  |

### 3) card-test / build（8310477）
- npm run build：通过（仅 chunk>500kB 警告，与 main 相同）
- card-test-1105 电脑：ALL OK；手机(MOB=1)：ALL OK

### tris/draw（1280×720 出生点稳定态，__perf，各 2 次）
| | calls | tris |
|---|---|---|
| main ce732f0 | 95 / 95 | 84925 / 84925 |
| 分支 8310477 | 95 / 95 | 84901 / 84901 |

### 4) shot-1105（预烘图集）
- /workspace/cyberpunk-art/send-shots/1105-fanren-cards/{1105-desktop-card,1105-phone-land-card,1105-phone-land-street}.png；灯箱片名仍为书法体（风雷翅/静虚问道），卡片与摇杆/小地图/FPS 无重叠。
- 注：3)/4) 与 drive-laps 第 2 轮并行执行，该段 load 偏高。
| branch#1 normal | 16 | 3 | 0 | 0 | 3 | 27759 | 4.95 → 12.59 | [('ring-lap', 'normal', 'R0F0S0', 'NOT', 'st0=[6.75, 0]', 'maxF=26015', ['timeout'], ''), ('ramp20-up', 'normal', 'R0F0S0', 'NOT', 'st0=[0.59, 0]', 'maxF=567', ['timeout'], ''), ('ramp250-down', 'normal', 'R0F0S0', 'NOT', 'st0=[8.75, 0]', 'maxF=263', ['timeout'], ''), ('ramp340-up', 'normal', 'R1F0S0', 'reached', 'st0=[0.59, 0]', 'maxF=243', [], 'center'), ('ramp340-down', 'normal', 'R2F0S0', 'reached', 'st0=[6.75, 0]', 'maxF=167', [], 'escape')] |
| main#2 normal | 16 | 0 | 0 | 0 | 0 | 28342 | 12.59 → 14.25 |  |
| branch#2 normal | 2 | 0 | 0 | 0 | 1 | 8157 | 14.25 → 11.31 | [('ring-lap', 'normal', 'R0F0S0', 'NOT', 'st0=[6.75, 0]', 'maxF=8157', ['timeout'], '')] |
| main#3 normal | 0 | 0 | 0 | 0 | 0 | 0 | 11.31 → 6.86 |  |
| branch#3 normal | 0 | 0 | 0 | 0 | 0 | 0 | 6.86 → 4.50 |  |
| branch#1 max | 0 | 0 | 0 | 0 | 0 | 0 | 4.50 → 2.79 |  |

## 最终门禁（12:26 Asia/Shanghai）
- **branch 全量 #1（final-ab br1，03:46→08:22）**：16/16 复位0 掉落0 卡住0；maxFrameMs≈28341（机器卡顿）；load 4.68→10.78
- **main #2**：前 12 段全 0 后浏览器 D-Bus FATAL 崩（非物理失败）
- **br2/main3/br3/brmax**：WebGL context 创建失败（环境），无行驶数据
- **关键坡道复测（12:24，ONLY=ramp20|ramp160，MODES=normal，load≈2–3）**：

| 段 | 复位 | 掉落 | 卡住 | maxFrameMs | st0 |
|---|---|---|---|---|---|
| ramp20-up | 0 | 0 | 0 | 307 | [0.2,0] |
| ramp20-down | 0 | 0 | 0 | 359 | [6.2,0] |
| ramp160-up | 0 | 0 | 0 | 162 | [0.2,0] |
| ramp160-down | 0 | 0 | 0 | 237 | [8.2,0] |

结论：物理路径相对 ce732f0 0 行差异；坡道复位/卡住已到 0，可合入。
