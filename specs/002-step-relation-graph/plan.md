# Implementation Plan: 步骤关系框图（实时流程视图）

**Branch**: `002-step-relation-graph` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/002-step-relation-graph/spec.md`

## Summary

在既有 CFD 归档管理工作台内新增"流程框图"分栏：以同屏分栏（框图 + 节点列表/登记面板）呈现当前工程的调试链——每个节点一个框（名称 + 文件摘要徽章），"来源于"关系为自上而下的有向连线，跨步骤共享同一源文件的节点对之间以可区分的共享标记连线呈现。图数据由既有数据实时派生（零新增持久化实体），任何数据变更 1 秒内反映；画布支持点选联动、缩放/平移/适应视图，以及画布直接编辑（新建下游、拖拽改来源连线、双击编辑、删除——全部复用既有对话框与校验规则）。

技术路线：`@xyflow/react`（React Flow 12）承担画布与交互基座（节点/连线/缩放/平移/适应视图/连线拖放），`@dagrejs/dagre` 计算纵向分层自动布局；图数据聚合为纯函数（`src/lib/graph.ts`，可单测）；画布编辑全部复用既有 zustand 动作与 Tauri 命令，Rust 侧零改动。

## Technical Context

**Language/Version**: TypeScript 5.x + React 18（前端增量）；Rust 侧无改动

**Primary Dependencies**: `@xyflow/react`（React Flow 12，画布基座）、`@dagrejs/dagre`（分层布局）；既有栈：zustand、Vite、Vitest

**Storage**: 无新增存储；复用特性 001 的 SQLite（经既有命令读取），图数据为运行时派生

**Testing**: Vitest + React Testing Library（图数据聚合纯函数、NodeBox 徽章渲染、分栏联动）；quickstart 手动验收（画布交互无法自动化覆盖拖拽）

**Target Platform**: 既有 Windows 桌面应用内（Tauri 2 / WebView2），随现有 exe 交付

**Project Type**: desktop-app 增量特性（frontend-only）

**Performance Goals**: 50 节点首渲 ≤1s（SC-001）；数据变更 → 框图更新 ≤1s（SC-002）；200 节点/2000 登记文件下缩放/平移/点选响应 ≤1s（SC-003/FR-014）；交互反馈延续 100ms 约定

**Constraints**: 复用设计令牌（不引入第二套视觉语言，FR-008）；摘要数字与节点列表/归档确认页同口径（FR-013）；画布编辑必须复用既有校验（防环/同工程/名称约束，FR-019）；不新增持久化实体与 Tauri 命令

**Scale/Scope**: 单工程 200 节点 / 2000 登记文件；三个新前端模块（图数据聚合、画布组件、分栏工作台改造）；Rust 零改动

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 要求摘要 | 本设计的落实 | 状态 |
|------|---------|-------------|------|
| I. 工程师优先体验 | 统一视觉语言、即时反馈、术语一致 | NodeBox/连线样式全部消费 tokens.css；React Flow 控件经令牌覆写；选中/悬停/错误反馈 ≤100ms；术语沿用数据模型术语表 | ✅ 通过 |
| II. 全流程产物管理 | 节点-产物关联、阶段归属 | 框内摘要即"节点→产物"关联的可视化；计数口径与列表一致（FR-013） | ✅ 通过 |
| III. 进度透明可规划 | 进度可视、状态一致 | 框图是"状态一致"的最强呈现：任一端操作 1s 内双端同步（FR-005/SC-002） | ✅ 通过 |
| IV. 数据可追溯与可靠 | 不丢失、显式确认、禁止静默失败 | 画布编辑复用既有命令与确认对话框（删除处置、防环拒绝）；后端拒绝即回滚 UI 并提示；零新增写路径 | ✅ 通过 |
| V. 简洁克制 | YAGNI、最简方案 | 采用成熟库而非自研画布；复用既有对话框/校验/store；零新增实体与命令；不做小地图等未要求功能 | ✅ 通过 |

**Phase 1 设计后复查**：设计产物未引入超出范围的复杂度（无新实体、无新命令、无第二套视觉），门禁维持通过。

## Project Structure

### Documentation (this feature)

```text
specs/002-step-relation-graph/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output（派生图数据契约）
├── quickstart.md        # Phase 1 output
├── contracts/           # Phase 1 output
│   └── graph-view.md
└── tasks.md             # Phase 2 output ($speckit-tasks)
```

### Source Code (repository root)

```text
src/
├── lib/
│   └── graph.ts                 # 纯函数：ProjectDetail → 图数据（GraphNode/GraphEdge/共享组）+ dagre 布局调用
├── features/
│   └── graph/
│       ├── FlowGraph.tsx        # ReactFlow 封装：布局接入、缩放/平移/适应、点选联动、onConnect 画布连线
│       ├── NodeBox.tsx          # 自定义节点框：名称截断、摘要徽章（待归档/已归档/源失效）、悬停操作按钮、双击编辑
│       └── FlowGraph.test.tsx   # 组件测试
├── app/
│   └── WorkspaceView.tsx        # 改造：三栏同屏（框图 | 节点列表 | 登记面板），既有浮层复用
└── stores/
    └── nodes.ts                 # 增量：startCreate(parentId?) 预填来源（供画布"新建下游"）
src/**/*.test.tsx                # 既有测试保持通过
```

Rust 侧（`src-tauri/`）：**零改动**——画布编辑全部调用既有命令（create_node / set_node_parent / update_node / delete_node / register_files 等）。

**Structure Decision**: frontend-only 增量。图数据聚合与布局输入构造为纯函数置于 `src/lib/graph.ts`（不依赖 React，可独立单测）；React Flow 封装与自定义节点置于 `src/features/graph/`；工作台 `WorkspaceView.tsx` 改为三栏同屏并复用既有浮层（NodeEditDialog/NodeDeleteDialog/ChainView/Archive* 全部不动逻辑，仅布局容器调整）。

## Complexity Tracking

> 无章程违规项，本表留空。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| （无） | — | — |
