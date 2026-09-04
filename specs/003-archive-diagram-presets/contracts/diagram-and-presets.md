# Interface Contract: 归档流程图与节点预设

**Feature**: `003-archive-diagram-presets` | **Date**: 2026-09-01

## 新增 Tauri 命令

### `save_archive_diagram`

| 项 | 契约 |
|----|------|
| 参数 | `target_root: String`（批次目标根目录）、`project_name: String`、`png: Vec<u8>`（PNG 二进制） |
| 返回 | `String`（落盘绝对路径） |
| 行为 | 拼装 `target_root/<safe_name(工程名)>/流程图.png`；目录不存在则创建；写 `.tmp` 后 rename 覆盖（原子） |
| 错误 | `IO_ERROR`（不可写/磁盘满等，message_zh 中文提示）；`VALIDATION`（target_root/project_name 为空） |
| 调用方 | 前端 `exportArchiveDiagram`，仅在 `archive://finished` 且 `copied > 0` 时调用 |

**错误呈现义务**：失败时前端 MUST 在归档结果区域可见提示（warn 级），MUST NOT 影响归档批次结果与已复制文件状态（FR-005）。

## 既有命令（本特性不改动）

`execute_archive` / `archive://finished`（仅前端回调扩展）、`create_node`、`set_node_parent`、`update_node`、`delete_node`——语义与 001 契约完全一致。

## 前端模块契约

### `src/lib/presets.ts`

```ts
export const NODE_PRESETS: readonly string[] = ['参考文献', '原始几何', '网格划分', '计算求解', '后处理']
```

### `src/lib/graph-diagram.ts`

```ts
// 纯函数：图数据 + 布局 → 绘制指令（jsdom 可单测）
function buildDiagramPlan(
  graph: GraphData,
  layout: { positions: Map<string, {x:number;y:number}>; width: number; height: number },
  opts: { projectName: string; generatedAt: string },
): DiagramPlan

// Canvas 执行：指令 → PNG Blob（真机路径，jsdom 不测）
function renderToBlob(plan: DiagramPlan, scale?: number): Promise<Blob>

// 编排：refresh → build → render → save；失败警告不抛出（FR-005）
async function exportArchiveDiagram(final: BatchFinal): Promise<void>
```

### `src/features/nodes/NodeEditDialog.tsx`（增量）

- 名称 Field 上方渲染 `NODE_PRESETS` chips（既有 Btn small 样式）；
- 点击 chip：仅 `setName(预设名)`，不修改 `parent` 状态（FR-007）；
- 保存逻辑不变（以输入框当前值为准，FR-009）。

### `src/stores/archive.ts` / `App.tsx`（增量）

- `onArchiveFinished` 链路追加：`copied > 0` 时调用 `exportArchiveDiagram(final)`（内部先 refreshCurrent）；失败经 `useArchive.setNotice` 呈现 warn。
