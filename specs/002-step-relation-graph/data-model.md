# Data Model: 步骤关系框图（实时流程视图）

**Feature**: `002-step-relation-graph` | **Date**: 2026-08-31

本特性**零新增持久化实体**——全部数据为特性 001 数据模型的运行时派生视图。以下为派生契约（前端内存对象，非数据库表）。

## 输入（既有，只读）

- `ProjectDetail.project`：工程（框图作用域）
- `ProjectDetail.nodes: Node[]`：id / project_id / name / note / parent_node_id / created_at
- `ProjectDetail.entries: FileEntry[]`：id / node_id / original_path / file_name / size_bytes / validity / archive_status

## 派生实体

### GraphNode（框）

| 字段 | 来源 | 说明 |
|------|------|------|
| id | Node.id | 与 React Flow 节点 id 一致 |
| name / note / created_at | Node | 名称（超长截断悬停显示）；同名节点以 created_at+note 区分（FR-010） |
| total / pending / archived / missing | FileEntry 聚合 | 该节点登记文件计数：total=全部；pending=archive_status='pending'；archived=total−pending；missing=validity='missing' 的登记项数 |
| sizeBytes | FileEntry 聚合 | 该节点全部登记文件 size_bytes 之和（与列表工具栏同口径，FR-013） |

### GraphEdge（连线），两类，视觉 MUST 可区分

| 类型 | 来源 | 语义 | 视觉 |
|------|------|------|------|
| `derives` | Node.parent_node_id（parent→child） | "来源于"关系，方向上游→下游 | 实线箭头，主色，自上而下 |
| `shared` | 按 original_path 分组，组内节点两两配对去重 | 跨步骤共享同一源文件 | 虚线，warn 色系，无箭头，悬浮显示共享文件名列表 |

**共享边计数规则**：一对节点 (A,B) 的 shared 边计数 = 同时登记在 A 与 B 的不同源路径数；同一路径被 ≥3 个节点共享时，产生该组全部两两组合的边（渲染为同一样式，不因多边而改变语义，见 spec 边界场景）。

### LayoutResult（布局，不落库）

| 字段 | 说明 |
|------|------|
| positions: Map<nodeId, {x,y}> | dagre（rankdir=TB）输出的坐标；层级 = 来源链深度，层内间距 nodesep、层间 ranksep |
| width / height | 全图尺寸，供"适应视图"计算 |

## 不变量（验收即测）

1. **口径一致（FR-013）**：GraphNode 摘要必须与节点列表工具栏、登记列表计数完全同源同值——均由同一 `ProjectDetail.entries` 派生。
2. **方向不变量**：derives 边始终 parent→child（上游→下游），任何布局/重排不改变语义方向。
3. **单一事实源**：图数据仅由 store 中的 ProjectDetail 派生，画布编辑不得直接改图数据，只能经既有命令 → store 刷新 → 派生重算。
4. **防环一致（FR-019）**：画布连线与列表端修改来源走同一 `set_node_parent` 后端校验；客户端 `descendantsOf` 预检仅为快速反馈，最终以后端为准。
5. **零持久化**：本特性不产生任何新的数据库表、字段或 Tauri 命令。

## 术语表增补（沿用 001 术语）

| 术语 | 含义 |
|------|------|
| 流程框图 | 本特性的同屏分栏画布视图（禁止同义词：脑图、流程图编辑器） |
| 框 | 框图中的节点呈现单元 |
| 来源连线 | derives 边的 UI 称谓（"来源于"关系的连线） |
| 共享标记 | shared 边的 UI 称谓（跨步骤共享同一源文件的连线） |
