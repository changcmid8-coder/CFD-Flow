---
description: "Task list for CFD 流程归档管理工具 (001-cfd-workflow-archive)"
---

# Tasks: CFD 流程归档管理工具

**Input**: Design documents from `/specs/001-cfd-workflow-archive/`

**Prerequisites**: plan.md ✅ | spec.md ✅ | research.md ✅ | data-model.md ✅ | contracts/tauri-commands.md ✅ | quickstart.md ✅

**Tests**: 章程"质量门禁"要求核心业务逻辑测试先行（MUST），故各用户故事阶段均含测试任务（先写、确认失败、再实现）。UI 纯视觉层不强制，按章程以检查清单代替。

**Organization**: 按用户故事分组（US1 节点链 → US2 拖拽登记 → US3 归档），每个故事可独立实现与验收。

## Format: `[ID] [P?] [Story] Description`

- **[P]**: 可并行（不同文件、无未完成依赖）
- **[Story]**: 所属用户故事（US1/US2/US3）
- 所有路径基于仓库根目录；命令契约见 `specs/001-cfd-workflow-archive/contracts/tauri-commands.md`

## Path Conventions

```text
src/          # React 前端（app/ components/ features/ stores/ styles/ lib/）
src-tauri/    # Rust 后端（src/{lib.rs,db.rs,models/,commands/,archive/} tests/）
```

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: 项目脚手架与全局基础

- [x] T001 初始化 Tauri 2 + React 18 + TypeScript + Vite 脚手架，按 plan.md 结构创建 `src/`（app/components/features/stores/styles/lib）与 `src-tauri/`（src/{lib.rs,db.rs,models/,commands/,archive/} tests/）；配置 `src-tauri/tauri.conf.json`：产品名 CFDFlow、窗口 1280×800（最小 1024×700）、中文本地化、`dragDropEnabled: true`
- [x] T002 [P] 添加依赖：`src-tauri/Cargo.toml`（rusqlite bundled、fs4、uuid v4、chrono、serde/serde_json、tauri 2）；`package.json`（zustand、lucide-react；dev: vitest、@testing-library/react）
- [x] T003 [P] 配置工具链：ESLint + Prettier（前端）、rustfmt + clippy（后端）；`package.json` scripts：`dev`/`build`/`test`/`tauri`
- [x] T004 [P] 创建设计令牌 `src/styles/tokens.css`（色彩/字号/间距/圆角/动效时长变量）+ 全局主题与中文字体栈，确立统一视觉语言基调（章程原则 I）
- [x] T005 [P] 创建集中文案字典 `src/lib/strings.ts`：中文字典结构 + CFD 术语常量（工程/节点/登记/归档，见 data-model.md 术语表）

**Checkpoint**: `npm run tauri dev` 启动空白主窗口，工具链可运行

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: 所有用户故事共用的数据层、契约与外壳（完成前不得开始任何故事）

- [x] T006 实现 SQLite 数据层 `src-tauri/src/db.rs`：连接管理（WAL、外键 ON）、五张表迁移（projects/nodes/file_entries/archive_batches/archive_result_items，字段与约束按 data-model.md）、事务辅助函数
- [x] T007 [P] 实现实体结构与 serde DTO `src-tauri/src/models/`（mod.rs, project.rs, node.rs, entry.rs, archive.rs），字段对齐 data-model.md
- [x] T008 [P] 实现 AppError `src-tauri/src/error.rs`：code（SOURCE_MISSING/OCCUPIED/DISK_FULL/CONFLICT_UNRESOLVED/CYCLE_DETECTED/DB_ERROR/IO_ERROR/CANCELLED）+ message_zh + detail，实现 Into<InvokeError>；中文 message 模板入 strings 对应常量
- [x] T009 实现工程命令 `src-tauri/src/commands/project.rs`（list_projects 含待归档计数 / create_project / update_project / delete_project 级联确认删除，契约见 contracts）并在 `src-tauri/src/lib.rs` 注册
- [x] T010 实现前端桥接 `src/lib/api.ts`：命令的类型化封装（对齐 contracts 错误模型）+ 事件订阅工具（register://progress、archive://progress、archive://finished）
- [x] T011 构建应用外壳 `src/app/`：工程列表页（空/加载/错误三态）、新建工程对话框（name 必填 ≤100）、工程切换导航骨架
- [x] T012 [P] 实现基础组件 `src/components/`：Button、Dialog（含确认对话框二次确认模式）、EmptyState、Spinner、ErrorBanner、ProgressBar，全部消费 tokens.css
- [x] T013 [P] 搭建 zustand stores `src/stores/`（projects/nodes/entries/archive 四个模块骨架与加载/错误状态约定）
- [x] T014 [P] 配置 Vitest + React Testing Library；为工程列表页写渲染与空状态冒烟测试 `src/app/ProjectsView.test.tsx`

