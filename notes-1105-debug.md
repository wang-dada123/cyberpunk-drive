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
