# Phase 0 Research: CFD 流程归档管理工具

**Feature**: `001-cfd-workflow-archive` | **Date**: 2026-08-31 | **Input**: plan.md Technical Context

本文件消解 plan.md 中的全部技术决策点。每项以 Decision / Rationale / Alternatives 记录。

## D1 桌面应用技术栈

**Decision**: Tauri 2.x（Rust 后端）+ React 18 + TypeScript + Vite。

**Rationale**: 规格约束"独立 exe、无需安装额外运行环境、离线可用"（FR-015），且章程要求高级感与即时反馈（原则 I）。Tauri 打包产物约 5–15MB、常驻内存低，Web 渲染层便于用统一设计令牌实现克制的自定义视觉语言；Rust 侧承担文件复制引擎，安全可靠。WebView2 Evergreen 随 Windows 10 1803+ / Win11 更新预装（覆盖绝大多数目标机器），见 D4 兜底策略。

**Alternatives considered**:
- Electron + React：生态成熟，但 exe 体积 150MB+、内存占用高，与"高级感=流畅克制"及 exe 轻量目标冲突，排除。
- WPF / WinUI 3（.NET 8 self-contained）：无 WebView 依赖更彻底，但定制高级视觉需大量 XAML 样式工作，self-contained 单文件约 70–100MB，界面迭代效率低，排除。
- Flutter Desktop：拖拽与文件对话框生态相对薄弱，团队心智与 Web 设计体系不匹配，排除。

## D2 数据存储

**Decision**: 单文件 SQLite（rusqlite，bundled 特性静态编译），WAL 模式，外键开启；默认路径 `%APPDATA%\CFDFlow\cfdflow.db`，设置页允许更改数据目录（更改时提示迁移/重启生效）。

**Rationale**: 规模目标为单工程 200 节点 / 2000 文件登记（SC-007），SQLite 事务与 WAL 足以保障章程原则 IV（崩溃不损坏、写入原子）；rusqlite bundled 避免系统依赖，契合绿色 exe。

**Alternatives considered**:
- JSON 文件存储：实现最简，但 2000+ 记录下的并发写、局部损坏风险与查询能力均劣于 SQLite，排除。
- 纯文件系统目录约定（无索引）：归档批次与登记项查询不便，一致性难保证，排除。

## D3 拖拽文件登记实现

**Decision**: 使用 Tauri 窗口级拖放事件（`dragDropEnabled: true` + Webview `onDragDropEvent`），从事件载荷取 `paths`；在 Rust 侧递归展开文件夹并逐文件 stat（大小、存在性），异步执行并推送登记进度。

