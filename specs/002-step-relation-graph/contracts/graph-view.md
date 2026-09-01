# Interface Contract: 流程框图视图（graph-view）

**Feature**: `002-step-relation-graph` | **Date**: 2026-08-31

本特性为 frontend-only：**无新增 Tauri 命令、无新增事件**。本契约约定 (a) 复用的既有命令及调用语义、(b) 派生图数据的模块接口、(c) 组件与 store 的交互契约。

## 复用的既有命令（语义不变）

| 命令 | 画布触发方式 | 契约要点（见 001 contracts/tauri-commands.md） |
|------|-------------|----------------------------------------------|
| `create_node` | 框上"新建下游"按钮 → 既有新建对话框（来源预填） | 校验/错误码不变 |
| `set_node_parent` | 画布从 source handle 拖线落到目标框（source=上游、target=下游） | 成环返回 `CYCLE_DETECTED`；客户端先用 `descendantsOf` 预检仅为快速反馈 |
| `update_node` | 双击框 → 既有编辑对话框 | — |
| `delete_node` | 框上删除入口 → 既有删除处置对话框 | 处置/下游置空规则不变 |
| `get_project_detail` | 任意画布编辑成功后由既有 store `refreshCurrent` 调用 | 图数据随之派生重算 |

**约束**：画布编辑不得绕过上述命令直接变更图数据；后端错误（含 `CYCLE_DETECTED`）经既有 toast 呈现，图自动回弹（以 store 为单一事实源）。

## 前端模块契约

### `src/lib/graph.ts`（纯函数，无 React 依赖）

```ts
interface GraphNodeSummary {
  id: string
  name: string
  note: string | null
  createdAt: string
  total: number
  pending: number
  archived: number
  missing: number
  sizeBytes: number
}

interface GraphEdgeRef {
  source: string   // 上游节点 id（derives=parent；shared=配对之一）
  target: string   // 下游节点 id
  kind: 'derives' | 'shared'
  count?: number   // shared：该节点对共享的不同源路径数
}

// 聚合：口径唯一来源（FR-013）
function buildGraphData(detail: ProjectDetail): {
  nodes: GraphNodeSummary[]
  derivesEdges: GraphEdgeRef[]   // parent→child
  sharedEdges: GraphEdgeRef[]    // 节点对去重，count≥1
}

// 布局：dagre TB；输入节点尺寸固定（NODE_W×NODE_H），输出坐标
function computeLayout(
  nodes: GraphNodeSummary[],
  derivesEdges: GraphEdgeRef[],
): { positions: Map<string, { x: number; y: number }>; width: number; height: number }
```

**不变量**：`buildGraphData` 对同一 ProjectDetail 输出确定；derives 边方向恒为 parent→child；shared 边按节点对去重（同一对仅一条，count 聚合）。

### `src/features/graph/FlowGraph.tsx`（组件契约）

- Props：无（数据自 useProjects/useNodes store 读取），挂在工作台三栏左侧。
- 行为：
  - 无节点 → 渲染 EmptyState + "新建节点"引导（不挂载 ReactFlow）。
  - `onNodeClick` → `useNodes.select(id)`；store `selectedNodeId` 变化 → 对应框高亮（双向联动）。
  - `onConnect({source, target})` → 防环预检（target 的后代含 source 则拒绝）→ `api.setNodeParent(target, source)` → 错误 toast、成功经 refreshCurrent 重算。
  - 提供适应视图（fitView）与缩放控件（令牌化样式）。
- NodeBox：固定 240×96；名称单行截断（title 全名）；徽章待归档/已归档/源失效三色；悬停显示操作按钮（新建下游 / 删除）；双击打开编辑。

### `src/stores/nodes.ts` 增量

```ts
startCreate(parentId?: string): void   // 既有 startCreate 扩展：预填来源（画布"新建下游"用）
```

### WorkspaceView 布局契约

三栏同屏：`[FlowGraph 弹性] [NodeList 280px] [登记面板 弹性]`；既有浮层（编辑/删除/链/归档）全部保留；DropZone 拖拽命中逻辑不变（仍落在节点列表行）。

## 依赖新增

- `@xyflow/react`（React Flow 12）
- `@dagrejs/dagre`

均为前端 devDependencies/dependencies；Rust `Cargo.toml` 零改动。