**Checkpoint**: dev 模式下可创建/切换/删除工程并持久化（重启恢复），为全部故事提供工程上下文

---

## Phase 3: User Story 1 — 自由创建调试节点并表达对应关系 (Priority: P1) 🎯 MVP

**Goal**: 工程内自由建节点、以"来源于"建链、可回溯、防环、删除有处置策略

**Independent Test**: 仅用工程+节点功能即可验证：建 3 节点成链、改/解除关系、防环拒绝、删除节点时文件处置询问——不依赖登记与归档

### Tests for User Story 1（先写，确认 FAIL）

- [x] T015 [P] [US1] 编写 Rust 集成测试 `src-tauri/tests/nodes_test.rs`：create_node 名称校验、set_node_parent 建链与解除、自引用/环拒绝返回 CYCLE_DETECTED、delete_node 两种 disposition（remove_entries/move_entries）且不动磁盘文件、下游节点 parent 置空——先运行确认全部失败

### Implementation for User Story 1

- [x] T016 [US1] 实现节点命令 `src-tauri/src/commands/node.rs`：create_node / update_node / set_node_parent（沿 parent 链向上遍历防环）/ delete_node（disposition 处置事务），行为对齐 contracts；使 T015 全部通过
- [x] T017 [P] [US1] 实现节点状态 `src/stores/nodes.ts`：节点映射、链路派生选择器（upstream/downstream）、CRUD 动作与错误透出
- [x] T018 [US1] 构建节点列表与编辑 `src/features/nodes/NodeList.tsx` + `NodeEditDialog.tsx`：新建（name 必填、备注可选）、上游来源选择器（仅本工程节点、排除自身及其下游）、编辑/解除关系、CYCLE_DETECTED 错误提示
- [x] T019 [US1] 构建调试链视图 `src/features/nodes/ChainView.tsx`：任一节点回溯完整来源链、展示下游尝试；同名节点以创建时间+备注辅助区分（FR-003/FR-020）
- [x] T020 [US1] 实现节点删除处置对话框 `src/features/nodes/NodeDeleteDialog.tsx`：仍有登记时强制二选一（一并移除登记 / 转移到其他节点），说明"磁盘源文件不受影响"
- [ ] T021 [US1] 按 quickstart.md 场景 A 手动验收（≤2 分钟成链、独立节点、防环），记录结果

**Checkpoint**: US1 独立可用——调试过程记录工具（MVP）达成

---

## Phase 4: User Story 2 — 拖拽文件登记到节点 (Priority: P2)

**Goal**: 零拷贝拖拽登记（文件/文件夹）、多文件同节点、可移除、2000 行列表流畅

**Independent Test**: 在 US1 基础上拖入文件/文件夹，核对登记信息与磁盘零拷贝；不依赖归档

### Tests for User Story 2（先写，确认 FAIL）

- [x] T022 [P] [US2] 编写 Rust 集成测试 `src-tauri/tests/register_test.rs`：文件夹递归展开与逐个 stat（真实 tempfile）、空/不可读文件夹记入 skipped、特殊字符与 >240 字符长路径（verbatim 前缀）、零拷贝（登记不增目标盘文件）、register://progress 事件序列——先运行确认失败

### Implementation for User Story 2