**Rationale**: Tauri WebView 中开启窗口级拖放后，HTML5 drop 事件被抑制，必须走 Tauri 原生事件；原生事件直接给出绝对路径（含文件夹），无需在前端做 File 对象路径探测（Web 安全模型中不可行）。文件夹递归展开与重命名/特殊字符处理统一在 Rust 完成（`\\?\` 长路径前缀，见 D5）。

**Alternatives considered**:
- HTML5 Drag & Drop API：在 Tauri 窗口拖放开启后不触发；即便关闭拖放开关，Web 层拿不到真实源路径，与"零拷贝登记源位置"需求根本冲突，排除。
- 系统文件选择器兜底按钮：保留为补充入口（同一命令 `register_files`），非主路径。

## D4 exe 交付形态与 WebView2 兜底

**Decision**: 主交付物为 Tauri 构建的独立 exe（`npm run tauri build` 产物，不开箱即用绿色形态）；启动时检测 WebView2 运行时，缺失则给出明确中文引导（提供官方离线安装器链接与内置 NSIS 安装包两种兜底）。同时产出 NSIS 安装包（内置 WebView2 Bootstrapper）作为分发选项。

**Rationale**: WebView2 Evergreen 在正常联网更新的 Win10/11 上预装，绿色 exe 即满足 FR-015；对极少数离线企业环境，双兜底保证"无需安装额外运行环境"承诺可兑现且成本最低。

**Alternatives considered**:
- 强制 NSIS 安装包为唯一形态：违背"绿色 exe"交付意图，排除。
- 自带完整浏览器内核（Electron 类）：体积代价已否决（D1），排除。

## D5 文件复制引擎（归档传输）

**Decision**: Rust 侧实现归档引擎，逐文件复制：
1. 预检：源有效性（stat）、目标盘可用空间（fs4）、同名冲突检测（对照所选策略）；
2. 复制：每个文件先写为 `目标名.part`，成功后原子 rename 为目标名；缓冲用 `std::io::copy` 默认策略；
3. 进度：按文件完成数与累计字节通过 Tauri 事件推送（`archive://progress`）；
4. 取消：`AtomicBool` 标志，复制循环在每个文件边界与内部定期检查，取消后删除全部 `.part` 残留；
5. 长路径：Windows 上超过 240 字符的源/目标路径统一加 `\\?\` verbatim 前缀。

**Rationale**: `.part` + rename 保证取消/崩溃不会留下"看似完整实为半成品"的文件（FR-009、章程原则 IV）；事件驱动进度满足 FR-009 与原则 III；冲突在预检阶段统一询问（FR-011），执行阶段不阻塞。

**Alternatives considered**:
- 前端 fetch/Stream 复制：路径与权限受限，性能差，排除。
- 第三方复制库（如 fastcopy 类）：引入未验证依赖，违反原则 V，排除。

## D6 前端架构与视觉体系

**Decision**: React 18 + zustand（状态）+ 手写设计令牌（CSS custom properties：色彩/字号/间距/圆角/动效时长，见 `src/styles/tokens.css`）；图标用 lucide-react；不引入重型组件库，对话框/列表/进度条等基础组件自建（放 `src/components/`）。文案集中在 `src/lib/strings.ts`（单语言中文字典），术语对齐章程（网格、算例、残差、工况等）。

**Rationale**: 章程原则 I 与"体验与视觉标准"要求统一设计令牌与克制动效，自建轻组件 + 令牌是最直接路径；重型组件库会带入不受控的视觉语言。2000 行列表用虚拟滚动（自实现窗口化列表）保障 SC-007。

**Alternatives considered**:
- Ant Design / MUI：视觉语言受制于库、包体大，与"统一自有设计语言"冲突，排除。
- Redux/RTK：状态规模小，zustand 足够，排除（YAGNI）。

## D7 测试策略

**Decision**:
- Rust：`src-tauri/tests/` 覆盖节点状态机（建链/防环）、路径校验与长路径、复制引擎（进度、取消、`.part` 清理、冲突三策略、空间不足）、同名节点目录消歧——全部使用 tempfile 真实文件 IO；
- 前端：Vitest + React Testing Library 覆盖状态 stores 与关键组件（汇总页勾选计算、格式化）；
- 端到端：quickstart.md 手动验收清单（映射 spec 验收场景）；tauri-driver（WebDriver）自动化推迟到后续迭代（YAGNI）。

**Rationale**: 章程"质量门禁"要求核心业务逻辑测试先行；文件 IO 与 UI 混合测试成本高，按层拆分最经济。

## D8 非功能细节

- **磁盘空间预检**：归档确认前用 fs4 读取目标卷可用空间，不足即预警（spec 边界场景），阈值 = 待归档总大小。
- **占用文件**：复制失败（分享冲突/权限）记录进批次结果明细，不中断其余文件（FR-013）。
- **删除源文件**：独立命令 `finalize_source_disposition`，仅删除本批次成功复制的条目；删除失败逐条报告（spec 边界场景），绝不中断。
- **单实例**：启动时获取命名互斥锁，重复启动提示并聚焦已有窗口（clarify 延后项，低成本兜底）。
- **持久化时机**：所有变更即时事务落盘（无"保存"按钮），重启即完整恢复（FR-014）。

## 待决事项

无 —— 本阶段所有 NEEDS CLARIFICATION 已消解；UI 具体布局细节留待 tasks/实现阶段按 quickstart 验收标准执行。
