# Implementation Plan: CFD 流程归档管理工具

**Branch**: `001-cfd-workflow-archive` | **Date**: 2026-08-31 | **Spec**: [spec.md](./spec.md)

**Input**: Feature specification from `/specs/001-cfd-workflow-archive/spec.md`

## Summary

构建一个 Windows 单机桌面工具，帮助 CFD 应用工程师管理调试全流程的产物与归档：支持多工程；在每个工程内自由创建调试节点并以"来源于"关系构成可追溯的调试链；通过拖拽将文件/文件夹零拷贝登记到节点（多文件可对应同一步骤）；一键归档时先汇总待归档文件（数量、总大小）并支持按节点勾选排除，确认后按"目标目录/工程名/节点名/文件"两层结构传输（带进度、可取消、同名冲突询问），完成后询问是否保留源文件（删除需二次确认）。

技术路线：Tauri 2（Rust 后端 + WebView2 外壳）打包为独立可执行 exe；前端 React + TypeScript + 自建设计令牌（不引重型组件库）；数据存储为单文件 SQLite（WAL 模式）；文件复制引擎在 Rust 侧实现，通过事件向前端推送进度，支持取消与 `.part` 临时文件原子落盘。

## Technical Context

**Language/Version**: Rust 1.8x（stable，后端/打包）；TypeScript 5.x + React 18（前端）

**Primary Dependencies**: Tauri 2.x（应用框架与打包）、rusqlite（SQLite，bundled）、fs4（磁盘可用空间检测）、zustand（前端状态）、Vite（构建）、Vitest + cargo test（测试）

**Storage**: 单文件 SQLite 数据库 `%APPDATA%\CFDFlow\cfdflow.db`（WAL 模式、外键开启、事务化写入；数据目录可在设置中更改）

**Testing**: cargo test（核心逻辑：状态机、路径校验、复制引擎、冲突消歧，使用临时目录做真实文件 IO 测试）；Vitest + React Testing Library（前端组件与状态）；quickstart.md 手动端到端验收

**Target Platform**: Windows 10 1803+ / Windows 11 x64 桌面环境（WebView2 Evergreen 运行时随系统预装，详见 research.md D4）

**Project Type**: desktop-app（Tauri 单项目结构，前后端同仓库）

**Performance Goals**: 界面交互反馈 ≤100ms；200 节点/2000 登记文件下列表操作 ≤1s（SC-007）；点击归档后 ≤3s 完成汇总重校验（SC-003）；拖拽放下后 ≤5s 完成登记（SC-002）；安装包 ≤15MB、常驻内存 ≤300MB

**Constraints**: 离线可用、无需管理员权限；界面中文、使用 CFD 术语；登记阶段零拷贝；删除源文件必须二次显式确认；所有失败必须可见（禁止静默失败）；长路径（>260 字符）与特殊字符文件名必须正确处理

**Scale/Scope**: 单工程 200 节点 / 2000 登记文件；工程数量不限；本特性交付完整核心闭环（工程→节点链→登记→归档），不含产物预览/编辑、云同步、多语言

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

| 原则 | 要求摘要 | 本设计的落实 | 状态 |
|------|---------|-------------|------|
| I. 工程师优先体验 | 界面决策以 CFD 工程师为中心；统一视觉语言；交互即时反馈 | Web 技术栈 + 自建设计令牌（tokens.css）保证全局一致；文案集中管理且全部使用 CFD 术语；进度/确认/空状态均为一等公民（FR-017） | ✅ 通过 |
| II. 全流程产物管理 | 任务有阶段归属，产物关联任务 | 节点即阶段/尝试载体，文件登记强制挂接节点，归档批次留痕可回溯 | ✅ 通过 |
| III. 进度透明可规划 | 进度可视、可重排、状态一致 | 归档进度由 Rust 事件推送实时更新；汇总页按节点勾选；取消语义明确 | ✅ 通过 |
| IV. 数据可追溯与可靠 | 可追溯、不丢失、删除显式确认、禁止静默失败 | SQLite WAL + 事务 + 外键；归档批次完整记录结果明细；源文件删除走二次确认命令；复制用 `.part` 原子落盘，取消即清理 | ✅ 通过 |
| V. 简洁克制 | YAGNI，最简方案起步 | 纯本地单文件存储；无账号/云/插件体系；复制引擎仅用标准库 + fs4；UI 不引重型组件库 | ✅ 通过 |

**Phase 1 设计后复查**：设计产物（research/data-model/contracts/quickstart）未引入超出上述范围的复杂度，门禁维持通过。

## Project Structure

### Documentation (this feature)

```text
specs/001-cfd-workflow-archive/
├── plan.md              # This file ($speckit-plan command output)
├── research.md          # Phase 0 output ($speckit-plan command)
├── data-model.md        # Phase 1 output ($speckit-plan command)
├── quickstart.md        # Phase 1 output ($speckit-plan command)
├── contracts/           # Phase 1 output ($speckit-plan command)
│   └── tauri-commands.md
└── tasks.md             # Phase 2 output ($speckit-tasks command - NOT created by $speckit-plan)
```

### Source Code (repository root)

```text
src/                      # 前端（React + TypeScript）
├── app/                  # 应用外壳：工程列表/切换、导航、全局设置
├── components/           # 通用组件：按钮、列表、对话框、进度条、空状态
├── features/
│   ├── nodes/            # 节点列表、调试链展示、节点编辑
│   ├── entries/          # 文件登记列表、拖拽接收、失效标记
│   └── archive/          # 归档汇总页、进度视图、结果报告、源文件处置
├── stores/               # zustand：工程/节点/登记/归档状态
├── styles/               # tokens.css 设计令牌、全局主题
└── lib/                  # Tauri 命令封装、事件订阅、格式化工具

src-tauri/                # 后端（Rust）
├── src/
│   ├── lib.rs            # 命令注册、事件通道
│   ├── db.rs             # SQLite 连接池、迁移、事务辅助
│   ├── models/           # Project / Node / FileEntry / ArchiveBatch
│   ├── commands/         # project.rs / node.rs / entry.rs / archive.rs
│   └── archive/          # 复制引擎：进度、取消、冲突策略、.part 清理
└── tests/                # cargo test：核心逻辑 + 真实 IO 集成测试

```

**Structure Decision**: 采用 Tauri 单项目结构（桌面应用，无独立后端服务）。`src-tauri` 承载全部业务逻辑与数据访问并保持可独立测试（cargo test 不依赖 UI）；`src` 为纯展示层，通过 contracts/tauri-commands.md 定义的命令契约与后端通信。测试目录按仓库约定合并为 `src-tauri/tests`（Rust 集成测试）与前端 `src/**/*.test.tsx` 同置。

## Complexity Tracking

> 无章程违规项，本表留空。

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|-------------------------------------|
| （无） | — | — |
