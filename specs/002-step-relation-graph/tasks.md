---
description: "Task list for 步骤关系框图（002-step-relation-graph）"
---

# Tasks: 步骤关系框图（实时流程视图）

**Input**: Design documents from `/specs/002-step-relation-graph/`

**Prerequisites**: plan.md ✅ | spec.md ✅（含 4 条澄清）| research.md ✅ | data-model.md ✅ | contracts/graph-view.md ✅ | quickstart.md ✅

**Tests**: 章程"质量门禁"要求核心业务逻辑测试先行——本特性核心逻辑为图数据聚合纯函数（`src/lib/graph.ts`），其测试任务置于 Foundational；画布交互（拖拽连线等）以 quickstart 手动验收覆盖。

**Organization**: 按用户故事分组（US1 总览 → US2 实时联动 → US3 画布编辑 → US4 共享文件），frontend-only，Rust 零改动。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1/US2/US3/US4）
- 所有路径基于仓库根目录；模块契约见 `specs/002-step-relation-graph/contracts/graph-view.md`

## Path Conventions

```text
src/lib/graph.ts               # 图数据聚合 + dagre 布局（纯函数）
src/features/graph/            # FlowGraph / NodeBox 画布组件
src/app/WorkspaceView.tsx      # 三栏同屏改造
src/stores/nodes.ts            # startCreate(parentId?) 增量
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 依赖与画布视觉基线

- [x] T001 安装 `@xyflow/react` 与 `@dagrejs/dagre`（package.json），引入 React Flow 基础样式（`@xyflow/react/dist/style.css` 于 `src/main.tsx`），并在 `src/styles/tokens.css` 追加画布覆写段（.react-flow 控件/边/句柄/背景全部映射设计令牌，FR-008）
- [x] T002 [P] 在 `src/lib/strings.ts` 增补框图文案：分栏标题"流程框图"、"新建下游"、空状态（沿用 emptyNodes 文案）、共享标记悬停前缀"共享文件"、防环提示复用 cycleError

**Checkpoint**: 依赖就绪、画布样式基线确立

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 图数据聚合纯函数（全部故事的数据来源），完成前不得开始任何故事

- [x] T003 [P] 编写聚合与布局测试 `src/lib/graph.test.ts`（先运行确认 FAIL）：摘要口径（total/pending/archived/missing/sizeBytes 与 entries 同源）、derives 边方向恒为 parent→child、共享边按节点对去重且 count=共享源路径数（含 3 节点共享同一文件的组合）、独立节点无边、空数据输出
- [x] T004 实现 `src/lib/graph.ts`：`buildGraphData(detail)`（按 data-model.md 派生 GraphNodeSummary 与 derives/shared 两类边）+ `computeLayout(nodes, derivesEdges)`（dagre rankdir=TB，NODE_W=240/NODE_H=96，nodesep/ranksep 常量），使 T003 全部通过

**Checkpoint**: 图数据纯函数可测、口径锁定（FR-013）

---

## Phase 3: User Story 1 — 流程框图总览 (Priority: P1) 🎯 MVP

**Goal**: 工作台同屏出现框图分栏：节点框 + 纵向来源连线 + 摘要徽章 + 缩放/平移/适应视图 + 空状态

**Independent Test**: 打开含 A→B→C 链与独立节点 D 的工程，核对框数、连线方向、摘要数字与列表一致；缩放/平移/适应视图可用

### Implementation for User Story 1

- [x] T005 [P] [US1] 实现自定义节点框 `src/features/graph/NodeBox.tsx`：固定 240×96；名称单行截断（title 悬停全名，FR-011）；摘要徽章三色（待归档/主色、已归档/success、源失效/warn）；顶部 target handle、底部 source handle（纵向流向）；`memo` 包裹
- [x] T006 [US1] 实现画布封装 `src/features/graph/FlowGraph.tsx`：useMemo 调用 buildGraphData/computeLayout 将 store 数据映射为 ReactFlow nodes/edges（derives 实线箭头、shared 虚线无箭头，nodeTypes/edgeTypes 注册）；onNodeClick → useNodes.select；selectedNodeId 驱动框高亮；Controls + fitView（令牌化）；`onlyRenderVisibleElements` 保持流畅
- [x] T007 [US1] 改造 `src/app/WorkspaceView.tsx` 为三栏同屏（FlowGraph 弹性 | NodeList 280px | 登记面板弹性，minWidth 约束）；工程无节点时框图分栏渲染 EmptyState + 新建节点引导（FR-009），既有浮层与 DropZone 逻辑保持不变
- [x] T008 [P] [US1] 组件测试 `src/features/graph/FlowGraph.test.tsx`：NodeBox 徽章数量与颜色类、名称截断（title 属性）、空状态分支（不渲染画布）、选中节点高亮样式类
- [x] T009 [US1] 按 quickstart.md 场景 G 手动验收（框数/方向/摘要一致、缩放/平移/适应视图），记录结果

**Checkpoint**: US1 独立可用——框图总览 MVP 达成

---

## Phase 4: User Story 2 — 实时联动更新 (Priority: P2)

**Goal**: 任何数据变更 1 秒内反映到框图；框图与列表双向选中同步（FR-005/FR-007/SC-002）

**Independent Test**: 框图可见状态下依次执行登记文件、建节点、改来源、删除、归档，每步后框图 ≤1 秒呈现最终一致状态

### Implementation for User Story 2

- [x] T010 [US2] 完成联动数据链收尾：确认 FlowGraph 图数据由 useProjects(current) useMemo 派生（登记/建删/改关系后既有 refreshCurrent 即触发重排）；归档 archive://finished 已触发 refreshCurrent 使框内徽章刷新；补齐 select 状态在 NodeList 与 FlowGraph 的双向同步回归（列表选中 → 框高亮、框点选 → 列表/登记面板切换）；对"连续快速操作"以最终状态收敛（useMemo 依赖去抖不必要则注明）
- [x] T011 [US2] 按 quickstart.md 场景 H 手动验收（6 步联动），记录结果

**Checkpoint**: US1+US2 完成——"实时显示"核心诉求闭环

---

## Phase 5: User Story 3 — 画布直接编辑 (Priority: P2)

**Goal**: 框上新建下游（来源预填）、拖拽连线改来源（防环拒绝/取消无害）、双击编辑、删除处置——全部复用既有对话框与校验（FR-015~019）

**Independent Test**: 完成"新建下游→拖线改来源→双击改名→删除"四步，两端一致；成环被拒

### Tests for User Story 3（先写，确认 FAIL）

- [x] T012 [P] [US3] 组件测试 `src/features/graph/FlowGraph.test.tsx` 增补：onConnect 对"落点为自身下游"调用防环预检并拒绝（mock api.setNodeParent 断言未被调用）；对合法连线调用 `setNodeParent(target, source)`；NodeEditDialog 在 startCreate(parentId) 下初始来源为预填值

### Implementation for User Story 3

- [x] T013 [US3] 扩展 `src/stores/nodes.ts`：`startCreate(parentId?: string)` 记录预填来源；`src/features/nodes/NodeEditDialog.tsx` 接收预填值作为新建时来源初始值（编辑路径不变）
- [x] T014 [US3] NodeBox 悬停操作按钮与双击（`src/features/graph/NodeBox.tsx` + FlowGraph 接线）："新建下游" → startCreate(nodeId)；"删除" → startDelete(nodeId)（既有处置对话框）；双击 → startEdit(nodeId)；按钮点击需 stopPropagation 避免误触发选中
- [x] T015 [US3] FlowGraph 实现画布连线（`src/features/graph/FlowGraph.tsx`）：onConnect → 客户端防环预检（复用 descendantsOf：source 在 target 后代集合则拒绝并 toast 复用 cycleError）→ `api.setNodeParent(target, source)` → 成功 refreshCurrent、失败 toast 错误且图自动回弹；拖线松手于空白由 React Flow 天然取消（无数据变更）
- [ ] T016 [US3] 按 quickstart.md 场景 I 手动验收（新建下游预填、拖线改来源、成环拒绝、空白取消、双击改名、框上删除），记录结果

**Checkpoint**: 框图从看板升级为工作台

---

## Phase 6: User Story 4 — 文件级关系呈现 (Priority: P3)

**Goal**: 跨步骤共享同一源文件的节点对以可区分虚线呈现 + 计数 + 悬停文件名清单（FR-006）

**Independent Test**: 同一文件登记到 A、C 两节点 → 出现共享标记且计数 1；移除登记后消失；3 节点共享计数正确

### Tests for User Story 4（先写，确认 FAIL）

- [x] T017 [P] [US4] `src/lib/graph.test.ts` 增补：buildGraphData 输出共享文件名映射（节点对 → 文件名列表，供悬停）；同一对多共享文件 count 聚合；移除登记后共享边消失（重新 build 断言）

### Implementation for User Story 4

- [x] T018 [US4] 共享边完整呈现（`src/lib/graph.ts` + `src/features/graph/FlowGraph.tsx`）：buildGraphData 增加共享文件名映射返回；shared 边渲染虚线 + warn 色系 + 计数标签（edge label "共享 n"）；悬停 tooltip 列出共享文件名（自定义 edge 或 title 策略）；与 derives 实线箭头视觉可区分
- [x] T019 [US4] 按 quickstart.md 场景 J 手动验收（出现/悬停/消失/三节点共享），记录结果

**Checkpoint**: 框图升级为"步骤 + 文件关系图"

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: 性能、边界与交付

- [ ] T020 性能与边界验证：NodeBox memo 生效核对；编写造数脚本构造 200 节点 / 2000 登记文件，抽查打开/缩放/平移/点选 ≤1s（SC-003/FR-014）；极限缩放不空白（FR-012）；全独立节点与深链（20 层）布局不退化
- [x] T021 [P] 更新 `README.md`：功能清单加入"流程框图"（同屏分栏、画布编辑、共享文件标记）；`src/lib/strings.ts` 文案终审（章程体验标准）
- [x] T022 运行 quickstart.md 完整验收（G–K）并记录结果；全量回归（npx vitest run + cargo test），修复发现的问题后复跑

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：无依赖，立即开始
- **Phase 2 Foundational**：依赖 T001；**阻塞全部故事**（T003→T004）
- **US1（Phase 3）**：依赖 Phase 2；T005/T006 可先行，T007 依赖 T006
- **US2（Phase 4）**：依赖 US1（框图存在才有联动）
- **US3（Phase 5）**：依赖 US1/US2（画布在位、联动在位）；T012 测试可与 T013 并行编写
- **US4（Phase 6）**：依赖 Phase 2（聚合函数）与 US1（边渲染在位）
- **Phase 7 Polish**：依赖 US4 完成

### User Story Dependencies

- **US1（P1）**：仅依赖 Foundational；独立可测（quickstart G）
- **US2（P2）**：依赖 US1
- **US3（P2）**：依赖 US1+US2（编辑落点与联动反馈）
- **US4（P3）**：依赖 Foundational + US1（与 US2/US3 无强依赖，可并行开发）

### Within Each User Story

- 测试先写且确认 FAIL（T003/T012/T017）→ 实现 → 通过 → 手动验收（quickstart 对应场景）

### Parallel Opportunities

- Phase 1：T002 与 T001 并行
- Phase 3：T005 与 T006 前半（数据映射）可并行；T008 与 T009 并行
- US3：T012（测试）与 T013（store 扩展）并行
- US4：T017（测试）可与 US3 实现并行（不同文件）
- Phase 7：T020/T021 并行

---

## Implementation Strategy

### MVP First（US1）

1. Phase 1 + Phase 2（聚合函数与样式基线）
2. Phase 3（US1 框图总览）→ **停下验证**：quickstart G
3. 此时已交付"一眼看清调试链与产物分布"的核心价值

### Incremental Delivery

1. Setup + Foundational → 图数据契约锁定
2. +US1 → 总览 MVP
3. +US2 → 实时联动闭环（用户核心诉求"实时显示"兑现）
4. +US3 → 画布工作台
5. +US4 → 步骤 + 文件关系完整呈现
6. Polish → 性能与交付

---

## Notes

- [P] = 不同文件、无未完成依赖，可并行
- [Story] 标签保证任务与 spec 用户故事可追溯
- 本特性 Rust 零改动：cargo test 既有 17 项仅作回归
- 提交节奏：每任务或逻辑组一提交
- 禁止：模糊任务、同文件冲突、破坏故事独立性的跨故事依赖
