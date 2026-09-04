# Phase 0 Research: 归档流程图图片与节点预设

**Feature**: `003-archive-diagram-presets` | **Date**: 2026-09-01 | **Input**: plan.md Technical Context

## D1 流程图 PNG 的生成位置：前端 Canvas 自绘 vs Rust 自绘

**Decision**: 前端 Canvas 2D 自绘，生成 PNG Blob 后经新增命令 `save_archive_diagram` 交由 Rust 写盘。

**Rationale**: 硬约束是"图片与软件内框图同口径同源"（FR-003）。图数据聚合（buildGraphData）、分层布局（computeLayout/dagre）均在前端且已被框图使用——前端自绘天然同源，零双重实现。且中文文本由浏览器系统字体渲染（质量与软件内一致），Canvas 原生 API 零新依赖（原则 V）。归档全程在应用内发起，`archive://finished` 到达时应用必然存活，触发时机可靠。

**Alternatives considered**:
- Rust 侧自绘（tiny-skia + cosmic-text 等）：需在 Rust 重写图数据聚合、共享边逻辑与分层布局（Rust 无 dagre），还要解决系统中文字体加载与文本排版——双重实现的一致性风险高、工作量大，排除。
- html-to-image 截 ReactFlow 容器：依赖画布当前视口状态（缩放/平移/选中），截图前需强制 fitView 并等待渲染，脆弱且分辨率受视口限制，排除。
- Headless 浏览器渲染：为一张图引入浏览器运行时，荒谬，排除。

## D2 图片渲染方案

**Decision**: 绘制指令与执行器分离。`buildDiagramPlan(graphData, layout)` 产出纯数据指令列表（矩形/折线/文字/徽章，含坐标与令牌色值），`renderToBlob(plan)` 用 Canvas 2D 执行并导出 PNG（2× 缩放抗锯齿）。

**Rationale**: 指令列表是纯数据——jsdom（无 Canvas 实现）下可完整单测（框数量、文字内容、层间纵坐标关系），渲染正确性交给真机 quickstart 验证。色值通过 `getComputedStyle(document.documentElement)` 读取 tokens.css 变量，保证图片与界面视觉同源（FR-008 令牌约束）。

**Alternatives considered**:
- 直接在组件里边算边画：不可单测，排除。
- SVG 序列化转 PNG：需 SVG→Image→Canvas 转换链且字体嵌入复杂，收益不如直接 Canvas，排除。

## D3 保存链路与触发时机

**Decision**: `App.tsx` 的 `onArchiveFinished` 回调扩展：`final.copied > 0` 时执行 `exportArchiveDiagram(f)`——先 `refreshCurrent()` 取归档后最新数据（徽章反映已归档状态）→ `buildGraphData` → `computeLayout` → `buildDiagramPlan` → `renderToBlob` → `invoke('save_archive_diagram', { targetRoot, projectName, png })`。任一步失败 → `useArchive.setNotice` 警告（不影响归档结果判定，FR-005）。批次无成功复制（copied=0）时不触发（FR-001）。

**Rationale**: 复用既有事件链，无轮询无新事件；写盘命令只做"确保目录 + 写文件 + 覆盖"，目标目录/工程子目录在批次复制阶段已存在（极端情况命令内 create_dir_all 兜底）。

**Alternatives considered**:
- Rust 引擎在收尾时回调前端生成：跨进程往返复杂且时序耦合，排除。
- 前端在 execute_archive 发起时预生成（归档前状态）：徽章口径是归档前的，与"归档后目录内容"不符，排除。

## D4 预设实现

**Decision**: `src/lib/presets.ts` 导出只读常量数组（`参考文献 / 原始几何 / 网格划分 / 计算求解 / 后处理`）；NodeEditDialog 在名称输入框上方渲染预设 chips（既有 Btn small 样式），点击仅写入 `name` 状态，不触碰 `parent`（保留画布"新建下游"预填的来源，FR-007）。

**Rationale**: 最小改动面——不新增界面、不改校验、不加存储；预设是常量（v1 只读，已确认）。

**Alternatives considered**:
- 下拉选择框：多一次点击，chips 一目了然更符合"快速填入"诉求，排除。
- 可编辑自定义预设（localStorage/DB）：已确认范围外（YAGNI），排除。

## D5 Rust 命令与测试

**Decision**: `save_archive_diagram(target_root: String, project_name: String, png: Vec<u8>) -> Result<String, AppError>`：拼装 `target_root/<safe_name(工程名)>/流程图.png`，create_dir_all 兜底后原子写入（写 `.tmp` 后 rename，与归档引擎同风格），返回落盘路径。cargo test 覆盖：路径组织正确、覆盖更新、目录不存在时自动创建、失败路径（目标根为文件等）。

**Rationale**: 复用 `safe_name`（同名工程消歧不在此层——目录由批次已建，命令直接写入既定位置）；PNG 二进制经 Tauri IPC 传输（典型几百 KB~数 MB，可承受）。

## 待决事项

无。
