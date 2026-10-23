# 赛博车 · Cyberpunk Drive

Carroll 的赛博朋克开车作品集 —— 第 1 周最小可玩骨架（灰模 demo）。

类似 [bruno-simon.com](https://bruno-simon.com/)：在霓虹城市里开小车自由探索。

## 本地运行

```bash
npm install
npm run dev
```

浏览器打开终端提示的地址（默认 `http://localhost:5173/cyberpunk-drive/`）。

```bash
npm run build    # 产出 dist/
npm run preview  # 预览生产构建
```

操作：`WASD` / 方向键驾驶；手机触屏左半区拖动摇杆。

## 技术栈

- Vite + React + TypeScript
- React Three Fiber + drei
- @react-three/rapier（物理）
- @react-three/postprocessing（Bloom）
- 部署：GitHub Pages（`base: /cyberpunk-drive/`）

## 色板（美术总监定稿）

| 用途 | 色值 |
|------|------|
| 底色 | `#0A0618` |
| 霓虹品红 | `#FF2E88` |
| 霓虹青 | `#00F0FF` |
| 紫雾 | `#8A2BE2` |
| 互动暖橙 | `#FFB000`（彩蛋预留） |

Bloom：`intensity 0.8` / `threshold 0.9`；紫色指数雾 `density ≈ 0.02`。

## 仓库与 Pages

- 目标仓库：`wang-dada123/cyberpunk-drive`
- 预览 URL（部署后）：`https://wang-dada123.github.io/cyberpunk-drive/`
- CI：`.github/workflows/deploy-pages.yml`（push `main` 自动构建部署）

## 第 1 周范围

已有：灰模城市、方块小车、键盘驾驶、第三人称跟随、Bloom/雾、手机摇杆占位、Pages workflow。

未做：Kenney/Quaternius 正式模型、作品集彩蛋弹卡、隐藏关、AI 摆摊、音效。

## Credits

- Car model: **Car Kit** by [Kenney](https://kenney.nl/assets/car-kit) — CC0 1.0 (public domain). `public/models/race-future.glb`, license in `public/models/KENNEY-LICENSE.txt`.
