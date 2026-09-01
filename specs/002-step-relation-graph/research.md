# Phase 0 Research: 步骤关系框图（实时流程视图）

**Feature**: `002-step-relation-graph` | **Date**: 2026-08-31 | **Input**: plan.md Technical Context

本特性为 frontend-only 增量，研究点集中在图渲染与布局方案。

## D1 画布渲染方案

**Decision**: 采用 `@xyflow/react`（React Flow 12，MIT 协议）作为画布基座。

**Rationale**: 需求清单——框（自定义节点）、有向连线、缩放/平移/适应视图、点选联动、**拖拽连线改关系**（FR-016）、画布编辑入口——与 React Flow 的能力几乎一一对应（custom nodes、animated edges、Controls、onNodeClick、Handles + onConnect、fitView）。它以 React 组件模型渲染节点，可直接消费 tokens.css 设计令牌，规避自研画布交互（拖拽命中、坐标变换、边界惯性）的质量风险，符合章程原则 V（最简方案）与 I（高级感交互基线）。

**Alternatives considered**:
- 自研 SVG 画布：完全可控、零依赖，但缩放/平移/拖线命中/适应视图等交互全部手写，开发量与缺陷风险高，排除。
- Canvas/Pixi：为 200 节点规模引入 GPU 渲染属过度设计，且失去 DOM 可访问性与 CSS 令牌直用能力，排除。
- Cytoscape.js：功能强但自带完整样式体系，与"统一设计令牌"冲突更难驯服，API 偏命令式，排除。

## D2 自动分层布局

**Decision**: `@dagrejs/dagre` 计算纵向（top→bottom）分层布局；React Flow 仅负责渲染与交互，位置全部来自 dagre 输出。

**Rationale**: dagre 是成熟的层次有向图布局器（rankdir=TB、nodesep/ranksep 可调、自动减少交叉），输入节点尺寸/边关系、输出坐标，恰好满足"按来源关系分层 + 减少交叉 + 无需手动摆放"（FR-004）。200 节点规模下布局计算为毫秒级，满足 SC-001。节点位置由数据派生，任何变更重算即得"自动重排"（FR-005）。

**Alternatives considered**:
- elkjs（Eclipse Layout Kernel）：布局质量略优但体积大（wasm）、集成更重，对 ≤200 节点收益不成比例，排除。
- 手写分层（最长路径 + 同层排序）：可控但交叉优化与紧凑度难以短期做稳，排除（原则 V）。

## D3 图数据派生与共享文件关系

**Decision**: 纯函数模块 `src/lib/graph.ts` 完成 `ProjectDetail → {graphNodes, derivesEdges, sharedEdges}` 的聚合：①节点摘要（总数/大小/待归档/已归档/源失效）按登记项聚合，口径与列表一致（同一数据源）；②来源边由 `parent_node_id` 派生；③共享关系按 `original_path` 分组、取组内节点对去重聚合为共享边（计数 = 组内跨节点共享的文件数）。共享边与来源边以不同视觉类型呈现（可区分，FR-003）。

**Rationale**: 纯函数无 React 依赖，可独立单测（Vitest）覆盖聚合正确性与口径一致性（FR-013）；2000 登记文件分组为 O(n)，无性能风险。

**Alternatives considered**:
- 后端聚合命令：数据已在前端内存中，再走 IPC 属多余一跳，且违反"零新增命令"约束，排除。

## D4 画布编辑与数据流

**Decision**: 画布编辑全部复用既有链路——"新建下游"调用 `useNodes.startCreate(parentId)`（新增预填参数）打开既有 NodeEditDialog；拖拽连线经 React Flow `onConnect` → 客户端防环预检（复用 `descendantsOf`）→ 调既有 `api.setNodeParent(target, source)`；后端拒绝（CYCLE_DETECTED 等）时 UI 以既有 toast 呈现错误且图数据因以 store 为单一事实源而自动回弹；双击打开既有编辑对话框；删除入口打开既有 NodeDeleteDialog。

**Rationale**: 单一事实源（ProjectDetail store）+ 派生渲染，天然满足"两端一致"（FR-019）与 1 秒联动（FR-005）；不新增任何写路径或校验规则，符合原则 IV/V。

**Alternatives considered**:
- 画布内乐观更新（先改图再同步）：引入两套事实源，冲突回滚复杂，与"两端一致"硬约束相悖，排除。

## D5 布局与交互细节

- **方向**：dagre `rankdir: 'TB'`（上游在上、下游在下，澄清 Q4）。
- **节点尺寸**：NodeBox 固定尺寸（如 240×96，名称截断），保证布局输入稳定。
- **Handles**：source 在框底部、target 在框顶部，与纵向流向一致；仅 source handle 可拖出连线。
- **共享边**：虚线 + 独立色彩（warn 色系），悬浮提示共享文件名列表；来源边为实线箭头。
- **控件**：React Flow Controls（缩放/适应视图）经 CSS 覆写为令牌样式；不做小地图（未要求，YAGNI）。
- **空状态**：无节点时画布区域渲染 EmptyState（FR-009），不挂载 ReactFlow。
- **性能**：NodeBox 以 `memo` 包裹；布局结果按节点/边集合 memoize；200 节点渲染与交互满足 SC-003。

## D6 测试策略

- **Vitest 单测**（`src/lib/graph.test.ts`）：摘要聚合口径、来源边方向、共享边成对去重与计数、多节点共享（≥3）、空数据。
- **Vitest 组件测**（`FlowGraph.test.tsx` / `NodeBox` 渲染）：徽章呈现、名称截断、选中高亮样式、空状态分支（ReactFlow 以轻量 mock 或仅测纯渲染层）。
- **手动验收**：拖拽连线、画布编辑闭环、缩放平移手感（quickstart.md 场景 G–J）。
- Rust 侧无改动，既有 17 项测试保持通过。

## 待决事项

无。
