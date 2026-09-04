# CFD-Flow 流程归档管理

帮助 CFD 应用工程师管理调试全流程任务产物与归档的 Windows 桌面工具。

## 安装说明

### 方式一：直接使用（推荐）

1. 获取 `CFDFlow_0.1.0_x64-setup.exe`（NSIS 安装包，见下方"获取安装包"）或绿色版 `cfdflow.exe`
2. 系统要求：Windows 10 1803+ / Windows 11（x64）
   - 安装包内置 WebView2 引导：缺少 WebView2 运行时会自动联网安装
   - 绿色版 exe 依赖系统预装的 WebView2（正常联网更新的 Win10/11 均已内置）
3. 双击运行即可，无需管理员权限、无需安装 Node/Rust 等任何开发环境
4. 数据存储于 `%APPDATA%\com.cfdflow.app\cfdflow.db`（SQLite 单文件），可直接复制该文件进行备份

### 方式二：从源码构建

```powershell
# 前置：Node.js 20+、Rust stable（windows-msvc 工具链，需要 VS Build Tools）
git clone <本仓库地址>
cd CFD-Flow
npm install
npm run tauri build
# 产物：
#   src-tauri/target/release/cfdflow.exe          绿色独立 exe
#   src-tauri/target/release/bundle/nsis/*.exe    NSIS 安装包
```

### 获取安装包

- GitHub Releases 页面下载（发布后）
- 或按"方式二"自行构建

## 核心功能

- **多工程管理**：不同算例/项目相互独立，各自拥有节点树、文件登记与归档记录
- **调试节点链**：自由创建节点，以"来源于"关系表达每次调试尝试的对应关系，可双向回溯、防循环；内置典型流程节点预设（参考文献/原始几何/网格划分/计算求解/后处理）一键填入
- **流程框图**：同屏分栏实时呈现调试链——节点框显示文件摘要徽章，来源连线自上而下，跨步骤共享同一源文件以虚线标记；支持缩放/平移/适应视图、点选双向联动，并可在画布上直接新建下游、拖拽改来源、编辑与删除（复用同一套校验）
- **零拷贝登记**：把文件/文件夹直接拖拽到节点上完成登记（仅记录源位置，不复制文件）；多个文件可对应同一步骤
- **一键归档**：汇总待归档文件（数量/总大小）→ 按节点勾选排除 → 确认后传输到指定目录（`目标目录/工程名/节点名/文件` 两层结构，带进度、可取消、同名冲突三策略）→ 询问是否保留源文件（删除需二次确认）→ 成功/失败明细报告
- **归档自带流程图**：归档完成自动在 `归档目录/工程名/流程图.png` 生成流程图图片，与软件内框图同口径——归档文件夹拷给别人无需安装任何软件即可看懂产物对应关系
- **归档历史**：批次记录与结果明细随时可查

## 技术栈

Tauri 2（Rust 后端 + WebView2）· React 18 + TypeScript + Vite · SQLite（WAL）· zustand · React Flow（流程框图）· dagre（自动布局）

## 开发

```powershell
npm install          # 安装前端依赖（需要 Node 20+ 与 Rust stable-msvc）
npm run tauri dev    # 开发运行
npm test             # 前端测试（Vitest）
cd src-tauri ; cargo test   # 后端测试（核心逻辑 + 真实文件 IO）
```

## 构建交付

```powershell
npm run tauri build
# 产物：
#   src-tauri/target/release/cfdflow.exe          绿色独立 exe（主交付物）
#   src-tauri/target/release/bundle/nsis/*.exe    NSIS 安装包（含 WebView2 引导兜底）
```

目标环境：Windows 10 1803+ / Windows 11 x64（WebView2 Evergreen 随系统预装；缺失时安装包会自动引导安装）。

## 数据位置

应用数据存储于 `%APPDATA%\com.cfdflow.app\cfdflow.db`（SQLite 单文件，WAL 模式，随用随存，可直接复制备份）。

## 文档

- 规格：`specs/001-cfd-workflow-archive/spec.md`
- 实施计划：`specs/001-cfd-workflow-archive/plan.md`
- 验收指南：`specs/001-cfd-workflow-archive/quickstart.md`
- 前后端契约：`specs/001-cfd-workflow-archive/contracts/tauri-commands.md`

## 许可

本项目基于 [MIT License](./LICENSE) 开源。