- [x] T023 [US2] 实现登记命令 `src-tauri/src/commands/entry.rs`：register_files（异步递归 walk + stat + 事务插入 + 进度事件）、remove_entry（仅移除记录），对齐 contracts；使 T022 通过
- [x] T024 [P] [US2] 实现登记状态 `src/stores/entries.ts`：按节点分组映射、登记进度状态、移除动作
- [x] T025 [US2] 构建拖拽接入 `src/features/entries/DropZone.tsx`：Tauri onDragDropEvent → 悬停节点高亮判定、放下即调 register_files；同视图提供文件/文件夹选择器兜底按钮
- [x] T026 [US2] 构建登记列表 `src/features/entries/EntryList.tsx`：窗口化虚拟滚动（2000 行操作 ≤1s，SC-007）、文件名/大小/源位置/登记时间列、移除登记（确认对话框）、空状态
- [x] T027 [P] [US2] 前端测试 `src/features/entries/EntryList.test.tsx`：虚拟列表渲染数量、分组统计、移除交互（Vitest + RTL）
- [ ] T028 [US2] 按 quickstart.md 场景 B 手动验收（零拷贝对比、多文件同节点、文件夹整拖、移除不动源文件）

**Checkpoint**: US1+US2 均独立可用

---

## Phase 5: User Story 3 — 一键归档 (Priority: P3)

**Goal**: 汇总确认（大小/按节点排除）→ 两层结构传输（进度/取消/冲突三策略）→ 保留源文件询问（二次确认）→ 结果报告与历史

**Independent Test**: 预置登记文件后走完整归档流，核对目标目录结构与源文件处置；不改动 US1/US2 行为

### Tests for User Story 3（先写，确认 FAIL）

- [x] T029 [P] [US3] 编写预检测试 `src-tauri/tests/archive_preview_test.rs`：重新 stat 刷新 current_size/validity、同名冲突检测、fs4 磁盘空间口径——先运行确认失败
- [x] T030 [P] [US3] 编写引擎测试 `src-tauri/tests/archive_engine_test.rs`：两层目录创建（工程名/节点名）、.part 复制成功后 rename、取消后无 .part 残留、冲突三策略（skip/overwrite/rename）、同名节点子目录消歧（节点名-2）、占用/权限失败不中断且逐条记录、finalize 仅删除 outcome=copied 且失败逐条报告——先运行确认失败

### Implementation for User Story 3

