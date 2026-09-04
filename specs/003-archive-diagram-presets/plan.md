# Implementation Plan: 归档流程图图片与节点预设

**Branch**: `003-archive-diagram-presets` | **Date**: 2026-09-01 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/003-archive-diagram-presets/spec.md`

## Summary

两个增量功能：①归档批次收尾时，在 `归档目录/工程名/流程图.png` 自动生成流程图图片（与软件内框图同口径：节点框+摘要徽章+来源箭头+共享标记），让归档目录脱离软件可读；②新建节点对话框内置典型 CFD 流程节点预设（参考文献/原始几何/网格划分/计算求解/后处理），点击一键填入名称。

技术路线：图片由**前端 Canvas 自绘**——复用既有的图数据聚合（`buildGraphData`）与分层布局（`computeLayout`），绘制指令与 Canvas 执行器分离（指令列表可单测）；生成后经新增的轻量命令 `save_archive_diagram` 交由 Rust 写盘（仅写文件，不含任何图逻辑，杜绝双重实现）。预设为前端只读常量。归档触发点挂在 `archive://finished` 事件处理链（copied>0 时执行）。

## Technical Context

**Language/Version**: TypeScript 5.x + React 18（前端主体）；Rust 1.8x（仅新增一个写文件命令）

**Primary Dependencies**: 既有栈（React Flow/dagre 复用其布局输出、zustand、Tauri 2 IPC）；Canvas 2D API（浏览器原生，中文文本由系统字体渲染，零新依赖）

**Storage**: 无新增数据库实体；图片为归档文件系统内的派生产物（`目标目录/工程名/流程图.png`，覆盖更新）

**Testing**: Vitest（绘制指令纯函数：框/线/文字/坐标分层断言；预设常量）；cargo test（`save_archive_diagram` 写盘路径组织与覆盖）；quickstart 手动验收（图片可读性与对应关系）

**Target Platform**: 既有 Windows 桌面应用内，随现有 exe 交付

**Project Type**: desktop-app 增量特性（前端为主 + 一个小后端命令）

**Performance Goals**: 200 节点工程图片生成 ≤5s（SC-003，Canvas 绘制毫秒级、toBlob 异步）；预设创建节点全流程 ≤5s（SC-002）；图片以 2× 分辨率绘制保证缩放可辨认

**Constraints**: 图片与软件内框图同口径同源（复用同一份派生数据，FR-003）；图片生成失败可见但不影响归档结果判定（FR-005）；不做手动导出入口（已确认）；预设只读不提供管理（FR-008）

**Scale/Scope**: 前端 3 个新模块（预设常量、图绘制指令、保存编排）+ 对话框入口 + 1 个 Rust 命令；既有行为零改动（归档引擎/框图不受影响）

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 要求摘要 | 本设计的落实 | 状态 |
|------|---------|-------------|------|
| I. 工程师优先体验 | 统一视觉语言、即时反馈 | 图片绘制指令消费 tokens.css 实际色值（getComputedStyle 读取 CSS 变量）；生成失败在结果页可见提示 | ✅ 通过 |
| II. 全流程产物管理 | 节点-产物关联可视化 | 图片即"归档目录 ↔ 流程结构"对应关系的载体，节点框与子文件夹一一对应 | ✅ 通过 |
| III. 进度透明可规划 | 状态一致 | 图片与框图同源派生（同一 buildGraphData），口径天然一致（FR-003） | ✅ 通过 |
| IV. 数据可追溯与可靠 | 禁止静默失败、显式边界 | 图片生成失败 → 归档结果可见警告且不影响文件状态判定；无成功复制不生成（避免误导） | ✅ 通过 |
| V. 简洁克制 | YAGNI、最简方案 | Canvas 原生 API 自绘（零新依赖）；复用既有聚合/布局；Rust 仅一个写文件命令；不做手动导出与预设管理（已确认范围外） | ✅ 通过 |

**Phase 1 设计后复查**：设计产物未引入新实体/第二套图逻辑/多余入口，门禁维持通过。

## Project Structure

### Documentation (this feature)

```text
specs/003-archive-diagram-presets/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output（图片产物契约 + 预设清单）
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── diagram-and-presets.md
└── tasks.md             # Phase 2 output ($speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   ├── presets.ts               # 内置节点预设常量（只读）
│   └── graph-diagram.ts         # 图片生成：buildDiagramPlan（绘制指令纯函数）+ renderToBlob（Canvas 执行）+ exportArchiveDiagram（保存编排）
src/features/nodes/
│   └── NodeEditDialog.tsx       # 增量：预设 chips 入口（点击填入名称）
src-tauri/src/commands/
│   └── archive.rs               # 增量：save_archive_diagram 命令（写 目标目录/工程名/流程图.png）
src-tauri/tests/
│   └── archive_diagram_test.rs  # cargo test：写盘路径组织、覆盖更新
src/**/*.test.ts(x)              # 既有测试保持通过
```

**Structure Decision**: 绘制指令（`DiagramPlan`：矩形/连线/文字的纯数据列表）与 Canvas 执行器分离——指令由纯函数从图数据+布局生成（jsdom 可单测：框数、文字内容、纵向分层坐标），执行器只负责把指令画上画布并导出 PNG（浏览器真机验证）。Rust 命令只做"确保目录 + 写文件 + 覆盖"，保持零图逻辑。

## Complexity Tracking

> 无章程违规项，本表留空。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| （无） | — | — |
