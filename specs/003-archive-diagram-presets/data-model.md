# Data Model: 归档流程图图片与节点预设

**Feature**: `003-archive-diagram-presets` | **Date**: 2026-09-01

**零新增数据库实体**。两类产物/数据契约如下。

## 归档流程图图片（文件系统派生产物）

| 属性 | 契约 |
|------|------|
| 路径 | `目标目录/工程名/流程图.png`（工程层，与节点子目录并列） |
| 命名 | 固定 `流程图.png`；同工程重复归档覆盖更新（无批次留档） |
| 触发 | `archive://finished` 且 `copied > 0`；无成功复制不生成/不更新（FR-001） |
| 内容口径 | 与特性 002 派生图数据完全同源：每个节点框（名称、`n 项 · 大小`、待归档/已归档/源失效徽章）、derives 连线（上游→下游箭头）、shared 标记（`共享 n`）；同名节点以创建时间辅助区分 |
| 视觉 | 与界面同令牌（运行时读取 tokens.css 变量）；标题含工程名与生成时间；2× 分辨率绘制 |
| 失败语义 | 生成/写盘失败 → 归档结果页可见警告（含原因）；不影响已复制文件状态与批次结果（FR-005） |

**绘制指令（DiagramPlan，内存中间结构，可单测）**：

```text
DiagramPlan {
  title: string                      // "工程名 · 流程图"
  generatedAt: string                // ISO 时间注记
  boxes: [{ id, x, y, w, h, name, badges: {pending, archived, missing}, sizeText }]
  arrows: [{ fromId, toId, points: [{x,y}...] }]      // derives，带箭头
  sharedLinks: [{ aId, bId, count, points: [{x,y}...] }] // 虚线 + "共享 n"
  canvas: { width, height }          // 随节点数/层级自适应（含边距与标题区）
}
```

**不变量**：
1. 每个 GraphNode 恰好对应一个 box；box 纵向分层与 computeLayout 一致（上游在上）。
2. 徽章数值与 GraphNodeSummary 同源（FR-013 口径延续）。
3. sharedLinks 两两去重、计数 = 共享源路径数（与框图 sharedEdges 一致）。

## 节点预设（内置只读清单）

| 属性 | 契约 |
|------|------|
| 集合 | `["参考文献", "原始几何", "网格划分", "计算求解", "后处理"]`（顺序即展示顺序） |
| 语义 | 仅作为名称快速填入模板；点击只写入名称输入框，不改来源关系（FR-007） |
| 作用范围 | 列表入口与画布"新建下游"入口共用的新建对话框 |
| 边界 | 只读常量，不持久化、不可编辑（v1，已确认）；不参与校验与关系逻辑 |

## 既有数据（只读复用）

- `ProjectDetail`（Project/Node/FileEntry）→ `buildGraphData` → `computeLayout`：与特性 002 完全相同的调用链，本特性零改动复用。