- [x] T031 [US3] 实现归档引擎 `src-tauri/src/archive/engine.rs`：预检（stat/fs4/conflicts）、逐文件 .part+rename、AtomicBool 取消（文件边界+内部检查点）、`\\?\` verbatim 长路径、目录消歧规则；使 T029/T030 通过
- [x] T032 [US3] 实现归档命令 `src-tauri/src/commands/archive.rs`：preview_archive / execute_archive / cancel_archive / finalize_source_disposition / list_archive_batches + archive://progress、archive://finished 事件，对齐 contracts
- [x] T033 [P] [US3] 实现归档状态 `src/stores/archive.ts`：预检结果、批次进度、事件订阅、确认页勾选状态派生（Q2 默认全量）
- [x] T034 [US3] 构建归档确认页 `src/features/archive/ArchiveConfirm.tsx`：汇总（文件数/总大小/目标目录选择并记住默认）、按节点勾选排除、冲突三策略对话框、磁盘空间不足预警（边界场景）
- [x] T035 [US3] 构建进度视图 `src/features/archive/ArchiveProgress.tsx`：阶段/已完成字节与文件/当前文件、取消按钮与取消后 .part 清理反馈（FR-009）
- [x] T036 [US3] 构建结果与处置 `src/features/archive/ArchiveResult.tsx`：成功/跳过/失败明细（FR-013）、"是否保留源文件"询问 + 删除二次显式确认、删除失败明细（FR-012）
- [x] T037 [US3] 实现已归档标记与再次归档 `src/features/entries/EntryList.tsx` 扩展：已归档徽章、移出待归档汇总、每项"再次归档"入口（FR-019）
- [x] T038 [US3] 构建归档历史 `src/features/archive/BatchHistory.tsx`：批次列表（时间/目标/范围/状态/明细计数）
- [ ] T039 [US3] 按 quickstart.md 场景 C/D 手动验收（汇总、取消无残留、两层结构核对、三策略、保留/删除源文件、失效源、空间不足）

**Checkpoint**: 全部核心故事完成，端到端闭环可用

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: 交付形态、性能与全局体验

- [x] T040 [P] 实现单实例互斥锁 `src-tauri/src/lib.rs`：命名 Mutex，重复启动提示并聚焦已有窗口（research D8）
- [x] T041 [P] 交付配置：tauri.conf.json bundle（NSIS + webviewInstallMode bootstrapper 兜底）、WebView2 检测引导；执行 `npm run tauri build` 验证绿色 exe 与安装包产物（research D4）
- [ ] T042 性能验证：编写造数脚本生成 200 节点/2000 登记文件，抽查列表操作 ≤1s、归档汇总 ≤3s（SC-003/SC-007）
- [x] T043 全局体验审查：所有列表空/加载/错误三态齐全、文案全部走 `src/lib/strings.ts` 且为"发生了什么+该做什么"格式（章程体验标准）、动效时长统一取自 tokens
- [x] T044 [P] 编写 README.md：构建步骤、交付物说明、数据目录位置与备份提示
- [ ] T045 执行 quickstart.md 完整验收（A–F），按验收判定记录结果；修复发现的问题后复跑

---

## Dependencies & Execution Order

### Phase Dependencies

- **Phase 1 Setup**：无依赖，立即开始
- **Phase 2 Foundational**：依赖 T001–T005；**阻塞全部用户故事**
- **Phase 3–5 用户故事**：依赖 Phase 2 完成；US1→US2→US3 按优先级顺序实现（US2 依赖 US1 的节点作为登记目标；US3 依赖 US1+US2 的内容）
- **Phase 6 Polish**：依赖 US3 完成（T041 可与 US3 并行提前验证打包链路）

### User Story Dependencies

- **US1（P1）**：仅依赖 Foundational；独立可测（quickstart A）
- **US2（P2）**：依赖 US1 的节点实体与列表作为拖放目标
- **US3（P3）**：依赖 US1+US2 提供的节点与登记内容

### Within Each User Story

- 测试（Rust 集成测试）先写且确认 FAIL → 实现 → 测试通过 → 手动验收（quickstart 对应场景）
- 命令层（src-tauri）先于 UI（src/features）；store 先于视图

### Parallel Opportunities

- Phase 1：T002/T003/T004/T005 可并行
- Phase 2：T007/T008/T012/T013/T014 可并行（T006 完成后）
- 各故事内：测试编写（T015/T022/T029+T030）、store（T017/T024/T033）均可与命令实现并行推进
- Phase 6：T040/T041/T044 可并行

---

## Implementation Strategy

### MVP First（仅 US1）

1. 完成 Phase 1 + Phase 2（基础底盘）
2. 完成 Phase 3（US1）→ **停下验证**：quickstart 场景 A
3. 此时已交付"调试过程记录工具"最小价值

### Incremental Delivery

1. Setup + Foundational → 底盘就绪
2. +US1 → MVP：节点链可追溯
3. +US2 → 产物登记入口打通
4. +US3 → 归档闭环，交付完整工具
5. Polish → exe 交付形态与性能达标

### 并行团队策略（如多人）

1. 全员完成 Setup + Foundational
2. A：US1 命令+视图；B：US2 拖拽+列表（依赖 A 的节点列表骨架后启动）；C：US3 引擎（T029–T031 可提前与 US2 并行开发，集成在 US3 阶段）

---

## Notes

- [P] = 不同文件、无未完成依赖，可并行
- [Story] 标签保证任务与 spec 用户故事可追溯
- 每个故事在 Checkpoint 处独立验收后再前进
- 提交节奏：每任务或逻辑组一提交
- 禁止：模糊任务、同文件冲突、破坏故事独立性的跨故事依赖
