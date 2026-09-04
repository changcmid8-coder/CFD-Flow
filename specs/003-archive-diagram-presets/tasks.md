---
description: "Task list for 归档流程图图片与节点预设 (003-archive-diagram-presets)"
---

# Tasks: 归档流程图图片与节点预设

**Input**: Design documents from `/specs/003-archive-diagram-presets/`

**Prerequisites**: plan.md ✅ | spec.md ✅（含 2 条澄清）| research.md ✅ | data-model.md ✅ | contracts/diagram-and-presets.md ✅ | quickstart.md ✅

**Tests**: 章程"质量门禁"要求核心业务逻辑测试先行——本特性的核心逻辑为绘制指令纯函数（`buildDiagramPlan`）与 Rust 写盘命令（`save_archive_diagram`），两者测试先行；Canvas 真实渲染与图片可读性由 quickstart 真机验收覆盖。

**Organization**: 按用户故事分组（US1 归档流程图 → US2 节点预设），两故事相互独立可并行。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1/US2）
- 所有路径基于仓库根目录；契约见 `specs/003-archive-diagram-presets/contracts/diagram-and-presets.md`

## Path Conventions

```text
src/lib/graph-diagram.ts       # 绘制指令纯函数 + Canvas 执行器 + 保存编排
src/lib/presets.ts             # 内置节点预设常量
src/features/nodes/NodeEditDialog.tsx  # 预设 chips 入口
src-tauri/src/commands/archive.rs      # save_archive_diagram 命令
```

---

## Phase 1: Setup

- [x] T001 [P] 在 `src/lib/strings.ts` 增补文案：`diagramSaved`（流程图已更新至归档目录）、`diagramFailed`（流程图生成失败：{reason}）、`presetsLabel`（典型流程预设）

**Checkpoint**: 文案就绪

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 图绘制指令纯函数——US1 的核心逻辑，完成前不得开始任何故事

- [x] T002 [P] 编写绘制指令测试 `src/lib/graph-diagram.test.ts`（先运行确认 FAIL）：每个 GraphNode 恰好一个 box 且徽章数值与摘要同源（total/pending/archived/missing/sizeText）、derives 箭头终点纵坐标大于起点（自上而下）、sharedLinks 按节点对去重且 count 正确、plan.title 含工程名、含 generatedAt 时间注记、canvas 尺寸随节点扩展
- [x] T003 实现 `src/lib/graph-diagram.ts` 的 `buildDiagramPlan(graph, layout, opts)`：按 data-model.md 产出 DiagramPlan（boxes/arrows/sharedLinks/title/generatedAt/canvas），令牌色值经 getComputedStyle 读取，使 T002 全部通过

**Checkpoint**: 绘制指令纯函数锁定（jsdom 可测），US1/US2 均可开始

---

## Phase 3: User Story 1 — 归档目录自带流程图 (Priority: P1) 🎯 MVP

**Goal**: 归档批次收尾（copied>0）时自动生成 `目标目录/工程名/流程图.png`（与框图同口径），失败可见不影响归档结果

**Independent Test**: 归档一次，打开 `归档目录/工程名/流程图.png` 核对与框图/目录子文件夹一致；重复归档后图片更新

### Tests for User Story 1（先写，确认 FAIL）

- [x] T004 [P] [US1] 编写 Rust 写盘测试 `src-tauri/tests/archive_diagram_test.rs`（先运行确认 FAIL）：save_archive_diagram_conn 写入 `目标/工程名/流程图.png`、目录不存在时自动创建、重复保存覆盖更新（文件内容替换）、工程名为空返回 VALIDATION

### Implementation for User Story 1

- [x] T005 [US1] 实现 Rust 命令 `save_archive_diagram`（`src-tauri/src/commands/archive.rs`：拼装路径 + `safe_name(工程名)` + create_dir_all 兜底 + `.tmp` 写入后 rename 覆盖；空参数返回 VALIDATION），在 `src-tauri/src/lib.rs` 注册；使 T004 通过
- [x] T006 [US1] 实现前端执行与编排（`src/lib/graph-diagram.ts` 后半）：`renderToBlob(plan, scale=2)`（Canvas 2D 执行指令：背景/标题/框/徽章/箭头/虚线，字体含中文栈）与 `exportArchiveDiagram(final)`（copied>0 → refreshCurrent → buildGraphData/computeLayout → buildDiagramPlan → renderToBlob → api 调用；任一步失败经 useArchive.setNotice 呈现 warn 且不抛出）；`src/lib/api.ts` 增补 `saveArchiveDiagram` 封装
- [x] T007 [US1] 接线触发链：`src/app/App.tsx` 的 `onArchiveFinished` 回调在 `setFinal(f)` 后对 `copied > 0` 的批次调用 `exportArchiveDiagram(f)`（fire-and-forget，内部自带失败可见性）
- [x] T008 [US1] 按 quickstart.md 场景 L 手动验收（归档 → 打开 PNG 核对与框图/目录一致 → 重复归档覆盖 → 取消不生成），记录结果

**Checkpoint**: US1 独立可用——归档目录自带流程图说明书

---

## Phase 4: User Story 2 — 典型流程节点预设 (Priority: P2)

**Goal**: 新建节点对话框内置 5 个典型流程预设，一键填入名称（不改来源），与画布"新建下游"预填兼容

**Independent Test**: 打开新建节点对话框点预设 → 名称自动填入 → 保存成功；画布入口下预设不覆盖来源预填

### Tests for User Story 2（先写，确认 FAIL）

- [x] T009 [P] [US2] 编写测试：`src/lib/presets.test.ts` 断言 `NODE_PRESETS` 含至少 5 项且包含"参考文献/原始几何/网格划分/计算求解/后处理"、为只读常量数组；`src/features/nodes/NodeEditDialog.test.tsx` 断言对话框渲染预设 chips、点击"网格划分"后名称输入框变为该值且"来源于"选择框保持原值（画布预填场景）——先运行确认 FAIL

### Implementation for User Story 2

- [x] T010 [US2] 实现 `src/lib/presets.ts`（`NODE_PRESETS` 只读常量）并使 T009 的常量断言通过
- [x] T011 [US2] 在 `src/features/nodes/NodeEditDialog.tsx` 名称 Field 上方渲染预设 chips（复用 Btn small，`presetsLabel` 标注；点击仅 `setName(预设)`，`stopPropagation` 不适用此处无冲突；不修改 parent），使 T009 全部通过
- [x] T012 [US2] 按 quickstart.md 场景 M 手动验收（列表/画布两入口、预设填入可改、≤5 秒），记录结果

**Checkpoint**: 两个故事均独立可用

---

## Phase 5: Polish & Cross-Cutting Concerns

- [x] T013 [P] 更新 `README.md` 功能清单（归档目录自动生成流程图图片、典型流程节点预设）；核对 `src/lib/strings.ts` 新文案为"发生了什么 + 该做什么"格式
- [x] T014 全量回归（npx vitest run + cargo test）与 quickstart.md 场景 N 抽查（只读目录下图片失败可见、归档结果不受影响）；`npm run tauri build` 重新打包 exe

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：无依赖，立即开始
- **Phase 2 Foundational**：依赖 T001（文案非硬依赖，可并行）；**阻塞 US1**（T002→T003）
- **US1（Phase 3）**：依赖 Phase 2；T004（Rust 测试）与 T006 前半可并行推进；T007 依赖 T005/T006
- **US2（Phase 4）**：不依赖 US1——T009/T010 与 US1 完全并行；T011 依赖 T010
- **Phase 5 Polish**：依赖两个故事完成

### User Story Dependencies

- **US1（P1）**：Foundational → Rust 命令 + 前端管线 → 触发接线 → 验收
- **US2（P2）**：仅依赖 Setup（文案）；与 US1 无文件冲突（NodeEditDialog/presets 独立），可全程并行

### Within Each User Story

- US1：Rust 测试先行 → 命令实现 → 前端执行器/编排 → 触发接线 → 手动验收
- US2：常量与组件测试先行 → 实现 → 手动验收

### Parallel Opportunities

- T001 与 T002 并行
- T004（Rust 测试）与 T006 前半（Canvas 执行器）并行
- **US2 整条线（T009–T012）可与 US1 全程并行**（不同文件集）
- T013 与 T014 前半并行

---

## Implementation Strategy

### MVP First（US1）

1. Phase 1 + Phase 2（绘制指令锁定）
2. Phase 3（US1）→ **停下验证**：quickstart L
3. 此时"归档目录自带流程图说明书"核心诉求兑现

### Incremental Delivery

1. Setup + Foundational → 指令纯函数锁定
2. +US1 → 归档目录可读性交付（MVP）
3. +US2 → 录入效率提升
4. Polish → 回归与重新打包

### 并行团队策略（如多人）

1. A：US1 全线（Rust 命令 + Canvas 管线）
2. B：US2 全线（预设常量 + 对话框入口）
3. 汇合后 Polish 回归

---

## Notes

- [P] = 不同文件、无未完成依赖，可并行
- [Story] 标签保证任务与 spec 用户故事可追溯
- Canvas 真实渲染与图片可读性属真机验收（jsdom 无 Canvas 实现，已按"指令/执行分离"规避）
- 提交节奏：每任务或逻辑组一提交
- 禁止：模糊任务、同文件冲突、破坏故事独立性的跨故事依赖
